-- ═════════════════════════════════════════════════
-- AUDIT 2026-11-02, REVUE INDÉPENDANTE point 2 et risque R5 (2026-11-03) :
-- LES IDENTIFIANTS DE NOTIFICATION QUE LE SERVEUR FABRIQUE LUI SONT RÉSERVÉS
--
-- `identifiant_reserve_au_serveur(p_id)` ne réservait que `n_m_%` (messages).
-- Or trois autres familles sont DÉTERMINISTES et écrites par des fonctions
-- SECURITY DEFINER avec `on conflict (id) do update` :
--   · `n_pa_<md5…>`  — promotion depuis la liste d'attente (`promouvoir_attente`) ;
--   · `n_fw_<acteur8>_<cible8>` / `n_fr_…` / `n_fa_…` — suivi, demande, acceptation
--     (`follows_notifier`).
-- Un compte pouvait donc INSÉRER d'avance une notification sous l'un de ces
-- identifiants (la policy INSERT n'exige que `from_id = moi`, et n'importe qui
-- peut notifier n'importe qui — like, commentaire…) : le `do update` du serveur
-- réécrivait ensuite SA ligne — `from_id` restant celui du squatteur, la cible
-- lisait « <squatteur> a commencé à te suivre » à la place du vrai abonné. La
-- migration de promotion s'en protège déjà par une clause `where` ; ici on ferme
-- la porte à la source : ces préfixes sont refusés à TOUT client.
--
-- Les identifiants CLIENT ne sont pas concernés : `n_x<aléa>` (uid()) et
-- `n_msg_<id>_<8>` (notification de message côté client) ne commencent par
-- aucun de ces préfixes — `n_msg_` n'est pas `n_m_` (le `_` suit le `m`).
--
-- Rejouable ; verdict en fin. RETOUR ARRIÈRE :
--   create or replace function public.identifiant_reserve_au_serveur(p_id text) returns boolean
--     language sql immutable set search_path = '' as $$ select p_id like 'n\_m\_%' $$;
-- ═════════════════════════════════════════════════
begin;

create or replace function public.identifiant_reserve_au_serveur(p_id text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_id like 'n\_m\_%'
      or p_id like 'n\_pa\_%'
      or p_id like 'n\_fw\_%'
      or p_id like 'n\_fr\_%'
      or p_id like 'n\_fa\_%'
$$;

-- ── Verdict ──
select 'identifiants serveur réservés : n_m_, n_pa_, n_fw_, n_fr_, n_fa_' as controle,
       case when public.identifiant_reserve_au_serveur('n_m_abc')
             and public.identifiant_reserve_au_serveur('n_pa_abc')
             and public.identifiant_reserve_au_serveur('n_fw_12345678_87654321')
             and public.identifiant_reserve_au_serveur('n_fr_12345678_87654321')
             and public.identifiant_reserve_au_serveur('n_fa_12345678_87654321') then 'OK' else 'ECHEC' end as valeur
union all select 'identifiants client libres : n_x<aléa>, n_msg_<id>_<8>',
       case when not public.identifiant_reserve_au_serveur('n_xk3j2h1g9abc')
             and not public.identifiant_reserve_au_serveur('n_msg_xk3j2h1g9abc_12345678')
             and not public.identifiant_reserve_au_serveur('n_mabc') then 'OK' else 'ECHEC' end
union all select 'la policy INSERT de notifications appelle toujours identifiant_reserve_au_serveur',
       case when (select with_check from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_insert_own_author') like '%identifiant_reserve_au_serveur(id)%' then 'OK' else 'ECHEC' end;

commit;
