// Intégration explicite : npm ci --ignore-scripts --prefix .github/netlify-cli requis.
// Fixtures synthétiques, sans SDK produit, secret, déploiement ou réseau.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';

const permis = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'CI', 'NODE_TEST_CONTEXT', 'NODE_TEST_WORKER_ID']);
for (const cle of Object.keys(process.env)) if (!permis.has(cle.toUpperCase())) delete process.env[cle];
const interdit = () => { throw new Error('RESEAU_INTERDIT_BANC_NETLIFY'); };
globalThis.fetch = interdit; net.Socket.prototype.connect = interdit; syncBuiltinESMExports();
const racine = fileURLToPath(new URL('../../', import.meta.url));
const paquets = path.join(racine, '.github/netlify-cli/node_modules');
const req = createRequire(path.join(paquets, '../package.json'));
assert.ok(fs.existsSync(path.join(paquets, 'netlify-cli/package.json')), 'DEPENDANCES_NETLIFY_ABSENTES : npm ci --ignore-scripts --prefix .github/netlify-cli');
const charger = relatif => import(pathToFileURL(path.join(paquets, relatif)).href);
const lire = relatif => fs.readFileSync(path.join(paquets, relatif), 'utf8');
const depuis = nom => createRequire(path.join(paquets, nom, 'package.json'));
function version(r, nom) {
  try { return r(`${nom}/package.json`).version; }
  catch (e) { if (e.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw e; }
  // Certains paquets n'exportent pas leur package.json ; suivre leur résolution réelle.
  let dossier = path.dirname(r.resolve(nom));
  while (dossier !== path.dirname(dossier)) {
    const fichier = path.join(dossier, 'package.json');
    if (fs.existsSync(fichier)) { const p = JSON.parse(fs.readFileSync(fichier, 'utf8')); if (p.name === nom) return p.version; }
    dossier = path.dirname(dossier);
  }
  throw new Error('METADONNEES_PAQUET_ABSENTES');
}
const slash = p => p.split(path.sep).join('/');
const tris = xs => [...xs].map(slash).sort();
const parentsMinimatch = ['@netlify/build', '@netlify/build-info', '@netlify/zip-it-and-ship-it', '@typescript-eslint/typescript-estree', 'readdir-glob'];
async function fixture(fichiers, action) {
  const dossier = await fsp.mkdtemp(path.join(os.tmpdir(), 'passio-netlify-compat-'));
  try {
    for (const [nom, contenu] of Object.entries(fichiers)) {
      const fichier = path.join(dossier, nom); await fsp.mkdir(path.dirname(fichier), { recursive: true }); await fsp.writeFile(fichier, contenu);
    }
    return await action(dossier);
  } finally { await fsp.rm(dossier, { recursive: true, force: true }); }
}

test('résolutions corrigées exactes, sans abaisser les copies déjà saines', () => {
  for (const nom of parentsMinimatch) assert.equal(version(depuis(nom), 'minimatch'), '11.0.1', nom);
  assert.equal(version(depuis('@vercel/nft'), 'glob'), '14.0.2');
  assert.equal(version(req, 'glob'), '14.0.4');
  assert.equal(version(depuis('glob'), 'minimatch'), '11.0.5');
  assert.equal(version(req, 'netlify-cli'), '27.16.2');
});

test('consommateurs directs inventoriés, APIs supprimées non employées', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(paquets, '../package-lock.json'), 'utf8'));
  const parents = Object.entries(lock.packages).filter(([p, x]) => p && x.dependencies?.minimatch && !p.endsWith('/glob')).map(([p]) => p.replace(/^node_modules\//, '')).sort();
  assert.deepEqual(parents, [...parentsMinimatch].sort());
  const parentsGlob = Object.entries(lock.packages).filter(([p, x]) => p && x.dependencies?.glob).map(([p]) => p.replace(/^node_modules\//, '')).sort();
  assert.deepEqual(parentsGlob, ['@fastify/static', '@vercel/nft']);
  const sources = ['@netlify/build/lib/plugins_core/secrets_scanning/utils.js', '@netlify/build-info/lib/workspaces/get-workspace-packages.js', '@netlify/zip-it-and-ship-it/dist/utils/matching.js', '@typescript-eslint/typescript-estree/dist/useProgramFromProjectService.js', 'readdir-glob/dist/index.js'];
  for (const source of sources) assert.equal(/\.makeRe\(|\.matchOne\(|\.slashSplit\(|\.levelTwoFileOptimize\(|\.regexp\b|\.AST\b/.test(lire(source)), false, source);
  assert.match(lire('@netlify/build-info/lib/workspaces/get-workspace-packages.js'), /\.globParts\[0\]/);
  const nft = lire('@vercel/nft/out/analyze.js');
  assert.equal((nft.match(/glob_1\.glob\)\(/g) || []).length, 2);
  assert.doesNotMatch(nft, /glob_1\.(?:GlobWalker|Pattern|Processor)/);
});

test('engines des paquets corrigés et de la CLI acceptent le runtime du banc', () => {
  for (const [r, nom] of [[depuis('@vercel/nft'), 'glob'], [depuis('@netlify/build'), 'minimatch'], [req, 'netlify-cli']]) {
    const p = r(`${nom}/package.json`);
    assert.equal(req('semver').satisfies(process.version, p.engines.node), true, nom);
    assert.equal(req('semver').satisfies('22.23.5', p.engines.node), true, nom);
  }
});

test('le même banc échoue explicitement si les dépendances sont absentes', async () => {
  await fixture({}, async dossier => {
    const copie = path.join(dossier, 'tests/integration/compat.test.mjs');
    await fsp.mkdir(path.dirname(copie), { recursive: true });
    await fsp.copyFile(fileURLToPath(import.meta.url), copie);
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; delete env.NODE_TEST_WORKER_ID;
    const r = spawnSync(process.execPath, ['--test', copie], { env, encoding: 'utf8', shell: false, timeout: 15000 });
    assert.equal(r.error, undefined); assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /DEPENDANCES_NETLIFY_ABSENTES/);
  });
});

const cas = [
  ['a/x.js', '**/*.js', {}, true], ['a/x.txt', '**/*.js', {}, false],
  ['a/.x.js', '**/*.js', {}, false], ['a/.x.js', '**/*.js', { dot: true }, true],
  ['a/x.js', 'a/*.{js,ts}', {}, true], ['a/x.ts', 'a/@(x|y).ts', {}, true],
  ['a/b/x.js', '*.js', { matchBase: true }, true], ['A/X.JS', 'a/*.js', { nocase: true }, true],
  ['a/b/x.js', 'a/*.js', { noglobstar: true }, false], ['ignored/x.js', '!ignored/**', {}, false],
  ['keep/x.js', '!ignored/**', {}, true], ['C:/src/x.js', 'C:\\src\\*.js', { windowsPathsNoEscape: true, platform: 'win32' }, true],
  ['//host/share/src/x.js', '//host/share/src/*.js', { platform: 'win32' }, true],
];
test('options utilisées, ESM et CommonJS, globParts/pattern/negate/match', async () => {
  for (const nom of parentsMinimatch) {
    const r = depuis(nom), commun = r('minimatch');
    const esm = await import(pathToFileURL(r.resolve('minimatch').replace(/commonjs[\\/]/, 'esm/')).href);
    for (const [cible, motif, options, attendu] of cas) {
      assert.equal(commun.minimatch(cible, motif, options), attendu, nom);
      assert.equal(esm.minimatch(cible, motif, options), attendu, nom);
      assert.equal(new commun.Minimatch(motif, options).match(cible), attendu, nom);
    }
    const m = new commun.Minimatch('!packages/*');
    assert.equal(m.negate, true); assert.equal(m.pattern, 'packages/*'); assert.deepEqual(m.globParts[0], ['packages', '*']);
  }
});

test('vrai build-info : découverte et exclusion de workspaces', async () => {
  const { getWorkspacePackages } = await charger('@netlify/build-info/lib/workspaces/get-workspace-packages.js');
  await fixture({ 'packages/a/package.json': '{"name":"a"}', 'packages/b/package.json': '{"name":"b"}', 'packages/ignore/package.json': '{"name":"ignore"}' }, async dossier => {
    const project = { root: dossier, fs: {
      resolve: (...p) => path.resolve(...p), join: (...p) => path.posix.join(...p),
      readJSON: async p => JSON.parse(await fsp.readFile(p, 'utf8')),
      readDir: async p => Object.fromEntries((await fsp.readdir(p, { withFileTypes: true })).map(x => [x.name, x.isDirectory() ? 'directory' : 'file'])),
    } };
    assert.deepEqual((await getWorkspacePackages(project, ['packages/*', '!packages/ignore'])).map(x => x.name).sort(), ['a', 'b']);
  });
});

test('vrai build : fichiers à scanner, dotfiles et exclusions relatives', async () => {
  const { getFilePathsToScan, scanFilesForKeyValues } = await charger('@netlify/build/lib/plugins_core/secrets_scanning/utils.js');
  await fixture({ '.gitignore': 'ignored/\n', 'public/a.js': 'valeur_synthetique_assez_longue', 'public/.cache.js': 'fixture', 'ignored/a.js': 'fixture', '.cache/a.js': 'fixture', 'omit/a.js': 'fixture' }, async dossier => {
    const fichiers = await getFilePathsToScan({ base: dossier, env: { SECRETS_SCAN_OMIT_PATHS: 'omit/**,public/.cache.*' } });
    assert.deepEqual(tris(fichiers), ['.gitignore', 'public/a.js']);
    const r = await scanFilesForKeyValues({ env: { FIXTURE: 'valeur_synthetique_assez_longue' }, keys: ['FIXTURE'], filePaths: [...fichiers], base: dossier, enhancedScanning: false });
    assert.equal(r.scannedFilesCount, 2); assert.equal(r.matches.length, 1);
  });
});

test('vrais filtres zip : motifs Windows, exclusions et includedFiles', async () => {
  const matching = await charger('@netlify/zip-it-and-ship-it/dist/utils/matching.js');
  const { filterExcludedPaths, getPathsOfIncludedFiles } = await charger('@netlify/zip-it-and-ship-it/dist/runtimes/node/utils/included_files.js');
  assert.equal(matching.minimatch('assets/a.txt', 'assets\\*.txt'), true);
  assert.deepEqual(filterExcludedPaths(['a.js', 'a.txt', '.hidden.js'], ['**/*.txt', '**/.hidden.*']), ['a.js']);
  await fixture({ 'assets/a.txt': 'a', 'assets/omit.txt': 'x', 'assets/sub/b.txt': 'b' }, async dossier => {
    const { paths, excludePatterns } = await getPathsOfIncludedFiles(['assets/**/*.txt', '!assets/omit.txt'], dossier);
    assert.deepEqual(tris(filterExcludedPaths(paths, excludePatterns).map(p => path.relative(dossier, p))), ['assets/a.txt', 'assets/sub/b.txt']);
  });
});

test('vrai typescript-estree : prédicat defaultProject et dépendance réelle', () => {
  const source = lire('@typescript-eslint/typescript-estree/dist/useProgramFromProjectService.js');
  const debut = source.indexOf('function filePathMatchedBy('), fin = source.indexOf('//# sourceMappingURL', debut);
  assert.ok(debut >= 0 && fin > debut);
  const predicat = runInNewContext(source.slice(debut, fin) + '\nfilePathMatchedBy;', { minimatch_1: depuis('@typescript-eslint/typescript-estree')('minimatch') });
  assert.equal(predicat('.fixture.ts', ['*.ts']), true); assert.equal(predicat('src/a.ts', ['*.ts']), false); assert.equal(predicat('src/a.ts', ['src/*.ts']), true);
});

test('vrai readdir-glob : événement match, ignore/skip, dot et nodir', async () => {
  await fixture({ 'a.js': 'a', '.dot.js': 'd', 'sub/b.js': 'b', 'sub/omit.js': 'o', 'skip/c.js': 'c' }, async dossier => {
    const trouves = await new Promise((ok, ko) => req('readdir-glob')(dossier, { pattern: '**/*.js', ignore: '**/omit.js', skip: 'skip', dot: true, nodir: true }, (e, xs) => e ? ko(e) : ok(xs)));
    assert.deepEqual(tris(trouves), ['.dot.js', 'a.js', 'sub/b.js']);
  });
});

test('vrai glob de nft : absolus, ignore node_modules, dot, mark et nodir', async () => {
  const { glob } = depuis('@vercel/nft')('glob');
  await fixture({ 'assets/a.txt': 'a', 'assets/.dot.txt': 'd', 'assets/sub/b.txt': 'b', 'assets/node_modules/exclu/x.txt': 'x' }, async dossier => {
    const base = slash(path.join(dossier, 'assets'));
    const xs = await glob(base + '/**/*', { mark: true, ignore: base + '/**/node_modules/**/*', dot: true, nodir: true });
    assert.deepEqual(tris(xs.map(p => path.relative(dossier, p))), ['assets/.dot.txt', 'assets/a.txt', 'assets/sub/b.txt']);
  });
});

test('annulation glob : aucune nouvelle lecture après la borne sur trois dossiers', async () => {
  const { glob } = depuis('@vercel/nft')('glob');
  await fixture({ 'a/x.txt': 'a', 'b/x.txt': 'b', 'c/x.txt': 'c' }, async dossier => {
    const controle = new AbortController(); let lectures = 0;
    const borne = new Error('BORNE_SYNTHETIQUE');
    const fsBorne = { readdir: (p, options, cb) => {
      lectures++;
      fs.readdir(p, options, (e, entrees) => { if (lectures === 1) controle.abort(borne); cb(e, entrees); });
    } };
    await assert.rejects(glob('**/*', { cwd: dossier, signal: controle.signal, fs: fsBorne }), e => e === borne);
    await new Promise(ok => setTimeout(ok, 30));
    assert.equal(lectures, 1, 'LECTURES_APRES_ANNULATION');
  });
});

const sourceTrace = "const fs=require('fs');const path=require('path');const kind=process.env.FIXTURE_KIND;exports.handler=()=>{require('./parts/'+kind+'.js');return fs.readFileSync(path.join(__dirname,'assets',kind+'.txt'),'utf8');};";
const fichiersTrace = { 'functions/f.js': sourceTrace, 'functions/parts/a.js': 'module.exports=1;', 'functions/parts/b.js': 'module.exports=2;', 'functions/assets/a.txt': 'a', 'functions/assets/b.txt': 'b', 'functions/assets/node_modules/exclu/x.txt': 'x' };
test('vrai nodeFileTrace : require dynamique et assets, code jamais exécuté', async () => {
  await fixture(fichiersTrace, async dossier => {
    const { fileList, warnings } = await req('@vercel/nft').nodeFileTrace([path.join(dossier, 'functions/f.js')], { base: dossier });
    assert.equal(warnings.size, 0);
    assert.deepEqual(tris(fileList), ['functions/assets/a.txt', 'functions/assets/b.txt', 'functions/f.js', 'functions/parts/a.js', 'functions/parts/b.js']);
  });
});

test('vrai zip-it-and-ship-it : fichiers tracés et archive avec config/exclusions', async () => {
  const { listFunctionsFiles, zipFunctions } = await charger('@netlify/zip-it-and-ship-it/dist/main.js');
  await fixture({ ...fichiersTrace, 'extra/kept.txt': 'k', 'extra/omit.txt': 'o' }, async dossier => {
    const config = { '*': { nodeBundler: 'nft', nodeVersion: '22', includedFiles: ['extra/*.txt', '!extra/omit.txt'], includedFilesBasePath: dossier } };
    const xs = await listFunctionsFiles([path.join(dossier, 'functions')], { basePath: dossier, config });
    const relatifs = tris(xs.map(f => path.relative(dossier, f.srcFile)));
    assert.ok(relatifs.includes('extra/kept.txt')); assert.ok(!relatifs.includes('extra/omit.txt'));
    for (const nom of ['functions/f.js', 'functions/parts/a.js', 'functions/assets/b.txt']) assert.ok(relatifs.includes(nom), nom);
    const resultats = await zipFunctions(path.join(dossier, 'functions'), path.join(dossier, 'zip'), { basePath: dossier, repositoryRoot: dossier, config });
    assert.equal(resultats.length, 1); assert.ok((await fsp.stat(resultats[0].path)).size > 0);
    assert.equal((await fsp.readFile(resultats[0].path)).readUInt32LE(0), 0x04034b50);
    const noms = await new Promise((ok, ko) => req('yauzl').open(resultats[0].path, { lazyEntries: true }, (e, zip) => {
      if (e) return ko(e);
      const noms = []; zip.on('error', ko); zip.on('end', () => ok(noms));
      zip.on('entry', entree => { noms.push(entree.fileName); zip.readEntry(); }); zip.readEntry();
    }));
    assert.ok(noms.some(n => n.endsWith('extra/kept.txt')));
    assert.ok(noms.some(n => n.endsWith('assets/b.txt')));
    assert.ok(noms.every(n => !n.endsWith('extra/omit.txt') && !n.includes('../')));
  });
});

test('Deno inchangé : plage vérifiée seulement, aucun bundling Edge revendiqué', async () => {
  const { DENO_VERSION_RANGE } = await charger('@netlify/edge-bundler/dist/node/bridge.js');
  assert.equal(version(req, '@netlify/edge-bundler'), '16.2.0'); assert.equal(DENO_VERSION_RANGE, '^2.4.2');
  assert.equal(req('semver').satisfies('2.9.8', DENO_VERSION_RANGE), true);
});
