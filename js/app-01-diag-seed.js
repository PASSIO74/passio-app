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
// `_showFollowingFeed` a été SUPPRIMÉE le 2026-08-30 (ADR-010). C'était une
// bascule « voir mes suivis » jamais persistée : elle repartait à `false` à
// chaque ouverture, donc les publications des comptes suivis n'entraient pas
// dans le fil par défaut et le bouton « Suivre » n'avait aucun effet durable.
// Remplacée par `state.feedView` ("accueil" | "suivis"), persistée, et par une
// union explicite dans `renderFeed`. Ne pas la réintroduire.

// Default seed (fake users / posts / events), built once at first launch
function buildSeed() {
  const now = Date.now();
  const hours = (h) => now - h * 3600000;
  const days = (d) => now - d * 86400000;

  const seedUsers = [
    { id: "u_lea",   name: "Léa Moreau",    avatar: "#8b5cf6", passion: "musique", mood: "creation", bio: "Guitariste passionnée · Lyon", profileEmoji: "🎸" },
    { id: "u_karim", name: "Karim Belkacem", avatar: "#8b5cf6", passion: "photo", mood: "creation", bio: "Photographe de rue · Paris", profileEmoji: "📷" },
    { id: "u_nina",  name: "Nina Costa",    avatar: "#8b5cf6", passion: "voyage", mood: "irl", bio: "Nomade digitale · Partout", profileEmoji: "🌍" },
    { id: "u_theo",  name: "Théo Roussel",  avatar: "#7c3aed", passion: "cuisine", mood: "learn", bio: "Chef à domicile · Marseille", profileEmoji: "🍳" },
    { id: "u_sofia", name: "Sofia Lindqvist", avatar: "#a78bfa", passion: "litterature", mood: "learn", bio: "Lectrice insatiable · Bordeaux", profileEmoji: "📚" },
    { id: "u_yanis", name: "Yanis Perez",    avatar: "#a78bfa", passion: "tech", mood: "learn", bio: "Vibe-coder IA · Toulouse", profileEmoji: "💻" },
    { id: "u_amira", name: "Amira Haddad",   avatar: "#a78bfa", passion: "danse", mood: "creation", bio: "Danseuse hip-hop · Lille", profileEmoji: "💃" },
    { id: "u_paul",  name: "Paul Lacroix",   avatar: "#7c3aed", passion: "metier", mood: "creation", bio: "Ébéniste · Tours", profileEmoji: "🛠" },
    { id: "u_emma",  name: "Emma Wright",   avatar: "#8b5cf6", passion: "yoga", mood: "learn", bio: "Prof yoga · Biarritz", profileEmoji: "🧘" },
    { id: "u_liam",  name: "Liam Dufresne",  avatar: "#7c3aed", passion: "podcast", mood: "learn", bio: "Podcasteur indé · Montréal", profileEmoji: "🎙" },
    { id: "u_zoe",   name: "Zoé Marchand",   avatar: "#7c3aed", passion: "mode", mood: "creation", bio: "Styliste upcycling · Paris", profileEmoji: "👗" },
    { id: "u_mehdi", name: "Mehdi Saïd",    avatar: "#8b5cf6", passion: "sport", mood: "irl", bio: "Trail runner · Annecy", profileEmoji: "🏃" },
    { id: "u_inès",  name: "Inès Vidal",     avatar: "#8b5cf6", passion: "art", mood: "creation", bio: "Illustratrice freelance · Nantes", profileEmoji: "🎨" },
    { id: "u_tom",   name: "Tom Larivière",   avatar: "#a78bfa", passion: "jeuxvideo", mood: "creation", bio: "Speedrunner Zelda · Rennes", profileEmoji: "🎮" },
    { id: "u_chloé", name: "Chloé Dubois",   avatar: "#a78bfa", passion: "yoga", mood: "learn", bio: "Naturopathe · Aix-en-Provence", profileEmoji: "🌿" },
    { id: "u_oussa", name: "Oussama Farid",   avatar: "#7c3aed", passion: "musique", mood: "creation", bio: "Beatmaker studio home · Saint-Denis", profileEmoji: "🎧" },
    { id: "u_clara", name: "Clara Jensen",    avatar: "#8b5cf6", passion: "voyage", mood: "irl", bio: "Cyclo-voyageuse · Copenhague→Rome", profileEmoji: "🚴" },
    { id: "u_noa",   name: "Noa Benhaim",     avatar: "#7c3aed", passion: "cinema", mood: "learn", bio: "Monteuse indé · Paris", profileEmoji: "🎬" },
    { id: "u_raph",  name: "Raphaël Thys",    avatar: "#8b5cf6", passion: "tech", mood: "creation", bio: "Designer produit IA · Bruxelles", profileEmoji: "✨" },
    { id: "u_mila",  name: "Mila Andreani",   avatar: "#8b5cf6", passion: "danse", mood: "irl", bio: "Prof contemporaine · Ajaccio", profileEmoji: "🩰" },
    { id: "u_jona",  name: "Jonas Weber",    avatar: "#a78bfa", passion: "sport", mood: "learn", bio: "Climber + coach mental · Chamonix", profileEmoji: "🧗" },
    { id: "u_anaïs", name: "Anaïs Tremblay",  avatar: "#a78bfa", passion: "litterature", mood: "creation", bio: "Poétesse · Québec", profileEmoji: "📝" },
    { id: "u_hugo",  name: "Hugo Martelli",   avatar: "#a78bfa", passion: "cuisine", mood: "creation", bio: "Pâtissier véganisant · Nice", profileEmoji: "🧁" },
    { id: "u_rita",  name: "Rita Kamara",     avatar: "#8b5cf6", passion: "mode", mood: "irl", bio: "Fashion week organizer · Dakar↔Paris", profileEmoji: "🧵" },
    { id: "u_lou",   name: "Lou Petit",       avatar: "#7c3aed", passion: "art", mood: "creation", bio: "Céramiste · Uzès", profileEmoji: "🏺" },
    { id: "u_sami",  name: "Sami Ouedraogo",  avatar: "#7c3aed", passion: "actu", mood: "learn", bio: "Journaliste indé · Bruxelles", profileEmoji: "🗞" },
    { id: "u_val",   name: "Valentine Roux",  avatar: "#7c3aed", passion: "actu", mood: "learn", bio: "Géopolitologue · Sciences Po", profileEmoji: "🌍" },
    { id: "u_kaoru", name: "Kaoru Tanaka",    avatar: "#8b5cf6", passion: "actu", mood: "learn", bio: "Correspondant Tokyo · desk international", profileEmoji: "🗺" },
    // Quatre passions du catalogue n'avaient AUCUN persona, donc aucun contenu :
    // un compte qui les cochait tombait sur un fil vide (2026-08-28).
    { id: "u_lucie", name: "Lucie Vernet",     avatar: "#8b5cf6", passion: "jardinage", mood: "learn", bio: "Permacultrice · Angers", profileEmoji: "🌱" },
    { id: "u_nabil", name: "Nabil Cherif",     avatar: "#7c3aed", passion: "jeuxvideo", mood: "creation", bio: "Créateur de jeux indé · Rennes", profileEmoji: "🎮" },
    { id: "u_greg",  name: "Greg Aubert",      avatar: "#a78bfa", passion: "moto", mood: "irl", bio: "Roadtrips et mécanique · Clermont-Ferrand", profileEmoji: "🏍" },
    { id: "u_maya",  name: "Maya Lorenzi",     avatar: "#a78bfa", passion: "animaux", mood: "learn", bio: "Comportementaliste canin · Toulouse", profileEmoji: "🐾" },
  ];

  const seedPosts = [
    // ⚠️ Les cinq carnets de démonstration ont été retirés avec la
    // fonctionnalité (§6). Ils ne servaient qu'à peupler l'écran CDV et le
    // carrousel du Fil, tous deux supprimés.
    { id: "p1",  authorId: "u_lea",   passion: "musique", mood: "creation", type: "text", cover: "studio",
      text: "Je viens de finir la démo d'un morceau que je porte depuis 3 ans. Pas parfait, mais honnête. 🎶\n\nMontrer le processus, pas la façade, c'est tout l'esprit PASSIO pour moi.",
      createdAt: hours(2), likes: 34, liked: false, comments: [
        { id: "c1", authorId: "u_karim", text: "Ça sonne super brut, j'adore.", createdAt: hours(1), likes: 2, likedBy: [], emojis: [], replies: [] },
        { id: "c2", authorId: "u_amira", text: "Le courage de poster une démo 👏", createdAt: hours(1), likes: 6, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p2",  authorId: "u_yanis", passion: "tech", mood: "learn", type: "text", cover: "tech",
      text: "Petit tuto : comment j'ai codé mon premier agent IA ce week-end, sans framework. 3 règles que j'aurais aimé connaître avant.\n\n1. Pas de hype, juste des specs\n2. Logger chaque appel\n3. Commencer par le prompt, pas par le code",
      createdAt: hours(5), likes: 112, liked: false, comments: [] },
    { id: "p3",  authorId: "u_karim", passion: "photo", mood: "irl", type: "photo",
      text: "📍 Paris, Pont des Arts — 📅 samedi 5h30\nJe repars chercher l'heure bleue avant les livreurs et les joggeurs, et cette fois je préfère ne pas être seul. On descend jusqu'au Pont Neuf en une heure et demie, argentique ou numérique, peu importe.\nCinq personnes maximum, au-delà on se gêne sur le tablier.\nDites-moi si vous venez et avec quelle focale, j'ai un 35 mm de rab.",
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
    { id: "p9",  authorId: "u_sofia", passion: "litterature", mood: "irl", type: "text", cover: "book",
      text: "📍 Bordeaux, Jardin public près du kiosque — 📅 jeudi 19h\nJe relis « L'Usage du monde » de Nicolas Bouvier, détesté à 25 ans et devenu tout autre à 38 : j'aimerais entendre ce que d'autres en ont fait. On lit vingt minutes chacun dans son coin, puis on parle une heure.\nHuit places, j'apporte le thermos et deux exemplaires pour ceux qui ne l'ont pas.\nVous venez avec quel livre relu trop tôt ?",
      createdAt: days(2), likes: 41, liked: false, comments: [] },
    { id: "p10", authorId: "u_emma", passion: "yoga", mood: "learn", type: "text", cover: "nature",
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
    { id: "p17", authorId: "u_chloé", passion: "yoga", mood: "learn", type: "text", cover: "nature",
      text: "Ma règle des 20 minutes, celle que je répète en cabinet : le minuteur se pose avant de fermer les yeux, jamais après.\n1. Sur le dos, jambes surélevées sur un coussin, comme un savasana, téléphone hors de portée.\n2. Minuteur à 20 minutes, respiration par le nez, sans compter.\n3. Debout à la sonnerie, même sans avoir dormi.\nAu-delà je me relève plus lourde qu'avant, et rester immobile les yeux fermés compte déjà : c'est ce que les gens ont le plus de mal à croire.",
      createdAt: hours(11), likes: 298, liked: false, comments: [
        { id: "c8", authorId: "u_emma", text: "Merci pour ça. J'en avais besoin 🌿", createdAt: hours(10), likes: 12, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p18", authorId: "u_tom", passion: "jeuxvideo", mood: "all", type: "text", cover: "neon",
      text: "Manette posée, chrono éteint. J'ai relancé Ocarina juste pour traîner à Cocorico : deux heures à pêcher, à parler aux poules, à écouter la boucle de musique du village.\nJe connais ce jeu à la seconde près, 4 h 12 sur mon meilleur run, et je n'y avais pas regardé un seul coucher de soleil depuis quatre ans.\nÀ un moment j'ai laissé Link immobile sur le pont et je suis allé faire du thé.",
      createdAt: hours(14), likes: 64, liked: false, comments: [] },
    { id: "p19", authorId: "u_raph", passion: "tech", mood: "creation", type: "text", cover: "tech",
      text: "Onzième version de l'écran d'accueil ce matin. Les dix premières sont sorties en vingt minutes avec le générateur, et c'est justement le problème : même grille, même carte, même bouton en bas à droite.\nJ'ai tout imprimé en A4 pour l'étaler par terre, sur écran je ne voyais plus rien.\nIl me reste à refaire la hiérarchie du titre à la main, et à comprendre pourquoi la version 4, la plus moche, est la seule qui donne envie de cliquer.",
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
    { id: "p23", authorId: "u_hugo", passion: "cuisine", mood: "creation", type: "text", cover: "kitchen",
      text: "Tarte citron sans œufs ni beurre. J'ai mis 4 essais, mais cette version elle est propre. Si ça intéresse je mets la recette.",
      createdAt: days(2), likes: 102, liked: false, comments: [] },
    { id: "p24", authorId: "u_rita", passion: "mode", mood: "irl", type: "text", cover: "neon",
      text: "Dakar Fashion Week se prépare. Je cherche 3 bénévoles créatifs pour l'équipe com' mi-mai. Billets pris en charge si on bloque un projet ensemble.",
      createdAt: days(2), likes: 78, liked: false, comments: [] },
    { id: "p25", authorId: "u_lou", passion: "art", mood: "irl", type: "text", cover: "workshop",
      text: "Mon atelier céramique est ouvert samedi après-midi. 3 tours dispo, thé, pas de perf, juste la terre. 4 places. Uzès.",
      createdAt: days(3), likes: 54, liked: false, comments: [] },

    // ===== Actualité / Géopolitique =====
    { id: "p26", authorId: "u_sami", passion: "actu", mood: "learn", type: "text", cover: "news_europe",
      text: "Comment je lis un communiqué de sommet, en trois passes — ça marche pour n'importe quel texte négocié entre plusieurs pays.\n1. Je surligne les verbes : « réaffirme » et « prend note » n'engagent personne, « alloue » et « fixe » engagent.\n2. Je cherche la date et le montant. Sans les deux, la ligne est une intention, pas une mesure.\n3. Je compare au communiqué du sommet précédent, phrase par phrase : ce qui a disparu dit souvent plus que ce qui a été ajouté.\nJe fais ça sur deux colonnes, vingt minutes, avant d'écrire la moindre ligne d'analyse.",
      createdAt: hours(3), likes: 412, liked: false, comments: [
        { id: "ca1", authorId: "u_val", text: "Point 4 surtout, c'est le vrai tournant. On en parle en visio ?", createdAt: hours(2), likes: 6, likedBy: [], emojis: [], replies: [] },
        { id: "ca2", authorId: "u_raph", text: "Merci pour la synthèse claire, ça change du scroll anxiogène 🙏", createdAt: hours(1), likes: 18, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p27", authorId: "u_val", passion: "actu", mood: "irl", type: "text", cover: "news_asia",
      text: "📍 Paris, Sciences Po — 📅 mardi 18h30\nJ'apporte trois cartes marines de la mer de Chine et des crayons : plutôt que de chercher qui a raison, on trace ensemble les routes que chaque camp veut tenir. Ça se suit sans avoir jamais fait de géopolitique, et une carte annotée à la main vaut mieux qu'un long texte.\nDouze places, la salle est à nous jusqu'à 20h30.\nRépondez-moi avant lundi soir, je photocopie le bon nombre de fonds de carte.",
      createdAt: hours(6), likes: 289, liked: false, comments: [
        { id: "ca3", authorId: "u_sami", text: "Hâte de lire le fil. Merci de remettre l'économie au centre.", createdAt: hours(5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p28", authorId: "u_kaoru", passion: "actu", mood: "irl", type: "text", cover: "news_asia",
      text: "📍 Tokyo, Shibuya, sortie Hachikō — 📅 dimanche 10h\nJe refais ma tournée de terrain, celle que je fais après chaque scrutin local : deux permanences de quartier, un marché, et on écoute les habitants plutôt que les états-majors. J'ai surtout envie d'entendre les 18-25 ans, et je traduis au fur et à mesure pour ceux qui ne parlent pas japonais.\nSix places, on marche trois heures et on s'arrête déjeuner vers 13h.\nQui est à Tokyo dimanche ?",
      createdAt: hours(10), likes: 174, liked: false, comments: [] },
    { id: "p29", authorId: "u_sami", passion: "actu", mood: "learn", type: "text", cover: "climate",
      text: "Règle que j'applique à toute dépêche énergie : capacité installée n'est pas production.\nUn parc compte pour sa puissance maximale, pas pour ce qu'il livre un soir sans vent. Alors dès qu'une annonce me tend un pourcentage, je vais chercher dans le même document la ligne de production réelle, et je pose les deux nombres côte à côte dans mon papier.\nDepuis, je réécris un titre sur trois avant de l'envoyer. Dix minutes de relecture depuis ma cuisine à Bruxelles, et j'évite d'annoncer une bascule qui n'a pas eu lieu.",
      createdAt: hours(14), likes: 356, liked: false, comments: [
        { id: "ca4", authorId: "u_emma", text: "Enfin une news qui fait pas déprimer. Merci 🌿", createdAt: hours(13), likes: 22, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p30", authorId: "u_val", passion: "actu", mood: "irl", type: "text", cover: "tech",
      text: "📍 Paris 5e, arrière-salle d'un café de la rue Saint-Jacques — 📅 jeudi 19h\nAtelier cartes : chacun apporte une carte qui l'intrigue, on la retourne dans tous les sens et on cherche ce qu'elle choisit de ne pas montrer. J'apporte trois atlas, du calque et des feutres, vous apportez vos questions bêtes, ce sont les meilleures.\nHuit chaises autour de la table, pas une de plus.\nLaissez-moi un mot en commentaire si vous venez, je réserve le fond de la salle.",
      createdAt: days(1), likes: 223, liked: false, comments: [
        { id: "ca5", authorId: "u_yanis", text: "Post à épingler. Beaucoup de startups vont dormir dessus et se réveiller à l'amende.", createdAt: hours(20), likes: 19, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p31", authorId: "u_kaoru", passion: "actu", mood: "creation", type: "text", cover: "news_africa",
      text: "Troisième version de ma carte du corridor Dakar-Abidjan, punaisée au mur du bureau.\nJ'ai repris tout le tracé au feutre parce que le fond de carte imprimé en A3 coupe la frontière au mauvais endroit, et j'y ai laissé deux soirées à recaler les distances à la règle. Il me manque encore six entretiens de transporteurs, que je n'obtiendrai qu'en appelant vers 4 h du matin depuis Tokyo, décalage oblige.\nSi la version 4 tient sur une seule page, elle part au desk.",
      createdAt: days(2), likes: 141, liked: false, comments: [] },

    // ==== MUSIQUE, 3 posts ====
    { id: "p40", authorId: "u_lea", passion: "musique", mood: "learn", type: "text", cover: "stage",
      text: "Première fois sur scène cette semaine. 40 personnes dans la salle, ça tremblait dans les jambes. J'ai raté la deuxième intro, rigolé, repris. Personne n'a tiqué.\n\nLeçon : le public ne veut pas un·e robot, il veut quelqu'un d'incarné.",
      createdAt: hours(9), likes: 156, liked: false, comments: [
        { id: "c40a", authorId: "u_oussa", text: "On passe tous par là 🔥", createdAt: hours(7), likes: 3, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p41", authorId: "u_oussa", passion: "musique", mood: "learn", type: "text", cover: "studio",
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
    { id: "p45", authorId: "u_karim", passion: "photo", mood: "irl", type: "photo", cover: "sunrise",
      text: "📍 Paris, quai de la Tournelle côté Notre-Dame — 📅 samedi 6h15\nOn se retrouve avant le lever du soleil pour le brouillard de Seine : il tient vingt minutes, certains matins il ne vient pas du tout, on prend le risque ensemble. Je viens en 35 mm, venez avec ce que vous avez, téléphone compris.\nSix personnes maximum : au-delà, on se marche dessus et on ne cadre plus rien.\nDites-moi avant vendredi soir si vous en êtes, que je sache qui j'attends dans le froid.",
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
    { id: "p48", authorId: "u_nina", passion: "voyage", mood: "learn", type: "text", cover: "sunrise",
      text: "Ma méthode pour trouver la vraie cantine d'un quartier, revérifiée à Porto la semaine dernière :\n1. Repère la rue où les camionnettes d'artisans se garent mal entre midi et 13h, jamais la rue piétonne.\n2. Entre là où le menu est écrit à la craie et n'existe qu'en une seule langue.\n3. Prends le plat du jour sans discuter : s'il n'y en a qu'un, c'est le bon.\nÇa m'a coûté 7 € et deux malentendus polis. Même protocole à Naples et à Sète, il tient.",
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
    { id: "p54", authorId: "u_mehdi", passion: "sport", mood: "learn", type: "text", cover: "sunrise",
      text: "Repos actif aujourd'hui : rando 12 km avec mon chien. Le corps récupère, la tête aussi. Les semaines sans jour off sont les semaines où je me blesse.\n\nRetenez ça, surtout les débutants.",
      createdAt: days(2), likes: 89, liked: false, comments: [] },

    // ==== LITTÉRATURE, 2 posts ====
    { id: "p55", authorId: "u_sofia", passion: "litterature", mood: "irl", type: "text", cover: "book",
      text: "📍 Bordeaux, jardin public côté rue d'Aviau — 📅 dimanche 15h\nOn lit « Giovanni's Room » de Baldwin chacun de son côté d'ici là, puis on vient en parler une heure sur un banc, sans fiche de lecture et sans personne qui a raison. C'est court, deux soirées suffisent.\nSix personnes sur le banc, six exemplaires d'occasion que je peux prêter.\nDites-moi avant jeudi s'il vous en faut un, je le dépose à la librairie de mon quartier.",
      createdAt: hours(12), likes: 178, liked: false, comments: [
        { id: "c55a", authorId: "u_anaïs", text: "Un des livres qui m'a formée. Belle lecture 📚", createdAt: hours(10) },
      ]},
    { id: "p56", authorId: "u_anaïs", passion: "litterature", mood: "creation", type: "text", cover: "book",
      text: "Premier jet du recueil terminé. 64 poèmes, 4 ans d'archives. Maintenant vient le vrai travail : couper la moitié.\n\nÉcrire c'est ajouter. Publier c'est soustraire.",
      createdAt: days(1), likes: 103, liked: false, comments: [] },

    // ==== TECH, 3 posts ====
    { id: "p57", authorId: "u_yanis", passion: "tech", mood: "all", type: "text", cover: "neon",
      text: "Samedi après-midi, aucune deadline. J'ai passé trois heures à changer la police de mon terminal, puis à revenir exactement à celle du départ.\nJ'ai aussi ajouté un raccourci pour ouvrir mes notes, utilisé deux fois avant de l'oublier. Zéro ticket fermé, zéro ligne utile.\nDehors il faisait 31 °C, je n'ai pas ouvert les volets.",
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
    { id: "p63", authorId: "u_mila", passion: "danse", mood: "irl", type: "text", cover: "stage",
      text: "📍 Ajaccio, gymnase des Cannes, parquet du fond — 📅 mercredi 18h30\nCours ouvert de contemporain pour finir la saison : quarante minutes au sol, puis on monte le solo court que mes ados ont dansé devant leurs parents. Aucun niveau demandé, chaussettes ou pieds nus, ça suffit.\nDouze places, j'ai compté les tapis.\nÉcrivez-moi avant lundi, je préviens tout le monde si la salle change.",
      createdAt: days(1), likes: 267, liked: false, comments: [] },

    // ==== MODE, 2 posts ====
    { id: "p64", authorId: "u_zoe", passion: "mode", mood: "creation", type: "text", cover: "studio",
      text: "Collection upcycling printemps finalisée. 22 pièces, 100% tissus récupérés de fins de série. Les bouts d'usine deviennent des trenchs et des jupes plissées.\n\nPop-up ce week-end à Paris 11e.",
      createdAt: hours(17), likes: 234, liked: false, comments: [] },
    { id: "p65", authorId: "u_rita", passion: "mode", mood: "irl", type: "text", cover: "neon",
      text: "Fashion Week Dakar J-3. On accueille 14 créateur·ice·s ouest-africain·es cette année. L'énergie au showroom est folle, j'ai la chair de poule en vous écrivant.\n\nStream gratuit sur inscription.",
      createdAt: days(1), likes: 198, liked: false, comments: [] },

    // ==== YOGA / BIEN-ÊTRE, 2 posts ====
    { id: "p66", authorId: "u_emma", passion: "yoga", mood: "irl", type: "text", cover: "nature",
      text: "📍 Biarritz, plage de la Côte des Basques — 📅 samedi 7h30\n25 minutes de pratique lente face à l'océan, debout puis au sol : pas besoin de tapis, une serviette suffit sur le sable tassé du bas de plage. Je limite à 8 personnes pour reprendre les appuis un par un, et il fait rarement plus de 14 degrés à cette heure-là, prévoyez une couche à enlever au bout de dix minutes.\nVous venez ? Dites-moi votre prénom et si vous avez déjà pratiqué dehors, je cale le rythme dessus.",
      createdAt: hours(7), likes: 145, liked: false, comments: [] },
    { id: "p67", authorId: "u_chloé", passion: "yoga", mood: "learn", type: "text", cover: "nature",
      text: "Naturopathie, 3 conseils sommeil qui marchent chez 90% de mes patient·es :\n\n1. Pas d'écran 45 min avant de dormir (le seuil, pas 1h30)\n2. Chambre à 17-18 °C max\n3. Petit-déj salé, pas sucré\n\nLe sommeil se prépare le matin.",
      createdAt: days(1), likes: 176, liked: false, comments: [] },

    // ==== JEUX, 2 posts ====
    { id: "p68", authorId: "u_tom", passion: "jeuxvideo", mood: "creation", type: "text", cover: "dark_matter",
      text: "Nouveau record personnel sur Ocarina of Time Any% : 17:41. 3 mois d'optim sur le skip du Deku Tree.\n\nQuand je dis à mes potes non-gamers que je m'entraîne à battre 15 secondes, ils me regardent comme si j'étais fou. Ils ont raison. C'est le principe.",
      createdAt: hours(19), likes: 163, liked: false, comments: [] },
    { id: "p69", authorId: "u_tom", passion: "jeuxvideo", mood: "irl", type: "text", cover: "neon",
      text: "Soirée rétro ce vendredi à Rennes. On branche un CRT, des manettes N64, et on joue à Goldeneye jusqu'à 3h. BYOB, pizza offerte, 8 places.\n\nDM pour l'adresse.",
      createdAt: days(2), likes: 72, liked: false, comments: [] },

    // ==== CINÉMA, 2 posts ====
    { id: "p70", authorId: "u_noa", passion: "cinema", mood: "learn", type: "text", cover: "stage",
      text: "Montage, la règle que je donne à tou·tes mes stagiaires : si tu hésites à couper, coupe. Le spectateur complétera. Il le fait toujours.\n\nLa confiance dans le·la spectateur·ice c'est 80% du boulot.",
      createdAt: hours(21), likes: 204, liked: false, comments: [] },
    { id: "p71", authorId: "u_noa", passion: "cinema", mood: "learn", type: "text", cover: "horizon",
      text: "La règle que je vole à « Paris, Texas » et que j'applique depuis, je l'appelle la coupe retardée : quand un visage porte l'émotion, je coupe trois secondes après le moment où ma main veut couper.\nPour l'essayer : posez votre point de coupe normalement, ajoutez trois secondes, revoyez la séquence le lendemain sans le son. Si le plan tient sans dialogue, gardez la version longue ; s'il s'affaisse, c'est que l'émotion était dans le texte et pas dans le visage, et là il faut couper plus tôt qu'avant.\nSur mon dernier court, ça a fait passer un plan de 12 à 45 secondes, et c'est seulement là que la scène a tenu.",
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
    { id: "p80", authorId: "u_val", passion: "actu", mood: "irl", type: "text", cover: "news_europe",
      text: "📍 Paris, café de la rue de Grenelle (7e) — 📅 mardi 19h\nOn lit ensemble à voix haute une vingtaine de pages d'un texte européen sur l'énergie, et je montre à quoi je repère ce qui engage vraiment : un calendrier, une ligne de financement, un organisme nommé. Douze places autour de deux tables, j'apporte les copies papier et un surligneur par personne, chacun paie sa consommation. Aucun prérequis, je fais exactement ça avec mes étudiants de première année depuis trois ans.\nQui est partant, et sur quel type de texte vous bloquez le plus ?",
      createdAt: hours(3), likes: 267, liked: false, comments: [
        { id: "c80a", authorId: "u_sami", text: "Tu couvres la session plénière jeudi ?", createdAt: hours(2) },
      ]},
    { id: "p81", authorId: "u_sami", passion: "actu", mood: "learn", type: "text", cover: "news",
      text: "Trois étapes avant de partager une décision de justice, celles qui m'ont évité deux boulettes cette année.\n1. Retrouver le numéro de rôle et la juridiction exacte : sans ça, on relaie un résumé de résumé.\n2. Lire le dispositif, la partie tout à la fin qui dit ce qui est décidé — le reste du document, c'est du raisonnement, et on lui fait dire n'importe quoi.\n3. Appeler l'avocat de la partie qui perd avant celui qui gagne : c'est lui qui vous dira s'il y a un recours, donc si la décision est définitive ou pas.\nÇa me prend quarante minutes, et publier quarante minutes plus tard mais juste reste le meilleur échange que je connaisse.",
      createdAt: hours(6), likes: 189, liked: false, comments: [] },
    { id: "p82", authorId: "u_kaoru", passion: "actu", mood: "all", type: "text", cover: "news_asia",
      text: "Dernier train pour Nakano, 23h48, wagon à moitié vide un mercredi. Il y a deux ans, à cette heure-là, j'étais encore au bureau.\nEn face de moi un type en costume dormait la bouche ouverte, son téléphone à plat sur les genoux. Je suis descendu une station trop tôt pour rentrer à pied : 19 degrés, et l'odeur de linge chaud des laveries automatiques tous les cinquante mètres.",
      createdAt: hours(12), likes: 321, liked: false, comments: [
        { id: "c82a", authorId: "u_val", text: "Très bon angle. Ça rejoint les chiffres coréens.", createdAt: hours(10) },
      ]},
    { id: "p83", authorId: "u_val", passion: "actu", mood: "creation", type: "text", cover: "climate",
      text: "Version 4 de la frise que je fabrique pour mon cours de rentrée : trente ans de négociations climat sur un rouleau de kraft de 3 mètres, une couleur par bloc régional.\nLes versions 1 à 3 tenaient en A3 et personne au fond de l'amphi ne lisait rien — d'où le kraft, qui se scotche au tableau et se range dans un tube. Il me reste à coller les vignettes des trois dernières années et à trouver comment marquer les engagements annoncés puis abandonnés sans rendre la ligne illisible.\nJ'hésite entre un pointillé et une vignette grise ; je tranche ce week-end, sinon je n'aurai jamais fini avant la reprise.",
      createdAt: days(1), likes: 445, liked: false, comments: [
        { id: "c83a", authorId: "u_chloé", text: "Merci pour le résumé sans catastrophisme.", createdAt: hours(22) },
      ]},
    { id: "p84", authorId: "u_kaoru", passion: "actu", mood: "irl", type: "text", cover: "news_asia",
      text: "📍 Tokyo, sortie nord de la gare de Koenji — 📅 dimanche 15h\nDeux heures de marche dans la rue commerçante et les ruelles derrière, à l'allure où je fais mes tournées : je m'arrête là où je m'arrête pour travailler, chez le poissonnier, au petit temple, devant le tableau d'affichage du quartier, et j'explique pourquoi. Huit personnes maximum, on parle français ou japonais, chacun paie son thé à la fin.\nVous seriez là ? Dites-moi si vous préférez le dimanche ou un soir de semaine, je peux décaler.",
      createdAt: days(1), likes: 278, liked: false, comments: [] },
    { id: "p85", authorId: "u_sami", passion: "actu", mood: "irl", type: "text", cover: "news_africa",
      text: "📍 Bruxelles, arrière-salle d'un café de Saint-Gilles — 📅 jeudi 20h\nJe passe le montage son de mon reportage sur les élections au Sénégal, quarante minutes, avant de le boucler vendredi : je veux entendre où ça décroche pour quelqu'un qui ne suit pas le dossier. Dix chaises, une paire d'enceintes empruntées, j'apporte le câble jack et de quoi grignoter.\nVous seriez là ? Dites-moi surtout ce qu'il vous faut comme contexte de départ pour ne pas être perdu à la cinquième minute.",
      createdAt: days(2), likes: 198, liked: false, comments: [] },
    { id: "p86", authorId: "u_val", passion: "actu", mood: "irl", type: "text", cover: "news_europe",
      text: "📍 Paris 11e, café associatif de la rue Saint-Maur — 📅 jeudi 19h\nAtelier lecture de chiffres : chacun apporte deux tickets de caisse, un d'il y a un an et un de cette semaine, on aligne les mêmes produits et je montre comment on en tire une courbe qui tient debout.\n12 places, la grande table du fond, entrée libre et sans jargon.\nDites-moi si vous venez, je réserve la table en fonction.",
      createdAt: days(2), likes: 156, liked: false, comments: [] },
    { id: "p87", authorId: "u_kaoru", passion: "actu", mood: "irl", type: "text", cover: "news",
      text: "📍 Tokyo, Shibuya, sortie ouest de la gare — 📅 samedi 10h\nJe refais ma tournée des kiosques et des halls de rédaction du quartier : trois arrêts, on lit les unes du matin et je raconte comment une dépêche diplomatique finit en titre de journal.\nHuit personnes maximum, deux heures de marche, en français et en japonais.\nRépondez-moi avant vendredi soir, je fixe le point de rendez-vous exact.",
      createdAt: days(3), likes: 223, liked: false, comments: [] },

    { id: "p88", authorId: "u_val", passion: "actu", mood: "learn", type: "text", cover: "news_europe",
      text: "Ma méthode pour lire un accord commercial sans se faire avoir par le résumé de presse.\n1. Je cherche la date d'entrée en vigueur, pas la date de signature : entre les deux, il y a souvent des années.\n2. Je vais directement aux annexes, c'est là que dorment les exceptions sectorielles, jamais dans le communiqué.\n3. Je note qui ratifie : un texte signé par des gouvernements mais renvoyé à des parlements n'a pas la même solidité.\nTrois quarts d'heure de lecture, et je me sens nettement moins bête quand j'en parle le soir.",
      createdAt: hours(12), likes: 567, liked: false, comments: [
        { id: "ca88_1", authorId: "u_sami", text: "Les intérêts économiques finissent toujours par parler", createdAt: hours(10), likes: 34, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "p89", authorId: "u_sami", passion: "actu", mood: "creation", type: "text", cover: "climate",
      text: "Troisième réécriture de mon enquête sur les marchés de quartier bruxellois : je suis passé de 14 000 signes à 9 200, et le texte respire enfin.\nLe chapitre deux coince : deux témoignages se contredisent sur les dates et je n'ai encore aucun document pour trancher. Je retourne aux archives communales mardi matin.\nAprès ça, il me reste la relecture juridique et les photos à recadrer.",
      createdAt: hours(4), likes: 892, liked: false, comments: [
        { id: "ca89_1", authorId: "u_kaoru", text: "Les données sont claires. La question est politique maintenant.", createdAt: hours(2), likes: 45, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "p90", authorId: "u_kaoru", passion: "actu", mood: "creation", type: "text", cover: "news_asia",
      text: "Quatrième version de mon reportage sonore sur les quartiers de Tokyo : cette fois j'ai enregistré la même rue à 6h puis à 19h, pour entendre la bascule de rythme.\nLe micro cravate sature dès qu'un train passe au-dessus, j'ai perdu deux prises hier soir près de la ligne Yamanote. Je vais tenter une bonnette plus épaisse et enregistrer un mètre plus bas.\nIl me reste huit rues à faire, et tout le montage.",
      createdAt: hours(18), likes: 421, liked: false, comments: [] },

    { id: "p91", authorId: "u_val", passion: "actu", mood: "all", type: "text", cover: "news_africa",
      text: "Visio de 6h du matin avec une chercheuse de Nairobi, mon café déjà froid et son bureau en plein soleil.\nÇa a coupé deux fois, réseau, et on a fini par se parler en marchant chacune de notre côté. J'ai noté trois pages, dont une bonne moitié illisible.\nJ'aime bien ces heures-là, quand la journée n'a pas encore décidé de ce qu'elle serait.",
      createdAt: days(1), likes: 312, liked: false, comments: [
        { id: "ca91_1", authorId: "u_sami", text: "Signal fort. L'Afrique n'attend plus de permission.", createdAt: hours(22), likes: 67, likedBy: [], emojis: [], replies: [] },
      ]},

    // ==== ACTUALITÉ par PASSION ====
    { id: "pac_music", authorId: "u_lea", passion: "musique", mood: "irl", type: "text", cover: "studio",
      text: "📍 Lyon, bar de la Croix-Rousse — 📅 vendredi 20h30\nScène ouverte acoustique : deux morceaux par personne, une seule guitare branchée pour tout le monde, pas de sono à démêler. Je passe en troisième et je joue enfin le morceau que je répète depuis six semaines.\nHuit passages possibles, on note l'ordre en arrivant.\nDites-moi si vous montez jouer ou si vous venez juste écouter, ça m'aide à caler la fin de soirée.",
      createdAt: hours(8), likes: 289, liked: false, comments: [
        { id: "cac_music1", authorId: "u_oussa", text: "Enfin une bonne nouvelle pour les artistes", createdAt: hours(6), likes: 23, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_tech", authorId: "u_yanis", passion: "tech", mood: "learn", type: "text", cover: "neon",
      text: "La règle que je m'applique depuis six mois sur tous mes projets : un message, un livrable.\nAvant, j'empilais le contexte, les contraintes et trois demandes dans le même prompt, et je passais la soirée à démêler une réponse fourre-tout. Maintenant je découpe : un message pour le plan, que je corrige ; un message pour le code, que je teste ; un message pour les cas limites.\nC'est plus lent à écrire et deux fois plus rapide à finir. Essayez sur votre prochaine fonction, la différence se voit dès le premier aller-retour.",
      createdAt: hours(2), likes: 1203, liked: false, comments: [
        { id: "cac_tech1", authorId: "u_raph", text: "C'est un game-changer pour la prod", createdAt: hours(1), likes: 156, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_cuisine", authorId: "u_theo", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen",
      text: "📍 Marseille, marché des Capucins — 📅 samedi 9h\nOn fait les courses ensemble, puis on cuisine dans l’atelier que je loue deux rues plus loin : une entrée, un plat, rien de compliqué. J’apporte les planches et les couteaux, chacun met 8 € dans le panier de courses.\nSix places, c’est ce que le plan de travail permet. Dites-moi si vous venez, j’adapte les quantités.",
      createdAt: days(1), likes: 445, liked: false, comments: [] },

    { id: "pac_danse", authorId: "u_amira", passion: "danse", mood: "irl", type: "text", cover: "stage",
      text: "📍 Lille, esplanade du Champ de Mars — 📅 dimanche 15h\nCypher ouvert : une enceinte, un lino de 3 mètres que je déroule, et on tourne en cercle. Débutants bienvenus, personne n’est obligé de passer au centre, on peut rester à taper la mesure toute la session.\nDix personnes maximum, au-delà le lino ne suit plus. Répondez-moi si vous en êtes, je compte les paires de baskets.",
      createdAt: hours(14), likes: 267, liked: false, comments: [] },

    { id: "pac_metier", authorId: "u_paul", passion: "metier", mood: "learn", type: "text", cover: "workshop",
      text: "La règle du trait unique : sur une pièce de bois, un seul repère fait foi, et il se trace à la pointe à tracer, jamais au crayon.\nUne mine fait 0,5 mm de large, donc vous mentez de 0,5 mm à chaque report ; sur un tiroir à quatre côtés ça devient 2 mm de jeu et le tiroir coince en été. La pointe, elle, entaille la fibre : la lame du ciseau vient se caler dans l’entaille toute seule.\nJe trace, je marque d’une croix le côté à garder, et je coupe toujours du côté du déchet. Ça s’apprend en une après-midi et ça ne se perd plus.",
      createdAt: hours(20), likes: 523, liked: false, comments: [
        { id: "cac_metier1", authorId: "u_paul", text: "Le bois revient! C'est un renaissance", createdAt: hours(18), likes: 89, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_podcast", authorId: "u_liam", passion: "podcast", mood: "learn", type: "text", cover: "studio",
      text: "Trois choses qui ont plus fait pour mon son que n’importe quel micro à 400 $ :\n1. Enregistrer dans la garde-robe, portes ouvertes — les manteaux mangent la réverbération mieux que la mousse acoustique.\n2. Micro à une largeur de poing de la bouche et légèrement de côté : les plosives disparaissent, sans acheter de filtre anti-pop.\n3. Compresseur à 3:1 au montage, jamais au-delà, sinon on entend le souffle de la pièce remonter entre les phrases.\nTout ça se refait cet après-midi avec le matériel que vous avez déjà.",
      createdAt: hours(6), likes: 389, liked: false, comments: [] },

    { id: "pac_mode", authorId: "u_zoe", passion: "mode", mood: "creation", type: "text", cover: "neon",
      text: "Troisième version de la veste taillée dans deux bâches de marché récupérées porte de Vanves. J’ai enfin réglé les épaules en remontant l’emmanchure de 2 cm — la V2 tombait comme un sac postal.\nReste les boutonnières et la doublure, et là ça coince : la bâche est trop raide pour ma machine, je suis passée en aiguille cuir 90 et je couds au ralenti, sinon le point saute une fois sur trois.\nJ’aimerais l’avoir finie avant dimanche.",
      createdAt: days(2), likes: 678, liked: false, comments: [
        { id: "cac_mode1", authorId: "u_zoe", text: "C'est la révolution qu'on attendait", createdAt: days(1), likes: 134, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_art", authorId: "u_inès", passion: "art", mood: "creation", type: "text", cover: "dark_matter",
      text: "Planche 6 sur 12 de la série que je dessine sur les halles de Talensac, et c’est la première où la lumière tient debout.\nJ’ai lâché l’aquarelle pour de l’encre diluée à trois valeurs seulement : au-delà, les étals deviennent illisibles à petite échelle. Il me reste les six planches du fond de marché et tout le lettrage, que je repousse depuis trois semaines faute d’avoir trouvé la bonne plume.\nObjectif : tout scanner avant la fin du mois.",
      createdAt: hours(10), likes: 412, liked: false, comments: [] },

    { id: "pac_photo", authorId: "u_karim", passion: "photo", mood: "irl", type: "text", cover: "street",
      text: "📍 Paris, sortie du métro Belleville — 📅 samedi 17h\nDeux heures de marche jusqu’à Ménilmontant, avec une seule focale par personne : on ne change pas d’objectif de toute la sortie. Ça force à bouger les pieds au lieu de zoomer, et la lumière de 18h dans les rues en pente fait le reste.\nHuit places, téléphone accepté. Dites-moi si vous venez, on part à l’heure pile.",
      createdAt: hours(16), likes: 334, liked: false, comments: [] },

    { id: "pac_voyage", authorId: "u_sofia", passion: "voyage", mood: "all", type: "text", cover: "horizon",
      text: "Deux heures et demie de train Bordeaux-Toulouse hier, avec un recueil de récits de voyage dans les Balkans trouvé d’occasion à 4 €. J’ai passé plus de temps à regarder défiler les vignes et les champs de maïs qu’à lire, et je me suis endormie page 60.\nLa tasse de café a laissé un rond sur la couverture. Je la garde comme ça.",
      createdAt: days(1), likes: 556, liked: false, comments: [
        { id: "cac_voyage1", authorId: "u_sofia", text: "C'est maintenant qu'il faut explorer!", createdAt: hours(22), likes: 98, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_litterature", authorId: "u_anaïs", passion: "litterature", mood: "irl", type: "text", cover: "dark_matter",
      text: "📍 Québec, café de la rue Saint-Jean — 📅 mercredi 19h\nOn lit à voix haute, trois minutes chacun. Tu apportes un poème : le tien, ou celui d'une autre que tu veux faire entendre.\nDouze chaises, pas une de plus, et on s'arrête à 21h parce que le café ferme.\nTu viens lire, ou juste écouter ?",
      createdAt: hours(12), likes: 467, liked: false, comments: [] },

    { id: "pac_cinema", authorId: "u_noa", passion: "cinema", mood: "learn", type: "text", cover: "stage",
      text: "La règle que j'applique à chaque coupe : couper sur le début du geste, jamais après.\nQuand un personnage se lève, tu poses la coupe dans les trois ou quatre images où l'épaule part, pas une fois qu'il est debout — l'œil suit le mouvement et ne voit pas le raccord.\nJe l'ai revérifiée hier sur une séquence de dialogue : même plan, coupe deux secondes plus tard, on sent le montage tout de suite.\nÇa tient même sur des rushes moches, à essayer sur ton prochain montage.",
      createdAt: hours(9), likes: 523, liked: false, comments: [
        { id: "cac_cinema1", authorId: "u_noa", text: "Le grand écran a encore de beaux jours", createdAt: hours(7), likes: 76, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_sport", authorId: "u_jona", passion: "sport", mood: "irl", type: "text", cover: "nature",
      text: "📍 Chamonix, blocs des Gaillands — 📅 samedi 9h\nDeux heures de bloc tranquille, et une minute de respiration avant chaque essai engagé : trois temps d'inspiration, six d'expiration, les yeux posés sur la prise.\nSix personnes maximum, j'amène deux crash pads, débutants bienvenus.\nDis-moi si tu viens, je cale l'ordre des départs selon le nombre.",
      createdAt: hours(11), likes: 612, liked: false, comments: [] },

    { id: "pac_yoga", authorId: "u_emma", passion: "yoga", mood: "irl", type: "text", cover: "nature",
      text: "📍 Biarritz, plage de la Côte des Basques — 📅 dimanche 8h\nQuarante-cinq minutes, en douceur, face à la mer avant que la marée remonte. Pas besoin de tapis : une serviette suffit, le sable pardonne plus qu'un plancher de studio.\nDix places, et je préviens la veille s'il pleut vraiment.\nQui est partant pour dimanche ?",
      createdAt: days(1), likes: 778, liked: false, comments: [
        { id: "cac_yoga1", authorId: "u_emma", text: "Justice enfin. C'est la médecine du corps ET de l'esprit.", createdAt: hours(20), likes: 145, likedBy: [], emojis: [], replies: [] },
      ]},

    { id: "pac_jeux", authorId: "u_tom", passion: "jeuxvideo", mood: "irl", type: "text", cover: "neon",
      text: "📍 Rennes, bar à jeux de la rue Saint-Michel — 📅 jeudi 20h\nJe branche la GameCube et je fais tourner ma route d'Ocarina of Time en commentant à voix haute : où je perds mes secondes, pourquoi je garde ce détour complètement idiot.\nHuit places autour de l'écran, on tient jusqu'à 23h.\nSi tu as ta propre route sur un autre jeu, apporte-la, on compare les segments — dis-moi avant mercredi que je réserve la table.",
      createdAt: hours(15), likes: 634, liked: false, comments: [] },

    { id: "pac_bienetre", authorId: "u_chloé", passion: "yoga", mood: "learn", type: "text", cover: "nature",
      text: "Le séchage de la mélisse, tout se joue en trois étapes :\n1. Cueillir le matin, une fois la rosée partie, jamais au lendemain d'une pluie.\n2. Faire des bouquets de dix tiges, tête en bas, dans une pièce sombre et aérée — le soleil mange l'odeur en deux jours.\n3. Mettre en bocal seulement quand la tige casse net entre les doigts ; si elle plie encore, c'est trop tôt et ça moisit au fond.\nChez moi, à Aix, ça prend huit à dix jours en septembre.",
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
    { id: "pm3", authorId: "u_oussa", passion: "musique", mood: "creation", type: "audio", cover: "studio",
      text: "Troisième version du beat sur le sample de Coltrane, et je bloque au même endroit depuis deux nuits.\nPour qu'il tienne avec la basse je l'ai descendu d'un demi-ton, et l'étirement a réveillé le souffle du vinyle : ça grésille dès que je pousse le volume.\nIl me reste la caisse claire, encore en preset d'usine, et à trancher sur les huit mesures à vide du début, que je trouve trop longues.\nHier, session de 1h à 3h du matin au casque : ma voisine du dessus a été patiente.",
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
    { id: "pp3", authorId: "u_karim", passion: "photo", mood: "creation", type: "photo", cover: "horizon",
      text: "Dixième matin sur la série des marchés à l'ouverture — Belleville, 7h10, avant que les tréteaux soient montés.\nOnze images tirées sur les quarante que j'ai retenues, et je coince au labo : les cageots de tomates virent orange au tirage et bouffent tout le gris de la bâche.\nIl me reste à retirer la série en papier mat, et à décrocher l'image qui manque, celle du type qui déplie sa bâche seul contre le vent — ratée trois fois, toujours en retard d'une seconde.\nJ'y retourne samedi, même heure.",
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
    { id: "pv1", authorId: "u_nina", passion: "voyage", mood: "learn", type: "text", cover: "horizon",
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
    { id: "pv4", authorId: "u_clara", passion: "voyage", mood: "learn", type: "text", cover: "horizon",
      text: "La règle des trois semaines, apprise entre Copenhague et Hambourg, à raison de soixante kilomètres par jour.\n1. Les dix premiers jours, ne juge rien : le sommeil en vrac et la langue qu'on ne parle pas faussent tout.\n2. À trois semaines, écris sur une page ce qui te manque vraiment — chez moi, c'était une table pour écrire le soir, pas un toit.\n3. Si au bout d'un mois la liste n'a pas bougé d'une ligne, rentre : ce n'est pas un échec, c'est un renseignement sur toi que tu gardes.",
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
    { id: "p_ev_yoga", authorId: "u_chloé", passion: "yoga", mood: "irl", type: "text", cover: "horizon", eventId: "e6",
      text: "📍 Biarritz, plage de la Côte des Basques — 📅 dimanche 7h\nYoga sur le sable, avec le bruit des vagues à la place de la playlist. La première fois j'ai trouvé ça too much ; la deuxième, j'ai compris.\nIl reste des tapis, et personne ne regarde personne. Prends une serviette épaisse, le sable est humide à cette heure-là.",
      createdAt: hours(30), likes: 208, liked: false, comments: [] },
    { id: "p_ev_ceramique", authorId: "u_inès", passion: "art", mood: "irl", type: "photo", cover: "workshop", eventId: "e7",
      text: "📍 Uzès, Atelier du Potier — 📅 samedi 14h\nMon premier bol au tour est sorti tordu, épais, et je l'utilise tous les matins depuis.\nL'atelier de Lou est le seul endroit où j'ai vu quelqu'un dire « c'est raté » avec un vrai sourire. Quatre tours, quatre places, rien à apporter.",
      createdAt: hours(46), likes: 176, liked: false, comments: [
        { id: "cev3a", authorId: "u_lou", text: "Le premier bol tordu est toujours le bon 🏺", createdAt: hours(44), likes: 21, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev_trail", authorId: "u_jona", passion: "sport", mood: "irl", type: "text", cover: "trail", eventId: "e30",
      text: "18 km, 900 D+, départ 8h au bord du lac. On part groupés et on se retrouve au café, chacun à son rythme.\n\nRègle de la sortie : personne ne finit seul.",
      createdAt: hours(14), likes: 143, liked: false, comments: [] },
    { id: "p_ev_ia", authorId: "u_raph", passion: "tech", mood: "irl", type: "text", cover: "tech", eventId: "e5",
      text: "📍 Toulouse, Numa — 📅 mercredi 14h\nAtelier « IA pour non-techs » : deux heures, zéro ligne de code, et chacun repart avec un outil qui lui fait gagner une heure par semaine.\nYanis prend le temps de répondre à tout, même aux questions qu'on n'ose pas poser. Il reste 5 places.",
      createdAt: hours(26), likes: 231, liked: false, comments: [
        { id: "cev4a", authorId: "u_yanis", text: "Il reste 4 places, et on garde un créneau pour les questions à la fin.", createdAt: hours(24), likes: 15, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev_danse", authorId: "u_amira", passion: "danse", mood: "irl", type: "photo", cover: "dance", eventId: "e36",
      text: "📍 Ajaccio, Studio Mila — 📅 vendredi 18h\nJam contemporaine : pas de chorégraphie, pas de niveau, une salle et deux heures.\nCe qui se passe entre la vingtième et la quarantième minute, quand tout le monde arrête de se regarder, c'est ce que je viens chercher. Viens même sans jamais avoir dansé.",
      createdAt: hours(38), likes: 154, liked: false, comments: [] },
    { id: "p_ev_livre", authorId: "u_anaïs", passion: "litterature", mood: "irl", type: "text", cover: "book", eventId: "e14",
      text: "📍 Bordeaux, librairie Mollat — 📅 jeudi 18h\nBook club du mois : on lit un roman que personne n'a choisi, tiré au sort. C'est la meilleure règle qu'on ait inventée.\nJ'ai découvert trois autrices comme ça, que je n'aurais jamais ouvertes. Table de dix, il reste deux chaises.",
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
    { id: "p_ev2_e20", authorId: "u_inès", passion: "art", mood: "irl", type: "text", cover: "neon", eventId: "e20",
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
    { id: "p_ev2_e37", authorId: "u_anaïs", passion: "litterature", mood: "irl", type: "text", cover: "book", eventId: "e37",
      text: "Rencontre avec une autrice à Bordeaux. Pas une séance de dédicaces : une vraie discussion, avec des questions du public qui n'ont pas été triées.\n\nCe sont toujours les meilleures.",
      createdAt: hours(44), likes: 101, liked: false, comments: [
        { id: "cp_ev2_e37_0", authorId: "u_sofia", text: "Elle répond vraiment, c'est rare. 📚", createdAt: hours(40), likes: 13, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p_ev2_e38", authorId: "u_chloé", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen", eventId: "e38",
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
    { id: "p_ev2_e41", authorId: "u_chloé", passion: "yoga", mood: "irl", type: "text", cover: "nature", eventId: "e41",
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
    { id: "p204", authorId: "u_oussa", passion: "musique", mood: "creation", type: "text", cover: "neon",
      text: "Version 7 de la boucle : six secondes de batterie prises sur la compile de variété turque des années 70 chinée aux Puces, ralenties à 88 BPM.\nLe vinyle a une bosse au deuxième tour, ça claque à chaque passage — j'ai gardé le clic, il tombe pile sur le contretemps.\nReste la basse à poser, et surtout à trancher : je laisse l'intro un peu à côté du tempo, comme sur le disque, ou je recale tout sur la grille. Les deux essais tiennent, pas pour les mêmes raisons.",
      createdAt: hours(41), likes: 34, liked: false, comments: []},
    { id: "p205", authorId: "u_lea", passion: "musique", mood: "learn", type: "text", cover: "studio",
      text: "J'ai enfin appris à m'accorder à l'oreille, sans appli. La méthode de mon prof : caler le la, puis tout le reste aux harmoniques, case 5 contre case 7. Trois semaines pour que ça devienne fiable.\nMaintenant je sens que la guitare a bougé avant même de jouer. La dépendance à l'accordeur, c'était un vrai plafond.",
      createdAt: hours(76), likes: 52, liked: false, comments: []},
    { id: "p206", authorId: "u_oussa", passion: "musique", mood: "irl", type: "text", cover: "news",
      text: "📍 Saint-Denis, café de la place du Caquet — 📅 mardi 19h30\nLa salle de répète où j'ai fait mes premières maquettes ferme en décembre, le bail n'est pas renouvelé : six studios à 8 € l'heure, la moitié des groupes du coin y sont passés. On se retrouve pour lister les locaux possibles et voir qui peut mettre quoi dans un loyer partagé.\nDix places autour de la table. Si vous connaissez un local, même moche, même froid, venez avec l'adresse et dites-le-moi avant mardi.",
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
    { id: "p210", authorId: "u_karim", passion: "photo", mood: "creation", type: "text", cover: "street",
      text: "Quatrième sortie pour la série sur le canal : six images gardées sur trois pellicules.\nJe tire en 18x24 à la maison et le bac de révélateur fatigue — les gris de la semaine dernière sont plus plats que ceux d'octobre, il faut que j'en refasse un litre avant le prochain tirage.\nIl me manque la dernière image, celle de l'écluse des Récollets au petit matin : trois heures sur place mardi, pas une seule prise. Certains jours l'œil ne s'allume pas, je ne force plus.",
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
    { id: "p217", authorId: "u_clara", passion: "voyage", mood: "all", type: "text", cover: "horizon",
      text: "Bivouac sur une aire de repos croate, entre deux semi-remorques. Douche au robinet, pâtes au réchaud, la lumière orange des lampadaires à travers la toile.\nÀ six heures, un chauffeur slovène m'a apporté un café et m'a expliqué, gestes à l'appui, que j'étais folle. Il a probablement raison, et j'ai dormi neuf heures d'affilée.",
      createdAt: hours(105), likes: 67, liked: false, comments: []},
    { id: "p218", authorId: "u_nina", passion: "voyage", mood: "learn", type: "text", cover: "news_europe",
      text: "Ma méthode pour payer un mois à Porto au prix du quartier et pas au prix de l'annonce.\n1. Je ne réserve que trois nuits, jamais plus, et j'arrive avec le sac sur le dos.\n2. Le deuxième jour, je demande au propriétaire, en direct, un prix pour quatre semaines réglées d'avance : la remise se fait là, jamais en ligne.\n3. Si ça ne se fait pas, je descends de deux rues vers les quartiers sans terrasses et je recommence le lendemain.\nSur mes trois dernières villes, ça m'a fait gagner à chaque fois l'équivalent d'une semaine de logement.",
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
    { id: "p221", authorId: "u_theo", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen",
      text: "📍 Marseille, ma cuisine rue Curiol, cinquième sans ascenseur — 📅 mardi 19h\nOn fait des pâtes à l'ail, huile d'olive et piment, sans balance : je montre à quel moment on sort l'ail de la poêle avant qu'il brunisse, et chacun finit la sienne. J'apporte un kilo de spaghettis et les casseroles, vous ne prenez rien.\nSix places autour du plan de travail, pas une de plus. Dites-moi si vous venez, je compte les assiettes.",
      createdAt: hours(49), likes: 29, liked: false, comments: []},
    { id: "p222", authorId: "u_hugo", passion: "cuisine", mood: "irl", type: "photo", cover: "kitchen",
      text: "Atelier de six personnes samedi dans le labo : tartes aux fruits d'été, pâte sablée sans beurre. Deux fonçages ratés, on a tout recommencé ensemble, et c'est là que tout le monde a compris — la pâte doit sortir du froid dure, pas souple.\nOn a mangé les ratées à 16h. Elles étaient très bien.",
      createdAt: hours(97), likes: 110, liked: false, comments: [
        { id: "cp222_0", authorId: "u_theo", text: "Manger les ratées, meilleur moment de n'importe quel atelier.", createdAt: hours(88), likes: 9, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p223", authorId: "u_theo", passion: "cuisine", mood: "learn", type: "text", cover: "kitchen",
      text: "Je croyais saler correctement. Test à l'aveugle avec deux bouillons identiques, l'un à 8 g par litre, l'autre à 12. J'ai choisi le plus salé les trois fois, sans hésiter.\nDepuis des années je sale en dessous de ce que j'aime vraiment, par peur d'exagérer devant les clients. Ça se corrige à partir de ce soir.",
      createdAt: hours(143), likes: 92, liked: false, comments: []},
    { id: "p224", authorId: "u_hugo", passion: "cuisine", mood: "creation", type: "text", cover: "news",
      text: "Essai 7 du croissant sans beurre : purée de noisette et huile d'olive fruitée verte, tourage à 14 °C parce qu'au-dessus la pâte boit la matière grasse et se déchire.\nLe feuilletage tient enfin, mais ça sèche en trois heures au lieu de six. Il me reste à jouer sur le sucre inverti et à refaire un tourage à cinq tours.\nJe garde la même farine tant que je n'ai pas réglé ça, sinon je ne saurai plus ce qui a bougé.",
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
    { id: "p233", authorId: "u_clara", passion: "sport", mood: "all", type: "text", cover: "sunrise",
      text: "6h30 au bord de la Loire, assise sur un banc en béton encore froid. Café instantané infect mais brûlant, 40 km déjà dans les jambes, les chaussettes qui sèchent sur le guidon.\nPersonne pendant deux heures, à part un héron qui m'a regardée manger sans bouger d'un centimètre. Je repars vers le sud quand le soleil aura passé les peupliers.",
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
    { id: "p236", authorId: "u_jona", passion: "sport", mood: "irl", type: "text", cover: "nature",
      text: "📍 Chamonix, falaise des Gaillands, secteur école — 📅 samedi 9h\nDeux heures pour ceux qui bloquent au moment de partir en tête : voies courtes, chutes propres au-dessus de la deuxième dégaine, on recommence jusqu'à ce que ça devienne ennuyeux. J'amène deux cordes et cinq dégaines de rab.\nQuatre personnes maximum pour que chacun passe vraiment. Écrivez-moi votre niveau, je fais les cordées avant.",
      createdAt: hours(160), likes: 147, liked: false, comments: []},
    { id: "p237", authorId: "u_sofia", passion: "litterature", mood: "learn", type: "text", cover: "book",
      text: "J'ai relu Les Vagues en me forçant à ne pas chercher qui parle. Troisième tentative, et la première fois que ça tient : dès qu'on lâche l'idée qu'il y a six personnages, il reste six voix qui se répondent, et le livre devient presque évident à voix haute. J'ai lu quinze pages debout dans ma cuisine hier soir, ça change complètement le rythme.",
      createdAt: hours(5), likes: 88, liked: false, comments: [
        { id: "cp237_0", authorId: "u_liam", text: "Tu viens de me convaincre de le ressortir de l'étagère où il dort depuis 2019.", createdAt: hours(3), likes: 8, likedBy: [], emojis: [], replies: [] },
        { id: "cp237_1", authorId: "u_val", text: "À voix haute, oui. Ça marche aussi très bien pour Duras, d'ailleurs.", createdAt: hours(2), likes: 12, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p238", authorId: "u_sofia", passion: "litterature", mood: "irl", type: "photo", cover: "nature",
      text: "📍 Bordeaux, Jardin public, les bancs à l'ombre côté rue du Jardin Public — 📅 dimanche 15h\nLecture silencieuse à plusieurs : chacun vient avec son livre, on lit deux heures sans se parler, et on boit un verre ensuite pour qui veut. J'apporte une couverture et deux romans en rab.\nDouze places, c'est la taille de l'ombre. Un mot ici si vous en êtes, je préviens s'il pleut.",
      createdAt: hours(30), likes: 64, liked: false, comments: []},
    { id: "p239", authorId: "u_liam", passion: "litterature", mood: "creation", type: "text", cover: "studio",
      text: "J'ai coupé 40 minutes d'un entretien d'1h20 avec une traductrice, et ce qui reste, ce sont les silences. Elle mettait sept ou huit secondes avant chaque réponse. La première fois j'ai voulu resserrer, puis j'ai compris que c'était le sujet même de l'épisode. Le montage final garde les pauses entières. C'est lent, et je crois que c'est le meilleur qu'on ait fait.",
      createdAt: hours(64), likes: 156, liked: false, comments: [
        { id: "cp239_0", authorId: "u_noa", text: "Garder les silences, c'est presque toujours le bon choix au montage. Et le plus dur à défendre.", createdAt: hours(58), likes: 14, likedBy: [], emojis: [], replies: [] },
        { id: "cp239_1", authorId: "u_sofia", text: "Tu la nommes ? Je veux lire ce qu'elle a traduit.", createdAt: hours(50), likes: 6, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p240", authorId: "u_val", passion: "litterature", mood: "learn", type: "text", cover: "book",
      text: "Comment j'attaque un essai de 700 pages sans l'abandonner page 40 :\n1. Je lis la table des matières et je choisis trois chapitres, pas plus, ceux qui répondent à une question que je me pose déjà.\n2. Je lis ces trois-là en premier, dans le désordre, crayon à la main.\n3. Si deux des trois tiennent debout, je reprends au début ; sinon je le rends et je ne me sens coupable de rien.\nÇa m'évite de juger un livre sur sa quatrième de couverture et sur ce qu'en disent ceux qui ne l'ont pas ouvert.",
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
    { id: "p245", authorId: "u_noa", passion: "cinema", mood: "learn", type: "photo", cover: "studio",
      text: "Une règle que j'applique à chaque montage : couper sur le mouvement, jamais sur le mot.\nQuand un personnage finit sa phrase et que je coupe là, on sent la coupe. Si je coupe pendant qu'il se lève, qu'il tourne la tête ou qu'il repose son verre, l'œil suit le geste et oublie le raccord.\nConcrètement je pose ma coupe deux ou trois images après le début du geste : sur une timeline en 25 images par seconde, ça se joue à un dixième de seconde, et ça change tout.",
      createdAt: hours(40), likes: 118, liked: false, comments: [
        { id: "cp245_0", authorId: "u_raph", text: "Je connais exactement ce moment, en version open space vidé à 20h.", createdAt: hours(33), likes: 10, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p246", authorId: "u_karim", passion: "cinema", mood: "learn", type: "photo", cover: "street",
      text: "J'ai passé une soirée à refaire des plans de Night on Earth avec mon appareil, assis à l'arrière d'un taxi, juste pour comprendre la lumière. Conclusion : ils n'ont quasiment pas triché. Les visages sont éclairés par les enseignes et les phares d'en face, rien d'autre. J'ai perdu quatre-vingts photos et gagné une intuition que je n'avais pas.",
      createdAt: hours(75), likes: 204, liked: false, comments: []},
    { id: "p247", authorId: "u_liam", passion: "cinema", mood: "irl", type: "text", cover: "neon",
      text: "📍 Montréal, arrière-salle du café de la rue Beaubien — 📅 jeudi 20h\nChacun amène un film de cinq minutes tourné au téléphone, le sien ou celui d'un autre. On projette tout d'affilée, on ne commente qu'après le dernier, et on ne parle pas de matériel.\nHuit films maximum, sinon on y passe la nuit. J'enregistre la discussion pour un épisode, je le redirai sur place. Répondez avec le titre du vôtre, je fais l'ordre de passage.",
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
    { id: "p251", authorId: "u_yanis", passion: "tech", mood: "all", type: "photo", cover: "neon",
      text: "23h12, une seule lampe allumée, et ce bug qui disparaît dès que j'ajoute un log et revient quand je l'enlève.\nJ'ai fermé l'éditeur sans rien corriger. En bas, la rue Pargaminières fait plus de bruit que mon casque, donc autant aller dormir. Demain la même erreur m'attendra au même endroit, en meilleure forme que moi.",
      createdAt: hours(55), likes: 152, liked: false, comments: [
        { id: "cp251_0", authorId: "u_tom", text: "Le bug qui s'évapore dès qu'on l'observe, mon ennemi juré depuis toujours.", createdAt: hours(48), likes: 19, likedBy: [], emojis: [], replies: [] },
        { id: "cp251_1", authorId: "u_nabil", text: "Trois jours, tu es très optimiste.", createdAt: hours(44), likes: 13, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p252", authorId: "u_nabil", passion: "tech", mood: "creation", type: "text", cover: "tech",
      text: "Prototype du système de dialogue en place : chaque phrase prononcée par le joueur consomme une ressource, donc parler coûte quelque chose. Les six premiers testeurs ont tous fini par se taire dans la deuxième scène, ce que je n'avais pas prévu du tout et qui est bien plus intéressant que ce que j'avais écrit. Je garde, et je réécris la scène autour de ce silence.",
      createdAt: hours(92), likes: 176, liked: false, comments: []},
    { id: "p253", authorId: "u_yanis", passion: "tech", mood: "learn", type: "text", cover: "tech",
      text: "La règle que je m'applique depuis mardi : rien d'utile ne pointe vers une cible mouvante.\nUne mise à jour du modèle qui génère mes tests a cessé de respecter le format de sortie que j'avais fixé, et j'ai cherché deux heures dans mon code avant de comprendre. Concrètement : épingle la version exacte dans ta config au lieu de l'alias générique, garde un fichier de sortie de référence, compare-le avant de croire que le bug vient de toi. Cinq minutes une fois, ça m'aurait fait gagner une matinée.",
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
    { id: "p295", authorId: "u_mila", passion: "yoga", mood: "irl", type: "text", cover: "book",
      text: "📍 Ajaccio, studio de la rue Fesch — 📅 jeudi 19h30\nAprès mes cours de contemporain je garde la salle une heure pour un yin très lent : cinq postures tenues quatre minutes, au sol, lumière basse. Ma hanche droite grince toujours en pigeon après quatre ans, donc on ne cherche à réparer personne, on s'installe et on attend que ça passe. Huit tapis, six encore libres — dites-moi si vous venez, j'ouvre la porte à 19h15.",
      createdAt: hours(22), likes: 58, liked: false, comments: []},
    { id: "p296", authorId: "u_rita", passion: "mode", mood: "irl", type: "text", cover: "street",
      text: "Marché HLM à Dakar samedi matin, deux heures dans les ballots de friperie. J'ai sorti une chemise en wax coupée à l'européenne : les pinces de poitrine sont montées à l'envers, je crois que quelqu'un a travaillé avec un patron photocopié dans le mauvais sens.\nJe la garde telle quelle, sans rien reprendre. Ce genre d'accident, on ne sait pas le dessiner.",
      createdAt: hours(35), likes: 210, liked: false, comments: [
        { id: "cp296_0", authorId: "u_zoe", text: "Les erreurs de patron sont mes meilleures profs. Tu la portes ou elle finit en pièce d'atelier ?", createdAt: hours(30), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p297", authorId: "u_mila", passion: "danse", mood: "irl", type: "photo", cover: "dance",
      text: "Trois jours de résidence à Ajaccio, dans une salle prêtée par le conservatoire. Le sol est en vieux parquet et il colle par endroits : impossible de faire une glissade sans se bloquer le genou.\nOn a fini par retravailler tout le deuxième tableau en appuis courts. Ça paraît laid sur le papier, c'est devenu la meilleure partie de la pièce.",
      createdAt: hours(48), likes: 165, liked: false, comments: []},
    { id: "p298", authorId: "u_sami", passion: "podcast", mood: "learn", type: "text", cover: "news",
      text: "On m'apprend à préparer un entretien, jamais à préparer le silence qui suit une réponse. Trois choses que je m'impose depuis ce montage.\n1. Compter deux secondes avant de relancer : une fois sur deux la personne repart toute seule, et c'est là que ça devient intéressant. 2. Écrire mes questions dans le désordre puis les renuméroter juste avant, pour ne pas dérouler une conclusion déjà écrite. 3. Réécouter les brutes en ne notant que mes propres interventions.\nSur 52 minutes il m'en reste 19, et ce qui a sauté ce sont mes quatre relances, pas ses réponses.",
      createdAt: hours(12), likes: 132, liked: false, comments: [
        { id: "cp298_0", authorId: "u_val", text: "Préparer le silence, je note. C'est exactement ce qui manque à la plupart des entretiens que j'écoute.", createdAt: hours(8), likes: 14, likedBy: [], emojis: [], replies: [] },
        { id: "cp298_1", authorId: "u_liam", text: "52 vers 19, c'est un beau ratio. Tu gardes les chutes quelque part ?", createdAt: hours(5), likes: 4, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p299", authorId: "u_emma", passion: "yoga", mood: "learn", type: "text", cover: "nature",
      text: "Week-end de formation sur l'épaule. Je faisais descendre les gens en chaturanga en répétant \"coudes le long du corps\" depuis six ans, sans jamais vérifier si l'omoplate suivait.\nSur douze participants, neuf la décollaient en fin de descente. Moi comprise. Je vais devoir désapprendre une consigne que j'ai donnée des milliers de fois, et ça me contrarie plus que je ne l'aurais cru.",
      createdAt: hours(58), likes: 88, liked: false, comments: []},
    { id: "p300", authorId: "u_zoe", passion: "mode", mood: "creation", type: "text", cover: "neon",
      text: "Troisième essai sur la veste en chutes de doublure : cette fois les seize morceaux sont assemblés sur le biais, et ça tombe enfin droit dans le dos.\nLe problème c'est le col. Il me reste 40 cm du bleu foncé et il en faudrait 55 pour le monter d'une seule pièce, donc soit je coupe avec une couture visible au milieu, soit je passe sur le gris qui jure avec tout le reste. Manches et col avant de pouvoir la photographier.",
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
    { id: "p303", authorId: "u_mehdi", passion: "yoga", mood: "irl", type: "text", cover: "trail",
      text: "📍 Annecy, la petite salle du club au bord du Pâquier — 📅 dimanche 11h30\nSéance de récupération au sol, après la sortie longue du matin : quarante minutes, jambes contre le mur, bassin surélevé, ouverture de hanches, aucune posture debout. Je n'ai aucun chiffre qui prouve que ça récupère quoi que ce soit, je sais juste que je dors mieux les dimanches où je le fais. Six tapis, quatre encore libres — dites-le-moi avant samedi soir, j'apporte les sangles.",
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
    { id: "p306", authorId: "u_val", passion: "podcast", mood: "irl", type: "text", cover: "news_europe",
      text: "📍 Paris, le café de la rue Saint-Guillaume en face de Sciences Po — 📅 mardi 18h30\nJ'apporte l'enregistreur et une seule question, celle qui m'a coincée huit secondes au micro la semaine dernière : qu'est-ce qui vous ferait changer d'avis ? Chacun passe cinq minutes au casque avec elle, on garde les silences au lieu de les couper, et on réécoute les prises ensemble à la fin. Dix chaises autour de deux tables, la moitié sont prises — répondez-moi et je vous en garde une.",
      createdAt: hours(18), likes: 145, liked: false, comments: [
        { id: "cp306_0", authorId: "u_sami", text: "Huit secondes, c'est déjà une réponse. Bien joué à eux de ne pas l'avoir coupée.", createdAt: hours(14), likes: 17, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p307", authorId: "u_nina", passion: "yoga", mood: "learn", type: "photo", cover: "horizon",
      text: "Pratiquer sur un pont de ferry qui tremble, en trois points appris entre Igoumenitsa et Bari.\n1. Renonce à tout ce qui tient sur une jambe : l'équilibre n'est pas le tien, il est au bateau. 2. Prends tes deux mètres carrés le long d'une cloison plutôt qu'au milieu du pont, elle sert d'appui et coupe le vent. 3. Enchaîne des postures à quatre appuis et des flexions assises, et cale ta respiration sur le roulis au lieu de lutter contre.\nMême méthode dans un train de nuit ou une chambre trop petite, c'est le même problème.",
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
    { id: "p311", authorId: "u_emma", passion: "yoga", mood: "learn", type: "text", cover: "book",
      text: "La règle que je répète à chaque nouvel élève : la souplesse empruntée n'est pas la vôtre.\nEn salle chauffée à 40 degrés, vous descendez plus bas dans la fente parce que le tissu est chaud, pas parce que votre amplitude a bougé. Refaites la même posture le lendemain matin, à froid, avant le café : l'écart entre les deux, c'est ce qu'il vous reste à travailler. C'est cet écart-là qu'on entraîne, pas la photo du soir.",
      createdAt: hours(168), likes: 133, liked: false, comments: []},
    { id: "p312", authorId: "u_zoe", passion: "mode", mood: "irl", type: "photo", cover: "street",
      text: "Vide-dressing monté avec quatre copines dans une cour du 20e, soixante-deux pièces posées sur des tréteaux. Trente-huit sont parties.\nCe qui n'est pas parti : tout ce qui était neuf ou presque. Les gens sont venus chercher des vêtements avec une histoire, une réparation visible, un ourlet refait à la main. J'ai vendu une chemise reprisée au coude trois fois le prix d'un jean jamais porté.",
      createdAt: hours(180), likes: 158, liked: false, comments: [
        { id: "cp312_0", authorId: "u_rita", text: "Ça confirme tout ce que je vois sur les marchés à Dakar. Le neuf n'intéresse plus personne dans ces ventes.", createdAt: hours(176), likes: 18, likedBy: [], emojis: [], replies: [] },
        { id: "cp312_1", authorId: "u_sofia", text: "Une chemise reprisée qui bat un jean neuf, il y a un roman entier là-dedans.", createdAt: hours(170), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p313", authorId: "u_amira", passion: "danse", mood: "irl", type: "text", cover: "neon",
      text: "📍 Lille, salle du centre social de Wazemmes — 📅 mercredi 20h\nUne heure de danse sans miroir : on retourne les panneaux contre le mur, une playlist qu'on connaît par cœur, et personne ne corrige personne. Je suis danseuse hip-hop mais ce n'est pas un cours, il n'y a pas de niveau demandé et rien à retenir. Douze places, le parquet est petit.\nÉcrivez-moi si vous venez, j'apporte l'enceinte et une rallonge.",
      createdAt: hours(192), likes: 54, liked: false, comments: []},
    { id: "p314", authorId: "u_liam", passion: "podcast", mood: "creation", type: "text", cover: "news",
      text: "Troisième montage du même épisode, et il fait encore 52 minutes alors que je le veux sous 40. J'ai coupé l'intro que j'aimais bien, gardé les silences, et je bute sur douze minutes au milieu où l'invité se répète : au casque ça passe, sur les enceintes de la cuisine ça s'entend tout de suite.\nIl me reste à retailler ce bloc, refaire le générique et poser la voix de fin. Je publierai quand ce sera dessous, pas mardi matin parce que c'est mardi.",
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
    { id: "p266", authorId: "u_theo", passion: "jardinage", mood: "learn", type: "text", cover: "kitchen",
      text: "Le basilic en bac file et fait des feuilles minuscules parce qu'on le cueille mal — j'ai raté deux bacs entiers l'été dernier avant de comprendre. Trois gestes :\n1. Pincer la tige juste au-dessus d'une paire de feuilles, jamais feuille par feuille.\n2. Couper la tête dès qu'un bouton de fleur apparaît, sans attendre le lendemain.\n3. Arroser le matin, au pied, jamais sur le feuillage.\nDepuis, mes trois bacs plein sud tiennent de mai à octobre.",
      createdAt: hours(21), likes: 88, liked: false, comments: []},
    { id: "p267", authorId: "u_rita", passion: "metier", mood: "irl", type: "text", cover: "workshop",
      text: "📍 Dakar, atelier du tailleur, rue Carnot — 📅 samedi 14h\nOn met à plat les six cents patrons de l'atelier qui ferme en octobre : tracés à la main sur kraft, annotés au crayon, empilés sans ordre depuis trente-deux ans. Au programme, dépoussiérer, photographier à plat, écrire la taille et l'année au dos. Six paires de mains, pas plus, la table ne fait que trois mètres.\nDites-moi si vous venez, j'apporte le thé et les gants.",
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
    { id: "p272", authorId: "u_yanis", passion: "jeuxvideo", mood: "irl", type: "text", cover: "tech",
      text: "📍 Toulouse, café associatif des Carmes — 📅 jeudi 19h\nDeux heures, ordinateurs portables ouverts : chacun montre son projet en cours, dix minutes chrono, et on dit franchement ce qui manque. Je viens avec mon prototype de jeu de gestion, celui que je n'ai montré à personne depuis mars. Huit places, et seulement deux prises murales, donc venez chargés.\nRépondez ici si vous prenez un créneau, je fais l'ordre de passage mercredi soir.",
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
    { id: "p277", authorId: "u_lou", passion: "art", mood: "all", type: "text", cover: "nature",
      text: "Journée sans four et sans commande. Deux heures à malaxer la même terre pendant que la pluie tapait sur la tôle de l'atelier, et rien n'est sorti de mes mains.\nLe tour a tourné à vide dans son coin, je l'ai laissé faire. Il est 18h, j'ai les ongles pleins et aucune pièce à montrer.",
      createdAt: hours(105), likes: 64, liked: false, comments: []},
    { id: "p278", authorId: "u_hugo", passion: "jardinage", mood: "creation", type: "text", cover: "kitchen",
      text: "J'ai mis un citronnier caviar en pot sur la terrasse il y a deux ans, en me disant que je ferais mes propres perles pour les desserts. Première vraie récolte cette semaine : onze fruits.\nÇa ne couvre même pas un service. Mais le goût n'a rien à voir avec ce que j'achetais, et je sais exactement ce qu'il y a dedans : du terreau, de l'eau de pluie et beaucoup de patience mal placée.",
      createdAt: hours(118), likes: 156, liked: false, comments: [
        { id: "cp278_0", authorId: "u_theo", text: "Onze fruits en deux ans, c'est un ratio de chef, pas d'agriculteur. Je valide complètement.", createdAt: hours(110), likes: 16, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p279", authorId: "u_paul", passion: "metier", mood: "learn", type: "text", cover: "workshop",
      text: "J'ai raté un assemblage à queues d'aronde cette semaine, pour la première fois depuis longtemps. Trop confiant : j'ai tracé au feutre au lieu du trusquin et j'ai perdu un demi-millimètre par queue.\nSur six queues, ça fait trois millimètres de jeu au bout. J'ai refait la pièce. La leçon n'est pas « il faut un trusquin », elle est : le jour où on trouve qu'un geste est devenu inutile, c'est qu'on est en train de le perdre.",
      createdAt: hours(130), likes: 341, liked: false, comments: []},
    { id: "p280", authorId: "u_nabil", passion: "jeuxvideo", mood: "creation", type: "photo", cover: "neon",
      text: "Deuxième prototype de mon niveau 4, et il est toujours injuste — mais pas de la bonne façon. J'ai rebranché le tube cathodique récupéré chez ma tante pour rejouer le jeu qui m'a donné l'idée : chez eux la salle se lit en une seconde, chez moi le joueur meurt sans avoir compris où était le piège.\nJ'ai ressorti la manette à fil, celle qui a du jeu, pour tester sans confort. Il me reste à redessiner l'entrée de la salle et à baisser la vitesse des projectiles avant de le faire essayer à quelqu'un.",
      createdAt: hours(142), likes: 132, liked: false, comments: [
        { id: "cp280_0", authorId: "u_tom", text: "Le cathodique change tout sur ces jeux-là, les hitbox redeviennent lisibles. Ne le lâche jamais.", createdAt: hours(136), likes: 10, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p281", authorId: "u_rita", passion: "art", mood: "irl", type: "text", cover: "street",
      text: "📍 Paris, sortie du métro Belleville — 📅 samedi 14 h\nLa grande fresque du bas de la rue a été repeinte en gris lundi, sans que personne soit prévenu ; six ans qu'elle était là. Je propose qu'on aille photographier celles qui tiennent encore, avant qu'elles y passent aussi.\nDeux heures de marche, huit personnes maximum : je relève les accords de couleurs pour mes planches de la saison prochaine et je partage le carnet à la fin.\nDites-moi ici si vous venez, j'apporte un thermos.",
      createdAt: hours(155), likes: 245, liked: false, comments: []},
    { id: "p282", authorId: "u_lucie", passion: "jardinage", mood: "learn", type: "text", cover: "climate",
      text: "Depuis que mon puits est descendu de 80 cm, je m'en tiens à une règle : l'eau se garde dans le sol, elle ne se rattrape pas à l'arrosoir. Trois étapes, dans cet ordre.\n1. Arroser longuement la veille au soir — un paillage posé sur une terre sèche la maintient sèche des semaines.\n2. Étaler 10 cm de paille ou de tontes bien séchées, en dégageant 3 cm autour de chaque tige : au contact, le collet pourrit.\n3. Sortir de la planche ce qui boit plus que tout le reste réuni ; chez moi c'est la salade d'été, et j'ai gagné deux arrosages par semaine.\nEn bac, mêmes étapes avec 5 cm de paillage.",
      createdAt: hours(168), likes: 298, liked: false, comments: [
        { id: "cp282_0", authorId: "u_emma", text: "Le paillage épais m'a sauvée l'an dernier. Dix centimètres de tonte séchée et le sol restait frais dessous.", createdAt: hours(160), likes: 13, likedBy: [], emojis: [], replies: [] },
        { id: "cp282_1", authorId: "u_val", text: "Le chiffre des 41 jours colle avec ce que remontent les agences sur tout le sud-ouest. Merci de le ramener au local, ça parle beaucoup mieux.", createdAt: hours(152), likes: 27, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p283", authorId: "u_lou", passion: "metier", mood: "learn", type: "photo", cover: "workshop",
      text: "Une règle que j'aurais aimé qu'on me donne en démarrant : l'assise avant l'outil.\nJ'ai tourné onze ans sur un tabouret de bar bricolé, en repoussant le confort à plus tard ; mon dos a fini par présenter la note. Le siège réglable que je viens de payer 180 € corrige la seule chose qui compte : les coudes doivent tomber au niveau de la girelle sans que les épaules montent. Sur un tabouret fixe, on compense en penchant le buste, et c'est ce penché-là qui use.\nSi vous montez un poste de travail assis, réglez la hauteur d'assise avant d'acheter quoi que ce soit d'autre, et mesurez-la sur vous plutôt que sur une fiche produit.",
      createdAt: hours(182), likes: 187, liked: false, comments: []},
    { id: "p284", authorId: "u_liam", passion: "jeuxvideo", mood: "creation", type: "text", cover: "tech",
      text: "Troisième version du montage de l'épisode sur les jeux en ligne fermés. J'en suis à 41 minutes, je vise 28.\nLa conservatrice que j'ai enregistrée parle vite et bas, et mon micro-cravate a pris le ronflement du serveur de sa salle : j'ai passé la soirée au coupe-bas plutôt qu'à couper des phrases. Il me reste à trancher entre garder le passage sur les huit titres qui n'existent plus nulle part, ou le silence de quatre secondes qui le suit ; les deux ensemble, le rythme tombe.\nHabillage sonore demain, et toujours zéro idée de titre.",
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
    { id: "p323", authorId: "u_sami", passion: "actu", mood: "creation", type: "text", cover: "news_europe",
      text: "Deuxième mouture du papier sur la commission de ce matin. Six pages de notes, trois phrases utilisables, et je bloque encore sur l'entrée.\nCe que je veux raconter s'est passé dans le couloir, où deux attachés se sont accrochés sur le calendrier : je n'ai ni enregistrement ni photo, juste ma mémoire et deux prénoms que je ne peux pas citer. Reste à faire, rappeler l'un des deux pour qu'il l'assume à voix haute — sinon je coupe le passage et il ne me reste qu'un compte rendu de séance.\nBouclage demain 11 h.",
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
    { id: "p326", authorId: "u_lucie", passion: "animaux", mood: "all", type: "photo", cover: "nature",
      text: "Le hérisson est toujours dans le compost. Cinquième nuit.\nLa planche farinée devant l'entrée porte les mêmes traces, un peu plus écartées vers la droite qu'hier. Je suis restée dix minutes assise sur le seau retourné, à ne rien faire d'autre qu'écouter, et rien n'est sorti.\nLe tas reste en place jusqu'à la fin du mois.",
      createdAt: hours(26), likes: 112, liked: false, comments: []},
    { id: "p327", authorId: "u_kaoru", passion: "actu", mood: "irl", type: "photo", cover: "news_asia",
      text: "📍 Tokyo, Kōenji, sortie nord de la gare — 📅 dimanche 6 h\nAprès le typhon, j'ai enregistré trente secondes de silence ici, zéro voiture, et ça m'a plus appris que ma journée d'entretiens. J'aimerais réentendre le même endroit un dimanche ordinaire, pour mesurer l'écart.\nUne heure de marche, cinq arrêts, une minute d'enregistrement à chaque fois sans parler. Cinq personnes maximum, un téléphone suffit, je prête un casque.\nDites-moi avant samedi soir si vous venez ; s'il pleut fort, on décale d'une semaine.",
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
    { id: "p330", authorId: "u_jona", passion: "animaux", mood: "irl", type: "photo", cover: "nature",
      text: "📍 Chamonix, parking du Tour — 📅 samedi 7 h\nLa semaine dernière j'ai croisé trois bouquetins couchés à 2 400 m, à quinze mètres, sans qu'ils lèvent la tête. J'y remonte samedi et je préfère y aller à quelques-uns.\n950 m de dénivelé sans se presser, trois heures de montée, et une seule consigne : on s'arrête à la vire, on s'assoit, on ne s'approche pas. Six places, chaussures de rando et une veste, il faisait 4 °C là-haut au lever.\nRépondez ici si vous montez, je confirme la sortie vendredi soir.",
      createdAt: hours(44), likes: 118, liked: false, comments: []},
    { id: "p331", authorId: "u_val", passion: "actu", mood: "learn", type: "text", cover: "news",
      text: "On me demande souvent comment je choisis mes sources. Ma règle est bête : je ne cite jamais un chiffre dont je ne sais pas qui l'a compté, quand, et avec quel budget.\nÇa élimine 80 % de ce qui circule, y compris des choses qui vont dans mon sens. C'est surtout ça le travail, jeter ce qui m'arrange.",
      createdAt: hours(33), likes: 102, liked: false, comments: [
        { id: "cp331_0", authorId: "u_sami", text: "La dernière phrase devrait être affichée dans toutes les rédactions.", createdAt: hours(30), likes: 21, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p332", authorId: "u_lea", passion: "musique", mood: "learn", type: "text", cover: "studio",
      text: "Remis le métronome à 62 bpm sur un passage que je jouais à 96 depuis deux ans. Résultat, je ne sais pas le jouer. Je le survolais.\nDix minutes par jour à cette vitesse pendant deux semaines, et seulement après je remonterai. C'est humiliant et c'est la seule chose qui marche vraiment.",
      createdAt: hours(29), likes: 76, liked: false, comments: []},
    { id: "p333", authorId: "u_mehdi", passion: "moto", mood: "learn", type: "text", cover: "trail",
      text: "Ma règle depuis que je redescends du Semnoz en moto après un trail : la fatigue se voit dans les trajectoires avant qu'on la sente dans les jambes.\nLe signe, c'est de serrer la corde et de freiner tard sans l'avoir décidé. Dès que je m'y surprends, je m'arrête au premier élargissement, je bois un demi-litre et je repars en visant large dans chaque lacet.\nEt je sangle le sac de trail sur le réservoir plutôt que sur le dos : chargé, il décale l'appui à chaque changement d'angle.",
      createdAt: hours(57), likes: 68, liked: false, comments: [
        { id: "cp333_0", authorId: "u_greg", text: "La fatigue qui se voit dans les trajectoires, c'est exactement ça. Bien vu.", createdAt: hours(52), likes: 9, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p334", authorId: "u_maya", passion: "animaux", mood: "irl", type: "text", cover: "nature",
      text: "Séance collective au parc samedi matin : six chiens, six maîtres, aucun jeu libre. Uniquement des croisements calmes à dix mètres les uns des autres.\nLes maîtres trouvent ça ennuyeux les vingt premières minutes, puis ils voient leur chien s'asseoir tout seul sans qu'on lui demande, et là ils comprennent. On refait la même dans quinze jours, même heure.",
      createdAt: hours(63), likes: 95, liked: false, comments: []},
    { id: "p335", authorId: "u_sami", passion: "actu", mood: "learn", type: "text", cover: "news",
      text: "Trois semaines sans notification d'info, et je garde le protocole tel quel.\n1. Désinstaller l'appli plutôt que la mettre en silencieux : le badge rouge suffit à rouvrir la boucle.\n2. Une seule fenêtre de veille par jour, la mienne est 18 h, vingt minutes montre en main.\n3. Rallumer la veille d'une échéance que j'ai notée moi-même, et recouper le lendemain à froid.\nRésultat chez moi : quatre longs formats lus jusqu'au bout, une première depuis l'automne — le direct est mon métier, pas une hygiène de vie.",
      createdAt: hours(50), likes: 57, liked: false, comments: []},
    { id: "p336", authorId: "u_liam", passion: "musique", mood: "creation", type: "text", cover: "studio",
      text: "Session acoustique enregistrée dans mon salon hier soir : deux micros, une couverture clouée devant la fenêtre, et le frigo débranché pendant quarante minutes.\nJ'ai oublié de le rebrancher. On a retrouvé l'état de la crème glacée ce matin.\nLa prise est belle, par contre. Aucun souffle, aucun bourdonnement, et deux voisins qui applaudissent à la fin du second morceau.",
      createdAt: hours(47), likes: 88, liked: false, comments: [
        { id: "cp336_0", authorId: "u_oussa", text: "Le frigo débranché, tout le monde y passe une fois 😄 T'as pris quoi comme micros ?", createdAt: hours(44), likes: 15, likedBy: [], emojis: [], replies: [] },
        { id: "cp336_1", authorId: "u_lea", text: "Des voisins qui applaudissent, ça vaut toutes les réverbes du monde.", createdAt: hours(40), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p337", authorId: "u_nina", passion: "moto", mood: "creation", type: "photo", cover: "sunrise",
      text: "Version 3 du road-book pour les 1 100 km du Massif central à la côte, presque tout par la N88 et les départementales qui la longent.\nJ'imprime en A5, une étape par face, et je glisse les feuilles dans une pochette plastique scotchée sur le réservoir : la v2 a pris vingt minutes de pluie après Le Puy et l'encre a coulé sur deux pages.\nIl me reste à reporter les pompes ouvertes le dimanche — c'est la seule fois du voyage où j'ai dû sortir le GPS.",
      createdAt: hours(92), likes: 147, liked: false, comments: []},
    { id: "p338", authorId: "u_mehdi", passion: "animaux", mood: "irl", type: "text", cover: "trail",
      text: "📍 Annecy, parking du Pâquier — 📅 samedi 9 h\nUne heure de marche au bord du lac, au pas des chiens qui ne courent plus. Java a huit ans, le vétérinaire a plafonné ses sorties à deux heures, et je préfère ça à la laisser à la maison.\nSix chiens maximum, on avance au rythme du plus lent et demi-tour au ponton. Dites-moi si vous venez et avec quel chien, que je prévoie l'eau.",
      createdAt: hours(114), likes: 79, liked: false, comments: [
        { id: "cp338_0", authorId: "u_maya", text: "Ce sont les décisions les plus dures et les mieux prises. Elle a huit ans de montagne derrière elle, ça compte.", createdAt: hours(110), likes: 24, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p339", authorId: "u_kaoru", passion: "actu", mood: "irl", type: "text", cover: "news_asia",
      text: "📍 Tokyo, sortie nord de la gare de Kitasenju — 📅 dimanche 10 h\nTrois heures de marche dans Adachi, sans itinéraire et sans sujet : on avance, on s'arrête boire un café dans un endroit sans nom, personne ne prend de notes. C'est la partie du métier que personne ne facture, et sans laquelle je n'ai plus rien à dire trois mois plus tard.\nHuit places, on marche par tous les temps. Répondez-moi ici si vous voulez venir, je donne le point exact la veille.",
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
    { id: "p343", authorId: "u_val", passion: "actu", mood: "learn", type: "text", cover: "news_europe",
      text: "La règle que je répète à mes étudiants devant un communiqué final : lire les notes de bas de page avant le titre.\n1. Compter les pages, puis compter les notes — le rapport entre les deux dit déjà combien on a négocié.\n2. Chercher dans ces notes les mots « révision », « calendrier », « à compter de » : c'est là qu'on repousse ce qu'on n'a pas su trancher.\n3. Ouvrir le communiqué précédent à côté et surligner ce qui a bougé, jamais ce qui est neuf.\nTout le monde titre sur l'accord, et personne ne lit la note qui le vide.",
      createdAt: hours(96), likes: 118, liked: false, comments: [
        { id: "cp343_0", authorId: "u_kaoru", text: "Les notes de bas de page, c'est là que le vrai calendrier se cache. Merci pour la lecture.", createdAt: hours(90), likes: 16, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p344", authorId: "u_lea", passion: "musique", mood: "irl", type: "text", cover: "stage",
      text: "📍 Lyon, bar de la montée de la Grande-Côte — 📅 vendredi 20 h 30\nUne heure de guitare sans setlist, ampli posé sur une chaise, ni scène ni retour. Vous pouvez demander un morceau, même un vieux que je ne joue plus : la dernière fois j'en ai massacré un écrit il y a six ans, et la salle s'en fichait complètement.\nUne trentaine de places, entrée libre et chapeau à la fin. Dites-moi si vous passez, que je sache combien de tables pousser contre le mur.",
      createdAt: hours(187), likes: 87, liked: false, comments: []},
    // ==== EXEMPLES D'ENVIE — LA DIFFÉRENCE DOIT SE VOIR (2026-09-02) ====
    // Remarque d'un testeur, essai réel : « le contenu du fil n'est pas assez
    // explicite par rapport à la passion et au mood ». Les publications
    // existantes étaient justes mais AMBIGUËS : une anecdote pouvait aussi bien
    // porter « Chill » que « Idées », et rien ne permettait de deviner laquelle.
    //
    // Ces publications-ci sont écrites comme des EXEMPLES TYPES, une forme par
    // envie, tenue d'un bout à l'autre du bloc :
    //   💡 Idées      → on FABRIQUE : un état d'avancement, une version, un reste à faire
    //   📚 Apprendre  → on TRANSMET : une règle ou des étapes numérotées, réutilisables
    //   🤝 Rencontrer → on SE DONNE RENDEZ-VOUS : 📍 lieu, 📅 date, places, « qui vient ? »
    //   (neutre)      → on RACONTE UN MOMENT : aucune leçon, aucune invitation, rien à faire
    //
    // ⚠️ TROIS envies d'auteur, et le neutre. « Explorer », la quatrième
    // intention du rail, n'est PAS une forme d'écriture : elle se calcule côté
    // LECTEUR (auteur non suivi, passion non cochée) et ne regarde jamais le
    // mood. « Chill » et « Actu » ont été retirés du produit le 2026-09-02 : ce
    // bloc en portait deux formes, elles sont mortes avec elles.
    //
    // Les quinze premières forment trois séries complètes (Musique, Photo,
    // Cuisine) qui tiennent toutes la MÊME partition — Idées · Apprendre ·
    // Rencontrer · Rencontrer (reliée à une activité) · neutre — pour qu'un
    // testeur qui coche une seule passion voie le dégradé se suivre dans son
    // fil, et rencontre « Voir l'activité » dès le premier écran. Les suivantes
    // comblent les cases vides du tableau passion × envie.
    //
    // ⚠️ Ajoutées EN FIN de tableau : trois suites prennent `state.seed.posts[0]`
    // sans le choisir, insérer en tête changerait leur sujet en silence.

    // ── Série MUSIQUE : la partition complète sur une seule passion ─────────
    { id: "p401", authorId: "u_lea", passion: "musique", mood: "creation", type: "text", cover: "studio",
      text: "Chantier de la semaine : je réécris le refrain de « Après l'orage » à la basse au lieu de la guitare. Version 12, et c'est la première qui tient debout sans que je force la voix.\nIl reste la batterie, que je vais programmer avant d'oser demander à quelqu'un de la jouer. Je poste la maquette dès qu'elle ne me fait plus honte.",
      createdAt: hours(0.2), likes: 41, liked: false, comments: [
        { id: "cp401_0", authorId: "u_oussa", text: "La basse qui porte le refrain, c'est presque toujours la bonne réponse. Envoie la maquette même moche.", createdAt: hours(0.1), likes: 5, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p402", authorId: "u_lea", passion: "musique", mood: "learn", type: "text", cover: "studio",
      text: "Le barré, en trois points, parce que personne ne me l'a expliqué comme ça :\n1. L'index à plat CONTRE la barrette, jamais au milieu de la case\n2. Tire le manche vers toi avec le coude — ce n'est pas le pouce qui serre\n3. Tant que ça frise, joue corde par corde, pas l'accord entier\nSix mois seule à m'abîmer la main, deux semaines avec ces trois points.",
      createdAt: hours(0.7), likes: 186, liked: false, comments: [
        { id: "cp402_0", authorId: "u_amira", text: "Le coup du coude, je viens d'essayer, ça change tout. Merci.", createdAt: hours(0.4), likes: 12, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p403", authorId: "u_lea", passion: "musique", mood: "irl", type: "text", cover: "stage",
      text: "📍 Lyon, café Chopine (Croix-Rousse) — 📅 jeudi 19h30\nScène ouverte : 8 passages de 10 minutes, il en reste 3. Ampli, deux micros et un piano droit sur place, tu viens avec ton instrument et c'est tout.\nDébutant·es franchement bienvenu·es, la moitié de la salle joue devant du monde pour la première fois. Dis-moi en commentaire si tu prends un créneau.",
      createdAt: hours(1.2), likes: 74, liked: false, comments: [
        { id: "cp403_0", authorId: "u_oussa", text: "Je prends le dernier créneau si personne ne le veut. Je viens avec le clavier.", createdAt: hours(0.9), likes: 7, likedBy: [], emojis: [], replies: [] },
        { id: "cp403_1", authorId: "u_mila", text: "Je passe écouter, je ne joue de rien mais j'adore ces soirs-là.", createdAt: hours(0.6), likes: 4, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p404", authorId: "u_lea", passion: "musique", mood: "irl", type: "text", cover: "stage",  eventId: "e1",
      text: "📍 Lyon, Café des Arts — 📅 jeudi 18h30\nJam guitaristes débutants, et « débutants » n'est pas une politesse : la moitié de la salle n'a jamais joué devant quelqu'un. Trois accords suffisent, on tourne sur des grilles que tout le monde connaît.\nIl reste 4 places. Ampli et deux guitares sur place si tu n'as pas la tienne — dis-le moi en commentaire, je les apporte.",
      createdAt: hours(1.6), likes: 164, liked: false, comments: [
        { id: "cp404_0", authorId: "u_oussa", text: "Je viens avec le clavier pour tenir la basse à la main gauche. Ça dépanne à chaque fois.", createdAt: hours(1.2), likes: 6, likedBy: [], emojis: [], replies: [] },
        { id: "cp404_1", authorId: "u_amira", text: "Jamais joué de ma vie, j'ose venir écouter ?", createdAt: hours(0.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p405", authorId: "u_oussa", passion: "musique", mood: "all", type: "text", cover: "neon",
      text: "Trois heures de fouille dans les bacs à 2 € aux Puces. Reparti avec une compile de variété turque des années 70, pochette mangée par l'humidité mais vinyle nickel.\nIl y a dessus une intro de batterie de six secondes, un peu à côté du tempo, que je vais boucler tout l'hiver.",
      createdAt: hours(1.9), likes: 71, liked: false, comments: []},
    { id: "p406", authorId: "u_karim", passion: "photo", mood: "creation", type: "text", cover: "street",
      text: "Nouvelle série commencée hier : « Les rideaux de fer ». Toutes les devantures fermées d'une seule rue de Belleville, prises au même endroit, au même 35 mm, entre 6h et 6h30.\n11 sur 40. Le jour où j'aurai la rue entière, ça devient un accordéon de trois mètres tiré en une seule bande.",
      createdAt: hours(1.95), likes: 67, liked: false, comments: []},
    { id: "p407", authorId: "u_karim", passion: "photo", mood: "learn", type: "text", cover: "street",
      text: "Arrêter de cramer les ciels, en trois gestes :\n1. Mesure la lumière sur la zone la plus CLAIRE que tu veux garder, pas sur le visage\n2. Sous-expose d'un tiers : les ombres se rattrapent, les hautes lumières jamais\n3. Fie-toi à l'histogramme, pas à l'écran — l'écran ment dès qu'il y a du soleil dessus\nÇa marche sur n'importe quel boîtier, et sur un téléphone en mode pro aussi.",
      createdAt: hours(0.3), likes: 274, liked: false, comments: [
        { id: "cp407_0", authorId: "u_noa", text: "Le point 3 vaut pour la vidéo aussi. On se fait avoir dix fois avant de comprendre.", createdAt: hours(0.15), likes: 21, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p408", authorId: "u_karim", passion: "photo", mood: "irl", type: "text", cover: "sunrise",
      text: "📍 Paris, sortie de métro Jaurès — 📅 samedi 6h15 (oui, 6h15)\nBalade photo de rue jusqu'à Stalingrad : deux heures, on s'arrête là où la lumière nous arrête. 6 personnes maximum pour que ça reste une balade et pas une visite guidée.\nAucun niveau requis, un téléphone suffit. Il reste 2 places — commentez et je vous envoie le point de rendez-vous exact.",
      createdAt: hours(0.8), likes: 92, liked: false, comments: [
        { id: "cp408_0", authorId: "u_inès", text: "Je prends une place ! Je viens avec un argentique, ça ira ?", createdAt: hours(0.5), likes: 6, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p409", authorId: "u_karim", passion: "photo", mood: "irl", type: "text", cover: "street",  eventId: "e31",
      text: "📍 Marseille, Vieux Port — 📅 samedi 10h\nAtelier photo de rue : deux heures à marcher, on s'arrête là où la lumière nous arrête, puis on relit ensemble ce que chacun a rapporté. Pas de théorie, on regarde des images.\nSix personnes maximum, il reste 2 places. Un téléphone suffit — commentez et je vous envoie le point de rendez-vous exact.",
      createdAt: hours(1.7), likes: 138, liked: false, comments: [
        { id: "cp409_0", authorId: "u_inès", text: "Je prends une place. Je viens avec un argentique, ça ira ?", createdAt: hours(1.3), likes: 6, likedBy: [], emojis: [], replies: [] },
        { id: "cp409_1", authorId: "u_noa", text: "Le format « on relit ensemble » vaut tous les tutos. J'en suis.", createdAt: hours(1.0), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p410", authorId: "u_karim", passion: "photo", mood: "all", type: "text", cover: "street",
      text: "Rien fait de la journée. L'appareil est resté dans le sac. J'ai bu trois cafés au même comptoir en regardant la buée revenir sur la vitre à chaque fois que quelqu'un poussait la porte.\nJe me suis dit dix fois que c'était une image. Je ne l'ai pas prise, et ça ne me manque pas.",
      createdAt: hours(1.95), likes: 54, liked: false, comments: []},
    { id: "p411", authorId: "u_theo", passion: "cuisine", mood: "creation", type: "text", cover: "kitchen",
      text: "Je monte le menu de printemps, version 3. J'ai jeté le plat de veau : trop lourd derrière l'entrée aux petits pois.\nÀ la place j'essaie un maquereau juste raidi, jus de cresson, pomme de terre écrasée à l'huile de noisette. Testé deux fois, la troisième sera la bonne. Le dessert, lui, n'existe toujours pas.",
      createdAt: hours(1.9), likes: 78, liked: false, comments: []},
    { id: "p412", authorId: "u_hugo", passion: "cuisine", mood: "learn", type: "text", cover: "kitchen",
      text: "La pâte sablée qui ne se rétracte pas à la cuisson, trois règles :\n1. Beurre POMMADE, jamais fondu — le fondu donne une pâte qui casse\n2. Arrête de la travailler dès qu'elle est homogène : chaque tour de plus la rend élastique\n3. Repos au froid 2 h minimum, DÉJÀ étalée à sa forme finale, pas en boule\nJe l'ai ratée pendant des années à cause du point 3, et uniquement de lui.",
      createdAt: hours(1.98), likes: 341, liked: false, comments: [
        { id: "cp412_0", authorId: "u_theo", text: "Étalée avant le repos, c'est LE truc que les livres ne disent pas. Confirmé en cuisine pro.", createdAt: hours(1.6), likes: 34, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p413", authorId: "u_theo", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen",
      text: "📍 Marseille, chez moi (Notre-Dame du Mont) — 📅 samedi 20h\nTable d'hôtes « retour du marché » : 8 couverts, 5 services, 30 € par personne pour couvrir les produits. Je cuisine devant vous, et vous mettez la main au dessert.\nIl reste 3 places. Version végétarienne possible si vous me le dites avant vendredi.",
      createdAt: hours(0.4), likes: 121, liked: false, comments: [
        { id: "cp413_0", authorId: "u_emma", text: "Je prends deux places. On amène le vin ?", createdAt: hours(0.2), likes: 9, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p414", authorId: "u_theo", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen",  eventId: "e3",
      text: "📍 Marseille, chez moi (Notre-Dame du Mont) — 📅 samedi 19h30\nDîner entre passionnés : 8 couverts, 5 services, 30 € par personne pour couvrir les produits. Je cuisine devant vous et vous mettez la main au dessert, c'est la règle de la maison.\nIl reste 3 places. Version végétarienne possible si vous me le dites avant vendredi.",
      createdAt: hours(1.8), likes: 176, liked: false, comments: [
        { id: "cp414_0", authorId: "u_emma", text: "Je prends deux places. On amène le vin ?", createdAt: hours(1.4), likes: 6, likedBy: [], emojis: [], replies: [] },
        { id: "cp414_1", authorId: "u_hugo", text: "Le coup du dessert fait par la table, c'est ce qui casse la glace le plus vite.", createdAt: hours(1.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p415", authorId: "u_hugo", passion: "cuisine", mood: "all", type: "text", cover: "kitchen",
      text: "23h, plaque éteinte depuis une heure, et je mange debout un fond de riz au lait tiède directement dans la casserole.\nC'est le seul truc que je fais sans le goûter trois fois pour vérifier l'assaisonnement.",
      createdAt: hours(1.98), likes: 66, liked: false, comments: []},
    { id: "p416", authorId: "u_sami", passion: "actu", mood: "creation", type: "text", cover: "news_europe",
      text: "Je monte un format long depuis six semaines : cinq entretiens d'une heure avec des livreurs bruxellois, ramenés à un seul récit de 40 minutes.\nCe qui me bloque : personne ne raconte les mêmes horaires, et j'ai promis de ne rien lisser. Je crois que je vais laisser les contradictions dedans, telles quelles.",
      createdAt: hours(9), likes: 96, liked: false, comments: []},
    { id: "p417", authorId: "u_val", passion: "actu", mood: "irl", type: "text", cover: "news_europe",
      text: "📍 Bruxelles, Maison de la presse — 📅 mardi 18h30\nAtelier ouvert « lire une dépêche » : on prend trois dépêches du jour, on remonte à la source, on regarde ce qui a été coupé en chemin. 20 places, gratuit, inscription en commentaire.\nCe n'est pas un cours de journalisme, c'est un cours de lecture. Venez avec votre téléphone, ça suffit.",
      createdAt: hours(22), likes: 143, liked: false, comments: [
        { id: "cp417_0", authorId: "u_yanis", text: "Je note. C'est le genre d'atelier qu'il faudrait faire au lycée.", createdAt: hours(18), likes: 15, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p418", authorId: "u_val", passion: "actu", mood: "learn", type: "text", cover: "news",
      text: "Vérifier une info en trois minutes, sans être journaliste :\n1. Remonte au document cité, pas à l'article qui le cite — le lien y est presque toujours\n2. Cherche la DATE du document, pas celle de l'article : un rapport de 2019 ressort chaque hiver\n3. Regarde qui l'a financé, c'est en dernière page et personne ne la lit\nSi l'un des trois manque, ce n'est pas faux pour autant — c'est invérifiable, et ça se dit comme ça.",
      createdAt: days(1), likes: 402, liked: false, comments: [
        { id: "cp418_0", authorId: "u_sofia", text: "Je garde ça. Le point 2 m'a déjà eue deux fois cette année.", createdAt: hours(20), likes: 38, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p419", authorId: "u_maya", passion: "animaux", mood: "creation", type: "text", cover: "nature",
      text: "Je construis un parcours de flair pour Java dans le jardin : six caches, trois hauteurs, une seule odeur (girofle) et rien d'autre.\nÉtape du jour, les caches en hauteur, qu'elle refuse d'explorer pour l'instant. Je redescends à 40 cm et je remonte de 10 cm par semaine. Le plan du montage est dans les photos.",
      createdAt: hours(6), likes: 88, liked: false, comments: []},
    { id: "p420", authorId: "u_maya", passion: "animaux", mood: "irl", type: "text", cover: "nature",
      text: "📍 Toulouse, prairie des Filtres côté pont Saint-Michel — 📅 mercredi 18h30\nSéance de rappel dehors, avec les vraies distractions : joggeurs, ballons, autres chiens. 40 minutes de travail, longe de 10 mètres obligatoire, friandises molles dans la poche.\n6 chiens maximum, et je prends aussi ceux qui grognent : on s'installe à l'écart du groupe.\nDonnez-moi le prénom et l'âge du vôtre, je fais l'ordre de passage ce soir.",
      createdAt: hours(27), likes: 264, liked: false, comments: [
        { id: "cp420_0", authorId: "u_lucie", text: "Sept jours pour réfléchir, ça devrait exister pour beaucoup d'autres choses.", createdAt: hours(24), likes: 22, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p421", authorId: "u_inès", passion: "art", mood: "creation", type: "text", cover: "workshop",
      text: "Planche 5 sur 9 de la série de portraits au feutre, et je bloque dessus depuis trois jours : les mains sont trop grandes et je n'arrive pas à les reprendre sans refaire le visage.\nHier soir j'ai rempli une page entière de petites croix avec un feutre presque sec, juste pour ne pas refermer le carnet. Ça ne débloque rien, mais je rouvre le lendemain.\nJe reprends la planche demain à l'encre, en décalquant seulement les mains. S'il faut, je garde le visage tel quel et je refais le reste.",
      createdAt: hours(35), likes: 71, liked: false, comments: []},
    { id: "p422", authorId: "u_noa", passion: "cinema", mood: "creation", type: "text", cover: "stage",
      text: "Je monte mon premier court à moi, pas une commande. 7 minutes prévues, deux personnages, un couloir.\nL'ours est fini : il dure 11 minutes et il est mou au milieu. Je sais déjà quel plan doit sauter, c'est mon préféré, et c'est exactement pour ça qu'il doit sauter.",
      createdAt: hours(12), likes: 134, liked: false, comments: []},
    { id: "p423", authorId: "u_mila", passion: "danse", mood: "learn", type: "text", cover: "dance",
      text: "Apprendre une choré vite, la méthode que je donne à mes élèves :\n1. Compte à voix haute AVANT de bouger, sur la phrase entière\n2. Apprends les bras séparément des jambes — jamais les deux d'un coup au début\n3. Filme-toi au ralenti sur le passage qui coince, pas sur celui que tu réussis\nCe n'est pas de la mémoire, c'est du découpage. Tout le monde sait faire ça.",
      createdAt: hours(17), likes: 228, liked: false, comments: [
        { id: "cp423_0", authorId: "u_amira", text: "Le point 1, mes élèves le sautent tous et c'est toujours là que ça casse.", createdAt: hours(15), likes: 18, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p424", authorId: "u_lucie", passion: "jardinage", mood: "learn", type: "text", cover: "nature",
      text: "Le semis de tomates, sans serre et sans lampe :\n1. Sème 6 semaines avant les dernières gelées DE TA COMMUNE, pas celles du magazine\n2. Dès que ça a levé, sors les godets au-dessus de 12 °C, même une heure par jour\n3. Rempote une fois en enterrant la tige jusqu'aux premières feuilles : elle fait des racines partout\nUn plant trapu qui a eu froid battra toujours un plant filé qui a eu chaud.",
      createdAt: hours(21), likes: 196, liked: false, comments: []},
    { id: "p425", authorId: "u_lucie", passion: "jardinage", mood: "irl", type: "text", cover: "nature",
      text: "📍 Angers, jardin partagé des Hauts-de-Saint-Aubin — 📅 dimanche 10h\nTroc de plants et de graines : vous venez avec ce que vous avez en trop, vous repartez avec ce qui vous manque. Rien à vendre, rien à acheter, pas d'inscription.\nJ'apporte 40 plants de tomates (5 variétés) et des courges. On finit autour d'un café vers midi — venez même les mains vides.",
      createdAt: hours(29), likes: 117, liked: false, comments: [
        { id: "cp425_0", authorId: "u_maya", text: "J'arrive avec des boutures de romarin et le chien, si c'est permis.", createdAt: hours(25), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p426", authorId: "u_tom", passion: "jeuxvideo", mood: "learn", type: "text", cover: "neon",
      text: "Se mettre au speedrun dans le bon ordre, parce que tout le monde s'y prend à l'envers :\n1. Finis le jeu normalement une fois, sans chrono — sinon tu optimises un jeu que tu ne connais pas\n2. Apprends UN segment, celui du début, jusqu'à le faire sans réfléchir\n3. Chronomètre par segment, jamais la run entière, pendant tout le premier mois\nLes gens arrêtent parce qu'ils comparent leur run complète à un record mondial. Compare des segments.",
      createdAt: hours(19), likes: 287, liked: false, comments: []},
    { id: "p427", authorId: "u_sofia", passion: "litterature", mood: "learn", type: "text", cover: "book",
      text: "Finir un livre qui résiste, ce qui marche vraiment :\n1. Donne-lui 50 pages, pas une de plus, avant de décider\n2. Si tu continues : 20 minutes au MÊME moment chaque jour — l'heure compte plus que la durée\n3. Aucune note pendant la première lecture, ça casse le rythme\nEt si tu abandonnes, note la page et la raison. Relu trois ans après, c'est souvent devenu le bon moment.",
      createdAt: days(1), likes: 313, liked: false, comments: [
        { id: "cp427_0", authorId: "u_anaïs", text: "« Note la page et la raison » : je n'avais jamais pensé à ça et ça vaut de l'or.", createdAt: hours(21), likes: 29, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p428", authorId: "u_paul", passion: "metier", mood: "all", type: "text", cover: "workshop",
      text: "Atelier fermé, aspirateur éteint, il reste l'odeur des copeaux de chêne et la lampe au-dessus de l'établi.\nJ'ai une soufflette depuis deux ans et je finis quand même le sol au balai, tous les soirs. Ça prend trois minutes de plus, et le tas ne fait pas la même couleur selon qu'on a travaillé du chêne ou du peuplier.\nC'est le seul moment de la journée où je regarde ce que j'ai fait sans penser à ce qu'il reste à faire.",
      createdAt: hours(38), likes: 145, liked: false, comments: []},
    { id: "p429", authorId: "u_paul", passion: "metier", mood: "irl", type: "text", cover: "workshop",
      text: "📍 Tours, mon atelier rue Bernard-Palissy — 📅 samedi 14h-18h\nPortes ouvertes : je monte un tiroir à queues d'aronde en direct, et vous en tracez une sur une chute de hêtre. 10 personnes par créneau d'une heure, gratuit, à partir de 12 ans.\nRien à apporter, tout est sur place. Dites-moi juste l'heure qui vous arrange en commentaire.",
      createdAt: hours(24), likes: 168, liked: false, comments: [
        { id: "cp429_0", authorId: "u_lou", text: "Créneau de 15h pour moi et mon fils. On n'a jamais tenu un ciseau à bois.", createdAt: hours(20), likes: 13, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p430", authorId: "u_zoe", passion: "mode", mood: "creation", type: "text", cover: "neon",
      text: "Troisième essai sur la veste en jean : les empiècements sont découpés dans une nappe de grand-mère, l'assemblage tient, et je bute sur le boutonnage.\nJ'ai vidé la boîte à biscuits sur la table, aligné une quarantaine de boutons dépareillés, et je n'en ai que cinq de la même corne. Il m'en faut sept.\nJe pose tout pour ce soir. Demain je démonte le gilet gris qui dort au fond du carton, il en porte deux qui pourraient passer.",
      createdAt: hours(43), likes: 92, liked: false, comments: []},
    { id: "p431", authorId: "u_rita", passion: "mode", mood: "learn", type: "text", cover: "neon",
      text: "Reconnaître un vêtement qui tiendra dix ans, en 30 secondes dans le magasin :\n1. Retourne-le : les coutures intérieures doivent être surjetées ou anglaises, jamais coupées net\n2. Tire doucement la couture d'épaule — si tu vois le fil au travers, c'est cousu trop lâche\n3. Regarde le motif au niveau de la couture : s'il tombe juste, l'atelier a pris le temps\nLe prix ne dit rien du tout. Ces trois gestes disent presque tout.",
      createdAt: hours(15), likes: 356, liked: false, comments: [
        { id: "cp431_0", authorId: "u_zoe", text: "Le motif raccord, c'est le test le plus rapide et le plus impitoyable. 👏", createdAt: hours(12), likes: 41, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p432", authorId: "u_greg", passion: "moto", mood: "creation", type: "text", cover: "workshop",
      text: "Je refais le faisceau électrique de la vieille routière au complet. L'ancien portait quatre réparations au scotch, dont deux qui n'étaient pas de moi.\nÉtape du week-end : le cheminement derrière le phare, cosses serties et gaine tressée. Je photographie chaque connecteur avant de le couper, parce que je sais très bien comment ça finit sinon.",
      createdAt: hours(31), likes: 109, liked: false, comments: []},
    { id: "p433", authorId: "u_greg", passion: "moto", mood: "learn", type: "text", cover: "sunrise",
      text: "Rouler sous la pluie sans serrer les dents, trois points :\n1. Regarde LOIN — plus il pleut, plus tu dois lever les yeux, c'est contre-intuitif et ça change tout\n2. Freine avant le virage, jamais dedans, et surtout pas sur les bandes blanches ni les plaques d'égout\n3. Les vingt premières minutes de pluie sont les pires, le gasoil remonte ; après, ça lave\nLa pluie ne rend pas la route dangereuse. La vitesse d'avant la pluie, si.",
      createdAt: hours(23), likes: 298, liked: false, comments: [
        { id: "cp433_0", authorId: "u_mehdi", text: "Le point 3, on me l'avait jamais dit clairement. Merci.", createdAt: hours(19), likes: 24, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p434", authorId: "u_greg", passion: "moto", mood: "learn", type: "text", cover: "nature",
      text: "Mon tour des pneus avant une grande sortie, trois gestes dans le garage.\n1. Les témoins d'usure, ces petits tétons au fond des rainures : si la gomme est descendue à leur niveau, le pneu est fini, même s'il a l'air propre vu de côté.\n2. Les quatre chiffres dans l'ovale sur le flanc, semaine et année de fabrication : chez moi, passé cinq ans, je remplace même si le dessin est encore beau.\n3. La pression à froid, avant de rouler : à la station, après trente bornes, la gomme a chauffé et je lis toujours plus que la vraie valeur.\nQuatre minutes, et je préfère ça à un dépannage sur une départementale du Puy-de-Dôme.",
      createdAt: hours(40), likes: 187, liked: false, comments: []},
    { id: "p435", authorId: "u_liam", passion: "podcast", mood: "learn", type: "text", cover: "studio",
      text: "Une règle que je m'applique depuis 2022 : je ne coupe jamais un rire que je n'ai pas provoqué.\nAu montage j'enlève les hésitations, les répétitions, les bruits de chaise. Mais le moment où l'invité rit tout seul, sans que j'aie rien fait pour, je le garde entier, avec les deux secondes de silence d'après — c'est là qu'on entend deux personnes dans une pièce, et plus un questionnaire.\nEssayez sur votre prochain épisode, gardez la respiration qui suit. C'est la seule chose que je sauverais d'un épisode où je n'aime toujours pas ma voix.",
      createdAt: hours(47), likes: 84, liked: false, comments: []},
    { id: "p436", authorId: "u_mehdi", passion: "sport", mood: "irl", type: "text", cover: "trail",
      text: "📍 Annecy, parking du Semnoz côté belvédère — 📅 samedi 7 h 30\nBoucle d'environ une heure et demie sur les crêtes, allure conversation, et une seule consigne : personne ne démarre sa montre. On court jusqu'à ce qu'on ait envie de rentrer, et on rentre par le chemin le plus long.\nSix personnes maximum, pour rester groupés dans la montée.\nDites-moi si vous venez, je monte un thermos et deux gobelets de trop.",
      createdAt: hours(28), likes: 176, liked: false, comments: []},
    { id: "p437", authorId: "u_clara", passion: "voyage", mood: "creation", type: "text", cover: "horizon",
      text: "Je fabrique mes sacoches de guidon depuis trois semaines. Toile enduite récupérée sur une bâche de chantier, sangles de récup, fermeture roulée comme sur les sacs étanches.\nLe proto 2 prend l'eau par la couture du bas. Le proto 3 aura la couture soudée, pas cousue. Si ça tient jusqu'aux Alpes, je publie le patron.",
      createdAt: hours(18), likes: 203, liked: false, comments: [
        { id: "cp437_0", authorId: "u_nina", text: "Le patron m'intéresse énormément. Tiens bon jusqu'aux Alpes 🚴", createdAt: hours(14), likes: 16, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p438", authorId: "u_emma", passion: "yoga", mood: "creation", type: "text", cover: "nature",
      text: "Je construis une séquence de 20 minutes pour les gens qui n'ont jamais fait de yoga et qui ont peur du sol : tout est debout ou sur une chaise.\nVersion 4 : j'ai retiré la respiration guidée du début, elle mettait tout le monde mal à l'aise. Elle revient à la fin, quand le corps a déjà lâché. Je la teste jeudi avec trois volontaires.",
      createdAt: hours(25), likes: 158, liked: false, comments: []},

    // ==== RENCONTRES RELIÉES À UNE ACTIVITÉ (2026-09-02) ====
    // Demande de Benjamin après essai : « met plus de contenu (rencontre) avec
    // le lien en bas voir l'activité ».
    //
    // ⚠️ C'est `eventId` — et lui seul — qui fait apparaître « Voir l'activité »
    // en bas de la carte : `refEvenement` (js/ui-v3-passerelle.js) le lit, puis
    // `decorerActivite` ne pose le lien QUE si `trouverEvenement` retrouve la
    // fiche. Un identifiant fantaisiste ne casse donc rien — il ne peint
    // simplement RIEN, et le défaut est invisible. Verrou :
    // `contenu-passion-mood.spec.js` ② quater, qui vérifie que chaque
    // publication reliée pointe vers une activité réellement présente.
    //
    // Deux voix par activité, jamais le même auteur : celle qui ORGANISE et
    // annonce, puis celle qui Y VA et donne envie autrement. Les deux portent la
    // ligne « 📍 lieu — 📅 jour heure » en tête, parce que c'est elle qui rend
    // l'envie lisible d'un coup d'œil.
    //
    // ⚠️ Ajoutées EN FIN de tableau : trois suites prennent `state.seed.posts[0]`
    // sans le choisir.
    { id: "p501", authorId: "u_emma", passion: "yoga", mood: "irl", type: "text", cover: "sunrise", eventId: "e6",
      text: "📍 Biarritz, plage de la Côte des Basques — 📅 samedi 7h30\nOn pose les tapis à marée basse, côté nord des cabines : une heure de pratique lente, puis vingt minutes de respiration face à l'eau. J'apporte huit tapis de prêt, il reste 6 places sur les 20, et prévoyez un pull pour la fin, le vent tourne vers 8h30.\nDites-moi en commentaire si vous venez, je compte les tapis vendredi soir.",
      createdAt: hours(3.0), likes: 142, liked: false, comments: [
        { id: "cp501_0", authorId: "u_chloé", text: "Tapis fourni ou j'amène le mien ? Et ça tient si la mer est grosse ?", createdAt: hours(2.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp501_1", authorId: "u_clara", text: "J'arrive de nuit à vélo, je serai là vers 7h15. Note-moi une place.", createdAt: hours(1.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p502", authorId: "u_nina", passion: "yoga", mood: "irl", type: "text", cover: "nature", eventId: "e6",
      text: "📍 Biarritz, plage de la Côte des Basques — 📅 samedi 7h30\nJ'y suis allée samedi dernier en traînant les pieds : 14 degrés, cinq heures de sommeil, aucune envie. Au bout de dix minutes on n'entend plus que les vagues et on arrête de compter les postures — c'est le seul cours où j'oublie de regarder l'heure.\nEmma dit qu'il reste 6 places. Si quelqu'un veut partager le trajet depuis la gare, je pars à 6h50.",
      createdAt: hours(5.8), likes: 97, liked: false, comments: [
        { id: "cp502_0", authorId: "u_emma", text: "Il reste bien 6 places, et j'ai un tapis en rab pour toi Nina.", createdAt: hours(5.2), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp502_1", authorId: "u_mehdi", text: "14 degrés à 7h30, c'est mon terrain. Je prends une place.", createdAt: hours(4.7), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p503", authorId: "u_theo", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen", eventId: "e17",
      text: "📍 Marseille, atelier du cours Julien — 📅 jeudi 19h\nJ'ouvre six bouteilles nature dès 18h pour qu'elles se réveillent : trois blancs du Jura, deux rouges ardéchois, un pét-nat de Loire. Je fais suivre des toasts à la sardine et une soupe de pois chiches, on tient douze autour de la table et il reste 4 places. Participation de 12 euros pour les bouteilles.\nÉcrivez-moi si vous venez, je passe la commande mardi matin.",
      createdAt: hours(8.6), likes: 118, liked: false, comments: [
        { id: "cp503_0", authorId: "u_lucie", text: "On peut venir sans rien y connaître ? Je sais juste que j'aime ce qui pique.", createdAt: hours(8.0), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp503_1", authorId: "u_zoe", text: "Je suis à Marseille jeudi, je prends une place.", createdAt: hours(7.5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p504", authorId: "u_hugo", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen", eventId: "e17",
      text: "📍 Marseille, atelier du cours Julien — 📅 jeudi 19h\nLa dernière fois je suis monté de Nice pour goûter et je suis reparti avec trois pages de notes sur l'acidité. Un blanc trouble qui sentait le cidre m'a appris plus sur mes desserts que deux mois d'essais : le lendemain j'ai retiré 20 grammes de sucre de ma tarte au citron, et elle est enfin buvable jusqu'au bout.\nThéo dit qu'il reste 4 places. Quelqu'un fait la route depuis Nice jeudi ?",
      createdAt: hours(11.4), likes: 86, liked: false, comments: [
        { id: "cp504_0", authorId: "u_theo", text: "Toujours 4 places. Ramène ta tarte version 12 grammes de moins, on tranchera.", createdAt: hours(10.8), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp504_1", authorId: "u_sofia", text: "Je descends de Bordeaux ce jeudi-là, c'est tentant. Ça finit vers quelle heure ?", createdAt: hours(10.3), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p505", authorId: "u_lea", passion: "musique", mood: "irl", type: "text", cover: "stage", eventId: "e12",
      text: "📍 Lyon, péniche quai Rambaud — 📅 vendredi 20h\nSept passages de quinze minutes, une guitare, une voix, pas de sono : on joue dans le carré du fond, là où le bois renvoie le son. Il reste deux créneaux de scène libres et 15 places pour écouter, et je garde une guitare de prêt pour ceux qui viennent en train.\nDites-moi en commentaire si vous jouez ou si vous écoutez, je fais l'ordre de passage jeudi soir.",
      createdAt: hours(14.2), likes: 163, liked: false, comments: [
        { id: "cp505_0", authorId: "u_tom", text: "Jamais joué devant des gens. Il reste vraiment un créneau ou c'est déjà plein ?", createdAt: hours(13.6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp505_1", authorId: "u_liam", text: "Je note vendredi 20h. Tu acceptes qu'on enregistre pour un épisode, micro discret ?", createdAt: hours(13.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p506", authorId: "u_oussa", passion: "musique", mood: "irl", type: "text", cover: "stage", eventId: "e12",
      text: "📍 Lyon, péniche quai Rambaud — 📅 vendredi 20h\nJe monte de Saint-Denis pour la troisième fois. J'y vais officiellement pour capter deux minutes de son de salle avec mon micro, et je repars toujours avec autre chose : la dernière fois un gars a cassé une corde au milieu du morceau, il l'a fini sur cinq cordes et personne n'a bougé.\nLéa dit qu'il reste 15 places. Si quelqu'un a un pied de micro à prêter vendredi, faites signe.",
      createdAt: hours(17.0), likes: 74, liked: false, comments: [
        { id: "cp506_0", authorId: "u_lea", text: "Pied de micro trouvé, je te le mets de côté. Et oui, 15 places encore.", createdAt: hours(16.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp506_1", authorId: "u_karim", text: "Je passe faire des photos si ça ne gêne personne. Lumière basse, sans flash.", createdAt: hours(15.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p507", authorId: "u_lou", passion: "art", mood: "irl", type: "text", cover: "workshop", eventId: "e7",
      text: "📍 Uzès, atelier rue Boucairie — 📅 dimanche 14h\nTrois heures au tour, un kilo de grès chamotté par personne, et un seul objectif : un bol qui tient debout. Je garde les pièces pour la cuisson, vous les récupérez trois semaines plus tard — et je préviens tout de suite, la moitié s'effondre au centrage, c'est normal. Il reste 5 places sur 8, tabliers fournis.\nDites-moi en commentaire si vous êtes gaucher, je prépare les tours dans l'autre sens.",
      createdAt: hours(19.8), likes: 131, liked: false, comments: [
        { id: "cp507_0", authorId: "u_paul", text: "Ça se compare au tournage sur bois ? Je viens voir, gaucher accessoirement.", createdAt: hours(19.2), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp507_1", authorId: "u_zoe", text: "Je prends une place. Je crisperai les doigts quand même, prévenue ou pas.", createdAt: hours(18.7), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p508", authorId: "u_inès", passion: "art", mood: "irl", type: "text", cover: "workshop", eventId: "e7",
      text: "📍 Uzès, atelier rue Boucairie — 📅 dimanche 14h\nJ'ai fait la séance de mars pendant deux semaines dans le Gard, et j'ai raté mes quatre premiers bols avant d'en sortir un de travers. Ce que je n'attendais pas, c'est l'effet sur mes dessins : depuis, je pose la main entière sur la feuille au lieu de crisper trois doigts sur le crayon.\nLou dit qu'il reste 5 places sur 8. J'y retourne dimanche et je peux prendre deux personnes en voiture depuis Nîmes, qui vient ?",
      createdAt: hours(22.6), likes: 109, liked: false, comments: [
        { id: "cp508_0", authorId: "u_lou", text: "Cinq places, oui. Et ton bol de travers, je l'ai gardé sur l'étagère du haut.", createdAt: hours(22.0), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp508_1", authorId: "u_lucie", text: "Je suis intéressée par la voiture depuis Nîmes. Départ vers quelle heure ?", createdAt: hours(21.5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p509", authorId: "u_inès", passion: "art", mood: "irl", type: "text", cover: "studio", eventId: "e20",
      text: "📍 Nantes, galerie Sainte-Croix — 📅 jeudi 18h30\nJ'accroche quatorze planches à l'encre, dont six refusées par l'éditeur l'an dernier, et je laisse les esquisses ratées épinglées juste à côté des versions finales. Ce n'est pas une galerie chic : trente mètres carrés, plafond bas, du cidre dans des gobelets. La jauge est à 40, il reste 12 places.\nDites-moi en commentaire si vous passez, je réponds à tout le monde ce soir.",
      createdAt: hours(25.4), likes: 188, liked: false, comments: [
        { id: "cp509_0", authorId: "u_lou", text: "Les ratés épinglés à côté des finales, c'est exactement ce que je viendrais voir. Tu les vends aussi ?", createdAt: hours(24.8), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp509_1", authorId: "u_sofia", text: "Noté jeudi 18h30. Il y aura un texte accroché ou seulement les planches ?", createdAt: hours(24.3), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p510", authorId: "u_karim", passion: "art", mood: "irl", type: "text", cover: "street", eventId: "e20",
      text: "📍 Nantes, galerie Sainte-Croix — 📅 jeudi 18h30\nJ'ai exposé dans cette pièce basse de plafond il y a deux ans, huit tirages punaisés au mur, et j'y ai appris un truc que personne ne m'avait dit : à trente personnes dans trente mètres carrés, on ne regarde plus les images, on écoute les gens en parler. C'est pour ça que j'y retourne, cette fois en simple visiteur.\nInès dit qu'il reste 12 places sur 40. Je descends de Paris jeudi vers 15h, deux sièges libres dans la voiture.",
      createdAt: hours(28.2), likes: 124, liked: false, comments: [
        { id: "cp510_0", authorId: "u_inès", text: "Toujours 12 places. Viens tôt, à 19h on ne voit plus les murs.", createdAt: hours(27.6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp510_1", authorId: "u_noa", text: "Je prends un siège dans la voiture si c'est encore libre. Retour le soir même ?", createdAt: hours(27.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p511", authorId: "u_noa", passion: "cinema", mood: "irl", type: "text", cover: "dark_matter", eventId: "e10",
      text: "📍 Paris, salle associative rue de Charonne — 📅 mardi 20h\nOn projette une copie restaurée en 2K d'un polar de 1954, 88 minutes, et je reste vingt minutes après la séance pour montrer deux plans avant et après restauration sur mon écran. Pas de bar, apportez votre thermos. Trente-cinq fauteuils, il reste 9 places.\nDites-moi en commentaire si vous venez : j'ouvre la porte à 19h45 et je ne la rouvre pas après le générique de début.",
      createdAt: hours(31.0), likes: 152, liked: false, comments: [
        { id: "cp511_0", authorId: "u_liam", text: "Les deux plans avant/après, tu les commentes en direct ? Je prends une place.", createdAt: hours(30.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp511_1", authorId: "u_tom", text: "88 minutes un mardi, ça se tente. C'est bien 20h pile, la porte ?", createdAt: hours(29.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p512", authorId: "u_zoe", passion: "cinema", mood: "irl", type: "text", cover: "neon", eventId: "e10",
      text: "📍 Paris, salle associative rue de Charonne — 📅 mardi 20h\nJe viens pour les costumes et je repars chaque fois avec autre chose. À la dernière séance j'ai compris que le grain restauré change la couleur des tissus : un manteau que je croyais gris était vert bouteille. J'ai pris trois photos de l'écran, toutes floues, et j'ai quand même refait un col dessus le week-end suivant.\nNoa dit qu'il reste 9 places sur 35. Qui vient mardi ? J'arrive à 19h40, la porte ferme au générique.",
      createdAt: hours(33.8), likes: 93, liked: false, comments: [
        { id: "cp512_0", authorId: "u_noa", text: "Vert bouteille, confirmé. Il reste 9 places, je te garde le fauteuil du fond.", createdAt: hours(33.2), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp512_1", authorId: "u_karim", text: "Je viens avec toi, rendez-vous rue de Charonne à 19h35 ?", createdAt: hours(32.7), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p513", authorId: "u_jona", passion: "sport", mood: "irl", type: "text", cover: "neon", eventId: "e9",
      text: "📍 Chamonix, salle de bloc route des Pèlerins — 📅 jeudi 21h\nOn grimpe quand tout le monde est parti : deux heures de bloc entre 5c et 6b, lumières basses, enceinte coupée après 22h.\nJe garde dix minutes à la fin pour travailler la respiration avant un pas qui fait peur, c'est ce qui m'a débloqué mon premier 6c à 34 ans.\nIl reste 5 places sur 12, chaussons en prêt du 39 au 44.\nTu viens ? Dis-moi ta pointure ici, je les mets de côté.",
      createdAt: hours(36.6), likes: 143, liked: false, comments: [
        { id: "cp513_0", authorId: "u_mehdi", text: "Je descends d'Annecy, 1h15 de route. Je grimpe du 5b tranquille, je ne vais pas plomber la séance ?", createdAt: hours(36.0), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp513_1", authorId: "u_emma", text: "Les dix dernières minutes m'intéressent plus que le mur, franchement. Je prends une place.", createdAt: hours(35.5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p514", authorId: "u_mehdi", passion: "sport", mood: "irl", type: "text", cover: "dark_matter", eventId: "e9",
      text: "📍 Chamonix, salle de bloc route des Pèlerins — 📅 jeudi 21h\nJ'y suis allé jeudi dernier en traînant les pieds : je cours, je ne grimpe pas, et j'ai passé vingt minutes bloqué sur un 5b à cause d'un pied mal posé.\nCe que j'ai appris sans le chercher, c'est que je respire n'importe comment dès que ça devient vertical, et que ça s'entend aussi dans les montées à l'entraînement.\nIl reste des places pour jeudi, on était neuf la dernière fois.\nQuelqu'un d'Annecy veut partager la voiture, départ 20h ?",
      createdAt: hours(39.4), likes: 88, liked: false, comments: [
        { id: "cp514_0", authorId: "u_emma", text: "Le souffle qui lâche dès que c'est vertical, je le vois chaque semaine sur les tapis. Je note jeudi.", createdAt: hours(38.8), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp514_1", authorId: "u_clara", text: "Jamais grimpé de ma vie, je pédale c'est tout. Ça se tente sans se ridiculiser ?", createdAt: hours(38.3), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p515", authorId: "u_lea", passion: "musique", mood: "irl", type: "text", cover: "stage", eventId: "e1",
      text: "📍 Lyon, local de répétition rue Sébastien Gryphe — 📅 samedi 15h\nTrois accords, un tempo à 90, et on tourne : chacun joue huit mesures pendant que les autres tiennent le rythme.\nJ'amène deux guitares de prêt et un ampli à quatre entrées, viens avec un jack si tu en as un qui traîne.\nIl reste 4 places sur 10, et personne n'est trop débutant : le mois dernier quelqu'un avait acheté sa guitare l'avant-veille.\nTu tiens La mineur, Do, Sol ? Dis-le ici et je te garde une chaise.",
      createdAt: hours(42.2), likes: 176, liked: false, comments: [
        { id: "cp515_0", authorId: "u_oussa", text: "Je peux venir avec ma boîte à rythmes plutôt qu'une guitare ? Je tiens le tempo bien mieux que les accords.", createdAt: hours(41.6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp515_1", authorId: "u_tom", text: "Jamais joué avec d'autres gens. J'ai surtout peur de casser le morceau de tout le monde.", createdAt: hours(41.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p516", authorId: "u_oussa", passion: "musique", mood: "irl", type: "text", cover: "studio", eventId: "e1",
      text: "📍 Lyon, local de répétition rue Sébastien Gryphe — 📅 samedi 15h\nJ'y suis entré en mars, de passage chez ma sœur à Villeurbanne, avec une boîte à rythmes et zéro accord en tête.\nAu bout de vingt minutes plus personne ne regardait ses doigts : quand quelqu'un se plante, les autres continuent et le morceau se répare tout seul. C'est exactement ce que je n'obtiens jamais seul devant mon écran.\nIl reste des places samedi, on était sept la dernière fois.\nSi tu hésites parce que tu joues mal, viens : c'est le niveau de la salle.",
      createdAt: hours(45.0), likes: 121, liked: false, comments: [
        { id: "cp516_0", authorId: "u_lea", text: "Ta boîte à rythmes a sauvé le passage où on accélérait tous en même temps. Reviens quand tu veux.", createdAt: hours(44.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp516_1", authorId: "u_amira", text: "Je peux venir danser dans un coin pendant que vous jouez, ou c'est bizarre ?", createdAt: hours(43.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p517", authorId: "u_karim", passion: "photo", mood: "irl", type: "text", cover: "sunrise", eventId: "e2",
      text: "📍 Paris, pont de Bir-Hakeim côté rive droite — 📅 dimanche 6h40\nOn se retrouve avant le jour, le soleil passe au-dessus des toits vers 7h10 et éclaire les piliers un quart d'heure, ensuite la lumière devient plate et on va boire un café.\nOn descend jusqu'au port de Grenelle, je passe voir vos réglages un par un : l'enjeu du matin, c'est de tenir le 1/60 sans trembler.\nIl reste 6 places sur 15, téléphone accepté, vraiment.\nTu es du matin ? Réponds ici, j'envoie le point de rendez-vous exact la veille au soir.",
      createdAt: hours(47.8), likes: 209, liked: false, comments: [
        { id: "cp517_0", authorId: "u_inès", text: "Je viendrais avec un carnet et un crayon plutôt qu'un boîtier, ça passe ?", createdAt: hours(47.2), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp517_1", authorId: "u_nina", text: "Je suis à Paris jusqu'à mardi, je prends une des six places avant de changer d'avis.", createdAt: hours(46.7), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p518", authorId: "u_noa", passion: "photo", mood: "irl", type: "text", cover: "street", eventId: "e2",
      text: "📍 Paris, pont de Bir-Hakeim côté rive droite — 📅 dimanche 6h40\nLa première fois j'ai failli annuler à 5h50 : il pleuvait et je me voyais déjà rentrer me coucher.\nOn a passé vingt minutes sous les piliers à photographier les flaques, et c'est la seule série de l'été que je garde encore sur mon disque.\nCe qu'on apprend sans le chercher : à cette heure-là il n'y a personne, donc on arrête de courir après la carte postale et on ralentit.\nIl reste des places dimanche. Quelqu'un veut prendre le premier métro depuis Nation avec moi ?",
      createdAt: hours(50.6), likes: 97, liked: false, comments: [
        { id: "cp518_0", authorId: "u_karim", text: "Ta série de flaques, je la ressors chaque fois qu'on me dit que la météo est mauvaise.", createdAt: hours(50.0), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp518_1", authorId: "u_zoe", text: "6h40 un dimanche, j'ai besoin que quelqu'un me tienne responsable. Je m'inscris.", createdAt: hours(49.5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p519", authorId: "u_amira", passion: "sport", mood: "irl", type: "text", cover: "street", eventId: "e11",
      text: "📍 Lille, skatepark de la Halle de glisse — 📅 samedi 14h\nDeux heures de bowl ouvert à tout le monde, puis une heure de jam sur la partie street : une figure chacun son tour, et si tu tombes tu repasses derrière tout le monde.\nJe branche une enceinte sur du vieux boom bap et je danse entre les runs parce que je suis nulle en skate, c'est comme ça depuis trois éditions.\nIl reste 8 places sur 30, casque conseillé, j'en ai deux en prêt.\nTu viens rouler ou tu viens regarder ? Dis-le ici, ça m'aide à caler le créneau débutants de 14h à 15h.",
      createdAt: hours(53.4), likes: 152, liked: false, comments: [
        { id: "cp519_0", authorId: "u_tom", text: "Je roule comme un pied mais je filme correctement. Ça vous rend service ou ça vous saoule ?", createdAt: hours(52.8), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp519_1", authorId: "u_zoe", text: "J'apporte du fil et des chutes de cuir pour les chaussures explosées, comme la dernière fois.", createdAt: hours(52.3), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p520", authorId: "u_zoe", passion: "sport", mood: "irl", type: "text", cover: "workshop", eventId: "e11",
      text: "📍 Lille, skatepark de la Halle de glisse — 📅 samedi 14h\nJe monte de Paris pour ça, une heure de train, et j'y vais surtout pour les chaussures : à la dernière jam j'ai recousu quatre paires au bord du bowl, fil de 40 et alène.\nOn apprend vite qu'une basket craque toujours au même endroit, sur l'ollie, côté petit orteil. J'ai commencé à doubler cette zone sur mes propres pièces.\nIl reste des places samedi, on était une vingtaine la fois d'avant.\nRamène tes paires mortes, je m'installe à 14h avec la machine à main.",
      createdAt: hours(56.2), likes: 118, liked: false, comments: [
        { id: "cp520_0", authorId: "u_amira", text: "Tu es la seule à repartir d'une jam avec plus de travail que d'énergie. Place gardée.", createdAt: hours(55.6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp520_1", authorId: "u_rita", text: "Le renfort au petit orteil, je veux voir ça de près. Tu fais ça sur quelle épaisseur de cuir ?", createdAt: hours(55.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p521", authorId: "u_theo", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen", eventId: "e3",
      text: "📍 Marseille, cuisine partagée rue Consolat — 📅 vendredi 19h30\nChacun arrive avec un plat qu'il a raté au moins une fois et on refait ensemble le geste qui coince : vendredi dernier c'était une hollandaise tranchée, remontée avec une cuillère d'eau froide et trois minutes de fouet.\nJe fournis le feu, les plaques et un poulet de 1,8 kg pour ceux qui arrivent les mains vides.\nIl reste 3 places sur 12, participation aux courses 8 €.\nDis-moi ce que tu rates, je prépare le plan de travail en conséquence.",
      createdAt: hours(59.0), likes: 231, liked: false, comments: [
        { id: "cp521_0", authorId: "u_lucie", text: "Je peux descendre des tomates de fin de saison, il m'en reste 6 kg au jardin.", createdAt: hours(58.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp521_1", authorId: "u_sofia", text: "Je rate systématiquement ma pâte brisée, elle se rétracte à la cuisson. Je prends une place.", createdAt: hours(57.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p522", authorId: "u_hugo", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen", eventId: "e3",
      text: "📍 Marseille, cuisine partagée rue Consolat — 📅 vendredi 19h30\nJe monte de Nice pour la troisième fois, deux heures de train avec un moule à tarte sur les genoux.\nCe qui m'a le plus servi, ce n'est pas une recette : c'est d'entendre six personnes goûter ma crème sans sucre ajouté et me dire qu'elle était fade. Personne ne me le dit en boutique.\nIl reste des places vendredi, on était onze la dernière fois.\nQuelqu'un arrive à Saint-Charles vers 19h ? On peut descendre à pied ensemble.",
      createdAt: hours(61.8), likes: 134, liked: false, comments: [
        { id: "cp522_0", authorId: "u_theo", text: "Ta crème est passée de fade à juste en deux essais. Ramène la version 3, on la refait devant tout le monde.", createdAt: hours(61.2), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp522_1", authorId: "u_lou", text: "Je peux venir avec des assiettes qui sortent du four samedi, elles ne serviront à rien avant.", createdAt: hours(60.7), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p523", authorId: "u_yanis", passion: "tech", mood: "irl", type: "text", cover: "tech", eventId: "e5",
      text: "📍 Toulouse, coworking rue Gabriel Péri — 📅 mardi 18h30\nDeux heures, zéro ligne de code : on prend une tâche que tu fais vraiment chaque semaine, on l'écrit en français, et on la fait tourner jusqu'à ce que le résultat soit utilisable tel quel.\nApporte ton ordinateur et un exemple à toi, un mail type, un tableau, une fiche : sans exemple réel, la soirée ne sert à rien.\nIl reste 4 places sur 14, dont deux que je garde pour des gens qui n'ont jamais rien essayé.\nRaconte-moi ta tâche en commentaire, je regarde si elle tient en deux heures.",
      createdAt: hours(64.6), likes: 187, liked: false, comments: [
        { id: "cp523_0", authorId: "u_lucie", text: "Ma tâche : trier les questions des adhérents du jardin partagé, environ 40 mails par semaine. Ça rentre ?", createdAt: hours(64.0), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp523_1", authorId: "u_raph", text: "Je viendrais surtout observer où les gens décrochent. Tu acceptes les curieux au fond de la salle ?", createdAt: hours(63.5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p524", authorId: "u_sofia", passion: "tech", mood: "irl", type: "text", cover: "book", eventId: "e5",
      text: "📍 Toulouse, coworking rue Gabriel Péri — 📅 mardi 18h30\nJe suis venue de Bordeaux persuadée d'être la plus larguée de la salle, avec mes fiches de lecture tapées à la main depuis douze ans.\nEn deux heures ma fiche type est devenue un modèle que je réutilise chaque semaine, et surtout j'ai compris que la moitié du travail consistait à écrire clairement ce que je voulais, ce qui est mon métier depuis toujours.\nIl reste des places mardi : on était douze, et trois personnes n'avaient jamais ouvert ce genre d'outil.\nSi tu viens du côté de Bordeaux, je reprends le train de 21h47, on peut faire le trajet ensemble.",
      createdAt: hours(67.4), likes: 143, liked: false, comments: [
        { id: "cp524_0", authorId: "u_yanis", text: "Tes fiches étaient le meilleur exemple de la soirée, je les cite à chaque session maintenant.", createdAt: hours(66.8), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp524_1", authorId: "u_anaïs", text: "Douze ans de fiches à la main, je ne sais pas si j'arriverais à lâcher le papier. Tu l'as vécu comment ?", createdAt: hours(66.3), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p525", authorId: "u_theo", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen", eventId: "e33",
      text: "📍 Marseille, brasserie de la Friche Belle de Mai — 📅 jeudi 19h\nOn goûte six bières à l'aveugle, et pour chacune je sors une bouchée qui la contredit : la stout avec un morceau de comté vieux, l'IPA avec une sardine grillée. Le but c'est de sentir où ça casse, pas de dire que c'est bon.\nIl reste 5 places sur 18, on est dans la salle du fond.\nDis-moi si tu viens, je compte les verres ce soir.",
      createdAt: hours(70.2), likes: 142, liked: false, comments: [
        { id: "cp525_0", authorId: "u_hugo", text: "Je descends de Nice jeudi, garde-moi un tabouret. La sardine avec l'IPA j'y crois moyen, on verra bien.", createdAt: hours(69.6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp525_1", authorId: "u_nina", text: "Six à l'aveugle un jeudi soir, on recrache entre deux ou pas ? Je bosse vendredi 8h.", createdAt: hours(69.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p526", authorId: "u_hugo", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen", eventId: "e33",
      text: "📍 Marseille, brasserie de la Friche Belle de Mai — 📅 jeudi 19h\nJ'étais au tasting de juin. Ce que je ne cherchais pas et que j'ai appris : une bière très amère écrase le sucre d'un dessert, donc mes tartes citron je les sers maintenant avec une blanche.\nJ'y retourne jeudi, il reste 5 places.\nSi quelqu'un monte de Nice en train, je prends le 16h12, dites-le ici.",
      createdAt: hours(73.0), likes: 88, liked: false, comments: [
        { id: "cp526_0", authorId: "u_theo", text: "Le 16h12 arrive pile. Viens à 18h45 si tu veux voir la mise en place des bouchées.", createdAt: hours(72.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp526_1", authorId: "u_lou", text: "L'amertume qui écrase le sucre, je note pour mes glaçages. Trop loin pour jeudi, raconte après.", createdAt: hours(71.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p527", authorId: "u_zoe", passion: "mode", mood: "irl", type: "text", cover: "workshop", eventId: "e34",
      text: "📍 Paris 11e, atelier rue Saint-Maur — 📅 samedi 14h\nApportez une chemise d'homme trop grande : on la coupe en haut à bretelles, patron maison, trois heures montre en main. J'ai quatre machines, du fil noir et écru, et deux ciseaux cranteurs à se partager.\nIl reste 3 places sur 10, tout le reste est fourni.\nÉcris-moi la taille de ta chemise, je prépare les biais en conséquence.",
      createdAt: hours(75.8), likes: 176, liked: false, comments: [
        { id: "cp527_0", authorId: "u_rita", text: "Je prends une place, j'arrive de Dakar vendredi soir. J'amène deux coupons de wax si ça t'intéresse pour la démo.", createdAt: hours(75.2), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp527_1", authorId: "u_inès", text: "Je n'ai jamais touché une machine de ma vie, c'est rédhibitoire ou pas ?", createdAt: hours(74.7), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p528", authorId: "u_rita", passion: "mode", mood: "irl", type: "text", cover: "workshop", eventId: "e34",
      text: "📍 Paris 11e, atelier rue Saint-Maur — 📅 samedi 14h\nJ'ai fait l'atelier en mars avec une chemise de mon père, trop large de deux tailles. Je pensais repartir avec un truc bancal, je porte le haut depuis.\nCe qu'on apprend sans le chercher : découdre proprement prend plus de temps que coudre, et c'est là que tout se joue.\nIl reste 3 places samedi. Si tu hésites parce que tu débutes, dis-le ici, on était quatre dans ce cas.",
      createdAt: hours(78.6), likes: 64, liked: false, comments: [
        { id: "cp528_0", authorId: "u_zoe", text: "Je confirme, je compte 40 minutes de décousage minimum. Viens un quart d'heure avant, on choisit le fil ensemble.", createdAt: hours(78.0), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp528_1", authorId: "u_lou", text: "Deux tailles trop large, c'est exactement ma pile de chemises. Il reste vraiment de la place ?", createdAt: hours(77.5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p529", authorId: "u_liam", passion: "podcast", mood: "irl", type: "text", cover: "studio", eventId: "e35",
      text: "📍 Montréal, Mile End, studio de la rue Bernard — 📅 mardi 19h30\nOn enregistre l'épisode 42 devant vous : deux micros ouverts, un invité qui raconte son métier pendant cinquante minutes. Vos questions passent au dernier quart d'heure et elles restent au montage, je ne coupe que les blancs.\nIl reste 8 places sur 30, entrée libre mais je compte les chaises.\nDis-moi si tu viens, je mets ton prénom sur la liste à la porte.",
      createdAt: hours(81.4), likes: 121, liked: false, comments: [
        { id: "cp529_0", authorId: "u_anaïs", text: "Je serai là, j'arrive de Québec en fin d'après-midi. Ma question est déjà écrite.", createdAt: hours(80.8), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp529_1", authorId: "u_noa", text: "Tu gardes les questions au montage même les mauvaises ? Courageux. Je regarderai le rendu.", createdAt: hours(80.3), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p530", authorId: "u_anaïs", passion: "podcast", mood: "irl", type: "text", cover: "studio", eventId: "e35",
      text: "📍 Montréal, Mile End, studio de la rue Bernard — 📅 mardi 19h30\nJ'étais au live de l'épisode 39. Ce qui m'a servi ensuite dans mes lectures publiques : Liam laisse trois secondes de silence avant de relancer, et c'est là que l'invité lâche la vraie phrase.\nJ'avais peur d'être celle qui tousse dans le micro. En vrai personne ne t'écoute, tout le monde écoute la table.\nIl reste 8 places mardi, viens, on prend une bière après.",
      createdAt: hours(84.2), likes: 73, liked: false, comments: [
        { id: "cp530_0", authorId: "u_liam", text: "Les trois secondes, je les ai volées à une monteuse. Ta place est déjà notée.", createdAt: hours(83.6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp530_1", authorId: "u_sofia", text: "Le silence avant la relance, je le tente vendredi à la librairie. Merci pour l'astuce.", createdAt: hours(83.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p531", authorId: "u_mila", passion: "danse", mood: "irl", type: "text", cover: "dance", eventId: "e36",
      text: "📍 Ajaccio, salle du Diamant, quai Napoléon — 📅 dimanche 10h\nJam contemporaine, deux heures : vingt minutes de sol pour chauffer, puis on ouvre l'espace, entrées et sorties libres, aucune chorégraphie. Parquet, pieds nus ou chaussettes, je mets la musique en boucle et je ne parle presque pas.\nIl reste 6 places sur 22, et j'ai quatre débutants à chaque fois.\nRéponds ici si tu viens, j'ouvre la porte à 9h45.",
      createdAt: hours(87.0), likes: 97, liked: false, comments: [
        { id: "cp531_0", authorId: "u_amira", text: "Je suis en Corse toute la semaine, je pose une place pour dimanche.", createdAt: hours(86.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp531_1", authorId: "u_emma", text: "Deux heures pieds nus, mes chevilles disent oui. On peut arriver après le sol ou ça coupe le truc ?", createdAt: hours(85.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p532", authorId: "u_amira", passion: "danse", mood: "irl", type: "text", cover: "dance", eventId: "e36",
      text: "📍 Ajaccio, salle du Diamant, quai Napoléon — 📅 dimanche 10h\nJe viens du hip-hop, et ma première jam contemporaine chez Mila je l'ai passée collée au mur pendant vingt-cinq minutes. Ce qui m'a débloquée : elle ne corrige personne, donc il n'y a rien à rater.\nCe qu'on apprend sans le chercher, c'est de regarder les autres pour entrer, pas pour se comparer.\nIl reste 6 places dimanche. Si tu débutes, viens avec moi, on se met au fond.",
      createdAt: hours(89.8), likes: 58, liked: false, comments: [
        { id: "cp532_0", authorId: "u_mila", text: "Le mur fait partie du truc, personne ne compte les minutes. À dimanche.", createdAt: hours(89.2), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp532_1", authorId: "u_lea", text: "Vingt-cinq minutes contre un mur, ça me parle beaucoup trop. Il faut s'inscrire ou on arrive ?", createdAt: hours(88.7), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p533", authorId: "u_sofia", passion: "litterature", mood: "irl", type: "text", cover: "book", eventId: "e37",
      text: "📍 Bordeaux, librairie de la rue Sainte-Colombe — 📅 vendredi 18h30\nUn auteur invité, une heure de lecture et de questions, et la règle de la maison : on a lu au moins trente pages avant de venir, sinon on écoute. Je prépare six questions, les vôtres passent avant les miennes.\nIl reste 7 places sur 25, chaises pliantes au fond.\nDis-moi si tu viens et où tu en es dans le livre, je fais tourner les exemplaires d'occasion.",
      createdAt: hours(92.6), likes: 110, liked: false, comments: [
        { id: "cp533_0", authorId: "u_inès", text: "Je monte de Nantes vendredi midi. Je peux dessiner pendant la lecture ou ça gêne l'auteur ?", createdAt: hours(92.0), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp533_1", authorId: "u_anaïs", text: "Trente pages minimum, j'adopte la règle pour mon cercle à Québec. J'en suis à la moitié.", createdAt: hours(91.5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p534", authorId: "u_inès", passion: "litterature", mood: "irl", type: "text", cover: "book", eventId: "e37",
      text: "📍 Bordeaux, librairie de la rue Sainte-Colombe — 📅 vendredi 18h30\nJ'y étais en mai, carnet sur les genoux, quatre pages de croquis pendant la lecture. J'y retourne vendredi.\nLe truc que je n'attendais pas : entendre l'auteur lire change le rythme que je mettais dans ma tête, et depuis je lis mes dialogues à voix haute avant de les mettre en cases.\nIl reste 7 places, et les chaises du fond voient très bien. Dis-moi si tu viens, on partage un exemplaire.",
      createdAt: hours(95.4), likes: 49, liked: false, comments: [
        { id: "cp534_0", authorId: "u_sofia", text: "Dessine, la dernière fois deux personnes t'ont demandé ton carnet. Je te garde une place devant.", createdAt: hours(94.8), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp534_1", authorId: "u_anaïs", text: "Lire ses dialogues à voix haute, c'est le meilleur conseil qu'on m'ait donné aussi.", createdAt: hours(94.3), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p535", authorId: "u_hugo", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen", eventId: "e38",
      text: "📍 Nice, cuisine partagée du port, rue Bonaparte — 📅 samedi 9h30\nTrois heures sur une seule recette : mousse chocolat à l'aquafaba, sans œuf, sans crème. On monte le jus de pois chiches au fouet à la main d'abord, pour comprendre pourquoi ça tient, puis au batteur. Chacun repart avec quatre pots.\nIl reste 4 places sur 12, tabliers fournis, prévoyez une glacière.\nDis-moi si tu viens, je pèse le chocolat vendredi soir.",
      createdAt: hours(98.2), likes: 203, liked: false, comments: [
        { id: "cp535_0", authorId: "u_chloé", text: "Je prends une place, j'arrive d'Aix vers 9h. On peut remplacer le sucre par du sirop d'érable ou ça casse la tenue ?", createdAt: hours(97.6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp535_1", authorId: "u_theo", text: "Monter l'aquafaba à la main, ça va calmer tout le monde en dix minutes. Très bonne idée.", createdAt: hours(97.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p536", authorId: "u_chloé", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen", eventId: "e38",
      text: "📍 Nice, cuisine partagée du port, rue Bonaparte — 📅 samedi 9h30\nJ'ai fait le workshop de juillet et j'ai raté ma première mousse : trop de chocolat chaud versé d'un coup, tout est retombé en cinq minutes. Hugo m'a fait recommencer, la deuxième a tenu 48 heures au frigo.\nCe qu'on apprend sans le chercher, c'est la patience du versement, rien d'autre.\nIl reste 4 places samedi. Si tu viens d'Aix, j'ai deux sièges dans la voiture, dis-le ici.",
      createdAt: hours(101.0), likes: 132, liked: false, comments: [
        { id: "cp536_0", authorId: "u_hugo", text: "Sa deuxième était meilleure que la mienne, je l'ai goûtée. Les deux sièges partent vite.", createdAt: hours(100.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp536_1", authorId: "u_lucie", text: "Deux jours au frigo sans retomber, ça me convainc. Il reste vraiment de la place samedi ?", createdAt: hours(99.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p537", authorId: "u_nina", passion: "voyage", mood: "irl", type: "text", cover: "trail", eventId: "e23",
      text: "📍 Cassis, parking du col de la Gineste — 📅 samedi 9h\nOn marche 11 km sur le sentier des crêtes avec trois arrêts : tapenade au premier col, chèvre d'une ferme de Roquefort-la-Bédoule à mi-parcours, et une part de tarte au citron face à Port-Miou. Chacun porte son eau, 1,5 L minimum, il n'y a aucun ravitaillement après le départ. Il reste 6 places sur 15 et je bloque les inscriptions vendredi soir pour commander la bonne quantité de fromage. Dites-moi en commentaire si vous avez une allergie, j'adapte les paniers.",
      createdAt: hours(103.8), likes: 137, liked: false, comments: [
        { id: "cp537_0", authorId: "u_clara", text: "Je suis dans le coin jusqu'à dimanche, je prends une place. Le sentier est ombragé sur quelle portion ?", createdAt: hours(103.2), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp537_1", authorId: "u_hugo", text: "Possible sans lactose pour le fromage ? Sinon j'apporte une tarte, j'ai un fond de pâte à écouler.", createdAt: hours(102.7), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p538", authorId: "u_theo", passion: "voyage", mood: "irl", type: "text", cover: "nature", eventId: "e23",
      text: "📍 Cassis, parking du col de la Gineste — 📅 samedi 9h\nJ'y étais en juin en pensant que c'était une balade avec du fromage au milieu. En vrai j'ai surtout appris à quel moment on sort la tapenade : après la montée, jamais avant, sinon plus personne ne repart. J'avais aussi surestimé mes chaussures de ville, deux ampoules au retour, prenez une semelle qui tient. Il reste des places samedi, je refais le trajet avec un vrai sac cette fois.",
      createdAt: hours(106.6), likes: 98, liked: false, comments: [
        { id: "cp538_0", authorId: "u_amira", text: "Ampoules notées. Ça passe si je ne cours jamais de l'année ?", createdAt: hours(106.0), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp538_1", authorId: "u_lou", text: "La tapenade après la montée et pas avant, je n'y avais jamais pensé dans cet ordre.", createdAt: hours(105.5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p539", authorId: "u_sofia", passion: "litterature", mood: "irl", type: "text", cover: "book", eventId: "e14",
      text: "📍 Bordeaux, arrière-salle du café de la rue des Faussets — 📅 jeudi 19h30\nCe mois-ci on lit Le Ravissement de Lol V. Stein, 190 pages environ, et on ne raconte pas l'intrigue : chacun arrive avec un passage souligné et une raison. Je limite à 9 personnes parce que la table n'en prend pas plus et qu'au-delà les timides ne parlent jamais. Il reste 3 chaises pour jeudi. Écrivez-moi le passage que vous voulez lire à voix haute, ça m'aide à faire l'ordre de la soirée.",
      createdAt: hours(109.4), likes: 76, liked: false, comments: [
        { id: "cp539_0", authorId: "u_noa", text: "Je n'ai jamais lu Duras, je peux venir quand même ou je vais ramer toute la soirée ?", createdAt: hours(108.8), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp539_1", authorId: "u_inès", text: "Je viens de Nantes, j'en prends une. Mon passage fait douze lignes, c'est trop long ?", createdAt: hours(108.3), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p540", authorId: "u_anaïs", passion: "litterature", mood: "irl", type: "text", cover: "book", eventId: "e14",
      text: "📍 Bordeaux, café-librairie rue Saint-James — 📅 mardi 19h\nJe suis de passage jusqu'en octobre et j'y suis allée le mois dernier sans avoir fini le livre : personne ne me l'a reproché, on m'a juste demandé où je m'étais arrêtée. Ce qu'on y gagne sans le chercher, c'est d'entendre lire à voix haute par quelqu'un qui n'a pas votre accent — le même paragraphe change de rythme. Il reste 5 places et la table du fond est petite.",
      createdAt: hours(112.2), likes: 112, liked: false, comments: [
        { id: "cp540_0", authorId: "u_sofia", text: "Cinq places, et tu peux revenir avec Perec pas fini autant de fois que tu veux.", createdAt: hours(111.6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp540_1", authorId: "u_inès", text: "C'est lire devant douze personnes qui me bloque. On a le droit de passer son tour ?", createdAt: hours(111.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p541", authorId: "u_emma", passion: "sport", mood: "irl", type: "text", cover: "horizon", eventId: "e28",
      text: "📍 Biarritz, plage de la Milady — 📅 vendredi 19h15\nOn démarre par vingt minutes au sol : respiration, épaules, et comment se relever sur la planche sans se tordre le dos. Ensuite deux heures à l'eau pendant que le soleil descend, avec huit planches en mousse et trois combinaisons en taille S, le reste en M et L. Il reste 4 places sur 12, l'eau est à 19 degrés, prévoyez un pull sec pour après. Donnez-moi votre taille en commentaire, je réserve la combinaison à votre nom.",
      createdAt: hours(115.0), likes: 184, liked: false, comments: [
        { id: "cp541_0", authorId: "u_mila", text: "M pour moi. Je n'ai jamais enfilé une combinaison, ça se met comment sans y passer dix minutes ?", createdAt: hours(114.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp541_1", authorId: "u_zoe", text: "Une L et je prends la place. Ma sœur suit si une autre se libère.", createdAt: hours(113.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p542", authorId: "u_chloé", passion: "sport", mood: "irl", type: "text", cover: "sunrise", eventId: "e28",
      text: "📍 Biarritz, plage de la Milady — 📅 vendredi 19h15\nJ'y suis allée en juillet en montant d'Aix, avec la trouille du moment où il faut se mettre debout. Je ne me suis pas levée une seule fois, j'ai ramé et bu des tasses pendant deux heures, et c'est la seule soirée du mois dont je me souviens en entier. Ce qu'on apprend sans le chercher, c'est de regarder l'horizon plutôt que ses pieds, et ça sert ailleurs que sur une planche. Il reste des places vendredi, et personne ne regarde comment vous tombez.",
      createdAt: hours(117.8), likes: 153, liked: false, comments: [
        { id: "cp542_0", authorId: "u_emma", text: "Tu t'es levée deux fois à la toute fin, j'ai la photo.", createdAt: hours(117.2), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp542_1", authorId: "u_maya", text: "Boire des tasses et s'en souvenir quand même, ça me parle. Il faut nager comment pour venir ?", createdAt: hours(116.7), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p543", authorId: "u_mehdi", passion: "sport", mood: "irl", type: "text", cover: "trail", eventId: "e30",
      text: "📍 Annecy, départ du parking des Puisots — 📅 dimanche 8h\n14 km et 700 mètres de dénivelé jusqu'au Crêt du Maure, retour par le sentier des Cabanes, allure conversation, on attend en haut de chaque montée. Il reste 5 places sur 12 : au-delà le groupe s'étire sur le single et le dernier court seul, ce que je refuse. Sac avec 1 L d'eau et une coupe-vent, il faisait 6 degrés au départ dimanche dernier. Dites-moi votre temps sur 10 km si vous l'avez, c'est juste pour composer deux groupes.",
      createdAt: hours(120.6), likes: 121, liked: false, comments: [
        { id: "cp543_0", authorId: "u_amira", text: "Je viens du plat total. 700 mètres de dénivelé, ça se sent à quel moment ?", createdAt: hours(120.0), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp543_1", authorId: "u_greg", text: "48 minutes au 10 km mais sur route. Je prends une place si le groupe lent existe vraiment.", createdAt: hours(119.5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p544", authorId: "u_jona", passion: "sport", mood: "irl", type: "text", cover: "nature", eventId: "e30",
      text: "📍 Annecy, départ du parking des Puisots — 📅 dimanche 8h\nJe descends de Chamonix pour ça une fois par mois, et pas pour le chrono : c'est la seule sortie où on attend pour de vrai en haut. La dernière fois j'ai fini derrière quelqu'un qui courait depuis six semaines, et c'est elle qui m'a fait remarquer que je bloquais ma respiration dans les raidillons. Il reste des places dimanche. Venez avec des chaussures qui accrochent, le sentier des Cabanes est gras dès qu'il a plu la veille.",
      createdAt: hours(123.4), likes: 89, liked: false, comments: [
        { id: "cp544_0", authorId: "u_mehdi", text: "Deux groupes dimanche. Tu prends le premier ou tu ouvres le second ?", createdAt: hours(122.8), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp544_1", authorId: "u_emma", text: "La respiration bloquée en montée, je la vois tout le temps en cours. Je regarde si je peux être là.", createdAt: hours(122.3), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p545", authorId: "u_karim", passion: "photo", mood: "irl", type: "text", cover: "street", eventId: "e31",
      text: "📍 Paris, sortie de métro Belleville côté boulevard — 📅 samedi 14h\nTrois heures dans le haut de la rue de Belleville avec une seule consigne : on cadre avec les pieds, à 35 mm, et on ne recadre pas au retour. Je montre comment demander un portrait en dix secondes sans faire fuir la personne, puis chacun repart avec dix images maximum. Il reste 4 places sur 10, téléphone accepté, ce n'est pas un atelier de matériel. Écrivez-moi ce que vous avez comme appareil, je prévois deux ou trois choses à prêter.",
      createdAt: hours(126.2), likes: 167, liked: false, comments: [
        { id: "cp545_0", authorId: "u_inès", text: "Juste un téléphone et une trouille bleue d'aborder les gens. Je peux venir ?", createdAt: hours(125.6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp545_1", authorId: "u_zoe", text: "Je prends une place. Le 35 mm, ça donne quoi sur un capteur APS-C ?", createdAt: hours(125.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p546", authorId: "u_noa", passion: "photo", mood: "irl", type: "text", cover: "street", eventId: "e31",
      text: "📍 Paris, sortie de métro Belleville côté boulevard — 📅 samedi 14h\nJe monte des films toute la semaine, donc je recadre tout, tout le temps : l'interdiction de recadrer m'a mise mal à l'aise pendant une bonne heure. Sur mes dix images de la session de mai j'en garde deux, et ce sont les deux où j'ai demandé avant de déclencher au lieu de voler le plan. La sortie d'avant, j'avais fait 180 photos toute seule et rien gardé. Il reste des places samedi, et trois heures debout à Belleville se sentent dans les genoux, prévenez les vôtres.",
      createdAt: hours(129.0), likes: 104, liked: false, comments: [
        { id: "cp546_0", authorId: "u_karim", text: "Deux gardées sur dix, c'est un bon ratio. Samedi je te mets sur la partie marché.", createdAt: hours(128.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp546_1", authorId: "u_liam", text: "Demander avant de déclencher, je fais pareil au micro et ça change tout ce qu'on obtient.", createdAt: hours(127.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p547", authorId: "u_nabil", passion: "jeuxvideo", mood: "irl", type: "text", cover: "neon", eventId: "e32",
      text: "📍 Rennes, salle du haut du bar associatif rue de Saint-Malo — 📅 mercredi 19h\nSix jeux en cours de dev sur six postes, dont mon prototype de plateforme au grappin, et vous jouez vingt minutes chacun pendant qu'on regarde par-dessus votre épaule sans rien dire. C'est la partie qui fait mal et c'est celle qui sert : au dernier passage, quatre personnes sur six ont raté le même saut, donc c'est le niveau qui était mal fichu, pas les joueurs. Il reste 7 places sur 24, entrée libre, une conso pour la salle. Dites-moi si vous venez plutôt jouer ou plutôt montrer un projet, j'équilibre les deux.",
      createdAt: hours(131.8), likes: 142, liked: false, comments: [
        { id: "cp547_0", authorId: "u_yanis", text: "Je viendrais montrer un truc, c'est un proto web. Ça tourne sur vos postes ou j'amène le mien ?", createdAt: hours(131.2), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp547_1", authorId: "u_raph", text: "Regarder sans rien dire, c'est la seule méthode qui marche. Je passe mercredi.", createdAt: hours(130.7), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p548", authorId: "u_tom", passion: "jeuxvideo", mood: "irl", type: "text", cover: "tech", eventId: "e32",
      text: "📍 Rennes, atelier partagé rue de Nantes — 📅 jeudi 19h\nJ'y vais depuis trois éditions, et ma meilleure soirée reste celle où j'ai cassé le prototype de quelqu'un en sortant de la carte en 40 secondes : il m'a remercié et il a corrigé le lendemain. On y apprend sans le vouloir à dire ce qui ne va pas sans démolir celui qui l'a fabriqué. Il reste 7 places, viens même si tu n'as pas joué depuis dix ans.",
      createdAt: hours(134.6), likes: 87, liked: false, comments: [
        { id: "cp548_0", authorId: "u_nabil", text: "Sortir de la carte en 40 secondes, ça reste mon plus beau rapport de bug. 7 places, ramène-toi.", createdAt: hours(134.0), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp548_1", authorId: "u_lea", text: "Je n'ai plus touché une manette depuis la PS2. Tu crois vraiment que c'est pour moi ?", createdAt: hours(133.5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p549", authorId: "u_chloé", passion: "yoga", mood: "irl", type: "text", cover: "horizon", eventId: "e39",
      text: "📍 Aix-en-Provence, parking des Cabassols (Sainte-Victoire) — 📅 samedi 19h00\nOn monte 35 minutes jusqu'au replat, tapis roulé dans le dos, puis une heure de yin face au couchant. Prenez une polaire : dès que le soleil passe derrière la crête, il fait six degrés de moins en dix minutes. Il reste 4 places sur 12 — dites-moi ici si vous venez, je vous envoie le point de rendez-vous exact.",
      createdAt: hours(137.4), likes: 143, liked: false, comments: [
        { id: "cp549_0", authorId: "u_emma", text: "Une serviette suffit sur le replat ou il faut vraiment un tapis épais ? J'arrive de Biarritz vendredi soir, je prends une place.", createdAt: hours(136.8), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp549_1", authorId: "u_maya", text: "Je note 19h. Le sentier se fait en baskets de ville ou pas du tout ?", createdAt: hours(136.3), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p550", authorId: "u_oussa", passion: "musique", mood: "irl", type: "text", cover: "studio", eventId: "e40",
      text: "📍 Saint-Denis, Le 6b — 📅 jeudi 19h30\nChacun vient avec deux instrus sur une clé USB, on écoute en aveugle sur les enceintes de la salle et on dit ce qui coince : basse trop chargée, kick qui mange tout le reste. J'apporte le SP-404 et une multiprise, il me manque encore un casque de rechange. Il reste 5 places sur 18 — mettez votre BPM de prédilection en commentaire, ça m'aide à caler l'ordre de passage.",
      createdAt: hours(140.2), likes: 211, liked: false, comments: [
        { id: "cp550_0", authorId: "u_liam", text: "Je débarque de Montréal mercredi. Je peux venir juste écouter, sans rien apporter ?", createdAt: hours(139.6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp550_1", authorId: "u_yanis", text: "88 BPM. Je prends une place et j'amène le casque de rechange.", createdAt: hours(139.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p551", authorId: "u_lea", passion: "musique", mood: "irl", type: "text", cover: "neon", eventId: "e40",
      text: "📍 Saint-Denis, Le 6b — 📅 jeudi 19h30\nJe suis guitariste, j'y suis allée en février en me disant que je n'avais rien à y faire, et je suis repartie avec deux prises posées sur l'instru de quelqu'un d'autre. On y apprend surtout à écouter un morceau qui n'est pas le sien sans vouloir le réécrire à sa place. Il reste 5 places, je monte de Lyon jeudi midi — quelqu'un veut partager le train ?",
      createdAt: hours(143.0), likes: 132, liked: false, comments: [
        { id: "cp551_0", authorId: "u_oussa", text: "Ta prise de février tourne encore chez moi. Ramène la guitare, pas seulement la clé USB.", createdAt: hours(142.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp551_1", authorId: "u_amira", text: "Je viens de Lille, je serai à Gare du Nord vers 18h si tu veux qu'on y aille ensemble.", createdAt: hours(141.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p552", authorId: "u_emma", passion: "yoga", mood: "irl", type: "text", cover: "sunrise", eventId: "e41",
      text: "📍 Versailles, pièce d'eau des Suisses (allée des Marronniers) — 📅 dimanche 8h00\nJe suis à Paris dix jours, alors j'installe le tapis dehors : une heure douce, surtout des salutations lentes pour réveiller les hanches. L'herbe est trempée à cette heure-là, prévoyez un tapis épais ou une serviette dessous. Il reste 6 places sur 15 — répondez ici et je vous dis où je plante le fanion orange.",
      createdAt: hours(145.8), likes: 118, liked: false, comments: [
        { id: "cp552_0", authorId: "u_noa", text: "8h un dimanche, c'est rude, mais je prends une place. Il y a un café ouvert après ?", createdAt: hours(145.2), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp552_1", authorId: "u_karim", text: "Je passerais avec l'appareil. Je peux faire quelques images sans gêner la séance ?", createdAt: hours(144.7), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p553", authorId: "u_clara", passion: "sport", mood: "irl", type: "text", cover: "trail", eventId: "e42",
      text: "📍 Fontainebleau, gare d'Avon (devant les arceaux) — 📅 samedi 9h30\nJe fais étape trois jours avant de repartir vers le sud, alors on roule une boucle de 42 km par la Croix du Grand Veneur, allure tranquille et deux arrêts. Pneus de 28 minimum : il y a des portions de sable qui aspirent la roue avant sans prévenir. Il reste 7 places sur 20 — donnez votre vitesse de croisière en commentaire, je cale le groupe sur la plus lente.",
      createdAt: hours(148.6), likes: 164, liked: false, comments: [
        { id: "cp553_0", authorId: "u_greg", text: "Je viens en moto jusqu'à Avon et je loue un vélo sur place. C'est faisable le samedi matin ?", createdAt: hours(148.0), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp553_1", authorId: "u_lucie", text: "18 km/h grand maximum pour moi. Je ne veux pas plomber le groupe.", createdAt: hours(147.5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p554", authorId: "u_karim", passion: "photo", mood: "irl", type: "text", cover: "nature", eventId: "e43",
      text: "📍 Fontainebleau, rochers du Cuvier (parking du Cuvier Châtillon) — 📅 dimanche 16h00\nOn étale les nappes vers 16h, on mange, puis on repart shooter à 18h quand la lumière tombe entre les blocs : une heure et demie utile, pas plus. Chacun apporte un truc à partager et un seul objectif, ça oblige à bouger les pieds au lieu de zoomer. Il reste 9 places sur 25 — dites-moi ce que vous amenez à manger, qu'on n'arrive pas avec six taboulés.",
      createdAt: hours(151.4), likes: 188, liked: false, comments: [
        { id: "cp554_0", authorId: "u_lucie", text: "Je monte une tarte aux blettes du jardin. Le 35 mm suffit ou je prends le zoom ?", createdAt: hours(150.8), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp554_1", authorId: "u_zoe", text: "Je n'ai jamais photographié en forêt, je viens quand même. Place prise.", createdAt: hours(150.3), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p555", authorId: "u_lou", passion: "art", mood: "irl", type: "text", cover: "workshop", eventId: "e44",
      text: "📍 Fontainebleau, atelier de la rue des Sablons — 📅 mercredi 14h00\nTrois heures au tour, je fournis 4 kg de grès chamotté par personne et on vise un bol, pas un vase : centrer la motte prend déjà quarante minutes la première fois. Les pièces sèchent trois semaines avant que je les cuise, il faudra donc repasser les chercher ou payer l'envoi. Il reste 3 places sur 8 — écrivez-moi ici pour garder la vôtre.",
      createdAt: hours(154.2), likes: 137, liked: false, comments: [
        { id: "cp555_0", authorId: "u_paul", text: "Je travaille le bois, je n'ai jamais touché l'argile. Tu m'en gardes une quand même ?", createdAt: hours(153.6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp555_1", authorId: "u_hugo", text: "Trois semaines de séchage, ça vaut le coup. Un bol assez large pour dresser un dessert, c'est jouable ?", createdAt: hours(153.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p556", authorId: "u_inès", passion: "art", mood: "irl", type: "text", cover: "studio", eventId: "e44",
      text: "📍 Fontainebleau, atelier de la rue des Sablons — 📅 mercredi 14h00\nJ'y suis allée en juin : mes deux premiers bols se sont effondrés et le troisième penche encore, je bois dedans tous les matins. Ce qu'on apprend sans le chercher, c'est la pression — je dessine trop fort depuis dix ans, et l'argile te le dit tout de suite. Il reste 3 places, je reprends la mienne mercredi : venez avec des ongles courts.",
      createdAt: hours(157.0), likes: 102, liked: false, comments: [
        { id: "cp556_0", authorId: "u_lou", text: "Trois places encore. Ton bol qui penche reste le meilleur de la fournée de juin.", createdAt: hours(156.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp556_1", authorId: "u_amira", text: "Les ongles courts, ça m'arrange pas du tout, mais je viens.", createdAt: hours(155.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p557", authorId: "u_noa", passion: "litterature", mood: "irl", type: "text", cover: "book", eventId: "e45",
      text: "📍 Rambouillet, café Le Comptoir de la Gare — 📅 dimanche 11h\nBrunch littéraire : chacun vient avec un livre lu ce mois-ci et cinq minutes pour en parler, pas une de plus, je chronomètre au téléphone. Le fil rouge de dimanche, c'est la première phrase — on lit aussi celles qu'on a détestées. Il reste 4 places sur les 14 réservées, la grande table est au fond à droite.\nVous venez avec quel livre ?",
      createdAt: hours(159.8), likes: 96, liked: false, comments: [
        { id: "cp557_0", authorId: "u_sofia", text: "Je prends le train de 7h12 depuis Bordeaux, j'arriverai avec dix minutes de retard. Vous me gardez une chaise ?", createdAt: hours(159.2), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp557_1", authorId: "u_anaïs", text: "Cinq minutes chrono, c'est la meilleure règle du monde. Chez nous personne n'arrive jamais à s'arrêter.", createdAt: hours(158.7), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p558", authorId: "u_sofia", passion: "litterature", mood: "irl", type: "text", cover: "book", eventId: "e45",
      text: "📍 Rambouillet, café Le Comptoir de la Gare — 📅 dimanche 11h\nJ'y suis allée en juin et j'avais peur d'arriver avec le mauvais livre, un polar suédois au milieu de gens sérieux. C'est le polar qui a occupé la table pendant vingt minutes. On repart toujours avec deux titres notés sur un ticket de caisse, et moi avec 500 km de train pour les commencer.\nIl reste 4 places : dites-moi si vous y allez, j'aime bien connaître une tête avant d'entrer.",
      createdAt: hours(162.6), likes: 74, liked: false, comments: [
        { id: "cp558_0", authorId: "u_anaïs", text: "Le coup du ticket de caisse, je fais pareil. J'en ai un tiroir plein à la maison.", createdAt: hours(162.0), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp558_1", authorId: "u_karim", text: "Il reste vraiment de la place dimanche ? Je peux passer après mes photos du matin.", createdAt: hours(161.5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p559", authorId: "u_oussa", passion: "musique", mood: "irl", type: "text", cover: "stage", eventId: "e46",
      text: "📍 Boulogne-Billancourt, cave du 9 rue de Vanves — 📅 mercredi 20h30\nJam ouverte : batterie, ampli basse et piano droit sur place, le reste vous l'apportez. On tourne sur trois grilles annoncées à 20h30 — un blues en fa, Blue Bossa, Autumn Leaves — pour que les débutants puissent monter au deuxième tour. Il reste 6 places sur la liste, on plafonne à 22, la cave est petite et le piano a été accordé mardi.\nDites-moi votre instrument en réponse, je répartis les tours à l'avance.",
      createdAt: hours(165.4), likes: 143, liked: false, comments: [
        { id: "cp559_0", authorId: "u_lea", text: "Guitare, et je monte à Paris mercredi pile. Je peux prendre le deuxième tour sur Autumn Leaves ?", createdAt: hours(164.8), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp559_1", authorId: "u_liam", text: "Je n'ai jamais osé une jam. C'est gênant si je viens seulement écouter au fond ?", createdAt: hours(164.3), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p560", authorId: "u_yanis", passion: "tech", mood: "irl", type: "text", cover: "tech", eventId: "e47",
      text: "📍 Neuilly-sur-Seine, 44 avenue Charles-de-Gaulle — 📅 jeudi 19h\nJe monte de Toulouse jeudi et une boîte nous prête sa salle du 3e pour la soirée. Trois démos de vingt minutes, écran partagé, code visible, et le droit de dire « ça ne marche pas » en direct — la mienne plante une fois sur deux, on verra bien. Il reste 11 places sur 60, badge à l'accueil, prenez une pièce d'identité.\nLa troisième démo est encore libre : répondez ici avec votre sujet.",
      createdAt: hours(168.2), likes: 87, liked: false, comments: [
        { id: "cp560_0", authorId: "u_raph", text: "Je prends le Thalys de 16h02, j'arrive juste. Vous démarrez pile à 19h ou il y a un quart d'heure de battement ?", createdAt: hours(167.6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp560_1", authorId: "u_nabil", text: "Je veux bien la troisième démo : générateur de niveaux, dix minutes me suffisent largement.", createdAt: hours(167.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p561", authorId: "u_raph", passion: "tech", mood: "irl", type: "text", cover: "tech", eventId: "e47",
      text: "📍 Neuilly-sur-Seine, 44 avenue Charles-de-Gaulle — 📅 jeudi 19h\nJ'étais à l'édition de mars, arrivé en nage avec quinze minutes de retard, et personne n'a levé les yeux. Depuis, ce que je viens chercher, ce sont les questions posées après les démos, pas les démos elles-mêmes. La dernière fois, une remarque sur un état de chargement m'a fait refaire un écran entier le lendemain matin.\nIl reste 11 places. Je serai au fond à gauche : venez me dire bonjour si vous ne connaissez personne, c'est ma spécialité.",
      createdAt: hours(171.0), likes: 64, liked: false, comments: [
        { id: "cp561_0", authorId: "u_tom", text: "Le fond à gauche, noté. C'est la première fois que je vais à un truc comme ça.", createdAt: hours(170.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp561_1", authorId: "u_yanis", text: "La remarque sur l'écran de chargement, c'était moi. Je remets ça jeudi, prépare-toi.", createdAt: hours(169.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p562", authorId: "u_amira", passion: "danse", mood: "irl", type: "text", cover: "dance", eventId: "e48",
      text: "📍 Montreuil, gymnase Jean-Lurçat — 📅 samedi 14h\nJe descends de Lille pour deux heures d'atelier : quarante minutes de bases (bounce, rock, allers-retours), puis on monte un huit temps ensemble jusqu'à 16h. Parquet, donc chaussures propres obligatoires ; l'enceinte est à moi, pas de câbles à négocier. Il reste 5 places sur 24, débutants compris — en mars, la moitié du groupe n'avait jamais dansé.\nRépondez avec votre niveau, je fais deux rangées.",
      createdAt: hours(173.8), likes: 168, liked: false, comments: [
        { id: "cp562_0", authorId: "u_mila", text: "Contemporaine depuis quinze ans, urbaine zéro. Je peux vraiment venir sans me ridiculiser ?", createdAt: hours(173.2), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp562_1", authorId: "u_emma", text: "Deux heures debout, ça donne quoi aux genoux ? Je viens du yoga, je pars de loin.", createdAt: hours(172.7), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p563", authorId: "u_mila", passion: "danse", mood: "irl", type: "text", cover: "street", eventId: "e48",
      text: "📍 Montreuil, gymnase Jean-Lurçat — 📅 samedi 14h\nJe suis à Paris cette semaine pour une formation et j'ai pris ma place samedi, avec une vraie trouille : j'enseigne le contemporain depuis quinze ans et je ne sais pas poser un bounce. Une amie y était en mars, elle m'a dit qu'on passe la première demi-heure à ne pas savoir quoi faire de ses bras, et que personne ne regarde.\nIl reste 5 places. S'il y a d'autres transfuges du contemporain, faites-vous connaître, on se mettra au deuxième rang ensemble.",
      createdAt: hours(176.6), likes: 93, liked: false, comments: [
        { id: "cp563_0", authorId: "u_amira", text: "Le bounce, c'est trente minutes de patience. Ta technique va t'aider, pas te gêner.", createdAt: hours(176.0), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp563_1", authorId: "u_lea", text: "Deuxième rang, je signe. Je viens surtout pour comprendre le rapport au rythme.", createdAt: hours(175.5), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p564", authorId: "u_zoe", passion: "mode", mood: "irl", type: "text", cover: "workshop", eventId: "e49",
      text: "📍 Paris, atelier du 14 rue de Turenne (Marais) — 📅 samedi 10h\nTrois heures sur une seule question : transformer un vêtement qu'on ne met plus sans le découper au hasard. Apportez une pièce en coton ou en jean, j'apporte les machines, le fil et deux paires de ciseaux qui coupent vraiment. Il reste 3 places sur 10, et on ne peut pas être plus : il n'y a que quatre machines à coudre.\nDites-moi ce que vous apportez, je prépare les patrons à l'avance.",
      createdAt: hours(179.4), likes: 121, liked: false, comments: [
        { id: "cp564_0", authorId: "u_rita", text: "Une veste en jean trop large aux épaules, ça rentre dans le cadre ?", createdAt: hours(178.8), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp564_1", authorId: "u_lou", text: "Quatre machines pour dix personnes, on tourne comment ? Je couds très lentement.", createdAt: hours(178.3), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p565", authorId: "u_rita", passion: "mode", mood: "irl", type: "text", cover: "studio", eventId: "e49",
      text: "📍 Paris, atelier du 14 rue de Turenne (Marais) — 📅 samedi 10h\nJ'organise des défilés depuis huit ans et je ne savais pas remonter une manche avant de venir ici en juin. J'y ai passé trois heures sur une chemise de mon père, col retourné, et je la porte encore. Ce qu'on y apprend surtout, c'est de s'arrêter avant d'avoir tout abîmé.\nIl reste 3 places samedi. Si vous hésitez parce que vous ne savez pas coudre : c'était exactement mon cas, venez avec la pièce que vous n'osez pas toucher.",
      createdAt: hours(182.2), likes: 149, liked: false, comments: [
        { id: "cp565_0", authorId: "u_zoe", text: "Le col retourné, je m'en souviens. Tu avais failli couper la patte de boutonnage.", createdAt: hours(181.6), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp565_1", authorId: "u_inès", text: "Je note pour samedi. J'ai un sweat taché depuis deux ans que je n'arrive pas à jeter.", createdAt: hours(181.1), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
    { id: "p566", authorId: "u_theo", passion: "cuisine", mood: "irl", type: "text", cover: "kitchen", eventId: "e50",
      text: "📍 Puteaux, La Défense, cuisine partagée des Reflets — 📅 mardi 18h30\nAtelier méditerranéen : trois choses simples et longues — une caponata, une pâte à fougasse qui pousse pendant qu'on cuisine, et un aïoli monté à la main, sans mixeur, parce que c'est là qu'on comprend. Je monte de Marseille avec les olives et les poivrons corne de bœuf, le reste est sur place. Il reste 7 places sur 16, tabliers fournis, on mange ensemble à 20h30.\nDites-moi vos allergies en réponse, je décale les recettes.",
      createdAt: hours(185.0), likes: 204, liked: false, comments: [
        { id: "cp566_0", authorId: "u_hugo", text: "Aïoli à la main, ça va casser pour la moitié de la salle. Prévois un jaune de secours par personne.", createdAt: hours(184.4), likes: 5, likedBy: [], emojis: [], replies: [] },
        { id: "cp566_1", authorId: "u_lucie", text: "Une version sans gluten pour la fougasse est possible, ou je viens juste pour la caponata ?", createdAt: hours(183.9), likes: 11, likedBy: [], emojis: [], replies: [] },
      ]},
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
    { id: "n1", kind: "like",    fromId: "u_lea",   text: "<b>Léa Moreau</b> a aimé ton intention de rejoindre PASSIO", createdAt: hours(0.5), unread: true,  html: true, emoji: "💖" },
    { id: "n2", kind: "follow",  fromId: "u_clara", text: "<b>Clara Jensen</b> suit maintenant tes publications voyage", createdAt: hours(1), unread: true,  html: true, emoji: "🤝" },
    { id: "n3", kind: "comment", fromId: "u_yanis", text: "<b>Yanis Perez</b> a réagi à un post : « On devrait échanger 🚀 »", createdAt: hours(2), unread: true,  html: true, emoji: "💬" },
    { id: "n4", kind: "event",   fromId: "u_theo",  text: "<b>Théo Roussel</b> t'invite au « Dîner entre passionnés de cuisine »", createdAt: hours(3), unread: false, html: true, emoji: "🍳" },
    { id: "n5", kind: "system",  fromId: "me",      text: "Ta première publication attend : montre ce que tu aimes 🎨", createdAt: hours(5), unread: false, html: true, emoji: "✨" },
    { id: "n6", kind: "system",  fromId: "me",      text: "Bienvenue sur PASSIO 🎉 Choisis tes passions et découvre qui les partage.", createdAt: hours(6), unread: false, html: true, emoji: "✨" },
    { id: "n7", kind: "like",    fromId: "u_karim", text: "<b>Karim Belkacem</b> a réagi à ta passion photo", createdAt: hours(10), unread: false, html: true, emoji: "📷" },
  ];

  return { users: seedUsers, posts: seedPosts, events: seedEvents, stories: seedStories, notifications: seedNotifications };
}

