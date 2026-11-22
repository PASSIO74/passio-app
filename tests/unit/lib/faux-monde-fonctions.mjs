// ═══════════════════════════════════════════════════════════════════════════
// LE FAUX MONDE DU DÉPLOIEMENT DES FONCTIONS — le réseau du job, remplacé par
// des fichiers (2026-11-21, banc tests/unit/deploiement-fonctions.test.mjs).
//
// Les scripts que joue `edge-functions.yml` parlent à trois hôtes : chaque
// fonction servie (sa révision, la fumée de private-media), et l'API de gestion
// de Supabase (les prérequis SQL). Ce module, chargé AVANT eux par
// `NODE_OPTIONS=--import=…`, remplace `fetch` par un monde tenu dans le dossier
// `PASSIO_FAUX_MONDE` : les scripts tournent tels qu'ils sont, sans crochet de
// test dans leur code.
//   · servies/<fonction>   la révision que sert la fonction (écrite par la
//                          fausse CLI à chaque `supabase functions deploy`) ;
//   · scenario.json        { absents: [spec…], reglage: true|false|null,
//                            courtierDit: bool, injoignables: [nom…],
//                            cibleIllisible: bool } ;
//   · reseau.log, specs.log  ce qui a été demandé — le banc le relit.
// private-media répond par le VRAI gestionnaire (_shared/medias-proteges.js) :
// la fumée éprouve le contrat réel, pas une copie.
// Tout autre appel LÈVE : un banc qui toucherait le réseau le dirait.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";

const ETAT = process.env.PASSIO_FAUX_MONDE;

function installer() {
  const lire = (f) => { try { return fs.readFileSync(path.join(ETAT, f), "utf8"); } catch (_e) { return ""; } };
  const scenario = () => JSON.parse(lire("scenario.json") || "{}");
  const noter = (f, ligne) => fs.appendFileSync(path.join(ETAT, f), ligne + "\n");

  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const methode = String(init.method || "GET").toUpperCase();
    const sc = scenario();
    noter("reseau.log", methode + " " + u.host + u.pathname);

    // L'API de gestion : la requête de prérequis, en lecture seule ou refusée.
    if (u.host === "api.supabase.com" && /^\/v1\/projects\/[a-z]{20}\/database\/query$/.test(u.pathname) && methode === "POST") {
      if (sc.cibleIllisible) return new Response("panne de l'API de gestion", { status: 500 });
      const requete = String(JSON.parse(init.body).query);
      if (!requete.startsWith("begin;\nset transaction read only;\n")) return new Response("écriture refusée par le banc", { status: 400 });
      const specs = [...requete.matchAll(/select '((?:[^']|'')*)' as spec/g)].map((m) => m[1].replace(/''/g, "'"));
      noter("specs.log", specs.join("\n"));
      const absents = new Set(sc.absents || []);
      const present = (spec) => (spec === "etat:medias_proteges.actif" ? sc.reglage === true
        : spec === "reglage:medias_proteges.actif:booleen" ? typeof sc.reglage === "boolean"
        : !absents.has(spec));
      return new Response(JSON.stringify(specs.map((spec) => ({ spec, present: present(spec) }))), { status: 201, headers: { "Content-Type": "application/json" } });
    }

    // Une fonction servie par la cible.
    const m = /^\/functions\/v1\/([a-z][a-z0-9-]*)(?:\/capabilities)?$/.exec(u.pathname);
    if (m && /^[a-z]{20}\.supabase\.co$/.test(u.host)) {
      const fonction = m[1];
      if ((sc.injoignables || []).includes(fonction)) throw new TypeError("fetch failed");
      const revision = lire("servies/" + fonction).trim();
      if (fonction === "private-media") {
        // Chargé à la demande : seule la fumée de private-media en a besoin, pas chaque script du job.
        const { createPrivateMediaHandler } = await import("../../../supabase/functions/_shared/medias-proteges.js");
        const gestionnaire = createPrivateMediaHandler({
          anonKey: "ANON_SYNTHETIQUE",
          createActor: () => ({
            verify: async () => false,
            sessionActive: async () => false,
            // Ce que DIT le courtier : le réglage en base, sauf scénario de divergence (`courtierDit`).
            enabled: async () => (typeof sc.courtierDit === "boolean" ? sc.courtierDit : sc.reglage === true),
          }),
        });
        const reponse = await gestionnaire(new Request(String(url), { method: methode, headers: init.headers || {} }));
        if (revision) reponse.headers.set("X-Passio-Revision", revision);
        return reponse;
      }
      return new Response(null, { status: methode === "OPTIONS" ? 200 : 401, headers: revision ? { "X-Passio-Revision": revision } : {} });
    }
    throw new Error("réseau interdit dans ce banc : " + methode + " " + url);
  };
}

if (ETAT) installer();
