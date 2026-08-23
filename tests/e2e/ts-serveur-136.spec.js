// ═══════════════════════════════════════════════════════════════════════════
// #136 — T&S SERVEUR : âge fiable + blocage bidirectionnel + conversation
//        non forçable.
//
// ⚠️ CE QUE CETTE SUITE NE PROUVE PAS, et il faut le lire avant de la croire :
// elle ne touche AUCUNE base. Le SQL de #136 est une proposition non appliquée
// (`docs/migrations-proposees/2026-08-23-ts-serveur-136.sql`) — l'agent distant
// n'a pas le droit d'écrire dans `migrations/`. Les tests multi-comptes réels
// exigés par la spécification (« A bloque B → B ne peut pas forcer une
// conversation avec A », « un non-membre ne lit pas les messages », « la
// minorité d'un autre n'est pas lisible ») ne peuvent être écrits qu'APRÈS
// exécution du SQL en prod : sans les RPC ni les policies, ils testeraient
// l'absence de la garde et passeraient au vert pour la mauvaise raison. Ils
// restent dus.
//
// Ce qui EST prouvé ici, et qui est vérifiable sans base :
//   ① le contrat FAIL-CLOSED du client — tant que le serveur ne répond pas
//      « oui » explicitement, aucune fonction IRL sensible n'est autorisée ;
//   ② la distinction « RPC pas encore déployée » / « vraie erreur », sans
//      laquelle un client en avance sur le SQL ressemblerait à un refus ;
//   ③ le test ADVERSARIAL exigé par la spéc : en retirant la garde serveur
//      (`supaIrlInteractionAllowed` forcée à `true`), le verdict redevient
//      autorisant — la preuve que c'est bien elle qui refuse, et pas un hasard
//      de fixture ;
//   ④ les invariants du SQL proposé, lus dans le fichier : une seule policy
//      INSERT par table (les permissives se combinent en OR), la clause de
//      blocage réellement présente dans la policy `conv_members`, les cinq
//      fonctions en SECURITY DEFINER à `search_path` verrouillé, `anon` sans
//      droit d'exécution, `account_safety` sans aucune policy.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

const SQL_PATH = path.join(__dirname, "..", "..", "docs", "migrations-proposees", "2026-08-23-ts-serveur-136.sql");

async function flagOn(page) {
  await page.evaluate(() => {
    localStorage.setItem("passio_irl_proposal_v1", "1");
    delete window.PASSIO_IRL_PROPOSAL_V1;
  });
}

test.describe("#136 — contrat fail-closed du client", () => {

  test("sans serveur, les trois helpers T&S répondent « inconnu », jamais « autorisé »", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(async () => ({
      // `null` = inconnu. Ne JAMAIS le confondre avec `false` (« pas bloqué ») :
      // c'est cette confusion que le lot ferme.
      bloque: await supaBlockedBetween("u_autre"),
      // Fail-closed : pas de serveur → pas d'autorisation.
      irl: await supaIrlInteractionAllowed("u_autre"),
      declaration: await supaDeclareMinority(false),
      // Une cible vide ne doit rien déclencher du tout.
      bloqueVide: await supaBlockedBetween(""),
      irlVide: await supaIrlInteractionAllowed(""),
      // Une déclaration non booléenne est refusée en amont.
      declarationSale: await supaDeclareMinority("false"),
    }));
    expect(r.bloque).toBeNull();
    expect(r.irl).toBe(false);
    expect(r.declaration).toBeNull();
    expect(r.bloqueVide).toBeNull();
    expect(r.irlVide).toBe(false);
    expect(r.declarationSale).toBeNull();
  });

  test("« RPC absente » se distingue d'une vraie erreur serveur", async ({ page }) => {
    await bootOnboarded(page);
    const r = await page.evaluate(() => ({
      code: tsRpcAbsente({ code: "PGRST202", message: "Could not find the function" }),
      texte: tsRpcAbsente({ message: "Could not find the function public.is_blocked_between" }),
      inexistante: tsRpcAbsente({ message: 'function public.foo(text) does not exist' }),
      // Un refus RLS, une panne réseau, un JWT expiré ne sont PAS des absences :
      // les traiter comme telles ferait retomber le client sur le chemin
      // historique et masquerait une garde qui a bel et bien refusé.
      rls: tsRpcAbsente({ code: "42501", message: "PASSIO_BLOCKED" }),
      reseau: tsRpcAbsente({ message: "Failed to fetch" }),
      rien: tsRpcAbsente(null),
    }));
    expect(r.code).toBe(true);
    expect(r.texte).toBe(true);
    expect(r.inexistante).toBe(true);
    expect(r.rls).toBe(false);
    expect(r.reseau).toBe(false);
    expect(r.rien).toBe(false);
  });

  test("le verdict SERVEUR refuse là où le verdict local autorisait", async ({ page }) => {
    await bootOnboarded(page);
    await flagOn(page);
    const r = await page.evaluate(async () => ({
      // Prémisse : sur l'appareil seul, rien ne s'oppose à cette proposition.
      local: irlProposalVerdict("u_autre"),
      // Le serveur, lui, n'a rien confirmé → refus.
      serveur: await irlProposalVerdictServer("u_autre"),
      autorise: await irlProposalAllowedServer("u_autre"),
    }));
    expect(r.local).toEqual({ ok: true, reason: "ok" });
    expect(r.serveur).toEqual({ ok: false, reason: "server_refused" });
    expect(r.autorise).toBe(false);
  });

  test("primitive serveur absente = refus explicite, pas un passage en force", async ({ page }) => {
    await bootOnboarded(page);
    await flagOn(page);
    const r = await page.evaluate(async () => {
      const sauvegarde = window.supaIrlInteractionAllowed;
      window.supaIrlInteractionAllowed = undefined;
      const verdict = await irlProposalVerdictServer("u_autre");
      window.supaIrlInteractionAllowed = sauvegarde;
      return verdict;
    });
    expect(r).toEqual({ ok: false, reason: "server_unavailable" });
  });

  test("une primitive serveur qui LÈVE refuse (échec fermé), et ne remonte pas l'exception", async ({ page }) => {
    await bootOnboarded(page);
    await flagOn(page);
    const r = await page.evaluate(async () => {
      const sauvegarde = window.supaIrlInteractionAllowed;
      window.supaIrlInteractionAllowed = async () => { throw new Error("boom"); };
      const verdict = await irlProposalVerdictServer("u_autre");
      window.supaIrlInteractionAllowed = sauvegarde;
      return verdict;
    });
    expect(r).toEqual({ ok: false, reason: "guard_error" });
  });

  test("le préfiltre local reste opposable AVANT tout appel serveur", async ({ page }) => {
    await bootOnboarded(page);
    await flagOn(page);
    // Même avec un serveur qui dirait « oui » à tout, un motif local de refus
    // (soi-même, cible vide, drapeau coupé) doit trancher sans appel réseau.
    const r = await page.evaluate(async () => {
      const sauvegarde = window.supaIrlInteractionAllowed;
      let appels = 0;
      window.supaIrlInteractionAllowed = async () => { appels++; return true; };
      const out = {
        vide: await irlProposalVerdictServer(""),
        soi: await irlProposalVerdictServer("me"),
        appels: 0,
      };
      out.appels = appels;
      window.PASSIO_IRL_PROPOSAL_V1 = false;
      out.coupe = await irlProposalVerdictServer("u_autre");
      delete window.PASSIO_IRL_PROPOSAL_V1;
      window.supaIrlInteractionAllowed = sauvegarde;
      return out;
    });
    expect(r.vide).toEqual({ ok: false, reason: "no_target" });
    expect(r.soi).toEqual({ ok: false, reason: "self" });
    expect(r.coupe).toEqual({ ok: false, reason: "flag_off" });
    expect(r.appels).toBe(0);
  });

  // ── ADVERSARIAL : retirer la garde doit rendre le refus impossible ─────────
  // Exigé par la spécification. Sans ce test, « ça refuse » ne prouve rien :
  // le refus pourrait venir du drapeau, de la fixture, ou d'une erreur muette.
  test("MUTATION — garde serveur neutralisée → le verdict redevient autorisant", async ({ page }) => {
    await bootOnboarded(page);
    await flagOn(page);
    const r = await page.evaluate(async () => {
      const sauvegarde = window.supaIrlInteractionAllowed;
      const avant = await irlProposalVerdictServer("u_autre");
      window.supaIrlInteractionAllowed = async () => true;   // ← la garde retirée
      const pendant = await irlProposalVerdictServer("u_autre");
      window.supaIrlInteractionAllowed = sauvegarde;         // ← la garde remise
      const apres = await irlProposalVerdictServer("u_autre");
      return { avant, pendant, apres };
    });
    expect(r.avant.ok).toBe(false);
    expect(r.pendant).toEqual({ ok: true, reason: "ok" });   // la garde EST la cause du refus
    expect(r.apres.ok).toBe(false);
  });

  test("le motif du refus ne dit jamais qui a bloqué qui", async ({ page }) => {
    await bootOnboarded(page);
    await flagOn(page);
    const motifs = await page.evaluate(async () => {
      const sauvegarde = window.supaIrlInteractionAllowed;
      const out = [];
      window.supaIrlInteractionAllowed = async () => false;
      out.push((await irlProposalVerdictServer("u_autre")).reason);
      window.supaIrlInteractionAllowed = undefined;
      out.push((await irlProposalVerdictServer("u_autre")).reason);
      window.supaIrlInteractionAllowed = sauvegarde;
      return out;
    });
    // Aucun motif ne distingue « il m'a bloqué » de « je l'ai bloqué », ni
    // « il est mineur » de « je suis mineur » : le motif serait un canal
    // d'inférence sur des données que l'autre n'a pas le droit de connaître.
    for (const m of motifs) {
      expect(m).not.toMatch(/minor|mineur|age|block|bloqu/i);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INVARIANTS DU SQL PROPOSÉ — lus dans le fichier, pas exécutés.
// Ces assertions ne remplacent pas un test en base ; elles empêchent qu'une
// relecture ultérieure rouvre le trou sans que personne ne s'en aperçoive.
// ═══════════════════════════════════════════════════════════════════════════
test.describe("#136 — invariants du SQL proposé", () => {
  const sql = fs.readFileSync(SQL_PATH, "utf8");
  const nu = sql.split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");

  test("la policy INSERT de conv_members porte la clause de blocage bidirectionnel", () => {
    expect(nu).toMatch(/create policy "conv_members_insert_guarded"[\s\S]*?not public\.is_blocked_between/);
  });

  test("les policies permissives d'origine sont REMPLACÉES, pas doublées", () => {
    // Deux permissives + une stricte = OR = rien de fermé. Le `drop` est donc
    // aussi important que le `create`.
    expect(nu).toMatch(/drop policy if exists "Ecriture propre"\s+on public\.conversations/);
    expect(nu).toMatch(/drop policy if exists "Insert conversations"\s+on public\.conversations/);
    expect(nu).toMatch(/drop policy if exists "Ecriture propre"\s+on public\.conv_members/);
    // Une seule policy INSERT créée par table.
    expect(nu.match(/create policy "[^"]+" on public\.conversations/g)).toHaveLength(1);
    expect(nu.match(/create policy "[^"]+" on public\.conv_members/g)).toHaveLength(1);
  });

  test("les cinq fonctions sont SECURITY DEFINER à search_path verrouillé", () => {
    const fns = [
      "declare_account_minority",
      "my_account_minority",
      "is_blocked_between",
      "irl_interaction_allowed",
      "create_direct_conversation",
    ];
    for (const f of fns) {
      const bloc = nu.match(new RegExp("create or replace function public\\." + f + "[\\s\\S]*?\\n(as \\$\\$|as \\$)"));
      expect(bloc, f + " : définition introuvable").not.toBeNull();
      expect(bloc[0], f + " : pas SECURITY DEFINER").toMatch(/security definer/);
      expect(bloc[0], f + " : search_path non verrouillé").toMatch(/set search_path = ''/);
      // Droits minimaux : `anon` n'exécute rien, `authenticated` seulement.
      expect(nu, f + " : execute non révoqué").toMatch(new RegExp("revoke execute on function public\\." + f + "[^;]*from public, anon"));
      expect(nu, f + " : grant trop large").not.toMatch(new RegExp("grant\\s+execute on function public\\." + f + "[^;]*to[^;]*anon"));
    }
  });

  test("account_safety : RLS active, aucune policy, aucun privilège de table", () => {
    expect(nu).toMatch(/alter table public\.account_safety enable row level security/);
    expect(nu).toMatch(/revoke all on table public\.account_safety from anon, authenticated/);
    // Aucune policy sur cette table : c'est le mécanisme même du cloisonnement.
    expect(nu).not.toMatch(/create policy[^;]*on public\.account_safety/);
    // Ni l'année ni la date de naissance ne partent en base.
    expect(nu).not.toMatch(/birth_?year|date_of_birth|birthdate/i);
  });

  test("blocks n'est pas rouvert par ce lot", () => {
    expect(nu).not.toMatch(/policy[^;]*on public\.blocks/);
    expect(nu).not.toMatch(/drop policy[^;]*blocks_select_own/);
  });

  test("is_blocked_between refuse de servir d'oracle à un tiers", () => {
    // Sans cette borne, n'importe quel compte cartographierait les blocages
    // entre deux inconnus.
    expect(nu).toMatch(/is_blocked_between[\s\S]*?not in \(_a, _b\)[\s\S]*?PASSIO_NOT_A_PARTY/);
  });
});
