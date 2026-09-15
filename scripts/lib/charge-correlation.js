"use strict";
// ═══════════════════════════════════════════════════════════════════════════
// CORRÉLATION HTTP ↔ WEBSOCKET DU BANC DE CHARGE — ASTRA-37 (15/09/2026)
//
// LE DÉFAUT. `scripts/charge.mjs` mesurait « insert → reçu » ainsi :
//
//     const m = await mesurer("publier", …POST…);      // ① la réponse HTTP
//     if (m.ok && rt) { const ms = await ecoute.attendre(id, t0); }  // ② l'attente
//
// L'attente était donc enregistrée APRÈS la réponse HTTP. Et le récepteur
// jetait EN SILENCE tout événement sans attente :
//
//     const a = rec && attentes.get(rec.id);
//     if (a) { … }                                    // sinon : rien
//
// Or le trigger de diffusion part DANS la transaction de l'INSERT : l'événement
// peut arriver AVANT que la réponse HTTP ne revienne. Le banc comptait donc
// « non reçu en 10 s » très exactement les cas les PLUS RAPIDES — il pénalisait
// ce qu'il était censé récompenser, et le faisait d'autant plus que le serveur
// répondait vite.
//
// ⚠️ CE QUE CE MODULE NE DIT PAS, ET NE DOIT PAS DIRE. Il ne permet pas de
// conclure que les 27 et 5 événements manquants des runs précédents étaient des
// faux négatifs du banc : les traces conservées ne le tranchent pas, et une
// perte serveur reste possible. Il rend seulement les mesures À VENIR
// interprétables — et il SÉPARE désormais les deux causes, ce qu'aucune trace
// ancienne ne permet de faire après coup.
// ═══════════════════════════════════════════════════════════════════════════

class Correlateur {
  constructor(options) {
    const o = options || {};
    this.delai = o.delai || 10000;
    this.horloge = o.horloge || (() => Date.now());
    this.minuteur = o.minuteur || setTimeout;
    this.annuler = o.annulerMinuteur || clearTimeout;
    this.attentes = new Map();
    // ⚠️ LE TAMPON DES ARRIVÉES PRÉCOCES. Un événement reçu avant son armement
    // n'est plus jeté : il attend ici. C'est la moitié du correctif — l'autre
    // est d'armer avant d'émettre. Les deux, parce que l'armement avant l'envoi
    // ne ferme pas la fenêtre entre `armer` et l'écriture réelle en base.
    this.precoces = new Map();
    this.bilan = { armes: 0, recus: 0, precoces: 0, expires: 0, orphelins: 0, doublons: 0 };
    this.evenements = [];
  }

  // Armer AVANT d'émettre. `meta` porte l'acteur et tout ce qui rend la mesure
  // relisable : un identifiant seul ne dit pas QUI a écrit, ni QUAND.
  armer(id, t0, meta) {
    this.bilan.armes++;
    const deja = this.precoces.get(id);
    if (deja !== undefined) {
      // Arrivé avant l'armement : on le compte comme REÇU, et on le DIT — ce
      // n'est pas la même chose qu'un événement reçu après.
      this.precoces.delete(id);
      this.bilan.recus++; this.bilan.precoces++;
      const ms = Math.max(0, deja - t0);
      this.evenements.push({ id, ms, etat: "recu_avant_reponse", ...(meta || {}) });
      return Promise.resolve({ ok: true, ms, precoce: true });
    }
    return new Promise((res) => {
      const m = this.minuteur(() => {
        this.attentes.delete(id);
        this.bilan.expires++;
        this.evenements.push({ id, ms: null, etat: "non_recu", ...(meta || {}) });
        res({ ok: false, ms: null, motif: "événement non reçu en " + Math.round(this.delai / 1000) + " s" });
      }, this.delai);
      this.attentes.set(id, { resoudre: res, minuteur: m, t0, meta: meta || {} });
    });
  }

  // Un événement arrive. Il est TOUJOURS enregistré : reçu, précoce, ou
  // orphelin — jamais jeté sans laisser de trace.
  recevoir(id, t) {
    const a = this.attentes.get(id);
    if (a) {
      this.attentes.delete(id);
      this.annuler(a.minuteur);
      this.bilan.recus++;
      const ms = Math.max(0, t - a.t0);
      this.evenements.push({ id, ms, etat: "recu", ...a.meta });
      a.resoudre({ ok: true, ms, precoce: false });
      return "recu";
    }
    if (this.precoces.has(id)) { this.bilan.doublons++; this.evenements.push({ id, ms: null, etat: "doublon" }); return "doublon"; }
    // Pas encore armé : soit l'armement arrive juste après (précoce), soit il
    // n'arrivera jamais (orphelin). On garde, et le bilan tranchera à la fin.
    this.precoces.set(id, t);
    return "en_avance";
  }

  // À la fermeture : ce qui est resté dans le tampon n'a jamais été armé.
  // ⚠️ Un orphelin n'est PAS une erreur du serveur : c'est un événement que le
  // banc n'attendait pas (un autre acteur, un reste d'un palier précédent).
  // Le taire ferait disparaître un signal ; le compter comme un échec ferait
  // mentir la mesure. On le nomme.
  cloturer() {
    for (const [id, t] of this.precoces) { this.bilan.orphelins++; this.evenements.push({ id, ms: null, etat: "orphelin", recu_a: t }); }
    this.precoces.clear();
    for (const [id, a] of this.attentes) {
      this.annuler(a.minuteur);
      this.bilan.expires++;
      this.evenements.push({ id, ms: null, etat: "non_recu_a_la_fermeture", ...a.meta });
      a.resoudre({ ok: false, ms: null, motif: "canal fermé avant réception" });
    }
    this.attentes.clear();
    return this.resume();
  }

  resume() {
    const b = this.bilan;
    return {
      ...b,
      // ⚠️ LE TAUX SE CALCULE SUR CE QUI A ÉTÉ ARMÉ, jamais sur ce qui a été
      // reçu : « p95 des seuls reçus » n'est pas « p95 de livraison ».
      taux_reception: b.armes ? b.recus / b.armes : null,
      complet: b.armes > 0 && b.recus + b.expires === b.armes,
    };
  }
}

module.exports = { Correlateur };
