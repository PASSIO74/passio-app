#!/usr/bin/env python3
"""Assemble le rapport 16 (relecture complémentaire du 2026-09-08) et les compteurs à jour
à partir des verdicts JSON rendus par les relecteurs (donnees/relecture-complement-2026-09-08/*.json)
et du registre du 2026-09-04 (donnees/registre-problemes.json).

    python3 outillage/gen-relecture-complement.py

Écrit : 16-RELECTURE-COMPLEMENT-2026-09-08.md et donnees/compteurs-2026-09-08.json.
Ne modifie ni le registre du 2026-09-04 ni les rapports 01 à 15.
"""
import json, glob, os, collections, datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REL = os.path.join(BASE, "donnees", "relecture-complement-2026-09-08")
registre = json.load(open(os.path.join(BASE, "donnees", "registre-problemes.json")))
par_id = {p["id"]: p for p in registre}

ORDRE = ["auth-rgpd", "exploitation-continuite", "irl", "perf-capacite-couts",
         "profils-passions", "robustesse-pannes", "tests-ci", "appareils-a11y"]
docs = {}
for f in glob.glob(os.path.join(REL, "*.json")):
    d = json.load(open(f))
    docs[d["domaine"]] = d

verdicts, oublis, controles = [], [], []
for dom in ORDRE:
    d = docs.get(dom)
    if not d:
        continue
    for v in d["verdicts"]:
        v = dict(v); v["domaine"] = dom
        p = par_id.get(v["id"], {})
        v["priorite_2026_09_04"] = p.get("priorite_retenue", "?")
        v["titre"] = p.get("titre", "")
        verdicts.append(v)
    for o in d.get("oublis", []):
        o = dict(o); o["domaine"] = dom; oublis.append(o)
    for c in d.get("controles_debloques", []):
        c = dict(c); c["domaine"] = dom; controles.append(c)

# ---- compteurs consolidés : registre du 04 + verdicts du 08 -------------------------------------
nouvelle_prio = {}
statut_relecture = {}
for v in verdicts:
    statut_relecture[v["id"]] = v["verdict"]
    if v.get("priorite_changee"):
        nouvelle_prio[v["id"]] = v["priorite_proposee"]

def prio_finale(p):
    if statut_relecture.get(p["id"]) == "RÉFUTÉ":
        return None
    if p["relecture"].startswith("RÉFUTÉ"):
        return None
    return nouvelle_prio.get(p["id"], p["priorite_retenue"])

cnt = collections.Counter()
for p in registre:
    pf = prio_finale(p)
    if pf:
        cnt[pf] += 1
cnt_oublis = collections.Counter(o.get("priorite", "?") for o in oublis)
rel = collections.Counter()
for p in registre:
    r = p["relecture"]
    if r.startswith("NON"):
        rel[statut_relecture.get(p["id"], "Non relu")] += 1
    elif r.startswith("CONF"):
        rel["CONFIRMÉ"] += 1
    elif r.startswith("RÉF"):
        rel["RÉFUTÉ"] += 1
    else:
        rel["INCERTAIN"] += 1

compteurs = {
    "date": "2026-09-08",
    "base": "registre du 2026-09-04 (192 problèmes) + verdicts de la relecture complémentaire",
    "domaines_relus": [d for d in ORDRE if d in docs],
    "domaines_manquants": [d for d in ORDRE if d not in docs],
    "problemes_relus_le_08": len(verdicts),
    "verdicts_du_08": dict(collections.Counter(v["verdict"] for v in verdicts)),
    "priorites_changees": nouvelle_prio,
    "relecture_globale": dict(rel),
    "priorites_retenues_hors_refutes": {k: cnt.get(k, 0) for k in ("P0", "P1", "P2", "P3")},
    "oublis_nouveaux": {"total": len(oublis), "par_priorite": dict(cnt_oublis)},
    "priorites_avec_oublis": {k: cnt.get(k, 0) + cnt_oublis.get(k, 0) for k in ("P0", "P1", "P2", "P3")},
}
json.dump(compteurs, open(os.path.join(BASE, "donnees", "compteurs-2026-09-08.json"), "w"),
          ensure_ascii=False, indent=1)

# ---- rapport 16 ----------------------------------------------------------------------------------
def esc(s):
    return str(s or "").replace("|", "\\|").replace("\n", " ")

L = []
L.append("""# Relecture complémentaire — les 81 problèmes jamais relus et les contrôles débloqués (2026-09-08)

> Étape 1 de la contre-revue (`15-CONTRE-REVUE-ASTRA-PROMPT.md` §0), exécutée par la session « Avancer sur le projet BILAN » (Claude Fable 5.1, `session_014R2zEeBRiyNk1STv73GrrA`) pendant l'indisponibilité de GPT-6 Astra. **SHA inchangé** : `c8cb8e995b88159a1e9d4c2f7dc196ad93a133bf` (`main` n'a reçu aucun commit depuis le 2026-09-04). Aucun code applicatif modifié, rien déployé, base en lecture seule, aucune donnée réelle touchée.
>
> Méthode : les 81 problèmes marqués « NON VÉRIFIÉ (pas de relecture) » dans le rapport 11 ont été confiés, domaine par domaine, à huit relecteurs adversariaux indépendants de l'audit initial (même modèle, contexte vierge, consigne de RÉFUTER), avec accès au code au SHA, aux preuves déposées, au connecteur Supabase en lecture seule pour trois domaines, et à un navigateur local. Chaque verdict cite `fichier:ligne`, une requête ou une commande. Les sorties brutes sont dans `donnees/relecture-complement-2026-09-08/*.json`. Ce fichier est GÉNÉRÉ par `outillage/gen-relecture-complement.py`.
>
> Réserve : c'est une relecture par Claude d'un audit fait par Claude. Elle ferme le trou de méthode (81 problèmes sans second regard), elle ne vaut pas la revue d'un modèle tiers, toujours attendue le 2026-09-14.
""")
L.append(f"Domaines relus : **{', '.join(compteurs['domaines_relus'])}**" +
         (f" — manquants : {', '.join(compteurs['domaines_manquants'])}" if compteurs['domaines_manquants'] else "") + ".\n")

L.append("## 1. Compteurs après relecture\n")
vd = compteurs["verdicts_du_08"]
L.append(f"| Problèmes relus le 08 | CONFIRMÉ | RÉFUTÉ | INCERTAIN | Priorités changées | Oublis nouveaux |\n|---|---|---|---|---|---|\n"
         f"| {len(verdicts)} | {vd.get('CONFIRMÉ',0)} | {vd.get('RÉFUTÉ',0)} | {vd.get('INCERTAIN',0)} | {len(nouvelle_prio)} | {len(oublis)} |\n")
pr = compteurs["priorites_retenues_hors_refutes"]; po = compteurs["priorites_avec_oublis"]
L.append(f"| | P0 | P1 | P2 | P3 |\n|---|---|---|---|---|\n"
         f"| Registre du 04 (retenus) | 8 | 57 | 66 | 58 |\n"
         f"| Après relecture du 08 (réfutés retirés, priorités amendées) | {pr['P0']} | {pr['P1']} | {pr['P2']} | {pr['P3']} |\n"
         f"| + oublis trouvés le 08 | {po['P0']} | {po['P1']} | {po['P2']} | {po['P3']} |\n")
L.append(f"Relecture globale des 192 problèmes : {', '.join(f'{k} {v}' for k, v in sorted(compteurs['relecture_globale'].items()))}.\n")
if nouvelle_prio:
    L.append("Priorités amendées : " + ", ".join(f"{k} → {v} (était {par_id[k]['priorite_retenue']})" for k, v in nouvelle_prio.items()) + ".\n")

L.append("## 2. Verdicts, domaine par domaine\n")
for dom in ORDRE:
    d = docs.get(dom)
    if not d:
        L.append(f"### {dom}\n\n_Relecture non rendue._\n")
        continue
    L.append(f"### {dom}\n")
    L.append("| Id | Priorité 04 → 08 | Verdict | Preuve | Commentaire du relecteur |\n|---|---|---|---|---|")
    for v in d["verdicts"]:
        p04 = par_id.get(v["id"], {}).get("priorite_retenue", "?")
        p08 = v["priorite_proposee"] + (" **(changée)**" if v.get("priorite_changee") else "")
        L.append(f"| {v['id']} | {p04} → {p08} | **{v['verdict']}** | {esc(v['preuve'])} | {esc(v['commentaire'])} |")
    L.append("")
    if d.get("tests_lances"):
        L.append("Exécuté : " + " · ".join(esc(t) for t in d["tests_lances"]) + "\n")
    if d.get("limites"):
        L.append(f"Limites déclarées : {esc(d['limites'])}\n")

L.append("## 3. Contrôles débloqués le 2026-09-08\n")
L.append("""| Contrôle | Statut au 04 | Statut au 08 | Méthode | Constat | Preuve |
|---|---|---|---|---|---|
| C10 — isolation par requête sous rôle anon/authenticated | BLOQUÉ (42501) | **PROUVÉ (sur réplique)** | requête base, PostgreSQL 16 jetable chargé des 123 policies réelles du 2026-09-08 | Données « propres » : 0 ligne pour anon et pour un tiers sur 14 tables ; comptes privés respectés ; les seules lectures publiques sont celles déjà rapportées (conv_reads, event_attendees, events, storage attachments, follows, user_passions, profiles…) | `preuves/complement-2026-09-08/banc-isolation-role/` (README, matrice.txt, sondes.txt, mutations.txt) |
| C13 — UPDATE/DELETE sous rôle tiers | BLOQUÉ | **PROUVÉ (sur réplique)** | requête base | 0 ligne touchée sur 40 tables ; usurpation d'auteur, auto-invitation, message hors conversation, notification signée par autrui, dépôt Storage chez autrui, télémétrie au nom d'autrui : tous refusés ; 3 mutations (policy retirée → verdict inversé) prouvent que le banc mesure les policies | idem |
| TCI-C04 — flakiness des derniers runs | BLOQUÉ (403 proxy) | **PROUVÉ** | journaux CI lus (`get_job_logs`) | 1 instable sur 1 103 (`monitoring-file-boot.spec.js:49`, repris) ; les shards longs le sont par l'installation Playwright, pas par des reprises | `preuves/complement-2026-09-08/ci-run-33861671142/journaux-resume.md` |
| TCI-C22 / CARTO-C25 / NET-C24 / C36 / MOD-C29 — suites prod | BLOQUÉ (« vert en CI ») | **PRÉCISÉ : le vert ne couvre que 3 tests sur 15** | journaux CI | 12 tests `skipped` (multi-comptes, confidentialité, suppression de compte…) faute de `PASSIO_E2E_MULTI` ; `mesure-passions.js` échoue (`fetch failed`) et l'étape reste verte ; purge Storage « ignorée » | idem |
| MOD-C30 — irl-trust-safety.spec.js | BLOQUÉ (non lancée) | **PROUVÉ** | test exécuté localement | 23/23 (5,7 min) — prouve le lot sous drapeau OFF, ne lève pas IRL-02/MOD-08 | `preuves/complement-2026-09-08/suites-locales/irl-trust-safety.md` |
""")
for c in controles:
    L.append(f"| {c['id']} ({c['domaine']}) | BLOQUÉ | **{c['statut']}** | {esc(c['methode'])} | {esc(c['constat'])} | {esc(c['preuve'])} |")
L.append("""
Toujours BLOQUÉ (rapport 13, inchangé) : fichier servi en production (proxy), REST anon direct (proxy), plans/quotas/réglages des tableaux de bord Supabase-Netlify-Brevo, appareils et navigateurs réels, carte, lecteur d'écran, restauration et capacité (pas de staging). Précision utile pour PRO-01 : `pgrst.db_max_rows` n'est pas posé au niveau du rôle `authenticator` (défaut plateforme 1 000), et le journal CI lit bien « 1000 identifiants » côté `service_role` ; aucun index d'unicité sur `profiles.username` (0 doublon aujourd'hui).
""")

L.append("## 4. Oublis trouvés par les relecteurs (nouveaux problèmes, format du registre)\n")
if not oublis:
    L.append("_Aucun._\n")
for o in oublis:
    L.append(f"### {o['id']} — {o.get('priorite','P?')} — {esc(o.get('titre'))}\n")
    for k, lab in (("fonctionnalite", "Fonctionnalité"), ("attendu", "Attendu"), ("observe", "Observé"),
                   ("reproduction", "Reproduction"), ("preuve", "Preuve"), ("impact", "Impact"),
                   ("correction", "Correction"), ("effort", "Effort"), ("confiance", "Confiance")):
        if o.get(k):
            L.append(f"- **{lab}** : {esc(o[k])}")
    L.append("")

L.append("""## 5. Ce que cette relecture change au verdict

Rien sur le fond : les huit P0 sont confirmés (EXP-01 et PERF-01, qui n'avaient pas été relus, le sont désormais avec preuve) et les sept critères d'interdiction restent vrais. Ce qui change est dans `17-BILAN-CONSOLIDE-ET-PLAN-DE-CORRECTION.md` : le critère « isolation non prouvée » devient « isolation prouvée sous rôle, avec trois fuites voulues par les policies à fermer », et les oublis ci-dessus rejoignent les chantiers CH02 (messagerie), CH05 (IRL), CH11 (produit) et CH12 (CI).
""")

open(os.path.join(BASE, "16-RELECTURE-COMPLEMENT-2026-09-08.md"), "w").write("\n".join(L))
print("rapport 16 écrit ;", len(verdicts), "verdicts,", len(oublis), "oublis,", len(controles), "contrôles ; domaines manquants :", compteurs["domaines_manquants"])
