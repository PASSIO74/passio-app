# PROMPT — Vidéo de présentation PASSIO

> Fichier prêt à copier-coller dans un générateur vidéo (Sora, Veo, Runway, Kling, Pika…),
> ou à donner à un monteur / motion designer. 3 formats fournis : **60 s (principal)**,
> **30 s (pub sociale)**, **15 s (teaser)**.

---

## 1. MASTER PROMPT (à coller en un bloc)

```
Crée une vidéo de présentation produit de 60 secondes pour "PASSIO", un réseau social
mobile dédié aux passions (PWA, iOS/Android). Format vertical 9:16, 1080x1920, 30 fps.
Style : démo produit moderne façon Instagram / Linear / Revolut — épuré, lumineux,
énergique, rythme rapide (coupe toutes les 1,5 à 3 s), transitions fluides.

RENDU VISUEL
- Un smartphone flottant en 3D légère (léger tilt, ombre douce, mouvement de parallaxe
  continu) sur fond dégradé violet profond → lavande → blanc cassé.
- Couleur d'accent de la marque : violet #7c3aed. Secondaires : blanc #ffffff,
  gris texte #6b7280, rouge live #ef4444.
- Typographie sans-serif géométrique, graisse Bold pour les titres, corps en Medium.
- Interface à l'écran ULTRA nette (pas de texte flou ni illisible), coins arrondis 20px,
  cartes blanches avec ombre douce.
- Les doigts d'une main réelle (peau naturelle, cadrage propre) interagissent avec
  l'écran : tap, scroll, swipe, appui long. Les gestes doivent correspondre exactement
  à ce qui se passe à l'écran.
- Micro-animations d'UI : ressort au tap, cœurs qui s'envolent, badges qui pulsent,
  compteurs qui s'incrémentent, skeleton loaders qui se remplissent.

AMBIANCE SONORE
- Musique électro-pop instrumentale, 110-120 BPM, montée progressive, drop léger à
  mi-parcours, résolution chaleureuse sur la dernière seconde.
- Sound design UI discret : clics feutrés, whoosh de transition, "pop" sur les likes.
- Voix off française, féminine ou masculine, ton chaleureux et sûr, débit posé.

SCÉNARIO — 9 séquences (voir découpage détaillé plus bas)
1. Accroche : "Ta passion mérite mieux qu'un fil générique."
2. Onboarding : choix des passions (photo, moto, cuisine, escalade, musique…).
3. Le fil : posts, moods, likes, réactions emoji, commentaires.
4. Stories & Bobines : création plein écran, filtres, publication.
5. Carnets de voyage (CDV) & Lives : journal d'étapes, live vidéo en direct.
6. IRL : carte des événements près de chez toi, inscription en un tap.
7. Messagerie : messages, vocaux, GIFs, appel vidéo HD P2P.
8. Profil & étoiles : profil passion, filtres de contenu, score et rangs.
9. Final : logo PASSIO sur fond violet + baseline + call-to-action.

CONTRAINTES
- Aucun texte anglais à l'écran : toute l'interface est en français.
- Pas de watermark, pas de sous-titres automatiques baveux.
- Les visages éventuels sont des personnes fictives, diverses (âges, origines).
- Fin sur un plan fixe 2 s minimum pour le logo (lisibilité sur les réseaux).
```

---

## 2. DÉCOUPAGE PLAN PAR PLAN (prompts individuels pour les IA qui génèrent 5-10 s)

> Génère chaque plan séparément avec le prompt ci-dessous, puis assemble au montage.
> Garde la **même seed / même référence de style** sur tous les plans pour la cohérence.

### Plan 1 — Accroche (0:00 → 0:05)
```
Gros plan sur un smartphone noir posé à plat sur un bureau clair, écran éteint.
L'écran s'allume d'un coup sur un dégradé violet #7c3aed, le logo PASSIO apparaît en
blanc avec une animation de particules qui se rassemblent. La caméra se relève lentement
jusqu'à un cadrage vertical du téléphone. Lumière naturelle douce, ambiance premium.
```
**Voix off :** « Ta passion mérite mieux qu'un fil d'actualité générique. »
**Texte à l'écran :** `PASSIO` puis, en petit, `Le réseau social des passions`

### Plan 2 — Onboarding / choix des passions (0:05 → 0:12)
```
Écran de téléphone en plein cadre. Une grille 4 colonnes de vignettes rondes avec
emojis et libellés français : Photo, Moto, Cuisine, Escalade, Musique, Voyage, Running,
Jardinage. Un doigt tape successivement 3 vignettes ; chacune se remplit de violet avec
un ressort et une coche blanche. Un bouton "Continuer" violet pleine largeur s'active
en bas avec une pulsation. Animation nette, 60 fps, aucun flou.
```
**Voix off :** « Choisis ce qui te fait vibrer. »
**Texte :** `Tes passions, ton univers`

### Plan 3 — Le fil (0:12 → 0:20)
```
Un pouce scrolle un fil social vertical, fluide et rapide. Cartes blanches à coins
arrondis : avatar rond violet, pseudo, photo de passion (moto de course, plat dressé,
paroi d'escalade), barre d'actions cœur / bulle / emoji / partage. Le pouce
double-tape une photo : un gros cœur rouge explose au centre avec des particules et le
compteur passe de 23 à 24. Puis un panneau d'emojis glisse du bas, le doigt choisit
🔥 et une pastille de réaction apparaît sous le post.
```
**Voix off :** « Un fil qui ne parle que de ce que tu aimes. »
**Texte :** `Publie · Réagis · Commente`

### Plan 4 — Stories & Bobines (0:20 → 0:28)
```
Transition par swipe latéral. Une barre de bulles stories en haut avec anneaux en
dégradé conique multicolore. Le doigt tape "Ta story" : ouverture plein écran d'un
appareil photo en direct (vue caméra réaliste d'un atelier / d'une route de montagne).
Appui long sur le déclencheur rond blanc : un anneau de progression se remplit, badge
rouge "REC" clignotant. Relâchement, puis l'écran passe en mode édition avec des
overlays texte et emoji que le doigt déplace. Tap sur "Publier" : la story part vers
le haut avec un whoosh.
```
**Voix off :** « Stories, bobines vidéo : raconte ta passion en mouvement. »
**Texte :** `Stories & Bobines`

### Plan 5 — Carnets de voyage & Lives (0:28 → 0:36)
```
Écran "Carnets de voyage" : cartes avec photos de road-trip, titres français, timeline
verticale d'étapes numérotées avec dates et miniatures. Le doigt scrolle la timeline.
Puis coupe sur un bouton "🔴 Démarrer un Live" avec un point rouge pulsant. Écran
suivant : vidéo live plein écran, badge "EN DIRECT" rouge en haut à gauche, compteur
de spectateurs qui monte (12 → 34 → 57), commentaires qui remontent en bas, cœurs
flottants qui s'envolent depuis le coin droit.
```
**Voix off :** « Documente tes aventures, ou passe en direct devant ta communauté. »
**Texte :** `Carnets · Lives vidéo`

### Plan 6 — IRL / événements (0:36 → 0:43)
```
Une carte interactive style clair avec des pins violets autour d'une ville française.
La caméra zoome sur un pin ; une carte d'événement remonte du bas : photo, titre
"Sortie moto — Vallée de Chevreuse", date, distance "12 km", rangée d'avatars des
inscrits. Le doigt tape "Je participe" : le bouton devient vert avec une coche, le
compteur passe de 8 à 9 inscrits.
```
**Voix off :** « Et quand la passion sort de l'écran : retrouve-toi en vrai. »
**Texte :** `Événements IRL près de toi`

### Plan 7 — Messagerie & appels (0:43 → 0:51)
```
Une conversation de messagerie moderne : bulles violettes à droite, blanches à gauche,
un GIF animé envoyé, un message vocal avec forme d'onde qui se remplit pendant la
lecture. Le doigt tape l'icône caméra en haut : transition immédiate vers un appel
vidéo plein écran, visage souriant net, aperçu local en médaillon en bas à droite,
boutons ronds micro / caméra / raccrocher, chrono qui défile 00:07.
```
**Voix off :** « Messages, vocaux, appels vidéo haute qualité — tout est intégré. »
**Texte :** `Messagerie + Appels HD`

### Plan 8 — Profil & étoiles (0:51 → 0:56)
```
Un profil utilisateur : photo de couverture panoramique, avatar rond chevauchant,
pseudo, bio courte, stats (posts, abonnés, abonnements), pastille "⭐ 1 240 · Explorateur".
Une rangée d'icônes de filtres que le doigt active une par une, la grille de contenu
en dessous se recompose fluidement en 3 colonnes de miniatures.
```
**Voix off :** « Un profil à ton image, et des étoiles qui récompensent ton engagement. »
**Texte :** `Ton profil · Tes étoiles`

### Plan 9 — Final (0:56 → 1:00)
```
Le téléphone recule et pivote légèrement, l'arrière-plan se remplit d'un dégradé violet
#7c3aed profond. Le logo PASSIO en blanc apparaît au centre avec une lueur douce,
la baseline se dessine en dessous. Plan fixe 2 secondes.
```
**Texte final :**
```
PASSIO
Le réseau social des passions
passio-app.netlify.app
```

---

## 3. SCRIPT VOIX OFF COMPLET (60 s, ~110 mots)

```
Ta passion mérite mieux qu'un fil d'actualité générique.

Sur PASSIO, tu choisis ce qui te fait vibrer.
Et ton fil ne parle plus que de ça.

Publie, réagis, commente — avec ceux qui comprennent vraiment.

Stories et bobines vidéo pour raconter ta passion en mouvement.
Carnets de voyage pour documenter tes aventures étape par étape.
Et des lives pour partager l'instant, en direct.

Quand la passion sort de l'écran, retrouve-toi en vrai,
grâce aux événements près de chez toi.

Messages, vocaux, appels vidéo : tout est intégré.

PASSIO. Le réseau social des passions.
```

---

## 4. VARIANTE 30 SECONDES (pub Instagram / TikTok)

Garder uniquement les plans **1 → 3 → 4 → 6 → 7 → 9**, coupes à 2 s max, musique 124 BPM.

```
Vidéo verticale 9:16 de 30 secondes, publicité pour l'app mobile PASSIO, réseau social
des passions. Rythme très rapide, coupes toutes les 2 secondes, énergie TikTok.
Enchaîne : logo violet → sélection de passions en grille → fil social scrollé au pouce
avec double-tap qui fait exploser un cœur → création de story plein écran caméra →
carte d'événements avec pins violets et inscription en un tap → appel vidéo plein écran
→ logo PASSIO final sur dégradé violet #7c3aed avec la baseline "Le réseau social des
passions". Interface française, ultra nette, accent #7c3aed, musique électro-pop 124 BPM.
```

**Voix off 30 s :**
> « Choisis tes passions. Trouve ta communauté. Publie, filme, discute, et retrouve-toi en vrai. PASSIO — le réseau social des passions. »

---

## 5. VARIANTE 15 SECONDES (teaser)

```
Teaser vertical 9:16 de 15 secondes pour PASSIO. Montage ultra rapide, 8 plans de
1,8 seconde, chaque plan = une fonctionnalité affichée plein écran sur un smartphone :
fil social, story caméra, live avec badge rouge EN DIRECT, carte d'événements, appel
vidéo, profil avec étoiles. Flash violet #7c3aed entre chaque plan, beat synchronisé.
Final : logo PASSIO blanc sur violet, 2 secondes fixes. Aucun texte anglais.
```

---

## 6. CHARTE À RAPPELER À L'IA SI LE RENDU DÉRIVE

| Élément | Valeur |
|---|---|
| Accent principal | `#7c3aed` (violet) |
| Rouge live / notif | `#ef4444` |
| Texte secondaire | `#6b7280` |
| Fond carte | blanc `#ffffff`, ombre douce, radius 20 px |
| Format | 9:16 vertical, 1080×1920, 30 fps |
| Langue UI | français uniquement |
| Ton | chaleureux, communautaire, jamais corporate |
| Interdits | texte flou, UI anglaise, watermark, stock footage générique sans téléphone |

---

## 7. PLAN B — VIDÉO À PARTIR DE VRAIES CAPTURES

Si le rendu IA n'est pas assez fidèle à l'app réelle, produire la démo depuis
la vraie interface :

1. `npm run serve` → http://localhost:8080 (code d'accès **2125**)
2. `node scripts/capture-screens.js` régénère les 16 captures dans `docs/screenshots/`
3. Enregistrer l'écran en 1080×1920 (Chrome DevTools, device iPhone 14 Pro) en suivant
   le parcours des 9 séquences ci-dessus
4. Monter dans CapCut / Premiere avec :
   - zooms lents (Ken Burns) sur chaque écran
   - les textes à l'écran de la section 2
   - la voix off de la section 3
   - musique électro-pop 110-120 BPM

C'est l'option la plus fidèle : elle montre **la vraie app**, pas une reconstitution.

---

## 8. CHECKLIST AVANT PUBLICATION

- [ ] Aucun vrai pseudo / vraie photo d'utilisateur beta n'apparaît
- [ ] Le code d'accès beta (2125) n'est pas visible à l'écran
- [ ] Les URLs affichées sont bien `passio-app.netlify.app`
- [ ] Version 9:16 (stories/TikTok) **et** version 1:1 ou 16:9 (site / YouTube)
- [ ] Sous-titres brûlés (85 % des vues sociales sont sans son)
- [ ] Première seconde accrocheuse : le logo peut attendre, l'accroche non
