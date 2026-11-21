// ═══════════════════════════════════════════════════════════════════════════
// JEU DE DONNÉES FICTIF — RENCONTRES IRL : DÉCOUVRIR (liste, carte, filtre)
// Complète outils/jeu/base.js. Tout est inventé (titres, lieux, personnes).
//
//   peupler(srv, ctx, { volume: "aucun" | "normal" | "gros" })
//     aucun  : table `events` vide (liste vide d'un compte connecté)
//     normal : 11 activités couvrant les états de la carte (aujourd'hui, en
//              cours, week-end, complète + file, annulée, payante, la mienne,
//              j'y vais, passée, sans coordonnées, au centre exact de Paris)
//     gros   : normal + 40 activités réparties sur 8 villes et 8 passions
// Colonnes = `_EVENT_COLS_PUBLIC` (js/app-08-ui-modals-tour.js ~5877).
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const base = require("./base");

const sansZ = (d) => d.toISOString().replace("Z", "");
// Jour J+n à hh:mm (heure locale du banc : Europe/Paris).
function a(jours, h, m) { const d = new Date(); d.setDate(d.getDate() + jours); d.setHours(h, m || 0, 0, 0); return d; }
// Prochain samedi (ou aujourd'hui si on est samedi) à hh:mm.
function samedi(h) { const d = new Date(); const n = (6 - d.getDay() + 7) % 7; d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d; }

const VILLES = {
  lyon: [45.764, 4.8357, "Lyon"], lyon6: [45.7712, 4.8526, "Lyon"], villeurbanne: [45.7719, 4.8902, "Villeurbanne"],
  grenoble: [45.1885, 5.7245, "Grenoble"], paris: [48.8566, 2.3522, "Paris"], marseille: [43.2965, 5.3698, "Marseille"],
  annecy: [45.8992, 6.1294, "Annecy"], nantes: [47.2184, -1.5536, "Nantes"], bordeaux: [44.8378, -0.5792, "Bordeaux"],
  lille: [50.6292, 3.0573, "Lille"], toulouse: [43.6047, 1.4442, "Toulouse"],
};

function peupler(srv, ctx, opts) {
  const { MOI, GENS, media } = ctx;
  const volume = (opts && opts.volume) || "normal";
  base.peupler(srv, ctx);
  if (volume === "aucun") return srv;

  const ev = (id, o) => {
    const [lat, lng, ville] = VILLES[o.v] || [null, null, o.ville || ""];
    const debut = o.debut, fin = o.fin || new Date(debut.getTime() + 2 * 3600 * 1000);
    srv.t.events.push(Object.assign({
      id, author_id: o.org.id, organizer_id: o.org.id, title: o.titre, passion_id: o.passion,
      lat: o.sansCoord ? null : lat, lng: o.sansCoord ? null : lng, city: o.ville || ville, emoji: o.emoji || null,
      date_at: sansZ(debut), end_at: sansZ(fin), description: o.desc || "Activité fictive du jeu d'audit.",
      venue: o.lieu || "", postal_code: "", price: o.prix == null ? 0 : o.prix, max_attendees: o.max || null,
      external_link: "", event_type: o.type || "Rencontre", cover_url: o.couv ? media(o.couv) : null,
      status: o.statut || "active", created_at: base.ilYA(60 * 24), updated_at: base.ilYA(60 * 24),
      co_organizers: [], series_id: null, recurrence: "none", conv_id: null,
    }));
    (o.inscrits || []).forEach(([u, rsvp], i) => srv.t.event_attendees.push({ event_id: id, user_id: u.id, rsvp: rsvp || "going", created_at: base.ilYA(300 - i * 20), checked_in_at: null }));
  };

  ev("ev_ird_01", { titre: "Atelier photo argentique au parc", passion: "photo", v: "lyon6", org: GENS.ines, debut: a(0, 18, 30), max: 10, couv: "couverture-evenement.jpg", lieu: "Parc de la Tête d'Or",
    inscrits: [[GENS.ines], [GENS.lea], [GENS.tom], [GENS.malik]], desc: "On shoote une pellicule ensemble puis on échange nos astuces." });
  ev("ev_ird_02", { titre: "Randonnée découverte des crêtes du Vercors avec pique-nique partagé et observation des chamois au coucher du soleil", passion: "sport", v: "grenoble", org: GENS.malik, debut: samedi(8), fin: samedi(18), max: 3, couv: "photo-panorama.jpg",
    inscrits: [[GENS.malik], [GENS.lea], [GENS.ines], [GENS.tom, "waitlist"]] });
  ev("ev_ird_03", { titre: "Soirée raclette entre passionnés", passion: "cuisine", v: "lyon", org: GENS.tom, debut: a(1, 19, 30), statut: "cancelled", couv: "photo-atelier.jpg", inscrits: [[GENS.tom]] });
  ev("ev_ird_04", { titre: "Cours de pâtes fraîches", passion: "cuisine", v: "villeurbanne", org: GENS.tom, debut: a(5, 14, 0), max: 8, prix: 15, type: "Atelier", couv: "photo-carre.jpg", inscrits: [[GENS.tom], [GENS.lea]] });
  ev("ev_ird_05", { titre: "Répétition ouverte de mon groupe", passion: "musique", v: "lyon", org: MOI, debut: a(10, 20, 0), max: 15, inscrits: [[MOI]] });
  ev("ev_ird_06", { titre: "Bœuf du jeudi au bar associatif", passion: "musique", v: "lyon", org: GENS.lea, debut: a(2, 21, 0), couv: "photo-paysage.jpg", inscrits: [[GENS.lea], [MOI], [GENS.malik, "maybe"]] });
  ev("ev_ird_07", { titre: "Club de lecture : romans d'aventure", passion: "litterature", v: "paris", org: GENS.long, debut: a(4, 19, 0), max: 12, inscrits: [[GENS.long]] });
  ev("ev_ird_08", { titre: "Jam photo de nuit (passée)", passion: "photo", v: "lyon", org: GENS.ines, debut: a(-2, 20, 0), couv: "photo-haute.jpg", inscrits: [[GENS.ines], [GENS.lea]] });
  ev("ev_ird_09", { titre: "Initiation salsa en plein air", passion: "danse", v: "lyon", org: GENS.lea, debut: new Date(Date.now() - 30 * 60000), fin: new Date(Date.now() + 90 * 60000), inscrits: [[GENS.lea], [GENS.tom]] });
  ev("ev_ird_10", { titre: "Croquis urbains au bord du lac", passion: "art", ville: "Annecy", sansCoord: true, org: GENS.long, debut: a(20, 10, 0), inscrits: [[GENS.long]] });
  ev("ev_ird_11", { titre: "Sortie voile découverte", passion: "sport", v: "marseille", org: GENS.malik, debut: a(12, 9, 0), inscrits: [[GENS.malik]] });

  if (volume === "gros") {
    const villes = ["lyon", "villeurbanne", "grenoble", "paris", "marseille", "nantes", "bordeaux", "lille", "toulouse", "annecy"];
    const passions = [["musique", "Jam"], ["photo", "Balade photo"], ["sport", "Footing"], ["cuisine", "Atelier cuisine"], ["art", "Atelier dessin"], ["jeuxvideo", "Soirée jeux"], ["yoga", "Yoga au parc"], ["danse", "Bal folk"]];
    const orgs = [GENS.lea, GENS.malik, GENS.ines, GENS.tom, GENS.long];
    for (let i = 0; i < 40; i++) {
      const v = villes[i % villes.length], [p, nom] = passions[i % passions.length];
      ev("ev_ird_g" + String(i).padStart(2, "0"), { titre: nom + " — " + VILLES[v][2] + " n°" + (i + 1), passion: p, v, org: orgs[i % orgs.length],
        debut: a(1 + (i % 25), 9 + (i % 12), (i % 2) * 30), max: i % 3 === 0 ? 6 + (i % 5) : null, couv: i % 4 === 0 ? "photo-carre.jpg" : null,
        inscrits: [[orgs[i % orgs.length]]] });
    }
  }
  return srv;
}

module.exports = { peupler, VILLES };
