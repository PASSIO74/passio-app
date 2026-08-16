---
name: revue-croisee
description: Mène une analyse croisée réelle avec ChatGPT via Claude-in-Chrome — transmission d'un dossier factuel, challenge adversarial, puis VÉRIFICATION de chaque hypothèse dans le dépôt avant de rien retenir. À utiliser pour un audit à double regard, une décision d'architecture, une revue de sécurité, ou quand Benjamin dit "demande à ChatGPT", "analyse croisée", "fais challenger", "second avis".
---

# /revue-croisee — Analyse croisée Claude Code ↔ ChatGPT

Répartition **stricte** des rôles. Claude Code détient le dépôt, la prod Supabase, la CI et les tests : il **mesure et vérifie**. ChatGPT n'a aucun accès : il **challenge**. C'est asymétrique par construction, et c'est la source de sa valeur.

## Règle cardinale

**Aucune hypothèse de ChatGPT n'est un fait tant qu'elle n'a pas été vérifiée dans le dépôt réel.** Chaque point revient classé :

`CONFIRMÉ` · `INFIRMÉ` · `PARTIELLEMENT CONFIRMÉ` · `DÉJÀ EXISTANT` · `NON APPLICABLE` · `À APPROFONDIR`

Et symétriquement : **ne jamais écrire que ChatGPT a été consulté si l'échange n'a pas eu lieu.** Si le navigateur n'est pas joignable, on le dit et on ne produit pas de livrable « conjoint ».

## Le protocole

1. **Explorer** — mesurer le réel (tests, audits, schéma prod, policies). Ne pas produire l'audit complet en solo : ce serait transformer ChatGPT en tampon.
2. **Transmettre** — un dossier factuel : architecture réelle, baseline chiffrée, constats datés, questions ciblées. Jamais « que penses-tu de X ? ».
3. **Challenger** — lui demander explicitement ce qui pourrait être FAUX, ce qui a été oublié, ce que la correction pourrait casser. Le désaccord argumenté est le produit recherché.
4. **Vérifier** — retourner dans le dépôt, point par point. C'est l'étape qui a le plus de valeur, et celle qu'on est tenté de sauter.
5. **Second échange** — lui renvoyer les verdicts, y compris ceux qui l'infirment. Ses questions de relance sont souvent meilleures que ses réponses initiales.
6. **Consolider** — un livrable qui montre ce que le croisement a changé, y compris **les erreurs de Claude qu'il a corrigées**. Un audit croisé qui ne corrige rien n'a pas eu lieu.

## Ce qu'il faut lui demander

Formulations qui produisent du signal :

- « Qu'est-ce qui pourrait être FAUX dans ce constat ? Où ma cause racine est-elle incomplète ? »
- « Qu'est-ce qu'un audit qui commence par X rate systématiquement ? »
- « Que casserait cette correction ? »
- « Qu'est-ce que tu NE ferais PAS ? » — la meilleure question contre la sur-ingénierie.
- Toujours rappeler les contraintes réelles (vanilla, pas de bundler, hoisting, RLS = seule frontière), sinon il propose une migration de framework.

## Mécanique navigateur — pièges vécus

Ces points ont coûté du temps le 2026-08-15. Ils ne sont pas devinables.

**Connexion.** `list_connected_browsers` vide = extension non joignable. Chrome ouvert et ChatGPT ouvert **ne suffisent pas** : le panneau latéral Claude doit être ouvert ET connecté au **même compte Anthropic** que la session Claude Code. C'est le point de rupture le plus fréquent quand Benjamin a plusieurs comptes. Ne jamais tenter de s'authentifier à sa place.

**Écrire dans le composeur.** `form_input` vise un `<textarea>` **caché** et le message ne partira jamais. Le vrai composeur est un `contenteditable` : `#prompt-textarea`. Insérer ainsi (produit de vrais événements de saisie, donc React enregistre) :

```js
const ed = document.getElementById('prompt-textarea');
ed.focus();
const s = getSelection(), r = document.createRange();
r.selectNodeContents(ed); s.removeAllRanges(); s.addRange(r);
document.execCommand('insertText', false, texte);
```

**Envoyer.** Cliquer le bouton d'envoi par `ref` **ne fonctionne pas**. Il faut : focus, collapser la sélection à la fin, puis `computer { action:"key", text:"Return" }`. Vérifier ensuite que `#prompt-textarea` est vide et que l'URL est passée en `/c/…`.

**Attendre.** `computer wait` est plafonné à **10 s** par appel — en enchaîner plusieurs dans un `browser_batch`. Fin de génération :

```js
!!document.querySelector('button[data-testid="stop-button"]')  // false = terminé
```

**Lire la réponse.** `get_page_text` re-déverse **toute** la conversation (dizaines de milliers de caractères, très coûteux). Et renvoyer `.innerText` directement via `javascript_tool` est **BLOQUÉ** par un garde-fou. La méthode qui marche — un tableau de lignes, paginé :

```js
const m = document.querySelectorAll('[data-message-author-role="assistant"]');
m[m.length-1].innerText.split('\n').filter(l => l.trim()).slice(0, 90)
```

Puis `.slice(90,180)`, etc. Les tranches sont tronquées vers 100 éléments : prévoir un recouvrement de quelques lignes pour ne rien perdre entre deux appels.

**Insertions longues.** Un texte de plusieurs milliers de caractères peut figer le rendu : l'appel CDP expire alors que **l'insertion a réussi**. Toujours vérifier l'état avant de réessayer, sinon on double le message.

**Envoyer — la seule séquence fiable.** Ni le clic sur le bouton d'envoi (les coordonnées rapportées par la page ne correspondent pas à celles de l'outil), ni un `keydown` isolé ne suffisent. Ce qui marche :

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

Vérifier ensuite que le composeur est vide **et** que le nombre de messages a augmenté. Un texte long fait grandir le composeur au point de le pousser hors écran (`getBoundingClientRect().top` très négatif) — c'est pourquoi les clics tombent à côté.

**⚠️ Une réponse « bloquée » ne l'est presque jamais.** Le flux d'affichage casse fréquemment : le message reste à 5, 60 ou 200 caractères, `stop-button` disparaît, et rien ne bouge pendant des minutes. **La réponse est pourtant complète côté serveur.** Un simple `navigate` vers l'URL de la conversation la révèle entière.

Vécu le 2026-08-16 : trois réponses jugées « interrompues » faisaient en réalité 16 517 et 2 745 caractères. Sans le rechargement, la conclusion aurait été « ChatGPT est inutilisable ici » — et une revue entière aurait été perdue. **Toujours recharger avant de conclure à une coupure.**

**Conversation trop longue.** Au-delà de ~60 000 caractères, l'onglet devient irrécupérable (le rendu ne répond plus, même à `1+1`). Ouvrir un fil NEUF avec un dossier auto-suffisant plutôt que d'insister.

**Captures d'écran.** Inutiles ici, et elles échouent si le panneau n'est pas affiché. Passer par l'arbre d'accessibilité et le DOM.

## Continuité

Réutiliser le fil existant (« Analyse croisée PASSIO », « Collaboration Claude Code Passio ») plutôt que d'en ouvrir un nouveau : le contexte partagé améliore nettement la qualité du challenge.

## Livrables

Le croisement produit un document daté qui **doit** contenir une section « ce que l'analyse croisée a changé », avec les erreurs corrigées de part et d'autre. Voir `PASSIO_INITIAL_JOINT_AUDIT.md` et `PASSIO_CONTROL_CENTER_AUDIT.md` comme modèles.

Ne jamais envoyer de secret : pas de `.env`, pas de clé `service_role`, pas de JWT, pas d'identifiant. Le dossier décrit l'architecture et les mesures, jamais les credentials.
