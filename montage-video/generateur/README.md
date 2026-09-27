# Vidéo de présentation PASSIO — générateur (2026-09-27)

Livrables : `../PASSIO-presentation-16x9.mp4` et `../PASSIO-presentation-9x16.mp4` (48,7 s, 30 i/s, musique originale synthétisée).

Déroulé : triptyque « Une passion, ça se vit » → logo → **01 Le fil** (partager une publication avec photo, puis découvrir le fil)
→ **02 Rencontrer** (trouver une activité, s'inscrire, organiser la sienne) → **03 Messages** → « Du feed à la vraie vie » → carton final.

Les écrans sont de **vraies captures de l'application** (`npm run serve`), rendues image par image au gabarit iPhone
(390 × 844, ×2). Profils et publications sont le contenu de démonstration de l'app ; les photos viennent des rushes de
`montage-video/` ; les écritures Supabase sont neutralisées pendant la capture (rien n'est écrit en production).

Reproduire (depuis un dossier de travail contenant ces fichiers) :
1. `pool/` : images extraites des rushes ; `broll/<nom>/%04d.jpg` : rushes à 30 i/s ; `m1-3.ttf` : Manrope 600/700/800 ; `icon-512.png`.
2. `node capture.js` → séquences `frames/*` + `share|discover|irl|msg.json`.
3. `node render.js h` et `node render.js v` → images composées ; `python3 music.py` → `music.wav`.
4. ffmpeg : `-framerate 30 -i out_h/%05d.jpg -i music.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac`.
