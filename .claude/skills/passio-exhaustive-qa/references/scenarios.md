# Décider quoi tester, et écrire un scénario qui garde quelque chose

## Décider quoi tester ensuite — par le risque, pas par le pourcentage

Remonter 15,2 % pour le plaisir de remonter un chiffre produit des tests qui n'attrapent rien. La priorité se lit dans cet ordre :

1. **Mutations cross-compte** — ce qu'un compte écrit et qu'un autre lit. C'est là que vivent les fuites et les usurpations.
2. **Écritures qui peuvent échouer en silence** — tout appel Supabase dont le `{ error }` n'est pas lu.
3. **Chemins secondaires d'une fonctionnalité bien traitée par ailleurs** — transfert vs envoi, suppression pour moi vs pour tous, groupe vs conversation directe. Le principal a les tests ; le secondaire hérite d'une copie plus ancienne.
4. **Reprises d'erreur** — hors-ligne, token expiré, quota dépassé, réponse tardive.
5. Le reste : options, panneaux, éditeurs.

## Écrire un scénario qui garde vraiment quelque chose

Chaque scénario porte au minimum : préconditions vérifiées (pas supposées), l'action, l'effet attendu **côté base** quand il y en a un, et la contre-épreuve.

**La contre-épreuve est obligatoire.** `conv-suppression.spec.js` teste que le message supprimé ne revient pas **et** que le non-supprimé n'est pas perdu — sans le second, un correctif qui effacerait tout passerait le premier. Idem pour `transfert-message.spec.js` : échec **et** succès.

Puis **mutation-tester** : casser le code exprès, voir le test rouge. Un test qui reste vert sans le correctif ne garde rien.
