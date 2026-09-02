---
name: revue-croisee
description: "Audit croisé avec ChatGPT : dossier factuel, challenge, vérification. Analyse croisée, double regard, jalon."
---

# /revue-croisee — Analyse croisée Claude Code ↔ ChatGPT

Répartition **stricte** des rôles. Claude Code détient le dépôt, la prod Supabase, la CI et les tests : il **mesure et vérifie**. ChatGPT n'a aucun accès : il **challenge**. C'est asymétrique par construction, et c'est la source de sa valeur.

## Règle cardinale

**Aucune hypothèse de ChatGPT n'est un fait tant qu'elle n'a pas été vérifiée dans le dépôt réel.** Chaque point revient classé :

`CONFIRMÉ` · `INFIRMÉ` · `PARTIELLEMENT CONFIRMÉ` · `DÉJÀ EXISTANT` · `NON APPLICABLE` · `À APPROFONDIR`

Et symétriquement : **ne jamais écrire que ChatGPT a été consulté si l'échange n'a pas eu lieu.** Si aucun transport n'est joignable (`node scripts/chatgpt.js etat`), on le dit et on ne produit pas de livrable « conjoint ».

## Le protocole

1. **Explorer** — mesurer le réel (tests, audits, schéma prod, policies). Ne pas produire l'audit complet en solo : ce serait transformer ChatGPT en tampon.
2. **Transmettre** — un dossier factuel : architecture réelle, baseline chiffrée, constats datés, questions ciblées. Jamais « que penses-tu de X ? ».
3. **Challenger** — lui demander explicitement ce qui pourrait être FAUX, ce qui a été oublié, ce que la correction pourrait casser. Le désaccord argumenté est le produit recherché.
4. **Vérifier** — retourner dans le dépôt, point par point. C'est l'étape qui a le plus de valeur, et celle qu'on est tenté de sauter.
5. **Second échange** — lui renvoyer les verdicts, y compris ceux qui l'infirment. Ses questions de relance sont souvent meilleures que ses réponses initiales.
6. **Consolider** — un livrable qui montre ce que le croisement a changé, y compris **les erreurs de Claude qu'il a corrigées**. Un audit croisé qui ne corrige rien n'a pas eu lieu.

## Ce qu'il faut lui demander

Formulations qui produisent du signal :

- « Qu'est-ce qui pourrait être FAUX dans ce constat ? Où ma cause racine est-elle incomplète ? »
- « Qu'est-ce qu'un audit qui commence par X rate systématiquement ? »
- « Que casserait cette correction ? »
- « Qu'est-ce que tu NE ferais PAS ? » — la meilleure question contre la sur-ingénierie.
- Toujours rappeler les contraintes réelles (vanilla, pas de bundler, hoisting, RLS = seule frontière), sinon il propose une migration de framework.

## Le canal — voir `/chatgpt`

Comment lui parler (transport, fils persistants, garde secrets, envoi d'un
dossier) est traité une seule fois, dans la skill **`/chatgpt`**. En résumé :

```bash
node scripts/chatgpt.js etat                                  # quel transport est prêt
npm run revue -- --titre "…" --tests                          # produire le dossier
node scripts/chatgpt.js "Challenge ce dossier." --fichier .passio/reviews/<d>-<slug>/DOSSIER-COMPLET.md --fil <sujet>
```

Le repli Claude-in-Chrome et ses 8 pièges sont dans
[`.claude/skills/chatgpt/references/navigateur.md`](../chatgpt/references/navigateur.md).
Ne pas dupliquer cette mécanique ici : elle a déjà divergé une fois.

## Livrables

Le croisement produit un document daté qui **doit** contenir une section « ce que l'analyse croisée a changé », avec les erreurs corrigées de part et d'autre. Voir `PASSIO_INITIAL_JOINT_AUDIT.md` et `PASSIO_CONTROL_CENTER_AUDIT.md` comme modèles.

Ne jamais envoyer de secret : pas de `.env`, pas de clé `service_role`, pas de JWT, pas d'identifiant. Le dossier décrit l'architecture et les mesures, jamais les credentials.
