-- APRÈS migration et rejeu. Toutes les données et identités sont synthétiques.
do $$ begin
 if has_schema_privilege('authenticated','passio_realtime_budget','usage')
 or has_schema_privilege('service_role','passio_realtime_budget','usage')
 or has_table_privilege('anon','passio_realtime_budget.compteurs','select')
 or has_function_privilege('authenticated','public.diffuser_lecture()','execute') then
  raise exception 'ACL interne ouverte';
 end if;
end $$;

-- No-op et upsert INSERT→UPDATE : un seul effet effectif, compteur exact.
do $$ declare initial timestamptz; n bigint; begin
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 set local role authenticated;
 insert into public.conv_reads values('g',auth.uid()::text,clock_timestamp()-interval '1 hour');
 select last_read_at into initial from public.conv_reads where conv_id='g' and user_id=auth.uid()::text;
 insert into public.conv_reads(conv_id,user_id,last_read_at) values('g',auth.uid()::text,initial)
  on conflict(conv_id,user_id) do update set last_read_at=excluded.last_read_at;
 update public.conv_reads set last_read_at=initial-interval '1 day' where conv_id='g' and user_id=auth.uid()::text;
 reset role;
 if (select count(*) from realtime.trames)<>2 then raise exception 'no-op diffuse ou blocage perdu'; end if;
 if exists(select 1 from realtime.trames where topic='user:33333333-3333-4333-8333-333333333333'
  or topic='user:11111111-1111-4111-8111-111111111111') then raise exception 'destinataire lecture incorrect'; end if;
 if (select count(*) from passio_realtime_budget.compteurs)<>3
 or exists(select 1 from passio_realtime_budget.compteurs where effets<>1 or trames<>2 or octets<=0) then
  raise exception 'upsert compte plusieurs fois';
 end if;
 if (select last_read_at from public.conv_reads where conv_id='g' and user_id='11111111-1111-4111-8111-111111111111')<>initial then
  raise exception 'lecture regresse';
 end if;
end $$;

-- Horloge serveur et immutabilité ne reposent pas sur l'interface.
do $$ declare refuse boolean; begin
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 set local role authenticated;
 update public.conv_reads set last_read_at=clock_timestamp()+interval '10 days'
  where conv_id='g' and user_id=auth.uid()::text;
 if exists(select 1 from public.conv_reads where user_id=auth.uid()::text and last_read_at>clock_timestamp()) then
  raise exception 'heure future conservee';
 end if;
 refuse:=false;
 begin update public.conv_reads set conv_id='autre' where conv_id='g' and user_id=auth.uid()::text;
 exception when check_violation then refuse:=true; end;
 if not refuse then raise exception 'conversation reassignable'; end if;
 refuse:=false;
 begin update public.conv_reads set user_id='22222222-2222-4222-8222-222222222222' where conv_id='g' and user_id=auth.uid()::text;
 exception when insufficient_privilege or check_violation then refuse:=true; end;
 if not refuse then raise exception 'compte reassignable'; end if;
 reset role;
end $$;

truncate passio_realtime_budget.compteurs,realtime.trames;
-- Texte long, marqueurs de suppression/réaction et appareil de l'auteur :
-- aucun changement de sujet, de type ou de contenu, y compris les accents.
do $$ declare texte_long text; begin
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 texte_long:=repeat('texte é ',1000);
 set local role authenticated;
 insert into public.conv_messages(id,conv_id,from_id,content) values
  ('long','g',auth.uid()::text,texte_long),('del','g',auth.uid()::text,'{"type":"del","target":"long"}'),
  ('react','g',auth.uid()::text,'{"type":"react","target":"long","emoji":"❤","op":"add"}');
 reset role;
 if (select count(*) from realtime.trames)<>9 then raise exception 'fanout incorrect'; end if;
 if exists(select 1 from realtime.trames where event<>'INSERT' or charge->>'table'<>'conv_messages'
  or charge->>'schema'<>'public' or charge->>'operation'<>'INSERT'
  or topic='user:33333333-3333-4333-8333-333333333333') then raise exception 'contrat de diffusion modifie'; end if;
 if (select count(*) from realtime.trames where topic='user:11111111-1111-4111-8111-111111111111')<>3 then
  raise exception 'appareil de l auteur exclu'; end if;
 if exists(select 1 from realtime.trames where charge->'record'->>'id'='long' and charge->'record'->>'content'<>texte_long) then
  raise exception 'texte tronque'; end if;
 if exists(select 1 from passio_realtime_budget.compteurs where effets<>3 or trames<>9) then raise exception 'cout de fanout incorrect'; end if;
end $$;

-- Chaque fenêtre est testée séparément. Une limite annule compteurs, ligne ET
-- émissions de la requête ; le message de refus ne porte aucune identité.
do $$ declare i integer; limite bigint; periode text; n bigint; refuse boolean; d text; begin
 for i in 1..3 loop
  truncate passio_realtime_budget.compteurs;
  limite:=case i when 1 then 120 when 2 then 2000 else 6000 end;
  periode:=case i when 1 then 'minute' when 2 then 'hour' else 'day' end;
  insert into passio_realtime_budget.compteurs values('11111111-1111-4111-8111-111111111111',i,
   date_trunc(periode,clock_timestamp() at time zone 'UTC') at time zone 'UTC',limite,0,0);
  select count(*) into n from realtime.trames;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  set local role authenticated;
  refuse:=false;
  begin
   insert into public.conv_messages(id,conv_id,from_id,content) values('limite_'||i,'g',auth.uid()::text,'texte');
  exception when sqlstate 'P0001' then
   get stacked diagnostics d=pg_exception_detail;
   if d::jsonb->>'budget'<>'realtime' or (d::jsonb->>'reessai_ms')::bigint<1000 then raise exception 'refus illisible'; end if;
   refuse:=true;
  end;
  reset role;
  if not refuse or exists(select 1 from public.conv_messages where id='limite_'||i)
   or (select count(*) from realtime.trames)<>n or (select count(*) from passio_realtime_budget.compteurs)<>1
   or (select effets from passio_realtime_budget.compteurs)<>limite then raise exception 'quota non atomique'; end if;
 end loop;
end $$;

-- Le budget d'octets est indépendant des nombres de trames et d'effets.
do $$ declare i integer; limite bigint; periode text; refuse boolean; n bigint; begin
 for i in 1..3 loop
  truncate passio_realtime_budget.compteurs;
  limite:=case i when 1 then 3000 when 2 then 30000 else 100000 end;
  periode:=case i when 1 then 'minute' when 2 then 'hour' else 'day' end;
  insert into passio_realtime_budget.compteurs values('11111111-1111-4111-8111-111111111111',i,
   date_trunc(periode,clock_timestamp() at time zone 'UTC') at time zone 'UTC',0,limite,0);
  select count(*) into n from realtime.trames;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  set local role authenticated;
  refuse:=false;
  begin insert into public.conv_messages(id,conv_id,from_id,content) values('trames_'||i,'g',auth.uid()::text,'texte');
  exception when sqlstate 'P0001' then refuse:=true; end;
  reset role;
  if not refuse or (select count(*) from realtime.trames)<>n
   or (select trames from passio_realtime_budget.compteurs)<>limite then raise exception 'trames non bornees'; end if;
 end loop;
end $$;

-- Le budget d'octets est indépendant des nombres de trames et d'effets.
do $$ declare i integer; limite bigint; periode text; refuse boolean; n bigint; begin
 for i in 1..3 loop
  truncate passio_realtime_budget.compteurs;
  limite:=case i when 1 then 16777216 when 2 then 67108864 else 268435456 end;
  periode:=case i when 1 then 'minute' when 2 then 'hour' else 'day' end;
  insert into passio_realtime_budget.compteurs values('11111111-1111-4111-8111-111111111111',i,
   date_trunc(periode,clock_timestamp() at time zone 'UTC') at time zone 'UTC',0,0,limite-1);
  select count(*) into n from realtime.trames;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  set local role authenticated;
  refuse:=false;
  begin insert into public.conv_messages(id,conv_id,from_id,content) values('octets_'||i,'g',auth.uid()::text,repeat('x',4000));
  exception when sqlstate 'P0001' then refuse:=true; end;
  reset role;
  if not refuse or (select count(*) from realtime.trames)<>n
   or (select octets from passio_realtime_budget.compteurs)<>limite-1 then raise exception 'octets non bornes'; end if;
 end loop;
end $$;


truncate passio_realtime_budget.compteurs;
-- Un INSERT multi-lignes échoue à la deuxième ligne : la première ligne et ses
-- émissions ne doivent pas survivre au refus de la deuxième.
insert into passio_realtime_budget.compteurs values('11111111-1111-4111-8111-111111111111',1,
 date_trunc('minute',clock_timestamp() at time zone 'UTC') at time zone 'UTC',119,0,0);
do $$ declare n bigint; refuse boolean:=false; begin
 select count(*) into n from realtime.trames;
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 set local role authenticated;
 begin insert into public.conv_messages(id,conv_id,from_id,content) values
  ('lot1','g',auth.uid()::text,'un'),('lot2','g',auth.uid()::text,'deux');
 exception when sqlstate 'P0001' then refuse:=true; end;
 reset role;
 if not refuse or exists(select 1 from public.conv_messages where id in ('lot1','lot2'))
 or (select count(*) from realtime.trames)<>n or (select effets from passio_realtime_budget.compteurs where fenetre=1)<>119 then
  raise exception 'INSERT multi-lignes partiellement valide';
 end if;
end $$;

-- Un accusé refusé reste réellement refusé : le catch best-effort n'avale pas le quota.
update passio_realtime_budget.compteurs set effets=120 where fenetre=1;
do $$ declare avant timestamptz; n bigint; refuse boolean:=false; begin
 select last_read_at into avant from public.conv_reads where conv_id='g' and user_id='11111111-1111-4111-8111-111111111111';
 select count(*) into n from realtime.trames;
 perform pg_sleep(0.002);
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 set local role authenticated;
 begin update public.conv_reads set last_read_at=clock_timestamp() where conv_id='g' and user_id=auth.uid()::text;
 exception when sqlstate 'P0001' then refuse:=true; end;
 reset role;
 if not refuse or (select count(*) from realtime.trames)<>n
 or (select last_read_at from public.conv_reads where conv_id='g' and user_id='11111111-1111-4111-8111-111111111111')<>avant then
  raise exception 'accuse refuse devenu un faux succes'; end if;
end $$;

-- Un autre émetteur conserve son budget ; le service sans session est compté
-- au profil de l'auteur et peut lui aussi être refusé, sans privilège de coût.
do $$ begin
 perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
 set local role authenticated;
 insert into public.conv_messages(id,conv_id,from_id,content) values('autre_compte','autre',auth.uid()::text,'ok');
 reset role;
 perform set_config('request.jwt.claim.sub','',true);
 set local role service_role;
 insert into public.conv_messages(id,conv_id,from_id,content) values('service','autre','22222222-2222-4222-8222-222222222222','ok');
 reset role;
 if exists(select 1 from passio_realtime_budget.compteurs where compte='22222222-2222-4222-8222-222222222222' and (effets<>2 or trames<>4)) then
  raise exception 'compte distinct ou service mal compte'; end if;
end $$;

-- La fenêtre stockée ne recule pas même si l'appel a une heure antérieure.
truncate passio_realtime_budget.compteurs;
insert into passio_realtime_budget.compteurs values('11111111-1111-4111-8111-111111111111',1,
 (date_trunc('minute',clock_timestamp() at time zone 'UTC') at time zone 'UTC')+interval '1 minute',1,1,1);
do $$ declare avant timestamptz; begin
 select debut into avant from passio_realtime_budget.compteurs;
 perform passio_realtime_budget.consommer('11111111-1111-4111-8111-111111111111',1,1);
 if (select debut from passio_realtime_budget.compteurs where fenetre=1)<>avant
 or (select effets from passio_realtime_budget.compteurs where fenetre=1)<>2 then raise exception 'fenetre retrograde'; end if;
end $$;

-- Un grand groupe ne diffuse toujours aucun accusé, mais l'avancée coûte un effet.
truncate passio_realtime_budget.compteurs;
insert into public.conv_members select 'grand','membre_'||i from generate_series(1,51) i;
insert into public.conv_members values('grand','11111111-1111-4111-8111-111111111111');
do $$ declare n bigint; begin
 select count(*) into n from realtime.trames;
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 set local role authenticated;
 insert into public.conv_reads(conv_id,user_id,last_read_at) values('grand',auth.uid()::text,clock_timestamp());
 reset role;
 if (select count(*) from realtime.trames)<>n or exists(select 1 from passio_realtime_budget.compteurs where effets<>1 or trames<>0 or octets<>0) then
  raise exception 'grand groupe hors budget'; end if;
end $$;

-- Aucun identifiant de profil effacé ne reste dans le compteur privé.
delete from public.profiles where id='11111111-1111-4111-8111-111111111111';
do $$ begin if exists(select 1 from passio_realtime_budget.compteurs where compte='11111111-1111-4111-8111-111111111111') then
 raise exception 'compteur orphelin'; end if; end $$;
select 'budgets, refus, payloads, roles, no-op, horloge et suppression' as controle,'OK' as resultat;
