#!/usr/bin/env node
// Banc synthétique LOCAL. Aucune création de serveur/base, aucun accès Supabase/API.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const sqlPath = fileURLToPath(new URL('./test-volume.sql', import.meta.url));
const attendus = Object.freeze({profils_applicatifs: 100000, auteurs_distincts: 100000,
  posts: 100000, likes: 300000, commentaires: 200000, comptes_auth_crees: 0, connexions: 1});
const requetes = Object.freeze({fil: 20, profils: 1, compteurs: 20});
export const indexesRequis = Object.freeze({
  idx_posts_created_at: 'posts|created_at DESC|', idx_posts_author: 'posts|author_id|',
  idx_posts_passion: 'posts|passion_id|', idx_posts_event: 'posts|event_id|event_idisnotnull',
  idx_comments_post: 'post_comments|post_id,created_at DESC|',
  idx_post_comments_author: 'post_comments|author_id|', idx_likes_post: 'post_likes|post_id|',
  idx_profiles_passion: 'profiles|passion_id|', idx_ci_comment: 'comment_interactions|comment_id|',
  idx_ci_user_created: 'comment_interactions|user_id,created_at|', idx_ci_post: 'comment_interactions|post_id|',
});
const limites = Object.freeze([
  'Comptes Auth, inscriptions et connexions de 100000 utilisateurs : NON MESURÉS',
  'Capacité Supabase hébergée, PostgREST, réseau, coûts et quotas : NON MESURÉS',
  'Concurrence, Realtime, médias, rendu et convergence entre appareils : NON MESURÉS',
  'SQL local représentatif, caches sollicités ; trois échantillons ne prouvent aucun P95/P99',
  'Profils tous publics, un post par auteur créé au même instant ; graphe social et historique réels NON MESURÉS',
  'Le plan du RPC peut masquer ses plans internes (Function Scan)',
  'ROLLBACK des lignes ; statistiques, séquences et espace disque exigent une base jetable',
  'Index du chemin repris des migrations du dépôt ; leur présence en production NON VÉRIFIÉE par ce banc',
]);

export function optionsLocales(entree = {}) {
  const connues = new Set(['executer', 'psql', 'pgpassLocal', 'host', 'port', 'database', 'user', 'repetitions', 'dureeMs']);
  for (const cle of Object.keys(entree)) if (!connues.has(cle)) throw new Error('Option inconnue : ' + cle);
  if (entree.executer !== undefined && typeof entree.executer !== 'boolean') throw new Error('Mode invalide');
  const o = {executer: false, host: '127.0.0.1', port: 5432,
    database: 'passio_volume_go_local', user: 'postgres', repetitions: 3, dureeMs: 300000, ...entree};
  if (!['127.0.0.1', '::1'].includes(o.host)) throw new Error('Hôte numérique loopback uniquement');
  if (!/^passio_volume_go_[a-z0-9_]{1,32}$/.test(o.database)) throw new Error('Base dédiée passio_volume_go_<suffixe> requise');
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(o.user)) throw new Error('Nom de rôle local simple requis');
  for (const [cle, min, max] of [['port', 1, 65535], ['repetitions', 3, 9], ['dureeMs', 1000, 600000]]) {
    if (!Number.isInteger(o[cle]) || o[cle] < min || o[cle] > max) throw new Error('Borne invalide : ' + cle);
  }
  if (o.psql !== undefined && (typeof o.psql !== 'string' || !isAbsolute(o.psql)
      || /^[\\/]{2}/.test(o.psql) || !/^psql(?:\.exe)?$/i.test(basename(o.psql)))) throw new Error('Chemin absolu local du binaire psql requis');
  if (o.executer && !o.psql) throw new Error('--executer exige --psql explicite');
  if (o.pgpassLocal !== undefined && (typeof o.pgpassLocal !== 'string' || !isAbsolute(o.pgpassLocal) || /^[\\/]{2}/.test(o.pgpassLocal))) {
    throw new Error('--pgpass-local exige un fichier absolu explicite (lu seulement par psql)');
  }
  return Object.freeze(o);
}

export function lireArguments(args) {
  const o = {};
  let mode;
  const noms = {'--psql': 'psql', '--pgpass-local': 'pgpassLocal', '--host': 'host', '--port': 'port', '--database': 'database',
    '--user': 'user', '--repetitions': 'repetitions', '--duree-ms': 'dureeMs'};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--plan' || a === '--executer') {
      if (mode) throw new Error('Un seul mode --plan ou --executer');
      mode = a; o.executer = a === '--executer';
    } else {
      const cle = noms[a];
      if (!cle || Object.hasOwn(o, cle) || args[i + 1] === undefined || args[i + 1].startsWith('--')) {
        throw new Error('Argument inconnu, répété ou incomplet : ' + a);
      }
      const valeur = args[++i];
      o[cle] = ['port', 'repetitions', 'dureeMs'].includes(cle) ? (/^\d+$/.test(valeur) ? Number(valeur) : NaN) : valeur;
    }
  }
  return optionsLocales(o);
}

export function planLocal(entree = {}) {
  const o = optionsLocales(entree);
  return {outil: 'volume-go-local-v2-indexes', statut: 'NON MESURÉ', cible: {
    host: o.host, port: o.port, database: o.database, user: o.user},
  psql: o.psql ?? 'NON FOURNI', sql_sha256: createHash('sha256').update(readFileSync(sqlPath)).digest('hex'),
  fixtures_prevues: attendus, role_lectures: 'authenticated (RLS active)',
  indexes_requis: indexesRequis,
  repetitions: o.repetitions, duree_max_ms: o.dureeMs,
  statement_timeout_ms: 120000, lock_timeout_ms: 3000,
  requetes: Object.keys(requetes), limites,
  commande: 'node scripts/volume-go.mjs --executer --psql <chemin-absolu-psql> --host 127.0.0.1 --port <port-local> --database passio_volume_go_<suffixe> --user <proprietaire-local>',
  prealable: 'PostgreSQL natif déjà démarré, base jetable sans données avec schéma courant et bouchons externes muets (tests/sql/fixtures/volume-go-bootstrap.sql). Ce script ne démarre aucun serveur.'};
}

// Pas de PGHOSTADDR/PGSERVICE/PGOPTIONS/PGPASSWORD hérités, ni de .pgpass/.psqlrc.
export function environnementLocal(source, fichierVide) {
  const env = {};
  for (const cle of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) {
    if (typeof source[cle] === 'string') env[cle] = source[cle];
  }
  return {...env, LANG: 'C', LC_ALL: 'C', PGCONNECT_TIMEOUT: '5',
    PGAPPNAME: 'passio-volume-go-local', PGSSLMODE: 'disable', PGGSSENCMODE: 'disable',
    PGPASSFILE: fichierVide, PGCLIENTENCODING: 'UTF8'};
}

export function analyserSortie(stdout, repetitions, cible) {
  const evenements = [];
  for (const ligne of stdout.split(/\r?\n/)) {
    if (!ligne.trim()) continue;
    let v;
    try { v = JSON.parse(ligne); } catch { throw new Error('Sortie psql non structurée'); }
    if (!v || typeof v !== 'object' || !['fixtures', 'mesure', 'termine'].includes(v.volume_go)) throw new Error('Événement psql inconnu');
    evenements.push(v);
  }
  if (evenements.length !== 2 + repetitions * 3 || evenements[0]?.volume_go !== 'fixtures'
      || evenements.at(-1)?.volume_go !== 'termine' || evenements.at(-1).rollback_verifie !== true) {
    throw new Error('Preuve complète des mesures et du ROLLBACK absente');
  }
  for (const [cle, n] of Object.entries(attendus)) if (evenements[0][cle] !== n) throw new Error('Cardinalité incorrecte : ' + cle);
  const contexte = evenements[0];
  const indexes = contexte.index_catalogue;
  const vus = new Set();
  if (!Array.isArray(indexes) || indexes.length !== Object.keys(indexesRequis).length) throw new Error('Catalogue index incomplet');
  for (const i of indexes) {
    if (!i || !Object.hasOwn(indexesRequis, i.nom) || vus.has(i.nom) || i.methode !== 'btree'
        || i.valide !== true || i.pret !== true || !Array.isArray(i.colonnes)
        || [i.table, i.colonnes.join(','), i.predicat].join('|') !== indexesRequis[i.nom]) {
      throw new Error('Index absent ou différent du contrat');
    }
    vus.add(i.nom);
  }
  if (!['127.0.0.1', '::1'].includes(contexte.server_addr)
      || !/^passio_volume_go_[a-z0-9_]{1,32}$/.test(contexte.database)
      || !Number.isInteger(contexte.server_port) || contexte.server_port < 1 || contexte.server_port > 65535
      || typeof contexte.postgres_version !== 'string' || !/^\d+\.\d+/.test(contexte.postgres_version)
      || contexte.created_at_distincts !== 1
      || (cible && (cible.host !== contexte.server_addr || cible.port !== contexte.server_port || cible.database !== contexte.database))) {
    throw new Error('Contexte PostgreSQL local ou distribution des fixtures incorrect');
  }
  const mesures = evenements.slice(1, -1);
  const vues = new Set();
  for (const m of mesures) {
    const cle = m.requete + ':' + m.iteration;
    const p = m.explain?.[0];
    if (m.volume_go !== 'mesure' || !Object.hasOwn(requetes, m.requete) || m.role !== 'authenticated'
        || m.lignes !== requetes[m.requete] || !Number.isInteger(m.iteration) || m.iteration < 1
        || m.iteration > repetitions || vues.has(cle) || !p?.Plan
        || p.Plan['Actual Rows'] !== requetes[m.requete]
        || (m.requete === 'compteurs' && (p.Plan['Node Type'] !== 'Function Scan' || p.Plan.Plans?.length))
        || !['Planning Time', 'Execution Time'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] >= 0)) {
      throw new Error('Mesure invalide ou incomplète : ' + cle);
    }
    vues.add(cle);
  }
  const medianes = {};
  for (const nom of Object.keys(requetes)) {
    const temps = mesures.filter(m => m.requete === nom).map(m => m.explain[0]['Execution Time']).sort((a, b) => a - b);
    const milieu = Math.floor(temps.length / 2);
    medianes[nom] = temps.length % 2 ? temps[milieu] : (temps[milieu - 1] + temps[milieu]) / 2;
  }
  return {fixtures: evenements[0], mesures, medianes_execution_sql_ms: medianes, rollback_verifie: true};
}

export async function executerLocal(entree, {env = process.env, spawnImpl = spawn} = {}) {
  const o = optionsLocales(entree);
  if (!o.executer) return planLocal(o); // Aucun processus ni socket, même en CI.
  if (['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE', 'TF_BUILD', 'NETLIFY'].some(k => Boolean(env[k]))) {
    throw new Error('Exécution refusée en environnement CI/distant');
  }
  if (!statSync(o.psql).isFile()) throw new Error('psql doit être un fichier local');
  if (o.pgpassLocal && !statSync(o.pgpassLocal).isFile()) throw new Error('pgpass local doit être un fichier');
  const repertoire = mkdtempSync(join(tmpdir(), 'passio-volume-go-'));
  const fichierVide = join(repertoire, 'pgpass-vide');
  writeFileSync(fichierVide, '', {flag: 'wx', mode: 0o600});
  const args = ['-X', '--no-password', '--quiet', '--no-align', '--tuples-only',
    '--host', o.host, '--port', String(o.port), '--username', o.user, '--dbname', o.database,
    '--set', 'ON_ERROR_STOP=1', '--set', 'volume_go_local=1', '--set', 'repetitions=' + o.repetitions,
    '--file', sqlPath];
  const debut = Date.now();
  try {
    const stdout = await new Promise((resoudre, rejeter) => {
      const enfant = spawnImpl(o.psql, args, {env: environnementLocal(env, o.pgpassLocal ?? fichierVide), shell: false,
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
      let sortie = '', erreurs = '', total = 0, echec;
      const minuterie = setTimeout(() => {
        echec = new Error('Budget de durée dépassé (' + o.dureeMs + ' ms) ; ROLLBACK non vérifié');
        enfant.kill('SIGKILL');
        rejeter(echec);
      }, o.dureeMs);
      const collecter = (type, morceau) => {
        total += Buffer.byteLength(morceau);
        if (total > 8 * 1024 * 1024) {
          echec ??= new Error('Sortie psql hors budget (8 Mio)'); enfant.kill('SIGKILL');
          clearTimeout(minuterie); rejeter(echec); return;
        }
        if (type === 'stdout') sortie += morceau.toString('utf8'); else erreurs += morceau.toString('utf8');
      };
      enfant.stdout.setEncoding('utf8');
      enfant.stderr.setEncoding('utf8');
      enfant.stdout.on('data', b => collecter('stdout', b));
      enfant.stderr.on('data', b => collecter('stderr', b));
      enfant.once('error', e => { clearTimeout(minuterie); rejeter(e); });
      enfant.once('close', (code, signal) => {
        clearTimeout(minuterie);
        if (echec) rejeter(echec);
        else if (code !== 0 || signal) rejeter(new Error('psql en échec (' + (signal ?? code) + ') : ' + erreurs.slice(-6000)));
        else resoudre(sortie);
      });
    });
    return {...planLocal(o), statut: 'MESURÉ LOCAL UNIQUEMENT', duree_reelle_ms: Date.now() - debut,
      ...analyserSortie(stdout, o.repetitions, o)};
  } finally { rmSync(repertoire, {recursive: true, force: true}); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await executerLocal(lireArguments(process.argv.slice(2))), null, 2)); }
  catch (e) { console.error('ECHEC VOLUME GO : ' + e.message + '\nMesures : NON MESURÉES (aucun GO déduit).'); process.exitCode = 1; }
}
