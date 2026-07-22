// ---- Affichage résultats IA ----
// Peint le bloc de réponse (en-tête + badge de source + corps + recherches liées).
// `bodyHtml` est déjà du HTML sûr (réponse IA échappée, ou HTML local maîtrisé).
function _aiRenderResult(query, bodyHtml, badge) {
  var resultContent = document.getElementById("aiResultContent");
  if (!resultContent) return;
  var related = aiGetRelated(query);
  var relatedHTML = related.length
    ? '<div class="ai-section-label" style="margin-top:18px;">Recherches liées</div>' +
      '<div class="ai-related">' +
        related.map(function(s) {
          return '<button class="ai-related-btn" onclick="sendAIQuery(\'' + s.replace(/'/g, "\\'") + '\')">' + escapeHtml(s) + '</button>';
        }).join("") +
      '</div>'
    : "";
  resultContent.innerHTML =
    '<div class="ai-result-header">' +
      '<div class="ai-result-query">"' + escapeHtml(query) + '"</div>' +
      '<button class="ai-result-back" onclick="aiShowHome()">‹ Retour</button>' +
    '</div>' +
    '<div style="display:inline-flex;align-items:center;gap:6px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.2);border-radius:20px;padding:4px 10px;font-size:11px;color:var(--muted);margin-bottom:12px;">' +
      badge +
    '</div>' +
    bodyHtml +
    relatedHTML;
}

// Interroge l'Edge Function `ask-ai` (Claude) avec un timeout. Renvoie le texte
// de réponse, ou null si indisponible (fonction non déployée, hors-ligne, pas de
// session, erreur, timeout) → le client retombe alors sur le moteur local.
async function _aiAskRemote(query, timeoutMs) {
  try {
    if (typeof supa === "undefined" || !supa || !window._supaReal || !supa.functions) return null;
    var invoke = supa.functions.invoke("ask-ai", { body: { query: query } });
    var timeout = new Promise(function(resolve) { setTimeout(function(){ resolve({ _timeout: true }); }, timeoutMs || 8000); });
    var res = await Promise.race([invoke, timeout]);
    if (!res || res._timeout) return null;
    if (res.error) return null;
    var txt = res.data && res.data.text;
    return (typeof txt === "string" && txt.trim()) ? txt.trim() : null;
  } catch (e) { return null; }
}

// Transforme le texte brut de l'IA en HTML sûr : échappe tout, puis rend les
// sauts de ligne et les puces « - » simples. Pas d'HTML arbitraire de l'IA.
function _aiTextToHtml(text) {
  var lines = String(text).split(/\n+/).map(function(l){ return l.trim(); }).filter(Boolean);
  var html = "";
  var inList = false;
  lines.forEach(function(l) {
    var m = l.match(/^[-*•]\s+(.*)$/);
    if (m) {
      if (!inList) { html += '<ul style="margin:6px 0 6px 18px;padding:0;">'; inList = true; }
      html += '<li style="margin:2px 0;">' + escapeHtml(m[1]) + '</li>';
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<p style="margin:6px 0;line-height:1.5;">' + escapeHtml(l) + '</p>';
    }
  });
  if (inList) html += '</ul>';
  return '<div class="ai-answer" style="font-size:14px;color:var(--text);">' + html + '</div>';
}

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
      '<span>Réflexion en cours…</span>' +
    '</div>';

  // 1) On tente l'IA Claude (Edge Function). 2) Repli automatique et transparent
  // sur le moteur local si elle n'est pas déployée / indisponible → l'assistant
  // marche toujours, l'IA « réelle » l'améliore quand le secret est posé.
  _aiAskRemote(query, 9000).then(function(remote) {
    // La requête a pu être remplacée entre-temps (l'utilisateur a reposé une
    // question) — ne peindre que si l'écran affiche toujours CETTE requête.
    var cur = document.querySelector("#aiResultContent .ai-result-query");
    if (cur && cur.textContent !== '"' + query + '"') return;
    if (remote) {
      _aiRenderResult(query, _aiTextToHtml(remote), "✨ Assistant PASSIO");
    } else {
      _aiRenderResult(query, aiGenerateResponse(query), "💡 Suggestions PASSIO");
    }
  });
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
    // Supabase en priorité — les IDs déjà trouvés ne sont pas ajoutés depuis le seed
    var supaIds = new Set((supaUsers || []).map(function(u) { return u.id; }));

    var supaFormatted = (supaUsers || []).map(function(u) {
      return {
        id: u.id,
        name: u.username || "Passionné",
        profileEmoji: u.emoji || "✨",
        avatar: u.color || "#8b5cf6",
        photoUrl: u.photoUrl || u.avatar_url || null,
        passions: u.passions || [],
        bio: u.bio || ""
      };
    });

    // Seed : on exclut les IDs déjà dans Supabase pour éviter les doublons
    var seedUsers = (state.seed.users || []).filter(function(u) {
      if (supaIds.has(u.id)) return false;
      var pw = passionById(u.passion);
      return (u.name||"").toLowerCase().includes(q)
        || (u.bio||"").toLowerCase().includes(q)
        || (pw && pw.label.toLowerCase().includes(q));
    }).slice(0, 5);

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
        html += "<div onclick=\"openPassionExplorer('" + escapeJsArg(p.id) + "');document.getElementById('exploreSearchResults').style.display='none';\" style='display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);'>" +
          "<div style='width:38px;height:38px;border-radius:12px;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;'>" + escapeHtml(p.emoji) + "</div>" +
          "<div style='flex:1;'><div style='font-weight:700;font-size:13px;color:var(--text);'>" + escapeHtml(p.label) + "</div></div>" +
          "<div style='font-size:11px;font-weight:700;color:var(--accent);'>Explorer →</div>" +
          "</div>";
      });
    }

    // Utilisateurs
    if (fu.length) {
      html += "<div style='padding:8px 14px 4px;font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;'>👤 Utilisateurs</div>";
      fu.forEach(function(u) {
        // Badges passions : emoji + label pour chaque passion du compte
        var passionBadges = "";
        if (u.passions && Array.isArray(u.passions) && u.passions.length > 0) {
          passionBadges = u.passions.map(function(p) {
            var label = p.label || (typeof passionById === "function" && passionById(p.id) ? passionById(p.id).label : "");
            return "<span style='display:inline-flex;align-items:center;gap:2px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.15);border-radius:20px;padding:1px 5px;font-size:9px;font-weight:600;color:var(--accent);margin-right:2px;white-space:nowrap;line-height:1.4;'>"
              + escapeHtml(p.emoji || "✨") + (label ? " " + escapeHtml(label) : "") + "</span>";
          }).join("");
        } else if (u.passion) {
          var pw = passionById(u.passion) || { emoji: "✨", label: "" };
          passionBadges = "<span style='display:inline-flex;align-items:center;gap:2px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.15);border-radius:20px;padding:1px 5px;font-size:9px;font-weight:600;color:var(--accent);margin-right:2px;line-height:1.4;'>"
            + pw.emoji + (pw.label ? " " + escapeHtml(pw.label) : "") + "</span>";
        }

        var _photo = _userPhoto(u);
        var _avContent = _photo
          ? "<img src='" + safeUrlAttr(_photo) + "' style='width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;' onerror=\"this.style.display='none'\" />"
          : "<span style='font-size:18px;line-height:1;'>" + escapeHtml(u.profileEmoji || u.emoji || (u.name && u.name[0]) || "?") + "</span>";
        var _avBgColor = (u.avatar || u.color || "#8b5cf6");
        html += "<div onclick=\"openUserProfile('" + escapeJsArg(u.id) + "');document.getElementById('exploreSearchResults').style.display='none';\" style='display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);'>" +
          "<div style='width:44px;height:44px;border-radius:50%;background:" + _avBgColor + ";display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;border:2px solid rgba(124,58,237,0.15);'>" + _avContent + "</div>" +
          "<div style='flex:1;min-width:0;overflow:hidden;'>" +
            "<div style='font-weight:700;font-size:13px;color:var(--text);margin-bottom:3px;'>" + escapeHtml(u.name||"") + "</div>" +
            "<div style='display:flex;flex-wrap:wrap;gap:2px;'>" + passionBadges + "</div>" +
            (u.bio ? "<div style='font-size:11px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>" + escapeHtml(u.bio) + "</div>" : "") +
          "</div>" +
          "<div style='font-size:11px;font-weight:700;color:var(--accent);flex-shrink:0;margin-left:6px;'>Voir →</div>" +
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
  saveState();
  // Re-synchronise le profil public (pseudo unique + liste de passions à jour).
  if (typeof supaUpsertProfile === "function") { try { supaUpsertProfile(); } catch(e) {} }
  // Flush immédiat de user_state sans attendre le debounce.
  if (typeof supaSaveUserState === "function") { try { supaSaveUserState(); } catch(e) {} }
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
let irlSort = "soon";                     // "soon" | "near" | "popular"
let irlSearchQuery = "";                  // recherche texte (titre/ville/lieu/desc)
let irlShowPast = false;                  // événements terminés (plus d'onglet : filtre interne)

// ⚠️ NE PLUS pré-cocher les passions de l'utilisateur au premier rendu.
// Avant (jusqu'au 2026-07-21) : un compte avec UN profil « musique » voyait
// irlPassionFilters = {musique} ET une barre de passions ne contenant QUE ses
// propres passions → 31 des 35 événements à venir étaient masqués, sans aucun
// moyen de le savoir ni de les afficher (aucune tuile à cocher pour les autres
// passions, et le compteur de filtres excluait volontairement les passions).
// Défaut = AUCUN filtre = tout est visible ; les passions de l'utilisateur sont
// simplement remontées en tête de la barre.
// (fonction supprimée : plus aucun appelant, le défaut est « aucun filtre »)

// ===== Cycle de vie d'un événement (début / fin / annulation) =====
// Durée par défaut d'un événement sans fin explicite. Sans cette notion, un
// événement disparaissait de l'écran à la SECONDE où il commençait : impossible
// de retrouver l'adresse du truc auquel on se rend. (Colonne end_at, 2026-07-21.)
const IRL_DEFAULT_DURATION_MS = 2 * 3600000;

function _eventEndAt(ev) {
  if (!ev) return 0;
  if (typeof ev.endAt === "number" && ev.endAt > ev.date) return ev.endAt;
  if (ev.durationH) return ev.date + Math.round(parseFloat(ev.durationH) * 3600000);
  return ev.date + IRL_DEFAULT_DURATION_MS;
}

// ===== RSVP en 3 états + liste d'attente + check-in =====
// Un booléen « inscrit / pas inscrit » ment : beaucoup de gens sont intéressés
// sans être sûrs. Trois états honnêtes (going / maybe / declined) + une file
// d'attente quand c'est complet (cf. Partiful, Luma, Eventbrite).
const RSVP_LABELS = {
  going:    { label: "Je viens",       short: "✓ Je viens",   emoji: "✅" },
  maybe:    { label: "Peut-être",      short: "🤔 Peut-être", emoji: "🤔" },
  declined: { label: "Je ne peux pas", short: "Je ne peux pas", emoji: "🙁" },
  waitlist: { label: "Liste d'attente", short: "⏳ En attente", emoji: "⏳" },
};

// Mon état pour un événement. `state.user.eventRsvp` est la mémoire locale ;
// `joinedEvents` reste maintenu pour toute la compatibilité existante.
function myRsvp(eventId) {
  const m = (state.user.eventRsvp || {})[eventId];
  if (m) return m;
  return (state.user.joinedEvents || []).includes(eventId) ? "going" : null;
}

function _setMyRsvpLocal(eventId, rsvp) {
  state.user.eventRsvp = state.user.eventRsvp || {};
  if (!rsvp) delete state.user.eventRsvp[eventId];
  else state.user.eventRsvp[eventId] = rsvp;
  // « Inscrit » (filtre + rappels) = je viens OU peut-être.
  const joined = rsvp === "going" || rsvp === "maybe";
  state.user.joinedEvents = (state.user.joinedEvents || []).filter(x => x !== eventId);
  if (joined) state.user.joinedEvents.push(eventId);
}

// Places restantes (null = illimité). Seuls les « je viens » occupent une place.
function _eventSpotsLeft(ev) {
  if (!ev || !ev.maxAttendees) return null;
  return Math.max(0, ev.maxAttendees - (ev.attendees || []).length);
}
function _eventIsFull(ev) { const s = _eventSpotsLeft(ev); return s !== null && s <= 0; }

function _eventIsCancelled(ev) { return !!ev && ev.status === "cancelled"; }
function _eventIsLive(ev) { const n = Date.now(); return !!ev && ev.date <= n && _eventEndAt(ev) > n; }
function _eventIsOver(ev) { return !!ev && _eventEndAt(ev) <= Date.now(); }
function _isMyEvent(ev) {
  const meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  return !!ev && (ev._mine || ev.organizerId === meId || ev.authorId === meId || ev.organizerId === "me");
}
// Co-organisateur : mêmes droits d'édition que l'organisateur (un événement porté
// par une seule personne meurt avec elle — cf. Meetup).
function _canManageEvent(ev) {
  const meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  return _isMyEvent(ev) || ((ev && ev.coOrganizers) || []).indexOf(meId) > -1;
}

// ===== Check-in sur place =====
// Fenêtre de pointage : 1 h avant le début et jusqu'à la fin. Au-delà, pointer
// n'a plus de sens (et récompenserait un simple clic depuis le canapé).
const CHECKIN_RADIUS_M = 500;
function _canCheckIn(ev) {
  if (!ev || _eventIsCancelled(ev)) return false;
  const now = Date.now();
  return now >= ev.date - 3600000 && now <= _eventEndAt(ev);
}
function _hasCheckedIn(ev) {
  return !!(state.user.checkedInEvents || []).includes(ev && ev.id);
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

// ════════════════════════════════════════════════════════════════════════
// GÉOCODAGE — 100 % GRATUIT, SANS CLÉ D'API (2026-07-21)
// ════════════════════════════════════════════════════════════════════════
// ⚠️ Nominatim (l'ancien fournisseur unique) interdit l'usage commercial
// intensif et limite à 1 requête/seconde : intenable dès qu'il y a du monde.
// Remplacé par deux services libres, sans inscription ni clé :
//
//   1. BAN — api-adresse.data.gouv.fr (Base Adresse Nationale, data.gouv.fr).
//      Open data sous licence ODbL, usage commercial EXPLICITEMENT autorisé,
//      pas de quota par clé. Excellent sur la France : renvoie directement
//      ville, code postal et coordonnées structurés.
//   2. Photon — photon.komoot.io (OpenStreetMap). Gratuit, sans clé, mondial.
//      Utilisé en repli quand la BAN ne trouve rien (adresse à l'étranger).
//
// Trois garde-fous maison réduisent le trafic d'un ordre de grandeur :
// cache mémoire + localStorage (7 j), file d'attente qui espace les appels,
// et le dictionnaire FRANCE_CITIES qui répond instantanément et hors-ligne.
const GEO_CACHE_KEY = "passio_geo_cache_v1";
const GEO_CACHE_TTL = 7 * 86400000;
const GEO_MIN_INTERVAL_MS = 350; // fair-use : jamais deux appels rapprochés
const GEO_CACHE_MAX = 250;

let _geoCache = null;
let _geoLastCall = 0;
let _geoChain = Promise.resolve();

function _geoCacheLoad() {
  if (_geoCache) return _geoCache;
  try {
    const raw = JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || "{}");
    const now = Date.now();
    _geoCache = {};
    Object.keys(raw).forEach(k => { if (raw[k] && now - raw[k].at < GEO_CACHE_TTL) _geoCache[k] = raw[k]; });
  } catch (e) { _geoCache = {}; }
  return _geoCache;
}

function _geoCacheGet(key) {
  const c = _geoCacheLoad()[key];
  return c ? c.v : undefined;
}

function _geoCacheSet(key, value) {
  const c = _geoCacheLoad();
  c[key] = { at: Date.now(), v: value };
  // Borne la taille : on jette les entrées les plus anciennes.
  const keys = Object.keys(c);
  if (keys.length > GEO_CACHE_MAX) {
    keys.sort((a, b) => c[a].at - c[b].at).slice(0, keys.length - GEO_CACHE_MAX).forEach(k => delete c[k]);
  }
  try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(c)); } catch (e) {}
}

// Sérialise les appels réseau et les espace d'au moins GEO_MIN_INTERVAL_MS.
function _geoThrottle(fn) {
  _geoChain = _geoChain.then(async () => {
    const wait = GEO_MIN_INTERVAL_MS - (Date.now() - _geoLastCall);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    _geoLastCall = Date.now();
    return fn();
  }).catch(() => null);
  return _geoChain;
}

async function _geoFetchJson(url) {
  try {
    const r = await Promise.race([
      fetch(url, { headers: { Accept: "application/json" } }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000)),
    ]);
    if (!r || !r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// Forme unifiée renvoyée par les deux fournisseurs :
// { label, name, lat, lng, city, postcode, context, country }
// ⚠️ `country` a été ajouté le 2026-07-21 pour le « passeport » du CDV (compteur
// de pays visités, à la Polarsteps). Les entrées déjà en cache localStorage n'ont
// pas le champ : tout consommateur doit tolérer un country absent (le cache expire
// de lui-même au bout de 7 jours).
function _geoFromBan(f) {
  const p = (f && f.properties) || {};
  const c = (f && f.geometry && f.geometry.coordinates) || [];
  return {
    label: p.label || "", name: p.name || p.label || "",
    lat: c[1], lng: c[0],
    city: p.city || p.municipality || "", postcode: p.postcode || "",
    context: p.context || "",
    country: "France", // la Base Adresse Nationale ne couvre que la France
  };
}

function _geoFromPhoton(f) {
  const p = (f && f.properties) || {};
  const c = (f && f.geometry && f.geometry.coordinates) || [];
  const name = p.name || [p.housenumber, p.street].filter(Boolean).join(" ") || p.city || "";
  return {
    label: [name, p.city, p.country].filter(Boolean).join(", "),
    name: name,
    lat: c[1], lng: c[0],
    city: p.city || p.town || p.village || p.county || "",
    postcode: p.postcode || "",
    context: [p.state, p.country].filter(Boolean).join(", "),
    country: p.country || "",
  };
}

// Suggestions d'adresse/lieu. BAN d'abord (France, structuré, autorisé en
// commercial), Photon en repli mondial.
async function passioGeoSuggest(query, limit) {
  const q = String(query || "").trim();
  if (q.length < 3) return [];
  const key = "s:" + q.toLowerCase() + ":" + (limit || 6);
  const hit = _geoCacheGet(key);
  if (hit !== undefined) return hit;

  let out = [];
  const ban = await _geoThrottle(() => _geoFetchJson(
    "https://api-adresse.data.gouv.fr/search/?limit=" + (limit || 6) + "&q=" + encodeURIComponent(q)));
  if (ban && ban.features && ban.features.length) out = ban.features.map(_geoFromBan);

  if (!out.length) {
    const ph = await _geoThrottle(() => _geoFetchJson(
      "https://photon.komoot.io/api/?lang=fr&limit=" + (limit || 6) + "&q=" + encodeURIComponent(q)));
    if (ph && ph.features) out = ph.features.map(_geoFromPhoton);
  }

  out = out.filter(r => typeof r.lat === "number" && typeof r.lng === "number");
  _geoCacheSet(key, out);
  return out;
}

// Géocodage simple : le meilleur résultat, ou null.
async function passioGeocode(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  const key = "g:" + q.toLowerCase();
  const hit = _geoCacheGet(key);
  if (hit !== undefined) return hit;
  const res = await passioGeoSuggest(q, 1);
  const best = res && res[0] ? res[0] : null;
  _geoCacheSet(key, best);
  return best;
}

// Géocodage inverse : le vrai nom de la commune à ces coordonnées. Bien plus
// juste que « la plus proche des 200 villes du dictionnaire », qui annonçait
// Lyon à quelqu'un habitant à 60 km de Lyon.
async function passioReverseGeocode(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const key = "r:" + lat.toFixed(3) + "," + lng.toFixed(3);
  const hit = _geoCacheGet(key);
  if (hit !== undefined) return hit;

  let out = null;
  const ban = await _geoThrottle(() => _geoFetchJson(
    "https://api-adresse.data.gouv.fr/reverse/?lat=" + lat + "&lon=" + lng));
  if (ban && ban.features && ban.features[0]) out = _geoFromBan(ban.features[0]);

  if (!out || !out.city) {
    const ph = await _geoThrottle(() => _geoFetchJson(
      "https://photon.komoot.io/reverse?lang=fr&lat=" + lat + "&lon=" + lng));
    if (ph && ph.features && ph.features[0]) out = _geoFromPhoton(ph.features[0]);
  }
  _geoCacheSet(key, out);
  return out;
}

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

      // Affichage immédiat depuis le dictionnaire, puis nom exact de la commune
      // dès que le géocodage inverse (gratuit, mis en cache) répond.
      const cityName = getClosestCity(irlUserLocation.lat, irlUserLocation.lng);
      updateIrlCityTitle();
      _resolveUserCityName();
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

// « le havre » → « Le Havre » (l'ancienne capitalisation ne traitait que la
// première lettre : « Le havre », « Saint-étienne », « New york »…).
function _prettyCityName(key) {
  return String(key || "").split(/([ \-'])/).map(part =>
    /^[ \-']$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)
  ).join("");
}

// Liste de villes SANS doublons d'alias : le dictionnaire contient « nîmes » et
// « nimes », « québec » et « quebec », « boulogne » et « boulogne-billancourt »…
// → le sélecteur affichait deux fois la même ville. On dédoublonne par
// coordonnées en gardant le libellé le plus complet (accentué de préférence).
function _irlCityList() {
  if (window._irlCityListCache) return window._irlCityListCache;
  const byCoord = {};
  Object.keys(FRANCE_CITIES).forEach(key => {
    const c = FRANCE_CITIES[key];
    const k = c[0].toFixed(3) + "," + c[1].toFixed(3);
    const prev = byCoord[k];
    const score = (/[àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/.test(key) ? 100 : 0) + key.length;
    if (!prev || score > prev.score) byCoord[k] = { id: key, score, coords: c };
  });
  window._irlCityListCache = Object.keys(byCoord).map(k => ({
    id: byCoord[k].id, name: _prettyCityName(byCoord[k].id), coords: byCoord[k].coords,
  })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return window._irlCityListCache;
}

// Nom RÉEL de la commune où se trouve l'utilisateur, résolu une fois puis mis en
// cache. `getClosestCity` (dictionnaire) reste le repli instantané et hors-ligne,
// mais il annonçait « Lyon » à quelqu'un vivant à 60 km de Lyon : ici on affiche
// sa vraie commune dès que la réponse arrive.
async function _resolveUserCityName() {
  if (!irlUserLocation) return;
  const r = await passioReverseGeocode(irlUserLocation.lat, irlUserLocation.lng);
  if (!r || !r.city) return;
  window._irlResolvedCity = r.city;
  updateIrlCityTitle();
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
      closestCity = _prettyCityName(cityName);
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
    // Commune réelle (géocodage inverse) si déjà résolue, sinon repli dictionnaire.
    displayName = window._irlResolvedCity || getClosestCity(irlUserLocation.lat, irlUserLocation.lng);
  } else if (irlUserLocationError) {
    displayName = "Paris (approx)";
  }

  titleEl.textContent = displayName;
}

// Sélecteur de ville pour IRL
function openIrlCitySelector() {
  const citiesList = _irlCityList();

  let html = `
    <div class="modal-handle"></div>
    <div class="modal-title">🔍 Chercher une ville</div>
    <input type="text" class="input" id="irlCitySearchInput" placeholder="Tape le nom d'une ville..." style="margin-bottom:12px;" />
    <div id="irlCitiesGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:300px;overflow-y:auto;margin-bottom:12px;">
  `;

  citiesList.forEach(city => {
    html += `<button class="pill" data-localcity="1" onclick="selectIrlCity('${escapeJsArg(city.id)}', '${escapeJsArg(city.name)}')" style="width:100%;justify-content:center;">
      ${escapeHtml(city.name)}
    </button>`;
  });

  html += `
      <div id="irlCityRemote" style="display:contents;"></div>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn secondary block" onclick="closeModal()">Annuler</button>
      <button class="btn primary block" onclick="clearIrlCitySelection()">📍 Ma position</button>
    </div>
  `;

  openModal(html);

  // Filtre en temps réel sur le dictionnaire local (instantané), COMPLÉTÉ par une
  // recherche géocodée : le dictionnaire ne contient que ~200 villes, une commune
  // absente était donc introuvable alors qu'elle est parfaitement géocodable.
  const searchInput = document.getElementById("irlCitySearchInput");
  const citiesGrid = document.getElementById("irlCitiesGrid");
  if (searchInput && citiesGrid) {
    let remoteT;
    searchInput.addEventListener("input", (e) => {
      const query = (e.target.value || "").toLowerCase().trim();
      let localHits = 0;
      citiesGrid.querySelectorAll("button[data-localcity]").forEach(btn => {
        const show = btn.textContent.toLowerCase().includes(query);
        btn.style.display = show ? "block" : "none";
        if (show) localHits++;
      });
      const remoteBox = document.getElementById("irlCityRemote");
      if (remoteBox) remoteBox.innerHTML = "";
      clearTimeout(remoteT);
      if (query.length < 3) return;
      remoteT = setTimeout(async () => {
        const res = await passioGeoSuggest(query, 6);
        const box = document.getElementById("irlCityRemote");
        if (!box || searchInput.value.toLowerCase().trim() !== query) return;
        // On ne propose que des communes, et pas celles déjà listées localement.
        const seen = new Set();
        const cities = res.filter(r => {
          const c = (r.city || "").toLowerCase();
          if (!c || seen.has(c) || FRANCE_CITIES[c]) return false;
          seen.add(c);
          return true;
        });
        if (!cities.length) return;
        box.innerHTML = '<div style="grid-column:1/-1;font-size:11px;color:var(--muted);margin:6px 0 2px;">Autres communes</div>'
          + cities.map(c => `<button class="pill" style="width:100%;justify-content:center;"
              onclick="selectIrlGeoCity('${escapeJsArg(c.city)}', ${c.lat}, ${c.lng})">${escapeHtml(c.city)}</button>`).join("");
      }, 320);
    });
    setTimeout(() => searchInput.focus(), 100);
  }
}

// Sélection d'une commune trouvée par géocodage (hors dictionnaire local).
function selectIrlGeoCity(name, lat, lng) {
  irlSelectedCity = { id: "geo", name: name, coords: [lat, lng] };
  _diag("[IRL] 🏙️ Ville géocodée: " + name);
  updateIrlCityTitle();
  closeModal();
  renderIRL();
  toast("📍 " + name);
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
    ensureLeaflet()
      .then(function(){ initIrlMap(); if (typeof updateIrlMapMarkers === "function") updateIrlMapMarkers(); })
      // Repli lisible : sans WebGL (vieil appareil, accélération désactivée) la
      // carte ne peut pas s'afficher — la LISTE reste parfaitement utilisable,
      // il faut juste le dire au lieu de laisser un cadre vide.
      .catch(function(){
        el.innerHTML = '<div class="irl-map-fallback">🗺 La carte n\'est pas disponible sur cet appareil.<br/>'
          + 'La liste des événements ci-dessous fonctionne normalement.</div>';
      });
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
    const results = await passioGeoSuggest(query, 8);
    if (!results.length) { suggestionsDiv.style.display = "none"; return; }

    // ⚠️ Les libellés viennent d'un service TIERS : ils doivent être échappés
    // pour le HTML (escapeHtml) ET pour l'argument JS de l'onclick (escapeJsArg).
    // Sans ça, un lieu contenant une apostrophe (« Saint-Michel-l'Observatoire »)
    // cassait le bouton, et une donnée hostile pouvait injecter du markup.
    suggestionsDiv.innerHTML = results.map(r => {
      const name = r.name || r.label || "";
      const sub = [r.postcode, r.city, r.context].filter(Boolean).join(" · ");
      return `
        <div onclick="selectIrlAddressSuggestion('${escapeJsArg(name)}', ${r.lat}, ${r.lng})" style="padding:8px 10px;border-bottom:1px solid #eee;cursor:pointer;font-size:12px;transition:background 0.2s;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='transparent';">
          <div style="font-weight:500;color:#333;">${escapeHtml(name)}</div>
          <div style="font-size:11px;color:#888;">${escapeHtml(sub.slice(0, 60))}</div>
        </div>`;
    }).join("");
    suggestionsDiv.style.display = "block";
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

  const result = await passioGeocode(address);
  if (!result) {
    toast("Adresse non trouvée");
    _diag("[GEO] ❌ Adresse non trouvée: " + address);
    return;
  }

  irlSelectedCity = {
    id: "custom",
    name: result.city || result.name || address,
    coords: [result.lat, result.lng],
  };
  _diag("[GEO] ✅ Position trouvée: " + irlSelectedCity.name);

  if (irlMap) irlMap.closePopup();
  renderIRL();
  toast(`📍 ${irlSelectedCity.name}`);
}

function updateIrlMapMarkers() {
  if (!irlMap || !irlMarkersLayer) return;

  // ⚠️ Rien ne doit bouger sur la carte quand l'utilisateur like, commente ou
  // rejoint un événement : renderIRL() est rappelée à chaque interaction et
  // reconstruisait TOUS les marqueurs + refaisait un fitBounds → la vue sautait
  // et le zoom manuel était perdu à chaque clic. On ne reconstruit que si
  // l'ensemble filtré a réellement changé. (Corrigé le 2026-07-21.)
  var _filteredNow = _filterIrlEvents(allEvents());
  var _sig = _filteredNow.map(function(e) { return e.id; }).join(",")
    + "|" + (irlSelectedCity ? irlSelectedCity.name : "")
    + "|" + (irlUserLocation ? irlUserLocation.lat.toFixed(3) + "," + irlUserLocation.lng.toFixed(3) : "");
  if (_sig === window._irlMapSig) return;
  var _isFirstDraw = !window._irlMapSig;
  window._irlMapSig = _sig;

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
  var filtered = _filteredNow;

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
    const dk = _eventDistanceKm(ev);
    m.bindPopup(`
      <div class="irl-popup-title">${escapeHtml(ev.title || "Événement")}</div>
      <div class="irl-popup-meta">${passion.emoji || ""} ${escapeHtml(passion.label || "")} · ${escapeHtml(ev.city || "")} · ${d.day} ${d.month} à ${d.time}${dk != null && dk < 20000 ? " · " + _fmtDistance(dk) : ""}</div>
      <button class="irl-popup-btn" onclick="openEventDetails('${escapeJsArg(ev.id)}')">Voir l'événement</button>
    `);
    points.push([lat, lng]);
  });

  // Auto-zoom. ⚠️ NE PAS cadrer sur TOUS les marqueurs : depuis que l'écran
  // n'est plus pré-filtré sur les passions de l'utilisateur, la liste contient
  // aussi des événements à Tokyo ou Rio → fitBounds ouvrait la carte au niveau
  // MONDIAL (zoom 1,5), inutilisable pour trouver ce qui se passe à côté. On
  // cadre donc sur les marqueurs PROCHES du point de référence, et on ne
  // s'élargit que s'il n'y en a aucun.
  const IRL_MAP_LOCAL_KM = 150;
  setTimeout(() => {
    const ref = _irlReferenceLoc();
    const near = points.filter(p => calculateDistance(ref.lat, ref.lng, p[0], p[1]) <= IRL_MAP_LOCAL_KM);
    if (near.length > 1) {
      irlMap.fitBounds(L.latLngBounds(near), { padding: [40, 40], maxZoom: 11 });
    } else if (near.length === 1) {
      irlMap.setView(near[0], 11);
    } else if (points.length > 0) {
      // Rien à proximité : on reste centré sur la zone de référence à une
      // échelle régionale, plutôt que de sauter à l'autre bout du monde.
      irlMap.setView([ref.lat, ref.lng], 8);
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

// Barre de passions (refondue le 2026-07-22) : en PRINCIPAL, les passions de mes
// profils — c'est mon écran, il doit ressembler à mes centres d'intérêt. Les
// autres passions restent atteignables (les événements des autres ne doivent
// jamais être inatteignables, c'était le bug du 2026-07-21) mais via un petit
// panneau « + Autres passions » à cocher : une passion cochée vient s'ajouter à
// la barre principale, où elle se comporte exactement comme les miennes.
// ⚠️ Cocher dans le panneau AJOUTE la tuile, ça ne filtre pas : c'est le clic sur
// la tuile qui filtre (aria-pressed). Les deux gestes sont distincts.
function _irlMyPassions() {
  return [...new Set((state.user.profiles || []).map(p => p.passion).filter(Boolean))];
}
function _irlExtraPassions() {
  if (!Array.isArray(state.user.irlExtraPassions)) state.user.irlExtraPassions = [];
  return state.user.irlExtraPassions;
}
function toggleIrlExtraPassion(pid) {
  const extra = _irlExtraPassions();
  const i = extra.indexOf(pid);
  if (i > -1) {
    extra.splice(i, 1);
    // Retirer la tuile doit aussi retirer son filtre, sinon on filtre sur une
    // passion qui n'est plus affichée (donc plus décochable).
    if (irlPassionFilters) irlPassionFilters.delete(pid);
  } else {
    extra.push(pid);
  }
  saveState();
  renderIRL();
}
function toggleIrlExtraPanel() {
  window._irlExtraOpen = !window._irlExtraOpen;
  renderIrlPassionTiles();
}

function renderIrlPassionTiles() {
  const row = $("#irlPassionRow");
  if (!row) return;
  // Base de comptage = les événements après TOUS les filtres SAUF la passion,
  // pour que le badge annonce ce qu'un clic va réellement afficher.
  const saved = irlPassionFilters;
  irlPassionFilters = new Set();
  const pool = _filterIrlEvents(allEvents());
  irlPassionFilters = saved;

  const counts = {};
  pool.forEach(e => { if (e.passion) counts[e.passion] = (counts[e.passion] || 0) + 1; });

  const mine = _irlMyPassions();
  const mineSet = new Set(mine);
  const extra = _irlExtraPassions().filter(pid => !mineSet.has(pid));
  // Une passion filtrée reste toujours affichée, même si elle n'est ni mienne ni
  // cochée (sinon la tuile active disparaît et le filtre devient indécochable).
  const shown = [...new Set(mine.concat(extra, [...irlPassionFilters]))];

  const tileHtml = (pid) => {
    const p = passionById(pid) || { label: pid, emoji: "✨" };
    const cnt = counts[pid] || 0;
    const isActive = irlPassionFilters.has(pid);
    const isMine = mineSet.has(pid);
    return `<button class="msg-tile ${isActive ? "active" : ""}" data-irlpassion="${escapeHtml(pid)}"
        aria-pressed="${isActive}" title="${escapeHtml(p.label)}${isMine ? " — une de tes passions" : ""}">
      <span class="msg-tile-icon">${p.emoji}${isMine ? '<span class="irl-tile-mine" aria-hidden="true">✦</span>' : ""}</span>
      <span class="msg-tile-label">${escapeHtml(p.label)}</span>
      ${cnt > 0 ? `<span class="msg-tile-badge">${cnt}</span>` : ""}
    </button>`;
  };

  // Panneau « autres passions » : tout ce qui a au moins un événement et qui
  // n'est pas déjà dans la barre.
  const others = Object.keys(counts)
    .filter(pid => !mineSet.has(pid) && extra.indexOf(pid) === -1)
    .sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
  const open = !!window._irlExtraOpen;
  const nExtra = extra.length;

  row.className = "irl-passion-zone";
  row.innerHTML = `
    <div class="msg-filter-tiles">
      ${shown.map(tileHtml).join("")}
      <button class="msg-tile irl-tile-more${open ? " active" : ""}" id="irlExtraToggle"
        aria-expanded="${open}" onclick="toggleIrlExtraPanel()" title="Ajouter d'autres passions">
        <span class="msg-tile-icon">＋</span>
        <span class="msg-tile-label">Autres</span>
        ${nExtra > 0 ? `<span class="msg-tile-badge">${nExtra}</span>` : ""}
      </button>
    </div>
    ${open ? `<div class="irl-extra-panel" id="irlExtraPanel">
      <div class="irl-extra-title">Ajouter des passions à ma barre</div>
      <div class="irl-extra-list">
        ${extra.map(pid => _irlExtraChipHtml(pid, counts, true)).join("")}
        ${others.map(pid => _irlExtraChipHtml(pid, counts, false)).join("")}
        ${!extra.length && !others.length ? '<span class="irl-extra-empty">Aucune autre passion avec des événements pour le moment.</span>' : ""}
      </div>
    </div>` : ""}`;
}

function _irlExtraChipHtml(pid, counts, checked) {
  const p = passionById(pid) || { label: pid, emoji: "✨" };
  const cnt = counts[pid] || 0;
  return `<button class="irl-extra-chip${checked ? " on" : ""}" role="checkbox" aria-checked="${checked}"
      onclick="toggleIrlExtraPassion('${escapeJsArg(pid)}')">
    <span class="irl-extra-box" aria-hidden="true">${checked ? "✓" : ""}</span>
    <span>${p.emoji} ${escapeHtml(p.label)}</span>
    ${cnt > 0 ? `<b>${cnt}</b>` : ""}
  </button>`;
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

// ===== Panneau de filtres : 3 onglets carrés (Date / Distance / Horaire) =====
// Un seul volet visible à la fois (2026-07-22). Avant, les 3 réglages étaient
// empilés — un bouton, un <select> natif et un second bouton — ce qui donnait
// trois contrôles d'apparence différente pour trois filtres de même rang.

// Paliers du curseur de distance. L'index 0 = aucune limite ; les autres
// reprennent EXACTEMENT les valeurs de l'ancien <select> (le filtrage lit
// toujours `irlDistanceFilter` en km, rien d'autre ne change).
const IRL_DISTANCE_STEPS = ["", "5", "10", "25", "50", "100", "250", "500", "1000", "5000"];

function setIrlFilterTab(tab) {
  window._irlFilterTab = tab;
  _syncIrlFilterTabs();
  if (tab === "date") _renderIrlInlineCal();
  if (tab === "time") _syncIrlTimeUI();
}

function _syncIrlFilterTabs() {
  var tab = window._irlFilterTab || "date";
  var map = {
    date:     { btn: "irlFtabDate", pane: "irlPaneDate", on: !!(irlDateFilters && irlDateFilters.size) },
    distance: { btn: "irlFtabDist", pane: "irlPaneDist", on: !!irlDistanceFilter },
    time:     { btn: "irlFtabTime", pane: "irlPaneTime", on: !!irlTimeFilter },
  };
  Object.keys(map).forEach(function (k) {
    var cfg = map[k];
    var btn = document.getElementById(cfg.btn);
    var pane = document.getElementById(cfg.pane);
    if (btn) {
      btn.classList.toggle("sel", k === tab);
      btn.classList.toggle("has", cfg.on);
      btn.setAttribute("aria-selected", k === tab ? "true" : "false");
    }
    if (pane) pane.classList.toggle("on", k === tab);
  });
}

// --- Calendrier en ligne ------------------------------------------------
// Le volet Date affiche un VRAI calendrier (mois navigable) : 1 tap = un jour,
// un 2ᵉ tap plus loin = une période. Les jours qui portent au moins un
// événement sont pointés, sinon on choisit à l'aveugle.
function _irlCalMonthDate() {
  if (!window._irlCalMonth) {
    var base = (irlCustomDate && irlCustomDate.start) ? new Date(irlCustomDate.start) : new Date();
    window._irlCalMonth = new Date(base.getFullYear(), base.getMonth(), 1);
  }
  return window._irlCalMonth;
}

function irlCalNavMonth(delta) {
  var m = _irlCalMonthDate();
  window._irlCalMonth = new Date(m.getFullYear(), m.getMonth() + delta, 1);
  _renderIrlInlineCal();
}

// Jours (timestamp minuit) portant au moins un événement à venir.
function _irlEventDaySet() {
  var set = {};
  try {
    allEvents().forEach(function (e) {
      var ts = e && e.date;              // même champ que le filtre de date
      if (!ts) return;
      var d = new Date(ts);
      set[new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()] = 1;
    });
  } catch (err) { /* pas d'événements = pas de pastilles */ }
  return set;
}

function _renderIrlInlineCal() {
  var grid = document.getElementById("irlCalGrid");
  var lbl = document.getElementById("irlCalMonthLbl");
  if (!grid) return;

  var m = _irlCalMonthDate();
  if (lbl) {
    var t = m.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    lbl.textContent = t.charAt(0).toUpperCase() + t.slice(1);
  }

  var today = new Date();
  var todayTs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  var first = new Date(m.getFullYear(), m.getMonth(), 1);
  var lead = (first.getDay() + 6) % 7; // semaine qui commence le LUNDI
  var days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  var withEvents = _irlEventDaySet();
  var selStart = irlCustomDate ? _startOfDayTs(irlCustomDate.start) : null;
  var selEnd = irlCustomDate ? _startOfDayTs(irlCustomDate.end) : null;

  var html = "";
  for (var i = 0; i < lead; i++) html += '<span class="irl-cal-day empty"></span>';
  for (var d = 1; d <= days; d++) {
    var ts = new Date(m.getFullYear(), m.getMonth(), d).getTime();
    var cls = "irl-cal-day";
    if (ts === todayTs) cls += " today";
    if (selStart != null && ts >= selStart && ts <= selEnd) {
      cls += " sel";
      if (ts === selStart) cls += " sel-start";
      if (ts === selEnd) cls += " sel-end";
    }
    if (withEvents[ts]) cls += " has-ev";
    if (ts < todayTs) cls += " past";
    html += '<button type="button" class="' + cls + '" onclick="irlCalPick(' + ts + ')">' + d + "</button>";
  }
  grid.innerHTML = html;
}

// 1ᵉʳ tap = un jour ; 2ᵉ tap postérieur = fin de période ; tap antérieur ou
// 3ᵉ tap = on repart d'un jour unique (règle des sélecteurs de séjour).
function irlCalPick(ts) {
  if (!irlDateFilters) irlDateFilters = new Set();
  var start = irlCustomDate ? _startOfDayTs(irlCustomDate.start) : null;
  if (window._irlCalPending && start != null && ts > start) {
    irlCustomDate = { start: start, end: _endOfDayTs(ts) };
    window._irlCalPending = false;
  } else {
    irlCustomDate = { start: ts, end: _endOfDayTs(ts) };
    window._irlCalPending = true;
  }
  irlDateFilters.add("custom");
  renderIRL();
  _renderIrlInlineCal();
}

function _startOfDayTs(ts) {
  var d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function _endOfDayTs(ts) {
  var d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

// --- Curseur de distance ------------------------------------------------
function setIrlDistanceFromRange(idx) {
  irlDistanceFilter = IRL_DISTANCE_STEPS[parseInt(idx, 10) || 0] || "";
  _syncIrlDistanceUI();
  // Le glissement produit un événement par pixel : on ne re-rend qu'à l'arrêt.
  clearTimeout(window._irlDistT);
  window._irlDistT = setTimeout(function () { renderIRL(); }, 180);
}

function clearIrlDistanceFilter() {
  irlDistanceFilter = "";
  _syncIrlDistanceUI();
  renderIRL();
}

function _syncIrlDistanceUI() {
  var range = document.getElementById("irlDistanceRange");
  var lbl = document.getElementById("irlDistLabel");
  var sum = document.getElementById("irlDistSum");
  var clear = document.getElementById("irlDistClearBtn");
  var idx = IRL_DISTANCE_STEPS.indexOf(irlDistanceFilter || "");
  if (idx < 0) idx = 0;
  if (range && String(range.value) !== String(idx)) range.value = idx;
  if (lbl) lbl.textContent = irlDistanceFilter ? "entre 0 et " + irlDistanceFilter + " km" : "Toutes distances";
  if (sum) {
    sum.textContent = irlDistanceFilter
      ? "Autour de " + _irlReferenceLabel() + " · " + irlDistanceFilter + " km max"
      : "Aucune limite de distance";
  }
  if (clear) clear.style.display = irlDistanceFilter ? "block" : "none";
}

// --- Plage horaire (en ligne dans le volet) -----------------------------
// Les deux <select> sont peuplés à la volée : 48 <option> figées dans le
// markup pour un volet rarement ouvert, ce serait 48 nœuds pour rien.
function _syncIrlTimeUI() {
  var s = document.getElementById("irlStartHour");
  var e = document.getElementById("irlEndHour");
  if (!s || !e) return;
  if (!s.options.length) {
    var opts = "";
    for (var i = 0; i <= 23; i++) opts += '<option value="' + i + '">' + String(i).padStart(2, "0") + ":00</option>";
    s.innerHTML = opts;
    e.innerHTML = opts;
  }
  var start = 0, end = 23;
  if (irlTimeFilter && irlTimeFilter.includes(" - ")) {
    var p = irlTimeFilter.split(" - ");
    start = parseInt(p[0].split(":")[0]) || 0;
    end = parseInt(p[1].split(":")[0]) || 23;
  }
  s.value = start;
  e.value = end;
  var ds = document.getElementById("irlDisplayStart");
  var de = document.getElementById("irlDisplayEnd");
  if (ds) ds.textContent = String(start).padStart(2, "0") + ":00";
  if (de) de.textContent = String(end).padStart(2, "0") + ":00";
  var sum = document.getElementById("irlTimeSum");
  if (sum) sum.textContent = irlTimeFilter ? "Événements entre " + irlTimeFilter : "Aucune contrainte d'horaire";
  var clear = document.getElementById("irlTimeClearBtn");
  if (clear) clear.style.display = irlTimeFilter ? "block" : "none";
}

// Libellé du point de référence du filtre distance (même règle que
// _irlReferenceLoc : ville choisie > GPS > Paris).
function _irlReferenceLabel() {
  if (typeof irlSelectedCity !== "undefined" && irlSelectedCity) return irlSelectedCity.name;
  var el = document.getElementById("irlUserCityName");
  return (el && el.textContent && el.textContent !== "…") ? el.textContent : "ta position";
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

  closeModal();
  renderIRL();
}

// Retire complètement le filtre de date (le ✕ à côté du bouton calendrier).
function clearIrlDateFilter() {
  if (irlDateFilters) irlDateFilters.clear();
  irlCustomDate = null;
  window._irlCalPending = false;
  renderIRL();
  _renderIrlInlineCal();
}

// Le filtre de date n'a plus qu'UN bouton (icône calendrier) : son libellé
// affiche la période choisie, et le ✕ n'apparaît que s'il y a quelque chose à
// retirer. Remplace les 5 pastilles Aujourd'hui/Demain/… (2026-07-22).
function _syncIrlDateBtn() {
  var label = document.getElementById("irlDateBtnLabel");
  var btn = document.getElementById("irlDateBtn"); // n'existe plus (calendrier en ligne)
  var clear = document.getElementById("irlDateClearBtn");
  if (!label) return;
  var active = !!(irlDateFilters && irlDateFilters.size);
  var txt = "Toutes les dates";
  if (active && irlCustomDate) {
    var f = function(ts) { return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }); };
    var sameDay = new Date(irlCustomDate.start).toDateString() === new Date(irlCustomDate.end).toDateString();
    txt = sameDay ? f(irlCustomDate.start) : f(irlCustomDate.start) + " → " + f(irlCustomDate.end);
  } else if (active) {
    var names = { today: "Aujourd'hui", tomorrow: "Demain", week: "Cette semaine", month: "Ce mois" };
    txt = [...irlDateFilters].map(function(k) { return names[k] || k; }).join(" · ");
  }
  label.textContent = txt;
  if (btn) {
    btn.style.borderColor = active ? "var(--accent)" : "var(--border)";
    btn.style.color = active ? "var(--accent)" : "var(--text)";
  }
  if (clear) clear.style.display = active ? "block" : "none";
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
  // On garde les événements EN COURS (commencés mais pas finis) : c'est
  // précisément le moment où l'utilisateur a besoin de l'adresse et du fil de
  // discussion. Les événements terminés ne sortent que via l'onglet « Passés ».
  var filtered = events.filter(function(e) {
    return irlShowPast ? true : _eventEndAt(e) > now;
  });
  if (irlShowPast) filtered = filtered.filter(function(e) { return _eventIsOver(e); });

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
  // 6. Recherche texte (titre / ville / lieu / description / passion) — avant, la
  // recherche masquait juste des cartes en CSS : le compteur, la carte et l'état
  // vide continuaient de compter les événements invisibles.
  if (irlSearchQuery) {
    var q = irlSearchQuery;
    filtered = filtered.filter(function(e) {
      var p = passionById(e.passion) || {};
      return [e.title, e.city, e.venue, e.address, e.desc, e.eventType, p.label]
        .some(function(v) { return String(v || "").toLowerCase().indexOf(q) > -1; });
    });
  }
  return _sortIrlEvents(filtered);
}

// Tri de la liste : imminent (défaut) / le plus proche / le plus populaire.
function _sortIrlEvents(list) {
  var ref = _irlReferenceLoc();
  if (irlSort === "near") {
    return list.slice().sort(function(a, b) {
      var da = _eventDistanceKm(a, ref), db = _eventDistanceKm(b, ref);
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db || a.date - b.date;
    });
  }
  if (irlSort === "popular") {
    return list.slice().sort(function(a, b) {
      return ((b.attendees || []).length - (a.attendees || []).length) || a.date - b.date;
    });
  }
  // "soon" : le prochain d'abord ; en mode « Passés », le plus récent d'abord.
  return list.slice().sort(function(a, b) { return irlShowPast ? b.date - a.date : a.date - b.date; });
}

// Distance en km entre un événement et le point de référence, ou null si le lieu
// n'est pas géolocalisable.
function _eventDistanceKm(ev, ref) {
  var loc = eventLatLng(ev);
  if (!loc) return null;
  var r = ref || _irlReferenceLoc();
  return calculateDistance(r.lat, r.lng, loc[0], loc[1]);
}

function _fmtDistance(km) {
  if (km == null) return "";
  if (km < 1) return Math.round(km * 1000) + " m";
  if (km < 10) return km.toFixed(1).replace(".", ",") + " km";
  return Math.round(km) + " km";
}

// Nombre de filtres actifs (pour l'indicateur "X filtres · Réinitialiser").
// ⚠️ Les passions COMPTENT désormais : elles ne sont plus pré-cochées, donc une
// passion active est bien un choix de l'utilisateur — et c'est le filtre qui
// masque le plus d'événements, il doit être visible dans la pastille.
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
  irlSearchQuery = "";
  window._irlCalPending = false;
  var searchEl = document.getElementById("irlCitySearch");
  if (searchEl) searchEl.value = "";
  var timeBtn = document.getElementById("irlTimeFilterBtn");
  if (timeBtn) timeBtn.textContent = "🕐 Horaire";
  _syncIrlDistanceUI();
  _syncIrlTimeUI();
  renderIRL();
  _renderIrlInlineCal();
}

function openIrlFiltersPanel() {
  var panel = document.getElementById("irlFiltersPanel");
  if (panel) panel.style.display = "block";
  // Le calendrier n'est peint qu'à l'ouverture (et à chaque changement) : inutile
  // de reconstruire 42 cellules à chaque renderIRL alors que le panneau est fermé.
  if (!window._irlFilterTab) window._irlFilterTab = "date";
  _syncIrlFilterTabs();
  _syncIrlDistanceUI();
  _syncIrlTimeUI();
  _renderIrlInlineCal();
}

function closeIrlFiltersPanel() {
  var panel = document.getElementById("irlFiltersPanel");
  if (panel) panel.style.display = "none";
  renderIRL();
}

function _updateIrlFiltersBtn() {
  var n = _irlActiveFilterCount();
  var badge = document.getElementById("irlFiltersBadge");
  var clearBtn = document.getElementById("irlFiltersClearBtn");
  var mainBtn = document.getElementById("irlFiltersBtn");
  if (badge) { badge.textContent = n > 0 ? n : ""; badge.style.display = n > 0 ? "inline-block" : "none"; }
  if (mainBtn) {
    mainBtn.style.borderColor = n > 0 ? "var(--accent)" : "var(--border)";
    mainBtn.style.color = n > 0 ? "var(--accent)" : "var(--muted)";
  }
}

// ⚠️ La barre d'outils au-dessus de la liste (onglets « À venir / Passés », vue
// calendrier, tri, et la ligne « N événements · X filtres · N masqués ») a été
// SUPPRIMÉE le 2026-07-22 : trop d'informations concurrentes pour un écran qui a
// déjà une barre de passions, une barre de recherche et un panneau de filtres
// avec sa pastille de compte. Le tri reste sur « imminents » (irlSort), et les
// événements passés restent joignables par code (setIrlPastMode) — juste plus
// d'onglet dédié. Ne PAS réintroduire un bandeau de comptage sans demande.

// Taille d'une page de la liste d'événements.
const IRL_PAGE_SIZE = 12;
function _showMoreIrlEvents() {
  window._irlRenderLimit = (window._irlRenderLimit || IRL_PAGE_SIZE) + IRL_PAGE_SIZE;
  renderIRL();
}
// Tout changement de filtre/tri/onglet doit repartir de la PREMIÈRE page, sinon
// on garde une limite gonflée par la consultation précédente. Plutôt que
// d'appeler un reset depuis les ~8 points d'entrée de filtrage (et d'en oublier
// un), on compare une signature des filtres à chaque rendu : un seul endroit.
function _resetIrlPagingIfFiltersChanged() {
  var sig = [
    [...(irlPassionFilters || [])].sort().join(","),
    [...(irlFilters || [])].sort().join(","),
    [...(irlDateFilters || [])].sort().join(","),
    irlDistanceFilter, irlTimeFilter, irlSearchQuery, irlSort, irlShowPast,
    irlCustomDate ? irlCustomDate.start + "-" + irlCustomDate.end : "",
  ].join("|");
  if (sig !== window._irlFilterSig) {
    window._irlFilterSig = sig;
    window._irlRenderLimit = IRL_PAGE_SIZE;
  }
}

function setIrlSort(v) { irlSort = v; renderIRL(); }
function setIrlPastMode(past) {
  if (irlShowPast === !!past) return;
  irlShowPast = !!past;
  renderIRL();
}

// État vide : le message dépend de la RAISON du vide (filtres vs. vraiment aucun
// événement), sinon on invite à « créer le premier » alors qu'il y en a 35.
function _irlEmptyStateHtml() {
  var filtered = _irlActiveFilterCount() > 0 || irlSearchQuery;
  if (irlShowPast) {
    return '<div class="empty"><div class="empty-icon">🕰</div><div class="empty-title">Aucun événement passé</div>'
      + '<div class="empty-text">Tes souvenirs IRL apparaîtront ici après ton premier événement.</div>'
      + '<button class="btn primary" style="margin-top:10px;" onclick="setIrlPastMode(false)">Voir les événements à venir</button></div>';
  }
  if (filtered) {
    return '<div class="empty"><div class="empty-icon">🔍</div><div class="empty-title">Rien avec ces filtres</div>'
      + '<div class="empty-text">Élargis la zone, la date ou la passion pour voir plus d\'événements.</div>'
      + '<button class="btn primary" style="margin-top:10px;" onclick="clearAllIrlFilters()">✕ Tout afficher</button></div>';
  }
  return '<div class="empty"><div class="empty-icon">🗓</div><div class="empty-title">Aucun événement</div>'
    + '<div class="empty-text">Crée le premier pour +30 pts.</div>'
    + '<button class="btn primary" style="margin-top:10px;" onclick="openCreateEvent()">+ Créer</button></div>';
}

// Initialise/rafraîchit la carte HORS du chemin de rendu synchrone. Débouncé :
// plusieurs renderIRL() rapprochés (filtres, realtime) ne déclenchent qu'un seul
// travail carte.
function _scheduleIrlMapUpdate() {
  clearTimeout(window._irlMapT);
  window._irlMapT = setTimeout(function () {
    var run = function () {
      try { initIrlMap(); } catch (e) {}
      try { updateIrlMapMarkers(); } catch (e) {}
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 800 });
    else run();
  }, 60);
}

function renderIRL() {
  // Mettre à jour le titre de la ville (sélectionnée ou détectée)
  updateIrlCityTitle();

  renderIrlPassionTiles();
  // ⚠️ La carte est initialisée EN DIFFÉRÉ, jamais dans le chemin synchrone du
  // rendu : l'init de MapLibre (parse de ~250 Ko + compilation des shaders WebGL)
  // bloque le thread principal ~1 à 3 s. En l'appelant ici directement, l'écran
  // IRL restait figé à l'arrivée alors que la LISTE, elle, est prête tout de
  // suite. On peint donc la liste d'abord, la carte se remplit juste après.
  _scheduleIrlMapUpdate();

  // Demander la position GPS EN ARRIÈRE-PLAN (ne pas bloquer le rendu initial)
  // Si elle est obtenue, elle appellera renderIRL() à nouveau avec la vraie position
  if (!irlUserLocation) {
    requestUserLocation();
  }

  var filtered = _filterIrlEvents(allEvents());
  _resetIrlPagingIfFiltersChanged();

  // Bouton filtres : badge + bordure accentuée
  _updateIrlFiltersBtn();

  // Sync du panneau de filtres (résumé de la date, onglets, curseur de distance)
  _syncIrlDateBtn();
  _syncIrlFilterTabs();
  _syncIrlDistanceUI();
  _syncIrlTimeUI();

  // Sync filter buttons (Mes events / Inscrit) - multi-select
  document.querySelectorAll("[data-irlfilter]").forEach(function(btn) {
    btn.classList.toggle("active", irlFilters && irlFilters.has(btn.getAttribute("data-irlfilter")));
  });

  // Données de démo (commentaires + réactions) pour les événements seed, afin de
  // VOIR la fonctionnalité tant qu'il n'y a pas encore de vrais utilisateurs.
  // Doit tourner AVANT de construire le markup (les cartes lisent ces caches).
  _seedDemoEventInteractions(filtered);

  const list = $("#eventList");
  if (filtered.length === 0) {
    list.innerHTML = _irlEmptyStateHtml();
    return;
  }

  // ⚠️ Rendu INCRÉMENTAL. Depuis que l'écran n'est plus pré-filtré sur les
  // passions de l'utilisateur, la liste passe de ~4 à ~35 cartes, chacune avec
  // ses avatars, réactions et aperçu de commentaires : le rendu complet coûtait
  // ~1,1 s à l'arrivée sur l'écran. On n'en peint que IRL_PAGE_SIZE, le reste
  // via « Afficher plus » (même principe que le fil).
  const _ref = _irlReferenceLoc();
  const total = filtered.length;
  const shown = Math.min(total, window._irlRenderLimit || IRL_PAGE_SIZE);
  const rest = total - shown;
  filtered = filtered.slice(0, shown);
  list.innerHTML = filtered.map(e => {
    const passion = passionById(e.passion);
    const joined = (state.user.joinedEvents || []).includes(e.id);
    // Like ❤️ + réactions (cache window._eventLikes, hydraté par _loadEventReactions)
    const _evL = (window._eventLikes && window._eventLikes[e.id]) || { likes: 0, liked: false, emojiCounts: {} };
    const evLiked = (state.user.likedEvents || []).includes(e.id) || _evL.liked;
    const evLikeCount = _evL.likes || 0;
    const d = fmtEventDate(e.date);
    const cancelled = _eventIsCancelled(e);
    const over = _eventIsOver(e);
    const live = _eventIsLive(e);
    const daysLeft = Math.max(0, Math.ceil((e.date - Date.now()) / 86400000));
    const urgency = cancelled ? "" : live ? "🟣 En cours" : over ? "" :
      daysLeft === 0 ? "🔴 Aujourd'hui" : daysLeft === 1 ? "🟠 Demain" : daysLeft <= 7 ? "🟢 Dans " + daysLeft + "j" : "";
    const atts = (e.attendees || []).slice(0, 4);
    const attAvatars = atts.map(aid => {
      const u = userById(aid) || { avatar: "#64748b", profileEmoji: "?" };
      return `<div class="avatar sm" style="background:${avatarBg(u)};cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${escapeJsArg(aid)}')">${avatarInner(u)}</div>`;
    }).join("");
    const timeStr = e.time || d.time || "";
    // ⚠️ Le « · » de séparation est ajouté ICI et NULLE PART AILLEURS (le bug
    // historique « Lyon · · Café des Arts » venait d'un `· ` déjà collé au venue).
    const venueStr = e.venue ? " · " + escapeHtml(e.venue) : "";
    const distKm = _eventDistanceKm(e, _ref);
    const distStr = distKm != null && distKm < 20000 ? " · " + _fmtDistance(distKm) : "";
    const priceTag = e.price !== undefined && e.price !== null && e.price !== "" ? `<span class="pill" style="padding:2px 7px;font-size:10px;">${e.price == 0 ? "Gratuit 🎉" : e.price + " 💎 Passia"}</span>` : "";
    const typeTag = e.eventType ? `<span class="pill" style="padding:2px 7px;font-size:10px;">${escapeHtml(e.eventType)}</span>` : "";
    const attCount = (e.attendees || []).length;
    const maybeCount = (e.maybes || []).length;
    const waitCount = (e.waitlist || []).length;
    const isFull = _eventIsFull(e);
    const myState = myRsvp(e.id);
    const spotsTag = e.maxAttendees
      ? (isFull
          ? `<span class="pill" style="padding:2px 7px;font-size:10px;color:#ef4444;border-color:rgba(239,68,68,0.4);">⚠️ Complet${waitCount ? " · " + waitCount + " en attente" : ""}</span>`
          : `<span style="font-size:10px;color:var(--muted);">${attCount}/${e.maxAttendees} places</span>`)
      : "";
    // Le CTA raconte l'état réel : annulé > terminé > mon RSVP > complet > rejoindre.
    const cta = cancelled
      ? `<span class="pill" style="color:#ef4444;border-color:rgba(239,68,68,.4);">Annulé</span>`
      : over
        ? `<button class="btn small ghost" onclick="event.stopPropagation();openEventDetails('${escapeJsArg(e.id)}')">Revoir</button>`
        : myState
          ? `<button class="btn small ghost" onclick="event.stopPropagation();openEventRsvpSheet('${escapeJsArg(e.id)}')">${RSVP_LABELS[myState].short}</button>`
          : `<button class="btn small primary" onclick="event.stopPropagation();openEventRsvpSheet('${escapeJsArg(e.id)}')">${isFull ? "⏳ Liste d'attente" : "+ Rejoindre"}</button>`;
    return `<div class="event-card${cancelled ? " is-cancelled" : ""}${over ? " is-past" : ""}" role="button" tabindex="0"
      data-evid="${escapeHtml(e.id)}"
      data-city="${escapeHtml((e.city||'').toLowerCase())}" data-title="${escapeHtml((e.title||'').toLowerCase())}"
      onclick="openEventDetails('${escapeJsArg(e.id)}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openEventDetails('${escapeJsArg(e.id)}');}">
      ${cancelled ? '<div class="event-card-banner cancelled">🚫 Événement annulé par l\'organisateur</div>' : live ? '<div class="event-card-banner live">🟣 C\'est maintenant</div>' : ""}
      <div style="display:flex;gap:10px;">
        <div class="event-date-block">
          <div class="event-date-day">${d.day}</div>
          <div class="event-date-month">${d.month}</div>
          <div style="font-size:10px;font-weight:700;color:var(--accent);margin-top:2px;">${timeStr}</div>
        </div>
        <div style="flex:1;min-width:0;">
          <div class="event-title">${escapeHtml(e.title)}</div>
          <div class="event-meta">${passion.emoji} ${escapeHtml(passion.label)} · 📍 ${escapeHtml(e.city || "")}${venueStr}${distStr}${urgency ? ' · <span style="font-weight:700;">' + urgency + '</span>' : ""}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;">${priceTag}${typeTag}${spotsTag}</div>
        </div>
        ${_isMyEvent(e) ? '<span class="pill active" style="height:fit-content;flex-shrink:0;">Organisé</span>' : ""}
      </div>
      <div style="font-size:12px;color:var(--text-dim);margin-top:8px;line-height:1.5;">${escapeHtml((e.desc || "").slice(0, 120))}${(e.desc||"").length > 120 ? "…" : ""}</div>
      ${_eventSocialProofHtml(e)}
      <div class="event-footer">
        <div class="attendees">${attAvatars}<span class="pill" style="margin-left:6px;padding:3px 8px;">${attCount} inscrit${attCount > 1 ? "s" : ""}${maybeCount ? " · " + maybeCount + " 🤔" : ""}</span></div>
        ${cta}
      </div>
      <div class="post-actions" onclick="event.stopPropagation()">
        <span class="post-action ${evLiked ? "liked" : ""}" data-evlike="${e.id}" onclick="event.stopPropagation();toggleEventLike('${e.id}', this)">${evLiked ? "❤️" : "🤍"} ${evLikeCount}</span>
        <span class="post-action" data-evc="${e.id}" onclick="event.stopPropagation();openCommentSheet('${e.id}','💬 ${escapeHtml((e.title||'').replace(/'/g,'’')).slice(0,40)}')">💬 ${_eventCmtBadge(e.id)}</span>
        <span class="post-action" onclick="return showEmojiPickerForEvent('${e.id}', event);" title="Réagir">😊</span>
        <span class="post-action" onclick="event.stopPropagation();shareEvent('${e.id}')" title="Partager" aria-label="Partager">${shareIconSvg(18)}</span>
        <span class="event-react-chip-holder" data-evchipholder="${e.id}" style="margin-left:auto;">${_evReactChipHtml(e.id)}</span>
      </div>
      <div class="event-comments-inline" data-evcomments="${e.id}" onclick="event.stopPropagation()">${_evCommentsInlineHtml(e.id)}</div>
    </div>`;
  }).join("") + (rest > 0
    ? `<button class="btn ghost block" style="margin-top:10px;" onclick="_showMoreIrlEvents()">Afficher plus (${rest} restant${rest > 1 ? "s" : ""})</button>`
    : "");

  // Compteurs de commentaires + likes/réactions + aperçu commentaires (lots, patch
  // DOM). UNIQUEMENT pour les vrais événements Supabase — sinon les résultats vides
  // écraseraient les données de démo des événements seed.
  var _supaEvIds = filtered.filter(function(e){ return e.fromSupabase; }).map(function(e){ return e.id; });
  _loadEventCommentCounts(_supaEvIds);
  _loadEventReactions(_supaEvIds);
  _loadEventCommentsPreviews(_supaEvIds);
}

// Charge en une requête les likes/réactions des événements visibles puis met à
// jour les pastilles ❤️ et la bande de réactions en place (cache _eventLikes).
async function _loadEventReactions(ids) {
  window._eventLikes = window._eventLikes || {};
  if (!ids || !ids.length) return;
  if (typeof supaLoadEventReactions !== "function" || !window._supaReal) return;
  try {
    var data = await supaLoadEventReactions(ids);
    if (!data) return;
    Object.keys(data).forEach(function(id){
      var d = data[id];
      // Préserve mon like optimiste local (au cas où il n'est pas encore en base)
      if ((state.user.likedEvents || []).indexOf(id) > -1) d.liked = true;
      // Conserve mes GIFs optimistes locaux (pas encore relus en base) si présents.
      var _prev = window._eventLikes[id];
      if (_prev && _prev.gifs && _prev.gifs.length && (!d.gifs || !d.gifs.length)) d.gifs = _prev.gifs;
      window._eventLikes[id] = d;
      var lk = document.querySelector('[data-evlike="' + id + '"]');
      if (lk) { lk.classList.toggle("liked", d.liked); lk.innerHTML = (d.liked ? "❤️" : "🤍") + " " + (d.likes || 0); }
      if (typeof _patchEventReactChip === "function") _patchEventReactChip(id);
    });
  } catch (e) {}
}

// Like ❤️ d'un événement (toggle optimiste local + sync event_reactions).
function toggleEventLike(id, el) {
  state.user.likedEvents = state.user.likedEvents || [];
  window._eventLikes = window._eventLikes || {};
  var cur = window._eventLikes[id] || { likes: 0, liked: false, emojiCounts: {} };
  var liked = state.user.likedEvents.indexOf(id) > -1;
  if (liked) {
    state.user.likedEvents = state.user.likedEvents.filter(function(x){ return x !== id; });
    cur.likes = Math.max(0, (cur.likes || 1) - 1); cur.liked = false;
  } else {
    state.user.likedEvents.push(id);
    cur.likes = (cur.likes || 0) + 1; cur.liked = true;
    if (typeof bumpQuest === "function") { try { bumpQuest("like"); } catch(e){} }
  }
  window._eventLikes[id] = cur;
  if (typeof saveState === "function") saveState();
  // Patch TOUS les exemplaires du bouton : le même événement est affiché à la fois
  // dans la liste et dans sa fiche (et la fiche se superpose à la liste) — ne
  // repeindre que `el` laissait l'autre copie sur l'ancien compteur.
  var _els = document.querySelectorAll('[data-evlike="' + id + '"]');
  if (!_els.length && el) _els = [el];
  [].forEach.call(_els, function (n) {
    n.classList.toggle("liked", cur.liked);
    n.innerHTML = (cur.liked ? "❤️" : "🤍") + " " + (cur.likes || 0);
  });
  if (typeof supa !== "undefined" && supa && typeof MY_UID !== "undefined" && MY_UID && window._supaReal && typeof supaToggleEventLike === "function") {
    supaToggleEventLike(id);
    if (cur.liked) {
      var ev = _findCanonicalEvent(id) || (typeof allEvents === "function" ? allEvents().find(function(x){ return x.id === id; }) : null);
      if (ev && ev.organizerId && ev.organizerId !== MY_UID && ev.fromSupabase && typeof supaInsertNotif === "function") {
        supaInsertNotif(ev.organizerId, "like", id, "a aimé ton événement");
      }
    }
  }
}

// 😊 Réagir à un événement : ouvre le MÊME sélecteur emoji + GIF que les posts
// (grille complète, prévisualisation, bouton ✓ valider avant d'envoyer).
function reactEventPicker(id, event) {
  if (typeof showEmojiPickerForEvent === "function") return showEmojiPickerForEvent(id, event);
  return false;
}

// Injecte des commentaires + réactions de DÉMO (déterministes) sur les événements
// seed (non-Supabase), pour visualiser la fonctionnalité tant que personne n'utilise
// encore l'app. Ne touche jamais aux vrais événements ni aux caches déjà remplis.
var _DEMO_EV_USERS = ["u_lea", "u_karim", "u_nina", "u_sofia", "u_amira", "u_theo"];
var _DEMO_EV_COMMENTS = [
  "Trop hâte d'y être 🙌", "Quelqu'un vient depuis le centre ?", "On peut amener des amis ?",
  "Première fois pour moi, j'ai hâte !", "C'est validé, je serai là 😄", "Ça a l'air génial, merci pour l'orga !",
  "Je ramène de quoi grignoter 🍪", "Hâte de rencontrer la communauté !"
];
var _DEMO_EV_EMOJIS = ["🔥", "😍", "👏", "🎉", "💯", "😮"];
function _seedDemoEventInteractions(events) {
  window._eventCommentsCache = window._eventCommentsCache || {};
  window._eventLikes = window._eventLikes || {};
  window._eventCommentCounts = window._eventCommentCounts || {};
  window._eventReactDetail = window._eventReactDetail || {};
  (events || []).forEach(function(e){
    if (!e || e.fromSupabase) return; // vrais événements : on garde les données réelles
    var h = 0; for (var i = 0; i < e.id.length; i++) { h = (h * 31 + e.id.charCodeAt(i)) >>> 0; }
    // Commentaires démo
    if (window._eventCommentsCache[e.id] === undefined) {
      var nC = h % 4; // 0..3
      var arr = [];
      for (var c = 0; c < nC; c++) {
        var uId = _DEMO_EV_USERS[(h + c * 7) % _DEMO_EV_USERS.length];
        arr.push({ id: "ecdemo_" + e.id + "_" + c, authorId: uId,
          author: ((typeof userById === "function" && userById(uId)) || {}).name || "Passionné",
          text: _DEMO_EV_COMMENTS[(h + c * 5) % _DEMO_EV_COMMENTS.length],
          at: Date.now() - (c + 1) * 3600000, _demo: true });
      }
      window._eventCommentsCache[e.id] = arr;
      if (window._eventCommentCounts[e.id] == null) window._eventCommentCounts[e.id] = arr.length;
    }
    // Réactions démo (+ détail par utilisateur pour la pastille)
    if (window._eventLikes[e.id] === undefined) {
      var counts = {}, detail = [];
      var nE = (h % 3) + 1; // 1..3 types d'emoji
      for (var k = 0; k < nE; k++) {
        var em = _DEMO_EV_EMOJIS[(h + k * 3) % _DEMO_EV_EMOJIS.length];
        if (counts[em]) continue;
        var cnt = 1 + ((h + k) % 4);
        counts[em] = cnt;
        for (var n = 0; n < cnt; n++) detail.push({ userId: _DEMO_EV_USERS[(h + k * 3 + n) % _DEMO_EV_USERS.length], emoji: em });
      }
      // Ma propre interaction est REJOUÉE par-dessus l'agrégat de démo : elle vit
      // dans state.user (persistée), alors que ces compteurs sont régénérés à
      // chaque chargement depuis le hash de l'id. Sans ça, mon ❤️ et ma réaction
      // emoji sur un événement de démo disparaissaient au rechargement.
      var _iLiked = (state.user.likedEvents || []).includes(e.id);
      var _myReact = (state.user.eventReactions || {})[e.id];
      var _gifs = [];
      if (_myReact) {
        if (/^https?:\/\//.test(_myReact)) _gifs.push(_myReact);
        else { counts[_myReact] = (counts[_myReact] || 0) + 1; detail.push({ userId: MY_UID || "me", emoji: _myReact }); }
      }
      window._eventLikes[e.id] = { likes: (h % 9) + (_iLiked ? 1 : 0), liked: _iLiked, emojiCounts: counts, gifs: _gifs };
      window._eventReactDetail[e.id] = detail;
    }
  });
}

// ════════════════════════════════════════════════════════════════════════
// RÉACTIONS D'ÉVÉNEMENT — pastille unique cliquable (comme demandé) + détail
// ════════════════════════════════════════════════════════════════════════

// HTML de la pastille de réactions d'un événement : un SEUL bouton « 😍🔥❤️ N »
// (emojis distincts + total), cliquable pour voir le détail. Vide si 0 réaction.
function _evReactChipHtml(eventId) {
  var d = (window._eventLikes && window._eventLikes[eventId]) || {};
  var counts = d.emojiCounts || {};
  var keys = Object.keys(counts);
  // Le compteur ne compte QUE les emojis (les GIF sont des commentaires, pas des
  // réactions — même règle que les posts/commentaires).
  var total = keys.reduce(function(s, k){ return s + counts[k]; }, 0);
  if (!total) return "";
  // UN SEUL emoji (le plus fréquent) + le total — clic pour voir qui a réagi.
  var top = keys.slice().sort(function(a, b){ return counts[b] - counts[a]; })[0] || "😊";
  return '<button class="ev-react-chip" data-evchip="' + eventId + '" onclick="event.stopPropagation();return openEventReactions(\'' + eventId + '\', event);">'
    + escapeHtml(top) + ' <b>' + total + '</b></button>';
}
// Repeint la pastille (dans son conteneur data-evchipholder) après une réaction.
function _patchEventReactChip(eventId) {
  // querySelectorAll : la pastille existe sur la carte ET sur la fiche.
  var _html = _evReactChipHtml(eventId);
  document.querySelectorAll('[data-evchipholder="' + eventId + '"]').forEach(function (h) { h.innerHTML = _html; });
}
// Applique une ou plusieurs réactions emoji (tableau) à un événement (optimiste +
// sync event_reactions), puis repeint la pastille.
function applyEventEmojiReaction(eventId, emojiArr) {
  if (!emojiArr || !emojiArr.length) return;
  // Le panneau envoie une réaction à la fois (dernier tap fait foi).
  var e = emojiArr[emojiArr.length - 1];
  if (!e) return;
  if (e === "❤️") { // le cœur = un like (cohérent avec le bouton ❤️)
    var lk = document.querySelector('[data-evlike="' + eventId + '"]');
    toggleEventLike(eventId, lk); // toggle strict (le like gère déjà 1/personne)
    return;
  }
  _setEventReaction(eventId, e); // une seule réaction (emoji/gif) par personne
}
// Un GIF sur un événement = un COMMENTAIRE (image inline), pas une réaction du
// compteur (comme partout ailleurs). Délègue au poste de commentaire générique.
function applyEventGifReaction(eventId, gifUrl) {
  if (!gifUrl) return;
  if (typeof _postGifComment === "function") return _postGifComment(eventId, gifUrl);
}
// Cœur commun « une seule réaction par personne » pour un événement : remplace ma
// réaction précédente (emoji OU gif) ; re-tap de la même = toggle off. L'aperçu
// agrégé window._eventLikes est ajusté en optimiste, l'état perso mémorisé dans
// state.user.eventReactions (survit au reload) et Supabase resynchronisé (delete
// de l'ancienne + insert de la nouvelle) pour rester cohérent cross-compte.
function _setEventReaction(eventId, val) {
  window._eventLikes = window._eventLikes || {};
  var d = window._eventLikes[eventId] || { likes: 0, liked: false, emojiCounts: {}, gifs: [] };
  d.emojiCounts = d.emojiCounts || {}; d.gifs = d.gifs || [];
  state.user.eventReactions = state.user.eventReactions || {};
  var prev = state.user.eventReactions[eventId];
  var isGif = function (x) { return /^https?:\/\//.test(x); };
  // Retirer ma réaction précédente de l'agrégat + du serveur.
  if (prev) {
    if (isGif(prev)) d.gifs = d.gifs.filter(function (g) { return g !== prev; });
    else { d.emojiCounts[prev] = Math.max(0, (d.emojiCounts[prev] || 1) - 1); if (!d.emojiCounts[prev]) delete d.emojiCounts[prev]; }
    if (typeof supaRemoveEventReaction === "function") supaRemoveEventReaction(eventId, prev);
  }
  if (prev === val) { // re-tap de la même réaction → toggle off
    delete state.user.eventReactions[eventId];
    window._eventLikes[eventId] = d;
    if (typeof saveState === "function") saveState();
    _patchEventReactChip(eventId);
    return;
  }
  // Poser la nouvelle réaction.
  if (isGif(val)) d.gifs.push(val); else d.emojiCounts[val] = (d.emojiCounts[val] || 0) + 1;
  state.user.eventReactions[eventId] = val;
  window._eventLikes[eventId] = d;
  if (typeof saveState === "function") saveState();
  if (typeof supaAddEventReaction === "function") supaAddEventReaction(eventId, val);
  _patchEventReactChip(eventId);
  _notifyEventOrganizerReaction(eventId);
}
function _notifyEventOrganizerReaction(eventId) {
  try {
    var ev = (typeof _findCanonicalEvent === "function" && _findCanonicalEvent(eventId))
      || (typeof allEvents === "function" ? allEvents().find(function(x){ return x.id === eventId; }) : null);
    if (ev && ev.organizerId && ev.organizerId !== MY_UID && ev.fromSupabase && typeof supaInsertNotif === "function") {
      supaInsertNotif(ev.organizerId, "like", eventId, "a réagi à ton événement");
    }
  } catch(e) {}
}
// Panneau de détail des réactions (qui a réagi avec quoi). Chargé à la demande.
function openEventReactions(eventId, event) {
  if (event) { event.stopPropagation(); event.preventDefault(); }
  var old = document.getElementById("ev-react-detail");
  if (old) { old.remove(); return false; }
  var panel = document.createElement("div");
  panel.id = "ev-react-detail";
  panel.style.cssText = "position:fixed;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:10px 12px;z-index:100002;box-shadow:0 8px 28px rgba(0,0,0,0.28);width:230px;max-height:280px;overflow-y:auto;";
  panel.innerHTML = '<div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:8px;">Réactions</div><div id="evReactDetailBody" style="font-size:12px;color:var(--text-dim);">Chargement…</div>';
  var btn = event && (event.currentTarget || event.target);
  if (btn && btn.getBoundingClientRect) {
    var r = btn.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 240)) + "px";
    panel.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + "px";
  } else { panel.style.left = "50%"; panel.style.bottom = "30%"; panel.style.transform = "translateX(-50%)"; }
  document.body.appendChild(panel);
  setTimeout(function(){
    var cl = function(e){ if (!panel.contains(e.target) && e.target !== btn) { panel.remove(); document.removeEventListener("click", cl); } };
    document.addEventListener("click", cl);
  }, 50);
  _fillEventReactionDetail(eventId);
  return false;
}
async function _fillEventReactionDetail(eventId) {
  var body = document.getElementById("evReactDetailBody");
  if (!body) return;
  // Événement DÉMO : détail déjà en mémoire → affichage immédiat (pas d'attente
  // d'une requête Supabase qui ne renverrait rien pour un événement seed).
  var rows = (window._eventReactDetail && window._eventReactDetail[eventId]) || null;
  if (!rows && typeof supaLoadEventReactionDetail === "function" && window._supaReal) {
    try { rows = await supaLoadEventReactionDetail(eventId); } catch(e) {}
    body = document.getElementById("evReactDetailBody"); if (!body) return;
  }
  if (rows && rows.length) {
    body.innerHTML = rows.map(function(r){
      var u = (typeof userById === "function" && userById(r.userId)) || { name: "Quelqu'un", profileEmoji: "👤", avatar: "#64748b" };
      var _av = { avatar: u.avatar || "#64748b", profileEmoji: u.profileEmoji || "👤", name: u.name, photoUrl: u.photoUrl || null };
      // escapeHtml : l'emoji vient de event_reactions (payload libre) → anti-XSS.
      var face = /^https?:\/\//.test(r.emoji)
        ? '<img loading="lazy" src="' + escapeHtml(r.emoji) + '" style="width:30px;height:30px;border-radius:6px;object-fit:cover;"/>'
        : '<span style="font-size:18px;">' + escapeHtml(r.emoji || "") + '</span>';
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">'
        + '<div class="avatar sm" style="background:' + avatarBg(_av) + ';flex-shrink:0;">' + avatarInner(_av) + '</div>'
        + '<span style="flex:1;font-size:12px;color:var(--text);">' + escapeHtml(u.name) + '</span>' + face + '</div>';
    }).join("");
    return;
  }
  // Fallback (hors-ligne ou pas de détail) : décompte agrégé par emoji.
  var d = (window._eventLikes && window._eventLikes[eventId]) || {};
  var counts = d.emojiCounts || {};
  var keys = Object.keys(counts);
  if (!keys.length && !(d.gifs || []).length) { body.innerHTML = "Aucune réaction pour l'instant."; return; }
  body.innerHTML = keys.map(function(k){ return '<div style="padding:3px 0;font-size:14px;">' + escapeHtml(k) + ' × ' + counts[k] + '</div>'; }).join("")
    + (d.gifs || []).map(function(g){ return '<img loading="lazy" src="' + escapeHtml(g) + '" style="width:60px;height:60px;border-radius:6px;object-fit:cover;margin:4px 4px 0 0;"/>'; }).join("");
}

// ════════════════════════════════════════════════════════════════════════
// COMMENTAIRES INLINE sur les cartes d'événement (aperçu visible + masquer)
// ════════════════════════════════════════════════════════════════════════

// Aperçu inline des commentaires d'un événement (2 derniers par défaut, comme un
// post du fil), avec bascule Afficher/Masquer. Données dans _eventCommentsCache.
function _evCommentsInlineHtml(eventId) {
  var arr = (window._eventCommentsCache && window._eventCommentsCache[eventId]) || [];
  if (!arr.length) return "";
  window._evCommentsHidden = window._evCommentsHidden || {};
  if (window._evCommentsHidden[eventId]) {
    return '<span class="ev-cmt-toggle" onclick="event.stopPropagation();return toggleEventComments(\'' + eventId + '\');">💬 Afficher les ' + arr.length + ' commentaire' + (arr.length > 1 ? "s" : "") + '</span>';
  }
  var sorted = arr.slice().sort(function(a, b){ return (b.at || b.createdAt || 0) - (a.at || a.createdAt || 0); });
  window._evCommentsExpanded = window._evCommentsExpanded || {};
  var expanded = window._evCommentsExpanded[eventId];
  var show = expanded ? sorted.slice(0, 30) : sorted.slice(0, 2);
  var items = show.map(function(c){
    var u = (typeof userById === "function" && userById(c.authorId)) || {};
    var nm = c.author || c.authorName || u.name || "?";
    return '<div class="ev-cmt-preview"><b>' + escapeHtml(nm) + '</b> ' + escapeHtml(c.text || "") + '</div>';
  }).join("");
  var links = "";
  if (arr.length > 2) {
    links += '<span class="ev-cmt-toggle" onclick="event.stopPropagation();return toggleEventCommentsExpand(\'' + eventId + '\');">'
      + (expanded ? "▲ Réduire" : ("▼ Voir les " + arr.length + " commentaires")) + '</span>';
  }
  links += '<span class="ev-cmt-toggle" style="margin-left:10px;" onclick="event.stopPropagation();return toggleEventComments(\'' + eventId + '\');">Masquer</span>';
  return items + '<div style="margin-top:2px;">' + links + '</div>';
}
function _patchEventCommentsInline(eventId) {
  var holder = document.querySelector('[data-evcomments="' + eventId + '"]');
  if (holder) holder.innerHTML = _evCommentsInlineHtml(eventId);
}
function toggleEventComments(eventId) {
  window._evCommentsHidden = window._evCommentsHidden || {};
  window._evCommentsHidden[eventId] = !window._evCommentsHidden[eventId];
  _patchEventCommentsInline(eventId);
  return false;
}
function toggleEventCommentsExpand(eventId) {
  window._evCommentsExpanded = window._evCommentsExpanded || {};
  window._evCommentsExpanded[eventId] = !window._evCommentsExpanded[eventId];
  _patchEventCommentsInline(eventId);
  return false;
}
// Charge en 1 requête les commentaires des événements visibles puis peint l'aperçu.
async function _loadEventCommentsPreviews(ids) {
  if (!ids || !ids.length) return;
  if (typeof supaLoadEventCommentsBatch !== "function" || !window._supaReal) return;
  try {
    var map = await supaLoadEventCommentsBatch(ids);
    if (!map) return;
    Object.keys(map).forEach(function(id){
      _setEventComments(id, map[id]);
      _patchEventCommentsInline(id);
    });
  } catch(e) {}
}

// Valeur de la pastille « 💬 N » d'une carte événement : si le fil de commentaires
// est déjà en cache (hydraté avec réponses), on compte commentaires + réponses via
// commentThreadCount ; sinon on retombe sur le décompte serveur des commentaires
// de premier niveau. Cohérent avec le fil et le CDV.
function _eventCmtBadge(eventId) {
  var arr = window._eventCommentsCache && window._eventCommentsCache[eventId];
  if (arr && arr.length) return commentThreadCount(arr);
  return (window._eventCommentCounts && window._eventCommentCounts[eventId]) || 0;
}

// Charge en une requête le nombre de commentaires des événements visibles puis
// met à jour les pastilles 💬 en place (cache window._eventCommentCounts).
async function _loadEventCommentCounts(ids) {
  window._eventCommentCounts = window._eventCommentCounts || {};
  if (!ids || !ids.length) return;
  if (typeof supaLoadEventCommentCounts !== "function" || !window._supaReal) return;
  try {
    var counts = await supaLoadEventCommentCounts(ids);
    if (!counts) return;
    Object.keys(counts).forEach(function(id){ window._eventCommentCounts[id] = counts[id]; });
    if (typeof _persistEventComments === "function") _persistEventComments();
    ids.forEach(function(id){
      var el = document.querySelector('[data-evc="' + id + '"]');
      if (el) el.textContent = "💬 " + _eventCmtBadge(id);
    });
  } catch (e) {}
}

// Bascule rapide depuis une carte : rien → je viens (ou liste d'attente si
// complet) ; déjà positionné → retrait. Le choix fin des 3 états se fait via
// setEventRsvp (fiche détail + feuille de choix).
function toggleJoinEvent(id) {
  const cur = myRsvp(id);
  const ev = _findCanonicalEvent(id) || allEvents().find(e => e.id === id);
  if (!ev) return;
  if (cur) { setEventRsvp(id, null); return; }
  setEventRsvp(id, _eventIsFull(ev) ? "waitlist" : "going");
}

// Cœur du système de participation. `rsvp` : "going" | "maybe" | "declined" |
// "waitlist" | null (= retrait complet).
async function setEventRsvp(id, rsvp) {
  // Muter l'objet canonique (state), pas une copie de allEvents() — sinon le
  // compteur d'inscrits et les avatars ne se mettaient jamais à jour localement.
  const ev = _findCanonicalEvent(id) || allEvents().find(e => e.id === id);
  if (!ev) return;
  if (_eventIsCancelled(ev) && rsvp) { toast("Cet événement a été annulé"); return; }
  const meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  const prev = myRsvp(id);
  if (prev === rsvp) return;

  // Complet : on ne peut pas passer « je viens » de force, on entre en file.
  if (rsvp === "going" && _eventIsFull(ev) && prev !== "going") {
    rsvp = "waitlist";
    toast("⏳ C'est complet — tu es sur liste d'attente");
  }

  const strip = (arr) => (arr || []).filter(x => x !== meId && x !== "me");
  ev.attendees = strip(ev.attendees);
  ev.maybes = strip(ev.maybes);
  ev.waitlist = strip(ev.waitlist);
  if (rsvp === "going") ev.attendees.push(meId);
  else if (rsvp === "maybe") ev.maybes.push(meId);
  else if (rsvp === "waitlist") ev.waitlist.push(meId);

  _setMyRsvpLocal(id, rsvp);
  saveState();
  _patchEventCardJoin(id);
  _refreshEventDetailIfOpen(id);

  if (!rsvp) {
    toast("Désinscrit");
    if (window._supaReal) await supaLeaveEvent(id);
    // Une place se libère → on promeut le premier de la file (et on le prévient).
    if (prev === "going") _promoteNextWaitlisted(ev);
    _leaveEventConversation(ev);
    return;
  }

  if (rsvp === "going" && prev !== "going") {
    grantReward("event_join");
    bumpQuest("join");
    pushNotification(`🤝 Tu rejoins <b>${escapeHtml(ev.title)}</b>`, "🤝");
  } else {
    toast(RSVP_LABELS[rsvp] ? RSVP_LABELS[rsvp].emoji + " " + RSVP_LABELS[rsvp].label : "Enregistré");
  }

  if (window._supaReal) await supaSetEventRsvp(id, rsvp);
  // Notifier l'organisateur (interaction cross-compte sur SON événement).
  if (rsvp === "going" && ev.fromSupabase && ev.organizerId && ev.organizerId !== meId && typeof supaInsertNotif === "function") {
    supaInsertNotif(ev.organizerId, "event_join", id, "a rejoint ton événement");
  }
  // Les participants (je viens / peut-être) rejoignent la discussion de groupe.
  if (rsvp === "going" || rsvp === "maybe") _joinEventConversation(ev);
  else _leaveEventConversation(ev);
}

// Promotion automatique du premier de la liste d'attente quand une place se
// libère. Fait par le client qui se désinscrit : c'est le seul moment où l'on
// sait, sans serveur, qu'une place vient de s'ouvrir.
async function _promoteNextWaitlisted(ev) {
  if (!ev || !ev.maxAttendees) return;
  let next = (ev.waitlist || [])[0] || null;
  if (window._supaReal && ev.fromSupabase && typeof supaFirstWaitlisted === "function") {
    next = await supaFirstWaitlisted(ev.id) || next;
  }
  if (!next) return;
  ev.waitlist = (ev.waitlist || []).filter(x => x !== next);
  ev.attendees = (ev.attendees || []).concat([next]);
  saveState();
  if (window._supaReal && typeof supaPromoteFromWaitlist === "function") {
    await supaPromoteFromWaitlist(ev.id, next);
  }
  if (typeof supaInsertNotif === "function") {
    supaInsertNotif(next, "event_update", ev.id, "une place s'est libérée, tu es inscrit·e !");
  }
  _patchEventCardJoin(ev.id);
}

// ===== Discussion de groupe des participants =====
// S'inscrire fait entrer dans une conversation de groupe dédiée : c'est ce qui
// transforme une liste d'inscrits en vrai groupe (Meetup, Facebook Events).
async function _joinEventConversation(ev) {
  if (!ev || !window._supaReal) return;
  try {
    if (!ev.convId) {
      // Seul un gestionnaire crée la conversation (évite N créations parallèles).
      if (!_canManageEvent(ev)) return;
      const convId = await supaCreateEventConversation(ev);
      if (!convId) return;
      ev.convId = convId;
      saveState();
      await supaUpdateEvent(ev);
    } else {
      await supaJoinEventConversation(ev.convId);
    }
    _ensureLocalEventConv(ev);
  } catch (e) {}
}

async function _leaveEventConversation(ev) {
  if (!ev || !ev.convId || !window._supaReal) return;
  if (_canManageEvent(ev)) return; // l'organisateur reste dans son groupe
  try { await supaLeaveEventConversation(ev.convId); } catch (e) {}
}

// Miroir local de la conversation de groupe (la messagerie lit conversationsState).
function _ensureLocalEventConv(ev) {
  if (!ev || !ev.convId || typeof getConversations !== "function") return;
  try {
    const convs = getConversations();
    if (convs.some(c => c.id === ev.convId)) return;
    convs.unshift({
      id: ev.convId,
      isGroup: true,
      groupName: "📍 " + String(ev.title || "Événement").slice(0, 40),
      groupPassions: ev.passion ? [ev.passion] : [],
      userIds: (ev.attendees || []).slice(0, 30),
      userId: (ev.attendees || [])[0] || null,
      passion: ev.passion || null,
      eventId: ev.id,
      unread: 0,
      lastAt: Date.now(),
      messages: [],
    });
    conversationsState = convs;
    saveConversations();
  } catch (e) {}
}

// Ouvre la discussion de groupe de l'événement depuis sa fiche.
async function openEventChat(id) {
  const ev = _findCanonicalEvent(id) || allEvents().find(e => e.id === id);
  if (!ev) return;
  if (!myRsvp(id) && !_canManageEvent(ev)) { toast("Rejoins l'événement pour accéder à la discussion"); return; }
  if (!ev.convId) {
    toast("Ouverture de la discussion…");
    await _joinEventConversation(ev);
  }
  if (!ev.convId) { toast("Discussion indisponible hors connexion"); return; }
  _ensureLocalEventConv(ev);
  closeEventDetail();
  goTo("messages");
  setTimeout(() => { try { openConversation(ev.convId); } catch (e) {} }, 150);
}

// ===== Check-in sur place =====
// Pointer son arrivée récompense la présence RÉELLE (et non un clic depuis le
// canapé) : on vérifie la position à CHECKIN_RADIUS_M de l'adresse.
function checkInEvent(id) {
  const ev = _findCanonicalEvent(id) || allEvents().find(e => e.id === id);
  if (!ev) return;
  if (_hasCheckedIn(ev)) { toast("✅ Tu as déjà pointé ton arrivée"); return; }
  if (!_canCheckIn(ev)) { toast("⏰ Le pointage ouvre 1 h avant le début"); return; }
  const loc = eventLatLng(ev);
  const done = () => {
    state.user.checkedInEvents = state.user.checkedInEvents || [];
    if (!state.user.checkedInEvents.includes(id)) state.user.checkedInEvents.push(id);
    if (myRsvp(id) !== "going") _setMyRsvpLocal(id, "going");
    grantReward("event_join");
    saveState();
    if (window._supaReal && typeof supaCheckInEvent === "function") supaCheckInEvent(id);
    toast("🎉 Arrivée confirmée — bon moment !");
    _refreshEventDetailIfOpen(id);
    // Pointer son arrivée est l'action qui débloque le plus de badges (sorties,
    // fiabilité, villes) : c'est le bon moment pour les annoncer.
    if (typeof _announceNewBadges === "function") _announceNewBadges();
  };
  if (!loc || !navigator.geolocation) { done(); return; }
  toast("📍 Vérification de ta position…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const dKm = calculateDistance(pos.coords.latitude, pos.coords.longitude, loc[0], loc[1]);
      if (dKm * 1000 > CHECKIN_RADIUS_M) {
        toast("Tu sembles à " + _fmtDistance(dKm) + " du lieu — rapproche-toi pour pointer");
        return;
      }
      done();
    },
    // GPS refusé/indisponible : on ne bloque pas la personne, on fait confiance.
    () => done(),
    { timeout: 8000, enableHighAccuracy: true }
  );
}

// Re-rend la fiche détail si c'est bien cet événement qui est ouvert.
function _refreshEventDetailIfOpen(id) {
  const page = document.getElementById("eventDetailPage");
  if (page && page.style.display !== "none" && window._openEventDetailId === id) {
    openEventDetails(id);
  }
}

// Feuille de choix du niveau de participation. Un « peut-être » assumé vaut mieux
// qu'un faux « je viens » : l'organisateur sait à quoi s'attendre.
function openEventRsvpSheet(id) {
  const ev = _findCanonicalEvent(id) || allEvents().find(e => e.id === id);
  if (!ev) return;
  if (_eventIsCancelled(ev)) { toast("Cet événement a été annulé"); return; }
  const cur = myRsvp(id);
  const full = _eventIsFull(ev);
  const spots = _eventSpotsLeft(ev);
  const opt = (key, desc) => `
    <button class="btn ${cur === key ? "primary" : "ghost"} block" style="margin-bottom:8px;text-align:left;"
      onclick="closeModal();setEventRsvp('${escapeJsArg(id)}', '${key}')">
      ${RSVP_LABELS[key].emoji} <b>${RSVP_LABELS[key].label}</b>
      <span style="display:block;font-size:11px;opacity:.75;font-weight:500;">${desc}</span>
    </button>`;
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">${escapeHtml(ev.title || "Événement")}</div>
    <div class="modal-subtitle">${spots === null ? "Places illimitées" : full ? "⚠️ Complet — file d'attente ouverte" : spots + " place" + (spots > 1 ? "s" : "") + " restante" + (spots > 1 ? "s" : "")}</div>
    <div style="margin-top:14px;">
      ${full && cur !== "going"
        ? opt("waitlist", "Tu seras inscrit·e automatiquement si une place se libère")
        : opt("going", "Tu comptes dans les places et tu rejoins la discussion du groupe")}
      ${opt("maybe", "Tu suis l'événement sans bloquer de place")}
      ${opt("declined", "Tu ne participes pas — l'organisateur est fixé")}
    </div>
    ${cur ? `<button class="btn secondary block" style="margin-top:6px;" onclick="closeModal();setEventRsvp('${escapeJsArg(id)}', null)">Retirer ma réponse</button>` : ""}
  `);
}

// Met à jour la ligne « inscrits » + le bouton d'une carte sans reconstruire la liste.
function _patchEventCardJoin(id) {
  // Si un filtre dépendant de ma participation est actif, la carte doit
  // APPARAÎTRE/DISPARAÎTRE : un patch en place ne suffit pas, on refait la liste.
  if (irlFilters && irlFilters.has("joined")) { renderIRL(); return; }
  const ev = _findCanonicalEvent(id) || allEvents().find(e => e.id === id);
  const card = document.querySelector('#eventList .event-card[data-evid="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
  if (!ev || !card) { renderIRL(); return; }
  const atts = ev.attendees || [];
  const maybeCount = (ev.maybes || []).length;
  const myState = myRsvp(id);
  const full = _eventIsFull(ev);
  const footer = card.querySelector(".event-footer");
  if (!footer) { renderIRL(); return; }
  footer.innerHTML = `<div class="attendees">${atts.slice(0, 4).map(aid => {
      const u = userById(aid) || { avatar: "#64748b", profileEmoji: "?" };
      return `<div class="avatar sm" style="background:${avatarBg(u)};cursor:pointer;" onclick="event.stopPropagation();openUserProfile('${escapeJsArg(aid)}')">${avatarInner(u)}</div>`;
    }).join("")}<span class="pill" style="margin-left:6px;padding:3px 8px;">${atts.length} inscrit${atts.length > 1 ? "s" : ""}${maybeCount ? " · " + maybeCount + " 🤔" : ""}</span></div>
    <button class="btn small ${myState ? "ghost" : "primary"}" onclick="event.stopPropagation();openEventRsvpSheet('${escapeJsArg(id)}')">${myState ? RSVP_LABELS[myState].short : full ? "⏳ Liste d'attente" : "+ Rejoindre"}</button>`;
}

// Le <select> à 10 options a été remplacé par le curseur `#irlDistanceRange`
// (2026-07-22) ; la fonction reste le point d'entrée « relire l'UI et filtrer ».
function filterIrlByDistance() {
  const range = document.getElementById("irlDistanceRange");
  if (range) {
    irlDistanceFilter = IRL_DISTANCE_STEPS[parseInt(range.value, 10) || 0] || "";
  } else {
    const legacy = document.getElementById("irlDistanceFilter");
    irlDistanceFilter = (legacy && legacy.value) ? legacy.value : "";
  }
  _syncIrlDistanceUI();
  renderIRL();
}

// La plage horaire se règle DANS le volet « Horaire » (2026-07-22) : la modale
// qui s'ouvrait par-dessus la feuille de filtres imposait deux manipulations
// (ouvrir l'onglet, puis ouvrir la modale) là où le calendrier et le curseur de
// distance sont immédiats. Point d'entrée conservé : il sélectionne l'onglet.
function openIrlTimePicker() {
  setIrlFilterTab("time");
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

  // Plus de bouton « Appliquer » : le filtre suit le réglage, comme le
  // calendrier et le curseur de distance.
  applyIrlTimeRange(true);
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

function applyIrlTimeRange(silent) {
  // Lire depuis les NOUVEAUX selects
  const startSelect = document.getElementById("irlStartHour");
  const endSelect = document.getElementById("irlEndHour");

  if (!startSelect || !endSelect) {
    if (!silent) toast("❌ Erreur: sélects non trouvés");
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

  if (!silent) toast("✓ Filtre appliqué: " + irlTimeFilter);

  // Recharger les événements filtrés
  renderIRL();
  _syncIrlTimeUI();
}

// 🔧 FIX AUDIT 2026-06-10 : bouton "Effacer" du filtre horaire IRL
// (référencé par onclick mais jamais défini → ReferenceError, le modal
// ne se fermait même pas).
function clearIrlTimeFilter() {
  irlTimeFilter = "";
  const btn = document.getElementById("irlTimeFilterBtn");
  if (btn) btn.textContent = "🕐 Heure";
  renderIRL();
  _syncIrlTimeUI();
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
  // Ajouter à l'historique pour que le bouton back fonctionne. ⚠️ PAS lors d'un
  // simple re-rendu de la fiche déjà ouverte (_refreshEventDetailIfOpen), sinon
  // chaque changement de RSVP empilait une entrée d'historique et il fallait
  // taper « retour » dix fois pour sortir.
  const _isRerender = window._openEventDetailId === id
    && (document.getElementById("eventDetailPage") || {}).style
    && document.getElementById("eventDetailPage").style.display !== "none";
  if (!_isRerender) pushOverlayToHistory("event", id);

  const ev = allEvents().find(e => e.id === id);
  if (!ev) return;
  window._openEventDetailId = id; // pour le refresh realtime des commentaires
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

  // Trombinoscope réutilisable (venants / peut-être / liste d'attente). Une pastille
  // ✅ marque ceux qui ont pointé leur arrivée.
  const _faces = (list, max) => (list || []).slice(0, max || 12).map(aid => {
    const u = userById(aid) || { name: aid === "me" ? (currentProfile()?.name || "Moi") : "Participant", avatar: "#8b5cf6", profileEmoji: "✨" };
    const firstName = (u.name || "?").split(" ")[0];
    const here = (ev.checkedIn || []).indexOf(aid) > -1;
    return `<div class="event-detail-participant" style="cursor:pointer;" onclick="openUserProfile('${escapeJsArg(aid)}')">
      <div class="avatar sm" style="background:${avatarBg(u)};position:relative;">${avatarInner(u)}${here ? '<span class="ev-here-dot" title="Sur place">✅</span>' : ""}</div>
      <div class="event-detail-participant-name">${escapeHtml(firstName)}</div>
    </div>`;
  }).join("") + ((list || []).length > (max || 12) ? `<div class="event-detail-participant"><span style="font-size:12px;color:var(--muted);">+${(list || []).length - (max || 12)} autres</span></div>` : "");
  const participantsHtml = _faces(atts, 12);

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

  const cancelled = _eventIsCancelled(ev);
  const over = _eventIsOver(ev);
  const live = _eventIsLive(ev);
  const mine = _isMyEvent(ev);

  document.getElementById("eventDetailContent").innerHTML = `
    ${cancelled ? '<div class="event-detail-urgency cancelled">🚫 Cet événement a été annulé par l\'organisateur</div>'
      : live ? '<div class="event-detail-urgency live">🟣 C\'est maintenant — bon moment !</div>'
      : over ? '<div class="event-detail-urgency past">🕰 Événement terminé</div>'
      : `<div class="event-detail-urgency ${urgencyClass}">${urgencyText}</div>`}

    <div style="display:flex;gap:8px;margin:10px 0;flex-wrap:wrap;">
      ${over ? "" : `<button class="btn ghost block" onclick="downloadEventIcs('${escapeJsArg(ev.id)}')" style="font-size:12px;">📅 Ajouter au calendrier</button>`}
      <button class="btn ghost block" onclick="shareEvent('${escapeJsArg(ev.id)}')" style="font-size:12px;">${shareIconSvg(14)} Partager</button>
      ${over ? "" : `<button class="btn ghost block" onclick="openEventInvite('${escapeJsArg(ev.id)}')" style="font-size:12px;">💌 Inviter</button>`}
      ${mine ? `<button class="btn ghost block" onclick="openEventManage('${escapeJsArg(ev.id)}')" style="font-size:12px;">⚙️ Gérer</button>` : ""}
    </div>
    ${_eventSocialProofHtml(ev)}

    <!-- Discussion de groupe : le vrai moteur de participation (Meetup / FB Events). -->
    ${cancelled ? "" : `
      <button class="btn ghost block" style="font-size:12px;margin-bottom:8px;" onclick="openEventChat('${escapeJsArg(ev.id)}')">
        💬 Discussion des participants${myRsvp(ev.id) || mine ? "" : " · réservée aux inscrits"}
      </button>`}

    <!-- Check-in : récompense la présence RÉELLE, pas un clic. Deux chemins —
         la position GPS, ou le QR/code affiché à l'accueil par l'organisateur. -->
    ${_canCheckIn(ev) ? `
      <button class="btn ${_hasCheckedIn(ev) ? "ghost" : "primary"} block" style="font-size:12px;margin-bottom:8px;"
        ${_hasCheckedIn(ev) ? "disabled" : ""} onclick="checkInEvent('${escapeJsArg(ev.id)}')">
        ${_hasCheckedIn(ev) ? "✅ Arrivée confirmée" : "📍 Je suis sur place · +25 pts"}
      </button>
      ${_hasCheckedIn(ev) ? "" : `<button class="btn ghost block" style="font-size:12px;margin-bottom:8px;" onclick="openCheckinCodeEntry('${escapeJsArg(ev.id)}')">📲 J'ai un code d'accueil</button>`}` : ""}

    <!-- Côté organisateur : le QR à montrer à l'entrée. Disponible dès le jour J
         (et pas seulement pendant la fenêtre de pointage) pour préparer l'accueil. -->
    ${_canManageEvent(ev) && !over && !cancelled ? `
      <button class="btn ghost block" style="font-size:12px;margin-bottom:8px;" onclick="openEventCheckinQr('${escapeJsArg(ev.id)}')">
        📲 QR d'accueil des participants
      </button>` : ""}

    <!-- Retour d'expérience : invite à noter (ou rappel de ma note) une fois
         l'événement terminé, + la moyenne publique dès qu'il y a des avis. -->
    ${_eventFeedbackPromptHtml(ev)}
    <div data-evrating="${escapeHtml(ev.id)}">${_eventRatingSummaryHtml(ev)}</div>

    ${ev.recurrence && ev.recurrence !== "none" ? `<div class="event-detail-recurrence">🔁 Événement récurrent — ${escapeHtml(RECURRENCE_LABELS[ev.recurrence] || ev.recurrence)}</div>` : ""}

    ${over && !cancelled ? `
      <div class="event-recap-cta">
        <div class="event-recap-title">📸 Tu y étais ?</div>
        <div class="event-recap-text">Partage tes photos et ton ressenti — ça fait vivre l'événement après coup.</div>
        <button class="btn primary block" style="margin-top:8px;font-size:12px;" onclick="shareEventExperience('${escapeJsArg(ev.id)}')">Partager mon expérience</button>
      </div>` : ""}

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

    ${(ev.maybes || []).length ? `
      <div class="event-detail-section-title">🤔 Peut-être (${ev.maybes.length})</div>
      <div class="event-detail-participants">${_faces(ev.maybes, 8)}</div>` : ""}

    ${(ev.waitlist || []).length ? `
      <div class="event-detail-section-title">⏳ Liste d'attente (${ev.waitlist.length})</div>
      <div class="event-detail-participants">${_faces(ev.waitlist, 8)}</div>
      ${mine ? `<div style="font-size:11px;color:var(--muted);margin-top:4px;">Ils seront inscrits automatiquement dès qu'une place se libère.</div>` : ""}` : ""}

    ${(ev.coOrganizers || []).length ? `
      <div class="event-detail-section-title">🤝 Co-organisateurs</div>
      <div class="event-detail-participants">${_faces(ev.coOrganizers, 8)}</div>` : ""}

    <!-- Album de l'événement : les publications faites après coup. -->
    <div class="event-detail-section-title">📸 Album de l'événement</div>
    <div id="eventAlbum" class="event-album"><div class="event-album-empty">Chargement…</div></div>

    <!-- Barre d'engagement : la fiche n'avait NI like NI réaction emoji (alors que
         la carte de la liste, elle, les a) — on pouvait seulement commenter. Mêmes
         handlers que la carte, donc mêmes compteurs et même règle « 1 réaction par
         personne ». -->
    <div class="post-actions" style="margin-top:18px;">
      <span class="post-action ${(state.user.likedEvents || []).indexOf(ev.id) > -1 ? "liked" : ""}" data-evlike="${ev.id}" onclick="event.stopPropagation();toggleEventLike('${escapeJsArg(ev.id)}', this)">${(state.user.likedEvents || []).indexOf(ev.id) > -1 ? "❤️" : "🤍"} ${((window._eventLikes || {})[ev.id] || {}).likes || 0}</span>
      <span class="post-action" onclick="return showEmojiPickerForEvent('${escapeJsArg(ev.id)}', event);" title="Réagir">😊</span>
      <span class="post-action" onclick="event.stopPropagation();shareEvent('${escapeJsArg(ev.id)}')" title="Partager" aria-label="Partager">${shareIconSvg(18)}</span>
      <span class="event-react-chip-holder" data-evchipholder="${ev.id}" style="margin-left:auto;">${_evReactChipHtml(ev.id)}</span>
    </div>

    <div class="event-detail-section-title">💬 Commentaires</div>
    <div id="eventCommentsList" style="display:flex;flex-direction:column;gap:10px;margin-bottom:10px;">
      <div style="font-size:12px;color:var(--muted);">Chargement…</div>
    </div>
    <div style="display:flex;gap:6px;align-items:center;">
      <input type="text" class="input" id="eventCommentInput" placeholder="Écris un commentaire…" maxlength="500" style="flex:1;font-size:13px;padding:10px 12px;" onkeypress="if(event.key==='Enter')addEventComment('${ev.id}')"/>
      ${_cmtComposerToolsHtml("eventCommentInput", "addEventComment", ev.id)}
      <button class="btn primary" onclick="addEventComment('${ev.id}')" style="font-size:13px;padding:10px 14px;">Envoyer</button>
    </div>

    ${mine ? "" : `<button class="btn ghost block" style="margin-top:18px;font-size:12px;color:var(--muted);" onclick="reportEvent('${escapeJsArg(ev.id)}')">⚠️ Signaler cet événement</button>`}
  `;

  _loadEventComments(ev.id);
  _loadEventAlbum(ev.id);
  // Moyenne des notes : seulement pour un événement terminé (avant, il n'y a rien
  // à noter — autant s'épargner la requête sur le chemin chaud).
  if (over) _loadEventRatings(ev.id);
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
  if (_eventIsCancelled(ev)) {
    cta.innerHTML = `<button class="btn ghost block" disabled>🚫 Événement annulé</button>`;
    return;
  }
  if (_eventIsOver(ev)) {
    cta.innerHTML = `<button class="btn primary block" onclick="shareEventExperience('${escapeJsArg(ev.id)}')">📸 Partager mon expérience</button>`;
    return;
  }
  const spotsLeft = ev.maxAttendees ? ev.maxAttendees - (ev.attendees || []).length : null;
  const isFull = spotsLeft !== null && spotsLeft <= 0 && !joined;
  cta.innerHTML = `
    <button class="btn ${joined ? "ghost" : "primary"} block" ${isFull ? "disabled" : ""} onclick="toggleJoinEventDetail('${escapeJsArg(ev.id)}')">
      ${joined ? "✓ Inscrit — Se désinscrire" : isFull ? "⚠️ Complet" : "+ Rejoindre · +25 pts · +5 💎"}
    </button>
  `;
}

// Récap d'après-événement : ouvre le Studio pré-rempli avec le contexte de
// l'événement. C'est le chaînon manquant entre « je participe » et « je partage
// mon contenu » — le cœur de la promesse PASSIO. Le post publié sera rattaché à
// l'événement (window._pendingEventPost, lu par publishPost) et remontera dans
// son album.
function shareEventExperience(id) {
  const ev = _findCanonicalEvent(id) || allEvents().find(e => e.id === id);
  if (!ev) return;
  closeEventDetail();
  window._pendingEventPost = id;
  const d = fmtEventDate(ev.date);
  const prefill = `📍 ${ev.title}${ev.city ? " · " + ev.city : ""} (${d.day} ${d.month})\n\n`;
  goTo("studio");
  setTimeout(() => {
    const ta = document.getElementById("postText") || document.querySelector("#screen-studio textarea");
    if (ta) { ta.value = prefill; ta.focus(); ta.dispatchEvent(new Event("input", { bubbles: true })); }
    const sel = document.getElementById("postPassion");
    if (sel && ev.passion) { try { sel.value = ev.passion; } catch (e) {} }
    toast("📸 Ajoute tes photos et raconte !");
  }, 250);
}

// ===== Album de l'événement =====
// Les posts publiés via « Partager mon expérience » (colonne posts.event_id),
// fusionnés avec mes posts locaux pas encore synchronisés.
async function _loadEventAlbum(eventId) {
  const box = document.getElementById("eventAlbum");
  if (!box) return;
  let items = (state.userPosts || []).filter(p => p.eventId === eventId).map(p => ({
    id: p.id, image: p.image || null, text: p.text || "", authorName: p.authorName || "Moi",
  }));
  if (window._supaReal && typeof supaLoadEventPosts === "function") {
    try {
      const remote = await supaLoadEventPosts(eventId);
      const seen = new Set(items.map(i => i.id));
      (remote || []).forEach(r => { if (!seen.has(r.id)) items.push(r); });
    } catch (e) {}
  }
  // La fiche a pu être fermée ou changée pendant la requête.
  if (window._openEventDetailId !== eventId) return;
  const box2 = document.getElementById("eventAlbum");
  if (!box2) return;
  if (!items.length) {
    box2.innerHTML = '<div class="event-album-empty">Aucune photo pour l\'instant — sois le premier à partager ton expérience.</div>';
    return;
  }
  box2.innerHTML = items.slice(0, 12).map(p => p.image
    ? `<div class="event-album-cell" onclick="openPost('${escapeJsArg(p.id)}')">
         <img loading="lazy" decoding="async" src="${safeUrlAttr(p.image)}" alt=""/>
       </div>`
    : `<div class="event-album-cell is-text" onclick="openPost('${escapeJsArg(p.id)}')">
         <span>${escapeHtml((p.text || "").slice(0, 60))}</span>
       </div>`
  ).join("");
}

// ===== Événements récurrents =====
// Les occurrences sont de VRAIS événements partageant un `seriesId` : chacune a
// ses inscrits, ses commentaires et sa discussion, et tout le reste de l'app
// (filtres, carte, rappels) fonctionne sans cas particulier.
const RECURRENCE_LABELS = {
  none: "Une seule fois", weekly: "Chaque semaine",
  biweekly: "Une semaine sur deux", monthly: "Chaque mois",
};
const RECURRENCE_STEP_DAYS = { weekly: 7, biweekly: 14, monthly: 0 /* mois calendaire */ };
const RECURRENCE_MAX_OCCURRENCES = 12;

function _recurrenceDates(startTs, rule, count) {
  const out = [];
  if (!rule || rule === "none") return out;
  for (let i = 1; i < Math.min(count || RECURRENCE_MAX_OCCURRENCES, RECURRENCE_MAX_OCCURRENCES); i++) {
    if (rule === "monthly") {
      const d = new Date(startTs);
      d.setMonth(d.getMonth() + i);
      out.push(d.getTime());
    } else {
      out.push(startTs + i * (RECURRENCE_STEP_DAYS[rule] || 7) * 86400000);
    }
  }
  return out;
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
  window._openEventDetailId = null;
}

// Cadence de rappels des événements rejoints — J-7 / J-1 / H-2 (2026-07-21).
// Avant : UN seul rappel à J-1. Or les trois paliers ne servent pas la même chose,
// c'est la cadence standard d'Eventbrite/Luma : J-7 laisse le temps de s'organiser
// (ou de se désinscrire, ce qui libère une place), J-1 est le rappel classique, et
// H-2 est celui qui fait effectivement VENIR (« pars maintenant »).
// Chaque palier est notifié UNE fois : la dédup porte sur `<eventId>:<palier>` et
// non plus sur l'id seul, sinon le premier palier atteint bloquerait les suivants.
var EVENT_REMINDER_TIERS = [
  { key: "d7", ms: 7 * 86400000, label: "dans une semaine" },
  { key: "d1", ms: 24 * 3600000, label: "demain" },
  { key: "h2", ms: 2 * 3600000,  label: "dans 2 h" },
];

function _checkEventReminders() {
  try {
    var reminded = JSON.parse(localStorage.getItem("passio_event_reminded") || "[]");
    var now = Date.now();
    var joined = (state.user && state.user.joinedEvents) || [];
    if (!joined.length) return;
    var events = allEvents();

    events.forEach(function (e) {
      if (joined.indexOf(e.id) === -1) return;
      if (_eventIsCancelled(e)) return;          // ne pas rappeler un événement annulé
      var diff = e.date - now;
      if (diff <= 0) return;

      // Le palier le PLUS PROCHE encore devant nous : à J-3 on veut « demain »
      // quand il arrivera, pas re-tirer le J-7 qu'on a manqué.
      var tier = null;
      for (var i = 0; i < EVENT_REMINDER_TIERS.length; i++) {
        if (diff <= EVENT_REMINDER_TIERS[i].ms) tier = EVENT_REMINDER_TIERS[i];
      }
      if (!tier) return;

      var mark = e.id + ":" + tier.key;
      if (reminded.indexOf(mark) > -1) return;

      var d = fmtEventDate(e.date);
      // À moins de 24 h, « demain » devient faux passé minuit : on recale.
      var when = tier.key === "d1"
        ? (diff <= 12 * 3600000 ? "aujourd'hui" : "demain")
        : tier.label;
      if (typeof pushNotification === "function") {
        pushNotification("⏰ Rappel : <b>" + escapeHtml(e.title) + "</b> " + when
          + " à " + (e.time || d.time || "")
          + (e.city ? " · " + escapeHtml(e.city) : ""), "⏰");
      }
      reminded.push(mark);
    });

    // Purge les marques dont l'événement est passé depuis plus de 7 jours (ou a
    // disparu) pour ne pas faire gonfler le cache indéfiniment.
    reminded = reminded.filter(function (mark) {
      var id = String(mark).split(":")[0];
      var ev = events.find(function (x) { return x.id === id; });
      return ev && ev.date > now - 7 * 86400000;
    });
    localStorage.setItem("passio_event_reminded", JSON.stringify(reminded));
  } catch (e) {}
}

// ════════════════════════════════════════════════════════════════════════
// DIGEST HEBDOMADAIRE « ça se passe près de toi »
// ════════════════════════════════════════════════════════════════════════
// Le principal moteur de retour dans l'app (Nextdoor, Strava). Calculé côté
// client au boot — pas de cron serveur nécessaire — et envoyé UNE fois par
// semaine ISO (dédup localStorage). Notification système en plus si la
// permission a déjà été accordée (jamais de prompt intempestif ici).
const IRL_DIGEST_KEY = "passio_irl_digest_week";
const IRL_DIGEST_RADIUS_KM = 60;

function _isoWeekKey(d) {
  const t = new Date(d || Date.now());
  t.setHours(0, 0, 0, 0);
  // Jeudi de la semaine courante → année ISO fiable.
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const week1 = new Date(t.getFullYear(), 0, 4);
  const week = 1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return t.getFullYear() + "-W" + String(week).padStart(2, "0");
}

function _irlWeeklyDigest() {
  try {
    const wk = _isoWeekKey();
    if (localStorage.getItem(IRL_DIGEST_KEY) === wk) return;

    const now = Date.now();
    const ref = _irlReferenceLoc();
    const myPassions = new Set((state.user.profiles || []).map(p => p.passion).filter(Boolean));
    const soon = allEvents().filter(e => {
      if (_eventIsCancelled(e) || _eventEndAt(e) <= now || e.date > now + 7 * 86400000) return false;
      if ((state.user.joinedEvents || []).includes(e.id)) return false; // déjà inscrit
      const d = _eventDistanceKm(e, ref);
      return d == null || d <= IRL_DIGEST_RADIUS_KM;
    });
    if (!soon.length) return;

    // Les passions de l'utilisateur d'abord, puis les plus courus.
    soon.sort((a, b) => {
      const pa = myPassions.has(a.passion) ? 0 : 1, pb = myPassions.has(b.passion) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (b.attendees || []).length - (a.attendees || []).length;
    });

    localStorage.setItem(IRL_DIGEST_KEY, wk);
    const top = soon[0];
    const city = irlSelectedCity ? irlSelectedCity.name
      : (irlUserLocation ? getClosestCity(irlUserLocation.lat, irlUserLocation.lng) : "près de toi");
    const text = `📍 <b>${soon.length} événement${soon.length > 1 ? "s" : ""}</b> cette semaine ${escapeHtml(city === "près de toi" ? city : "à " + city)} — à commencer par <b>${escapeHtml(top.title || "")}</b>`;
    if (typeof pushNotification === "function") pushNotification(text, "📍");

    // Notification système : uniquement si l'utilisateur l'a DÉJÀ acceptée.
    if (typeof Notification !== "undefined" && Notification.permission === "granted"
        && navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification("PASSIO — ça bouge près de toi", {
          body: `${soon.length} événement${soon.length > 1 ? "s" : ""} cette semaine · ${top.title || ""}`,
          icon: "./icons/icon-192.png", tag: "irl-digest", data: { url: "./#irl-event-" + top.id },
        });
      }).catch(() => {});
    }
  } catch (e) {}
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

// ⚠️ Le lien « #irl-event-<id> » n'était lu par PERSONNE : partager un événement
// donnait un lien qui ouvrait bêtement l'accueil. On l'ouvre désormais au boot et
// à chaque changement de hash. (Corrigé le 2026-07-21.)
function _openIrlEventFromHash() {
  const m = /#irl-event-([\w-]+)/.exec(location.hash || "");
  if (!m) return false;
  const id = m[1];
  const open = () => {
    if (typeof goTo === "function") goTo("irl");
    if (typeof openEventDetails === "function") openEventDetails(id);
  };
  // L'événement peut n'arriver qu'avec le chargement Supabase : on retente.
  if (allEvents().some(e => e.id === id)) { open(); return true; }
  let tries = 0;
  const t = setInterval(() => {
    if (allEvents().some(e => e.id === id)) { clearInterval(t); open(); }
    else if (++tries > 12) { clearInterval(t); toast("Événement introuvable ou supprimé"); }
  }, 700);
  return true;
}
window.addEventListener("hashchange", _openIrlEventFromHash);
(function _irlDeepLinkBoot() {
  if (!/#irl-event-/.test(location.hash || "")) return;
  // Après le gate + le boot (les événements Supabase arrivent en différé).
  setTimeout(_openIrlEventFromHash, 1200);
})();

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

// ════════════════════════════════════════════════════════════════════════
// COMMENTAIRES D'ÉVÉNEMENTS IRL (cross-compte via table event_comments).
// Cache mémoire par événement pour un rendu optimiste sans flash de chargement.
// ════════════════════════════════════════════════════════════════════════
// ⚠️ UNE seule référence : le MÊME objet que window._eventCommentsCache (lu par
// _findCommentThread app-04, les previews de cartes et la démo). Avant, cette var
// était un objet DISTINCT de window.* : les previews bulk chargées dans window
// restaient invisibles pour _renderEventComments (qui lit la var), et
// addEventComment réassignait window = var en JETANT les previews des autres
// événements.
var _eventCommentsCache = (window._eventCommentsCache = window._eventCommentsCache || {});
var EVENT_COMMENTS_LS_KEY = "passio_event_comments_v1";

// Cache localStorage best-effort (échec quota toléré) : les commentaires
// d'événements ne vivaient qu'en RAM → cartes vides au reload jusqu'à la réponse
// serveur, rien hors-ligne (P1 du rapport 2026-07-02). Le serveur reste la source
// de vérité (_setEventComments écrase au chargement) ; les commentaires de démo
// (_demo) sont exclus pour que les événements seed restent re-seedés.
function _persistEventComments() {
  clearTimeout(window._evCmtPersistT);
  window._evCmtPersistT = setTimeout(function () {
    try {
      var out = {};
      Object.keys(_eventCommentsCache).forEach(function (id) {
        var arr = (_eventCommentsCache[id] || []).filter(function (c) { return c && !c._demo; }).slice(-30);
        if (arr.length) out[id] = arr;
      });
      localStorage.setItem(EVENT_COMMENTS_LS_KEY, JSON.stringify({ comments: out, counts: window._eventCommentCounts || {} }));
    } catch (e) {}
  }, 400);
}
(function _hydrateEventCommentsFromLS() {
  try {
    var data = JSON.parse(localStorage.getItem(EVENT_COMMENTS_LS_KEY) || "null");
    if (!data) return;
    Object.keys(data.comments || {}).forEach(function (id) {
      if (!(_eventCommentsCache[id] || []).length)
        _eventCommentsCache[id] = (data.comments[id] || []).map(_normalizeThreadComment);
    });
    window._eventCommentCounts = window._eventCommentCounts || {};
    Object.keys(data.counts || {}).forEach(function (id) {
      if (window._eventCommentCounts[id] == null) window._eventCommentCounts[id] = data.counts[id];
    });
  } catch (e) {}
})();

// Applique la liste serveur EN PLACE (les références déjà distribuées — le
// thread.comments de _findCommentThread — restent valides), en conservant les
// commentaires optimistes locaux (ec_local_) pas encore renvoyés, puis persiste.
function _setEventComments(eventId, serverList) {
  var arr = _eventCommentsCache[eventId] = _eventCommentsCache[eventId] || [];
  var localOnly = arr.filter(function (lc) {
    return String(lc.id).indexOf("ec_local_") === 0
      && !(serverList || []).some(function (s) { return s.text === lc.text && Math.abs((s.at || 0) - (lc.at || 0)) < 60000; });
  });
  var merged = (serverList || []).concat(localOnly).map(_normalizeThreadComment);
  arr.length = 0;
  Array.prototype.push.apply(arr, merged);
  _persistEventComments();
  return arr;
}

async function _loadEventComments(eventId) {
  // Cible : la page détail (#eventCommentsList) OU la feuille inline ouverte depuis
  // une carte (#cmtThreadList). Sans ce 2ᵉ cas, commenter un événement depuis sa
  // carte n'affichait jamais les commentaires distants (early-return → "Chargement…").
  var sheet = document.getElementById("cmtThreadList");
  var box = (sheet && sheet.getAttribute("data-thread") === eventId)
    ? sheet
    : document.getElementById("eventCommentsList");
  if (!box) return;
  var list = [];
  if (typeof supaLoadEventComments === "function" && window._supaReal) {
    try { list = await supaLoadEventComments(eventId); } catch (e) {}
  }
  // Vérité serveur appliquée EN PLACE + optimistes locaux conservés + persistance.
  _setEventComments(eventId, list);
  _renderEventComments(eventId);
  // Interactions cross-compte (likes + réponses + emojis) via comment_interactions :
  // hydrate puis re-render avec le renderer riche unifié.
  if (typeof hydrateCommentInteractions === "function") {
    hydrateCommentInteractions({ comments: _eventCommentsCache[eventId] }).then(function(){ _persistEventComments(); _renderEventComments(eventId); });
  }
}

// Aligne un commentaire IRL/CDV (author/at) sur la forme « post » attendue par le
// renderer unifié _renderCommentsList (authorName/createdAt + champs d'interaction).
function _normalizeThreadComment(c) {
  if (!c) return c;
  if (!c.authorName && c.author) c.authorName = c.author;
  if (c.createdAt == null && c.at != null) c.createdAt = c.at;
  if (c.at == null && c.createdAt != null) c.at = c.createdAt;
  if (!Array.isArray(c.replies)) c.replies = [];
  if (c.likes == null) c.likes = 0;
  if (!Array.isArray(c.likedBy)) c.likedBy = [];
  return c;
}

function setEventCommentSort(mode) {
  window._eventCommentSort = mode;
  var id = window._openEventDetailId;
  if (id) _renderEventComments(id);
}

function _renderEventComments(eventId) {
  // La feuille inline (#cmtThreadList) est prioritaire quand elle est ouverte : la
  // page détail (#eventDetailPage) reste dans le DOM en display:none après
  // fermeture, donc #eventCommentsList existe encore mais est caché → écrire
  // dedans plutôt que dans la feuille au 1er plan serait invisible.
  var sheet = document.getElementById("cmtThreadList");
  var box = (sheet && sheet.getAttribute("data-thread") === eventId)
    ? sheet
    : document.getElementById("eventCommentsList");
  if (!box) return;
  var list = (_eventCommentsCache[eventId] || []).map(_normalizeThreadComment);
  if (!list.length) {
    box.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:4px 0;">Aucun commentaire — lance la conversation !</div>';
    return;
  }
  var sortMode = window._eventCommentSort || "recent";
  var sorted = sortComments(list, sortMode);
  var bar = list.length > 1 ? commentSortBarHtml(sortMode, "setEventCommentSort") : "";
  // Renderer unifié : like / répondre / emoji / GIF / menu ⋯, comme le fil.
  box.innerHTML = bar + _renderCommentsList(sorted, eventId);
}

async function addEventComment(eventId) {
  // Feuille inline prioritaire (cf. _renderEventComments) : #eventCommentInput de la
  // page détail reste dans le DOM (caché) après fermeture et serait lu à tort.
  var inp = document.getElementById("cmtThreadInput") || document.getElementById("eventCommentInput");
  if (!inp) return;
  var text = inp.value.trim();
  if (!text) return;
  inp.value = "";
  var ev = allEvents().find(function (e) { return e.id === eventId; });
  var name = (state.user.general && state.user.general.username) || state.user.name || "Moi";
  var myId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  var optimistic = _normalizeThreadComment({ id: "ec_local_" + Date.now(), authorId: myId, author: name, authorName: name, text: text, at: Date.now(), createdAt: Date.now() });
  (_eventCommentsCache[eventId] = _eventCommentsCache[eventId] || []).push(optimistic);
  _persistEventComments();
  _renderEventComments(eventId);
  // Met à jour le compteur 💬 de la carte (optimiste) sans attendre un re-render.
  try {
    window._eventCommentCounts = window._eventCommentCounts || {};
    window._eventCommentCounts[eventId] = (window._eventCommentCounts[eventId] || 0) + 1;
    var _badge = document.querySelector('[data-evc="' + eventId + '"]');
    if (_badge) _badge.textContent = "💬 " + _eventCmtBadge(eventId);
  } catch (e) {}
  // Rafraîchit l'aperçu inline des commentaires sur la carte de l'événement.
  if (typeof _patchEventCommentsInline === "function") { try { _patchEventCommentsInline(eventId); } catch(e) {} }
  if (typeof grantReward === "function") { try { grantReward("comment"); } catch (e) {} }
  if (typeof supaAddEventComment === "function" && window._supaReal) {
    try {
      var realId = await supaAddEventComment(eventId, text);
      if (realId) { optimistic.id = realId; _persistEventComments(); }
      // Notifier l'organisateur (interaction cross-compte sur SON événement).
      if (ev && ev.organizerId && ev.organizerId !== myId && typeof supaInsertNotif === "function") {
        supaInsertNotif(ev.organizerId, "event_comment", eventId, "a commenté ton événement");
      }
    } catch (e) {}
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

function openCreateEvent(editId) {
  const ed = editId ? _findCanonicalEvent(editId) : null;
  if (editId && !ed) { toast("Événement introuvable"); return; }
  window._evPickedCoords = ed && ed.lat ? { lat: ed.lat, lng: ed.lng } : null;

  // Toutes les passions sont proposées (les miennes en tête) : restreindre le
  // choix aux profils créés empêchait d'organiser un événement « photo » quand on
  // n'avait qu'un profil « musique ».
  const myPassionIds = (state.user.profiles || []).map(pr => pr.passion).filter(Boolean);
  const sortedPassions = allPassions().slice().sort((a, b) =>
    (myPassionIds.includes(a.id) ? 0 : 1) - (myPassionIds.includes(b.id) ? 0 : 1));
  const selPassion = ed ? ed.passion : "";
  const passionOptions = sortedPassions
    .map(p => `<option value="${escapeHtml(p.id)}"${p.id === selPassion ? " selected" : ""}>${p.emoji} ${escapeHtml(p.label)}${myPassionIds.includes(p.id) ? " ✦" : ""}</option>`).join("");

  const eventTypes = ["Atelier", "Jam session", "Concert", "Exposition", "Sport & activité", "Randonnée", "Dégustation", "Book club", "Cours", "Marché", "Soirée", "Rencontre", "Conférence", "Compétition", "Autre"];
  const typeOptions = eventTypes.map(t => `<option value="${t}"${ed && ed.eventType === t ? " selected" : ""}>${t}</option>`).join("");
  const v = (x, d) => escapeHtml(String(ed && ed[x] != null && ed[x] !== "" ? ed[x] : (d == null ? "" : d)));
  // Date pré-remplie DANS le markup (et non via un setTimeout après ouverture) :
  // le champ était vide pendant les premières millisecondes et une soumission
  // rapide échouait sur « Choisis une date ».
  const _localDay = (ts) => new Date(ts - new Date(ts).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const dateValue = ed ? _localDay(ed.date) : _localDay(Date.now() + 7 * 86400000);

  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">${editId ? "✏️ Modifier l'événement" : "✨ Créer un événement IRL"}</div>
    <div class="modal-subtitle">${editId ? "Les inscrits seront prévenus de tes changements." : "Rejoins ou crée des moments réels avec ta communauté. +30 pts · +5 💎"}</div>

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
      <input type="text" class="input" id="evTitle" placeholder="Ex : Jam session guitare débutants" maxlength="80" value="${v("title")}"/>
    </label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <label class="field"><span>Passion *</span>
        <select class="input" id="evPassion">${passionOptions}</select>
      </label>
      <label class="field"><span>Type</span>
        <select class="input" id="evType">${typeOptions}</select>
      </label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
      <label class="field"><span>Date *</span>
        <input type="date" class="input" id="evDate" value="${dateValue}" min="${ed ? "" : _localDay(Date.now())}"/>
      </label>
      <label class="field"><span>Heure</span>
        <input type="time" class="input" id="evTime" value="${v("time", "18:00")}"/>
      </label>
      <label class="field"><span>Durée</span>
        <select class="input" id="evDuration">
          ${[1,2,3,4,6,8,12,24].map(h => `<option value="${h}"${(ed && Math.round((_eventEndAt(ed) - ed.date)/3600000) === h) || (!ed && h === 2) ? " selected" : ""}>${h < 24 ? h + " h" : "Journée"}</option>`).join("")}
        </select>
      </label>
    </div>
    <!-- Récurrence : les clubs (le cœur de cible) se retrouvent chaque semaine ;
         sans ça il fallait recréer l'événement à la main à chaque fois. -->
    ${editId ? "" : `
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
        <label class="field"><span>🔁 Se répète</span>
          <select class="input" id="evRecurrence" onchange="_evSyncRecurrenceUi()">
            ${Object.keys(RECURRENCE_LABELS).map(k => `<option value="${k}">${RECURRENCE_LABELS[k]}</option>`).join("")}
          </select>
        </label>
        <label class="field" id="evOccWrap" style="display:none;"><span>Occurrences</span>
          <input type="number" class="input" id="evOccurrences" min="2" max="${RECURRENCE_MAX_OCCURRENCES}" value="6"/>
        </label>
      </div>`}

    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:var(--accent);margin:14px 0 8px;">📍 Lieu</div>
    <!-- Autocomplétion : sans elle, la ville était saisie à la main puis
         géocodée « au mieux » — un lieu mal orthographié n'apparaissait jamais
         sur la carte, et l'événement devenait invisible en filtre distance. -->
    <label class="field"><span>Chercher le lieu ou l'adresse</span>
      <input type="text" class="input" id="evPlaceSearch" autocomplete="off" placeholder="Tape une adresse, un bar, une salle…" oninput="_evPlaceSuggest(this.value)"/>
    </label>
    <div id="evPlaceSuggestions" class="irl-suggest" style="display:none;"></div>
    <div id="evPlacePicked" style="display:${ed && ed.lat ? "flex" : "none"};align-items:center;gap:6px;font-size:12px;color:#16a34a;font-weight:700;margin:-4px 0 10px;">📍 <span>Position précise enregistrée</span></div>

    <label class="field"><span>Nom du lieu</span>
      <input type="text" class="input" id="evVenue" placeholder="Café du Coin, Parc, Studio…" maxlength="80" value="${v("venue")}"/>
    </label>
    <label class="field"><span>Adresse</span>
      <input type="text" class="input" id="evAddress" placeholder="12 rue de la Paix" maxlength="100" value="${v("address")}"/>
    </label>
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;">
      <label class="field"><span>Code postal</span>
        <input type="text" class="input" id="evPostal" placeholder="75001" maxlength="10" value="${v("postalCode")}"/>
      </label>
      <label class="field"><span>Ville *</span>
        <input type="text" class="input" id="evCity" placeholder="Paris" maxlength="60" value="${v("city")}"/>
      </label>
    </div>

    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:var(--accent);margin:14px 0 8px;">ℹ️ Détails</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <label class="field"><span>Prix en Passia 💎 (0 = gratuit)</span>
        <input type="number" class="input" id="evPrice" placeholder="0" min="0" max="99999" value="${v("price", 0)}"/>
      </label>
      <label class="field"><span>Places max</span>
        <input type="number" class="input" id="evMax" placeholder="Illimité" min="1" max="9999" value="${v("maxAttendees")}"/>
      </label>
    </div>
    <label class="field"><span>Contact (tél ou email)</span>
      <input type="text" class="input" id="evContact" placeholder="06 12 34 56 78" maxlength="80" value="${v("contact")}"/>
    </label>
    <label class="field"><span>Lien (Eventbrite, site…)</span>
      <input type="url" class="input" id="evLink" placeholder="https://…" maxlength="200" value="${v("externalLink")}"/>
    </label>
    <label class="field"><span>Description</span>
      <textarea class="textarea" id="evDesc" placeholder="Programme, ambiance, quoi apporter…" maxlength="800" style="min-height:90px;">${v("desc")}</textarea>
    </label>

    <button class="btn primary block" style="margin-top:8px;" onclick="submitEvent(${editId ? "'" + escapeJsArg(editId) + "'" : ""})">${editId ? "💾 Enregistrer les modifications" : "🎉 Publier · +30 pts"}</button>
  `);

  setTimeout(() => {
    // Couverture existante en édition
    if (ed && ed.coverUrl) {
      const img = document.getElementById("evCoverPreviewImg");
      const ph = document.getElementById("evCoverPreviewPlaceholder");
      const rm = document.getElementById("evCoverRemoveBtn");
      const dt = document.getElementById("evCoverData");
      if (img) { img.src = ed.coverUrl; img.style.display = "block"; }
      if (ph) ph.style.display = "none";
      if (rm) rm.style.display = "block";
      if (dt) dt.value = ed.coverUrl;
    }
  }, 20);
}

// Le nombre d'occurrences n'a de sens que si une répétition est choisie.
function _evSyncRecurrenceUi() {
  const sel = document.getElementById("evRecurrence");
  const wrap = document.getElementById("evOccWrap");
  if (sel && wrap) wrap.style.display = (sel.value && sel.value !== "none") ? "" : "none";
}

// ===== Autocomplétion de lieu du formulaire (Nominatim) =====
// Remplit venue/adresse/CP/ville ET mémorise les coordonnées EXACTES : c'est ce
// qui garantit que le marqueur tombe au bon endroit et que le filtre distance
// fonctionne. Sans « , France » forcé → les événements à l'étranger marchent.
let _evPlaceT;
function _evPlaceSuggest(query) {
  const box = document.getElementById("evPlaceSuggestions");
  if (!box) return;
  clearTimeout(_evPlaceT);
  if (!query || query.trim().length < 3) { box.style.display = "none"; return; }
  _evPlaceT = setTimeout(async () => {
    const results = await passioGeoSuggest(query, 6);
    // La saisie a pu continuer pendant la requête : ne pas écraser un rendu plus récent.
    const cur = document.getElementById("evPlaceSearch");
    if (cur && cur.value.trim() !== query.trim()) return;
    if (!results.length) {
      box.innerHTML = '<div class="irl-suggest-empty">Aucun lieu trouvé</div>';
      box.style.display = "block";
      return;
    }
    window._evSuggestCache = results;
    box.innerHTML = results.map((res, i) =>
      `<button type="button" class="irl-suggest-item" onclick="_evPlacePick(${i})">
        <b>${escapeHtml(res.name || res.label)}</b><span>${escapeHtml([res.postcode, res.city, res.context].filter(Boolean).join(" · ").slice(0, 70))}</span>
      </button>`).join("");
    box.style.display = "block";
  }, 300);
}

function _evPlacePick(i) {
  const res = (window._evSuggestCache || [])[i];
  if (!res) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  const head = res.name || res.label || "";
  // Un POI (bar, salle) donne un nom ; une adresse pure commence par un numéro.
  if (!/^\d/.test(head)) set("evVenue", head);
  set("evAddress", /^\d/.test(head) ? head : "");
  set("evPostal", res.postcode);
  set("evCity", res.city);
  window._evPickedCoords = { lat: res.lat, lng: res.lng };
  const box = document.getElementById("evPlaceSuggestions");
  if (box) box.style.display = "none";
  const ok = document.getElementById("evPlacePicked");
  if (ok) ok.style.display = "flex";
  toast("📍 " + head);
}

// ===== Gestion d'un événement par son organisateur =====
function openEventManage(id) {
  const ev = _findCanonicalEvent(id) || allEvents().find(e => e.id === id);
  if (!ev) return;
  if (!_canManageEvent(ev)) { toast("Seul l'organisateur peut gérer cet événement"); return; }
  const cancelled = _eventIsCancelled(ev);
  const n = (ev.attendees || []).length;
  const seriesCount = ev.seriesId ? allEvents().filter(e => e.seriesId === ev.seriesId).length : 0;
  const checked = (ev.checkedIn || []).length;
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">⚙️ Gérer l'événement</div>
    <div class="modal-subtitle">${escapeHtml(ev.title || "")} · ${n} inscrit${n > 1 ? "s" : ""}${checked ? " · " + checked + " sur place" : ""}</div>
    <button class="btn ghost block" style="margin-top:12px;" onclick="closeModal();openCreateEvent('${escapeJsArg(id)}')">✏️ Modifier les informations</button>
    <button class="btn ghost block" style="margin-top:8px;" onclick="closeModal();_messageEventAttendees('${escapeJsArg(id)}')">📣 Prévenir les inscrits</button>
    <button class="btn ghost block" style="margin-top:8px;" onclick="closeModal();openEventCoOrganizers('${escapeJsArg(id)}')">🤝 Co-organisateurs (${(ev.coOrganizers || []).length})</button>
    ${(ev.waitlist || []).length ? `<button class="btn ghost block" style="margin-top:8px;" onclick="closeModal();openEventWaitlist('${escapeJsArg(id)}')">⏳ Liste d'attente (${ev.waitlist.length})</button>` : ""}
    <button class="btn ghost block" style="margin-top:8px;" onclick="toggleCancelEvent('${escapeJsArg(id)}')">${cancelled ? "↩️ Réactiver l'événement" : "🚫 Annuler l'événement"}</button>
    ${seriesCount > 1 ? `<button class="btn ghost block" style="margin-top:8px;" onclick="cancelEventSeries('${escapeJsArg(id)}')">🔁 Annuler toute la série (${seriesCount} dates)</button>` : ""}
    <button class="btn ghost block" style="margin-top:8px;color:#ef4444;border-color:rgba(239,68,68,.35);" onclick="deleteEventConfirm('${escapeJsArg(id)}')">🗑 Supprimer définitivement</button>
    <button class="btn secondary block" style="margin-top:12px;" onclick="closeModal()">Fermer</button>
  `);
}

// ===== Co-organisateurs =====
// Un événement porté par une seule personne meurt avec elle : on partage les
// droits d'édition (policy « Update organisateurs » côté RLS).
function openEventCoOrganizers(id) {
  const ev = _findCanonicalEvent(id) || allEvents().find(e => e.id === id);
  if (!ev) return;
  const meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  const co = ev.coOrganizers || [];
  // Candidats : les participants (hors moi), c'est là que se trouvent les motivés.
  const candidates = (ev.attendees || []).concat(ev.maybes || [])
    .filter(u => u && u !== meId && u !== "me");
  const row = (uidx) => {
    const u = userById(uidx) || { name: "Participant", avatar: "#8b5cf6", profileEmoji: "✨" };
    const isCo = co.indexOf(uidx) > -1;
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <div class="avatar sm" style="background:${avatarBg(u)};">${avatarInner(u)}</div>
      <span style="flex:1;font-size:13px;">${escapeHtml(u.name || "Participant")}</span>
      <button class="btn small ${isCo ? "ghost" : "primary"}" onclick="toggleEventCoOrganizer('${escapeJsArg(id)}','${escapeJsArg(uidx)}')">${isCo ? "Retirer" : "Ajouter"}</button>
    </div>`;
  };
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">🤝 Co-organisateurs</div>
    <div class="modal-subtitle">Ils pourront modifier l'événement et prévenir les inscrits.</div>
    <div style="margin-top:12px;max-height:320px;overflow-y:auto;">
      ${[...new Set(co.concat(candidates))].map(row).join("")
        || '<div style="font-size:13px;color:var(--muted);padding:12px 0;">Aucun participant à promouvoir pour l\'instant.</div>'}
    </div>
    <button class="btn secondary block" style="margin-top:12px;" onclick="closeModal()">Fermer</button>
  `);
}

async function toggleEventCoOrganizer(id, userId) {
  const ev = _findCanonicalEvent(id);
  if (!ev || !_canManageEvent(ev)) return;
  ev.coOrganizers = ev.coOrganizers || [];
  const isCo = ev.coOrganizers.indexOf(userId) > -1;
  ev.coOrganizers = isCo ? ev.coOrganizers.filter(x => x !== userId) : ev.coOrganizers.concat([userId]);
  saveState();
  if (window._supaReal) await supaUpdateEvent(ev);
  if (!isCo && typeof supaInsertNotif === "function") {
    supaInsertNotif(userId, "event_update", id, "t'a nommé·e co-organisateur·ice");
  }
  toast(isCo ? "Co-organisateur retiré" : "🤝 Co-organisateur ajouté");
  openEventCoOrganizers(id);
}

// ===== Liste d'attente (vue organisateur) =====
function openEventWaitlist(id) {
  const ev = _findCanonicalEvent(id) || allEvents().find(e => e.id === id);
  if (!ev) return;
  const wl = ev.waitlist || [];
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">⏳ Liste d'attente</div>
    <div class="modal-subtitle">Dans l'ordre d'arrivée. Ils sont promus automatiquement dès qu'une place se libère.</div>
    <div style="margin-top:12px;max-height:320px;overflow-y:auto;">
      ${wl.map((u, i) => {
        const p = userById(u) || { name: "Participant", avatar: "#8b5cf6", profileEmoji: "✨" };
        return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
          <span style="font-size:12px;color:var(--muted);width:18px;">${i + 1}</span>
          <div class="avatar sm" style="background:${avatarBg(p)};">${avatarInner(p)}</div>
          <span style="flex:1;font-size:13px;">${escapeHtml(p.name || "Participant")}</span>
          <button class="btn small primary" onclick="promoteWaitlisted('${escapeJsArg(id)}','${escapeJsArg(u)}')">Inscrire</button>
        </div>`;
      }).join("") || '<div style="font-size:13px;color:var(--muted);padding:12px 0;">Personne en attente.</div>'}
    </div>
    <button class="btn secondary block" style="margin-top:12px;" onclick="closeModal()">Fermer</button>
  `);
}

async function promoteWaitlisted(id, userId) {
  const ev = _findCanonicalEvent(id);
  if (!ev || !_canManageEvent(ev)) return;
  ev.waitlist = (ev.waitlist || []).filter(x => x !== userId);
  ev.attendees = (ev.attendees || []).concat([userId]);
  saveState();
  if (window._supaReal && typeof supaPromoteFromWaitlist === "function") await supaPromoteFromWaitlist(id, userId);
  if (typeof supaInsertNotif === "function") supaInsertNotif(userId, "event_update", id, "t'a inscrit·e depuis la liste d'attente !");
  toast("✅ Participant inscrit");
  openEventWaitlist(id);
}

// Annule TOUTES les dates à venir d'une série récurrente d'un coup.
async function cancelEventSeries(id) {
  const ref = _findCanonicalEvent(id);
  if (!ref || !ref.seriesId) return;
  const all = allEvents().filter(e => e.seriesId === ref.seriesId && !_eventIsOver(e));
  if (!confirm("Annuler les " + all.length + " dates à venir de cette série ? Les inscrits seront prévenus.")) return;
  closeModal();
  for (const e of all) {
    const canon = _findCanonicalEvent(e.id);
    if (!canon || _eventIsCancelled(canon)) continue;
    canon.status = "cancelled";
    if (window._supaReal && typeof supaCancelEvent === "function") await supaCancelEvent(canon.id, true);
    _notifyEventAttendees(canon, "a annulé un événement auquel tu participais");
  }
  saveState();
  window._irlMapSig = null;
  renderIRL();
  toast("🚫 Série annulée — inscrits prévenus");
}

// Annulation « douce » : l'événement reste visible et barré pour les inscrits,
// qui reçoivent une notification. Supprimer purement l'événement les laissait
// venir sur place sans jamais savoir que c'était annulé.
async function toggleCancelEvent(id) {
  const ev = _findCanonicalEvent(id);
  if (!ev) return;
  const cancel = !_eventIsCancelled(ev);
  if (cancel && !confirm("Annuler cet événement ? Les inscrits seront prévenus.")) return;
  ev.status = cancel ? "cancelled" : "active";
  saveState();
  closeModal();
  renderIRL();
  if (window._supaReal && typeof supaCancelEvent === "function") {
    const ok = await supaCancelEvent(id, cancel);
    if (!ok) { toast("⚠️ Changement non synchronisé"); return; }
  }
  if (cancel) _notifyEventAttendees(ev, "a annulé un événement auquel tu participais");
  toast(cancel ? "🚫 Événement annulé — inscrits prévenus" : "✅ Événement réactivé");
}

async function deleteEventConfirm(id) {
  const ev = _findCanonicalEvent(id);
  if (!ev) return;
  if (!confirm("Supprimer définitivement « " + (ev.title || "") + " » ? Cette action est irréversible.")) return;
  if (window._supaReal && typeof supaDeleteEvent === "function") await supaDeleteEvent(id);
  state.userEvents = (state.userEvents || []).filter(e => e.id !== id);
  state.seed.events = (state.seed.events || []).filter(e => e.id !== id);
  state.user.joinedEvents = (state.user.joinedEvents || []).filter(x => x !== id);
  saveState();
  closeModal();
  closeEventDetail();
  window._irlMapSig = null; // la carte doit perdre son marqueur
  renderIRL();
  toast("🗑 Événement supprimé");
}

// Message groupé aux inscrits (annonce de dernière minute, changement de lieu…).
function _messageEventAttendees(id) {
  const ev = _findCanonicalEvent(id);
  if (!ev) return;
  openModal(`
    <div class="modal-handle"></div>
    <div class="modal-title">📣 Prévenir les inscrits</div>
    <div class="modal-subtitle">${(ev.attendees || []).length} personne(s) recevront une notification.</div>
    <label class="field"><span>Message</span>
      <textarea class="textarea" id="evBroadcast" maxlength="200" placeholder="Ex : on se retrouve finalement devant l'entrée nord !"></textarea>
    </label>
    <button class="btn primary block" onclick="_sendEventBroadcast('${escapeJsArg(id)}')">Envoyer</button>
  `);
}

function _sendEventBroadcast(id) {
  const ev = _findCanonicalEvent(id);
  const txt = (document.getElementById("evBroadcast")?.value || "").trim();
  if (!ev || !txt) { toast("Écris un message"); return; }
  _notifyEventAttendees(ev, escapeHtml(txt.slice(0, 200)));
  closeModal();
  toast("📣 Message envoyé aux inscrits");
}

// Signalement d'un événement (parité avec posts / profils / lives CDV).
function reportEvent(id) {
  if (typeof supaReport === "function") supaReport("event", id, "");
  toast("⚠️ Signalement envoyé — merci");
}

async function submitEvent(editId) {
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

  const durationH = parseFloat(g("evDuration")?.value || "2") || 2;

  if (title.length < 3) { toast("Titre trop court (3 caractères min)"); return; }
  if (!city) { toast("Indique une ville"); return; }
  if (!date) { toast("Choisis une date"); return; }
  if (!passion) { toast("Sélectionne une passion"); return; }

  const ts = new Date(date + "T" + time).getTime();
  if (isNaN(ts)) { toast("Date invalide"); return; }
  // Créer un événement DANS LE PASSÉ n'avait aucun garde-fou : il partait en base
  // puis était filtré à l'affichage → l'organisateur ne le retrouvait jamais.
  if (!editId && ts < Date.now() - 3600000) { toast("⏰ Cette date est déjà passée"); return; }

  const recurrence = editId ? null : (g("evRecurrence")?.value || "none");
  const occurrences = parseInt(g("evOccurrences")?.value || "6") || 6;

  const meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  const existing = editId ? _findCanonicalEvent(editId) : null;
  if (editId && !existing) { toast("Événement introuvable"); return; }

  const p = passionById(passion) || { emoji: "✨" };
  const ev = Object.assign(existing || {}, {
    id: editId || uid(), title, passion,
    emoji: p.emoji, date: ts, time, city,
    venue, address, postalCode, desc,
    price, maxAttendees, contact, externalLink, eventType,
    coverUrl,
    durationH,
    endAt: ts + Math.round(durationH * 3600000),
    status: (existing && existing.status) || "active",
    recurrence: editId ? (existing.recurrence || "none") : (recurrence || "none"),
    seriesId: editId ? (existing.seriesId || null) : (recurrence && recurrence !== "none" ? "s_" + uid() : null),
    coOrganizers: (existing && existing.coOrganizers) || [],
    convId: (existing && existing.convId) || null,
    organizerId: (existing && existing.organizerId) || meId,
    attendees: (existing && existing.attendees) || [meId],
    maybes: (existing && existing.maybes) || [],
    waitlist: (existing && existing.waitlist) || [],
    checkedIn: (existing && existing.checkedIn) || [],
    lat: (existing && existing.lat) || null,
    lng: (existing && existing.lng) || null,
  });

  // Coordonnées : ① choisies via l'autocomplétion d'adresse (les plus précises),
  // ② dictionnaire de villes, ③ géocodage Nominatim de l'adresse complète.
  const picked = window._evPickedCoords;
  if (picked && picked.lat) { ev.lat = picked.lat; ev.lng = picked.lng; }
  else {
    const known = cityToLatLng(city);
    if (known) { ev.lat = known[0]; ev.lng = known[1]; }
    else {
      // Ne PAS forcer « France » : un événement à Lisbonne ou Berlin n'était
      // jamais géolocalisé (donc absent de la carte) à cause de ce suffixe.
      const geo = await _geocodeAddress([venue, address, postalCode, city].filter(Boolean).join(", "));
      if (geo) { ev.lat = geo.lat; ev.lng = geo.lng; }
    }
  }
  window._evPickedCoords = null;

  closeModal();
  toast(editId ? "💾 Enregistrement…" : "📤 Publication en cours…");

  // Photo de couverture : upload sur Storage AVANT l'insert. Avant, le data URL
  // base64 partait tel quel dans events.cover_url → des centaines de Ko de base64
  // en base, rechargés à chaque supaLoadEvents pour TOUS les comptes.
  if (coverUrl && coverUrl.indexOf("data:") === 0 && typeof supaUploadMedia === "function" && window._supaReal) {
    try {
      const up = await supaUploadMedia(ev.id, "events", coverUrl, "photo");
      ev.coverUrl = (up && up.indexOf("http") === 0) ? up : null;
    } catch (e) { ev.coverUrl = null; }
  }

  // Occurrences suivantes d'un événement récurrent : de VRAIS événements qui
  // partagent le seriesId (chacun a ses inscrits et sa discussion).
  const extraOccurrences = [];
  if (!editId && recurrence && recurrence !== "none") {
    _recurrenceDates(ts, recurrence, occurrences).forEach(t => {
      extraOccurrences.push(Object.assign({}, ev, {
        id: uid(), date: t, endAt: t + Math.round(durationH * 3600000),
        attendees: [meId], maybes: [], waitlist: [], checkedIn: [], convId: null,
      }));
    });
  }

  if (!editId) {
    state.userEvents = state.userEvents || [];
    state.userEvents.unshift(ev);
    extraOccurrences.forEach(o => state.userEvents.unshift(o));
    state.user.joinedEvents = state.user.joinedEvents || [];
    [ev].concat(extraOccurrences).forEach(o => {
      if (!state.user.joinedEvents.includes(o.id)) state.user.joinedEvents.push(o.id);
      _setMyRsvpLocal(o.id, "going");
    });
    grantReward("event_create");
  }
  saveState();
  renderIRL();

  // Sync Supabase — on ne ment plus sur le résultat (même leçon que les bobines
  // fantômes du 2026-07-19 : « publié ! » alors que rien n'était en base).
  let ok = true;
  if (window._supaReal) {
    ok = editId
      ? await supaUpdateEvent(ev)
      : await supaPublishEvent(ev);
    // L'organisateur DOIT être une vraie ligne event_attendees, sinon son propre
    // événement affichait « 0 inscrit » chez tous les autres comptes.
    if (ok && !editId && typeof supaJoinEvent === "function") supaJoinEvent(ev.id);
    if (ok && editId) _notifyEventAttendees(ev, "a modifié un événement auquel tu participes");
    // Les occurrences suivantes partent ensuite (en série, pour ne pas saturer).
    for (const o of extraOccurrences) {
      const okOcc = await supaPublishEvent(o);
      if (okOcc && typeof supaJoinEvent === "function") supaJoinEvent(o.id);
    }
  }
  renderIRL();
  toast(ok
    ? (editId ? "✅ Événement mis à jour"
      : extraOccurrences.length ? `🎉 ${extraOccurrences.length + 1} dates publiées !` : "🎉 Événement publié !")
    : "⚠️ Enregistré ici, mais pas encore envoyé — réessaie quand tu auras du réseau");
}

// Notifie tous les inscrits (hors moi) d'un changement sur l'événement.
function _notifyEventAttendees(ev, text) {
  const meId = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  if (typeof supaInsertNotif !== "function") return;
  (ev.attendees || []).forEach(function(uidTo) {
    if (!uidTo || uidTo === meId || uidTo === "me") return;
    try { supaInsertNotif(uidTo, "event_update", ev.id, text); } catch (e) {}
  });
}

// Géocode une adresse libre → { lat, lng } ou null. Passe par la couche
// gratuite BAN/Photon (cache + throttle inclus).
async function _geocodeAddress(query) {
  const r = await passioGeocode(query);
  return r ? { lat: r.lat, lng: r.lng } : null;
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

// Estime le nombre de jours avant le prochain rang d'après le gain moyen récent
// (transactions à points des 30 derniers jours). Retourne null si pas assez de
// données pour estimer, ou si le rang maximum est atteint.
function _estimateDaysToNextRank(score, rank) {
  if (!rank || !rank.next) return null;            // rang max
  const remaining = rank.next - score;
  if (remaining <= 0) return null;
  const now = Date.now();
  const WINDOW = 30 * 86400000;                    // 30 jours
  const recent = (state.transactions || []).filter(t =>
    t && t.at && (t.pts || 0) > 0 && (now - t.at) <= WINDOW);
  if (recent.length < 2) return null;              // historique insuffisant
  const oldest = recent.reduce((m, t) => Math.min(m, t.at), now);
  const spanDays = Math.max(1, (now - oldest) / 86400000);
  const totalPts = recent.reduce((a, t) => a + (t.pts || 0), 0);
  const perDay = totalPts / spanDays;
  if (perDay <= 0) return null;
  return Math.max(1, Math.ceil(remaining / perDay));
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
  // Estimation temporelle « à ce rythme, prochain rang dans ~N jours ».
  const paceEl = $("#nextRankPace");
  if (paceEl) {
    const days = _estimateDaysToNextRank(s, r);
    if (days) {
      paceEl.textContent = `📈 À ce rythme, prochain rang dans ~${days} jour${days > 1 ? "s" : ""}`;
      paceEl.style.display = "";
    } else {
      paceEl.style.display = "none";
    }
  }
  const pct = r.next ? Math.min(100, ((s - r.min) / (r.next - r.min)) * 100) : 100;
  const circ = 2 * Math.PI * 42;
  $("#ringFg").setAttribute("stroke-dasharray", circ.toFixed(2));
  $("#ringFg").setAttribute("stroke-dashoffset", (circ * (1 - pct / 100)).toFixed(2));
  $("#passiaBalance").textContent = p;
  // Wallet légal : pas de valeur € ni de « gain » fictif — ce sont des points de
  // fidélité internes, non convertibles à ce jour (cf. mention sous le solde).
  const valIndic = $("#passiaValueIndicator");
  if (valIndic) {
    valIndic.textContent = "Points de fidélité";
  }

  // Earn guide — deux monnaies, deux logiques :
  //  ⭐ Étoiles = ton activité (généreux, fait monter le rang)
  //  💎 Passia  = la valeur que tu crées pour les autres (rare, vraie valeur)
  const guide = $("#earnGuide");
  guide.innerHTML = `
    <div class="earn-section-title">⭐ Gagne des étoiles en agissant</div>
    <div class="tx"><div class="tx-icon">✍️</div>
      <div class="tx-body"><div class="tx-title">Publier un post texte</div></div>
      <div class="tx-amount plus">+10 ⭐</div></div>
    <div class="tx"><div class="tx-icon">📷</div>
      <div class="tx-body"><div class="tx-title">Publier une photo</div></div>
      <div class="tx-amount plus">+15 ⭐</div></div>
    <div class="tx"><div class="tx-icon">🎙️</div>
      <div class="tx-body"><div class="tx-title">Publier un podcast</div></div>
      <div class="tx-amount plus">+20 ⭐</div></div>
    <div class="tx"><div class="tx-icon">🤝</div>
      <div class="tx-body"><div class="tx-title">Rejoindre un événement IRL</div></div>
      <div class="tx-amount plus">+20 ⭐</div></div>
    <div class="tx"><div class="tx-icon">🗓</div>
      <div class="tx-body"><div class="tx-title">Organiser un événement</div></div>
      <div class="tx-amount plus">+30 ⭐</div></div>
    <div class="earn-section-title">💎 Gagne des Passia (vraie valeur)</div>
    <div class="tx"><div class="tx-icon">❤️</div>
      <div class="tx-body"><div class="tx-title">${LIKES_PER_PASSIA} likes reçus sur ton contenu</div></div>
      <div class="tx-amount plus">+1 💎</div></div>
    <div class="tx"><div class="tx-icon">🎯</div>
      <div class="tx-body"><div class="tx-title">Compléter une quête</div></div>
      <div class="tx-amount plus">+💎</div></div>
  `;

  // History
  const tx = state.transactions || [];
  const txList = $("#txList");
  if (tx.length === 0) {
    txList.innerHTML = `<div class="empty"><div class="empty-icon">🧾</div><div class="empty-title">Aucune transaction</div><div class="empty-text">Commence à publier pour gagner.</div></div>`;
  } else {
    txList.innerHTML = tx.slice(0, 30).map(t => {
      const icon = { publish_text: "✍️", publish_photo: "📷", publish_video: "🎬", publish_audio: "🎙", event_create: "🗓", event_join: "🤝", comment: "💬", profile_create: "✨", first_login: "🎉", daily: "☀️", like_received: "❤️", tip_reel: "💎", quest: "🎯" }[t.kind] || "⭐";
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


/* ============================================================================
   IRL — PREUVE SOCIALE & INVITATIONS DIRECTES (2026-07-21)
   ----------------------------------------------------------------------------
   Les deux mecaniques qui font le taux de reponse de Partiful et de Luma, et qui
   manquaient a PASSIO :

   1. PREUVE SOCIALE — « Marie et Tom y vont ». Le nombre brut d'inscrits ne dit
      rien ; savoir qu'on connait quelqu'un sur place est LE declencheur du RSVP
      (et le frein n°1 leve : « je ne connaitrai personne »). On n'invente rien :
      on croise `ev.attendees` avec `state.user.following`, deja charge.

   2. INVITATION DIRECTE — inviter nommement ses abonnements. Un evenement pousse
      passivement dans un fil n'atteint personne ; Partiful a bati son produit sur
      l'invitation nominative. Reutilise supaInsertNotif (kind "event_invite",
      route vers openEventDetails) — aucune table, aucune migration.
   ========================================================================== */

// Les personnes que JE suis et qui participent (ou hesitent). Renvoie des uids.
// `maybes` est inclus a part : « 2 y vont, 1 hesite » est une info differente.
function _eventFriendsGoing(ev) {
  if (!ev) return { going: [], maybe: [] };
  var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  var follows = (state.user && state.user.following) || [];
  if (!follows.length) return { going: [], maybe: [] };
  var pick = function (list) {
    return (list || []).filter(function (id) {
      return id && id !== me && id !== "me" && follows.indexOf(id) > -1;
    });
  };
  return { going: pick(ev.attendees), maybe: pick(ev.maybes) };
}

// Bandeau « X et Y y vont » — avatars empiles + phrase. Rien si je ne connais
// personne (ne JAMAIS afficher une phrase vide ou « 0 de tes abonnements »).
function _eventSocialProofHtml(ev) {
  var f = _eventFriendsGoing(ev);
  var all = f.going.concat(f.maybe);
  if (!all.length) return "";

  var names = f.going.slice(0, 2).map(function (id) {
    return ((typeof userById === "function" && userById(id)) || {}).name || "Quelqu'un";
  });
  var phrase;
  if (f.going.length === 0) {
    phrase = f.maybe.length + " personne" + (f.maybe.length > 1 ? "s" : "") + " que tu suis hésite" + (f.maybe.length > 1 ? "nt" : "");
  } else if (f.going.length <= 2) {
    phrase = names.join(" et ") + (f.going.length > 1 ? " y vont" : " y va");
  } else {
    phrase = names.join(", ") + " et " + (f.going.length - 2) + " autre" + (f.going.length - 2 > 1 ? "s" : "") + " y vont";
  }
  if (f.going.length && f.maybe.length) phrase += " · " + f.maybe.length + " hésite" + (f.maybe.length > 1 ? "nt" : "");

  var avatars = all.slice(0, 3).map(function (id) {
    var u = (typeof userById === "function" && userById(id)) || { avatar: "#64748b", profileEmoji: "?" };
    return '<div class="avatar sm" style="background:' + avatarBg(u) + ';margin-left:-6px;border:2px solid var(--bg-card);">' + avatarInner(u) + '</div>';
  }).join("");

  return '<div class="event-social-proof">'
    + '<div style="display:flex;padding-left:6px;">' + avatars + '</div>'
    + '<span>' + escapeHtml(phrase) + '</span>'
    + '</div>';
}

/* ---------------------------------------------------------------------------
   INVITATIONS DIRECTES
   ------------------------------------------------------------------------- */

// Qui puis-je inviter : mes abonnements, moins ceux qui ont deja repondu (quel
// que soit le RSVP — relancer quelqu'un qui a decline est un anti-pattern) et
// moins ceux que j'ai deja invites sur CET evenement.
function _eventInvitables(ev) {
  var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";
  var already = []
    .concat(ev.attendees || [], ev.maybes || [], ev.declined || [], ev.waitlist || [])
    .concat(_eventInvitesSent(ev.id));
  return ((state.user && state.user.following) || []).filter(function (id) {
    return id && id !== me && already.indexOf(id) === -1 && !(typeof isBlocked === "function" && isBlocked(id));
  });
}

// Memoire LOCALE des invitations envoyees (pas de table : une invitation est une
// notification, et on veut seulement eviter le double envoi depuis cet appareil).
function _eventInvitesSent(eventId) {
  var m = (state.user && state.user.eventInvitesSent) || {};
  return m[eventId] || [];
}
function _rememberEventInvite(eventId, userId) {
  if (!state.user) return;
  state.user.eventInvitesSent = state.user.eventInvitesSent || {};
  var l = state.user.eventInvitesSent[eventId] || [];
  if (l.indexOf(userId) === -1) l.push(userId);
  state.user.eventInvitesSent[eventId] = l;
  saveState();
}

function openEventInvite(eventId) {
  var ev = _findCanonicalEvent(eventId) || allEvents().find(function (e) { return e.id === eventId; });
  if (!ev) { toast("Événement introuvable"); return; }
  window._inviteEventId = eventId;
  openModal('<span class="modal-close" onclick="closeModal()">×</span>'
    + '<div class="modal-title">💌 Inviter des amis</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">'
    + escapeHtml(ev.title || "") + '</div>'
    + '<input type="text" class="input" id="eventInviteSearch" placeholder="Rechercher parmi tes abonnements…" '
    + 'oninput="_renderEventInviteList()" style="margin-bottom:10px;"/>'
    + '<div id="eventInviteList"></div>');
  _renderEventInviteList();
}

function _renderEventInviteList() {
  var box = document.getElementById("eventInviteList");
  if (!box) return;
  var eventId = window._inviteEventId;
  var ev = _findCanonicalEvent(eventId) || allEvents().find(function (e) { return e.id === eventId; });
  if (!ev) return;

  var q = ((document.getElementById("eventInviteSearch") || {}).value || "").trim().toLowerCase();
  var ids = _eventInvitables(ev).filter(function (id) {
    if (!q) return true;
    var u = (typeof userById === "function" && userById(id)) || {};
    return (u.name || "").toLowerCase().indexOf(q) > -1;
  });

  if (!ids.length) {
    var sent = _eventInvitesSent(eventId).length;
    box.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:12px;">'
      + (q ? "Aucun résultat pour « " + escapeHtml(q) + " »"
           : sent ? "Tu as invité tout le monde 🎉"
                  : "Abonne-toi à des passionnés pour pouvoir les inviter ici.")
      + '</div>';
    return;
  }

  box.innerHTML = ids.slice(0, 50).map(function (id) {
    var u = (typeof userById === "function" && userById(id)) || { avatar: "#64748b", profileEmoji: "?", name: "Passionné" };
    return '<div class="event-invite-row">'
      + '<div class="avatar sm" style="background:' + avatarBg(u) + ';">' + avatarInner(u) + '</div>'
      + '<div style="flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
      + escapeHtml(u.name || "Passionné") + '</div>'
      + '<button class="btn small primary" data-invite="' + escapeHtml(id) + '" '
      + 'onclick="inviteToEvent(\'' + escapeJsArg(eventId) + '\',\'' + escapeJsArg(id) + '\',this)">Inviter</button>'
      + '</div>';
  }).join("");
}

function inviteToEvent(eventId, userId, btn) {
  var ev = _findCanonicalEvent(eventId) || allEvents().find(function (e) { return e.id === eventId; });
  if (!ev) return;
  if (btn) { btn.disabled = true; btn.textContent = "✓ Invité"; btn.classList.remove("primary"); btn.classList.add("ghost"); }
  _rememberEventInvite(eventId, userId);

  // L'invitation EST la notification (kind "event_invite" → openEventDetails).
  // ⚠️ supaInsertNotif échappe déjà le pseudo de l'émetteur (XSS notifications).
  if (typeof supaInsertNotif === "function") {
    supaInsertNotif(userId, "event_invite", eventId,
      "t'invite à <b>" + escapeHtml((ev.title || "un événement").slice(0, 60)) + "</b>");
  }
  toast("Invitation envoyée 💌");
}

// Invite d'un coup tous ceux que je suis et qui ne se sont pas encore prononcés.
function inviteAllFollowingToEvent(eventId) {
  var ev = _findCanonicalEvent(eventId) || allEvents().find(function (e) { return e.id === eventId; });
  if (!ev) return;
  var ids = _eventInvitables(ev);
  if (!ids.length) { toast("Personne de nouveau à inviter"); return; }
  ids.slice(0, 30).forEach(function (id) { inviteToEvent(eventId, id, null); });
  toast(ids.length + " invitation" + (ids.length > 1 ? "s envoyées" : " envoyée") + " 💌");
  _renderEventInviteList();
}

/* ============================================================================
   BADGES D'ASSIDUITE (2026-07-21)
   ----------------------------------------------------------------------------
   Mecanique de retention de Timeleft/Meetup : ce qui ramene quelqu'un a un 2e
   puis un 3e evenement, ce n'est pas la notification, c'est la PROGRESSION
   visible. Le systeme d'etoiles (RANKS) mesure deja l'activite globale ; les
   badges, eux, racontent des jalons CONCRETS et nommes (« 5 sorties », « 3 pays »).

   Entierement DERIVE de l'etat existant (aucune table, aucune colonne) :
   check-ins, evenements rejoints/crees, carnets, pays du passeport. Un badge ne
   se « gagne » donc jamais deux fois et ne peut pas se desynchroniser.
   ========================================================================== */

// Les compteurs bruts sur lesquels reposent tous les badges.
function myEngagementStats() {
  var u = (state && state.user) || {};
  var me = (typeof MY_UID !== "undefined" && MY_UID) ? MY_UID : "me";

  var evs = (typeof allEvents === "function") ? allEvents() : [];
  var joined = u.joinedEvents || [];
  var checkedIn = u.checkedInEvents || [];

  // « Sorties » = evenements rejoints DEJA PASSES (s'inscrire n'est pas y aller).
  var attended = evs.filter(function (e) {
    return e && joined.indexOf(e.id) > -1 && _eventIsOver(e);
  }).length;

  var organized = evs.filter(function (e) {
    return e && (e.organizerId === me || e.authorId === me);
  }).length;

  // Villes distinctes des evenements auxquels j'ai participe.
  var cities = {};
  evs.forEach(function (e) {
    if (e && joined.indexOf(e.id) > -1 && _eventIsOver(e) && e.city) cities[String(e.city).toLowerCase()] = 1;
  });

  var passport = (typeof cdvPassportStats === "function") ? cdvPassportStats() : { trips: [], km: 0, countries: [] };

  return {
    attended: attended,
    checkedIn: checkedIn.length,
    organized: organized,
    cities: Object.keys(cities).length,
    trips: passport.trips.length,
    km: passport.km,
    countries: passport.countries.length,
  };
}

// Chaque badge : un palier atteint ou non. `goal` sert a afficher la progression
// (« 3/5 ») sur les badges encore verrouilles — c'est ca qui donne envie.
var PASSIO_BADGES = [
  { id: "first_out",  emoji: "\u{1F44B}", label: "Première sortie", desc: "Participer à un événement",        stat: "attended",  goal: 1 },
  { id: "regular",    emoji: "\u{1F501}", label: "Habitué·e",       desc: "5 sorties à ton actif",            stat: "attended",  goal: 5 },
  { id: "veteran",    emoji: "\u{1F3C5}", label: "Vétéran",         desc: "15 sorties à ton actif",           stat: "attended",  goal: 15 },
  { id: "reliable",   emoji: "\u{2705}",  label: "Fiable",          desc: "Pointer son arrivée 3 fois",       stat: "checkedIn", goal: 3 },
  { id: "host",       emoji: "\u{1F3AA}", label: "Organisateur",    desc: "Créer un événement",               stat: "organized", goal: 1 },
  { id: "host_pro",   emoji: "\u{1F31F}", label: "Hôte confirmé·e", desc: "Créer 5 événements",               stat: "organized", goal: 5 },
  { id: "explorer",   emoji: "\u{1F5FA}", label: "Explorateur",     desc: "Sortir dans 3 villes différentes", stat: "cities",    goal: 3 },
  { id: "traveler",   emoji: "\u{1F9F3}", label: "Voyageur",        desc: "Publier un premier voyage",        stat: "trips",     goal: 1 },
  { id: "globetrot",  emoji: "\u{1F30D}", label: "Globe-trotteur",  desc: "Traverser 3 pays",                 stat: "countries", goal: 3 },
  { id: "long_haul",  emoji: "\u{1F6E3}", label: "Grand rouleur",   desc: "Parcourir 1 000 km cumulés",       stat: "km",        goal: 1000 },
];

// Renvoie les badges enrichis de leur progression. `earned` est vrai des que le
// compteur atteint l'objectif — rien n'est stocke, donc rien ne peut deriver.
function myBadges() {
  var s = myEngagementStats();
  return PASSIO_BADGES.map(function (b) {
    var have = s[b.stat] || 0;
    return {
      id: b.id, emoji: b.emoji, label: b.label, desc: b.desc,
      have: have, goal: b.goal, earned: have >= b.goal,
      pct: Math.max(0, Math.min(100, Math.round((have / b.goal) * 100))),
    };
  });
}

function myBadgeCount() {
  return myBadges().filter(function (b) { return b.earned; }).length;
}

// Detecte les badges NOUVELLEMENT obtenus et les annonce. Appele apres les actions
// qui peuvent en debloquer un (check-in, participation, publication de voyage).
// La memoire des badges deja annonces evite de re-feter au moindre re-render.
function _announceNewBadges() {
  try {
    if (!state || !state.user) return;
    var known = state.user.badgesSeen || [];
    var fresh = myBadges().filter(function (b) {
      return b.earned && known.indexOf(b.id) === -1;
    });
    if (!fresh.length) return;
    state.user.badgesSeen = known.concat(fresh.map(function (b) { return b.id; }));
    saveState();
    fresh.forEach(function (b, i) {
      setTimeout(function () {
        if (typeof pushNotification === "function") {
          pushNotification("Badge débloqué : <b>" + escapeHtml(b.label) + "</b> — " + escapeHtml(b.desc), b.emoji);
        }
        if (typeof toast === "function") toast(b.emoji + " Badge débloqué : " + b.label);
      }, i * 900);
    });
  } catch (e) {}
}

// Marque les badges deja obtenus comme « vus » SANS les annoncer : au tout premier
// passage d'un compte existant, on ne veut pas 6 toasts d'un coup pour des jalons
// franchis il y a des mois. Appele au boot.
function _seedBadgesSeen() {
  try {
    if (!state || !state.user || state.user.badgesSeen) return;
    state.user.badgesSeen = myBadges().filter(function (b) { return b.earned; })
      .map(function (b) { return b.id; });
    saveState();
  } catch (e) {}
}

function openBadgesSheet() {
  var list = myBadges();
  var earned = list.filter(function (b) { return b.earned; });
  var locked = list.filter(function (b) { return !b.earned; });

  var card = function (b) {
    return '<div class="badge-card' + (b.earned ? " earned" : "") + '">'
      + '<div class="badge-emoji">' + b.emoji + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div class="badge-label">' + escapeHtml(b.label) + '</div>'
      + '<div class="badge-desc">' + escapeHtml(b.desc) + '</div>'
      + (b.earned ? "" : '<div class="badge-bar"><i style="width:' + b.pct + '%"></i></div>')
      + '</div>'
      + '<div class="badge-count">' + (b.earned ? "\u{2713}" : b.have + "/" + b.goal) + '</div>'
      + '</div>';
  };

  openModal('<span class="modal-close" onclick="closeModal()">×</span>'
    + '<div class="modal-title">\u{1F3C5} Mes badges</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:14px;">'
    + earned.length + ' badge' + (earned.length > 1 ? "s" : "") + ' sur ' + list.length + '</div>'
    + (earned.length ? earned.map(card).join("") : '<div style="text-align:center;padding:16px;color:var(--muted);font-size:12px;">Ton premier badge t\'attend à ta première sortie \u{1F44B}</div>')
    + (locked.length ? '<div style="font-weight:800;font-size:13px;color:var(--text);margin:16px 0 8px;">À débloquer</div>' + locked.map(card).join("") : ""));
}

/* ============================================================================
   IRL — RETOUR D'EXPÉRIENCE APRÈS L'ÉVÉNEMENT (2026-07-21)
   ----------------------------------------------------------------------------
   La boucle d'Eventbrite/Meetup qui manquait : un événement se terminait dans le
   silence. Une note (1-5) + un mot libre donnent à l'organisateur une raison de
   recommencer, et aux futurs inscrits un signal de qualité.

   Stockage : colonnes `rating` / `feedback` / `rated_at` de `event_attendees`
   (migration_event_feedback.sql, appliquée en prod) — une ligne existe déjà par
   participant, et sa policy UPDATE « owner » autorise déjà chacun à écrire la
   sienne. Miroir local dans state.user.eventRatings pour l'affichage hors-ligne.
   ========================================================================== */

// Ma note sur un événement (locale d'abord, c'est elle qui pilote l'UI).
function myEventRating(eventId) {
  var m = (state.user && state.user.eventRatings) || {};
  return m[eventId] || null;
}

// Qui peut noter : un participant (going/check-in) d'un événement TERMINÉ et non
// annulé. L'organisateur ne note pas son propre événement.
function _canRateEvent(ev) {
  if (!ev || !_eventIsOver(ev) || _eventIsCancelled(ev)) return false;
  if (_isMyEvent(ev)) return false;
  return myRsvp(ev.id) === "going" || _hasCheckedIn(ev);
}

function openEventFeedback(eventId) {
  var ev = _findCanonicalEvent(eventId) || allEvents().find(function (e) { return e.id === eventId; });
  if (!ev) return;
  var mine = myEventRating(eventId) || { rating: 0, feedback: "" };
  window._ratingDraft = mine.rating || 0;

  openModal('<span class="modal-close" onclick="closeModal()">×</span>'
    + '<div class="modal-title">⭐ Ton retour</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:14px;">'
    + escapeHtml(ev.title || "") + '</div>'
    + '<div id="evRatingStars" style="display:flex;gap:6px;justify-content:center;margin-bottom:14px;">'
    + _evRatingStarsHtml(window._ratingDraft) + '</div>'
    + '<textarea class="input" id="evFeedbackText" rows="3" maxlength="500" '
    + 'placeholder="Un mot sur ce moment ? (optionnel)" style="width:100%;resize:vertical;">'
    + escapeHtml(mine.feedback || "") + '</textarea>'
    + '<button class="btn primary block" style="margin-top:12px;" '
    + 'onclick="submitEventFeedback(\'' + escapeJsArg(eventId) + '\')">Envoyer mon retour</button>'
    + (mine.rating ? '<div style="font-size:11px;color:var(--muted);text-align:center;margin-top:8px;">Tu peux modifier ton retour à tout moment.</div>' : ''));
}

function _evRatingStarsHtml(n) {
  var out = "";
  for (var i = 1; i <= 5; i++) {
    out += '<span class="ev-rating-star' + (i <= n ? " on" : "") + '" role="button" tabindex="0"'
      + ' aria-label="' + i + ' étoile' + (i > 1 ? "s" : "") + '"'
      + ' onclick="setEventRatingDraft(' + i + ')"'
      + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();setEventRatingDraft(' + i + ');}">'
      + (i <= n ? "★" : "☆") + '</span>';
  }
  return out;
}

function setEventRatingDraft(n) {
  window._ratingDraft = n;
  var box = document.getElementById("evRatingStars");
  if (box) box.innerHTML = _evRatingStarsHtml(n);
}

function submitEventFeedback(eventId) {
  var n = window._ratingDraft || 0;
  if (!n) { toast("Choisis une note d'abord ⭐"); return; }
  var txt = ((document.getElementById("evFeedbackText") || {}).value || "").trim().slice(0, 500);

  state.user.eventRatings = state.user.eventRatings || {};
  state.user.eventRatings[eventId] = { rating: n, feedback: txt, at: Date.now() };
  saveState();
  closeModal();
  toast("Merci pour ton retour ⭐");

  if (window._supaReal && typeof supaRateEvent === "function") supaRateEvent(eventId, n, txt);

  // Le retour notifie l'organisateur : c'est le signal qu'il attend.
  var ev = _findCanonicalEvent(eventId) || allEvents().find(function (e) { return e.id === eventId; });
  var orga = ev && (ev.organizerId || ev.authorId);
  if (ev && orga && orga !== MY_UID && typeof supaInsertNotif === "function") {
    supaInsertNotif(orga, "event_feedback", eventId,
      "a noté <b>" + escapeHtml((ev.title || "ton événement").slice(0, 60)) + "</b> " + n + "/5");
  }
  _refreshEventDetailIfOpen(eventId);
}

// Invite à noter : bandeau sur la fiche d'un événement terminé auquel j'ai
// participé et que je n'ai pas encore noté.
function _eventFeedbackPromptHtml(ev) {
  if (!_canRateEvent(ev)) return "";
  var mine = myEventRating(ev.id);
  if (mine) {
    return '<div class="event-feedback-done">'
      + '<span>Ton retour : ' + "★".repeat(mine.rating) + "☆".repeat(5 - mine.rating) + '</span>'
      + '<button class="btn small ghost" onclick="openEventFeedback(\'' + escapeJsArg(ev.id) + '\')">Modifier</button>'
      + '</div>';
  }
  return '<div class="event-feedback-prompt">'
    + '<div style="flex:1;min-width:0;font-size:12px;font-weight:600;">C\'était comment ?</div>'
    + '<button class="btn small primary" onclick="openEventFeedback(\'' + escapeJsArg(ev.id) + '\')">⭐ Noter</button>'
    + '</div>';
}

// Agrégat public : note moyenne d'un événement terminé (cache window._eventRatings,
// rempli par _loadEventRatings). Rien tant qu'il n'y a aucune note — une moyenne
// sur 0 avis ne veut rien dire et ferait fuir.
function _eventRatingSummaryHtml(ev) {
  var agg = (window._eventRatings && window._eventRatings[ev.id]) || null;
  if (!agg || !agg.count) return "";
  var avg = Math.round(agg.avg * 10) / 10;
  var full = Math.round(agg.avg);
  return '<div class="event-rating-summary">'
    + '<span class="ev-rating-stars-static">' + "★".repeat(full) + "☆".repeat(5 - full) + '</span>'
    + '<b>' + String(avg).replace(".", ",") + '</b>'
    + '<span style="color:var(--muted);">· ' + agg.count + " avis" + '</span>'
    + '</div>';
}

// Charge les notes d'un événement depuis Supabase et re-rend la fiche si besoin.
async function _loadEventRatings(eventId) {
  if (!window._supaReal || typeof supaLoadEventRatings !== "function") return;
  var agg = await supaLoadEventRatings(eventId);
  if (!agg) return;
  window._eventRatings = window._eventRatings || {};
  window._eventRatings[eventId] = agg;
  var holder = document.querySelector('[data-evrating="' + eventId + '"]');
  if (holder) holder.innerHTML = _eventRatingSummaryHtml({ id: eventId });
}

/* ============================================================================
   QR — GÉNÉRATEUR AUTONOME (2026-07-21)
   ----------------------------------------------------------------------------
   Le check-in par QR de Luma suppose de PRODUIRE un QR. Deux voies étaient
   fermées : un service d'images externe (la CSP prod n'autorise aucun host
   d'images tiers, et ce serait une fuite de données) et une lib CDN (même
   problème + poids). D'où cet encodeur minimal, ~150 lignes, sans dépendance.

   Portée volontairement réduite à ce dont l'app a besoin : mode OCTET, niveau de
   correction M, versions 1 à 6 (jusqu'à 106 octets) — un jeton de check-in fait
   ~40 caractères. Un contenu trop long lève une erreur explicite plutôt que de
   produire un QR silencieusement illisible.

   ⚠️ NE PAS étendre la table au-delà de la version 6 sans implémenter le bloc
   d'INFORMATION DE VERSION (18 bits près des motifs de repérage), obligatoire à
   partir de la version 7 : sans lui les modules réservés sont réutilisés pour les
   données, tout le placement se décale et le QR devient illisible (constaté en
   comparant module par module avec une implémentation de référence).

   Vérifié par ALLER-RETOUR réel : le QR produit est redécodé par BarcodeDetector
   dans le navigateur (cf. la session de vérification du 2026-07-21).
   ========================================================================== */

var _QR_EC_BLOCKS_M = {
  // version: [nb de blocs, nb de codewords de données par bloc] (niveau M).
  1: [1, 16], 2: [1, 28], 3: [1, 44], 4: [2, 32], 5: [2, 43], 6: [4, 27],
};
var _QR_EC_CODEWORDS_M = { 1: 10, 2: 16, 3: 26, 4: 18, 5: 24, 6: 16 };
var _QR_ALIGN_POS = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
};
var _QR_MAX_VERSION = 6;

// Arithmétique de Galois GF(256) — le cœur de Reed-Solomon.
var _qrExp = new Array(512), _qrLog = new Array(256);
(function () {
  var x = 1;
  for (var i = 0; i < 255; i++) { _qrExp[i] = x; _qrLog[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (var j = 255; j < 512; j++) _qrExp[j] = _qrExp[j - 255];
})();
function _qrMul(a, b) { return (a === 0 || b === 0) ? 0 : _qrExp[_qrLog[a] + _qrLog[b]]; }

// Codewords de correction d'erreur pour un bloc de données.
function _qrEcc(data, ecLen) {
  var gen = [1];
  for (var i = 0; i < ecLen; i++) {
    var next = gen.concat([0]);
    for (var j = 0; j < gen.length; j++) next[j + 1] ^= _qrMul(gen[j], _qrExp[i]);
    gen = next;
  }
  var rem = data.concat(new Array(ecLen).fill(0));
  for (var k = 0; k < data.length; k++) {
    var coef = rem[k];
    if (!coef) continue;
    for (var m = 0; m < gen.length; m++) rem[k + m] ^= _qrMul(gen[m], coef);
  }
  return rem.slice(data.length);
}

// Capacité en codewords de données (niveau M) pour une version.
function _qrDataCodewords(v) {
  var b = _QR_EC_BLOCKS_M[v], total = 0;
  for (var i = 0; i < b.length; i += 2) total += b[i] * b[i + 1];
  return total;
}

// Construit la matrice booléenne du QR. Renvoie { size, modules }.
function qrEncode(text) {
  // UTF-8 : un jeton de check-in est ASCII, mais on ne veut pas casser sur un
  // accent. TextEncoder donne le compte d'octets EXACT ; le repli manuel couvre
  // les très vieux moteurs (`unescape` est déprécié et ambigu selon l'hôte).
  var bytes = [];
  if (typeof TextEncoder !== "undefined") {
    bytes = Array.from(new TextEncoder().encode(String(text)));
  } else {
    var s = String(text);
    for (var ci = 0; ci < s.length; ci++) {
      var cp = s.charCodeAt(ci);
      if (cp < 0x80) bytes.push(cp);
      else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
      else bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
  }

  // Plus petite version qui contient le message (4 bits de mode + longueur + data).
  var version = 0;
  for (var v = 1; v <= _QR_MAX_VERSION; v++) {
    // Le compteur de longueur tient sur 8 bits en mode octet jusqu'à la v9.
    if (4 + 8 + bytes.length * 8 <= _qrDataCodewords(v) * 8) { version = v; break; }
  }
  if (!version) throw new Error("QR : contenu trop long (" + bytes.length + " octets, max 106)");

  var size = 17 + version * 4;
  var lenBits = 8;

  // ---- flux binaire ----
  var bits = [];
  var push = function (val, n) { for (var b = n - 1; b >= 0; b--) bits.push((val >> b) & 1); };
  push(4, 4);                      // mode octet
  push(bytes.length, lenBits);
  bytes.forEach(function (b) { push(b, 8); });

  var capacity = _qrDataCodewords(version) * 8;
  push(0, Math.min(4, capacity - bits.length));      // terminateur
  while (bits.length % 8) bits.push(0);
  var pad = [0xec, 0x11], p = 0;
  while (bits.length < capacity) { push(pad[p++ % 2], 8); }

  var codewords = [];
  for (var c = 0; c < bits.length; c += 8) {
    var byte = 0;
    for (var d = 0; d < 8; d++) byte = (byte << 1) | bits[c + d];
    codewords.push(byte);
  }

  // ---- découpage en blocs + entrelacement ----
  var spec = _QR_EC_BLOCKS_M[version], ecLen = _QR_EC_CODEWORDS_M[version];
  var blocks = [], eccs = [], off = 0;
  for (var s = 0; s < spec.length; s += 2) {
    for (var n = 0; n < spec[s]; n++) {
      var blk = codewords.slice(off, off + spec[s + 1]);
      off += spec[s + 1];
      blocks.push(blk);
      eccs.push(_qrEcc(blk, ecLen));
    }
  }
  var interleaved = [];
  var maxLen = Math.max.apply(null, blocks.map(function (b) { return b.length; }));
  for (var q = 0; q < maxLen; q++) blocks.forEach(function (b) { if (q < b.length) interleaved.push(b[q]); });
  for (var r = 0; r < ecLen; r++) eccs.forEach(function (e) { interleaved.push(e[r]); });

  // ---- matrice ----
  var mod = [], reserved = [];
  for (var y = 0; y < size; y++) { mod.push(new Array(size).fill(0)); reserved.push(new Array(size).fill(0)); }

  var setFinder = function (ox, oy) {
    for (var dy = -1; dy <= 7; dy++) for (var dx = -1; dx <= 7; dx++) {
      var x = ox + dx, y = oy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      var on = (dx >= 0 && dx <= 6 && (dy === 0 || dy === 6)) ||
               (dy >= 0 && dy <= 6 && (dx === 0 || dx === 6)) ||
               (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
      mod[y][x] = on ? 1 : 0; reserved[y][x] = 1;
    }
  };
  setFinder(0, 0); setFinder(size - 7, 0); setFinder(0, size - 7);

  // Motifs de synchronisation.
  for (var t = 8; t < size - 8; t++) {
    if (!reserved[6][t]) { mod[6][t] = (t % 2 === 0) ? 1 : 0; reserved[6][t] = 1; }
    if (!reserved[t][6]) { mod[t][6] = (t % 2 === 0) ? 1 : 0; reserved[t][6] = 1; }
  }

  // Motifs d'alignement.
  var pos = _QR_ALIGN_POS[version];
  pos.forEach(function (ay) {
    pos.forEach(function (ax) {
      if (reserved[ay] && reserved[ay][ax]) return;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        var x = ax + dx, y = ay + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        mod[y][x] = (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) ? 1 : 0;
        reserved[y][x] = 1;
      }
    });
  });

  // Zones réservées au format (remplies après le masquage) + module noir fixe.
  for (var f = 0; f < 9; f++) {
    if (f !== 6) { reserved[8][f] = 1; reserved[f][8] = 1; }
  }
  reserved[8][6] = 1; reserved[6][8] = 1; reserved[8][8] = 1;
  for (var g = 0; g < 8; g++) { reserved[8][size - 1 - g] = 1; reserved[size - 1 - g][8] = 1; }
  mod[size - 8][8] = 1; reserved[size - 8][8] = 1;

  // ---- placement des données en zigzag, masque 0 appliqué à la volée ----
  var bitIdx = 0, dirUp = true;
  for (var col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;                        // la colonne de sync ne compte pas
    for (var row = 0; row < size; row++) {
      var yy = dirUp ? size - 1 - row : row;
      for (var cc = 0; cc < 2; cc++) {
        var xx = col - cc;
        if (reserved[yy][xx]) continue;
        var bit = 0;
        if (bitIdx < interleaved.length * 8) {
          bit = (interleaved[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
        }
        bitIdx++;
        if (((yy + xx) % 2) === 0) bit ^= 1;      // masque 0 : (row + col) % 2 == 0
        mod[yy][xx] = bit;
      }
    }
    dirUp = !dirUp;
  }

  // ---- information de format (niveau M = 00, masque 0) ----
  var fmt = 0x5412; // valeur pré-calculée pour EC=M, masque=0 (BCH + XOR 0x5412)
  var fbits = [];
  for (var fb = 14; fb >= 0; fb--) fbits.push((fmt >> fb) & 1);
  // Copie 1 (autour du finder haut-gauche)
  var seq1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  seq1.forEach(function (p2, i2) { mod[p2[0]][p2[1]] = fbits[i2]; });
  // Copie 2 : bits 0-6 en colonne 8 (lignes size-1 → size-7), bits 7-14 en ligne 8
  // (colonnes size-8 → size-1). ⚠️ La boucle verticale s'arrête à 7 modules, PAS 8 :
  // la 8ᵉ position (size-8, 8) est le « module noir » fixe, et l'écraser rendait le
  // QR illisible (écart constaté module par module contre une implémentation de
  // référence — c'était le seul défaut du générateur).
  for (var h = 0; h < 7; h++) mod[size - 1 - h][8] = fbits[h];
  for (var k2 = 7; k2 < 15; k2++) mod[8][size - 15 + k2] = fbits[k2];

  return { size: size, modules: mod, version: version };
}

// Rend un QR en SVG (net à toute taille, aucun canvas, insérable tel quel).
function qrSvg(text, px) {
  var q = qrEncode(text);
  var quiet = 4, total = q.size + quiet * 2;
  var rects = "";
  for (var y = 0; y < q.size; y++) {
    for (var x = 0; x < q.size; x++) {
      if (q.modules[y][x]) rects += '<rect x="' + (x + quiet) + '" y="' + (y + quiet) + '" width="1" height="1"/>';
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (px || 220) + '" height="' + (px || 220) + '"'
    + ' viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges" role="img" aria-label="QR code">'
    + '<rect width="' + total + '" height="' + total + '" fill="#fff"/>'
    + '<g fill="#000">' + rects + '</g></svg>';
}

/* ============================================================================
   IRL — CHECK-IN PAR QR (2026-07-21)
   ----------------------------------------------------------------------------
   Le pointage d'arrivée de Luma. Le sens de lecture est INVERSÉ par rapport à la
   billetterie classique, et c'est délibéré :

     l'ORGANISATEUR affiche un QR à l'accueil, les PARTICIPANTS le scannent.

   Pourquoi pas l'inverse (l'orga scanne chaque participant) ? Parce que la policy
   RLS de `event_attendees` est « owner » : chacun ne peut écrire QUE sa propre
   ligne. Faire pointer les autres par l'organisateur imposerait d'ouvrir cette
   policy — un vrai risque pour un gain nul. Ici chaque participant écrit sa
   propre ligne : aucune RLS à toucher, et AUCUN scanner à embarquer (l'appareil
   photo natif du téléphone ouvre le lien tout seul).

   ⚠️ Le code n'est PAS un secret cryptographique : il est dérivé de l'id de
   l'événement, donc quelqu'un de déterminé pourrait le fabriquer. C'est assumé —
   le pointage est un confort, pas un contrôle d'accès (le chemin GPS existant
   fait déjà confiance à l'utilisateur quand la géolocalisation est refusée).
   ========================================================================== */

// Code d'accueil court et stable, dérivé de l'id de l'événement (6 caractères
// lisibles à voix haute : ni 0/O ni 1/I).
var _CHK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function _eventCheckinCode(ev) {
  var id = String((ev && ev.id) || "");
  var h1 = 0x811c9dc5, h2 = 0x01000193;
  for (var i = 0; i < id.length; i++) {
    h1 = ((h1 ^ id.charCodeAt(i)) * 16777619) >>> 0;
    h2 = ((h2 + id.charCodeAt(i) * (i + 7)) * 2654435761) >>> 0;
  }
  var out = "";
  for (var k = 0; k < 6; k++) {
    var src = (k < 3 ? h1 : h2) >>> ((k % 3) * 5);
    out += _CHK_ALPHABET[src % _CHK_ALPHABET.length];
  }
  return out;
}

// L'URL que porte le QR : elle ouvre l'app directement sur le pointage.
function _eventCheckinUrl(ev) {
  var base = location.origin + location.pathname;
  return base + "#irl-checkin-" + ev.id + "-" + _eventCheckinCode(ev);
}

// Vue ORGANISATEUR : le QR à afficher à l'accueil (écran de téléphone, projeté,
// ou imprimé). Le code en clair sert de repli quand un appareil photo peine.
function openEventCheckinQr(eventId) {
  var ev = _findCanonicalEvent(eventId) || allEvents().find(function (e) { return e.id === eventId; });
  if (!ev) return;
  if (!_canManageEvent(ev)) { toast("Réservé à l'organisateur"); return; }

  var code = _eventCheckinCode(ev);
  var svg;
  try {
    svg = qrSvg(_eventCheckinUrl(ev), 240);
  } catch (e) {
    // Un QR illisible serait pire que pas de QR : on assume le repli code seul.
    svg = '<div style="font-size:12px;color:var(--muted);padding:20px;">QR indisponible — utilise le code ci-dessous.</div>';
  }

  openModal('<span class="modal-close" onclick="closeModal()">×</span>'
    + '<div class="modal-title">📲 Accueil des participants</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:14px;">'
    + escapeHtml(ev.title || "") + '</div>'
    + '<div class="checkin-qr-frame">' + svg + '</div>'
    + '<div style="text-align:center;margin-top:12px;">'
    + '<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">ou code à saisir</div>'
    + '<div class="checkin-code">' + escapeHtml(code) + '</div>'
    + '</div>'
    + '<div style="font-size:12px;color:var(--text-dim);line-height:1.6;margin-top:14px;text-align:center;">'
    + 'Montre cet écran à l\'entrée : chacun le scanne avec son appareil photo et '
    + 'son arrivée est pointée automatiquement.</div>'
    + '<button class="btn ghost block" style="margin-top:12px;" '
    + 'onclick="_copyCheckinLink(\'' + escapeJsArg(eventId) + '\')">🔗 Copier le lien de pointage</button>');
}

function _copyCheckinLink(eventId) {
  var ev = _findCanonicalEvent(eventId) || allEvents().find(function (e) { return e.id === eventId; });
  if (!ev) return;
  var url = _eventCheckinUrl(ev);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () { toast("Lien copié 🔗"); },
      function () { toast(url); });
  } else { toast(url); }
}

// Vue PARTICIPANT : saisie manuelle du code affiché à l'accueil (repli quand on
// n'a pas pu scanner).
function openCheckinCodeEntry(eventId) {
  var ev = _findCanonicalEvent(eventId) || allEvents().find(function (e) { return e.id === eventId; });
  if (!ev) return;
  openModal('<span class="modal-close" onclick="closeModal()">×</span>'
    + '<div class="modal-title">📲 Pointer mon arrivée</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:14px;">'
    + 'Saisis le code affiché à l\'accueil de « ' + escapeHtml(ev.title || "") + ' ».</div>'
    + '<input type="text" class="input" id="checkinCodeInput" maxlength="6" autocomplete="off" '
    + 'placeholder="ABC123" style="text-transform:uppercase;letter-spacing:4px;text-align:center;font-size:20px;font-weight:800;" '
    + 'onkeypress="if(event.key===\'Enter\')submitCheckinCode(\'' + escapeJsArg(eventId) + '\')"/>'
    + '<button class="btn primary block" style="margin-top:12px;" '
    + 'onclick="submitCheckinCode(\'' + escapeJsArg(eventId) + '\')">Valider</button>');
  setTimeout(function () {
    var el = document.getElementById("checkinCodeInput");
    if (el) el.focus();
  }, 120);
}

function submitCheckinCode(eventId) {
  var ev = _findCanonicalEvent(eventId) || allEvents().find(function (e) { return e.id === eventId; });
  if (!ev) return;
  var val = ((document.getElementById("checkinCodeInput") || {}).value || "")
    .trim().toUpperCase().replace(/\s/g, "");
  if (val !== _eventCheckinCode(ev)) { toast("Code incorrect — vérifie avec l'organisateur"); return; }
  closeModal();
  _checkInViaCode(ev);
}

// Pointage validé par code/QR : on court-circuite la vérification GPS (être
// devant le QR de l'accueil EST la preuve de présence, et c'en est une meilleure
// qu'une position à 500 m près).
function _checkInViaCode(ev) {
  if (_hasCheckedIn(ev)) { toast("✅ Tu as déjà pointé ton arrivée"); return; }
  if (!_canCheckIn(ev)) { toast("⏰ Le pointage ouvre 1 h avant le début"); return; }
  state.user.checkedInEvents = state.user.checkedInEvents || [];
  if (state.user.checkedInEvents.indexOf(ev.id) === -1) state.user.checkedInEvents.push(ev.id);
  if (myRsvp(ev.id) !== "going") _setMyRsvpLocal(ev.id, "going");
  grantReward("event_join");
  saveState();
  if (window._supaReal && typeof supaCheckInEvent === "function") supaCheckInEvent(ev.id);
  toast("🎉 Arrivée confirmée — bon moment !");
  _refreshEventDetailIfOpen(ev.id);
  if (typeof _announceNewBadges === "function") _announceNewBadges();
}

// Lien profond #irl-checkin-<eventId>-<code> (celui que porte le QR).
function _openIrlCheckinFromHash() {
  var m = /#irl-checkin-(.+)-([A-Z0-9]{6})$/.exec(location.hash || "");
  if (!m) return false;
  var id = m[1], code = m[2];
  var run = function () {
    var ev = _findCanonicalEvent(id) || allEvents().find(function (e) { return e.id === id; });
    if (!ev) return false;
    if (typeof goTo === "function") goTo("irl");
    if (typeof openEventDetails === "function") openEventDetails(id);
    if (code !== _eventCheckinCode(ev)) { toast("Lien de pointage invalide"); return true; }
    _checkInViaCode(ev);
    return true;
  };
  if (run()) return true;
  // L'événement peut n'arriver qu'avec le chargement Supabase : on retente.
  var tries = 0;
  var t = setInterval(function () {
    if (run()) clearInterval(t);
    else if (++tries > 12) { clearInterval(t); toast("Événement introuvable ou supprimé"); }
  }, 700);
  return true;
}
window.addEventListener("hashchange", _openIrlCheckinFromHash);
(function _irlCheckinDeepLinkBoot() {
  if (!/#irl-checkin-/.test(location.hash || "")) return;
  setTimeout(_openIrlCheckinFromHash, 1200);
})();
