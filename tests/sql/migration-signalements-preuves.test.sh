#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# BANC — migrations/migration_signalements_preuves_2026-11-03.sql (E-08)
#
# PostgreSQL JETABLE portant `reports`, `conv_messages`, `conv_members`,
# `blocks`, les fonctions `is_conv_member` / `is_blocked_with` et les policies
# de `conv_messages` telles qu'elles sont EN PRODUCTION le 2026-11-03 (lues au
# canal ①, pg_policy / pg_get_functiondef), et les privilèges par défaut du
# projet (tout nouvel objet de public accordé à anon, authenticated et
# service_role). Ce qu'il prouve :
#   ⓪ LE DÉFAUT D'ABORD : un message signalé, effacé par son auteur, ne laisse
#      RIEN — le signalement ne porte que la cible ;
#   ① la migration s'applique, 8 OK / 0 ECHEC, et se REJOUE ;
#   ② un MEMBRE signale → la preuve est copiée, à l'identique (contenu, auteur,
#      conversation, date d'envoi) ;
#   ③ un NON-MEMBRE signale → le signalement passe, rien n'est copié ;
#   ④ l'auteur RÉÉCRIT puis EFFACE son message → la preuve reste intacte ;
#   ⑤ un membre qui a BLOQUÉ l'auteur signale → la preuve est copiée (la clause
#      de blocage de la SELECT n'est pas reprise, délibérément) ;
#   ⑥ authenticated et anon : ni SELECT, ni INSERT, ni UPDATE, ni DELETE sur
#      les preuves (42501) ; service_role lit et efface, n'écrit ni ne réécrit ;
#   ⑦ supprimer le signalement supprime la preuve (cascade) ;
#   ⑧ un signalement qui n'est pas de type `message` ne crée rien, même s'il
#      vise l'identifiant d'un message ; un message introuvable non plus ;
#   ⑨ une copie qui ÉCHOUE ne bloque pas le signalement, et elle se DIT
#      (WARNING) ;
#   ⑩ MUTATIONS (base neuve chacune) : sans la clause d'appartenance, le
#      non-membre fait copier ; sans le rattrapage, une copie en échec fait
#      tomber le signalement ; sans le REVOKE, le verdict rougit et un compte
#      lit les preuves ;
#   ⑪ LE LECTEUR : `scripts/moderation.js voir` contre un PostgREST simulé —
#      la preuve d'abord, l'enveloppe média décodée (jamais recopiée), l'auteur
#      abrégé, le repli sur le message actuel (et sur une table absente), et
#      chaque type admis par `reports_target_type_chk` a son libellé ;
#   ⑫ LE TERMINAL DU MODÉRATEUR : un texte d'autrui portant des séquences ANSI
#      (`\x1b[2J`), OSC (`\x1b]8;;…`), un retour chariot, un DEL ou un CSI C1
#      est imprimé SANS ses caractères de contrôle — dans CHAQUE branche de
#      `voir` (preuve, message actuel, enveloppe texte et fichier, compte,
#      publication, commentaires, rencontre, identifiant de cible) et dans
#      `lister` — et son texte reste lisible.
# ⚠️ `set local role` et sa requête partent dans le MÊME appel psql (ADR-012).
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RACINE="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION="$RACINE/migrations/migration_signalements_preuves_2026-11-03.sql"
OUTIL="$RACINE/scripts/moderation.js"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] && PATH="$PGBIN:$PATH"
command -v initdb >/dev/null || { echo "❌ binaires serveur PostgreSQL introuvables"; exit 1; }
command -v node >/dev/null || { echo "❌ node introuvable (le lecteur scripts/moderation.js est éprouvé ici)"; exit 1; }
[ -f "$MIGRATION" ] || { echo "❌ migration introuvable : $MIGRATION"; exit 1; }

PORT=$(( 6200 + RANDOM % 120 ))
if [ "$(id -u)" -eq 0 ]; then
  id pgbanc >/dev/null 2>&1 || useradd -m pgbanc >/dev/null 2>&1
  BASE="$(su pgbanc -c 'mktemp -d -p ~')"; SU="su pgbanc -c"
else
  BASE="$(mktemp -d)"; SU="bash -c"
fi
TRAVAIL="$(mktemp -d)"
lancer() { $SU "PATH='$PATH' $*"; }
nettoyer() { lancer "pg_ctl -D '$BASE/data' stop -m immediate" >/dev/null 2>&1; rm -rf "$BASE" "$TRAVAIL"; }
trap nettoyer EXIT
lancer "initdb -D '$BASE/data' -A trust -U postgres" >/dev/null 2>&1
lancer "pg_ctl -D '$BASE/data' -o \"-k $BASE -p $PORT -c listen_addresses=\" -l '$BASE/pg.log' start" >/dev/null 2>&1
demarre=0
for _ in $(seq 1 30); do psql -h "$BASE" -p "$PORT" -U postgres -c "select 1" >/dev/null 2>&1 && { demarre=1; break; }; sleep 0.5; done
if [ "$demarre" -ne 1 ]; then
  echo "❌ le serveur PostgreSQL de test n'a pas démarré — aucun résultat n'est exploitable"
  [ -f "$BASE/pg.log" ] && tail -5 "$BASE/pg.log"
  exit 1
fi

DB=preuves
Q()    { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
# VERBOSITY=verbose : l'erreur porte son SQLSTATE (« ERROR:  42501: … »).
EN()   { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v VERBOSITY=verbose -c "set local role authenticated; set local request.jwt.claim.sub='$1'; $2" 2>&1; }
ANON() { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v VERBOSITY=verbose -c "set local role anon; $1" 2>&1; }
SR()   { psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -tA -q -v VERBOSITY=verbose -c "set local role service_role; $1" 2>&1; }
# « OK » si l'ordre passe sans erreur (psql -q avale « INSERT 0 1 »), sinon le message.
_ok() { if printf '%s' "$1" | grep -q "ERROR"; then printf '%s' "$1" | tr '\n' ' '; else echo OK; fi; }

A=11111111-1111-1111-1111-111111111111   # AUTEUR des messages signalés
B=22222222-2222-2222-2222-222222222222   # membre du 1:1 c_ab (signale)
C=33333333-3333-3333-3333-333333333333   # NON membre de c_ab
D=44444444-4444-4444-4444-444444444444   # membre du groupe c_grp, a BLOQUÉ A

ok=0; ko=0
# Ce qu'un contrôle ROUGE affiche passe sans ses caractères de contrôle C0 (§⑫) :
# le banc ne doit pas, lui, rejouer sur le terminal les séquences qu'il éprouve.
_vu() { printf '%s' "$1" | tr -d '\000-\010\013-\037\177'; }
verifier() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     attendu : %s\n     obtenu  : %s\n' "$1" "$2" "$(_vu "$3")"; fi; }
contient() { if printf '%s' "$3" | grep -qF -- "$2"; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"; else ko=$((ko+1)); printf '  ❌ %s\n     motif attendu : %s\n     obtenu : %s\n' "$1" "$2" "$(_vu "$3")"; fi; }
absent()   { if printf '%s' "$3" | grep -qF -- "$2"; then ko=$((ko+1)); printf '  ❌ %s\n     motif INTERDIT trouvé : %s\n' "$1" "$2"; else ok=$((ok+1)); printf '  ✅ %s\n' "$1"; fi; }

# ── SOCLE : tables, fonctions, policies et privilèges DE PRODUCTION (2026-11-03) ──
socle() {
psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
grant usage on schema public to anon, authenticated, service_role; grant usage on schema auth to anon, authenticated, service_role;
-- pg_default_acl de production : arwdDxtm sur les tables, X sur les fonctions, aux trois rôles.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;

create table public.conversations (id text primary key, is_group boolean default false, created_by text);
create table public.conv_members (conv_id text not null references public.conversations(id), user_id text not null, primary key (conv_id, user_id));
create table public.conv_messages (id text primary key, conv_id text references public.conversations(id), from_id text, content text,
  created_at timestamp without time zone default now());
create table public.blocks (blocker_id text, blocked_id text);
create table public.reports (id text primary key, reporter_id text, target_type text, target_id text, reason text,
  created_at timestamptz default now(), status text not null default 'open', handled_at timestamptz, handled_note text,
  constraint reports_status_chk check (status = any (array['open', 'handled', 'dismissed'])),
  constraint reports_target_type_chk check (target_type is null or target_type = any (array['user', 'post', 'comment', 'event', 'passion', 'message', 'story'])));

create function public.is_conv_member(_conv_id text, _uid text) returns boolean language sql stable security definer set search_path to ''
as $fn$ select exists (select 1 from public.conv_members m where m.conv_id = _conv_id and m.user_id = _uid) $fn$;
create function public.is_blocked_with(_other text) returns boolean language sql stable security definer set search_path to ''
as $fn$
  select case when auth.uid() is null or _other is null or _other = (auth.uid())::text then false
    else exists (select 1 from public.blocks b
                  where (b.blocker_id = (auth.uid())::text and b.blocked_id = _other)
                     or (b.blocker_id = _other and b.blocked_id = (auth.uid())::text)) end
$fn$;

alter table public.conv_messages enable row level security;
alter table public.conv_members enable row level security;
alter table public.reports enable row level security;
create policy conv_messages_select_member on public.conv_messages for select to authenticated
  using (public.is_conv_member(conv_id, (select auth.uid())::text) and not public.is_blocked_with(from_id));
create policy "Suppression propre" on public.conv_messages for delete using (from_id = (select auth.uid())::text);
create policy "Update propre" on public.conv_messages for update to authenticated
  using (from_id = (select auth.uid())::text)
  with check (from_id = (select auth.uid())::text and public.is_conv_member(conv_id, (select auth.uid())::text));
create policy conv_members_select_member on public.conv_members for select to authenticated
  using (public.is_conv_member(conv_id, (select auth.uid())::text));
create policy reports_insert on public.reports for insert with check (reporter_id = (select auth.uid())::text);

insert into public.conversations values ('c_ab', false, '11111111-1111-1111-1111-111111111111'),
                                        ('c_grp', true, '44444444-4444-4444-4444-444444444444');
insert into public.conv_members values ('c_ab', '11111111-1111-1111-1111-111111111111'), ('c_ab', '22222222-2222-2222-2222-222222222222'),
                                       ('c_grp', '11111111-1111-1111-1111-111111111111'), ('c_grp', '44444444-4444-4444-4444-444444444444');
insert into public.blocks values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111');
insert into public.conv_messages (id, conv_id, from_id, content, created_at) values
  ('m_avant', 'c_ab', '11111111-1111-1111-1111-111111111111', 'avant la migration', '2026-11-01 09:00:00'),
  ('m_ab1', 'c_ab', '11111111-1111-1111-1111-111111111111', 'message harcelant', '2026-11-02 10:00:00'),
  ('m_ab2', 'c_ab', '11111111-1111-1111-1111-111111111111', '{"type":"image","filename":"x.jpg","url":"https://exemple.invalid/x.jpg"}', '2026-11-02 10:01:00'),
  ('m_grp1', 'c_grp', '11111111-1111-1111-1111-111111111111', 'message de groupe', '2026-11-02 11:00:00');
SQL
}

psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $DB" >/dev/null
socle "$DB"

echo "── ⓪ LE DÉFAUT, MESURÉ AVANT ─────────────────────────────────────────"
verifier "avant : B signale le message de A" "OK" "$(_ok "$(EN "$B" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_avant', '$B', 'message', 'm_avant', 'harcèlement');")")"
verifier "avant : A efface son message signalé (« Suppression propre »)" "OK" "$(_ok "$(EN "$A" "delete from public.conv_messages where id = 'm_avant';")")"
verifier "avant : il ne reste RIEN du contenu signalé (le signalement ne porte que la cible)" "0|0" \
  "$(Q "select (select count(*) from public.conv_messages where id = 'm_avant') || '|' || (select count(*) from public.reports where reason like '%avant la migration%' or target_id like '%avant la migration%');")"
verifier "avant : aucune table de preuves" "" "$(Q "select to_regclass('public.signalements_preuves');")"

echo "── ① APPLICATION, VERDICT, REJEU ─────────────────────────────────────"
sortie="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration a échoué :"; echo "$sortie" | tail -5; exit 1; }
verifier "verdict 8 OK / 0 ECHEC" "8/0" "$(printf '%s\n' "$sortie" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie" | grep -cE '\|\s*ECHEC\s*$' || true)"
sortie2="$(psql -h "$BASE" -p "$PORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" 2>&1)" || { echo "  ❌ la migration REJOUÉE a échoué"; echo "$sortie2" | tail -5; exit 1; }
verifier "rejeu : toujours 8 OK / 0 ECHEC" "8/0" "$(printf '%s\n' "$sortie2" | grep -cE '\|\s*OK\s*$' || true)/$(printf '%s\n' "$sortie2" | grep -cE '\|\s*ECHEC\s*$' || true)"
verifier "aucune preuve rétroactive (le signalement d'avant reste sans copie)" "0" "$(Q "select count(*) from public.signalements_preuves;")"

echo "── ② UN MEMBRE SIGNALE : LA PREUVE EST COPIÉE, À L'IDENTIQUE ────────"
verifier "B (membre de c_ab) signale m_ab1" "OK" "$(_ok "$(EN "$B" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_b', '$B', 'message', 'm_ab1', 'harcèlement');")")"
verifier "la preuve porte message, conversation, auteur, contenu et date d'envoi" "m_ab1|c_ab|$A|message harcelant|2026-11-02 10:00:00" \
  "$(Q "select message_id || '|' || conv_id || '|' || auteur_id || '|' || contenu || '|' || envoye_le from public.signalements_preuves where report_id = 'r_b';")"
verifier "copie_le est posé par le serveur" "1" "$(Q "select count(*) from public.signalements_preuves where report_id = 'r_b' and copie_le > now() - interval '1 minute';")"

echo "── ③ UN NON-MEMBRE SIGNALE : LE SIGNALEMENT PASSE, RIEN N'EST COPIÉ ─"
verifier "C (non membre) signale m_ab1 : accepté" "OK" "$(_ok "$(EN "$C" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_c', '$C', 'message', 'm_ab1', 'x');")")"
verifier "le signalement de C existe, sa preuve non" "1|0" "$(Q "select (select count(*) from public.reports where id = 'r_c') || '|' || (select count(*) from public.signalements_preuves where report_id = 'r_c');")"

echo "── ④ L'AUTEUR RÉÉCRIT PUIS EFFACE : LA PREUVE RESTE ──────────────────"
verifier "A réécrit m_ab1 (« Update propre »)" "1" "$(EN "$A" "with u as (update public.conv_messages set content = 'tout va bien' where id = 'm_ab1' returning 1) select count(*) from u;")"
verifier "la preuve garde le texte signalé" "message harcelant" "$(Q "select contenu from public.signalements_preuves where report_id = 'r_b';")"
verifier "A efface m_ab1 (« Suppression propre »)" "1" "$(EN "$A" "with d as (delete from public.conv_messages where id = 'm_ab1' returning 1) select count(*) from d;")"
verifier "message effacé, preuve intacte" "0|message harcelant" "$(Q "select (select count(*) from public.conv_messages where id = 'm_ab1') || '|' || (select contenu from public.signalements_preuves where report_id = 'r_b');")"

echo "── ⑤ BLOQUER PUIS SIGNALER : LA PREUVE EST COPIÉE ────────────────────"
verifier "D (a bloqué A) ne LIT plus le message de A (policy SELECT)" "0" "$(EN "$D" "select count(*) from public.conv_messages where id = 'm_grp1';")"
verifier "D signale m_grp1" "OK" "$(_ok "$(EN "$D" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_d', '$D', 'message', 'm_grp1', 'menaces');")")"
verifier "la preuve est copiée quand même (membre = autorité, le blocage n'efface pas la preuve)" "message de groupe" "$(Q "select contenu from public.signalements_preuves where report_id = 'r_d';")"

echo "── ⑥ PERSONNE CÔTÉ CLIENT NE TOUCHE AUX PREUVES ──────────────────────"
contient "B (le signalant) ne LIT pas les preuves (42501)" "42501" "$(EN "$B" "select count(*) from public.signalements_preuves;")"
contient "A (l'auteur) ne LIT pas les preuves (42501)" "42501" "$(EN "$A" "select count(*) from public.signalements_preuves;")"
contient "A n'INSÈRE pas de preuve (42501)" "42501" "$(EN "$A" "insert into public.signalements_preuves (report_id, message_id, contenu) values ('r_c', 'm_ab1', 'faux');")"
contient "A ne RÉÉCRIT pas une preuve (42501)" "42501" "$(EN "$A" "update public.signalements_preuves set contenu = 'tout va bien' where report_id = 'r_b';")"
contient "A n'EFFACE pas une preuve (42501)" "42501" "$(EN "$A" "delete from public.signalements_preuves where report_id = 'r_b';")"
contient "anon ne LIT pas (42501)" "42501" "$(ANON "select count(*) from public.signalements_preuves;")"
contient "anon n'INSÈRE pas (42501)" "42501" "$(ANON "insert into public.signalements_preuves (report_id, message_id) values ('r_c', 'x');")"
contient "anon ne RÉÉCRIT pas (42501)" "42501" "$(ANON "update public.signalements_preuves set contenu = 'x';")"
contient "anon n'EFFACE pas (42501)" "42501" "$(ANON "delete from public.signalements_preuves;")"
verifier "les preuves sont toujours là" "2" "$(Q "select count(*) from public.signalements_preuves;")"
verifier "service_role LIT les preuves" "2" "$(SR "select count(*) from public.signalements_preuves;")"
contient "service_role n'INSÈRE pas de preuve (42501)" "42501" "$(SR "insert into public.signalements_preuves (report_id, message_id) values ('r_c', 'x');")"
contient "service_role ne RÉÉCRIT pas une preuve (42501)" "42501" "$(SR "update public.signalements_preuves set contenu = 'x' where report_id = 'r_b';")"
contient "authenticated n'appelle pas la fonction de déclencheur" "permission denied" "$(EN "$A" "select public.trg_reports_preuve_message();")"

echo "── ⑦ LA PREUVE VIT AUTANT QUE LE SIGNALEMENT (CASCADE) ───────────────"
Q "delete from public.reports where id = 'r_d';" >/dev/null
verifier "signalement supprimé → preuve supprimée" "0" "$(Q "select count(*) from public.signalements_preuves where report_id = 'r_d';")"
verifier "service_role EFFACE une preuve" "1" "$(SR "with d as (delete from public.signalements_preuves where report_id = 'r_b' returning 1) select count(*) from d;")"

echo "── ⑧ CE QUI N'EST PAS UN SIGNALEMENT DE MESSAGE NE CRÉE RIEN ─────────"
verifier "B signale une « publication » dont l'identifiant est celui d'un message" "OK" "$(_ok "$(EN "$B" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_post', '$B', 'post', 'm_ab2', 'x');")")"
verifier "B signale un compte" "OK" "$(_ok "$(EN "$B" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_user', '$B', 'user', '$A', 'x');")")"
verifier "B signale un message introuvable" "OK" "$(_ok "$(EN "$B" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_fantome', '$B', 'message', 'm_inexistant', 'x');")")"
verifier "aucune preuve pour ces trois signalements" "0" "$(Q "select count(*) from public.signalements_preuves where report_id in ('r_post', 'r_user', 'r_fantome');")"

echo "── ⑨ UNE COPIE EN ÉCHEC NE BLOQUE PAS LE SIGNALEMENT, ET SE DIT ──────"
Q "alter table public.signalements_preuves add constraint banc_casse check (false) not valid;" >/dev/null
sortie_echec="$(EN "$B" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_echec', '$B', 'message', 'm_ab2', 'x');")"
contient "la copie en échec est LEVÉE en avertissement" "preuve non copiée pour le signalement r_echec" "$sortie_echec"
absent "… et n'est pas une erreur" "ERROR" "$sortie_echec"
verifier "le signalement est enregistré, sans preuve" "1|0" "$(Q "select (select count(*) from public.reports where id = 'r_echec') || '|' || (select count(*) from public.signalements_preuves where report_id = 'r_echec');")"
Q "alter table public.signalements_preuves drop constraint banc_casse;" >/dev/null
verifier "sans la panne, la copie d'une enveloppe média est fidèle" "OK" "$(_ok "$(EN "$B" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_media', '$B', 'message', 'm_ab2', 'x');")")"
verifier "… octet pour octet" "1" "$(Q "select count(*) from public.signalements_preuves p join public.conv_messages m on m.id = p.message_id where p.report_id = 'r_media' and p.contenu = m.content;")"

echo "── ⑩ MUTATIONS : LE BANC VOIT CE QU'ON RETIRE ────────────────────────"
muter() { # $1 = base, $2 = expression sed, $3 = fichier muté
  psql -h "$BASE" -p "$PORT" -U postgres -q -c "create database $1" >/dev/null
  socle "$1"
  sed "$2" "$MIGRATION" > "$3"
}
EN_SUR() { psql -h "$BASE" -p "$PORT" -U postgres -d "$1" -tA -q -v VERBOSITY=verbose -c "set local role authenticated; set local request.jwt.claim.sub='$2'; $3" 2>&1; }
# (a) sans la clause d'appartenance
muter mut_a '/and public.is_conv_member(m.conv_id, new.reporter_id)/d' "$TRAVAIL/mut_a.sql"
cmp -s "$MIGRATION" "$TRAVAIL/mut_a.sql" && { echo "  ❌ mutation (a) sans effet : la ligne visée a changé"; ko=$((ko+1)); }
sa="$(psql -h "$BASE" -p "$PORT" -U postgres -d mut_a -q -f "$TRAVAIL/mut_a.sql" 2>&1)"
EN_SUR mut_a "$C" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_c', '$C', 'message', 'm_ab1', 'x');" >/dev/null
verifier "(a) sans appartenance : le NON-membre fait copier un message d'autrui" "1" "$(psql -h "$BASE" -p "$PORT" -U postgres -d mut_a -tA -c "select count(*) from public.signalements_preuves where report_id = 'r_c';")"
verifier "(a) … et le verdict rougit" "1" "$(printf '%s\n' "$sa" | grep -cE '\|\s*ECHEC\s*$' || true)"
# (b) sans le rattrapage d'erreur
muter mut_b '/exception when others then/,/raise warning/d' "$TRAVAIL/mut_b.sql"
cmp -s "$MIGRATION" "$TRAVAIL/mut_b.sql" && { echo "  ❌ mutation (b) sans effet : les lignes visées ont changé"; ko=$((ko+1)); }
psql -h "$BASE" -p "$PORT" -U postgres -d mut_b -q -f "$TRAVAIL/mut_b.sql" >/dev/null 2>&1 || true
psql -h "$BASE" -p "$PORT" -U postgres -d mut_b -q -c "alter table public.signalements_preuves add constraint banc_casse check (false) not valid;" >/dev/null
contient "(b) sans rattrapage : la copie en échec fait TOMBER le signalement" "ERROR" \
  "$(EN_SUR mut_b "$B" "insert into public.reports (id, reporter_id, target_type, target_id, reason) values ('r_echec', '$B', 'message', 'm_ab2', 'x');")"
verifier "(b) … aucun signalement enregistré" "0" "$(psql -h "$BASE" -p "$PORT" -U postgres -d mut_b -tA -c "select count(*) from public.reports where id = 'r_echec';")"
# (c) sans le REVOKE
muter mut_c '/^revoke all on public.signalements_preuves/d' "$TRAVAIL/mut_c.sql"
cmp -s "$MIGRATION" "$TRAVAIL/mut_c.sql" && { echo "  ❌ mutation (c) sans effet : la ligne visée a changé"; ko=$((ko+1)); }
sc="$(psql -h "$BASE" -p "$PORT" -U postgres -d mut_c -q -f "$TRAVAIL/mut_c.sql" 2>&1)"
verifier "(c) sans REVOKE : le verdict rougit (droits clients, service_role qui écrit)" "2" "$(printf '%s\n' "$sc" | grep -cE '\|\s*ECHEC\s*$' || true)"
verifier "(c) … et un compte connecté LIT les preuves (RLS sans policy : 0 ligne, mais plus de refus)" "0" "$(EN_SUR mut_c "$B" "select count(*) from public.signalements_preuves;")"

echo "── ⑪ LE LECTEUR : scripts/moderation.js voir (PostgREST simulé) ──────"
TYPES_ADMIS="$(Q "select pg_get_constraintdef(oid) from pg_constraint where conname = 'reports_target_type_chk';")"
sortie_lecteur="$(node - "$OUTIL" "$TYPES_ADMIS" <<'JS' 2>&1 || true
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const [outil, typesAdmis] = process.argv.slice(2);
const AUTEUR = "aaaaaaaa-1111-4111-8111-111111111111";
const VIVANT = "bbbbbbbb-2222-4222-8222-222222222222";
const ENVELOPPE = JSON.stringify({ type: "image", filename: "capture.jpg", fileType: "image/jpeg", url: "https://exemple.invalid/media/capture.jpg", text: "[IMAGE] capture.jpg", sp: { n: "Persona" } });
const rep = (id, type, cible) => ({ id, reporter_id: "cccccccc-3333-4333-8333-333333333333", target_type: type, target_id: cible, reason: "motif du banc", created_at: "2026-11-03T08:00:00+00:00", status: "open", handled_at: null, handled_note: null });
const REPORTS = { r_preuve: rep("r_preuve", "message", "m_1"), r_modifie: rep("r_modifie", "message", "m_4"), r_vivant: rep("r_vivant", "message", "m_2"), r_sans_table: rep("r_sans_table", "message", "m_3"), r_story: rep("r_story", "story", "st_1") };
const PREUVES = {
  r_preuve: [{ message_id: "m_1", conv_id: "conv_preuve_banc", auteur_id: AUTEUR, contenu: ENVELOPPE, envoye_le: "2026-11-01T10:00:00", copie_le: "2026-11-01T10:05:00+00:00" }],
  r_modifie: [{ message_id: "m_4", conv_id: "conv_preuve_banc", auteur_id: AUTEUR, contenu: "insulte d'origine", envoye_le: "2026-11-01T10:00:00", copie_le: "2026-11-01T10:05:00+00:00" }],
};
const MESSAGES = {
  m_2: [{ id: "m_2", conv_id: "conv_vivant_banc", from_id: VIVANT, content: JSON.stringify({ type: "text", text: "bonjour vivant", sp: { n: "Persona" } }), created_at: "2026-11-02T09:00:00" }],
  m_3: [{ id: "m_3", conv_id: "conv_vivant_banc", from_id: VIVANT, content: "texte brut m3", created_at: "2026-11-02T09:00:00" }],
  m_4: [{ id: "m_4", conv_id: "conv_preuve_banc", from_id: AUTEUR, content: "tout va bien", created_at: "2026-11-01T10:00:00" }],
};
// ── ⑫ Texte HOSTILE : effacement d'écran, lien OSC 8 (terminé par BEL), retour
// chariot, CSI C1 (U+009B) et DEL. Une fois filtré, il en reste « H_NET ».
const H = "début\x1b[2J\x1b]8;;https://piege.invalid\x07lien\x1b]8;;\x07\rFIN\u009b31m\x7f";
const H_NET = "début[2J]8;;https://piege.invalidlien]8;;FIN31m";
const hostile = (id, type, cible) => Object.assign(rep(id, type, cible), { reason: "motif " + H, status: "handled", handled_at: "2026-11-03T09:00:00+00:00", handled_note: "note " + H });
const CIBLE_HOSTILE = "ev_" + H;
Object.assign(REPORTS, {
  r_h_preuve: hostile("r_h_preuve", "message", "m_5"), r_h_fichier: hostile("r_h_fichier", "message", "m_6"),
  r_h_user: hostile("r_h_user", "user", "u_1"), r_h_post: hostile("r_h_post", "post", "p_1"),
  r_h_comment: hostile("r_h_comment", "comment", "pc_1"), r_h_ec: hostile("r_h_ec", "comment", "ec_1"),
  r_h_event: hostile("r_h_event", "event", CIBLE_HOSTILE),
});
PREUVES.r_h_preuve = [{ message_id: "m_5", conv_id: H, auteur_id: "\x1b[2Jaaaa-1111", contenu: H, envoye_le: "2026-11-01T10:00:00", copie_le: "2026-11-01T10:05:00+00:00" }];
MESSAGES.m_5 = [{ id: "m_5", conv_id: "conv_preuve_banc", from_id: AUTEUR, content: JSON.stringify({ type: "text", text: H }), created_at: "2026-11-01T10:00:00" }];
MESSAGES.m_6 = [{ id: "m_6", conv_id: H, from_id: "\x1b]0;titre\x07bbbb", content: JSON.stringify({ type: "file", filename: H, fileType: H, url: "https://exemple.invalid/" + H }), created_at: "2026-11-02T09:00:00" }];
const LIGNES = {
  profiles: { u_1: { id: "u_1", username: H, bio: H, passions: [], created_at: "2026-10-01T00:00:00" } },
  posts: { p_1: { id: "p_1", author_id: "\x1b[2Jcccc-3333", content: H, passion_id: H, created_at: "2026-11-01T00:00:00" } },
  post_comments: { pc_1: { id: "pc_1", author_id: "\rdddd-4444", content: H, post_id: "p_1", created_at: "2026-11-01T00:00:00" } },
  event_comments: { ec_1: { id: "ec_1", author_id: "\u009beeee-5555", author_name: H, text: H, event_id: "e_1", created_at: "2026-11-01T00:00:00" } },
  events: { [CIBLE_HOSTILE]: { id: CIBLE_HOSTILE, title: H, description: H, author_id: AUTEUR, city: H, date_at: "2026-11-10T18:00:00" } },
};
// Ce que chaque branche imprime quand elle a VRAIMENT rendu sa cible.
const ENTETE = {
  r_h_preuve: "PREUVE copiée par le serveur", r_h_fichier: "version ACTUELLE", r_h_user: "── Le compte visé ──",
  r_h_post: "── La publication visée ──", r_h_comment: "(sous une publication)", r_h_ec: "(sur une rencontre)", r_h_event: "── La rencontre visée ──",
};
const demandes = [];
const serveur = http.createServer((req, res) => {
  const u = new URL(req.url, "http://banc");
  demandes.push(decodeURIComponent(u.pathname + u.search));
  const table = u.pathname.replace(/^\/rest\/v1\//, "");
  const eq = (k) => { const v = u.searchParams.get(k); return v && v.startsWith("eq.") ? v.slice(3) : null; };
  const json = (code, corps) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(corps)); };
  if (req.headers.apikey !== "cle-du-banc") return json(401, { message: "clé absente" });
  // Sans `id` : la file entière (`lister`), en une page.
  if (table === "reports") return json(200, !u.searchParams.get("id") ? Object.values(REPORTS) : REPORTS[eq("id")] ? [REPORTS[eq("id")]] : []);
  if (table === "signalements_preuves") {
    if (eq("report_id") === "r_sans_table") return json(404, { code: "PGRST205", message: "Could not find the table 'public.signalements_preuves' in the schema cache" });
    return json(200, PREUVES[eq("report_id")] || []);
  }
  if (table === "conv_messages") return json(200, MESSAGES[eq("id")] || []);
  if (table === "posts" && eq("author_id")) return json(200, Object.values(LIGNES.posts).filter((p) => p.author_id === eq("author_id")));
  if (LIGNES[table]) return json(200, LIGNES[table][eq("id")] ? [LIGNES[table][eq("id")]] : []);
  return json(404, { message: "table inconnue du banc : " + table });
});
serveur.listen(0, "127.0.0.1", async () => {
  const url = "http://127.0.0.1:" + serveur.address().port;
  // ⚠️ Toutes les variables d'URL pointent sur le simulateur : l'env explicite prime
  // sur dashboard/.env (compte-e2e.js) — aucune requête ne peut partir ailleurs.
  const env = { ...process.env, SUPABASE_URL: url, PASSIO_SUPABASE_URL: url, PASSIO_SUPABASE_ANON: "anon-du-banc", SUPABASE_SERVICE_ROLE_KEY: "cle-du-banc" };
  const voir = (id) => new Promise((ok) => execFile(process.execPath, [outil, "voir", "--id", id], { env, timeout: 20000 }, (e, so, se) => ok({ code: e ? (e.code || 1) : 0, sortie: so + se })));
  const lister = () => new Promise((ok) => execFile(process.execPath, [outil, "lister", "--tous"], { env, timeout: 20000 }, (e, so, se) => ok({ code: e ? (e.code || 1) : 0, sortie: so + se })));
  const res = {};
  for (const id of Object.keys(REPORTS)) res[id] = await voir(id);
  const file = await lister();
  serveur.close();
  // ⑫ Caractères de contrôle restés dans la sortie (tabulation et saut de ligne admis).
  const controles = (s) => (s.match(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g) || []).length;
  const hostiles = Object.keys(ENTETE).map((id) => `${id}:${res[id].code}:${controles(res[id].sortie)}:${res[id].sortie.includes(H_NET) ? "texte" : "SANS-TEXTE"}:${res[id].sortie.includes(ENTETE[id]) ? "branche" : "SANS-BRANCHE"}`).join(",");
  // Les libellés : chaque type admis par la contrainte de production en a un.
  const src = fs.readFileSync(outil, "utf8");
  const bloc = (/const LIBELLE = \{([\s\S]*?)\};/.exec(src) || [])[1] || "";
  const cles = new Set([...bloc.matchAll(/([a-z_]+)\s*:/g)].map((m) => m[1]));
  const admis = [...typesAdmis.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
  const sansLibelle = admis.filter((t) => !cles.has(t));
  const R = {
    codes: ["r_preuve", "r_modifie", "r_vivant", "r_sans_table", "r_story"].map((id) => res[id].code).join(","),
    hostiles,
    messageEchappe: [/\x1b/.test(res.r_h_preuve.sortie), /\r/.test(res.r_h_preuve.sortie), /\x07/.test(res.r_h_preuve.sortie)].join(","),
    messageTexte: res.r_h_preuve.sortie,
    lister: `${file.code}:${controles(file.sortie)}:${file.sortie.includes("motif " + H_NET) ? "motif" : "SANS-MOTIF"}:${file.sortie.includes(CIBLE_HOSTILE.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")) ? "cible" : "SANS-CIBLE"}`,
    preuve: res.r_preuve.sortie, modifie: res.r_modifie.sortie, vivant: res.r_vivant.sortie, sansTable: res.r_sans_table.sortie, story: res.r_story.sortie,
    lectureMessage: demandes.some((d) => d.startsWith("/rest/v1/conv_messages?id=eq.m_2&select=id,conv_id,from_id,content,created_at")),
    lecturePreuve: demandes.some((d) => d.startsWith("/rest/v1/signalements_preuves?report_id=eq.r_preuve&select=")),
    admis: admis.length, sansLibelle: sansLibelle.join(",") || "aucun",
  };
  process.stdout.write(JSON.stringify(R));
});
JS
)"
champ() { printf '%s' "$sortie_lecteur" | node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const v=o[process.argv[1]];process.stdout.write(typeof v==="string"?v:JSON.stringify(v));}catch(e){process.stdout.write("ILLISIBLE: "+s.slice(0,300));}})' "$1"; }
verifier "les cinq lectures se terminent sans erreur (code 0)" "0,0,0,0,0" "$(champ codes)"
verifier "la preuve est demandée par l'identifiant du signalement" "true" "$(champ lecturePreuve)"
verifier "le message actuel est demandé avec les colonnes prévues" "true" "$(champ lectureMessage)"
P="$(champ preuve)"
contient "preuve : annoncée comme PREUVE copiée par le serveur" "PREUVE copiée par le serveur" "$P"
contient "preuve : l'enveloppe est décodée en son type" "[photo]" "$P"
contient "preuve : … avec son fichier" "fichier « capture.jpg »" "$P"
absent "preuve : l'enveloppe JSON n'est jamais recopiée" '{"type"' "$P"
absent "preuve : le profil d'envoi (sp) n'est pas affiché" "Persona" "$P"
contient "preuve : l'auteur est ABRÉGÉ" "aaaaaaaa…" "$P"
absent "preuve : l'identifiant complet de l'auteur n'apparaît pas" "aaaaaaaa-1111-4111-8111-111111111111" "$P"
contient "preuve : le message effacé depuis est signalé comme tel" "Message SUPPRIMÉ depuis le signalement" "$P"
M="$(champ modifie)"
contient "réécrit : la preuve montre le texte signalé" "insulte d'origine" "$M"
contient "réécrit : la modification est DITE, avec la version actuelle" "Message MODIFIÉ depuis le signalement. Version actuelle : tout va bien" "$M"
V="$(champ vivant)"
contient "sans preuve : on le dit" "Aucune preuve copiée pour ce signalement" "$V"
contient "sans preuve : repli sur le message ACTUEL, annoncé comme tel" "version ACTUELLE" "$V"
contient "sans preuve : l'enveloppe texte est décodée" "bonjour vivant" "$V"
absent "sans preuve : l'enveloppe JSON n'est jamais recopiée" '{"type"' "$V"
contient "sans preuve : l'auteur est ABRÉGÉ" "bbbbbbbb…" "$V"
S="$(champ sansTable)"
contient "table absente : l'outil ne s'arrête pas, il le dit" "Preuves illisibles (404)" "$S"
contient "table absente : repli sur le message actuel" "texte brut m3" "$S"
contient "story : libellé du type" "Type    : story" "$(champ story)"
verifier "chaque type admis par reports_target_type_chk a un libellé dans LIBELLE" "aucun" "$(champ sansLibelle)"
verifier "… sur les 7 types admis" "7" "$(champ admis)"

echo "── ⑫ LE TERMINAL DU MODÉRATEUR NE SE LAISSE PAS RÉÉCRIRE ─────────────"
verifier "chaque branche de voir rend sa cible, SANS caractère de contrôle, texte lisible (id:code:contrôles:texte:branche)" \
  "r_h_preuve:0:0:texte:branche,r_h_fichier:0:0:texte:branche,r_h_user:0:0:texte:branche,r_h_post:0:0:texte:branche,r_h_comment:0:0:texte:branche,r_h_ec:0:0:texte:branche,r_h_event:0:0:texte:branche" \
  "$(champ hostiles)"
verifier "le message signalé portant \\x1b[2J, \\x1b]8;; et \\r : ni ESC, ni CR, ni BEL à l'écran" "false,false,false" "$(champ messageEchappe)"
H_MSG="$(champ messageTexte)"
contient "…son texte reste lisible, séquences désarmées (« [2J » s'affiche, n'efface plus)" "Contenu      : début[2J]8;;https://piege.invalidlien]8;;FIN31m" "$H_MSG"
contient "…le motif aussi" "Motif   : motif début[2J]8;;" "$H_MSG"
contient "…l'auteur abrégé aussi (8 caractères, puis filtré)" "Auteur       : [2Jaaaa…" "$H_MSG"
verifier "lister --tous : sortie 0, aucun caractère de contrôle, motif et identifiant de cible lisibles" "0:0:motif:cible" "$(champ lister)"

echo; echo "RÉSULTAT : $ok contrôle(s) vert(s), $ko rouge(s)"
[ "$ko" -eq 0 ]
