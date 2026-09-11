#!/usr/bin/env node
/**
 * Régénère `migrations/OUVERTURE_2026-09-11.sql` — le fichier UNIQUE que
 * Benjamin colle dans l'éditeur SQL de Supabase le jour de l'ouverture.
 *
 * POURQUOI CE FICHIER EXISTE. Le mode d'emploi d'ouverture demandait TROIS
 * gestes séparés en base (appliquer la migration des fuites, effacer les
 * numéros de téléphone, brancher la purge de télémétrie), dans le bon ordre,
 * dont deux qu'on peut oublier sans que rien ne le signale. Ils sont ici en un
 * seul copier-coller, une seule transaction (une erreur annule tout), rejouable
 * autant de fois qu'on veut, et qui finit par un TABLEAU DE VERDICT disant
 * OK/ECHEC ligne par ligne.
 *
 * ⚠️ C'EST UN MIROIR, JAMAIS UNE SOURCE, pour sa partie ① : elle est recopiée
 * de `migrations/migration_fuites_2026-09-10.sql`. Corriger la migration sans
 * régénérer laisserait un fichier qui applique l'ANCIENNE version, en silence —
 * exactement le défaut que `scripts/generer-appliquer-tout.py` avait déjà eu à
 * fermer pour le lot du 2026-09-08. Les parties ② et ③ n'ont pas de migration
 * source : ce sont des gestes d'exploitation, et ce script EST leur source.
 *
 *     node scripts/generer-ouverture.js             # régénère
 *     node scripts/generer-ouverture.js --verifier  # échoue s'il a dérivé
 *
 * `--verifier` est joué par `npm run verif` (donc par la CI).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const SOURCE_FUITES = path.join(RACINE, "migrations", "migration_fuites_2026-09-10.sql");
const CIBLE = path.join(RACINE, "migrations", "OUVERTURE_2026-09-11.sql");

// ── Partie ① : le corps EXÉCUTABLE de la migration des fuites ───────────────
// On coupe avant le bloc « CONTRÔLE — à lire APRÈS application » : il n'est
// que du commentaire, et le tableau de verdict plus bas le remplace en mieux
// (il se lit, au lieu de demander qu'on recopie des requêtes à la main).
function corpsFuites() {
  const src = fs.readFileSync(SOURCE_FUITES, "utf8");
  const marqueur = "-- CONTRÔLE — à lire APRÈS application";
  const i = src.indexOf(marqueur);
  if (i < 0) {
    throw new Error(
      "generer-ouverture : le marqueur « CONTRÔLE — à lire APRÈS application » a disparu de " +
        "migrations/migration_fuites_2026-09-10.sql. Refuser plutôt que de recopier la " +
        "migration entière : le bloc de contrôle finirait dans la transaction.",
    );
  }
  // Remonter avant la ligne de séparation qui précède le marqueur.
  const avant = src.slice(0, i);
  const j = avant.lastIndexOf("-- ═");
  const corps = avant.slice(0, j > 0 ? j : avant.length).trimEnd();

  // ⚠️ LA COUPE PEUT AVALER DU SQL EXÉCUTABLE EN SILENCE, ET `--verifier` NE LE
  // VERRAIT PAS — il recalcule la même coupe, donc il compare une erreur à
  // elle-même. Mesuré : retirer la seule ligne de séparation cosmétique qui
  // précède le marqueur faisait disparaître 3 875 octets, soit TOUTE la partie B
  // (colonne `auth_uid`, fonction, trigger), et le miroir restait « à jour ».
  // On exige donc la présence des ancres que le corps DOIT contenir : un
  // générateur qui produit moins que prévu doit crier, pas se taire.
  const ANCRES = [
    "alter policy \"reads_select\"",
    "enable row level security",
    "add column if not exists auth_uid",
    "client_errors_pose_identite",
    "create trigger trg_client_errors_identite",
  ];
  const manquantes = ANCRES.filter((a) => !corps.includes(a));
  if (manquantes.length) {
    throw new Error(
      "generer-ouverture : la coupe de migration_fuites_2026-09-10.sql a perdu du SQL " +
        "exécutable. Ancres absentes du corps extrait : " + manquantes.join(", ") +
        ". Vérifier la ligne de séparation qui précède « CONTRÔLE — à lire APRÈS " +
        "application » avant de régénérer.",
    );
  }
  return corps;
}

const ENTETE = `-- ════════════════════════════════════════════════════════════════════════════
-- OUVERTURE DE PASSIO AU PUBLIC — TOUT CE QUI SE PASSE EN BASE, EN UN COLLER
-- Généré le 2026-09-11 par scripts/generer-ouverture.js — NE PAS ÉDITER À LA MAIN
-- ════════════════════════════════════════════════════════════════════════════
--
-- COMMENT S'EN SERVIR. Éditeur SQL de Supabase → tout coller → Run. Une seule
-- transaction : si quoi que ce soit échoue, RIEN n'est appliqué, et on peut
-- relancer sans risque après correction. Le fichier est idempotent : le rejouer
-- ne fait pas de mal.
--
-- À LA FIN, UN TABLEAU DE VERDICT s'affiche : les lignes 1 à 4 doivent dire OK,
-- la ligne 5 dit INFO (c'est une mesure, pas un contrôle). Puis une MUTATION
-- RÉELLE est jouée et annulée, qui rend son propre OK.
-- Si quoi que ce soit dit ECHEC : ne rien faire d'autre, copier la ligne.
--
-- ⚠️ SI AUCUN TABLEAU NE S'AFFICHE, c'est que la transaction a échoué AVANT son
-- COMMIT : rien n'a été appliqué, la base est intacte. Ne relance pas en
-- boucle — copie le message d'erreur et arrête-toi là.
--
-- ⚠️ CE FICHIER NE FAIT PAS LE VACUUM. Il ne peut pas : \`VACUUM\` est interdit
-- dans une transaction, et tout ce fichier en est une. Le vacuum est un second
-- coller, décrit tout en bas — il est FACULTATIF, rien ne casse sans lui.
--
-- ⚠️ CE FICHIER N'ALLUME PAS L'ADMISSION 18+ et ne touche à aucun interrupteur
-- existant. Il ne fait que les trois gestes ci-dessous.
--
--   ① Refermer deux fuites mesurées en production le 2026-09-10
--   ② Effacer les numéros de téléphone (le champ a été retiré du produit)
--   ③ Brancher la purge automatique de la télémétrie
--
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- ① LES DEUX FUITES
-- source : migrations/migration_fuites_2026-09-10.sql (recopie fidèle)
-- ════════════════════════════════════════════════════════════════════════════

`;

const PARTIE_2 = `

-- ════════════════════════════════════════════════════════════════════════════
-- ② LES NUMÉROS DE TÉLÉPHONE
-- ════════════════════════════════════════════════════════════════════════════
-- Le champ « téléphone » était OBLIGATOIRE à l'inscription et n'était LU NULLE
-- PART. Il a été retiré du formulaire le 2026-09-10 ; il reste à effacer ce qui
-- a déjà été collecté. Minimisation des données (RGPD art. 5.1.c) : une donnée
-- qu'on ne sait pas à quoi elle sert ne doit pas être conservée.
--
-- ⚠️ DEUX ENDROITS, PAS UN. Le numéro a été écrit dans les métadonnées du
-- compte (\`auth.users\`) ET dans l'état applicatif synchronisé
-- (\`public.user_state\`). N'en nettoyer qu'un laisse la donnée en base.
-- Mesuré le 2026-09-11 : 3 comptes sur 7 dans \`auth.users\`, 1 ligne dans
-- \`user_state\`.
--
-- ⚠️ LE NUMÉRO PEUT REVENIR TOUT SEUL, et ce n'est pas un défaut de ce script :
-- un appareil qui porte encore l'ancien état local le repoussera dans
-- \`user_state\` à son prochain enregistrement. Le tableau de verdict compte les
-- lignes restantes — relancer ce fichier dans une semaine est la bonne réponse,
-- il est fait pour ça.
--
-- ⚠️ Personne n'est déconnecté : on retire une clé des métadonnées, pas la
-- session ni le jeton de rafraîchissement.
--
-- ⚠️ MAIS L'UPDATE DE \`user_state\` FAIT AVANCER SON \`updated_at\` (trigger
-- \`trg_user_state_horodatage\`), ET CELA A UN EFFET CÔTÉ APPAREIL. Un appareil
-- qui portait une écriture d'état EN ATTENTE verra \`_flushPendingUserState\`
-- (app-02) comparer avec \`.lte("updated_at", baseServeur)\`, ne toucher aucune
-- ligne, conclure « serveur plus récent : file obsolète » et JETER sa file — en
-- silence. Une seule ligne est concernée aujourd'hui (mesuré), et la perte se
-- limite à des préférences non encore synchronisées. À coller de préférence à
-- une heure creuse.

-- ⚠️ \`jsonb_exists(x,'k')\` ET NON L'OPÉRATEUR \`?\`. Les deux sont équivalents en
-- SQL, mais \`?\` est le caractère que beaucoup de clients prennent pour un
-- paramètre à substituer. Un fichier fait pour être COLLÉ dans un éditeur web ne
-- doit pas parier là-dessus — et le reste du fichier utilise déjà la forme
-- fonction, donc l'uniformité supprime la question.
UPDATE auth.users
   SET raw_user_meta_data = raw_user_meta_data - 'phone'
 WHERE jsonb_exists(raw_user_meta_data, 'phone');

UPDATE public.user_state
   SET data = data #- '{user,general,phone}'
 WHERE jsonb_exists(data->'user'->'general', 'phone');

-- ════════════════════════════════════════════════════════════════════════════
-- ③ LA PURGE AUTOMATIQUE DE LA TÉLÉMÉTRIE
-- ════════════════════════════════════════════════════════════════════════════
-- La fonction \`public.purge_telemetry(keep_days)\` existe depuis la mise en
-- place du centre de pilotage, et l'extension \`pg_cron\` est installée (elle
-- porte déjà \`purge_client_errors\`). Il manquait simplement la TÂCHE : personne
-- n'appelait la fonction, et la table grossissait sans fin.
--
-- ⚠️ CE GESTE NE LIBÈRE PRESQUE RIEN AUJOURD'HUI, ET IL FAUT LE SAVOIR AVANT DE
-- LE JUGER. Mesuré le 2026-09-11 : 130 906 lignes, dont 8 596 seulement ont plus
-- de 30 jours — 6,6 %. La purge en retirera donc ~4 Mo sur 62 Mo. Son intérêt
-- n'est pas de faire maigrir la table maintenant, c'est de l'EMPÊCHER DE
-- GROSSIR : au rythme actuel (~3 100 lignes/jour), elle se stabilise autour de
-- 44 Mo au lieu de croître de ~45 Mo par mois indéfiniment.
--
-- ⚠️ ET 30 JOURS NE TIENDRA PAS À GRANDE ÉCHELLE. Le plafond du plan gratuit
-- est 500 Mo, au-delà desquels la base passe en LECTURE SEULE — plus une
-- inscription, plus un message. Si le trafic est multiplié par dix, 30 jours de
-- rétention pèsent ~440 Mo à eux seuls : trop près du mur. Quand le nombre de
-- comptes décolle, descendre à 7 jours d'un seul geste :
--
--     SELECT cron.unschedule('purge_telemetry_30j');
--     SELECT cron.schedule('purge_telemetry_7j', '0 4 * * *',
--                          $$SELECT public.purge_telemetry(7)$$);
--
-- ⚠️ La politique de confidentialité annonce « 13 mois au maximum » pour ces
-- événements techniques. 30 jours est BEAUCOUP plus strict que ce qui est
-- promis : conserver moins qu'annoncé est toujours permis, l'inverse jamais.
-- Ne pas remonter au-dessus de 13 mois sans réécrire le texte.
--
-- \`cron.schedule\` avec un nom déjà pris REMPLACE la tâche (pg_cron 1.6) : ce
-- bloc est donc rejouable.

SELECT cron.schedule('purge_telemetry_30j', '0 4 * * *',
                     $$SELECT public.purge_telemetry(30)$$);

-- Et on purge une première fois tout de suite, plutôt que d'attendre 4 h du
-- matin : le tableau de verdict peut ainsi dire ce qui reste.
SELECT public.purge_telemetry(30);

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERDICT — chaque ligne doit dire OK
-- ════════════════════════════════════════════════════════════════════════════
SELECT * FROM (
  -- ⚠️ \`cmd IN ('SELECT','ALL')\`, JAMAIS \`cmd='SELECT'\` SEUL. Une policy
  -- \`FOR ALL\` est enregistrée avec \`cmd='ALL'\` : un garde qui ne cherche que
  -- 'SELECT' ne la voit PAS, et le gabarit « Enable all operations » du tableau
  -- de bord Supabase en crée précisément une — c'est donc la dérive la PLUS
  -- probable. Mesuré : en posant cette policy après application, \`anon\` relit
  -- les 37 lignes et cette ligne disait OK. Même défaut, mot pour mot, que celui
  -- déjà documenté dans CLAUDE.md pour le garde de dérive de l'admission 18+.
  -- \`qual IS NULL\` couvre une policy permissive sans USING, qui laisse tout passer.
  SELECT 1 AS n, '① Graphe social (conv_reads)' AS geste,
         CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid='public.conv_reads'::regclass)
               AND EXISTS (SELECT 1 FROM pg_policies
                            WHERE schemaname='public' AND tablename='conv_reads'
                              AND cmd IN ('SELECT','ALL') AND qual LIKE '%is_conv_member%')
               AND NOT EXISTS (SELECT 1 FROM pg_policies
                            WHERE schemaname='public' AND tablename='conv_reads'
                              AND cmd IN ('SELECT','ALL')
                              AND permissive = 'PERMISSIVE'
                              AND (qual IS NULL OR qual = 'true'))
              THEN 'OK' ELSE 'ECHEC' END AS verdict,
         'Qui parle à qui n''est plus lisible sans compte.' AS detail
  UNION ALL
  SELECT 2, '① Identité serveur (client_errors)',
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_schema='public' AND table_name='client_errors'
                              AND column_name='auth_uid')
               AND EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                            WHERE c.relname='client_errors'
                              AND t.tgname='trg_client_errors_identite'
                              AND t.tgenabled='O')
              THEN 'OK' ELSE 'ECHEC' END,
         'Un texte anonyme ne peut plus atteindre la chaîne autonome.'
  UNION ALL
  SELECT 3, '② Téléphones effacés',
         CASE WHEN (SELECT count(*) FROM auth.users WHERE jsonb_exists(raw_user_meta_data, 'phone')) = 0
               AND (SELECT count(*) FROM public.user_state
                     WHERE jsonb_exists(data->'user'->'general','phone')) = 0
              THEN 'OK' ELSE 'ECHEC' END,
         'auth.users : ' || (SELECT count(*)::text FROM auth.users WHERE jsonb_exists(raw_user_meta_data, 'phone'))
         || ' restant(s) · user_state : '
         || (SELECT count(*)::text FROM public.user_state
              WHERE jsonb_exists(data->'user'->'general','phone')) || ' restante(s)'
  UNION ALL
  -- ⚠️ ON LES LISTE TOUTES, sans \`LIMIT 1\`. Basculer plus tard à 7 jours (voir
  -- plus haut) puis recoller ce fichier — les deux conseils qu'il donne — laisse
  -- DEUX tâches actives. Sans dégât (7 j ⊂ 30 j), mais un \`LIMIT 1\` sans
  -- \`ORDER BY\` annoncerait alors une rétention qui n'est pas celle qui s'applique.
  SELECT 4, '③ Purge télémétrie planifiée',
         CASE WHEN EXISTS (SELECT 1 FROM cron.job
                            WHERE jobname LIKE 'purge_telemetry%' AND active)
              THEN 'OK' ELSE 'ECHEC' END,
         COALESCE((SELECT string_agg('« ' || jobname || ' » à ' || schedule, ' + '
                                     ORDER BY jobname)
                     FROM cron.job WHERE jobname LIKE 'purge_telemetry%' AND active),
                  'aucune tâche active')
  UNION ALL
  SELECT 5, '   Taille après purge',
         'INFO',
         'base ' || pg_size_pretty(pg_database_size(current_database()))
         || ' · telemetry_events ' || pg_size_pretty(pg_total_relation_size('public.telemetry_events'))
         || ' (' || (SELECT count(*)::text FROM public.telemetry_events) || ' lignes)'
         || ' — les octets ne sont rendus qu''après le VACUUM ci-dessous'
) v ORDER BY n;

-- ════════════════════════════════════════════════════════════════════════════
-- MUTATION RÉELLE — la SEULE preuve que la garde ② fonctionne vraiment
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ LA LIGNE ② DU TABLEAU CI-DESSUS NE PROUVE QUE L'EXISTENCE DU TRIGGER.
-- Vider le corps de sa fonction par un \`create or replace\` le laisse en place,
-- \`tgenabled\` à 'O' — et la ligne dirait OK pendant qu'un visiteur se forge une
-- identité serveur. Mesuré : c'est exactement ce qui se produit.
--
-- On joue donc l'attaque pour de vrai : un visiteur (\`anon\`) insère une erreur
-- en se donnant explicitement un \`auth_uid\` de son choix. Le serveur doit
-- l'écraser. Tout est dans une transaction ANNULÉE : aucune ligne ne subsiste.
--
-- ⚠️ \`RESET ROLE\` avant la lecture : \`anon\` a l'INSERT mais PAS le SELECT sur
-- cette table, donc un \`RETURNING\` échouerait sur un refus de privilège — ce qui
-- ressemblerait à un défaut du correctif alors que ce serait un défaut du
-- contrôle. Le \`SET LOCAL\` et son INSERT partent dans le même envoi (ADR-012).
BEGIN;
  SET LOCAL role anon;
  INSERT INTO public.client_errors (message, auth_uid)
       VALUES ('verdict_ouverture_2026_09_11 — ligne annulee',
               '00000000-0000-4000-8000-000000000000'::uuid);
  RESET ROLE;
  SELECT CASE WHEN auth_uid IS NULL THEN 'OK' ELSE 'ECHEC' END AS verdict_mutation,
         CASE WHEN auth_uid IS NULL
              THEN 'Une identité forgée par un visiteur est bien écrasée par le serveur.'
              ELSE 'DANGER : le visiteur a choisi son auth_uid. Le trigger ne fait rien.'
              END AS detail
    FROM public.client_errors
   WHERE message = 'verdict_ouverture_2026_09_11 — ligne annulee';
ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- SECOND COLLER, FACULTATIF — LE VACUUM
-- ════════════════════════════════════════════════════════════════════════════
-- À coller SÉPARÉMENT, après avoir lu le verdict. \`VACUUM\` est interdit dans
-- une transaction : il ne peut pas vivre dans le fichier ci-dessus.
--
-- ⚠️ LES DEUX FORMES NE FONT PAS LA MÊME CHOSE, et la confusion est classique :
--
--   VACUUM (ANALYZE)  marque l'espace des lignes supprimées comme RÉUTILISABLE.
--                     La table cesse de grossir, mais la taille AFFICHÉE ne
--                     baisse pas. Aucun verrou gênant. C'est le choix par défaut.
--
--   VACUUM FULL       réécrit la table et REND vraiment les octets au disque.
--                     Prend un verrou exclusif : pendant quelques secondes (à
--                     62 Mo, compter 1 à 3 s) les écritures de télémétrie
--                     attendent — elles patientent, elles n'échouent pas.
--                     À réserver au moment où la taille de la base est le sujet.
--
-- Au choix, l'une OU l'autre :

-- VACUUM (ANALYZE) public.telemetry_events;
-- VACUUM FULL public.telemetry_events;
`;

function attendu() {
  return ENTETE + corpsFuites() + PARTIE_2;
}

function principal() {
  const texte = attendu();
  if (process.argv.includes("--verifier")) {
    const actuel = fs.existsSync(CIBLE) ? fs.readFileSync(CIBLE, "utf8") : "";
    if (actuel !== texte) {
      console.error("ECHEC — migrations/OUVERTURE_2026-09-11.sql a DÉRIVÉ de sa source.");
      console.error("        Régénérer : node scripts/generer-ouverture.js");
      process.exit(1);
    }
    console.log("OK — OUVERTURE_2026-09-11.sql est le miroir exact de sa migration source.");
    return;
  }
  fs.writeFileSync(CIBLE, texte, "utf8");
  console.log("régénéré :", path.relative(RACINE, CIBLE), "-", texte.length, "octets");
}

principal();
