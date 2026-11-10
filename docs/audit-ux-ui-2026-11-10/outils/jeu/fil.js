// ═══════════════════════════════════════════════════════════════════════════
// JEU DE DONNÉES FICTIF — DOMAINE « FIL ET INTERACTIONS »
//
// Complète le socle (outils/jeu/base.js). Tout est inventé : aucun identifiant,
// nom, texte ou lieu n'existe en production.
//
// Ce que ce jeu met dans le fil d'un compte connecté (Camille Audit, passions
// Musique · Sport · Cuisine, abonnée à Léa, Malik et Marie-Charlotte) :
//   · texte court / texte long (« Lire la suite ») ;
//   · photo paysage, portrait, panorama, très haute, carrée ; photo ABSENTE (404) ;
//   · vidéo et audio (fichier local de substitution, voir `media`) ;
//   · repartage d'une publication ; partage d'une activité (carte « ÉVÉNEMENT IRL ») ;
//   · publication reliée à une activité (`event_id` → « Voir l'activité ») ;
//   · nom d'auteur très long ; publication d'un compte privé (visible si suivi) ;
//   · mes propres publications (options « ⋯ » du propriétaire) ;
//   · une discussion de 34 commentaires (pagination serveur de 30), avec
//     réponses, j'aime, réactions emoji, commentaire « image » et épingle ;
//   · des j'aime (`post_likes`) et des réactions de publication ;
//   · des stories de comptes suivis ; un fil VOLUMINEUX (64 publications).
//
// ⚠️ MIROIR DE `fil_compteurs` : le faux serveur commun répond à cette fonction
// par « 0 commentaire, aucun aperçu, aucune réaction » (et rend `moi` là où la
// production rend `aime`). Sans complément, chaque carte afficherait « 💬 0 »
// au-dessus d'une discussion de 34 lignes — un défaut du BANC, pas du produit.
// `completerFilCompteurs` répond donc à la place, en mémoire, ce que la fonction
// SQL de production rend (migrations/migration_fil_compteurs_2026-09-21.sql) :
// compte exact de j'aime, ma ligne, compte exact des commentaires de premier
// niveau, les deux aperçus les plus récents, les réactions de la publication —
// chaque ligne jugée par la policy SELECT recopiée du faux serveur. Rien n'est
// modifié dans les fichiers du faux serveur : seul l'OBJET en mémoire du
// scénario est complété.
// ═══════════════════════════════════════════════════════════════════════════
"use strict";
const base = require("./base");

const IDS = {
  // socle
  photoAtelier: "pa_lea_1", texteIrl: "pa_malik_1", nomLong: "pa_long_1", moi: "pa_moi_1", bobine: "pa_lea_2",
  // ce jeu
  texteCourt: "pf_texte_court", texteLong: "pf_texte_long",
  paysage: "pf_photo_paysage", portrait: "pf_photo_portrait", haute: "pf_photo_haute", carre: "pf_photo_carre",
  photoAbsente: "pf_photo_absente", video: "pf_video", audio: "pf_audio",
  repartage: "pf_repartage", partageActivite: "pf_partage_activite", relieActivite: "pf_relie_activite",
  prive: "pf_prive", moiTexte: "pf_moi_texte", activite: "ev_fil_grimpe",
};

// Horodatage `timestamptz` (comment_interactions) : avec décalage, comme en base.
function ilYaTz(minutes) { return new Date(Date.now() - minutes * 60000).toISOString().replace("Z", "+00:00"); }

// ── Miroir en mémoire de la fonction SQL `fil_compteurs` ────────────────────
function completerFilCompteurs(srv) {
  if (srv.__filCompteursAudit) return srv;
  srv.__filCompteursAudit = true;
  const origine = srv.traiter.bind(srv);
  const lireJeton = (h) => {
    try {
      const tok = String((h && h.authorization) || "").replace(/^Bearer\s+/i, "");
      const p = tok.split(".")[1];
      return JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    } catch (e) { return null; }
  };
  srv.traiter = async function (req) {
    let url = null;
    try { url = new URL(req.url()); } catch (e) {}
    const estCompteurs = url && req.method() === "POST" && /\/rest\/v1\/rpc\/fil_compteurs$/.test(url.pathname);
    // Une panne programmée (ou un jeton expiré simulé) garde la main : le
    // scénario qui l'a posée mesure le REFUS, pas ce miroir.
    const panne = srv.refusToutes401 || (srv.pannes || []).some((p) => (!p.table || p.table === "fil_compteurs") && (!p.methode || p.methode === "POST"));
    if (!estCompteurs || panne) return origine(req);
    const claims = lireJeton(req.headers());
    if (claims && claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return origine(req);
    const role = claims && claims.role === "authenticated" && claims.sub ? "authenticated" : "anon";
    const moi = role === "authenticated" ? claims.sub : null;
    let corps = null; try { corps = JSON.parse(req.postData() || "null"); } catch (e) {}
    const ids = [...new Set(((corps && corps._post_ids) || []).filter(Boolean))].slice(0, 60);
    srv.journal.push({ t: Date.now(), me: moi, role, m: "POST", table: "fil_compteurs", rpc: true, url: url.pathname, body: corps, reponse: "miroir-audit" });
    const recent = (a, b) => (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : (a.created_at < b.created_at ? 1 : -1));
    const lignes = ids.map((pid) => {
      const likes = srv.t.post_likes.filter((l) => l.post_id === pid && srv.selectOk("post_likes", l, moi, role));
      const coms = srv.t.post_comments.filter((k) => k.post_id === pid && srv.selectOk("post_comments", k, moi, role));
      const reactions = srv.t.comment_interactions
        .filter((i) => i.comment_id === pid && (i.kind === "emoji" || i.kind === "gif") && i.payload != null)
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      return {
        post_id: pid,
        likes: likes.length,
        aime: likes.some((l) => l.user_id === moi),
        commentaires: coms.length,
        apercus: coms.slice().sort(recent).slice(0, 2).map((a) => ({ id: a.id, author_id: a.author_id, content: a.content, created_at: a.created_at })),
        reactions: reactions.map((i) => ({ user_id: i.user_id, kind: i.kind, payload: i.payload, created_at: i.created_at })),
      };
    });
    return { status: 200, contentType: "application/json", body: JSON.stringify(lignes), headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" } };
  };
  return srv;
}

const TEXTE_LONG = "Trois semaines pour apprendre « Blackbird » en picking : ce qui a marché, ce qui m'a fait perdre du temps.\n\n"
  + "1. Travailler la main droite seule, corde à vide, avant de poser le moindre accord.\n"
  + "2. Un métronome à 50, pas plus. La vitesse vient toute seule quand le geste est propre.\n"
  + "3. Enregistrer chaque séance : on entend ce qu'on ne sent pas sous les doigts.\n\n"
  + "Ce qui m'a fait perdre du temps : vouloir jouer le morceau en entier dès le premier soir, et changer de doigté tous les deux jours. "
  + "Si quelqu'un veut les tablatures annotées, je les partage volontiers.";

// Options : { priveSuivi, volume, sansDiscussion, sansStories }
function peupler(srv, ctx, opts) {
  opts = opts || {};
  const { MOI, GENS, media } = ctx;
  completerFilCompteurs(srv);

  // Camille possède trois passions (l'état local du banc : musique, sport, cuisine).
  const moi = srv.prof(MOI.id);
  if (moi) moi.passions = [{ id: "musique", emoji: "🎵" }, { id: "sport", emoji: "🏋️" }, { id: "cuisine", emoji: "🍳" }];

  const post = (id, auteur, minutes, extra) => srv.t.posts.push(Object.assign({
    id, author_id: auteur.id, passion_id: "musique", mood: "all", content: "", media_url: null,
    created_at: base.ilYA(minutes), is_reel: false, overlays: null, vlog: null, shared_from_post_id: null, shared_data: null, event_id: null,
  }, extra || {}));

  // ── Une activité à venir, à laquelle une publication est reliée ──────────
  const dansTroisJours = new Date(Date.now() + 3 * 86400000); dansTroisJours.setUTCHours(17, 30, 0, 0);
  srv.t.events.push({
    id: IDS.activite, author_id: GENS.malik.id, organizer_id: GENS.malik.id, title: "Initiation bloc — salle Vertical",
    passion_id: "sport", lat: 45.7676, lng: 4.8799, city: "Villeurbanne", emoji: "🧗", date_at: dansTroisJours.toISOString().replace("Z", ""),
    description: "Deux heures pour découvrir le bloc. Chaussons prêtés sur place, débutants bienvenus.", venue: "Salle Vertical",
    postal_code: "69100", price: 0, max_attendees: 8, external_link: "", event_type: "Atelier", cover_url: media("couverture-evenement.jpg"),
    end_at: null, status: "active", updated_at: null, created_at: base.ilYA(60 * 30), co_organizers: [], series_id: null, recurrence: "none", conv_id: null,
  });
  srv.t.event_attendees.push({ event_id: IDS.activite, user_id: GENS.malik.id, rsvp: "going", checked_in_at: null, created_at: base.ilYA(60 * 29) });
  srv.t.event_attendees.push({ event_id: IDS.activite, user_id: GENS.lea.id, rsvp: "going", checked_in_at: null, created_at: base.ilYA(60 * 20) });

  // ── Publications de tous types ───────────────────────────────────────────
  post(IDS.texteCourt, GENS.lea, 25, { mood: "creation", content: "Et si on montait un petit ensemble de guitares pour la fête de la musique ?" });
  post(IDS.relieActivite, GENS.malik, 40, { passion_id: "sport", mood: "irl", content: "Samedi 18 h 30, initiation bloc à Villeurbanne. Il reste des places, venez comme vous êtes.", event_id: IDS.activite, media_url: media("couverture-evenement.jpg") });
  post(IDS.texteLong, GENS.lea, 75, { mood: "learn", content: TEXTE_LONG });
  post(IDS.paysage, GENS.malik, 95, { passion_id: "sport", content: "Sortie falaise du dimanche. Le rocher était parfait.", media_url: media("photo-paysage.jpg") });
  post(IDS.portrait, GENS.lea, 120, { passion_id: "cuisine", mood: "creation", content: "Tarte fine aux poires, pâte maison.", media_url: media("photo-portrait.jpg") });
  post(IDS.haute, GENS.malik, 160, { passion_id: "sport", content: "La voie entière, du pied au relais.", media_url: media("photo-haute.jpg") });
  post(IDS.carre, GENS.lea, 200, { content: "", media_url: media("photo-carre.jpg") });                                   // photo SANS texte
  post(IDS.video, GENS.lea, 240, { mood: "learn", content: "Le geste de la main droite, au ralenti.", media_url: media("boucle.webm") + "#videos/" });
  post(IDS.audio, GENS.long, 280, { content: "Extrait de la répétition de jeudi.", media_url: media("boucle.webm") + "#audios/" });
  post(IDS.photoAbsente, GENS.malik, 330, { passion_id: "sport", content: "Photo du topo (le fichier ne répond plus).", media_url: media("introuvable.jpg") });
  post(IDS.repartage, GENS.malik, 380, {
    passion_id: "musique", content: "📤 A partagé un post\n\n🎵 Léa Fontaine – Musique\n\n\"Chevalet recollé, cordes neuves. Elle sonne mieux qu'à l'achat.\"",
    shared_from_post_id: IDS.photoAtelier,
    shared_data: JSON.stringify({ id: IDS.photoAtelier, text: "Chevalet recollé, cordes neuves. Elle sonne mieux qu'à l'achat.", authorName: GENS.lea.nom, authorEmoji: "🎸", authorColor: "#7c3aed", passion: "musique" }),
  });
  post(IDS.partageActivite, GENS.lea, 420, {
    passion_id: "sport", mood: "irl", content: "📍 A partagé un événement\n\nInitiation bloc — salle Vertical\n🏋️ Sport · Villeurbanne",
    shared_data: JSON.stringify({ kind: "event", id: IDS.activite, title: "Initiation bloc — salle Vertical", city: "Villeurbanne", venue: "Salle Vertical", date: dansTroisJours.getTime(), passion: "sport" }),
  });
  post(IDS.prive, GENS.prive, 50, { content: "Répétition privée du quatuor — réservé à mes abonnés.", media_url: media("photo-carre.jpg") });
  post(IDS.moiTexte, MOI, 15, { mood: "creation", content: "Qui a déjà essayé les cordes en nylon tension forte sur une folk ?" });

  // Compte privé SUIVI : la demande du socle (« pending ») devient acceptée.
  if (opts.priveSuivi) {
    const f = srv.t.follows.find((x) => x.follower_id === MOI.id && x.following_id === GENS.prive.id);
    if (f) f.status = "accepted";
  }

  // ── J'aime ───────────────────────────────────────────────────────────────
  const aime = (pid, qui) => srv.t.post_likes.push({ post_id: pid, user_id: qui.id, created_at: base.ilYA(5) });
  [GENS.malik, GENS.ines, GENS.tom, GENS.long].forEach((g) => aime(IDS.photoAtelier, g));
  aime(IDS.photoAtelier, MOI);                                           // je l'ai déjà aimée
  [GENS.lea, GENS.ines].forEach((g) => aime(IDS.relieActivite, g));
  [GENS.malik, GENS.tom, GENS.ines].forEach((g) => aime(IDS.texteLong, g));
  [GENS.lea, GENS.malik].forEach((g) => aime(IDS.moi, g));
  aime(IDS.moiTexte, GENS.lea);

  // ── Réactions emoji portées par des PUBLICATIONS (comment_id = post_id) ──
  let nCi = 0;
  const interaction = (cible, fil, qui, kind, payload, minutes) => srv.t.comment_interactions.push({
    id: "ci_fil_" + String(++nCi).padStart(3, "0"), comment_id: cible, post_id: fil, user_id: qui.id, kind, payload: payload == null ? "" : payload, created_at: ilYaTz(minutes),
  });
  interaction(IDS.photoAtelier, IDS.photoAtelier, GENS.malik, "emoji", "🔥", 9);
  interaction(IDS.photoAtelier, IDS.photoAtelier, GENS.ines, "emoji", "😍", 8);
  interaction(IDS.photoAtelier, IDS.photoAtelier, GENS.tom, "emoji", "🔥", 7);
  interaction(IDS.moi, IDS.moi, GENS.lea, "emoji", "👏", 600);

  // ── Discussions ──────────────────────────────────────────────────────────
  if (!opts.sansDiscussion) {
    const com = (id, pid, auteur, minutes, texte) => srv.t.post_comments.push({ id, post_id: pid, author_id: auteur.id, content: texte, created_at: base.ilYA(minutes) });
    // 34 commentaires sur la photo de l'atelier (page serveur = 30 → « précédents »).
    const voix = [GENS.malik, GENS.ines, GENS.tom, GENS.long];
    const phrases = [
      "Beau boulot, on voit que le collage est propre.", "Tu as utilisé quelle colle ?", "Elle a quel âge, cette guitare ?",
      "Ça donne envie de ressortir la mienne du placard.", "Le son doit être plus rond maintenant, non ?", "Tu fais ça dans ton salon ?",
      "Je n'aurais jamais osé décoller un chevalet.", "Combien de temps de séchage ?", "Les cordes, c'est du 12-53 ?", "Magnifique.",
    ];
    for (let i = 1; i <= 28; i++) {
      com("c_fil_" + String(i).padStart(2, "0"), IDS.photoAtelier, voix[i % voix.length], 9 * 60 - i * 15, phrases[i % phrases.length]);
    }
    com("c_fil_lien", IDS.photoAtelier, GENS.ines, 100, "Le tuto qui m'a aidée : https://exemple.test/lutherie/chevalet — et bravo @Léa Fontaine #lutherie");
    com("c_fil_long", IDS.photoAtelier, GENS.long, 80, "J'ai eu exactement le même souci sur un violoncelle d'étude : le chevalet avait glissé d'un bon millimètre après un hiver passé près d'un radiateur. Le luthier m'a expliqué que le bois travaille bien plus qu'on ne l'imagine, et qu'il vaut mieux détendre les cordes d'un demi-ton quand l'instrument dort plusieurs semaines. Depuis, je le fais systématiquement, et plus aucun décollement.");
    com("c_fil_image", IDS.photoAtelier, GENS.tom, 60, media("photo-carre.jpg"));                 // commentaire « GIF » : une URL d'image
    com("c_fil_moi", IDS.photoAtelier, MOI, 45, "Tu me montreras ? J'ai le même décollement sur ma folk.");
    com("c_fil_malik", IDS.photoAtelier, GENS.malik, 30, "On en parle jeudi à la salle, j'apporte la mienne.");
    com("c_fil_recent", IDS.photoAtelier, GENS.ines, 10, "Je veux bien une photo du résultat de près !");
    // j'aime, réponses et réactions sur ces commentaires
    interaction("c_fil_recent", IDS.photoAtelier, GENS.lea, "like", "", 9);
    interaction("c_fil_recent", IDS.photoAtelier, GENS.malik, "like", "", 8);
    interaction("c_fil_malik", IDS.photoAtelier, GENS.lea, "reply", "Parfait, j'amène les serre-joints.", 28);
    interaction("c_fil_malik", IDS.photoAtelier, GENS.tom, "reply", "Je peux passer aussi ?", 26);
    interaction("c_fil_malik", IDS.photoAtelier, GENS.ines, "emoji", "👍", 25);
    interaction("c_fil_moi", IDS.photoAtelier, GENS.lea, "reply", "Avec plaisir, passe samedi matin.", 40);
    interaction("c_fil_moi", IDS.photoAtelier, GENS.lea, "like", "", 41);
    interaction("c_fil_long", IDS.photoAtelier, GENS.malik, "emoji", "😮", 70);
    interaction("c_fil_long", IDS.photoAtelier, GENS.ines, "emoji", "😮", 69);
    // Deux commentaires sur une publication de Malik, trois sur la mienne (dont un épinglé par moi).
    com("c_fil_act_1", IDS.relieActivite, GENS.lea, 35, "J'en suis. Il faut réserver ?");
    com("c_fil_act_2", IDS.relieActivite, GENS.tom, 32, "Première fois pour moi, ça ira ?");
    com("c_fil_m_1", IDS.moi, GENS.lea, 60 * 28, "Très joli thème. La deuxième partie surtout.");
    com("c_fil_m_2", IDS.moi, GENS.malik, 60 * 27, "Je l'ai en tête depuis ce matin.");
    com("c_fil_m_3", IDS.moi, GENS.ines, 60 * 26, "Tu l'as enregistrée avec quoi ?");
    interaction("c_fil_m_1", IDS.moi, MOI, "pin", "1", 60 * 25);
  }

  // ── Stories de comptes suivis (moins de 24 h) ────────────────────────────
  if (!opts.sansStories) {
    const story = (id, auteur, minutes, extra) => srv.t.stories.push(Object.assign({
      id, author_id: auteur.id, passion_id: "musique", content: "", emoji: "✨", media_url: null, media_type: null, overlays: null, created_at: base.ilYA(minutes),
    }, extra || {}));
    story("st_fil_lea_1", GENS.lea, 90, { content: "Atelier ouvert ce soir", media_url: media("photo-atelier.jpg"), media_type: "photo" });
    story("st_fil_lea_2", GENS.lea, 30, { content: "Les cordes sont arrivées !" });
    story("st_fil_malik", GENS.malik, 200, { passion_id: "sport", content: "Nouvelle voie ouverte", media_url: media("photo-haute.jpg"), media_type: "photo" });
    story("st_fil_long", GENS.long, 400, { content: "Répétition jeudi 19 h" });
  }

  // ── Fil volumineux : 64 publications de plus, réparties sur dix jours ────
  if (opts.volume) {
    const auteurs = [GENS.lea, GENS.malik, GENS.long];
    const passions = ["musique", "sport", "musique"];
    const photos = ["photo-paysage.jpg", "photo-carre.jpg", "photo-atelier.jpg", "photo-portrait.jpg"];
    for (let i = 1; i <= 64; i++) {
      const k = i % auteurs.length;
      post("pv_" + String(i).padStart(3, "0"), auteurs[k], 8 * 60 + i * 200, {
        passion_id: passions[k], mood: ["all", "creation", "learn", "all"][i % 4],
        content: "Publication n° " + i + " du fil volumineux — " + ["séance du matin", "note d'atelier", "répétition", "essai de matériel"][i % 4] + ".",
        media_url: i % 3 === 0 ? media(photos[i % photos.length]) : null,
      });
    }
  }
  return srv;
}

// Un compte connecté SANS aucune publication réelle ni abonnement (fil d'exemples seuls).
function peuplerVide(srv, ctx) {
  completerFilCompteurs(srv);
  return srv;
}

module.exports = { IDS, peupler, peuplerVide, completerFilCompteurs, ilYaTz, TEXTE_LONG };
