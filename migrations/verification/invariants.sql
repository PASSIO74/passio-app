\set ON_ERROR_STOP off
\echo '── VOLUMES ─────────────────────────────────────────────────'
select (select count(*) from passion_universes)  as univers,
       (select count(*) from passions)           as passions,
       (select count(*) from passion_specialties) as specialites;

\echo '── LES 19 CANONIQUES SONT INTACTES ─────────────────────────'
select count(*) filter (where id in ('musique','photo','voyage','cuisine','sport','litterature',
  'cinema','tech','art','jardinage','metier','jeuxvideo','yoga','mode','danse','podcast',
  'moto','animaux','actu')) as canoniques_presentes,
  bool_and(universe_id is not null) as toutes_rattachees
from passions
where id in ('musique','photo','voyage','cuisine','sport','litterature','cinema','tech','art',
  'jardinage','metier','jeuxvideo','yoga','mode','danse','podcast','moto','animaux','actu');

\echo '── LE CONTENU D''AVANT EST INTACT ───────────────────────────'
select id, passion_id, specialty_id from posts order by id;
select count(*) as contenu_avec_specialite from posts where specialty_id is not null;

\echo '── AUCUN ORPHELIN EN BASE ──────────────────────────────────'
select count(*) as specialites_orphelines from passion_specialties s
  where not exists (select 1 from passions p where p.id = s.passion_id);
select count(*) as passions_orphelines from passions p
  where p.universe_id is not null and not exists (select 1 from passion_universes u where u.id = p.universe_id);

\echo '── ① une spécialité DE LA BONNE passion : ACCEPTÉE ─────────'
update posts set specialty_id = 'moto-enduro' where id = 'p_ancien_1';
select id, passion_id, specialty_id from posts where id = 'p_ancien_1';

\echo '── ② une spécialité D''UNE AUTRE passion : REFUSÉE ──────────'
update posts set specialty_id = 'cuisine-patisserie' where id = 'p_ancien_1';

\echo '── ③ une spécialité INVENTÉE : REFUSÉE ─────────────────────'
update posts set specialty_id = 'moto-nimportequoi' where id = 'p_ancien_1';

\echo '── ④ une spécialité SANS passion : REFUSÉE (check) ─────────'
insert into posts (id, author_id, content, passion_id, specialty_id)
  values ('p_x','u1','sans passion','moto-enduro'::text is null, 'moto-enduro');
insert into posts (id, author_id, content, passion_id, specialty_id)
  values ('p_x','u1','sans passion', null, 'moto-enduro');

\echo '── ⑤ une spécialité croisée sur EVENTS : REFUSÉE ───────────'
update events set specialty_id = 'cuisine-patisserie' where id = 'e_ancien';

\echo '── ⑥ un couple cohérent sur STORIES : ACCEPTÉ ──────────────'
update stories set specialty_id = 'cuisine-patisserie' where id = 's_ancien';
select id, passion_id, specialty_id from stories;

\echo '── RLS : le catalogue est-il verrouillé en écriture ? ──────'
select tablename, rowsecurity from pg_tables
 where schemaname='public' and tablename in
 ('passion_universes','passions','passion_specialties','user_passions',
  'user_passion_specialties','passion_requests') order by tablename;

\echo '── POLICIES ────────────────────────────────────────────────'
select tablename, cmd, count(*) from pg_policies
 where schemaname='public' and (tablename like 'passion%' or tablename like 'user_passion%')
 group by tablename, cmd order by tablename, cmd;
