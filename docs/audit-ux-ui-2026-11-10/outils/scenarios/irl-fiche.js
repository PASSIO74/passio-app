// ═══════════════════════════════════════════════════════════════════════════
// RENCONTRES IRL — FICHE, PARTICIPATION, ORGANISATION (clé irl-fiche)
// Surfaces IRL-100…, constats IRL-C50…. Données : outils/jeu/irl-fiche.js.
// La fiche s'ouvre par `openEventDetails(id)` (porte du fil déjà capturée par
// le parcours cœur, PCS-001/PCS-008) ; tous les gestes de participation sont
// de VRAIS appuis sur le pied de fiche `#eventDetailCta .v4b-rsvp`.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const jeu = require("../jeu/irl-fiche");

const COMPTE = { mode: "compte", peupler: (s, c) => jeu.peupler(s, c) };

async function ouvrir(page, id) {
  await page.waitForTimeout(1800);
  await page.evaluate((i) => { try { closeModal(); } catch (e) {} try { closeEventDetail(); } catch (e) {} openEventDetails(i); }, id);
  await page.waitForTimeout(1400);
}
async function defiler(page, sec, decalage) {
  await page.evaluate(([s, d]) => {
    const el = document.querySelector('#eventDetailContent [data-v4b-sec="' + s + '"]');
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    let p = el.parentElement; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement;
    if (p && d) p.scrollTop += d;
  }, [sec, decalage || 0]);
  await page.waitForTimeout(500);
}
async function modale(page, code) {
  await page.evaluate(() => { try { closeModal(); } catch (e) {} });
  await page.waitForTimeout(300);
  await page.evaluate(code);
  await page.waitForTimeout(1000);
}

// Maquette commune : pied de fiche APRÈS inscription (constats IRL-C50, IRL-C52 ; prolonge PCS-C03).
const CSS_PIED = `.audit-if-ok{padding:12px 14px;border-radius:16px;background:#e9f8ef;border:1px solid #bfe8d0;color:#0b5a33;font:600 13.5px/1.35 system-ui;display:flex;gap:10px;align-items:flex-start;margin-bottom:8px}
.audit-if-ok b{display:block;font:800 15px/1.3 var(--v2-titre,system-ui);color:#06452a}
.audit-if-suite{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.audit-if-suite button{min-height:48px;border-radius:14px;border:1px solid var(--accent-tile-line,#d2c2fb);background:var(--accent-tile,#f3eeff);color:var(--accent,#6d32f4);font:700 12.5px/1.15 system-ui;padding:4px 6px}
.audit-if-suite button.plein{grid-column:1/-1;background:var(--v4b-coral-texte,#c13d28);color:#fff;border-color:transparent;font-size:15px}
.audit-if-retirer-haut{display:block;margin:0 auto 6px;min-height:44px;background:none;border:0;color:var(--muted);font:600 13px system-ui;text-decoration:underline}`;
async function jsPied(p) {
  await p.evaluate(() => {
    const pied = document.querySelector("#eventDetailCta .v4b-rsvp");
    if (!pied) return;
    const lien = pied.querySelector(".v4b-rsvp-retirer");
    const etat = pied.querySelector(".v4b-rsvp-etat");
    if (etat) etat.style.display = "none";
    const bloc = document.createElement("div");
    bloc.innerHTML = '<div class="audit-if-ok" role="status"><span aria-hidden="true">✓</span><span><b>C\'est noté, tu participes</b>Mercredi 18 nov. · 18:30 — l\'organisatrice est prévenue.</span></div>'
      + '<div class="audit-if-suite"><button class="plein">Écrire aux participants</button><button>Ajouter au calendrier</button><button>Itinéraire</button><button>Inviter</button></div>';
    pied.insertBefore(bloc, pied.firstChild);
    if (lien) { lien.textContent = "Je ne peux plus venir"; lien.style.marginTop = "6px"; }
  });
  await p.waitForTimeout(300);
}

module.exports = {
  domaine: "irl-fiche",
  scenarios: [
    // ── A. Fiche d'une activité à venir (lecture) ──────────────────────────
    {
      nom: "fiche-avenir",
      demarrage: COMPTE,
      vues: ["m390", "m360", "t768", "d1440"],
      async derouler({ page, prendre }) {
        await ouvrir(page, "ev_if_avenir");
        await prendre({
          id: "IRL-101", titre: "Fiche d'activité à venir — haut de fiche",
          note: "Couverture, passion, titre, bloc « Le rendez-vous » (jour, heure, ville, places), organisateur, description, puis le pied fixe « Je participe ».",
          zooms: [{ nom: "rdv", titre: "Bloc « Le rendez-vous »", sel: ".v4b-rdv", marge: 10 }, { nom: "pied", titre: "Pied de fiche", sel: "#eventDetailCta", marge: 4 }],
        });
        await defiler(page, "infos");
        await prendre({
          id: "IRL-102", titre: "Fiche — infos pratiques, participants, discussion",
          seulement: ["m390", "m360"],
          note: "Adresse et lien Google Maps (sur le banc l'adresse est lisible par tous : la RPC adresses_activites n'existe pas sur le faux serveur, le repli lit la colonne). Participants avec « +N », bouton « Discussion des participants · réservée à celles et ceux qui viennent ».",
          zooms: [{ nom: "discussion", titre: "Bouton de discussion avant inscription", sel: "[data-v4b-sec=discussion]", marge: 8 }],
        });
        await defiler(page, "echanges");
        await prendre({
          id: "IRL-103", titre: "Fiche — échanges et « Autres actions » (bas de fiche)",
          seulement: ["m390"],
          note: "Réactions, commentaires, puis « Autres actions » : Ajouter au calendrier, Partager, Inviter, Signaler. Partager existe aussi en haut de fiche et dans la barre d'échanges.",
          annotationsAvant: [
            { n: 1, sel: "[data-v4b-sec=secondaire] .v4b-sec-titre", texte: "Calendrier et Inviter — les deux gestes utiles après l'inscription — sont rangés tout en bas, sous les commentaires." },
            { n: 2, sel: "[data-v4b-sec=echanges] .post-action[title=Partager]", texte: "Partager : troisième occurrence sur la même fiche." },
          ],
        });
      },
    },

    // ── B. S'inscrire : confirmation, double appui, discussion, retrait ────
    {
      nom: "participer",
      demarrage: COMPTE,
      vues: ["m390", "m360"],
      async derouler({ page, prendre, serveur, MOI }) {
        await ouvrir(page, "ev_if_payante");
        const b = await page.locator("[data-v4b-rsvp-go]").boundingBox();
        const x = b.x + b.width / 2, y = b.y + b.height / 2;
        await page.touchscreen.tap(x, y);
        await page.waitForTimeout(400);
        const sous = await page.evaluate(([px, py]) => { const e = document.elementFromPoint(px, py); return e ? e.className : null; }, [x, y]);
        await prendre({
          id: "IRL-110", titre: "Juste après « Je participe » — ce qui se trouve sous le doigt",
          note: "Mesuré : 400 ms après l'appui, l'élément sous le point d'appui (" + Math.round(x) + ", " + Math.round(y) + ") est `" + sous + "` — le lien « Retirer ma participation » a pris la place exacte du bouton. Aucun toast ; une notification interne « Tu rejoins … » est ajoutée au centre de notifications. Ligne serveur : " + JSON.stringify(serveur.t.event_attendees.filter((a) => a.event_id === "ev_if_payante" && a.user_id === MOI.id).map((a) => a.rsvp)) + ".",
          zooms: [{ nom: "pied", titre: "Pied de fiche après inscription", sel: "#eventDetailCta", marge: 4 }],
          annotationsAvant: [
            { n: 1, sel: "#eventDetailCta .v4b-rsvp-retirer", texte: "« Retirer ma participation » occupe la place du bouton qu'on vient de toucher : un second appui désinscrit." },
            { n: 2, sel: "#eventDetailCta .v4b-rsvp-etat", texte: "État « ✓ Je participe » : rien ne confirme ni ne propose la suite (PCS-C03)." },
          ],
          apres: { css: CSS_PIED, js: jsPied, zooms: [{ nom: "pied", titre: "Pied de fiche proposé", sel: "#eventDetailCta", marge: 4 }] },
          annotations: [
            { n: 1, sel: ".audit-if-ok", texte: "Confirmation explicite, datée, `role=status`." },
            { n: 2, sel: ".audit-if-suite .plein", texte: "L'étape suivante du passage au réel occupe la place du bouton touché : un second appui ouvre la discussion au lieu de désinscrire." },
            { n: 3, sel: ".audit-if-suite button:nth-child(2)", texte: "Calendrier, itinéraire, inviter : fonctions existantes remontées depuis « Autres actions »." },
            { n: 4, sel: "#eventDetailCta .v4b-rsvp-retirer", texte: "Le retrait reste disponible, à l'écart, du point de vue de la personne." },
          ],
        });
        // Second appui au même endroit : désinscription involontaire.
        await page.touchscreen.tap(x, y);
        await page.waitForTimeout(2200);
        const toasts = await page.evaluate(() => (window.__toasts || []).map((t) => t.msg));
        await prendre({
          id: "IRL-111", titre: "Second appui au même endroit (≈ 0,5 s plus tard) : désinscrit·e",
          note: "Mesuré : toasts " + JSON.stringify(toasts) + " ; lignes serveur après coup : " + JSON.stringify(serveur.t.event_attendees.filter((a) => a.event_id === "ev_if_payante" && a.user_id === MOI.id).map((a) => a.rsvp)) + ". Requêtes : PATCH puis POST (inscription) puis DELETE (retrait).",
          zooms: [{ nom: "pied", titre: "Pied de fiche revenu à « Je participe »", sel: "#eventDetailCta", marge: 4 }],
          seulement: ["m390"],
        });
        // Réinscription puis tentative d'ouvrir la discussion.
        await page.locator("[data-v4b-rsvp-go]").click();
        await page.waitForTimeout(2000);
        await defiler(page, "discussion", -120);
        await page.locator("[data-v4b-sec=discussion] button").first().click();
        await page.waitForTimeout(900);
        await prendre({
          id: "IRL-112", titre: "Inscrit·e → « Discussion des participants » : « indisponible hors connexion », en ligne",
          seulement: ["m390"],
          note: "L'activité n'a pas encore de discussion (conv_id nul : l'organisatrice ne l'a pas ouverte). Seul un gestionnaire peut la créer (`_joinEventConversation`, app-07:3845-3851) ; le participant reçoit « Ouverture de la discussion… » puis « Discussion indisponible hors connexion » (app-07:3907-3910) alors que l'appareil est en ligne. Toasts : " + JSON.stringify(await page.evaluate(() => (window.__toasts || []).slice(-2).map((t) => t.msg))),
          zooms: [{ nom: "toast", titre: "Message affiché", sel: ".toast, #toast, .toast-container", marge: 6 }],
        });
        // Retrait volontaire.
        await page.evaluate(() => { const p = document.querySelector("#eventDetailCta .v4b-rsvp-retirer"); if (p) p.scrollIntoView(); });
        await page.locator("#eventDetailCta .v4b-rsvp-retirer").click();
        await page.waitForTimeout(1200);
        await prendre({
          id: "IRL-113", titre: "« Retirer ma participation » : retrait immédiat, toast « Désinscrit »",
          seulement: ["m390"],
          note: "Aucune confirmation ni annulation possible ; le message dit « Désinscrit » (troisième mot pour le même état : participer / venir / inscrit).",
        });
      },
    },

    // ── C. Complet : liste d'attente et refus serveur ──────────────────────
    {
      nom: "complet",
      demarrage: COMPTE,
      vues: ["m390"],
      async derouler({ page, prendre, serveur, GENS }) {
        await ouvrir(page, "ev_if_complete");
        await prendre({
          id: "IRL-120", titre: "Activité complète — « Rejoindre la liste d'attente »",
          note: "Le libellé dit la conséquence AVANT le geste ; le bloc rendez-vous écrit « complet · 2 en liste d'attente ».",
          zooms: [{ nom: "rdv", titre: "Places et liste d'attente", sel: ".v4b-rdv", marge: 8 }],
        });
        await page.locator("[data-v4b-rsvp-go]").click();
        await page.waitForTimeout(2000);
        await prendre({
          id: "IRL-121", titre: "Après « Rejoindre la liste d'attente » — état « Sur liste d'attente »",
          note: "Toasts : « C'est complet — tu es sur liste d'attente » puis « Liste d'attente ». Le pied dit « Sur liste d'attente » sans dire ce qui se passera (inscription automatique, notification) — la feuille à trois états, elle, le disait.",
          zooms: [{ nom: "pied", titre: "État liste d'attente", sel: "#eventDetailCta", marge: 4 }],
          annotationsAvant: [{ n: 1, sel: "#eventDetailCta .v4b-rsvp-etat", texte: "Un état sans conséquence annoncée : que va-t-il se passer, comment serai-je prévenu·e ?" }],
          apres: {
            js: async (p) => {
              await p.evaluate(() => {
                const e = document.querySelector("#eventDetailCta .v4b-rsvp-etat");
                if (!e) return;
                e.innerHTML = '<span style="display:block;text-align:center"><b style="display:block;font-size:15px">Tu es sur la liste d\'attente</b><span style="display:block;font-size:12.5px;font-weight:600;color:var(--muted);margin-top:2px">Si une place se libère, tu es inscrit·e automatiquement et prévenu·e.</span></span>';
                e.style.padding = "10px 14px";
                const r = document.querySelector("#eventDetailCta .v4b-rsvp-retirer"); if (r) r.textContent = "Quitter la liste d'attente";
              });
            },
          },
          annotations: [
            { n: 1, sel: "#eventDetailCta .v4b-rsvp-etat", texte: "La conséquence est dite là où l'on regarde (texte déjà présent dans la feuille à 3 états, app-07:4025). Aucune position affichée : la base ne la montre plus aux tiers (C-04)." },
            { n: 2, sel: "#eventDetailCta .v4b-rsvp-retirer", texte: "Le retrait nomme ce qu'il retire." },
          ],
        });
        // Refus « complète » rejoué : la dernière place part ailleurs pendant que la fiche est ouverte.
        await ouvrir(page, "ev_if_presque");
        jeu.remplirEnDouce(serveur, "ev_if_presque", GENS.long.id);
        await page.locator("[data-v4b-rsvp-go]").click();
        await page.waitForTimeout(900);
        await prendre({
          id: "IRL-122", titre: "Refus du serveur « complète » : le message et le bouton se contredisent",
          note: "Faux serveur : une 5e personne s'inscrit pendant que la fiche est ouverte, le déclencheur refuse (activite_complete). Toast « Activité complète — tu peux rejoindre la liste d'attente » ; le pied revient à « Je participe » et le bloc annonce toujours « 1 place restante ». Un nouvel appui retente « going » et se fait refuser à nouveau.",
          annotationsAvant: [
            { n: 1, sel: "#eventDetailCta [data-v4b-rsvp-go]", texte: "Le bouton propose encore « Je participe »." },
            { n: 2, sel: ".v4b-rdv-places", texte: "« 1 place restante » : chiffre périmé, non relu après le refus." },
          ],
          apres: {
            js: async (p) => {
              await p.evaluate(() => {
                const g = document.querySelector("#eventDetailCta [data-v4b-rsvp-go]"); if (g) g.textContent = "Rejoindre la liste d'attente";
                const pl = document.querySelector(".v4b-rdv-places"); if (pl) pl.textContent = "5 participants · complet";
                const n = document.createElement("div"); n.className = "audit-if-note"; n.setAttribute("role", "status");
                n.textContent = "La dernière place vient d'être prise.";
                n.style.cssText = "text-align:center;font:600 13px system-ui;color:var(--text);margin-bottom:6px";
                const box = document.querySelector("#eventDetailCta .v4b-rsvp"); if (box) box.insertBefore(n, box.firstChild);
              });
            },
          },
          annotations: [
            { n: 1, sel: "#eventDetailCta [data-v4b-rsvp-go]", texte: "Le bouton suit le refus : la sortie proposée par le message devient le geste." },
            { n: 2, sel: ".v4b-rdv-places", texte: "Places relues (compteur du refus)." },
            { n: 3, sel: ".audit-if-note", texte: "Ce qui s'est passé, dit sur place (le toast disparaît)." },
          ],
        });
      },
    },

    // ── D. États de la fiche : passée, annulée, en cours, privé, la mienne ──
    {
      nom: "etats",
      demarrage: COMPTE,
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await ouvrir(page, "ev_if_passee");
        await prendre({
          id: "IRL-130", titre: "Activité passée (j'y étais)",
          note: "Pastille « Événement terminé », tuile de date corail, « 3 participants · 7 places restantes », pied « Partager mon expérience » (dégradé violet) ; le corps répète « Tu y étais ? … Partager mon expérience » et « C'était comment ? Noter ».",
          annotationsAvant: [
            { n: 1, sel: ".v4b-rdv-places", texte: "« 7 places restantes » sur une activité terminée." },
            { n: 2, sel: ".v4b-rdv-tuile", texte: "Tuile corail (couleur du passage au réel) identique à une activité à venir." },
          ],
          apres: {
            css: `.v4b-rdv-tuile{background:#8c8aa3!important}.v4b-rdv{background:#fff!important;border-color:var(--border)!important}`,
            js: async (p) => { await p.evaluate(() => { const pl = document.querySelector(".v4b-rdv-places"); if (pl) pl.textContent = "Tu y étais · 3 participants"; }); },
          },
          annotations: [
            { n: 1, sel: ".v4b-rdv-places", texte: "Ce qui compte après coup : y avoir été, et avec combien de personnes." },
            { n: 2, sel: ".v4b-rdv-tuile", texte: "Tuile neutre : le corail reste réservé à ce qui peut encore se vivre." },
          ],
        });
        await defiler(page, "contexte", -60);
        await prendre({
          id: "IRL-131", titre: "Activité passée — souvenir et avis",
          note: "« Tu y étais ? » + « Partager mon expérience » (doublon du pied), « C'était comment ? Noter », album vide.",
          annotationsAvant: [{ n: 1, sel: ".event-recap-cta .btn", texte: "Même action que le pied fixe, deux fois à l'écran." }],
        });
        await ouvrir(page, "ev_if_annulee");
        await prendre({
          id: "IRL-132", titre: "Activité annulée (j'étais inscrit·e)",
          note: "Pastille rose « Cet événement a été annulé par l'organisateur », mais la carte du rendez-vous reste identique (tuile corail, « 2 participants ») ; pied « Événement annulé » grisé. Rien ne dit que MA participation tombe.",
          annotationsAvant: [
            { n: 1, sel: ".event-detail-urgency", texte: "Seul signal : une petite pastille." },
            { n: 2, sel: ".v4b-rdv", texte: "Le rendez-vous a l'air toujours valable." },
          ],
          apres: {
            css: `.v4b-rdv{opacity:.55;filter:grayscale(1)}.v4b-rdv-quand{text-decoration:line-through}
                  [data-v4b-sec=rendezvous] .event-detail-urgency.cancelled{display:block;font-size:14px;padding:12px 14px;border-radius:14px;line-height:1.35}`,
            js: async (p) => { await p.evaluate(() => { const u = document.querySelector(".event-detail-urgency.cancelled"); if (u) u.innerHTML = "<b>Activité annulée par Tom.</b><br>Ta participation est annulée, rien d'autre à faire."; }); },
          },
          annotations: [
            { n: 1, sel: ".event-detail-urgency", texte: "L'annulation est le message principal, et dit ce qu'elle change pour moi." },
            { n: 2, sel: ".v4b-rdv", texte: "Le rendez-vous est barré et éteint." },
          ],
        });
        await ouvrir(page, "ev_if_live");
        await defiler(page, "contexte", -80);
        await prendre({
          id: "IRL-133", titre: "Activité en cours (inscrit·e) — pointage",
          note: "« Je suis sur place » (plein) et « J'ai un code d'accueil » ; le pied garde « ✓ Je participe / Retirer ma participation » pendant l'activité.",
          zooms: [{ nom: "pointage", titre: "Boutons de pointage", sel: "[data-v4b-sec=contexte]", marge: 6 }],
        });
        await ouvrir(page, "ev_if_prive");
        await defiler(page, "infos", -40);
        await prendre({
          id: "IRL-134", titre: "Infos pratiques sans adresse lisible (organisateur au compte privé)",
          note: "Deux lignes « Adresse » : « 69001, Lyon » + « Voir sur Google Maps → » (pointe la ville), puis « Adresse exacte : Communiquée une fois inscrit·e » (app-07:4382-4385).",
          annotationsAvant: [
            { n: 1, sel: ".event-detail-info-link", texte: "Un lien de carte vers… une ville entière." },
            { n: 2, sel: "[data-v4b-sec=infos] .event-detail-info-row:nth-child(4)", texte: "La vraie information, deux lignes plus bas." },
          ],
          apres: {
            js: async (p) => {
              await p.evaluate(() => {
                const rows = Array.from(document.querySelectorAll("[data-v4b-sec=infos] .event-detail-info-row"));
                const adr = rows.find((r) => /^Adresse$/i.test((r.querySelector(".event-detail-info-label") || {}).textContent || ""));
                const exacte = rows.find((r) => /Adresse exacte/i.test(r.textContent));
                if (adr) { adr.querySelector(".event-detail-info-value").textContent = "Lyon 1er (69001)"; adr.querySelector(".event-detail-info-label").textContent = "Lieu"; const l = adr.querySelector(".event-detail-info-link"); if (l) l.parentElement.innerHTML = '<span style="font-size:12.5px;color:var(--muted)">L\'adresse exacte s\'affiche ici dès que tu participes.</span>'; }
                if (exacte) exacte.style.display = "none";
              });
            },
          },
          annotations: [{ n: 1, sel: "[data-v4b-sec=infos] .event-detail-info-row", texte: "Une seule ligne : la zone publique, et quand l'adresse sera donnée. Règle de confidentialité inchangée." }],
        });
        await ouvrir(page, "ev_if_mienne");
        await prendre({
          id: "IRL-135", titre: "Ma propre activité (organisatrice) — haut de fiche",
          note: "Le pied montre « ✓ Je participe » et « Retirer ma participation » à l'organisatrice ; « Gérer » est rangé en bas, dans « Autres actions ».",
          annotationsAvant: [{ n: 1, sel: "#eventDetailCta", texte: "L'organisatrice peut « retirer sa participation » de sa propre activité ; ses vrais outils (gérer, écrire aux inscrits, QR) sont plus bas." }],
          apres: {
            js: async (p) => {
              await p.evaluate(() => {
                const cta = document.getElementById("eventDetailCta");
                cta.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn primary block" style="min-height:48px;background:var(--accent);border-color:transparent;color:#fff">Écrire aux participants</button><button class="btn ghost block" style="min-height:48px">Gérer l\'activité</button></div><div style="text-align:center;font:600 12.5px system-ui;color:var(--muted);margin-top:8px">Tu organises · 4 participants · 2 places restantes</div>';
              });
            },
          },
          annotations: [{ n: 1, sel: "#eventDetailCta .btn.primary", texte: "Pour l'organisatrice : ses deux gestes (discussion du groupe, gestion) à la place de « Je participe »." }],
        });
        await defiler(page, "contexte", -40);
        await prendre({ id: "IRL-136", titre: "Ma propre activité — QR d'accueil, affiche, discussion", note: "Outils d'organisation dispersés entre « Discussion », « Contexte » et « Autres actions » (Gérer)." });
      },
    },

    // ── E. Feuilles et modales de participation / organisation ─────────────
    {
      nom: "modales",
      demarrage: COMPTE,
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await ouvrir(page, "ev_if_avenir");
        await modale(page, () => openEventRsvpSheet("ev_if_avenir"));
        await prendre({
          id: "IRL-140", titre: "Feuille à trois états (cartes de Rencontrer : « + Rejoindre »)",
          note: "Ouverte depuis le bouton des cartes de la liste Rencontrer (`openEventRsvpSheet`, app-07:4006) ; ici appelée directement sur la fiche. « Je viens » se coupe sur deux lignes, « Peut-être » est centré, les descriptions ne passent pas sous les titres.",
          zooms: [{ nom: "options", titre: "Les trois options", sel: "#modalContent", marge: 0 }],
          annotationsAvant: [{ n: 1, sel: "#modalContent .btn.block >> nth=0", texte: "Titre et description côte à côte : « Je viens » coupé en deux lignes." }],
          apres: {
            css: `#modalContent .btn.block{display:block!important;text-align:left!important;padding:12px 16px!important;min-height:56px}
                  #modalContent .btn.block b{display:block;font-size:15px}
                  #modalContent .btn.block span{display:block!important;margin-top:2px;font-size:12.5px!important;text-align:left}`,
          },
          annotations: [{ n: 1, sel: "#modalContent .btn.block >> nth=0", texte: "Titre puis description, alignés à gauche ; cibles de 56 px." }],
        });
        await modale(page, () => openEventRsvpSheet("ev_if_complete"));
        await prendre({ id: "IRL-141", titre: "Feuille à trois états — activité complète", note: "« Complet — file d'attente ouverte » ; option « Liste d'attente » (« file » et « liste » pour la même chose)." });
        await modale(page, () => openEventInvite("ev_if_avenir"));
        await prendre({ id: "IRL-142", titre: "Inviter des amis (abonnements)", note: "Recherche + liste d'abonnements avec bouton « Inviter ». La fonction « inviter tous mes abonnements » (`inviteAllFollowingToEvent`, app-07:7477) n'a aucune porte. L'invitation est une notification : envoyée sans lire le verdict (« Invitation envoyée » immédiat, app-07:7473)." });
        await ouvrir(page, "ev_if_mienne");
        await modale(page, () => openEventManage("ev_if_mienne"));
        await prendre({
          id: "IRL-143", titre: "Gérer l'activité (organisatrice)",
          note: "Modifier, Prévenir les inscrits, Co-organisateurs, Annuler l'événement, Supprimer définitivement, Fermer. Annuler a le même style que Modifier ; Annuler et Supprimer passent par un `confirm()` natif.",
          annotationsAvant: [{ n: 1, sel: "#modalContent .btn:nth-of-type(4)", texte: "« Annuler l'événement » (prévient tous les inscrits) a l'air d'une action ordinaire." }],
          apres: {
            css: `#modalContent > .btn:nth-of-type(4){margin-top:22px!important;color:#b42318!important;border-color:rgba(180,35,24,.3)!important}
                  #modalContent > .btn:nth-of-type(5){background:none!important;border-color:transparent!important;text-decoration:underline;min-height:44px}`,
          },
          annotations: [
            { n: 1, sel: "#modalContent > .btn:nth-of-type(4)", texte: "Les actions qui touchent les inscrits sont séparées et signalées." },
            { n: 2, sel: "#modalContent > .btn:nth-of-type(5)", texte: "La suppression, rare et irréversible, en lien discret (confirmation dans l'app, pas `confirm()`)." },
          ],
        });
        await modale(page, () => openEventCoOrganizers("ev_if_mienne"));
        await prendre({ id: "IRL-144", titre: "Co-organisateurs", note: "Candidats = participants et « peut-être » ; bouton « Ajouter » par ligne." });
        await modale(page, () => _messageEventAttendees("ev_if_mienne"));
        await prendre({ id: "IRL-145", titre: "Prévenir les inscrits (message groupé)", note: "« 4 personne(s) recevront une notification. » ; « Envoyer » affiche « Message envoyé aux inscrits » sans lire le verdict des écritures (app-07:4924-4930)." });
        await modale(page, () => openEventCheckinQr("ev_if_mienne"));
        await prendre({ id: "IRL-146", titre: "QR d'accueil des participants (organisatrice)", note: "QR + code en clair + « Copier le lien de pointage ». Code tiré par le faux serveur." });
        await ouvrir(page, "ev_if_live");
        await modale(page, () => openCheckinCodeEntry("ev_if_live"));
        await prendre({ id: "IRL-147", titre: "Pointer mon arrivée — saisie du code", note: "Champ de 6 caractères centré, 20 px, majuscules ; « Valider »." });
        await ouvrir(page, "ev_if_passee");
        await modale(page, () => openEventFeedback("ev_if_passee"));
        await prendre({ id: "IRL-148", titre: "Ton retour (avis après l'activité)", note: "Cinq étoiles (role=button, clavier), commentaire facultatif. « Merci pour ton retour » s'affiche avant le verdict de `supaRateEvent` (non attendu, app-07:7692-7694)." });
        await ouvrir(page, "ev_if_mienne");
        await modale(page, () => proposerInvitationActivite(allEvents().find((e) => e.id === "ev_if_mienne")));
        await prendre({ id: "IRL-149", titre: "« Ton activité est en ligne 🎉 » — proposition d'invitation après création", note: "Appelée directement (`proposerInvitationActivite`) : sur le banc la création réelle ouvre la même fenêtre si l'écriture réussit." });
        await modale(page, () => window.PassioAffiche && window.PassioAffiche.ouvrir("ev_if_mienne"));
        await prendre({ id: "IRL-150", titre: "Affiche à imprimer (QR d'inscription)", note: "Porte « Affiche à imprimer · QR d'inscription » de la fiche de l'organisatrice (js/affiche-rencontre.js)." });
      },
    },

    // ── F. Créer / modifier une activité ───────────────────────────────────
    {
      nom: "creer",
      demarrage: COMPTE,
      vues: ["m390", "m360"],
      async derouler({ page, prendre, banc }) {
        await page.waitForTimeout(1800);
        await modale(page, () => openCreateEvent());
        await prendre({ id: "IRL-160", titre: "Créer une activité — haut du formulaire", note: "UI-6A0 : couverture 16:9, titre, passion, type, description, date. Champs à 16 px (mesuré : 17 champs, tous 16 px)." });
        await page.evaluate(() => { const b = Array.from(document.querySelectorAll("#modalContent button")).filter((x) => x.offsetParent).pop(); if (b) b.scrollIntoView({ block: "end" }); });
        await page.waitForTimeout(500);
        await prendre({ id: "IRL-161", titre: "Créer une activité — bas du formulaire (Plus d'options, Aperçu, Publier)", seulement: ["m390"] });
        await page.locator("#evTitle").focus();
        const rendre = await banc.simulerClavier(page, 300);
        await prendre({ id: "IRL-162", titre: "Créer — clavier virtuel ouvert sur « Titre » (simulé)", note: "Fenêtre réduite de 300 px (clavier simulé, banc.simulerClavier)." });
        await rendre();
        await page.evaluate(() => { const b = Array.from(document.querySelectorAll("#modalContent .btn.primary")).filter((x) => x.offsetParent).pop(); if (b) { b.scrollIntoView({ block: "end" }); } });
        await page.evaluate(() => { const b = Array.from(document.querySelectorAll("#modalContent .btn.primary")).filter((x) => x.offsetParent && /Publier/.test(x.textContent)).pop(); if (b) b.click(); });
        await page.waitForTimeout(700);
        await prendre({
          id: "IRL-163", titre: "Créer — « Publier » sans titre : erreur en toast",
          seulement: ["m390"],
          note: "Toast « " + await page.evaluate(() => ((window.__toasts || []).slice(-1)[0] || {}).msg) + " » ; le champ fautif n'est ni signalé ni focalisé (validations en toasts successifs, app-07:7003-7006).",
        });
        await modale(page, () => openCreateEvent("ev_if_mienne"));
        await prendre({
          id: "IRL-164", titre: "Modifier l'activité — l'ANCIEN formulaire",
          note: "« Modifier l'événement » : en-têtes « PHOTO DE COUVERTURE / INFOS PRINCIPALES », couverture de 140 px, description en bas — la réorganisation UI-6A0 ne s'applique pas à l'édition.",
          annotationsAvant: [{ n: 1, sel: "#modalContent .modal-title", texte: "Créer : « Créer une activité » (UI-6A0) ; modifier : « Modifier l'événement », autre mise en page." }],
        });
      },
    },

    // ── G. Activité d'exemple (mode démo, sans compte) ─────────────────────
    {
      nom: "exemple",
      demarrage: { mode: "demo" },
      vues: ["m390"],
      async derouler({ page, prendre }) {
        await page.waitForTimeout(1500);
        const id = await page.evaluate(() => { const e = allEvents().find((x) => !(typeof _eventIsOver === "function" && _eventIsOver(x))); return e ? e.id : null; });
        await page.evaluate((i) => openEventDetails(i), id);
        await page.waitForTimeout(1400);
        await prendre({ id: "IRL-170", titre: "Activité d'exemple — fiche", note: "Socle de démonstration (« Exemple PASSIO »), aucun compte. Activité : " + id + "." });
        const go = page.locator("[data-v4b-rsvp-go]");
        if (await go.count()) { await go.click(); await page.waitForTimeout(900); }
        await prendre({ id: "IRL-171", titre: "Activité d'exemple — après « Je participe »", note: "Ce que dit l'application quand la participation est désactivée. Toasts/modale : " + JSON.stringify(await page.evaluate(() => ({ modale: (document.querySelector("#modalBackdrop.active .modal-title") || {}).textContent || null }))) });
      },
    },
  ],
};
