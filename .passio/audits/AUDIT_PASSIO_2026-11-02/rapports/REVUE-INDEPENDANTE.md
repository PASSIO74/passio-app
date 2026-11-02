# Revue indépendante des correctifs — 2026-11-03 (relecteur `audit-passio`, lecture seule)

Périmètre : `git diff origin/main...HEAD` de la branche `audit/2026-11-02-qualite-securite` (commits C, B, D, G, H, E, F,
coordination ×2) + arbre non commité au moment de la revue. Le relecteur n'avait participé à aucun changement.
Gates rejoués par le relecteur : `audit-globals` (2 038 déclarations, 0 collision), `audit-handlers` (683, 0 fantôme),
`audit-echappement --ci`, bancs SQL `migration-promotion-attente` 38/38 (43/43 après le point 3e) et
`migration-audit-2026-11-02-oracles-et-privileges` 38/38, `dashboard npm test` 599/604 (5 sautés préexistants),
`styles.css` CRLF intact, 9 `app-*.js` entre les marqueurs BUILD.

## Verdicts

| # | Point | Verdict | Preuve / raisonnement | Suite donnée |
|---|---|---|---|---|
| 1a | `supaLoadMessages` : doublon/trou entre pages (`range` = offset, pas curseur) | RISQUE faible, bénin | un INSERT entre deux pages décale d'une ligne → doublon absorbé par la fusion par id (`_fusionnerMessagesServeur`, `deduplicateConversations`) ; un DELETE concurrent → trou d'une ligne ancienne, conversation > 1 000 seulement | à faire ensuite : curseur `(created_at, id)` comme `supaLoadPosts` |
| 1b | erreur page 1 vs page n | OK | page 1 → `[]` (contrat d'avant) ; page n → plus récents conservés + `_diag` | — |
| 1c | `var MSG_PAGE_LECTURE`/`MSG_LECTURE_MAX` top-level | OK | noms uniques, `audit-globals` vert ; `var` voulu (le spec les surcharge via `window`) | — |
| 1d | liste partielle sans perte locale | OK | fusion additive : les messages locaux absents du serveur sont conservés | — |
| 2 | `supaPromoteFromWaitlist` : retours, appelants, stubs, double notification, `_promotionRpcAbsente`, repli sans `userId` | OK | `false \| {ok,userId,notifieeParServeur}` ; stub `true` des suites existantes toléré ; 13/13 verts ; double notification exclue ; repli refusé sans cible | — |
| 3a | RPC : SECURITY DEFINER, `search_path ''`, `for update` | OK | même verrou que le trigger de capacité → capacité tranchée deux fois sous le même verrou (banc ⑦ concurrent) | — |
| 3b | qui peut appeler sans `p_user_id` | OK par conception, à documenter | effet identique au prochain retrait ; notification au plus une fois par promotion effective | documenté dans l'en-tête de la migration |
| 3c | trigger d'admission 18+ | OK, non prouvé par le banc | le trigger porte sur l'APPELANT ; la RPC ne touche que `rsvp` → promotion aboutit ; marge : un mineur déclaré déjà en liste d'attente serait promu (il n'aurait pas dû y entrer) | noté en risque résiduel |
| 3d | barrière de suppression | OK | cible en suppression → 42501 attrapé → `{ok:false, motif:'refuse'}` ; appelant en suppression non vérifié (effet nul) | — |
| **3e** | **squat d'identifiant de notification `n_pa_`** | **RISQUE théorique** | `n_pa_` non réservé au serveur ; un compte peut pré-insérer l'identifiant à son nom → `on conflict do update` aurait mis à jour la ligne du squatteur, la personne promue ne recevait rien (piège de la 6ᵉ contre-revue du 16/09 sur `n_m_`) | **CORRIGÉ** : `on conflict … where user_id = excluded.user_id and kind='event_update'` + ré-insertion sous identifiant neuf ; banc ⑧ (mutation : 3 rouges) |
| 3f | idempotence / retour arrière | OK | rejeu vert ; `drop function` → PGRST202 → chemin d'avant | — |
| 3g | ce que le banc ne prouve pas | — | barrière de suppression et trigger d'admission absents du socle du banc ; appelant en suppression ; `co_organizers` malformé ; INSERT `going` concurrent hors RPC (couvert par le trigger) | noté en risque résiduel |
| 4 | `_emojiBorne` avant l'appel ; `escapeHtml(passion.emoji)` | OK | `function` top-level d'app-05, app-07 chargé après, appel à l'exécution ; 0 des 5 001 emojis du référentiel contient `&<>"'` | — |
| **5** | garde `#screen-irl.active` (F-01) | OK produit, **RÉGRESSION DE TEST** | tous les chemins passent par `goTo("irl")` avant le rendu ; mais `irl.spec.js:354` lisait `window.irlMap` (l'ÉLÉMENT, par accès nommé) puis `irlMap` nul → `TypeError` dans `waitForFunction` | **CORRIGÉ** (`typeof irlMap === "undefined" \|\| !irlMap`) ; `irl.spec` 120/120 |
| 6 | Sentinelle `@` → `＠` | OK, bosse bornée | `titreIssue` change pour une clé contenant `@` ; `condense`/`nomFiche` lisent la clé brute (inchangés) ; une enquête fermée avec `@` dans sa clé sera rouverte UNE fois (comme au changement de format du 10/09) | documenté |
| 7 | motif de signalement obligatoire | OK | 5 appelants testent `null` ; `reportPassion` n'ouvre pas la fenêtre (volontaire) | — |
| 8a | purge au logout | OK | `_conversationsPurgees()` consulté dans le debounce et au tir ; commentaire app-08:2845 périmé | à faire ensuite : commentaire |
| 8b | `_cssUrl(passioThumb(groupPhoto))` | OK | data URL acceptée, 3 sites alignés | — |
| 8c | génération des lectures du fil | OK | une lecture dépassée n'est jetée que si une plus récente a rendu un verdict | — |
| 9a | `repair.js` liste blanche `---/+++` | OK (13 cas sondés) | `--no-prefix`, `rename to tests/`, CRLF, `ab/` refusés ; `+++ /dev/null` attrapé par le second filet (`git status`) | facultatif : refus explicite lisible |
| 9b | `sse.js` cloisonnement | OK | `observer` garde `alert/attente/claude/event/interaction/ping/trace`, perd `sentinel*` et `test` ; rôle lu côté serveur | — |
| 10a | `revoke truncate/references/trigger` | OK | triggers au propriétaire ; REFERENCES = DDL ; PostgREST n'expose rien de tel ; `service_role` intact | — |
| **10b** | `conv_reads` par appartenance : l'upsert client passe-t-il ? | OK, angle mort préexistant élargi | 19/20 conversations historiques SANS `conv_members` : l'accusé sera refusé 42501 en silence (`catch(e){}`, `{error}` non lu) jusqu'au premier message qui répare l'appartenance | **à faire avant d'appliquer la migration C** : `supaMarkRead` lit `{ error }`, répare l'appartenance sur 42501 et rejoue |

## Bloquant avant fusion
1. `tests/e2e/irl.spec.js:364` — **corrigé** dans la branche (commit `ddaec2a`).

## À faire ensuite (non bloquant)
2. Migration promotion : protection du squat — **fait** (`ddaec2a`) ; réserver `n_pa_` (et `n_f*_` de `follows_notifier`,
   même défaut préexistant) côté serveur dans `identifiant_reserve_au_serveur`.
3. `supaMarkRead` (app-08) : lire `{ error }`, réparer l'appartenance sur 42501 (10b) — **avant** d'appliquer la
   migration `oracles_et_privileges` en production.
4. `supaLoadMessages` : curseur `(created_at, id)` pour les pages 2+ (1a).
5. Commentaire périmé app-08:2845-2846.
6. `supabase/functions/pilotage/index.ts:26` : seul import `supabase-js@2` non épinglé.
7. `repair.js:147` : refus explicite de `+++ /dev/null`.

## RAS
1b, 1c, 1d, 2, 3a, 3b, 3d, 3f, 4, 6, 7, 8a, 8b, 8c, 9a, 9b, 10a. Aucun `new Date(x+"Z")`, aucun
`seed.posts.find||userPosts.find`, `supa.*` jamais au top-level, `{ error }` lu partout dans le code nouveau.
