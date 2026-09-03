# LOT_FLAT_PASSIONS_2026 09 01

> Extrait de `CLAUDE.md` le 2026-09-02 pour alléger le contexte rechargé à chaque
> session. Cette page est la référence de DÉTAIL ; `CLAUDE.md` n'en garde que
> l'invariant actionnable et un pointeur vers ici. Rien n'a été retiré : le contenu
> ci-dessous est celui d'origine, à l'octet près.

  **Lot flat_passions_v1 — LE RÉFÉRENTIEL DES PASSIONS EST PLAT (2026-09-01), ACTIF PAR DÉFAUT.**
  `docs/PASSIONS_REFERENTIEL_PLAT_2026-09-01.md`. Le drapeau ne sait plus
  qu'ENLEVER (patron UI-3A / UI-4) : coupures `localStorage.flat_passions_v1="0"`
  et `window.PASSIO_FLAT_PASSIONS=false`, prioritaires sur tout ; les anciens
  liens `?passio_preview=flat-passions-v1` restent tolérés sans plus rien
  décider, et `apercuDemande()`/`PREVIEW_NAME` ont été RETIRÉS plutôt que
  laissés sans lecteur.
  ⚠️ **L'ORDRE N'ÉTAIT PAS NÉGOCIABLE : migration D'ABORD, drapeau ENSUITE.**
  Allumer avant aurait ouvert une recherche promettant 1 889 passions que la clé
  étrangère de `posts.passion_id` aurait refusées à la publication. Il REMPLACE le
  catalogue hiérarchique Univers → Passion → Sous-passion (PR #231, fermée),
  dont il reprend et APLATIT les données.
  **Tout est directement une PASSION** : « Enduro » est au même rang que « Moto »,
  et on la choisit sans jamais passer par elle. 1 908 passions · 1 578 alias ·
  3 830 relations INVISIBLES. Source `data/passions/*.js` ; `data/passions-v1.json`
  et `migrations/migration_passions_plat.sql` en sont des MIROIRS GÉNÉRÉS, dont la
  CI vérifie qu'ils n'ont pas divergé (`npm run passions:verifier`).
  Implémentation : `js/passions-flat.js` (moteur), `js/passion-selector.js`
  (`PassionSearchSelector`, le composant unique des 7 surfaces),
  `js/passions-flat-ui.js` (la colle). Tests : `tests/e2e/passions-plates.spec.js` (31)
  et `scripts/verifier-migration-passions.sh` (migration EXÉCUTÉE sur PostgreSQL).
  ⚠️ **Six pièges de ce lot.** ① **Le référentiel ne doit JAMAIS entrer dans le
  bundle** : `scripts/build.js` inline TOUT `<script src="js/…">`, donc un
  référentiel en JS finirait dans le monolithe, sur le chemin critique du
  démarrage. C'est un JSON, chargé au premier usage réel de la recherche, et
  copié dans `dist/` par le build lui-même (pas par le workflow — un asset qui
  n'existe qu'en CI est un asset qu'on découvre manquant en production). ② **Deux
  pliages, et c'est voulu** : `norme()` sert à CHERCHER (elle jette la
  ponctuation, donc « C », « C++ » et « C# » s'y confondent — ce qu'on veut),
  `normeIdentite()` sert à l'UNICITÉ (elle garde `+`, `#`, `&`, sinon elle
  refuserait « C++ » à côté de « C# »). Les trois pliages — navigateur,
  générateur, base — doivent rester identiques, sinon « moto cross » trouve
  « Motocross » d'un côté et pas de l'autre. ③ **Un `grant … to anon,
  authenticated` inconditionnel rend une migration intestable** : ces rôles sont
  fournis par la plateforme Supabase et n'existent pas sur un PostgreSQL nu, donc
  le `grant` fait échouer TOUTE la migration (une seule transaction). ④
  **`unaccent()` n'est pas IMMUTABLE**, donc pas indexable, et l'extension n'est
  pas garantie : `normalized_label` est calculé par le générateur et STOCKÉ, et
  `unaccent_immutable()` doit être définie EN TÊTE de la migration. ⑤ **Le bouton
  qui affiche la frappe porte un `data-tel` explicite** : `telemetry.js` retombe
  sinon sur `textContent.slice(0, 40)` et emporterait la recherche libre de la
  personne. ⑥ **`[hidden]` est une règle du NAVIGATEUR** : un `display` posé sur
  une classe la bat en spécificité — la croix « effacer » s'affichait sur un champ
  vide, mesurée en 320 px.
  ⚠️ **LA PORTE D'AJOUT EST SUR LE PROFIL, ET ELLE EST PLAFONNÉE (2026-09-01).**
  Demandes de Benjamin après essai réel de la preview : « la bulle de rajout de
  passion doit être sur le profil, pas dans le fil » puis « rajoute un mode
  payant, 3 gratuits le reste payant, pour l'instant tu bloques et tu mets une
  fenêtre qui annonce que ça sera payant », enfin « ne mets pas de valeur, tu
  mets juste que ça va être payant mais pas de tarif pour l'instant ».
  ① Le rail du Fil est une commande de **lecture** : plus aucune bulle « + ».
  `ouvrirRecherchePassionsFil` et `PassioFlatUI.ouvrirPassionsDuFil` sont
  **retirées** — sans appelant, et fausses sous le plafond (elles appelaient
  `ajouterPassionAuCompte` par passion cochée, donc au plafond elles auraient
  coché dans `_activeFeedPassions` des passions que le compte ne possède pas).
  ⚠️ **MISE À JOUR DU 2026-09-03 — la même règle a été appliquée au rail du
  PROFIL.** « Enlever la bulle + sur le profil passion et le mettre dans gérer
  mes passions » : les DEUX rails sont désormais des commandes de lecture pure,
  et la porte d'acquisition vit dans `#passionManager`. `ouvrirRecherchePassionsCompte`
  a été retirée à son tour, pour la même raison que sa jumelle du Fil ; la porte
  du panneau appelle `openCreateProfile`, qui garde le plafond ET survit à la
  coupure `flat_passions_v1="0"`. Détail et pièges : `docs/lots-ui/18-GERER-MES-PASSIONS-2026-09-03.md`.
  ② `PASSIONS_OFFERTES = 3` (app-06) + `openPassionPaywall()`. **AUCUN MONTANT
  N'EST AFFICHÉ**, aucun bouton « Payer » (le paiement n'est pas ouvert : un
  bouton qui ne mène nulle part est un clic mort). ⚠️ **Ce n'est pas un retour
  de l'économie retirée par ADR-009** : l'ADR interdit une monnaie
  INTERMÉDIAIRE et prévoit explicitement un paiement DIRECT en monnaie réelle —
  c'est exactement ce cas. ⚠️ Le plafond vit sous `flat_passions_v1`, coupé par
  défaut : aucun compte de production n'est limité aujourd'hui. ⚠️ **On compte
  les passions VIVANTES**, écart assumé avec « archiver ne libère pas
  d'emplacement » (UI-8) — sinon un compte au plafond n'aurait aucune sortie ;
  le plafond se lit « trois **à la fois** ». ⚠️ **La porte dérobée ④ d'UI-8
  n'est pas rouverte** : restaurer une archive reste GRATUIT sous trois
  vivantes, et n'est barré que si ce serait la quatrième. ⚠️ Gardé aux **deux**
  bouts — portes (`openCreateProfile`, `ouvrirAjoutPassions`, le `max` du
  sélecteur) ET points d'écriture (`ajouterPassionAuCompte`,
  `restaurerPassion`) : mesuré, neutraliser l'un laisse l'autre vert.
  ⚠️ `ouvrirGestionPassions` (nommée `ouvrirGestionPassionsDepuisPaywall` jusqu'au
  2026-09-03) change d'écran AVANT d'ouvrir `#passionManager`, qui vit dans
  `#screen-profiles` — déplié depuis le Fil il serait invisible.
  ⚠️ **Le paywall ne l'offre plus quand le panneau est DÉJÀ ouvert** (2026-09-03,
  `_paywallCacheGerer`) : depuis que la porte d'ajout vit DANS ce panneau, le
  chemin le plus fréquent au plafond y commence, et le bouton y renvoyait — la
  boucle « mur → panneau → mur » que l'invariant du quota épuisé fermait déjà.
  ⚠️ **LA MIGRATION EST APPLIQUÉE EN PRODUCTION depuis le 2026-09-01**, vérifiée
  par Benjamin depuis la CLI Supabase liée : **1 908 passions actives · 3 830
  relations · 19 identifiants historiques · 0 publication orpheline**. Les 1 908
  sont donc publiables. Mode d'emploi et retour arrière :
  `docs/APPLIQUER_MIGRATION_PASSIONS.md`.
  ⚠️ `estPassionCanonique` reste la SEULE autorité de publication, et le Studio
  refuse toujours AVANT l'insert un identifiant qu'elle ne reconnaît pas —
  plutôt qu'un post visible chez son auteur, jamais arrivé au serveur. Ce
  mécanisme n'a pas disparu avec la migration : c'est lui qui protège des
  identifiants inventés et des référentiels serveur tronqués.
  ⚠️ **Corollaire de test payé le jour même** : le test ⑮ s'appuyait sur
  « moto-enduro », absente du serveur avant la migration. Il exerce désormais le
  MÉCANISME en neutralisant `estPassionCanonique`, au lieu de compter sur un trou
  du référentiel — **un test qui dépend d'un état de la base se retourne le jour
  où la base change.**
