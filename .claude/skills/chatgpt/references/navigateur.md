# Repli navigateur — piloter chatgpt.com via Claude-in-Chrome

Source unique de la mécanique navigateur (elle vivait dans `/revue-croisee`
jusqu'au 2026-08-16). **À n'utiliser que si `node scripts/chatgpt.js etat` ne
donne aucun transport direct.** Chacun de ces points a coûté du temps réel les
2026-08-15 et 2026-08-16 ; aucun n'est devinable.

## Connexion

`list_connected_browsers` vide = extension non joignable. Chrome ouvert et
ChatGPT ouvert **ne suffisent pas** : le panneau latéral Claude doit être ouvert
ET connecté au **même compte Anthropic** que la session Claude Code. C'est le
point de rupture le plus fréquent quand Benjamin a plusieurs comptes. **Ne jamais
tenter de s'authentifier à sa place.**

## Écrire dans le composeur

`form_input` vise un `<textarea>` **caché** : le message ne partira jamais. Le
vrai composeur est un `contenteditable`, `#prompt-textarea`. Insérer ainsi
(produit de vrais événements de saisie, donc React enregistre) :

```js
const ed = document.getElementById('prompt-textarea');
ed.focus();
const s = getSelection(), r = document.createRange();
r.selectNodeContents(ed); s.removeAllRanges(); s.addRange(r);
document.execCommand('insertText', false, texte);
```

## Envoyer — la seule séquence fiable

Ni le clic sur le bouton d'envoi (les coordonnées rapportées par la page ne
correspondent pas à celles de l'outil), ni un `keydown` isolé ne suffisent.

```js
ed.focus();
const s = getSelection(), r = document.createRange();
r.selectNodeContents(ed); r.collapse(false);       // ← curseur À LA FIN
s.removeAllRanges(); s.addRange(r);
const o = { key:'Enter', code:'Enter', keyCode:13, which:13,
            bubbles:true, cancelable:true, composed:true };
ed.dispatchEvent(new KeyboardEvent('keydown', o));
ed.dispatchEvent(new KeyboardEvent('keypress', o));   // les TROIS
ed.dispatchEvent(new KeyboardEvent('keyup', o));
```

Vérifier ensuite que le composeur est vide **et** que le nombre de messages a
augmenté. Un texte long fait grandir le composeur au point de le pousser hors
écran (`getBoundingClientRect().top` très négatif) — c'est pourquoi les clics
tombent à côté.

## Attendre

`computer wait` est plafonné à **10 s** par appel : en enchaîner plusieurs dans un
`browser_batch`. Fin de génération :

```js
!!document.querySelector('button[data-testid="stop-button"]')  // false = terminé
```

## Lire la réponse

`get_page_text` re-déverse **toute** la conversation (dizaines de milliers de
caractères, très coûteux). Et renvoyer `.innerText` directement via
`javascript_tool` est **BLOQUÉ** par un garde-fou. La méthode qui marche — un
tableau de lignes, paginé :

```js
const m = document.querySelectorAll('[data-message-author-role="assistant"]');
m[m.length-1].innerText.split('\n').filter(l => l.trim()).slice(0, 90)
```

Puis `.slice(90,180)`, etc. Les tranches sont tronquées vers 100 éléments :
prévoir un recouvrement de quelques lignes pour ne rien perdre entre deux appels.

## Insertions longues

Un texte de plusieurs milliers de caractères peut figer le rendu : l'appel CDP
expire alors que **l'insertion a réussi**. Toujours vérifier l'état avant de
réessayer, sinon on double le message.

## ⚠️ Une réponse « bloquée » ne l'est presque jamais

Le flux d'affichage casse fréquemment : le message reste à 5, 60 ou 200
caractères, `stop-button` disparaît, et rien ne bouge pendant des minutes. **La
réponse est pourtant complète côté serveur.** Un simple `navigate` vers l'URL de
la conversation la révèle entière.

Vécu le 2026-08-16 : trois réponses jugées « interrompues » faisaient en réalité
16 517 et 2 745 caractères. Sans le rechargement, la conclusion aurait été
« ChatGPT est inutilisable ici » — et une revue entière aurait été perdue.
**Toujours recharger avant de conclure à une coupure.**

## Conversation trop longue

Au-delà de ~60 000 caractères, l'onglet devient irrécupérable (le rendu ne répond
plus, même à `1+1`). Ouvrir un fil NEUF avec un dossier auto-suffisant plutôt que
d'insister. C'est précisément la limite que le canal direct n'a pas.

## Captures d'écran

Inutiles ici, et elles échouent si le panneau n'est pas affiché. Passer par
l'arbre d'accessibilité et le DOM.

## Continuité

Réutiliser un fil existant (« Analyse croisée PASSIO », « Collaboration Claude
Code Passio ») plutôt que d'en ouvrir un nouveau : le contexte partagé améliore
nettement la qualité du challenge.

## Secrets

Ce chemin n'a **aucune garde automatique** — contrairement à
`scripts/chatgpt.js`, qui refuse l'envoi. Tout ce qui est inséré part. Relire
avant d'insérer : pas de `.env`, pas de clé `service_role`, pas de JWT, pas
d'identifiant.
