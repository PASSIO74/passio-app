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

// ======== SCORE LADDER ========
const RANKS = [
  { min: 0,    label: "Débutant",       next: 100 },
  { min: 100,  label: "Explorateur",    next: 300 },
  { min: 300,  label: "Créateur",       next: 700 },
  { min: 700,  label: "Contributeur",   next: 1500 },
  { min: 1500, label: "Ambassadeur",    next: 3000 },
  { min: 3000, label: "Passionné·e",    next: null },
];

// ======== POINTS MAP ========
// Deux monnaies, deux logiques claires :
//  ⭐ Étoiles  = ton ACTIVITÉ. Généreuses, elles font monter ton rang. Chaque
//               action en donne (publier, commenter, participer, créer…).
//  💎 Passia   = la VALEUR que tu crées pour les autres. Vraie valeur, donc rare
//               et IMPOSSIBLE à farmer en solo : on n'en gagne JAMAIS par une
//               action perso. Les seules sources sont (1) les likes reçus sur
//               ton contenu (palier tous les LIKES_PER_PASSIA likes) et (2) les
//               quêtes/jalons (claimQuest). → passia: 0 partout ici, exprès.
const REWARDS = {
  publish_text:   { pts: 10, passia: 0, label: "Post publié" },
  publish_photo:  { pts: 15, passia: 0, label: "Photo publiée" },
  publish_video:  { pts: 25, passia: 0, label: "Vidéo publiée" },
  publish_audio:  { pts: 20, passia: 0, label: "Podcast publié" },
  publish_vlog:   { pts: 50, passia: 0, label: "Carnet de voyage publié" },
  event_create:   { pts: 30, passia: 0, label: "Événement créé" },
  event_join:     { pts: 20, passia: 0, label: "Participation IRL" },
  profile_create: { pts: 15, passia: 0, label: "Nouveau profil" },
  comment:        { pts: 3,  passia: 0, label: "Commentaire" },
  like_received:  { pts: 2,  passia: 0, label: "Like reçu" },
  first_login:    { pts: 50, passia: 0, label: "Premier login" },
  daily:          { pts: 5,  passia: 0, label: "Connexion du jour" },
};

// 💎 Un palier de likes reçus = +1 Passia (la valeur reçue, lissée et non-farmable).
const LIKES_PER_PASSIA = 10;

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
    { id: "u_tom",   name: "Tom Larivière",   avatar: "#a78bfa", passion: "jeux", mood: "chill", bio: "Speedrunner Zelda · Rennes", profileEmoji: "🎮" },
    { id: "u_chloé", name: "Chloé Dubois",   avatar: "#a78bfa", passion: "bienetre", mood: "chill", bio: "Naturopathe · Aix-en-Provence", profileEmoji: "🌿" },
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
    { id: "p17", authorId: "u_chloé", passion: "bienetre", mood: "chill", type: "text", cover: "nature",
      text: "Rappel doux : tu peux être productive ET fatiguée. Les deux sont vrais. Aujourd'hui j'ai fait la sieste. C'était parfait.",
      createdAt: hours(11), likes: 298, liked: false, comments: [
        { id: "c8", authorId: "u_emma", text: "Merci pour ça. J'en avais besoin 🌿", createdAt: hours(10), likes: 12, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p18", authorId: "u_tom", passion: "jeux", mood: "chill", type: "text", cover: "neon",
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
    { id: "p67", authorId: "u_chloé", passion: "bienetre", mood: "learn", type: "text", cover: "nature",
      text: "Naturopathie, 3 conseils sommeil qui marchent chez 90% de mes patient·es :\n\n1. Pas d'écran 45 min avant de dormir (le seuil, pas 1h30)\n2. Chambre à 17-18 °C max\n3. Petit-déj salé, pas sucré\n\nLe sommeil se prépare le matin.",
      createdAt: days(1), likes: 176, liked: false, comments: [] },

    // ==== JEUX, 2 posts ====
    { id: "p68", authorId: "u_tom", passion: "jeux", mood: "creation", type: "text", cover: "dark_matter",
      text: "Nouveau record personnel sur Ocarina of Time Any% : 17:41. 3 mois d'optim sur le skip du Deku Tree.\n\nQuand je dis à mes potes non-gamers que je m'entraîne à battre 15 secondes, ils me regardent comme si j'étais fou. Ils ont raison. C'est le principe.",
      createdAt: hours(19), likes: 163, liked: false, comments: [] },
    { id: "p69", authorId: "u_tom", passion: "jeux", mood: "chill", type: "text", cover: "neon",
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

    { id: "pac_jeux", authorId: "u_tom", passion: "jeux", mood: "actu", type: "text", cover: "neon",
      text: "Gaming : les speedrunners sont maintenant sponsorisés comme athlètes pro. Esports devient un métier légal.",
      createdAt: hours(15), likes: 634, liked: false, comments: [] },

    { id: "pac_bienetre", authorId: "u_chloé", passion: "bienetre", mood: "actu", type: "text", cover: "nature",
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
  ];

  // Helpers pour créer des dates précises
  function todayAt(h, m) { var d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); }
  function tomorrowAt(h, m) { var d = new Date(); d.setDate(d.getDate()+1); d.setHours(h, m, 0, 0); return d.getTime(); }
  function inDaysAt(days, h, m) { var d = new Date(); d.setDate(d.getDate()+days); d.setHours(h, m, 0, 0); return d.getTime(); }

  const seedEvents = [
    // AUJOURD'HUI
    { id: "e9", title: "Session escalade nocturne", passion: "sport", emoji: "🧗",
      eventType: "Sport & activité", organizerId: "u_jona", date: todayAt(20, 0), time: "20:00",
      city: "Chamonix", venue: "Salle Edelweiss", address: "24 allée du Savoy", postalCode: "74400",
      contact: "06 72 45 18 33", price: 8, maxAttendees: 20,
      attendees: ["u_mehdi", "u_raph"], desc: "Session nocturne en salle. Tous niveaux bienvenus. Chaussons en location sur place (3€). On finit autour d'une bière artisanale." },
    { id: "e1", title: "Jam session guitaristes débutants", passion: "musique", emoji: "🎸",
      eventType: "Jam session", organizerId: "u_lea", date: todayAt(18, 30), time: "18:30",
      city: "Lyon", venue: "Café des Arts", address: "8 rue Dumenge", postalCode: "69004",
      contact: "lea.moreau@passio.app", price: 0, maxAttendees: 12,
      attendees: ["u_karim", "u_amira"], desc: "On joue, on partage des licks, ambiance bienveillante. Apporte ta guitare (acoustique ou électrique avec casque). On commence par un tour de table, chacun joue un riff ou un accord qu'il veut partager." },

    // DEMAIN
    { id: "e2", title: "Balade photo au lever du soleil", passion: "photo", emoji: "📷",
      eventType: "Randonnée", organizerId: "u_karim", date: tomorrowAt(6, 0), time: "06:00",
      city: "Paris", venue: "Pont des Arts", address: "Pont des Arts", postalCode: "75006",
      contact: "karim.belkacem@passio.app", price: 0, maxAttendees: 8,
      attendees: ["u_nina", "u_sofia"], desc: "2h de marche, lumière magique sur le Pont des Arts puis les quais de Seine. Tous appareils acceptés (smartphone ok). RDV côté Rive Gauche, au niveau du cadenas d'amour." },
    { id: "e11", title: "Skate jam au skatepark", passion: "sport", emoji: "🛹",
      eventType: "Sport & activité", organizerId: "u_yanis", date: tomorrowAt(14, 0), time: "14:00",
      city: "Bordeaux", venue: "Skatepark des Chartrons", address: "Quai des Chartrons", postalCode: "33300",
      contact: "06 88 12 54 76", price: 0,
      attendees: ["u_raph", "u_jona"], desc: "Skatepark des Chartrons. Tous niveaux. Apporte ton board ou viens observer — no judgment. On tourne jusqu'à la tombée de la nuit." },

    // CETTE SEMAINE
    { id: "e3", title: "Dîner entre passionnés de cuisine", passion: "cuisine", emoji: "🍳",
      eventType: "Dégustation", organizerId: "u_theo", date: inDaysAt(2, 19, 30), time: "19:30",
      city: "Marseille", venue: "Chez Théo", address: "15 rue des Catalans", postalCode: "13007",
      contact: "theo.roussel@passio.app", price: 0, maxAttendees: 10,
      attendees: ["u_emma", "u_zoe", "u_liam"], desc: "Chacun amène un plat cuisiné (préférence maison), on débriefe les techniques, les erreurs, les découvertes. Un moment convivial, ni trop formel ni trop décontracté. Indique dans les commentaires ce que tu prévois d'apporter." },
    { id: "e5", title: "Atelier IA pour non-techs", passion: "tech", emoji: "💻",
      eventType: "Atelier", organizerId: "u_yanis", date: inDaysAt(2, 14, 0), time: "14:00",
      city: "Toulouse", venue: "Numa Toulouse", address: "2 rue d'Alsace-Lorraine", postalCode: "31000",
      contact: "yanis.perez@passio.app", price: 5, maxAttendees: 15,
      attendees: ["u_theo", "u_sofia"], desc: "Pas de code, zéro jargon. Juste comment intégrer l'IA dans ton quotidien : écriture, organisation, création. 3h avec exercices pratiques. Amène ton ordi." },
    { id: "e6", title: "Cours de yoga sur la plage", passion: "yoga", emoji: "🧘",
      eventType: "Cours", organizerId: "u_emma", date: inDaysAt(5, 7, 0), time: "07:00",
      city: "Biarritz", venue: "Plage de la Côte des Basques",
      address: "Boulevard du Prince de Galles", postalCode: "64200",
      contact: "emma.wright@passio.app", price: 0, maxAttendees: 20,
      attendees: ["u_nina", "u_amira", "u_zoe"], desc: "Yoga vinyasa au lever du soleil face à l'Atlantique. Tapis fournis (ou apporte le tien). Niveau intermédiaire. On finit avec un plongeon si le cœur t'en dit." },
    { id: "e17", title: "Soirée dégustation vins nature", passion: "cuisine", emoji: "🍷",
      eventType: "Dégustation", organizerId: "u_theo", date: inDaysAt(5, 19, 0), time: "19:00",
      city: "Dijon", venue: "Cave Les Écuyers", address: "24 rue des Forges", postalCode: "21000",
      contact: "06 33 77 91 45", price: 18, maxAttendees: 16,
      attendees: ["u_emma", "u_clara"], desc: "5 cuvées d'artisans bourguignons. 90 min de dégustation commentée par Théo. Pain, fromages et charcuterie sur place. Places limitées, inscription obligatoire." },

    // CE MOIS
    { id: "e12", title: "Concert acoustique amateur", passion: "musique", emoji: "🎵",
      eventType: "Concert", organizerId: "u_lea", date: inDaysAt(7, 20, 30), time: "20:30",
      city: "Nantes", venue: "Café La Femme Sauvage", address: "3 rue Fénelon", postalCode: "44000",
      contact: "07 61 42 18 05", price: 5, maxAttendees: 40,
      attendees: ["u_karim", "u_clara"], desc: "Café-concert intimiste avec 4 artistes amateurs de la communauté. Acoustique uniquement — guitare, voix, ukulélé. Scène ouverte en seconde partie. Boissons au bar." },
    { id: "e7", title: "Atelier céramique découverte", passion: "art", emoji: "🏺",
      eventType: "Atelier", organizerId: "u_lou", date: inDaysAt(8, 14, 0), time: "14:00",
      city: "Uzès", venue: "Atelier du Potier", address: "7 chemin des Remparts", postalCode: "30700",
      contact: "lou.petit@passio.app", price: 22, maxAttendees: 8,
      attendees: ["u_inès", "u_chloé"], desc: "3h pour comprendre le tour de potier et réaliser ton premier bol. Terre et thé fournis. Les pièces sont cuites et envoyées sous 3 semaines. Aucune expérience nécessaire." },
    { id: "e20", title: "Vernissage galerie indé", passion: "art", emoji: "🎨",
      eventType: "Exposition", organizerId: "u_lou", date: inDaysAt(8, 18, 0), time: "18:00",
      city: "Toulouse", venue: "Galerie La Petite", address: "42 rue Pargaminières", postalCode: "31000",
      contact: "galerielapetite@gmail.com", price: 0,
      externalLink: "https://galerielapetite.fr",
      attendees: ["u_inès", "u_chloé"], desc: "18 artistes émergents de la région Occitanie. Peinture, photo, installation. Verre offert à l'ouverture. Tous bienvenus, entrée libre." },
    { id: "e10", title: "Ciné-club films restaurés", passion: "cinema", emoji: "🎬",
      eventType: "Soirée", organizerId: "u_noa", date: inDaysAt(9, 20, 0), time: "20:00",
      city: "Paris", venue: "Studio Galande", address: "42 rue Galande", postalCode: "75005",
      contact: "noa.benhaim@passio.app", price: 7, maxAttendees: 35,
      attendees: ["u_sofia", "u_inès", "u_raph"], desc: "Ce mois-ci : Agnès Varda, Sans toit ni loi (1985), version restaurée 4K. Discussion collective après la projection. Boissons disponibles au comptoir. Réservation conseillée." },
    { id: "e23", title: "Randonnée gourmande", passion: "voyage", emoji: "🥾",
      eventType: "Randonnée", organizerId: "u_nina", date: inDaysAt(11, 9, 0), time: "09:00",
      city: "Grenoble", venue: "Parking Téléphérique Bastille", address: "Quai Stéphane-Jay", postalCode: "38000",
      contact: "nina.costa@passio.app", price: 0, maxAttendees: 12,
      attendees: ["u_emma", "u_amira"], desc: "12 km en moyenne montagne sur les sentiers du Vercors. Pause pique-nique collective à mi-parcours (apporte quelque chose à partager). Niveau moyen. Chaussures de rando obligatoires." },
    { id: "e14", title: "Book club mensuel", passion: "litterature", emoji: "📚",
      eventType: "Rencontre", organizerId: "u_sofia", date: inDaysAt(11, 18, 0), time: "18:00",
      city: "Bordeaux", venue: "Librairie Mollat", address: "15 rue Vital Carles", postalCode: "33000",
      contact: "sofia.lindqvist@passio.app", price: 0, maxAttendees: 18,
      attendees: ["u_anaïs", "u_chloé"], desc: "Ce mois-ci : Annie Ernaux, Les Années. Pas de préparation imposée — viens même si tu n'as pas fini. Discussion autour d'un verre, en arrière-boutique de la librairie." },
    { id: "e28", title: "Initiation surf coucher de soleil", passion: "sport", emoji: "🏄",
      eventType: "Cours", organizerId: "u_jona", date: inDaysAt(15, 18, 0), time: "18:00",
      city: "Biarritz", venue: "Plage Milady", address: "Avenue de la Milady", postalCode: "64200",
      contact: "06 55 28 44 12", price: 25, maxAttendees: 8,
      attendees: ["u_emma"], desc: "Conditions idéales pour les débutants : vagues molles, eau à 18°. Combinaison et planche fournies. Moniteur diplômé. Durée : 2h. Places limitées — inscription obligatoire." },

    // AJOUTS SUPPLÉMENTAIRES
    { id: "e30", title: "Trail run du weekend", passion: "sport", emoji: "🏃",
      eventType: "Sortie", organizerId: "u_mehdi", date: inDaysAt(1, 8, 0), time: "08:00",
      city: "Annecy", venue: "Parc du Pâquier", address: "Parc du Pâquier", postalCode: "74000",
      contact: "mehdi.said@passio.app", price: 0, maxAttendees: 20,
      attendees: ["u_jona"], desc: "Trail facile 12km dans les Alpes. Dénivelé +400m. Tous niveaux. Petit-déj sur place après. RDV 7h45 pour départ 8h." },

    { id: "e31", title: "Atelier photo street", passion: "photo", emoji: "📷",
      eventType: "Atelier", organizerId: "u_karim", date: inDaysAt(3, 10, 0), time: "10:00",
      city: "Marseille", venue: "Vieux Port", address: "Quai des Belges", postalCode: "13001",
      contact: "karim.belkacem@passio.app", price: 15, maxAttendees: 10,
      attendees: ["u_nina"], desc: "Capture l'essence du Vieux Port : lumière, gens, architecture. Apporte ton appareil photo. Pause café en milieu de séance." },

    { id: "e32", title: "Soirée game indé", passion: "jeux", emoji: "🎮",
      eventType: "Gaming", organizerId: "u_tom", date: inDaysAt(4, 19, 0), time: "19:00",
      city: "Rennes", venue: "Café Gamer Zone", address: "15 rue Saint-Michel", postalCode: "35000",
      contact: "06 12 34 56 78", price: 5, maxAttendees: 16,
      attendees: ["u_raph"], desc: "Tournoi Mario Kart, Smash Bros et jeux indé. Pizza et boissons à gogo. Inscription rapide — matchs toute la soirée." },

    { id: "e33", title: "Tasting biere artisanale", passion: "cuisine", emoji: "🍺",
      eventType: "Dégustation", organizerId: "u_theo", date: inDaysAt(5, 18, 30), time: "18:30",
      city: "Lille", venue: "Brasserie Le Vieux Lille", address: "22 rue de la Monnaie", postalCode: "59000",
      contact: "theo.roussel@passio.app", price: 12, maxAttendees: 25,
      attendees: ["u_emma", "u_zoe"], desc: "6 bières du Nord dégustation commentée. Fromages et charcuterie locale. Ambiance décontractée, pas de prise de tête." },

    { id: "e34", title: "Ateliermode upcycling", passion: "mode", emoji: "👗",
      eventType: "Atelier", organizerId: "u_zoe", date: inDaysAt(6, 14, 0), time: "14:00",
      city: "Paris", venue: "Studio Créatif 11e", address: "45 rue de Charonne", postalCode: "75011",
      contact: "zoe.marchand@passio.app", price: 35, maxAttendees: 12,
      attendees: ["u_inès", "u_cloe"], desc: "Transformer un vieux tee-shirt ou jean en pièce unique. Apporte ton vêtement, nous fourniront fil et aiguilles. Résultat à emporter." },

    { id: "e35", title: "Podcast live enregistrement", passion: "podcast", emoji: "🎙",
      eventType: "Enregistrement", organizerId: "u_liam", date: inDaysAt(7, 19, 0), time: "19:00",
      city: "Montréal", venue: "Studio Liam Dufresne", address: "201 rue Saint-Antoine", postalCode: "H2Y 1A6",
      contact: "liam.dufresne@passio.app", price: 0, maxAttendees: 30,
      attendees: ["u_sofia"], desc: "Enregistrement en direct du podcast 'Passion Quotidienne'. Thème : créativité et procrastination. Public en studio pour l'énergie." },

    { id: "e36", title: "Danse contemporaine jam", passion: "danse", emoji: "💃",
      eventType: "Jam", organizerId: "u_mila", date: inDaysAt(8, 18, 0), time: "18:00",
      city: "Ajaccio", venue: "Studio Mila", address: "Rue Fesch", postalCode: "20000",
      contact: "06 88 77 55 44", price: 8, maxAttendees: 15,
      attendees: ["u_amira"], desc: "Jam libre, mixte tous niveaux. Apporte ta musique ou prends ce qu'on propose. Studio climatisé. Barre disponible. On finit en apéro corse." },

    { id: "e37", title: "Rencontre littéraire auteur invité", passion: "litterature", emoji: "📚",
      eventType: "Rencontre", organizerId: "u_sofia", date: inDaysAt(9, 18, 0), time: "18:00",
      city: "Bordeaux", venue: "Librairie Mollat", address: "15 rue Vital Carles", postalCode: "33000",
      contact: "sofia.lindqvist@passio.app", price: 0, maxAttendees: 40,
      attendees: ["u_anaïs", "u_clara"], desc: "Rencontre avec auteur jeunesse. Dédicaces, questions, dégustation de vins locaux en arrière-boutique." },

    { id: "e38", title: "Workshop pâtisserie végan", passion: "cuisine", emoji: "🧁",
      eventType: "Atelier", organizerId: "u_hugo", date: inDaysAt(10, 15, 0), time: "15:00",
      city: "Nice", venue: "Pâtisserie Hugo", address: "Promenade des Anglais", postalCode: "06000",
      contact: "hugo.martelli@passio.app", price: 28, maxAttendees: 10,
      attendees: ["u_chloé", "u_emma"], desc: "Réalise ton gâteau au chocolat 100% végan. Sans oeufs, sans lait, même pas butter. Goûteux ? Oui. À emporter." },

    { id: "e39", title: "Yoga coucher soleil en montagne", passion: "yoga", emoji: "🧘",
      eventType: "Cours", organizerId: "u_emma", date: inDaysAt(12, 17, 30), time: "17:30",
      city: "Chamonix", venue: "Refuge des Cosmiques", address: "Lac Blanc", postalCode: "74400",
      contact: "emma.wright@passio.app", price: 0, maxAttendees: 12,
      attendees: ["u_nina", "u_sofia"], desc: "Yoga ashtanga au sommet à 2386m, vue Mont-Blanc. Difficile d'accès à pied (rando 1h30) ou remontée mécanique. Niveau avancé." },

    { id: "e40", title: "Rencontre beatmakers producteurs", passion: "musique", emoji: "🎵",
      eventType: "Jam", organizerId: "u_oussa", date: inDaysAt(13, 20, 0), time: "20:00",
      city: "Saint-Denis", venue: "Studio Oussa", address: "48 rue de la Paix", postalCode: "93200",
      contact: "oussa.farid@passio.app", price: 10, maxAttendees: 20,
      attendees: ["u_lea", "u_raph"], desc: "Beatmakers débutants à confirmés. Apporte ton laptop ou utilise les équips du studio. Echanges sur prod, sample, mix. Freestyle sessions." },

    // ÉVÉNEMENTS PROCHES DE PARIS (pour les filtres distance)
    { id: "e41", title: "Yoga matin à Versailles", passion: "yoga", emoji: "🧘",
      eventType: "Cours", organizerId: "u_emma", date: todayAt(7, 0), time: "07:00",
      city: "Versailles", venue: "Parc de Versailles", address: "Place d'Armes", postalCode: "78000",
      contact: "emma.wright@passio.app", price: 5, maxAttendees: 15,
      attendees: ["u_sofia"], desc: "Yoga doux dans les jardins du château. ~15km de Paris. Prévoir tapis et bouteille d'eau." },

    { id: "e42", title: "Balade vélo Fontainebleau", passion: "sport", emoji: "🚴",
      eventType: "Randonnée", organizerId: "u_clara", date: tomorrowAt(9, 0), time: "09:00",
      city: "Fontainebleau", venue: "Gare de Fontainebleau", address: "Place de la Gare", postalCode: "77300",
      contact: "clara.jensen@passio.app", price: 0, maxAttendees: 12,
      attendees: ["u_mehdi", "u_raph"], desc: "Sortie vélo facile ~50km autour de Fontainebleau. ~50km de Paris. Tous niveaux." },

    { id: "e43", title: "Pique-nique photos Fontainebleau", passion: "photo", emoji: "📷",
      eventType: "Sortie", organizerId: "u_karim", date: inDaysAt(2, 10, 0), time: "10:00",
      city: "Fontainebleau", venue: "Forêt de Fontainebleau", address: "Parking Gorges de Franchard", postalCode: "77300",
      contact: "karim.belkacem@passio.app", price: 0, maxAttendees: 8,
      attendees: ["u_nina"], desc: "Photo nature en forêt. Lumière douce matin. Pique-nique partage après shoot. ~50km." },

    { id: "e44", title: "Atelier poterie Fontainebleau", passion: "art", emoji: "🏺",
      eventType: "Atelier", organizerId: "u_lou", date: inDaysAt(3, 14, 0), time: "14:00",
      city: "Fontainebleau", venue: "Studio Terre & Feu", address: "15 rue du Four", postalCode: "77300",
      contact: "lou.petit@passio.app", price: 20, maxAttendees: 10,
      attendees: ["u_inès"], desc: "Atelier poterie 3h. Débutants welcome. Tout fourni. ~50km de Paris." },

    { id: "e45", title: "Brunch littéraire Rambouilet", passion: "litterature", emoji: "📚",
      eventType: "Rencontre", organizerId: "u_sofia", date: inDaysAt(1, 10, 30), time: "10:30",
      city: "Rambouillet", venue: "Café du Château", address: "22 place Poulain", postalCode: "78120",
      contact: "sofia.lindqvist@passio.app", price: 15, maxAttendees: 16,
      attendees: ["u_anaïs"], desc: "Brunch + discussion littéraire autour des lectures du mois. ~70km. RDV intérieur café." },

    { id: "e46", title: "Jam session jazz Boulogne", passion: "musique", emoji: "🎸",
      eventType: "Jam", organizerId: "u_lea", date: todayAt(19, 30), time: "19:30",
      city: "Boulogne-Billancourt", venue: "Blues Club", address: "8 rue des Pécheurs", postalCode: "92100",
      contact: "lea.moreau@passio.app", price: 8, maxAttendees: 25,
      attendees: ["u_oussa"], desc: "Jam jazz gratuit ce soir! Musiciens du dimanche welcome. ~3km de Paris. Buvettes sur place." },

    { id: "e47", title: "Tech meetup Neuilly", passion: "tech", emoji: "💻",
      eventType: "Meetup", organizerId: "u_raph", date: inDaysAt(1, 18, 0), time: "18:00",
      city: "Neuilly-sur-Seine", venue: "Hub Tech Neuilly", address: "35 avenue du Maréchal", postalCode: "92200",
      contact: "raph.thys@passio.app", price: 0, maxAttendees: 40,
      attendees: ["u_yanis", "u_tom"], desc: "Meetup mensuel tech: IA, DevOps, startups. ~5km. Apéro offert." },

    { id: "e48", title: "Danse urbaine Montreuil", passion: "danse", emoji: "💃",
      eventType: "Classe", organizerId: "u_amira", date: inDaysAt(2, 18, 0), time: "18:00",
      city: "Montreuil", venue: "Studio Urban Groove", address: "42 rue de Miromesnil", postalCode: "93100",
      contact: "amira.haddad@passio.app", price: 12, maxAttendees: 20,
      attendees: ["u_mila"], desc: "Hip-hop, popping, locking. Tous niveaux. ~8km de Paris. Musique live." },

    { id: "e49", title: "Mode éthique workshop Marais", passion: "mode", emoji: "👗",
      eventType: "Atelier", organizerId: "u_zoe", date: inDaysAt(4, 15, 0), time: "15:00",
      city: "Paris", venue: "Marais Créatif", address: "50 rue du Turenne", postalCode: "75003",
      contact: "zoe.marchand@passio.app", price: 25, maxAttendees: 12,
      attendees: ["u_rita"], desc: "Mode éthique & durable. Apprendre à coudre une pièce. ~0km (dans Paris)." },

    { id: "e50", title: "Cuisine méditerranéenne la Défense", passion: "cuisine", emoji: "🍳",
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
    { id: "n5", kind: "quest",   fromId: "me",      text: "Nouvelle quête du jour : publie ton premier post 🎨 <b>+15 pts</b>", createdAt: hours(5), unread: false, emoji: "🎯" },
    { id: "n6", kind: "system",  fromId: "me",      text: "Bienvenue sur PASSIO 🎉 Tu as gagné <b>10 💎 Passia</b> de bienvenue.", createdAt: hours(6), unread: false, emoji: "✨" },
    { id: "n7", kind: "like",    fromId: "u_karim", text: "<b>Karim Belkacem</b> a réagi à ta passion photo", createdAt: hours(10), unread: false, emoji: "📷" },
  ];

  const seedQuests = [
    // Défis quotidiens (faciles)
    { id: "q1", emoji: "🎨", title: "Publie 1 post création", mood: "creation", reward: 15, passia: 2, target: 1, progress: 0, type: "publish", kind: "daily", done: false },
    { id: "q2", emoji: "💖", title: "Réagis à 3 posts", reward: 8, passia: 1, target: 3, progress: 1, type: "like", kind: "daily", done: false },
    { id: "q3", emoji: "💬", title: "Commente un post inspirant", reward: 10, passia: 1, target: 1, progress: 0, type: "comment", kind: "daily", done: false },
    { id: "q4", emoji: "🌅", title: "Connecte-toi 3 jours d'affilée", reward: 20, passia: 3, target: 3, progress: 1, type: "streak", kind: "daily", done: false },
    // Défis hebdomadaires (moyens)
    { id: "q5", emoji: "🎬", title: "Publie 1 vidéo dans le Studio", reward: 35, passia: 5, target: 1, progress: 0, type: "publish_video", kind: "weekly", done: false },
    { id: "q6", emoji: "🤝", title: "Rejoins 1 événement IRL", reward: 50, passia: 8, target: 1, progress: 0, type: "join", kind: "weekly", done: false },
    { id: "q7", emoji: "📔", title: "Publie un carnet de voyage", reward: 75, passia: 12, target: 1, progress: 0, type: "publish_vlog", kind: "weekly", done: false },
    { id: "q8", emoji: "🎙", title: "Enregistre 1 podcast (Studio audio)", reward: 40, passia: 6, target: 1, progress: 0, type: "publish_audio", kind: "weekly", done: false },
    // Défis communautaires (gros gains)
    { id: "q9", emoji: "⭐", title: "Aide 5 nouveaux membres (commentaires bienveillants)", reward: 100, passia: 15, target: 5, progress: 0, type: "help", kind: "community", done: false },
    { id: "q10", emoji: "🎉", title: "Organise 1 événement IRL", reward: 150, passia: 25, target: 1, progress: 0, type: "create_event", kind: "community", done: false },
    { id: "q11", emoji: "🏆", title: "Atteins 50 likes cumulés sur tes posts", reward: 120, passia: 20, target: 50, progress: 12, type: "likes_received", kind: "community", done: false },
    { id: "q12", emoji: "🌟", title: "Crée une passion communautaire", reward: 200, passia: 35, target: 1, progress: 0, type: "create_passion", kind: "community", done: false },
  ];

  return { users: seedUsers, posts: seedPosts, events: seedEvents, stories: seedStories, notifications: seedNotifications, quests: seedQuests };
}

