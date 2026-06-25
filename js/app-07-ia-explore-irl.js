// ---- Affichage résultats IA ----
function sendAIQuery(forceQuery) {
  var inp = document.getElementById("aiInput");
  var query = (forceQuery || (inp ? inp.value : "")).trim();
  if (query && query.trim()) saveAiHistory(query.trim());
  if (!query) return;
  if (inp) inp.value = "";

  var home = document.getElementById("aiHome");
  var resultContent = document.getElementById("aiResultContent");
  if (!resultContent) return;

  // Passer en mode résultats
  if (home) home.style.display = "none";
  resultContent.style.display = "block";

  // Afficher loading
  resultContent.innerHTML =
    '<div class="ai-result-header">' +
      '<div class="ai-result-query">"' + escapeHtml(query) + '"</div>' +
      '<button class="ai-result-back" onclick="aiShowHome()">‹ Retour</button>' +
    '</div>' +
    '<div class="ai-loading">' +
      '<div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div>' +
      '<span>Recherche en cours…</span>' +
    '</div>';

  // Générer la réponse après court délai
  setTimeout(function() {
    var response = aiGenerateResponse(query);
    var related = aiGetRelated(query);
    var relatedHTML = related.length
      ? '<div class="ai-section-label" style="margin-top:18px;">Recherches liées</div>' +
        '<div class="ai-related">' +
          related.map(function(s) {
            return '<button class="ai-related-btn" onclick="sendAIQuery(\'' + s.replace(/'/g, "\\'") + '\')">' + s + '</button>';
          }).join("") +
        '</div>'
      : "";

    resultContent.innerHTML =
      '<div class="ai-result-header">' +
        '<div class="ai-result-query">"' + escapeHtml(query) + '"</div>' +
        '<button class="ai-result-back" onclick="aiShowHome()">‹ Retour</button>' +
      '</div>' +
      response +
      relatedHTML;
  }, 500 + Math.random() * 400);
}

function aiShowHome() {
  var home = document.getElementById("aiHome");
  var resultContent = document.getElementById("aiResultContent");
  if (home) home.style.display = "block";
  if (resultContent) { resultContent.style.display = "none"; resultContent.innerHTML = ""; }
  var inp = document.getElementById("aiInput");
  if (inp) { inp.value = ""; inp.focus(); }
}

function aiGetRelated(query) {
  var ql = query.toLowerCase();
  if (ql.includes("photo")) return ["Ressources photographie", "Créateurs photo", "Events photo IRL"];
  if (ql.includes("musiqu") || ql.includes("guitare")) return ["Ressources musique", "Tendances musique 2026", "Events musique IRL"];
  if (ql.includes("cuisi")) return ["Débuter en cuisine", "Ressources cuisine", "Events cuisine IRL"];
  if (ql.includes("irl") || ql.includes("event")) return ["Carnets de voyage CDV", "Créateurs à suivre", "Comment gagner des Passia"];
  if (ql.includes("passia") || ql.includes("point")) return ["Événements IRL", "Lancer un CDV Live", "Créer du contenu"];
  if (ql.includes("voyage") || ql.includes("cdv")) return ["Événements IRL", "Conseils voyage", "Créateurs voyage"];
  return ["Events IRL cette semaine", "Créateurs à suivre", "Comment gagner des Passia"];
}

function filterExplore() {
  var inp = document.getElementById("explorerSearch");
  var results = document.getElementById("exploreSearchResults");
  if (!results) return;
  var query = inp ? inp.value : "";
  if (!query || query.trim().length < 1) {
    results.style.display = "none";
    results.innerHTML = "";
    return;
  }
  var q = query.trim().toLowerCase();

  // Afficher "Recherche en cours..."
  results.style.display = "block";
  results.innerHTML = "<div style='padding:14px;text-align:center;color:var(--muted);font-size:13px;'>Recherche…</div>";

  // Passions locales (instantané)
  var allList = PASSIONS.concat(state.user.customPassions || []);
  var fp = allList.filter(function(p) { return p.label.toLowerCase().includes(q); }).slice(0, 5);

  // Utilisateurs Supabase (réseau réel) + seed local
  var supaPromise = (supa && typeof supaSearchUsers === 'function')
    ? supaSearchUsers(query.trim())
    : Promise.resolve([]);

  supaPromise.then(function(supaUsers) {
    // Fusion : Supabase en priorité + seed local en fallback
    var seedUsers = (state.seed.users || []).filter(function(u) {
      var pw = passionById(u.passion);
      return (u.name||"").toLowerCase().includes(q)
        || (u.bio||"").toLowerCase().includes(q)
        || (pw && pw.label.toLowerCase().includes(q));
    }).slice(0, 5);

    // Convertir les users Supabase au même format (avec passions array)
    var supaFormatted = (supaUsers || []).map(function(u) {
      return {
        id: u.id,
        name: u.username || "Passionné",
        profileEmoji: u.emoji || "✨",
        avatar: u.color || "#8b5cf6",
        passions: u.passions || [], // Tableau de passions au lieu d'une seule
        bio: u.bio || ""
      };
    });

    var fu = supaFormatted.concat(seedUsers).slice(0, 8);

    if (fp.length === 0 && fu.length === 0) {
      results.innerHTML = "<div style='padding:14px 16px;color:var(--muted);font-size:13px;text-align:center;'>Aucun résultat pour « " + escapeHtml(query.trim()) + " »</div>";
      return;
    }

    var html = "";

    // Passions
    if (fp.length) {
      html += "<div style='padding:8px 14px 4px;font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;'>🔥 Passions</div>";
      fp.forEach(function(p) {
        html += "<div onclick=\"openPassionExplorer('" + p.id + "');document.getElementById('exploreSearchResults').style.display='none';\" style='display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);'>" +
          "<div style='width:38px;height:38px;border-radius:12px;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;'>" + p.emoji + "</div>" +
          "<div style='flex:1;'><div style='font-weight:700;font-size:13px;color:var(--text);'>" + escapeHtml(p.label) + "</div></div>" +
          "<div style='font-size:11px;font-weight:700;color:var(--accent);'>Explorer →</div>" +
          "</div>";
      });
    }

    // Utilisateurs
    if (fu.length) {
      html += "<div style='padding:8px 14px 4px;font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;'>👤 Utilisateurs</div>";
      fu.forEach(function(u) {
        // Afficher tous les passions/profils comme des badges
        // Gérer à la fois le format Supabase (passions array) et le format seed (passion string)
        var passionsHTML = "";

        if (u.passions && Array.isArray(u.passions) && u.passions.length > 0) {
          // Format Supabase: passions array
          passionsHTML = u.passions.map(function(p) {
            return p.emoji || "✨";
          }).join(" ");
        } else if (u.passion) {
          // Format seed: passion string
          var pw = passionById(u.passion) || { emoji: "✨", label: "" };
          passionsHTML = pw.emoji;
        } else {
          passionsHTML = "✨";
        }

        html += "<div onclick=\"openUserProfile('" + u.id + "');document.getElementById('exploreSearchResults').style.display='none';\" style='display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);'>" +
          "<div style='width:38px;height:38px;border-radius:12px;background:" + avatarBg(u) + ";display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;'>" + avatarInner(u) + "</div>" +
          "<div style='flex:1;min-width:0;'>" +
            "<div style='font-weight:700;font-size:13px;color:var(--text);'>" + escapeHtml(u.name||"") + "</div>" +
            "<div style='font-size:11px;color:var(--muted);'>" + passionsHTML + (u.bio ? " · " + escapeHtml(u.bio) : "") + "</div>" +
          "</div>" +
          "<div style='font-size:11px;font-weight:700;color:var(--accent);flex-shrink:0;'>Voir →</div>" +
          "</div>";
      });
    }

    results.innerHTML = html;
  });
}

function openPassionExplorer(pid) {
  var p = passionById(pid);
  if (!p) { toast("Passion non trouvée"); return; }
  var posts = allFeedPosts().filter(function(x) { return x.passion === pid; });
  var creators = (state.seed.users || []).filter(function(u) { return u.passion === pid; });
  var hasProfile = (state.user.profiles || []).find(function(up) { return up.passion === pid; });

  var creatorsHTML = creators.length ? creators.map(function(u) {
    return '<div class="list-row">' +
      '<div class="avatar" style="background:' + avatarBg(u) + ';">' + avatarInner(u) + '</div>' +
      '<div class="list-row-body">' +
        '<div class="list-row-title">' + escapeHtml(u.name) + '</div>' +
        '<div class="list-row-meta">' + escapeHtml(u.bio || "") + '</div>' +
      '</div>' +
      '<button class="btn small" onclick="toast(\'Suivi·e\')">Suivre</button>' +
    '</div>';
  }).join("") : '<div class="empty"><div class="empty-text">Pas encore de créateurs</div></div>';

  var postsHTML = posts.length ? posts.slice(0,6).map(renderPostHTML).join("") : '<div class="empty"><div class="empty-icon">✏️</div><div class="empty-text">Aucun post pour l\'instant</div></div>';

  var profileBtn = hasProfile
    ? '<span class="pill active">Ton profil</span>'
    : '<button class="btn small primary" onclick="quickCreateProfile(\'' + pid + '\')">+ Créer profil</button>';

  var html = '\
    <div class="modal-handle"></div>\
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">\
      <div style="font-size:42px;">' + p.emoji + '</div>\
      <div>\
        <div class="modal-title" style="margin:0;">' + p.label + '</div>\
        <div style="font-size:12px;color:var(--muted);">' + posts.length + ' post' + (posts.length>1?"s":"") + ' · ' + creators.length + ' créateur' + (creators.length>1?"s":"") + '</div>\
      </div>\
      <div style="margin-left:auto;">' + profileBtn + '</div>\
    </div>\
    <div class="section-title" style="margin-top:6px;">Créateurs</div>\
    ' + creatorsHTML + '\
    <div class="section-title" style="margin-top:14px;">Posts</div>\
    ' + postsHTML;

  openModal(html);
}

function quickCreateProfile(pid) {
  const p = passionById(pid);
  const np = {
    id: uid(),
    name: state.user.name,
    passion: pid,
    emoji: p.emoji,
    bio: `Profil ${p.label}`,
    color: p.color,
    createdAt: Date.now(),
  };
  state.user.profiles.push(np);
  state.user.currentProfileId = np.id;
  grantReward("profile_create");
  closeModal();
  renderTopbar();
  goTo("profiles");
}

// ======== IRL ========
let irlFilters = new Set(); // Multi-select: vide par défaut pour afficher TOUS les événements
let irlPassionFilters = new Set(); // Multi-select des profils
let irlDistanceFilter = "";
let irlTimeFilter = ""; // Filtre d'heure (format: "HH:MM")
let irlUserLocation = null; // Position actuelle de l'utilisateur { lat, lng }
let irlUserLocationError = false; // Erreur d'obtention de position
let irlSelectedCity = null; // Ville sélectionnée pour chercher des événements (null = ta position)
let irlPassionFiltersInitialized = false; // Flag pour tracker la première initialisation

// Initialiser irlPassionFilters avec les profils de l'utilisateur
// Si pas de profils, afficher TOUS les événements
function initializeIrlPassionFilters() {
  // Ne réinitialiser que la première fois
  if (irlPassionFiltersInitialized) {
    return;
  }

  irlPassionFiltersInitialized = true;

  const userPassionIds = (state.user.profiles || []).map(p => p.passion).filter(Boolean);

  if (userPassionIds.length > 0) {
    // L'utilisateur a des profils, afficher seulement ceux-ci par défaut
    userPassionIds.forEach(p => irlPassionFilters.add(p));
    _diag("[IRL Init] Profils de l'utilisateur: " + Array.from(irlPassionFilters).join(", "));
  } else {
    // Pas de profils créés, afficher TOUTES les passions
    const events = allEvents();
    const allPassions = [...new Set(events.map(e => e.passion).filter(Boolean))];
    allPassions.forEach(p => irlPassionFilters.add(p));
    _diag("[IRL Init] Toutes les passions: " + Array.from(irlPassionFilters).join(", "));
  }
}

// Note: Les event listeners pour les filtres de passion et type sont gérés
// par la délegation d'événements dans les blocs addEventListener plus bas

// Délégation : clic sur une tuile passion (générée dynamiquement) - MULTI-SELECT
document.addEventListener("click", (e) => {
  const tile = e.target.closest("[data-irlpassion]");
  if (!tile) return;
  const passionId = tile.getAttribute("data-irlpassion");

  // Toggle multi-select
  if (irlPassionFilters.has(passionId)) {
    irlPassionFilters.delete(passionId);
  } else {
    irlPassionFilters.add(passionId);
  }

  tile.classList.toggle("active");
  renderIRL();
});

// Événements click pour "Mes events" et "Inscrit"
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-irlfilter]");
  if (!btn) return;
  const filterType = btn.getAttribute("data-irlfilter");

  // Toggle multi-select
  if (irlFilters.has(filterType)) {
    irlFilters.delete(filterType);
  } else {
    irlFilters.add(filterType);
  }

  btn.classList.toggle("active");
  renderIRL();
});

function allEvents() {
  const meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  const seedEvIds = new Set((state.seed.events || []).map(e => e.id));
  const myEvFiltered = (state.userEvents || []).filter(e => !seedEvIds.has(e.id));
  return [
    ...myEvFiltered.map(e => ({ ...e, _mine: true })),
    // Un event Supabase qu'on a créé revient dans seed après reload (dédup contre userEvents) :
    // on garde le flag _mine via organizerId/authorId pour qu'il reste dans « Mes events ».
    ...(state.seed.events || []).map(e => ({ ...e, _mine: e.organizerId === meId || e.authorId === meId }))
  ].sort((a, b) => a.date - b.date);
}

// Retrouve l'objet événement CANONIQUE (dans le state, pas une copie de allEvents()).
// allEvents() renvoie des copies shallow via {...e} : muter `.attendees` sur ces copies
// ne se répercutait jamais sur la source → compteur d'inscrits figé. (Corrigé le 2026-06-24.)
function _findCanonicalEvent(id) {
  return (state.userEvents || []).find(e => e.id === id)
      || (state.seed.events || []).find(e => e.id === id)
      || null;
}

// ===== Carte interactive Leaflet =====
const FRANCE_CITIES = {
  // ==== Métropoles France ====
  "paris":      [48.8566, 2.3522],
  "lyon":       [45.7640, 4.8357],
  "marseille":  [43.2965, 5.3698],
  "toulouse":   [43.6047, 1.4442],
  "nice":       [43.7102, 7.2620],
  "nantes":     [47.2184, -1.5536],
  "strasbourg": [48.5734, 7.7521],
  "montpellier":[43.6108, 3.8767],
  "bordeaux":   [44.8378, -0.5792],
  "lille":      [50.6292, 3.0573],
  "rennes":     [48.1173, -1.6778],
  "reims":      [49.2583, 4.0317],
  "le havre":   [49.4944, 0.1079],
  "saint-étienne":[45.4397, 4.3872],
  "toulon":     [43.1242, 5.9280],
  "grenoble":   [45.1885, 5.7245],
  "dijon":      [47.3220, 5.0415],
  "angers":     [47.4784, -0.5632],
  "nîmes":      [43.8367, 4.3601],
  "nimes":      [43.8367, 4.3601],
  "villeurbanne":[45.7665, 4.8795],
  "le mans":    [48.0061, 0.1996],
  "aix-en-provence":[43.5263, 5.4454],
  "brest":      [48.3905, -4.4860],
  "tours":      [47.3941, 0.6848],
  "saint-denis":[48.9354, 2.3569],
  "amiens":     [49.8941, 2.2957],
  "limoges":    [45.8336, 1.2611],
  "annecy":     [45.8992, 6.1294],
  "perpignan":  [42.6986, 2.8954],
  "metz":       [49.1193, 6.1757],
  "besançon":   [47.2378, 6.0241],
  "besancon":   [47.2378, 6.0241],
  "orleans":    [47.9029, 1.9093],
  "orléans":    [47.9029, 1.9093],
  "rouen":      [49.4431, 1.0993],
  "mulhouse":   [47.7508, 7.3359],
  "caen":       [49.1829, -0.3707],
  "avignon":    [43.9493, 4.8055],
  "nancy":      [48.6921, 6.1844],
  "poitiers":   [46.5802, 0.3404],
  "la rochelle":[46.1591, -1.1521],
  "biarritz":   [43.4832, -1.5586],
  "chamonix":   [45.9237, 6.8694],
  "uzès":       [44.0117, 4.4194],
  "uzes":       [44.0117, 4.4194],
  // ==== Villes proches de Paris ====
  "versailles": [48.8041, 2.1303],
  "fontainebleau":[48.4030, 2.6998],
  "rambouillet":[48.6397, 1.8326],
  "boulogne-billancourt":[48.8349, 2.2391],
  "boulogne": [48.8349, 2.2391],
  "neuilly-sur-seine":[48.8814, 2.2648],
  "neuilly": [48.8814, 2.2648],
  "montreuil": [48.8627, 2.4387],
  "la défense": [48.8920, 2.2407],
  "la defense": [48.8920, 2.2407],
  // ==== International (events PASSIO actuels) ====
  "lisbonne":   [38.7223, -9.1393],
  "lisbon":     [38.7223, -9.1393],
  "lisboa":     [38.7223, -9.1393],
  "alfama":     [38.7115, -9.1276],
  "baixa":      [38.7117, -9.1393],
  "bairro alto":[38.7128, -9.1452],
  "chiado":     [38.7100, -9.1419],
  "belém":      [38.6980, -9.2057],
  "belem":      [38.6980, -9.2057],
  "lx factory": [38.7036, -9.1768],
  "sintra":     [38.8027, -9.3814],
  "cascais":    [38.6977, -9.4218],
  "porto":      [41.1579, -8.6291],
  "faro":       [37.0194, -7.9322],
  "lagos":      [37.1028, -8.6739],
  "québec":     [46.8139, -71.2080],
  "quebec":     [46.8139, -71.2080],
  "bruxelles":  [50.8503, 4.3517],
  "genève":     [46.2044, 6.1432],
  "geneve":     [46.2044, 6.1432],
  "lausanne":   [46.5197, 6.6323],
  "barcelone":  [41.3851, 2.1734],
  "barcelona":  [41.3851, 2.1734],
  "amsterdam":  [52.3676, 4.9041],
  "rome":       [41.9028, 12.4964],
  "milan":      [45.4642, 9.1900],
  "londres":    [51.5074, -0.1278],
  "london":     [51.5074, -0.1278],
  // ==== Berlin & quartiers ====
  "berlin":         [52.5200, 13.4050],
  "mitte":          [52.5170, 13.4050],
  "kreuzberg":      [52.4990, 13.4032],
  "friedrichshain": [52.5151, 13.4541],
  "prenzlauer":     [52.5390, 13.4243],
  "prenzlauer berg":[52.5390, 13.4243],
  "brandenburg":    [52.5163, 13.3777],
  "brandenburger":  [52.5163, 13.3777],
  "east side":      [52.5050, 13.4396],
  "mauerpark":      [52.5424, 13.4022],
  // ==== Maroc ====
  "marrakech":      [31.6295, -7.9811],
  "médina":         [31.6258, -7.9874],
  "medina":         [31.6258, -7.9874],
  "jemaa el-fna":   [31.6260, -7.9890],
  "jemaa el fna":   [31.6260, -7.9890],
  "majorelle":      [31.6418, -8.0033],
  "jardin majorelle":[31.6418, -8.0033],
  "souks":          [31.6285, -7.9890],
  "atlas":          [31.0588, -7.9220],
  "ourika":         [31.3554, -7.7560],
  "vallée de l'ourika":[31.3554, -7.7560],
  "casablanca":     [33.5731, -7.5898],
  "fès":            [34.0331, -4.9998],
  "fes":            [34.0331, -4.9998],
  "essaouira":      [31.5085, -9.7595],
  "chefchaouen":    [35.1715, -5.2697],
  // ==== Japon ====
  "tokyo":          [35.6762, 139.6503],
  "shibuya":        [35.6580, 139.7016],
  "shinjuku":       [35.6938, 139.7036],
  "asakusa":        [35.7148, 139.7967],
  "akihabara":      [35.7022, 139.7740],
  "ginza":          [35.6717, 139.7649],
  "harajuku":       [35.6702, 139.7026],
  "ueno":           [35.7138, 139.7770],
  "kyoto":          [35.0116, 135.7681],
  "fushimi":        [34.9671, 135.7727],
  "fushimi inari":  [34.9671, 135.7727],
  "arashiyama":     [35.0094, 135.6666],
  "gion":           [35.0036, 135.7780],
  "kinkaku-ji":     [35.0394, 135.7292],
  "osaka":          [34.6937, 135.5023],
  "nara":           [34.6851, 135.8048],
  "hiroshima":      [34.3853, 132.4553],
  // ==== Bretagne et côte ouest France ====
  "saint-malo":     [48.6491, -2.0258],
  "saint malo":     [48.6491, -2.0258],
  "cap fréhel":     [48.6843, -2.3197],
  "cap frehel":     [48.6843, -2.3197],
  "ploumanac'h":    [48.8295, -3.4807],
  "ploumanach":     [48.8295, -3.4807],
  "granit rose":    [48.8295, -3.4807],
  "côte de granit rose":[48.8295, -3.4807],
  "cote de granit rose":[48.8295, -3.4807],
  "perros-guirec":  [48.8147, -3.4413],
  "quiberon":       [47.4836, -3.1207],
  "carnac":         [47.5857, -3.0782],
  "vannes":         [47.6582, -2.7608],
  "lorient":        [47.7482, -3.3702],
  "concarneau":     [47.8722, -3.9192],
  "douarnenez":     [48.0937, -4.3290],
  "pointe du raz":  [48.0383, -4.7375],
  "belle-île":      [47.3406, -3.1547],
  "belle ile":      [47.3406, -3.1547],
  "saint-brieuc":   [48.5141, -2.7656],
  "morlaix":        [48.5778, -3.8284],
  // ==== Europe / autres villes touristiques ====
  "athènes":        [37.9755, 23.7348],
  "athenes":        [37.9755, 23.7348],
  "santorin":       [36.3932, 25.4615],
  "mykonos":        [37.4467, 25.3289],
  "venise":         [45.4408, 12.3155],
  "florence":       [43.7696, 11.2558],
  "naples":         [40.8518, 14.2681],
  "vienne":         [48.2082, 16.3738],
  "prague":         [50.0755, 14.4378],
  "budapest":       [47.4979, 19.0402],
  "copenhague":     [55.6761, 12.5683],
  "stockholm":      [59.3293, 18.0686],
  "oslo":           [59.9139, 10.7522],
  "helsinki":       [60.1699, 24.9384],
  "reykjavik":      [64.1466, -21.9426],
  "dublin":         [53.3498, -6.2603],
  "edimbourg":      [55.9533, -3.1883],
  "edinburgh":      [55.9533, -3.1883],
  "madrid":         [40.4168, -3.7038],
  "séville":        [37.3886, -5.9823],
  "seville":        [37.3886, -5.9823],
  "valence":        [39.4699, -0.3763],
  "grenade":        [37.1773, -3.5986],
  "granada":        [37.1773, -3.5986],
  // ==== Amérique ====
  "new york":       [40.7128, -74.0060],
  "nyc":            [40.7128, -74.0060],
  "los angeles":    [34.0522, -118.2437],
  "san francisco":  [37.7749, -122.4194],
  "miami":          [25.7617, -80.1918],
  "chicago":        [41.8781, -87.6298],
  "boston":         [42.3601, -71.0589],
  "montréal":       [45.5017, -73.5673],
  "montreal":       [45.5017, -73.5673],
  "vancouver":      [49.2827, -123.1207],
  "mexico":         [19.4326, -99.1332],
  "rio":            [-22.9068, -43.1729],
  "rio de janeiro": [-22.9068, -43.1729],
  "buenos aires":   [-34.6037, -58.3816],
  "lima":           [-12.0464, -77.0428],
  "cusco":          [-13.5319, -71.9675],
  "machu picchu":   [-13.1631, -72.5450],
  // ==== Asie / Océanie ====
  "bangkok":        [13.7563, 100.5018],
  "chiang mai":     [18.7883, 98.9853],
  "phuket":         [7.8804, 98.3923],
  "bali":           [-8.4095, 115.1889],
  "ubud":           [-8.5069, 115.2625],
  "singapour":      [1.3521, 103.8198],
  "singapore":      [1.3521, 103.8198],
  "hanoi":          [21.0285, 105.8542],
  "ho chi minh":    [10.8231, 106.6297],
  "saigon":         [10.8231, 106.6297],
  "séoul":          [37.5665, 126.9780],
  "seoul":          [37.5665, 126.9780],
  "shanghai":       [31.2304, 121.4737],
  "pékin":          [39.9042, 116.4074],
  "pekin":          [39.9042, 116.4074],
  "beijing":        [39.9042, 116.4074],
  "hong kong":      [22.3193, 114.1694],
  "taipei":         [25.0330, 121.5654],
  "sydney":         [-33.8688, 151.2093],
  "melbourne":      [-37.8136, 144.9631],
  "auckland":       [-36.8485, 174.7633],
  // ==== Afrique ====
  "le caire":       [30.0444, 31.2357],
  "cairo":          [30.0444, 31.2357],
  "marrakesh":      [31.6295, -7.9811],
  "le cap":         [-33.9249, 18.4241],
  "cape town":      [-33.9249, 18.4241],
  "nairobi":        [-1.2921, 36.8219],
  "tunis":          [36.8065, 10.1815],
  "alger":          [36.7372, 3.0867],
  "dakar":          [14.7167, -17.4677],
  // ==== Moyen-Orient ====
  "istanbul":       [41.0082, 28.9784],
  "dubaï":          [25.2048, 55.2708],
  "dubai":          [25.2048, 55.2708],
  "tel aviv":       [32.0853, 34.7818],
  "jérusalem":      [31.7683, 35.2137],
  "jerusalem":      [31.7683, 35.2137],
  "petra":          [30.3285, 35.4444],
  "amman":          [31.9454, 35.9284],
};

// Demande la position actuelle de l'utilisateur
function requestUserLocation() {
  // SI DÉJÀ obtenue, ne pas redemander
  if (irlUserLocation) {
    _diag("[GEO] Position déjà obtenue: " + irlUserLocation.lat.toFixed(4) + ", " + irlUserLocation.lng.toFixed(4));
    return;
  }

  if (!navigator.geolocation) {
    _diag("[GEO] ❌ Géolocalisation non supportée → PARIS");
    irlUserLocation = { lat: 48.8566, lng: 2.3522 };
    return;
  }

  _diag("[GEO] 📍 Demande position utilisateur...");

  navigator.geolocation.getCurrentPosition(
    function(position) {
      irlUserLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      _diag("[GEO] ✅ Position obtenue: " + irlUserLocation.lat.toFixed(4) + ", " + irlUserLocation.lng.toFixed(4));
      _diag("[GEO] 📍 Précision: " + Math.round(position.coords.accuracy) + "m");

      // Afficher la ville de l'utilisateur
      const cityName = getClosestCity(irlUserLocation.lat, irlUserLocation.lng);
      updateIrlCityTitle();
      _diag("[GEO] 🏙️ Ville détectée: " + cityName);

      renderIRL(); // Re-render avec la nouvelle position
    },
    function(error) {
      _diag("[GEO] ❌ Erreur: " + error.message);
      irlUserLocationError = true;
      // Utiliser Paris par défaut
      irlUserLocation = { lat: 48.8566, lng: 2.3522 };
      _diag("[GEO] 🔄 Fallback PARIS: 48.8566, 2.3522");

      // Afficher Paris comme fallback
      updateIrlCityTitle();

      renderIRL();
    },
    { timeout: 5000, enableHighAccuracy: false }
  );
}

function cityToLatLng(city) {
  if (!city) return null;
  const key = String(city).toLowerCase().trim();
  if (FRANCE_CITIES[key]) return FRANCE_CITIES[key];
  // Recherche partielle
  for (const k in FRANCE_CITIES) {
    if (key.includes(k) || k.includes(key)) return FRANCE_CITIES[k];
  }
  return null;
}

// Trouver la ville la plus proche des coordonnées GPS
function getClosestCity(lat, lng) {
  if (!lat || !lng) return "France";

  let closestCity = "France";
  let closestDistance = Infinity;

  for (const cityName in FRANCE_CITIES) {
    const coords = FRANCE_CITIES[cityName];
    const dist = calculateDistance(lat, lng, coords[0], coords[1]);
    if (dist < closestDistance) {
      closestDistance = dist;
      closestCity = cityName.charAt(0).toUpperCase() + cityName.slice(1); // Capitalize
    }
  }

  return closestCity;
}

// Mettre à jour le titre avec la ville (sélectionnée ou détectée)
function updateIrlCityTitle() {
  const titleEl = document.getElementById("irlUserCityName");
  if (!titleEl) return;

  let displayName = "ta position";
  if (irlSelectedCity) {
    displayName = irlSelectedCity.name;
  } else if (irlUserLocation) {
    displayName = getClosestCity(irlUserLocation.lat, irlUserLocation.lng);
  } else if (irlUserLocationError) {
    displayName = "Paris (approx)";
  }

  titleEl.textContent = displayName;
}

// Sélecteur de ville pour IRL
function openIrlCitySelector() {
  const citiesList = Object.keys(FRANCE_CITIES).map(name => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    id: name,
    coords: FRANCE_CITIES[name]
  })).sort((a, b) => a.name.localeCompare(b.name));

  let html = `
    <div class="modal-handle"></div>
    <div class="modal-title">🔍 Chercher une ville</div>
    <input type="text" class="input" id="irlCitySearchInput" placeholder="Tape le nom d'une ville..." style="margin-bottom:12px;" />
    <div id="irlCitiesGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:300px;overflow-y:auto;margin-bottom:12px;">
  `;

  citiesList.forEach(city => {
    html += `<button class="pill" onclick="selectIrlCity('${city.id}', '${city.name}')" style="width:100%;justify-content:center;">
      ${city.name}
    </button>`;
  });

  html += `
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn secondary block" onclick="closeModal()">Annuler</button>
      <button class="btn primary block" onclick="clearIrlCitySelection()">📍 Ma position</button>
    </div>
  `;

  openModal(html);

  // Filtre en temps réel
  const searchInput = document.getElementById("irlCitySearchInput");
  const citiesGrid = document.getElementById("irlCitiesGrid");
  if (searchInput && citiesGrid) {
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      const buttons = citiesGrid.querySelectorAll("button");
      buttons.forEach(btn => {
        const text = btn.textContent.toLowerCase();
        btn.style.display = text.includes(query) ? "block" : "none";
      });
    });
    setTimeout(() => searchInput.focus(), 100);
  }
}

// Sélectionner une ville spécifique
function selectIrlCity(cityId, cityName) {
  irlSelectedCity = {
    id: cityId,
    name: cityName,
    coords: FRANCE_CITIES[cityId]
  };
  _diag("[IRL] 🏙️ Ville sélectionnée: " + cityName);
  updateIrlCityTitle();
  closeModal();
  renderIRL();
}

// Revenir à ta position
function clearIrlCitySelection() {
  irlSelectedCity = null;
  _diag("[IRL] 🗺️ Retour à ta position");
  updateIrlCityTitle();
  closeModal();
  renderIRL();
}

let irlMap = null;
let irlMarkersLayer = null;
let irlMapInitialized = false;
let irlMarkersAddedOnce = false;

function initIrlMap() {
  if (irlMap) {
    // Déjà initialisée, on force juste un redraw au cas où la taille du conteneur ait changé
    setTimeout(() => irlMap.invalidateSize(), 60);
    return;
  }
  const el = document.getElementById("irlMap");
  if (!el) return;
  if (typeof L === "undefined") {
    ensureLeaflet().then(function(){ initIrlMap(); if (typeof updateIrlMapMarkers === "function") updateIrlMapMarkers(); }).catch(function(){});
    return;
  }
  // Vue initiale : centre de la France, zoom 5.5 → on voit tout le pays
  irlMap = L.map(el, { zoomControl: true, attributionControl: true })
    .setView([46.6, 2.5], 5.7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  }).addTo(irlMap);
  irlMarkersLayer = L.layerGroup().addTo(irlMap);
  // Minimal delay pour laisser le DOM se stabiliser
  setTimeout(() => irlMap.invalidateSize(), 10);
  // Flag pour tracer la première initialisation
  irlMapInitialized = true;
}

// Revenir à la position GPS actuelle de l'utilisateur
function resetToUserLocation() {
  irlSelectedCity = null;
  _diag("[IRL] 🗺️ Retour à ta position actuelle");
  updateIrlCityTitle();
  if (irlMap) irlMap.closePopup();
  renderIRL();
  toast("📍 Position actuelle");
}

// Rechercher les suggestions d'adresses en temps réel
let irlAddressSearchTimeout;
async function searchIrlAddressSuggestions(query) {
  const suggestionsDiv = document.getElementById("irlAddressSuggestions");
  if (!suggestionsDiv) return;

  // Effacer le timeout précédent
  clearTimeout(irlAddressSearchTimeout);

  // Si le texte est trop court, ne rien faire
  if (!query || query.trim().length < 3) {
    suggestionsDiv.style.display = "none";
    return;
  }

  // Attendre 300ms avant de faire la requête (pour éviter trop d'appels)
  irlAddressSearchTimeout = setTimeout(async () => {
    try {
      // Rechercher sur Nominatim
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ", France")}&format=json&limit=8&addressdetails=1`);
      const results = await response.json();

      if (!results || results.length === 0) {
        suggestionsDiv.style.display = "none";
        return;
      }

      // Afficher les suggestions
      let html = "";
      results.forEach((result, index) => {
        const name = result.display_name.split(",")[0];
        const fullName = result.display_name.split(",").slice(0, 2).join(",").trim();
        html += `
          <div onclick="selectIrlAddressSuggestion('${name}', ${result.lat}, ${result.lon})" style="padding:8px 10px;border-bottom:1px solid #eee;cursor:pointer;font-size:12px;transition:background 0.2s;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='transparent';">
            <div style="font-weight:500;color:#333;">${name}</div>
            <div style="font-size:11px;color:#888;">${fullName.substring(fullName.indexOf(",") + 1).trim()}</div>
          </div>
        `;
      });

      suggestionsDiv.innerHTML = html;
      suggestionsDiv.style.display = "block";
    } catch (error) {
      console.error("Erreur recherche adresse:", error);
      suggestionsDiv.style.display = "none";
    }
  }, 300);
}

// Sélectionner une adresse suggérée
function selectIrlAddressSuggestion(name, lat, lng) {
  const input = document.getElementById("irlAddressInput");
  if (input) {
    input.value = name;
  }

  const suggestionsDiv = document.getElementById("irlAddressSuggestions");
  if (suggestionsDiv) {
    suggestionsDiv.style.display = "none";
  }

  // Mettre à jour la position
  irlSelectedCity = {
    id: "custom",
    name: name,
    coords: [lat, lng]
  };

  _diag("[GEO] ✅ Adresse sélectionnée: " + name);

  // Fermer le popup
  if (irlMap) irlMap.closePopup();

  // Re-render
  renderIRL();

  toast(`📍 ${name}`);
}

// Géocoder une adresse et mettre à jour la position
async function geocodeIrlAddress() {
  const input = document.getElementById("irlAddressInput");
  if (!input || !input.value.trim()) {
    toast("Entrez une adresse");
    return;
  }

  const address = input.value.trim();
  _diag("[GEO] 🔍 Géocodage de: " + address);

  try {
    // Utiliser Nominatim (OpenStreetMap) pour le géocodage
    const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ", France")}&format=json&limit=1`);
    const results = await response.json();

    if (!results || results.length === 0) {
      toast("Adresse non trouvée");
      _diag("[GEO] ❌ Adresse non trouvée: " + address);
      return;
    }

    const result = results[0];
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    // Mettre à jour la position sélectionnée
    irlSelectedCity = {
      id: "custom",
      name: result.display_name.split(",")[0] || address,
      coords: [lat, lng]
    };

    _diag("[GEO] ✅ Position trouvée: " + irlSelectedCity.name);

    // Fermer le popup
    if (irlMap) irlMap.closePopup();

    // Re-render pour mettre à jour
    renderIRL();

    toast(`📍 ${irlSelectedCity.name}`);
  } catch (error) {
    console.error("Erreur géocodage:", error);
    toast("Erreur de géolocalisation");
    _diag("[GEO] ❌ Erreur: " + error.message);
  }
}

function updateIrlMapMarkers() {
  if (!irlMap || !irlMarkersLayer) return;
  irlMarkersLayer.clearLayers();

  // Ajouter un marqueur pour la position actuelle
  var refLoc = null;
  var locLabel = "";
  if (irlSelectedCity) {
    refLoc = { lat: irlSelectedCity.coords[0], lng: irlSelectedCity.coords[1] };
    locLabel = irlSelectedCity.name;
  } else if (irlUserLocation) {
    refLoc = irlUserLocation;
    locLabel = getClosestCity(irlUserLocation.lat, irlUserLocation.lng);
  }

  if (refLoc) {
    const userIcon = L.divIcon({
      className: "",
      html: `<div style="font-size:32px;line-height:1;cursor:pointer;text-shadow:0 1px 3px rgba(0,0,0,0.3);">📍</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
    });
    const userMarker = L.marker([refLoc.lat, refLoc.lng], { icon: userIcon }).addTo(irlMarkersLayer);
    userMarker.bindPopup(`
      <div style="min-width:240px;padding:10px;">
        <div style="font-size:20px;text-align:center;margin-bottom:8px;">📍</div>
        <div style="font-weight:600;text-align:center;margin-bottom:8px;font-size:13px;line-height:1.4;">${locLabel}</div>
        <button onclick="resetToUserLocation()" style="width:100%;padding:4px 8px;border:none;background:transparent;color:#7c3aed;font-size:11px;text-decoration:underline;cursor:pointer;margin-bottom:12px;">
          ← Ma position actuelle
        </button>
        <div style="margin-bottom:10px;">
          <input type="text" id="irlAddressInput" placeholder="Chercher une adresse..." style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;font-size:12px;box-sizing:border-box;"/>
          <div id="irlAddressSuggestions" style="margin-top:6px;max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:6px;background:#fff;display:none;"></div>
        </div>
        <button onclick="geocodeIrlAddress()" style="width:100%;padding:8px;border-radius:6px;border:none;background:#7c3aed;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">
          🔍 Chercher
        </button>
      </div>
    `);

    // Focus sur l'input après l'ouverture du popup et setup autocomplete
    setTimeout(() => {
      const input = document.getElementById("irlAddressInput");
      if (input) {
        input.focus();

        // Recherche en temps réel
        input.addEventListener("input", (e) => {
          searchIrlAddressSuggestions(e.target.value);
        });

        // Touche Enter pour rechercher
        input.addEventListener("keypress", (e) => {
          if (e.key === "Enter") geocodeIrlAddress();
        });
      }
    }, 100);
  }

  // Même filtrage que la liste (helper partagé) → carte et liste cohérentes.
  var filtered = _filterIrlEvents(allEvents());

  const points = [];
  filtered.forEach(ev => {
    const ll = eventLatLng(ev);
    if (!ll) return;
    // Micro-jitter DÉTERMINISTE basé sur l'id (minimal, évite le chevauchement sans décalage visible)
    const h = String(ev.id || "").split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const lat = ll[0] + (((h * 13) % 100) / 50000 - 0.001);
    const lng = ll[1] + (((h * 23) % 100) / 50000 - 0.001);
    const passion = passionById(ev.passion) || { emoji: "📍", label: "" };
    const icon = L.divIcon({
      className: "passio-marker-wrap",
      html: `<div class="passio-marker">${ev.emoji || passion.emoji || "📍"}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -16],
    });
    const m = L.marker([lat, lng], { icon }).addTo(irlMarkersLayer);
    const d = fmtEventDate(ev.date);
    m.bindPopup(`
      <div class="irl-popup-title">${escapeHtml(ev.title || "Événement")}</div>
      <div class="irl-popup-meta">${passion.emoji || ""} ${escapeHtml(passion.label || "")} · ${escapeHtml(ev.city || "")} · ${d.day} ${d.month} à ${d.time}</div>
      <button class="irl-popup-btn" onclick="openEventDetails('${ev.id}')">Voir l'événement</button>
    `);
    points.push([lat, lng]);
  });

  // Auto-zoom sur les marqueurs filtrés
  setTimeout(() => {
    if (points.length > 0) {
      irlMap.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 11 });
    } else if (irlSelectedCity) {
      // Pas de marqueurs mais une ville sélectionnée : centrer sur cette ville
      irlMap.setView([irlSelectedCity.coords[0], irlSelectedCity.coords[1]], 9);
    } else if (irlUserLocation) {
      // Pas de marqueurs mais position GPS : centrer sur la position
      irlMap.setView([irlUserLocation.lat, irlUserLocation.lng], 9);
    } else {
      // Aucune position : vue générale de la France
      irlMap.setView([46.6, 2.5], 5.7);
    }
    // Forcer le redraw de la carte
    if (irlMap) irlMap.invalidateSize();
  }, 100);
}

function toggleIrlMapFullscreen() {
  const wrap = document.getElementById("irlMapWrap");
  if (!wrap) return;
  wrap.classList.toggle("fullscreen");
  // Laisse Leaflet s'adapter à la nouvelle taille
  setTimeout(() => { if (irlMap) irlMap.invalidateSize(); }, 320);
}

// Échap pour sortir du plein écran de la carte
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const wrap = document.getElementById("irlMapWrap");
    if (wrap && wrap.classList.contains("fullscreen")) {
      wrap.classList.remove("fullscreen");
      setTimeout(() => { if (irlMap) irlMap.invalidateSize(); }, 320);
    }
  }
});

function renderIrlPassionTiles() {
  const row = $("#irlPassionRow");
  if (!row) return;
  const events = allEvents();

  // Passions de l'utilisateur (basée sur ses profils créés)
  const userPassionIds = (state.user.profiles || []).map(p => p.passion).filter(Boolean);

  // Si l'utilisateur a des profils, afficher seulement ces passions
  // Sinon, afficher toutes les passions
  let passionIds = [];
  if (userPassionIds.length > 0) {
    passionIds = userPassionIds;
  } else {
    passionIds = [...new Set(events.map(e => e.passion).filter(Boolean))];
  }

  row.className = "msg-filter-tiles"; // réutilise le même style que la messagerie

  let html = "";

  passionIds.forEach(pid => {
    const p = passionById(pid) || { label: pid, emoji: "✨" };
    const cnt = events.filter(e => e.passion === pid).length;
    const isActive = irlPassionFilters.has(pid);
    html += `<button class="msg-tile ${isActive ? 'active' : ''}" data-irlpassion="${pid}">
      <span class="msg-tile-icon">${p.emoji}</span>
      <span class="msg-tile-label">${escapeHtml(p.label)}</span>
      ${cnt > 0 ? `<span class="msg-tile-badge">${cnt}</span>` : ""}
    </button>`;
  });
  row.innerHTML = html;
}

var irlDateFilters = new Set(); // Vide par défaut = afficher TOUS les événements futurs
var irlCustomDate = null;

function setIrlDateFilter(val, btn) {
  if (!irlDateFilters) irlDateFilters = new Set();

  // Toggle multi-select
  if (irlDateFilters.has(val)) {
    irlDateFilters.delete(val);
  } else {
    irlDateFilters.add(val);
  }

  if (btn) btn.classList.toggle("active");
  renderIRL();
}

function openIrlCalendar() {
  openModal('\
    <div class="modal-handle"></div>\
    <div class="modal-title">🗓 Choisir une date</div>\
    <label class="field"><span>Date de début</span>\
      <input type="date" class="input" id="irlCalStart" value="' + new Date().toISOString().split("T")[0] + '"/>\
    </label>\
    <label class="field"><span>Date de fin (optionnel)</span>\
      <input type="date" class="input" id="irlCalEnd"/>\
    </label>\
    <button class="btn primary block" onclick="applyIrlCalendar()" style="margin-top:14px;">Appliquer</button>\
  ');
}

function applyIrlCalendar() {
  var start = document.getElementById("irlCalStart")?.value;
  var end = document.getElementById("irlCalEnd")?.value;
  if (!start) { toast("Choisis une date"); return; }

  // Ajouter "custom" aux filtres de date
  if (!irlDateFilters) irlDateFilters = new Set();
  irlDateFilters.add("custom");
  irlCustomDate = { start: new Date(start).getTime(), end: end ? new Date(end + "T23:59:59").getTime() : new Date(start + "T23:59:59").getTime() };

  // Mettre à jour le bouton actif
  var customBtn = document.querySelector('#irlDateCarousel [data-irldate="custom"]');
  if (customBtn) customBtn.classList.add("active");

  closeModal();
  renderIRL();
}

// Point de référence pour le filtre distance : ville sélectionnée > GPS > Paris.
function _irlReferenceLoc() {
  if (irlSelectedCity) return { lat: irlSelectedCity.coords[0], lng: irlSelectedCity.coords[1] };
  if (irlUserLocation) return irlUserLocation;
  return { lat: 48.8566, lng: 2.3522 }; // fallback Paris
}

// Applique les 5 filtres IRL (passion / type / date / distance / heure) + retire le
// passé. Partagé entre la liste (renderIRL) et les marqueurs (updateIrlMapMarkers)
// pour qu'ils ne divergent jamais. (Factorisé le 2026-06-24.)
function _filterIrlEvents(events) {
  var now = Date.now();
  var filtered = events.filter(function(e) { return e.date > now; });

  // 1. Passion (multi-select) — vide = toutes
  if (irlPassionFilters && irlPassionFilters.size > 0) {
    filtered = filtered.filter(function(e) { return irlPassionFilters.has(e.passion); });
  }
  // 2. Type (Mes events / Inscrit)
  if (irlFilters && irlFilters.size > 0) {
    filtered = filtered.filter(function(e) {
      if (irlFilters.has("mine") && e._mine) return true;
      if (irlFilters.has("joined") && (state.user.joinedEvents || []).includes(e.id)) return true;
      return false;
    });
  }
  // 3. Date (multi-select)
  if (irlDateFilters && irlDateFilters.size > 0) {
    filtered = filtered.filter(function(e) {
      if (irlDateFilters.has("today")) {
        var ts = new Date(); ts.setHours(0,0,0,0);
        var te = new Date(); te.setHours(23,59,59,999);
        if (e.date >= ts.getTime() && e.date <= te.getTime()) return true;
      }
      if (irlDateFilters.has("tomorrow")) {
        var ms = new Date(); ms.setDate(ms.getDate()+1); ms.setHours(0,0,0,0);
        var me = new Date(); me.setDate(me.getDate()+1); me.setHours(23,59,59,999);
        if (e.date >= ms.getTime() && e.date <= me.getTime()) return true;
      }
      if (irlDateFilters.has("week") && e.date >= now && e.date <= now + 7 * 86400000) return true;
      if (irlDateFilters.has("month") && e.date >= now && e.date <= now + 30 * 86400000) return true;
      if (irlDateFilters.has("custom") && irlCustomDate && e.date >= irlCustomDate.start && e.date <= irlCustomDate.end) return true;
      return false;
    });
  }
  // 4. Distance
  if (irlDistanceFilter && irlDistanceFilter !== "") {
    var maxKm = parseInt(irlDistanceFilter);
    var ref = _irlReferenceLoc();
    filtered = filtered.filter(function(e) {
      var loc = eventLatLng(e);
      if (!loc) return true; // inclure si lieu non géolocalisable
      return calculateDistance(ref.lat, ref.lng, loc[0], loc[1]) <= maxKm;
    });
  }
  // 5. Heure (plage "HH:00 - HH:00")
  if (irlTimeFilter && irlTimeFilter.includes(" - ")) {
    var parts = irlTimeFilter.split(" - ");
    var sMin = parseInt(parts[0].split(":")[0]) * 60;
    var eMin = parseInt(parts[1].split(":")[0]) * 60 + 59;
    filtered = filtered.filter(function(e) {
      var d = new Date(e.date);
      var m = d.getHours() * 60 + d.getMinutes();
      return m >= sMin && m <= eMin;
    });
  }
  return filtered;
}

// Nombre de filtres actifs (pour l'indicateur "X filtres · Réinitialiser").
function _irlActiveFilterCount() {
  var n = 0;
  if (irlPassionFilters && irlPassionFilters.size) n += irlPassionFilters.size;
  if (irlFilters && irlFilters.size) n += irlFilters.size;
  if (irlDateFilters && irlDateFilters.size) n += irlDateFilters.size;
  if (irlDistanceFilter) n += 1;
  if (irlTimeFilter) n += 1;
  return n;
}

// Réinitialise tous les filtres IRL et l'état UI associé.
function clearAllIrlFilters() {
  if (irlPassionFilters) irlPassionFilters.clear();
  if (irlFilters) irlFilters.clear();
  if (irlDateFilters) irlDateFilters.clear();
  irlDistanceFilter = "";
  irlTimeFilter = "";
  irlCustomDate = null;
  var distSel = document.getElementById("irlDistanceFilter");
  if (distSel) distSel.value = "";
  var timeBtn = document.getElementById("irlTimeFilterBtn");
  if (timeBtn) timeBtn.textContent = "🕐 Horaire";
  var citySearch = document.getElementById("irlCitySearch");
  if (citySearch) citySearch.value = "";
  renderIRL();
}

function renderIRL() {
  // Mettre à jour le titre de la ville (sélectionnée ou détectée)
  updateIrlCityTitle();

  // Initialiser les filtres passion avec les profils de l'utilisateur (SYNCHRONE - pas d'attente)
  initializeIrlPassionFilters();

  renderIrlPassionTiles();
  initIrlMap();
  updateIrlMapMarkers();

  // Demander la position GPS EN ARRIÈRE-PLAN (ne pas bloquer le rendu initial)
  // Si elle est obtenue, elle appellera renderIRL() à nouveau avec la vraie position
  if (!irlUserLocation) {
    requestUserLocation();
  }

  var filtered = _filterIrlEvents(allEvents());

  // Indicateur "X filtres actifs · Réinitialiser"
  var statusEl = document.getElementById("irlFilterStatus");
  if (statusEl) {
    var nActive = _irlActiveFilterCount();
    if (nActive > 0) {
      statusEl.style.display = "flex";
      statusEl.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;margin-bottom:10px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;font-size:12px;";
      statusEl.innerHTML = '<span style="color:var(--muted);">' + nActive + ' filtre' + (nActive > 1 ? 's' : '') + ' actif' + (nActive > 1 ? 's' : '') + '</span>' +
        '<button onclick="clearAllIrlFilters()" style="background:none;border:none;color:var(--accent);font-weight:700;cursor:pointer;font-size:12px;">✕ Réinitialiser</button>';
    } else {
      statusEl.style.display = "none";
      statusEl.innerHTML = "";
    }
  }

  // Sync pills date (multi-select) - carousel
  document.querySelectorAll("#irlDateCarousel .pill").forEach(function(p) {
    p.classList.toggle("active", irlDateFilters && irlDateFilters.has(p.getAttribute("data-irldate")));
  });

  // Sync filter buttons (Mes events / Inscrit) - multi-select
  document.querySelectorAll("[data-irlfilter]").forEach(function(btn) {
    btn.classList.toggle("active", irlFilters && irlFilters.has(btn.getAttribute("data-irlfilter")));
  });

  // Trier par date croissante (prochain en premier)
  filtered.sort(function(a, b) { return a.date - b.date; });

  const list = $("#eventList");
  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">🗓</div><div class="empty-title">Aucun événement</div><div class="empty-text">Crée le premier pour +30 pts.</div><button class="btn primary" style="margin-top:10px;" onclick="openCreateEvent()">+ Créer</button></div>';
    return;
  }

  list.innerHTML = filtered.map(e => {
    const passion = passionById(e.passion);
    const joined = (state.user.joinedEvents || []).includes(e.id);
    const d = fmtEventDate(e.date);
    const daysLeft = Math.max(0, Math.ceil((e.date - Date.now()) / 86400000));
    const urgency = daysLeft === 0 ? "🔴 Aujourd'hui" : daysLeft === 1 ? "🟠 Demain" : daysLeft <= 7 ? "🟢 Dans " + daysLeft + "j" : "";
    const atts = (e.attendees || []).slice(0, 4);
    const attAvatars = atts.map(aid => {
      const u = userById(aid) || { avatar: "#64748b", profileEmoji: "?" };
      return `<div class="avatar sm" style="background:${avatarBg(u)};cursor:pointer;" onclick="openUserProfile('${aid}')">${avatarInner(u)}</div>`;
    }).join("");
    const timeStr = e.time || d.time || "";
    const venue = e.venue ? `· ${e.venue}` : "";
    const priceTag = e.price !== undefined && e.price !== null && e.price !== "" ? `<span class="pill" style="padding:2px 7px;font-size:10px;">${e.price == 0 ? "Gratuit 🎉" : e.price + " 💎 Passia"}</span>` : "";
    const typeTag = e.eventType ? `<span class="pill" style="padding:2px 7px;font-size:10px;">${e.eventType}</span>` : "";
    const attCount = (e.attendees || []).length;
    const isFull = e.maxAttendees && attCount >= e.maxAttendees && !joined;
    const spotsTag = e.maxAttendees
      ? (isFull
          ? `<span class="pill" style="padding:2px 7px;font-size:10px;color:#ef4444;border-color:rgba(239,68,68,0.4);">⚠️ Complet</span>`
          : `<span style="font-size:10px;color:var(--muted);">${attCount}/${e.maxAttendees} places</span>`)
      : "";
    return `<div class="event-card" data-city="${escapeHtml((e.city||'').toLowerCase())}" data-title="${escapeHtml((e.title||'').toLowerCase())}" onclick="openEventDetails('${e.id}')">
      <div style="display:flex;gap:10px;">
        <div class="event-date-block">
          <div class="event-date-day">${d.day}</div>
          <div class="event-date-month">${d.month}</div>
          <div style="font-size:10px;font-weight:700;color:var(--accent);margin-top:2px;">${timeStr}</div>
        </div>
        <div style="flex:1;min-width:0;">
          <div class="event-title">${escapeHtml(e.title)}</div>
          <div class="event-meta">${passion.emoji} ${passion.label} · 📍 ${escapeHtml(e.city || "")}${venue ? " · " + escapeHtml(venue) : ""}${urgency ? ' · <span style="font-weight:700;">' + urgency + '</span>' : ""}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;">${priceTag}${typeTag}${spotsTag}</div>
        </div>
        ${e._mine ? '<span class="pill active" style="height:fit-content;flex-shrink:0;">Organisé</span>' : ""}
      </div>
      <div style="font-size:12px;color:var(--text-dim);margin-top:8px;line-height:1.5;">${escapeHtml((e.desc || "").slice(0, 120))}${(e.desc||"").length > 120 ? "…" : ""}</div>
      <div class="event-footer">
        <div class="attendees">${attAvatars}<span class="pill" style="margin-left:6px;padding:3px 8px;">${(e.attendees || []).length} inscrit${(e.attendees||[]).length>1?"s":""}</span></div>
        <button class="btn small ${joined ? "ghost" : "primary"}" ${isFull ? "disabled" : ""} onclick="event.stopPropagation();toggleJoinEvent('${e.id}')">${joined ? "✓ Inscrit" : isFull ? "Complet" : "+ Rejoindre"}</button>
      </div>
    </div>`;
  }).join("");
}

function toggleJoinEvent(id) {
  // Muter l'objet canonique (state), pas une copie de allEvents() — sinon le
  // compteur d'inscrits et les avatars ne se mettaient jamais à jour localement.
  const ev = _findCanonicalEvent(id) || allEvents().find(e => e.id === id);
  if (!ev) return;
  const meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  const joined = (state.user.joinedEvents || []).includes(id);
  if (joined) {
    state.user.joinedEvents = state.user.joinedEvents.filter(x => x !== id);
    // Retire mon uid ET l'ancien marqueur "me" (la liste chargée depuis Supabase
    // contient MY_UID) pour ne pas laisser de doublon.
    ev.attendees = (ev.attendees || []).filter(x => x !== meId && x !== "me");
    toast("Désinscrit");
    supaLeaveEvent(id);
  } else {
    state.user.joinedEvents = state.user.joinedEvents || [];
    state.user.joinedEvents.push(id);
    ev.attendees = (ev.attendees || []).filter(x => x !== meId && x !== "me");
    ev.attendees.push(meId);
    grantReward("event_join");
    bumpQuest("join");
    pushNotification(`🤝 Tu rejoins <b>${escapeHtml(ev.title)}</b>`, "🤝");
    supaJoinEvent(id);
    // Notifier l'organisateur (interaction cross-compte sur SON événement).
    if (ev.fromSupabase && ev.organizerId && ev.organizerId !== meId && typeof supaInsertNotif === "function") {
      supaInsertNotif(ev.organizerId, "event_join", id, "a rejoint ton événement");
    }
  }
  saveState();
  renderIRL();
}

function filterIrlByDistance() {
  const distanceSelect = document.getElementById("irlDistanceFilter");
  irlDistanceFilter = (distanceSelect && distanceSelect.value) ? distanceSelect.value : "";
  renderIRL();
}

function openIrlTimePicker() {
  // Parser le filtre actuel au format "HH:MM - HH:MM" ou sinon utiliser valeurs par défaut
  let startHour = 0, endHour = 23;

  if (irlTimeFilter && irlTimeFilter.includes(" - ")) {
    const parts = irlTimeFilter.split(" - ");
    startHour = parseInt(parts[0].split(":")[0]) || 0;
    endHour = parseInt(parts[1].split(":")[0]) || 23;
  }

  // Générer les options pour les selects
  let hourOptions = '';
  for (let i = 0; i <= 23; i++) {
    hourOptions += `<option value="${i}">${String(i).padStart(2, '0')}:00</option>`;
  }

  let html = `
    <div class="modal-handle"></div>
    <div class="modal-title">🕐 Choisir une plage horaire</div>

    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:32px;font-weight:800;">
        <span id="irlDisplayStart" style="color:#3b82f6;">${String(startHour).padStart(2, '0')}:00</span>
        <span style="color:var(--text);margin:0 12px;">→</span>
        <span id="irlDisplayEnd" style="color:#3b82f6;">${String(endHour).padStart(2, '0')}:00</span>
      </div>
    </div>

    <!-- Dropdowns simples -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
      <div>
        <label style="display:block;font-weight:700;font-size:12px;margin-bottom:6px;">📍 Début</label>
        <select id="irlStartHour" class="input" onchange="irlUpdateTime()" style="width:100%;">
          ${hourOptions}
        </select>
      </div>
      <div>
        <label style="display:block;font-weight:700;font-size:12px;margin-bottom:6px;">📍 Fin</label>
        <select id="irlEndHour" class="input" onchange="irlUpdateTime()" style="width:100%;">
          ${hourOptions}
        </select>
      </div>
    </div>

    <!-- Prédéfinis rapides -->
    <div style="margin-bottom:20px;">
      <div style="font-weight:700;font-size:12px;color:var(--text);margin-bottom:8px;">⚡ Prédéfinis</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <button class="pill" onclick="irlSetQuick(6,12)">06h → 12h</button>
        <button class="pill" onclick="irlSetQuick(12,18)">12h → 18h</button>
        <button class="pill" onclick="irlSetQuick(18,23)">18h → 23h</button>
        <button class="pill" onclick="irlSetQuick(0,23)">00h → 23h</button>
      </div>
    </div>

    <div style="display:flex;gap:8px;">
      <button class="btn secondary block" onclick="clearIrlTimeFilter();closeModal()">Effacer</button>
      <button class="btn primary block" onclick="applyIrlTimeRange();closeModal()">✓ Appliquer</button>
    </div>
  `;

  openModal(html);

  // Initialiser les dropdowns avec les valeurs actuelles
  setTimeout(() => {
    const startSelect = document.getElementById("irlStartHour");
    const endSelect = document.getElementById("irlEndHour");
    if (startSelect) startSelect.value = startHour;
    if (endSelect) endSelect.value = endHour;
  }, 100);
}

// ===== INTERFACE HORAIRE SIMPLIFIÉE AVEC SELECTS =====

function irlUpdateTime() {
  const startSelect = document.getElementById("irlStartHour");
  const endSelect = document.getElementById("irlEndHour");

  if (!startSelect || !endSelect) return;

  let start = parseInt(startSelect.value) || 0;
  let end = parseInt(endSelect.value) || 23;

  // Validation: fin doit être > début
  if (end <= start) {
    end = start + 1;
    if (end > 23) end = 23;
    endSelect.value = end;
  }

  // Mettre à jour l'affichage
  const displayStart = document.getElementById("irlDisplayStart");
  const displayEnd = document.getElementById("irlDisplayEnd");
  if (displayStart) displayStart.textContent = String(start).padStart(2, '0') + ":00";
  if (displayEnd) displayEnd.textContent = String(end).padStart(2, '0') + ":00";
}

function irlSetQuick(start, end) {
  const startSelect = document.getElementById("irlStartHour");
  const endSelect = document.getElementById("irlEndHour");

  if (!startSelect || !endSelect) return;

  startSelect.value = start;
  endSelect.value = end;

  // Déclencher la mise à jour
  irlUpdateTime();
}

function updateIrlSliderDisplay(startVal, endVal) {
  const fill = document.getElementById("irlSliderFill");
  const display = document.getElementById("irlTimeRangeDisplay");

  if (!fill || !display) return;

  // Calculer les positions en pourcentage pour la barre colorée
  const startPercent = (startVal / 23) * 100;
  const endPercent = (endVal / 23) * 100;

  // Colorier la barre entre les deux curseurs
  fill.style.left = startPercent + "%";
  fill.style.width = (endPercent - startPercent) + "%";

  // Mettre à jour l'affichage
  display.innerHTML = `
    <span style="color:#3b82f6;">${String(startVal).padStart(2, '0')}:00</span>
    <span style="color:var(--text);margin:0 8px;">—</span>
    <span style="color:#3b82f6;">${String(endVal).padStart(2, '0')}:00</span>
  `;
}

function updateIrlDoubleRange() {
  // Fonction maintenant remplacée par updateIrlStart() et updateIrlEnd()
}

function applyIrlTimeRange() {
  // Lire depuis les NOUVEAUX selects
  const startSelect = document.getElementById("irlStartHour");
  const endSelect = document.getElementById("irlEndHour");

  if (!startSelect || !endSelect) {
    toast("❌ Erreur: sélects non trouvés");
    return;
  }

  let startHour = parseInt(startSelect.value) || 0;
  let endHour = parseInt(endSelect.value) || 23;

  // Validation
  if (endHour <= startHour) {
    endHour = startHour + 1;
  }

  // Sauvegarder le filtre
  irlTimeFilter = String(startHour).padStart(2, '0') + ":00 - " + String(endHour).padStart(2, '0') + ":00";

  // Mettre à jour le bouton
  const btn = document.getElementById("irlTimeFilterBtn");
  if (btn) btn.textContent = "🕐 " + irlTimeFilter;

  console.log("[IRL Filter] Plage horaire appliquée:", irlTimeFilter);
  toast("✓ Filtre appliqué: " + irlTimeFilter);

  // Recharger les événements filtrés
  renderIRL();
}

// 🔧 FIX AUDIT 2026-06-10 : bouton "Effacer" du filtre horaire IRL
// (référencé par onclick mais jamais défini → ReferenceError, le modal
// ne se fermait même pas).
function clearIrlTimeFilter() {
  irlTimeFilter = "";
  const btn = document.getElementById("irlTimeFilterBtn");
  if (btn) btn.textContent = "🕐 Heure";
  toast("Filtre horaire effacé");
  renderIRL();
}

function setIrlQuickTime(hour) {
  // Fonction supprimée - plus utilisée
}

function updateIrlTimeDisplay() {
  // Fonction supprimée - remplacée par updateIrlTimeRange()
}

function filterIrlByTime() {
  // Cette fonction est maintenant remplacée par openIrlTimePicker()
}

// Calcule la distance en km entre deux points GPS
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function openEventDetails(id) {
  // Ajouter à l'historique pour que le bouton back fonctionne
  pushOverlayToHistory("event", id);

  const ev = allEvents().find(e => e.id === id);
  if (!ev) return;
  const passion = passionById(ev.passion) || { emoji: "✨", label: "Passion" };
  const organizer = userById(ev.organizerId) || { name: currentProfile()?.name || "Organisateur", profileEmoji: "✨", avatar: "#8b5cf6" };
  const joined = (state.user.joinedEvents || []).includes(id);
  const daysLeft = Math.max(0, Math.ceil((ev.date - Date.now()) / 86400000));
  const urgencyClass = daysLeft === 0 ? "today" : daysLeft <= 3 ? "soon" : "normal";
  const urgencyText = daysLeft === 0 ? "🔴 Aujourd'hui !" : daysLeft === 1 ? "🟠 Demain" : daysLeft <= 7 ? `🟢 Dans ${daysLeft} jours` : `📅 Dans ${daysLeft} jours`;

  // --- Hero ---
  const coverEl = document.getElementById("eventDetailCover");
  if (!coverEl) return;
  if (ev.coverUrl) {
    coverEl.innerHTML = `<img loading="lazy" decoding="async" class="event-detail-cover" src="${escapeHtml(ev.coverUrl)}" onerror="this.parentElement.innerHTML='<div class=\\'event-detail-cover-placeholder\\'>${ev.emoji || passion.emoji}</div>'" alt=""/>`;
  } else {
    coverEl.innerHTML = `<div class="event-detail-cover-placeholder">${escapeHtml(ev.emoji || passion.emoji)}</div>`;
  }

  const heroTitle = document.getElementById("eventDetailHeroTitle");
  if (heroTitle) {
    heroTitle.innerHTML = `
      <div class="event-detail-passion-badge">${passion.emoji} ${passion.label}${ev.eventType ? ` · ${ev.eventType}` : ""}</div>
      <div class="event-detail-title">${escapeHtml(ev.title || "Événement")}</div>
    `;
  }

  // --- Info helpers ---
  const infoRow = (icon, label, value, extra) => `
    <div class="event-detail-info-row">
      <div class="event-detail-info-icon">${icon}</div>
      <div style="flex:1;min-width:0;">
        <div class="event-detail-info-label">${label}</div>
        <div class="event-detail-info-value">${value}</div>
        ${extra ? `<div style="margin-top:4px;">${extra}</div>` : ""}
      </div>
    </div>`;

  const dateObj = new Date(ev.date);
  const dateStr = dateObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = ev.time || dateObj.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const atts = ev.attendees || [];
  const maxStr = ev.maxAttendees ? ` / ${ev.maxAttendees} max` : "";
  const spotsLeft = ev.maxAttendees ? ev.maxAttendees - atts.length : null;
  const spotsHtml = spotsLeft !== null
    ? `<span style="font-size:11px;color:${spotsLeft <= 3 ? "#ef4444" : "var(--muted)"};">${spotsLeft <= 0 ? "⚠️ Complet" : spotsLeft <= 3 ? `⚡ Plus que ${spotsLeft} place${spotsLeft > 1 ? "s" : ""}` : `${spotsLeft} places disponibles`}</span>`
    : "";

  const participantsHtml = atts.slice(0, 12).map(aid => {
    const u = userById(aid) || { name: aid === "me" ? (currentProfile()?.name || "Moi") : "Participant", avatar: "#8b5cf6", profileEmoji: "✨" };
    const firstName = (u.name || "?").split(" ")[0];
    return `<div class="event-detail-participant" style="cursor:pointer;" onclick="openUserProfile('${aid}')">
      <div class="avatar sm" style="background:${avatarBg(u)};">${avatarInner(u)}</div>
      <div class="event-detail-participant-name">${escapeHtml(firstName)}</div>
    </div>`;
  }).join("") + (atts.length > 12 ? `<div class="event-detail-participant"><span style="font-size:12px;color:var(--muted);">+${atts.length - 12} autres</span></div>` : "");

  const addressFull = [ev.address, ev.postalCode, ev.city].filter(Boolean).join(", ");
  const mapsLink = addressFull ? `<a href="https://maps.google.com/?q=${encodeURIComponent(addressFull)}" target="_blank" class="event-detail-info-link">📍 Voir sur Google Maps →</a>` : "";
  const priceStr = (ev.price === 0 || ev.price === "0" || ev.price === "" || ev.price === undefined || ev.price === null) ? "Gratuit 🎉" : `${ev.price} 💎 Passia`;

  // Build info rows (only show filled fields)
  const infoRows = [
    infoRow("📅", "Date & heure", `${dateStr} à ${timeStr}`),
    addressFull ? infoRow("📍", "Adresse", escapeHtml(addressFull), mapsLink) : (ev.city ? infoRow("🏙️", "Ville", escapeHtml(ev.city)) : ""),
    ev.venue ? infoRow("🏠", "Lieu", escapeHtml(ev.venue)) : "",
    infoRow("💎", "Prix", priceStr),
    ev.contact ? infoRow("📞", "Contact", `<a href="tel:${escapeHtml(ev.contact)}" style="color:var(--accent);font-weight:700;">${escapeHtml(ev.contact)}</a>`) : "",
    ev.externalLink ? infoRow("🔗", "Plus d'infos", `<a href="${escapeHtml(ev.externalLink)}" target="_blank" class="event-detail-info-link">${escapeHtml(ev.externalLink.replace(/^https?:\/\//, "").slice(0, 45))}</a>`) : "",
  ].filter(Boolean).join("");

  document.getElementById("eventDetailContent").innerHTML = `
    <div class="event-detail-urgency ${urgencyClass}">${urgencyText}</div>

    <div style="display:flex;gap:8px;margin:10px 0;">
      <button class="btn ghost block" onclick="downloadEventIcs('${ev.id}')" style="font-size:12px;">📅 Ajouter au calendrier</button>
      <button class="btn ghost block" onclick="shareEvent('${ev.id}')" style="font-size:12px;">🔗 Partager</button>
    </div>

    <div class="event-detail-info-card">${infoRows}</div>

    ${ev.desc ? `
      <div class="event-detail-section-title">Description</div>
      <div class="event-detail-desc">${escapeHtml(ev.desc).replace(/\n/g, "<br>")}</div>
    ` : ""}

    <div class="event-detail-section-title">Organisateur·ice</div>
    <div class="event-detail-organizer" style="cursor:pointer;" onclick="openUserProfile('${ev.organizerId || "me"}')">
      <div class="avatar sm" style="background:${avatarBg(organizer)};">${avatarInner(organizer)}</div>
      <div style="font-size:14px;font-weight:700;">${escapeHtml(organizer.name || "?")}</div>
    </div>

    <div class="event-detail-section-title">Participants (${atts.length}${maxStr})</div>
    ${spotsHtml ? `<div style="margin-bottom:8px;">${spotsHtml}</div>` : ""}
    <div class="event-detail-participants">${participantsHtml || "<span style='font-size:13px;color:var(--muted);'>Aucun inscrit pour l'instant — sois le premier !</span>"}</div>
  `;

  _refreshEventDetailCta(ev, joined);

  const shareBtn = document.getElementById("eventDetailShareBtn");
  if (shareBtn) shareBtn.onclick = function() { shareEvent(id); };

  const page = document.getElementById("eventDetailPage");
  page.style.display = "flex";
  page.scrollTop = 0;

}

function _refreshEventDetailCta(ev, joined) {
  const cta = document.getElementById("eventDetailCta");
  if (!cta) return;
  const spotsLeft = ev.maxAttendees ? ev.maxAttendees - (ev.attendees || []).length : null;
  const isFull = spotsLeft !== null && spotsLeft <= 0 && !joined;
  cta.innerHTML = `
    <button class="btn ${joined ? "ghost" : "primary"} block" ${isFull ? "disabled" : ""} onclick="toggleJoinEventDetail('${ev.id}')">
      ${joined ? "✓ Inscrit — Se désinscrire" : isFull ? "⚠️ Complet" : "+ Rejoindre · +25 pts · +5 💎"}
    </button>
  `;
}

function toggleJoinEventDetail(id) {
  toggleJoinEvent(id);
  const ev = allEvents().find(e => e.id === id);
  if (!ev) return;
  const joined = (state.user.joinedEvents || []).includes(id);
  _refreshEventDetailCta(ev, joined);
  // Refresh spots count
  const atts = ev.attendees || [];
  const maxStr = ev.maxAttendees ? ` / ${ev.maxAttendees} max` : "";
  const titles = document.querySelectorAll(".event-detail-section-title");
  titles.forEach(t => { if (t.textContent.startsWith("Participants")) t.textContent = `Participants (${atts.length}${maxStr})`; });
}

function closeEventDetail() {
  const page = document.getElementById("eventDetailPage");
  if (page) page.style.display = "none";

}

// Export d'un événement au format iCalendar (.ics) → import dans Google/Apple/Outlook.
function downloadEventIcs(id) {
  const ev = allEvents().find(e => e.id === id);
  if (!ev) return;
  const start = new Date(ev.date);
  const end = new Date(ev.date + 2 * 3600000); // durée par défaut 2 h
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const loc = [ev.venue, ev.address, ev.postalCode, ev.city].filter(Boolean).join(", ");
  const esc = (s) => String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PASSIO//IRL//FR", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    "UID:passio-" + ev.id + "@passio.app",
    "DTSTAMP:" + fmt(new Date()),
    "DTSTART:" + fmt(start),
    "DTEND:" + fmt(end),
    "SUMMARY:" + esc(ev.title),
    "DESCRIPTION:" + esc(ev.desc || ""),
    "LOCATION:" + esc(loc),
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY",
    "DESCRIPTION:" + esc("Rappel : " + (ev.title || "événement") + " demain"),
    "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  try {
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (ev.title || "evenement").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40) + ".ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("📅 Événement ajouté à ton calendrier (rappel J-1 inclus)");
  } catch (e) { toast("Export calendrier impossible"); }
}

// Partage d'un événement : Web Share API si dispo, sinon copie du lien.
function shareEvent(id) {
  const ev = allEvents().find(e => e.id === id);
  if (!ev) return;
  const url = location.origin + location.pathname + "#irl-event-" + id;
  const d = fmtEventDate(ev.date);
  const text = `${ev.title} · ${ev.city || ""} · ${d.day} ${d.month}`;
  if (navigator.share) {
    navigator.share({ title: ev.title, text, url }).catch(() => {});
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url + "\n" + text).then(
      () => toast("🔗 Lien de l'événement copié"),
      () => toast("Copie impossible")
    );
  } else {
    toast("🔗 " + url);
  }
}

function previewEventCover(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    const img = document.getElementById("evCoverPreviewImg");
    const placeholder = document.getElementById("evCoverPreviewPlaceholder");
    const removeBtn = document.getElementById("evCoverRemoveBtn");
    const dataInput = document.getElementById("evCoverData");
    if (img) { img.src = dataUrl; img.style.display = "block"; }
    if (placeholder) placeholder.style.display = "none";
    if (removeBtn) removeBtn.style.display = "block";
    if (dataInput) dataInput.value = dataUrl;
  };
  reader.readAsDataURL(file);
}

function removeEventCover() {
  const img = document.getElementById("evCoverPreviewImg");
  const placeholder = document.getElementById("evCoverPreviewPlaceholder");
  const removeBtn = document.getElementById("evCoverRemoveBtn");
  const dataInput = document.getElementById("evCoverData");
  const fileInput = document.getElementById("evCoverFile");
  if (img) { img.src = ""; img.style.display = "none"; }
  if (placeholder) placeholder.style.display = "block";
  if (removeBtn) removeBtn.style.display = "none";
  if (dataInput) dataInput.value = "";
  if (fileInput) fileInput.value = "";
}

function openCreateEvent() {
  const myPassionIds = (state.user.profiles || []).map(pr => pr.passion).filter(Boolean);
  const myPassions = allPassions().filter(p => myPassionIds.includes(p.id));
  const passionOptions = (myPassions.length ? myPassions : allPassions())
    .map(p => `<option value="${p.id}">${p.emoji} ${p.label}</option>`).join("");

  const eventTypes = ["Atelier", "Jam session", "Concert", "Exposition", "Sport & activité", "Randonnée", "Dégustation", "Book club", "Cours", "Marché", "Soirée", "Rencontre", "Conférence", "Compétition", "Autre"];
  const typeOptions = eventTypes.map(t => `<option value="${t}">${t}</option>`).join("");

  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">✨ Créer un événement IRL</div>
    <div class="modal-subtitle">Rejoins ou crée des moments réels avec ta communauté. +30 pts · +5 💎</div>

    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:var(--accent);margin:14px 0 8px;">🖼 Photo de couverture</div>
    <div id="evCoverPreviewWrap" style="width:100%;height:140px;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,#4c1d95,#7c3aed);display:flex;align-items:center;justify-content:center;margin-bottom:10px;position:relative;cursor:pointer;" onclick="document.getElementById('evCoverFile').click()">
      <img loading="lazy" decoding="async" id="evCoverPreviewImg" src="" alt="" style="display:none;width:100%;height:100%;object-fit:cover;position:absolute;inset:0;"/>
      <div id="evCoverPreviewPlaceholder" style="text-align:center;color:rgba(255,255,255,0.85);">
        <div style="font-size:32px;margin-bottom:6px;">📷</div>
        <div style="font-size:12px;font-weight:700;">Appuie pour choisir une photo</div>
        <div style="font-size:10px;opacity:0.7;margin-top:2px;">JPG, PNG — recommandé 1200×400</div>
      </div>
      <input type="file" id="evCoverFile" accept="image/*" style="display:none;" onchange="previewEventCover(this)"/>
      <button id="evCoverRemoveBtn" onclick="event.stopPropagation();removeEventCover()" style="display:none;position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.5);border:none;color:#fff;border-radius:20px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;">✕ Supprimer</button>
    </div>
    <input type="hidden" id="evCoverData"/>

    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:var(--accent);margin:14px 0 8px;">📝 Infos principales</div>
    <label class="field"><span>Titre *</span>
      <input type="text" class="input" id="evTitle" placeholder="Ex : Jam session guitare débutants" maxlength="80"/>
    </label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <label class="field"><span>Passion *</span>
        <select class="input" id="evPassion">${passionOptions}</select>
      </label>
      <label class="field"><span>Type</span>
        <select class="input" id="evType">${typeOptions}</select>
      </label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <label class="field"><span>Date *</span>
        <input type="date" class="input" id="evDate"/>
      </label>
      <label class="field"><span>Heure</span>
        <input type="time" class="input" id="evTime" value="18:00"/>
      </label>
    </div>

    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:var(--accent);margin:14px 0 8px;">📍 Lieu</div>
    <label class="field"><span>Nom du lieu</span>
      <input type="text" class="input" id="evVenue" placeholder="Café du Coin, Parc, Studio…" maxlength="80"/>
    </label>
    <label class="field"><span>Adresse</span>
      <input type="text" class="input" id="evAddress" placeholder="12 rue de la Paix" maxlength="100"/>
    </label>
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;">
      <label class="field"><span>Code postal</span>
        <input type="text" class="input" id="evPostal" placeholder="75001" maxlength="10"/>
      </label>
      <label class="field"><span>Ville *</span>
        <input type="text" class="input" id="evCity" placeholder="Paris" maxlength="60"/>
      </label>
    </div>

    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:var(--accent);margin:14px 0 8px;">ℹ️ Détails</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <label class="field"><span>Prix en Passia 💎 (0 = gratuit)</span>
        <input type="number" class="input" id="evPrice" placeholder="0" min="0" max="99999" value="0"/>
      </label>
      <label class="field"><span>Places max</span>
        <input type="number" class="input" id="evMax" placeholder="Illimité" min="1" max="9999"/>
      </label>
    </div>
    <label class="field"><span>Contact (tél ou email)</span>
      <input type="text" class="input" id="evContact" placeholder="06 12 34 56 78" maxlength="80"/>
    </label>
    <label class="field"><span>Lien (Eventbrite, site…)</span>
      <input type="url" class="input" id="evLink" placeholder="https://…" maxlength="200"/>
    </label>
    <label class="field"><span>Description</span>
      <textarea class="textarea" id="evDesc" placeholder="Programme, ambiance, quoi apporter…" maxlength="800" style="min-height:90px;"></textarea>
    </label>

    <button class="btn primary block" style="margin-top:8px;" onclick="submitEvent()">🎉 Publier · +30 pts</button>
  `);

  setTimeout(() => {
    const d = new Date(Date.now() + 7 * 86400000);
    const inp = document.getElementById("evDate");
    if (inp) inp.value = d.toISOString().slice(0, 10);
  }, 20);
}

async function submitEvent() {
  const g = (id) => document.getElementById(id);
  const title = (g("evTitle")?.value || "").trim();
  const passion = g("evPassion")?.value || "";
  const city = (g("evCity")?.value || "").trim();
  const date = g("evDate")?.value || "";
  const time = g("evTime")?.value || "18:00";
  const desc = (g("evDesc")?.value || "").trim();
  const venue = (g("evVenue")?.value || "").trim();
  const address = (g("evAddress")?.value || "").trim();
  const postalCode = (g("evPostal")?.value || "").trim();
  const price = parseFloat(g("evPrice")?.value || "0") || 0;
  const maxAttendees = parseInt(g("evMax")?.value || "") || null;
  const contact = (g("evContact")?.value || "").trim();
  const externalLink = (g("evLink")?.value || "").trim();
  const eventType = g("evType")?.value || "Autre";
  const coverUrl = (g("evCoverData")?.value || "").trim() || null;

  if (title.length < 3) { toast("Titre trop court (3 caractères min)"); return; }
  if (!city) { toast("Indique une ville"); return; }
  if (!date) { toast("Choisis une date"); return; }
  if (!passion) { toast("Sélectionne une passion"); return; }

  const ts = new Date(date + "T" + time).getTime();
  if (isNaN(ts)) { toast("Date invalide"); return; }

  const p = passionById(passion) || { emoji: "✨" };
  const ev = {
    id: uid(), title, passion,
    emoji: p.emoji, date: ts, time, city,
    venue, address, postalCode, desc,
    price, maxAttendees, contact, externalLink, eventType,
    coverUrl,
    organizerId: "me", attendees: ["me"],
    lat: null, lng: null,
  };
  // Coordonnées : ville connue (dictionnaire) sinon géocodage Nominatim de l'adresse
  // complète → le marqueur apparaît même pour une ville hors dictionnaire.
  const known = cityToLatLng(city);
  if (known) { ev.lat = known[0]; ev.lng = known[1]; }
  else {
    const geo = await _geocodeAddress([address, postalCode, city, "France"].filter(Boolean).join(", "));
    if (geo) { ev.lat = geo.lat; ev.lng = geo.lng; }
  }
  state.userEvents = state.userEvents || [];
  state.userEvents.unshift(ev);
  state.user.joinedEvents = state.user.joinedEvents || [];
  state.user.joinedEvents.push(ev.id);
  grantReward("event_create");
  saveState();
  // Sync Supabase (coords incluses)
  if (typeof supaPublishEvent === "function") supaPublishEvent(ev);
  closeModal();
  renderIRL();
  toast("🎉 Événement créé !");
}

// Géocode une adresse libre via Nominatim → { lat, lng } ou null.
async function _geocodeAddress(query) {
  if (!query) return null;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
    const j = await r.json();
    if (j && j[0]) return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) };
  } catch (e) {}
  return null;
}

// Coordonnées d'un événement : coords stockées (géocodage) sinon dictionnaire ville.
function eventLatLng(ev) {
  if (ev && typeof ev.lat === "number" && typeof ev.lng === "number") return [ev.lat, ev.lng];
  return cityToLatLng(ev && ev.city) || cityToLatLng(ev && ev.location);
}


// Fonction de test pour vérifier le filtre distance
function testIrlDistance() {
  // Créer des événements de test avec des villes exactes de FRANCE_CITIES
  // Calibré pour un point de référence à Annecy
  const testEvents = [
    { id: "test_nearby_10km", title: "🍽️ Déjeuner local", passion: "cuisine", city: "annecy", date: Date.now() + 86400000, time: "12:00", organizerId: "test", emoji: "🍽️", attendees: [] },
    { id: "test_nearby_25km", title: "🏔️ Rando montagne", passion: "sport", city: "chamonix", date: Date.now() + 2*86400000, time: "09:00", organizerId: "test", emoji: "⛰️", attendees: [] },
    { id: "test_nearby_80km", title: "🎵 Festival musique", passion: "musique", city: "lyon", date: Date.now() + 3*86400000, time: "20:00", organizerId: "test", emoji: "🎵", attendees: [] },
    { id: "test_far_350km", title: "🎨 Expo moderne", passion: "art", city: "marseille", date: Date.now() + 4*86400000, time: "14:00", organizerId: "test", emoji: "🎨", attendees: [] },
    { id: "test_far_650km", title: "💻 Tech conference", passion: "tech", city: "paris", date: Date.now() + 5*86400000, time: "19:00", organizerId: "test", emoji: "💻", attendees: [] },
  ];

  state.userEvents = (state.userEvents || []).concat(testEvents);
  saveState();

  _diag("🧪 === TEST DISTANCE ===");
  _diag("🧪 " + testEvents.length + " événements de test créés");
  testEvents.forEach(ev => {
    const loc = cityToLatLng(ev.city);
    if (loc) {
      const dist = calculateDistance(45.8992, 6.1294, loc[0], loc[1]); // Annecy as reference
      _diag("🧪 [" + dist.toFixed(0) + "km] " + ev.title + " → " + ev.city);
    } else {
      _diag("🧪 ❌ " + ev.title + " → " + ev.city + " NON RECONNUE");
    }
  });

  renderIRL();
  toast("🧪 5 événements de test créés! Ouvre le diagnostic (F12)");
}

// ======== WALLET ========
function renderWallet() {
  const s = state.user.score || 0;
  const p = state.user.passia || 0;
  $("#heroScore").textContent = s;
  $("#heroPassia").textContent = p;

  // Rank
  const r = rankOf(s);
  $("#rankLabel").textContent = r.label;
  $("#scoreNum").textContent = s;
  const rNext = r.next || r.min;
  $("#nextRankText").textContent = r.next ? `Prochain rang à ${r.next} pts · ${Math.max(0, r.next - s)} à gagner` : "Rang maximum atteint 🏆";
  const pct = r.next ? Math.min(100, ((s - r.min) / (r.next - r.min)) * 100) : 100;
  const circ = 2 * Math.PI * 42;
  $("#ringFg").setAttribute("stroke-dasharray", circ.toFixed(2));
  $("#ringFg").setAttribute("stroke-dashoffset", (circ * (1 - pct / 100)).toFixed(2));
  $("#passiaBalance").textContent = p;
  // Indicateur valeur estimée (1 PSI = 0,05 € en démo)
  const valIndic = $("#passiaValueIndicator");
  if (valIndic) {
    const eurValue = (p * 0.05).toFixed(2).replace(".", ",");
    valIndic.textContent = `≈ ${eurValue} € · ↗ +12 %`;
  }

  // Earn guide
  const guide = $("#earnGuide");
  guide.innerHTML = `
    <div class="tx"><div class="tx-icon">✍️</div>
      <div class="tx-body"><div class="tx-title">Publier un post texte</div><div class="tx-meta">Raconte ton processus</div></div>
      <div class="tx-amount plus">+10 · 1💎</div></div>
    <div class="tx"><div class="tx-icon">📷</div>
      <div class="tx-body"><div class="tx-title">Publier une photo</div><div class="tx-meta">Montre, ne décris pas</div></div>
      <div class="tx-amount plus">+15 · 2💎</div></div>
    <div class="tx"><div class="tx-icon">🎙️</div>
      <div class="tx-body"><div class="tx-title">Publier un podcast</div><div class="tx-meta">Les coulisses valent de l'or</div></div>
      <div class="tx-amount plus">+20 · 3💎</div></div>
    <div class="tx"><div class="tx-icon">🤝</div>
      <div class="tx-body"><div class="tx-title">Rejoindre un événement IRL</div><div class="tx-meta">Le digital devient réel</div></div>
      <div class="tx-amount plus">+25 · 5💎</div></div>
    <div class="tx"><div class="tx-icon">🗓</div>
      <div class="tx-body"><div class="tx-title">Organiser un événement</div><div class="tx-meta">Tu rassembles la communauté</div></div>
      <div class="tx-amount plus">+30 · 5💎</div></div>
    <div class="tx"><div class="tx-icon">✨</div>
      <div class="tx-body"><div class="tx-title">Créer un nouveau profil</div><div class="tx-meta">Nouvelle passion = nouvelle identité</div></div>
      <div class="tx-amount plus">+15 · 2💎</div></div>
  `;

  // History
  const tx = state.transactions || [];
  const txList = $("#txList");
  if (tx.length === 0) {
    txList.innerHTML = `<div class="empty"><div class="empty-icon">🧾</div><div class="empty-title">Aucune transaction</div><div class="empty-text">Commence à publier pour gagner.</div></div>`;
  } else {
    txList.innerHTML = tx.slice(0, 30).map(t => {
      const icon = { publish_text: "✍️", publish_photo: "📷", publish_video: "🎬", publish_audio: "🎙", event_create: "🗓", event_join: "🤝", comment: "💬", profile_create: "✨", first_login: "🎉", daily: "☀️" }[t.kind] || "⭐";
      return `<div class="tx">
        <div class="tx-icon">${icon}</div>
        <div class="tx-body">
          <div class="tx-title">${escapeHtml(t.label)}</div>
          <div class="tx-meta">${fmtTime(t.at)}</div>
        </div>
        <div class="tx-amount plus">+${t.pts}${t.passia ? ` · ${t.passia}💎` : ""}</div>
      </div>`;
    }).join("");
  }

  // Leaderboard (mix of seed users + me)
  const lbEntries = [
    ...state.seed.users.map(u => ({
      id: u.id,
      name: u.name,
      emoji: u.profileEmoji,
      color: u.avatar,
      passion: passionById(u.passion).label,
      score: Math.floor(Math.random() * 1400 + 300), // pseudo, but stable per seed? We'll compute deterministic
    })),
    { id: "me", name: state.user.name || "Moi", emoji: currentProfile()?.emoji || "✨", color: currentProfile()?.color || "#8b5cf6", passion: passionById(currentProfile()?.passion)?.label || "—", score: state.user.score, me: true },
  ];
  // Deterministic seed scores: hash of id
  const hash = (s) => s.split("").reduce((a, c) => (a * 33 + c.charCodeAt(0)) >>> 0, 5381);
  lbEntries.forEach(e => {
    if (!e.me) e.score = 300 + (hash(e.id) % 1500);
  });
  const sorted = lbEntries.sort((a, b) => b.score - a.score).slice(0, 8);
  $("#leaderboard").innerHTML = sorted.map((e, i) => {
    const rc = ["gold", "silver", "bronze"][i] || "";
    return `<div class="lb-row">
      <div class="lb-rank ${rc}">${i + 1}</div>
      <div class="avatar sm" style="background:${e.color};">${e.emoji || e.name[0]}</div>
      <div class="lb-body">
        <div class="lb-name">${escapeHtml(e.name)}${e.me ? ' <span class="pill active" style="padding:1px 6px;font-size:9px;">Moi</span>' : ""}</div>
        <div class="lb-passion">${escapeHtml(e.passion)}</div>
      </div>
      <div class="lb-score">${e.score}</div>
    </div>`;
  }).join("");

  renderQuests();
}

