#!/usr/bin/env node
// Fabrique donnees/domaines/partage.json (registre + constats) à partir des
// données ci-dessous, et vérifie la cohérence : identifiants cités existants,
// captures présentes sur disque, compteurs. Rien d'autre n'est écrit.
//   node docs/audit-ux-ui-2026-11-10/outils/sondes/partage-construire-json.js
"use strict";
const fs = require("fs");
const path = require("path");
const AUDIT = path.resolve(__dirname, "..", "..");

const registre = [];
const R = (id, surface, composant, etat, role, geste, observation, preuve, problemes, proposition, visuel, verdict, justification) =>
  registre.push({ id, surface, composant, etat, role, geste, observation, preuve, problemes, proposition, visuel, verdict, justification });

// ── PUBLICATION ─────────────────────────────────────────────────────────────
R("PAR-001", "Fil", "Bouton « Partager » d'une carte de publication", "contenu normal", "connecté", "Découvrir → rangée d'actions d'une carte", "observe",
  "capture PAR-001 (m390) ; sonde partage-01 : 44 × 31 px, <span role=button> ; rendu js/app-02-state-utils.js:10496 (carte) et :10577 (page de la publication, même bouton)",
  ["PAR-C18"], "Porter la cible à 44 × 44 px sans changer l'icône.", "avant-apres", "a-ameliorer", "Icône unifiée correcte, cible trop basse.");
R("PAR-002", "Feuille de partage", "« Partager ce post » (publication)", "ouverte", "connecté", "Carte → icône Partager", "observe",
  "capture PAR-002 (m390, m360) ; sonde partage-01 ; js/app-03-posts-vlogs.js:11",
  ["PAR-C07", "PAR-C09", "PAR-C10", "PAR-C11", "PAR-C18"], "Feuille unifiée : aperçu, à qui, « Envoyer à quelqu'un », « Copier le lien », « Republier dans mon fil ».", "avant-apres", "a-ameliorer", "Deux boutons aux libellés flous, aucun aperçu de l'auteur, mots « post » et « feed ».");
R("PAR-003", "Feuille de partage", "Retour de « Partager en dehors » (copie réussie)", "après action", "connecté", "Feuille → Partager en dehors (sans feuille système)", "observe",
  "capture PAR-003 (m390) ; sonde partage-07 : toast peint sous la feuille (elementFromPoint → #_shareInFeedBtn) ; presse-papiers lu : « <texte>\\n<lien> »",
  ["PAR-C03", "PAR-C19", "PAR-C10"], "Confirmation dans la feuille et toast au-dessus des feuilles.", "avant-apres", "a-ameliorer", "Le geste réussit sans aucun signe visible.");
R("PAR-004", "Feuille de partage", "Repli « Lien : <adresse> » (presse-papiers refusé)", "échec", "connecté", "Partager en dehors, copie refusée par le navigateur", "observe",
  "capture PAR-004 (m390) ; sonde partage-01 : toast 390 × 73 px, adresse de 120+ caractères ; js/app-02-state-utils.js:3609",
  ["PAR-C04", "PAR-C03"], "Lien affiché dans la feuille, sélectionnable, bouton « Copier ».", "avant-apres", "a-ameliorer", "Un échec dit par une adresse brute qui disparaît en 3 s.");
R("PAR-005", "Fil", "Carte produite par « Partager dans mon feed »", "après repartage", "connecté", "Feuille → Partager dans mon feed", "observe",
  "capture PAR-005 (m390) ; sonde partage-02 : texte seul, aucune image, aucun lien vers pa_lea_1 ; double appui réel = 1 seule publication ; js/app-03-posts-vlogs.js:87",
  ["PAR-C06", "PAR-C09"], "Carte « a republié » avec l'originale citée (vignette, auteur, extrait) et cliquable.", "avant-apres", "a-ameliorer", "Le repartage perd la photo et le chemin vers l'originale.");
R("PAR-006", "Feuille de partage", "« Partager dans mon feed » — double appui, bouton « Partage en cours… »", "action répétée", "connecté", "Double appui réel sur le bouton", "observe",
  "sonde partage-02 : 1 ligne `posts` créée, bouton désactivé au premier appui (js/app-03-posts-vlogs.js:51)", [], "", "aucun", "a-conserver", "Le verrou anti-double-envoi tient.");
R("PAR-007", "Feuille de partage", "Feuille du système (navigator.share) — publication", "branche native", "connecté", "Partager en dehors sur un téléphone", "simule",
  "sonde partage-01 : `navigator.share` remplacé par un espion → { title: « PASSIO », text: 100 premiers caractères, url } ; annulation (AbortError) silencieuse ; refus (NotAllowedError) → copie",
  ["PAR-C10", "PAR-C19"], "Titre et texte qui nomment l'auteur et PASSIO.", "aucun", "a-ameliorer", "La mécanique (annulation muette, repli) est saine ; le message transmis ne dit pas d'où il vient. La vraie feuille du téléphone n'est pas visible au banc.");
// ── BOBINE ──────────────────────────────────────────────────────────────────
R("PAR-010", "Lecteur de bobines", "Bouton « Partager » du rail", "contenu normal", "connecté", "Bobine → rail de droite", "simule",
  "capture PAR-010 (m390), lecteur ouvert par `openReelById` ; bouton 48 × 63 px, libellé « Partager » ; js/app-05-config-profil.js:3066 (SVG propre, même dessin à nœuds)",
  [], "", "avant", "a-conserver", "Cible large, icône et libellé cohérents.");
R("PAR-011", "Feuille de partage", "« Partager cette bobine » — huit options", "ouverte", "connecté", "Rail → Partager", "observe",
  "capture PAR-011 (m390, m360) ; sonde partage-05 : 8 boutons de 42 px, aucun aperçu ; URLs transmises relevées (wa.me, t.me, twitter.com/intent, facebook sharer) ; js/app-05-config-profil.js:3807",
  ["PAR-C07", "PAR-C08", "PAR-C09", "PAR-C18"], "La même feuille unifiée que pour une publication.", "avant-apres", "a-ameliorer", "Seule porte sans feuille système, six réseaux en dur, lien sans aperçu ni invitation.");
R("PAR-012", "Lecteur de bobines", "Retour de « Copier le lien »", "après action", "connecté", "Feuille bobine → Copier le lien", "observe",
  "capture PAR-012 (m390) ; sonde partage-07 : toast sous `.reels-viewer` (z-index 9999) ; presse-papiers lu = lien `…#reel=pa_lea_2` seul",
  ["PAR-C03"], "Toast au-dessus du lecteur.", "avant-apres", "a-ameliorer", "La feuille se ferme, rien ne confirme.");
R("PAR-013", "Feuille de partage", "« Copier le lien » d'une bobine, presse-papiers refusé", "échec", "connecté", "Copier le lien, copie refusée", "observe",
  "sonde partage-05 : erreur JS « Failed to execute 'writeText' on 'Clipboard': Write permission denied » (promesse sans `catch`, js/app-06-reels-partage.js:901) ; aucun toast, feuille inchangée",
  ["PAR-C04"], "Même repli que les autres portes.", "aucun", "a-ameliorer", "Échec totalement muet, erreur non gérée.");
R("PAR-014", "Feuille de partage", "WhatsApp / Telegram / 𝕏 Twitter / Facebook (bobine)", "après action", "connecté", "Feuille bobine → un réseau", "simule",
  "sonde partage-05 : `window.open` intercepté ; texte « Regarde cette bobine PASSIO: Trente secondes d'arpèges.... » ; toast « Ouverture whatsapp... » (sous le lecteur)",
  ["PAR-C08", "PAR-C03", "PAR-C09"], "Remplacés par la feuille du téléphone.", "aucun", "a-ameliorer", "Texte fautif (« .... », nom de réseau en minuscules), ouverture d'une fenêtre tierce non vue au banc.");
R("PAR-015", "Feuille de partage", "E-mail et SMS (bobine)", "liens mailto: / sms:", "connecté", "Feuille bobine → Email, SMS", "code",
  "js/app-06-reels-partage.js:945 et :965 ; toasts « Ouverture de ton client email… », « Ouverture SMS… » émis même sans application associée",
  ["PAR-C08"], "Remplacés par la feuille du téléphone.", "aucun", "a-ameliorer", "Non exercés : un `location.href = mailto:` sort du banc.");
R("PAR-016", "Lecteur de bobines", "« Partager dans le Feed » — double appui", "action répétée", "connecté", "Double appui réel sur le bouton", "observe",
  "sonde partage-05 (image g) : 1 publication créée, mais le second appui traverse la feuille déjà fermée et active « Découvrir Musique » : lecteur fermé, fiche de passion ouverte ; pas de verrou dans `shareReelInFeed` (js/app-05-config-profil.js:3862)",
  ["PAR-C15", "PAR-C06"], "Bouton désactivé « Partage en cours… » et fermeture différée de la feuille.", "aucun", "a-ameliorer", "Un double appui mène à un écran sans rapport.");
// ── ACTIVITÉ ────────────────────────────────────────────────────────────────
R("PAR-020", "Fiche d'activité", "Bouton « Partager » du coin haut droit", "contenu normal", "connecté", "Rencontrer → une activité", "simule",
  "capture PAR-020 (m390), fiche ouverte par `openEventDetails` ; 45 × 45 px ; pictogramme en flèche courbe (ui-v4b-fiche.js:562) différent de `shareIconSvg`",
  ["PAR-C12"], "Reprendre l'icône à nœuds.", "avant-apres", "a-ameliorer", "Seule porte de partage de l'app avec une autre icône.");
R("PAR-021", "Fiche d'activité", "Bas de fiche : icône « Partager », bouton « Partager », bouton « Inviter »", "contenu normal", "connecté", "Fiche → défiler jusqu'à « Autres actions »", "observe",
  "capture PAR-021 (m390) ; sonde partage-03 : portes à 14, 1 554, 1 799 et 1 848 px du haut d'une page de 2 058 px ; js/app-07-ia-explore-irl.js:4412, :4413, :4498",
  ["PAR-C12", "PAR-C18"], "Une porte en haut, une en bas « Partager ou inviter », même feuille.", "avant-apres", "a-ameliorer", "Trois portes pour la même feuille, et l'invitation tout en bas.");
R("PAR-022", "Feuille de partage", "« Partager cet événement »", "ouverte", "connecté", "Fiche → Partager", "observe",
  "capture PAR-022 (m390, m360) ; sonde partage-03 : aperçu « titre · ville / 13 nov » ; natif simulé : { title: titre, text: « titre · Lyon · 13 nov », url } ; js/app-07-ia-explore-irl.js:5056",
  ["PAR-C07", "PAR-C09", "PAR-C10", "PAR-C11"], "Feuille unifiée avec date complète, heure et lieu, et l'invitation interne.", "avant-apres", "a-ameliorer", "Le message d'une invitation à sortir ne donne pas l'heure.");
R("PAR-023", "Feuille « Inviter des amis » (activité)", "Liste des abonnements invitables", "contenu normal", "connecté", "Fiche → Inviter", "observe",
  "capture PAR-023 (m390, m360) ; sonde partage-04 : deux boutons × superposés, bouton « Inviter » 56 × 29 px, champ sans libellé, notification `event_invite` écrite au serveur fictif ; toast « Invitation envoyée » sous la feuille ; js/app-07-ia-explore-irl.js:7411",
  ["PAR-C13", "PAR-C03", "PAR-C09", "PAR-C18"], "Titre « Inviter mes abonnements », bouton 44 px, phrase sur ce qui est envoyé.", "avant-apres", "a-ameliorer", "Fonction utile, exécution étroite et titre trompeur.");
R("PAR-024", "Feuille « Inviter des amis » (activité)", "État « Tu as invité tout le monde » / aucun abonnement", "vide", "connecté", "Inviter la dernière personne, ou rouvrir", "observe",
  "capture PAR-024 (m390) ; sonde partage-04 : même message à la réouverture, invités non listés ; variante « Abonne-toi à des passionnés… » (js/app-07-ia-explore-irl.js:7444, d'après le code) ; recherche sans résultat : « Aucun résultat pour « zzz » »",
  ["PAR-C13"], "Rappel de qui a été invité et sortie « Envoyer le lien ».", "avant-apres", "a-ameliorer", "Impasse au moment où l'on veut encore inviter.");
R("PAR-025", "QR d'accueil des participants", "« Copier le lien de pointage »", "après action", "connecté · organisateur", "Ma fiche → QR d'accueil → Copier le lien de pointage", "observe",
  "capture PAR-025 (m390) ; sonde partage-04/07 : toast sous la feuille ; js/app-07-ia-explore-irl.js:8083",
  ["PAR-C03"], "Le bouton confirme lui-même, et dit à qui envoyer ce lien.", "avant-apres", "a-ameliorer", "Aucun retour, aucune explication de la conséquence.");
R("PAR-026", "Affiche de la rencontre", "Aperçu A4 + « Enregistrer l'image »", "contenu normal", "connecté · organisateur", "Ma fiche → Affiche à imprimer · QR d'inscription", "observe",
  "capture PAR-026 (m390) ; sonde partage-04 : image 1240 × 1754, aperçu 354 × 501 ; js/affiche-rencontre.js:306",
  ["PAR-C09"], "", "avant", "a-conserver", "Lisible, utile au passage au réel ; seul le mot « rencontre » diverge (constat de vocabulaire). Le bouton « Partager l'affiche » (fichier) n'est pas visible au banc.");
R("PAR-027", "Fenêtre « Ton activité est en ligne »", "« Inviter mes amis » / « Plus tard »", "juste après création", "connecté · organisateur", "Créer une activité (fin de publication)", "simule",
  "capture PAR-027 (m390), `proposerInvitationActivite(ev)` appelée ; texte transmis d'après le code : « Je t'invite : <titre> — <date, heure> · <ville>. Rejoins-moi sur PASSIO 👇 » (js/app-07-ia-explore-irl.js:7222)",
  ["PAR-C09"], "", "avant", "a-conserver", "Bon moment, un seul geste, message à la première personne avec date et heure : c'est le modèle à généraliser. Seul le libellé « Inviter mes amis » se confond avec « Inviter » de la fiche.");
R("PAR-028", "Studio", "« Partager mon expérience » → Studio prérempli", "après activité passée", "connecté · participant", "Fiche d'une activité passée → Partager mon expérience", "observe",
  "capture PAR-028 (m390) ; sonde partage-04 : texte « 📍 titre · ville (6 nov) », `window._pendingEventPost` posé, consommé seulement par la prochaine publication (js/app-06-reels-partage.js:5379)",
  ["PAR-C16"], "Bandeau « Souvenir de … » visible et retirable.", "avant-apres", "a-ameliorer", "Le rattachement à l'album est invisible et survit à l'abandon du Studio.");
R("PAR-029", "Fil", "Carte produite par « Partager dans mon feed » (activité)", "après repartage", "connecté", "Feuille activité → Partager dans mon feed", "observe",
  "sonde partage-03 (image g) : carte « 📍 A partagé un événement » avec « Voir l'activité › » ; toast « Événement partagé dans ton feed. » ; la fiche est fermée et l'on atterrit sur le fil",
  ["PAR-C09"], "", "aucun", "a-conserver", "Ici le repartage garde un lien vers l'original : c'est le comportement à étendre aux publications et bobines.");
// ── PROFIL, INVITATION À L'APPLICATION ──────────────────────────────────────
R("PAR-030", "Profil visité", "Menu ⋯ → « Partager le profil »", "menu ouvert", "connecté", "Carte → auteur → ⋯", "observe",
  "capture PAR-030 (m390) ; sonde partage-06 : bouton ⋯ 34 × 34 px, entrées de 38 px ; js/app-04-comments-shop.js:4673",
  ["PAR-C07", "PAR-C18"], "L'entrée ouvre la feuille unifiée.", "avant", "a-ameliorer", "Seule porte qui part sans feuille ni aperçu.");
R("PAR-031", "Profil visité", "Retour de « Partager le profil » (copie)", "après action", "connecté", "⋯ → Partager le profil", "observe",
  "capture PAR-031 (m390) ; sonde partage-07 : toast « Lien du profil copié » sous la modale plein écran ; presse-papiers : « Découvre Léa Fontaine sur PASSIO\\n<lien> » ; refusé : « Lien : … » lui aussi masqué",
  ["PAR-C03", "PAR-C04", "PAR-C07"], "Feuille unifiée avec confirmation.", "avant-apres", "a-ameliorer", "Aucun signe que quoi que ce soit s'est passé.");
R("PAR-032", "Mon profil", "Crayon → menu → « Inviter des amis »", "menu ouvert", "connecté", "Profil → crayon", "observe",
  "capture PAR-032 (m390) ; sonde partage-06 : bouton `aria-label=\"Modifier le profil\"`, 6e entrée ; transmis : « Je suis sur PASSIO, le réseau des passions — rejoins-moi : » + lien de MON profil signé ; js/app-06-reels-partage.js:1886",
  ["PAR-C14", "PAR-C09"], "Bouton visible « Partager mon profil » sous l'identité.", "avant-apres", "a-ameliorer", "L'invitation est rangée sous « modifier ».");
R("PAR-033", "Paramètres", "Support → « Inviter des amis »", "section dépliée", "connecté", "⋯ (barre du haut) → Support", "observe",
  "capture PAR-033 (m390) ; sonde partage-06 : 7e bouton sur 7, 218 × 33 px ; index.html:554",
  ["PAR-C14", "PAR-C18"], "Retirer de « Support » ou le remonter ; 44 px.", "avant", "a-ameliorer", "Trois appuis, sous les mentions légales.");
R("PAR-034", "Fil", "Séparateur « Exemples PASSIO » → « Inviter quelqu'un »", "après action", "connecté", "Fil → défiler jusqu'aux exemples", "observe",
  "capture PAR-034 (m390) ; sonde partage-06 : bouton 110 × 44 px, texte 11 px ; toast « Lien d'invitation copié » visible (écran sans feuille) ; js/app-02-state-utils.js:8632",
  ["PAR-C09"], "", "avant", "a-conserver", "Bien placé (moment où le fil est vide), cible à 44 px, retour visible. Libellé à aligner sur les autres portes.");
R("PAR-035", "Fiche d'une passion", "Porte de partage", "absente", "tous", "Bobine → Découvrir <passion>", "observe",
  "sonde partage-05 (image g) et code `openPassionExplorer` (js/app-07-ia-explore-irl.js:330) : aucune commande de partage, aucun lien `#passion-…`",
  [], "", "aucun", "a-verifier", "Il n'existe pas de partage d'une passion. À confirmer auprès d'utilisateurs avant d'en faire un besoin : aucune fonction n'est proposée ici.");
// ── OUVERTURE DES LIENS — VISITEUR ──────────────────────────────────────────
R("PAR-040", "Arrivée d'un lien (visiteur)", "Publication ouverte + toast « X t'invite sur PASSIO »", "contenu valide", "visiteur", "Ouvrir `?inv=…#post-<id>` sur un appareil vierge", "observe",
  "capture PAR-040 (m390), faux serveur branché sur le visiteur ; sonde partage-09 : pas de landing, publication ouverte en < 3,2 s, `inv` retiré de l'adresse, invitation mémorisée",
  ["PAR-C20", "PAR-C09"], "Bandeau bas persistant : qui invite, ce qu'est PASSIO, « Créer mon compte ».", "avant-apres", "a-ameliorer", "L'arrivée directe sur le contenu est la bonne décision ; l'invitation ne tient que 6 s.");
R("PAR-041", "Arrivée d'un lien (visiteur)", "Fenêtre « Crée ton compte pour aimer cette publication »", "geste engageant", "visiteur", "Publication → cœur", "observe",
  "capture PAR-041 (m390) ; js/first-run.js:1482", [], "", "avant", "a-conserver", "Dit le geste demandé, trois sorties claires, « Continuer à explorer » présent.");
R("PAR-042", "Arrivée d'un lien (visiteur)", "Après « Créer mon compte » depuis une publication ouverte par lien", "parcours bloqué", "visiteur", "Fenêtre → Créer mon compte", "observe",
  "capture PAR-042 (m390) ; sonde partage-10 : `#onboarding.active` z-index 50, `#postDetailPage` z-index 200 ; 5 points sur 5 de l'écran rendent la page de la publication ; champ du formulaire non atteignable ; `ouvrirAuth` ne ferme que la modale (js/first-run.js:1544)",
  ["PAR-C01"], "Fermer la page du contenu (en mémorisant sa cible) avant d'ouvrir le formulaire.", "avant-apres", "a-ameliorer", "Le visiteur qui veut s'inscrire ne voit rien se passer.");
R("PAR-043", "Inscription", "Annonce « X t'invite… tu suivras automatiquement X » + « Ne pas suivre »", "création de compte", "visiteur invité", "Formulaire de création (après retour arrière)", "observe",
  "capture PAR-043 (m390) ; sonde partage-09 : texte exact, bouton « Ne pas suivre » ; js/app-06-reels-partage.js:632",
  [], "", "avant", "a-conserver", "Consentement explicite, refus au même endroit, formulation distincte pour un compte privé (d'après le code).");
R("PAR-044", "Retour après inscription", "Fil + toast « Tu peux aimer cette publication. »", "après inscription", "nouveau compte", "Terminer l'inscription commencée depuis un contenu ouvert par lien", "simule",
  "capture PAR-044 (m390) ; sonde partage-09 : `retour = { screen: \"feed\", hash: \"\", action: \"aimer\" }` — le hash `#post-<id>` a été nettoyé à l'ouverture, `RE_LIEN_PROFOND` ne reconnaît pas `#post` (js/first-run.js:1519, :609) ; `apresAuthentification()` appelée à la main, aucun compte créé",
  ["PAR-C02"], "Rouvrir le contenu visé et y poser le rappel.", "avant-apres", "a-ameliorer", "Le rappel désigne une publication qui n'est plus à l'écran.");
R("PAR-045", "Arrivée d'un lien (visiteur)", "Fiche d'une activité", "contenu valide", "visiteur", "Ouvrir `?inv=…#irl-event-<id>`", "observe",
  "capture PAR-045 (m390)", ["PAR-C20"], "", "avant", "a-conserver", "La fiche s'ouvre directement, lisible sans compte (l'adresse exacte reste réservée aux inscrits).");
R("PAR-046", "Arrivée d'un lien (visiteur)", "Après « Je participe » → « Créer mon compte » sur une fiche", "parcours bloqué", "visiteur", "Fiche → Je participe → Créer mon compte", "observe",
  "capture PAR-046 (m390) : `ecran.onboarding` vrai, fiche (z-index 200) au premier plan", ["PAR-C01", "PAR-C02"], "Idem PAR-042.", "avant-apres", "a-ameliorer", "Même blocage, sur le parcours qui mène au réel.");
R("PAR-047", "Arrivée d'un lien (visiteur)", "Lecteur de bobines", "contenu valide", "visiteur", "Ouvrir `#reel=<id>`", "observe",
  "capture PAR-047 (m390)", ["PAR-C08"], "", "avant", "a-ameliorer", "La bobine s'ouvre, mais sans invitation nominative : son lien n'est pas signé.");
R("PAR-048", "Arrivée d'un lien (visiteur)", "Après « Aimer » → « Créer mon compte » dans le lecteur", "parcours bloqué", "visiteur", "Bobine → cœur → Créer mon compte", "observe",
  "capture PAR-048 (m390) : `ecran.onboarding` vrai, lecteur (z-index 9999) au premier plan", ["PAR-C01", "PAR-C02"], "Idem PAR-042.", "avant-apres", "a-ameliorer", "Même blocage.");
R("PAR-049", "Arrivée d'un lien (visiteur)", "Lien vers un contenu privé ou supprimé — pendant la recherche", "attente", "visiteur", "Ouvrir `#post-<id d'un compte privé>`", "observe",
  "capture PAR-049 (m390) à ~4,7 s : fil d'exemples, aucun indicateur", ["PAR-C05"], "État d'attente puis état d'arrivée persistant.", "avant", "a-ameliorer", "Rien ne dit que le lien est traité.");
R("PAR-050", "Arrivée d'un lien (visiteur)", "Verdict « Publication introuvable ou supprimée »", "contenu privé / supprimé / inconnu", "visiteur", "Attendre ~8 s", "observe",
  "capture PAR-050 (m390) ; sonde partage-08 : 7 864 à 8 670 ms avant le toast (publication, bobine, activité), toast de 3 s ; même message pour privé et supprimé (la RLS tait la ligne)",
  ["PAR-C05", "PAR-C09"], "Carte d'arrivée qui reste, neutre sur la cause, avec une suite.", "avant-apres", "a-ameliorer", "Huit secondes de silence puis trois secondes de message.");
R("PAR-051", "Arrivée d'un lien (visiteur)", "Profil d'un compte privé", "contenu restreint", "visiteur", "Ouvrir `#user-<uuid privé>`", "observe",
  "capture PAR-051 (m390)", [], "", "avant", "a-conserver", "Le profil dit qu'il est privé sans rien montrer de ses publications.");
// ── OUVERTURE DES LIENS — CONNECTÉ ──────────────────────────────────────────
R("PAR-052", "Arrivée d'un lien (connecté)", "Page d'une publication", "contenu valide", "connecté", "Ouvrir `#post-<id>` au démarrage", "observe",
  "capture PAR-052 (m390) ; sonde partage-08 : ouverture en 40 ms en session, retour arrière → fil, hash consommé", ["PAR-C09"], "", "avant", "a-conserver", "Ouverture exacte, retour propre. Seul le titre « Post » diverge.");
R("PAR-053", "Arrivée d'un lien (connecté)", "Fiche d'une activité annulée", "contenu annulé", "connecté", "Ouvrir `#irl-event-<id annulé>`", "observe",
  "capture PAR-053 (m390)", [], "", "avant", "a-conserver", "L'annulation est dite en haut et sur le bouton.");
R("PAR-054", "Arrivée d'un lien (connecté)", "Profil privé, demande en attente", "contenu restreint", "connecté", "Ouvrir `#user-<uuid privé>`", "observe",
  "capture PAR-054 (m390)", [], "", "avant", "a-conserver", "État « Demande envoyée » explicite.");
R("PAR-055", "Arrivée d'un lien (connecté)", "Profil inconnu / pseudo au lieu d'un identifiant", "identifiant inconnu", "connecté", "Ouvrir `#user-<uuid inconnu>` ou `#user-lea`", "observe",
  "capture PAR-055 (m390) ; sonde partage-08 : « Profil non trouvé » (309 ms) pour un uuid inconnu, « Profil introuvable » (9 ms) pour un pseudo",
  ["PAR-C09", "PAR-C05"], "Un seul message, dans l'état d'arrivée commun.", "avant", "a-ameliorer", "Deux formulations pour le même cas.");
R("PAR-056", "Arrivée d'un lien (connecté)", "Bobine, activité valides ; bobine, activité inconnues", "valide / inconnu", "connecté", "Coller le lien en session", "observe",
  "sonde partage-08 : bobine 532 ms, activité 266 ms (retour → « Rencontrer ») ; inconnues : 8 616 et 8 670 ms puis toast", ["PAR-C05"], "", "aucun", "a-ameliorer", "Mêmes délais muets que pour une publication.");
R("PAR-057", "Arrivée d'un lien (connecté)", "Lien de pointage `#irl-checkin-<id>-<code>`", "valide", "connecté", "Ouvrir le lien du QR", "observe",
  "sonde partage-08 : la fiche s'ouvre en 91 ms ; le verdict de code n'est pas jugeable (le faux serveur répond « ok » à tout code)", [], "", "aucun", "a-verifier", "Le refus d'un mauvais code est à vérifier sur une base réelle de recette.");
// ── APERÇU DE LIEN ──────────────────────────────────────────────────────────
R("PAR-060", "Aperçu de lien", "Page servie aux robots (/p/, /u/, /e/)", "contenu public", "robot d'aperçu / humain pris pour un robot", "Requête d'un robot sur un lien court", "simule",
  "capture PAR-060 ; vraie fonction netlify/edge-functions/apercu.js exécutée dans Node avec un faux `fetch` ; humain : « 302 → /?plk=…&inv=…#post-pa_lea_1 »",
  ["PAR-C21"], "Un style minimal pour l'humain mal reconnu.", "avant-apres", "a-ameliorer", "Sûre et correcte ; nue pour un humain.");
R("PAR-061", "Aperçu de lien", "Titres et descriptions : publication, activité, contenu inaccessible", "trois cas", "robot d'aperçu", "—", "simule",
  "capture PAR-061 (rendu générique des balises og:) ; netlify/lib/apercu-coeur.js:215–258", ["PAR-C08"], "", "avant", "a-conserver", "« Léa Fontaine · Musique », date complète et ville pour une activité, repli générique qui ne révèle rien pour un contenu privé.");
// ── SURFACES NON RENDUES ────────────────────────────────────────────────────
R("PAR-070", "Live vidéo", "Bouton « ↗ » Partager le live", "en direct", "diffuseur / spectateur", "Pendant un live", "code",
  "js/app-05-config-profil.js:5097 (caractère « ↗ », pas `shareIconSvg`) et :5209 ; lien `/?live=<id>` ni court ni signé", ["PAR-C12", "PAR-C08"], "Icône à nœuds, lien de `lienPartageDe`.", "aucun", "a-ameliorer", "Troisième icône pour la même action.");
R("PAR-071", "Conversation", "Pièce jointe « Position » (shareLocation)", "envoi immédiat", "connecté", "Conversation → trombone → Position", "code",
  "js/app-09-boot-pwa.js:1482 : `getCurrentPosition` puis message « 📍 Ma position : https://maps.google.com/?q=lat,lng » (5 décimales) inséré sans aperçu ni confirmation",
  ["PAR-C17"], "Aperçu (carte ou adresse) et bouton « Envoyer ma position ».", "aucun", "a-ameliorer", "Donnée sensible envoyée en un appui.");
R("PAR-072", "Feuille du système", "Sélecteur de destinataires du téléphone", "natif", "connecté", "Partager en dehors sur Android / iOS", "inaccessible",
  "API absente du Chromium du banc ; présence simulée par un espion (sondes 01, 03, 06) : seules les données transmises sont connues", [], "", "aucun", "a-verifier", "À regarder sur un téléphone réel : titre, texte et aperçu tels que WhatsApp/iMessage les affichent.");
R("PAR-073", "Invitation", "Fenêtre « 👋 Invitation de X — Suivre X ? / Non merci »", "premier démarrage du compte", "nouveau compte (Google, appareil partagé)", "Créer un compte sans passer par le formulaire annoncé", "code",
  "js/app-06-reels-partage.js:753 ; exige une vraie session", [], "", "aucun", "a-conserver", "Demande au lieu d'imposer ; trois propositions au plus.");
R("PAR-074", "Invitation", "Toast « Tu suis maintenant X : c'est son invitation qui t'a fait venir »", "premier démarrage du compte", "nouveau compte", "Créer un compte depuis le formulaire annoncé", "code",
  "js/app-06-reels-partage.js:734 ; exige une vraie session", ["PAR-C03"], "", "aucun", "a-verifier", "Toast de 6 s, cliquable : s'il part pendant qu'une fenêtre est ouverte, il sera dessous.");
R("PAR-075", "Arrivée d'un lien", "Lien ouvert alors que l'accueil (landing) ou l'inscription occupe l'écran", "première visite, parcours direct coupé", "visiteur", "Ouvrir un lien, drapeau `passio_first_run_experience_v1 = 0`", "code",
  "js/app-06-reels-partage.js:224 : les routeurs attendent jusqu'à 600 × 700 ms que la landing et l'onboarding se ferment, sans rien afficher", ["PAR-C05"], "", "aucun", "a-verifier", "Chemin de secours seulement ; le lien s'ouvre après l'inscription si elle dure moins de 7 min.");
R("PAR-076", "Mesure", "`signalerInscriptionViaLien` (lien → compte créé)", "invisible", "nouveau compte", "—", "code",
  "js/app-08-ui-modals-tour.js:2744 : télémétrie seule, aucun écran", [], "", "aucun", "a-conserver", "Sans effet d'interface.");
R("PAR-077", "Code mort", "`inviteAllFollowingToEvent` (inviter tous ses abonnements)", "sans porte", "—", "—", "code",
  "js/app-07-ia-explore-irl.js:7477 : aucun appelant dans js/ ni index.html", [], "Supprimer, ou ne jamais brancher sans confirmation (30 notifications d'un coup).", "aucun", "a-verifier", "Si elle est rebranchée un jour, elle envoie jusqu'à 30 invitations sans confirmation.");
R("PAR-078", "Liens courts", "`/p/<id>`, `/u/<id>`, `/e/<id>` (production seulement)", "production", "tous", "Partager depuis passio-app.netlify.app", "code",
  "js/app-06-reels-partage.js:411 ; au banc (127.0.0.1) tous les liens restent en `#…`", ["PAR-C08"], "", "aucun", "a-conserver", "Une seule source d'URL pour trois types ; la bobine et le live n'y sont pas.");

// ── CONSTATS ────────────────────────────────────────────────────────────────
const constats = [];
const C = (o) => constats.push(Object.assign({ type: "observation", dependances: "Aucune.", sensible: false }, o));

C({ id: "PAR-C01", titre: "Visiteur arrivé par un lien : « Créer mon compte » ouvre le formulaire derrière le contenu",
  emplacement: "Fenêtre « Crée ton compte pour… » et toast d'invitation → `ouvrirAuth` (js/first-run.js:1544) ; `#onboarding` z-index 50, `#postDetailPage` et `.event-detail-page` 200 (index.html:1256, styles.css:2342), `.reels-viewer` 9999 (styles.css:4736)",
  surfaces: ["PAR-042", "PAR-046", "PAR-048"], nature: "fonctionnel",
  preuve: "Sonde partage-10 (lien `#post-pa_lea_1`, visiteur) : après le geste, `#onboarding` est actif et affiché, mais 5 points sur 5 de l'écran rendent `postDetailPage` ; le premier champ du formulaire n'est pas atteignable ; il le devient seulement après un retour arrière. Captures PAR-042, PAR-046, PAR-048 : écran identique avant et après, `ecran.onboarding = true` dans les trois fiches.",
  probleme: "La personne qui vient d'ouvrir un lien partagé touche « Créer mon compte » : la fenêtre se ferme et l'écran reste celui du contenu. Le formulaire existe, dessous.",
  declencheur: "Visiteur sans compte sur la page d'une publication, une fiche d'activité ou le lecteur de bobines (les trois écrans d'arrivée d'un lien), qui tente d'aimer, de participer, de suivre — ou touche le toast « X t'invite ».",
  consequence: "Le seul chemin d'inscription proposé à un invité ne mène visiblement nulle part ; il faut deviner de fermer le contenu pour trouver le formulaire.",
  proposition: "`ouvrirAuth` ferme l'écran de contenu ouvert (`closePost`, `closeEventDetail`, `closeReels`) après avoir mémorisé sa cible (voir PAR-C02), ou `#onboarding` passe au-dessus de ces trois plans.",
  visuels: ["PAR-042", "PAR-046", "PAR-048"], priorite: "P0", gravite: 4, effort: "S", risqueTechnique: "moyen",
  dependances: "PAR-C02 (mémoriser la cible avant de fermer).",
  risqueRegression: "Pile d'historique (chaque fermeture rend une entrée) ; suites first-run-*.spec.js, liens-partage-post-profil.spec.js, reel-deeplink.spec.js.",
  critereAcceptation: "Visiteur sur `#post-<id>`, `#irl-event-<id>` et `#reel=<id>` : après « Créer mon compte », `document.elementFromPoint` au centre de l'écran appartient à `#onboarding`, et le champ e-mail reçoit le focus au toucher.",
  fichiers: ["js/first-run.js", "styles.css"], sensible: true });

C({ id: "PAR-C02", titre: "Après l'inscription, le contenu du lien n'est pas rouvert",
  emplacement: "`memoriserRetour` / `apresAuthentification` (js/first-run.js:1513, :2313) ; nettoyage du hash par les routeurs (js/app-06-reels-partage.js:118, :325)",
  surfaces: ["PAR-044", "PAR-046", "PAR-048"], nature: "fonctionnel",
  preuve: "Sonde partage-09 : au moment de la fenêtre d'inscription, `retour = { screen: \"feed\", hash: \"\", action: \"aimer\" }` — l'adresse vaut `#post` (sans identifiant) parce que le routeur a nettoyé `#post-<id>` avant d'ouvrir, et `RE_LIEN_PROFOND` ne reconnaît pas `#post` ni `#reels`. Fin d'inscription simulée (crochet appelé, aucun compte créé) : retour sur le fil, toast « Tu peux aimer cette publication. », publication non affichée (capture PAR-044). Pour une activité, l'adresse mémorisée est `#event-<id>`, que le routeur `#irl-event-` ne lit pas (d'après le code, js/app-07-ia-explore-irl.js:4897).",
  probleme: "On crée un compte pour aimer une publication ou rejoindre une activité, et l'on se retrouve sur le fil général avec un message qui parle d'un contenu absent.",
  declencheur: "Inscription ou connexion commencée depuis un contenu ouvert par lien.",
  consequence: "Le geste qui a motivé l'inscription est perdu ; pour une activité, la personne doit retrouver le lien pour s'inscrire.",
  proposition: "Mémoriser la CIBLE (genre + identifiant) lue à l'écran au moment de la fenêtre, pas l'adresse ; au retour, rouvrir par `openPost` / `openEventDetails` / `openReelById` / `openUserProfile`, puis afficher le rappel sur ce contenu. Aucune action n'est rejouée.",
  visuels: ["PAR-044"], priorite: "P1", gravite: 3, effort: "M", risqueTechnique: "moyen",
  dependances: "PAR-C01.",
  risqueRegression: "`reprise()` après rechargement (connexion), confirmation d'e-mail ouverte dans un autre navigateur (la cible n'y existe pas) ; lien-inscription.spec.js, first-run-retour*.spec.js.",
  critereAcceptation: "Visiteur sur `#post-<id>` → cœur → inscription terminée : `#postDetailPage` affiche la publication `<id>` et le rappel y est visible ; idem pour une activité et une bobine.",
  fichiers: ["js/first-run.js"], sensible: true });

C({ id: "PAR-C03", titre: "Les confirmations de partage sont peintes sous les feuilles et sous le lecteur de bobines",
  emplacement: "`.toast-stack` z-index 200 (styles.css:1484) ; `.modal-backdrop` 10001 (styles.css:1382) ; `.reels-viewer` 9999 (styles.css:4736)",
  surfaces: ["PAR-003", "PAR-012", "PAR-023", "PAR-025", "PAR-031", "PAR-014", "PAR-074"], nature: "friction",
  preuve: "Sonde partage-07 (images prises animations actives, `pointer-events` du toast levé pour la mesure) : toast vu sur le fil, la page d'une publication et la fiche d'activité ; NON vu sur la feuille de partage (dessus : `#_shareInFeedBtn`), la feuille d'invitation, le lecteur de bobines, la feuille de partage d'une bobine, le profil visité. Captures PAR-003, PAR-012, PAR-025, PAR-031.",
  probleme: "« Lien copié », « Lien du profil copié », « Invitation envoyée », « Ouverture whatsapp... » sont émis mais invisibles : on appuie, rien ne répond.",
  declencheur: "Tout partage par copie lancé depuis une feuille basse, le profil visité (modale plein écran) ou le lecteur de bobines — c'est-à-dire chaque fois que la feuille du téléphone manque (ordinateur, navigateur intégré d'une messagerie) ou échoue.",
  consequence: "Appuis répétés (un lien suivi créé à chaque appui), doute sur la réussite, abandon du partage.",
  proposition: "Faire passer `#toastStack` au-dessus des feuilles et du lecteur (position fixe, z-index supérieur à 10001), et confirmer dans la feuille elle-même quand elle reste ouverte.",
  visuels: ["PAR-003", "PAR-012", "PAR-025", "PAR-031"], priorite: "P1", gravite: 3, effort: "S", risqueTechnique: "faible",
  risqueRegression: "Un toast cliquable au-dessus d'une fenêtre peut recouvrir un bouton bas ; vérifier la barre d'onglets et la zone sûre iOS.",
  critereAcceptation: "Feuille de partage ouverte, `toast(\"Lien copié\")` : `elementFromPoint` au centre du toast rend le toast (mesure faite `pointer-events` levé), à 360 et 390 px ; idem lecteur de bobines ouvert.",
  fichiers: ["styles.css"] });

C({ id: "PAR-C04", titre: "Copie refusée : une adresse brute pendant 3 s, ou rien du tout pour une bobine",
  emplacement: "`partagerOuCopier` (js/app-02-state-utils.js:3602) ; `copyReelLink` (js/app-06-reels-partage.js:898) ; `_copyCheckinLink` (js/app-07-ia-explore-irl.js:8083)",
  surfaces: ["PAR-004", "PAR-013", "PAR-031"], nature: "fonctionnel",
  preuve: "Sonde partage-01, presse-papiers non autorisé : toast « Lien : http://…?inv=…&plk=…#post-pa_lea_1 », 390 × 73 px, non sélectionnable, retiré après 3 s (et sous la feuille, PAR-C03). Sonde partage-05 : `copyReelLink` lève « Write permission denied » sans `catch` — aucune réaction. Capture PAR-004.",
  probleme: "Quand le navigateur refuse la copie, il n'y a aucun moyen de récupérer le lien.",
  declencheur: "Navigateur intégré d'une application, permission de presse-papiers refusée, page hors premier plan.",
  consequence: "Le partage échoue sans alternative ; pour une bobine, une erreur non gérée part en télémétrie.",
  proposition: "Dans la feuille : champ en lecture seule contenant le lien, sélectionné, avec « Copier » ; même repli pour la bobine (`.catch`).",
  visuels: ["PAR-004"], priorite: "P1", gravite: 3, effort: "S", risqueTechnique: "faible",
  dependances: "PAR-C07 (feuille commune).",
  risqueRegression: "partage-bobine.spec.js, liens-partage-post-profil.spec.js ⑤.",
  critereAcceptation: "Presse-papiers refusé sur les quatre portes : le lien complet est lisible dans un champ ≥ 16 px tant que la feuille est ouverte, et aucune erreur JS n'est émise.",
  fichiers: ["js/app-02-state-utils.js", "js/app-06-reels-partage.js"] });

C({ id: "PAR-C05", titre: "Lien mort, privé ou inconnu : huit secondes de silence puis un toast de trois secondes",
  emplacement: "`_ouvrirLienPartage`, `_openReelDeepLink` (js/app-06-reels-partage.js:265, :77) ; `_openIrlEventFromHash` (js/app-07-ia-explore-irl.js:4896) — 12 essais × 700 ms",
  surfaces: ["PAR-049", "PAR-050", "PAR-055", "PAR-056", "PAR-075"], nature: "friction",
  preuve: "Sonde partage-08, liens collés en session : publication d'un compte privé 7 950 ms, supprimée 7 864 ms, bobine inconnue 8 616 ms, activité inconnue 8 670 ms avant le toast ; pendant ce temps, aucun changement d'écran (capture PAR-049). Verdict : toast standard de 3 s (capture PAR-050).",
  probleme: "Qui ouvre un lien vers un contenu retiré voit le fil d'exemples, rien d'autre, puis un message bref qu'un regard ailleurs suffit à manquer.",
  declencheur: "Contenu supprimé, auteur passé en privé, identifiant erroné, réseau lent.",
  consequence: "Le lien paraît cassé ou ignoré ; le visiteur ne sait pas ce qu'il devait voir ni quoi faire.",
  proposition: "Dès la lecture du lien : un état d'attente discret (« Ouverture du lien… »). À l'échec : une carte d'arrivée qui reste en tête du fil, neutre sur la cause (« supprimée, ou réservée aux abonnés de son auteur »), avec une suite. Le budget d'essais ne change pas.",
  visuels: ["PAR-050"], priorite: "P1", gravite: 3, effort: "M", risqueTechnique: "faible",
  risqueRegression: "Les quatre routeurs partagent leurs règles (hash conservé sur échec) : liens-partage-post-profil.spec.js ③, reel-deeplink.spec.js, irl-deeplink-etat-null.spec.js.",
  critereAcceptation: "Lien vers un identifiant inconnu : un indicateur est visible avant 1 s ; au verdict, un bloc non éphémère est présent en tête du fil et le même texte sert aux cas privé et supprimé.",
  fichiers: ["js/app-06-reels-partage.js", "js/app-07-ia-explore-irl.js", "styles.css"], sensible: true });

C({ id: "PAR-C06", titre: "Le repartage d'une publication ou d'une bobine perd le média et le lien vers l'originale",
  emplacement: "`sharePostInFeed` (js/app-03-posts-vlogs.js:49), `shareReelInFeed` (js/app-05-config-profil.js:3862) ; rendu `renderPostHTML` (js/app-02-state-utils.js:10325 ne traite que `kind === \"event\"`)",
  surfaces: ["PAR-005", "PAR-016"], nature: "clarte",
  preuve: "Sonde partage-02 : la carte créée contient « 📤 A partagé un post / 🎸 Léa Fontaine – Musique / \"…\" », `aImage: false`, aucun gestionnaire vers `pa_lea_1` ; la toucher ouvre le repartage lui-même. `shared_from_post_id` est bien écrit au serveur mais n'est lu par aucun rendu. Capture PAR-005.",
  probleme: "Les abonnés voient une citation en texte brut : pas la photo ni la vidéo, pas de chemin vers l'auteur d'origine.",
  declencheur: "« Partager dans mon feed » / « Partager dans le Feed ».",
  consequence: "Le partage interne ne fait découvrir ni le contenu ni son auteur — l'inverse de sa promesse.",
  proposition: "Rendre l'originale comme une carte citée (vignette, auteur, passion, extrait) cliquable vers elle, sur le modèle de la carte d'activité partagée ; retirer « 📤 » du texte stocké.",
  visuels: ["PAR-005"], priorite: "P1", gravite: 3, effort: "M", risqueTechnique: "moyen",
  risqueRegression: "Originale supprimée ou devenue privée après coup (afficher « publication indisponible ») ; partage-bobine.spec.js.",
  critereAcceptation: "Après repartage, la carte contient une zone cliquable qui ouvre la publication d'origine, et son média s'il existe.",
  fichiers: ["js/app-02-state-utils.js", "js/app-03-posts-vlogs.js", "js/app-05-config-profil.js"], sensible: true });

C({ id: "PAR-C07", titre: "Quatre contenus, quatre façons de partager", type: "jugement",
  emplacement: "`sharePost` (app-03:11), `openReelShareModal` (app-05:3807), `shareEvent` (app-07:5056), `shareUserProfile` (app-04:5442)",
  surfaces: ["PAR-002", "PAR-011", "PAR-022", "PAR-030", "PAR-031"], nature: "clarte",
  preuve: "Tableau comparatif du rapport (§ 6) : publication et activité = 2 boutons ; bobine = 8 boutons sans feuille système ; profil = aucun écran. Seules publication et activité montrent un extrait ; aucune ne montre l'auteur ou une vignette. Captures PAR-002, PAR-011, PAR-022, PAR-030.",
  probleme: "Il faut réapprendre le partage à chaque type de contenu, et aucune feuille ne dit clairement ce qui part ni à qui.",
  declencheur: "Tout partage.", consequence: "Hésitation, options tierces figées (Telegram, 𝕏) là où le téléphone propose les applications réellement installées.",
  proposition: "Une feuille unique : aperçu (vignette, auteur ou titre, extrait), phrase « qui verra quoi », puis « Envoyer à quelqu'un » (feuille du téléphone, sinon copie), « Copier le lien », « Republier dans mon fil » ; pour une activité, « Inviter mes abonnements ». Maquettée sur publication, bobine, activité et profil.",
  visuels: ["PAR-002", "PAR-011", "PAR-022", "PAR-031"], priorite: "P2", gravite: 2, effort: "M", risqueTechnique: "moyen",
  risqueRegression: "`navigator.share` doit rester appelé dans le geste (pas d'`await` avant) ; liens-partage-post-profil.spec.js ⑩ (câblage des trois boutons), partage-bobine.spec.js.",
  critereAcceptation: "Les quatre portes ouvrent le même composant ; ses libellés et leur ordre sont identiques ; chaque bouton mesure ≥ 44 px à 360 px.",
  fichiers: ["js/app-03-posts-vlogs.js", "js/app-05-config-profil.js", "js/app-07-ia-explore-irl.js", "js/app-04-comments-shop.js", "styles.css"] });

C({ id: "PAR-C08", titre: "Le lien d'une bobine (et d'un live) n'a ni aperçu, ni forme courte, ni invitation",
  emplacement: "`openReelShareModal` fabrique `#reel=<id>` à la main (js/app-05-config-profil.js:3813) ; `_vliveShare` `/?live=<id>` (:5215) ; `LIENS_PARTAGE` ne connaît que post, user, event (js/app-06-reels-partage.js:391)",
  surfaces: ["PAR-011", "PAR-014", "PAR-015", "PAR-047", "PAR-070", "PAR-078"], nature: "fonctionnel",
  preuve: "Sonde partage-05 : lien diffusé `…/index.html?plk=…#reel=pa_lea_2`, sans `inv=` (les trois autres portes le portent). Un fragment n'est pas lu par un robot d'aperçu : la carte sera celle, générique, d'index.html (d'après netlify/edge-functions/apercu.js, chemins `/p/ /u/ /e/` seulement). Texte : « Regarde cette bobine PASSIO: Trente secondes d'arpèges.... ».",
  probleme: "Le format le plus partageable s'affiche dans une conversation comme un lien PASSIO générique, et l'invité n'est pas accueilli par le nom de qui l'envoie.",
  declencheur: "Partage d'une bobine ou d'un live.", consequence: "Moins d'ouvertures, pas d'abonnement automatique à l'inscription.",
  proposition: "Faire passer la bobine par `lienPartageDe` (une bobine est une publication : `/p/<id>` ouvre déjà la bonne ligne ; le routeur choisit le lecteur si `is_reel`). Corriger le texte (« … » seulement si coupé).",
  visuels: ["PAR-011"], priorite: "P2", gravite: 2, effort: "M", risqueTechnique: "moyen",
  risqueRegression: "reel-deeplink.spec.js (les anciens liens `#reel=` déjà envoyés doivent rester lus) ; tests/unit/apercu-liens.test.mjs.",
  critereAcceptation: "Le lien copié depuis une bobine en production est de la forme `/p/<id>?inv=<uuid>` et son aperçu porte le pseudo de l'auteur.",
  fichiers: ["js/app-05-config-profil.js", "js/app-06-reels-partage.js", "netlify/lib/apercu-coeur.js"] });

C({ id: "PAR-C09", titre: "Vocabulaire du partage : feed/fil, post/publication, événement/activité/rencontre, trois sens pour « Inviter »",
  emplacement: "Libellés et toasts des fichiers app-03, app-05, app-06, app-07, affiche-rencontre.js",
  surfaces: ["PAR-002", "PAR-005", "PAR-011", "PAR-022", "PAR-023", "PAR-026", "PAR-027", "PAR-029", "PAR-032", "PAR-034", "PAR-040", "PAR-050", "PAR-052", "PAR-055", "PAR-014"], nature: "clarte",
  preuve: "Relevé : « Partager dans mon feed » (publication, activité) / « Partager dans le Feed » (bobine) / « Partager dans mon fil » (libellé rétabli après refus, app-03:113) ; « Partager ce post », titre « Post » / « publication » (fenêtres d'inscription, toasts) ; « Partager cet événement », « Événement introuvable » / « Voir l'activité », « Ton activité est en ligne » / « Affiche de la rencontre » ; « Inviter des amis » = notifier ses abonnements (activité) ET envoyer le lien de l'app (profil, Support), « Inviter mes amis » = envoyer le lien de l'activité, « Inviter quelqu'un » (fil) ; « Profil non trouvé » / « Profil introuvable » ; confirmations « Publication partagée avec succès. » (vert), « Événement partagé dans ton feed. » (violet), « Bobine partagée dans ton feed » (vert) ; « Ouverture whatsapp... ».",
  probleme: "Le même objet et la même action changent de nom d'un écran à l'autre.",
  declencheur: "Parcours de partage complet.", consequence: "« Inviter » ne permet pas de prévoir si l'on va notifier des abonnés ou ouvrir WhatsApp.",
  proposition: "Glossaire unique : « fil », « publication », « activité » ; « Envoyer à quelqu'un » (lien, hors PASSIO), « Inviter mes abonnements » (notification), « Republier dans mon fil » ; une seule phrase d'échec par type ; une seule forme de confirmation.",
  visuels: ["PAR-002", "PAR-011", "PAR-022", "PAR-023"], priorite: "P2", gravite: 2, effort: "S", risqueTechnique: "faible",
  risqueRegression: "Suites e2e qui cherchent ces textes (invitation-amis.spec.js, invitation-activite.spec.js, liens-partage-post-profil.spec.js ③).",
  critereAcceptation: "`grep -i \"feed\\|ce post\\|cet événement\"` ne rend plus aucune chaîne affichée dans js/ ; « Inviter des amis » n'intitule plus qu'un seul mécanisme.",
  fichiers: ["js/app-03-posts-vlogs.js", "js/app-05-config-profil.js", "js/app-06-reels-partage.js", "js/app-07-ia-explore-irl.js", "js/affiche-rencontre.js", "index.html"] });

C({ id: "PAR-C10", titre: "Le message partagé ne dit ni de qui est le contenu ni ce qu'est PASSIO",
  emplacement: "`sharePost` : `{ title: \"PASSIO\", text: <100 premiers caractères> }` (js/app-03-posts-vlogs.js:44) ; `shareEvent` : texte « titre · ville · jour mois » (app-07:5064)",
  surfaces: ["PAR-002", "PAR-003", "PAR-007", "PAR-022"], nature: "clarte",
  preuve: "Presse-papiers relu (sonde partage-01) : « Chevalet recollé, cordes neuves. Elle sonne mieux qu'à l'achat.\\n<lien> » — le texte de Léa, sans son nom, collé comme si l'expéditeur l'avait écrit ; le toast dit « Lien copié » alors que texte + lien sont copiés. Activité (sonde partage-03) : « Atelier lutherie : régler son chevalet · Lyon · 13 nov », sans heure. À comparer au profil (« Découvre Léa Fontaine sur PASSIO ») et à l'invitation d'après création (« Je t'invite : … — date, heure · ville. Rejoins-moi sur PASSIO 👇 »).",
  probleme: "Dans la conversation de destination, le message est ambigu pour qui ne connaît pas PASSIO, surtout si l'aperçu du lien ne se charge pas.",
  declencheur: "« Partager en dehors » d'une publication ou d'une activité.", consequence: "Attribution floue, invitation à sortir sans horaire.",
  proposition: "Publication : « Une publication de <auteur> sur PASSIO : “<extrait>…” ». Activité : reprendre le texte de `inviterActivite` (date, heure, ville). Toast : « Message et lien copiés ».",
  visuels: ["PAR-002", "PAR-022"], priorite: "P2", gravite: 2, effort: "S", risqueTechnique: "faible",
  risqueRegression: "Aucune suite ne fixe ces textes hors invitation-activite.spec.js.",
  critereAcceptation: "Le texte transmis à `navigator.share` pour une publication contient le pseudo de l'auteur et « PASSIO » ; pour une activité, l'heure.",
  fichiers: ["js/app-03-posts-vlogs.js", "js/app-07-ia-explore-irl.js"] });

C({ id: "PAR-C11", titre: "Le lien porte l'identité de qui partage, sans que rien ne le dise", type: "jugement",
  emplacement: "`lienPartageDe` ajoute `?inv=<mon uuid>` (js/app-06-reels-partage.js:411, :504)",
  surfaces: ["PAR-002", "PAR-022"], nature: "clarte",
  preuve: "Tous les liens relevés (sondes 01, 03, 06) portent `inv=a0d17000-…a001` ; à l'arrivée : « Camille Audit t'invite sur PASSIO », et l'inscription annonce « tu suivras automatiquement Camille Audit » (capture PAR-043). D'après le code, la signature survit aux transferts du lien.",
  probleme: "La personne qui partage ignore que son nom sera montré à quiconque ouvre le lien, même relayé, et que ces personnes la suivront en s'inscrivant.",
  declencheur: "Tout partage externe par un compte.", consequence: "Effet utile mais non annoncé ; surprise possible pour un compte discret.",
  proposition: "Une phrase dans la feuille (« Le lien porte ton nom : si la personne s'inscrit, elle te suivra »). Aucune règle n'est modifiée ; le consentement de l'invité, déjà en place, est conservé.",
  visuels: ["PAR-002"], priorite: "P2", gravite: 2, effort: "S", risqueTechnique: "faible",
  dependances: "PAR-C07.", risqueRegression: "Aucun (texte).",
  critereAcceptation: "La feuille de partage d'un compte connecté affiche la phrase ; elle est absente pour un visiteur (lien non signé).",
  fichiers: ["js/app-03-posts-vlogs.js", "js/app-07-ia-explore-irl.js"], sensible: true });

C({ id: "PAR-C12", titre: "Fiche d'activité : trois portes « Partager », trois icônes dans l'application",
  emplacement: "`#eventDetailShareBtn` (index.html:1270, redessiné par js/ui-v4b-fiche.js:562) ; app-07:4412 et :4498 ; live : « ↗ » (app-05:5097)",
  surfaces: ["PAR-020", "PAR-021", "PAR-070"], nature: "clarte",
  preuve: "Sonde partage-03 : portes à 14 px (flèche courbe, 45 × 45), 1 554 px (icône à nœuds, 44 × 31) et 1 799 px (bouton texte) ; « Inviter » à 1 848 px sur 2 058. Captures PAR-020, PAR-021.",
  probleme: "La même feuille s'ouvre de trois endroits, avec deux icônes, tandis que l'invitation — l'action qui remplit une activité — est sous les commentaires.",
  declencheur: "Vouloir faire venir quelqu'un à une activité.", consequence: "On partage un lien sans découvrir qu'on pouvait inviter ses abonnements.",
  proposition: "Icône à nœuds en haut ; une seule porte en bas ; l'invitation des abonnements dans la feuille unifiée.",
  visuels: ["PAR-020", "PAR-021"], priorite: "P2", gravite: 2, effort: "S", risqueTechnique: "faible",
  dependances: "PAR-C07 ; coordination avec le domaine « fiche d'activité ».",
  risqueRegression: "ui-v4b-fiche.spec.js (rangement des boutons par expression régulière, ui-v4b-fiche.js:430).",
  critereAcceptation: "La fiche ne contient plus que deux commandes de partage ; toutes deux portent `.share-ico`.",
  fichiers: ["js/ui-v4b-fiche.js", "js/app-07-ia-explore-irl.js", "js/app-05-config-profil.js"] });

C({ id: "PAR-C13", titre: "Feuille « Inviter des amis » d'une activité : étroite, sans trace, et en impasse",
  emplacement: "`openEventInvite`, `_renderEventInviteList`, `inviteToEvent` (js/app-07-ia-explore-irl.js:7411–7474)",
  surfaces: ["PAR-023", "PAR-024"], nature: "friction",
  preuve: "Sonde partage-04 : 2 boutons « × » superposés (celui d'`openModal` + celui du gabarit) ; bouton « Inviter » 56 × 29 px ; champ de recherche sans libellé ; nom long coupé par une ellipse ; après envoi la personne disparaît de la liste, « Tu as invité tout le monde » à la réouverture ; l'invitation part au premier appui, sans annulation. Captures PAR-023, PAR-024.",
  probleme: "On ne sait plus qui l'on a invité, on ne peut pas corriger un appui sur une cible de 29 px, et quand la liste est vide rien ne propose d'envoyer le lien.",
  declencheur: "Inviter ses abonnements à une activité.", consequence: "Invitations envoyées par erreur ; abandon quand on n'a pas (ou plus) d'abonnements à inviter.",
  proposition: "Titre « Inviter mes abonnements », bouton ≥ 44 px, noms sur deux lignes, libellé accessible, un seul « × », section « Déjà invités », et sortie « Envoyer le lien à quelqu'un d'autre ».",
  visuels: ["PAR-023", "PAR-024"], priorite: "P2", gravite: 2, effort: "S", risqueTechnique: "faible",
  risqueRegression: "La mémoire des invitations est locale à l'appareil (`eventInvitesSent`) : « Déjà invités » sera vide sur un autre appareil — le dire.",
  critereAcceptation: "À 360 px, `[data-invite]` mesure ≥ 44 px de haut ; `#modalContent .modal-close` est unique ; l'état vide contient un bouton de partage du lien.",
  fichiers: ["js/app-07-ia-explore-irl.js", "styles.css"] });

C({ id: "PAR-C14", titre: "Inviter à rejoindre PASSIO : deux portes sur trois sont cachées",
  emplacement: "`openMainProfileMenu` (js/app-06-reels-partage.js:1886) derrière `.v6b-modifier` (js/ui-v6b-profil.js:104) ; index.html:554",
  surfaces: ["PAR-032", "PAR-033"], nature: "friction",
  preuve: "Sonde partage-06 : sur le profil, le bouton s'annonce « Modifier le profil » et « Inviter des amis » est la 6e entrée de son menu ; dans Paramètres, 3 appuis, 7e bouton de « Support » (218 × 33 px) après « Mentions légales ». Captures PAR-032, PAR-033.",
  probleme: "L'action dont dépend la croissance n'est visible qu'à qui la cherche.",
  declencheur: "Vouloir faire venir un ami.", consequence: "Peu de partages (constat du journal : aucun lien partagé en 7 jours début octobre).",
  proposition: "Un bouton « Partager mon profil » visible sous l'identité (il envoie déjà le lien de mon profil) ; retirer l'entrée du menu du crayon ; dans Paramètres, la sortir de « Support ».",
  visuels: ["PAR-032"], priorite: "P2", gravite: 2, effort: "S", risqueTechnique: "faible",
  risqueRegression: "ui-v6b-profil.spec.js (compte 6 entrées), invitation-amis.spec.js ③.",
  critereAcceptation: "Sur « Profil », une commande de partage est visible sans ouvrir de menu, ≥ 44 px.",
  fichiers: ["js/app-06-reels-partage.js", "js/ui-v6b-profil.js", "index.html"] });

C({ id: "PAR-C15", titre: "Bobine : un double appui sur « Partager dans le Feed » traverse la feuille",
  emplacement: "`shareReelInFeed` (js/app-05-config-profil.js:3862) : aucun verrou, `closeModal()` synchrone",
  surfaces: ["PAR-016"], nature: "fonctionnel",
  preuve: "Sonde partage-05, double appui réel : une publication créée, mais le second appui tombe sur la puce « Découvrir Musique » du lecteur — lecteur fermé, fiche de passion ouverte, confirmation dessous. Vu une fois, reproduit à l'identique dans la même sonde ; non essayé sur écran tactile réel.",
  probleme: "Un appui nerveux mène à un écran sans rapport.", declencheur: "Double appui rapide.", consequence: "Désorientation ; la confirmation du repartage n'est jamais vue.",
  proposition: "Même garde que la publication (bouton désactivé, « Partage en cours… ») et fermeture de la feuille après un court délai.",
  visuels: [], priorite: "P2", gravite: 2, effort: "S", risqueTechnique: "faible",
  risqueRegression: "partage-bobine.spec.js.", critereAcceptation: "`dblclick` sur le bouton : une seule publication, et l'écran actif reste le lecteur ou le fil.",
  fichiers: ["js/app-05-config-profil.js"] });

C({ id: "PAR-C16", titre: "« Partager mon expérience » : le rattachement à l'activité est invisible et persiste",
  emplacement: "`shareEventExperience` pose `window._pendingEventPost` (js/app-07-ia-explore-irl.js:4562), lu à la prochaine publication (js/app-06-reels-partage.js:5379)",
  surfaces: ["PAR-028"], nature: "clarte",
  preuve: "Sonde partage-04 : le Studio s'ouvre avec « 📍 Initiation grimpe en salle · Villeurbanne (6 nov) », `_pendingEventPost = \"ev_par_passee\"`, aucune mention à l'écran ; « Publier dans : Musique » alors que l'activité est en Sport. D'après le code, le marqueur n'est effacé que par une publication : quitter le Studio puis publier autre chose rattache cette autre publication à l'album (non exercé).",
  probleme: "On ne sait pas que ce qu'on publie ira dans l'album public de l'activité, et l'on ne peut pas y renoncer.",
  declencheur: "Activité passée → « Partager mon expérience ».", consequence: "Publication rangée dans un album par surprise, possiblement une publication sans rapport.",
  proposition: "Bandeau « Souvenir de <activité> — ira dans l'album » avec une croix ; effacer le marqueur en quittant le Studio.",
  visuels: ["PAR-028"], priorite: "P2", gravite: 2, effort: "S", risqueTechnique: "faible",
  dependances: "Domaine « Studio ».", risqueRegression: "partage-experience-passion.spec.js.",
  critereAcceptation: "Le Studio affiche le nom de l'activité tant que le marqueur est posé ; après `goTo(\"feed\")`, `window._pendingEventPost` est nul.",
  fichiers: ["js/app-07-ia-explore-irl.js", "js/app-06-reels-partage.js"], sensible: true });

C({ id: "PAR-C17", titre: "Partage de position : un appui envoie des coordonnées précises, sans aperçu ni confirmation",
  emplacement: "`shareLocation` (js/app-09-boot-pwa.js:1482), entrée « Position » du menu de pièces jointes (index.html:1453)",
  surfaces: ["PAR-071"], nature: "clarte",
  preuve: "D'après le code (non exercé) : `getCurrentPosition` puis insertion immédiate de « 📍 Ma position : https://maps.google.com/?q=<lat>,<lng> » (5 décimales, ~1 m) dans la conversation — groupe compris ; seul retour : toast « 📍 Localisation en cours… » ; échec : « ❌ Impossible d'obtenir la position ».",
  probleme: "La position exacte part vers tous les membres de la conversation sans qu'on l'ait vue ni confirmée.",
  declencheur: "Toucher « Position » (y compris par erreur) alors que la permission du navigateur est déjà accordée.",
  consequence: "Divulgation involontaire d'un lieu précis (domicile).",
  proposition: "Étape d'aperçu : adresse approchée ou mini-carte, nom de la conversation, « Envoyer ma position » / « Annuler ».",
  visuels: [], priorite: "P2", gravite: 3, effort: "M", risqueTechnique: "faible",
  dependances: "Domaine « messagerie ».", risqueRegression: "File d'envoi des messages (outbox).",
  critereAcceptation: "Aucun message de type `location` n'est inséré avant un second geste explicite.",
  fichiers: ["js/app-09-boot-pwa.js"], sensible: true });

C({ id: "PAR-C18", titre: "Cibles de partage sous 44 px",
  emplacement: "`.post-action` (carte, page, fiche) ; `.btn.block` des feuilles ; `.modal-close` (styles.css:1418) ; `.profile-dots-menu button` ; `[data-invite]` ; bouton de « Support »",
  surfaces: ["PAR-001", "PAR-002", "PAR-011", "PAR-021", "PAR-023", "PAR-030", "PAR-033"], nature: "accessibilite",
  preuve: "Mesures des sondes 01, 03, 04, 05, 06 : icône de partage 44 × 31 ; boutons des feuilles 354 × 42 (173 × 42 pour les réseaux) ; « × » 34 × 34 ; entrées du menu ⋯ 196 × 38 ; « Inviter » 56 × 29 ; « Inviter des amis » (Support) 218 × 33.",
  probleme: "Appuis manqués ou à côté sur les commandes de partage.", declencheur: "Usage au pouce.", consequence: "Erreurs, surtout sur « Inviter » (29 px, envoi immédiat).",
  proposition: "44 px minimum sur toutes ces cibles (la feuille unifiée les porte à 56 px).",
  visuels: ["PAR-001", "PAR-023"], priorite: "P3", gravite: 2, effort: "S", risqueTechnique: "faible",
  risqueRegression: "Hauteur des feuilles à 360 × 640.", critereAcceptation: "`mesures.cibles.sous44` vide pour PAR-001, PAR-002, PAR-011, PAR-022, PAR-023 à 360 et 390 px.",
  fichiers: ["styles.css", "js/app-07-ia-explore-irl.js"] });

C({ id: "PAR-C19", titre: "Après le partage, la feuille reste ouverte ici et se ferme là",
  emplacement: "`sharePost`, `shareEvent` (feuille conservée) ; `copyReelLink`, `shareReelVia`, `inviterActivite` (feuille fermée)",
  surfaces: ["PAR-003", "PAR-007"], nature: "polish",
  preuve: "Sondes 01, 03, 05 : `modaleEncoreOuverte: true` après « Partager en dehors » (copie comme feuille système simulée) pour publication et activité ; fermée pour la bobine et l'invitation d'après création.",
  probleme: "Comportement imprévisible d'une porte à l'autre.", declencheur: "Partage externe.", consequence: "Un appui de plus, ou un doute.",
  proposition: "Règle unique : la feuille reste le temps de montrer la confirmation, puis se ferme seule ; après la feuille du téléphone, elle se ferme.",
  visuels: ["PAR-003"], priorite: "P3", gravite: 1, effort: "S", risqueTechnique: "faible", dependances: "PAR-C07.",
  risqueRegression: "Entrée d'historique de la modale.", critereAcceptation: "Même état de `#modalBackdrop` 2 s après le partage sur les quatre portes.",
  fichiers: ["js/app-03-posts-vlogs.js", "js/app-07-ia-explore-irl.js"] });

C({ id: "PAR-C20", titre: "L'invitation nominative ne tient que six secondes à l'arrivée", type: "jugement",
  emplacement: "`accueillirInvitation` (js/app-06-reels-partage.js:597)",
  surfaces: ["PAR-040", "PAR-045"], nature: "clarte",
  preuve: "Capture PAR-040 : le seul signe de l'invitation est un toast cliquable de 6 s (« 👋 Camille Audit t'invite sur PASSIO — touche ici pour créer ton compte »), posé une fois par invitation ; la page n'explique pas ce qu'est PASSIO (titre « Post »). Et le toucher mène au formulaire caché (PAR-C01).",
  probleme: "Le visiteur qui lit d'abord le contenu ne revoit jamais qui l'a invité ni pourquoi s'inscrire.",
  declencheur: "Arrivée par un lien signé.", consequence: "L'élan de l'invitation est perdu.", proposition: "Un bandeau bas discret et persistant sur l'écran d'arrivée : « <Nom> t'invite sur PASSIO » + une ligne de promesse + « Créer mon compte ».",
  visuels: ["PAR-040"], priorite: "P2", gravite: 2, effort: "M", risqueTechnique: "faible",
  dependances: "PAR-C01.", risqueRegression: "invitation-arrivee.spec.js ② (toast attendu) ; ne rien poser pour un appareil qui porte un compte.",
  critereAcceptation: "Visiteur invité sur un contenu : le nom de l'invitant est encore visible 30 s après l'arrivée.",
  fichiers: ["js/app-06-reels-partage.js", "styles.css"], sensible: true });

C({ id: "PAR-C21", titre: "Page d'aperçu : nue pour un humain pris pour un robot", type: "hypothese",
  emplacement: "`pageApercu` (netlify/lib/apercu-coeur.js:264)",
  surfaces: ["PAR-060"], nature: "polish",
  preuve: "Capture PAR-060 : trois paragraphes et un lien « Ouvrir sur PASSIO » sans style (CSP `default-src 'none'`). Hypothèse : des navigateurs intégrés dont l'agent contient un jeton de la liste (« WhatsApp », « Mastodon »…) recevraient cette page ; non vérifié sur appareil.",
  probleme: "Une page sans mise en forme inspire peu confiance.", declencheur: "Agent d'un humain reconnu à tort comme robot.", consequence: "Abandon possible avant d'ouvrir l'application.",
  proposition: "Quelques styles en ligne (CSP `style-src 'unsafe-inline'`, toujours sans script) : fond, titre, bouton pleine largeur.",
  visuels: ["PAR-060"], priorite: "P3", gravite: 1, effort: "S", risqueTechnique: "moyen",
  risqueRegression: "tests/unit/apercu-liens.test.mjs (CSP et gabarit fixés) ; lot de sécurité : revue obligatoire.",
  critereAcceptation: "La page reste sans script ; le lien mesure ≥ 44 px de haut à 360 px.",
  fichiers: ["netlify/lib/apercu-coeur.js"], sensible: true });

const sortie = {
  domaine: "partage", groupe: "Partage", titre: "Partage, liens et invitation",
  resume: "Les liens fabriqués par PASSIO sont justes : un lien de publication, de profil, de bobine ou d'activité ouvre exactement ce contenu, en moins d'une seconde, pour un compte connecté comme pour un visiteur, sans passer par l'accueil. L'invitation nominative (« Camille t'invite », abonnement annoncé et refusable) et l'affiche à QR sont bien conçues. Ce qui casse se trouve juste après l'arrivée : un visiteur qui touche « Créer mon compte » depuis le contenu reçu ne voit rien se passer (le formulaire s'ouvre derrière la page), et après l'inscription le contenu visé n'est pas rouvert. Côté émission, quatre contenus se partagent de quatre façons, avec trois vocabulaires ; les confirmations (« Lien copié ») sont peintes sous les feuilles et sous le lecteur de bobines ; un lien mort répond par huit secondes de silence. Le repartage interne perd la photo et le lien vers l'originale. L'enjeu est direct pour Partager et Rencontrer : le lien est la seule porte d'entrée d'un nouveau venu, et elle se referme au moment où il veut entrer.",
  aConserver: [
    "L'arrivée directe sur le contenu pour un visiteur (pas d'accueil ni d'inscription en travers) et l'ouverture exacte des quatre types de lien.",
    "Le consentement de l'invitation : annonce « tu suivras automatiquement X », « Ne pas suivre » au même endroit, demande plutôt qu'abonnement d'office pour une invitation d'appareil.",
    "`partagerOuCopier` : annulation silencieuse, repli sur la copie, partage lancé dans le geste.",
    "La fenêtre « Ton activité est en ligne » et son message à la première personne avec date, heure et ville.",
    "L'affiche de la rencontre (QR d'inscription) et l'aperçu de lien des publications, profils et activités (titre « auteur · passion », rien pour un contenu privé).",
    "Le verrou anti-double-envoi de « Partager dans mon feed » (publication) et la carte d'activité repartagée, qui garde « Voir l'activité ».",
    "Le séparateur « Exemples PASSIO » comme moment d'invitation, et les fiches d'arrivée « profil privé » et « activité annulée ».",
  ],
  registre, constats,
};

// ── Vérifications ───────────────────────────────────────────────────────────
const erreurs = [];
const idsR = new Set(registre.map((r) => r.id)), idsC = new Set(constats.map((c) => c.id));
if (idsR.size !== registre.length) erreurs.push("identifiant de surface en double");
if (idsC.size !== constats.length) erreurs.push("identifiant de constat en double");
registre.forEach((r) => (r.problemes || []).forEach((p) => { if (!idsC.has(p)) erreurs.push(r.id + " cite " + p + " (inconnu)"); }));
constats.forEach((c) => {
  (c.surfaces || []).forEach((s) => { if (!idsR.has(s)) erreurs.push(c.id + " cite la surface " + s + " (inconnue)"); });
  (c.visuels || []).forEach((s) => { if (!idsR.has(s)) erreurs.push(c.id + " cite le visuel " + s + " (inconnu)"); });
  ["titre", "emplacement", "preuve", "probleme", "declencheur", "consequence", "proposition", "priorite", "gravite", "effort", "risqueTechnique", "risqueRegression", "critereAcceptation", "fichiers", "nature", "type"].forEach((k) => { if (c[k] == null || c[k] === "") erreurs.push(c.id + " : champ " + k + " manquant"); });
  (c.surfaces || []).forEach((s) => { const r = registre.find((x) => x.id === s); if (r && !r.problemes.includes(c.id)) erreurs.push(c.id + " cite " + s + " qui ne le cite pas en retour"); });
});
registre.forEach((r) => (r.problemes || []).forEach((p) => { const c = constats.find((x) => x.id === p); if (c && !c.surfaces.includes(r.id)) erreurs.push(r.id + " cite " + p + " qui ne le cite pas en retour"); }));
const dirCap = path.join(AUDIT, "captures", "partage");
const fichiers = fs.existsSync(dirCap) ? fs.readdirSync(dirCap) : [];
registre.forEach((r) => {
  if (r.visuel === "aucun") return;
  const av = fichiers.some((f) => f.startsWith(r.id + "--") && /--avant\.webp$/.test(f));
  const ap = fichiers.some((f) => f.startsWith(r.id + "--") && /--apres\.webp$/.test(f));
  if (!av) erreurs.push(r.id + " : capture AVANT absente du disque");
  if (r.visuel === "avant-apres" && !ap) erreurs.push(r.id + " : capture APRÈS absente du disque");
  if (r.visuel === "avant" && ap) erreurs.push(r.id + " : une capture APRÈS existe mais le registre dit « avant »");
});
const compte = (f) => registre.filter(f).length;
const compteurs = {
  surfaces: registre.length, observees: compte((r) => r.observation === "observe"), simulees: compte((r) => r.observation === "simule"),
  codeSeul: compte((r) => r.observation === "code"), inaccessibles: compte((r) => r.observation === "inaccessible"),
  avantApres: compte((r) => r.visuel === "avant-apres"), avantSeul: compte((r) => r.visuel === "avant"), sansVisuel: compte((r) => r.visuel === "aucun"),
  aConserver: compte((r) => r.verdict === "a-conserver"), aAmeliorer: compte((r) => r.verdict === "a-ameliorer"), aVerifier: compte((r) => r.verdict === "a-verifier"),
  constats: constats.length, P0: constats.filter((c) => c.priorite === "P0").length, P1: constats.filter((c) => c.priorite === "P1").length, P2: constats.filter((c) => c.priorite === "P2").length, P3: constats.filter((c) => c.priorite === "P3").length,
};
const dest = path.join(AUDIT, "donnees", "domaines", "partage.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(sortie, null, 1));
JSON.parse(fs.readFileSync(dest, "utf8"));
console.log("écrit : " + dest);
console.log("compteurs : " + JSON.stringify(compteurs));
console.log(erreurs.length ? "ERREURS (" + erreurs.length + ") :\n  " + erreurs.join("\n  ") : "cohérence : OK");
