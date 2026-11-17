import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import MP from '../../scripts/lib/reprise-medias-proteges.js';

const [psql, socket] = process.argv.slice(2);
assert.match(socket || '', /^\/tmp\/passio-reprise-medias\.[a-zA-Z0-9]{8}$/);
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PG/i.test(k)));
function sql(query) {
  return execFileSync(psql, ['-X', '-w', '-h', socket, '-p', '5432', '-U', 'postgres', '-d', 'postgres', '-qtA', '-v', 'ON_ERROR_STOP=1'], {
    input: query, encoding: 'utf8', env,
  }).trim();
}
const uuid = n => '11111111-1111-4111-8111-' + String(n).padStart(12, '0');
const [source, cible, utilisateur, asset] = [1, 2, 3, 4].map(uuid);
const cle = utilisateur + '/' + asset + '/original.webp', md5 = 'a'.repeat(32);
const ligne = { source, asset_id: asset, variant: 'original', object_key: cle, byte_size: 3,
  mime_type: 'image/webp', owner: null, owner_id: utilisateur, asset_owner: utilisateur, md5 };
const plan = new Map([['content-protected/' + cle, ligne]]);
sql(`create schema storage;
  create table storage.buckets(id text primary key,public boolean);
  create table storage.objects(id uuid primary key,bucket_id text,name text,owner uuid,owner_id text,metadata jsonb,archived_at timestamptz,is_delete_marker boolean);
  create table public.media_assets(id uuid primary key,owner_id text);
  create table public.media_reservations(id uuid primary key);
  create table public.media_objects(asset_id uuid,variant text,object_key text,bucket_id text,storage_object_id uuid unique,mime_type text,byte_size bigint,primary key(asset_id,variant));
  comment on table public.media_assets is 'PASSIO protected-media v1 2026-11-16';
  comment on table public.media_objects is 'PASSIO protected-media v1 2026-11-16';
  comment on table public.media_reservations is 'PASSIO protected-media v1 2026-11-16';
  insert into storage.buckets values ('content-protected',false);
  insert into storage.objects values ('${cible}','content-protected','${cle}',null,'${utilisateur}','{"mimetype":"image/webp","size":3,"eTag":"${md5}"}',null,false);
  insert into public.media_assets values ('${asset}','${utilisateur}');
  insert into public.media_objects values ('${asset}','original','${cle}','content-protected','${source}','image/webp',3);`);

function executer(ecrire, lot = plan, physiques) {
  return MP.rapprocher(lot, async (query, [json]) => {
    // Exécuter la requête paramétrée de production, y compris sa mise à jour. La
    // connexion ferme à chaque commande ; le mode vérification refuse tout DML.
    const rows = sql(`begin ${ecrire ? '' : 'read only'}; prepare rapprochement(jsonb) as ${query};
      execute rapprochement('${json.replaceAll("'", "''")}'); commit;`);
    return rows ? rows.split('\n').map(row => {
      const [source, cible, inscrit] = row.split('|');
      return { source, cible, inscrit };
    }) : [];
  }, ecrire, physiques);
}
const inscrit = () => sql('select storage_object_id from public.media_objects;');
await assert.rejects(executer(false), /identite_cible/);
assert.equal(inscrit(), source);
const incomplet = new Map(plan);
incomplet.set('absent', { ...ligne, source: uuid(8), asset_id: uuid(9), object_key: 'absent' });
await assert.rejects(executer(true, incomplet), /preuve_cible/);
assert.equal(inscrit(), source);
for (const [table, invalider, retablir] of [
  ['storage.objects', "metadata=metadata-'eTag'", `metadata=metadata||'{"eTag":"${md5}"}'`],
  ['storage.objects', "metadata=metadata||'{\"mimetype\":\"image/png\"}'", "metadata=metadata||'{\"mimetype\":\"image/webp\"}'"],
  ['storage.objects', "metadata=metadata||'{\"size\":4}'", "metadata=metadata||'{\"size\":3}'"],
  ['storage.objects', `owner_id='${uuid(5)}'`, `owner_id='${utilisateur}'`],
  ['storage.objects', 'is_delete_marker=true', 'is_delete_marker=false'],
  ['storage.buckets', 'public=true', 'public=false'],
  ['public.media_assets', `owner_id='${uuid(5)}'`, `owner_id='${utilisateur}'`],
]) {
  sql(`update ${table} set ${invalider};`);
  await assert.rejects(executer(true), /preuve_cible/);
  assert.equal(inscrit(), source);
  sql(`update ${table} set ${retablir};`);
}
sql(`insert into storage.objects select '${uuid(6)}',bucket_id,name,owner,owner_id,metadata,archived_at,is_delete_marker from storage.objects;`);
await assert.rejects(executer(true), /preuve_cible/);
assert.equal(inscrit(), source);
sql(`delete from storage.objects where id='${uuid(6)}';`);
sql(`insert into storage.objects select '${source}',bucket_id,'autre',owner,owner_id,metadata,archived_at,is_delete_marker from storage.objects;`);
await assert.rejects(executer(true), /preuve_cible/);
assert.equal(inscrit(), source);
sql(`delete from storage.objects where id='${source}';`);
assert.equal((await executer(true)).get(source), cible);
assert.equal(inscrit(), cible);
assert.equal((await executer(true)).get(source), cible);
assert.equal((await executer(false)).get(source), cible);
sql("update storage.objects set metadata=metadata-'eTag';");
const version = sql("select 'tuple:'||xmin::text from storage.objects;");
function empreinte(id, version, md5, etag = null) {
  return new Map([['content-protected/' + cle, { id, version, md5, etag }]]);
}
await assert.rejects(executer(false), /preuve_cible/);
await assert.rejects(executer(false, plan, empreinte(cible, version, 'b'.repeat(32))), /preuve_cible/);
await assert.rejects(executer(false, plan, empreinte(cible, 'version-anterieure', md5)), /preuve_cible/);
await assert.rejects(executer(false, plan, empreinte(source, version, md5)), /preuve_cible/);
assert.equal((await executer(false, plan, empreinte(cible, version, md5))).get(source), cible);
sql(`update public.media_objects set storage_object_id='${source}';`);
assert.equal((await executer(true, plan, empreinte(cible, version, md5))).get(source), cible);
sql("alter table storage.objects add column version text; update storage.objects set version='v1';");
sql(`update storage.objects set metadata=metadata||'{"eTag":"ancien-2"}';`);
const ancienne = empreinte(cible, 'v1', md5, 'ancien-2');
assert.equal((await executer(false, plan, ancienne)).get(source), cible);
sql(`update storage.objects set metadata=metadata||'{"eTag":"nouveau-2"}';`);
await assert.rejects(executer(false, plan, ancienne), /preuve_cible/);
sql(`update public.media_objects set storage_object_id='${source}';`);
await assert.rejects(executer(true, plan, ancienne), /preuve_cible/);
assert.equal(inscrit(), source);
console.log('OK rapprochement, refus, rejeu et vérification PostgreSQL en lecture seule');
