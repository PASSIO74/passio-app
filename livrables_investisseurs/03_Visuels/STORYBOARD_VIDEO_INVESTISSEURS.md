# 🎬 PASSIO — Storyboard vidéo de présentation investisseurs (Veo 3)

Vidéo cible : **60–75 s**, deux formats (16:9 pitch + 9:16 mobile).
Principe : 8 plans de ~8 s générés dans Veo 3, enchaînés avec **les vrais écrans de l'app**.

---

## ⚙️ Rappels techniques Veo 3 (à ne pas oublier)

1. **8 s max par clip** → on génère 8 plans séparés, puis on les assemble.
2. **Style identique sur chaque plan** (bloc ci-dessous) = montage cohérent.
3. **Pas de visage reconnaissable** → mains, de dos, silhouettes, aériennes.
4. **Veo ne reproduit pas l'UI** → on intègre les vrais écrans par l'une des 2 méthodes.

### Bloc de STYLE (à coller en tête de CHAQUE prompt)
```
STYLE (identique sur tous les plans) : publicité tech premium façon Apple / Linear,
16:9 cinématique, 4K, 24 fps, grain fin, lumière naturelle douce heure dorée,
palette dominante violet #7c3aed + blanc cassé + noir profond, contraste élevé,
profondeur de champ marquée (bokeh), mouvements de caméra fluides sur gimbal,
aucun visage reconnaissable (mains, de dos, silhouettes, aériennes uniquement),
ambiance chaleureuse et humaine, énergie ascendante. Voix off FRANÇAISE
chaleureuse et posée (studio, sans écho). Musique : nappe électronique
inspirante montante, discrète sous la voix. Texte à l'écran : typographie
sans-serif fine, blanche, animée en fondu. Marque affichée : "PASSIO".
```
> Pour le format vertical, remplacer `16:9 cinématique` par `9:16 vertical`.

---

## 🖼️ Les 2 méthodes d'intégration des vrais écrans

### 🅰️ Image-to-Video (rapide) — Veo redessine l'écran (risque de bavure)
Dans Google Flow / Gemini Veo → **« Frames to Video »** → uploader la capture indiquée → coller le prompt. Le prompt ORDONNE de figer l'écran.
- Uploader les fichiers `docs/screenshots/*-mobile.png` (natifs 390×844).

### 🅱️ Green screen + incrustation (fidèle) — RECOMMANDÉ pour les gros plans
Veo génère un téléphone à **écran vert uni**, on incruste la vraie capture au montage.
- Assets HD prêts : `livrables_investisseurs/03_Visuels/ecrans-HD/ecran-*-HD.png` (1080×2337, nets).
- Ajouter au prompt (SANS uploader d'image) :
```
L'ÉCRAN DU TÉLÉPHONE EST UN RECTANGLE VERT VIF UNI (#00FF00), parfaitement plat,
sans reflet ni texte dessus — c'est un fond d'incrustation. Le téléphone est tenu
bien face caméra, stable, l'écran occupe un cadre net et non déformé.
```
- Montage CapCut : clip Veo (piste 1) + capture HD (piste 2) → effet **Chroma key** sur le vert → caler la capture sur le cadre du téléphone.

> **Choix conseillé** : méthode 🅱️ pour Feed / Studio / CDV / Messages / IRL (écran vu de près), méthode 🅰️ tolérée sinon.

---

## 🎞️ STORYBOARD — 8 plans

### Plan 1 — Accroche / le problème (~8 s) · *génération pure*
```
[BLOC DE STYLE]
PLAN : gros plan sur des mains qui font défiler machinalement un téléphone dans un
canapé, lumière froide, visage hors champ. Le pouce ralentit, s'arrête, soupir.
Lent zoom avant. Transition : l'écran s'illumine en violet.
VOIX OFF : "On a des milliers d'amis en ligne… et personne avec qui partager ce qu'on aime vraiment."
TEXTE : "Et si vos passions vous connectaient ?"
```

### Plan 2 — Promesse / logo (~8 s) · *génération pure (option : uploader passio-logo-512.png)*
```
[BLOC DE STYLE]
PLAN : fond violet dégradé mesh animé, des particules lumineuses convergent au
centre pour former le mot "PASSIO" en lettres blanches nettes, léger halo.
Caméra recule.
VOIX OFF : "PASSIO. Le réseau social des passions."
TEXTE : "Le réseau social des passions"
```

### Plan 3 — Le Fil · 🅐 `feed-mobile.png` / 🅑 `ecran-feed-HD.png`
```
[BLOC DE STYLE]
🅐 IMAGE DE DÉPART = l'écran fourni. GARDE LE CONTENU DE L'ÉCRAN STRICTEMENT
IDENTIQUE ET NET, ne redessine aucun texte ni icône.
PLAN : une main tient ce smartphone, le pouce fait un léger scroll, reflets doux
qui glissent sur la vitre, arrière-plan chaleureux flou (bokeh), micro travelling
avant. Interface parfaitement lisible et stable.
🅑 (variante green screen : ajouter le bloc écran vert.)
VOIX OFF : "Un fil qui ne parle que de ce qui vous anime — trié pour vous, pas contre vous."
TEXTE : "Un fil, vos passions"
```

### Plan 4 — IRL / carte & rencontres · 🅐 `irl-mobile.png` / 🅑 `ecran-irl-HD.png`
```
[BLOC DE STYLE]
🅐 IMAGE DE DÉPART = l'écran fourni, GARDE L'ÉCRAN IDENTIQUE ET NET.
PLAN : téléphone posé à plat sur une table en bois, lente descente de caméra en
plongée, une main entre dans le cadre et tapote un événement. Ambiance café
chaleureuse en arrière-plan flou. (Option coupe : deux silhouettes de dos qui se
rejoignent et se serrent la main.)
VOIX OFF : "Des événements près de chez vous — la passion devient une vraie rencontre."
TEXTE : "En ligne → dans la vraie vie"
```

### Plan 5 — Studio / Bobines · 🅐 `studio-mobile.png` / 🅑 `ecran-studio-HD.png`
```
[BLOC DE STYLE]
🅐 IMAGE DE DÉPART = l'écran fourni, GARDE L'ÉCRAN IDENTIQUE ET NET.
PLAN : deux mains tiennent le téléphone en mode vertical face à une scène créative
(atelier / plat / instrument) en arrière-plan flou, léger mouvement dynamique, la
vitre reflète une lumière violette. Interface stable et lisible.
VOIX OFF : "Créez des bobines, des stories, des lives — sans quitter l'univers de votre passion."
TEXTE : "Créez. Partagez. En direct."
```

### Plan 6 — Carnets de voyage (CDV) · 🅐 `cdv-mobile.png` / 🅑 `ecran-cdv-HD.png`
```
[BLOC DE STYLE]
🅐 IMAGE DE DÉPART = l'écran fourni, GARDE L'ÉCRAN IDENTIQUE ET NET.
PLAN : une main pose le téléphone sur une carte papier de voyage étalée sur une
table, objets de voyage flous autour (appareil photo, billet), lumière heure
dorée, léger travelling latéral.
VOIX OFF : "Racontez vos voyages, étape par étape — seul ou à plusieurs."
TEXTE : "Vos aventures, cartographiées"
```

### Plan 7 — Messages & appels · 🅐 `messages-mobile.png` / 🅑 `ecran-messages-HD.png`
```
[BLOC DE STYLE]
🅐 IMAGE DE DÉPART = l'écran fourni, GARDE L'ÉCRAN IDENTIQUE ET NET.
PLAN : téléphone posé sur une table tamisée le soir, une main s'en approche, reflet
chaud sur la vitre, très léger push-in. Intime, feutré. Interface stable.
VOIX OFF : "Messages, vocaux, appels vidéo : la conversation reste là où naît la passion."
TEXTE : "Restez connectés"
```

### Plan 8 — Clôture investisseurs (~8 s) · *génération pure*
```
[BLOC DE STYLE]
PLAN : recul aérien large sur une ville la nuit qui s'illumine de milliers de points
violets reliés entre eux formant un réseau vivant. Le réseau se resserre en logo
"PASSIO". Musique culmine puis retombe.
VOIX OFF : "PASSIO. Là où les passions rassemblent. Rejoignez l'aventure."
TEXTE : "PASSIO — rejoignez l'aventure"  puis  "passio-app.netlify.app"
```

---

## 🧩 Assemblage final (CapCut, gratuit)

1. Importer les 8 clips Veo dans l'ordre 1→8.
2. Coupes franches, sauf **fondu violet** sur 1→2 et 7→8.
3. Pour les plans green screen : poser l'écran HD en piste 2, **Chroma key** sur le vert.
4. **Une seule** piste musicale continue (ElevenLabs ou musique libre de droits) sous la voix.
5. Rythme : plans 3‑6 plus courts (accélération), respiration sur 1‑2 et 8.
6. Exporter en **1080p 24 fps** (16:9) + une passe **9:16** pour LinkedIn/mobile.

## 📁 Assets fournis
- Écrans HD incrustation : `livrables_investisseurs/03_Visuels/ecrans-HD/ecran-{feed,irl,studio,cdv,messages,explore,profil,wallet,profil-riche}-HD.png` (1080×2337)
- Captures natives (image-to-video) : `docs/screenshots/*-mobile.png` (390×844)
- Logo : `livrables_investisseurs/03_Visuels/passio-logo-512.png`

---

## 📱 VARIANTE 9:16 VERTICAL (prête à coller)

Format natif pour LinkedIn / Reels / Stories. L'écran de l'app remplit davantage le cadre.

### Bloc de STYLE 9:16 (en tête de CHAQUE prompt vertical)
```
STYLE (identique sur tous les plans) : publicité tech premium façon Apple / Linear,
9:16 VERTICAL plein cadre, 4K, 24 fps, grain fin, lumière naturelle douce heure
dorée, palette dominante violet #7c3aed + blanc cassé + noir profond, contraste
élevé, profondeur de champ marquée (bokeh), mouvements de caméra fluides sur
gimbal, aucun visage reconnaissable (mains, de dos, silhouettes, aériennes
uniquement), ambiance chaleureuse et humaine, énergie ascendante. Voix off
FRANÇAISE chaleureuse et posée (studio, sans écho). Musique : nappe électronique
inspirante montante, discrète sous la voix. Texte à l'écran : typographie
sans-serif fine, blanche, animée en fondu, placé dans le TIERS INFÉRIEUR (zone
sûre mobile). Marque affichée : "PASSIO".
```

**Plan 1 — Accroche**
```
[BLOC DE STYLE 9:16]
PLAN : gros plan vertical sur des mains qui font défiler machinalement un téléphone
dans un canapé, lumière froide, visage hors champ. Le pouce ralentit, s'arrête,
soupir. Lent zoom avant. Transition : l'écran s'illumine en violet.
VOIX OFF : "On a des milliers d'amis en ligne… et personne avec qui partager ce qu'on aime vraiment."
TEXTE (bas) : "Et si vos passions vous connectaient ?"
```

**Plan 2 — Logo**
```
[BLOC DE STYLE 9:16]
PLAN : fond violet dégradé mesh animé plein cadre vertical, des particules
lumineuses convergent au centre pour former le mot "PASSIO" en lettres blanches
nettes, léger halo. Caméra recule.
VOIX OFF : "PASSIO. Le réseau social des passions."
TEXTE (bas) : "Le réseau social des passions"
```

**Plan 3 — Le Fil** · 🅐 `feed-mobile.png` / 🅑 `ecran-feed-HD.png`
```
[BLOC DE STYLE 9:16]
🅐 IMAGE DE DÉPART = l'écran fourni. GARDE LE CONTENU DE L'ÉCRAN STRICTEMENT
IDENTIQUE ET NET, ne redessine aucun texte ni icône.
PLAN vertical : une main tient ce smartphone bien face caméra, il remplit le cadre,
le pouce fait un léger scroll, reflets doux qui glissent sur la vitre, arrière-plan
chaleureux flou (bokeh), micro travelling avant. Interface parfaitement lisible.
🅑 (variante green screen : ajouter le bloc écran vert #00FF00.)
VOIX OFF : "Un fil qui ne parle que de ce qui vous anime — trié pour vous, pas contre vous."
TEXTE (bas) : "Un fil, vos passions"
```

**Plan 4 — IRL / rencontres** · 🅐 `irl-mobile.png` / 🅑 `ecran-irl-HD.png`
```
[BLOC DE STYLE 9:16]
🅐 IMAGE DE DÉPART = l'écran fourni, GARDE L'ÉCRAN IDENTIQUE ET NET.
PLAN vertical : téléphone tenu à la verticale, une main tapote un événement sur la
carte, arrière-plan café chaleureux flou. (Option coupe : deux silhouettes de dos
qui se rejoignent et se serrent la main, cadrage vertical.)
VOIX OFF : "Des événements près de chez vous — la passion devient une vraie rencontre."
TEXTE (bas) : "En ligne → dans la vraie vie"
```

**Plan 5 — Studio / Bobines** · 🅐 `studio-mobile.png` / 🅑 `ecran-studio-HD.png`
```
[BLOC DE STYLE 9:16]
🅐 IMAGE DE DÉPART = l'écran fourni, GARDE L'ÉCRAN IDENTIQUE ET NET.
PLAN vertical : deux mains tiennent le téléphone en mode portrait face à une scène
créative (atelier / plat / instrument) en arrière-plan flou, léger mouvement
dynamique, la vitre reflète une lumière violette. Interface stable et lisible.
VOIX OFF : "Créez des bobines, des stories, des lives — sans quitter l'univers de votre passion."
TEXTE (bas) : "Créez. Partagez. En direct."
```

**Plan 6 — Carnets de voyage (CDV)** · 🅐 `cdv-mobile.png` / 🅑 `ecran-cdv-HD.png`
```
[BLOC DE STYLE 9:16]
🅐 IMAGE DE DÉPART = l'écran fourni, GARDE L'ÉCRAN IDENTIQUE ET NET.
PLAN vertical : une main tient le téléphone au-dessus d'une carte papier de voyage
étalée sur une table, objets de voyage flous autour (appareil photo, billet),
lumière heure dorée, léger travelling vertical de bas en haut.
VOIX OFF : "Racontez vos voyages, étape par étape — seul ou à plusieurs."
TEXTE (bas) : "Vos aventures, cartographiées"
```

**Plan 7 — Messages & appels** · 🅐 `messages-mobile.png` / 🅑 `ecran-messages-HD.png`
```
[BLOC DE STYLE 9:16]
🅐 IMAGE DE DÉPART = l'écran fourni, GARDE L'ÉCRAN IDENTIQUE ET NET.
PLAN vertical : téléphone tenu à la verticale dans une ambiance tamisée du soir,
reflet chaud sur la vitre, très léger push-in. Intime, feutré. Interface stable.
VOIX OFF : "Messages, vocaux, appels vidéo : la conversation reste là où naît la passion."
TEXTE (bas) : "Restez connectés"
```

**Plan 8 — Clôture CTA**
```
[BLOC DE STYLE 9:16]
PLAN vertical : recul aérien sur une ville la nuit qui s'illumine de milliers de
points violets reliés entre eux formant un réseau vivant. Le réseau se resserre en
logo "PASSIO". Musique culmine puis retombe.
VOIX OFF : "PASSIO. Là où les passions rassemblent. Rejoignez l'aventure."
TEXTE (bas) : "PASSIO — rejoignez l'aventure"  puis  "passio-app.netlify.app"
```

---

## 🎙️ Script voix off complet (à enregistrer d'un trait, ElevenLabs voix FR)
> On a des milliers d'amis en ligne… et personne avec qui partager ce qu'on aime vraiment.
> PASSIO. Le réseau social des passions.
> Un fil qui ne parle que de ce qui vous anime — trié pour vous, pas contre vous.
> Des événements près de chez vous : la passion devient une vraie rencontre.
> Créez des bobines, des stories, des lives, sans quitter l'univers de votre passion.
> Racontez vos voyages, étape par étape, seul ou à plusieurs.
> Messages, vocaux, appels vidéo : la conversation reste là où naît la passion.
> PASSIO. Là où les passions rassemblent. Rejoignez l'aventure.
