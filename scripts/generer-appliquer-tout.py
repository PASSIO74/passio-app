#!/usr/bin/env python3
"""Régénère migrations/APPLIQUER_TOUT_2026-09-08.sql à partir des trois migrations.

Le fichier unique est ce que Benjamin colle dans l'éditeur SQL de Supabase : il
n'existe que pour lui éviter trois copier-coller et un terminal. Il est donc un
MIROIR, jamais une source — corriger une migration puis oublier de régénérer
laisserait un fichier qui applique l'ancienne version, en silence.

    python3 scripts/generer-appliquer-tout.py            # régénère
    python3 scripts/generer-appliquer-tout.py --verifier # échoue s'il a dérivé

`--verifier` est joué par le banc tests/sql/appliquer-securite.test.sh.
"""
import sys
import pathlib
R = pathlib.Path(".")
lots = [
    ("① PIECES JOINTES DE MESSAGERIE — cloisonner la lecture",
     "migrations/migration_storage_lecture_cloisonnee.sql"),
    ("② RENCONTRES — adresse, telephone et participants",
     "migrations/migration_irl_donnees_privees.sql"),
    ("③ ADMISSION 18+ — fondation serveur, interrupteur ETEINT",
     "migrations/migration_admission_18_plus.sql"),
]
out = []
for titre, f in lots:
    src = (R / f).read_text(encoding="utf-8")
    # Ne garder que le corps executable : on retire l'en-tete de commentaires,
    # le BEGIN/COMMIT propre au fichier, et tout ce qui suit le COMMIT (les
    # procedures de retour arriere, qui sont en commentaires).
    i = src.find("\nBEGIN;")
    j = src.find("\nCOMMIT;")
    assert i > 0 and j > i, f
    corps = src[i + len("\nBEGIN;"):j].strip("\n")
    out.append(f"-- {'='*72}\n-- {titre}\n-- source : {f}\n-- {'='*72}\n\n{corps}\n")
CIBLE = R / "migrations" / "APPLIQUER_TOUT_2026-09-08.sql"
entete = (R / "migrations" / "_entete_appliquer_tout.sql").read_text(encoding="utf-8")
pied = (R / "migrations" / "_pied_appliquer_tout.sql").read_text(encoding="utf-8")
attendu = entete + "\n".join(out) + pied

if "--verifier" in sys.argv:
    actuel = CIBLE.read_text(encoding="utf-8") if CIBLE.exists() else ""
    if actuel != attendu:
        print("ECHEC — APPLIQUER_TOUT_2026-09-08.sql a DERIVE de ses trois migrations.")
        print("       Regenerer : python3 scripts/generer-appliquer-tout.py")
        sys.exit(1)
    print("OK — le fichier unique est le miroir exact des trois migrations.")
    sys.exit(0)

CIBLE.write_text(attendu, encoding="utf-8")
print("regenere :", CIBLE, "-", len(attendu), "octets")
