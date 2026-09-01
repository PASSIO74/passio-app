/* ═══════════════════════════════════════════════════════════════════════════
   RELATIONS SÉMANTIQUES — TECHNIQUES ET INVISIBLES
   ───────────────────────────────────────────────────────────────────────────
   ⚠️ CE FICHIER NE PRODUIT AUCUN NIVEAU À L'ÉCRAN. Les relations ne servent
   qu'à SUGGÉRER mieux : elles n'imposent jamais de passer par un terme plus
   général, elles ne filtrent rien, et rien dans l'interface ne les nomme.

   `broader` / `narrower` sont dérivées automatiquement du champ `broader` des
   fichiers de passions — il n'y a rien à écrire ici pour elles.
   Ce fichier ne porte que les liens LATÉRAUX (`related`), ceux qu'aucune
   arborescence ne peut deviner : ils traversent les domaines.

   Format : [ idA, idB, poids ]  — la relation est posée dans les DEUX sens.
   ═══════════════════════════════════════════════════════════════════════════ */
module.exports = [
  ["photo-astrophoto", "sciences-astronomie", 3],
  ["photo-astrophoto", "nature-ciel-nocturne", 2],
  ["sciences-astronomie", "sciences-telescope", 3],
  ["moto-mecanique", "auto-mecanique-auto", 2],
  ["moto-mecanique", "metier-soudure", 1],
  ["cyclisme-mecanique-velo", "moto-mecanique", 1],
  ["musique-guitare-electrique", "musique-rock", 3],
  ["musique-guitare-electrique", "musique-metal", 2],
  ["musique-mao", "ia-musique-ia", 2],
  ["musique-home-studio", "podcast-montage-audio", 2],
  ["cuisine-coreenne", "cuisine-miso", 2],
  ["cuisine-coreenne", "voyage-coree", 2],
  ["cuisine-cuisine-japonaise", "voyage-japon", 2],
  ["cuisine-sushi", "cuisine-cuisine-japonaise", 3],
  ["cuisine-ramen", "cuisine-cuisine-japonaise", 3],
  ["cuisine-fermentation", "cuisine-kombucha", 3],
  ["cuisine-fermentation", "cuisine-miso", 3],
  ["jardinage-urbain", "jardinage-balcon", 3],
  ["jardinage-potager", "nature-autonomie", 2],
  ["jardinage-permaculture", "nature-agriculture", 2],
  ["moto-enduro", "moto-motocross", 3],
  ["moto-enduro", "cyclisme-enduro-vtt", 1],
  ["outdoor-randonnee", "nature-randonnee-nature", 3],
  ["outdoor-alpinisme", "sport-escalade", 2],
  ["outdoor-escalade-bloc", "sport-escalade", 3],
  ["nautisme-plongee", "photo-sous-marine", 2],
  ["nautisme-voile", "voyage-croisiere", 2],
  ["aviation-parachutisme", "aviation-wingsuit", 3],
  ["aviation-drone-course", "tech-drones", 3],
  ["aviation-drone-course", "video-drone-video", 2],
  ["tech-impression-3d", "design-modelisation-3d", 3],
  ["tech-impression-3d", "metier-fablab", 2],
  ["tech-arduino", "dev-embarque", 3],
  ["tech-raspberry-pi", "tech-serveur-maison", 2],
  ["ia-ia-generative", "art-peinture-numerique", 2],
  ["ia-code-ia", "dev-javascript", 1],
  ["dev-jeux-code", "jeuxvideo-game-design", 3],
  ["dev-unity", "jeuxvideo-game-design", 2],
  ["yoga-aerien", "theatre-tissu-aerien", 3],
  ["yoga-meditation", "interiorite-bouddhisme", 2],
  ["yoga-meditation", "sante-anxiete", 2],
  ["fitness-musculation", "sport-nutrition-sportive", 2],
  ["running-trail", "outdoor-randonnee", 2],
  ["collectif-football", "collectif-gardien", 3],
  ["langues-japonais", "voyage-japon", 2],
  ["langues-coreen", "musique-kpop", 2],
  ["histoire-genealogie", "histoire-archives", 3],
  ["collections-vinyles", "musique-collection-disques", 3],
  ["collections-maquettes", "collections-trains-miniatures", 2],
  ["mode-couture", "mode-patronage", 3],
  ["mode-tricot", "mode-crochet", 3],
  ["metier-menuiserie", "bricolage-meubles-diy", 2],
  ["peche-mouche", "peche-mouche-montage", 3],
  ["animaux-chiens", "animaux-education-canine", 3],
  ["nature-mycologie", "nature-plantes-sauvages", 2],
  ["litterature-ecriture", "apprentissage-prise-de-notes", 1],
  ["entrepreneuriat-freelance", "apprentissage-reconversion", 2],
  ["finance-immobilier", "bricolage-renovation", 2],
];
