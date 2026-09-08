#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# APPLIQUER LES TROIS LOTS DE SÉCURITÉ DU 2026-09-08 — EN UNE COMMANDE
#
#   export DATABASE_URL='postgresql://…'      # jamais committé, jamais collé ailleurs
#   bash scripts/appliquer-securite-2026-09.sh
#
# Ou, pour ne RIEN changer et seulement regarder l'état :
#   bash scripts/appliquer-securite-2026-09.sh --verifier
#
# CE QU'IL FAIT, dans cet ordre, du moins risqué au plus engageant :
#   ① Pièces jointes : la lecture du seau `attachments` suit enfin la règle
#      d'appartenance à la conversation (elle était ouverte à tous, sans compte).
#   ② Rencontres : l'adresse exacte, le téléphone de l'organisateur et la liste
#      nominative des participants sortent de la lecture publique.
#   ③ Admission 18+ : la fondation serveur, INTERRUPTEUR ÉTEINT — rien ne change
#      pour personne tant qu'on ne l'allume pas (étape séparée, après le
#      déploiement du client).
#
# POURQUOI CE SCRIPT EXISTE. Chaque lot demande un préflight, une application et
# un contrôle, soit neuf gestes manuels dans le bon ordre, dont trois qu'on peut
# oublier sans que rien ne le signale. Ici, un BLOQUANT au préflight ou un ÉCHEC
# au contrôle **arrête tout** : on ne passe jamais au lot suivant sur une base
# dont on n'a pas la preuve qu'elle est saine.
#
# ⚠️ IL N'ALLUME RIEN. L'admission 18+ reste éteinte. L'allumage est un geste
# séparé, volontairement, et il vient APRÈS le déploiement du client — sans quoi
# il couperait les rencontres à tout le monde (voir docs/ADMISSION_18_PLUS.md).
#
# ⚠️ IL NE TOUCHE PAS AUX DONNÉES. Les trois migrations ne créent ni ne
# suppriment aucune ligne : ce sont des policies, des droits, des fonctions et
# un interrupteur. Chacune est atomique — une erreur annule le lot entier.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
VERIFIER_SEULEMENT=0
[ "${1:-}" = "--verifier" ] && VERIFIER_SEULEMENT=1

if [ -z "${DATABASE_URL:-}" ]; then
  cat <<'AIDE'
❌ DATABASE_URL n'est pas définie.

   Supabase → Project Settings → Database → Connection string → URI
   ⚠️ Elle contient le mot de passe de la base : ne la colle NI dans une
      conversation, NI dans un commit, NI dans un ticket.

   export DATABASE_URL='postgresql://…'
   bash scripts/appliquer-securite-2026-09.sh
AIDE
  exit 2
fi

command -v psql >/dev/null || { echo "❌ psql introuvable (paquet postgresql-client)"; exit 2; }

titre() { printf '\n\033[1m━━ %s\033[0m\n' "$1"; }
ok()    { printf '   ✅ %s\n' "$1"; }
ko()    { printf '   ❌ %s\n' "$1"; }
info()  { printf '   · %s\n' "$1"; }

# Toute sortie de psql est rendue telle quelle ; le code de retour décide.
SQL() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tA -q "$@" 2>&1; }

arret() {
  printf '\n\033[1m✋ ARRÊT — rien de plus n'\''a été appliqué.\033[0m\n'
  printf '   %s\n' "$1"
  printf '   La base est dans un état cohérent : chaque migration est atomique.\n'
  exit 1
}

# Joue un fichier de diagnostic et compte les lignes portant un verdict donné.
# ⚠️ Compter le verdict ne suffit pas : une requête partie en ERROR n'en contient
# AUCUN, et un comptage nu rendrait « 0 problème » sur un fichier inexploitable.
# On exige donc aussi une sortie plausible.
diagnostic() { # $1=fichier  $2=verdict cherché (BLOQUANT|ECHEC)
  local sortie n
  sortie="$(SQL -f "$1")"
  case "$sortie" in *ERROR*|*"error:"*)
    printf 'DIAGNOSTIC-ILLISIBLE\n'; printf '%s\n' "$sortie" | grep -i error | head -3 >&2; return;;
  esac
  n="$(printf '%s\n' "$sortie" | grep -c "|$2|")"
  printf '%s\n' "$n"
  printf '%s\n' "$sortie" | grep "|$2|" | sed 's/^/      /' >&2
}

# ─────────────────────────────────────────────────────────────────────────────
titre "Connexion"
if ! SQL -c "select 1" >/dev/null; then
  arret "Connexion refusée. Vérifie DATABASE_URL."
fi
ok "base joignable : $(SQL -c "select current_database() || ' — ' || substring(version() from 'PostgreSQL [0-9.]+')")"
[ "$VERIFIER_SEULEMENT" = "1" ] && info "MODE VÉRIFICATION : aucune écriture ne sera faite."

# ═════════════════════════════════════════════════════════════════════════════
# ① PIÈCES JOINTES
# ═════════════════════════════════════════════════════════════════════════════
titre "① Pièces jointes de messagerie — cloisonner la lecture"

etat_storage() {
  SQL -c "select count(*) from pg_policies
           where schemaname='storage' and tablename='objects'
             and policyname='passio_attachments_read_membre';"
}
if [ "$(etat_storage)" = "1" ]; then
  ok "déjà appliqué (policy d'appartenance en place)"
else
  info "état actuel : la lecture du seau « attachments » est ouverte à tous"
  if [ "$VERIFIER_SEULEMENT" = "1" ]; then
    ko "NON APPLIQUÉ — relance sans --verifier pour le corriger"
  else
    if SQL -f "$RACINE/migrations/migration_storage_lecture_cloisonnee.sql" >/dev/null; then
      ok "migration appliquée"
    else
      SQL -f "$RACINE/migrations/migration_storage_lecture_cloisonnee.sql" | grep -i error | head -3
      arret "La migration des pièces jointes a échoué."
    fi
  fi
fi

if [ "$(etat_storage)" = "1" ]; then
  reste="$(SQL -c "select count(*) from pg_policies
                    where schemaname='storage' and tablename='objects'
                      and policyname='passio_media_read';")"
  [ "$reste" = "0" ] && ok "l'ancienne règle permissive a disparu" \
                     || ko "⚠️ l'ancienne règle « passio_media_read » subsiste — les deux se combinent en OU"
  roles="$(SQL -c "select roles::text from pg_policies
                    where schemaname='storage' and tablename='objects'
                      and policyname='passio_attachments_read_membre';")"
  [ "$roles" = "{authenticated}" ] && ok "réservée aux comptes connectés" \
                                   || ko "⚠️ rôles inattendus : $roles"
fi

# ═════════════════════════════════════════════════════════════════════════════
# ② RENCONTRES
# ═════════════════════════════════════════════════════════════════════════════
titre "② Rencontres — adresse, téléphone et participants"

etat_irl() { SQL -c "select not has_column_privilege('anon','public.events','address','SELECT');"; }
if [ "$(etat_irl)" = "t" ]; then
  ok "déjà appliqué (l'adresse n'est plus lisible sans compte)"
else
  info "état actuel : adresse, téléphone et participants lisibles SANS COMPTE"
  if [ "$VERIFIER_SEULEMENT" = "1" ]; then
    ko "NON APPLIQUÉ — relance sans --verifier pour le corriger"
  else
    if SQL -f "$RACINE/migrations/migration_irl_donnees_privees.sql" >/dev/null; then
      ok "migration appliquée"
    else
      SQL -f "$RACINE/migrations/migration_irl_donnees_privees.sql" | grep -i error | head -3
      arret "La migration des rencontres a échoué."
    fi
  fi
fi

if [ "$(etat_irl)" = "t" ]; then
  # Les quatre propriétés d'un coup : ce qui doit être fermé l'est, ce qui doit
  # rester ouvert l'est aussi. La dernière est une PRÉMISSE — sans elle, tout
  # serait « fermé » simplement parce que le visiteur ne lit plus rien du tout.
  verdict="$(SQL -c "select
      (not has_column_privilege('anon','public.events','address','SELECT'))::int
    + (not has_column_privilege('anon','public.events','contact','SELECT'))::int
    + (not has_table_privilege('anon','public.event_attendees','SELECT'))::int
    + (has_column_privilege('anon','public.events','title','SELECT'))::int
    + (has_column_privilege('anon','public.events','lat','SELECT'))::int
    + (has_table_privilege('authenticated','public.events','SELECT'))::int;")"
  [ "$verdict" = "6" ] && ok "adresse, téléphone et participants fermés ; titre, ville et carte toujours visibles" \
                       || ko "⚠️ contrôle incomplet ($verdict/6) — voir la section « VÉRIFIER APRÈS » du fichier de migration"
fi

# ═════════════════════════════════════════════════════════════════════════════
# ③ ADMISSION 18+
# ═════════════════════════════════════════════════════════════════════════════
titre "③ Admission 18+ — la fondation serveur (interrupteur ÉTEINT)"

etat_admission() { SQL -c "select (to_regclass('public.access_policies') is not null)::text;"; }
if [ "$(etat_admission)" = "true" ]; then
  ok "déjà appliqué"
else
  info "préflight (lecture seule)…"
  n="$(diagnostic "$RACINE/migrations/preflight_admission_18_plus.sql" "BLOQUANT")"
  case "$n" in
    DIAGNOSTIC-ILLISIBLE) arret "Le préflight n'a pas pu s'exécuter (voir l'erreur ci-dessus)." ;;
    0) ok "aucun point bloquant" ;;
    *) arret "$n point(s) BLOQUANT(s) au préflight — corriger avant d'appliquer." ;;
  esac

  if [ "$VERIFIER_SEULEMENT" = "1" ]; then
    ko "NON APPLIQUÉ — relance sans --verifier pour l'appliquer"
  else
    if SQL -f "$RACINE/migrations/migration_admission_18_plus.sql" >/dev/null; then
      ok "migration appliquée"
    else
      SQL -f "$RACINE/migrations/migration_admission_18_plus.sql" | grep -i error | head -3
      arret "La migration d'admission a échoué."
    fi
  fi
fi

if [ "$(etat_admission)" = "true" ]; then
  info "contrôles post-migration…"
  n="$(diagnostic "$RACINE/migrations/controles_post_admission_18_plus.sql" "ECHEC")"
  case "$n" in
    DIAGNOSTIC-ILLISIBLE) arret "Les contrôles n'ont pas pu s'exécuter (voir l'erreur ci-dessus)." ;;
    0) ok "toutes les frontières sont en place" ;;
    *) arret "$n contrôle(s) en ÉCHEC — NE PAS allumer la règle 18+." ;;
  esac
  etat="$(SQL -c "select case when enabled then 'ALLUMÉ' else 'éteint' end
                    from public.access_policies where key='irl_adult_only';")"
  ok "interrupteur : $etat"
fi

# ═════════════════════════════════════════════════════════════════════════════
titre "Où en est-on"
SQL -c "select
  'comptes' as quoi, count(*)::text as combien from auth.users
 union all select 'dont majorité déclarée', count(*)::text from public.user_safety where majority_at is not null
 union all select 'dont majeurs', count(*)::text from public.user_safety where majority_at <= current_date;" \
 | sed 's/|/ : /' | sed 's/^/   · /'

cat <<'SUITE'

━━ La suite, dans cet ordre
   1. Fusionner la pull request, et attendre que « Déploiement production » soit VERT.
   2. Ouvrir l'application avec chaque compte de la bêta, une fois : leur année
      de naissance part au serveur toute seule (« dont majorité déclarée » doit monter).
   3. ALORS SEULEMENT, allumer l'admission 18+ :
        UPDATE public.access_policies SET enabled = TRUE, updated_at = NOW()
         WHERE key = 'irl_adult_only';
      Éteindre à tout moment : la même requête avec FALSE.
      ⚠️ Ne JAMAIS supprimer la ligne pour éteindre : ligne absente = règle EXIGÉE.

   Allumer avant l'étape 2 couperait les rencontres à TOUT LE MONDE, comptes
   majeurs compris — ils ont leur année en local et rien côté serveur.
SUITE
printf '\n\033[1m✅ Terminé.\033[0m\n'
