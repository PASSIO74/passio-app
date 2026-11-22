// Preuve native, sans jeton : vrai edge-bundler et vrai Deno 2.9.8.
// L'archive est vérifiée par le workflow AVANT ce test. Aucun binaire de repli.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';

const binaireDemande = process.env.PASSIO_TEST_DENO_BIN;
const permis = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'CI', 'NODE_TEST_CONTEXT', 'NODE_TEST_WORKER_ID']);
for (const cle of Object.keys(process.env)) if (!permis.has(cle.toUpperCase())) delete process.env[cle];
process.env.DENO_NO_UPDATE_CHECK = '1'; process.env.DENO_NO_PROMPT = '1';
const racine = fileURLToPath(new URL('../../', import.meta.url));
const paquet = path.join(racine, '.github/netlify-cli/node_modules/@netlify/edge-bundler');
assert.ok(fs.existsSync(path.join(paquet, 'package.json')), 'DEPENDANCES_NETLIFY_ABSENTES');
assert.equal(JSON.parse(fs.readFileSync(path.join(paquet, 'package.json'), 'utf8')).version, '16.2.0');

function verifierVersion(sortie) {
  assert.match(sortie, /^deno 2\.9\.8(?:\s|$)/, 'DENO_VERSION_REFUSEE');
}
function preflightDeno(binaire) {
  assert.ok(typeof binaire === 'string' && path.isAbsolute(binaire) && fs.existsSync(binaire), 'DENO_ABSENT : PASSIO_TEST_DENO_BIN absolu requis');
  const r = spawnSync(binaire, ['--version'], { env: { ...process.env }, encoding: 'utf8', shell: false, timeout: 10000 });
  assert.equal(r.error, undefined, 'DENO_EXECUTION_REFUSEE'); assert.equal(r.status, 0, 'DENO_EXECUTION_REFUSEE');
  verifierVersion(r.stdout); return fs.realpathSync(binaire);
}
const deno = preflightDeno(binaireDemande);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const nodeFetches = [];
globalThis.fetch = async input => { nodeFetches.push(String(input)); throw new Error('RESEAU_NODE_REFUSE_BANC_EDGE'); };
net.Socket.prototype.connect = () => { throw new Error('RESEAU_NODE_REFUSE_BANC_EDGE'); };
syncBuiltinESMExports();

test('Deno absent ou mauvaise version : refus explicite, aucun téléchargement', () => {
  assert.throws(() => preflightDeno(undefined), /DENO_ABSENT/);
  assert.throws(() => preflightDeno(path.join(racine, 'work/binaire-deno-inexistant')), /DENO_ABSENT/);
  assert.throws(() => verifierVersion('deno 2.9.7 (stable)'), /DENO_VERSION_REFUSEE/);
});

async function fichiers(dossier, prefixe = '') {
  const resultat = [];
  for (const entree of await fsp.readdir(dossier, { withFileTypes: true })) {
    assert.equal(entree.isSymbolicLink(), false, 'SOURCE_SYMBOLIQUE_REFUSEE');
    const relatif = prefixe + entree.name;
    if (entree.isDirectory()) resultat.push(...await fichiers(path.join(dossier, entree.name), relatif + '/'));
    else { assert.equal(entree.isFile(), true); resultat.push(relatif); }
  }
  return resultat.sort();
}

test('bundle natif des quatre Edge canonicales, manifeste et sources ESZIP vérifiés', { timeout: 120000 }, async () => {
  const temporaire = await fsp.mkdtemp(path.join(os.tmpdir(), 'passio-edge-native-'));
  const ancienEnv = { ...process.env };
  let restaurerPont;
  try {
    // HOME/cache/collecteurs restent dans une fixture neuve ; aucune configuration du poste.
    for (const cle of ['HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'TEMP', 'TMP', 'TMPDIR', 'XDG_DATA_HOME', 'DENO_DIR']) process.env[cle] = temporaire;
    process.env.PATH = path.dirname(deno) + path.delimiter + (ancienEnv.PATH || ancienEnv.Path || '');
    const cache = path.join(temporaire, 'cache'), dist = path.join(temporaire, 'dist');
    await fsp.mkdir(dist); await fsp.mkdir(cache);
    const attendus = {};
    for (const dossier of ['netlify/edge-functions', 'netlify/lib']) {
      for (const nom of await fichiers(path.join(racine, dossier))) {
        const relatif = dossier + '/' + nom, contenu = await fsp.readFile(path.join(racine, relatif));
        const destination = path.join(temporaire, relatif); await fsp.mkdir(path.dirname(destination), { recursive: true }); await fsp.writeFile(destination, contenu);
        assert.equal(hash(await fsp.readFile(destination)), hash(contenu)); attendus[relatif] = hash(contenu);
      }
    }
    assert.deepEqual(Object.keys(attendus).filter(p => p.startsWith('netlify/edge-functions/')).sort(), ['netlify/edge-functions/apercu.js', 'netlify/edge-functions/demo.js', 'netlify/edge-functions/media.js', 'netlify/edge-functions/private-media.js']);
    const { DenoBridge } = await import(pathToFileURL(path.join(paquet, 'dist/node/bridge.js')).href);
    const executer = DenoBridge.runWithBinary, commandes = [];
    const drapeaux = ['--no-remote', '--no-npm', '--no-prompt', '--allow-import=edge.netlify.com:443', '--deny-net', '--deny-run', '--deny-ffi', `--allow-read=${temporaire},${paquet}`, `--allow-write=${temporaire}`, '--allow-env'];
    // Le pont exécute le VRAI binaire validé ; seuls ses droits sont réduits.
    // Ce n'est ni un faux Deno ni une preuve de confinement Node/OS général.
    DenoBridge.runWithBinary = (binaire, args, options) => {
      assert.ok(binaire === 'deno' || binaire === deno, 'BINAIRE_DENO_NON_EPINGLE');
      assert.equal(args[0], 'run', 'COMMANDE_DENO_NON_PREVUE');
      const sansPermissions = args.slice(1).filter(a => a !== '--allow-all' && a !== '-A' && !a.startsWith('--allow-'));
      const extraction = args.includes(path.join(paquet, 'deno/config.ts'));
      // Les types du bootstrap officiel sont requis même pour un import type.
      // Seules ces quatre commandes peuvent résoudre edge.netlify.com:443 ;
      // leurs fetch applicatifs, sous-processus et FFI restent refusés.
      const permissions = extraction ? drapeaux.filter(a => a !== '--no-remote') : drapeaux;
      const gardes = ['run', ...permissions, ...sansPermissions]; commandes.push(gardes);
      return executer(deno, gardes, { ...options, pipeOutput: false, options: { ...options.options, env: { ...process.env }, extendEnv: false, timeout: 60000 } }).then(r => {
        const erreur = String(r.stderr || '').replace(/file:\/\/[^\s]+/g, 'FICHIER').slice(0, 600);
        assert.equal(r.exitCode, 0, 'EXTRACTION_DENO_REFUSEE ' + erreur); return r;
      });
    };
    restaurerPont = () => { DenoBridge.runWithBinary = executer; };
    const { bundle } = await import(pathToFileURL(path.join(paquet, 'dist/node/bundler.js')).href);
    let telechargements = 0;
    const resultat = await bundle([path.join(temporaire, 'netlify/edge-functions')], dist, [], {
      basePath: temporaire, rootPath: temporaire, cacheDirectory: cache,
      onBeforeDownload: () => { telechargements++; throw new Error('TELECHARGEMENT_DENO_REFUSE'); },
      userLogger: () => {}, systemLogger: () => {},
    });
    assert.equal(telechargements, 0);
    assert.deepEqual(resultat.functions.map(f => f.name).sort(), ['apercu', 'demo', 'media', 'private-media']);
    assert.equal(commandes.length, 5, 'ESZIP_ET_QUATRE_EXTRACTIONS_REELLES_REQUISES');
    assert.deepEqual(nodeFetches, ['https://edge.netlify.com/version.txt'], 'SEUL_CHECK_TYPES_OPTIONNEL_REFUSE');
    const manifeste = JSON.parse(await fsp.readFile(path.join(dist, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifeste, resultat.manifest); assert.equal(manifeste.bundler_version, '16.2.0');
    assert.deepEqual(manifeste.routes.map(r => [r.function, r.path]).sort(), [['apercu', '/e/*'], ['apercu', '/p/*'], ['apercu', '/u/*'], ['private-media', '/private-media/*']]);
    assert.deepEqual(manifeste.post_cache_routes.map(r => [r.function, r.path]).sort(), [['demo', '/demo/*'], ['media', '/media/*']]);
    assert.equal(manifeste.bundles.length, 1);
    const asset = manifeste.bundles[0]; assert.equal(asset.format, 'eszip2'); assert.match(asset.asset, /^[a-f0-9]{64}\.eszip$/);
    const fichierESZIP = path.join(dist, asset.asset), contenuESZIP = await fsp.readFile(fichierESZIP);
    assert.equal(contenuESZIP.subarray(0, 8).toString(), 'ESZIP_V2'); assert.equal(hash(contenuESZIP), asset.asset.slice(0, 64));
    assert.deepEqual((await fsp.readdir(dist)).sort(), [asset.asset, 'manifest.json'].sort());
    // Parser ESZIP du paquet installé : vérifier les sources embarquées, sans exécuter les handlers.
    const inspecteur = path.join(temporaire, 'inspecter.ts');
    const moduleESZIP = pathToFileURL(path.join(paquet, 'deno/vendor/deno.land/x/eszip@v0.55.2/mod.ts')).href;
    await fsp.writeFile(inspecteur, `import { Parser } from ${JSON.stringify(moduleESZIP)};\nconst p=await Parser.createInstance();const noms=await p.parseBytes(await Deno.readFile(Deno.args[0]));await p.load();const out={};for(const n of noms){if(n.startsWith('file:///root/netlify/')){const texte=await p.getModuleSource(n);const bytes=new TextEncoder().encode(texte);out[n.slice('file:///root/'.length)]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');}}console.log(JSON.stringify(out));\n`);
    const analyse = spawnSync(deno, ['run', ...drapeaux, '--no-config', `--import-map=${path.join(paquet, 'deno/vendor/import_map.json')}`, inspecteur, fichierESZIP], { env: { ...process.env }, encoding: 'utf8', shell: false, timeout: 60000 });
    assert.equal(analyse.error, undefined); assert.equal(analyse.status, 0, analyse.stderr);
    assert.deepEqual(JSON.parse(analyse.stdout), attendus, 'SOURCES_CANONIQUES_REQUISES_DANS_ESZIP');
    const distants = (await fichiers(temporaire)).filter(p => p.startsWith('remote/'));
    assert.equal(distants.length, 1, 'UN_SEUL_BOOTSTRAP_DISTANT_ATTENDU');
    assert.match(distants[0], /^remote\/https\/edge\.netlify\.com\/[a-f0-9]+$/);
    const bootstrap = await fsp.readFile(path.join(temporaire, distants[0]));
    assert.equal(hash(bootstrap.subarray(0, 670)), 'eaa6148ded3121d8dee62dd91c86e7fe76601df0f3ca8d7962243a30f4c8935f', 'BOOTSTRAP_OFFICIEL_MODIFIE');
    const metadonneesCache = /^\s*\/\/ denoCacheMetadata=(\{[\s\S]*\})\s*$/.exec(bootstrap.subarray(670).toString());
    assert.ok(metadonneesCache, 'CORPS_BOOTSTRAP_DOIT_FAIRE_EXACTEMENT_670_OCTETS');
    assert.equal(JSON.parse(metadonneesCache[1]).url, 'https://edge.netlify.com/bootstrap/globals/types.ts');
    // Les droits réseau/runtime sont réellement refusés par Deno, sans paquet distant.
    const sonde = path.join(temporaire, 'permissions.ts');
    await fsp.writeFile(sonde, "for(const name of ['net','run','ffi']){if((await Deno.permissions.query({name})).state!=='denied')Deno.exit(9);}try{await fetch('https://example.invalid/');Deno.exit(10);}catch(e){if(!(e instanceof Deno.errors.NotCapable))throw e;}\n");
    const refus = spawnSync(deno, ['run', ...drapeaux, '--no-config', sonde], { env: { ...process.env }, encoding: 'utf8', shell: false, timeout: 10000 });
    assert.equal(refus.error, undefined); assert.equal(refus.status, 0, 'PERMISSIONS_DENO_NON_REFUSEES');
  } finally {
    restaurerPont?.();
    for (const cle of Object.keys(process.env)) delete process.env[cle]; Object.assign(process.env, ancienEnv);
    await fsp.rm(temporaire, { recursive: true, force: true });
  }
});
