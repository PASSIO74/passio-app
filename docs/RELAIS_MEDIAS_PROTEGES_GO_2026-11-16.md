# Relais et interrupteur des médias protégés

Risque critique. Implémentation : Codex. Revue indépendante requise avant fusion. Résultat attendu : les chemins privés relaient un JWT utilisateur au broker Supabase sans clé privilégiée Netlify ; le pilote téléphone peut suspendre les lectures/envois via le réglage serveur existant.

Acceptation : aucun cache ni renvoi public, GET/HEAD et Range bornés, annulation/taille/MIME réels, corps d’erreur fermé, cible staging pour tout brouillon, cible production pour le seul déploiement publié, activation booléenne explicite avec historique/AAL2 existants. Le client n’utilise pas son cache local comme autorisation.

Périmètre : relais Netlify, configuration publique des deux projets, whitelist des réglages, pilotage mobile et cible publique des previews. La migration du registre/bucket privé, le broker Supabase et le client/SW sont livrés dans le lot médias complémentaire. Pas de changement de droits du pilote, de clé privilégiée Netlify ni d’activation automatique.

Le réglage medias_proteges absent/invalide vaut fermé. Le serveur doit relire ce réglage à chaque résolution/réservation et INSERT Storage. La carte du pilote reste indisponible tant que la ligne validée n’existe pas ; les gestes passent par le mécanisme armement/confirmation/AAL2 et le journal existants. La veille ne modifie pas ce réglage.

Déploiement : livrer ce relais et le client compatible avant toute activation ; SQL crée la ligne désactivée. Les previews utilisent la configuration publique STAGING du dépôt et la dernière fonction de bord de main protégée, conformément au workflow existant. Une preview avant fusion du relais ne prouve donc pas sa présence. Déploiement publié/alias et mémoire du broker restent à éprouver sur la plateforme avant GO.

Retour arrière : désactiver le réglage serveur, vérifier refus de lecture/envoi, puis revenir à une release compatible. Ne jamais réouvrir le bucket public en réponse à un échec. Une fermeture ne rappelle pas des octets déjà reçus. La conversion des objets historiques, leur retrait source et les anciens caches restent des préalables distincts à la confidentialité complète.

Le relais compte les octets sans décodage ni transformation, plafond26MiB et60s par requête, avec15s au plus avant émission des en-têtes, lecture en flux et aucune remise en mémoire globale. Limites fournisseur à vérifier : Netlify512MiB partagés et50ms CPU/requête, hors attente réseau, ainsi que streaming et HEAD/Range effectifs. Sources : https://docs.netlify.com/build/edge-functions/api/ et https://docs.netlify.com/build/edge-functions/limits/ .

Les en-têtes de non-cache sont posés par le handler sur ses réponses. Les erreurs générées par la plateforme ne sont pas couvertes par _headers pour une Edge Function et restent à observer sur Netlify. Le délai avant en-têtes est borné sous les40s fournisseur ; aucun refus de plateforme ne doit être présenté comme un média privé autorisé.

Compatibilité ancien SW : tout accès à ce relais exige le marqueur fixe X-Passio-Media-Read:1, qui ne donne aucun droit. Un GET natif IMG sans marqueur reçoit400 sans octet média. Les Blob et capacités utilisent POST sans corps, ignoré par le handler GET des anciens SW ; le relais le traduit uniquement en GET du broker. Les POST avec corps ou marqueur absent/incorrect sont refusés avant amont. Authorization/Range et RLS restent identiques ; aucun POST n’est envoyé au broker ni aucune mutation autorisée par ce transport. Les parcours ne doivent insérer aucune src protégée avant ce chargement explicite.

Un corps réseau représenté par un flux doit atteindre EOF sans un seul octet sous500ms (quatre chunks vides au plus) ; le premier octet, un Content-Length positif et l’attente dépassée sont refusés. Aucun contenu de ce flux n’est décodé, conservé ou transmis. Les délais en-têtes et total couvrent également cette vérification.
