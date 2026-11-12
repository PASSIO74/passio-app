// ═══════════════════════════════════════════════════════════════════════════
// UNE BASE EN MÉMOIRE qui parle comme supabase-js (2026-11-12).
//
// Les bancs « chemins » des autres fonctions doublent leurs modules partagés :
// ils éprouvent le câblage. Celui de `pilotage` doit éprouver davantage — la
// veille lit dix sources, décide, écrit son état, sonne — et un câblage juste
// autour d'une décision fausse reste une alerte perdue. Il charge donc les VRAIS
// modules partagés, et il leur faut une base qui réponde : celle-ci.
//
// Ce qu'elle imite, et pas plus : le constructeur de requêtes de supabase-js
// (`from().select().eq()…`, `insert`, `upsert`, `update`, `delete`, `rpc`),
// l'authentification (`auth.getUser`, `auth.admin.listUsers`, `getUserById`),
// les chemins JSON de PostgREST (`meta->>pid`, alias `pid:meta->>pid`), le
// compte (`{ count: "exact", head: true }`), le plafond de lignes (`maxLignes`,
// 1 000 comme le projet) et le refus d'une clé primaire en double (23505) —
// l'instruction ENTIÈRE est refusée, comme en base : c'est ce qui fait tenir
// un créneau atomique.
// Ce qu'elle n'imite PAS : la RLS, les déclencheurs, les types. Une méthode que
// le code appellerait et qu'elle ne connaît pas LÈVE : jamais un succès inventé.
//
// Pannes : `base.panne = (requete) => erreur | null`, consultée à chaque
// exécution — une table illisible, une écriture refusée, un délai dépassé.
// Journal : `base.journal`, une entrée par requête exécutée (table, type,
// filtres, clé du client) — pour dire « rien n'a été écrit » ou « sous la clé
// de service », jamais pour deviner.
// ═══════════════════════════════════════════════════════════════════════════

const CLES_PRIMAIRES = { analytics_events: "id", reglages_distants: "cle", push_subscriptions: "endpoint" };
export const MAX_LIGNES = 1000;

const estNombre = (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) && !/[-:TZ]/.test(v.slice(1)));
const dateDe = (v) => (typeof v === "string" && /^\d{4}-\d\d-\d\d/.test(v) ? Date.parse(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(v) ? v : v.replace(" ", "T") + "Z") : NaN);

/** La valeur d'une « colonne » PostgREST : `col`, `col->cle`, `col->>cle` (texte). */
export function valeur(ligne, expression) {
  const morceaux = String(expression).split(/(->>|->)/);
  let v = ligne == null ? undefined : ligne[morceaux[0].trim()];
  for (let i = 1; i < morceaux.length; i += 2) {
    const cle = morceaux[i + 1].trim().replace(/^'|'$/g, "");
    v = v != null && typeof v === "object" ? v[cle] : undefined;
    if (morceaux[i] === "->>" && v != null) v = typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  return v === undefined ? null : v;
}

function comparer(a, b) {
  if (estNombre(a) && estNombre(b)) return Number(a) - Number(b);
  const da = dateDe(a), db = dateDe(b);
  if (Number.isFinite(da) && Number.isFinite(db)) return da - db;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
const egal = (a, b) => a != null && b != null && (comparer(a, b) === 0);

const OPERATEURS = {
  eq: (a, b) => egal(a, b),
  neq: (a, b) => a != null && !egal(a, b),
  gt: (a, b) => a != null && comparer(a, b) > 0,
  gte: (a, b) => a != null && comparer(a, b) >= 0,
  lt: (a, b) => a != null && comparer(a, b) < 0,
  lte: (a, b) => a != null && comparer(a, b) <= 0,
  in: (a, liste) => a != null && liste.some((x) => egal(a, x)),
  is: (a, b) => (b === null ? a == null : a === b),
};

// `status.is.null,status.eq.open` : la seule forme d'`or` que le dépôt écrit.
function filtreOu(expression) {
  const termes = String(expression).split(",").map((t) => {
    const m = /^([\w>'-]+)\.(\w+)\.(.*)$/.exec(t.trim());
    if (!m || !Object.hasOwn(OPERATEURS, m[2])) throw new Error("fausse-base : `or` non simulé : " + t);
    const v = m[3] === "null" ? null : m[3] === "true" ? true : m[3] === "false" ? false : m[3];
    return (l) => OPERATEURS[m[2]](valeur(l, m[1]), v);
  });
  return (l) => termes.some((f) => f(l));
}

function projeter(ligne, colonnes) {
  if (!colonnes || colonnes.trim() === "*") return structuredClone(ligne);
  const out = {};
  for (const brut of colonnes.split(",")) {
    const c = brut.trim();
    if (!c) continue;
    const i = c.indexOf(":");
    const [alias, expr] = i > 0 && !c.slice(0, i).includes("-") ? [c.slice(0, i).trim(), c.slice(i + 1).trim()] : [null, c];
    const v = valeur(ligne, expr);
    out[alias || expr.split(/->>|->/).pop().trim()] = v != null && typeof v === "object" ? structuredClone(v) : v;
  }
  return out;
}

class Requete {
  constructor(base, client, table) {
    this.base = base; this.client = client; this.table = table;
    this.type = "select"; this.colonnes = "*"; this.options = {}; this.filtres = []; this.descriptions = [];
    this.ordres = []; this.plafond = null; this.plage = null; this.lignes = null; this.valeurs = null; this.retour = null;
  }
  select(colonnes = "*", options = {}) {
    if (this.type === "select") { this.colonnes = colonnes; this.options = options || {}; } else this.retour = colonnes;
    return this;
  }
  insert(lignes) { this.type = "insert"; this.lignes = (Array.isArray(lignes) ? lignes : [lignes]).map((l) => structuredClone(l)); return this; }
  upsert(lignes, options = {}) { this.type = "upsert"; this.lignes = (Array.isArray(lignes) ? lignes : [lignes]).map((l) => structuredClone(l)); this.options = options || {}; return this; }
  update(valeurs) { this.type = "update"; this.valeurs = structuredClone(valeurs); return this; }
  delete() { this.type = "delete"; return this; }
  _filtre(nom, colonne, v) {
    this.descriptions.push([nom, colonne, v]);
    this.filtres.push((l) => OPERATEURS[nom](valeur(l, colonne), v));
    return this;
  }
  eq(c, v) { return this._filtre("eq", c, v); }
  neq(c, v) { return this._filtre("neq", c, v); }
  gt(c, v) { return this._filtre("gt", c, v); }
  gte(c, v) { return this._filtre("gte", c, v); }
  lt(c, v) { return this._filtre("lt", c, v); }
  lte(c, v) { return this._filtre("lte", c, v); }
  in(c, liste) { return this._filtre("in", c, Array.isArray(liste) ? liste : []); }
  is(c, v) { return this._filtre("is", c, v); }
  not(c, operateur, v) {
    if (!Object.hasOwn(OPERATEURS, operateur)) throw new Error("fausse-base : `not." + operateur + "` non simulé");
    this.descriptions.push(["not." + operateur, c, v]);
    this.filtres.push((l) => !OPERATEURS[operateur](valeur(l, c), v));
    return this;
  }
  or(expression) { this.descriptions.push(["or", expression]); this.filtres.push(filtreOu(expression)); return this; }
  order(colonne, { ascending = true } = {}) { this.ordres.push([colonne, ascending]); return this; }
  limit(n) { this.plafond = n; return this; }
  range(de, a) { this.plage = [de, a]; return this; }
  then(ok, ko) { return this._executer().then(ok, ko); }

  async _executer() {
    const { base } = this;
    const trace = { table: this.table, type: this.type, filtres: this.descriptions, colonnes: this.colonnes, cle: this.client.cle, lignes: this.lignes, valeurs: this.valeurs };
    base.journal.push(trace);
    const refus = base.panne ? base.panne(trace) : null;
    if (refus) return { data: null, error: refus, count: null };
    const lignes = base.table(this.table);
    const garde = (l) => this.filtres.every((f) => f(l));
    const pk = CLES_PRIMAIRES[this.table] || "id";
    if (this.type === "insert" || this.type === "upsert") {
      const conflit = this.type === "upsert" ? (this.options.onConflict || pk) : pk;
      const neuves = this.lignes.map((l) => ({ ...(pk === "id" && l.id == null ? { id: crypto.randomUUID() } : {}), created_at: new Date(base.maintenant()).toISOString(), ...l }));
      // L'instruction ENTIÈRE est refusée sur un doublon : aucune de ses lignes n'entre.
      if (this.type === "insert") {
        const vus = new Set(lignes.map((l) => String(l[pk])));
        for (const n of neuves) {
          if (n[pk] != null && vus.has(String(n[pk]))) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" }, count: null };
          vus.add(String(n[pk]));
        }
        lignes.push(...neuves);
      } else {
        for (const n of neuves) {
          const i = lignes.findIndex((l) => egal(l[conflit], n[conflit]));
          if (i >= 0) lignes[i] = { ...lignes[i], ...n }; else lignes.push(n);
        }
      }
      return { data: this.retour ? neuves.map((l) => projeter(l, this.retour)) : null, error: null, count: null };
    }
    if (this.type === "update") {
      const touchees = lignes.filter(garde);
      for (const l of touchees) Object.assign(l, structuredClone(this.valeurs));
      return { data: this.retour ? touchees.map((l) => projeter(l, this.retour)) : null, error: null, count: null };
    }
    if (this.type === "delete") {
      const restent = lignes.filter((l) => !garde(l));
      base.tables.set(this.table, restent);
      return { data: null, error: null, count: null };
    }
    let lues = lignes.filter(garde);
    const total = lues.length;
    if (this.options.head) return { data: null, error: null, count: this.options.count ? total : null };
    for (const [colonne, croissant] of [...this.ordres].reverse()) {
      lues = [...lues].sort((x, y) => (croissant ? 1 : -1) * comparer(valeur(x, colonne) ?? "", valeur(y, colonne) ?? ""));
    }
    if (this.plage) lues = lues.slice(this.plage[0], this.plage[1] + 1);
    // max-rows du projet : PostgREST ne rend jamais plus, quoi que demande `.limit()`.
    lues = lues.slice(0, Math.min(this.plafond ?? Infinity, base.maxLignes));
    return { data: lues.map((l) => projeter(l, this.colonnes)), error: null, count: this.options.count ? total : null };
  }
}

/**
 * Une base neuve. `tables` : { nom: lignes } ; `utilisateurs` : les comptes Auth
 * (`{ id, email, email_confirmed_at, created_at, … }`) ; `sessions` : { jeton: compte }.
 */
export function creerBase({ tables = {}, utilisateurs = [], sessions = {}, rpc = {}, maintenant = () => Date.now(), maxLignes = MAX_LIGNES } = {}) {
  const base = {
    tables: new Map(Object.entries(tables).map(([n, l]) => [n, l.map((x) => structuredClone(x))])),
    utilisateurs: utilisateurs.map((u) => structuredClone(u)), sessions: { ...sessions }, rpc: { ...rpc },
    maintenant, maxLignes, panne: null, panneAuth: null, journal: [], clients: [], appelsAuth: [],
    table(nom) { if (!this.tables.has(nom)) this.tables.set(nom, []); return this.tables.get(nom); },
    /** Ajoute des lignes telles quelles (décor) : `created_at` posé s'il manque. */
    semer(nom, lignes) {
      const pk = CLES_PRIMAIRES[nom] || "id";
      this.table(nom).push(...lignes.map((l) => ({ ...(pk === "id" && l.id == null ? { id: crypto.randomUUID() } : {}), created_at: new Date(maintenant()).toISOString(), ...structuredClone(l) })));
    },
    /** Les requêtes exécutées sur une table (et d'un type, s'il est donné). */
    requetes(nom, type = null) { return this.journal.filter((r) => r.table === nom && (!type || r.type === type)); },
    ecritures(nom = null) { return this.journal.filter((r) => r.type !== "select" && r.type !== "rpc" && (!nom || r.table === nom)); },
    /** Le client que `createClient(url, cle, options)` rendrait. */
    client(url, cle, options = {}) {
      const jeton = String(((options.global || {}).headers || {}).Authorization || "").replace(/^Bearer\s+/i, "");
      const c = {
        url, cle, options,
        from: (nom) => new Requete(base, c, nom),
        rpc: (nom, args = {}) => ({
          then: (ok, ko) => (async () => {
            const trace = { table: "rpc:" + nom, type: "rpc", args, cle };
            base.journal.push(trace);
            const refus = base.panne ? base.panne(trace) : null;
            if (refus) return { data: null, error: refus };
            // Une fonction SQL absente (migration pas encore appliquée) : PGRST202, comme PostgREST.
            if (!Object.hasOwn(base.rpc, nom)) return { data: null, error: { code: "PGRST202", message: "Could not find the function public." + nom + " in the schema cache" } };
            const r = typeof base.rpc[nom] === "function" ? await base.rpc[nom](args) : base.rpc[nom];
            return r && typeof r === "object" && ("data" in r || "error" in r) ? { data: r.data ?? null, error: r.error ?? null } : { data: r, error: null };
          })().then(ok, ko),
        }),
        auth: {
          getUser: async () => {
            base.appelsAuth.push({ quoi: "getUser", cle });
            const u = Object.hasOwn(base.sessions, jeton) ? base.sessions[jeton] : null;
            return u ? { data: { user: structuredClone(u) }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
          },
          admin: {
            // GoTrue rend les comptes du plus récent au plus ancien, par pages.
            listUsers: async ({ page = 1, perPage = 50 } = {}) => {
              base.appelsAuth.push({ quoi: "listUsers", page, perPage, cle });
              const refus = base.panneAuth ? base.panneAuth({ quoi: "listUsers", page }) : null;
              if (refus) return { data: { users: [] }, error: refus };
              const tries = [...base.utilisateurs].sort((x, y) => Date.parse(y.created_at || 0) - Date.parse(x.created_at || 0));
              return { data: { users: tries.slice((page - 1) * perPage, page * perPage).map((u) => structuredClone(u)) }, error: null };
            },
            getUserById: async (id) => {
              base.appelsAuth.push({ quoi: "getUserById", id, cle });
              const refus = base.panneAuth ? base.panneAuth({ quoi: "getUserById", id }) : null;
              if (refus) return { data: { user: null }, error: refus };
              const u = base.utilisateurs.find((x) => x.id === id);
              return u ? { data: { user: structuredClone(u) }, error: null } : { data: { user: null }, error: { status: 404, message: "User not found" } };
            },
          },
        },
      };
      base.clients.push(c);
      return c;
    },
  };
  return base;
}
