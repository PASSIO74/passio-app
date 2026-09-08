-- RENCONTRES — ADRESSE, CONTACT ET PARTICIPANTS NE SONT PLUS PUBLICS (2026-09-08)
--
-- LE DÉFAUT (audit du 2026-09-04, IRL-01 et IRL-03, priorité P1) :
--   · `events` est lisible par `anon` avec `Lecture publique USING (true)` et un
--     GRANT SELECT sur la table ENTIÈRE. L'adresse exacte du rendez-vous et le
--     téléphone de contact de l'organisateur sont donc lisibles par n'importe
--     qui, sans compte, par un simple appel REST.
--   · `event_attendees` de même : la liste NOMINATIVE des participants d'une
--     rencontre physique est publique.
--
-- Autrement dit : une rencontre physique expose son organisateur et ceux qui
-- s'y rendent, à qui veut regarder. C'est le risque le plus concret du produit.
--
-- CE QUE CETTE MIGRATION FAIT
--   A. `events` reste lisible sans compte — c'est le parcours d'entrée du
--      produit, un visiteur doit voir qu'il se passe des choses — mais `anon`
--      n'a plus le droit de lire les colonnes `address` et `contact`.
--   B. `event_attendees` n'est plus lisible que par un compte connecté.
--
-- ⚠️ ON NE PEUT PAS RETIRER UNE COLONNE D'UN GRANT DE TABLE. PostgreSQL refuse
-- de soustraire un privilège de colonne à un privilège accordé sur la table
-- entière : le GRANT de table continuerait de tout autoriser. Il faut donc
-- révoquer le SELECT de table, puis le réaccorder COLONNE PAR COLONNE. C'est
-- fait ci-dessous, et la liste est exhaustive à dessein.
--
-- ⚠️ ELLE EXIGE LE LOT CLIENT QUI L'ACCOMPAGNE. `supaLoadEvents` demandait
-- `select("*")` : PostgREST refuse alors la requête ENTIÈRE (42501) dès qu'une
-- seule colonne manque au rôle — les rencontres disparaîtraient pour tout
-- visiteur. Le client demande désormais une liste EXPLICITE, et retombe sur la
-- liste publique s'il essuie un refus. Déployer le client d'abord ; il
-- fonctionne avant comme après.
--
-- CE QU'ELLE NE FAIT PAS
--   · Elle ne cache pas `lat`/`lng`. Les coordonnées servent la carte, que le
--     produit montre à un visiteur sans compte : les retirer viderait l'écran
--     d'entrée. Elles restent donc lisibles, et c'est une DÉCISION à assumer,
--     pas un oubli — l'audit les cite. Le geste correct, le jour où on voudra
--     le fermer, est de servir une position APPROCHÉE aux non-inscrits et la
--     position exacte aux seuls participants, ce qui demande deux colonnes ou
--     une vue, donc un autre lot.
--   · Elle ne touche pas `event_comments` ni `event_reactions`, publics eux
--     aussi.
--
-- Le fichier est atomique : toute erreur annule tout.

BEGIN;

-- ============================================================================
-- A. `events` : l'adresse et le contact sortent de la lecture publique
-- ============================================================================

-- Une policy SELECT inconnue rendrait le resserrement caduc (les permissives se
-- combinent en OU), et une policy `FOR ALL` porte `cmd = 'ALL'` — le gabarit
-- « Enable all operations » du tableau de bord, donc la dérive la plus probable.
DO $guard_lecture$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename IN ('events', 'event_attendees')
       AND cmd IN ('SELECT', 'ALL')
       AND policyname NOT IN ('Lecture publique', 'Read events', 'event_attendees_select_authentifie')
  ) THEN
    RAISE EXCEPTION 'policy SELECT/ALL inattendue sur events/event_attendees : migration refusee';
  END IF;
END
$guard_lecture$;

-- ⚠️ La liste est EXHAUSTIVE et doit le rester. Une colonne ajoutée demain à
-- `events` ne sera PAS lisible par un visiteur tant qu'elle n'est pas ajoutée
-- ici — c'est le sens voulu du défaut : une donnée nouvelle est privée jusqu'à
-- ce que quelqu'un décide qu'elle est publique.
REVOKE SELECT ON TABLE public.events FROM anon;
GRANT SELECT (
  id, author_id, title, passion_id, lat, lng, city, description, emoji,
  max_attendees, date_at, created_at, venue, postal_code, price,
  external_link, event_type, cover_url, organizer_id, end_at, status,
  updated_at, co_organizers, series_id, recurrence, conv_id
) ON TABLE public.events TO anon;

-- Un compte connecté garde l'accès complet : l'adresse et le contact sont ce
-- qu'on vient chercher quand on décide de s'y rendre.
GRANT SELECT ON TABLE public.events TO authenticated;

-- ============================================================================
-- B. `event_attendees` : la liste des participants demande un compte
-- ============================================================================
DROP POLICY IF EXISTS "Lecture publique" ON public.event_attendees;
DROP POLICY IF EXISTS "event_attendees_select_authentifie" ON public.event_attendees;
CREATE POLICY "event_attendees_select_authentifie" ON public.event_attendees
  FOR SELECT TO authenticated
  USING (true);

-- Défense en profondeur : une policy filtre l'accès, elle ne l'accorde pas.
-- Sans ce REVOKE, le GRANT de table laisserait `anon` passer si une policy
-- permissive réapparaissait.
REVOKE SELECT ON TABLE public.event_attendees FROM anon;

COMMIT;

-- VÉRIFIER APRÈS (lecture seule)
--   -- 1. anon ne lit ni l'adresse ni le contact, mais lit bien le reste
--   SELECT has_column_privilege('anon','public.events','address','SELECT') AS adresse,
--          has_column_privilege('anon','public.events','contact','SELECT') AS contact,
--          has_column_privilege('anon','public.events','title','SELECT')   AS titre,
--          has_column_privilege('anon','public.events','lat','SELECT')     AS coord;
--   -- attendu : f, f, t, t
--
--   -- 2. anon ne lit plus les participants, authenticated si
--   SELECT has_table_privilege('anon','public.event_attendees','SELECT')          AS anon_part,
--          has_table_privilege('authenticated','public.event_attendees','SELECT') AS auth_part;
--   -- attendu : f, t
--
--   -- 3. une seule policy SELECT sur event_attendees, reservee a authenticated
--   SELECT policyname, roles::text FROM pg_policies
--    WHERE schemaname='public' AND tablename='event_attendees' AND cmd='SELECT';
--
-- RETOUR ARRIÈRE (restaure l'état d'avant, qui est le défaut)
--   BEGIN;
--   GRANT SELECT ON TABLE public.events TO anon;
--   DROP POLICY IF EXISTS "event_attendees_select_authentifie" ON public.event_attendees;
--   CREATE POLICY "Lecture publique" ON public.event_attendees FOR SELECT USING (true);
--   GRANT SELECT ON TABLE public.event_attendees TO anon;
--   COMMIT;
