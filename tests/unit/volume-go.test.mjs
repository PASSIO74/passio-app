import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtempSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {analyserSortie, environnementLocal, executerLocal, indexesRequis, lireArguments, optionsLocales,
  planLocal} from '../../scripts/volume-go.mjs';

const sql = readFileSync(new URL('../../scripts/test-volume.sql', import.meta.url), 'utf8');
const socle = readFileSync(new URL('../sql/fixtures/socle-production-2026-11-06.sql', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../sql/fixtures/volume-go-bootstrap.sql', import.meta.url), 'utf8');

test('le bootstrap conserve les index historiques des cinq tables du chemin mesuré', () => {
  const fichiers = ['migration_indexes_et_monitoring.sql', 'migration_comment_interactions.sql',
    'migration_anti_flood_interactions.sql', 'migration_index_cles_etrangeres.sql',
    'migration_irl_v2.sql', 'migration_publications_supprimees_2026-11-04.sql'];
  const tables = new Set(['posts', 'profiles', 'post_comments', 'post_likes', 'comment_interactions']);
  const extraire = texte => {
    const trouves = new Map();
    for (const m of texte.matchAll(/\bcreate\s+index\s+(?:if\s+not\s+exists\s+)?(\w+)\s+on\s+(?:public\.)?(\w+)\s*\(([^;]+?)\)\s*(where[^;]+)?;/gi)) {
      if (tables.has(m[2].toLowerCase())) trouves.set(m[1].toLowerCase(),
        [m[2], m[3], m[4] ?? ''].map(x => x.toLowerCase().replaceAll(/\s+/g, '')).join('|'));
    }
    return trouves;
  };
  const attendus = extraire(fichiers.map(f => readFileSync(new URL('../../migrations/' + f, import.meta.url), 'utf8')).join('\n'));
  assert.equal(attendus.size, 11, 'aucune disparition silencieuse dans le catalogue des migrations');
  const presents = extraire(bootstrap);
  assert.deepEqual([...attendus].filter(([nom, definition]) => presents.get(nom) !== definition), [],
    'index absents ou différents des DDL existants : ce montage ne représente pas leurs chemins');
});

test('le volume écrit les colonnes réellement présentes, pas le modèle de posts abandonné', () => {
  const inconnues = [];
  let insertions = 0;
  for (const m of sql.matchAll(/\binsert\s+into\s+(?:public\.)?([a-z_]+)\s*\(([^)]+)\)/gi)) {
    if (!['profiles','posts','post_likes','post_comments'].includes(m[1])) continue;
    insertions++;
    const table = socle.match(new RegExp('^create table public\\."' + m[1] + '" \\(([\\s\\S]*?)^\\);', 'm'));
    assert.ok(table, 'table de référence absente : ' + m[1]);
    const colonnes = new Set([...table[1].matchAll(/^\s*"([^"]+)"\s+/gm)].map(c => c[1]));
    for (const col of m[2].split(',').map(x => x.trim().replaceAll('"',''))) {
      if (!colonnes.has(col)) inconnues.push(m[1] + '.' + col);
    }
  }
  assert.ok(insertions >= 3, 'les insertions de volume doivent être réellement recensées');
  assert.deepEqual(inconnues, []);
});

test('les seules cibles acceptées sont TCP loopback numérique et une base dédiée', () => {
  for (const host of ['localhost', '127.0.0.2', '127.1', '2130706433', '::ffff:127.0.0.1',
    'db.example.test', 'https://example.test', '/tmp', '127.0.0.1 hostaddr=192.0.2.1']) {
    assert.throws(() => optionsLocales({host}), /loopback/);
  }
  for (const database of ['postgres', 'passio', 'dbname=passio_volume_go_local',
    'postgresql://127.0.0.1/passio_volume_go_local', 'passio_volume_go_', 'passio_volume_go_a b']) {
    assert.throws(() => optionsLocales({database}), /dédiée/);
  }
  assert.equal(optionsLocales({host: '::1'}).host, '::1');
  assert.equal(optionsLocales().database, 'passio_volume_go_local');
});

test('les options ferment DSN, shell, injections, modes ambigus et budgets libres', () => {
  for (const args of [['--url', 'postgresql://example.test'], ['--plan', '--executer'],
    ['--host', '127.0.0.1', '--host', '::1'], ['--port', '5432;echo'], ['--user'],
    ['--duree-ms', '600001'], ['--duree-ms', '0'], ['--repetitions', '2'], ['--port', '65536']]) {
    assert.throws(() => lireArguments(args));
  }
  assert.throws(() => optionsLocales({connectionString: 'interdit'}), /inconnue/);
  assert.throws(() => optionsLocales({executer: true}), /psql explicite/);
  assert.throws(() => optionsLocales({psql: 'psql'}), /absolu/);
  assert.throws(() => optionsLocales({psql: '//serveur/partage/psql.exe'}), /local/);
  assert.throws(() => optionsLocales({pgpassLocal: 'relatif'}), /absolu/);
  assert.throws(() => optionsLocales({user: 'postgres --command=oops'}), /rôle/);
});

test('--plan ne lance aucun processus ni réseau et ne transforme aucune prévision en mesure', async () => {
  const rapport = await executerLocal(lireArguments(['--plan']), {
    env: {CI: 'true', PGHOSTADDR: '192.0.2.1'}, spawnImpl() { throw new Error('interdit'); },
  });
  assert.equal(rapport.statut, 'NON MESURÉ');
  assert.equal(rapport.fixtures_prevues.profils_applicatifs, 100000);
  assert.equal(rapport.fixtures_prevues.comptes_auth_crees, 0);
  assert.equal(rapport.fixtures_prevues.connexions, 1);
  assert.equal(rapport.mesures, undefined);
  assert.match(rapport.sql_sha256, /^[0-9a-f]{64}$/);
  assert.ok(rapport.limites.some(s => s.includes('Supabase hébergée')));
});

test('libpq ne reçoit aucun aiguillage ni credential PG hérité', () => {
  const env = environnementLocal({PGHOSTADDR: '192.0.2.1', PGSERVICE: 'prod',
    PGSERVICEFILE: 'prod', PGOPTIONS: '-c role=service_role', PGPASSWORD: 'secret-local-factice',
    PGPASSFILE: 'prod', PGDATABASE: 'prod', HOME: 'cache', PATH: 'interdit', SystemRoot: 'windows'}, 'vide-local');
  assert.equal(env.PGPASSFILE, 'vide-local');
  assert.equal(env.PGSSLMODE, 'disable');
  assert.equal(env.SystemRoot, 'windows');
  for (const cle of ['PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGPASSWORD', 'PGDATABASE', 'HOME', 'PATH']) {
    assert.equal(env[cle], undefined, cle);
  }
});

function sortieValide(port = 5432) {
  const events = [{volume_go: 'fixtures', ...planLocal().fixtures_prevues,
    server_addr: '127.0.0.1', server_port: port, database: 'passio_volume_go_local',
    postgres_version: '17.12', created_at_distincts: 1,
    index_catalogue: Object.entries(indexesRequis).map(([nom, definition]) => {
      const [table, colonnes, predicat] = definition.split('|');
      return {nom, table, colonnes: colonnes.split(','), predicat, methode: 'btree', valide: true, pret: true};
    })}];
  for (const [requete, lignes] of Object.entries({fil: 20, profils: 1, compteurs: 20})) {
    for (let iteration = 1; iteration <= 3; iteration++) events.push({volume_go: 'mesure', requete,
      iteration, role: 'authenticated', lignes, explain: [{Plan: {'Node Type': requete === 'compteurs' ? 'Function Scan' : 'Limit', 'Actual Rows': lignes},
        'Planning Time': 0.1, 'Execution Time': iteration}]});
  }
  events.push({volume_go: 'termine', rollback_verifie: true});
  return events;
}
const encoder = events => events.map(e => JSON.stringify(e)).join('\n') + '\n';

test('la preuve exige cardinalités, 9 plans/temps client et marqueur après ROLLBACK', () => {
  const resultat = analyserSortie(encoder(sortieValide()), 3);
  assert.equal(resultat.rollback_verifie, true);
  assert.deepEqual(resultat.medianes_execution_sql_ms, {fil: 2, profils: 2, compteurs: 2});
  for (const changer of [
    e => e.pop(), e => { e.at(-1).rollback_verifie = false; },
    e => { e[0].profils_applicatifs = 200; }, e => { e[0].comptes_auth_crees = 100000; },
    e => { e[0].server_addr = '192.0.2.1'; }, e => { e[0].database = 'postgres'; },
    e => { e[0].created_at_distincts = 100000; },
    e => { delete e[0].index_catalogue; }, e => { e[0].index_catalogue.pop(); },
    e => { e[0].index_catalogue[0].valide = false; },
    e => { e[0].index_catalogue[0].colonnes = ['id']; },
    e => { e[0].index_catalogue[0].predicat = 'autre'; },
    e => { e[1].role = 'postgres'; }, e => { e[1].lignes = 0; },
    e => { e[1].explain[0]['Execution Time'] = null; }, e => { e[1].explain[0].Plan = null; },
    e => { e[1].explain[0].Plan['Actual Rows'] = 0; },
    e => { e[7].explain[0].Plan.Plans = [{'Parent Relationship': 'InitPlan', 'Node Type': 'Limit'}]; },
    e => { e[2] = e[1]; }, e => { e[1].requete = 'autre'; },
  ]) {
    const events = sortieValide(); changer(events);
    assert.throws(() => analyserSortie(encoder(events), 3));
  }
  assert.throws(() => analyserSortie('ERROR: non structurée', 3), /structurée/);
});

function fauxPsql(action, observation = {}) {
  return (executable, args, opts) => {
    Object.assign(observation, {executable, args, opts});
    const enfant = new EventEmitter();
    enfant.stdout = new PassThrough(); enfant.stderr = new PassThrough();
    enfant.kill = () => { observation.tue = true; queueMicrotask(() => enfant.emit('close', null, 'SIGKILL')); return true; };
    queueMicrotask(() => action(enfant));
    return enfant;
  };
}

test('psql est explicite, sans shell/password interactif, environnement fermé et cleanup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'test-volume-go-'));
  try {
    const psql = join(dir, 'psql.exe'), pgpassLocal = join(dir, 'local.conf');
    writeFileSync(psql, 'factice jamais exécuté'); writeFileSync(pgpassLocal, 'ne pas lire');
    const obs = {};
    const rapport = await executerLocal({executer: true, psql, pgpassLocal, port: 55472}, {env: {},
      spawnImpl: fauxPsql(e => { e.stdout.write(encoder(sortieValide(55472))); e.emit('close', 0, null); }, obs)});
    assert.equal(rapport.statut, 'MESURÉ LOCAL UNIQUEMENT');
    assert.equal(obs.executable, psql);
    assert.equal(obs.opts.shell, false);
    assert.equal(obs.opts.env.PGPASSFILE, pgpassLocal);
    assert.ok(obs.args.includes('--no-password'));
    assert.ok(obs.args.includes('-X'));
    assert.equal(obs.args[obs.args.indexOf('--host') + 1], '127.0.0.1');
    assert.equal(obs.args[obs.args.indexOf('--port') + 1], '55472');
    assert.equal(obs.args[obs.args.indexOf('--dbname') + 1], 'passio_volume_go_local');
    const vide = {};
    await executerLocal({executer: true, psql}, {env: {PGPASSFILE: 'autre'},
      spawnImpl: fauxPsql(e => { e.stdout.write(encoder(sortieValide())); e.emit('close', 0, null); }, vide)});
    assert.equal(existsSync(vide.opts.env.PGPASSFILE), false, 'fichier vide nettoyé après psql');
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('CI refuse avant lancement, psql rouge/absent/interrompu reste un échec visible', async () => {
  for (const cle of ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'NETLIFY']) {
    await assert.rejects(executerLocal({executer: true, psql: join(tmpdir(), 'psql.exe')}, {
      env: {[cle]: 'true'}, spawnImpl() { throw new Error('ne doit pas lancer'); },
    }), /CI\/distant/);
  }
  const dir = mkdtempSync(join(tmpdir(), 'test-volume-go-'));
  try {
    const psql = join(dir, 'psql.exe'); writeFileSync(psql, 'factice');
    await assert.rejects(executerLocal({executer: true, psql}, {env: {}, spawnImpl: fauxPsql(e => {
      e.stderr.write('diagnostic SQL conservé'); e.emit('close', 3, null);
    })}), /diagnostic SQL conservé/);
    await assert.rejects(executerLocal({executer: true, psql}, {env: {}, spawnImpl: fauxPsql(e => {
      e.stdout.write(encoder(sortieValide())); e.emit('close', null, 'SIGTERM');
    })}), /SIGTERM/);
    await assert.rejects(executerLocal({executer: true, psql}, {env: {}, spawnImpl: fauxPsql(e => {
      e.emit('error', new Error('binaire indisponible'));
    })}), /binaire indisponible/);
    const debordement = {};
    await assert.rejects(executerLocal({executer: true, psql}, {env: {}, spawnImpl: fauxPsql(e => {
      e.stdout.write('x'.repeat(8 * 1024 * 1024 + 1));
    }, debordement)}), /hors budget/);
    assert.equal(debordement.tue, true);
    const obs = {};
    await assert.rejects(executerLocal({executer: true, psql, dureeMs: 1000}, {
      env: {}, spawnImpl: fauxPsql(() => {}, obs),
    }), /Budget de durée dépassé/);
    assert.equal(obs.tue, true);
    assert.equal(existsSync(obs.opts.env.PGPASSFILE), false);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
