# Audit de stabilisation avant commercialisation — synthèse (2026-11-10)

> Référence : `main` = production = `4e1d8ed1` (PR #820). Mené le 2026-11-10 de 16:00 à 18:30 UTC par une session
> Claude Code locale (coordinateur) et huit sous-agents spécialisés en lecture seule. Modèle : `claude-fable-5-2`
> (déclaré par le harnais pour la session ; **lu dans les traces d'exécution** des sous-agents).
> La mission n'est PAS terminée : voir `08-POINT-DE-REPRISE.md`.

## 1. Verdict

**NON PRÊT** pour une commercialisation. Ce n'est pas un jugement sur la qualité du socle — il est sérieux — mais le
constat que des conditions écrites dans le mandat ne sont pas remplies aujourd'hui :

| Condition | État |
|---|---|
| Aucun P0 ou P1 ouvert | **non** — un P0 corrigé en PR mais ni fusionné ni déployé (CLI-01, #823) ; cinq P1 ouverts (PIL-01, ETAT-01, ETAT-02, ETAT-03, STAB-04) |
| Parcours essentiels vérifiés | **en partie** — inscription jamais jouée sur WebKit ni avec un vrai e-mail ; récupération de mot de passe sans aucun test |
| Autorisation et isolation démontrées | **en partie** — frontière anonyme mesurée en production ; rôles réels : un seul test en production, le reste sur le staging |
| Corrections relues, contrôles verts | **en partie** — trois PR testées, auto-relues ; contre-revue indépendante **non faite** |
| Build vérifié | **oui** — reproductible à l'octet, page minifiée comprise |
| Récupération éprouvée | **en partie** — restauration éprouvée sur le staging (21/10) ; retour arrière non rejoué depuis le 14/09 ; déchiffrement des archives jamais éprouvé |
| Observabilité exploitable | **en partie** — elle a permis de trouver deux défauts en une heure ; mais une panne totale se voit en 5,7 h de médiane |
| Risques et inconnues exposés | **oui** — `06-RISQUES-RESIDUELS.md` |

## 2. Périmètre, versions, environnements, charge

- **Version** : `4e1d8ed1`, buildId `3d8e98bb12ad`, vérifiée servie par la production à 16:11 et 17:31 UTC.
- **Environnements** : production en LECTURE SEULE (canal ① d'ADR-012, et `GET` anonymes) ; poste local (Chromium, moteur WebKit) ;
  staging et rôles réels par la CI seulement. Aucune écriture en production, aucune migration, aucune fusion.
- **Charge** : **aucune n'a été évaluée par mesure.** La production compte 14 comptes et 1 connexion sur 7 jours. Par calcul
  (hypothèses au rapport PERF) : 100 inscrits / 20 simultanés tient largement ; 1 000 / 100 tient avec deux réserves ;
  **10 000 / 500 ne tient pas en l'état**.

## 3. Ce qui a été corrigé

| PR | Finding | État exact |
|---|---|---|
| **#823** | **CLI-01 (P0)** — profil visité : une valeur reçue écrite sans échappement dans un attribut. Reproduit sur serveur simulé (un toucher exécute le script), corrigé, 3 verrous rouges avant / verts après, 343 tests voisins verts. Production : aucune ligne de la forme en cause. | proposée, testée, auto-relue ; CI verte à 18:18 UTC (un lot encore en cours) ; **ni contre-revue, ni fusion, ni déploiement** |
| **#822** | STAB-01 (P3) — chargeur des 9 scripts : un `load` rejoué levait 9 erreurs par page (vu en production le 10/11). | proposée, testée (Chromium, WebKit, artefact), auto-relue ; CI verte **sauf « Gouvernance critique », rouge par conception** : contre-revue de PASSIO74 requise |
| **#824** | STAB-02, STAB-08, STAB-11 (P3–P4) — couverture détachée, titre « MVP Beta », captures versionnées. | proposée, testée, auto-relue ; CI en cours à 18:18 UTC |

## 4. Blocages et risques résiduels (les cinq premiers)

1. **#823 à fusionner et déployer** — et la base à durcir derrière (migration à préparer).
2. **Le pilotage à un seul facteur sur l'origine publique** (PIL-01) : un script exécuté chez le propriétaire le commande.
3. **Trois défauts de fiabilité du compte** (ETAT-01, 02, 03) : perte silencieuse entre appareils, session tuée à distance sans
   que l'application le voie, « Profil mis à jour » sans écriture — dont le passage en compte privé.
4. **Deux états de la production à trancher** : tout compte neuf naît privé (9 profils sur 13 ; un visiteur voit 1 publication
   réelle) ; 35 publications sur 37 masquées depuis le 04/11 par une écriture directe, sans trace.
5. **Capacité non mesurée**, retour arrière et déchiffrement des archives non éprouvés.

## 5. Vérifications non réalisées

Suite complète sur la réplique exacte de la production ; rôles réels en production au-delà d'un test ; égalité staging ↔
production ; charge ; appareils réels ; délivrabilité ; restauration et retour arrière récents ; consoles (quotas, facturation,
réglages Auth) ; validation juridique ; contre-revue indépendante par Codex ou ChatGPT. Raisons : `06-RISQUES-RESIDUELS.md` § 3.

## 6. Ce qui tient (et qu'il ne faut pas casser)

RLS sur les 54 tables ; messages, notifications, état privé fermés à l'anonyme (mesuré) ; colonnes de propriété figées par
déclencheur ; adresse et contact des activités hors de tout droit de lecture ; Storage cloisonné ; publication temps réel vide ;
aucune base64 en base ; aucun secret dans l'historique ; aucune chaîne d'agents déclenchable par un tiers ; `main` protégée,
administrateurs compris ; 30 sauvegardes sur 30 ; build identique à l'octet entre un poste Windows et la CI ; 2 587 tests
navigateur verts ; refus d'inscription et de connexion dits en clair.

## 7. Prochaines actions, dans l'ordre

1. **Benjamin** : fusionner **#823** (sécurité) ; contre-revoir **#822** ; fusionner **#824**.
2. **Benjamin** : trancher STAB-04 (comptes privés par défaut) et STAB-05 (35 publications masquées) ; décider PIL-01.
3. Faire contre-revoir les trois PR par Codex ou ChatGPT (dossier : `.passio/reviews/2026-11-10-audit-stabilisation/`).
4. Lots à préparer, un par PR : durcissement serveur de CLI-01 ; ETAT-02 + ETAT-06 (session) ; ETAT-01 (rejeu de l'état) ;
   ETAT-03 (verdict du profil) ; « verdicts » (SRV-03, SRV-04, ETAT-04, ETAT-09, PARC-01) ; SRV-02 ; purge (SRV-05) ; CI (STAB-10).
5. Exercer : retour arrière Netlify, déchiffrement d'une archive, banc de charge sur le staging, inscription réelle sur iPhone.
6. Mettre à jour `.passio/residus/registre-residus.json` et les documents périmés listés par les rapports.

## Livrables

`01-BASELINE` · `02-CARTE-ARCHITECTURE` · `03-REGISTRE-FINDINGS` · `04-MATRICE-PARCOURS-RISQUES` · `05-VERIFICATIONS` ·
`06-RISQUES-RESIDUELS` · `08-POINT-DE-REPRISE` · `preuves/`. Rapports complets des huit agents, preuves et outils : dossier
privé hors git `.passio/reviews/2026-11-10-audit-stabilisation/` (dépôt public : pas de mode d'emploi versionné).
