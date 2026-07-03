# Assistant IA — Edge Function `ask-ai` (Claude)

L'onglet **Assistant IA** de l'Explorer interroge Claude (API Anthropic) via une
Edge Function Supabase. **Tant que la fonction n'est pas déployée, l'app retombe
automatiquement et sans erreur sur le moteur local** (base de connaissances) :
rien à casser, l'IA « réelle » est un simple upgrade.

## Ce que ça fait

- Client (`sendAIQuery`, `js/app-07-ia-explore-irl.js`) appelle `supa.functions.invoke("ask-ai", { body: { query } })` avec un timeout de 9 s.
- Réponse OK → rendue avec le badge « ✨ Assistant PASSIO » (texte échappé + puces).
- Échec / non déployée / hors-ligne / pas de session → badge « 💡 Suggestions PASSIO » (moteur local `aiGenerateResponse`).
- La réponse de l'IA est **toujours échappée** (`_aiTextToHtml`) : aucun HTML arbitraire injecté.

## Déploiement (action manuelle — nécessite une clé API Anthropic)

1. **Poser la clé API en secret** (jamais dans le code client) :
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
   ```
2. **Déployer la fonction** :
   ```bash
   supabase functions deploy ask-ai
   ```
3. **Vérifier** (avec une session active dans l'app, onglet Assistant IA) : une
   question doit renvoyer le badge « ✨ Assistant PASSIO ». Sinon, logs :
   ```bash
   supabase functions logs ask-ai
   ```

## Réglages (dans `supabase/functions/ask-ai/index.ts`)

- `MODEL` : `claude-haiku-4-5-20251001` par défaut (rapide + économique, adapté à
  l'échelle grand public). Passer à `claude-sonnet-5` pour des réponses plus
  fouillées (plus cher).
- `MAX_TOKENS` : 600 (borne le coût par réponse).
- `SYSTEM_PROMPT` : cadre PASSIO (français, bref, actionnable, recentrage hors-sujet).

## Coût & abus

- La fonction **exige une session authentifiée** (JWT) → pas d'appels anonymes.
- `max_tokens` borné + question tronquée à 800 caractères.
- Pour un garde-fou plus strict à l'échelle (quota par utilisateur/jour), ajouter
  une table `ai_usage` et un compteur au début de la fonction — non branché pour
  l'instant (l'auth + le max_tokens suffisent en beta).

## CSP

`api.anthropic.com` n'est appelé **que côté serveur** (Edge Function) → aucune
modification de la CSP du client nécessaire.
