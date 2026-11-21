// ═══════════════════════════════════════════════════════════════════════════
// PARCOURS CŒUR — Fil → interaction → IRL, de bout en bout, par de VRAIS gestes
//
// Découvrir une publication → ouvrir le profil de son auteur → le suivre → lui écrire →
// revenir → ouvrir l'activité annoncée → s'y inscrire → retrouver son inscription.
// Compte connecté fictif (Camille Audit) sur le faux serveur ; données : outils/jeu/parcours.js.
// Chaque étape est capturée ; les frottements de CONTINUITÉ (porte absente, contexte perdu,
// mots qui changent) sont maquettés à l'endroit où ils se produisent.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const jeu = require("../jeu/parcours");

const TOM = "a0d17000-0000-4000-8000-00000000e005";
const CARTE_TOM = "#feedList .post-card:has-text('Bœuf acoustique'), #feedList article:has-text('Bœuf acoustique')";

module.exports = {
  domaine: "parcours",
  scenarios: [
    {
      nom: "coeur",
      demarrage: { mode: "compte", peupler: (srv, ctx) => jeu.peupler(srv, ctx) },
      vues: ["m390"],
      async derouler({ page, prendre, serveur }) {
        // ── 1. Le fil à l'ouverture (≈ 4 s après le démarrage) ────────────────
        await page.waitForTimeout(1500);
        await prendre({
          id: "PCS-001",
          titre: "Étape 1 — Découvrir : la publication de Tom annonce une activité (fil à l'ouverture)",
          note: "La publication porte la pastille « Rencontrer » et un `event_id`, mais sa porte « Voir l'activité » n'est pas peinte : l'activité arrive du serveur après le premier rendu du fil et la carte n'est pas repeinte.",
          zooms: [{ nom: "pied-carte", titre: "Pied de la carte : aucune porte vers l'activité", sel: "#feedList .post", marge: 0 }],
          annotationsAvant: [
            { n: 1, sel: "#feedList .post .post-mood-tag", texte: "La pastille « Rencontrer » annonce un rendez-vous…" },
            { n: 2, sel: "#feedList .post .post-actions", texte: "…mais aucune porte ne mène à l'activité pendant la première minute (mesuré : absente à 5, 20 et 40 s, présente à 60 s)." },
          ],
          apres: {
            // La carte telle que l'application la peint ELLE-MÊME une fois repeinte : la
            // proposition est de repeindre la carte dès que l'activité est connue.
            js: async (p) => { await p.evaluate(() => { if (typeof renderFeed === "function") { try { _feedDomSig = null; } catch (e) {} renderFeed(); } }); await p.waitForTimeout(700); },
          },
          annotations: [{ n: 1, sel: "#feedList .post .v3-tempt", texte: "« Voir l'activité » est là dès que l'activité est connue (repeint de la carte à l'arrivée des activités), sans attendre le rafraîchissement d'une minute." }],
        });

        // ── 2. Appui sur l'auteur → profil visité ─────────────────────────────
        await page.locator("#feedList .post-author").first().click();
        await page.waitForTimeout(1400);
        await prendre({ id: "PCS-002", titre: "Étape 2 — Ouvrir le profil de l'auteur (1 geste)", note: "Le profil s'ouvre en modale par-dessus le fil : Message et Suivre sont côte à côte, la publication est en dessous." });

        // ── 3. Suivre ─────────────────────────────────────────────────────────
        await page.locator("#modalContent button", { hasText: /^Suivre$/ }).first().click();
        await page.waitForTimeout(1300);
        await prendre({
          id: "PCS-003", titre: "Étape 3 — Suivre (1 geste) : confirmation",
          note: "Le bouton passe à « ✓ Suivi » et un toast confirme. Le compteur « Abonnés » du profil reste à 0.",
          annotationsAvant: [
            { n: 1, sel: "#modalContent [id^='followBtn_']", texte: "État clair : « ✓ Suivi »." },
            { n: 2, sel: "#modalContent .main-profile-stats", texte: "Le compteur d'abonnés affiche toujours 0 alors que je viens de m'abonner." },
          ],
        });

        // ── 4. Message → conversation vide ────────────────────────────────────
        await page.locator("#modalContent button", { hasText: /^Message$/ }).first().click();
        await page.waitForTimeout(1700);
        await prendre({
          id: "PCS-004", titre: "Étape 4 — Écrire à l'auteur (1 geste) : conversation neuve",
          note: "La conversation s'ouvre vide. Rien ne rappelle la publication ni l'activité qui ont motivé le message.",
          zooms: [{ nom: "saisie", titre: "Barre de saisie", sel: ".conv-fp-input-row, #convFpInput >> xpath=ancestor::div[1]", marge: 6 }],
        });

        // ── 5. Envoyer ────────────────────────────────────────────────────────
        await page.locator("#convFpInput").fill("Salut Tom ! Je viendrais bien, il reste de la place ?");
        await page.locator("#convFpSendBtn").click();
        await page.waitForTimeout(1800);
        await prendre({ id: "PCS-005", titre: "Étape 5 — Message envoyé (saisie + 1 geste)", note: "Le message part et s'affiche avec son heure et sa coche. Écrit sur le faux serveur : " + serveur.t.conv_messages.length + " ligne dans `conv_messages`." });

        // ── 6. Retour : où atterrit-on ? ──────────────────────────────────────
        await page.locator(".conv-fp-back").first().click();
        await page.waitForTimeout(1300);
        await prendre({
          id: "PCS-006", titre: "Étape 6 — « Retour » depuis la conversation : le contexte d'origine est perdu",
          note: "On venait du profil de Tom, ouvert depuis le fil. « Retour » mène à la liste des messages : le profil et le fil ont disparu, il faut revenir au fil par la barre basse.",
          annotationsAvant: [
            { n: 1, sel: "#screen-messages h1, #screen-messages .section-title, #screen-messages .v6a-titre", texte: "On atterrit dans « Messages », pas là d'où l'on venait." },
            { n: 2, sel: "#screen-messages .msg-card >> nth=1", texte: "Les conversations d'exemple restent mêlées à la vraie conversation." },
          ],
          apres: {
            js: async (p) => { await p.evaluate((uid) => { goTo("feed"); openUserProfile(uid); }, TOM); await p.waitForTimeout(1500); },
          },
          annotations: [{ n: 1, sel: "#modalContent [id^='followBtn_']", texte: "« Retour » ramène au profil d'où la conversation a été ouverte (lui-même posé sur le fil, à la même position)." }],
        });

        // ── 7. Revenir au fil par la barre basse → la porte est maintenant là ──
        await page.getByRole("button", { name: /Découvrir/ }).first().click().catch(async () => { await page.evaluate(() => goTo("feed")); });
        await page.waitForTimeout(1500);
        await prendre({
          id: "PCS-007", titre: "Étape 7 — Retour au fil (1 geste) : la porte « Voir l'activité » est apparue",
          note: "Le changement d'écran a repeint le fil : la porte est maintenant visible sous la publication.",
          zooms: [{ nom: "porte", titre: "La porte vers l'activité", sel: "#feedList .v3-tempt >> nth=0", marge: 14 }],
        });

        // ── 8. Voir l'activité → fiche ────────────────────────────────────────
        await page.locator("#feedList").getByText("Voir l'activité").first().click();
        await page.waitForTimeout(1900);
        await prendre({
          id: "PCS-008", titre: "Étape 8 — Fiche de l'activité (1 geste)",
          note: "Date, lieu, places restantes, organisateur, description, et un bouton d'inscription fixe en bas : « Je participe » (la liste Rencontrer dit « Je viens » pour le même geste).",
          zooms: [{ nom: "appel", titre: "Bouton d'inscription", sel: "text=Je participe", marge: 14 }],
        });

        // ── 9. S'inscrire ─────────────────────────────────────────────────────
        await page.getByText("Je participe", { exact: true }).first().click();
        await page.waitForTimeout(2000);
        const etat9 = await page.evaluate(() => ({ hash: location.hash, toasts: (window.__toasts || []).slice(-3).map((t) => t.msg), texte: document.body.innerText.replace(/\s+/g, " ").slice(0, 0) }));
        console.log("    [parcours] après « Je participe » : " + JSON.stringify(etat9) + " — inscrits : " + JSON.stringify(serveur.t.event_attendees.filter((a) => a.event_id === "ev_parcours_boeuf").map((a) => a.user_id.slice(-4) + ":" + a.rsvp)));
        await prendre({
          id: "PCS-009", titre: "Étape 9 — Après « Je participe » : l'inscription est enregistrée, mais rien ne dit la suite",
          note: "Mesuré : la ligne `event_attendees` passe à « going » (4 participants), aucun toast ne confirme. Le bouton plein devient un bouton pâle « ✓ Je participe » et un lien « Retirer ma participation » apparaît. Aucune étape suivante n'est proposée (discussion des participants, rappel, partage) alors que ces fonctions existent.",
          zooms: [{ nom: "pied", titre: "Pied de fiche après inscription", sel: "text=Retirer ma participation", marge: 70 }],
          annotationsAvant: [
            { n: 1, sel: "text=✓ Je participe", texte: "L'état « inscrit » ressemble à un bouton inactif : on ne sait pas si l'action a réussi ni ce qu'il faut faire ensuite." },
            { n: 2, sel: "text=Retirer ma participation", texte: "Seule action proposée : se désinscrire." },
          ],
          apres: {
            css: `.audit-pcs-ok{margin:0 16px 10px;padding:12px 14px;border-radius:16px;background:#e9f8ef;border:1px solid #bfe8d0;color:#0b5a33;font:600 14px/1.35 system-ui;display:flex;gap:10px;align-items:flex-start}
                  .audit-pcs-ok b{display:block;font:800 15px/1.3 var(--v2-titre,system-ui);color:#06452a}
                  .audit-pcs-suite{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 16px 8px}
                  .audit-pcs-suite button{min-height:48px;border-radius:14px;border:1px solid var(--accent-tile-line,#d2c2fb);background:var(--accent-tile,#f3eeff);color:var(--accent-2,#5a24d6);font:700 14px/1.2 system-ui}
                  .audit-pcs-suite button.plein{grid-column:1/-1;background:var(--accent,#6d32f4);color:#fff;border-color:transparent}`,
            js: async (p) => {
              await p.evaluate(() => {
                // Pied fixe de la fiche (mesuré : #eventDetailCta > .v4b-rsvp > button.v4b-rsvp-retirer).
                const pied = document.querySelector("#eventDetailCta .v4b-rsvp");
                const lien = document.querySelector("#eventDetailCta .v4b-rsvp-retirer");
                if (!pied || !lien) return;
                const bouton = Array.from(pied.children).find((e) => e !== lien && /Je participe/.test(e.textContent || ""));
                pied.style.flexDirection = "column"; pied.style.alignItems = "stretch";
                const bloc = document.createElement("div");
                bloc.style.paddingTop = "10px";
                bloc.innerHTML = '<div class="audit-pcs-ok" role="status"><span aria-hidden="true">✓</span><span><b>Tu participes — vendredi 13 nov. à 15:00</b>Tom est prévenu. Rappel la veille si les notifications sont activées.</span></div>'
                  + '<div class="audit-pcs-suite"><button class="plein">Écrire aux participants</button><button>Itinéraire</button><button>Inviter quelqu\'un</button></div>';
                pied.insertBefore(bloc, pied.firstChild);
                if (bouton && pied.contains(bouton)) bouton.style.display = "none";
                lien.textContent = "Je ne peux plus venir";
              });
              await p.waitForTimeout(300);
            },
            zooms: [{ nom: "pied", titre: "Pied de fiche après inscription", sel: ".audit-pcs-ok", marge: 70 }],
          },
          annotations: [
            { n: 1, sel: ".audit-pcs-ok", texte: "Confirmation explicite, avec la date et ce qui va se passer (organisateur prévenu, rappel) — `role=status`, lue par les lecteurs d'écran." },
            { n: 2, sel: ".audit-pcs-suite .plein", texte: "L'étape suivante du passage au réel : la discussion des participants (fonction existante : `openEventChat`)." },
            { n: 3, sel: ".audit-pcs-suite button:nth-child(2)", texte: "Actions secondaires existantes ou simples : itinéraire (lien de carte déjà présent dans la fiche), inviter (`openEventInvite`) — aucune fonction nouvelle." },
            { n: 4, sel: "text=Je ne peux plus venir", texte: "La désinscription reste disponible, formulée du point de vue de la personne." },
          ],
        });

        await page.waitForTimeout(2500);
        await prendre({ id: "PCS-010", titre: "Étape 10 — Quelques secondes après l'inscription", note: "Ce qui reste à l'écran une fois les messages éphémères passés." });
      },
    },
  ],
};
