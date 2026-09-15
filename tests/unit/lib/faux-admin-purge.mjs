// Le FAUX client Supabase des tests de purge et de suppression de compte —
// partagé par purge-compte.test.mjs et suppression-compte.test.mjs, pour que le
// second exerce le VRAI purgerCompte à travers le vrai handler.
import { TABLES_COMPTE, DOSSIERS_CONTENU, RPC_OBJETS, RPC_RECLAMER, RPC_TERMINER, RPC_ATTENDRE } from "../../../supabase/functions/_shared/purge-compte.js";

export const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const AUTRE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// ⚠️ ASTRA-25 / 39 / 40 / 41 : `barriere` pilote les trois fonctions SQL de la
// barrière v2 (`reclamer_suppression`, `terminer_suppression`,
// `attendre_ecritures_en_vol`) — le faux ne REFAIT PAS leur règle (jeton,
// sérialisation, xids : c'est `tests/sql/migration-barriere-suppression.test.sh`
// et `ecriture-en-vol-suppression.test.sh` qui la mesurent, sur PostgreSQL
// réel). Il rend ce qu'on lui dit de rendre et JOURNALISE chaque appel AVEC SES
// ARGUMENTS : ce que ces tests prouvent, c'est ce que purge-compte.js FAIT de
// ces réponses — l'ordre, le jeton transmis, l'arrêt.
//   "ok"        : réclamation acquise (le cas normal) ;
//   "absente"   : migration non appliquée → PGRST202 sur la fonction ;
//   "refus"     : la fonction existe et lève ;
//   "occupee"   : réclamation NON acquise (une autre tentative est vivante) ;
//   "supprimee" : NON acquise, le compte est déjà supprimé.
// `enVol` : la réponse d'`attendre_ecritures_en_vol` ({ en_vol_initial, restantes, attendu_ms }) ou "absente".
// `terminerRefuse` : `terminer_suppression` répond { ok:false, motif:"jeton_perime" } (une autre tentative a repris le compte).
export function fauxAdmin({ tables = {}, seaux = {}, pannesDelete = [], pannesCount = [], pannesList = [], pannesRemove = [], rpc = "ok", pannesListApres = [], ecrituresTardives = {}, barriere = "ok", enVol = { en_vol_initial: 0, restantes: 0, attendu_ms: 0 }, terminerRefuse = false } = {}) {
  const t = JSON.parse(JSON.stringify(tables));
  // `ecrituresTardives` : { table: n } — à chaque relecture (count) de cette
  // table, tant que n > 0, une ligne du compte RÉAPPARAÎT avant le comptage
  // (le client a repoussé son état entre l'effacement et la relecture).
  const tardives = { ...ecrituresTardives };
  const s = JSON.parse(JSON.stringify(seaux));
  const compteurs = { remove: 0, list: {} };
  // ⚠️ LE JOURNAL DES GESTES, DANS L'ORDRE. Sans lui, un test peut vérifier
  // que la barrière est POSÉE sans jamais vérifier QUAND — or c'est sa
  // POSITION qui est la propriété (« avant tout comptage ») : posée après le
  // premier relevé, elle redevient la « passe de plus » qu'ASTRA-25 refuse.
  // Mesuré par réinjection : en déplaçant la pose après le relevé Storage, la
  // version précédente de ce banc restait VERTE.
  const journal = [];
  // Les appels aux fonctions de la barrière, AVEC leurs arguments.
  const appels = [];
  return {
    _t: t, _s: s, _n: compteurs, _j: journal, _a: appels,
    from(table) {
      const filtres = [];
      let mode = "select", head = false;
      const rows = () => (t[table] || []).filter((r) => filtres.every((f) => f(r)));
      const b = {
        select(_c, o) { mode = "select"; head = !!(o && o.head); return b; },
        delete() { mode = "delete"; return b; },
        upsert(ligne) { mode = "upsert"; b.__ligne = ligne; return b; },
        eq(col, v) { filtres.push((r) => r[col] === v); return b; },
        then(res, rej) {
          let out;
          journal.push(table + ":" + (head ? "count" : mode));
          if (table === "comptes_en_suppression") {
            // v2 : le marqueur n'est PLUS écrit directement (le service n'a que
            // SELECT). Un accès direct est une régression vers la v1 : refusé.
            out = { data: null, error: { code: "42501", message: "permission denied for table comptes_en_suppression" } };
            return Promise.resolve(out).then(res, rej);
          }
          if (mode === "delete") {
            if (pannesDelete.includes(table)) out = { data: null, error: { message: "panne delete " + table } };
            else { t[table] = (t[table] || []).filter((r) => !filtres.every((f) => f(r))); out = { data: null, error: null }; }
          } else if (head) {
            if (tardives[table] > 0) { tardives[table]--; (t[table] = t[table] || []).push({ user_id: U, author_id: U, id: "tardif" }); }
            if (pannesCount.includes(table)) out = { data: null, count: null, error: { message: "panne count " + table } };
            else out = { data: null, count: rows().length, error: null };
          } else out = { data: rows(), error: null };
          return Promise.resolve(out).then(res, rej);
        },
      };
      return b;
    },
    // La fonction SQL : les objets dont `owner` = p_uid, tous seaux, paginés.
    rpc(nom, args) {
      let de = 0, a = Infinity;
      const b = {
        range(x, y) { de = x; a = y; return b; },
        then(res, rej) {
          let out;
          journal.push("rpc:" + nom);
          if (nom === RPC_RECLAMER || nom === RPC_TERMINER || nom === RPC_ATTENDRE) {
            appels.push({ nom, args });
            if (barriere === "absente") out = { data: null, error: { code: "PGRST202", message: "Could not find the function public." + nom + " in the schema cache" } };
            else if (barriere === "refus") out = { data: null, error: { message: "permission denied for function " + nom } };
            else if (nom === RPC_RECLAMER) {
              const acquise = barriere === "ok";
              const statut = barriere === "supprimee" ? "supprimee" : "en_cours";
              if (acquise) { t.comptes_en_suppression = [{ user_id: args.p_uid, statut: "en_cours", jeton: args.p_jeton, tentatives: 1 }]; }
              out = { data: { acquise, statut, jeton: acquise ? args.p_jeton : "autre", tentatives: 1 }, error: null };
            } else if (nom === RPC_ATTENDRE) {
              out = enVol === "absente" ? { data: null, error: { code: "PGRST202", message: "Could not find the function public." + nom + " in the schema cache" } } : { data: enVol, error: null };
            } else {
              if (terminerRefuse) out = { data: { ok: false, motif: "jeton_perime", statut: "en_cours", jeton: "autre" }, error: null };
              else { const l = (t.comptes_en_suppression || [])[0]; if (l) { l.statut = args.p_statut; l.detail = args.p_detail; } out = { data: { ok: true, statut: args.p_statut, jeton: args.p_jeton }, error: null }; }
            }
            return Promise.resolve(out).then(res, rej);
          }
          if (nom !== RPC_OBJETS || rpc === "absente") out = { data: null, error: { code: "PGRST202", message: "function " + nom + " not found" } };
          else if (rpc === "panne") out = { data: null, error: { message: "panne rpc" } };
          else {
            const tous = [];
            for (const seau of Object.keys(s)) for (const [name, owner] of Object.entries(s[seau])) if (owner === args.p_uid) tous.push({ bucket_id: seau, name });
            tous.sort((x, y) => (x.bucket_id + x.name).localeCompare(y.bucket_id + y.name));
            out = { data: tous.slice(de, a + 1), error: null };
          }
          return Promise.resolve(out).then(res, rej);
        },
      };
      return b;
    },
    storage: {
      from(seau) {
        return {
          list(prefixe, o) {
            compteurs.list[seau] = (compteurs.list[seau] || 0) + 1;
            if (pannesList.includes(seau)) return Promise.resolve({ data: null, error: { message: "panne list" } });
            if (pannesListApres.includes(seau) && compteurs.remove > 0) return Promise.resolve({ data: null, error: { message: "panne relecture" } });
            const noms = Object.keys(s[seau] || {}).filter((k) => k.startsWith(prefixe + "/")).map((k) => ({ name: k.slice(prefixe.length + 1) }));
            const offset = (o && o.offset) || 0, limit = (o && o.limit) || 1000;
            return Promise.resolve({ data: noms.slice(offset, offset + limit), error: null });
          },
          remove(chemins) {
            compteurs.remove++;
            if (pannesRemove.includes(seau)) return Promise.resolve({ data: null, error: { message: "panne remove" } });
            for (const c of chemins) delete (s[seau] || {})[c];
            return Promise.resolve({ data: chemins, error: null });
          },
        };
      },
    },
  };
}

export function baseComplete() {
  const tables = {};
  for (const [table, col] of TABLES_COMPTE) {
    tables[table] = tables[table] || [];
    tables[table].push({ [col]: U, content: "x" }, { [col]: AUTRE, content: "y" });
  }
  tables.conv_messages = [
    { from_id: U, content: JSON.stringify({ type: "media", url: "https://njki.supabase.co/storage/v1/object/public/attachments/attachments/conv_1/1_photo.jpg" }) },
    { from_id: U, content: JSON.stringify({ type: "audio", url: "https://passio-app.netlify.app/media/attachments/attachments/conv_1/2_voice.webm" }) },
    { from_id: U, content: "texte simple" },
    { from_id: AUTRE, content: JSON.stringify({ type: "media", url: "https://njki.supabase.co/storage/v1/object/public/attachments/attachments/conv_1/3_autre.jpg" }) },
  ];
  // Le PROPRIÉTAIRE de chaque objet, comme `storage.objects.owner` en production.
  const seaux = { content: {}, attachments: {
    "attachments/conv_1/1_photo.jpg": U, "attachments/conv_1/2_voice.webm": U, "attachments/conv_1/3_autre.jpg": AUTRE,
  } };
  for (const d of DOSSIERS_CONTENU) { seaux.content[`${d}/${U}/a.jpg`] = U; seaux.content[`${d}/${AUTRE}/b.jpg`] = AUTRE; }
  return { tables, seaux };
}

