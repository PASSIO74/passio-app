# ADR-009 — Cœur PASSIO = Feed → relation → IRL, sans Wallet/Passia/points

- **Statut** : Accepté
- **Date** : 2026-08-20
- **Contexte** : PASSIO a accumulé plusieurs mécanismes de gamification et de monétisation dans son cœur : écran Wallet, Score Passion, étoiles/points, Passia, leaderboard, packs, abonnement, boutique et piste crypto. En parallèle, la promesse produit est devenue plus nette : **« partage tes Passio et rencontre les gens »**. Le produit doit relier directement la découverte de contenus par passion aux personnes, aux conversations et aux expériences IRL. Le carnet de voyage/CDV est par ailleurs destiné à l’univers vertical **Passio : Voyage**, et non au cœur de l’application.
- **Décision** :
  1. Le noyau produit est **Passion → contenu → personne → interaction → conversation → IRL → nouveau contenu**.
  2. L’écran **Wallet** est supprimé du produit cœur.
  3. Les **points, étoiles, Score Passion, rangs, leaderboard, Passia, packs Passia, Pass Passion, boutique Passia et piste crypto** sont supprimés du produit cœur.
  4. Aucun mécanisme d’économie interne ou monnaie virtuelle ne doit être réintroduit par défaut.
  5. Si un paiement devient nécessaire pour un événement, un atelier ou un créateur, il devra être étudié comme un **paiement direct en monnaie réelle** via une couche de paiement dédiée, sans monnaie intermédiaire PASSIO, et uniquement lorsqu’un cas d’usage réel le justifie.
  6. Les signaux de confiance ne doivent pas être transformés en score public générique. La confiance doit rester contextuelle : profil complété, historique réel de participation, relations mutuelles, événements terminés, signalements/blocages, éventuelles vérifications futures.
  7. Les badges/gamification non monétaires ne font plus partie du MVP cœur. Ils peuvent être réévalués plus tard s’ils améliorent une métrique utile sans détourner l’utilisateur du lien humain.
  8. Le **CDV/carnet de voyage** sort du cœur et doit être conservé/extrait pour **Passio : Voyage** plutôt que supprimé aveuglément.
  9. La navigation et le discours produit doivent refléter le noyau Feed + IRL. Les écrans et CTA secondaires qui ne servent pas ce noyau ne doivent plus occuper une destination principale.
  10. L’implémentation de cette décision sera réalisée à la reprise de **Claude Code**, conjointement avec ChatGPT. ChatGPT porte le cadrage produit, les critères d’acceptation et la revue ; Claude Code porte les modifications multi-fichiers et l’intégration ; Codex est utilisé en contrôle croisé pour les tests, audits et régressions lorsque pertinent.

- **Conséquences** :
  - PASSIO devient plus lisible : la valeur principale n’est plus concurrencée par une économie interne.
  - La surface UI, l’état local, le code, le CSS et les parcours à tester doivent diminuer après suppression/extraction.
  - La landing page, le profil, les raccourcis IA, la navigation, les écrans, les données de démonstration et la documentation doivent être nettoyés de toute promesse Passia/points/crypto.
  - Les métriques produit doivent se concentrer sur l’activation, la qualité du feed, les interactions humaines, les conversations, la conversion vers l’IRL, la rétention et la sécurité.
  - Les éventuels besoins de monétisation future seront traités séparément et ne pourront pas conditionner l’architecture du MVP cœur.
  - Les données historiques liées aux points/Passia doivent être retirées ou rendues inertes avec une stratégie de migration tolérant les anciens états locaux.

- **Alternatives écartées** :
  - **Conserver le Wallet mais le simplifier** : rejeté car il maintient une destination produit concurrente du cœur Feed + IRL.
  - **Conserver uniquement les points/rangs** : rejeté car un score global pousse à optimiser l’activité dans l’app plutôt que la qualité des rencontres et des passions.
  - **Conserver Passia sans crypto** : rejeté car une monnaie intermédiaire ajoute complexité produit, réglementaire, UX et technique avant preuve de besoin.
  - **Supprimer aussi tout paiement futur** : rejeté ; des paiements directs pourront être utiles plus tard pour des expériences ou créateurs, mais ils devront répondre à un usage réel et rester indépendants d’une monnaie PASSIO.

- **Trigger de réexamen** : cette décision ne peut être rouverte que si des données d’usage démontrent qu’un besoin de transaction ou de reconnaissance n’est pas correctement servi par les mécanismes simples du produit. Une réintroduction éventuelle devra comparer explicitement l’option la plus simple (paiement direct, statut contextuel, badge privé) à toute solution de points ou monnaie interne, et justifier l’impact sur activation, rétention, conversion IRL, sécurité et complexité.
