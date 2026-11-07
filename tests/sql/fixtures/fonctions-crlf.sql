-- Rend sur le banc les fins de ligne Windows que la production porte, sur les fonctions que les lots réécrivent par motif.
do $d$
declare r record; src text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('notifier_mentions','creer_passion','trg_reports_pretri','notes_evenement','participants_compte','pointer_par_code','rechercher_passions','fil_compteurs','post_is_visible','sync_profil_passions')
  loop
    select pg_get_functiondef(r.oid) into src;
    execute replace(replace(src, E'\r\n', E'\n'), E'\n', E'\r\n');
  end loop;
end $d$;
select 'fonctions en CRLF', count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and position(chr(13) in p.prosrc) > 0 and p.proname in ('notifier_mentions','creer_passion','trg_reports_pretri','notes_evenement','participants_compte','pointer_par_code','rechercher_passions','fil_compteurs','post_is_visible','sync_profil_passions');
