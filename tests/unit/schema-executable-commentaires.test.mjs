import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require = createRequire(import.meta.url);
const {ETAPES} = require('../../scripts/schema-executable.js');
const commentaires = () => {
  const e = ETAPES.find(e => e.titre === 'Commentaires des tables');
  assert.ok(e, 'les marqueurs de propriété des tables doivent être exportés');
  return e;
};

test('REPRISE-GO : les COMMENT des tables applicatives sont lus après leur création', () => {
  const e = commentaires();
  assert.match(e.sql, /obj_description\(c\.oid,\s*'pg_class'\)/);
  assert.match(e.sql, /c\.relnamespace in \(/);
  for (const schema of ['public', 'rencontres_prive', 'passio_realtime_budget']) assert.ok(e.sql.includes(schema));
  assert.ok(ETAPES.indexOf(e) > ETAPES.findIndex(e => e.titre === 'Tables et colonnes'));
});

test('REPRISE-GO : les fonctions précèdent leurs CHECK et index et suivent toutes les tables', () => {
  const i=ETAPES.findIndex(e => e.titre.startsWith('Fonctions ('));
  assert.ok(i>ETAPES.findIndex(e => e.titre==='Tables et colonnes'));
  assert.ok(i<ETAPES.findIndex(e => e.titre==='Clés primaires, uniques, CHECK et étrangères'));
  assert.ok(i<ETAPES.findIndex(e => e.titre.startsWith('Index (')));
});

test('REPRISE-GO : rendu COMMENT stable, strictement échappé et couvert par le hash DDL', () => {
  const e = commentaires();
  const rows = ['media_reservations', 'media_assets', 'media_objects'].map(tbl => ({sch:'public', tbl,
    commentaire: "PASSIO protected-media v1 2026-11-16"}));
  const ddl = e.rendu(rows).join('\n');
  assert.equal(ddl, e.rendu([...rows].reverse()).join('\n'));
  assert.equal((ddl.match(/comment on table /g) || []).length, 3);
  const hostile = "marqueur'\\'; drop table public.profiles; --\n$r$\né";
  assert.equal(e.rendu([{sch:'rencontres_prive',tbl:'a"b',commentaire:hostile}])[0],
    `comment on table "rencontres_prive"."a""b" is E'${hostile.replace(/\\/g,'\\\\').replace(/'/g,"''")}';`);
  assert.equal(e.rendu([{sch:'public',tbl:'sans_marqueur',commentaire:null}])[0],
    'comment on table "public"."sans_marqueur" is NULL;');
  for (const commentaire of [undefined, 1, 'nul\0interdit']) {
    assert.throws(() => e.rendu([{sch:'public',tbl:'t',commentaire}]));
  }
  const hash = s => createHash('sha256').update(s).digest('hex');
  assert.notEqual(hash(ddl), hash(e.rendu(rows.map(r => ({...r,commentaire:null}))).join('\n')));
});
