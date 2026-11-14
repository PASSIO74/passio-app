# Mission — MESSAGERIE : LISTE, NOUVELLE CONVERSATION, GROUPES, PARAMÈTRES, APPELS (audit approfondi)

- Clé de domaine : `msg-liste` · Groupe : `Messagerie`
- Identifiants : surfaces `MSG-001` à `MSG-099` ; constats `MSG-C01` à `MSG-C49`
- Un autre auditeur traite l'intérieur de la conversation (`msg-conversation`).

## Périmètre

Écran Messages : liste des conversations, recherche de conversation ou de message, filtres, non-lus
et badges (liste + barre basse), archives, épinglage, « marquer non lu », sourdine, suppression,
gestes sur une ligne, pagination, tri, horodatages, aperçu du dernier message, conversations
d'exemple, états vide / chargement / erreur / hors ligne ; nouvelle conversation (recherche de
personnes, suggestions, introuvable, compte privé, compte bloqué) ; création de groupe, membres,
rôles, ajout / retrait, quitter, photo, description ; paramètres d'une conversation (sourdine,
vider, exporter, supprimer, marquer non lu, bloquer, rechercher, épingler, fond d'écran), fichiers
partagés ; identité du destinataire dans l'en-tête ; appels audio / vidéo (écrans rendus par leurs
fonctions : le WebRTC réel à deux appareils est inaccessible dans le banc) ; blocage, signalement
et confidentialité depuis la messagerie ; cohérence des termes.

## Points d'entrée dans le code

`js/app-04-comments-shop.js` (`renderMessages` ~5451, `openNewMessage` ~4007),
`js/app-05-config-profil.js` (groupes ~1809–2500, appels ~600–1760), `js/app-09-boot-pwa.js`
(~1560–1910), `js/ui-v6a-messages.js`, `js/app-08-ui-modals-tour.js` (`supaLoadMyConversations`
~7128, `supaCreateConversation` ~6554, `supaCreateGroup` ~6579, `supaSearchUsers` ~6477),
`docs/journal/social-messagerie.md`, `docs/lots-ui/04-UI4A4-A-UI7-ET-UI4A5.md`,
`docs/APPELS_TRANSITION.md`.
