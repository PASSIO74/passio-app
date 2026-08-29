/* ============================================================
   PASSIO MVP BETA · Application Logic
   BUILD-BUMP: 2026-07-06 (force refresh cache SW tous appareils)
   ============================================================ */

// jQuery replacement: $ = getElementById shortcut
function $(id) {
  return document.getElementById(id);
}

// ⚙️ SYSTÈME DE DIAGNOSTIC VISUEL RÉUTILISABLE
window._DEBUG_MODE = false;
window._diagMessages = [];
function _diag(msg) {
  if(window._DEBUG_MODE) {
    window._diagMessages.push({text: msg, time: new Date().toLocaleTimeString()});
    console.log("🔧", msg);
    _updateDiagPanel();
  }
}
function _updateDiagPanel() {
  var panel = document.getElementById("__diag_panel");
  if(!panel) return;
  var html = '<div style="padding:8px;font-size:11px;max-height:200px;overflow-y:auto;">';
  window._diagMessages.slice(-20).forEach(function(m) {
    html += '<div style="margin:2px 0;padding:2px;border-left:2px solid #ff9800;padding-left:6px;">' +
      '<span style="color:#999;font-size:9px;">' + m.time + '</span> ' +
      escapeHtml(m.text) + '</div>';
  });
  html += '</div>';
  panel.innerHTML = html;
}
// Toggle diagnostic panel
function toggleDiagPanel() {
  window._DEBUG_MODE = !window._DEBUG_MODE;
  var panel = document.getElementById("__diag_panel");
  var btn = document.getElementById("__diag_btn");
  if(window._DEBUG_MODE) {
    if(!panel) {
      panel = document.createElement("div");
      panel.id = "__diag_panel";
      panel.style.cssText = "position:fixed;bottom:20px;right:20px;width:300px;max-height:250px;background:#1a1a1a;border:2px solid #ff9800;border-radius:8px;z-index:99998;color:#fff;font-family:monospace;box-shadow:0 0 20px rgba(0,0,0,0.5);";
      document.body.appendChild(panel);
    }
    panel.style.display = "block";
    _updateDiagPanel();
    if(btn) {
      btn.style.display = "flex";
      btn.style.background = "#ff9800";
    }
  } else {
    if(panel) panel.style.display = "none";
    if(btn) {
      btn.style.display = "none";
      btn.style.background = "#666";
    }
  }
}

/* ============================================================
   PASSIO LOGO, inline SVG, two variants
   A = "Ascension"  (flèche haut-droite, blanc + magenta, fond violet clair)
   B = "Crescendo"  (3 ascending bars + arrowhead, indigo→orange)
   ============================================================ */
const LOGO_ASCENSION = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='gA' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23ddd6fe'/><stop offset='1' stop-color='%23a78bfa'/></linearGradient></defs><rect width='100' height='100' rx='22' fill='url(%23gA)'/><path d='M24 24 L76 24 L24 76' stroke='%23ffffff' stroke-width='13' stroke-linecap='round' stroke-linejoin='round' fill='none'/><path d='M76 24 L76 76' stroke='%234c1d95' stroke-width='13' stroke-linecap='round' fill='none'/></svg>";
const LOGO_CRESCENDO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='gB' x1='0' y1='1' x2='1' y2='0'><stop offset='0' stop-color='%23c4b5fd'/><stop offset='1' stop-color='%237c3aed'/></linearGradient></defs><rect width='100' height='100' rx='22' fill='url(%23gB)'/><g fill='%23ffffff'><rect x='20' y='60' width='14' height='22' rx='3'/><rect x='43' y='44' width='14' height='38' rx='3'/><rect x='66' y='26' width='14' height='56' rx='3'/><path d='M61 34 L85 34 L73 16 Z'/></g></svg>";
// Chosen variant persists in localStorage
let LOGO_VARIANT = (typeof localStorage !== "undefined" && localStorage.getItem("passio_logo_variant")) || "ascension";
let LOGO_SRC = LOGO_VARIANT === "crescendo" ? LOGO_CRESCENDO : LOGO_ASCENSION;
function setLogoVariant(v) {
  LOGO_VARIANT = v;
  LOGO_SRC = v === "crescendo" ? LOGO_CRESCENDO : LOGO_ASCENSION;
  try { localStorage.setItem("passio_logo_variant", v); } catch(e){}
  const ids = ["logoTopbar","logoOnb1","logoLanding"];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.src = LOGO_SRC; });
  if (typeof toast === "function") toast(v === "crescendo" ? "Logo : Crescendo" : "Logo : Ascension", "success");
}

// ======== PASSION CATALOG ========
const PASSIONS = [
  { id: "musique",    emoji: "🎸", label: "Musique",      color: "#8b5cf6", photo: "photo-1511671782779-c97d3d27a1d4" },
  { id: "photo",      emoji: "📷", label: "Photo",        color: "#8b5cf6", photo: "photo-1552168324-d612d77725e3" },
  { id: "voyage",     emoji: "🌍", label: "Voyage",       color: "#8b5cf6", photo: "photo-1488085061387-422e29b40080" },
  { id: "cuisine",    emoji: "🍳", label: "Cuisine",      color: "#7c3aed", photo: "photo-1556909114-f6e7ad7d3136" },
  { id: "sport",      emoji: "🏋️", label: "Sport",        color: "#8b5cf6", photo: "photo-1534438327276-14e5300c3a48" },
  { id: "litterature",emoji: "📚", label: "Littérature",  color: "#8b5cf6", photo: "photo-1521587760476-6c12a4b040da" },
  { id: "cinema",     emoji: "🎬", label: "Cinéma",       color: "#7c3aed", photo: "photo-1485846234645-a62644f84728" },
  { id: "tech",       emoji: "💻", label: "Tech / IA",    color: "#7c3aed", photo: "photo-1531746790731-6c087fecd65a" },
  { id: "art",        emoji: "🎨", label: "Art",          color: "#8b5cf6", photo: "photo-1513364776144-60967b0f800f" },
  { id: "jardinage",  emoji: "🌱", label: "Jardinage",    color: "#8b5cf6", photo: "photo-1416879595882-3373a0480b5b" },
  { id: "metier",     emoji: "🛠", label: "Artisanat",    color: "#6d28d9", photo: "photo-1513519245088-0e12902e5a38" },
  { id: "jeuxvideo",  emoji: "🎮", label: "Jeux vidéo",   color: "#8b5cf6", photo: "photo-1542751371-adc38448a05e" },
  { id: "yoga",       emoji: "🧘", label: "Yoga / Bien-être", color: "#8b5cf6", photo: "photo-1544367567-0f2fcb009e0b" },
  { id: "mode",       emoji: "👗", label: "Mode",         color: "#7c3aed", photo: "photo-1483985988355-763728e1935b" },
  { id: "danse",      emoji: "💃", label: "Danse",        color: "#8b5cf6", photo: "photo-1508700115892-45ecd05ae2ad" },
  { id: "podcast",    emoji: "🎙", label: "Podcast",      color: "#7c3aed", photo: "photo-1589903308904-1010c2294adc" },
  { id: "moto",       emoji: "🏍", label: "Moto",         color: "#64748b", photo: "photo-1558980664-10e7ec7b39cb" },
  { id: "animaux",    emoji: "🐾", label: "Animaux",      color: "#a78bfa", photo: "photo-1450778869180-41d0601e046e" },
  { id: "actu",       emoji: "🌍", label: "Actualité",    color: "#7c3aed", photo: "photo-1504711434969-e33886168f5c" },
];

// ======== ÉCONOMIE INTERNE — RETIRÉE (ADR-009) ========
// `RANKS`, `REWARDS` et `LIKES_PER_PASSIA` ont été supprimés avec le Wallet, les
// points, les rangs, les quêtes et les Passia. Aucun barème ne subsiste : le
// cœur produit est Passion → contenu → personne → conversation → IRL.

// ======== STATE ========
let state = null;
const STATE_KEY = "passio_mvp_state_v1";
// Filtre de passion actif dans le fil — variable globale directe, hors state/localStorage
let _activeFeedPassions = new Set(); // vide = rien afficher — l'utilisateur doit sélectionner au moins une passion
let _showFollowingFeed = false; // Affiche le contenu des gens qu'on suit

// Default seed (fake users / posts / events), built once at first launch
function buildSeed() {
  const now = Date.now();
  const hours = (h) => now - h * 3600000;
  const days = (d) => now - d * 86400000;

  const seedUsers = [
    { id: "u_lea",   name: "Léa Moreau",    avatar: "#8b5cf6", passion: "musique", mood: "creation", bio: "Guitariste passionnée · Lyon", profileEmoji: "🎸" },
    { id: "u_karim", name: "Karim Belkacem", avatar: "#8b5cf6", passion: "photo", mood: "chill", bio: "Photographe de rue · Paris", profileEmoji: "📷" },
    { id: "u_nina",  name: "Nina Costa",    avatar: "#8b5cf6", passion: "voyage", mood: "irl", bio: "Nomade digitale · Partout", profileEmoji: "🌍" },
    { id: "u_theo",  name: "Théo Roussel",  avatar: "#7c3aed", passion: "cuisine", mood: "learn", bio: "Chef à domicile · Marseille", profileEmoji: "🍳" },
    { id: "u_sofia", name: "Sofia Lindqvist", avatar: "#a78bfa", passion: "litterature", mood: "chill", bio: "Lectrice insatiable · Bordeaux", profileEmoji: "📚" },
    { id: "u_yanis", name: "Yanis Perez",    avatar: "#a78bfa", passion: "tech", mood: "learn", bio: "Vibe-coder IA · Toulouse", profileEmoji: "💻" },
    { id: "u_amira", name: "Amira Haddad",   avatar: "#a78bfa", passion: "danse", mood: "creation", bio: "Danseuse hip-hop · Lille", profileEmoji: "💃" },
    { id: "u_paul",  name: "Paul Lacroix",   avatar: "#7c3aed", passion: "metier", mood: "creation", bio: "Ébéniste · Tours", profileEmoji: "🛠" },
    { id: "u_emma",  name: "Emma Wright",   avatar: "#8b5cf6", passion: "yoga", mood: "chill", bio: "Prof yoga · Biarritz", profileEmoji: "🧘" },
    { id: "u_liam",  name: "Liam Dufresne",  avatar: "#7c3aed", passion: "podcast", mood: "learn", bio: "Podcasteur indé · Montréal", profileEmoji: "🎙" },
    { id: "u_zoe",   name: "Zoé Marchand",   avatar: "#7c3aed", passion: "mode", mood: "creation", bio: "Styliste upcycling · Paris", profileEmoji: "👗" },
    { id: "u_mehdi", name: "Mehdi Saïd",    avatar: "#8b5cf6", passion: "sport", mood: "irl", bio: "Trail runner · Annecy", profileEmoji: "🏃" },
    { id: "u_inès",  name: "Inès Vidal",     avatar: "#8b5cf6", passion: "art", mood: "creation", bio: "Illustratrice freelance · Nantes", profileEmoji: "🎨" },
    { id: "u_tom",   name: "Tom Larivière",   avatar: "#a78bfa", passion: "jeuxvideo", mood: "chill", bio: "Speedrunner Zelda · Rennes", profileEmoji: "🎮" },
    { id: "u_chloé", name: "Chloé Dubois",   avatar: "#a78bfa", passion: "yoga", mood: "chill", bio: "Naturopathe · Aix-en-Provence", profileEmoji: "🌿" },
    { id: "u_oussa", name: "Oussama Farid",   avatar: "#7c3aed", passion: "musique", mood: "creation", bio: "Beatmaker studio home · Saint-Denis", profileEmoji: "🎧" },
    { id: "u_clara", name: "Clara Jensen",    avatar: "#8b5cf6", passion: "voyage", mood: "irl", bio: "Cyclo-voyageuse · Copenhague→Rome", profileEmoji: "🚴" },
    { id: "u_noa",   name: "Noa Benhaim",     avatar: "#7c3aed", passion: "cinema", mood: "learn", bio: "Monteuse indé · Paris", profileEmoji: "🎬" },
    { id: "u_raph",  name: "Raphaël Thys",    avatar: "#8b5cf6", passion: "tech", mood: "creation", bio: "Designer produit IA · Bruxelles", profileEmoji: "✨" },
    { id: "u_mila",  name: "Mila Andreani",   avatar: "#8b5cf6", passion: "danse", mood: "irl", bio: "Prof contemporaine · Ajaccio", profileEmoji: "🩰" },
    { id: "u_jona",  name: "Jonas Weber",    avatar: "#a78bfa", passion: "sport", mood: "learn", bio: "Climber + coach mental · Chamonix", profileEmoji: "🧗" },
    { id: "u_anaïs", name: "Anaïs Tremblay",  avatar: "#a78bfa", passion: "litterature", mood: "creation", bio: "Poétesse · Québec", profileEmoji: "📝" },
    { id: "u_hugo",  name: "Hugo Martelli",   avatar: "#a78bfa", passion: "cuisine", mood: "chill", bio: "Pâtissier véganisant · Nice", profileEmoji: "🧁" },
    { id: "u_rita",  name: "Rita Kamara",     avatar: "#8b5cf6", passion: "mode", mood: "irl", bio: "Fashion week organizer · Dakar↔Paris", profileEmoji: "🧵" },
    { id: "u_lou",   name: "Lou Petit",       avatar: "#7c3aed", passion: "art", mood: "chill", bio: "Céramiste · Uzès", profileEmoji: "🏺" },
    { id: "u_sami",  name: "Sami Ouedraogo",  avatar: "#7c3aed", passion: "actu", mood: "actu", bio: "Journaliste indé · Bruxelles", profileEmoji: "🗞" },
    { id: "u_val",   name: "Valentine Roux",  avatar: "#7c3aed", passion: "actu", mood: "actu", bio: "Géopolitologue · Sciences Po", profileEmoji: "🌍" },
    { id: "u_kaoru", name: "Kaoru Tanaka",    avatar: "#8b5cf6", passion: "actu", mood: "actu", bio: "Correspondant Tokyo · desk international", profileEmoji: "🗺" },
    // Quatre passions du catalogue n'avaient AUCUN persona, donc aucun contenu :
    // un compte qui les cochait tombait sur un fil vide (2026-08-28).
    { id: "u_lucie", name: "Lucie Vernet",     avatar: "#8b5cf6", passion: "jardinage", mood: "chill", bio: "Permacultrice · Angers", profileEmoji: "🌱" },
    { id: "u_nabil", name: "Nabil Cherif",     avatar: "#7c3aed", passion: "jeuxvideo", mood: "creation", bio: "Créateur de jeux indé · Rennes", profileEmoji: "🎮" },
    { id: "u_greg",  name: "Greg Aubert",      avatar: "#a78bfa", passion: "moto", mood: "irl", bio: "Roadtrips et mécanique · Clermont-Ferrand", profileEmoji: "🏍" },
    { id: "u_maya",  name: "Maya Lorenzi",     avatar: "#a78bfa", passion: "animaux", mood: "learn", bio: "Comportementaliste canin · Toulouse", profileEmoji: "🐾" },
  ];

  const seedPosts = [
    // ========= CARNETS DE VOYAGE SEED =========
    // Carnet 2, Marrakech par Karim
    { id: "p_vlog_marrakech", authorId: "u_karim", passion: "voyage", mood: "chill", type: "vlog",
      destination: "Marrakech",
      dateStart: new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10),
      dateEnd: new Date(Date.now() - 56 * 86400000).toISOString().slice(0, 10),
      cover: "https://picsum.photos/seed/marrakech-cover/1280/720",
      tip: "Évite la place Jemaa el-Fna le 1er soir : trop intense quand on arrive fatigué. Garde-la pour le 2e soir.",
      budget: "420 € (5j)", transport: "Avion + taxi", lodging: "Riad dans la médina", season: "octobre-mars",
      steps: [
        { place: "Médina · Riad", text: "Premier thé à la menthe sur la terrasse. Le riad est magique, ruelles labyrinthiques. On se perd, c'est l'idée.", tip: "Tabe l'adresse exacte du riad sur ton tel, la médina est un vrai labyrinthe.", photo: "https://picsum.photos/seed/marrakech-riad/720/480", video: null, audio: null },
        { place: "Jardin Majorelle", text: "Bleu Majorelle qui contraste avec les cactus, calme absolu. Aller tôt le matin pour éviter les groupes.", tip: "Combiné avec le musée YSL voisin = matinée parfaite.", photo: "https://picsum.photos/seed/jardin-majorelle/720/480" },
        { place: "Souks", text: "Épices, cuir, tapis, bijoux. Marchander, mais avec le sourire. Café à la sortie pour récupérer.", tip: "Ne pas accepter le 1er prix. Diviser par 3-4 et négocier.", photo: "https://picsum.photos/seed/souks-marrakech/720/480" },
        { place: "Atlas (excursion)", text: "Excursion 1 jour dans la vallée de l'Ourika. Cascade, déjeuner berbère sur les rives.", tip: "Réserver via le riad, pas via les rabatteurs en ville.", photo: "https://picsum.photos/seed/atlas-mountains/720/480" },
        { place: "Place Jemaa el-Fna", text: "Au coucher du soleil. Conteurs, charmeurs de serpents, brochettes. Spectacle vivant.", tip: "Mange aux stands numérotés (recommandés par les locaux), pas aux premiers stands.", photo: "https://picsum.photos/seed/jemaa-elfna/720/480" },
      ],
      createdAt: Date.now() - 12 * 3600000, likes: 245, liked: false,
      comments: [
        { id: "c_marr_1", authorId: "u_lea", text: "Le bleu Majorelle me hante depuis des années. Faut que j'y aille.", createdAt: Date.now() - 11 * 3600000, likes: 12, likedBy: ["u_theo"], emojis: ["❤️", "🔥"], replies: [] },
        { id: "c_marr_2", authorId: "u_theo", text: "Tu peux partager le nom de ton riad en DM ?", createdAt: Date.now() - 10 * 3600000, likes: 3, likedBy: [], emojis: [], replies: [] },
      ]
    },

    // Carnet 3, Berlin par Léa
    { id: "p_vlog_berlin", authorId: "u_lea", passion: "voyage", mood: "creation", type: "vlog",
      destination: "Berlin",
      dateStart: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
      dateEnd: new Date(Date.now() - 86 * 86400000).toISOString().slice(0, 10),
      cover: "https://picsum.photos/seed/berlin-cover/1280/720",
      tip: "Achète une carte BVG 5 jours en arrivant : tram + bus + S-Bahn illimités. Game changer pour bouger entre les quartiers.",
      budget: "550 € (5j)", transport: "Train de nuit depuis Paris", lodging: "AirBnB Kreuzberg", season: "mai-septembre",
      steps: [
        { place: "Mitte · Brandenburger Tor", text: "Le 1er jour, marcher dans le centre historique. Mémorial de la Shoah, beaucoup d'émotion.", tip: "Visite guidée gratuite à 10h départ Brandenburger Tor, un must.", photo: "https://picsum.photos/seed/brandenburg-gate/720/480" },
        { place: "Kreuzberg · East Side Gallery", text: "Le mur de Berlin transformé en galerie street art. 1,3 km de fresques. Vélo loué pour faire toute la longueur.", tip: "Café local à proximité : Roamers (instagrammable mais bon).", photo: "https://picsum.photos/seed/east-side-gallery/720/480" },
        { place: "Friedrichshain (musique)", text: "Soirée concert dans une cave alternative. Ambiance underground, scène techno-rock locale très vivante.", tip: "Berghain trop touristique : préférer Salon Zur Wilden Renate ou Sisyphos pour l'authentique.", photo: "https://picsum.photos/seed/friedrichshain-music/720/480" },
        { place: "Prenzlauer Berg", text: "Brunch dominical, marché, ruelles cosy. Le Berlin tranquille. Mauerpark au coucher du soleil pour le karaoké géant.", tip: "Mauerpark karaoké : dimanche à 15h, gratuit, magique.", photo: "https://picsum.photos/seed/prenzlauer-berg/720/480" },
      ],
      createdAt: Date.now() - 24 * 3600000, likes: 312, liked: false,
      comments: [
        { id: "c_berlin_1", authorId: "u_yanis", text: "Mauerpark le dimanche, je suis 100 % d'accord, c'est mythique.", createdAt: Date.now() - 22 * 3600000, likes: 4, likedBy: [], emojis: [], replies: [] },
      ]
    },

    // Carnet 4, Tokyo par Sofia
    { id: "p_vlog_tokyo", authorId: "u_sofia", passion: "voyage", mood: "learn", type: "vlog",
      destination: "Tokyo · Kyoto",
      dateStart: new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10),
      dateEnd: new Date(Date.now() - 168 * 86400000).toISOString().slice(0, 10),
      cover: "https://picsum.photos/seed/tokyo-cover/1280/720",
      tip: "Le JR Pass se vend uniquement avant le départ depuis l'étranger. Si tu y penses sur place, trop tard. Achat 7 jours = 230 € env.",
      budget: "2 100 € (12j)", transport: "Avion + JR Pass + métro", lodging: "Mix hôtel capsule + ryokan", season: "mars-mai (sakura) ou octobre-novembre",
      steps: [
        { place: "Shibuya, Tokyo", text: "Arrivée jet-laggée au croisement le plus dense du monde. Premier ramen à 23h dans un bouge de 8 places. Indescriptible.", tip: "Téléchargez l'app Suica avant de partir, paiement transports + 7-Eleven sans cash.", photo: "https://picsum.photos/seed/shibuya-crossing/720/480" },
        { place: "Asakusa, Tokyo", text: "Senso-ji au lever du soleil, totalement vide. Petit-déj dans une yokocho de la gare. Authentique.", tip: "Allez à 6h30, le temple est désert et la lumière sublime.", photo: "https://picsum.photos/seed/asakusa-temple/720/480" },
        { place: "Akihabara · Otaku", text: "Plongée dans le quartier des manga, anime, jeux vidéo. Exhausting mais culte.", tip: "Pop Culture Café Shinkai pour le goûter manga-themed.", photo: "https://picsum.photos/seed/akihabara/720/480" },
        { place: "Kyoto · Fushimi Inari", text: "Train Shinkansen vers Kyoto (2h30 émotion technologique). Mille torii rouges, balade 2h, vue panoramique en haut.", tip: "Y aller à 17h pour avoir la lumière dorée et moins de monde.", photo: "https://picsum.photos/seed/fushimi-inari/720/480" },
        { place: "Arashiyama · forêt de bambous", text: "La forêt à 8h du matin, seule. Sons des bambous qui s'entrechoquent. Magique.", tip: "Combiner avec le pont Togetsukyo et le temple Tenryu-ji.", photo: "https://picsum.photos/seed/bamboo-forest/720/480" },
        { place: "Gion · soirée traditionnelle", text: "Ruelles d'Edo, dîner kaiseki dans une auberge familiale. Croisé une vraie geisha.", tip: "Réserver le restaurant 1 mois avant le départ, sinon impossible.", photo: "https://picsum.photos/seed/gion-evening/720/480" },
      ],
      createdAt: Date.now() - 48 * 3600000, likes: 489, liked: false,
      comments: [
        { id: "c_tokyo_1", authorId: "u_karim", text: "Le JR Pass conseil = sauveur de portefeuille. Confirmé.", createdAt: Date.now() - 46 * 3600000, likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "c_tokyo_2", authorId: "u_nina", text: "Tu m'as donné envie de réserver mon billet là maintenant.", createdAt: Date.now() - 44 * 3600000, likes: 3, likedBy: [], emojis: [], replies: [] },
      ]
    },

    // Carnet 5, Bretagne par Théo
    { id: "p_vlog_bretagne", authorId: "u_theo", passion: "voyage", mood: "chill", type: "vlog",
      destination: "Bretagne · Tour côtier",
      dateStart: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
      dateEnd: new Date(Date.now() - 23 * 86400000).toISOString().slice(0, 10),
      cover: "https://picsum.photos/seed/bretagne-cover/1280/720",
      tip: "La météo bretonne change toutes les 2h. Pars équipé pluie ET soleil, peu importe la prévision. C'est une règle.",
      budget: "380 € (8j) en covoiturage", transport: "Voiture · vélo location", lodging: "Camping côte sauvage", season: "mai-septembre",
      steps: [
        { place: "Saint-Malo", text: "Remparts au coucher du soleil, marée à 13 m. La cité corsaire mérite 2 jours pour bien la sentir.", tip: "Marée basse pour aller à Grand Bé à pied. Vérifier les horaires.", photo: "https://picsum.photos/seed/saint-malo/720/480" },
        { place: "Cap Fréhel", text: "Falaises rouges 70 m de haut, phare emblématique. Vu un fou de Bassan plonger.", tip: "Arrivée à 17h, les bus touristiques sont partis. Lumière dorée garantie.", photo: "https://picsum.photos/seed/cap-frehel/720/480" },
        { place: "Côte de granit rose", text: "Ploumanac'h, sentier des douaniers. Pierres roses sculptées par la mer. Pure carte postale.", tip: "Marée basse = on peut marcher entre les rochers. Marée haute = panoramas.", photo: "https://picsum.photos/seed/granit-rose/720/480" },
        { place: "Quiberon · Côte sauvage", text: "Vélo sur la presqu'île, 14 km. Galettes complètes au feu de bois le soir.", tip: "Crêperie La Korrigane à Saint-Pierre-Quiberon, demande à parler avec Yann.", photo: "https://picsum.photos/seed/quiberon-cote/720/480" },
      ],
      createdAt: Date.now() - 6 * 3600000, likes: 167, liked: false,
      comments: [
        { id: "c_bret_1", authorId: "u_emma", text: "La crêperie de Yann je connais ! Trop bien.", createdAt: Date.now() - 5 * 3600000, likes: 2, likedBy: [], emojis: [], replies: [] },
      ]
    },

    // Carnet 1, Lisbonne (déjà existant) par Nina
    { id: "p_vlog_nina", authorId: "u_nina", passion: "voyage", mood: "chill", type: "vlog",
      destination: "Lisbonne · Sintra · Cascais",
      dateStart: new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10),
      dateEnd: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
      cover: "https://picsum.photos/seed/lisbon-cover/1280/720",
      tip: "Achète le pass 24h tramway+train dès le 1er jour, ça change tout pour bouger entre Sintra et Cascais sans stresser.",
      budget: "650 € (7j)", transport: "Avion + tram + train", lodging: "Auberge à Alfama", season: "avril-mai",
      steps: [
        { place: "Alfama, Lisbonne", text: "Arrivée tard, dîner au Mercado da Ribeira. Premier coup de cœur pour les ruelles pavées qui sentent le pastel de nata.", tip: "Loger à Alfama plutôt que Baixa, c'est plus authentique.", photo: "https://picsum.photos/seed/alfama-lisbon/720/480" },
        { place: "Belém", text: "Tour Belém au lever du jour pour éviter la foule. Après-midi LX Factory : street art, librairies, déjeuner sur le rooftop.", tip: "Pasteis de Belém à 9h pétantes, pas de queue.", photo: "https://picsum.photos/seed/belem-tower/720/480" },
        { place: "Sintra", text: "Train CP depuis Rossio (40 min). Le palais coloré de Pena est à voir une fois dans sa vie. Marcher jusqu'au Cap Roca pour finir la journée.", tip: "Première navette du matin, sinon 2h de queue.", photo: "https://picsum.photos/seed/sintra-pena/720/480" },
        { place: "Cascais", text: "Plage et front de mer. Loueur de vélo bon marché. Dîner poisson grillé, on a vu le coucher de soleil sur la côte.", tip: "Boca do Inferno à pied depuis le centre.", photo: "https://picsum.photos/seed/cascais-beach/720/480" },
        { place: "Bairro Alto", text: "Concert de fado dans une petite gargotte de 20 places. Pas de réservation, on s'est fait pousser à l'intérieur. Magique.", tip: "Tasca do Chico, rua do Diário de Notícias, minimum 25 €/personne.", photo: "https://picsum.photos/seed/bairro-alto-fado/720/480" },
      ],
      createdAt: Date.now() - 5 * 3600000, likes: 187, liked: false,
      comments: [
        { id: "c_vlog_1", authorId: "u_karim", text: "Tu m'as donné envie. Tu as quel appareil pour les photos ?", createdAt: Date.now() - 4 * 3600000, likes: 3, likedBy: [], emojis: [], replies: [] },
        { id: "c_vlog_2", authorId: "u_lea", text: "Sintra, le rêve. Merci pour les bons plans 🌿", createdAt: Date.now() - 3 * 3600000, likes: 5, likedBy: [], emojis: [], replies: [] },
      ]
    },
    { id: "p1",  authorId: "u_lea",   passion: "musique", mood: "creation", type: "text", cover: "studio",
      text: "Je viens de finir la démo d'un morceau que je porte depuis 3 ans. Pas parfait, mais honnête. 🎶\n\nMontrer le processus, pas la façade, c'est tout l'esprit PASSIO pour moi.",
      createdAt: hours(2), likes: 34, liked: false, comments: [
        { id: "c1", authorId: "u_karim", text: "Ça sonne super brut, j'adore.", createdAt: hours(1), likes: 2, likedBy: [], emojis: [], replies: [] },
        { id: "c2", authorId: "u_amira", text: "Le courage de poster une démo 👏", createdAt: hours(1), likes: 6, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p2",  authorId: "u_yanis", passion: "tech", mood: "learn", type: "text", cover: "tech",
      text: "Petit tuto : comment j'ai codé mon premier agent IA ce week-end, sans framework. 3 règles que j'aurais aimé connaître avant.\n\n1. Pas de hype, juste des specs\n2. Logger chaque appel\n3. Commencer par le prompt, pas par le code",
      createdAt: hours(5), likes: 112, liked: false, comments: [] },
    { id: "p3",  authorId: "u_karim", passion: "photo", mood: "chill", type: "photo",
      text: "5h du mat, Pont des Arts. Seul. La lumière fait tout le boulot. 📷",
      image: null, // will use CSS gradient fallback
      createdAt: hours(8), likes: 68, liked: false, comments: [] },
    { id: "p4",  authorId: "u_nina",  passion: "voyage", mood: "irl", type: "text", cover: "horizon",
      text: "Quiqui est à Lisbonne ce week-end ? J'organise un petit meet-up Passio voyageurs samedi 18h. On partage des anecdotes de route, rien de plus.",
      createdAt: hours(12), likes: 47, liked: false, comments: [] },
    { id: "p5",  authorId: "u_theo", passion: "cuisine", mood: "learn", type: "text", cover: "kitchen",
      text: "La vérité sur les sauces mères : 80% de la cuisine française tient sur 5 bases. Je vous fais le récap' en podcast la semaine prochaine.\n\nQuelle base vous voulez voir en premier ?",
      createdAt: hours(18), likes: 88, liked: false, comments: [] },
    { id: "p6",  authorId: "u_amira", passion: "danse", mood: "creation", type: "text", cover: "dance",
      text: "Chorégraphie testée en battle hier soir. Je suis pas satisfaite du pont.\nVidéo des coulisses en cours de montage, promis c'est pas glamour 😅",
      createdAt: hours(22), likes: 54, liked: false, comments: [] },
    { id: "p7",  authorId: "u_paul", passion: "metier", mood: "creation", type: "text", cover: "workshop",
      text: "12h sur un plateau de chêne massif aujourd'hui. Le bois parle si tu l'écoutes. Chaque nœud est une histoire.",
      createdAt: days(1), likes: 95, liked: false, comments: [] },
    { id: "p8",  authorId: "u_liam", passion: "podcast", mood: "learn", type: "audio",
      text: "Extrait de mon prochain épisode : pourquoi l'authenticité a un coût, et pourquoi il faut le payer quand même.",
      audio: null,
      createdAt: days(1), likes: 73, liked: false, comments: [] },
    { id: "p9",  authorId: "u_sofia", passion: "litterature", mood: "chill", type: "text", cover: "book",
      text: "Relecture de « L'Usage du monde » de Nicolas Bouvier. À 25 ans je l'ai détesté. À 38, il me parle différemment. Les livres attendent.",
      createdAt: days(2), likes: 41, liked: false, comments: [] },
    { id: "p10", authorId: "u_emma", passion: "yoga", mood: "chill", type: "text", cover: "nature",
      text: "Routine du matin (7 min) : 3 respirations profondes → chien tête en bas → guerrier I → enfant. Pas besoin de plus pour commencer.",
      createdAt: days(2), likes: 120, liked: false, comments: [] },
    { id: "p11", authorId: "u_zoe", passion: "mode", mood: "creation", type: "text", cover: "neon",
      text: "Collection capsule 100% upcycling. Chaque pièce = un vieux jean + un tablier de grand-mère + 6h de patience. Aucune pièce identique. 🧵",
      createdAt: days(3), likes: 134, liked: false, comments: [] },
    { id: "p12", authorId: "u_mehdi", passion: "sport", mood: "irl", type: "text", cover: "trail",
      text: "Trail découverte au-dessus d'Annecy samedi matin. 8km, 400m D+, pour tous niveaux. Qui embarque ?",
      createdAt: days(3), likes: 38, liked: false, comments: [
        { id: "c3", authorId: "u_jona", text: "Je viens ! Je ramène les barres énergétiques maison 💪", createdAt: days(2), likes: 4, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p13", authorId: "u_inès", passion: "art", mood: "creation", type: "text", cover: "neon",
      text: "3h sur ce portrait à l'encre. J'ai failli abandonner 6 fois. La satisfaction finale vaut TOUTES les heures ratées. ✒️",
      createdAt: hours(3), likes: 87, liked: false, comments: [
        { id: "c4", authorId: "u_lou", text: "La patience comme médium. Magnifique.", createdAt: hours(2), likes: 7, likedBy: [], emojis: [], replies: [] },
        { id: "c5", authorId: "u_zoe", text: "Je peux voir le résultat stp ? 🙏", createdAt: hours(1), likes: 2, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p14", authorId: "u_oussa", passion: "musique", mood: "learn", type: "audio",
      text: "Mon process : je pars toujours de l'erreur. Un sample mal calé, un bug de synthé. Explications en 90 secondes.",
      audio: null,
      createdAt: hours(4), likes: 126, liked: false, comments: [] },
    { id: "p15", authorId: "u_clara", passion: "voyage", mood: "irl", type: "text", cover: "sunrise",
      text: "J-12 avant le départ Copenhague → Rome à vélo. 1850 km. Solo. Terrifiée. Préparée.\n\nSi quelqu'un veut suivre le journal quotidien sur PASSIO, je poste chaque soir.",
      createdAt: hours(6), likes: 212, liked: false, comments: [
        { id: "c6", authorId: "u_mehdi", text: "Tu vas tout déchirer. Jalousie maximale.", createdAt: hours(5), likes: 9, likedBy: [], emojis: [], replies: [] },
        { id: "c7", authorId: "u_nina", text: "Je te file mes contacts à Munich et Vérone 📍", createdAt: hours(3), likes: 5, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p16", authorId: "u_noa", passion: "cinema", mood: "learn", type: "text", cover: "studio",
      text: "3 coupes qui changent un film :\n1. Couper 2 secondes AVANT qu'on pense\n2. Garder le souffle, pas la réplique\n3. Le son précède l'image, toujours",
      createdAt: hours(9), likes: 168, liked: false, comments: [] },
    { id: "p17", authorId: "u_chloé", passion: "yoga", mood: "chill", type: "text", cover: "nature",
      text: "Rappel doux : tu peux être productive ET fatiguée. Les deux sont vrais. Aujourd'hui j'ai fait la sieste. C'était parfait.",
      createdAt: hours(11), likes: 298, liked: false, comments: [
        { id: "c8", authorId: "u_emma", text: "Merci pour ça. J'en avais besoin 🌿", createdAt: hours(10), likes: 12, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p18", authorId: "u_tom", passion: "jeuxvideo", mood: "chill", type: "text", cover: "neon",
      text: "Nouveau record perso sur Ocarina of Time any% : 16:54. La communauté speedrun FR devient ouf, on échange chaque semaine.",
      createdAt: hours(14), likes: 64, liked: false, comments: [] },
    { id: "p19", authorId: "u_raph", passion: "tech", mood: "creation", type: "text", cover: "tech",
      text: "Hot take : l'IA va pas tuer le design, elle va tuer le design pressé. Les 10 minutes qu'on passait à faire un mockup moche deviennent 10 secondes. Reste le goût.",
      createdAt: hours(16), likes: 183, liked: false, comments: [
        { id: "c9", authorId: "u_yanis", text: "100% d'accord. La barre monte, elle disparaît pas.", createdAt: hours(15), likes: 8, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p20", authorId: "u_mila", passion: "danse", mood: "irl", type: "text", cover: "dance",
      text: "Stage de contemporaine gratuit pour les 16-25 ans à Ajaccio, du 5 au 9 mai. 12 places. Je transmets ce qu'on m'a transmis.",
      createdAt: hours(20), likes: 91, liked: false, comments: [] },
    { id: "p21", authorId: "u_jona", passion: "sport", mood: "learn", type: "text", cover: "trail",
      text: "La peur en escalade n'est jamais là pour rien. Mon conseil après 12 ans : ne la combats pas. Écoute ce qu'elle te dit, puis décide.",
      createdAt: days(1), likes: 156, liked: false, comments: [] },
    { id: "p22", authorId: "u_anaïs", passion: "litterature", mood: "creation", type: "text", cover: "book",
      text: "Un poème écrit ce matin en 7 minutes, sans retour. Brut.\n\n« On croit avancer.\nOn tourne en orbite\nautour d'une idée\nqu'on refuse de quitter. »",
      createdAt: days(1), likes: 238, liked: false, comments: [
        { id: "c10", authorId: "u_sofia", text: "Le poème doit rester brut. Ne touche à rien. 💫", createdAt: hours(22), likes: 14, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p23", authorId: "u_hugo", passion: "cuisine", mood: "chill", type: "text", cover: "kitchen",
      text: "Tarte citron sans œufs ni beurre. J'ai mis 4 essais, mais cette version elle est propre. Si ça intéresse je mets la recette.",
      createdAt: days(2), likes: 102, liked: false, comments: [] },
    { id: "p24", authorId: "u_rita", passion: "mode", mood: "irl", type: "text", cover: "neon",
      text: "Dakar Fashion Week se prépare. Je cherche 3 bénévoles créatifs pour l'équipe com' mi-mai. Billets pris en charge si on bloque un projet ensemble.",
      createdAt: days(2), likes: 78, liked: false, comments: [] },
    { id: "p25", authorId: "u_lou", passion: "art", mood: "chill", type: "text", cover: "workshop",
      text: "Mon atelier céramique est ouvert samedi après-midi. 3 tours dispo, thé, pas de perf, juste la terre. 4 places. Uzès.",
      createdAt: days(3), likes: 54, liked: false, comments: [] },

    // ===== Actualité / Géopolitique =====
    { id: "p26", authorId: "u_sami", passion: "actu", mood: "actu", type: "text", cover: "news_europe",
      text: "🌍 Sommet européen sur l'énergie : 5 points à retenir\n\n1. Nouveau paquet d'aides pour la rénovation thermique\n2. Objectif 2030 réaffirmé malgré les tensions\n3. Dépendance au gaz : diversification encore partielle\n4. Nucléaire : accord a minima entre Paris et Berlin\n5. Fonds climat doublé pour les pays du Sud\n\nMon analyse complète en article dans les commentaires.",
      createdAt: hours(3), likes: 412, liked: false, comments: [
        { id: "ca1", authorId: "u_val", text: "Point 4 surtout, c'est le vrai tournant. On en parle en visio ?", createdAt: hours(2), likes: 6, likedBy: [], emojis: [], replies: [] },
        { id: "ca2", authorId: "u_raph", text: "Merci pour la synthèse claire, ça change du scroll anxiogène 🙏", createdAt: hours(1), likes: 18, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p27", authorId: "u_val", passion: "actu", mood: "actu", type: "text", cover: "news_asia",
      text: "Tensions en mer de Chine : ce qu'il faut comprendre au-delà des titres.\n\nLa question n'est pas « qui a raison » mais « qui contrôle quelles routes commerciales ». 40% du commerce mondial passe par ces eaux. Tout le reste en découle.\n\nFil en 10 points à venir ce soir.",
      createdAt: hours(6), likes: 289, liked: false, comments: [
        { id: "ca3", authorId: "u_sami", text: "Hâte de lire le fil. Merci de remettre l'économie au centre.", createdAt: hours(5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p28", authorId: "u_kaoru", passion: "actu", mood: "actu", type: "text", cover: "news_asia",
      text: "🇯🇵 Depuis Tokyo : les élections locales de dimanche ont bougé la carte politique plus que prévu. Petite hausse de participation chez les 18-25 ans, +4 pts. Petit signal, grande direction.\n\nÀ suivre pour 2026.",
      createdAt: hours(10), likes: 174, liked: false, comments: [] },
    { id: "p29", authorId: "u_sami", passion: "actu", mood: "actu", type: "text", cover: "climate",
      text: "🌱 Bonne nouvelle climat (ça existe) : l'Inde vient de dépasser 50% de sa capacité électrique en renouvelables. 5 ans avant l'objectif annoncé.\n\nÇa reste 70% charbon en production réelle, mais la bascule est engagée. Chiffres sourcés IEA.",
      createdAt: hours(14), likes: 356, liked: false, comments: [
        { id: "ca4", authorId: "u_emma", text: "Enfin une news qui fait pas déprimer. Merci 🌿", createdAt: hours(13), likes: 22, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p30", authorId: "u_val", passion: "actu", mood: "actu", type: "text", cover: "tech",
      text: "Régulation IA en UE : l'AI Act entre dans sa phase contraignante. Ce que ça change concrètement pour les entreprises < 50 salariés :\n\n• Obligation de documentation pour les usages à haut risque\n• Transparence sur les modèles fondation\n• Droit d'opt-out pour les créateurs\n\nLe diable est dans les décrets d'application.",
      createdAt: days(1), likes: 223, liked: false, comments: [
        { id: "ca5", authorId: "u_yanis", text: "Post à épingler. Beaucoup de startups vont dormir dessus et se réveiller à l'amende.", createdAt: hours(20), likes: 19, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p31", authorId: "u_kaoru", passion: "actu", mood: "actu", type: "text", cover: "news_africa",
      text: "Focus Afrique de l'Ouest : le corridor Dakar-Abidjan est en train de devenir la nouvelle artère économique du continent. 400 M€ d'investissements annoncés ce trimestre, 80% privés africains.\n\nOn parle peu de ces dynamiques. C'est une erreur.",
      createdAt: days(2), likes: 141, liked: false, comments: [] },

    // ==== MUSIQUE, 3 posts ====
    { id: "p40", authorId: "u_lea", passion: "musique", mood: "chill", type: "text", cover: "stage",
      text: "Première fois sur scène cette semaine. 40 personnes dans la salle, ça tremblait dans les jambes. J'ai raté la deuxième intro, rigolé, repris. Personne n'a tiqué.\n\nLeçon : le public ne veut pas un·e robot, il veut quelqu'un d'incarné.",
      createdAt: hours(9), likes: 156, liked: false, comments: [
        { id: "c40a", authorId: "u_oussa", text: "On passe tous par là 🔥", createdAt: hours(7), likes: 3, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p41", authorId: "u_oussa", passion: "musique", mood: "creation", type: "text", cover: "studio",
      text: "Mon setup home studio en 2026 : un bureau IKEA, un SM7B, un Apollo Twin, et surtout 4 m² traités avec des panneaux DIY. Pas besoin de 20 k€ pour sonner pro.\n\nJe poste la liste complète en commentaire si ça intéresse.",
      createdAt: hours(14), likes: 203, liked: false, comments: [
        { id: "c41a", authorId: "u_liam", text: "Liste stp 🙏", createdAt: hours(13), likes: 8, likedBy: [], emojis: [], replies: [] },
        { id: "c41b", authorId: "u_raph", text: "Le SM7B c'est vraiment le meilleur rapport qualité/prix encore 4 ans après ?", createdAt: hours(10), likes: 5, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p42", authorId: "u_lea", passion: "musique", mood: "learn", type: "text", cover: "neon",
      text: "Le mode dorien, expliqué en 3 minutes sans jargon : c'est le mineur mais avec la 6ème majeure. Écoute « So What » de Miles Davis, tout est dedans.\n\nProchain live théorie musicale jeudi 21h.",
      createdAt: days(1), likes: 78, liked: false, comments: [] },

    // ==== PHOTO, 3 posts ====
    { id: "p43", authorId: "u_karim", passion: "photo", mood: "creation", type: "photo", cover: "street",
      text: "Série « Invisibles » : les gens qui ouvrent la ville à 5h du matin. Balayeurs, boulangers, livreurs. Ils méritent d'être vus.",
      createdAt: hours(11), likes: 287, liked: false, comments: [
        { id: "c43a", authorId: "u_nina", text: "Touchée. On les oublie.", createdAt: hours(9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p44", authorId: "u_karim", passion: "photo", mood: "learn", type: "text", cover: "horizon",
      text: "Règle qu'on m'a répétée 10 ans avant que je comprenne : la photo n'est pas ce que tu vois, c'est ce que tu montres.\n\nRecadrer c'est choisir. Choisir c'est exclure. Exclure c'est raconter.",
      createdAt: days(1), likes: 142, liked: false, comments: [] },
    { id: "p45", authorId: "u_karim", passion: "photo", mood: "chill", type: "photo", cover: "sunrise",
      text: "6h12 ce matin, quai de Seine. Le brouillard est arrivé pile au lever du soleil. Parfois il suffit d'attendre.",
      createdAt: days(2), likes: 95, liked: false, comments: [] },

    // ==== VOYAGE, 3 posts ====
    { id: "p46", authorId: "u_nina", passion: "voyage", mood: "irl", type: "text", cover: "horizon",
      text: "Jour 84 à Lisbonne. Mon rituel : café au Miradouro, tram 28, puis marché da Ribeira. Les meilleures routines de voyage sont celles qu'on ne planifie pas.\n\nSi t'es de passage cette semaine, DM ouvert.",
      createdAt: hours(16), likes: 189, liked: false, comments: [] },
    { id: "p47", authorId: "u_clara", passion: "voyage", mood: "irl", type: "text", cover: "trail",
      text: "Copenhague → Rome à vélo, jour 19 sur 40. Aujourd'hui 98 km sous la pluie en Bavière. Demain col à 1 200 m.\n\nCe qui me fait tenir : savoir que tous les soirs il y a quelqu'un qui m'offre le canapé. La solidarité cyclo, c'est une religion.",
      createdAt: hours(22), likes: 334, liked: false, comments: [
        { id: "c47a", authorId: "u_mehdi", text: "Respect énorme 🚴", createdAt: hours(18), likes: 16, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p48", authorId: "u_nina", passion: "voyage", mood: "chill", type: "text", cover: "sunrise",
      text: "Meilleure adresse cachée de Porto : « A Grade », une cantine d'ouvriers. Plat du jour 7 €, vue sur le Douro, et la patronne te sert comme sa nièce.\n\nRien n'est sur Instagram. Longue vie aux endroits comme ça.",
      createdAt: days(3), likes: 121, liked: false, comments: [] },

    // ==== CUISINE, 3 posts ====
    { id: "p49", authorId: "u_theo", passion: "cuisine", mood: "creation", type: "text", cover: "kitchen",
      text: "Expérimentation du mois : bouillon dashi au poireau grillé + panais. Umami végétal fou. Ça va entrer au menu de la semaine chez moi.\n\nJe vous partage la recette complète si ça vous botte.",
      createdAt: hours(6), likes: 167, liked: false, comments: [
        { id: "c49a", authorId: "u_hugo", text: "La recette, vite 🙏", createdAt: hours(5) },
        { id: "c49b", authorId: "u_emma", text: "J'adore l'idée panais + dashi", createdAt: hours(4) },
      ]},
    { id: "p50", authorId: "u_hugo", passion: "cuisine", mood: "learn", type: "text", cover: "studio",
      text: "Pâtisserie véganisante, 3 trucs que j'ai appris en 1 an :\n\n1. Aquafaba > œuf pour les macarons (sérieux)\n2. Huile de coco désodorisée pour remplacer le beurre en viennoiserie\n3. Ne JAMAIS négliger l'acidité (citron, vinaigre de cidre)\n\nJe sors un carnet de recettes en juin.",
      createdAt: days(1), likes: 98, liked: false, comments: [] },
    { id: "p51", authorId: "u_theo", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen",
      text: "Dîner à thème « retour d'Italie » samedi à Marseille chez moi. 10 places max, 30 € par personne, menu 5 services. Je paie les produits, je cuisine, vous venez avec vin et bonne humeur.\n\nRéponse en DM.",
      createdAt: days(2), likes: 74, liked: false, comments: [] },

    // ==== SPORT, 3 posts ====
    { id: "p52", authorId: "u_mehdi", passion: "sport", mood: "creation", type: "text", cover: "trail",
      text: "Préparation du trail du Mont-Blanc, semaine 8 sur 16. Cette semaine : 87 km, 4 200 D+, deux sorties longues. Les jambes tiennent, la tête suit, le sommeil est en béton.\n\nLe secret, c'est pas l'intensité. C'est la patience.",
      createdAt: hours(10), likes: 211, liked: false, comments: [
        { id: "c52a", authorId: "u_jona", text: "Allez Mehdi 💪 tu vas le boucler celui-là", createdAt: hours(8) },
      ]},
    { id: "p53", authorId: "u_jona", passion: "sport", mood: "learn", type: "text", cover: "nature",
      text: "L'escalade m'a appris ça : la peur n'est pas un obstacle, c'est une donnée. Tu l'écoutes, tu la mesures, tu décides.\n\nC'est vrai sur la paroi. C'est vrai dans la vie.",
      createdAt: hours(18), likes: 147, liked: false, comments: [] },
    { id: "p54", authorId: "u_mehdi", passion: "sport", mood: "chill", type: "text", cover: "sunrise",
      text: "Repos actif aujourd'hui : rando 12 km avec mon chien. Le corps récupère, la tête aussi. Les semaines sans jour off sont les semaines où je me blesse.\n\nRetenez ça, surtout les débutants.",
      createdAt: days(2), likes: 89, liked: false, comments: [] },

    // ==== LITTÉRATURE, 2 posts ====
    { id: "p55", authorId: "u_sofia", passion: "litterature", mood: "chill", type: "text", cover: "book",
      text: "Fini « Giovanni's Room » de Baldwin cette nuit. Trois heures sans bouger. La prose est une lame, et tu te rends compte à la dernière page qu'elle était dans ta main depuis le début.\n\nSi vous cherchez un court roman qui marque, c'est celui-là.",
      createdAt: hours(12), likes: 178, liked: false, comments: [
        { id: "c55a", authorId: "u_anaïs", text: "Un des livres qui m'a formée. Belle lecture 📚", createdAt: hours(10) },
      ]},
    { id: "p56", authorId: "u_anaïs", passion: "litterature", mood: "creation", type: "text", cover: "book",
      text: "Premier jet du recueil terminé. 64 poèmes, 4 ans d'archives. Maintenant vient le vrai travail : couper la moitié.\n\nÉcrire c'est ajouter. Publier c'est soustraire.",
      createdAt: days(1), likes: 103, liked: false, comments: [] },

    // ==== TECH, 3 posts ====
    { id: "p57", authorId: "u_yanis", passion: "tech", mood: "chill", type: "text", cover: "neon",
      text: "Observation 2026 : tous les SaaS qui survivent ont en commun un truc, ils ont arrêté de copier ChatGPT comme interface. Le vrai chantier c'est les workflows, pas le chat.\n\nLe chat c'est la réponse facile. Pas la bonne.",
      createdAt: hours(4), likes: 289, liked: false, comments: [
        { id: "c57a", authorId: "u_raph", text: "+1000. Le chat est une excuse pour ne pas designer.", createdAt: hours(3) },
      ]},
    { id: "p58", authorId: "u_raph", passion: "tech", mood: "learn", type: "text", cover: "tech",
      text: "Design produit IA, ma checklist avant de lancer une feature :\n\n• L'utilisateur peut-il réaliser la tâche SANS l'IA ?\n• Si l'IA se trompe, quel est le coût pour lui ?\n• Lui montre-t-on *comment* l'IA a décidé ?\n• L'a-t-on laissé corriger ?\n\nSi 3 sur 4 sont « oui », on peut shipper.",
      createdAt: hours(15), likes: 412, liked: false, comments: [] },
    { id: "p59", authorId: "u_yanis", passion: "tech", mood: "creation", type: "text", cover: "dark_matter",
      text: "Soirée hackathon solo hier. Objectif : un agent qui trie mes mails et propose une réponse. Résultat en 4h : ça marche à 70%.\n\nMais les 30% qui ratent sont *précisément* les mails qui comptent. Encore beaucoup de taf.",
      createdAt: days(1), likes: 128, liked: false, comments: [] },

    // ==== ART, 2 posts ====
    { id: "p60", authorId: "u_inès", passion: "art", mood: "creation", type: "text", cover: "workshop",
      text: "Journée pinceaux. 7 aquarelles, 3 à jeter, 4 à garder. Le ratio normal, après 9 ans. Les débuts où je voulais tout garder me manquent, mais je peins mieux.\n\nExpo collective le 17 mai à Nantes, infos bientôt.",
      createdAt: hours(20), likes: 156, liked: false, comments: [] },
    { id: "p61", authorId: "u_lou", passion: "art", mood: "learn", type: "text", cover: "workshop",
      text: "Céramique, l'erreur que font 90% des débutant·es : vouloir centrer trop fort. Le centrage c'est *sentir* le point mort, pas le forcer. Ferme les yeux. La main sait.\n\nProchain atelier découverte dimanche, 3 places.",
      createdAt: days(2), likes: 84, liked: false, comments: [] },

    // ==== DANSE, 2 posts ====
    { id: "p62", authorId: "u_amira", passion: "danse", mood: "creation", type: "text", cover: "dance",
      text: "Nouvelle choré sur « Smerz, Believer ». 48h en boucle, je commence à la détester, c'est bon signe.\n\nJe lance un appel : 6 danseuses Lille ou environs pour un clip DIY en mai. DM.",
      createdAt: hours(13), likes: 192, liked: false, comments: [
        { id: "c62a", authorId: "u_mila", text: "Si je peux descendre je suis là 💃", createdAt: hours(11) },
      ]},
    { id: "p63", authorId: "u_mila", passion: "danse", mood: "chill", type: "text", cover: "stage",
      text: "Dernier cours de la saison avec mes élèves ados. L'une d'elles est arrivée il y a 7 mois paralysée par la timidité. Aujourd'hui elle fait un solo devant les parents.\n\nVoilà pourquoi j'enseigne.",
      createdAt: days(1), likes: 267, liked: false, comments: [] },

    // ==== MODE, 2 posts ====
    { id: "p64", authorId: "u_zoe", passion: "mode", mood: "creation", type: "text", cover: "studio",
      text: "Collection upcycling printemps finalisée. 22 pièces, 100% tissus récupérés de fins de série. Les bouts d'usine deviennent des trenchs et des jupes plissées.\n\nPop-up ce week-end à Paris 11e.",
      createdAt: hours(17), likes: 234, liked: false, comments: [] },
    { id: "p65", authorId: "u_rita", passion: "mode", mood: "irl", type: "text", cover: "neon",
      text: "Fashion Week Dakar J-3. On accueille 14 créateur·ice·s ouest-africain·es cette année. L'énergie au showroom est folle, j'ai la chair de poule en vous écrivant.\n\nStream gratuit sur inscription.",
      createdAt: days(1), likes: 198, liked: false, comments: [] },

    // ==== YOGA / BIEN-ÊTRE, 2 posts ====
    { id: "p66", authorId: "u_emma", passion: "yoga", mood: "chill", type: "text", cover: "nature",
      text: "Pratique du matin face à l'océan. 25 min. Rien de spectaculaire, rien à poster, c'est précisément pour ça que je poste.\n\nLa constance a toujours l'air ennuyeuse. C'est là qu'est le truc.",
      createdAt: hours(7), likes: 145, liked: false, comments: [] },
    { id: "p67", authorId: "u_chloé", passion: "yoga", mood: "learn", type: "text", cover: "nature",
      text: "Naturopathie, 3 conseils sommeil qui marchent chez 90% de mes patient·es :\n\n1. Pas d'écran 45 min avant de dormir (le seuil, pas 1h30)\n2. Chambre à 17-18 °C max\n3. Petit-déj salé, pas sucré\n\nLe sommeil se prépare le matin.",
      createdAt: days(1), likes: 176, liked: false, comments: [] },

    // ==== JEUX, 2 posts ====
    { id: "p68", authorId: "u_tom", passion: "jeuxvideo", mood: "creation", type: "text", cover: "dark_matter",
      text: "Nouveau record personnel sur Ocarina of Time Any% : 17:41. 3 mois d'optim sur le skip du Deku Tree.\n\nQuand je dis à mes potes non-gamers que je m'entraîne à battre 15 secondes, ils me regardent comme si j'étais fou. Ils ont raison. C'est le principe.",
      createdAt: hours(19), likes: 163, liked: false, comments: [] },
    { id: "p69", authorId: "u_tom", passion: "jeuxvideo", mood: "chill", type: "text", cover: "neon",
      text: "Soirée rétro ce vendredi à Rennes. On branche un CRT, des manettes N64, et on joue à Goldeneye jusqu'à 3h. BYOB, pizza offerte, 8 places.\n\nDM pour l'adresse.",
      createdAt: days(2), likes: 72, liked: false, comments: [] },

    // ==== CINÉMA, 2 posts ====
    { id: "p70", authorId: "u_noa", passion: "cinema", mood: "learn", type: "text", cover: "stage",
      text: "Montage, la règle que je donne à tou·tes mes stagiaires : si tu hésites à couper, coupe. Le spectateur complétera. Il le fait toujours.\n\nLa confiance dans le·la spectateur·ice c'est 80% du boulot.",
      createdAt: hours(21), likes: 204, liked: false, comments: [] },
    { id: "p71", authorId: "u_noa", passion: "cinema", mood: "chill", type: "text", cover: "horizon",
      text: "Revu « Paris, Texas » hier soir. 40 ans et toujours un uppercut.\n\nCinéma contemplatif = cinéma courageux. Tenir sur un visage 45 secondes, c'est dire au public : je te fais confiance pour ressentir.",
      createdAt: days(2), likes: 118, liked: false, comments: [] },

    // ==== PODCAST, 1 post ====
    { id: "p72", authorId: "u_liam", passion: "podcast", mood: "creation", type: "audio", cover: "studio",
      text: "Épisode 34 : on reçoit une sage-femme qui travaille dans le Grand Nord québécois. Ce qu'elle raconte sur la solitude des femmes enceintes en zone isolée, vous l'entendrez nulle part ailleurs.\n\nLien en bio.",
      createdAt: hours(8), likes: 214, liked: false, comments: [
        { id: "c72a", authorId: "u_anaïs", text: "J'ai pleuré à l'épisode 12. Je vais écouter celui-là.", createdAt: hours(6) },
      ]},

    // ==== MÉTIER, 1 post ====
    { id: "p73", authorId: "u_paul", passion: "metier", mood: "creation", type: "text", cover: "workshop",
      text: "Commode Louis XV finie aujourd'hui. 140h de boulot, marqueterie complète, finition gomme-laque tamponnée. Photos dès que la lumière est bonne.\n\nL'ébénisterie c'est 10% de talent, 90% de patience. Celui qui vous dit l'inverse ment.",
      createdAt: hours(23), likes: 187, liked: false, comments: [] },

    // ==== ACTUALITÉ, 8 posts supplémentaires ====
    { id: "p80", authorId: "u_val", passion: "actu", mood: "actu", type: "text", cover: "news_europe",
      text: "Sommet européen cette semaine : l'énergie revient au centre du débat. Après 4 ans de dossiers climatiques lourds, la Commission sort un plan d'autonomie énergétique 2027-2035.\n\nLes 3 points à surveiller : hydrogène vert, nucléaire de 4e gen, interconnexions nordiques.",
      createdAt: hours(3), likes: 267, liked: false, comments: [
        { id: "c80a", authorId: "u_sami", text: "Tu couvres la session plénière jeudi ?", createdAt: hours(2) },
      ]},
    { id: "p81", authorId: "u_sami", passion: "actu", mood: "actu", type: "text", cover: "news",
      text: "Enquête terrain : les livreurs Uber de Bruxelles ont gagné en appel hier. La Cour reclassifie 800 contrats en salariat. Décision qui va faire jurisprudence dans toute l'UE.\n\nPourquoi c'est énorme : tout le modèle des plateformes gig repose sur l'inverse.",
      createdAt: hours(6), likes: 189, liked: false, comments: [] },
    { id: "p82", authorId: "u_kaoru", passion: "actu", mood: "actu", type: "text", cover: "news_asia",
      text: "Tokyo : les jeunes adultes (20-30 ans) ont moins de téléphones secondaires professionnels depuis 2024. Le gouvernement y voit un indicateur de rééquilibrage vie pro / vie perso.\n\nJ'y vois surtout un message culturel : la génération post-COVID refuse le présentéisme numérique. Partout.",
      createdAt: hours(12), likes: 321, liked: false, comments: [
        { id: "c82a", authorId: "u_val", text: "Très bon angle. Ça rejoint les chiffres coréens.", createdAt: hours(10) },
      ]},
    { id: "p83", authorId: "u_val", passion: "actu", mood: "actu", type: "text", cover: "climate",
      text: "Rapport GIEC inter-sessions publié ce matin. Ce qu'il faut retenir : les émissions mondiales ont plafonné en 2024 (1ère fois). Mais le plafonnement n'est pas la baisse.\n\nOn a gagné une manche. La guerre n'est pas finie.",
      createdAt: days(1), likes: 445, liked: false, comments: [
        { id: "c83a", authorId: "u_chloé", text: "Merci pour le résumé sans catastrophisme.", createdAt: hours(22) },
      ]},
    { id: "p84", authorId: "u_kaoru", passion: "actu", mood: "actu", type: "text", cover: "news_asia",
      text: "Corée du Sud : le Parlement vote un cadre inédit sur l'IA générative en éducation. Usage encadré obligatoire dès la seconde, formation profs, outils publics open-source.\n\nPremière loi de ce niveau de détail au monde. À suivre de près en France.",
      createdAt: days(1), likes: 278, liked: false, comments: [] },
    { id: "p85", authorId: "u_sami", passion: "actu", mood: "actu", type: "text", cover: "news_africa",
      text: "Élections Sénégal : la participation dépasse 73%. Record historique. Les jeunes urbains ont voté massivement, ce qui change tout.\n\nReportage long format dispo vendredi.",
      createdAt: days(2), likes: 198, liked: false, comments: [] },
    { id: "p86", authorId: "u_val", passion: "actu", mood: "actu", type: "text", cover: "news_europe",
      text: "Inflation zone euro avril : 2,1%. On retrouve enfin le couloir cible BCE. Mais l'alimentation reste 3,4% au-dessus. Les ménages à bas revenu ne sentent pas encore le mieux.\n\nLa macro va bien. Le portefeuille de Mme Martin, pas encore.",
      createdAt: days(2), likes: 156, liked: false, comments: [] },
    { id: "p87", authorId: "u_kaoru", passion: "actu", mood: "actu", type: "text", cover: "news",
      text: "Conflit Mer de Chine : dé-escalade confirmée après la rencontre Manille-Pékin de mardi. Accord de patrouilles conjointes sur 4 zones contestées.\n\nRare bonne nouvelle diplomatique. À apprécier sans naïveté.",
      createdAt: days(3), likes: 223, liked: false, comments: [] },

    { id: "p88", authorId: "u_val", passion: "actu", mood: "actu", type: "text", cover: "news_europe",
      text: "RUPTURE : Les négociations commerciales UE-UK s'accélèrent. Accord prévu d'ici juin sur le secteur financier.\n\nAnalyse en 5 points : pourquoi cette soudaine rationalité géopolitique?",
      createdAt: hours(12), likes: 567, liked: false, comments: [
        { id: "ca88_1", authorId: "u_sami", text: "Les intérêts économiques finissent toujours par parler", createdAt: hours(10), likes: 34, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "p89", authorId: "u_sami", passion: "actu", mood: "actu", type: "text", cover: "climate",
      text: "URGENT : Rapport alarmant du GIEC. Les seuils de 1.5°C seront atteints avant 2030. Pas avant, AVANT.\n\nCe qui change maintenant, c'est qu'on l'a en chiffres. Pas de débat possible.",
      createdAt: hours(4), likes: 892, liked: false, comments: [
        { id: "ca89_1", authorId: "u_kaoru", text: "Les données sont claires. La question est politique maintenant.", createdAt: hours(2), likes: 45, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "p90", authorId: "u_kaoru", passion: "actu", mood: "actu", type: "text", cover: "news_asia",
      text: "Japon : inflation à 2.8%, première hausse salariale en 30 ans pour certains secteurs. Le cycle 'lost decade' prend enfin fin? 🇯🇵",
      createdAt: hours(18), likes: 421, liked: false, comments: [] },

    { id: "p91", authorId: "u_val", passion: "actu", mood: "actu", type: "text", cover: "news_africa",
      text: "Nairobi accueille le plus grand sommet technologique africain. Startups, IA, finance digitale. Le centre de gravité se déplace.",
      createdAt: days(1), likes: 312, liked: false, comments: [
        { id: "ca91_1", authorId: "u_sami", text: "Signal fort. L'Afrique n'attend plus de permission.", createdAt: hours(22), likes: 67, likedBy: [], emojis: [], replies: [] },
      ]},

    // ==== ACTUALITÉ par PASSION ====
    { id: "pac_music", authorId: "u_lea", passion: "musique", mood: "actu", type: "text", cover: "studio",
      text: "Industrie musicale : les revenus de la musique en direct dépassent enfin le streaming (2024). Les artistes reprennent du pouvoir.",
      createdAt: hours(8), likes: 289, liked: false, comments: [
        { id: "cac_music1", authorId: "u_oussa", text: "Enfin une bonne nouvelle pour les artistes", createdAt: hours(6), likes: 23, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_tech", authorId: "u_yanis", passion: "tech", mood: "actu", type: "text", cover: "neon",
      text: "OpenAI révèle GPT-5 : capacités raisonnement multi-étapes majeures. Les limites du prompt engineering explosent.",
      createdAt: hours(2), likes: 1203, liked: false, comments: [
        { id: "cac_tech1", authorId: "u_raph", text: "C'est un game-changer pour la prod", createdAt: hours(1), likes: 156, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_cuisine", authorId: "u_theo", passion: "cuisine", mood: "actu", type: "text", cover: "kitchen",
      text: "Agriculture durable : France produit 40% de ses légumes localement en 2024 (vs 28% en 2020). La révolution assiette est en cours.",
      createdAt: days(1), likes: 445, liked: false, comments: [] },

    { id: "pac_danse", authorId: "u_amira", passion: "danse", mood: "actu", type: "text", cover: "stage",
      text: "Festival mondial de danse : 150 troupes de 85 pays. L'art de bouger n'a jamais été aussi inclusif. Appels à candidatures ouvertes.",
      createdAt: hours(14), likes: 267, liked: false, comments: [] },

    { id: "pac_metier", authorId: "u_paul", passion: "metier", mood: "actu", type: "text", cover: "workshop",
      text: "Métiers artisanaux : demande en hausse de 35%. Les écoles d'apprentissage recrutent massif. Retour aux compétences manuelles.",
      createdAt: hours(20), likes: 523, liked: false, comments: [
        { id: "cac_metier1", authorId: "u_paul", text: "Le bois revient! C'est un renaissance", createdAt: hours(18), likes: 89, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_podcast", authorId: "u_liam", passion: "podcast", mood: "actu", type: "text", cover: "studio",
      text: "Podcast : audience en France passe 20 millions d'auditeurs mensuels. Les indés gagnent contre Spotify.",
      createdAt: hours(6), likes: 389, liked: false, comments: [] },

    { id: "pac_mode", authorId: "u_zoe", passion: "mode", mood: "actu", type: "text", cover: "neon",
      text: "Fashion week 2024 : direction Africa for the first time. Designers africains dominent. Nouvelle ère.",
      createdAt: days(2), likes: 678, liked: false, comments: [
        { id: "cac_mode1", authorId: "u_zoe", text: "C'est la révolution qu'on attendait", createdAt: days(1), likes: 134, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_art", authorId: "u_inès", passion: "art", mood: "actu", type: "text", cover: "dark_matter",
      text: "Art numérique : première vente aux enchères officielle à Christie's dépasse 50 millions. L'IA-art n'est plus marginal.",
      createdAt: hours(10), likes: 412, liked: false, comments: [] },

    { id: "pac_photo", authorId: "u_karim", passion: "photo", mood: "actu", type: "text", cover: "street",
      text: "Photojournalisme : les images de rue remontent en crédibilité vs AI-images. Authenticité coûte cher maintenant.",
      createdAt: hours(16), likes: 334, liked: false, comments: [] },

    { id: "pac_voyage", authorId: "u_sofia", passion: "voyage", mood: "actu", type: "text", cover: "horizon",
      text: "Tourisme mondial : nouvelle route des Balkans ouvre 12 frontières sans visa. Mobilité européenne transformée.",
      createdAt: days(1), likes: 556, liked: false, comments: [
        { id: "cac_voyage1", authorId: "u_sofia", text: "C'est maintenant qu'il faut explorer!", createdAt: hours(22), likes: 98, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_litterature", authorId: "u_anaïs", passion: "litterature", mood: "actu", type: "text", cover: "dark_matter",
      text: "Littérature : les poétesses dominent les bestsellers 2024. Fin de l'ère des 'great authors' mâles blancs.",
      createdAt: hours(12), likes: 467, liked: false, comments: [] },

    { id: "pac_cinema", authorId: "u_noa", passion: "cinema", mood: "actu", type: "text", cover: "stage",
      text: "Cinéma : Cannes 2024 plébiscite les réalisatrices indépendantes. Streaming perd face à la salle.",
      createdAt: hours(9), likes: 523, liked: false, comments: [
        { id: "cac_cinema1", authorId: "u_noa", text: "Le grand écran a encore de beaux jours", createdAt: hours(7), likes: 76, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_sport", authorId: "u_jona", passion: "sport", mood: "actu", type: "text", cover: "nature",
      text: "Sport : escalade devient olympique à LA 2028. Discipline ultime de la génération Z reconnue.",
      createdAt: hours(11), likes: 612, liked: false, comments: [] },

    { id: "pac_yoga", authorId: "u_emma", passion: "yoga", mood: "actu", type: "text", cover: "nature",
      text: "Bien-être : yoga devient remboursé par la sécurité sociale en France. Reconnaissance médicale officielle.",
      createdAt: days(1), likes: 778, liked: false, comments: [
        { id: "cac_yoga1", authorId: "u_emma", text: "Justice enfin. C'est la médecine du corps ET de l'esprit.", createdAt: hours(20), likes: 145, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_jeux", authorId: "u_tom", passion: "jeuxvideo", mood: "actu", type: "text", cover: "neon",
      text: "Gaming : les speedrunners sont maintenant sponsorisés comme athlètes pro. Esports devient un métier légal.",
      createdAt: hours(15), likes: 634, liked: false, comments: [] },

    { id: "pac_bienetre", authorId: "u_chloé", passion: "yoga", mood: "actu", type: "text", cover: "nature",
      text: "Naturopathie : études scientifiques valident 60% des pratiques traditionnelles. Bridge science-nature enfin.",
      createdAt: hours(7), likes: 445, liked: false, comments: [
        { id: "cac_bienetre1", authorId: "u_chloé", text: "La science rejoint la sagesse. Comme c'était attendu.", createdAt: hours(5), likes: 112, likedBy: [], emojis: [], replies: [] },
      ]},

    // ==== MUSIQUE — posts supplémentaires ====
    { id: "pm1", authorId: "u_oussa", passion: "musique", mood: "creation", type: "text", cover: "studio",
      text: "J'ai passé 6 heures sur une basse ligne hier. 6 heures pour 4 mesures. C'est ça la production : pas le talent, la patience.\n\nQuand ça clique enfin, c'est la meilleure drogue qui soit.",
      createdAt: hours(2), likes: 312, liked: false, comments: [
        { id: "cpm1a", authorId: "u_lea", text: "Ces 4 mesures valent 6 heures 🔥", createdAt: hours(1) },
      ]},
    { id: "pm2", authorId: "u_lea", passion: "musique", mood: "learn", type: "text", cover: "neon",
      text: "Conseil que j'aurais voulu avoir à 15 ans : enregistre-toi. Même mal, même sur ton téléphone. T'entendre c'est apprendre 2x plus vite qu'en jouant sans écouter.",
      createdAt: hours(5), likes: 198, liked: false, comments: [] },
    { id: "pm3", authorId: "u_oussa", passion: "musique", mood: "chill", type: "audio", cover: "studio",
      text: "Freestyle de 3h du mat. Pas de structure, pas de concept — juste un sample de Coltrane et l'instinct. Parfois le meilleur sort quand tu arrêtes de réfléchir.",
      createdAt: hours(18), likes: 144, liked: false, comments: [] },
    { id: "pm4", authorId: "u_lea", passion: "musique", mood: "creation", type: "text", cover: "stage",
      text: "Nouvelle compo terminée : 3 mois de travail, 47 versions du refrain, 2 ruptures d'inspiration.\n\nTitre provisoire : « Après l'orage ». Je joue ça vendredi au café du quartier. Entrée libre.",
      createdAt: days(1), likes: 267, liked: false, comments: [
        { id: "cpm4a", authorId: "u_karim", text: "Je viens vendredi 🎸", createdAt: hours(20) },
      ]},
    { id: "pm5", authorId: "u_oussa", passion: "musique", mood: "learn", type: "text", cover: "studio",
      text: "Thread mixing pour débutants :\n1. Le bas mid (200-400 Hz) c'est là que ça sature — coupe avant de booster\n2. Sidechain la kick sur la bass, toujours\n3. Référence track à fond, ta track à fond : les volumes doivent matcher\n\nFin du thread.",
      createdAt: days(2), likes: 389, liked: false, comments: [] },

    // ==== PHOTO — posts supplémentaires ====
    { id: "pp1", authorId: "u_karim", passion: "photo", mood: "creation", type: "photo", cover: "street",
      text: "Portrait volé dans le métro. Lumière de fenêtre, regard perdu dans le lointain. Ce type ne saura jamais que sa mélancolie est sur ma carte SD.\n\nC'est éthique ou pas ? Je me pose la question à chaque fois.",
      createdAt: hours(3), likes: 445, liked: false, comments: [
        { id: "cpp1a", authorId: "u_nina", text: "La question fait partie de l'œuvre.", createdAt: hours(2) },
      ]},
    { id: "pp2", authorId: "u_karim", passion: "photo", mood: "learn", type: "text", cover: "studio",
      text: "Trois réglages que tu dois maîtriser avant d'acheter un meilleur objectif :\n\n1. Le triangle exposition (ISO / vitesse / ouverture)\n2. La mise au point manuelle sur portrait\n3. Le format RAW + développement Lightroom\n\nTon 50mm f/1.8 à 100€ fera plus que le 85mm à 1500€ que tu n'exploites pas.",
      createdAt: hours(8), likes: 512, liked: false, comments: [
        { id: "cpp2a", authorId: "u_sofia", text: "Merci, j'allais craquer pour le 85 😅", createdAt: hours(6) },
      ]},
    { id: "pp3", authorId: "u_karim", passion: "photo", mood: "chill", type: "photo", cover: "horizon",
      text: "Marché du samedi. J'arrive 45 min avant l'ouverture — les commerçants s'installent, les lumières sont encore basses, personne ne fait attention à toi.\n\nLes meilleures photos de rue se prennent avant que la rue soit animée.",
      createdAt: days(1), likes: 298, liked: false, comments: [] },
    { id: "pp4", authorId: "u_karim", passion: "photo", mood: "creation", type: "text", cover: "dark_matter",
      text: "Expo solo en octobre à la Galerie du 10e (Paris). Thème : « Les marges ».\n\nDeux ans de travail, 800 photos éditées à 34. Je suis terrifié et excité en même temps. Les détails d'ici quelques semaines.",
      createdAt: days(2), likes: 634, liked: false, comments: [
        { id: "cpp4a", authorId: "u_lea", text: "Réservé dans mon agenda ✅", createdAt: days(1) },
      ]},
    { id: "pp5", authorId: "u_karim", passion: "photo", mood: "learn", type: "text", cover: "sunrise",
      text: "Ma règle du tiers ? Je l'enfreins 30% du temps. Mon centre ? Je l'utilise pour les regards. Ma règle vraiment utile : si t'es pas sûr·e du cadre, rapproche-toi.\n\nLa distance c'est le bug n°1 du photographe débutant.",
      createdAt: days(3), likes: 187, liked: false, comments: [] },

    // ==== VOYAGE — posts supplémentaires ====
    { id: "pv1", authorId: "u_nina", passion: "voyage", mood: "chill", type: "text", cover: "horizon",
      text: "Règle n°1 du voyage en solo : ne jamais réserver plus de 2 nuits à l'avance. Ça paraît stressant, c'est en fait libérateur.\n\nJ'ai changé de destination complètement 4 fois en 6 mois. Aucun regret.",
      createdAt: hours(4), likes: 521, liked: false, comments: [
        { id: "cpv1a", authorId: "u_clara", text: "On voyage pareil 🙌", createdAt: hours(3) },
      ]},
    { id: "pv2", authorId: "u_clara", passion: "voyage", mood: "irl", type: "text", cover: "trail",
      text: "Jour 31. Autriche, vallée de l'Inn. J'ai partagé un repas avec un couple de cyclistes japonais qui ne parlaient pas français, moi pas japonais. On a communiqué en cartes et sourires pendant 2h.\n\nLes langues sont une excuse pour ne pas s'ouvrir.",
      createdAt: hours(7), likes: 389, liked: false, comments: [] },
    { id: "pv3", authorId: "u_nina", passion: "voyage", mood: "learn", type: "text", cover: "sunrise",
      text: "Budget 3 mois en Asie du Sud-Est (retour d'expérience) :\n\n• Thaïlande : 35€/jour\n• Vietnam : 28€/jour\n• Cambodge : 22€/jour\n\nÇa inclut logement, nourriture, transports. Pas les vols. Détails complets en commentaire.",
      createdAt: days(1), likes: 674, liked: false, comments: [
        { id: "cpv3a", authorId: "u_mehdi", text: "Commentaire stp !! Je pars en octobre", createdAt: hours(20) },
      ]},
    { id: "pv4", authorId: "u_clara", passion: "voyage", mood: "chill", type: "text", cover: "horizon",
      text: "Ce qu'on ne te dit pas sur le voyage longue durée : les premières semaines sont dures. La solitude, la désorientation, le manque de routine.\n\nLes gens qui rentrent au bout d'une semaine n'ont pas échoué. Ils ont découvert que ce mode de vie n'est pas fait pour eux. Et c'est précieux aussi.",
      createdAt: days(2), likes: 892, liked: false, comments: [
        { id: "cpv4a", authorId: "u_nina", text: "Le message le plus honnête que j'aie lu là-dessus.", createdAt: days(1) },
      ]},
    { id: "pv5", authorId: "u_nina", passion: "voyage", mood: "irl", type: "text", cover: "trail",
      text: "Rencontre du mois : Ibrahim, guide berbère dans l'Anti-Atlas marocain. 62 ans, marché 40 000 km de sa vie dans ces montagnes. Il connaît le nom de chaque pierre.\n\nC'est lui la destination. Pas le paysage.",
      createdAt: days(3), likes: 743, liked: false, comments: [] },

    // ==== PUBLICATIONS RELIÉES À UNE ACTIVITÉ (lot UI-3B) ====
    // `eventId` est l'un des trois champs — avec `event_id` et
    // `sharedReelData.kind === "event"` — que `refEvenement()` reconnaît. Une
    // publication qui en porte un reçoit « Voir l'activité » au lieu de
    // « Trouver une expérience », et JAMAIS les deux (les deux lots sont
    // exclusifs). Sans ce contenu, UI-3B n'avait rien à décorer : le lot
    // paraissait mort alors qu'il fonctionnait (piège ④ du 2026-08-28).
    // ⚠️ L'id doit correspondre EXACTEMENT à un événement de seedEvents : une
    // référence introuvable ne produit AUCUN bouton, sans message visible.
    // ⚠️ La passion doit être celle de l'activité, sinon la publication
    // n'apparaît pas dans le fil des comptes intéressés par cette passion.
    { id: "p_ev_jam", authorId: "u_oussa", passion: "musique", mood: "irl", type: "text", cover: "stage", eventId: "e1",
      text: "J'y retourne ce soir. La dernière fois on était huit, deux qui n'avaient jamais joué devant quelqu'un, et à la fin tout le monde jouait la même grille sans se parler.\n\nSi tu hésites parce que tu débutes : c'est exactement pour ça que ça existe.",
      createdAt: hours(5), likes: 87, liked: false, comments: [
        { id: "cev1a", authorId: "u_lea", text: "Merci Oussama 🙏 Il reste de la place, venez !", createdAt: hours(4), likes: 12, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev_photo", authorId: "u_nina", passion: "photo", mood: "irl", type: "photo", cover: "sunrise", eventId: "e2",
      text: "6h du matin sur le Pont des Arts, il faut le vouloir. Mais la lumière entre 6h10 et 6h40 ne ressemble à rien d'autre dans Paris.\n\nOn est repartis avec 300 photos et deux cafés.",
      createdAt: hours(11), likes: 164, liked: false, comments: [] },
    { id: "p_ev_cuisine", authorId: "u_emma", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen", eventId: "e3",
      text: "J'apporte une tarte aux blettes. Oui, aux blettes. Faites-moi confiance.\n\nCe que j'aime dans ces dîners : personne ne cherche à impressionner, tout le monde explique ce qu'il a raté.",
      createdAt: hours(20), likes: 121, liked: false, comments: [
        { id: "cev2a", authorId: "u_theo", text: "La tarte aux blettes de ma grand-mère niçoise, y a rien au-dessus.", createdAt: hours(18), likes: 9, likedBy: [], emojis: [], replies: [] },
        { id: "cev2b", authorId: "u_hugo", text: "Version sucrée ou salée ? C'est tout le débat.", createdAt: hours(17), likes: 6, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev_yoga", authorId: "u_chloé", passion: "yoga", mood: "chill", type: "text", cover: "horizon", eventId: "e6",
      text: "Yoga sur le sable, à 7h, avec le bruit des vagues à la place de la playlist. La première fois j'ai trouvé ça too much. La deuxième, j'ai compris.\n\nPrends une serviette épaisse, le sable est humide à cette heure-là.",
      createdAt: hours(30), likes: 208, liked: false, comments: [] },
    { id: "p_ev_ceramique", authorId: "u_inès", passion: "art", mood: "creation", type: "photo", cover: "workshop", eventId: "e7",
      text: "Mon premier bol au tour est sorti tordu, épais, et je l'utilise tous les matins depuis.\n\nL'atelier de Lou est le seul endroit où j'ai vu quelqu'un dire « c'est raté » avec un vrai sourire.",
      createdAt: hours(46), likes: 176, liked: false, comments: [
        { id: "cev3a", authorId: "u_lou", text: "Le premier bol tordu est toujours le bon 🏺", createdAt: hours(44), likes: 21, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev_trail", authorId: "u_jona", passion: "sport", mood: "irl", type: "text", cover: "trail", eventId: "e30",
      text: "18 km, 900 D+, départ 8h au bord du lac. On part groupés et on se retrouve au café, chacun à son rythme.\n\nRègle de la sortie : personne ne finit seul.",
      createdAt: hours(14), likes: 143, liked: false, comments: [] },
    { id: "p_ev_ia", authorId: "u_raph", passion: "tech", mood: "learn", type: "text", cover: "tech", eventId: "e5",
      text: "Atelier « IA pour non-techs » : deux heures, zéro ligne de code, et à la fin chacun repart avec un outil qui lui fait gagner une heure par semaine.\n\nYanis prend le temps de répondre à tout, même aux questions qu'on n'ose pas poser.",
      createdAt: hours(26), likes: 231, liked: false, comments: [
        { id: "cev4a", authorId: "u_yanis", text: "Il reste 4 places, et on garde un créneau pour les questions à la fin.", createdAt: hours(24), likes: 15, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev_danse", authorId: "u_amira", passion: "danse", mood: "creation", type: "photo", cover: "dance", eventId: "e36",
      text: "Jam contemporaine : pas de chorégraphie, pas de niveau, une salle et deux heures.\n\nCe qui se passe entre la vingtième et la quarantième minute, quand tout le monde arrête de se regarder, c'est ce que je viens chercher.",
      createdAt: hours(38), likes: 154, liked: false, comments: [] },
    { id: "p_ev_livre", authorId: "u_anaïs", passion: "litterature", mood: "chill", type: "text", cover: "book", eventId: "e14",
      text: "Book club de ce mois : on lit un roman que personne n'a choisi, tiré au sort. C'est la meilleure règle qu'on ait inventée.\n\nJ'ai découvert trois autrices comme ça, que je n'aurais jamais ouvertes.",
      createdAt: hours(60), likes: 98, liked: false, comments: [] },
    // La SECONDE forme reconnue par refEvenement : le bloc `sharedReelData`,
    // celui que produit le partage d'une activité depuis sa fiche. La carte y
    // reçoit le même lien « Voir l'activité », et sa sous-carte historique est
    // masquée au profit de ce seul lien (source "shared").
    // ⚠️ Ne JAMAIS lui donner `cover` ni `image` : `shouldCover` (app-02)
    // écraserait la sous-carte juste après l'avoir construite.
    // Une publication reliée par activité de démonstration : sans cette
    // densité, on peut faire défiler tout le fil sans jamais croiser un
    // « Voir l'activité » — et le lot UI-3B paraît alors mort (2026-08-28).
    // L'auteur est volontairement DIFFÉRENT de l'organisateur : une
    // publication reliée n'est pas une annonce, c'est quelqu'un qui en parle.
    { id: "p_ev2_e9", authorId: "u_mehdi", passion: "sport", mood: "irl", type: "text", cover: "trail", eventId: "e9",
      text: "On y va à trois demain soir. La salle est petite, le mur de gauche est un vrai casse-tête, et il y a toujours quelqu'un pour te donner la méthode que tu ne trouvais pas.\n\nSi tu n'as jamais grimpé : les chaussons se louent sur place, et personne ne regarde ton niveau.",
      createdAt: hours(6), likes: 97, liked: false, comments: [
        { id: "cp_ev2_e9_0", authorId: "u_jona", text: "Il reste des créneaux, venez avant 20h30 pour avoir le mur libre.", createdAt: hours(4), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev2_e11", authorId: "u_raph", passion: "sport", mood: "irl", type: "text", cover: "street", eventId: "e11",
      text: "Skatepark des Chartrons demain après-midi. Je viens surtout pour regarder — j'ai un board depuis deux mois et je tiens debout, c'est tout.\n\nOn m'a dit que personne ne juge. On verra bien. 🛹",
      createdAt: hours(13), likes: 64, liked: false, comments: []},
    { id: "p_ev2_e17", authorId: "u_hugo", passion: "cuisine", mood: "irl", type: "text", cover: "workshop", eventId: "e17",
      text: "Dégustation de vins nature à Dijon. Ce que j'aime dans ces soirées : on ne récite pas des notes de dégustation, on dit ce qu'on sent, même quand c'est « ça sent la ferme ».\n\nSpoiler : ça sent souvent la ferme, et c'est très bien.",
      createdAt: hours(21), likes: 118, liked: false, comments: [
        { id: "cp_ev2_e17_0", authorId: "u_theo", text: "La ferme, c'est le compliment ultime. 🍷", createdAt: hours(19), likes: 14, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev2_e12", authorId: "u_oussa", passion: "musique", mood: "irl", type: "text", cover: "stage", eventId: "e12",
      text: "Concert acoustique amateur à Nantes. Six passages de quinze minutes, une salle de cinquante places, et personne ne joue pour être découvert.\n\nC'est exactement le format qui manque partout ailleurs.",
      createdAt: hours(9), likes: 143, liked: false, comments: []},
    { id: "p_ev2_e20", authorId: "u_ines", passion: "art", mood: "irl", type: "text", cover: "neon", eventId: "e20",
      text: "Vernissage d'une galerie indé à Toulouse. Trois artistes, aucun discours, du vin dans des gobelets et les artistes qui expliquent eux-mêmes ce qu'ils ont voulu faire.\n\nJ'y vais surtout pour ça : entendre le pourquoi, pas lire un cartel.",
      createdAt: hours(30), likes: 86, liked: false, comments: []},
    { id: "p_ev2_e10", authorId: "u_sofia", passion: "cinema", mood: "irl", type: "text", cover: "cinema", eventId: "e10",
      text: "Ciné-club de films restaurés à Paris. Ce mois-ci une copie neuve d'un film que je n'ai jamais vu autrement qu'en VHS ratée.\n\nDébat après la séance, une heure, et personne n'a besoin d'avoir raison.",
      createdAt: hours(17), likes: 129, liked: false, comments: [
        { id: "cp_ev2_e10_0", authorId: "u_noa", text: "La restauration est superbe, on voit enfin les noirs.", createdAt: hours(14), likes: 17, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev2_e23", authorId: "u_clara", passion: "voyage", mood: "irl", type: "text", cover: "nature", eventId: "e23",
      text: "Randonnée gourmande autour de Grenoble : on marche trois heures et on s'arrête quatre fois pour manger. C'est un rapport marche/fromage que j'assume complètement.\n\n11 km, 400 D+, rien de technique.",
      createdAt: hours(26), likes: 171, liked: false, comments: []},
    { id: "p_ev2_e28", authorId: "u_emma", passion: "sport", mood: "irl", type: "text", cover: "horizon", eventId: "e28",
      text: "Initiation surf au coucher du soleil à Biarritz. La houle de fin de journée est plus douce, et la lumière fait tout le reste.\n\nPlanche fournie, combinaison aussi. Il ne manque que le courage de se lever quand on tombe.",
      createdAt: hours(34), likes: 204, liked: false, comments: [
        { id: "cp_ev2_e28_0", authorId: "u_mehdi", text: "La Côte des Basques en fin de journée, il n'y a pas mieux pour commencer.", createdAt: hours(30), likes: 16, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev2_e31", authorId: "u_zoe", passion: "photo", mood: "irl", type: "text", cover: "street", eventId: "e31",
      text: "Atelier photo de rue à Marseille. Deux heures, un quartier, une consigne : une seule photo par lieu, on ne rafale pas.\n\nC'est frustrant les vingt premières minutes, et libérateur ensuite.",
      createdAt: hours(11), likes: 112, liked: false, comments: []},
    { id: "p_ev2_e32", authorId: "u_nabil", passion: "jeuxvideo", mood: "irl", type: "text", cover: "neon", eventId: "e32",
      text: "Soirée jeux indés à Rennes. On teste des prototypes, dont deux qui ne sont pas finis — et c'est le meilleur moment pour y jouer, quand les créateurs sont dans la salle et notent tout.\n\nJ'apporte le mien, il plante encore une fois sur trois.",
      createdAt: hours(19), likes: 78, liked: false, comments: [
        { id: "cp_ev2_e32_0", authorId: "u_tom", text: "Un proto qui plante une fois sur trois, c'est un proto qui marche deux fois sur trois. 🎮", createdAt: hours(16), likes: 9, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev2_e33", authorId: "u_paul", passion: "cuisine", mood: "irl", type: "text", cover: "workshop", eventId: "e33",
      text: "Dégustation de bières artisanales à Lille. Cinq brasseries du coin, une explication par brasseur, et pas un mot de marketing.\n\nJ'y ai appris plus sur la fermentation en deux heures qu'en trois ans de lecture.",
      createdAt: hours(40), likes: 95, liked: false, comments: []},
    { id: "p_ev2_e34", authorId: "u_rita", passion: "mode", mood: "irl", type: "text", cover: "mode", eventId: "e34",
      text: "Atelier upcycling à Paris. Tu viens avec un vêtement que tu ne mets plus, tu repars avec un vêtement que tu mets.\n\nZoé a une façon de couper une manche qui donne envie de tout recommencer.",
      createdAt: hours(23), likes: 156, liked: false, comments: [
        { id: "cp_ev2_e34_0", authorId: "u_zoe", text: "Apporte plutôt deux pièces, on a le temps. ✂️", createdAt: hours(20), likes: 12, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev2_e35", authorId: "u_sami", passion: "podcast", mood: "irl", type: "text", cover: "podcast", eventId: "e35",
      text: "Enregistrement de podcast en public à Montréal. Le format est simple : le micro est ouvert, le montage viendra après, et les hésitations restent.\n\nÉcouter quelqu'un chercher sa phrase en direct, c'est étrangement captivant.",
      createdAt: hours(28), likes: 73, liked: false, comments: []},
    { id: "p_ev2_e37", authorId: "u_anais", passion: "litterature", mood: "irl", type: "text", cover: "book", eventId: "e37",
      text: "Rencontre avec une autrice à Bordeaux. Pas une séance de dédicaces : une vraie discussion, avec des questions du public qui n'ont pas été triées.\n\nCe sont toujours les meilleures.",
      createdAt: hours(44), likes: 101, liked: false, comments: [
        { id: "cp_ev2_e37_0", authorId: "u_sofia", text: "Elle répond vraiment, c'est rare. 📚", createdAt: hours(40), likes: 13, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev2_e38", authorId: "u_chloe", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen", eventId: "e38",
      text: "Atelier pâtisserie végane à Nice. Hugo montre comment tenir une meringue sans blanc d'œuf — j'ai vu la démonstration deux fois et je n'y crois toujours pas.\n\nOn repart avec ce qu'on a fait, quand il en reste.",
      createdAt: hours(15), likes: 138, liked: false, comments: []},
    { id: "p_ev2_e39", authorId: "u_mila", passion: "yoga", mood: "irl", type: "text", cover: "sunrise", eventId: "e39",
      text: "Yoga au coucher du soleil en montagne, au-dessus de Chamonix. Une heure trente, dont vingt bonnes minutes juste allongés à regarder la lumière tomber sur les aiguilles.\n\nPrends une couche de plus que tu ne penses.",
      createdAt: hours(37), likes: 167, liked: false, comments: []},
    { id: "p_ev2_e40", authorId: "u_lea", passion: "musique", mood: "irl", type: "text", cover: "studio", eventId: "e40",
      text: "Rencontre entre beatmakers à Saint-Denis. Chacun amène deux boucles, on les écoute, on dit ce qu'on entend. Aucun classement, aucun concours.\n\nLa dernière fois, deux personnes sont reparties en collaborant.",
      createdAt: hours(12), likes: 124, liked: false, comments: [
        { id: "cp_ev2_e40_0", authorId: "u_oussa", text: "Ramenez des boucles pas finies, ce sont les plus intéressantes.", createdAt: hours(10), likes: 15, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev2_e41", authorId: "u_chloe", passion: "yoga", mood: "irl", type: "text", cover: "nature", eventId: "e41",
      text: "Yoga du matin à Versailles, 7h, dans le parc. C'est tôt, il fait frais, et c'est précisément pour ça que la journée qui suit n'a plus la même texture.\n\nTapis fourni si tu n'en as pas.",
      createdAt: hours(5), likes: 89, liked: false, comments: []},
    { id: "p_ev2_e42", authorId: "u_greg", passion: "sport", mood: "irl", type: "text", cover: "trail", eventId: "e42",
      text: "Balade vélo à Fontainebleau. Chemins forestiers, aucune côte méchante, et un arrêt long au milieu.\n\nC'est la sortie que je conseille à qui n'a pas roulé depuis dix ans — j'en étais il y a deux ans.",
      createdAt: hours(8), likes: 107, liked: false, comments: []},
    { id: "p_ev2_e43", authorId: "u_noa", passion: "photo", mood: "irl", type: "text", cover: "nature", eventId: "e43",
      text: "Pique-nique photo à Fontainebleau. On marche, on s'arrête, on mange, on photographie ce qui traîne. Aucune consigne technique.\n\nLes rochers en fin d'après-midi, c'est une lumière qu'on ne trouve pas ailleurs si près de Paris.",
      createdAt: hours(16), likes: 93, liked: false, comments: []},
    { id: "p_ev2_e44", authorId: "u_lucie", passion: "art", mood: "irl", type: "text", cover: "workshop", eventId: "e44",
      text: "Atelier poterie à Fontainebleau. Trois heures pour faire un objet que tu utiliseras tous les jours, et pour comprendre pourquoi il est plus lourd que ceux du commerce.\n\nMes mains s'en souviennent encore le lendemain.",
      createdAt: hours(25), likes: 81, liked: false, comments: [
        { id: "cp_ev2_e44_0", authorId: "u_lou", text: "Le poids, c'est ce qui rend l'objet vivant. 🏺", createdAt: hours(22), likes: 10, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev2_e45", authorId: "u_tom", passion: "litterature", mood: "irl", type: "text", cover: "book", eventId: "e45",
      text: "Brunch littéraire à Rambouillet. On amène un livre, on en parle cinq minutes, et on repart avec celui de quelqu'un d'autre.\n\nJ'ai découvert trois auteurs comme ça, dont aucun que j'aurais ouvert seul.",
      createdAt: hours(32), likes: 76, liked: false, comments: []},
    { id: "p_ev2_e46", authorId: "u_raph", passion: "musique", mood: "irl", type: "text", cover: "stage", eventId: "e46",
      text: "Jam jazz à Boulogne. Standards, grille affichée au mur, et un batteur qui rattrape tout le monde.\n\nSi tu joues d'un instrument et que tu n'as jamais osé : c'est la salle où oser.",
      createdAt: hours(7), likes: 118, liked: false, comments: []},
    { id: "p_ev2_e47", authorId: "u_yanis", passion: "tech", mood: "irl", type: "text", cover: "tech2", eventId: "e47",
      text: "Meetup tech à Neuilly. Deux présentations courtes, puis une heure où on parle vraiment — c'est cette heure-là qui vaut le déplacement.\n\nAucun recruteur, c'est écrit dans les règles.",
      createdAt: hours(10), likes: 134, liked: false, comments: [
        { id: "cp_ev2_e47_0", authorId: "u_raph", text: "La règle « aucun recruteur » change tout le ton de la soirée.", createdAt: hours(8), likes: 18, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev2_e48", authorId: "u_mila", passion: "danse", mood: "irl", type: "text", cover: "dance", eventId: "e48",
      text: "Danse urbaine à Montreuil. Deux heures, un enchaînement court, et on le répète jusqu'à ce qu'il rentre dans le corps.\n\nLa première demi-heure est ingrate. La dernière est ce pour quoi on vient.",
      createdAt: hours(14), likes: 149, liked: false, comments: []},
    { id: "p_ev2_e49", authorId: "u_zoe", passion: "mode", mood: "irl", type: "text", cover: "mode", eventId: "e49",
      text: "Workshop mode éthique dans le Marais. On démonte une chaîne de production, pièce par pièce, et on regarde ce que coûte vraiment un t-shirt à 5 €.\n\nCe n'est pas culpabilisant, c'est documenté.",
      createdAt: hours(29), likes: 162, liked: false, comments: [
        { id: "cp_ev2_e49_0", authorId: "u_rita", text: "Les chiffres sont sourcés, c'est ce qui rend l'atelier utile.", createdAt: hours(26), likes: 14, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev2_e50", authorId: "u_emma", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen", eventId: "e50",
      text: "Cuisine méditerranéenne à La Défense, le soir. Un plat, trois techniques, et on mange ce qu'on a fait autour d'une grande table.\n\nLe format « on cuisine puis on dîne ensemble » vaut tous les cours du monde.",
      createdAt: hours(20), likes: 128, liked: false, comments: []},
    { id: "p_ev_partage", authorId: "u_mehdi", passion: "sport", mood: "irl", type: "text",
      sharedReelData: { kind: "event", id: "e28", title: "Initiation surf coucher de soleil", city: "Biarritz", venue: "Plage de la Côte des Basques", date: "", passion: "sport" },
      text: "Je partage, parce que c'est le genre de truc qu'on repousse pendant trois étés.\n\nDeux heures, planche fournie, et la houle de fin de journée est plus douce.",
      createdAt: hours(9), likes: 189, liked: false, comments: [] },

    // ==== FIL DE DÉMONSTRATION ÉLARGI (2026-08-28) ====
    // Benjamin voulait « un max de contenu fake pour tout tester ». Ces
    // publications couvrent les 19 passions du catalogue et les cinq moods,
    // pour qu'aucun compte ne tombe sur un fil vide quels que soient ses
    // centres d'intérêt. Ajoutées EN FIN de tableau : trois suites prennent
    // `state.seed.posts[0]` sans le choisir, insérer en tête changerait leur
    // sujet en silence.
    { id: "p201", authorId: "u_lea", passion: "musique", mood: "creation", type: "text", cover: "studio",
      text: "Trois jours que je bloque sur le pont de ce morceau. Hier soir j'ai lâché l'accord de sol majeur pour un mi mineur 7, et tout s'est débloqué d'un coup. Enregistré en une prise à 23h, micro à 30 cm de la rosace, la voisine n'a rien dit. 🎸\nIl reste le solo à écrire, mais la chanson existe.",
      createdAt: hours(3), likes: 47, liked: false, comments: [
        { id: "cp201_0", authorId: "u_oussa", text: "Le mi mineur 7 sauve à peu près tout, je confirme. Tu joues en accordage standard ou en drop D ?", createdAt: hours(2), likes: 6, likedBy: [], emojis: [], replies: [] },
        { id: "cp201_1", authorId: "u_amira", text: "Une prise à 23h, respect. J'ai hâte d'entendre le solo.", createdAt: hours(1), likes: 4, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p202", authorId: "u_oussa", passion: "musique", mood: "learn", type: "text", cover: "studio",
      text: "J'ai passé la semaine à régler mon sidechain à l'oreille au lieu de recopier des chiffres. Résultat : release à 180 ms là où je mettais 40 ms partout depuis deux ans. Le kick respire enfin et le sub ne bouffe plus tout le bas.\nDeux ans à copier des réglages de tuto, une semaine à écouter pour de vrai. Je m'en veux un peu.",
      createdAt: hours(9), likes: 63, liked: false, comments: []},
    { id: "p203", authorId: "u_lea", passion: "musique", mood: "irl", type: "photo", cover: "stage",
      text: "Scène ouverte au-dessus de la Saône hier soir : quinze personnes, un ampli qui grésille, deux projecteurs. J'ai joué trois morceaux dont un qui n'était jamais sorti de ma chambre. Un type au fond a repris le refrain au deuxième couplet alors qu'il ne le connaissait pas.\nC'est exactement pour ça que je sors de chez moi.",
      createdAt: hours(18), likes: 128, liked: false, comments: [
        { id: "cp203_0", authorId: "u_karim", text: "Quinze personnes qui écoutent vraiment, ça vaut mieux que mille qui scrollent.", createdAt: hours(14), likes: 11, likedBy: [], emojis: [], replies: [] },
        { id: "cp203_1", authorId: "u_mila", text: "La lumière du quai rend super bien sur la photo.", createdAt: hours(9), likes: 5, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p204", authorId: "u_oussa", passion: "musique", mood: "chill", type: "text", cover: "neon",
      text: "Trois heures de fouille dans les bacs à 2 € aux Puces. Reparti avec une compile de variété turque des années 70, pochette mangée par l'humidité mais vinyle nickel. Il y a une intro de batterie de six secondes dessus, un peu à côté du tempo, que je vais boucler tout l'hiver.",
      createdAt: hours(41), likes: 34, liked: false, comments: []},
    { id: "p205", authorId: "u_lea", passion: "musique", mood: "learn", type: "text", cover: "studio",
      text: "J'ai enfin appris à m'accorder à l'oreille, sans appli. La méthode de mon prof : caler le la, puis tout le reste aux harmoniques, case 5 contre case 7. Trois semaines pour que ça devienne fiable.\nMaintenant je sens que la guitare a bougé avant même de jouer. La dépendance à l'accordeur, c'était un vrai plafond.",
      createdAt: hours(76), likes: 52, liked: false, comments: []},
    { id: "p206", authorId: "u_oussa", passion: "musique", mood: "actu", type: "text", cover: "news",
      text: "La salle de répète où j'ai commencé ferme en décembre, le bail n'est pas renouvelé. Six studios à 8 € l'heure : la moitié des groupes du coin y ont fait leurs premières maquettes.\nRéunion mardi soir pour voir ce qu'on peut monter ailleurs. Si vous entendez parler d'un local, même moche, même froid, je prends.",
      createdAt: hours(122), likes: 211, liked: false, comments: [
        { id: "cp206_0", authorId: "u_lea", text: "Pareil à Lyon, deux salles fermées en un an. C'est quoi le prix moyen ailleurs chez vous ?", createdAt: hours(110), likes: 18, likedBy: [], emojis: [], replies: [] },
        { id: "cp206_1", authorId: "u_amira", text: "On cherche aussi un lieu pour la danse. Si un local se libère on mutualise ?", createdAt: hours(96), likes: 22, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p207", authorId: "u_karim", passion: "photo", mood: "creation", type: "photo", cover: "street",
      text: "Boulevard de Belleville, 7h10. La buée d'un camion de livraison coupait la lumière rasante en deux. J'ai attendu vingt minutes qu'un passant traverse le faisceau : trois sont passés trop vite, le quatrième s'est arrêté pour allumer une cigarette.\n35 mm, f/2.8, 1/250. Une seule image gardée sur soixante.",
      createdAt: hours(5), likes: 174, liked: false, comments: [
        { id: "cp207_0", authorId: "u_noa", text: "Le type qui s'arrête pour sa clope, tu ne pouvais pas rêver mieux.", createdAt: hours(4), likes: 9, likedBy: [], emojis: [], replies: [] },
        { id: "cp207_1", authorId: "u_zoe", text: "Une sur soixante, ça me rassure beaucoup en fait.", createdAt: hours(2), likes: 7, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p208", authorId: "u_karim", passion: "photo", mood: "learn", type: "text", cover: "street",
      text: "J'ai arrêté la rafale pendant un mois entier. Une photo, une décision, et on avance. Je rentre avec 40 fichiers au lieu de 600, et j'en garde davantage en proportion.\nLe tri me prenait plus de temps que la marche : c'était devenu absurde de photographier pour trier.",
      createdAt: hours(27), likes: 58, liked: false, comments: []},
    { id: "p209", authorId: "u_zoe", passion: "photo", mood: "creation", type: "photo", cover: "neon",
      text: "Premier shooting de la collection en pleine rue, 22h, sous l'enseigne d'un kebab de Ménilmontant. Le rouge du néon tombait pile sur la veste recyclée : zéro retouche colorimétrique derrière, c'est la lumière brute. Le patron nous a laissé une heure et offert le thé.\nBudget éclairage : 0 €.",
      createdAt: hours(53), likes: 96, liked: false, comments: [
        { id: "cp209_0", authorId: "u_karim", text: "Le néon de kebab, meilleure softbox de Paris. Personne ne le dit assez.", createdAt: hours(44), likes: 15, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p210", authorId: "u_karim", passion: "photo", mood: "chill", type: "text", cover: "street",
      text: "Journée blanche. Trois heures dehors, pas une image. J'ai fini assis au bord du canal à regarder les gens sans lever l'appareil une seule fois.\nCertains jours l'œil ne s'allume pas. Forcer ne donne que des photos qu'on efface le soir même.",
      createdAt: hours(88), likes: 41, liked: false, comments: []},
    { id: "p211", authorId: "u_noa", passion: "photo", mood: "learn", type: "text", cover: "tech",
      text: "Je passe mes journées à étalonner des plans, donc je pensais que la photo serait facile. Raté. J'ai compris cette semaine que je corrigeais mes images comme du montage : en cherchant la continuité avec la suivante.\nSauf qu'une photo n'a pas de suivante. Il a fallu réapprendre à traiter chaque fichier comme une fin en soi.",
      createdAt: hours(134), likes: 73, liked: false, comments: [
        { id: "cp211_0", authorId: "u_karim", text: "Bien vu. Une photo, c'est un plan qui n'a pas de raccord.", createdAt: hours(120), likes: 13, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p212", authorId: "u_karim", passion: "photo", mood: "irl", type: "photo", cover: "street",
      text: "Balade photo improvisée dimanche avec quatre personnes rencontrées ici. Rendez-vous à Stalingrad, marche jusqu'à la Villette, aucun itinéraire prévu. Une seule règle : on ne montre rien avant la fin.\nOn a comparé devant un café à 18h. Quatre appareils, un même trajet, pas une photo en commun.",
      createdAt: hours(167), likes: 142, liked: false, comments: []},
    { id: "p213", authorId: "u_nina", passion: "voyage", mood: "irl", type: "photo", cover: "horizon",
      text: "Trois semaines que je travaille depuis Sète. Bureau : une table en formica au-dessus du canal, wifi correct sauf entre 19h et 21h quand tout l'immeuble rentre. J'ai décalé mes appels du soir et je nage à 7h avant que la plage se remplisse.\nRepartir mardi va être compliqué.",
      createdAt: hours(2), likes: 88, liked: false, comments: [
        { id: "cp213_0", authorId: "u_clara", text: "Sète en septembre, c'est carrément de la triche.", createdAt: hours(1), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp213_1", authorId: "u_emma", text: "Le bain de 7h change une journée entière, vraiment.", createdAt: hours(1), likes: 4, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p214", authorId: "u_clara", passion: "voyage", mood: "creation", type: "text", cover: "sunrise",
      text: "Jour 22 : 96 km de Ljubljana à Trieste, dont 40 sous la pluie. Deux crevaisons dans la même heure, la seconde parce que j'avais mal remonté le pneu à la première. Leçon apprise à genoux sur le bas-côté : vérifier la tringle sur tout le tour, toujours.\nArrivée à la mer à 19h. Trempée, salée, contente.",
      createdAt: hours(14), likes: 156, liked: false, comments: [
        { id: "cp214_0", authorId: "u_greg", text: "Deux crevaisons d'affilée, la vraie signature de la fatigue. Bravo pour l'arrivée.", createdAt: hours(11), likes: 12, likedBy: [], emojis: [], replies: [] },
        { id: "cp214_1", authorId: "u_mehdi", text: "96 bornes sous la flotte, c'est du solide. Tu portes combien de charge ?", createdAt: hours(6), likes: 8, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p215", authorId: "u_nina", passion: "voyage", mood: "learn", type: "text", cover: "book",
      text: "J'ai enfin compris pourquoi mes premiers mois de nomadisme étaient épuisants : je changeais de ville tous les huit jours. Depuis que je reste trois semaines minimum, je connais la boulangère, j'ai une salle où courir, je dors mieux.\nJe vois beaucoup moins de pays et infiniment plus de choses.",
      createdAt: hours(35), likes: 119, liked: false, comments: []},
    { id: "p216", authorId: "u_greg", passion: "voyage", mood: "irl", type: "photo", cover: "nature",
      text: "Col de la Croix-Morand hier matin, 6 °C, brouillard épais jusqu'à 1100 m puis plus rien que du soleil au-dessus. J'ai coupé le moteur en haut pour écouter : le vent, et une cloche de vache très loin en contrebas.\n180 km avant le petit-déjeuner, ça vaut toutes les grasses matinées du monde.",
      createdAt: hours(61), likes: 102, liked: false, comments: []},
    { id: "p217", authorId: "u_clara", passion: "voyage", mood: "chill", type: "text", cover: "horizon",
      text: "Ce soir : bivouac sur une aire de repos croate, entre deux semi-remorques. Absolument pas romantique. Douche au robinet, pâtes au réchaud, et un chauffeur slovène qui m'a offert un café en m'expliquant que j'étais folle.\nIl a probablement raison, mais j'ai bien dormi.",
      createdAt: hours(105), likes: 67, liked: false, comments: []},
    { id: "p218", authorId: "u_nina", passion: "voyage", mood: "actu", type: "text", cover: "news_europe",
      text: "Depuis janvier, la taxe de séjour a doublé dans deux villes où je passais souvent, et les tarifs mensuels ont disparu de plusieurs plateformes. Concrètement, un mois à Porto me coûte 200 € de plus qu'il y a un an, à confort identique.\nJe ne dis pas que c'est injuste : les habitants morflent bien plus que moi. Je dis juste que le nomadisme pas cher, c'est terminé.",
      createdAt: hours(151), likes: 198, liked: false, comments: [
        { id: "cp218_0", authorId: "u_sami", text: "Le débat est exactement le même à Bruxelles, il y a un vrai sujet à creuser là-dedans.", createdAt: hours(140), likes: 19, likedBy: [], emojis: [], replies: [] },
        { id: "cp218_1", authorId: "u_clara", text: "Je le vois sur les campings aussi, autour de +30 % en deux ans.", createdAt: hours(128), likes: 14, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p219", authorId: "u_theo", passion: "cuisine", mood: "creation", type: "photo", cover: "kitchen",
      text: "Menu de mardi pour six couverts chez un client : sardines marinées, épaule d'agneau confite sept heures, glace au laurier testée pour la première fois en vrai service. Le laurier, il en faut trois fois moins qu'on ne croit — première infusion beaucoup trop amère, jetée. La seconde, huit feuilles pour un litre, était juste.\nAssiettes revenues vides.",
      createdAt: hours(4), likes: 134, liked: false, comments: [
        { id: "cp219_0", authorId: "u_hugo", text: "La glace au laurier j'y pense depuis des mois sans oser. Tu infuses à froid ou à chaud ?", createdAt: hours(3), likes: 10, likedBy: [], emojis: [], replies: [] },
        { id: "cp219_1", authorId: "u_lucie", text: "Mon laurier déborde au jardin, je t'en mets de côté.", createdAt: hours(2), likes: 6, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p220", authorId: "u_hugo", passion: "cuisine", mood: "learn", type: "text", cover: "kitchen",
      text: "Quatrième version de ma ganache sans crème. Le mélange lait de coco et chocolat 70 % tranchait systématiquement en refroidissant. Le problème n'était pas la recette mais la température : j'émulsionnais à 45 °C au lieu de 35 °C.\nDepuis, elle est lisse et tient trois jours en vitrine. Dix euros de chocolat perdus pour cinq degrés.",
      createdAt: hours(21), likes: 81, liked: false, comments: []},
    { id: "p221", authorId: "u_theo", passion: "cuisine", mood: "chill", type: "text", cover: "kitchen",
      text: "Soir de repos, donc évidemment j'ai cuisiné. Des pâtes à l'ail, huile d'olive et piment, sans rien mesurer, debout devant la casserole à 23h.\nC'est le seul moment de la semaine où personne ne me dit ce qu'il aime ou n'aime pas.",
      createdAt: hours(49), likes: 29, liked: false, comments: []},
    { id: "p222", authorId: "u_hugo", passion: "cuisine", mood: "irl", type: "photo", cover: "kitchen",
      text: "Atelier de six personnes samedi dans le labo : tartes aux fruits d'été, pâte sablée sans beurre. Deux fonçages ratés, on a tout recommencé ensemble, et c'est là que tout le monde a compris — la pâte doit sortir du froid dure, pas souple.\nOn a mangé les ratées à 16h. Elles étaient très bien.",
      createdAt: hours(97), likes: 110, liked: false, comments: [
        { id: "cp222_0", authorId: "u_theo", text: "Manger les ratées, meilleur moment de n'importe quel atelier.", createdAt: hours(88), likes: 9, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p223", authorId: "u_theo", passion: "cuisine", mood: "learn", type: "text", cover: "kitchen",
      text: "Je croyais saler correctement. Test à l'aveugle avec deux bouillons identiques, l'un à 8 g par litre, l'autre à 12. J'ai choisi le plus salé les trois fois, sans hésiter.\nDepuis des années je sale en dessous de ce que j'aime vraiment, par peur d'exagérer devant les clients. Ça se corrige à partir de ce soir.",
      createdAt: hours(143), likes: 92, liked: false, comments: []},
    { id: "p224", authorId: "u_hugo", passion: "cuisine", mood: "actu", type: "text", cover: "news",
      text: "Le beurre a encore pris 20 % chez mon fournisseur ce mois-ci. Ironie de la chose : je n'en utilise pas, mais tous les confrères autour de moi refont leur carte. Deux boulangeries du quartier ont sorti des viennoiseries à l'huile d'olive, pas par conviction, par arithmétique.\nCurieux de voir ce qu'il en restera quand les cours redescendront.",
      createdAt: hours(192), likes: 167, liked: false, comments: [
        { id: "cp224_0", authorId: "u_theo", text: "Même constat à Marseille. Certains ne reviendront pas en arrière, le goût plaît.", createdAt: hours(175), likes: 16, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p231", authorId: "u_mehdi", passion: "sport", mood: "learn", type: "text", cover: "trail",
      text: "Troisième sortie de la semaine sur le Semnoz, et j'ai enfin compris un truc bête : je partais beaucoup trop vite sur les 800 premiers mètres. Cette fois j'ai bridé à 145 de moyenne cardio sur toute la première montée, quitte à me faire doubler par un monsieur de soixante ans. Résultat : 12 minutes de mieux sur la boucle, et je suis rentré en marchant normalement au lieu de ramper jusqu'au frigo.",
      createdAt: hours(3), likes: 74, liked: false, comments: [
        { id: "cp231_0", authorId: "u_jona", text: "Le coup de partir doucement, ça met deux ans à rentrer dans le crâne. Bien joué.", createdAt: hours(2), likes: 6, likedBy: [], emojis: [], replies: [] },
        { id: "cp231_1", authorId: "u_emma", text: "Tu récupères comment après ? J'ai jamais trouvé mon rythme sur les lendemains de grosse sortie.", createdAt: hours(1), likes: 3, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p232", authorId: "u_jona", passion: "sport", mood: "creation", type: "photo", cover: "nature",
      text: "J'ai ouvert une voie sur le petit secteur au-dessus de la maison. Trois jours à brosser la mousse, deux spits posés à la main, et un pas de bloc au milieu que je n'arrive toujours pas à enchaîner moi-même. C'est probablement du 6c, peut-être du 7a si je suis honnête sur la sortie. Le nom viendra quand quelqu'un d'autre l'aura grimpée avant moi.",
      createdAt: hours(9), likes: 128, liked: false, comments: [
        { id: "cp232_0", authorId: "u_mehdi", text: "Tu la nommes le jour où je viens me faire mal dessus alors.", createdAt: hours(6), likes: 9, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p233", authorId: "u_clara", passion: "sport", mood: "chill", type: "text", cover: "sunrise",
      text: "Petit-déjeuner à 6h30 sur un banc en béton face à la Loire, café instantané dégueulasse mais chaud, 40 km déjà dans les jambes. Je n'ai croisé personne pendant deux heures à part un héron qui m'a clairement jugée. Ce sont ces matins-là que je garde, jamais les cols.",
      createdAt: hours(22), likes: 96, liked: false, comments: []},
    { id: "p234", authorId: "u_emma", passion: "sport", mood: "learn", type: "text", cover: "horizon",
      text: "Un coureur m'a demandé pourquoi il avait toujours mal aux ischios malgré vingt minutes d'étirements par jour.\nCe qu'on a changé pendant trois semaines :\n- zéro étirement passif\n- soulevé de terre jambes tendues, 3x8, deux fois par semaine\n- rien d'autre\nPlus aucune douleur depuis. Il étirait un muscle déjà surchargé et jamais renforcé. L'étirement n'est pas toujours la réponse, parfois c'est même la question. 🙂",
      createdAt: hours(47), likes: 183, liked: false, comments: [
        { id: "cp234_0", authorId: "u_mehdi", text: "Je fais exactement l'erreur que tu décris depuis un an. Je teste dès lundi.", createdAt: hours(40), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p235", authorId: "u_mehdi", passion: "sport", mood: "irl", type: "photo", cover: "trail",
      text: "On était onze au départ du parking de Talloires samedi à 7h, on est rentrés à neuf : deux ont bifurqué vers la buvette au deuxième col et honnêtement je les comprends. 21 km, 1 300 m de dénivelé, une longue pause au sommet parce que la lumière était trop belle pour ne pas s'asseoir. Prochaine sortie dans quinze jours, même heure, et j'assume le rythme lent.",
      createdAt: hours(88), likes: 212, liked: false, comments: [
        { id: "cp235_0", authorId: "u_jona", text: "Neuf sur onze, c'est un très bon score pour une sortie de ce format.", createdAt: hours(80), likes: 7, likedBy: [], emojis: [], replies: [] },
        { id: "cp235_1", authorId: "u_clara", text: "Je serais venue si je n'avais pas été à 600 km de là. La prochaine, promis.", createdAt: hours(71), likes: 5, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p236", authorId: "u_jona", passion: "sport", mood: "actu", type: "text", cover: "nature",
      text: "Le secteur des Gaillands est fermé jusqu'à mi-juillet pour la nidification des faucons. Chaque année les mêmes discussions au pied des voies, et chaque année je répète la même chose : on a onze mois, ils en ont trois semaines. J'ai vu deux cordées passer outre dimanche matin. Ça finira par se régler avec un arrêté beaucoup plus large, et on l'aura cherché.",
      createdAt: hours(160), likes: 147, liked: false, comments: []},
    { id: "p237", authorId: "u_sofia", passion: "litterature", mood: "learn", type: "text", cover: "book",
      text: "J'ai relu Les Vagues en me forçant à ne pas chercher qui parle. Troisième tentative, et la première fois que ça tient : dès qu'on lâche l'idée qu'il y a six personnages, il reste six voix qui se répondent, et le livre devient presque évident à voix haute. J'ai lu quinze pages debout dans ma cuisine hier soir, ça change complètement le rythme.",
      createdAt: hours(5), likes: 88, liked: false, comments: [
        { id: "cp237_0", authorId: "u_liam", text: "Tu viens de me convaincre de le ressortir de l'étagère où il dort depuis 2019.", createdAt: hours(3), likes: 8, likedBy: [], emojis: [], replies: [] },
        { id: "cp237_1", authorId: "u_val", text: "À voix haute, oui. Ça marche aussi très bien pour Duras, d'ailleurs.", createdAt: hours(2), likes: 12, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p238", authorId: "u_sofia", passion: "litterature", mood: "chill", type: "photo", cover: "nature",
      text: "Trois heures au Jardin public, un banc à l'ombre, 180 pages d'un roman islandais dont je ne retiendrai aucun nom de personnage. Je n'ai rien annoté, rien souligné, rien photographié. Ça faisait des mois que je n'avais pas lu comme ça, sans rien préparer derrière.",
      createdAt: hours(30), likes: 64, liked: false, comments: []},
    { id: "p239", authorId: "u_liam", passion: "litterature", mood: "creation", type: "text", cover: "studio",
      text: "J'ai coupé 40 minutes d'un entretien d'1h20 avec une traductrice, et ce qui reste, ce sont les silences. Elle mettait sept ou huit secondes avant chaque réponse. La première fois j'ai voulu resserrer, puis j'ai compris que c'était le sujet même de l'épisode. Le montage final garde les pauses entières. C'est lent, et je crois que c'est le meilleur qu'on ait fait.",
      createdAt: hours(64), likes: 156, liked: false, comments: [
        { id: "cp239_0", authorId: "u_noa", text: "Garder les silences, c'est presque toujours le bon choix au montage. Et le plus dur à défendre.", createdAt: hours(58), likes: 14, likedBy: [], emojis: [], replies: [] },
        { id: "cp239_1", authorId: "u_sofia", text: "Tu la nommes ? Je veux lire ce qu'elle a traduit.", createdAt: hours(50), likes: 6, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p240", authorId: "u_val", passion: "litterature", mood: "actu", type: "text", cover: "book",
      text: "Le prix est allé à un essai de 700 pages sur les frontières maritimes, et je vois passer beaucoup de gens qui le trouvent illisible sans l'avoir ouvert. J'ai lu les cent premières pages : c'est dense, très mal découpé, et il y a dedans trois chapitres que je ferai lire à mes étudiants pendant dix ans. Les deux choses sont vraies en même temps.",
      createdAt: hours(100), likes: 121, liked: false, comments: []},
    { id: "p241", authorId: "u_sami", passion: "litterature", mood: "irl", type: "photo", cover: "book",
      text: "Rencontre en librairie hier soir à Ixelles, une trentaine de personnes, une autrice qui a refusé de lire un extrait et a préféré répondre aux questions pendant une heure. Meilleure soirée littéraire depuis longtemps. J'ai posé une question un peu maladroite sur ses sources, elle a répondu vingt minutes. Je suis reparti avec deux bouquins non prévus.",
      createdAt: hours(130), likes: 73, liked: false, comments: [
        { id: "cp241_0", authorId: "u_sofia", text: "Les lectures d'extraits me font toujours décrocher. Elle a eu mille fois raison.", createdAt: hours(120), likes: 9, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p242", authorId: "u_sofia", passion: "litterature", mood: "creation", type: "text", cover: "book",
      text: "J'ai recommencé un carnet de lecture après six ans d'arrêt. Règle unique : une page par livre, écrite le lendemain et jamais le jour même. Ce décalage de vingt-quatre heures fait le tri tout seul — ce qui reste au matin, c'est ce que le livre m'a vraiment laissé. Neuf livres, neuf pages, et deux que j'aurais jurés marquants tiennent en trois lignes.",
      createdAt: hours(190), likes: 109, liked: false, comments: []},
    { id: "p243", authorId: "u_noa", passion: "cinema", mood: "creation", type: "text", cover: "neon",
      text: "Journée entière sur une séquence de 90 secondes, quatre versions. La bonne est celle où j'ai enlevé le contrechamp sur la fille : on ne la voit pas réagir, on entend juste sa respiration changer. Le réalisateur a dit non pendant trois heures, puis a demandé à la revoir seul. Il est revenu en disant qu'on gardait ma version. Rarement été aussi fatiguée et contente.",
      createdAt: hours(2), likes: 167, liked: false, comments: [
        { id: "cp243_0", authorId: "u_karim", text: "Ne rien montrer, c'est toujours ce qui coûte le plus cher à défendre.", createdAt: hours(1), likes: 15, likedBy: [], emojis: [], replies: [] },
        { id: "cp243_1", authorId: "u_liam", text: "Bravo d'avoir tenu trois heures. Moi j'aurais lâché à la deuxième.", createdAt: hours(1), likes: 7, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p244", authorId: "u_kaoru", passion: "cinema", mood: "learn", type: "text", cover: "neon",
      text: "Rétrospective Naruse en ce moment, six films en pellicule. Hier soir, Nuages flottants, salle aux deux tiers pleine un mardi. Ce qui me frappe à chaque fois : il ne coupe presque jamais sur un visage au moment de l'émotion, la caméra reste sur un couloir, une porte, une théière, et on comprend quand même. J'y retourne jeudi pour celui de 1960.",
      createdAt: hours(18), likes: 92, liked: false, comments: []},
    { id: "p245", authorId: "u_noa", passion: "cinema", mood: "chill", type: "photo", cover: "studio",
      text: "Fin de journée, la timeline est sauvegardée, il reste un fond de café froid et le ventilateur de la station qui fait plus de bruit que le film. Je reste vingt minutes de plus juste pour le silence de la salle de montage vide. C'est mon moment préféré de la semaine et personne n'y croit quand je le dis.",
      createdAt: hours(40), likes: 118, liked: false, comments: [
        { id: "cp245_0", authorId: "u_raph", text: "Je connais exactement ce moment, en version open space vidé à 20h.", createdAt: hours(33), likes: 10, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p246", authorId: "u_karim", passion: "cinema", mood: "learn", type: "photo", cover: "street",
      text: "J'ai passé une soirée à refaire des plans de Night on Earth avec mon appareil, assis à l'arrière d'un taxi, juste pour comprendre la lumière. Conclusion : ils n'ont quasiment pas triché. Les visages sont éclairés par les enseignes et les phares d'en face, rien d'autre. J'ai perdu quatre-vingts photos et gagné une intuition que je n'avais pas.",
      createdAt: hours(75), likes: 204, liked: false, comments: []},
    { id: "p247", authorId: "u_liam", passion: "cinema", mood: "actu", type: "text", cover: "neon",
      text: "Le festival annonce une section entière consacrée aux films tournés au téléphone, et je vois déjà arriver les commentaires méprisants. J'ai vu deux de ces films l'an dernier : l'un était mauvais, l'autre m'a tenu debout dans un couloir pendant quatre-vingt-dix minutes parce que la salle était pleine. Le format ne dit rien de ce qu'il y a dedans.",
      createdAt: hours(115), likes: 143, liked: false, comments: [
        { id: "cp247_0", authorId: "u_noa", text: "Merci. On a déjà eu ce débat avec le passage au numérique, mot pour mot.", createdAt: hours(108), likes: 18, likedBy: [], emojis: [], replies: [] },
        { id: "cp247_1", authorId: "u_kaoru", text: "Pareil ici, la section mobile est celle qui remplit le plus les salles.", createdAt: hours(99), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p248", authorId: "u_noa", passion: "cinema", mood: "irl", type: "text", cover: "neon",
      text: "Projection en plein air sur la dalle derrière chez moi, drap tendu entre deux poteaux, une trentaine de chaises dépareillées. Le son était mauvais, un scooter est passé au pire moment, et à la fin quelqu'un a applaudi tout seul avant que tout le monde suive. Je recommence en septembre, avec un vrai câble cette fois.",
      createdAt: hours(175), likes: 87, liked: false, comments: []},
    { id: "p249", authorId: "u_yanis", passion: "tech", mood: "creation", type: "text", cover: "tech",
      text: "J'ai supprimé 400 lignes aujourd'hui et l'application est plus rapide.\nCe qui est parti :\n- une couche de cache maison écrite il y a six mois\n- deux fonctions qui ne servaient qu'à la nourrir\n- un test qui vérifiait le cache et pas le résultat\nLe problème qu'elle réglait n'existe plus depuis que la requête a changé. Le plus dur a été de vérifier que personne ne s'en servait ailleurs : deux heures de lecture pour dix minutes de suppression.",
      createdAt: hours(6), likes: 231, liked: false, comments: [
        { id: "cp249_0", authorId: "u_raph", text: "La meilleure journée de code est souvent celle où on n'ajoute rien.", createdAt: hours(4), likes: 22, likedBy: [], emojis: [], replies: [] },
        { id: "cp249_1", authorId: "u_nabil", text: "400 lignes en moins, c'est 400 lignes qui ne casseront jamais un dimanche soir.", createdAt: hours(3), likes: 16, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p250", authorId: "u_raph", passion: "tech", mood: "learn", type: "text", cover: "tech",
      text: "Test utilisateur ce matin, cinq personnes, et les cinq ont cliqué sur le titre au lieu du bouton. Le bouton est plus gros, plus coloré, à dix centimètres de là. Le titre, lui, décrit exactement ce qu'ils veulent faire. On a passé trois semaines à travailler la forme du bouton alors que la réponse était d'écrire la bonne phrase au bon endroit.",
      createdAt: hours(26), likes: 189, liked: false, comments: []},
    { id: "p251", authorId: "u_yanis", passion: "tech", mood: "chill", type: "photo", cover: "neon",
      text: "23h, une seule lampe allumée, un bug qui disparaît quand j'ajoute un log et revient dès que je l'enlève. Je connais la suite : c'est un problème de timing et je vais mettre trois jours à l'admettre. Ce soir j'arrête là et je vais me coucher, ce qui est probablement la ligne de code la plus efficace de la journée.",
      createdAt: hours(55), likes: 152, liked: false, comments: [
        { id: "cp251_0", authorId: "u_tom", text: "Le bug qui s'évapore dès qu'on l'observe, mon ennemi juré depuis toujours.", createdAt: hours(48), likes: 19, likedBy: [], emojis: [], replies: [] },
        { id: "cp251_1", authorId: "u_nabil", text: "Trois jours, tu es très optimiste.", createdAt: hours(44), likes: 13, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p252", authorId: "u_nabil", passion: "tech", mood: "creation", type: "text", cover: "tech",
      text: "Prototype du système de dialogue en place : chaque phrase prononcée par le joueur consomme une ressource, donc parler coûte quelque chose. Les six premiers testeurs ont tous fini par se taire dans la deuxième scène, ce que je n'avais pas prévu du tout et qui est bien plus intéressant que ce que j'avais écrit. Je garde, et je réécris la scène autour de ce silence.",
      createdAt: hours(92), likes: 176, liked: false, comments: []},
    { id: "p253", authorId: "u_yanis", passion: "tech", mood: "actu", type: "text", cover: "tech",
      text: "Nouvelle version du modèle que j'utilise pour générer mes tests, et il a cassé exactement ce qu'il faisait bien : il ne respecte plus le format de sortie que j'avais fixé dans le prompt. Deux heures à comprendre que ça ne venait pas de mon code. J'ai épinglé la version précédente, et je note la leçon : ne jamais dépendre d'une chose qui bouge sans la figer.",
      createdAt: hours(140), likes: 198, liked: false, comments: [
        { id: "cp253_0", authorId: "u_raph", text: "Épingler les versions, la seule règle qui ne vieillit jamais.", createdAt: hours(132), likes: 17, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p254", authorId: "u_raph", passion: "tech", mood: "irl", type: "photo", cover: "neon",
      text: "Meetup design et dev hier soir à Bruxelles, quarante personnes dans un espace prévu pour vingt-cinq, et une démo qui a planté devant tout le monde. Le type a débogué en direct pendant huit minutes, personne n'est parti, et il a fini par trouver. C'était de loin le meilleur moment de la soirée. On apprend plus d'une panne assumée que d'une démo lisse.",
      createdAt: hours(198), likes: 134, liked: false, comments: []},
    { id: "p291", authorId: "u_emma", passion: "yoga", mood: "irl", type: "photo", cover: "sunrise",
      text: "Cours de 7h sur la Côte des Basques. On était quatorze, le sable encore froid, et la marée est montée plus vite que prévu — j'ai dû reculer les tapis deux fois pendant les salutations.\nPersonne n'a râlé, tout le monde a suivi en riant. À la fin il y a eu ce silence où on n'entend plus que les vagues et deux rameurs au loin. C'est pour ces dix secondes-là que je mets le réveil à 5h30.",
      createdAt: hours(6), likes: 187, liked: false, comments: [
        { id: "cp291_0", authorId: "u_mehdi", text: "Je passe devant vous en courant le samedi et je me demandais toujours ce que vous fabriquiez à cette heure-là. La prochaine fois je pose les baskets et je viens.", createdAt: hours(4), likes: 12, likedBy: [], emojis: [], replies: [] },
        { id: "cp291_1", authorId: "u_clara", text: "La marée qui monte pendant la séance, c'est très exactement mon niveau de stress. Vous faites ça toute l'année ?", createdAt: hours(2), likes: 7, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p292", authorId: "u_zoe", passion: "mode", mood: "creation", type: "photo", cover: "workshop",
      text: "Trois vestes de costume des années 80 chinées 4 € pièce, une seule survivante : la doublure des deux autres partait en poussière dès que l'aiguille passait.\nCelle qui reste devient un blouson court — épaules dégonflées, poches plaquées taillées dans une vieille toile de tente. Deux heures rien que pour découdre les épaulettes proprement. C'est la partie la plus longue et personne ne la verra jamais.",
      createdAt: hours(14), likes: 143, liked: false, comments: [
        { id: "cp292_0", authorId: "u_rita", text: "Les épaulettes 80s, c'est un chantier à elles seules. Tu gardes le col d'origine ou tu le refais ?", createdAt: hours(9), likes: 9, likedBy: [], emojis: [], replies: [] },
        { id: "cp292_1", authorId: "u_lou", text: "La toile de tente en poches, très bonne idée. Ça tient au lavage ?", createdAt: hours(5), likes: 4, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p293", authorId: "u_amira", passion: "danse", mood: "creation", type: "text", cover: "dance",
      text: "Je bosse le même passage de huit temps depuis dimanche et je n'arrive toujours pas à me relever du sol proprement. Je croyais que c'était un problème de force.\nFilmé au téléphone, ralenti à 0,25 : je pose la main trente centimètres trop loin devant, donc je pousse dans le vide. Deux ans que je m'entête sans jamais me filmer 🎬",
      createdAt: hours(3), likes: 96, liked: false, comments: [
        { id: "cp293_0", authorId: "u_mila", text: "La caméra est le prof le plus désagréable et le plus honnête. J'ai découvert exactement la même chose sur mes appuis l'an dernier.", createdAt: hours(1), likes: 6, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p294", authorId: "u_liam", passion: "podcast", mood: "learn", type: "text", cover: "studio",
      text: "Pendant six mois j'ai enregistré mes intros debout, micro à vingt centimètres. J'ai tout repris assis, micro à huit centimètres, chauffage coupé et rideaux tirés.\nLe bruit de fond est passé de -48 à -61 dB. Je peux supprimer la moitié de mon traitement, dont le réducteur de bruit qui bouffait les consonnes. Trois ans de podcast pour comprendre que le problème c'était la pièce, pas le micro.",
      createdAt: hours(9), likes: 74, liked: false, comments: [
        { id: "cp294_0", authorId: "u_raph", text: "La pièce avant le matériel, toujours. Tu as mis quelque chose au mur ou juste les rideaux ?", createdAt: hours(6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp294_1", authorId: "u_yanis", text: "-13 dB rien qu'en changeant de posture, c'est brutal. Je teste ce soir.", createdAt: hours(3), likes: 3, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p295", authorId: "u_mila", passion: "yoga", mood: "chill", type: "text", cover: "book",
      text: "Vingt minutes de yin avant de dormir, rien de plus. Après une journée entière de répétition, c'est ça ou je passe la nuit à repasser en boucle les corrections du chorégraphe.\nMa hanche droite grince toujours en pigeon, même après quatre ans. Je ne cherche plus à la réparer, je m'installe dedans et j'attends que ça passe.",
      createdAt: hours(22), likes: 58, liked: false, comments: []},
    { id: "p296", authorId: "u_rita", passion: "mode", mood: "irl", type: "text", cover: "street",
      text: "Marché HLM à Dakar samedi matin, deux heures dans les ballots de friperie. J'ai sorti une chemise en wax coupée à l'européenne : les pinces de poitrine sont montées à l'envers, je crois que quelqu'un a travaillé avec un patron photocopié dans le mauvais sens.\nJe la garde telle quelle, sans rien reprendre. Ce genre d'accident, on ne sait pas le dessiner.",
      createdAt: hours(35), likes: 210, liked: false, comments: [
        { id: "cp296_0", authorId: "u_zoe", text: "Les erreurs de patron sont mes meilleures profs. Tu la portes ou elle finit en pièce d'atelier ?", createdAt: hours(30), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p297", authorId: "u_mila", passion: "danse", mood: "irl", type: "photo", cover: "dance",
      text: "Trois jours de résidence à Ajaccio, dans une salle prêtée par le conservatoire. Le sol est en vieux parquet et il colle par endroits : impossible de faire une glissade sans se bloquer le genou.\nOn a fini par retravailler tout le deuxième tableau en appuis courts. Ça paraît laid sur le papier, c'est devenu la meilleure partie de la pièce.",
      createdAt: hours(48), likes: 165, liked: false, comments: []},
    { id: "p298", authorId: "u_sami", passion: "podcast", mood: "actu", type: "text", cover: "news",
      text: "J'ai enregistré 52 minutes avec une élue bruxelloise sur les logements vides. Au montage j'en garde 19.\nCe qui saute, ce ne sont pas ses réponses faibles, ce sont mes questions : quatre relances où j'avais visiblement décidé de la conclusion avant de l'écouter. On m'a appris à préparer un entretien, jamais à préparer le silence après une réponse.",
      createdAt: hours(12), likes: 132, liked: false, comments: [
        { id: "cp298_0", authorId: "u_val", text: "Préparer le silence, je note. C'est exactement ce qui manque à la plupart des entretiens que j'écoute.", createdAt: hours(8), likes: 14, likedBy: [], emojis: [], replies: [] },
        { id: "cp298_1", authorId: "u_liam", text: "52 vers 19, c'est un beau ratio. Tu gardes les chutes quelque part ?", createdAt: hours(5), likes: 4, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p299", authorId: "u_emma", passion: "yoga", mood: "learn", type: "text", cover: "nature",
      text: "Week-end de formation sur l'épaule. Je faisais descendre les gens en chaturanga en répétant \"coudes le long du corps\" depuis six ans, sans jamais vérifier si l'omoplate suivait.\nSur douze participants, neuf la décollaient en fin de descente. Moi comprise. Je vais devoir désapprendre une consigne que j'ai donnée des milliers de fois, et ça me contrarie plus que je ne l'aurais cru.",
      createdAt: hours(58), likes: 88, liked: false, comments: []},
    { id: "p300", authorId: "u_zoe", passion: "mode", mood: "actu", type: "text", cover: "neon",
      text: "Une grosse enseigne annonce une \"collection upcyclée\" tirée à quatre mille exemplaires. Quatre mille pièces identiques à partir de chutes, ça suppose un gisement standardisé, donc des chutes produites exprès.\nCe n'est plus de l'upcycling, c'est une matière première de plus avec un joli mot dessus. Le vrai upcycling est impossible à industrialiser proprement, et c'est précisément ce qui m'intéresse dedans.",
      createdAt: hours(27), likes: 154, liked: false, comments: [
        { id: "cp300_0", authorId: "u_rita", text: "Quatre mille pièces identiques à partir de chutes, il faut oser. Merci de le dire aussi clairement.", createdAt: hours(20), likes: 16, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p301", authorId: "u_oussa", passion: "danse", mood: "creation", type: "text", cover: "studio",
      text: "Un crew de Saint-Denis m'a demandé un instru pour leur passage de trois minutes. Je suis parti sur 92 BPM, ils m'ont dit que ça ne pesait pas assez.\nOn a passé la soirée à décaler la caisse claire de quelques millisecondes après le temps. Même tempo, même son, et d'un coup ils dansaient dessus. Je ne savais pas qu'un retard aussi petit pouvait changer un corps entier.",
      createdAt: hours(70), likes: 120, liked: false, comments: []},
    { id: "p302", authorId: "u_liam", passion: "podcast", mood: "creation", type: "photo", cover: "studio",
      text: "Trois heures de rush pour un épisode de vingt-six minutes. Le plus dur n'a pas été de couper, c'est d'accepter de perdre une histoire de quinze minutes que mon invité racontait très bien mais qui n'avait rien à faire là.\nJe l'ai rangée dans un dossier \"un jour\". Ce dossier pèse maintenant plus d'heures que le podcast lui-même 😅",
      createdAt: hours(44), likes: 99, liked: false, comments: [
        { id: "cp302_0", authorId: "u_noa", text: "Le dossier \"un jour\" de tous les monteurs du monde. Le mien fait 400 Go et je n'ai jamais rien rouvert.", createdAt: hours(38), likes: 13, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p303", authorId: "u_mehdi", passion: "yoga", mood: "chill", type: "text", cover: "trail",
      text: "Après la sortie longue de dimanche — 28 km et 1 400 de dénivelé — vingt minutes au sol, jambes contre le mur, rien d'autre.\nJe ne sais toujours pas si ça récupère quoi que ce soit, je n'ai aucun chiffre à montrer. Ce que je sais, c'est que je dors mieux les dimanches où je le fais que ceux où je m'écroule directement dans le canapé.",
      createdAt: hours(81), likes: 63, liked: false, comments: []},
    { id: "p304", authorId: "u_zoe", passion: "mode", mood: "learn", type: "photo", cover: "workshop",
      text: "Cours du soir chez une retoucheuse à la retraite, deux heures uniquement sur le point de bâti. À la main, à l'aiguille, comme au siècle dernier.\nJe le sautais systématiquement pour aller plus vite. Résultat : mes coutures glissaient d'un ou deux millimètres et je passais une heure à découdre derrière. Le bâti coûte dix minutes et m'en fait gagner soixante. Personne ne me l'avait dit aussi clairement.",
      createdAt: hours(95), likes: 77, liked: false, comments: []},
    { id: "p305", authorId: "u_amira", passion: "danse", mood: "irl", type: "photo", cover: "stage",
      text: "Battle à Lille dimanche, sortie en quart. Je perds contre une fille de dix-neuf ans qui a fait trois passages sans jamais répéter un mouvement.\nJ'ai regardé la vidéo hier soir : mes deux premiers passages sont exactement ceux de janvier. J'ai un répertoire, elle a une écoute. Ce n'est pas la même chose et le jury ne s'est pas trompé.",
      createdAt: hours(102), likes: 240, liked: false, comments: [
        { id: "cp305_0", authorId: "u_mila", text: "\"J'ai un répertoire, elle a une écoute\" — je vais y penser toute la semaine.", createdAt: hours(96), likes: 21, likedBy: [], emojis: [], replies: [] },
        { id: "cp305_1", authorId: "u_oussa", text: "Tu veux qu'on bosse sur des instrus que tu n'as jamais entendus ? Ça forcerait l'écoute.", createdAt: hours(90), likes: 8, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p306", authorId: "u_val", passion: "podcast", mood: "actu", type: "text", cover: "news_europe",
      text: "Invitée hier dans un podcast sur les corridors céréaliers. Une heure préparée, et c'est la toute dernière question qui m'a coincée : qu'est-ce qui vous ferait changer d'avis ?\nJ'ai mis huit secondes à répondre, ce qui à l'oral est une éternité. Ils ont gardé le silence au montage, et ils ont eu raison de le garder.",
      createdAt: hours(18), likes: 145, liked: false, comments: [
        { id: "cp306_0", authorId: "u_sami", text: "Huit secondes, c'est déjà une réponse. Bien joué à eux de ne pas l'avoir coupée.", createdAt: hours(14), likes: 17, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p307", authorId: "u_nina", passion: "yoga", mood: "chill", type: "photo", cover: "horizon",
      text: "Ferry de nuit entre Igoumenitsa et Bari, pont supérieur, cinq heures du matin. Deux mètres carrés entre un banc et une bouche d'aération, juste assez pour dérouler un tapis.\nLe sol tremble en permanence, donc tenir sur une jambe relève de la blague. J'ai fait ce que je pouvais debout, face à l'est, et le lever de soleil a fait le reste du travail.",
      createdAt: hours(130), likes: 112, liked: false, comments: []},
    { id: "p308", authorId: "u_rita", passion: "mode", mood: "creation", type: "text", cover: "workshop",
      text: "Première cuve d'indigo maison : trois jours de fermentation, un pH surveillé comme un bébé, et un bleu qui vire au gris terne en séchant.\nJ'ai trop oxygéné en plongeant les pièces trop vite. La cuve est encore vivante, je retente demain en descendant le tissu lentement, sans faire une seule bulle. Six mètres de coton perdus pour une leçon que tous les teinturiers connaissent déjà.",
      createdAt: hours(118), likes: 101, liked: false, comments: [
        { id: "cp308_0", authorId: "u_lou", text: "C'est exactement comme mes émaux : la moitié du savoir tient dans la lenteur du geste. Courage pour la deuxième.", createdAt: hours(110), likes: 9, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p309", authorId: "u_mila", passion: "danse", mood: "learn", type: "text", cover: "dance",
      text: "Stage de travail au sol avec une prof qui ne compte jamais. Trois heures sans un seul 5-6-7-8, uniquement la respiration et le poids.\nJe me suis rendu compte que je descends toujours par le même côté, le gauche, sans même y penser. À droite je suis une débutante complète. Quinze ans de pratique et une moitié de corps qui n'a rien appris.",
      createdAt: hours(143), likes: 69, liked: false, comments: []},
    { id: "p310", authorId: "u_kaoru", passion: "podcast", mood: "irl", type: "text", cover: "news_asia",
      text: "Enregistrement dans un bar de six places à Golden Gai, Shinjuku. Le patron a accepté à une condition : ne pas couper la musique.\nAu casque tout paraissait impeccable. À la relecture, un frigo se déclenche toutes les onze minutes et couvre la voix de mon invité. J'ai gardé le frigo. Sans ce bruit-là, personne ne comprendrait où on se trouve.",
      createdAt: hours(156), likes: 87, liked: false, comments: []},
    { id: "p311", authorId: "u_emma", passion: "yoga", mood: "actu", type: "text", cover: "book",
      text: "Trois studios ont ouvert à Biarritz cette année, tous en salle chauffée à 40 degrés. On me demande chaque semaine quand je m'y mets.\nJe ne crois pas que ce soit dangereux. Je crois surtout que la chaleur donne l'illusion d'une souplesse qui n'est pas la vôtre : vous entrez plus loin dans la posture parce que le tissu est chaud, pas parce que vous avez progressé. Le lendemain, en salle froide, le corps le dit très bien.",
      createdAt: hours(168), likes: 133, liked: false, comments: []},
    { id: "p312", authorId: "u_zoe", passion: "mode", mood: "irl", type: "photo", cover: "street",
      text: "Vide-dressing monté avec quatre copines dans une cour du 20e, soixante-deux pièces posées sur des tréteaux. Trente-huit sont parties.\nCe qui n'est pas parti : tout ce qui était neuf ou presque. Les gens sont venus chercher des vêtements avec une histoire, une réparation visible, un ourlet refait à la main. J'ai vendu une chemise reprisée au coude trois fois le prix d'un jean jamais porté.",
      createdAt: hours(180), likes: 158, liked: false, comments: [
        { id: "cp312_0", authorId: "u_rita", text: "Ça confirme tout ce que je vois sur les marchés à Dakar. Le neuf n'intéresse plus personne dans ces ventes.", createdAt: hours(176), likes: 18, likedBy: [], emojis: [], replies: [] },
        { id: "cp312_1", authorId: "u_sofia", text: "Une chemise reprisée qui bat un jean neuf, il y a un roman entier là-dedans.", createdAt: hours(170), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p313", authorId: "u_amira", passion: "danse", mood: "chill", type: "text", cover: "neon",
      text: "Samedi soir, personne à la maison, tapis roulé dans un coin du salon. J'ai mis un morceau que je connais par cœur et j'ai dansé quarante minutes sans miroir et sans intention.\nAucune de mes répétitions structurées ne me fait cet effet-là. Il faudrait que je m'en souvienne les semaines où j'oublie pourquoi je fais ça.",
      createdAt: hours(192), likes: 54, liked: false, comments: []},
    { id: "p314", authorId: "u_liam", passion: "podcast", mood: "actu", type: "text", cover: "news",
      text: "Les chiffres du trimestre sont tombés : 4 200 téléchargements, dont un tiers sur les quarante-huit premières heures. Et un épisode de l'an dernier qui remonte tout seul, sans que je comprenne pourquoi.\nJ'ai passé deux ans à optimiser mes sorties du mardi matin. Visiblement mon audience s'en moque et écoute quand elle a le temps. Je vais arrêter de me lever tôt pour publier.",
      createdAt: hours(199), likes: 118, liked: false, comments: []},
    { id: "p261", authorId: "u_lou", passion: "art", mood: "creation", type: "photo", cover: "workshop",
      text: "Quatrième fournée de la semaine et la première où l'émail céladon ne coule pas. J'ai baissé le palier de 1240 à 1225 °C et rallongé la descente d'une heure, c'est tout ce que ça demandait.\nSur les onze pièces : neuf bonnes, une fêlée au pied, une que j'avais posée trop près de l'élément et qui a viré marron sur un côté. Je la garde quand même, elle ira sur l'étagère des ratés utiles.",
      createdAt: hours(3), likes: 96, liked: false, comments: [
        { id: "cp261_0", authorId: "u_paul", text: "L'émail qui coule c'est la plaie, j'ai le même genre de surprise avec l'huile sur du chêne trop sec. Tu enfournes à quelle hauteur ?", createdAt: hours(2), likes: 6, likedBy: [], emojis: [], replies: [] },
        { id: "cp261_1", authorId: "u_zoe", text: "L'étagère des ratés utiles, j'adore. J'ai exactement la même mais en chutes de tissu.", createdAt: hours(1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p262", authorId: "u_lucie", passion: "jardinage", mood: "learn", type: "text", cover: "nature",
      text: "J'ai enfin compris pourquoi mes courgettes crevaient chaque année vers la mi-juillet. Ce n'est pas l'oïdium en soi, c'est que j'arrosais le feuillage, le soir.\nDepuis que j'arrose au pied, le matin, au goulot, sur les mêmes quatre pieds : zéro tache blanche en six semaines. Trois ans à accuser la variété alors que c'était mon geste.",
      createdAt: hours(6), likes: 143, liked: false, comments: []},
    { id: "p263", authorId: "u_paul", passion: "metier", mood: "creation", type: "photo", cover: "workshop",
      text: "Plateau de noyer terminé pour une table de salle à manger. 2,10 m, deux planches jointées, un nœud que le client voulait absolument garder et que j'ai stabilisé à la résine noire.\nCe qui prend le plus de temps, ce n'est pas le collage, c'est le ponçage : 80, 120, 180, 240, puis huile-cire en trois couches à 24 h d'intervalle. Le grain ne se ferme vraiment qu'à la deuxième.",
      createdAt: hours(9), likes: 178, liked: false, comments: [
        { id: "cp263_0", authorId: "u_lou", text: "Le nœud résiné, ça donne quoi en lumière rasante ? J'hésite à faire pareil sur un plateau en frêne.", createdAt: hours(5), likes: 4, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p264", authorId: "u_tom", passion: "jeuxvideo", mood: "creation", type: "text", cover: "neon",
      text: "Nouveau record perso sur le any% : 41'12, soit neuf secondes de mieux qu'en mars. Tout est venu d'un seul endroit, le couloir avant le troisième boss, où je perdais du temps à recharger alors qu'on peut annuler l'animation en changeant d'arme.\nJ'ai mis quatre mois à voir un truc que les runs japonais font depuis deux ans. Ça pique un peu.",
      createdAt: hours(12), likes: 210, liked: false, comments: []},
    { id: "p265", authorId: "u_zoe", passion: "art", mood: "irl", type: "photo", cover: "street",
      text: "Passée hier soir à l'atelier de sérigraphie installé dans l'ancien garage, sous le périph. Une trentaine de personnes, du papier partout, deux presses qui tournaient sans arrêt.\nJ'ai tiré mon premier poster à la main, deux couches, et j'ai complètement raté le repérage de la seconde. La fille qui encadrait m'a dit que tout le monde rate la deuxième couche. Je reviens samedi.",
      createdAt: hours(16), likes: 74, liked: false, comments: [
        { id: "cp265_0", authorId: "u_karim", text: "Le garage derrière le pont ? J'y ai shooté l'an dernier, la lumière y est immonde et c'est très bien comme ça.", createdAt: hours(12), likes: 9, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p266", authorId: "u_theo", passion: "jardinage", mood: "chill", type: "text", cover: "kitchen",
      text: "Trois bacs sur le balcon, plein sud, et je ne cuisine quasiment plus avec du basilic acheté. Le truc que personne ne m'avait dit : pincer la tête dès qu'elle monte, sinon la plante file et les feuilles deviennent minuscules.\nCe matin, tomates du marché et basilic coupé à quarante centimètres de la poêle. Ça ne change pas une vie, mais ça fait plaisir tous les jours.",
      createdAt: hours(21), likes: 88, liked: false, comments: []},
    { id: "p267", authorId: "u_rita", passion: "metier", mood: "actu", type: "text", cover: "workshop",
      text: "Le tailleur avec qui je travaille à Dakar ferme son atelier en octobre. Trente-deux ans de coupe, et personne pour reprendre : son fils est développeur, les deux apprentis sont partis à l'usine.\nJe suis passée récupérer ses patrons. Il y en a plus de six cents, tracés à la main sur du kraft, annotés au crayon. Je ne sais pas encore ce que j'en ferai, mais ils ne partiront pas à la benne.",
      createdAt: hours(26), likes: 267, liked: false, comments: []},
    { id: "p268", authorId: "u_nabil", passion: "jeuxvideo", mood: "learn", type: "text", cover: "tech",
      text: "Week-end entier passé à refaire le système de sauvegarde de mon jeu, parce que je stockais mes objets entiers en JSON. Résultat : dès que je renommais un champ, toutes les anciennes parties devenaient illisibles.\nMaintenant je sérialise un numéro de version plus un identifiant, et je migre à la lecture. C'est moins joli à écrire, mais je peux enfin toucher au code sans casser les parties de mes dix testeurs.",
      createdAt: hours(31), likes: 154, liked: false, comments: [
        { id: "cp268_0", authorId: "u_yanis", text: "Le coup du numéro de version, je me le suis pris aussi. Tu migres en cascade ou tu sautes direct à la dernière ?", createdAt: hours(26), likes: 7, likedBy: [], emojis: [], replies: [] },
        { id: "cp268_1", authorId: "u_tom", text: "Merci pour les dix testeurs, j'en fais partie et je n'avais aucune envie de tout recommencer.", createdAt: hours(22), likes: 14, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p269", authorId: "u_lou", passion: "art", mood: "learn", type: "text", cover: "workshop",
      text: "Trois semaines à tourner des bols beaucoup trop lourds sans comprendre pourquoi. Un potier de passage a regardé dix secondes et m'a dit que je montais la paroi en une seule fois au lieu de deux.\nEn deux passes, la même terre me donne des pièces de 240 g au lieu de 390. J'ai eu envie de me cacher, puis non : c'est très bien qu'un geste s'apprenne en dix secondes quand on a mis trois semaines à en avoir besoin.",
      createdAt: hours(37), likes: 121, liked: false, comments: []},
    { id: "p270", authorId: "u_lucie", passion: "jardinage", mood: "creation", type: "photo", cover: "nature",
      text: "La butte est finie. Six mètres de long : bois mort au fond, tonte, feuilles de l'automne dernier, puis quinze centimètres de terre prise au fond du jardin.\nCe que j'y mettrai au printemps :\n- courges au sud, elles couvriront le talus\n- fèves en bordure, pour l'azote\n- capucines partout, pour que les pucerons aillent voir ailleurs\nJe note tout dans un cahier depuis quatre ans. C'est la seule chose qui m'a vraiment fait progresser.",
      createdAt: hours(44), likes: 189, liked: false, comments: [
        { id: "cp270_0", authorId: "u_emma", text: "La capucine comme plante piège, ça marche vraiment chez toi ? J'ai l'impression que les pucerons prennent les deux.", createdAt: hours(38), likes: 5, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p271", authorId: "u_raph", passion: "metier", mood: "learn", type: "text", cover: "tech",
      text: "Je croyais que mon métier consistait à dessiner. En cinq ans, ce que j'ai vraiment appris, c'est à faire dire non plus tôt.\nDeux heures d'atelier avec la personne qui répond au téléphone du service client m'ont fait jeter trois semaines de maquettes. Elle m'a montré les vingt questions qu'on lui pose chaque jour : aucune n'existait dans mon parcours.",
      createdAt: hours(52), likes: 174, liked: false, comments: []},
    { id: "p272", authorId: "u_yanis", passion: "jeuxvideo", mood: "actu", type: "text", cover: "tech",
      text: "Le studio derrière le jeu de gestion dont tout le monde parlait au printemps annonce quarante licenciements, trois mois après un lancement réussi. Un million de ventes, et l'équipe qui l'a fait n'existe plus.\nJe n'ai pas d'avis élégant là-dessus. Juste que ça devient difficile d'expliquer à ceux qui commencent que « ça marche » protège de quoi que ce soit.",
      createdAt: hours(60), likes: 312, liked: false, comments: [
        { id: "cp272_0", authorId: "u_nabil", text: "C'est exactement pour ça que je reste à deux sur mon projet. Petit, lent, mais personne ne peut me licencier de mon propre jeu.", createdAt: hours(54), likes: 31, likedBy: [], emojis: [], replies: [] },
        { id: "cp272_1", authorId: "u_liam", text: "J'ai enregistré un épisode avec deux d'entre eux la semaine dernière. Ils l'ont appris par la presse.", createdAt: hours(49), likes: 18, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p273", authorId: "u_noa", passion: "art", mood: "creation", type: "text", cover: "street",
      text: "J'ai recommencé à graver du lino le soir. Aucun rapport avec le montage, juste l'envie de faire un truc avec les mains qui ne s'annule pas au Ctrl+Z.\nPremière planche : la façade de la rue en dessous, 15 x 20. J'ai creusé du mauvais côté sur toute une fenêtre, du coup la fenêtre est blanche et le mur est noir. Tout le monde trouve ça voulu. Je ne dis rien.",
      createdAt: hours(68), likes: 198, liked: false, comments: []},
    { id: "p274", authorId: "u_emma", passion: "jardinage", mood: "irl", type: "photo", cover: "sunrise",
      text: "Atelier au jardin partagé ce matin, derrière la halle. On était onze, dont quatre qui n'avaient jamais tenu une bêche.\nOn a rempli deux bacs surélevés pour que les gens qui ne peuvent plus se baisser puissent planter debout. Trois heures de boulot et un café franchement mauvais. Un monsieur de 80 ans nous a expliqué comment sa mère bouturait ses tomates ; personne n'a osé lui dire que ça ne se faisait pas comme ça.",
      createdAt: hours(76), likes: 137, liked: false, comments: [
        { id: "cp274_0", authorId: "u_lucie", text: "Le bouturage de tomate, ça marche très bien : un gourmand dans un verre d'eau et c'est parti. Ton monsieur a raison.", createdAt: hours(70), likes: 12, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p275", authorId: "u_paul", passion: "metier", mood: "irl", type: "photo", cover: "workshop",
      text: "Portes ouvertes à l'atelier samedi. Une soixantaine de personnes, et une seule question revenue en boucle : « ça coûte combien ? »\nJ'ai fini par sortir le carnet et montrer les heures : 34 h sur le buffet, matière comprise. Les gens ne trouvent pas ça cher quand ils voient le nombre. Ils trouvent ça cher quand ils voient l'étiquette. Tout le problème est là.",
      createdAt: hours(85), likes: 289, liked: false, comments: []},
    { id: "p276", authorId: "u_tom", passion: "jeuxvideo", mood: "irl", type: "text", cover: "neon",
      text: "Premier tournoi en salle depuis trois ans, à Rennes, dans un local sans clim au mois d'août. Éliminé au deuxième tour par un gamin de 16 ans qui jouait sur une manette réparée au scotch.\nCe qui me manquait le plus en ligne : le bruit de la salle quand quelqu'un rate un truc évident. On a fini à douze dans un kebab à refaire les matchs jusqu'à deux heures du matin.",
      createdAt: hours(95), likes: 166, liked: false, comments: [
        { id: "cp276_0", authorId: "u_nabil", text: "Le local sans clim, c'était bien celui près de la gare ? J'y ai fait tester mon prototype en juin, on a cru mourir.", createdAt: hours(88), likes: 8, likedBy: [], emojis: [], replies: [] },
        { id: "cp276_1", authorId: "u_amira", text: "Le kebab d'après, c'est 80 % de l'intérêt d'un événement, tous domaines confondus.", createdAt: hours(84), likes: 22, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p277", authorId: "u_lou", passion: "art", mood: "chill", type: "text", cover: "nature",
      text: "Journée sans four, sans commande, sans rien. J'ai malaxé de la terre pendant deux heures en écoutant la pluie tomber sur la tôle de l'atelier.\nAucune pièce n'est sortie, rien n'a été vendu, et je crois que c'est la journée la plus utile du mois. Le tour tournait à vide dans son coin, je l'ai laissé faire.",
      createdAt: hours(105), likes: 64, liked: false, comments: []},
    { id: "p278", authorId: "u_hugo", passion: "jardinage", mood: "creation", type: "text", cover: "kitchen",
      text: "J'ai mis un citronnier caviar en pot sur la terrasse il y a deux ans, en me disant que je ferais mes propres perles pour les desserts. Première vraie récolte cette semaine : onze fruits.\nÇa ne couvre même pas un service. Mais le goût n'a rien à voir avec ce que j'achetais, et je sais exactement ce qu'il y a dedans : du terreau, de l'eau de pluie et beaucoup de patience mal placée.",
      createdAt: hours(118), likes: 156, liked: false, comments: [
        { id: "cp278_0", authorId: "u_theo", text: "Onze fruits en deux ans, c'est un ratio de chef, pas d'agriculteur. Je valide complètement.", createdAt: hours(110), likes: 16, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p279", authorId: "u_paul", passion: "metier", mood: "learn", type: "text", cover: "workshop",
      text: "J'ai raté un assemblage à queues d'aronde cette semaine, pour la première fois depuis longtemps. Trop confiant : j'ai tracé au feutre au lieu du trusquin et j'ai perdu un demi-millimètre par queue.\nSur six queues, ça fait trois millimètres de jeu au bout. J'ai refait la pièce. La leçon n'est pas « il faut un trusquin », elle est : le jour où on trouve qu'un geste est devenu inutile, c'est qu'on est en train de le perdre.",
      createdAt: hours(130), likes: 341, liked: false, comments: []},
    { id: "p280", authorId: "u_nabil", passion: "jeuxvideo", mood: "chill", type: "photo", cover: "neon",
      text: "Trois heures ce soir sans écrire une ligne de code, juste à rejouer au premier jeu que j'ai fini gamin, sur un vieux tube cathodique récupéré chez ma tante.\nLes pixels bavent, la manette a du jeu, et le niveau 4 est toujours aussi injuste. Je me souvenais de chaque salle, dans l'ordre.",
      createdAt: hours(142), likes: 132, liked: false, comments: [
        { id: "cp280_0", authorId: "u_tom", text: "Le cathodique change tout sur ces jeux-là, les hitbox redeviennent lisibles. Ne le lâche jamais.", createdAt: hours(136), likes: 10, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p281", authorId: "u_rita", passion: "art", mood: "actu", type: "text", cover: "street",
      text: "La grande fresque du quartier a été repeinte en gris lundi matin, sans prévenir personne. Six ans qu'elle était là.\nLe collectif qui l'avait faite l'a appris par une photo postée sur un groupe de voisins. Ce qui me sidère, ce n'est pas la décision, c'est qu'il n'y ait eu aucune conversation avant. Un mur appartient à tout le monde, y compris à ceux qui choisissent de le blanchir. Ils auraient pu frapper à la porte.",
      createdAt: hours(155), likes: 245, liked: false, comments: []},
    { id: "p282", authorId: "u_lucie", passion: "jardinage", mood: "actu", type: "text", cover: "climate",
      text: "Le relevé de la station voisine : 41 jours sans pluie utile ce printemps, contre 19 en moyenne sur dix ans. Mon puits est descendu de 80 cm.\nJe change de plan. Paillage épais partout, et j'abandonne la salade d'été, qui me demandait plus d'eau que tout le reste réuni. Ce n'est pas de la résignation, c'est du calcul : on plante ce que le climat permet, pas ce dont on a envie.",
      createdAt: hours(168), likes: 298, liked: false, comments: [
        { id: "cp282_0", authorId: "u_emma", text: "Le paillage épais m'a sauvée l'an dernier. Dix centimètres de tonte séchée et le sol restait frais dessous.", createdAt: hours(160), likes: 13, likedBy: [], emojis: [], replies: [] },
        { id: "cp282_1", authorId: "u_val", text: "Le chiffre des 41 jours colle avec ce que remontent les agences sur tout le sud-ouest. Merci de le ramener au local, ça parle beaucoup mieux.", createdAt: hours(152), likes: 27, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p283", authorId: "u_lou", passion: "metier", mood: "chill", type: "photo", cover: "workshop",
      text: "Onze ans que je vis de la terre, et je viens seulement de m'offrir un vrai siège de tour. 180 €, réglable, avec un dossier.\nJ'ai passé une décennie sur un tabouret de bar bricolé, en me disant que le confort viendrait après. Mon dos a une autre lecture des choses. Si vous démarrez un métier assis : achetez le siège en premier, pas en dernier.",
      createdAt: hours(182), likes: 187, liked: false, comments: []},
    { id: "p284", authorId: "u_liam", passion: "jeuxvideo", mood: "actu", type: "text", cover: "tech",
      text: "Je viens de finir le montage d'un épisode avec une conservatrice qui archive des jeux en ligne fermés. Sur les trente titres qu'elle a documentés cette année, huit n'existent plus nulle part : serveurs éteints, aucune copie légale, rien.\nOn parle d'objets qui ont occupé des milliers de gens pendant des années, et qui disparaissent plus vite qu'un film muet de 1920.",
      createdAt: hours(196), likes: 221, liked: false, comments: [
        { id: "cp284_0", authorId: "u_noa", text: "Le parallèle avec le muet est juste : on a perdu les trois quarts des films de cette période pour exactement les mêmes raisons, personne n'a pensé que ça valait la peine d'en garder une copie.", createdAt: hours(188), likes: 19, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p321", authorId: "u_greg", passion: "moto", mood: "irl", type: "photo", cover: "nature",
      text: "Parti d'Aubière à 6h10 pour attraper le col de la Croix Saint-Robert avant les camping-cars. 11 degrés au sommet, mes gants d'été n'ont servi à rien, j'avais les doigts en bois dès le troisième virage.\nCroisé deux Transalp qui montaient du Mont-Dore, un signe de la main, et c'est tout ce que je demande à un dimanche. Redescente par Besse, café, et retour avant que la route se remplisse.",
      createdAt: hours(3), likes: 143, liked: false, comments: [
        { id: "cp321_0", authorId: "u_mehdi", text: "La Croix Saint-Robert au lever du jour, y a pas mieux dans le coin. T'as poussé jusqu'au lac Pavin ?", createdAt: hours(2), likes: 6, likedBy: [], emojis: [], replies: [] },
        { id: "cp321_1", authorId: "u_nina", text: "Les gants d'été en montagne, on se fait avoir à chaque fois 😅", createdAt: hours(1), likes: 4, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p322", authorId: "u_maya", passion: "animaux", mood: "learn", type: "text", cover: "nature",
      text: "Séance ce matin avec un berger australien qui aboyait sur tout ce qui passait devant la fenêtre du salon. On n'a pas travaillé le chien : on a déplacé le canapé de 60 cm et posé un film dépoli sur le bas de la vitre.\nTrois jours plus tard, deux aboiements dans la journée au lieu de vingt. La moitié de mon métier c'est réaménager des appartements, et personne ne me croit quand je le dis.",
      createdAt: hours(7), likes: 88, liked: false, comments: [
        { id: "cp322_0", authorId: "u_lucie", text: "Ça marche pareil avec mes poules. Tu déplaces l'enclos de trois mètres et tout le stress tombe.", createdAt: hours(5), likes: 9, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p323", authorId: "u_sami", passion: "actu", mood: "actu", type: "text", cover: "news_europe",
      text: "Trois heures de commission ce matin, quatorze amendements sur le même article, et je suis ressorti avec six pages de notes pour trois phrases utilisables.\nLe vrai sujet n'était pas dans la salle, il était dans le couloir, où deux attachés se sont accrochés sur le calendrier. C'est presque toujours là que ça se joue, et ce n'est jamais filmé.",
      createdAt: hours(12), likes: 64, liked: false, comments: []},
    { id: "p324", authorId: "u_lea", passion: "musique", mood: "creation", type: "photo", cover: "studio",
      text: "Trois heures sur huit mesures. Le pont ne tenait pas, je l'ai réenregistré onze fois avec le micro à 30 cm de la rosace, et c'est la prise où je rate une liaison qui sonne le mieux.\nJ'ai gardé la faute. On l'entend à 1:12 si on la cherche, et c'est exactement pour ça que je la garde 🙂",
      createdAt: hours(2), likes: 176, liked: false, comments: [
        { id: "cp324_0", authorId: "u_oussa", text: "La prise ratée qui passe devant les propres, c'est la loi. T'as enregistré dans quelle pièce ?", createdAt: hours(1), likes: 11, likedBy: [], emojis: [], replies: [] },
        { id: "cp324_1", authorId: "u_noa", text: "Écouté trois fois à 1:12, j'entends rien du tout. C'est plutôt bon signe non ?", createdAt: hours(1), likes: 7, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p325", authorId: "u_greg", passion: "moto", mood: "learn", type: "text", cover: "workshop",
      text: "Purge du frein avant. Une heure prévue, trois heures passées, parce que j'ai voulu faire l'économie d'un bocal de récupération et que j'ai vidé la moitié du liquide sur l'étrier.\nRetenu pour la prochaine fois :\n- ouvrir le bocal AVANT de pomper\n- serrer la vis de purge doucement, pas au ressenti\n- prévoir un chiffon par litre d'optimisme",
      createdAt: hours(21), likes: 71, liked: false, comments: [
        { id: "cp325_0", authorId: "u_paul", text: "Le chiffon par litre d'optimisme, je le vole pour l'atelier.", createdAt: hours(18), likes: 12, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p326", authorId: "u_lucie", passion: "animaux", mood: "chill", type: "photo", cover: "nature",
      text: "Un hérisson dort dans le tas de compost depuis quatre nuits. Je le sais parce que j'ai laissé une planche saupoudrée de farine devant, et les traces sont là chaque matin.\nJ'ai arrêté de retourner le tas jusqu'à la fin du mois. Le jardin peut attendre, lui non.",
      createdAt: hours(26), likes: 112, liked: false, comments: []},
    { id: "p327", authorId: "u_kaoru", passion: "actu", mood: "actu", type: "photo", cover: "news_asia",
      text: "Deuxième typhon en dix jours. Ici la ville ne s'arrête pas, elle se replie : les rideaux de fer descendent vers 16 h, les supérettes sont vides de sandwichs, et les trains annoncent l'arrêt deux heures à l'avance.\nCe qui m'a le plus frappé, c'est le silence à Koenji hier soir. Zéro voiture. J'ai enregistré trente secondes de rien, ça m'a plus appris que ma journée d'entretiens.",
      createdAt: hours(15), likes: 90, liked: false, comments: [
        { id: "cp327_0", authorId: "u_sami", text: "L'arrêt des trains annoncé deux heures avant, ici on n'y arrive toujours pas. Tu en fais quoi, un papier ?", createdAt: hours(12), likes: 8, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p328", authorId: "u_oussa", passion: "musique", mood: "creation", type: "text", cover: "studio",
      text: "J'ai passé la soirée sur quatre secondes d'un disque de variété trouvé à 2 euros au marché de Saint-Ouen. Un souffle de cuivres, rien de plus.\nRalenti à 78 %, filtré sous 400 Hz, et il y a enfin un truc qui ressemble à quelque chose. Le reste du morceau est nul, la boucle est bonne.\nSi quelqu'un connaît un moyen propre de virer la voix qui traîne derrière, je prends.",
      createdAt: hours(9), likes: 133, liked: false, comments: [
        { id: "cp328_0", authorId: "u_lea", text: "Essaie de doubler la boucle décalée d'une croche, ça masque souvent ce genre de résidu.", createdAt: hours(6), likes: 14, likedBy: [], emojis: [], replies: [] },
        { id: "cp328_1", authorId: "u_liam", text: "2 euros au marché, c'est là que tout se passe. Envoie un extrait quand c'est calé.", createdAt: hours(4), likes: 6, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p329", authorId: "u_greg", passion: "moto", mood: "irl", type: "text", cover: "nature",
      text: "Rassemblement improvisé au parking du lac Chambon hier. On était onze, avec des machines dont personne ne parle jamais : une Transalp de 1991, deux vieilles Bandit, un 125 assumé sans complexe.\nDeux heures à parler pneus et à ne pas rouler. C'est le meilleur format que je connaisse, et il ne coûte rien à personne.",
      createdAt: hours(38), likes: 84, liked: false, comments: []},
    { id: "p330", authorId: "u_jona", passion: "animaux", mood: "chill", type: "photo", cover: "nature",
      text: "Trois bouquetins couchés à 2 400 m, pile sur la vire où je m'arrête pour manger. Ils m'ont laissé passer à quinze mètres sans lever la tête.\nJ'ai attendu vingt minutes avant de repartir, par principe : c'est chez eux, je ne fais que traverser. La photo est floue parce que je n'ai pas voulu bouger pour changer de réglage.",
      createdAt: hours(44), likes: 118, liked: false, comments: []},
    { id: "p331", authorId: "u_val", passion: "actu", mood: "learn", type: "text", cover: "news",
      text: "On me demande souvent comment je choisis mes sources. Ma règle est bête : je ne cite jamais un chiffre dont je ne sais pas qui l'a compté, quand, et avec quel budget.\nÇa élimine 80 % de ce qui circule, y compris des choses qui vont dans mon sens. C'est surtout ça le travail, jeter ce qui m'arrange.",
      createdAt: hours(33), likes: 102, liked: false, comments: [
        { id: "cp331_0", authorId: "u_sami", text: "La dernière phrase devrait être affichée dans toutes les rédactions.", createdAt: hours(30), likes: 21, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p332", authorId: "u_lea", passion: "musique", mood: "learn", type: "text", cover: "studio",
      text: "Remis le métronome à 62 bpm sur un passage que je jouais à 96 depuis deux ans. Résultat, je ne sais pas le jouer. Je le survolais.\nDix minutes par jour à cette vitesse pendant deux semaines, et seulement après je remonterai. C'est humiliant et c'est la seule chose qui marche vraiment.",
      createdAt: hours(29), likes: 76, liked: false, comments: []},
    { id: "p333", authorId: "u_mehdi", passion: "moto", mood: "chill", type: "text", cover: "trail",
      text: "Je monte au départ des sorties longues en moto, sac de trail sur le dos. Trente minutes de route jusqu'au parking du Semnoz, et j'arrive déjà réveillé.\nLe seul souci, c'est de redescendre les jambes en compote sur une route en lacets. J'ai appris à finir large et à ne rien forcer : la fatigue se voit dans les trajectoires bien avant qu'on la sente.",
      createdAt: hours(57), likes: 68, liked: false, comments: [
        { id: "cp333_0", authorId: "u_greg", text: "La fatigue qui se voit dans les trajectoires, c'est exactement ça. Bien vu.", createdAt: hours(52), likes: 9, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p334", authorId: "u_maya", passion: "animaux", mood: "irl", type: "text", cover: "nature",
      text: "Séance collective au parc samedi matin : six chiens, six maîtres, aucun jeu libre. Uniquement des croisements calmes à dix mètres les uns des autres.\nLes maîtres trouvent ça ennuyeux les vingt premières minutes, puis ils voient leur chien s'asseoir tout seul sans qu'on lui demande, et là ils comprennent. On refait la même dans quinze jours, même heure.",
      createdAt: hours(63), likes: 95, liked: false, comments: []},
    { id: "p335", authorId: "u_sami", passion: "actu", mood: "chill", type: "text", cover: "news",
      text: "J'ai coupé toutes les notifications d'info pendant trois semaines. Bilan : je n'ai rien raté d'important et j'ai lu quatre longs formats jusqu'au bout, ce qui ne m'était pas arrivé depuis l'automne.\nJe rallume la veille du prochain conseil, pas avant. Le direct c'est mon métier, ce n'est pas une hygiène de vie.",
      createdAt: hours(50), likes: 57, liked: false, comments: []},
    { id: "p336", authorId: "u_liam", passion: "musique", mood: "creation", type: "text", cover: "studio",
      text: "Session acoustique enregistrée dans mon salon hier soir : deux micros, une couverture clouée devant la fenêtre, et le frigo débranché pendant quarante minutes.\nJ'ai oublié de le rebrancher. On a retrouvé l'état de la crème glacée ce matin.\nLa prise est belle, par contre. Aucun souffle, aucun bourdonnement, et deux voisins qui applaudissent à la fin du second morceau.",
      createdAt: hours(47), likes: 88, liked: false, comments: [
        { id: "cp336_0", authorId: "u_oussa", text: "Le frigo débranché, tout le monde y passe une fois 😄 T'as pris quoi comme micros ?", createdAt: hours(44), likes: 15, likedBy: [], emojis: [], replies: [] },
        { id: "cp336_1", authorId: "u_lea", text: "Des voisins qui applaudissent, ça vaut toutes les réverbes du monde.", createdAt: hours(40), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p337", authorId: "u_nina", passion: "moto", mood: "chill", type: "photo", cover: "sunrise",
      text: "1 100 km en trois jours, du Massif central jusqu'à la côte, presque tout par la N88 et les départementales qui la longent.\nCe que je retiens : un routier qui m'a laissé sa place à l'ombre sur une aire, une pluie de vingt minutes qui a tout lavé, et l'odeur des pins la dernière heure. Le GPS n'a servi qu'une fois, pour trouver une pompe ouverte un dimanche.",
      createdAt: hours(92), likes: 147, liked: false, comments: []},
    { id: "p338", authorId: "u_mehdi", passion: "animaux", mood: "chill", type: "text", cover: "trail",
      text: "Java a huit ans et je ne l'emmène plus sur les sorties de plus de deux heures. Elle irait, elle me le dit avec les yeux dès que je prends mon sac.\nC'est le vétérinaire qui a tranché : hanches correctes mais plus de marge. Alors elle fait le premier kilomètre et rentre avec ma compagne. On a trouvé notre arrangement, ça ne m'empêche pas de culpabiliser au deuxième virage.",
      createdAt: hours(114), likes: 79, liked: false, comments: [
        { id: "cp338_0", authorId: "u_maya", text: "Ce sont les décisions les plus dures et les mieux prises. Elle a huit ans de montagne derrière elle, ça compte.", createdAt: hours(110), likes: 24, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p339", authorId: "u_kaoru", passion: "actu", mood: "chill", type: "text", cover: "news_asia",
      text: "Journée sans sujet. J'ai marché quatre heures dans Adachi, bu deux cafés dans des endroits sans nom, et je n'ai rien écrit du tout.\nC'est la partie du métier que personne ne facture, et sans laquelle je n'ai plus rien à dire trois mois plus tard. Je m'y tiens une fois par semaine, même quand la semaine est chargée.",
      createdAt: hours(71), likes: 61, liked: false, comments: []},
    { id: "p340", authorId: "u_oussa", passion: "musique", mood: "irl", type: "photo", cover: "stage",
      text: "Première partie hier soir dans une salle de Saint-Denis, quarante minutes, environ deux cents personnes. J'ai ouvert sur un morceau que personne ne connaît, ce qui était sûrement une erreur.\nAu troisième, une fille au premier rang a repris la mélodie. Je ne sais pas d'où elle la sortait. J'ai failli m'arrêter de jouer pour l'écouter.\nJe remets ça samedi, même salle.",
      createdAt: hours(68), likes: 205, liked: false, comments: [
        { id: "cp340_0", authorId: "u_amira", text: "Deux cents personnes et une qui chante ton morceau, c'est le vrai début. Je viens samedi s'il reste des places.", createdAt: hours(60), likes: 19, likedBy: [], emojis: [], replies: [] },
        { id: "cp340_1", authorId: "u_lea", text: "Ouvrir sur l'inconnu c'est pas une erreur, c'est un pari. Bravo.", createdAt: hours(55), likes: 13, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p341", authorId: "u_paul", passion: "moto", mood: "creation", type: "text", cover: "workshop",
      text: "J'ai refait le support de top-case de ma vieille routière en frêne lamellé-collé, parce que la platine d'origine est introuvable et que l'alu, je ne sais pas le travailler.\nQuatre couches d'époxy, un essai à 90 km/h avec dix kilos de sable dedans, aucun jeu au retour. Je ne le recommande à personne et j'en suis très content. Le bois vieillit bien si on accepte de le surveiller.",
      createdAt: hours(131), likes: 92, liked: false, comments: []},
    { id: "p342", authorId: "u_maya", passion: "animaux", mood: "learn", type: "photo", cover: "nature",
      text: "Le rappel que je répète dix fois par semaine : un chien qui grogne fait exactement ce qu'on lui demande de faire. Il prévient.\nLe punir, c'est retirer l'avertissement, pas l'inconfort qui va avec. Ce sont les chiens à qui on a interdit de grogner qui mordent sans prévenir, et je n'en ai pas croisé un seul qui soit né comme ça.",
      createdAt: hours(152), likes: 104, liked: false, comments: []},
    { id: "p343", authorId: "u_val", passion: "actu", mood: "actu", type: "text", cover: "news_europe",
      text: "Le communiqué final tient en une page et demie, et l'essentiel est dans une note de bas de page : la clause de révision est repoussée de dix-huit mois.\nTout le monde titre sur l'accord, personne ne lit la note. Dans un an et demi, les mêmes s'étonneront que rien n'ait bougé, et on aura oublié qui avait demandé le report.",
      createdAt: hours(96), likes: 118, liked: false, comments: [
        { id: "cp343_0", authorId: "u_kaoru", text: "Les notes de bas de page, c'est là que le vrai calendrier se cache. Merci pour la lecture.", createdAt: hours(90), likes: 16, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p344", authorId: "u_lea", passion: "musique", mood: "chill", type: "text", cover: "stage",
      text: "Trente personnes dans un bar de la Croix-Rousse, pas de scène, pas de retour, juste un ampli posé sur une chaise. J'ai joué une heure sans setlist.\nÀ un moment quelqu'un a demandé un morceau écrit il y a six ans, que je ne joue plus jamais. Je l'ai massacré et la salle s'en fichait complètement. Ce sont ces soirs-là qui me font continuer.",
      createdAt: hours(187), likes: 87, liked: false, comments: []},
  ];

  // Helpers pour créer des dates précises
  function todayAt(h, m) { var d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); }
  function tomorrowAt(h, m) { var d = new Date(); d.setDate(d.getDate()+1); d.setHours(h, m, 0, 0); return d.getTime(); }
  function inDaysAt(days, h, m) { var d = new Date(); d.setDate(d.getDate()+days); d.setHours(h, m, 0, 0); return d.getTime(); }

  const seedEvents = [
    // AUJOURD'HUI
    { id: "e9", title: "Session escalade nocturne", passion: "sport", emoji: "🧗",
      coverUrl: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Sport & activité", organizerId: "u_jona", date: todayAt(20, 0), time: "20:00",
      city: "Chamonix", venue: "Salle Edelweiss", address: "24 allée du Savoy", postalCode: "74400",
      contact: "06 72 45 18 33", price: 8, maxAttendees: 20,
      attendees: ["u_mehdi", "u_raph"], desc: "Session nocturne en salle. Tous niveaux bienvenus. Chaussons en location sur place (3€). On finit autour d'une bière artisanale." },
    { id: "e1", title: "Jam session guitaristes débutants", passion: "musique", emoji: "🎸",
      coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Jam session", organizerId: "u_lea", date: todayAt(18, 30), time: "18:30",
      city: "Lyon", venue: "Café des Arts", address: "8 rue Dumenge", postalCode: "69004",
      contact: "lea.moreau@passio.app", price: 0, maxAttendees: 12,
      attendees: ["u_karim", "u_amira"], desc: "On joue, on partage des licks, ambiance bienveillante. Apporte ta guitare (acoustique ou électrique avec casque). On commence par un tour de table, chacun joue un riff ou un accord qu'il veut partager." },

    // DEMAIN
    { id: "e2", title: "Balade photo au lever du soleil", passion: "photo", emoji: "📷",
      coverUrl: "https://images.unsplash.com/photo-1552168324-d612d77725e3?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Randonnée", organizerId: "u_karim", date: tomorrowAt(6, 0), time: "06:00",
      city: "Paris", venue: "Pont des Arts", address: "Pont des Arts", postalCode: "75006",
      contact: "karim.belkacem@passio.app", price: 0, maxAttendees: 8,
      attendees: ["u_nina", "u_sofia"], desc: "2h de marche, lumière magique sur le Pont des Arts puis les quais de Seine. Tous appareils acceptés (smartphone ok). RDV côté Rive Gauche, au niveau du cadenas d'amour." },
    { id: "e11", title: "Skate jam au skatepark", passion: "sport", emoji: "🛹",
      coverUrl: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Sport & activité", organizerId: "u_yanis", date: tomorrowAt(14, 0), time: "14:00",
      city: "Bordeaux", venue: "Skatepark des Chartrons", address: "Quai des Chartrons", postalCode: "33300",
      contact: "06 88 12 54 76", price: 0,
      attendees: ["u_raph", "u_jona"], desc: "Skatepark des Chartrons. Tous niveaux. Apporte ton board ou viens observer — no judgment. On tourne jusqu'à la tombée de la nuit." },

    // CETTE SEMAINE
    { id: "e3", title: "Dîner entre passionnés de cuisine", passion: "cuisine", emoji: "🍳",
      coverUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Dégustation", organizerId: "u_theo", date: inDaysAt(2, 19, 30), time: "19:30",
      city: "Marseille", venue: "Chez Théo", address: "15 rue des Catalans", postalCode: "13007",
      contact: "theo.roussel@passio.app", price: 0, maxAttendees: 10,
      attendees: ["u_emma", "u_zoe", "u_liam"], desc: "Chacun amène un plat cuisiné (préférence maison), on débriefe les techniques, les erreurs, les découvertes. Un moment convivial, ni trop formel ni trop décontracté. Indique dans les commentaires ce que tu prévois d'apporter." },
    { id: "e5", title: "Atelier IA pour non-techs", passion: "tech", emoji: "💻",
      coverUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Atelier", organizerId: "u_yanis", date: inDaysAt(2, 14, 0), time: "14:00",
      city: "Toulouse", venue: "Numa Toulouse", address: "2 rue d'Alsace-Lorraine", postalCode: "31000",
      contact: "yanis.perez@passio.app", price: 5, maxAttendees: 15,
      attendees: ["u_theo", "u_sofia"], desc: "Pas de code, zéro jargon. Juste comment intégrer l'IA dans ton quotidien : écriture, organisation, création. 3h avec exercices pratiques. Amène ton ordi." },
    { id: "e6", title: "Cours de yoga sur la plage", passion: "yoga", emoji: "🧘",
      coverUrl: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Cours", organizerId: "u_emma", date: inDaysAt(5, 7, 0), time: "07:00",
      city: "Biarritz", venue: "Plage de la Côte des Basques",
      address: "Boulevard du Prince de Galles", postalCode: "64200",
      contact: "emma.wright@passio.app", price: 0, maxAttendees: 20,
      attendees: ["u_nina", "u_amira", "u_zoe"], desc: "Yoga vinyasa au lever du soleil face à l'Atlantique. Tapis fournis (ou apporte le tien). Niveau intermédiaire. On finit avec un plongeon si le cœur t'en dit." },
    { id: "e17", title: "Soirée dégustation vins nature", passion: "cuisine", emoji: "🍷",
      coverUrl: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Dégustation", organizerId: "u_theo", date: inDaysAt(5, 19, 0), time: "19:00",
      city: "Dijon", venue: "Cave Les Écuyers", address: "24 rue des Forges", postalCode: "21000",
      contact: "06 33 77 91 45", price: 18, maxAttendees: 16,
      attendees: ["u_emma", "u_clara"], desc: "5 cuvées d'artisans bourguignons. 90 min de dégustation commentée par Théo. Pain, fromages et charcuterie sur place. Places limitées, inscription obligatoire." },

    // CE MOIS
    { id: "e12", title: "Concert acoustique amateur", passion: "musique", emoji: "🎵",
      coverUrl: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Concert", organizerId: "u_lea", date: inDaysAt(7, 20, 30), time: "20:30",
      city: "Nantes", venue: "Café La Femme Sauvage", address: "3 rue Fénelon", postalCode: "44000",
      contact: "07 61 42 18 05", price: 5, maxAttendees: 40,
      attendees: ["u_karim", "u_clara"], desc: "Café-concert intimiste avec 4 artistes amateurs de la communauté. Acoustique uniquement — guitare, voix, ukulélé. Scène ouverte en seconde partie. Boissons au bar." },
    { id: "e7", title: "Atelier céramique découverte", passion: "art", emoji: "🏺",
      coverUrl: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Atelier", organizerId: "u_lou", date: inDaysAt(8, 14, 0), time: "14:00",
      city: "Uzès", venue: "Atelier du Potier", address: "7 chemin des Remparts", postalCode: "30700",
      contact: "lou.petit@passio.app", price: 22, maxAttendees: 8,
      attendees: ["u_inès", "u_chloé"], desc: "3h pour comprendre le tour de potier et réaliser ton premier bol. Terre et thé fournis. Les pièces sont cuites et envoyées sous 3 semaines. Aucune expérience nécessaire." },
    { id: "e20", title: "Vernissage galerie indé", passion: "art", emoji: "🎨",
      coverUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Exposition", organizerId: "u_lou", date: inDaysAt(8, 18, 0), time: "18:00",
      city: "Toulouse", venue: "Galerie La Petite", address: "42 rue Pargaminières", postalCode: "31000",
      contact: "galerielapetite@gmail.com", price: 0,
      externalLink: "https://galerielapetite.fr",
      attendees: ["u_inès", "u_chloé"], desc: "18 artistes émergents de la région Occitanie. Peinture, photo, installation. Verre offert à l'ouverture. Tous bienvenus, entrée libre." },
    { id: "e10", title: "Ciné-club films restaurés", passion: "cinema", emoji: "🎬",
      coverUrl: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Soirée", organizerId: "u_noa", date: inDaysAt(9, 20, 0), time: "20:00",
      city: "Paris", venue: "Studio Galande", address: "42 rue Galande", postalCode: "75005",
      contact: "noa.benhaim@passio.app", price: 7, maxAttendees: 35,
      attendees: ["u_sofia", "u_inès", "u_raph"], desc: "Ce mois-ci : Agnès Varda, Sans toit ni loi (1985), version restaurée 4K. Discussion collective après la projection. Boissons disponibles au comptoir. Réservation conseillée." },
    { id: "e23", title: "Randonnée gourmande", passion: "voyage", emoji: "🥾",
      coverUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Randonnée", organizerId: "u_nina", date: inDaysAt(11, 9, 0), time: "09:00",
      city: "Grenoble", venue: "Parking Téléphérique Bastille", address: "Quai Stéphane-Jay", postalCode: "38000",
      contact: "nina.costa@passio.app", price: 0, maxAttendees: 12,
      attendees: ["u_emma", "u_amira"], desc: "12 km en moyenne montagne sur les sentiers du Vercors. Pause pique-nique collective à mi-parcours (apporte quelque chose à partager). Niveau moyen. Chaussures de rando obligatoires." },
    { id: "e14", title: "Book club mensuel", passion: "litterature", emoji: "📚",
      coverUrl: "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Rencontre", organizerId: "u_sofia", date: inDaysAt(11, 18, 0), time: "18:00",
      city: "Bordeaux", venue: "Librairie Mollat", address: "15 rue Vital Carles", postalCode: "33000",
      contact: "sofia.lindqvist@passio.app", price: 0, maxAttendees: 18,
      attendees: ["u_anaïs", "u_chloé"], desc: "Ce mois-ci : Annie Ernaux, Les Années. Pas de préparation imposée — viens même si tu n'as pas fini. Discussion autour d'un verre, en arrière-boutique de la librairie." },
    { id: "e28", title: "Initiation surf coucher de soleil", passion: "sport", emoji: "🏄",
      coverUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Cours", organizerId: "u_jona", date: inDaysAt(15, 18, 0), time: "18:00",
      city: "Biarritz", venue: "Plage Milady", address: "Avenue de la Milady", postalCode: "64200",
      contact: "06 55 28 44 12", price: 25, maxAttendees: 8,
      attendees: ["u_emma"], desc: "Conditions idéales pour les débutants : vagues molles, eau à 18°. Combinaison et planche fournies. Moniteur diplômé. Durée : 2h. Places limitées — inscription obligatoire." },

    // AJOUTS SUPPLÉMENTAIRES
    { id: "e30", title: "Trail run du weekend", passion: "sport", emoji: "🏃",
      coverUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Sortie", organizerId: "u_mehdi", date: inDaysAt(1, 8, 0), time: "08:00",
      city: "Annecy", venue: "Parc du Pâquier", address: "Parc du Pâquier", postalCode: "74000",
      contact: "mehdi.said@passio.app", price: 0, maxAttendees: 20,
      attendees: ["u_jona"], desc: "Trail facile 12km dans les Alpes. Dénivelé +400m. Tous niveaux. Petit-déj sur place après. RDV 7h45 pour départ 8h." },

    { id: "e31", title: "Atelier photo street", passion: "photo", emoji: "📷",
      coverUrl: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Atelier", organizerId: "u_karim", date: inDaysAt(3, 10, 0), time: "10:00",
      city: "Marseille", venue: "Vieux Port", address: "Quai des Belges", postalCode: "13001",
      contact: "karim.belkacem@passio.app", price: 15, maxAttendees: 10,
      attendees: ["u_nina"], desc: "Capture l'essence du Vieux Port : lumière, gens, architecture. Apporte ton appareil photo. Pause café en milieu de séance." },

    { id: "e32", title: "Soirée game indé", passion: "jeuxvideo", emoji: "🎮",
      coverUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Gaming", organizerId: "u_tom", date: inDaysAt(4, 19, 0), time: "19:00",
      city: "Rennes", venue: "Café Gamer Zone", address: "15 rue Saint-Michel", postalCode: "35000",
      contact: "06 12 34 56 78", price: 5, maxAttendees: 16,
      attendees: ["u_raph"], desc: "Tournoi Mario Kart, Smash Bros et jeux indé. Pizza et boissons à gogo. Inscription rapide — matchs toute la soirée." },

    { id: "e33", title: "Tasting biere artisanale", passion: "cuisine", emoji: "🍺",
      coverUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Dégustation", organizerId: "u_theo", date: inDaysAt(5, 18, 30), time: "18:30",
      city: "Lille", venue: "Brasserie Le Vieux Lille", address: "22 rue de la Monnaie", postalCode: "59000",
      contact: "theo.roussel@passio.app", price: 12, maxAttendees: 25,
      attendees: ["u_emma", "u_zoe"], desc: "6 bières du Nord dégustation commentée. Fromages et charcuterie locale. Ambiance décontractée, pas de prise de tête." },

    { id: "e34", title: "Ateliermode upcycling", passion: "mode", emoji: "👗",
      coverUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Atelier", organizerId: "u_zoe", date: inDaysAt(6, 14, 0), time: "14:00",
      city: "Paris", venue: "Studio Créatif 11e", address: "45 rue de Charonne", postalCode: "75011",
      contact: "zoe.marchand@passio.app", price: 35, maxAttendees: 12,
      attendees: ["u_inès", "u_cloe"], desc: "Transformer un vieux tee-shirt ou jean en pièce unique. Apporte ton vêtement, nous fourniront fil et aiguilles. Résultat à emporter." },

    { id: "e35", title: "Podcast live enregistrement", passion: "podcast", emoji: "🎙",
      coverUrl: "https://images.unsplash.com/photo-1589903308904-1010c2294adc?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Enregistrement", organizerId: "u_liam", date: inDaysAt(7, 19, 0), time: "19:00",
      city: "Montréal", venue: "Studio Liam Dufresne", address: "201 rue Saint-Antoine", postalCode: "H2Y 1A6",
      contact: "liam.dufresne@passio.app", price: 0, maxAttendees: 30,
      attendees: ["u_sofia"], desc: "Enregistrement en direct du podcast 'Passion Quotidienne'. Thème : créativité et procrastination. Public en studio pour l'énergie." },

    { id: "e36", title: "Danse contemporaine jam", passion: "danse", emoji: "💃",
      coverUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Jam", organizerId: "u_mila", date: inDaysAt(8, 18, 0), time: "18:00",
      city: "Ajaccio", venue: "Studio Mila", address: "Rue Fesch", postalCode: "20000",
      contact: "06 88 77 55 44", price: 8, maxAttendees: 15,
      attendees: ["u_amira"], desc: "Jam libre, mixte tous niveaux. Apporte ta musique ou prends ce qu'on propose. Studio climatisé. Barre disponible. On finit en apéro corse." },

    { id: "e37", title: "Rencontre littéraire auteur invité", passion: "litterature", emoji: "📚",
      coverUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Rencontre", organizerId: "u_sofia", date: inDaysAt(9, 18, 0), time: "18:00",
      city: "Bordeaux", venue: "Librairie Mollat", address: "15 rue Vital Carles", postalCode: "33000",
      contact: "sofia.lindqvist@passio.app", price: 0, maxAttendees: 40,
      attendees: ["u_anaïs", "u_clara"], desc: "Rencontre avec auteur jeunesse. Dédicaces, questions, dégustation de vins locaux en arrière-boutique." },

    { id: "e38", title: "Workshop pâtisserie végan", passion: "cuisine", emoji: "🧁",
      coverUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Atelier", organizerId: "u_hugo", date: inDaysAt(10, 15, 0), time: "15:00",
      city: "Nice", venue: "Pâtisserie Hugo", address: "Promenade des Anglais", postalCode: "06000",
      contact: "hugo.martelli@passio.app", price: 28, maxAttendees: 10,
      attendees: ["u_chloé", "u_emma"], desc: "Réalise ton gâteau au chocolat 100% végan. Sans oeufs, sans lait, même pas butter. Goûteux ? Oui. À emporter." },

    { id: "e39", title: "Yoga coucher soleil en montagne", passion: "yoga", emoji: "🧘",
      coverUrl: "https://images.unsplash.com/photo-1513745405825-efaf9a49315f?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Cours", organizerId: "u_emma", date: inDaysAt(12, 17, 30), time: "17:30",
      city: "Chamonix", venue: "Refuge des Cosmiques", address: "Lac Blanc", postalCode: "74400",
      contact: "emma.wright@passio.app", price: 0, maxAttendees: 12,
      attendees: ["u_nina", "u_sofia"], desc: "Yoga ashtanga au sommet à 2386m, vue Mont-Blanc. Difficile d'accès à pied (rando 1h30) ou remontée mécanique. Niveau avancé." },

    { id: "e40", title: "Rencontre beatmakers producteurs", passion: "musique", emoji: "🎵",
      coverUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Jam", organizerId: "u_oussa", date: inDaysAt(13, 20, 0), time: "20:00",
      city: "Saint-Denis", venue: "Studio Oussa", address: "48 rue de la Paix", postalCode: "93200",
      contact: "oussa.farid@passio.app", price: 10, maxAttendees: 20,
      attendees: ["u_lea", "u_raph"], desc: "Beatmakers débutants à confirmés. Apporte ton laptop ou utilise les équips du studio. Echanges sur prod, sample, mix. Freestyle sessions." },

    // ÉVÉNEMENTS PROCHES DE PARIS (pour les filtres distance)
    { id: "e41", title: "Yoga matin à Versailles", passion: "yoga", emoji: "🧘",
      coverUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Cours", organizerId: "u_emma", date: todayAt(7, 0), time: "07:00",
      city: "Versailles", venue: "Parc de Versailles", address: "Place d'Armes", postalCode: "78000",
      contact: "emma.wright@passio.app", price: 5, maxAttendees: 15,
      attendees: ["u_sofia"], desc: "Yoga doux dans les jardins du château. ~15km de Paris. Prévoir tapis et bouteille d'eau." },

    { id: "e42", title: "Balade vélo Fontainebleau", passion: "sport", emoji: "🚴",
      coverUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Randonnée", organizerId: "u_clara", date: tomorrowAt(9, 0), time: "09:00",
      city: "Fontainebleau", venue: "Gare de Fontainebleau", address: "Place de la Gare", postalCode: "77300",
      contact: "clara.jensen@passio.app", price: 0, maxAttendees: 12,
      attendees: ["u_mehdi", "u_raph"], desc: "Sortie vélo facile ~50km autour de Fontainebleau. ~50km de Paris. Tous niveaux." },

    { id: "e43", title: "Pique-nique photos Fontainebleau", passion: "photo", emoji: "📷",
      coverUrl: "https://images.unsplash.com/photo-1552168324-d612d77725e3?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Sortie", organizerId: "u_karim", date: inDaysAt(2, 10, 0), time: "10:00",
      city: "Fontainebleau", venue: "Forêt de Fontainebleau", address: "Parking Gorges de Franchard", postalCode: "77300",
      contact: "karim.belkacem@passio.app", price: 0, maxAttendees: 8,
      attendees: ["u_nina"], desc: "Photo nature en forêt. Lumière douce matin. Pique-nique partage après shoot. ~50km." },

    { id: "e44", title: "Atelier poterie Fontainebleau", passion: "art", emoji: "🏺",
      coverUrl: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Atelier", organizerId: "u_lou", date: inDaysAt(3, 14, 0), time: "14:00",
      city: "Fontainebleau", venue: "Studio Terre & Feu", address: "15 rue du Four", postalCode: "77300",
      contact: "lou.petit@passio.app", price: 20, maxAttendees: 10,
      attendees: ["u_inès"], desc: "Atelier poterie 3h. Débutants welcome. Tout fourni. ~50km de Paris." },

    { id: "e45", title: "Brunch littéraire Rambouilet", passion: "litterature", emoji: "📚",
      coverUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Rencontre", organizerId: "u_sofia", date: inDaysAt(1, 10, 30), time: "10:30",
      city: "Rambouillet", venue: "Café du Château", address: "22 place Poulain", postalCode: "78120",
      contact: "sofia.lindqvist@passio.app", price: 15, maxAttendees: 16,
      attendees: ["u_anaïs"], desc: "Brunch + discussion littéraire autour des lectures du mois. ~70km. RDV intérieur café." },

    { id: "e46", title: "Jam session jazz Boulogne", passion: "musique", emoji: "🎸",
      coverUrl: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Jam", organizerId: "u_lea", date: todayAt(19, 30), time: "19:30",
      city: "Boulogne-Billancourt", venue: "Blues Club", address: "8 rue des Pécheurs", postalCode: "92100",
      contact: "lea.moreau@passio.app", price: 8, maxAttendees: 25,
      attendees: ["u_oussa"], desc: "Jam jazz gratuit ce soir! Musiciens du dimanche welcome. ~3km de Paris. Buvettes sur place." },

    { id: "e47", title: "Tech meetup Neuilly", passion: "tech", emoji: "💻",
      coverUrl: "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Meetup", organizerId: "u_raph", date: inDaysAt(1, 18, 0), time: "18:00",
      city: "Neuilly-sur-Seine", venue: "Hub Tech Neuilly", address: "35 avenue du Maréchal", postalCode: "92200",
      contact: "raph.thys@passio.app", price: 0, maxAttendees: 40,
      attendees: ["u_yanis", "u_tom"], desc: "Meetup mensuel tech: IA, DevOps, startups. ~5km. Apéro offert." },

    { id: "e48", title: "Danse urbaine Montreuil", passion: "danse", emoji: "💃",
      coverUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Classe", organizerId: "u_amira", date: inDaysAt(2, 18, 0), time: "18:00",
      city: "Montreuil", venue: "Studio Urban Groove", address: "42 rue de Miromesnil", postalCode: "93100",
      contact: "amira.haddad@passio.app", price: 12, maxAttendees: 20,
      attendees: ["u_mila"], desc: "Hip-hop, popping, locking. Tous niveaux. ~8km de Paris. Musique live." },

    { id: "e49", title: "Mode éthique workshop Marais", passion: "mode", emoji: "👗",
      coverUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Atelier", organizerId: "u_zoe", date: inDaysAt(4, 15, 0), time: "15:00",
      city: "Paris", venue: "Marais Créatif", address: "50 rue du Turenne", postalCode: "75003",
      contact: "zoe.marchand@passio.app", price: 25, maxAttendees: 12,
      attendees: ["u_rita"], desc: "Mode éthique & durable. Apprendre à coudre une pièce. ~0km (dans Paris)." },

    { id: "e50", title: "Cuisine méditerranéenne la Défense", passion: "cuisine", emoji: "🍳",
      coverUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&h=560&fit=crop&crop=entropy&auto=format&q=80",
      eventType: "Atelier", organizerId: "u_theo", date: inDaysAt(3, 19, 0), time: "19:00",
      city: "La Défense", venue: "Cook Studio", address: "15 place de la Défense", postalCode: "92400",
      contact: "theo.roussel@passio.app", price: 35, maxAttendees: 14,
      attendees: ["u_emma"], desc: "Cuisine méditerranéenne: pâtes fraîches & sauces. Apéro inclus. ~10km. Beaucoup de rires!" },
  ];

  const seedStories = [
    { id: "s1", authorId: "u_lea",   photo: "photo-1511671782779-c97d3d27a1d4",
      bg: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
      text: "Pause studio 🎸\nPrépare une nouvelle démo", createdAt: hours(1) },
    { id: "s2", authorId: "u_clara", photo: "photo-1464822759023-fed622ff2c3b",
      bg: "linear-gradient(135deg, #8b5cf6, #8b5cf6)",
      text: "J-12 vélo Copenhague → Rome 🚴", createdAt: hours(2) },
    { id: "s3", authorId: "u_noa",   photo: "photo-1485846234645-a62644f84728",
      bg: "linear-gradient(135deg, #8b5cf6, #a78bfa)",
      text: "Sur le banc de montage jusqu'à 3h\nLa scène coupée fait tout", createdAt: hours(3) },
    { id: "s4", authorId: "u_hugo",  photo: "photo-1556909114-f6e7ad7d3136",
      bg: "linear-gradient(135deg, #a78bfa, #7c3aed)",
      text: "Sortie du four 🧁\nTarte citron vegan v4", createdAt: hours(4) },
    { id: "s5", authorId: "u_chloé", photo: "photo-1470071459604-3b5ec3a7fe05",
      bg: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
      text: "Vivre lentement\n= résister poliment", createdAt: hours(6) },
    { id: "s6", authorId: "u_mila",  photo: "photo-1508700115892-45ecd05ae2ad",
      bg: "linear-gradient(135deg, #7c3aed, #8b5cf6)",
      text: "Répétitions stage d'Ajaccio 🩰\nJ'ai la chair de poule", createdAt: hours(8) },
    { id: "s7", authorId: "u_raph",  photo: "photo-1518770660439-4636190af475",
      bg: "linear-gradient(135deg, #8b5cf6, #8b5cf6)",
      text: "Design > Deadline 🧠", createdAt: hours(10) },
  ];

  const seedNotifications = [
    { id: "n1", kind: "like",    fromId: "u_lea",   text: "<b>Léa Moreau</b> a aimé ton intention de rejoindre PASSIO", createdAt: hours(0.5), unread: true,  emoji: "💖" },
    { id: "n2", kind: "follow",  fromId: "u_clara", text: "<b>Clara Jensen</b> suit maintenant ton profil voyage", createdAt: hours(1), unread: true,  emoji: "🤝" },
    { id: "n3", kind: "comment", fromId: "u_yanis", text: "<b>Yanis Perez</b> a réagi à un post : « On devrait échanger 🚀 »", createdAt: hours(2), unread: true,  emoji: "💬" },
    { id: "n4", kind: "event",   fromId: "u_theo",  text: "<b>Théo Roussel</b> t'invite au « Dîner entre passionnés de cuisine »", createdAt: hours(3), unread: false, emoji: "🍳" },
    { id: "n5", kind: "system",  fromId: "me",      text: "Ta première publication attend : montre ce que tu aimes 🎨", createdAt: hours(5), unread: false, emoji: "✨" },
    { id: "n6", kind: "system",  fromId: "me",      text: "Bienvenue sur PASSIO 🎉 Choisis tes passions et découvre qui les partage.", createdAt: hours(6), unread: false, emoji: "✨" },
    { id: "n7", kind: "like",    fromId: "u_karim", text: "<b>Karim Belkacem</b> a réagi à ta passion photo", createdAt: hours(10), unread: false, emoji: "📷" },
  ];

  return { users: seedUsers, posts: seedPosts, events: seedEvents, stories: seedStories, notifications: seedNotifications };
}

