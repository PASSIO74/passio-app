-- Fixtures exclusivement synthetiques ; aucun service Storage ni octet utilisateur.
create schema banc_heritage;
grant usage on schema banc_heritage to anon,authenticated,service_role;
create table banc_heritage.resultats(n serial,cas text not null,ok boolean not null,obtenu text,attendu text);
create function banc_heritage.uid(i integer) returns text language sql immutable as $$select '00000000-0000-4000-8000-'||lpad(i::text,12,'0')$$;
create function banc_heritage.cas(p_cas text,p_obtenu text,p_attendu text) returns void language sql as $$
 insert into banc_heritage.resultats(cas,ok,obtenu,attendu) values(p_cas,p_obtenu is not distinct from p_attendu,p_obtenu,p_attendu)$$;
create function banc_heritage.sous(p_role text,p_uid integer,p_sql text,p_valeur boolean default false,p_message boolean default false) returns text
language plpgsql security invoker as $$
declare n bigint; resultat text;
begin
 if p_role not in('authenticated','anon','service_role','postgres') then raise exception 'fixture_role_refused'; end if;
 perform set_config('request.jwt.claims',case when p_uid is null then '{}' else jsonb_build_object('sub',banc_heritage.uid(p_uid),'role',p_role,
   'session_id','10000000-0000-4000-8000-'||lpad(p_uid::text,12,'0'))::text end,true);
 execute format('set local role %I',p_role);
 if p_valeur then execute p_sql into resultat; else execute p_sql; get diagnostics n=row_count;resultat:='ok:'||n;end if;
 reset role;return resultat;
exception when others then reset role;return 'err:'||sqlstate||case when p_message then ':'||sqlerrm else '' end;
end$$;
create function banc_heritage.url(p_prefixe text,p_fichier text default 'image.webp') returns text language sql immutable as $$
 select 'https://njkiyoklssvefstljemx.supabase.co/storage/v1/object/public/content/'||p_prefixe||'/'||banc_heritage.uid(1)||'/'||p_fichier$$;

select banc_heritage.cas('rouge avant fence upload personnel accepte',banc_heritage.sous('authenticated',1,format(
 'insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values(''content'',%L,%L::uuid,%L,''{"size":8,"mimetype":"image/webp"}'')',
 'photos/'||banc_heritage.uid(1)||'/ancien.webp',banc_heritage.uid(1),banc_heritage.uid(1))),'ok:1');
insert into public.posts(id,author_id,content,media_url,shared_data,overlays) values('heritage_ancien',banc_heritage.uid(1),'texte initial',
 banc_heritage.url('photos'),jsonb_build_object('media',banc_heritage.url('photos'))::text,jsonb_build_array(jsonb_build_object('type','gif','url',banc_heritage.url('photos'))));
insert into public.stories(id,author_id,content,media_url) values('heritage_story_ancienne',banc_heritage.uid(1),'texte initial',banc_heritage.url('videos'));
insert into public.conversations(id,created_by) values('heritage_conversation',banc_heritage.uid(1));
insert into public.conv_members(conv_id,user_id) values('heritage_conversation',banc_heritage.uid(1));
insert into storage.objects(bucket_id,name,owner,owner_id,metadata) values('content','photos/'||banc_heritage.uid(2)||'/tiers-ancien.webp',banc_heritage.uid(2)::uuid,banc_heritage.uid(2),'{"size":8}');
select banc_heritage.cas('baseline story UPDATE client reste zero',banc_heritage.sous('authenticated',1,'update public.stories set content=''baseline'' where id=''heritage_story_ancienne'''),'ok:0');
select banc_heritage.cas('baseline CHECK relatif ferme',banc_heritage.sous('authenticated',1,format('insert into public.posts(id,author_id,media_url) values(''heritage_check_baseline'',%L,''/media/content/photos/u/a.webp'')',banc_heritage.uid(1))),'err:23514');
