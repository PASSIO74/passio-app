-- Socle exclusivement jetable : aucun transport HTTP ni secret reel.
create role anon nologin;
create role authenticated nologin;
create schema banc_veille;
create schema cron;
create schema net;
revoke all on schema banc_veille, cron, net from public, anon, authenticated;

create table cron.job (
  jobid bigint generated always as identity primary key,
  jobname text unique not null,
  schedule text not null,
  command text not null,
  username name not null default current_user
);
create function cron.schedule(p_nom text, p_schedule text, p_command text)
returns bigint language sql as $f$
  insert into cron.job(jobname,schedule,command)
  values(p_nom,p_schedule,p_command) returning jobid
$f$;
create function cron.unschedule(p_id bigint)
returns boolean language sql as $f$
  delete from cron.job where jobid=p_id returning true
$f$;

create table banc_veille.http (
  id bigint generated always as identity primary key,
  url text not null,
  headers jsonb not null,
  body jsonb not null,
  timeout_milliseconds integer not null
);
create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
returns bigint language sql as $f$
  insert into banc_veille.http(url,headers,body,timeout_milliseconds)
  values($1,$2,$3,$4) returning id
$f$;

create function banc_veille.verifier(p_ok boolean,p_cas text)
returns void language plpgsql as $f$
begin
  if p_ok is distinct from true then raise exception 'BANC VEILLE : %',p_cas; end if;
end
$f$;
create function banc_veille.ancien_cron()
returns void language plpgsql as $f$
begin
  delete from cron.job where jobname='pilotage_veille';
  perform cron.schedule('pilotage_veille','*/5 * * * *','select 17 /* ancien */');
end
$f$;
create function banc_veille.executer_cron()
returns void language plpgsql as $f$
declare commande text;
begin
  select command into strict commande from cron.job where jobname='pilotage_veille';
  execute commande;
end
$f$;

-- Vault n'existe pas encore : le premier scenario en mesure l'absence reelle.
create procedure banc_veille.installer_vault()
language plpgsql as $f$
begin
  create schema vault;
  create table vault.decrypted_secrets(name text not null,decrypted_secret text);
  revoke all on schema vault from public,anon,authenticated;
  revoke all on vault.decrypted_secrets from public,anon,authenticated;
end
$f$;
create function banc_veille.configurer(p_projet text)
returns void language plpgsql as $f$
begin
  truncate vault.decrypted_secrets;
  insert into vault.decrypted_secrets(name,decrypted_secret) values
    ('pilotage_veille_projet',p_projet),
    ('pilotage_veille_edge_disponible','1'),
    ('pilotage_veille_base_url','https://' || p_projet || '.supabase.co'),
    ('pilotage_veille_secret','secret-synthetique-initial'),
    ('pilotage_veille_anon_key','cle-publique-synthetique-initiale');
end
$f$;

-- Une autre tache ne doit jamais etre retiree par la migration de veille.
select cron.schedule('purge_locale','0 3 * * *','select 23');
