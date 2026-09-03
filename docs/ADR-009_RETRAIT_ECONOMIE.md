# ADR 009_RETRAIT_ECONOMIE

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

## 💸 ADR-009 appliqué — l'économie interne est RETIRÉE (2026-08-29)

Wallet, points, étoiles, rangs, Score Passion, leaderboard, quêtes, Passia,
boutique, Pass Passion et piste crypto ne sont plus dans le code. La décision est
`.passio/adr/ADR-009-core-feed-irl-sans-wallet.md`, la carte d'exécution
`docs/PASSIO_WALLET_PASSIA_REMOVAL_MAP_2026-08-20.md`. **Ne rien réintroduire sans
rouvrir l'ADR** : un paiement futur devra être un paiement DIRECT en monnaie
réelle, sans monnaie intermédiaire.

Ce qui a disparu, et où : `RANKS`/`REWARDS`/`LIKES_PER_PASSIA` + `seedQuests`
(app-01) · `grantReward`/`rewardToast`/`awardLikeReceived`/`rankOf`/`checkRankUp`
(app-02) · les documents « Passia expliqué » et leur visionneuse (app-03) ·
`PASSIA_PACKS`/`PASSIA_PASSES`/`setWalletTab` (app-04) · `tipReel` et le bouton
« Soutenir » du rail bobine (app-05) · le **paywall du 4ᵉ profil** (app-06) ·
`renderWallet` et le leaderboard (app-07) · quêtes et récompense de like realtime
(app-08) · `#screen-wallet` et ses 4 onglets (index.html) · 154 règles CSS.

⚠️ **Quatre pièges de ce chantier, à connaître avant d'y retoucher.**

① **`renderTopbar` écrivait dans `#topPassia` SANS garde.** Retirer le nœud sans
   retirer cette ligne fait lever la fonction — et elle est rappelée à chaque
   publication, commentaire et RSVP. Le lot UI-6 avait justement choisi de
   *masquer* la rangée pour cette raison ; le retrait, lui, oblige à traiter les
   deux ensemble. Même famille de risque pour tout nœud supprimé qu'un renderer
   adresse par id.

② **L'état legacy se propage dans les DEUX sens.** `user.score`, `user.passia`,
   `user.likesReceived`, `user.activePass`, `transactions`, `quests` et le
   `profile.paid` vivent encore dans les `localStorage` existants ET dans le blob
   `user_state`. `stripLegacyEconomy()` (app-02) est donc appelé aux **trois**
   frontières : `loadState`, `_applyUserState` (hydratation serveur) et
   `_syncableState` (envoi). Sans la 2ᵉ, un ancien appareil encore en service
   repousse les clés à chaque sync ; sans la 3ᵉ, ce client les remet lui-même en
   circulation. « Last write wins » joue dans les deux sens.

③ **Une classe morte suffit à tuer un sélecteur.** Le nettoyage CSS a d'abord
   exigé que TOUTES les classes d'un sélecteur soient mortes : `.quest-card.ready`,
   `.lb-rank.gold`, `.pack-card.popular` et `.wallet-tab.active` survivaient donc,
   parce que `ready`/`gold`/`popular`/`active` sont des modificateurs vivants
   ailleurs. Le bon critère est l'inverse : **une seule** classe jamais posée rend
   la règle inatteignable. Et `styles.css` est en **CRLF** — écrire en binaire.

④ **Le prix d'un événement était libellé en Passia alors qu'aucun paiement n'a
   jamais lieu** (le RSVP est gratuit, `price` n'est qu'un affichage). Il est
   redevenu un montant indicatif en €, ce que l'ADR autorise explicitement.
   ⚠️ **`fmtEventPrice(price)` (app-02) est la SEULE fonction autorisée à écrire
   un prix à l'écran** — carte de la liste, ligne « Prix » de la fiche, et tout
   ce qui viendra. La première version concaténait `+ " €"` à la main aux trois
   endroits, ce qui sortait `12.5 €` (point anglais), `NaN €` sur une valeur non
   numérique et `-5 €` sur un négatif. Le helper rend « Gratuit 🎉 » pour tout
   ce qui n'est pas un montant positif, « 12 € » sans décimale inutile et
   « 12,50 € » avec la virgule française. Le champ de saisie porte
   `step="0.01"` : il valait 1, et refusait donc *silencieusement* les centimes.
   Verrou : `tests/e2e/prix-euros.spec.js` (4 cas, dont les six cas limites du
   formateur).

⑤ **Retirer un gros bloc de `index.html` emporte facilement une balise
   STRUCTURELLE voisine.** La suppression de `#screen-wallet` a avalé le
   `</main>` qui la suivait : `.app-nav` s'est retrouvée DANS la zone
   scrollable, sa base à 9 735 px au lieu de 667 — cinq tests `cadrage` au
   rouge, sans la moindre erreur JS. Après tout retrait de balisage, compter
   les balises structurelles contre la version d'avant, ou passer le fichier à
   `html.parser` : le nombre d'erreurs doit être IDENTIQUE, pas nul (index.html
   en porte une, préexistante).

⑥ **Les libellés promettaient des points que le moteur ne donnait plus.**
   « ✨ Publier · +10 pts », « Publier · +3 pts », « + Rejoindre · +25 pts ·
   +5 💎 », « Crée le premier pour +30 pts »… étaient du texte en dur dans
   `index.html` et quatre app-*.js, invisibles d'une recherche sur `passia` ou
   `grantReward`. Le lot UI-6 n'en masquait qu'un seul, et son test de kill
   switch EXIGEAIT le retour de « +10 pts » — c'est ce test qui les a révélés.
   Chercher aussi `\+[0-9]+ ?pts` et `\+[0-9]+ ?💎` avant de conclure.

Verrou de non-régression : `tests/e2e/adr-009-retrait-economie.spec.js` (7 tests)
couvre la surface, le moteur, la création d'un 4ᵉ profil, et l'aller-retour de
synchronisation avec un ancien client.
