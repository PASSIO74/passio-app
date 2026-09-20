# Banc authentifié de capacité — staging

`scripts/charge-realiste.mjs` complète le stress historique `charge.mjs`. Il mesure des parcours API et des connexions Realtime avec des comptes distincts. Il ne mesure ni le rendu navigateur, ni le téléchargement de médias, ni les inscriptions par email. Ses résultats ne certifient pas la production : vérifier notamment les publications et triggers des deux projets.

## Avant toute exécution

La seule cible autorisée est `fcksxofaelcdmmifnwjo`. Un plan ne lit aucune clé et ne fait aucun appel réseau :

```powershell
node scripts/charge-realiste.mjs --projet fcksxofaelcdmmifnwjo --prevol
```

Après revue du code et autorisation de la campagne, prévol fonctionnel seul :

```powershell
node scripts/charge-realiste.mjs --projet fcksxofaelcdmmifnwjo --prevol --executer --sortie work/prevol-capacite.json
```

Fournir `CHARGE_SUPABASE_ANON_KEY` et `CHARGE_SUPABASE_SERVICE_ROLE_KEY` du staging, ou le PAT `SUPABASE_ACCESS_TOKEN` (repli CLI `~/.supabase/access-token`). Aucune clé n'est imprimée ni sauvegardée. L'exécution en CI est interdite.

Le prévol crée deux comptes Auth confirmés sans email envoyé, et 15 profils auteurs UUID au total pour répartir les 120 publications sous les quotas anti-flood. Ces profils supplémentaires ne sont ni des comptes connectés ni des utilisateurs mesurés. Il vérifie le fil à 60 puis 20 éléments, ses likes/commentaires/interactions et le cinquième appel de résolution des auteurs, puis une publication reçue par l'autre compte et un message privé V3 effectivement reçu. Une réponse vide ou une jointure absente échoue.

Les comptes du banc utilisent le domaine réservé **`passio-capacite.test`**. Le domaine `passio-e2e.test` est réservé aux suites E2E : leur teardown CI supprime tous ses comptes sur staging, sans limite d'âge et sans connaître les campagnes locales. Partager ce domaine peut faire disparaître comptes et membres de conversation en pleine mesure, puis produire des HTTP 403 qui ne signalent pas une saturation. Le domaine séparé évite cette purge ; il ne garantit pas l'absence de contention CPU/réseau avec la CI.

## Campagne

```powershell
node scripts/charge-realiste.mjs --projet fcksxofaelcdmmifnwjo --paliers 25,50,100,200 --duree 90 --executer --sortie work/capacite.json
```

Le mode par défaut est `--pages 60,20`. Après une comparaison contrôlée à faible palier, on peut réserver le budget au scénario optimisé :

```powershell
node scripts/charge-realiste.mjs --projet fcksxofaelcdmmifnwjo --paliers 200 --pages 20 --duree 90 --executer --sortie work/capacite-200-page20.json
```

`--pages` accepte exclusivement `20` ou `60,20`. Le mode `20` exécute uniquement cette variante à chaque palier, inscrit `comparaisonDemandee: false` et laisse `comparaisons` vide. Son prévol conserve les deux lectures 60/20 pour vérifier le contrat. Il ne fournit donc aucun gain avant/après ; un passage réussi à 200 est un palier observé, pas le maximum de l'application. Un saut de palier doit être décidé après les mesures précédentes sans dégradation de service, pas pour contourner un verdict rouge.

La campagne s'arrête au budget même si tous les paliers n'ont pas été atteints. À partir d'une première mesure à 25 personnes, projeter séparément HTTP et Realtime avant de choisir les variantes : le trafic de diffusion peut croître plus vite que le nombre de personnes. Répéter le contrôle de page 60 à chaque palier peut consommer la réserve avant la mesure à 200. Conserver le budget de 180 Mo plus 20 Mo de nettoyage ; une interruption pour budget signifie « mesure incomplète », pas « application saturée ». Ne jamais fusionner les p95 de campagnes distinctes en une fausse comparaison.

Les paliers sont croissants, compris dans 25/50/100/200, et utilisent autant d'identités distinctes que de personnes annoncées. Les comptes sont créés une seule fois ; 200 comptes prennent au moins 7,5 minutes pour espacer les logins. Préparation, connexion des sockets, échauffement de quatre comptes et nettoyage sont chronométrés séparément de la mesure. La durée configurable est 30 à 160 secondes ; les requêtes ont une échéance de 12 secondes, et une garde arrête les requêtes encore actives à 180 secondes. Les 20 secondes de marge évitent de confondre un dernier parcours en cours avec une saturation à la limite du palier.

Chaque socket rejoint les 12 handlers `postgres_changes` du chemin V3 (10 tables distinctes) et le canal privé de son utilisateur ; la réponse du serveur doit confirmer les 12 handlers. Le scénario complet répartit lectures, likes retirés après insertion, publications et messages entre deux membres. Les pauses déterministes durent 5 à 10 secondes, avec départs étalés. Une requête HTTP n'est jamais présentée comme un utilisateur.

À chaque palier, page 60 puis page 20 utilisent les mêmes comptes, fixtures et graine. Les mutations sont remises à zéro entre variantes et une empreinte du fil est comparée. Cette comparaison isole la taille de page ; elle n'exécute pas deux builds du navigateur. Le rapport sépare p95 HTTP, p95 parcours complet, latence de livraison et erreurs, et conserve les tentatives échouées dans le p95 principal. Aucun palier supérieur si erreurs > 1 %, p95 HTTP ou parcours > 1 seconde, réception Realtime absente/échouée, ou p95 Realtime > 2 secondes. Le scénario complet exige au moins un message livré pendant chaque palier : recevoir uniquement des publications ne qualifie pas la messagerie sous charge. Sa latence p95 est également contrôlée séparément sous 2 secondes.

`--scenario lecture` conserve les sessions, sockets et lectures mais retire les écritures du scénario mesuré. Son prévol vérifie une publication, sans qualifier la messagerie V3 ; son résultat est seulement une capacité de lecture avec sockets ouvertes.

## Budgets et nettoyage

Toute la campagne partage 180 Mo d'octets applicatifs HTTP/WebSocket, 150 000 frames Realtime émises/reçues, 20 000 appels HTTP et 45 minutes. Le nettoyage dispose séparément de 20 Mo et 2 000 appels, avec son propre chronomètre. Le total prévu est donc au maximum 200 Mo de charges utiles comptées. Une limite atteinte interrompt les requêtes et ferme les sockets ; les octets déjà en transit peuvent dépasser légèrement le compteur d'arrêt. En-têtes, TLS, compression et messages internes du serveur ne sont pas comptés : ce budget client n'est pas une borne contractuelle de facturation Supabase.

`<sortie>.manifest.json` consigne les IDs avant l'insertion des fixtures, et les emails artificiels avant chaque création Auth. Le `finally` nettoie seulement ces IDs, même après échec partiel. Aucun DDL, aucune désactivation de trigger, aucun changement de forfait, aucune suppression des anciennes fixtures `charge_*`. Une création Auth dont la réponse est perdue est signalée comme incertaine avec son email exact ; il faut alors vérifier cet email côté admin. Un arrêt forcé du processus peut empêcher le `finally` : conserver le manifeste et contrôler les résidus avant une autre campagne. Un nettoyage incomplet provoque un code de sortie en échec.

La récupération d'un nettoyage interrompu doit conserver cette portée : cible staging vérifiée, IDs du manifeste de la campagne et, pour une création Auth incertaine, email complet exact du manifeste. **Aucune recherche ou suppression globale par domaine**, y compris `passio-capacite.test`. Un HTTP 404 Auth au nettoyage reste consigné comme compte déjà disparu ; ne pas transformer cette observation en preuve de capacité ou en erreur de charge.

Validation locale sans réseau : `node --test tests/unit/charge-realiste.test.mjs`. Le banc n'a pas été lancé pendant son développement ; l'exécution staging appartient au coordinateur après revue.
