/* ═══════════════════════════════════════════════════════════════════════════
   RÉFÉRENTIEL PLAT DES PASSIONS — sport et mouvement
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

  // ── Sport ────────────────────────────────────────────
  ["sport", "Sport", "sports,activité physique", "", { emoji: "🏋️", color: "#8b5cf6", pop: 1, broad: 1 }],
  ["sport-athletisme", "Athlétisme", "athlé", "sport"],
  ["sport-gymnastique", "Gymnastique", "gym artistique", "sport"],
  ["sport-escalade", "Escalade", "grimpe,grimper,voie", "sport", { pop: 1 }],
  ["sport-equitation", "Équitation", "cheval,poney", "sport"],
  ["sport-tir-a-l-arc", "Tir à l'arc", "arc,tirer à l'arc", "sport"],
  ["sport-escrime", "Escrime", "fleuret,épée et sabre", "sport"],
  ["sport-tennis", "Tennis", "jouer au tennis,court de tennis", "sport"],
  ["sport-padel", "Padel", "jouer au padel,piste de padel", "sport"],
  ["sport-badminton", "Badminton", "badm", "sport"],
  ["sport-tennis-de-table", "Tennis de table", "ping-pong,pingpong", "sport"],
  ["sport-squash", "Squash", "jouer au squash,court de squash", "sport"],
  ["sport-triathlon", "Triathlon", "ironman", "sport"],
  ["sport-marche-sportive", "Marche sportive", "marche rapide", "sport"],
  ["sport-handisport", "Handisport", "sport adapté", "sport"],
  ["sport-coaching-sportif", "Coaching sportif", "coach", "sport"],
  ["sport-preparation-physique", "Préparation physique", "prépa physique", "sport"],
  ["sport-arbitrage", "Arbitrage", "arbitre,siffler un match", "sport"],
  ["sport-patinage", "Patinage", "patin à glace", "sport"],
  ["sport-roller", "Roller", "rollers,patin à roulettes", "sport"],
  ["sport-parkour", "Parkour", "freerun", "sport"],
  ["sport-sport-en-salle", "Sport en salle", "pratique en intérieur,sport indoor", "sport"],
  ["sport-competition", "Compétition", "compétitions,niveau compétition", "sport"],

  // ── Sports de combat ────────────────────────────────────────────
  ["combat", "Sports de combat", "arts martiaux,combat,ring", "", { emoji: "🥊", color: "#8b5cf6", pop: 1, broad: 1 }],
  ["combat-boxe", "Boxe anglaise", "boxe", "combat"],
  ["combat-boxe-thai", "Boxe thaï", "muay thai,muay-thaï", "combat"],
  ["combat-kickboxing", "Kickboxing", "kick boxing", "combat"],
  ["combat-mma", "MMA", "arts martiaux mixtes,free fight", "combat"],
  ["combat-judo", "Judo", "judoka,dojo de judo", "combat"],
  ["combat-jujitsu", "Ju-jitsu", "jiu-jitsu traditionnel,art martial japonais complet", "combat"],
  ["combat-jjb", "Jiu-jitsu brésilien", "jjb,bjj", "combat"],
  ["combat-karate", "Karaté", "karaté do,kata de karaté", "combat"],
  ["combat-taekwondo", "Taekwondo", "taekwondoïste,art martial coréen", "combat"],
  ["combat-aikido", "Aïkido", "aïkidoka,art martial japonais souple", "combat"],
  ["combat-lutte", "Lutte", "lutte libre,lutte gréco-romaine", "combat"],
  ["combat-krav-maga", "Krav-maga", "krav,défense israélienne", "combat"],
  ["combat-kung-fu", "Kung-fu", "wushu", "combat"],
  ["combat-capoeira", "Capoeira", "roda,art martial brésilien", "combat"],
  ["combat-sambo", "Sambo", "sambo sportif,lutte russe", "combat"],
  ["combat-self-defense", "Self-défense", "défense personnelle", "combat"],
  ["combat-savate", "Savate", "boxe française", "combat"],

  // ── Sports collectifs ────────────────────────────────────────────
  ["collectif", "Sports collectifs", "sport co,équipe,club", "", { emoji: "⚽", color: "#7c3aed", pop: 1, broad: 1 }],
  ["collectif-football", "Football", "foot,soccer", "collectif", { pop: 1 }],
  ["collectif-futsal", "Futsal", "foot en salle", "collectif"],
  ["collectif-rugby", "Rugby", "rugby à XV", "collectif"],
  ["collectif-rugby-a-7", "Rugby à 7", "seven", "collectif"],
  ["collectif-basketball", "Basketball", "basket", "collectif"],
  ["collectif-handball", "Handball", "hand", "collectif"],
  ["collectif-volleyball", "Volleyball", "volley", "collectif"],
  ["collectif-beach-volley", "Beach-volley", "volley de plage", "collectif"],
  ["collectif-hockey-sur-gazon", "Hockey sur gazon", "hockey gazon,field hockey", "collectif"],
  ["collectif-hockey-sur-glace", "Hockey sur glace", "hockey glace,patinoire hockey", "collectif"],
  ["collectif-water-polo", "Water-polo", "polo aquatique,waterpolo", "collectif"],
  ["collectif-baseball", "Baseball", "batte et balle,jouer au baseball", "collectif"],
  ["collectif-football-americain", "Football américain", "foot us", "collectif"],
  ["collectif-ultimate", "Ultimate frisbee", "frisbee", "collectif"],

  // ── Glisse et board ────────────────────────────────────────────
  ["glisse", "Glisse et board", "board,glisse", "", { emoji: "🏄", color: "#8b5cf6", broad: 1 }],
  ["glisse-skateboard", "Skateboard", "skate", "glisse"],
  ["glisse-longboard", "Longboard", "planche longue,cruiser", "glisse"],
  ["glisse-surf", "Surf", "surfer,prendre des vagues", "glisse"],
  ["glisse-bodyboard", "Bodyboard", "planche courte allongée,body", "glisse"],
  ["glisse-paddle", "Paddle", "stand up paddle,sup", "glisse"],
  ["glisse-snowboard", "Snowboard", "snow", "glisse"],
  ["glisse-ski-alpin", "Ski alpin", "ski", "glisse"],
  ["glisse-ski-de-fond", "Ski de fond", "ski nordique,skating et classique", "glisse"],
  ["glisse-ski-de-randonnee", "Ski de randonnée", "ski de rando", "glisse"],
  ["glisse-freeride", "Freeride", "hors-piste", "glisse"],
  ["glisse-kitesurf", "Kitesurf", "kite", "glisse"],
  ["glisse-windsurf", "Windsurf", "planche à voile", "glisse"],
  ["glisse-wingfoil", "Wingfoil", "wing", "glisse"],
  ["glisse-wakeboard", "Wakeboard", "wake,planche tractée", "glisse"],
  ["glisse-ski-nautique", "Ski nautique", "skis tractés,ski derrière bateau", "glisse"],
  ["glisse-trottinette-freestyle", "Trottinette freestyle", "trott", "glisse"],

  // ── Montagne et outdoor ────────────────────────────────────────────
  ["outdoor", "Montagne et outdoor", "plein air", "", { emoji: "🥾", color: "#7c3aed", broad: 1 }],
  ["outdoor-randonnee", "Randonnée", "rando,marche", "outdoor"],
  ["outdoor-trekking", "Trekking", "trek", "outdoor"],
  ["outdoor-alpinisme", "Alpinisme", "haute montagne", "outdoor"],
  ["outdoor-via-ferrata", "Via ferrata", "ferrata,parcours câblé", "outdoor"],
  ["outdoor-canyoning", "Canyoning", "canyon", "outdoor"],
  ["outdoor-speleologie", "Spéléologie", "spéléo,grotte", "outdoor"],
  ["outdoor-bivouac", "Bivouac", "bivouaquer,nuit dehors", "outdoor"],
  ["outdoor-camping", "Camping", "camper,sous la tente", "outdoor"],
  ["outdoor-bushcraft", "Bushcraft", "vie en forêt,techniques de plein air", "outdoor"],
  ["outdoor-survie", "Survie", "survivalisme", "outdoor"],
  ["outdoor-course-orientation", "Course d'orientation", "orientation", "outdoor"],
  ["outdoor-raquettes-a-neige", "Raquettes à neige", "raquettes,marcher dans la neige", "outdoor"],
  ["outdoor-cascade-de-glace", "Cascade de glace", "escalade sur glace,piolets", "outdoor"],
  ["outdoor-slackline", "Slackline", "sangle tendue,marcher sur sangle", "outdoor"],
  ["outdoor-geocaching", "Géocaching", "chasse au trésor gps,caches à trouver", "outdoor"],
  ["outdoor-cueillette", "Cueillette", "cueillir,ramasser en nature", "outdoor"],
  ["outdoor-escalade-bloc", "Escalade de bloc", "bloc,bouldering", "outdoor"],
  ["outdoor-parapente", "Parapente", "vol libre", "outdoor"],

  // ── Course à pied ────────────────────────────────────────────
  ["running", "Course à pied", "running,jogging,footing,courir", "", { emoji: "🏃", color: "#8b5cf6", pop: 1, broad: 1 }],
  ["running-trail", "Trail", "trail running", "running", { pop: 1 }],
  ["running-marathon", "Marathon", "42 km,courir un marathon", "running"],
  ["running-semi-marathon", "Semi-marathon", "semi", "running"],
  ["running-dix-km", "10 km", "dix kilomètres,course de 10 km", "running"],
  ["running-ultra-trail", "Ultra-trail", "ultra", "running"],
  ["running-cross", "Cross", "cross-country", "running"],
  ["running-piste", "Course sur piste", "piste d'athlétisme,tours de piste", "running"],
  ["running-course-obstacles", "Course à obstacles", "spartan,ocr", "running"],
  ["running-running-urbain", "Running urbain", "courir en ville,run urbain", "running"],
  ["running-fractionne", "Fractionné", "interval", "running"],
  ["running-preparation-course", "Préparation de course", "préparer une course,plan de course", "running"],
  ["running-course-nature", "Course nature", "courir en nature,sortie nature", "running"],
  ["running-relais", "Relais", "ekiden", "running"],

  // ── Musculation et fitness ────────────────────────────────────────────
  ["fitness", "Musculation et fitness", "gym,fitness,salle", "", { emoji: "💪", color: "#7c3aed", pop: 1, broad: 1 }],
  ["fitness-musculation", "Musculation", "muscu,fonte,salle de sport", "fitness", { pop: 1 }],
  ["fitness-crossfit", "CrossFit", "cross training", "fitness"],
  ["fitness-halterophilie", "Haltérophilie", "haltéro", "fitness"],
  ["fitness-street-workout", "Street workout", "barres de rue,entraînement au parc", "fitness"],
  ["fitness-calisthenics", "Callisthénie", "calisthenics,poids du corps", "fitness"],
  ["fitness-hiit", "HIIT", "fractionné intense,intervalles courts", "fitness"],
  ["fitness-cardio", "Cardio", "travail cardio,endurance cardio", "fitness"],
  ["fitness-renforcement-musculaire", "Renforcement musculaire", "renfo", "fitness"],
  ["fitness-powerlifting", "Powerlifting", "force athlétique", "fitness"],
  ["fitness-bodybuilding", "Bodybuilding", "culturisme", "fitness"],
  ["fitness-kettlebell", "Kettlebell", "girya,poids russe", "fitness"],
  ["fitness-trx", "TRX", "sangles", "fitness"],
  ["fitness-spinning", "Spinning", "biking,rpm", "fitness"],
  ["fitness-aquagym", "Aquagym", "gym en piscine,gym aquatique", "fitness"],
  ["fitness-stretching", "Stretching", "s'étirer,assouplissement", "fitness"],
  ["fitness-fitness-maison", "Fitness à la maison", "home gym", "fitness"],
  ["fitness-prise-de-masse", "Prise de masse", "prendre du muscle,bulk", "fitness"],
  ["fitness-seche", "Sèche", "sécher,perte de gras", "fitness"],

  // ── Vélo et cyclisme ────────────────────────────────────────────
  ["cyclisme", "Vélo et cyclisme", "vélo,velo,bike,cyclisme,bicyclette", "", { emoji: "🚴", color: "#8b5cf6", broad: 1 }],
  ["cyclisme-route", "Vélo de route", "vélo sur route,sortie route", "cyclisme"],
  ["cyclisme-vtt", "VTT", "mountain bike", "cyclisme"],
  ["cyclisme-gravel", "Gravel", "vélo gravel,chemins et bitume", "cyclisme"],
  ["cyclisme-bmx", "BMX", "bicross,vélo bmx", "cyclisme"],
  ["cyclisme-piste-velo", "Piste", "vélodrome,cyclisme sur piste", "cyclisme"],
  ["cyclisme-cyclocross", "Cyclo-cross", "cross vélo,vélo dans la boue", "cyclisme"],
  ["cyclisme-descente", "Descente", "dh,downhill", "cyclisme"],
  ["cyclisme-velo-electrique", "Vélo électrique", "vae,vélo élec", "cyclisme"],
  ["cyclisme-cyclotourisme", "Cyclotourisme", "cyclo", "cyclisme"],
  ["cyclisme-bikepacking", "Bikepacking", "voyage à vélo léger,sacoches vélo", "cyclisme"],
  ["cyclisme-velotaf", "Vélotaf", "vélo au travail", "cyclisme"],
  ["cyclisme-fixie", "Fixie", "pignon fixe", "cyclisme"],
  ["cyclisme-mecanique-velo", "Mécanique vélo", "réparer son vélo,entretien vélo", "cyclisme"],
  ["cyclisme-course-sur-route", "Course sur route", "courses cyclistes,peloton", "cyclisme"],
  ["cyclisme-enduro-vtt", "Enduro VTT", "vtt enduro,descente et montée", "cyclisme"],
  ["cyclisme-trial-velo", "Trial vélo", "vélo trial,franchissement", "cyclisme"],

  // ── Sports de précision et de loisir ──────────────────────────────────
  ["sport-golf", "Golf", "practice,green,parcours de golf", "sport"],
  ["sport-petanque", "Pétanque", "boules,boulodrome", "sport"],
  ["sport-boules-lyonnaises", "Boules lyonnaises", "sport-boules", "sport"],
  ["sport-billard", "Billard", "snooker,blackball,billard français", "sport"],
  ["sport-flechettes", "Fléchettes", "darts", "sport"],
  ["sport-bowling", "Bowling", "jouer au bowling,quilles", "sport"],
  ["sport-tir-sportif", "Tir sportif", "tir à la carabine,tir au pistolet", "sport"],
  ["sport-molkky", "Mölkky", "molky", "sport"],
  ["sport-trampoline", "Trampoline", "trampoline sportif,sauts au trampoline", "sport"],
  ["sport-biathlon", "Biathlon", "ski et tir,biathlète", "sport"],
  ["sport-pentathlon", "Pentathlon moderne", "pentathlon,cinq épreuves", "sport"],
  ["sport-pelote", "Pelote basque", "cesta punta", "sport"],
  ["sport-crosse", "Crosse et lacrosse", "lacrosse", "sport"],
  ["sport-cheerleading", "Cheerleading", "pom-pom girls", "sport"],
  ["sport-musculation-douce", "Gym douce", "gymnastique douce,gym senior", "sport"],
  ["sport-course-obstacles-militaire", "Parcours du combattant", "obstacle militaire", "sport"],
  ["sport-yoga-sportif", "Mobilité et souplesse", "mobility,souplesse", "sport"],
  ["sport-recuperation", "Récupération sportive", "récup,soins du sportif", "sport"],
  ["sport-nutrition-sportive", "Nutrition sportive", "diététique du sport", "sport"],
  ["sport-mental", "Préparation mentale", "mental du sportif", "sport"],
  ["sport-blessures", "Prévention des blessures", "kiné du sport,rééducation", "sport"],
  ["sport-benevolat-club", "Vie de club", "club sportif,dirigeant", "sport"],
  ["sport-spectateur", "Suivre le sport", "regarder le sport,supporter", "sport"],

  // ── Sports de combat (compléments) ────────────────────────────────────
  ["combat-sumo", "Sumo", "lutte japonaise,rikishi", "combat"],
  ["combat-kendo", "Kendo", "sabre japonais", "combat"],
  ["combat-iaido", "Iaïdo", "art du dégainé,katana iaido", "combat"],
  ["combat-wing-chun", "Wing chun", "kung-fu wing chun,art martial chinois du sud", "combat"],
  ["combat-systema", "Systema", "systema russe,art martial russe", "combat"],
  ["combat-grappling", "Grappling", "lutte au sol", "combat"],
  ["combat-full-contact", "Full contact", "boxe américaine,kick full", "combat"],
  ["combat-pancrace", "Pancrace", "lutte antique,combat mixte ancien", "combat"],
  ["combat-ninjutsu", "Ninjutsu", "art du ninja,budo taijutsu", "combat"],
  ["combat-hapkido", "Hapkido", "self-défense coréenne,hapki do", "combat"],
  ["combat-viet-vo-dao", "Viêt vo dao", "art martial vietnamien,vovinam", "combat"],
  ["combat-silat", "Penchak silat", "silat", "combat"],
  ["combat-kali", "Kali et escrima", "arnis", "combat"],
  ["combat-tai-jitsu", "Taï jitsu", "self-défense japonaise,taijitsu", "combat"],
  ["combat-preparation-combat", "Préparation au combat", "prépa combat,sparring", "combat"],
  ["combat-arbitrage-combat", "Arbitrage de combat", "juger un combat,arbitre de ring", "combat"],

  // ── Sports collectifs (compléments) ───────────────────────────────────
  ["collectif-gardien", "Gardien de but", "goal,gardien,portier", "collectif"],
  ["collectif-foot-a-5", "Football à 5", "foot à 5,five", "collectif"],
  ["collectif-foot-feminin", "Football féminin", "foot féminin,football femmes", "collectif"],
  ["collectif-basket-3x3", "Basket 3x3", "streetball", "collectif"],
  ["collectif-cricket", "Cricket", "jouer au cricket,batteur cricket", "collectif"],
  ["collectif-netball", "Netball", "jouer au netball,sport de paniers", "collectif"],
  ["collectif-floorball", "Floorball", "unihockey", "collectif"],
  ["collectif-rink-hockey", "Rink hockey", "hockey sur patins", "collectif"],
  ["collectif-tchoukball", "Tchoukball", "jouer au tchoukball,cadre rebond", "collectif"],
  ["collectif-kin-ball", "Kin-ball", "kinball,gros ballon collectif", "collectif"],
  ["collectif-flag-football", "Flag football", "football sans contact,flag", "collectif"],
  ["collectif-sport-corpo", "Sport en entreprise", "sport corpo,tournoi d'entreprise", "collectif"],
  ["collectif-coach-equipe", "Entraîner une équipe", "entraîneur,coach d'équipe", "collectif"],

  // ── Glisse (compléments) ──────────────────────────────────────────────
  ["glisse-ski-freestyle", "Ski freestyle", "big air,slopestyle", "glisse"],
  ["glisse-mountainboard", "Mountainboard", "planche tout-terrain,board de montagne", "glisse"],
  ["glisse-snowkite", "Snowkite", "cerf-volant sur neige,kite neige", "glisse"],
  ["glisse-foil", "Foil", "hydrofoil", "glisse"],
  ["glisse-skimboard", "Skimboard", "planche de bord de plage,skim", "glisse"],
  ["glisse-luge", "Luge", "faire de la luge,descente en luge", "glisse"],
  ["glisse-bobsleigh", "Bobsleigh", "skeleton", "glisse"],
  ["glisse-ski-de-vitesse", "Ski de vitesse", "kl", "glisse"],
  ["glisse-telemark", "Télémark", "ski télémark,talon libre", "glisse"],
  ["glisse-splitboard", "Splitboard", "snowboard de randonnée,planche séparable", "glisse"],
  ["glisse-surf-riviere", "Surf de rivière", "river surf", "glisse"],
  ["glisse-entretien-materiel", "Entretien du matériel de glisse", "fartage,affûtage", "glisse"],

  // ── Montagne et outdoor (compléments) ─────────────────────────────────
  ["outdoor-marche-nordique", "Marche nordique", "nordic walking", "outdoor"],
  ["outdoor-gr", "Sentiers GR", "gr20,grande randonnée", "outdoor"],
  ["outdoor-refuges", "Refuges et gîtes d'étape", "refuge de montagne,gîte d'étape", "outdoor"],
  ["outdoor-highline", "Highline", "sangle en hauteur,slackline haute", "outdoor"],
  ["outdoor-ski-alpinisme", "Ski-alpinisme", "ski alpi", "outdoor"],
  ["outdoor-escalade-salle", "Escalade en salle", "salle de bloc,mur d'escalade", "outdoor"],
  ["outdoor-trail-orientation", "Course d'aventure", "raid multisport", "outdoor"],
  ["outdoor-topo", "Lecture de carte", "topographie,boussole", "outdoor"],
  ["outdoor-materiel-rando", "Matériel de randonnée", "sac à dos,équipement outdoor", "outdoor"],
  ["outdoor-secours-montagne", "Sécurité en montagne", "avalanche,dva,nivologie", "outdoor"],
  ["outdoor-trekking-longue-distance", "Longue distance", "thru-hike,traversée", "outdoor"],
  ["outdoor-hamac", "Bivouac en hamac", "hamac", "outdoor"],

  // ── Course à pied (compléments) ───────────────────────────────────────
  ["running-course-montagne", "Course en montagne", "kilomètre vertical", "running"],
  ["running-parkrun", "Courses populaires", "parkrun,course caritative", "running"],
  ["running-vma", "VMA et allures", "allure,seuil", "running"],
  ["running-club-course", "Club de course", "groupe de running", "running"],
  ["running-chaussures", "Chaussures de course", "matériel de running", "running"],
  ["running-marche-course", "Reprise de la course", "débuter la course", "running"],

  // ── Musculation et fitness (compléments) ──────────────────────────────
  ["fitness-strongman", "Strongman", "hommes forts,force athlétique lourde", "fitness"],
  ["fitness-rameur", "Rameur", "ergomètre", "fitness"],
  ["fitness-circuit", "Circuit training", "circuit d'exercices,enchaînement d'ateliers", "fitness"],
  ["fitness-mobilite", "Mobilité articulaire", "gagner en souplesse,amplitude articulaire", "fitness"],
  ["fitness-prenatal", "Sport prénatal et postnatal", "sport enceinte,remise en forme après bébé", "fitness"],
  ["fitness-senior", "Sport senior", "sport après 60 ans,gym douce senior", "fitness"],
  ["fitness-programmation", "Programmation d'entraînement", "plan d'entraînement", "fitness"],
  ["fitness-suivi", "Suivi de progression", "carnet d'entraînement", "fitness"],

  // ── Vélo (compléments) ────────────────────────────────────────────────
  ["cyclisme-cargo", "Vélo cargo", "biporteur,triporteur", "cyclisme"],
  ["cyclisme-pliant", "Vélo pliant", "brompton", "cyclisme"],
  ["cyclisme-couche", "Vélo couché", "vélomobile", "cyclisme"],
  ["cyclisme-vintage", "Vélo vintage", "vélo ancien", "cyclisme"],
  ["cyclisme-famille", "Vélo en famille", "vélo avec les enfants,balade familiale à vélo", "cyclisme"],
  ["cyclisme-securite", "Sécurité à vélo", "circulation à vélo", "cyclisme"],
  ["cyclisme-home-trainer", "Home trainer", "zwift,vélo d'intérieur", "cyclisme"],
  ["cyclisme-suivre-cyclisme", "Suivre le cyclisme", "tour de france,grands tours", "cyclisme"],
];
