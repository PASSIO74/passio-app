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
// `enVol` : la réponse d'`attendre_ecritures_en_vol` ({ en_vol_initial, restantes, attendu_ms }) ou "absente",
//   ou une FONCTION (numéro d'appel → réponse) pour faire échouer une tentative précise.
// `terminerRefuse` : `terminer_suppression` répond { ok:false, motif:"jeton_perime" } (une autre tentative a repris le compte).
//
// ⚠️ ASTRA-56 (sixième contre-revue, 2026-09-16) : `barriere: "modele"` remplace
// « il rend ce qu'on lui dit » par un MODÈLE DES TRANSITIONS SQL de
// `reclamer_suppression` / `terminer_suppression`, écrit d'après le texte de la
// migration — `modele: "v3"` (le correctif) ou `modele: "v2"` (le texte du
// 15/09, pour rejouer le contre-exemple). Ce modèle N'EST PAS la preuve : c'est
// `tests/sql/migration-barriere-suppression.test.sh` § ⑤ bis qui joue le même
// entrelacement sur PostgreSQL réel. Il sert à exercer, en Node et de façon
// déterministe, ce que purge-compte.js et suppression-compte.js FONT des
// réponses de chaque version — deux tentatives entrelacées comprises
// (`tests/unit/suppression-entrelacement.test.mjs`).
// Le modèle honore aussi le TRIGGER : `ecrire(table, ligne)` refuse tant que
// le marqueur est en `en_cours` / `purgee` / `supprimee` (le comportement de
// `refuser_ecriture_compte_en_suppression`).
export const MODELES_BARRIERE = ["v2", "v3"];
export function fauxAdmin({ tables = {}, seaux = {}, pannesDelete = [], pannesCount = [], pannesList = [], pannesRemove = [], rpc = "ok", pannesListApres = [], ecrituresTardives = {}, barriere = "ok", modele = "v3", enVol = { en_vol_initial: 0, restantes: 0, attendu_ms: 0 }, terminerRefuse = false, perimeMs = 15 * 60 * 1000, horloge = null } = {}) {
  const t = JSON.parse(JSON.stringify(tables));
  if (!MODELES_BARRIERE.includes(modele)) throw new Error("modèle de barrière inconnu : " + modele);
  const maintenant = () => (horloge ? horloge() : Date.now());
  let appelsEnVol = 0;
  const marqueur = () => (t.comptes_en_suppression || [])[0] || null;
  const protege = (l) => !!l && ["en_cours", "purgee", "supprimee"].includes(l.statut);
  // ── Le modèle : `reclamer_suppression` ──
  function modeleReclamer(uid, jeton, motif) {
    let l = marqueur();
    let acquise = false, raison = null;
    if (!l) {
      l = { user_id: uid, motif, statut: "en_cours", jeton, tentatives: 1, tentative_debut: maintenant(), tentative_fin: null,
            tentative_vivante: true, purge_terminee_le: null, supprimee_le: null, derniere_erreur: null };
      t.comptes_en_suppression = [l]; acquise = true;
    } else if (l.statut === "supprimee") { acquise = false; raison = "supprimee"; }
    else if (modele === "v2"
      ? (l.statut === "en_cours" && l.jeton !== jeton && l.tentative_debut > maintenant() - perimeMs)
      : (["en_cours", "purgee"].includes(l.statut) && l.jeton !== jeton && l.tentative_vivante && l.tentative_debut > maintenant() - perimeMs)) {
      acquise = false; raison = "vivante";
    } else {
      Object.assign(l, { statut: "en_cours", jeton, motif, tentatives: l.tentatives + 1, tentative_debut: maintenant(), tentative_fin: null, tentative_vivante: true, derniere_erreur: null });
      acquise = true;
    }
    const out = { acquise, statut: l.statut, jeton: l.jeton, tentatives: l.tentatives, tentative_debut: l.tentative_debut, purge_terminee_le: l.purge_terminee_le };
    if (modele === "v3") { out.motif = raison; out.donnees_deja_purgees = l.purge_terminee_le !== null; }
    return out;
  }
  // ── Le modèle : `terminer_suppression` ──
  function modeleTerminer(uid, jeton, statut, detail) {
    const admis = modele === "v2" ? ["echec", "purgee", "supprimee"] : ["echec", "purgee", "auth_echec", "supprimee"];
    if (!admis.includes(statut)) throw new Error("terminer_suppression : statut " + statut + " inconnu");
    const l = marqueur();
    if (!l || l.jeton !== jeton || !["en_cours", "purgee"].includes(l.statut)) {
      const out = { ok: false, motif: l ? "jeton_perime" : "inconnu", statut: l ? l.statut : null, jeton: l ? l.jeton : null };
      if (modele === "v3") { out.protection = protege(l); out.donnees_deja_purgees = !!l && l.purge_terminee_le !== null; }
      return out;
    }
    if (modele === "v2") {
      l.statut = statut; l.tentative_fin = maintenant();
      l.derniere_erreur = statut === "echec" ? detail : null;
      if (statut === "purgee" || statut === "supprimee") l.purge_terminee_le = l.purge_terminee_le || maintenant();
      if (statut === "supprimee") l.supprimee_le = maintenant();
      return { ok: true, statut: l.statut, jeton: l.jeton, supprimee_le: l.supprimee_le };
    }
    l.statut = statut === "supprimee" ? "supprimee" : (statut === "echec" && l.purge_terminee_le === null) ? "echec" : "purgee";
    l.tentative_vivante = statut === "purgee";
    l.tentative_fin = statut === "purgee" ? null : maintenant();
    l.derniere_erreur = (statut === "echec" || statut === "auth_echec") ? detail : null;
    if (["purgee", "auth_echec", "supprimee"].includes(statut)) l.purge_terminee_le = l.purge_terminee_le || maintenant();
    if (statut === "supprimee") l.supprimee_le = maintenant();
    return { ok: true, demande: statut, statut: l.statut, jeton: l.jeton, supprimee_le: l.supprimee_le, protection: protege(l), donnees_deja_purgees: l.purge_terminee_le !== null };
  }
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
    /** Le marqueur tel que le modèle le tient (null sans réclamation). */
    marqueur,
    /**
     * Une écriture d'un CLIENT (l'appelant, un tiers, l'anonyme) sur une table
     * du compte : refusée avec le code d'un refus RLS tant que le marqueur
     * protège — c'est le trigger `zz_barriere_suppression`, modélisé. Rend
     * { ok } ou { ok:false, code:"42501" } et, si ok, la ligne est écrite.
     */
    ecrire(table, ligne) {
      if (protege(marqueur())) return { ok: false, code: "42501", message: 'new row violates row-level security policy for table "' + table + '"' };
      (t[table] = t[table] || []).push(ligne);
      return { ok: true };
    },
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
            else if (barriere === "modele" && nom === RPC_RECLAMER) out = { data: modeleReclamer(args.p_uid, args.p_jeton, args.p_motif), error: null };
            else if (barriere === "modele" && nom === RPC_TERMINER) {
              try { out = { data: modeleTerminer(args.p_uid, args.p_jeton, args.p_statut, args.p_detail), error: null }; }
              catch (e) { out = { data: null, error: { message: e.message } }; }
            }
            else if (nom === RPC_ATTENDRE && typeof enVol === "function") { appelsEnVol++; out = { data: enVol(appelsEnVol), error: null }; }
            else if (nom === RPC_RECLAMER) {
              const acquise = barriere === "ok";
              const statut = barriere === "supprimee" ? "supprimee" : "en_cours";
              if (acquise) { t.comptes_en_suppression = [{ user_id: args.p_uid, statut: "en_cours", jeton: args.p_jeton, tentatives: 1 }]; }
              out = { data: { acquise, statut, jeton: acquise ? args.p_jeton : "autre", tentatives: 1 }, error: null };
            } else if (nom === RPC_ATTENDRE) {
              out = enVol === "absente" ? { data: null, error: { code: "PGRST202", message: "Could not find the function public." + nom + " in the schema cache" } } : { data: enVol, error: null };
            } else {
              if (terminerRefuse) out = { data: { ok: false, motif: "jeton_perime", statut: "en_cours", jeton: "autre" }, error: null };
              else {
                // Le faux « docile » (hors modèle) : il écrit le statut demandé, en
                // appliquant la seule règle de nommage de la v3 (`auth_echec` est un
                // ÉVÉNEMENT, le statut écrit est `purgee`).
                const l = (t.comptes_en_suppression || [])[0];
                const ecrit = args.p_statut === "auth_echec" ? "purgee" : args.p_statut;
                if (l) { l.statut = ecrit; l.detail = args.p_detail; }
                out = { data: { ok: true, demande: args.p_statut, statut: ecrit, jeton: args.p_jeton, protection: ecrit !== "echec", donnees_deja_purgees: ecrit !== "echec" }, error: null };
              }
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

