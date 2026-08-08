# ADR-003 — RLS Supabase = unique frontière de sûreté

- **Statut** : Accepté
- **Date** : (rétroactif ; RLS v2 appliquée en prod)
- **Contexte** : Le front est **public et hostile** : `index.html`, `app-*.js`, clé anon Supabase et code d'accès `2125` sont livrés au navigateur. Aucun secret ni contrôle de sûreté ne peut vivre côté client.
- **Décision** : La **Row Level Security Postgres par propriétaire** (`auth.uid()::text`) est la **seule** frontière de sûreté. Le gate JS et l'UI sont du confort, pas de la sécurité. Corollaire opérationnel : **un UPDATE/DELETE qui touche 0 ligne = une RLS manquante à ajouter**, jamais un bug à contourner côté client.
- **Conséquences** :
  - (+) Modèle de sécurité simple, vérifiable en base, indépendant du client.
  - (−) Dépendance à 100 % sur la justesse des policies → audits `rls-audit`, et la livraison realtime cross-compte n'est **prouvable que par les tests multi-comptes**.
  - Interdit désormais : « sécuriser » une donnée uniquement en cachant un bouton ; requêter dans `onAuthStateChange` (deadlock) ; utiliser le global `supabase` au top-level (SDK paresseux `ensureSupabase()`).
- **Alternatives écartées** : logique d'autorisation côté client (non sûre) ; backend applicatif dédié (over-engineering au stade beta ; Edge Functions réservées à la logique qui ne peut pas être RLS).
- **Trigger de réexamen** : besoin de logique d'autorisation trop complexe pour la RLS → Edge Functions / couche serveur via nouvel ADR.
