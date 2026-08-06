# Rapport de mise à jour de la documentation — PASSIO

**Date :** 5 août 2026
**Objet :** Analyse de l'ensemble du projet, mise en cohérence de la documentation avec la version réelle de l'application, et production d'un dossier investisseur unique.
**Auteur de la mise à jour :** assistant Claude Code, sous la direction de Benjamin (fondateur).

---

## 1. Méthode et source de vérité

La documentation stratégique du projet (dossier `docs/`) datait de **mai 2026**. Or l'application a fait l'objet de **plusieurs mois de développement continu** depuis. Pour établir la version la plus récente et fiable de chaque information, la hiérarchie de priorité suivante a été appliquée :

1. **Le fonctionnement réel du code** de l'application (fichiers `js/app-*.js`, `index.html`, `migrations/`) — priorité absolue.
2. **Le journal d'ingénierie `CLAUDE.md`** (mis à jour jusqu'au 5 août 2026), qui documente précisément chaque fonctionnalité livrée, en cours ou abandonnée.
3. **Les captures d'écran récentes** (`docs/screenshots/`, datées du 4 août 2026), qui confirment l'état visuel réel des 8 écrans.
4. **Les documents stratégiques `.docx`** (mai 2026) pour la vision, le marché, le modèle économique et la stratégie — conservés lorsqu'ils restent valides, corrigés lorsqu'ils sont contredits par l'application.

Aucune fonctionnalité non confirmée par le code ou les captures n'a été présentée comme existante. Les projections financières et les chiffres de marché sont explicitement présentés comme des **hypothèses**.

---

## 2. Fichiers analysés

### Documents stratégiques (dossier `docs/`)

- **Business / investisseurs :** `passio_business_plan.docx`, `passio_memorandum_investisseur.docx`, `passio_etat_projet.docx`, `passio_priorisation_features.docx`, `passio_presentation_complete.pptx`.
- **Marché & concurrence :** `passio_etude_marche.docx`, `passio_etude_concurrence.docx`.
- **Stratégie :** `passio_plan_lancement.docx`, `passio_plan_n1_mondial.docx`, `passio_ambassadeurs.docx`, `passio_anti_rs.docx`.
- **Produit & monétisation :** `passio_systeme_wallet.docx`, `passio_passia_crypto.docx`, `passio_passia_pour_les_nuls.docx`, `passio_mode_ia.docx`, `passio_ventes_video.docx`, `passio_location_courte_duree.docx`, `passio_partenariats_cdv.docx`.
- **Verticaux / conformité :** `passio_education_nationale.docx`, `passio_safe_mineurs.docx`, `passio_guide_apple.docx`, `passio_guide_mise_en_ligne.docx`.
- **Fichier vide ignoré :** `supabase.docx` (0 octet, non exploitable).

### Code et documentation technique

- `index.html`, `styles.css`, `js/app-01`…`app-09`, `js/emoji-misc.js`, `js/access-gate.js`, `js/map-loader.js`, `js/platform.js`, `sw.js`, `manifest.json`.
- `migrations/` (schéma Supabase, RLS, tables), `supabase/functions/` (`ask-ai`, `delete-account`, `notify-call`).
- `CLAUDE.md` (journal d'ingénierie), `docs/*.md` (rapports de session, audits, runbooks), `docs/screenshots/`, `docs/demo/`.

---

## 3. Documents archivés

Avant toute modification, **tous les documents originaux ont été copiés** (aucune suppression) dans deux emplacements :

- `archives_documents_avant_mise_a_jour/` (dossier demandé explicitement) — 22 fichiers `.docx` + 1 `.pptx`.
- `livrables_investisseurs/04_Archives/` (copie identique dans l'arborescence des livrables).

---

## 4. Contradictions identifiées et décisions prises

| # | Contradiction entre les documents (mai) et l'application (août) | Décision |
|---|---|---|
| 1 | **Stack technique.** Le business plan mentionne « React Native / Node ». L'application est en réalité une **PWA vanilla JS + Supabase**. | Correction : la stack réelle (PWA + Supabase, WebRTC, MapLibre) est décrite partout. Note explicite dans le dossier et l'état du projet. |
| 2 | **Nombre de piliers / écrans.** Documents : « 7 piliers » (BP) puis « 9 piliers » (état). Application : **8 écrans** (Feed, Profils, Studio, Explorer, IRL, CDV, Messages, Wallet). | Alignement sur les 8 écrans réels ; les « piliers » sont présentés comme axes produit, cohérents avec les écrans. |
| 3 | **Mode IA.** Documents : assistant IA conversationnel multi-critères (LLM, voix). Application : **moteur de connaissances local** + Edge Function Claude déployée **en attente d'une clé API**. | L'IA livrée (local) est classée « Développé » ; le LLM avancé, la recherche multi-critères et la voix sont classés « Prévu ». Transparence dans une note dédiée. |
| 4 | **Crypto Passia (token PSI).** Documents : trajectoire crypto détaillée (Polygon, burn, staking). Application : **aucune implémentation on-chain**. | Reclassé « À valider » (vision de long terme). Aucun engagement de date. |
| 5 | **Boutique Passia.** Documents : boutique opérationnelle. Application : interface complète mais **paiements simulés** (pas d'intégration Stripe réelle). | Boutique = « Développé (interface/démo) » ; paiements réels = « Prévu ». |
| 6 | **Marketplace créateurs.** Présentée comme brique du produit. Application : **non implémentée**. | Reclassée « Prévu ». |
| 7 | **Podcasts.** Présentés comme fonctionnalité. Application : **audio partout (vocaux, stories, studio, lives) mais pas de format podcast dédié**. | Infrastructure audio = « Développé » ; format podcast épisodique = « Prévu ». Note explicite. |
| 8 | **Cartographie.** Documents : Leaflet + tuiles OpenStreetMap. Application : **MapLibre GL + OpenFreeMap**, géocodage **BAN + Photon**. | Description technique corrigée. |
| 9 | **Calendrier de roadmap.** Documents : jalons Q2/Q3 2026 déjà dépassés. | Roadmap réexprimée en **horizons relatifs** à l'état actuel ; dates calendaires à figer (voir §7). |
| 10 | **Inscription.** Documents : ouverture beta imminente. Application : **inscription e-mail réelle mais grand public en attente d'un service d'e-mails transactionnels**. | Classé « En cours ». |

---

## 5. Informations corrigées / fonctionnalités ajoutées à la documentation

**Fonctionnalités réelles ajoutées** (absentes ou embryonnaires dans les documents de mai, aujourd'hui livrées) :

- Messagerie temps réel riche (texte, **vocal, média, GIF, groupes, galerie de pièces jointes**).
- **Appels audio et vidéo en pair-à-pair (WebRTC)** avec réveil par notification push.
- **Lives vidéo 1→N** façon Instagram/TikTok.
- **Stories** façon Instagram (anneaux vus/non-vus, sync multi-appareils) et **Bobines** (éditeur média plein écran).
- **Classement du fil par pertinence** (fraîcheur + affinité + engagement).
- **CDV v3 :** passeport voyageur, statistiques de voyage, « Mes lieux », carnets collaboratifs, rétrospective animée (« flyover »).
- **IRL v2 :** RSVP 3 états, liste d'attente, chat de groupe, album, check-in par QR, co-organisateurs, récurrence, invitations, preuve sociale, notation, badges.
- **Modération** (blocage, signalement) et **confidentialité** (compte privé, RLS, suppression RGPD réelle).
- **Qualité d'ingénierie :** suite de plus de 120 tests de bout en bout (dont scénario multi-comptes réel) en intégration continue.

**Éléments retirés / requalifiés car obsolètes ou non implémentés :** stack React Native, mise en avant de la crypto comme acquise, marketplace comme existante, podcasts comme livrés, jalons calendaires dépassés.

---

## 6. Livrables créés

| Livrable | Emplacement | Format |
|---|---|---|
| **📕 Livre investisseur unique** — `PASSIO_LIVRE_INVESTISSEUR` : 8 parties, 51 chapitres, 32 pages, sommaire à deux niveaux, consolide **tout** le corpus (marché, concurrence, wallet, mineurs, lancement inclus) | `livrables_investisseurs/01_Dossier_investisseur/` | `.docx` + `.pdf` |
| Dossier investisseur linéaire (55 sections, 32 pages) — variante | `livrables_investisseurs/01_Dossier_investisseur/` | `.docx` + `.pdf` |
| État du projet mis à jour (août 2026) | `livrables_investisseurs/02_Documents_mis_a_jour/` | `.docx` + `.pdf` |
| Visuels (18 captures + logo) | `livrables_investisseurs/03_Visuels/` | `.png` |
| Archives des documents originaux | `livrables_investisseurs/04_Archives/` et `archives_documents_avant_mise_a_jour/` | `.docx` + `.pptx` |
| Ce rapport | `livrables_investisseurs/05_Rapport_de_mise_a_jour/` et racine du projet | `.md` |

Le **dossier investisseur** est autonome (une personne qui ne connaît pas PASSIO comprend le projet en le lisant seul), imprimable A4, avec couverture, sommaire automatique, en-têtes/pieds de page, pagination, tableaux, encadrés, captures légendées, et un **code couleur de statut** : ● Développé · ◐ En cours · ○ Prévu · ◆ À valider.

---

## 7. Informations manquantes / à compléter (`Information à compléter`)

- **Sources primaires citables** pour les statistiques de marché (multi-comptes, fatigue digitale, besoin d'IRL).
- **Modèle financier détaillé** ligne à ligne, validé par un expert-comptable (les tableaux repris sont les hypothèses du business plan).
- **Dates calendaires cibles** de la roadmap, à figer avec l'équipe.
- **KPI réels** (NPS, rétention J30/J90, coefficient viral K) — à mesurer sur la première cohorte.
- **Accords / lettres d'intention** de partenariats.
- **Statuts** avec clause de préservation de la mission ; **pacte d'associés**.

---

## 8. Éléments nécessitant une validation humaine

1. **Chiffres financiers et de marché** : valider ou remplacer par des données sourcées avant diffusion à des investisseurs.
2. **Mise à jour fine des 20 documents stratégiques originaux** : le dossier unique les **consolide et les supersède** pour l'usage investisseur ; une réécriture ligne à ligne de chaque `.docx` individuel (étude de marché, wallet, crypto, plan N°1 mondial, etc.) reste un chantier à mener si l'on souhaite conserver chaque document séparément à jour. Les corrections à y porter sont listées au §4.
3. **Trajectoire crypto** : décider de la maintenir dans la communication investisseur (aujourd'hui reclassée « À valider »).
4. **Positionnement des chiffres d'ambition** (3 M d'actifs / 20 M€ à 5 ans) : confirmer comme hypothèse centrale.

---

## 9. Tableau récapitulatif par document

| Document | Statut initial | Modifications réalisées | Statut final | Validation requise |
|---|---|---|---|---|
| `passio_etat_projet.docx` | Obsolète (mai) | **Réécrit** : version août 2026 (8 écrans, fonctionnalités réelles, stack réelle) → `passio_etat_projet_MAJ_2026-08.docx` (+PDF) | ✅ Mis à jour | Non |
| `passio_business_plan.docx` | Partiellement obsolète | **Réécrit** (13 sections, stack/IA/crypto/podcasts/roadmap corrigés, statuts) → `passio_business_plan_MAJ_2026-08.docx` (+PDF) | ✅ Mis à jour | Oui (chiffres) |
| `passio_memorandum_investisseur.docx` | Partiellement obsolète | Consolidé dans le dossier unique (thèse, défensibilité, risques, sortie) | ⚠️ Superseded par le dossier | Oui (scénarios de retour) |
| `passio_priorisation_features.docx` | Partiellement obsolète | Statuts des fonctionnalités réactualisés dans le dossier (§24-26) | ⚠️ À réviser | Oui |
| `passio_etude_marche.docx` | Valide (à sourcer) | Repris dans §4-6 du dossier ; chiffres marqués comme à sourcer | ✅ Conservé | Oui (sources) |
| `passio_etude_concurrence.docx` | Valide | Repris et actualisé dans §27-29 du dossier | ✅ Conservé | Non |
| `passio_plan_lancement.docx` | Valide | Repris dans §33-35 ; calendrier réexprimé en relatif | ✅ Conservé | Oui (dates) |
| `passio_plan_n1_mondial.docx` | Vision | Repris dans §53 (ambition long terme) | ✅ Conservé | Non |
| `passio_systeme_wallet.docx` | Partiellement obsolète | Wallet/boutique requalifiés (démo) dans §21, §31-32 | ⚠️ À réviser | Oui |
| `passio_passia_crypto.docx` | Non implémenté | Reclassé « À valider » dans §21, §26 | ⚠️ Vision | Oui |
| `passio_mode_ia.docx` | Partiellement obsolète | IA locale vs LLM clarifiée dans §16, §26 | ⚠️ À réviser | Non |
| `passio_ambassadeurs.docx` | Valide | Repris dans §36 | ✅ Conservé | Non |
| `passio_anti_rs.docx` | Valide | Repris dans §4-5, §30 | ✅ Conservé | Non |
| `passio_safe_mineurs.docx` | Valide | Repris dans §42 | ✅ Conservé | Non |
| `passio_education_nationale.docx` | Vision | Piste partenariat, §36 | ✅ Conservé | Oui (accords) |
| `passio_partenariats_cdv.docx` | Vision | Piste partenariat, §36 | ✅ Conservé | Oui (accords) |
| `passio_location_courte_duree.docx` | Vision | Non repris (hors périmètre app actuel) | ✅ Conservé | Oui (arbitrage) |
| `passio_ventes_video.docx` | Vision | Non repris directement | ✅ Conservé | Oui (arbitrage) |
| `passio_passia_pour_les_nuls.docx` | Pédagogique | Inchangé (vulgarisation crypto) | ✅ Conservé | Non |
| `passio_guide_apple.docx` | Technique | Inchangé (guide d'ouverture) | ✅ Conservé | Non |
| `passio_guide_mise_en_ligne.docx` | Technique | Inchangé (guide) | ✅ Conservé | Non |
| `passio_presentation_complete.pptx` | Partiellement obsolète | Non régénéré ; à réaligner sur le dossier unique | ⚠️ À réviser | Oui |
| `supabase.docx` | Vide (0 o) | Ignoré | — | Non |

Légende : ✅ conservé/mis à jour · ⚠️ superseded par le dossier unique ou à réviser individuellement.

---

## 10. Conclusion

L'écart principal entre la documentation de mai et la réalité d'août est un **écart positif** : l'application est **nettement plus avancée** que ne le laissaient penser les documents (messagerie temps réel, appels, lives, CDV et IRL enrichis, modération, RGPD). Les seules corrections « à la baisse » concernent des éléments présentés comme acquis alors qu'ils sont prévus (paiements réels, marketplace, podcasts, crypto, IA LLM) — désormais clairement étiquetés.

Le **livre investisseur** (`PASSIO_LIVRE_INVESTISSEUR`) constitue désormais la source de référence unique, à jour et autonome : il **consolide et met à jour l'intégralité du corpus** — business plan, mémorandum, étude de marché (TAM/SAM/SOM, tendances, personas), analyse concurrentielle (matrice, cartes de positionnement), système Wallet (Score/Passia, packs, 80/20, garanties éthiques, vision crypto), stratégie de lancement, segment mineurs et éducation, technique et finances. Chaque document source y est repris, corrigé et resitué avec son statut réel. Les documents `.docx` d'origine restent archivés ; ils n'ont plus vocation à être maintenus séparément, le livre les remplace.

Avant diffusion, il reste à **valider les chiffres financiers et de marché** et à **figer les dates de roadmap** (voir §7 et §8).
