// Recherche de comptes — bornée côté serveur, et pas de réponse périmée.
//
// Deux défauts d'un même chemin (`supaSearchUsers`, app-08) :
//
// ① AUCUNE LIMITE. La requête ramenait toute ligne de `profiles` dont le pseudo
//    OU la bio contient le motif — avec bio et avatar_url, à chaque frappe.
//    Invisible à trente comptes de beta, ruineux à dix mille. Les appelants
//    n'affichent au mieux que huit résultats.
//
// ② AUCUNE GARDE D'OBSOLESCENCE. Les réponses reviennent dans l'ordre du
//    réseau, pas dans celui de la frappe : taper « ab » puis « abc » pouvait
//    laisser la réponse d'« ab » écraser celle d'« abc ». L'utilisateur voyait
//    des résultats qui ne correspondaient plus à ce qu'il avait tapé.
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

test.describe("Recherche de comptes", () => {
  test("la requête serveur est bornée", async ({ page }) => {
    await bootOnboarded(page);

    const appels = await page.evaluate(async () => {
      const vus = [];
      // Faux client Supabase : on enregistre la chaîne d'appels réellement faite.
      // ⚠️ Affectation NUE : `supa` est un `let` de portée script, il existe comme
      // identifiant global mais n'est PAS une propriété de window — poser
      // `window.supa` créerait une variable distincte que la fonction ne lit pas.
      supa = { from: function () {
        const chaine = { _limite: null };
        chaine.select = function () { return chaine; };
        chaine.or = function () { return chaine; };
        chaine.limit = function (n) { chaine._limite = n; vus.push(n); return Promise.resolve({ data: [], error: null }); };
        chaine.then = function (r) { vus.push(null); return Promise.resolve({ data: [], error: null }).then(r); };
        return chaine;
      } };
      await supaSearchUsers("a");
      return vus;
    });

    expect(appels.length, "la requête doit passer par .limit()").toBeGreaterThan(0);
    expect(appels[0], "une borne, et raisonnable").toBeGreaterThan(0);
    expect(appels[0]).toBeLessThanOrEqual(50);
  });

  test("une réponse périmée n'écrase pas les résultats de la frappe en cours", async ({ page }) => {
    await bootOnboarded(page);

    const rendu = await page.evaluate(async () => {
      // Décor minimal : le champ et la boîte de résultats de « Nouveau message ».
      const hote = document.createElement("div");
      hote.innerHTML = '<input id="_nmSearch" value=""><div id="_nmResults"></div>';
      document.body.appendChild(hote);
      MY_UID = "u_moi"; window.MY_UID = "u_moi";
      window.supa = {};

      // La recherche « ab » répond LENTEMENT, « abc » répond vite : sans garde,
      // c'est « ab » qui peint en dernier.
      window.supaSearchUsers = function (q) {
        const lent = q === "ab";
        return new Promise((r) => setTimeout(() => r([
          { id: "u_" + q, username: "resultat_" + q, emoji: "✨", color: "#8b5cf6" },
        ]), lent ? 300 : 20));
      };

      document.getElementById("_nmSearch").value = "ab";
      _nmDoSearch("ab");
      document.getElementById("_nmSearch").value = "abc";
      _nmDoSearch("abc");

      await new Promise((r) => setTimeout(r, 600));
      return document.getElementById("_nmResults").innerHTML;
    });

    expect(rendu, "le résultat affiché doit être celui de la dernière frappe").toContain("resultat_abc");
    expect(rendu, "et surtout pas celui d'avant").not.toContain("resultat_ab<");
  });
});
