/* ═══════════════════════════════════════════════════════════════════════════
   RÉFÉRENTIEL PLAT DES PASSIONS — vie sociale et projets
   ───────────────────────────────────────────────────────────────────────────
   ⚠️ IL N'Y A QU'UN SEUL NIVEAU. Chaque ligne de ce fichier est une PASSION
   directement sélectionnable, au même rang que toutes les autres. « Enduro »
   n'est pas « sous » Moto : on la choisit sans jamais passer par Moto.

   Le découpage en fichiers et le champ `broader` sont deux commodités qui ne
   sortent JAMAIS à l'écran :
     · le fichier sert à relire et à réviser le référentiel par domaine ;
     · `broader` alimente la table technique `passion_relations`, invisible,
       qui ne sert qu'à mieux suggérer (et jamais à filtrer, ni à imposer un
       passage par un terme plus général).

   FORMAT D'UNE LIGNE
     [ id, libellé, "alias1,alias2", broader, { emoji, color, pop, broad } ]

     id       identifiant TEXTE STABLE. Il est écrit dans `posts.passion_id`,
              `events.passion_id`… : ne JAMAIS le renommer, jamais le réutiliser.
     libellé  ce que la personne lit. Unique après normalisation.
     alias    synonymes et variantes de recherche, séparés par des virgules.
              Un synonyme simple reste un ALIAS — il ne devient pas une passion.
     broader  identifiant d'un terme plus général, ou "" — relation invisible.
     emoji    obligatoire quand `broader` est vide, hérité sinon.
     color    idem.
     pop:1    proposée au repos, avant toute frappe.
     broad:1  terme très général (« Sport », « Musique ») : la recherche le
              rétrograde derrière un terme précis de même pertinence.
   ═══════════════════════════════════════════════════════════════════════════ */
module.exports = [

  // ── Entrepreneuriat ────────────────────────────────────────────
  ["entrepreneuriat", "Entrepreneuriat", "entrepreneur,boîte,projet", "", { emoji: "🚀", color: "#7c3aed", broad: 1 }],
  ["entrepreneuriat-creation-entreprise", "Création d'entreprise", "créer sa boîte,monter une entreprise", "entrepreneuriat"],
  ["entrepreneuriat-freelance", "Freelance", "indépendant", "entrepreneuriat"],
  ["entrepreneuriat-startup", "Startup", "jeune pousse,écosystème startup", "entrepreneuriat"],
  ["entrepreneuriat-e-commerce", "E-commerce", "boutique en ligne", "entrepreneuriat"],
  ["entrepreneuriat-marketing", "Marketing", "faire connaître son offre,plan marketing", "entrepreneuriat"],
  ["entrepreneuriat-reseaux-sociaux", "Réseaux sociaux", "social media", "entrepreneuriat"],
  ["entrepreneuriat-personal-branding", "Personal branding", "marque personnelle,se rendre visible", "entrepreneuriat"],
  ["entrepreneuriat-vente", "Vente", "vendre,technique de vente", "entrepreneuriat"],
  ["entrepreneuriat-levee-de-fonds", "Levée de fonds", "lever des fonds,investisseurs", "entrepreneuriat"],
  ["entrepreneuriat-gestion", "Gestion et compta", "comptabilité", "entrepreneuriat"],
  ["entrepreneuriat-no-code", "No-code", "sans coder,outils no code", "entrepreneuriat"],
  ["entrepreneuriat-side-project", "Side project", "projet à côté,projet perso rémunérateur", "entrepreneuriat"],
  ["entrepreneuriat-productivite", "Productivité", "être plus efficace,méthodes de travail", "entrepreneuriat"],
  ["entrepreneuriat-negociation", "Négociation", "négocier,conclure un accord", "entrepreneuriat"],
  ["entrepreneuriat-strategie", "Stratégie d'entreprise", "stratégie,vision d'entreprise", "entrepreneuriat"],
  ["entrepreneuriat-artisanat-business", "Vivre de son artisanat", "vendre son artisanat,artisan entrepreneur", "entrepreneuriat"],
  ["entrepreneuriat-association", "Association", "monter une association,loi 1901", "entrepreneuriat"],
  ["entrepreneuriat-franchise", "Franchise", "ouvrir une franchise,réseau franchisé", "entrepreneuriat"],

  // ── Finance et investissement ────────────────────────────────────────────
  ["finance", "Finance et investissement", "finance,argent,investir", "", { emoji: "💰", color: "#6d28d9", broad: 1 }],
  ["finance-bourse", "Bourse", "actions", "finance"],
  ["finance-epargne", "Épargne", "épargner,mettre de côté", "finance"],
  ["finance-immobilier", "Immobilier", "investir dans la pierre,achat immobilier", "finance"],
  ["finance-budget", "Budget", "gérer son budget,tenir ses comptes", "finance"],
  ["finance-retraite-finance", "Retraite", "préparer sa retraite,pension", "finance"],
  ["finance-fiscalite", "Fiscalité", "impôts", "finance"],
  ["finance-independance-financiere", "Indépendance financière", "fire", "finance"],
  ["finance-etf", "ETF", "trackers,fonds indiciels", "finance"],
  ["finance-assurance-vie", "Assurance-vie", "contrat d'assurance-vie,placement assurance", "finance"],
  ["finance-credit", "Crédit", "emprunter,prêt bancaire", "finance"],
  ["finance-immobilier-locatif", "Immobilier locatif", "locatif", "finance"],
  ["finance-education-financiere", "Éducation financière", "apprendre la finance,comprendre l'argent", "finance"],
  ["finance-frugalite", "Frugalité", "minimalisme", "finance"],
  ["finance-revenus-passifs", "Revenus passifs", "revenus complémentaires,gagner sans travailler", "finance"],
  ["finance-analyse-financiere", "Analyse financière", "analyser une entreprise,lire un bilan", "finance"],
  ["finance-patrimoine", "Gestion de patrimoine", "gérer son patrimoine,conseil patrimonial", "finance"],

  // ── Parentalité et famille ────────────────────────────────────────────
  ["parentalite", "Parentalité et famille", "parent,parents,famille,enfant,enfants", "", { emoji: "👶", color: "#a78bfa", broad: 1 }],
  ["parentalite-grossesse", "Grossesse", "être enceinte,attendre un enfant", "parentalite"],
  ["parentalite-bebe", "Bébé", "nourrisson", "parentalite"],
  ["parentalite-education", "Éducation", "éduquer,principes éducatifs", "parentalite"],
  ["parentalite-adolescence", "Adolescence", "ado", "parentalite"],
  ["parentalite-activites-enfants", "Activités enfants", "occuper les enfants,idées d'activités", "parentalite"],
  ["parentalite-ecole", "École et scolarité", "scolarité,suivi scolaire", "parentalite"],
  ["parentalite-sorties-famille", "Sorties en famille", "sortir en famille,idées de sorties", "parentalite"],
  ["parentalite-allaitement", "Allaitement", "allaiter,tétées", "parentalite"],
  ["parentalite-sommeil-enfant", "Sommeil de l'enfant", "faire dormir son enfant,nuits de bébé", "parentalite"],
  ["parentalite-jeux-enfants", "Jeux et jouets", "jouets,jeux pour enfants", "parentalite"],
  ["parentalite-parent-solo", "Parent solo", "monoparentalité,élever seul", "parentalite"],
  ["parentalite-famille-recomposee", "Famille recomposée", "beaux-enfants,recomposition familiale", "parentalite"],
  ["parentalite-garde", "Modes de garde", "crèche et nounou,faire garder son enfant", "parentalite"],
  ["parentalite-alimentation-enfant", "Alimentation de l'enfant", "diversification", "parentalite"],
  ["parentalite-developpement-enfant", "Développement de l'enfant", "étapes du développement,grandir", "parentalite"],
  ["parentalite-lecture-enfant", "Lecture aux enfants", "lire une histoire,livres pour le soir", "parentalite"],

  // ── Entrepreneuriat (compléments) ─────────────────────────────────────
  ["entrepreneuriat-seo", "SEO", "référencement", "entrepreneuriat"],
  ["entrepreneuriat-publicite", "Publicité en ligne", "ads,sea", "entrepreneuriat"],
  ["entrepreneuriat-copywriting", "Copywriting", "écriture persuasive", "entrepreneuriat"],
  ["entrepreneuriat-newsletter", "Newsletter", "emailing", "entrepreneuriat"],
  ["entrepreneuriat-communaute", "Animer une communauté", "community management", "entrepreneuriat"],
  ["entrepreneuriat-service-client", "Service client", "relation client,satisfaction client", "entrepreneuriat"],
  ["entrepreneuriat-recrutement", "Recrutement", "embaucher", "entrepreneuriat"],
  ["entrepreneuriat-management", "Management", "manager une équipe", "entrepreneuriat"],
  ["entrepreneuriat-teletravail", "Télétravail", "travail à distance", "entrepreneuriat"],
  ["entrepreneuriat-coworking", "Coworking", "espace partagé", "entrepreneuriat"],
  ["entrepreneuriat-business-plan", "Business plan", "prévisionnel", "entrepreneuriat"],
  ["entrepreneuriat-statut", "Statut juridique", "micro-entreprise,sasu,auto-entrepreneur", "entrepreneuriat"],
  ["entrepreneuriat-prix", "Prix et marges", "tarification", "entrepreneuriat"],
  ["entrepreneuriat-export", "Export et international", "vendre à l'étranger,marchés étrangers", "entrepreneuriat"],
  ["entrepreneuriat-sourcing", "Sourcing et fournisseurs", "trouver des fournisseurs,approvisionnement", "entrepreneuriat"],
  ["entrepreneuriat-logistique", "Logistique et expédition", "expédier,gestion des envois", "entrepreneuriat"],
  ["entrepreneuriat-boutique", "Boutique physique", "commerce de proximité", "entrepreneuriat"],
  ["entrepreneuriat-marches", "Marchés et salons", "foires,stands", "entrepreneuriat"],
  ["entrepreneuriat-consulting", "Conseil", "consulting", "entrepreneuriat"],
  ["entrepreneuriat-formation-en-ligne", "Vendre de la formation", "infoproduit", "entrepreneuriat"],
  ["entrepreneuriat-affiliation", "Affiliation", "programme d'affiliation,commission sur vente", "entrepreneuriat"],
  ["entrepreneuriat-print-on-demand", "Print on demand", "impression à la demande", "entrepreneuriat"],
  ["entrepreneuriat-reprise", "Reprise d'entreprise", "rachat", "entrepreneuriat"],
  ["entrepreneuriat-ess", "Économie sociale et solidaire", "ess,coopérative,scop", "entrepreneuriat"],

  // ── Finance (compléments) ─────────────────────────────────────────────
  ["finance-pea", "PEA", "plan d'épargne en actions,compte pea", "finance"],
  ["finance-livrets", "Livrets et épargne réglementée", "livret a", "finance"],
  ["finance-scpi", "SCPI", "pierre papier", "finance"],
  ["finance-crowdfunding", "Financement participatif", "crowdfunding", "finance"],
  ["finance-obligations", "Obligations", "titres obligataires,marché obligataire", "finance"],
  ["finance-matieres-premieres", "Matières premières", "or,métaux précieux", "finance"],
  ["finance-dividendes", "Dividendes", "rente", "finance"],
  ["finance-dca", "Investissement programmé", "dca", "finance"],
  ["finance-analyse-technique", "Analyse technique", "chartisme", "finance"],
  ["finance-succession", "Transmission et succession", "héritage,donation", "finance"],
  ["finance-assurance", "Assurances", "prévoyance", "finance"],
  ["finance-surendettement", "Sortir du surendettement", "dettes", "finance"],
  ["finance-salaire", "Négociation salariale", "augmentation", "finance"],
  ["finance-expatriation-finance", "Finances de l'expatrié", "finances à l'étranger,fiscalité de l'expatrié", "finance"],

  // ── Parentalité (compléments) ─────────────────────────────────────────
  ["parentalite-portage", "Portage", "écharpe de portage", "parentalite"],
  ["parentalite-couches-lavables", "Couches lavables", "couches réutilisables,langes lavables", "parentalite"],
  ["parentalite-motricite", "Motricité libre", "motricité de bébé,laisser bouger librement", "parentalite"],
  ["parentalite-montessori", "Montessori", "pédagogies alternatives", "parentalite"],
  ["parentalite-ecrans-enfants", "Écrans et enfants", "écrans et enfance,limiter les écrans", "parentalite"],
  ["parentalite-fratrie", "Fratrie", "frères et sœurs", "parentalite"],
  ["parentalite-emotions", "Émotions de l'enfant", "éducation bienveillante", "parentalite"],
  ["parentalite-hpi", "Enfant à haut potentiel", "précoce", "parentalite"],
  ["parentalite-dys", "Troubles dys", "dyslexie,dyspraxie", "parentalite"],
  ["parentalite-handicap-enfant", "Enfant en situation de handicap", "enfant handicapé,accompagner un enfant différent", "parentalite"],
  ["parentalite-voyage-enfants", "Voyager avec des enfants", "partir avec des enfants,vacances avec bébé", "parentalite"],
  ["parentalite-anniversaires", "Anniversaires et fêtes", "fête d'anniversaire,organiser une fête", "parentalite"],
  ["parentalite-loisirs-creatifs", "Loisirs créatifs enfants", "activités manuelles", "parentalite"],
  ["parentalite-sport-famille", "Sport en famille", "bouger en famille,activité sportive familiale", "parentalite"],
  ["parentalite-grands-parents", "Grands-parents", "papi et mamie,rôle des grands-parents", "parentalite"],
  ["parentalite-adoption", "Adoption", "adopter un enfant,parcours d'adoption", "parentalite"],
  ["parentalite-pma", "PMA", "procréation médicalement assistée,fiv", "parentalite"],
  ["parentalite-conge", "Congé parental", "congé maternité,congé paternité", "parentalite"],
  ["parentalite-budget-famille", "Budget familial", "budget avec enfants,dépenses familiales", "parentalite"],
  ["parentalite-couple", "Vie de couple", "couple,relation amoureuse", "parentalite"],
  ["parentalite-amitie", "Amitié", "amis,se faire des amis", "parentalite"],
  ["parentalite-deuil", "Deuil", "perdre un proche,accompagner un deuil", "parentalite"],
  ["parentalite-solitude", "Rompre la solitude", "isolement,rencontrer du monde", "parentalite"],
  ["parentalite-cuisine-enfants", "Cuisiner en famille", "cuisiner à plusieurs générations,repas partagé en famille", "parentalite"],
];
