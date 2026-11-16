import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {ETAPES, metadataSeaux} = require('../../scripts/schema-executable.js');
const R = require('../../scripts/restaurer-donnees.js');
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const seaux = ETAPES.find(e => e.titre === 'Seaux de stockage');

test('REPRISE-GO : le catalogue des seaux lit la contrainte MIME réelle', () => {
  assert.match(seaux.sql, /\ballowed_mime_types\b/);
});

test('REPRISE-GO : NULL et liste vide MIME restent deux états explicites différents', () => {
  const b = {id: 'attachments', name: 'attachments', public: false, file_size_limit: null};
  const nul = seaux.rendu([{...b, allowed_mime_types: null}]).join('\n');
  const vide = seaux.rendu([{...b, allowed_mime_types: []}]).join('\n');
  assert.notEqual(nul, vide);
  assert.ok(vide.includes('array[]::text[]'));
  for (const allowed_mime_types of [undefined, 'image/png', ['image/png\');select 1;--']]) {
    assert.throws(() => metadataSeaux({version: 1, seaux: [{...b, allowed_mime_types}]}));
  }
});

test('REPRISE-GO : métadonnée stricte, liée au manifeste et vérifiée avant mutation', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'reprise-seaux-'));
  const b = {id: 'content', name: 'content', public: true, file_size_limit: 27262976, allowed_mime_types: ['image/png']};
  const ddl = 'begin;\n' + seaux.rendu([b]).join('\n') + '\ncommit;\n';
  const ctx = {archive: dossier, man: {tables: {}, schema_sha256: createHash('sha256').update(ddl).digest('hex')}};
  try {
    writeFileSync(join(dossier, 'schema.sql'), ddl.replaceAll('\n', '\r\n'));
    assert.equal(R._phases.lireSeauxArchive(ctx).ok, true, 'le hash a la convention LF existante');
    const marker = ddl.split('\n').find(l => l.startsWith('-- PASSIO_SEAUX_V1 '));
    const double = ddl + marker + '\n';
    writeFileSync(join(dossier, 'schema.sql'), double);
    ctx.man.schema_sha256 = createHash('sha256').update(double).digest('hex');
    assert.equal(R._phases.lireSeauxArchive(ctx).etat, 'METADATA_INVALIDES');
    const futur = ddl.replace('"version":1', '"version":999');
    writeFileSync(join(dossier, 'schema.sql'), futur);
    ctx.man.schema_sha256 = createHash('sha256').update(futur).digest('hex');
    assert.equal(R._phases.lireSeauxArchive(ctx).etat, 'METADATA_INVALIDES');
    ctx.man.schema_sha256 = createHash('sha256').update(ddl).digest('hex');
    writeFileSync(join(dossier, 'schema.sql'), ddl + '-- altéré\n');
    assert.equal(R._phases.validerArchive(ctx).indetermine, false, 'une altération connue n’est pas legacy');
    assert.equal(R._phases.validerArchive(ctx).ok, false);
    writeFileSync(join(dossier, 'schema.sql'), 'begin;\ncommit;\n');
    delete ctx.man.schema_sha256;
    const historique = R._phases.validerArchive(ctx);
    assert.equal(historique.ok, false);
    assert.equal(historique.indetermine, true);
    assert.equal(R._phases.lireSeauxArchive(ctx).etat, 'INCONNU');
  } finally { rmSync(dossier, {recursive: true, force: true}); }
});

test('REPRISE-GO : ordre des MIME sans effet, dérives public/limite/MIME et panne de lecture échouent', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'reprise-seaux-'));
  const b = {id: 'content', name: 'content', public: true, file_size_limit: 27262976, allowed_mime_types: ['image/png', 'video/mp4']};
  const ddl = 'begin;\n' + seaux.rendu([b]).join('\n') + '\ncommit;\n';
  const ctx = {archive: dossier, ref: 'dddddddddddddddddddd', jeton: 'sbp_factice',
    man: {schema_sha256: createHash('sha256').update(ddl).digest('hex')}};
  const vraiFetch = globalThis.fetch;
  writeFileSync(join(dossier, 'schema.sql'), ddl);
  try {
    for (const changement of [{allowed_mime_types: ['video/mp4','image/png']}, {public: false}, {file_size_limit: null}, {allowed_mime_types: null}]) {
      globalThis.fetch = async () => new Response(JSON.stringify([{...b, ...changement}]), {status: 200});
      const v = await R._phases.verifierSeaux(ctx);
      assert.equal(v.ok, Array.isArray(changement.allowed_mime_types));
    }
    globalThis.fetch = async () => new Response('{}', {status: 503});
    const indisponible = await R._phases.verifierSeaux(ctx);
    assert.equal(indisponible.ok, false);
    assert.equal(indisponible.etat, 'CIBLE_NON_LUE');
  } finally { globalThis.fetch = vraiFetch; rmSync(dossier, {recursive: true, force: true}); }
});

test('REPRISE-GO : le mode legacy explicite ne couvre pas une corruption connue', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'reprise-seaux-'));
  const ctx = {archive: dossier, man: {tables: {}}};
  writeFileSync(join(dossier, 'schema.sql'), 'begin;\ncommit;\n');
  try {
    assert.equal(await R._phases.seauxAvantChargement(ctx), false);
    process.argv.push('--accepter-archive-non-verifiable');
    try {
      assert.equal(await R._phases.seauxAvantChargement(ctx), true, 'possibilité existante préservée, preuve toujours indéterminée');
      assert.equal(ctx.bilan.phases.contraintes_seaux.ok, false);
      ctx.man.schema_sha256 = '0'.repeat(64);
      assert.equal(await R._phases.seauxAvantChargement(ctx), false, 'le même flag ne transforme pas une corruption en legacy');
    } finally { process.argv.splice(process.argv.indexOf('--accepter-archive-non-verifiable'), 1); }
  } finally { rmSync(dossier, {recursive: true, force: true}); }
});

test('REPRISE-GO : le DDL du seau conserve sa liste MIME, pas une cible ouverte par défaut', () => {
  const ddl = seaux.rendu([{id: 'content', name: 'content', public: true,
    file_size_limit: 27262976, allowed_mime_types: ['image/png', 'video/mp4']}]).join('\n');
  assert.match(ddl, /\ballowed_mime_types\b/);
  assert.ok(ddl.includes('image/png'));
  assert.ok(ddl.includes('video/mp4'));
});
