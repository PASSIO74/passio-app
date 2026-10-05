# Journal — Passions, référentiel plat, création de passion, fil

> **Fiches déplacées TELLES QUELLES de `CLAUDE.md` le 2026-10-05.** `CLAUDE.md` est rechargé à
> chaque session et avait atteint 410 000 caractères (Claude Code alerte dès 40 000) : il ne garde
> plus que les règles qui valent partout. Ici vivent le récit, les mesures et les pièges de chaque
> lot — **à lire AVANT de toucher au domaine.** Un commentaire du code qui cite « CLAUDE.md § … »
> désigne une fiche de ce dossier : `grep -rn "<début du titre>" docs/journal/`.
> **Nouvelle fiche** : à la FIN du fichier de son domaine, titre `## <emoji> <TITRE> (AAAA-MM-JJ)`.
> Si elle porte une règle qui vaut pour TOUTE modification, une seule ligne de plus dans la section
> « Journal par domaine » de `CLAUDE.md` — jamais la fiche elle-même.

## Sommaire

- ✍️ CRÉER UNE PASSION DEPUIS L'APP (2026-09-08) — migration à appliquer
- ♾️ « PASSIONS ILLIMITÉES » — RÉSERVÉ AU COMPTE DE L'ÉDITEUR (2026-09-18)
- 🎵 UNE BULLE « MUSIQUE » QUE TAPER NE FAISAIT RIEN — LE PROFIL DE REMPLISSAGE SE PRENAIT POUR UNE PASSION (2026-09-22)
- 🎯 LES PASSIONS DU FIL SONT CELLES DU COMPTE (2026-09-18)
- 🔢 LE RÉFÉRENTIEL PASSE À 5 001 PASSIONS (vague 3, 2026-09-10)
- 🎿 « ON EST CENSÉ AVOIR 5 000 PASSIONS ? » — TROIS SURFACES CHERCHAIENT DANS 19 (2026-09-12)
- 🔤 ALIAS À LA CRÉATION D'UNE PASSION (2026-09-10)

---

## ✍️ CRÉER UNE PASSION DEPUIS L'APP (2026-09-08) — migration à appliquer

Le premier reproche des testeurs : un nom absent du référentiel ne donnait qu'une **DEMANDE** (« en vérification »), jamais publiable. Le bouton du pied du sélecteur **CRÉE** désormais la passion, la sélectionne, et elle est **publiable tout de suite** ; son libellé dit lequel des deux gestes va se produire (« Créer « X » » / « Demander l'ajout de « X » »).
⚠️ **`public.passions` RESTE EN LECTURE SEULE POUR UN CLIENT** : aucune policy INSERT n'a été ajoutée, l'écriture passe par la SEULE fonction `SECURITY DEFINER` `creer_passion(p_label, p_emoji)` (`migrations/migration_creation_passion_utilisateur.sql`, **à appliquer par psql ou le SQL Editor** — ADR-012). Le client ne choisit que le **NOM** ; `id`, `status`, `source='user_suggested'`, `normalized_label`, `created_by` sont écrits par le serveur, qui tient aussi le dédoublonnage (libellé **et alias** : « jogging » → `running`), les plafonds (5/24 h, 30/compte) et les noms refusés.
⚠️ **Le client fonctionne AVANT comme APRÈS la migration** : fonction absente, hors ligne ou sans compte → repli sur la demande, annoncé (`repli: "demande"`), jamais un échec muet. ⚠️ **`MY_UID` ne prouve pas qu'un compte existe** — `creationDisponible()` exige un vrai uuid Supabase. ⚠️ **Créée puis invisible / créée puis refusée** sont les deux défauts de famille du lot : `injecterPassion` ajoute la passion au référentiel EN MÉMOIRE (index + registre `_creees`, consulté par `parId()` même sans référentiel chargé, sinon « ✨ Passion »), et `enregistrerPassionCanonique(id)` (app-02) l'inscrit dans un Set **SÉPARÉ** de `_referentielPassions` — écrire dans ce cache à un seul coup interdirait le chargement du vrai référentiel pour toute la session. ⚠️ Le bouton porte un `data-tel` explicite : sans lui, `telemetry.js` nommerait le clic avec la **recherche libre** de la personne.
⚠️ **TROIS CRÉATIONS OFFERTES, ENSUITE C'EST PAYANT** (2026-09-08 au soir, `migrations/migration_passion_creations_offertes.sql`) : le plafond produit remplace l'anti-abus du premier jet (5/24 h + 30). **Trois créations À VIE par compte, et ce n'est PAS « trois passions vivantes »** — le compteur est `count(*) where created_by`, **sans condition de statut** : archiver ne rend pas un droit de création (sinon la porte dérobée du 2026-09-02 se rouvre par le bas). Le **dédoublonnage passe AVANT le plafond** : une passion qui existe déjà ne crée rien et reste ajoutable au plafond. Le refus serveur `quota_creation` ouvre `openPassionPaywall({creation:true})`, qui titre « Trois créations offertes » — **trois plafonds distincts aboutissent au même mur, et il doit dire lequel a refusé** (sinon on lit « tu suis déjà 3 passions », parfois faux). Aucun montant nulle part.
⚠️ **`revoke ... from public` NE FERME RIEN SUR SUPABASE** (mesuré en prod le 2026-09-08) : les privilèges par défaut du projet accordent `EXECUTE` à `anon` et `authenticated` sur toute fonction créée dans `public`, par des grants **NOMINATIFS** que le retrait du pseudo-rôle `PUBLIC` laisse entiers — d'où un `revoke ... from anon` explicite. Et **un PostgreSQL nu n'a pas cette règle** : le banc était vert par accident, il pose désormais le grant AVANT d'appliquer la migration.
⚠️ **MODÉRATION ET DROIT PAR COMPTE (2026-09-09, `migrations/migration_passion_moderation.sql`)** — **aucune file nouvelle** : signaler une passion, c'est `supaReport("passion", …)` dans `public.reports`, qui porte déjà `target_type`/`target_id` (index unique **PARTIEL** `where target_type='passion'` — un index global aurait changé le signalement de compte et de publication). Porte : lien discret **en bas** de `openPassionExplorer`, `requireAuthentication` avant l'écriture, et **on lit le verdict** (`supaReport` rend `false` sur un refus RLS comme sur un doublon). **Retirer = ARCHIVER** (`status='archived'`) : la ligne survit, les publications gardent leur FK, et le nom ne peut pas être recréé (`nom_indisponible`). ⚠️ **Pour que l'archivage ait un EFFET RÉEL, `chargerReferentielPassions` filtre `.eq("status","active")`** — sans ce filtre une passion retirée restait publiable, le retrait n'était qu'un décor (la liste locale `PASSIONS` reste le plancher, donc rien n'est rétracté). Revue : `npm run passions:moderation` (canal ② d'ADR-012, jamais le navigateur ; `archiver` refuse toute passion dont la `source` n'est pas `user_suggested` ; aucun identifiant de signaleur affiché).
⚠️ **UN DRAPEAU CLIENT NE PEUT PAS LEVER UN PLAFOND SERVEUR** : `passio_passions_illimitees_v1` ouvre les gardes de l'ÉCRAN, `creer_passion` refusera quand même la 4ᵉ création. Le droit étendu vit en base — `public.passion_quotas (user_id, creations_max)` : `NULL` = illimité, un entier = ce plafond, **aucune ligne** = le défaut (3). ⚠️ **« Pas de ligne » et « ligne à NULL » sont DEUX états** — la fonction tranche sur `found`, jamais sur un `coalesce` de la valeur, sinon la table donnerait l'illimité à tout le monde par le simple fait d'exister. RLS : chacun LIT sa ligne, personne ne l'écrit (aucune policy) ; seul l'opérateur accorde (`passions:moderation quota --uid … --max illimite|<n>|defaut`). C'est la brique du futur paiement.
⚠️ **`chargerReferentielPassions` PAGINE** (2026-09-09) : PostgREST plafonne une réponse à `max-rows` (1 000), et il y a **1 912 passions actives** — une requête simple n'en ramenait que la moitié, et les autres, parfaitement légitimes, étaient **refusées à la publication** sans message utile. La boucle est bornée (20 pages) et **ne publie le Set qu'à la fin** : un chargement interrompu ne doit jamais installer une liste partielle pour la session. ⚠️ **Défaut révélé par un TEST, pas par un rapport** : sans `order by`, quelles 1 000 lignes reviennent dépend du PLAN — ajouter le filtre `status` l'a changé, et `user-passions-miroir` est tombé parce que sa prémisse (« moto-enduro absente du référentiel serveur ») était **périmée depuis la migration du 2026-09-01** et ne tenait plus que par cet accident. Un test qui tient par accident finit toujours par le dire.
Verrous : `scripts/verifier-migration-creation-passion.sh` (l'EXÉCUTE sur un PostgreSQL jetable — les TROIS migrations dans l'ordre, CI) et `tests/e2e/creation-passion.spec.js` (13). Détail : `docs/lots-ui/21-CREER-UNE-PASSION-2026-09-08.md`.

## ♾️ « PASSIONS ILLIMITÉES » — RÉSERVÉ AU COMPTE DE L'ÉDITEUR (2026-09-18)

Demande de Benjamin : « il y a un mode illimité pour les passions, applique-le seulement pour le
compte **passioadmin@gmail.com**. Tous les autres non, moi seul doit en bénéficier. » Le mode du
2026-09-04 était un fait de l'**APPAREIL** : une ligne de `localStorage` — ou un
`window.PASSIO_PASSIONS_ILLIMITEES` de console — levait le plafond de trois passions ET le quota de
trois changements sur n'importe quel téléphone et pour n'importe quel compte, et **la porte était
offerte à tout le monde dans Paramètres → Démo, en un tap**.

⚠️ **UNE SEULE AUTORITÉ, ET ELLE ÉCHOUE FERMÉ.** `compteAutorisePassionsIllimitees()` (app-06)
compare l'adresse de la session à `COMPTE_PASSIONS_ILLIMITEES` ; pas de jeton lisible, pas de
`user.email`, une autre adresse → le plafond et le quota **s'appliquent**. C'est l'**inverse VOULU**
de `requireAdmission` (18+), qui échoue OUVERT parce qu'elle double une frontière tenue par la RLS :
ici **rien ne double la garde**, donc un inconnu n'est jamais servi. Refuser à tort à l'éditeur ne
coûte qu'une reconnexion ; accorder à tort, c'est très exactement le défaut qu'on referme.

⚠️ **LE DROIT SE VÉRIFIE AVANT LE DRAPEAU**, et l'ordre est le lot entier : la garde est la PREMIÈRE
ligne de `passionsIllimitees()`, donc ni la clé de stockage ni un `window.PASSIO_PASSIONS_ILLIMITEES
= true` ne passent pour un autre compte. Les deux interrupteurs (`plafondPassionsActif`,
`quotaChangementsActif`) et tout ce qui en découle par lecture n'ont pas bougé d'une ligne — c'est ce
qui rend le lot petit.

⚠️ **ON LIT LA SESSION, JAMAIS `MY_UID` NI L'ÉTAT LOCAL.** `getMyUserId()` fabrique un
`u_<aléatoire>` pour tout visiteur et `state.user` est un fichier de l'appareil que la console
réécrit : ni l'un ni l'autre ne prouve un compte. Seul le jeton du SDK le fait, et
`_sessionSdkPersistee()` (app-08) reste le **SEUL** endroit du dépôt qui le lit (règle du 2026-09-13 :
une seule lecture du jeton pour tous les verdicts).

⚠️ **LA PORTE DES PARAMÈTRES EST MASQUÉE, PAS DÉSARMÉE**, et son `display:none` est **en dur dans
`index.html`** : c'est la position par défaut, donc le sens sûr de l'échec — si app-06 ne se charge
pas, la porte reste fermée au lieu de s'ouvrir à tous. Un `disabled` n'aurait de toute façon jamais
été une garde (revirement du 2026-09-04, fiche 19) ; celle-ci est dans `passionsIllimitees()`. La
visibilité se pilote et se **LIT** par `style.display` — `[hidden]` ne replie rien sur un élément
dont le CSS impose un `display`. `basculerPassionsIllimitees()` est **globale** : elle porte donc la
même condition, **prononce** son refus (un refus muet est indiscernable d'une panne) et le TRACE
(`diagLog`), plutôt que d'écrire un drapeau qui ne lèverait rien — un interrupteur qui s'allume sans
rien faire est pire qu'un refus.

⚠️ **CE DROIT N'EST PAS CELUI DE CRÉER DES PASSIONS, ET AUCUN DRAPEAU CLIENT NE PEUT L'ÊTRE** : le
plafond des créations (3 à vie) est tenu par `creer_passion` + `public.passion_quotas`. Mesuré le
2026-09-18 (canal ① d'ADR-012) : la table porte **UNE seule ligne**, `creations_max = NULL`
(illimité) — et c'est celle de **`contact@ladamemetallerie.com`** (`20762060-…`), **pas** celle de
`passioadmin@gmail.com` (`812aee2b-…`), qui n'a **aucune ligne**, donc le défaut de 3. Déplacer ce
droit est un geste d'**exploitation**, hors dépôt (canal ②, jamais depuis la CI) :
`npm run passions:moderation quota --uid 812aee2b-214f-4949-931e-842599b6d68b --max illimite` puis
`--uid 20762060-78c4-40b9-ad2a-ee7c1cb19857 --max defaut`. ⚠️ « Pas de ligne » et « ligne à NULL »
sont DEUX états (la fonction tranche sur `found`) : **l'état de la base ne se lit pas dans un fichier
du dépôt, il se mesure.**

⚠️ **PIÈGE DE BANC MESURÉ, ET IL A FAIT ROUGIR TROIS CAS SUR LEUR PRÉMISSE** : un jeton posé avec un
`access_token` qui n'est pas un JWT de **forme** valide **DISPARAÎT** du stockage au premier appel du
SDK (supabase-js 2.116 le décode, échoue, appelle `_removeSession`) — la clé `sb-…-auth-token`
n'existait plus entre la pose et le premier rendu. `poserSession` fabrique donc trois segments
base64url (la signature n'est jamais vérifiée côté client). ⚠️ Et le jeton se pose **APRÈS** le
démarrage, jamais en `addInitScript` : posé avant, c'est le produit qui le purge — et comme « pas de
jeton » = refus, le cas serait **vert quoi qu'il arrive**. C'est la prémisse mesurée qui a sauvé
l'enquête : sans elle, le rouge aurait été lu comme un défaut du produit.

Verrou : `tests/e2e/mes-passions-page.spec.js` ⑭ → ⑭ septies (7 cas). Les quatre d'origine passent
désormais par le compte servi ; trois cas neufs mesurent le **REFUS** — un autre compte (drapeau ET
`window` forcés, l'écran **et** le geste d'archivage qui doit buter), aucune session (échec fermé, et
la cohérence de l'adresse avec `PASSIO_EDITEUR.email` : deux constantes qui dérivent en silence
déplaceraient ce droit vers un compte que personne n'a choisi), et la porte des Paramètres (masquée
pour un autre compte, présente pour celui servi, bascule refusée et prononcée). **Éprouvé par
RÉINJECTION de trois mutations** — garde retirée de `passionsIllimitees` (**2 rouges** : quinquies et
sexies), masquage du bouton neutralisé (**1**), refus de la bascule neutralisé (**1**). Les quatre cas
d'origine, eux, restent **verts sous la mutation 1** : c'est bien le REFUS qu'aucun d'eux ne mesurait.

## 🎵 UNE BULLE « MUSIQUE » QUE TAPER NE FAISAIT RIEN — LE PROFIL DE REMPLISSAGE SE PRENAIT POUR UNE PASSION (2026-09-22)

Rapport de Benjamin, capture à l'appui : « je viens de rajouter une passion (musique) sur mon
profil mais je n'arrive pas à la sélectionner ». Le rail du Fil peint « Suivis · **Musique
(grisée)** · Metallerie · Course à pied · Wakeboard » ; taper « Musique » ne change rien, et **rien
ne se prononce**.

⚠️ **MESURÉ EN PRODUCTION LE JOUR MÊME (canal ① d'ADR-012), ET C'EST LA MESURE QUI A DÉSIGNÉ LA
CAUSE.** `user_state` du compte de la capture porte bien une entrée « musique » — et elle porte
`_parDefaut: true`. C'est le profil de **REMPLISSAGE** fabriqué par `boot()` quand le serveur ne rend
aucun profil (`allPassions()[0]` = « Musique »), **pas une passion choisie**, et
`selectedFeedPassions` ne la contient pas. Benjamin n'avait rien ajouté : il essayait d'adopter un
fantôme que l'application lui montrait comme une possession.

⚠️ **DEUX DÉFAUTS, ET IL FALLAIT LES DEUX POUR PRODUIRE LE SYMPTÔME.** ① `passionsVivantes()`
(app-06) ne l'excluait pas → la bulle était **PEINTE** ; mais `passionsPossedeesIds()` (app-02)
l'exclut depuis le 2026-09-18, donc `setFeedPassions` **JETAIT** l'identifiant à chaque tap : le rail
se repeignait à l'identique, sans un mot. Une **promesse d'affichage que l'écriture refuse** — et
ici il n'y avait même rien à refuser, la bulle n'aurait pas dû exister. ② `ajouterPassionAuCompte()`
prenait le remplissage pour une possession (`_existante`) : aller l'ajouter dans « Mes passions »
rendait « déjà là », donc **aucune écriture, aucun passage par `ajouterPassionAuFil`, marqueur
intact**. Le seul geste qui pouvait réparer la situation était muet.

⚠️ **LA RÈGLE, UNE FOIS POUR TOUTES : LE REMPLISSAGE N'EST UNE PASSION NULLE PART** — ni peint, ni
compté dans le plafond, ni passion d'écriture, ni publié. Et « ajouter » cette passion-là le
**PROMEUT** (`delete _parDefaut`, même objet, aucune seconde entrée) **APRÈS** le contrôle du
plafond : il n'occupe aucune place, donc l'adopter en prend une, et au plafond la fenêtre payante
refuse et **se prononce**, comme pour n'importe quelle autre passion.

⚠️ **LE COMPTEUR DU PLAFOND ÉTAIT LE DERNIER À NE PAS LE SAVOIR, ET ÇA COÛTAIT UNE PLACE SUR TROIS.**
Le commentaire de `nbPassionsTotales` affirmait déjà que le remplissage « n'est compté NULLE PART
ailleurs » — c'était **faux dans `nbPassionsVivantes`**, juste au-dessus. Conséquence vivante pour
tout compte entré par « Se connecter » (chemin où `attacherPassionsAuCompte` ne passe pas et où le
remplissage survit) : trois passions choisies + le remplissage = quatre vivantes, donc
`plafondPassionsAtteint()` **à TROIS** — la porte d'ajout refusait la troisième passion d'un compte
qui n'en possédait que deux. **Une affirmation écrite dans un commentaire n'est pas une garantie ;
seule la ligne de code qui la tient l'est.**

⚠️ **LE REPLI EST CONSERVÉ À L'OCTET PRÈS** : un compte qui n'a QUE son remplissage garde sa bulle et
sa passion de destination au Studio (`passionsVivantes()` retombe sur les vivantes quand aucune
possession n'existe). Sans compte possédant, `interetsBornesAuCompte()` est faux et la bulle reste
cochable — c'est-à-dire qu'elle n'est **jamais** morte. La bulle morte n'existait qu'à partir de la
PREMIÈRE vraie passion : le discriminant de l'affichage est le même que celui de l'écriture.

### ⚠️ ET UNE SEPTIÈME, TROUVÉE PAR BENJAMIN DANS L'HEURE QUI A SUIVI LE DÉPLOIEMENT

« La passion musique ne fonctionne plus du tout. » Le lot avait retiré la bulle morte (juste) et
réparé `ajouterPassionAuCompte` pour qu'il PROMEUVE le remplissage (juste aussi) — mais
**`mesPassions()` (js/passions-flat-ui.js), lue BRUTE, la comptait encore comme possédée**, et le
`deja` d'`ouvrirAjoutPassions` court-circuite le moteur : `if (deja.indexOf(id) >= 0) return;`.
Choisir « Musique » et valider ne produisait **RIEN** — ni passion, ni toast, ni refus. **On était
passé d'une bulle qui ne répond pas à une passion INTROUVABLE, c'est-à-dire PIRE QU'AVANT.**

⚠️ **LA LEÇON DÉPASSE LE REMPLISSAGE, ET C'EST LA PLUS CHÈRE DU LOT** : **réparer un MOTEUR ne sert
à rien tant qu'un garde EN AMONT décide, sur une AUTRE lecture, qu'il n'y a rien à lui demander.**
C'est le défaut `confirmArchivePassion` du même lot — sauf qu'ici le garde n'était **pas dans le
même fichier**, et qu'**aucun des 14 verrous ne passait par la porte réelle** : tous appelaient
`ajouterPassionAuCompte` à la main. **Un verrou qui appelle le moteur à la main ne mesure pas la
porte.** Le cas ⑮ exerce désormais le GESTE (`ouvrirAjoutPassions` → `onValider(["musique"])`).

⚠️ **DEUX AUTRES DÉCISIONS DE POSSESSION LISAIENT BRUT**, refermées avec : `quickCreateProfile`
(app-07) trouvait le remplissage après un refus au plafond et basculait `currentProfileId` dessus,
sans un mot (`np` nul, donc pas de toast) ; et la fiche d'une passion annonçait « tu as cette
passion » sur le seul remplissage (`hasProfile`). **Résidu nommé** : `publishPost` (app-06) teste
« pas archivée » sur la liste brute — le durcir produirait le message FAUX « cette passion est
archivée », et `#postPassion` ne propose plus le remplissage, donc le chemin est inatteignable.

⚠️ **ET MON PROPRE CAS ⑯ ÉTAIT VERT SUR SON DÉFAUT** : le fixture posait `currentProfileId` **déjà**
sur le remplissage, donc « avant === après » passait quoi qu'il arrive, et `currentProfile()` — qui
écarte le remplissage — masquait le reste. On part d'une VRAIE passion d'écriture et on lit
l'identifiant **BRUT**, celui qui est persisté. Trouvé par la RÉINJECTION, pas par la relecture.

⚠️ **CE QU'ON NE PEUT PAS PROUVER DEPUIS UN BAC DE SESSION** : `passio-app.netlify.app` n'y est pas
joignable (HTTP `000`, quand `api.github.com` rend 200). La preuve « le fichier servi porte le
changement » est donc **hors de portée d'une session distante** ; il reste le job vert et l'essai
réel. Une sonde qui ne peut pas joindre sa cible rend un faux négatif, pas une mesure — ne jamais
lire son silence comme « le déploiement a échoué ».

### ⚠️ SIX SURFACES DE PLUS, TROUVÉES PAR `audit-passio` APRÈS HUIT VERROUS VERTS

« Corriger une surface, c'est corriger une surface. » Le premier jet redressait trois fonctions ;
six autres endroits lisaient encore `state.user.profiles` **BRUT**, et **trois devenaient faux à
cause du lot** — c'est le mode d'échec à retenir : **un correctif qui déplace une règle doit être
suivi partout où l'ancienne servait.**

⚠️ **[P1] LA PORTE ET LE POINT D'ÉCRITURE NE COMPTAIENT PLUS PAREIL.** `archiverPassion` avait été
redressée, **pas `confirmArchivePassion`**. Un compte « remplissage + une vraie passion » en voyait
DEUX à la porte : la confirmation s'ouvrait, annonçait le coût, l'utilisateur validait — et le point
d'écriture en comptait UNE et refusait. **Lire, comprendre, valider, se faire refuser** : la leçon
`meOpen` prise par son autre bout, enfreinte par le correctif qui n'avait redressé qu'un des deux
bouts. ⚠️ **Et le verrou était vert dessus** : il appelait `archiverPassion` à la main, jamais sa
porte — il mesurait la fonction, pas le câblage.

⚠️ **[P1] AU STUDIO, ON PUBLIAIT SOUS LA PASSION QUE LE MUR VENAIT DE REFUSER.** `ouvrirChoixStudio`
(passions-flat-ui) testait la possession sur la liste brute : au plafond, `ajouterPassionAuCompte`
refusait bien et ouvrait la fenêtre payante, mais `possedee` rendait quand même `true`, donc
`#postPassion` — la SEULE source de vérité de `publishPost` — pointait la passion refusée. **EN
SILENCE, pendant que le mur s'affichait.** Le commentaire immédiatement au-dessus décrit ce piège en
toutes lettres et le déclarait fermé : **le plafond ayant cessé de compter le remplissage, la
branche s'était rouverte par en dessous.**

⚠️ **[P1] L'ALLER-RETOUR SERVEUR BLANCHISSAIT LE MARQUEUR — le défaut ressuscité par la base.** Le
jsonb `profiles.passions` est la SAUVEGARDE de mes passions, relue par la reconstruction du boot ;
il ne portait pas `_parDefaut`, et le boot ne le restituait pas. Sur un appareil neuf, le
remplissage revenait en **vraie passion** : quatre vivantes pour un plafond de trois, et la bulle
morte de retour. **Tant que le marqueur ne décidait de rien, le perdre ne coûtait rien ; il décide
désormais de la bulle, du plafond et de la passion d'écriture.** Il voyage donc et se restitue,
**exactement comme `archived`, qui avait déjà payé ce défaut** — et `passionsPubliques()` le retire à
l'affichage, sans quoi mon profil annonçait **quatre passions aux visiteurs** quand le mien en
comptait trois.

⚠️ **[P2] « Mes passions » disait 0 et peignait 1 carte.** L'en-tête lit `nbPassionsVivantes()` (qui
exclut), la liste peignait `passionsVivantes()` (qui le rend en repli). **La carte était le mensonge,
pas le compteur** : ce compte ne possède rien et ses trois places sont libres. La carte est retirée
sur cette page seulement — toucher l'autorité et son repli aurait atteint dix autres surfaces.

⚠️ **[P2] LA FENÊTRE D'ÉCHANGE PROPOSAIT DE « RANGER » LE REMPLISSAGE**, ligne qui ne pouvait
débloquer **RIEN** : il n'occupe aucune place, donc l'archiver consommait un changement puis
l'échange butait sur le plafond et se reprenait (« rien n'a changé »). **Une sortie proposée qui ne
sort de nulle part est pire qu'une absence de sortie.**

⚠️ **[P2] RÉACTIVER UN REMPLISSAGE ARCHIVÉ CONSOMMAIT UN CHANGEMENT SANS RIEN FAIRE RÉAPPARAÎTRE** —
ni carte, ni bulle, ni compteur, `passionsVivantes()` l'écartant. **Un geste payant sans effet
visible est pire qu'un refus** : `restaurerPassion` le promeut, comme `ajouterPassionAuCompte`.

⚠️ **RÉSIDUS NOMMÉS, PAS RÉGLÉS** : sous la coupure `passio_ui_8="0"`, `renderProfileStrip` et
`renderStudio` retombent sur la liste brute et le remplissage redevient peint — chemin de coupure,
comportement d'avant, assumé. `currentProfile()` (app-02) teste `_parDefaut` en ligne plutôt que
d'appeler `_estRemplissagePassion` (app-06) : délibéré, cette autorité est appelée très tôt et ne
doit pas dépendre d'un fichier chargé après elle.

⚠️ **PIÈGE D'ENVIRONNEMENT DE LA JOURNÉE** : le bac ne porte pas la révision de Chromium attendue
par le `@playwright/test` du dépôt. **Ne pas réinstaller** : la config prévoit déjà
`PASSIO_CHROMIUM=<chemin du binaire>`, qui pose `launchOptions.executablePath`. En local,
`creation-passion` ⑭ et trois cas de `profil-entete-passions` sont **ROUGES sur `origin/main` PUR**
(rejoué en worktree séparé, port 8099) — divergence d'environnement déjà écrite, étrangère au lot.

Verrou : `tests/e2e/passion-remplissage-bulle-morte.spec.js` (**14**), dont ② qui est la formulation
GÉNÉRALE du défaut et vaut pour toute bulle future (« aucune bulle peinte n'est refusée par
l'écriture »), ⑨ qui mesure la porte **par le geste**, ⑩ le Studio au plafond, ⑪ l'aller-retour
serveur à la source, et ⑧ le câblage de `boot()` — un chemin qu'aucun banc local ne parcourt.
**Éprouvé par RÉINJECTION de DIX mutations**, chacune rougissant sa cible : bulle repeinte (3
rouges), ajout rendu muet (2), plafond qui recompte le remplissage (3), garde de `currentProfile`
retirée (1), porte d'archivage rendue au filtre brut (1), Studio rendu à la lecture brute (1),
`passionsPubliques` rendue à l'ancien filtre (1), restauration qui ne promeut plus (1), échange rendu
à la liste brute (1), cartes rendues au repli (1).

## 🎯 LES PASSIONS DU FIL SONT CELLES DU COMPTE (2026-09-18)

Rapport de Benjamin, deux captures prises à la même minute : le rail du Fil peignait « Suivis ·
Metallerie · Course à pied · Wakeboard · Ski freestyle · … », le Profil disait « 3 PASSIONS ».
Mesuré en base (canal ① d'ADR-012) sur le compte de la capture (`passioadmin@gmail.com`) :
`user.profiles` porte TROIS passions vivantes, `selectedFeedPassions` en porte SEPT — les quatre
de trop (`glisse-ski-freestyle`, `sport`, `cuisine`, `photo`) sont les choix d'une exploration
SANS compte, migrés par `migrerPreferences` comme **intérêts** de fil, jamais devenus des passions
du compte ; le compte a ensuite ajouté ses trois passions dans « Mes passions »
(`ajouterPassionAuFil` AJOUTE, ne retranche jamais) et le Fil a EMPILÉ les deux.

⚠️ **LA RÈGLE EXISTAIT DEPUIS LE 2026-09-01, ELLE N'ÉTAIT TENUE NULLE PART.** `passions-flat-ui`
l'écrit en toutes lettres (« le rail du Fil reste une commande de LECTURE — on y coche et décoche
ce qu'on possède ; on acquiert au Profil »), mais trois points d'écriture des intérêts la
contredisaient : `migrerPreferences` (intérêts sans passions), `onbFinish` V2 (UN profil, jusqu'à
SEPT intérêts — spec §6 d'avant ADR-011 et d'avant le plafond) et `renderProfileStrip`, qui
COMPLÉTAIT le rail par les intérêts sans profil (`_interet_…`) — remède du 2026-08-30 pour rendre
ces intérêts décochables, devenu la surface même du défaut. Un intérêt que le compte ne possède
pas est une bulle de plus que le plafond n'a jamais accordée.

⚠️ **UNE SEULE BORNE, AU SEUL POINT D'ÉCRITURE.** `setFeedPassions` (app-02) ne garde, pour un
compte qui possède des passions, que `passionsPossedeesIds()` (vivantes, hors `_parDefaut`) ;
`interetsBornesAuCompte()` est le discriminant : `comptePassioReel()` ET au moins une passion
possédée. Posée à chaque porte, la prochaine porte l'oublierait (`quickCreateProfile`, le Studio —
déjà payé pour le plafond). `restoreFeedPassions` y passe au démarrage et **PERSISTE** si la borne
a retiré quelque chose : le blob `user_state` de production s'assainit au premier rendu.
`_repriseUserState` (rejeu réseau) rappelle `restoreFeedPassions` — un blob rejoué laissait le Set
d'avant. `renderProfileStrip` ne rajoute rien pour un compte : les deux rails comptent pareil par
construction (verrou ③ : Set pollué HORS de l'autorité, aucune bulle fantôme).

⚠️ **UN VISITEUR N'EST PAS BORNÉ, ET C'EST VOULU** : pas de compte, ses intérêts SONT ses passions
du moment (`appliquerPrefs`), et le rail les peint sans profil comme avant. `comptePassioReel()`
tranche — jamais `state.user.profiles.length` seul : un visiteur peut avoir ajouté une passion au
Profil, et sa recherche de première visite aurait continué de lui être jetée.

⚠️ **LES CHOIX DU VISITEUR DEVIENNENT LES PASSIONS DU COMPTE QU'IL CRÉE**
(`attacherPassionsAuCompte`, first-run.js) par `ajouterPassionAuCompte`, le SEUL moteur d'ajout —
plafond, doublon, Fil, synchronisation compris. Les places se mesurent AVANT chaque appel : au
plafond, le moteur ouvre la fenêtre payante, un mur posé sur un geste automatique. Le profil de
remplissage de `boot()` (« Musique », `_parDefaut`) CÈDE LA PLACE — laissé là, il prenait l'une des
trois places offertes. Au-delà du plafond, un toast dit ce qui a été gardé. La passion de départ du
Studio est le PREMIER choix (le moteur rebascule `currentProfileId` à chaque appel). On juge sur
l'ÉTAT, pas sur le retour du moteur, qui rend `null` aussi quand il RESTAURE une archivée.

⚠️ **L'ONBOARDING V2 CRÉE UNE PASSION PAR CHOIX ET NE LAISSE COCHER QUE `PASSIONS_OFFERTES`**
(`onbMaxPassions()`, lu paresseusement — app-06 charge après app-02 ; plafond coupé = les sept de
la spec). Laisser cocher sept pour n'en garder que trois serait un mensonge d'interface. Au
passage, `deleteProfile` retirait la passion des filtres du PROFIL mais pas du FIL — même famille
qu'`archiverPassion` avant le 2026-08-30.

⚠️ **POINT OUVERT, NOMMÉ** : `nbPassionsVivantes()` compte le remplissage `_parDefaut` tant qu'il
est vivant — un compte neuf qui n'est pas passé par l'exploration voit « Musique » occuper une
place sur trois jusqu'à l'archiver. Antérieur au lot, hors périmètre.

Verrou : `tests/e2e/fil-passions-du-compte.spec.js` (10), dont ① sur l'état EXACT de la capture
(transposé sur le socle embarqué : « metallerie » est une passion créée en production, absente du
référentiel livré), ⑤ la migration (plafond, remplissage, passion de départ) et ⑦ le câblage à la
source. **Éprouvé par RÉINJECTION de quatre mutations** : borne retirée de `setFeedPassions` →
**6 rouges** ; garde du rail retirée → **2** (③ et le câblage) ; attache retirée de la migration →
**3** ; onboarding rendu à « un seul profil » → **1**. Suites réalignées : `onboarding-v2` (« un
seul profil » → une par choix), `onboarding-acceptation` ONB-02/03, `onboarding-passions-v2` §4,
`multi-passion-audit-restant` ③/③ bis (le cas « UNE créée, TROIS en intérêts » n'existe plus ; les
bulles d'intérêt ne survivent que chez un visiteur), `first-run` (fixture à trois intérêts), et
**trois fixtures qui COCHAIENT une passion sans la posséder** — `feed-envie-filtre` (« musculation »,
« cuisine » : cocher, c'est posséder, le fixture les ajoute au compte), `feed-premier-rendu` §7
(« moto » choisie à l'onboarding), `multi-passion-integrite` ⑥ (par `ajouterPassionAuCompte`, le
moteur réel, et non `ajouterPassionAuFil` à la main), `feed-vues-adr010` ⑩ (« cuisine » au compte
avant de la cocher) et ⑬ (les dix passions recochées APRÈS avoir été données au compte — sinon neuf
bulles grisées à `scale(0.95)` et « toutes les bulles ont la MÊME largeur » mesurait l'état coché,
pas la mise en page ; trouvé par le shard 2/6 de la CI, dont le journal est ILLISIBLE d'ici, d'où
le rapporteur `github` : les échecs Playwright sont désormais des annotations du check-run).
⚠️ En local, `creation-passion` ⑭ et trois cas
de `profil-entete-passions` (③ decies quater, sexies, septies) sont ROUGES **sur `origin/main` pur
aussi** (worktree séparé, port 8099) : divergence d'environnement déjà écrite plus haut, pas ce lot.
Détail : `docs/lots-ui/25-FIL-PASSIONS-DU-COMPTE-2026-09-18.md`.

## 🔢 LE RÉFÉRENTIEL PASSE À 5 001 PASSIONS (vague 3, 2026-09-10)

2 088 → **5 001 passions**, 4 350 → **9 100 alias**. L'objectif fixé par l'étude de
capacité (`docs/PASSIONS_CAPACITE_ETUDE_2026-09-09.md`, §5 ter) est atteint. Les plafonds
mesurés n'ont pas bougé : plafond DUR du code 20 000, maximum produit recommandé 12 000.
⚠️ **Zéro identifiant d'origine perdu, zéro libellé d'origine modifié** — et ce n'est pas
une intention, c'est un contrôle qui doit être REJOUÉ à chaque vague (comparer la liste
d'ids d'`origin/main` à celle du dépôt).

⚠️ **LE DÉFAUT LE PLUS GRAVE DE LA VAGUE A ÉTÉ VU PAR UN CONTRÔLE QUI NE CHERCHAIT PAS ÇA.**
En traitant une collision, le lot de corrections a retiré `finance-salaire` — une entrée
**curée**, référencée par `posts.passion_id` en production. Le validateur ne l'a pas vue
par son libellé ni par son id : il l'a vue par la **relation orpheline** qu'elle laissait
(une autre entrée la visait en `broader`). **Un identifiant absent ne lève RIEN** : il rend
« ✨ Passion » sur toutes les publications qui le portent, et ne se voit qu'à l'écran, sur
du contenu réel, donc après la mise en ligne.

⚠️ **LE DÉCOUPAGE EN FICHIERS EST UNE COMMODITÉ DE RELECTURE, PAS UNE FRONTIÈRE DE SENS.**
La moitié des ~212 collisions étaient INTER-FICHIERS : « Ornithologie » vivait dans
`70-vivant`, « Archéologie » dans `80-culture`, « Microbiote » et « Bain de forêt » dans
`90-bienetre`, « Herbier » dans `85-savoirs`. Aucune relecture par domaine ne pouvait les
voir. Seul `npm run passions:valider` les voit — c'est très exactement pour ça qu'il existe,
et il faut le lancer APRÈS CHAQUE LOT, pas à la fin.
⚠️ **Un sigle n'appartient à personne** : « OCR » était déjà l'alias d'une course
d'obstacles, « VAE » celui du vélo à assistance électrique. « SIG », « JO », « BAFA »,
« SCOP » : mêmes télescopages. Un alias en sigle se relit deux fois.
⚠️ Taux de redondance mesuré : **~7 %** (3 125 écrites, 212 retirées). La vague 1 était à
15 % — l'écart ne dit pas la qualité de la méthode, il dit à quel point le domaine visé
était DÉJÀ couvert. Budgéter ~3 200 rédactions pour 3 000 nouvelles.

⚠️ **LE GÉNÉRATEUR DE DELTA NE RÉPOND PAS À CETTE VAGUE, ET IL FAUT SAVOIR POURQUOI.**
`sort_order` est un index **GLOBAL** (`p.sort_order = i + 1`, `referentiel-passions.js`) :
insérer 2 913 entrées décale la valeur de PRESQUE TOUTES les lignes déjà en base. Un delta
« ce qui a changé », même en mode `--etat`, vaudrait donc le miroir entier. L'outil de la
vague 2 reste juste ; le cas est simplement différent.
La réponse est **`scripts/decouper-migration-passions.js`** : le miroir (1,45 Mo) est
découpé en **7 parties de ~240 Ko**, collables une par une dans l'éditeur SQL.
⚠️ **Le découpage CHANGE UNE GARANTIE** : le miroir entier est un `begin; … commit;` unique
(tout ou rien) ; découpé, chaque partie est sa propre transaction, donc un échec à la
partie 4 laisse 1 à 3 appliquées. Acceptable UNIQUEMENT parce que le miroir est additif et
idempotent — on reprend à la partie qui a échoué, jamais depuis la première. Ne pas
réutiliser ce découpeur sur une migration qui, elle, aurait besoin de l'atomicité.
⚠️ **Un découpeur qui perd une instruction en silence est pire que pas de découpeur** : on
croirait avoir tout appliqué. D'où DEUX contrôles à deux niveaux — le script réassemble ses
parties et compare la liste d'instructions au fichier d'origine (le TEXTE) ;
`tests/sql/decoupage-migration-passions.test.sh` (gate CI) **exécute** les deux chemins sur
deux bases PostgreSQL jetables et compare l'empreinte **ligne à ligne** (l'EXÉCUTION). Une
instruction peut être intacte au texte et le découpage faux à l'exécution. Le banc
redécoupe avant de mesurer : un miroir régénéré sans redécoupage ferait appliquer
l'ANCIENNE version, en silence.

⚠️ **« 568 Ko jamais au démarrage » — l'invariant tient, il devient PLUS cher à enfreindre.**
`data/passions-v1.json` passe de 154 à **568 Ko**. Il n'est toujours chargé qu'au premier
usage réel (`passions-plates` ⑤ et ⑰ bis). Les commentaires qui citaient « 160 Ko » ont été
corrigés dans le CODE VIVANT ; ceux des documents d'époque ont été laissés — ce sont des
mesures datées, les réécrire falsifierait l'histoire.

⚠️ **UN TEST QUI TIENT PAR ACCIDENT FINIT TOUJOURS PAR LE DIRE, et c'est arrivé encore.**
`creation-passion.spec.js` utilisait « sculpture sur glace » comme exemple de nom INCONNU
du référentiel. Nom parfaitement plausible… donc entré au référentiel à la vague 3 : six cas
sont tombés d'un coup, pour une prémisse périmée, pas pour un défaut du code (même famille
que `user-passions-miroir` le 2026-09-09). Le nom d'essai est désormais une chaîne que
personne n'écrira jamais (`NOM_ESSAI`/`ID_ESSAI`/`LIBELLE_ESSAI` en tête de fichier), et le
cas ⓪ **VÉRIFIE** son absence au lieu de l'espérer, avec un message qui dit quoi changer.
⚠️ Au passage : ces constantes vivent côté **Node**, jamais dans le navigateur — chaque
`page.evaluate` doit les recevoir en ARGUMENT, sinon `ReferenceError` dans la page.

Reste ouvert : **1 021 passions n'ont encore qu'UN alias** (cible 2, plancher 1). Le plancher
ne passera à 2 que quand l'alerte sera à zéro — un objectif laissé en alerte permanente est
un objectif que plus personne ne lit. Détail complet : `docs/PASSIONS_CAPACITE_ETUDE_2026-09-09.md`
§5 ter · application : `docs/APPLIQUER_MIGRATION_PASSIONS.md` (mise à jour du 2026-09-10).

## 🎿 « ON EST CENSÉ AVOIR 5 000 PASSIONS ? » — TROIS SURFACES CHERCHAIENT DANS 19 (2026-09-12)

Rapport d'écran de Benjamin, capture à l'appui : dans « Qu'est-ce qui te passionne ? », taper
« Ski » rendait **« Aucune passion ne correspond. Essaie un autre mot. »**
Mesuré le jour même, dans cet ordre — et c'est l'ordre qui compte :
**la base est bonne** (`select count(*) … where status='active'` = **5 003**, dont **15** de ski,
canal ① d'ADR-012), **le dépôt est bon** (`data/passions-v1.json` livre 5 001 entrées, dont **21**
de ski). Le défaut était **entièrement côté client**, et il ne touchait pas le référentiel : il
touchait **qui le consulte**.

⚠️ **LA QUESTION « LES 5 000 SONT-ELLES ACTIVÉES ? » N'A PAS UNE RÉPONSE, ELLE EN A UNE PAR
SURFACE.** Activées en base, livrées dans l'artefact, et pourtant invisibles sur trois écrans.
Répondre « oui, la migration est appliquée » aurait été exact et inutile. **Un référentiel n'est
actif que là où quelqu'un l'interroge** ; partout ailleurs il est un fichier sur un disque.

### Le défaut, et pourquoi il est passé sous tous les filets

`allPassions()` (app-02) = **socle embarqué (19) + passions perso du compte**. Il ne contient
AUCUNE des 5 001. Trois surfaces s'appuyaient dessus pour laisser quelqu'un **choisir** :

- **`js/first-run.js`** — `catalogue()`/`chercher()` du panneau de première visite. C'est celui de
  la capture, et **le seul écran que tout nouveau visiteur traverse**.
- **`openCreateGroup`** (app-05) — `allPassions().filter(p => myPassionIds.includes(p.id))`
  INTERSECTAIT les passions du compte avec le socle : un compte dont les passions viennent du
  référentiel obtenait une grille **VIDE**, et « Passion(s) du groupe (1 à 3) » est obligatoire.
  **Impasse dure, sans message.**
- **`openCreateEvent`** (app-07) — le `<select>` listait `passionsPubliables()`, donc le socle. Sur
  le **MÊME écran** on pouvait **filtrer** parmi 5 001 rencontres et n'en **organiser** que dans 19.

⚠️ **C'EST EXACTEMENT LE DÉFAUT CORRIGÉ LE 2026-09-03 SUR LA PAGE « RECHERCHER » (fiche 20), ET LE
CORRECTIF N'ÉTAIT ALLÉ QUE LÀ.** Son propre commentaire dit « ELLE NE CHERCHAIT QUE DANS LE SOCLE
EMBARQUÉ » — neuf jours plus tard, trois surfaces disaient encore la même chose. **Corriger une
surface, c'est corriger une surface** : la famille se traque au `grep` (`allPassions`,
`passionsPubliables`, `PASSIONS.filter`) et se re-traque après CHAQUE correctif de ce type.

⚠️ **LE MODE ÉDITION D'`openCreateEvent` PORTAIT DÉJÀ LA PREUVE DU MANQUE** : il réinjectait à la
main la passion d'origine « (non publiable) » quand elle était absente de la liste. Le trou était
connu et n'avait été rustiné que du côté où il faisait une erreur VISIBLE. **Une rustine locale sur
un défaut général est un panneau indiquant où chercher.**

### Les trois pièges du correctif

⚠️ **① CHOISIE PUIS INVISIBLE.** `interetsDuVisiteur` (first-run) filtre par `metaPassion`, qui
passe par `estPassionCanonique` — laquelle ne connaît **hors ligne que les 19**. « Ski alpin » était
donc choisi, validé, puis **JETÉ EN SILENCE** : le fil ne changeait pas et rien ne le disait.
D'où le registre `_refVues` : **une passion que ce panneau a MONTRÉE est réelle par construction**
(elle vient du référentiel, donc de la table `passions`), et `enregistrerPassionCanonique` (app-02)
l'inscrit dans le Set `_passionsCreees`, **séparé** de `_referentielPassions` — écrire dans ce
cache à un seul coup interdirait le chargement du vrai référentiel pour toute la session. Rien
n'est desserré : on n'inscrit QUE ce que le référentiel a rendu.

⚠️ **② « AUCUNE PASSION NE CORRESPOND » PENDANT QUE LE RÉFÉRENTIEL RÉPOND EST UN MENSONGE**, et
c'est très exactement le message lu à l'écran. Le socle est peint **immédiatement** (résultat
instantané, hors ligne compris), le référentiel s'y **ajoute** ; tant qu'une réponse est en vol la
grille dit « Recherche… ». `_panneauEnVol` se pose **à la frappe**, pas dans le timer : sinon les
160 ms d'anti-rebond rouvrent la fenêtre du message trompeur.

⚠️ **③ ON NE PEINT JAMAIS 5 001 TUILES** (fiche 20) : la grille est un **aperçu** borné à 60, la
recherche est le chemin vers le reste. « Voir toutes les passions » demande `chercherAsync("")`,
qui rend les suggestions du moteur, déjà classées.

Anti-rebond 160 ms et jeton d'annulation sont repris **à l'identique** d'app-07 : sans eux, taper
« guitare » lance sept recherches et une réponse lente partie sur « gui » écrase « guitare ».

### ⚠️ DEUX PIÈGES DE BANC, ET LES DEUX RENDAIENT UN TEST VERT SUR LE DÉFAUT

⚠️ **`_activeFeedPassions` EST UN `let` DE PORTÉE SCRIPT (app-01), PAS UNE PROPRIÉTÉ DE `window`.**
`window._activeFeedPassions` rend `undefined`, donc `(… || []).slice()` rend `[]`, donc l'assertion
« la passion est dans le fil » passait **sur un tableau vide**. Il se lit par son **nom nu** dans
`page.evaluate`. Même famille que `studioType` et `photoDataUrl`.

⚠️ **LE SERVICE WORKER SERT `data/passions-v1.json` HORS DU ROUTAGE DE PLAYWRIGHT.** Mesuré : un
`page.route("**/data/passions-v1.json")` **n'est jamais appelé** (compteur à 0) alors que
`page.on("request")` voit bien la requête partir et que les données arrivent. Un cas bâti sur une
route retenue ou abandonnée est donc **vert quoi qu'il arrive** — et le cas « repli hors ligne »
écrit ainsi ne prouvait rien, d'autant qu'il cherchait « Musique », qui est dans le socle. On mute
donc **`PassioPassions.chercherAsync`**, comme la maison mute `window.supa.from`.
⚠️ Corollaire : `bootVisiteur` pose `page.route("**/*")` et **capte tout** ; une route ajoutée après
lui n'est pas consultée.

Verrous : `tests/e2e/premiere-visite-referentiel.spec.js` (6) et
`tests/e2e/passions-organiser-et-groupe.spec.js` (4, dont ⓪ qui **VÉRIFIE** que la passion d'essai
est absente du socle au lieu de l'espérer, et ③ que le repeint ne change pas le choix — repeindre
un `<select>` en perdant la sélection ferait publier sous une AUTRE passion, en silence).
**Éprouvés par RÉINJECTION** : la grille rendue au socle fait rougir 3 cas sur 6 ; le registre
retiré fait rougir exactement celui qui mesure « choisie puis invisible » ; les deux surfaces
remises à `allPassions()` font rougir 3 cas sur 4, la prémisse restant verte.

### ⚠️ QUATRE DÉFAUTS INTRODUITS PAR LE CORRECTIF LUI-MÊME, TROUVÉS PAR `audit-passio`

Les gates étaient vertes, 111 tests au vert, et le lot rouvrait **deux fois** le défaut qu'il
fermait. À conserver : **la famille commune est « le correctif marche pendant la démonstration »**.

⚠️ **① LA COCHE DU GROUPE ÉTAIT EFFACÉE PAR LE REPEINT — la même impasse dure, décalée de deux
secondes.** `_groupeAssurerLibelles` réécrivait `innerHTML` ; `confirmCreateGroup` relit
`.group-passion-option.selected`. Mesuré : coches avant repeint **1**, après **0**. La grille est
le premier bloc interactif après le nom, donc on coche AVANT que les 568 Ko arrivent, et « Créer le
groupe » répond « Choisis au moins 1 passion ». **Le même lot le faisait correctement dans app-07**
(`sel.value = choix`) : c'est l'asymétrie entre deux surfaces sœurs qui a laissé passer le défaut.

⚠️ **② `_refVues` EST UNE MÉMOIRE DE SESSION, ET « CHOISIE PUIS INVISIBLE » REVENAIT AU
RECHARGEMENT.** Première visite : le ski entre dans le fil. Rechargement : il y est encore
(`restoreFeedPassions` ne filtre rien). On rouvre le panneau, on ajoute « Musique », on valide →
**le ski est jeté**, `estPassionCanonique` le rendant `false` et le registre étant vide. Et le pire
endroit est `migrerPreferences`, appelée depuis `reprise()` **après le `location.reload()`** de
« Se connecter » : la passion est perdue au moment exact où elle devrait s'attacher au compte. La
réponse n'est pas de persister un registre, c'est `passionPlate(id)` — **le référentiel plat est le
MIROIR de la table `passions`**, sa réponse se refabrique à chaque session. ⚠️ **Hors repli hors
ligne** : `repliHorsLigne()` fabrique ses entrées depuis le socle et `state.user.profiles`.

⚠️ **③ LE LOT ÉLARGISSAIT LA LISTE BLANCHE DE PUBLICATION.** Il appelait
`enregistrerPassionCanonique` sur tout résultat affiché, avec le commentaire « on n'y inscrit QUE ce
que le référentiel a rendu » — **que le code ne vérifiait pas**. En repli hors ligne, `charger()`
bâtit ses données depuis `state.user.profiles` : mesuré, `estPassionCanonique("custom_…")` passait
de `false` à **`true`**. L'appel n'était même pas nécessaire (`metaPassion` consulte `_refVues`
AVANT `passionConnue`). **`estPassionCanonique` reste la SEULE autorité de publication, et un lot
d'AFFICHAGE n'y touche pas** — `_exChercherPassions`, le correctif du 03/09 dont ce lot se réclame,
n'inscrit rien du tout.

⚠️ **④ `PassioPassions.charger()` ET `chargerReferentielPassions()` SONT DEUX MÉCANISMES DISJOINTS,
et un commentaire du lot les confondait.** Le premier remplit le JSON d'**affichage**, le second
`_referentielPassions`, la liste blanche que `requiredCanonicalPassion` consulte à
l'**enregistrement**. Mesuré : référentiel plat chargé, `estPassionCanonique("glisse-ski-alpin")`
rend encore **`false`**. Conséquence vivante : le `<select>` proposait une passion que « Publier »
refusait — là où, avant le lot, elle n'était pas proposée du tout. On demande donc les **deux** à
l'ouverture. ⚠️ Et filtrer par `estPassionCanonique` **seule** ramènerait les 19 : la liste accepte
aussi ce que le référentiel plat connaît.

⚠️ **AU PASSAGE, DEUX VERROUS QUI NE VERROUILLAIENT RIEN.** ⓐ « Voir toutes les passions » assertait
`> 12` — or `voirToutes()` peignait DÉJÀ les 19 du socle avant le lot, et le cas restait vert
**référentiel entièrement coupé**. L'élargissement se mesure contre `allPassions().length`, pas
contre une constante. ⓑ Les cas de la seconde suite **n'exerçaient jamais le repeint** :
`PassioPassions.pret()` est déjà vrai à l'ouverture quand le compte porte une passion hors socle
(`evaluerBesoinDeNoms` a chargé au boot), donc les deux fonctions neuves sortaient sur leur garde
`m.pret()` — **c'est très exactement pourquoi le défaut ① est passé**. Il faut RETARDER le
référentiel dans le banc. Corollaire : le cas « 568 Ko jamais au démarrage » vaut pour un
**visiteur sans passion**, pas pour un compte dont une passion est hors socle.

### ⚠️ LE PIÈGE D'ENVIRONNEMENT EN SENS INVERSE : ROUGE EN LOCAL, VERT EN CI

La maison connaît « vert en local, rouge en CI » (divergence du vrai SDK) et le cherche partout.
**L'inverse existe aussi, et il fait perdre autant de temps.** Mesuré le 2026-09-12 en cherchant
pourquoi le lot était rouge après une fusion de `main` :

- `tests/e2e/profil-visite-options.spec.js` (5 cas) et trois cas de `profil-entete-passions`
  échouent **en local**, sur `origin/main` PUR, dans un worktree neuf — donc sans aucun apport du
  lot en cours. Symptôme : `.modal.modal-fullscreen` « element(s) not found » après
  `openUserProfile("u_lea")`.
- Les mêmes sont **VERTS en CI sur ce même commit** (run 2642).

⚠️ **CONSÉQUENCE DE MÉTHODE, ET C'EST LE VRAI ENSEIGNEMENT** : rejouer le shard en échec en local
a produit **8 échecs qui n'étaient pas ceux de la CI**. Une reproduction qui rougit n'est une
reproduction que si elle rougit **pour la même raison** — sinon elle envoie enquêter à côté, avec
la conviction d'avoir trouvé. Le contrôle qui tranche tient en une commande : **rejouer la suite
suspecte sur `origin/main` dans un worktree séparé** (`git worktree add`, `PASSIO_PORT=8099` pour
ne pas percuter le serveur du port 8080). Si elle y rougit aussi, le lot est hors de cause et il
faut chercher ailleurs.

⚠️ **ET LA COMPOSITION D'UN SHARD N'EST PAS STABLE ENTRE DEUX COMMITS** : Playwright répartit des
CAS, pas des fichiers. Ajouter des tests — le lot en ajoute, la fusion de `main` en apporte deux
suites de plus — **décale tout le découpage** : le « shard 4/6 » d'avant et celui d'après ne
contiennent pas les mêmes tests. Comparer « le shard 4 était vert, il est rouge » n'a donc aucun
sens sans regarder ce qu'il contient. Rejouer `--shard=4/6` en local ne rejoue le même ensemble
que si le nombre total de cas est identique.

⚠️ **POINT OUVERT, ET IL EST DÉLIBÉRÉMENT LAISSÉ** : le moteur IA local (`aiGenerateResponse`,
app-06) ne sait nommer que 19 passions dans sa branche « 🎯 Passions trouvées », et ses cartes sont
cliquables — donc c'est une surface de découverte, bornée au socle, en comparaison littérale sans
alias ni accents. Ce n'est **pas** un blocage (c'est le repli de l'Edge Function Claude, qui répond
en temps normal) ; c'est le prochain de la famille.

## 🔤 ALIAS À LA CRÉATION D'UNE PASSION (2026-09-10)

Trouvé en VÉRIFIANT un autre lot, pas par un rapport : après le rattrapage des alias (3 674, plus une seule des 2 088 passions curées sans alias), la base rendait encore **six lignes à zéro** — exactement l'écart entre la base (2 094) et le dépôt (2 088), c'est-à-dire les passions **créées depuis l'application**. `creer_passion` écrivait `aliases = '{}'` EN DUR. « GRS » existe depuis le 2026-09-09 et reste introuvable en tapant « gymnastique rythmique ». **Inégalité structurelle** : une passion curée a deux ou trois portes d'entrée, une passion créée n'en a qu'une — alors que son auteur est justement celui qui sait comment on la nomme autrement.
⚠️ **LE LIBELLÉ SEUL DÉCIDE DU DOUBLON, UN ALIAS N'A JAMAIS CE POUVOIR.** Créer « Course nocturne » avec l'alias « running » n'en fait pas un doublon de Running — l'alias y est plus général. Un alias qui percute l'existant est **ÉCARTÉ, jamais un motif de refus** (le banc mesure les deux sens : l'alias part, la passion est créée quand même).
⚠️ **ÉCARTÉ, MAIS PAS EN SILENCE** : un alias qui est le LIBELLÉ d'une autre passion fait remonter DEUX entrées pour le même mot, et `rechercher_passions` départage alors sur un critère que personne n'a choisi — l'erreur que `valider-referentiel-passions.js` refuse dans le dépôt et que la base ne refusait **nulle part**. `creer_passion` RETOURNE donc les alias RETENUS, et le client remonte `aliasRetenus` : ce que le serveur a gardé, jamais ce qu'on a demandé.
⚠️ **UNE SURCHARGE, PAS UN REMPLACEMENT.** Un troisième paramètre `default null` sur la même fonction rendrait tout appel à DEUX arguments **AMBIGU** (« function is not unique ») — et un appel ambigu, côté PostgREST, se lit comme « la fonction n'existe pas », donc comme un repli sur la demande non publiable. `creer_passion(text,text)` survit en déléguant à `creer_passion(text,text,text[])`. ⚠️ Le changement de type de retour impose un `DROP`, qui **efface les grants des DEUX signatures** : les `revoke`/`grant` sont rejoués pour chacune, et **nommément pour `anon`** (les privilèges par défaut de Supabase les redonnent par un grant NOMINATIF qu'un `revoke ... from public` laisse entier).
⚠️ **DÉPLOYABLE AVANT SA MIGRATION, et c'est mesuré** (verrou ⑮) : `creerPassion` n'ajoute `p_aliases` **que si des alias ont été saisis** — sans saisie, la charge utile est identique à l'octet près. Sinon une base à deux arguments répondrait `PGRST202`, que `creerPassion` traite comme un **verrouillage DÉFINITIF de la création pour toute la session**.
⚠️ **`rendrePied` POSE `innerHTML` À CHAQUE FRAPPE** : le champ d'alias garde sa valeur sur l'INSTANCE (`this.alias`), l'écoute est **déléguée** (elle survit au remplacement du nœud) et ne déclenche aucun re-rendu — même famille que le cache `_lastHtml` de `renderProfileStrip`. Le champ n'apparaît **que si la création est possible** : sous le chemin de demande les alias ne seraient transmis à personne, et un champ qui ne sert à rien est un mensonge d'interface.
Rattrapage des passions déjà créées : `npm run passions:moderation alias --id … --ajouter "a,b"` (canal ② d'ADR-012). ⚠️ Il **REFUSE** un alias qui percute, là où le serveur l'écarte — ici il y a un humain devant. ⚠️ Réservé aux `user_suggested` : les alias des entrées curées vivent dans `data/passions/` et une retouche en base serait **écrasée au prochain delta**.
Verrous : `scripts/verifier-migration-creation-passion.sh` (70 contrôles, gate CI — dont ⑥ quater) et `tests/e2e/creation-passion.spec.js` (18, dont ⑭–⑱). ⚠️ Le contrôle de retour arrière du banc ne supprimait **qu'une** des deux signatures : il annonçait « exécuté » en laissant la fonction vivante sous l'autre forme. Détail et points ouverts (4 résidus de test `active` en prod) : `docs/lots-ui/24-ALIAS-A-LA-CREATION-2026-09-10.md`.
