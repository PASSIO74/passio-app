# 26 — UI-6A0 : le nom de la couverture et la double ouverture (2026-11-07)

## D'où ça vient

Deux défauts de `js/ui-v6a0-activite.js`, mis au jour en stabilisant `tests/e2e/ui-v6a0-activite.spec.js` ② (PR 759, qui ne touche que les tests). Ce sont les défauts n° 2 et n° 3 de la fiche « 🧪 QUATRE TESTS INTERMITTENTS » de `docs/journal/telemetrie-pilotage-sentinelle.md`. Un troisième est apparu en écrivant le test de la coupure.

## Les défauts

**1. Le nom accessible pouvait rester « Ajouter une couverture » pour de bon.** L'enveloppe de `previewEventCover` relisait l'état par `setTimeout(…, 60)`, alors que l'image est posée dans le `onload` d'un `FileReader` (`js/app-07-ia-explore-irl.js`). Si la lecture dépassait 60 ms, rien ne relisait ensuite. L'aperçu déjà ouvert restait lui aussi sans photo. Mesuré : lecture retardée de 100 ms, 4 sur 4 ; photo de 4 Mo avec processeur ralenti ×6, 1 sur 4. C'était le dernier intermittent connu de ②.

**2. Une seule touche ouvrait deux sélecteurs de fichiers** (12 sur 12). L'écouteur `keydown` du module appelait `input.click()`, puis l'événement remontait au délégué `[role="button"]` d'`app-08`, qui appelait `zone.click()`. La règle était déjà écrite à la fiche 18 (« aucun `onkeydown` : un second écouteur = deux activations »). ② ne pouvait pas le voir : il attend un sélecteur, le premier lui suffit.

**3. La coupure n'était pas intacte.** Les enveloppes de `previewEventCover` et `removeEventCover` étaient posées au chargement et ne regardaient jamais `actif()`. Sous `passio_ui_6a0="0"`, choisir une photo écrivait quand même `aria-label` et `v6a0-cover-pleine` sur la zone du moteur.

## Les correctifs

- **Relecture.** Un `MutationObserver` sur `#evCoverPreviewImg` (attributs `src` et `style`) remplace les deux enveloppes et le `setTimeout(libelleCouverture, 40)` de `ranger`. Il couvre les trois chemins du moteur : la photo choisie, la couverture d'édition posée à 20 ms, le retrait. Le moteur écrit `src` et `style` dans le même tour : l'observateur passe après les deux.
- **Clavier.** L'écouteur `keydown` du module est retiré. Le délégué d'`app-08` traite Entrée et Espace, et `zone.click()` n'ouvre qu'un sélecteur : le clic de `input.click()` remonte à la zone, dont l'`onclick` rappelle `input.click()`, mais un élément dont le clic est en cours l'ignore.
- **Coupure.** L'observateur est posé par `ranger`, qui ne tourne pas sous la coupure : il n'y a plus de code du module sur ce chemin.

Le moteur n'a pas bougé. L'observateur survit à `admissionMettreDeCote`, qui déplace les nœuds de la modale sans les recréer.

## Les verrous

`tests/e2e/ui-v6a0-activite.spec.js` :

- ② bis : Entrée, Espace et le clic ouvrent chacun exactement un sélecteur ;
- ② ter : lecture retardée de 100 ms et de 1 000 ms (allonger un délai ne passe pas pour un correctif), aperçu déjà ouvert, couverture d'édition ;
- ⑤ bis : coupé, ni nom, ni marqueur, ni classe du module sur la zone, et Entrée y ouvre toujours un sélecteur, par le même délégué.

## Les mesures

| Mesure | Avant | Après |
|---|---|---|
| Photo de 4 Mo, processeur ralenti ×6, 16 exécutions | 7 rouges | 0 |
| ②, `--repeat-each=24 --workers=4`, 3 passes | 1 rouge sur 216 (PR 759) | 72 sur 72 |
| ②, ② bis, ② ter et ⑤ bis, `--repeat-each=12 --workers=4` | sans objet | 84 sur 84 |
| Les 12 autres suites qui ouvrent ce formulaire | sans objet | 112 sur 112 |
| Suite entière sur WebKit Windows, une passe | sans objet | 14 sur 14 |

C'est la photo de 4 Mo qui prouve le correctif. À 1 rouge sur 216, le code d'avant aurait lui aussi tenu 72 sur 72 environ sept fois sur dix. WebKit Windows n'est pas un iPhone : aucun appareil réel n'a été essayé.

**Réinjections**, une à la fois, la source restaurée après chacune :

| Réinjection | Tests rouges |
|---|---|
| Le `keydown` du module revient | ② bis |
| La relecture à 60 ms revient, sans observateur | ② ter 100 ms, ② ter 1 000 ms, ② ter aperçu, ⑤ bis |
| Même relecture, allongée à 300 ms | ② ter 1 000 ms, ⑤ bis |
| Plus aucune relecture | ②, ② ter 100 ms, ② ter 1 000 ms, ② ter aperçu, ② ter modification |
| L'observateur ne repeint plus l'aperçu | ② ter aperçu |
| Le délégué d'`app-08` ne clique plus | ②, ② bis, ⑤ bis |

Sur le code d'avant, les cinq tests rouges étaient ② bis, ② ter 100 ms, ② ter 1 000 ms, ② ter aperçu et ⑤ bis.

## À savoir

- **Un second sélecteur se prouve par son absence** : `compteurSelecteurs` attend le premier, puis 500 ms. Ce délai ne peut donner qu'un faux vert, jamais un faux rouge.
- **S'abonner à `filechooser` avant `zone.focus()`, jamais au même tour que la touche** (`docs/journal/telemetrie-pilotage-sentinelle.md`).
- **`setInputFiles` ne passe pas par la touche** : ② ter n'a pas besoin d'ouvrir le sélecteur pour poser un fichier, et son verdict ne dépend donc pas de cet ordre.
- **La suite réécrit `docs/captures/ui-6a0/*.png`** : `git checkout HEAD --` avant de committer.
