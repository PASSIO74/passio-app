-- Veille authentifiee, cible explicite, desactivee par defaut.
-- Apres revue : provisionner Vault via l'API du tableau editor, hors journal SQL :
-- pilotage_veille_secret (meme valeur que PILOTAGE_VEILLE_SECRET Edge/GitHub),
-- pilotage_veille_anon_key et pilotage_veille_base_url (https://<projet>.supabase.co).
-- ORDRE : secrets provisionnes ; Vault pilotage_veille_projet = cible relue et
-- pilotage_veille_edge_disponible = '1' seulement si Edge disponible sur CETTE cible ;
-- migration ; workflow de secours authentifie ; Edge fermee par defaut.
-- Sans disponibilite explicite : retirer tout ancien cron, aucun appel reseau.
-- Le staging sans Edge reste sans cron. Aucune valeur secrete dans le journal.
-- Rejouable. Retour sur : cron.unschedule('pilotage_veille'), secours authentifie.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $installation$
declare
  projet text;
  cible_migration text;
  edge_disponible text;
  base_url text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'pilotage_veille';
    raise notice 'Veille non activee : Vault absent';
    return;
  end if;
  if has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT')
     or has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT')
     or has_any_column_privilege('anon', 'vault.decrypted_secrets', 'SELECT')
     or has_any_column_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT') then
    raise exception 'Vault accessible aux roles clients : application refusee';
  end if;
  select max(decrypted_secret) into projet from vault.decrypted_secrets
    where name = 'pilotage_veille_projet' having count(*) = 1;
  select max(decrypted_secret) into edge_disponible from vault.decrypted_secrets
    where name = 'pilotage_veille_edge_disponible' having count(*) = 1;
  if projet is null or edge_disponible is distinct from '1' then
    perform cron.unschedule(jobid) from cron.job where jobname = 'pilotage_veille';
    raise notice 'Veille non activee : cible ou disponibilite Edge non declaree dans Vault';
    return;
  end if;
  if projet not in ('njkiyoklssvefstljemx', 'fcksxofaelcdmmifnwjo') then
    raise exception 'Projet Vault hors liste autorisee';
  end if;
  -- Le script officiel injecte cette ligne dans la MEME transaction.
  -- Une configuration Vault copiee de production ne peut donc activer le staging.
  select cible into strict cible_migration from public.migrations_appliquees
    where fichier = 'migrations/migration_pilotage_veille_secret_2026-11-16.sql'
      and outil = 'appliquer-migration.mjs' and xmin = pg_current_xact_id()::xid;
  if projet is distinct from cible_migration then
    raise exception 'Projet Vault different de la cible du script officiel';
  end if;
  select decrypted_secret into strict base_url from vault.decrypted_secrets
    where name = 'pilotage_veille_base_url';
  if base_url is distinct from ('https://' || projet || '.supabase.co') then
    raise exception 'URL Vault differente du projet cible declare';
  end if;
  if not (select count(*) = 1 and bool_and(coalesce(length(btrim(decrypted_secret)), 0) > 0)
            from vault.decrypted_secrets where name = 'pilotage_veille_secret')
     or not (select count(*) = 1 and bool_and(coalesce(length(btrim(decrypted_secret)), 0) > 0)
               from vault.decrypted_secrets where name = 'pilotage_veille_anon_key') then
    raise exception 'Configuration Vault de la veille absente ou ambigue';
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'pilotage_veille';
  perform cron.schedule('pilotage_veille', '*/5 * * * *', format($job$
    do $veille$
    declare
      secret_veille text;
      cle_publique text;
      base_url text;
      projet text;
      edge_disponible text;
    begin
      select decrypted_secret into strict projet from vault.decrypted_secrets where name = 'pilotage_veille_projet';
      select decrypted_secret into strict edge_disponible from vault.decrypted_secrets where name = 'pilotage_veille_edge_disponible';
      if projet is distinct from %1$L or edge_disponible is distinct from '1' then
        raise exception 'Veille desactivee ou projet Vault modifie';
      end if;
      select decrypted_secret into strict secret_veille
        from vault.decrypted_secrets where name = 'pilotage_veille_secret';
      select decrypted_secret into strict cle_publique
        from vault.decrypted_secrets where name = 'pilotage_veille_anon_key';
      select decrypted_secret into strict base_url
        from vault.decrypted_secrets where name = 'pilotage_veille_base_url';
      if base_url is distinct from %2$L then
        raise exception 'URL Vault differente du projet cible';
      end if;
      if coalesce(length(btrim(secret_veille)), 0) = 0
         or coalesce(length(btrim(cle_publique)), 0) = 0 then
        raise exception 'Configuration Vault de la veille absente';
      end if;
      perform net.http_post(
        url := base_url || '/functions/v1/pilotage',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'Authorization', 'Bearer ' || cle_publique, 'x-passio-veille', secret_veille),
        body := jsonb_build_object('action', 'veille'), timeout_milliseconds := 30000
      );
    end
    $veille$;
  $job$, projet, base_url));
  if (select count(*) from cron.job where jobname = 'pilotage_veille') <> 1
     or not exists (select 1 from cron.job where jobname = 'pilotage_veille'
       and username = current_user and command like '%vault.decrypted_secrets%'
       and command like '%x-passio-veille%' and schedule = '*/5 * * * *') then
    raise exception 'Planification authentifiee de la veille invalide';
  end if;
end
$installation$;
-- Aucun nouvel objet expose ni droit client accorde ; le job lit Vault en postgres.
select 'OK' as verdict, 'veille absente ou authentifiee sur la cible explicite' as detail;
commit;
