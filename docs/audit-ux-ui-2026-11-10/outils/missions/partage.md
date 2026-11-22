# Mission — PARTAGE, LIENS ET INVITATION (audit approfondi)

- Clé de domaine : `partage` · Groupe : `Partage`
- Identifiants : surfaces `PAR-001…` ; constats `PAR-C01…`

## Périmètre

Chaque porte de partage existante et ce qui se passe au bout du lien : publication, profil, passion,
bobine, activité (affiche, invitations), application (inviter des amis), localisation, Live ;
partage interne (repartage dans le fil, envoi à une personne s'il existe) et externe (feuille
native, copie de lien, WhatsApp / e-mail / SMS) ; choix des destinataires, aperçu du contenu, clarté
de ce qui sera partagé et avec qui, confirmation, annulation, échec, double appui ; compréhension
par une personne qui ne connaît pas PASSIO (texte partagé, aperçu de lien de l'Edge Function
`netlify/edge-functions/apercu.js`, exécutée seulement avec un `fetch` remplacé) ; ouverture du lien
en étant connecté ou visiteur ; contenu valide, supprimé, privé, inaccessible, identifiant inconnu ;
continuité du parcours après inscription ou connexion ; retour au contexte d'origine ; tableau
comparatif de toutes les portes (où, libellé, icône, ce qui s'ouvre, options, feedback).

## Points d'entrée dans le code

`js/app-03-posts-vlogs.js` (`sharePost`, `sharePostInFeed`), `js/app-02-state-utils.js`
(`partagerOuCopier`), `js/app-04-comments-shop.js` (`shareUserProfile`),
`js/app-05-config-profil.js` (~3803–3900), `js/app-06-reels-partage.js` (~208–420 liens,
~488–890 invitations, ~898–965), `js/app-07-ia-explore-irl.js` (~4558, ~5056–5100, ~7179–7480),
`js/app-08-ui-modals-tour.js` (`shareBeta`, `signalerInscriptionViaLien`), `js/first-run.js`,
`js/affiche-rencontre.js`, `netlify/edge-functions/apercu.js`,
`docs/journal/partage-liens-invitation.md`, `docs/lots-ui/02-UI5-BOBINES-ET-LIENS-PROFONDS.md`.
