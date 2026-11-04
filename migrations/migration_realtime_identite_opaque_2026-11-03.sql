-- ═══════════════════════════════════════════════════════════════════════════
-- TEMPS RÉEL — UN EFFACEMENT NE DIT PLUS NI QUI, NI QUOI (résidu R25 de
-- l'audit du 2026-11-02, décision du 2026-11-03 : serveur seul, AUCUN
-- changement client ; reprise du 2026-11-04 sur deux revues indépendantes :
-- `rid` ALÉATOIRE, verdict durci, verrous sans attente, gate des index)
--
-- Une transaction, REJOUABLE, tableau de verdict en fin (10 lignes OK/ECHEC).
-- Banc : tests/sql/migration-realtime-identite-opaque.test.sh — décodage
-- logique RÉEL (`test_decoding`), et `realtime.apply_rls` de production
-- recopiée à l'octet (md5 de chaque fonction comparé au canal ①) qu'on nourrit
-- du WAL du banc, mis en forme comme wal2json (format 2) le met.
-- Gate : scripts/audit-identite-replication.js (`npm run verif`), voir ④.
--
-- LA MENACE — source de production lue au canal ① le 2026-11-03
-- (pg_get_functiondef de `realtime.apply_rls`). Realtime ne sait pas appliquer
-- la RLS à un DELETE : « if not is_rls_enabled or action = 'DELETE' then
-- visible_role_sub_ids = visible_role_sub_ids || subscription_id » — TOUT
-- abonné `postgres_changes` de la table reçoit l'événement, sans policy. Il y
-- lit l'ancienne ligne réduite aux colonnes de l'IDENTITÉ DE RÉPLICATION
-- (`wal->'identity'`) qu'il peut lire ET qui sont de clé primaire (« if RLS
-- enabled, we can't secure deletes so filter to pkey ») ; et son FILTRE est
-- essayé sur ces mêmes colonnes (`is_visible_through_filters(old_columns, …)`).
-- L'identité par défaut, c'est la clé primaire — et nos clés primaires parlent :
--   · conv_members (conv_id, user_id) : qui quitte quelle discussion
--     d'activité `evgrp_<activité>` ;
--   · notifications (id) : `n_pa_<activité12>_<compte8>` (qui a été promu),
--     `n_fr_<A8>_<V8>` (qui a demandé à suivre un compte privé),
--     `n_<message>_<8>` ;
--   · conv_reads (conv_id, user_id) : qui appartient à quelle conversation ;
--   · post_likes (post_id, user_id) : qui retire son « j'aime » d'une
--     publication d'un compte privé.
-- Un compte connecté — ou un VISITEUR : `passio_rt_recevoir_visiteur` lui
-- ouvre le topic `realtime:db`, et `anon` tient SELECT sur les quatre tables —
-- s'abonne sans filtre, ou filtré sur une colonne de la clé
-- (`conv_id=eq.evgrp_…`, `user_id=eq.<victime>`, `id=like.n_pa_%`), et reçoit
-- ces clés à chaque effacement. `comment_interactions` est en REPLICA IDENTITY
-- FULL : la charge n'en porte que `id` (filtre « pkey » ci-dessus), mais le
-- filtre s'essaie sur TOUTES les colonnes — `user_id=eq.<victime>` livre
-- exactement les effacements de la victime (un oracle).
--
-- CE QUI CHANGE.
--   ① conv_members, notifications, conv_reads, post_likes reçoivent une
--     colonne OPAQUE et ALÉATOIRE `rid bigint not null`, un index UNIQUE sur
--     (rid) seul, `<table>_rid_key`, et `replica identity using index` sur cet
--     index. Le WAL d'un DELETE ou d'un UPDATE ne porte plus que `rid` ; `rid`
--     n'est pas de clé primaire, donc `apply_rls` envoie `old_record: null`
--     pour un DELETE, et un filtre sur conv_id / user_id / id ne reconnaît plus
--     jamais un DELETE (colonne absente de l'identité → faux). Un INSERT porte
--     un champ `rid` de plus.
--     POURQUOI ALÉATOIRE — constat P2 des deux revues du 2026-11-03 sur la
--     première version, qui tirait `rid` d'une identité SÉQUENTIELLE : un
--     compteur ORDONNE. Un abonné lisait le `rid` de SES lignes écrites juste
--     avant et juste après celle d'une victime (les membres de SA conversation,
--     ses notifications à lui-même), s'abonnait aux DELETE filtrés
--     `rid=in.(…)` — filtre ACCEPTÉ : `rid` lui est lisible, et
--     `subscription_check_filters` n'exige que le droit SELECT de la colonne —
--     et apprenait l'instant exact où partait la ligne de la victime (son
--     départ d'une discussion `evgrp_…`, la notification d'un suivi qu'elle
--     efface) ; `anon` bissectait avec `rid=lt.N` / `rid=gte.N`. Cet en-tête
--     affirmait alors qu'un filtre sur `rid` « ne reconnaît que des lignes que
--     l'abonné pouvait déjà lire » : c'était FAUX, et le banc le rejoue (③c).
--     Aléatoire, `rid` ne dit plus rien de l'ordre d'écriture : les `rid` d'un
--     abonné n'encadrent aucune ligne d'autrui (voir RÉSIDU).
--     LA VALEUR : 53 bits ALÉATOIRES, un entier de 0 à 2⁵³ − 1 — les chiffres
--     hexadécimaux 17 à 32 d'un UUID v4 (`pg_catalog.gen_random_uuid()`, cœur
--     de PostgreSQL depuis la 13 — générateur aléatoire fort ; celui de
--     pgcrypto, installé dans `extensions`, n'est pas appelé), masqués à
--     2⁵³ − 1. Sous ce masque, aucun bit FIXE de l'UUID : le quartet de version
--     (chiffre 13) n'est pas pris, ceux de la variante (haut du chiffre 17)
--     tombent au-dessus du bit 52 — le banc le MESURE (bit_or de milliers de
--     rid = 2⁵³ − 1, bit_and = 0). La revue du 2026-11-04 l'a établi : la forme
--     précédente (chiffres 1 à 16, masque 2⁶³ − 1) n'avait que 59 bits
--     aléatoires, le quartet de version tombant DANS la valeur.
--     POURQUOI 53 : au-delà de 2⁵³, un entier n'est plus exact en JavaScript
--     (IEEE 754). `scripts/sauvegarde-donnees.js` (`r.json()` puis
--     `JSON.stringify`) arrondissait 2906581903110193585 en
--     2906581903110193700 : deux rid distincts pouvaient se confondre dans
--     l'archive, se percuter sur `<table>_rid_key` à la restauration, et
--     `on conflict do nothing` écartait la ligne EN SILENCE ; tout lecteur JS
--     — `select("*")` du client, `record` d'un INSERT / UPDATE du temps réel,
--     le pilotage — l'arrondit aussi. 2⁵³ valeurs restent hors de portée d'un
--     filtre : deviner le rid d'une ligne est sans espoir. Une collision se
--     lirait 23505 sur `<table>_rid_key` — une insertion à rejouer —, avec une
--     probabilité de n / 2⁵³ par insertion dans une table de n lignes
--     (10⁻¹⁰ à un million de lignes). Expression ÉCRITE EN LIGNE, pg_catalog
--     seul, aucune fonction maison : le générateur de schéma des sauvegardes
--     (scripts/schema-executable.js, `default <pg_get_expr>`) la rend telle
--     quelle, sans objet à recréer avant la table. Défaut VOLATIL : `add
--     column` RÉÉCRIT la table et tire une valeur par ligne existante — sans
--     rapport avec l'ordre physique des lignes.
--   ② comment_interactions repasse en REPLICA IDENTITY DEFAULT (clé primaire
--     `id` seule) : l'oracle du filtre se ferme ; la charge d'un DELETE est
--     inchangée (`{id}`).
--   ③ GARDE `trg_rid_opaque` : `rid` n'est écrit QUE par la base. BEFORE
--     INSERT, il reçoit TOUJOURS une valeur aléatoire neuve (une valeur fournie
--     — client, upsert, PostgREST — est ignorée) ; BEFORE UPDATE OF rid, il
--     garde l'ancienne. Avec un `rid` aléatoire, c'est elle qui ferme le
--     dernier chemin vers le `rid` CONNU d'une ligne qu'on ne lit pas :
--     `authenticated` tient l'INSERT de table sur les quatre tables, et
--     `notifications_insert_own_author` laisse X écrire une notification
--     adressée à V ; sans la garde, X y PLANTE un `rid` de son choix, s'abonne
--     à `rid=eq.<planté>` et apprend l'instant où V l'efface — notification
--     qu'il ne peut pourtant pas lire (le banc le mesure, garde coupée puis
--     active : ②ter). Sur la première version, elle fermait aussi un déni de
--     service (poser la PROCHAINE valeur de la séquence faisait percuter
--     l'INSERT suivant de n'importe qui, `follows_notifier` compris) ; aléatoire,
--     il n'y a plus de prochaine valeur à deviner. Fonction SECURITY DEFINER,
--     search_path vide, non exécutable par anon / authenticated (les droits par
--     défaut du schéma la leur donnaient).
--   ④ LES QUATRE INDEX `<table>_rid_key` NE SE SUPPRIMENT PAS. Une identité
--     USING INDEX dont l'index disparaît vaut NOTHING : PostgreSQL REFUSE alors
--     tout UPDATE et tout DELETE d'une table publiée (« does not have a replica
--     identity and publishes deletes » — mesuré au banc). Supprimer la colonne
--     `rid` emporte l'index : même effet. L'avis « unused index » du linter les
--     signalera toujours (0 lecture : c'est voulu) — et ce dépôt a déjà retiré
--     des index sur ce seul critère (F-05). Chaque index porte un commentaire
--     qui le dit, et la gate `scripts/audit-identite-replication.js` (`npm run
--     verif`) REFUSE toute migration qui supprime l'un d'eux, ou la colonne,
--     sans avoir rendu d'abord une identité à la table (`default`, `full`, un
--     autre index) — retour arrière en `--|` compris.
--
-- RESTAURATION. `scripts/restaurer-donnees.js` coupe les déclencheurs
-- utilisateur (`alter table … disable trigger user`) le temps de son INSERT, à
-- liste de colonnes explicite et `overriding system value` (inerte sans
-- identité) : les `rid` de l'archive sont GARDÉS ; une archive d'avant cette
-- migration, sans `rid`, en reçoit un du défaut ; un `rid` d'archive déjà pris
-- est écarté par son `on conflict do nothing` ; son étape « séquences »
-- (`nextval` ou identité) ne trouve rien à recaler pour `rid`. Tout autre
-- écrivain — PostgREST (le repli du script pour une ligne géante, que ces
-- quatre tables n'ont pas), pg_restore sans --disable-triggers, le client —
-- reçoit un `rid` neuf. `rid` ne signifie rien et rien ne s'y réfère.
--
-- CE QUI NE CHANGE PAS. Clés primaires, contraintes d'unicité existantes,
-- RLS, GRANTs des tables, appartenance à la publication (11 tables, insert /
-- update / delete / truncate : `scripts/realtime-publication.json` reste
-- juste), et le CLIENT — aucune ligne de `js/`. Ses écoutes restent servies :
--   · conv_members et notifications : INSERT filtré `user_id=eq.<moi>` — un
--     INSERT porte toutes ses colonnes, le filtre y trouve user_id, et le
--     gestionnaire nomme chaque champ qu'il lit (`rid` est ignoré) ;
--   · conv_reads « * » : il ne lit que `payload.new` (vide sur un DELETE,
--     avant comme après) ;
--   · comment_interactions DELETE : `payload.old` vaut `{id}` avant comme
--     après (RLS active : apply_rls ne gardait déjà que la clé primaire) ;
--   · un UPDATE reste soumis à la RLS (requête préparée sur la clé primaire,
--     la `pk` de wal2json, inchangée) ; son `old_record` porte `{rid}` au lieu
--     de la clé.
-- `old_record: null` est déjà prévu par le SDK servi (supabase-js 2.116.0,
-- `convertChangeData` : `t ? … : {}`) : `payload.old` vaut `{}`.
-- L'export de compte (`export_compte_instantane`, `select *`) porte désormais
-- `rid`, un nombre tiré au hasard.
--
-- RÉSIDU, dit tel quel.
--   · Le MOMENT d'un effacement reste visible : un abonné sans filtre reçoit
--     toujours l'événement DELETE (old_record null) — « quelqu'un a quitté une
--     discussion à 18 h 02 », plus « qui », ni « laquelle ».
--   · Un filtre sur `rid` ne reconnaît que les lignes dont l'abonné CONNAÎT le
--     `rid`, c'est-à-dire qu'il peut lire ou a pu lire : les siennes, celles des
--     membres de ses conversations, un « j'aime » sur une publication publique
--     (devenue privée depuis : il en garde le `rid`) — des lignes qu'il voyait
--     déjà. Ses propres `rid` n'encadrent plus rien, un `rid` planté est
--     remplacé, aucun `rid` qu'il lit n'est celui d'une ligne d'autrui (le banc
--     le mesure, ②ter et ③c). `anon` peut toujours bissecter avec `rid=lt.N` :
--     il situe un nombre tiré au hasard.
--   · posts, post_comments, conv_messages, event_comments, video_lives et
--     profiles gardent leur identité par défaut : leur DELETE envoie toujours
--     leur `id`, un identifiant opaque à une colonne (aléatoire ; pour
--     profiles, l'identifiant du compte, déjà public) — rien qu'un tiers ne
--     relie sans connaître déjà cet id.
--
-- MESURÉ AU CANAL ① (catalogue et agrégats seuls), le 2026-11-03 et de
-- nouveau le 2026-11-04.
--   · PostgreSQL 17.6 ; `realtime.apply_rls` et ses dépendances lues par
--     pg_get_functiondef (md5 du corps d'apply_rls : 5d7c08428b259b87336d4a362800f051,
--     inchangé le 2026-11-04 — le banc en exige la copie à l'octet) ;
--     `realtime.subscription` porte `action_filter` et `selected_columns` ;
--     `passio_rt_recevoir_visiteur` (anon, topic `realtime:db`) est en place ;
--   · publication supabase_realtime : 11 tables, publish insert / update /
--     delete / truncate, aucune liste de colonnes ni filtre de lignes
--     (pg_publication_rel) ; relreplident 'd' partout sauf
--     comment_interactions 'f' ; RLS active sur les 11 ;
--   · aucune colonne `rid`, aucune relation `*rid*`, aucune fonction
--     `rid_opaque_garde` (la première version n'a jamais été appliquée) ;
--   · `gen_random_uuid()` est celle de pg_catalog ; pgcrypto et uuid-ossp
--     vivent dans `extensions` ;
--   · conv_members référence conversations (conv_id) et profiles (user_id) ;
--     ni les quatre tables ni comment_interactions ne sont référencées. La
--     migration ne verrouille QUE ses cinq tables (le banc relève les verrous
--     qu'elle tient, dans sa propre transaction) ;
--   · aucune fonction n'insère POSITIONNELLEMENT dans les cinq tables
--     (`insert into … values` / `select` sans liste de colonnes), aucune ne
--     nomme `rid` ni un `%rowtype` de ces tables ; les trois qui y écrivent
--     (`follows_notifier`, `notifier_mentions`, `promouvoir_attente`) nomment
--     leurs colonnes ; aucune vue ne dépend de ces tables ;
--   · déclencheurs en place : `trg_rate_limit`, `trg_notifications_origine`,
--     `zz_barriere_suppression` (lit `to_jsonb(new)` : une colonne de plus n'y
--     change rien ; `trg_rid_opaque` part avant lui, ordre alphabétique) ;
--   · droits par défaut de `public` (pg_default_acl, propriétaires postgres et
--     supabase_admin) : anon et authenticated reçoivent EXECUTE sur toute
--     fonction neuve — d'où le REVOKE de la garde ;
--   · tailles : conv_members 22 lignes (80 Ko), conv_reads 31 (64 Ko),
--     notifications 169 (168 Ko), post_likes 71 (80 Ko), comment_interactions
--     369 (208 Ko).
-- Dépôt : `scripts/sauvegarde-donnees.js` trie sur la clé primaire annoncée
-- par PostgREST (`rid` n'en est pas) ; `scripts/moderation.js`, les Edge
-- Functions et le client écrivent des objets nommés, sans `rid`.
--
-- ⚠️ RÉÉCRITURE. Ajouter une colonne à défaut volatil RÉÉCRIT les quatre
-- tables (verrou ACCESS EXCLUSIVE, quelques millisecondes à cette taille ; une
-- réécriture n'est PAS publiée par le décodage logique — le banc le mesure) et
-- donne à CHAQUE ligne le `xmin` de cette transaction. Le retour arrière par
-- `xmin` de `migration_conv_members_reparation_2026-11-03.sql` ne vaut donc
-- plus après celle-ci — et cela ne perd rien : appliquée le 2026-11-03, elle a
-- inséré 0 ligne (verdict conservé dans `public.migrations_appliquees`).
--
-- VERROUS — la migration ne tient JAMAIS un verrou en en attendant un autre.
-- La première version prenait les cinq tables par un seul `lock table`
-- bloquant : quand l'une était tenue (une lecture longue ; l'instruction
-- préparée de `realtime.apply_rls`, qui lit la table), elle attendait jusqu'à
-- 5 s en TENANT déjà les précédentes — chaque client bloqué derrière elle —, et
-- un interblocage avec l'instruction préparée d'`apply_rls` a été reproduit en
-- revue : l'ordre unique ne protégeait que de l'upsert d'un accusé de lecture.
-- Désormais (⓪bis) : les cinq d'un coup, en NOWAIT, dans un sous-bloc — un refus
-- annule le sous-bloc et RELÂCHE ce qu'il avait déjà pris —, jusqu'à 100
-- essais espacés de 50 ms (≈ 5 s, rien n'est tenu pendant les pauses), puis
-- abandon propre : RIEN n'est appliqué, la rejouer. Le nombre d'essais refusés
-- est annoncé (NOTICE). `lock_timeout` (5 s) reste un filet pour tout autre
-- verrou. Mesuré au banc : pendant les essais, un lecteur de conv_reads (la
-- première table prise) n'attend jamais plus d'une fraction de seconde et la
-- migration n'est jamais en file d'attente d'un verrou ; elle passe dès que la
-- table se libère.
--
-- PREMIÈRE VERSION. Jamais appliquée en production (canal ①, 2026-11-04).
-- Là où elle l'aurait été — un banc, une base de développement —, `rid` porte
-- encore son identité SÉQUENTIELLE : la migration le voit et REFUSE de
-- s'appliquer, en le disant (⓪, avant tout verrou) ; jouer le retour arrière
-- ci-dessous (il retire la colonne), puis cette migration : la colonne est
-- simplement recréée, aléatoire. Aucune conversion, cette numérotation n'avait
-- rien à garder. La recréer d'office demanderait un `drop column`
-- conditionnel (bloc `do`), que `scripts/audit-tables-compte.js` refuse à
-- juste titre : il rend le schéma résultant indéterminable. Tout autre écart
-- (un défaut modifié, un index redéfini) n'est pas corrigé en silence non
-- plus : le verdict le dit.
--
-- ORDRE : indépendante des autres migrations ; applicable dès la fusion. De
-- préférence AVANT `migration_participants_visibilite_2026-11-03.sql` (non
-- appliquée au 2026-11-04) : sa purge efface des lignes `conv_members`, qui
-- partiraient alors déjà opaques.
--
-- RETOUR ARRIÈRE — EXACT, exécutable tel quel en ôtant « --| » (le banc le
-- rejoue et remesure l'état d'avant). L'ORDRE COMPTE : l'identité d'abord,
-- l'index ensuite (voir ④), la colonne enfin. Il rend aussi à
-- comment_interactions son identité FULL d'origine. Mêmes verrous que la
-- migration : NOWAIT, en boucle.
--| begin;
--| set local lock_timeout = '5s';
--| do $$
--| declare
--|   essai int := 0;
--| begin
--|   loop
--|     begin
--|       lock table public.conv_reads, public.conv_members, public.notifications, public.post_likes, public.comment_interactions in access exclusive mode nowait;
--|       exit;
--|     exception when lock_not_available then
--|       essai := essai + 1;
--|       if essai >= 100 then
--|         raise exception 'retour arrière R25 : les cinq tables ne se libèrent pas (100 essais) — rien n''est fait, le rejouer' using errcode = 'lock_not_available';
--|       end if;
--|     end;
--|     perform pg_catalog.pg_sleep(0.05);
--|   end loop;
--| end $$;
--| alter table public.conv_members replica identity default;
--| alter table public.notifications replica identity default;
--| alter table public.conv_reads replica identity default;
--| alter table public.post_likes replica identity default;
--| alter table public.comment_interactions replica identity full;
--| drop trigger if exists trg_rid_opaque on public.conv_members;
--| drop trigger if exists trg_rid_opaque on public.notifications;
--| drop trigger if exists trg_rid_opaque on public.conv_reads;
--| drop trigger if exists trg_rid_opaque on public.post_likes;
--| drop function if exists public.rid_opaque_garde();
--| drop index if exists public.conv_members_rid_key;
--| drop index if exists public.notifications_rid_key;
--| drop index if exists public.conv_reads_rid_key;
--| drop index if exists public.post_likes_rid_key;
--| alter table public.conv_members drop column if exists rid;
--| alter table public.notifications drop column if exists rid;
--| alter table public.conv_reads drop column if exists rid;
--| alter table public.post_likes drop column if exists rid;
--| commit;
-- ═══════════════════════════════════════════════════════════════════════════
begin;

set local lock_timeout = '5s';

-- ── ⓪ la première version de ce lot (rid d'IDENTITÉ, séquentiel) : refus explicite ──
-- Lecture du catalogue seule, avant tout verrou. Ailleurs — production
-- comprise —, ce bloc ne fait rien.
do $$
begin
  if exists (select 1 from pg_catalog.pg_attribute a
              where a.attrelid in ('public.conv_members'::regclass, 'public.notifications'::regclass,
                                   'public.conv_reads'::regclass, 'public.post_likes'::regclass)
                and a.attname = 'rid' and not a.attisdropped and a.attidentity <> '') then
    raise exception 'R25 : rid porte encore l''identité SÉQUENTIELLE de la première version de ce lot — jouer d''abord le retour arrière de l''en-tête (il retire la colonne), puis cette migration : rid sera recréé aléatoire. RIEN n''est appliqué.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end $$;

-- ── ⓪bis verrous : les cinq tables d'un coup, en NOWAIT, sans jamais attendre en en tenant une ──
do $$
declare
  essai int := 0;
begin
  loop
    begin
      -- Un refus (55P03) annule ce sous-bloc et RELÂCHE ce qu'il avait déjà pris.
      lock table public.conv_reads, public.conv_members, public.notifications, public.post_likes, public.comment_interactions
        in access exclusive mode nowait;
      exit;
    exception when lock_not_available then
      essai := essai + 1;
      if essai >= 100 then
        raise exception 'R25 : les cinq tables ne se libèrent pas (100 essais en NOWAIT, environ 5 s) — RIEN n''est appliqué, rejouer la migration'
          using errcode = 'lock_not_available';
      end if;
    end;
    -- La pause, HORS du sous-bloc : rien n'est tenu pendant qu'on attend.
    perform pg_catalog.pg_sleep(0.05);
  end loop;
  raise notice 'R25 : les cinq tables verrouillées (% essai(s) refusé(s) avant)', essai;
end $$;

-- ── ① rid : aléatoire, index unique sur lui seul, identité de réplication ──
-- Défaut VOLATIL : chaque `add column` RÉÉCRIT sa table et tire une valeur par
-- ligne existante. Déjà présente, la colonne n'est pas touchée (rejeu).
alter table public.conv_members add column if not exists rid bigint not null
  default (('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 17, 16))::bit(64)::bigint & 9007199254740991);
alter table public.notifications add column if not exists rid bigint not null
  default (('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 17, 16))::bit(64)::bigint & 9007199254740991);
alter table public.conv_reads add column if not exists rid bigint not null
  default (('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 17, 16))::bit(64)::bigint & 9007199254740991);
alter table public.post_likes add column if not exists rid bigint not null
  default (('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 17, 16))::bit(64)::bigint & 9007199254740991);

create unique index if not exists conv_members_rid_key on public.conv_members (rid);
create unique index if not exists notifications_rid_key on public.notifications (rid);
create unique index if not exists conv_reads_rid_key on public.conv_reads (rid);
create unique index if not exists post_likes_rid_key on public.post_likes (rid);

alter table public.conv_members replica identity using index conv_members_rid_key;
alter table public.notifications replica identity using index notifications_rid_key;
alter table public.conv_reads replica identity using index conv_reads_rid_key;
alter table public.post_likes replica identity using index post_likes_rid_key;

comment on column public.conv_members.rid is 'Nombre OPAQUE et ALÉATOIRE (53 bits : exact en JSON), tiré par la base seule (trg_rid_opaque : une valeur fournie est ignorée). Identité de réplication : le temps réel ne publie d''un DELETE que ce nombre. Sans signification ni ordre ; rien ne s''y réfère.';
comment on column public.notifications.rid is 'Nombre OPAQUE et ALÉATOIRE (53 bits : exact en JSON), tiré par la base seule (trg_rid_opaque : une valeur fournie est ignorée). Identité de réplication : le temps réel ne publie d''un DELETE que ce nombre. Sans signification ni ordre ; rien ne s''y réfère.';
comment on column public.conv_reads.rid is 'Nombre OPAQUE et ALÉATOIRE (53 bits : exact en JSON), tiré par la base seule (trg_rid_opaque : une valeur fournie est ignorée). Identité de réplication : le temps réel ne publie d''un DELETE que ce nombre. Sans signification ni ordre ; rien ne s''y réfère.';
comment on column public.post_likes.rid is 'Nombre OPAQUE et ALÉATOIRE (53 bits : exact en JSON), tiré par la base seule (trg_rid_opaque : une valeur fournie est ignorée). Identité de réplication : le temps réel ne publie d''un DELETE que ce nombre. Sans signification ni ordre ; rien ne s''y réfère.';
comment on index public.conv_members_rid_key is 'Identité de réplication (REPLICA IDENTITY USING INDEX). NE PAS SUPPRIMER sans « replica identity default » d''abord : sans lui, tout UPDATE et DELETE de cette table publiée est REFUSÉ. 0 lecture : voulu. Gardé par scripts/audit-identite-replication.js.';
comment on index public.notifications_rid_key is 'Identité de réplication (REPLICA IDENTITY USING INDEX). NE PAS SUPPRIMER sans « replica identity default » d''abord : sans lui, tout UPDATE et DELETE de cette table publiée est REFUSÉ. 0 lecture : voulu. Gardé par scripts/audit-identite-replication.js.';
comment on index public.conv_reads_rid_key is 'Identité de réplication (REPLICA IDENTITY USING INDEX). NE PAS SUPPRIMER sans « replica identity default » d''abord : sans lui, tout UPDATE et DELETE de cette table publiée est REFUSÉ. 0 lecture : voulu. Gardé par scripts/audit-identite-replication.js.';
comment on index public.post_likes_rid_key is 'Identité de réplication (REPLICA IDENTITY USING INDEX). NE PAS SUPPRIMER sans « replica identity default » d''abord : sans lui, tout UPDATE et DELETE de cette table publiée est REFUSÉ. 0 lecture : voulu. Gardé par scripts/audit-identite-replication.js.';

-- ── ② comment_interactions : l'identité redevient la clé primaire (id) ──
alter table public.comment_interactions replica identity default;

-- ── ③ garde : rid n'est écrit que par la base ──
create or replace function public.rid_opaque_garde()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  -- `rid` n'appartient qu'à la base. Un INSERT reçoit TOUJOURS une valeur
  -- aléatoire neuve — l'expression du défaut de colonne, recopiée : une valeur
  -- fournie par l'appelant (client, upsert, PostgREST) est ignorée, aucun
  -- appelant ne connaît le rid d'une ligne qu'il ne lit pas. Un UPDATE ne le
  -- change jamais.
  if tg_op = 'INSERT' then
    new.rid := (('x' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 17, 16))::bit(64)::bigint & 9007199254740991);
  else
    new.rid := old.rid;
  end if;
  return new;
end
$fn$;
revoke all on function public.rid_opaque_garde() from public, anon, authenticated;

drop trigger if exists trg_rid_opaque on public.conv_members;
create trigger trg_rid_opaque before insert or update of rid on public.conv_members
  for each row execute function public.rid_opaque_garde();
drop trigger if exists trg_rid_opaque on public.notifications;
create trigger trg_rid_opaque before insert or update of rid on public.notifications
  for each row execute function public.rid_opaque_garde();
drop trigger if exists trg_rid_opaque on public.conv_reads;
create trigger trg_rid_opaque before insert or update of rid on public.conv_reads
  for each row execute function public.rid_opaque_garde();
drop trigger if exists trg_rid_opaque on public.post_likes;
create trigger trg_rid_opaque before insert or update of rid on public.post_likes
  for each row execute function public.rid_opaque_garde();

-- ── Verdict ──
select controle, valeur from (
select v.n, v.nom || ' : identité de réplication = ' || v.nom || '_rid_key, unique sur (rid) seul — un DELETE ne publie plus que rid' as controle,
       case when (select c.relreplident from pg_class c where c.oid = to_regclass('public.' || v.nom)) = 'i'
             and exists (select 1
                           from pg_index i
                           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                          where i.indrelid = to_regclass('public.' || v.nom)
                            and i.indexrelid = to_regclass('public.' || v.nom || '_rid_key')
                            and i.indisreplident and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
                            and i.indnatts = 1 and i.indpred is null and i.indexprs is null
                            and a.attname = 'rid' and not a.attisdropped)
            then 'OK' else 'ECHEC' end as valeur
  from (values (1, 'conv_members'), (2, 'notifications'), (3, 'conv_reads'), (4, 'post_likes')) v(n, nom)
union all select 5, 'rid : bigint NOT NULL, ALÉATOIRE sur 53 bits (exact en JSON) — défaut gen_random_uuid(), chiffres 17 à 32, masque 2⁵³ − 1, le même sur les quatre tables — ni identité, ni séquence, ni colonne générée',
       case when (select count(*)
                    from pg_attribute a
                    join pg_class c on c.oid = a.attrelid
                    join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                   where a.attrelid in (to_regclass('public.conv_members'), to_regclass('public.notifications'),
                                        to_regclass('public.conv_reads'), to_regclass('public.post_likes'))
                     and a.attname = 'rid' and not a.attisdropped
                     and a.atttypid = 'bigint'::regtype and a.attnotnull
                     and a.attidentity = '' and a.attgenerated = ''
                     and pg_get_serial_sequence('public.' || c.relname, 'rid') is null
                     -- la forme à 53 bits, et elle seule : la précédente (chiffres
                     -- 1 à 16, masque 2⁶³ − 1 : 59 bits, inexacte en JSON) et un
                     -- compteur sont refusés.
                     and pg_get_expr(d.adbin, d.adrelid) like '%gen_random_uuid()%'
                     and pg_get_expr(d.adbin, d.adrelid) like '%, 17, 16)%'
                     and pg_get_expr(d.adbin, d.adrelid) like '%9007199254740991%'
                     and pg_get_expr(d.adbin, d.adrelid) not like '%9223372036854775807%'
                     and pg_get_expr(d.adbin, d.adrelid) not ilike '%nextval%') = 4
             and (select count(distinct pg_get_expr(d.adbin, d.adrelid))
                    from pg_attribute a
                    join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                   where a.attrelid in (to_regclass('public.conv_members'), to_regclass('public.notifications'),
                                        to_regclass('public.conv_reads'), to_regclass('public.post_likes'))
                     and a.attname = 'rid' and not a.attisdropped) = 1
            then 'OK' else 'ECHEC' end
union all select 6, 'les quatre tables : identité de réplication NON VIDE, et aucune colonne de clé primaire n''en fait partie',
       case when (select count(*) filter (where cardinality(s.ident) > 0 and not (s.ident && s.pk))
                    from (select case c.relreplident
                                   when 'f' then (select array_agg(a.attnum) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)
                                   when 'd' then (select i.indkey::int2[] from pg_index i where i.indrelid = c.oid and i.indisprimary)
                                   when 'i' then (select i.indkey::int2[] from pg_index i where i.indrelid = c.oid and i.indisreplident)
                                 end as ident,
                                 (select i.indkey::int2[] from pg_index i where i.indrelid = c.oid and i.indisprimary) as pk
                            from pg_class c
                           where c.oid in (to_regclass('public.conv_members'), to_regclass('public.notifications'),
                                           to_regclass('public.conv_reads'), to_regclass('public.post_likes'))) s) = 4
            then 'OK' else 'ECHEC' end
union all select 7, 'garde trg_rid_opaque ARMÉE sur les quatre tables (BEFORE INSERT OR UPDATE OF rid, par ligne, active, SANS clause WHEN) : rid n''est écrit que par la base ; fonction lue (rid aléatoire sur 53 bits, neuf à l''INSERT ; l''ancien à l''UPDATE), SECURITY DEFINER à search_path vide, non exécutable par anon / authenticated',
       case when (select count(*)
                    from pg_trigger tg
                    join pg_attribute a on a.attrelid = tg.tgrelid and a.attname = 'rid' and not a.attisdropped
                   where tg.tgrelid in (to_regclass('public.conv_members'), to_regclass('public.notifications'),
                                        to_regclass('public.conv_reads'), to_regclass('public.post_likes'))
                     and tg.tgname = 'trg_rid_opaque' and not tg.tgisinternal and tg.tgconstraint = 0
                     and tg.tgfoid = to_regprocedure('public.rid_opaque_garde()')
                     and tg.tgenabled in ('O', 'A')
                     -- une clause WHEN, même `when (false)`, désarme la garde
                     -- sans la retirer : elle ne doit pas exister.
                     and tg.tgqual is null and tg.tgnargs = 0
                     and (tg.tgtype & 1) = 1 and (tg.tgtype & 2) = 2 and (tg.tgtype & 4) = 4 and (tg.tgtype & 16) = 16
                     and (tg.tgtype & (8 | 32 | 64)) = 0
                     -- `UPDATE OF rid` et rien d'autre (int2vector lu en texte :
                     -- converti en int2[], il commence à l'indice 0 et ne vaut
                     -- jamais array[n]).
                     and tg.tgattr::text = a.attnum::text) = 4
             and exists (select 1 from pg_proc p
                          where p.oid = to_regprocedure('public.rid_opaque_garde()')
                            and p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=""'
                            and p.prorettype = 'trigger'::regtype
                            and p.prolang = (select l.oid from pg_language l where l.lanname = 'plpgsql')
                            -- la branche INSERT pose l'expression aléatoire SANS condition
                            -- (pas de « if new.rid is null ») ; l'UPDATE rend l'ancien.
                            and p.prosrc ~ ('if tg_op = ''INSERT'' then\s+new\.rid := \(\(''x'' \|\| pg_catalog\.substr\(pg_catalog\.replace\(pg_catalog\.gen_random_uuid\(\)::text, ''-'', ''''\), 17, 16\)\)::bit\(64\)::bigint & 9007199254740991\);'
                                            || '\s+else\s+new\.rid := old\.rid;\s+end if;\s+return new;\s+end\s*$')
                            and p.prosrc !~* 'nextval'
                            and not has_function_privilege('anon', p.oid, 'EXECUTE')
                            and not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
            then 'OK' else 'ECHEC' end
union all select 8, 'comment_interactions : REPLICA IDENTITY DEFAULT, identité = clé primaire (id) seule — un filtre ne reconnaît plus un DELETE que par id',
       case when (select c.relreplident from pg_class c where c.oid = to_regclass('public.comment_interactions')) = 'd'
             and (select array_agg(a.attname::text order by a.attnum)
                    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
                   where i.indrelid = to_regclass('public.comment_interactions') and i.indisprimary) = array['id']
            then 'OK' else 'ECHEC' end
union all select 9, 'aucune table publiée par supabase_realtime n''est en REPLICA IDENTITY FULL',
       case when exists (select 1 from pg_publication where pubname = 'supabase_realtime')
             and not exists (select 1
                               from pg_publication_tables pt
                               join pg_namespace n on n.nspname = pt.schemaname
                               join pg_class c on c.relnamespace = n.oid and c.relname = pt.tablename
                              where pt.pubname = 'supabase_realtime' and c.relreplident = 'f')
            then 'OK' else 'ECHEC' end
union all select 10, 'supabase_realtime : les 11 mêmes tables de public, insert / update / delete / truncate (appartenance inchangée)',
       case when (select string_agg(pt.schemaname || '.' || pt.tablename, ',' order by pt.schemaname, pt.tablename)
                    from pg_publication_tables pt where pt.pubname = 'supabase_realtime')
                 = 'public.comment_interactions,public.conv_members,public.conv_messages,public.conv_reads,public.event_comments,public.notifications,public.post_comments,public.post_likes,public.posts,public.profiles,public.video_lives'
             and exists (select 1 from pg_publication p
                          where p.pubname = 'supabase_realtime' and not p.puballtables
                            and p.pubinsert and p.pubupdate and p.pubdelete and p.pubtruncate)
            then 'OK' else 'ECHEC' end
) verdict order by n;

commit;
