# Fiche 25 — reprise de la sixième contre-revue Astra et candidat du pilote gratuit (2026-09-16)

Le dossier de livraison complet (A–G : ce qui fonctionne, ce qui est désactivé, corrections et
preuves avec SHA, blocages, procédure de mise en service, diffusion, recommandation) est
**`docs/MISE_EN_SERVICE_PILOTE.md`**. Cette fiche ne fait que le situer dans le bilan.

## Verdicts par identifiant

| Id | Verdict | Correction (commit) | Preuve principale | Limite dite |
|---|---|---|---|---|
| ASTRA-56 | **confirmé** (rejoué : vraies fonctions + modèle des transitions v2) | barrière **v3** : tentative vivante non reprenable, jamais purgee → echec, `auth_echec`, handler = état écrit, client honnête (`88ae43c1`) | [PG] 88/88 § ⑤ bis · [simu] 7/7 entrelacement · [nav] 9/9 | GoTrue réel non joué (RES-04) |
| ASTRA-57 | **confirmé** (PostgREST rend 200 sans compte) | `paginerProprietaires` : limit/offset/order + count=exact, total vérifié, page vide, non-progression (`7365800c`) | [simu] 9/9, 2 501 objets sous plafond 1 000 | plafond réel non mesuré (RES-17) |
| ASTRA-58 | **confirmé** | NUL explicite écrit et comparé ; `{}`/null/champ absent = inconnu → refus | [simu] vraies phases 13/13, verdicts 30/30 | cycle réel non joué (RES-14) |
| ASTRA-59 | **confirmé** (reproduit : cible AAA → BAD) | `validerArchive` avant toute mutation ; phase médias ne dépose rien hors index | [simu] cible intacte | idem |
| ASTRA-61 | **confirmé** | APPROVED seul, relecteur ≠ auteur, liste autorisée, fournisseur fictif refusé (`9ec69134`) | 17/17 | liste vide : RES-15 |
| ASTRA-62 | **confirmé** (trois variantes passaient) | casse, `__proto__`/doublons, échappements bornés, déclencheur inconnu, `inherit` (`b7a2d4da`) | 12/12 ; workflows réels relus | ce que GitHub exécute au-delà du texte reste nommé, pas certifié |
| ASTRA-63 | **confirmé** | syntaxes bornées (statique) + catalogue de la base construite (`b7a2d4da`) | [PG] 18/18 | table hors dépôt : vue **seulement** par le contrôle catalogue sur la cible |
| ASTRA-64 | **confirmé** | retenue mécanique dans `edge-functions.yml` + `X-Passio-Revision` (`68103b91`) | [PG] 18/18 ; YAML lu par la gate | dépend du secret `SUPABASE_ACCESS_TOKEN` de la CI |
| ASTRA-60 | **ouvert** → **désactivé pour le pilote** (`27e01724`) | tous les points d'entrée, client et serveur | [nav] 21/21 | RES-13 |
| Mentions ON CONFLICT | observation **vérifiée** sur PostgreSQL | conflit gardé par destinataire + `n_m_` réservé (`f897e133`) | [PG] 37/37 | — |

## État de référence revérifié à l'ouverture (16/09, ~07:40Z)

`main` = `a5e8c717` (inchangé) ; #469–#476 ouvertes, non fusionnées ; #476 = `26ffb00f` ; code
combiné `055efdef` ; site servi = `a5e8c717` (`release.json`, lecture publique) ; Edge Functions
servies **sans en-tête de révision** (version non vérifiable) ; migrations appliquées : **non mesuré**
(aucun accès en lecture à la base depuis cette session).

## Ce qui n'a pas été fait

Aucune fusion, aucune migration, aucun déploiement, aucun test de charge, aucune donnée réelle
touchée, aucun message envoyé. Le cycle réel de sauvegarde/restauration et la mesure en base de la
cible attendent respectivement un projet jetable et le connecteur en lecture seule.
