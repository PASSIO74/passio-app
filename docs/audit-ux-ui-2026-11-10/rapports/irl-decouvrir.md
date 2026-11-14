# Rencontres IRL — découvrir (liste, carte, filtre)

Domaine `irl-decouvrir` · surfaces IRL-001 à IRL-075 · constats IRL-C01 à IRL-C19 · version auditée `main@4e1d8ed1`.
Données : `donnees/domaines/irl-decouvrir.json` · captures : `captures/irl-decouvrir/` · scénarios : `outils/scenarios/irl-decouvrir.js`.

## 1. Périmètre et méthode

- **Lu** : `js/app-07-ia-explore-irl.js` (renderIRL, _filterIrlEvents, tri, distance, carte, sélecteurs, requestUserLocation), `js/ui-v4a0-tete.js`, `ui-v4a2-cartes.js` (en entier), `ui-v4a3-vue.js` (en entier), `ui-v4a4-outils.js`, `ui-v4a5-filtres.js`, `js/first-run.js` (exemples, géolocalisation), blocs CSS UI-4A2 / 4A3 / 4A5 de `styles.css`, `index.html` (carte, calendrier).
- **Ouvert par le banc uniquement** : modes `demo` (socle d'exemples), `compte` (faux serveur ; jeu `outils/jeu/irl-decouvrir.js` : 0, 11 ou 51 activités réelles sur 10 villes et 8 passions, avec activité en cours, complète + file, annulée, payante, la mienne, j'y vais, passée, sans coordonnées, au centre exact de Paris) et `visiteur`.
- **Gabarits** (émulations Chromium, aucun appareil réel) : m390 partout ; m360 pour la liste, la vue Filtre, la recherche ; t768 et d1440 pour la Liste, la Carte et le Filtre.
- **Sondes** gardées comme preuve : `outils/sondes/irl-decouvrir-01…05-*.js` (structure, compte, vues, filtre, géolocalisation), `irl-decouvrir-mesures.js`, `irl-decouvrir-contenu.js` + `irl-decouvrir-construire-json.js` (génèrent le JSON et contrôlent les renvois).
- **Limites et artefacts du banc** :
  - en mode `compte`, le banc coupe le lot « première visite » (`passio_first_run_experience_v1 = "0"`), ce qui retire l'étiquette « Exemple PASSIO » des activités d'exemple ; les scénarios la remettent à `"1"` pour retrouver l'état de production (sonde 02 vs 04) ;
  - `page.screenshot({ animations: "disabled" })` amène un toast à la fin de `toastOut` (opacité 0) : les scénarios figent l'animation du toast à son état visible (déclaré dans la fiche) ;
  - position « accordée » = position émulée (Lyon 7e) ; « refusée » = `navigator.geolocation` remplacé avant le démarrage ; tuiles « en échec » = route qui interrompt `tiles.openfreemap.org` ;
  - les suggestions de lieu (IRL-048) viennent des vrais géocodeurs BAN / Photon (requête fictive « Grenoble »).

## 2. Cartographie

| Zone | Surfaces | Porte | Code |
|---|---|---|---|
| Tête | titre « Rencontrer », recherche | barre basse | ui-v4a0-tete.js |
| Commutateur | Liste · Carte · Filtre | toujours visible | ui-v4a3-vue.js, ui-v4a4-outils.js (déclencheur « Filtre ») |
| Liste | carte V2 (IRL-002, 010-017), pagination (IRL-004, 056), états vides (IRL-006, 044) | vue Liste | ui-v4a2-cartes.js sur la carte historique app-07:2994 |
| Carte | MapLibre + OpenFreeMap (IRL-030-032, 052, 057, 058) | « Carte » | app-07:1551-1884, map-loader.js |
| Filtre | Quand ? · Où ? · Distance · Passions · Horaire · Mes événements \| Mes rencontres · pied fixe (IRL-040-049) | « Filtre » | ui-v4a5-filtres.js + moteurs app-07 |
| Position | sélecteur « Changer de lieu », « Utiliser ma position », refus (IRL-047, 050-053) | Filtre → Où ? → Modifier | app-07:1181, 1374 |
| Entrées | CTA du Fil, feuille « Trouver une expérience », lien `#irl-event-…` (IRL-060-062) | Fil, URL | ui-v3-passerelle.js, app-07:4896 |
| Repli (code seul) | intentions UI-4A0/4A1, dialogue « Filtre », feuille #irlFiltersPanel, passées / tri (IRL-070-073) | kill switch | — |

Condition clé : **l'écran ne demande jamais la position de lui-même** (first-run.js:2392, ui-v4a0-tete.js:377 ; 0 appel mesuré par la sonde 05). Sans geste, la référence est le repli codé en dur `{48.8566, 2.3522}` (app-07:2498).

## 3. Parcours et états exercés

| État | Résultat observé |
|---|---|
| Démo, liste | 12/12 cartes = exemples, chacune avec « Je viens » corail actif (IRL-001/002) |
| « Je viens » sur un exemple | toast de refus après coup (IRL-003) |
| Compte, aucune position | « Lyon · environ 391 km », « Paris · environ 0 m » (IRL-010/011) ; 9 des 12 premières cartes sont des exemples |
| Compte, 0 activité réelle | jamais d'état vide : 35 exemples (IRL-055) |
| Compte, 51 activités | « Afficher plus (73 restants) », exemples intercalés (IRL-056) |
| Complète / annulée / payante / mienne / inscrite / sans couverture | états honnêtes ; prix absent ; rouge annulé 3,23:1 ; pastille 📍 générique (IRL-012-017) |
| Carte, marqueur, plein écran | bulle « Voir l'événement » avec distance sur un exemple ; sortie de plein écran non nommée (IRL-031/032) |
| Tuiles refusées | fond gris, aucun message (IRL-058) |
| Filtre « 5 km » sans position | « Aucune position » + 6 résultats autour de Paris (IRL-042) |
| 5 km + Aujourd'hui + Soir | pied « Aucun résultat » grisé, sans issue (IRL-043) |
| Retour à Liste / détour par le Fil | « Rien avec ces filtres », aucun repère sur l'onglet (IRL-044/045) |
| Position accordée (geste) | « Lyon · environ 2,6 km », « Où ? Lyon · Position actuelle » (IRL-050/051) |
| Position refusée (geste) | toast « … Filtre → Autour de moi » ; « Paris (par défaut) · Position actuelle » (IRL-053) |
| Recherche « salsa » / « Lyon » / « kitesurf » | filtrage instantané ; sans résultat → « Rien avec ces filtres » (IRL-005-007) |
| Lien profond | la fiche s'ouvre (IRL-062) |
| Visiteur | aide « Passe du numérique au réel » sur le commutateur (IRL-063) |

## 4. Ce qui fonctionne et doit être conservé

- La carte V2 compacte (vignette, titre sur deux lignes, passion · quand, ville, agrégat de participants, deux actions de 44 px) et ses états honnêtes : « Inscrit ✓ », « Liste d'attente » annoncée avant le geste, « Tu organises » non cliquable, « Annulé » sans invitation (IRL-012, 013, 015).
- La preuve sociale bornée aux personnes suivies.
- Le commutateur à trois cases d'un mot, vues exclusives.
- La vue Filtre en quatre questions et son pied fixe « Afficher N résultats ».
- Le refus de géolocaliser d'office, expliqué au visiteur ; et des distances justes dès que la position est donnée (IRL-050).
- La recherche instantanée (champ 16 px), la pagination, le lien profond.
- Le corail sur « Je viens » d'une **vraie** activité est cohérent : c'est le passage au réel. Le défaut est son usage sur les exemples (IRL-C01).

## 5. Constats par surface

**P1**
- **IRL-C01** — Exemples « participation désactivée » avec « Je viens » corail plein et actif (IRL-001/002/003/031/055). Mesure : bouton 80 × 44 px, fond #C13D28, non désactivé ; ligne « Exemple PASSIO · participation désactivée » (ui-v4a2-cartes.js:366, 627). Après : pastille d'état « Exemple » (composant `.v4a2-etat`), ligne « Activité d'exemple · pas d'inscription ».
- **IRL-C02** — Distances depuis Paris affichées comme réelles (IRL-007/010/011/017/030/031). `ligneOu` (ui-v4a2-cartes.js:332) n'est gardée que pour les exemples en première visite ; la bulle de carte (app-07:1799) ne l'est jamais. Après : ville seule + porte « Choisis ta ville pour voir les distances ». *Sensible (localisation).*
- **IRL-C07** — Filtres actifs invisibles hors de la vue Filtre et conservés après navigation (IRL-044/045) : `#irlToolsBadge` est alimentée mais masquée (styles.css:11670). Après : pastille « 3 » sur l'onglet.

**P2**
- **IRL-C03** — Le seul chemin vers « ma position » : Filtre → Où ? → Modifier → Utiliser ma position (jugement). *Sensible.*
- **IRL-C04** — « Aucune position » alors que le filtre distance agit autour de Paris ; après refus, « Paris (par défaut) · Position actuelle » (IRL-040/042/053). *Sensible.*
- **IRL-C05** — Combinaison sans résultat : pied grisé (2,87:1), « Tout effacer » hors écran (IRL-043).
- **IRL-C06** — Prix absent de la carte V2 (IRL-014).
- **IRL-C09** — Commandes de carte : zoom 29 × 29 px, replier / plein écran 38 × 38 px (IRL-030).
- **IRL-C11** — Rouge d'annulation 3,23:1 (bandeau) et 3,76:1 (pastille) (IRL-016).
- **IRL-C14** — Exemples mêlés aux vraies activités, même nombreuses (IRL-010/055/056) (jugement ; règle produit à arbitrer). *Sensible (règle métier).*

**P3**
- **IRL-C08** — Pastille 📍 par défaut au lieu de l'emoji de la passion (app-08:6208) (IRL-010/015/017).
- **IRL-C10** — Plein écran : sortie = même icône, sans libellé ; croix de bulle minuscule ; « molette » sur mobile (IRL-032).
- **IRL-C12** — Recherche sans résultat → « Rien avec ces filtres » (IRL-006).
- **IRL-C13** — Vocabulaire (voir § 6).
- **IRL-C15** — Marqueurs empilés sans regroupement ; aucun message si les tuiles échouent (IRL-030/052/057/058). Non maquetté (changement de rendu cartographique).
- **IRL-C16** — Flèches de mois 28 × 28 px (IRL-046).
- **IRL-C17** — « C'est maintenant » + « En cours » sur la même carte (jugement).
- **IRL-C18** — Suggestions de lieu peu pertinentes (hypothèse, une saisie observée) (IRL-048).
- **IRL-C19** — Toast de refus de position renvoyant à « Filtre → Autour de moi », section inexistante, posé sur le pied fixe (IRL-053).

Les constats purement textuels (C13, C19) et C14, C15, C18 ne portent qu'une capture AVANT.

## 6. Cohérence avec le reste de l'application

- **« Je viens » (carte) / « Je participe » (fiche)** — même geste, deux noms : constat **PCS-C06** (`donnees/domaines/parcours.json`), confirmé ici (IRL-002 vs IRL-062). À trancher une fois, pour la carte, la fiche et la bulle.
- **Objet** : « activité » (cartes, recherche), « événement » (bandeau annulé, état vide, bulle « Voir l'événement », « Mes événements »), « rencontre » (« Rencontrer », « Mes rencontres »), « expérience » (feuille du Fil), « sortie » (« Proposer une sortie »).
- **« Mes rencontres »** (vue Filtre) = **« Mes inscriptions »** (dialogue de repli) = filtre `joined`.
- **« Détails »** (carte) vs **« Voir l'événement »** (bulle).
- **CTA « Trouver une activité »** → feuille **« Trouver une expérience »** → écran **« Rencontrer »**.
- **« Quelles passions ? »** → feuille **« Quelles activités ? »**.
- **Icône d'activité** : emoji de la passion sur les marqueurs, 📍 sur les vignettes sans couverture.
- Le corail reste réservé à l'IRL : respecté (« Je viens », « Liste d'attente », « Je participe »).

### Sensible
Rien qui expose une donnée privée : la carte V2 ne montre que la ville publique et un agrégat. Les constats C02-C04 touchent à la **localisation** (vérité de la distance, libellé « Position actuelle » appliqué au repli) et C14 à une **règle métier** (place des exemples) : à arbitrer, sans changer la garantie « aucune géolocalisation sans geste ».

## 7. Non vérifié, et comment le vérifier

- **Appareils réels** (iPhone / Android) : permission système réelle (invite, refus durable), gestes de carte (pincer, glisser), retour système depuis le plein écran — à faire sur appareil.
- **Hors ligne / réseau lent** pour la liste : aucun état de chargement ni d'erreur n'existe dans le code (IRL-074) ; les exemples masquent tout échec — à éprouver sur appareil en mode avion.
- **Repli sans WebGL** (IRL-075) : code seul.
- **Activités passées et tri** (IRL-073) : sans interface depuis le 2026-07-22 — choix produit à confirmer.
- **Bouton « Replier » en vue Carte** : non exercé (la vue reste « Carte » avec une carte repliée ? à vérifier).
- **Contenu de la fiche** : hors périmètre (domaine `irl-fiche`).

## 8. Compteurs

| | |
|---|---|
| Surfaces inventoriées | 46 |
| observées | 35 |
| simulées | 5 |
| code seul | 5 |
| inaccessibles | 1 |
| avec avant-après | 13 |
| à conserver | 15 |
| Constats | 19 — P0 : 0 · P1 : 3 · P2 : 7 · P3 : 9 |
