# Message à copier dans Claude Code — PASSIO UI-1

Le document joint `PASSIO_DIRECTION_UI_CONCEPT_TESTABLE_2026-08-25.md` devient la base produit canonique de la future interface PASSIO.

## Organisation et autorité

- ChatGPT reste l’orchestrateur produit et l’auteur du cadrage.
- Claude Code est le développeur principal.
- GitHub `PASSIO74/passio-app` est la source de vérité technique.
- Codex effectuera la contre-revue après ouverture de la PR.
- Ne travaille jamais directement sur `main`.
- Ne fusionne et ne déploie rien sans autorisation explicite de Benjamin.

## Nouvelle priorité

Nous suspendons les optimisations de performance profondes. L’objectif numéro 1 est de rendre le nouveau concept PASSIO visible et testable, lot par lot. Il n’est pas demandé de dimensionner immédiatement ces fonctions pour un million d’utilisateurs.

La doctrine est :

```text
DÉCOUVRIR → PARTAGER → RENCONTRER
Feed → passion/personne → interaction → conversation → IRL → souvenir → Feed
```

## Première action : enregistrer la direction dans le dépôt

1. Repars du dernier `main` GitHub et relève son SHA exact.
2. Crée une branche isolée :

```text
claude/ui-v2-01-shell-navigation
```

3. Copie intégralement le document joint vers :

```text
docs/PASSIO_UI_V2_DIRECTION_2026-08-25.md
```

4. Ajoute un lien court vers ce document dans `.passio/context/CURRENT_PRIORITIES.md` ou l’index documentaire canonique approprié. Ne duplique pas tout le texte dans plusieurs mémoires.
5. Indique explicitement que ce document consolide et remplace l’ancien ordre UX qui plaçait la refonte après la performance.

En cas de contradiction : décision utilisateur la plus récente pour le produit, document UI V2 consolidé pour la direction UX, `main` GitHub pour l’état réel du code, et règles de sécurité existantes toujours non négociables.

## Principe absolu de préservation

Nous gardons tout le travail utile déjà réalisé dans l’application actuelle, y compris son design.

Préserver par défaut :

- logo PASSIO, univers clair et violet actuel ;
- cartes blanches arrondies et composants existants appréciés ;
- bouton central Créer ;
- bulles/onglets horizontaux des profils Passio ;
- visuel actuel des moods sous forme de mots soulignés ;
- stories ;
- Feed, commentaires, réactions, partages et profils existants ;
- moteurs de publication, Bobines, Messages, événements, RSVP, conversation événement et post-IRL ;
- routes/deep links historiques ;
- données CDV, Wallet et fonctions secondaires même lorsqu’elles quittent le cœur ;
- protections sécurité, majorité, blocage, confidentialité et tests existants.

Règle : **réutiliser, déplacer, simplifier et reconnecter avant de remplacer**.

Interdictions :

- aucune réécriture framework ;
- aucun remplacement global de `styles.css` ;
- aucune suppression d’écran, handler, donnée ou test dans UI-1 ;
- aucun changement Supabase, migration ou RLS ;
- aucune modification du ranking Feed ;
- aucun chantier performance dans cette branche ;
- aucune différence sur l’interface normale hors aperçu V2.

## Décision spécifique Feed déjà validée

Ne redessine pas les deux composants suivants :

1. le sélecteur horizontal de profils Passio reste sous forme de bulles illustrées avec anneau violet actif ;
2. les nouveaux choix `Pour toi · Découvrir · Apprendre · Créer · Rencontrer` conservent le style visuel actuel des onglets Mood : texte simple et onglet actif violet souligné, jamais de grosses pills.

UI-1 ne doit pas modifier ces composants. Ils seront raccordés dans UI-2 en conservant cette apparence.

## Mission UI-1 — Shell et navigation uniquement

Construis le cadre visuel testable de la V2 derrière un aperçu non persistant. Utilise la convention réelle des previews du dépôt ; cible souhaitée :

```text
?passio_preview=passio-ui-v2
```

L’URL normale doit rester strictement sur l’interface actuelle.

### Bottom navigation V2

Exactement cinq entrées avec libellés visibles :

1. `Découvrir` → route Feed existante ;
2. `Rencontrer` → route IRL existante ;
3. `Créer` → action centrale ;
4. `Messages` → route Messages existante ;
5. `Profil` → route Profil/multi-profil existante.

`Créer` reste visuellement central. Son tap n’active plus immédiatement un écran Studio dans l’aperçu V2 : il ouvre un bottom sheet léger avec :

- Publication — une idée, photo ou vidéo ;
- Bobine — vidéo courte autour d’une Passio ;
- Activité IRL — quelque chose à vivre ensemble ;
- Plus — audio/podcast ou Story.

Pour UI-1, ces choix doivent surtout ouvrir les handlers/éditeurs existants, sans réécrire leur fonctionnement.

### Routes secondaires

- Bobines sort de la navigation primaire mais `goTo('bobines')` et les deep links continuent de fonctionner.
- CDV sort de la navigation primaire mais sa route et ses données restent intactes.
- Explorer reste accessible comme fonction secondaire/recherche ; ne supprime rien.
- Studio reste utilisable comme shell interne pendant la migration.

### Style UI-1

- réutilise la charte claire/violette actuelle ;
- conserve la forme générale et la safe area de la bottom-nav ;
- ajoute des libellés lisibles sans tasser les zones tactiles ;
- prépare des tokens V2 préfixés/scopés sans produire d’effet sur l’interface normale ;
- le corail IRL et le `trait Passio` peuvent être préparés, mais aucun redesign Feed dans cette PR ;
- respecte clavier, focus visible et `prefers-reduced-motion`.

## Contrat d’aperçu et de compatibilité

- preview activée uniquement pour la requête courante ;
- aucune écriture durable dans `localStorage` ou configuration utilisateur ;
- le kill switch OFF/absence de preview gagne toujours ;
- rafraîchir l’URL normale restaure l’UI actuelle ;
- ancienne configuration `navOrder` normalisée seulement dans l’aperçu, sans effacer les autres réglages ;
- aucun changement silencieux de `currentProfileId`.

## Preuves visuelles obligatoires

Avant modification, capture l’interface actuelle en 390 × 844 :

- Feed avec profils et moods visibles ;
- IRL ;
- Messages ;
- Profil ;
- bottom-nav.

Après modification, capture les mêmes vues dans `passio-ui-v2`, plus le bottom sheet Créer ouvert.

Les différences non demandées sur le Feed, les profils, les moods, les cartes ou les moteurs existants sont des régressions.

## Tests minimum

- tests navigation et contextual navigation existants ;
- smoke ;
- cadrage/safe area mobile ;
- profils/types si le bouton Créer les touche ;
- audits handlers et globals ;
- nouveaux tests prouvant les cinq destinations de l’aperçu ;
- nouveaux tests prouvant que Bobines et CDV ne sont pas dans la bottom-nav V2 mais restent routables ;
- test prouvant que l’URL normale garde la navigation actuelle ;
- test prouvant que l’aperçu ne persiste aucun réglage ;
- test 390 × 844 sans libellé tronqué ni zone tactile trop petite.

Ne modifie et ne supprime aucun test pour obtenir un résultat vert.

## Livraison attendue

1. implémente UI-1 uniquement ;
2. commit sur la branche isolée ;
3. pousse la branche et ouvre une PR non fusionnée ;
4. ne déploie pas en production ;
5. rapporte :
   - SHA de départ `main` ;
   - branche et commit final ;
   - URL de PR ;
   - URL de preview testable ;
   - liste exacte des fichiers modifiés ;
   - résultats de tests ;
   - chemins des captures avant/après ;
   - limites connues ;
   - confirmation que l’URL normale et les fonctions historiques restent inchangées.

Arrête-toi après la PR UI-1. Attends la validation visuelle de Benjamin, ChatGPT et la contre-revue Codex avant UI-2.
