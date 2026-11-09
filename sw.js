// Version du cache. En PROD, scripts/build.js réécrit cette ligne avec le buildId
// (HTML et scripts inlinés, les 9 scripts app/, CSS) → réinstallation auto du SW à
// chaque vraie modif (plus de bump manuel). En DEV (sw.js servi tel quel, sans
// build), Date.now() suffit.
const CACHE = "passio-v" + Date.now();

// Les fichiers VERSIONNÉS de CETTE version (2026-11-09) : les 9 scripts du bloc app
// et la feuille de style. En PROD, scripts/build.js réécrit cette ligne avec leurs
// adresses (`./app/<nom>.js?v=<hash>`, `./styles.css?v=<hash>`), comme CACHE.
// En DEV (sw.js servi tel quel), aucune : les js/app-*.js partent au réseau.
const FICHIERS_VERSION = [];

// Un fichier VERSIONNÉ : son adresse porte l'empreinte de son contenu (scripts/build.js :
// `app/<nom>.js?v=<hash>`, `styles.css?v=<hash>`) — il ne change jamais sous elle.
function estVersionne(url) {
  return /^\?v=[0-9a-f]{6,40}$/.test(url.search) && /\.(js|css)$/.test(url.pathname);
}
// Ce qu'on accepte d'en garder sans jamais le revalider : une réponse complète du
// site, du type attendu. Une page de portail captif (200, text/html) n'est pas un script.
function contenuVersionne(url, res) {
  if (!res || !res.ok || res.type !== "basic") return false;
  const type = String(res.headers.get("Content-Type") || "");
  return url.pathname.endsWith(".css") ? /text\/css/i.test(type) : /javascript|ecmascript/i.test(type);
}

// Répond au message SKIP_WAITING
self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Installation : pré-cache les fichiers essentiels pour un vrai fonctionnement offline
self.addEventListener("install", e => {
  self.skipWaiting(); // Active immédiatement sans attendre la fermeture des onglets
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // Chaque fichier est ajouté individuellement : un échec n'empêche pas les autres
      Promise.allSettled([
        ...[
          "./index.html",
          "./styles.css",
          "./manifest.json",
          "./icon-192.png",
          "./icon-512.png",
        ].map(url => c.add(url).catch(() => {})),
        // ⚠️ LES FICHIERS DE LA VERSION, ET D'ABORD CEUX QU'ON A DÉJÀ (2026-11-09).
        // L'activation VIDE l'ancien cache : sans ceci, chaque script repartait au
        // réseau au premier chargement qui suit une mise à jour — sauf à le trouver
        // dans le cache HTTP du navigateur, que le `fetch` d'un worker WebKit ne
        // voit pas (mesuré sous WebKit : les 9 retéléchargés pour UN fichier
        // modifié ; la feuille de style, à chaque version). Un fichier inchangé
        // garde son adresse : on le recopie de l'ancien cache, encore là pendant
        // l'installation ; seuls les fichiers modifiés partent sur le réseau, une
        // fois, ici. Ce qui est en cache y est entré vérifié (`contenuVersionne`) ;
        // ce qui vient du réseau l'est ici. Verrou :
        // tests/e2e/app-scripts-par-fichier.spec.js ④ (Chromium et WebKit).
        ...FICHIERS_VERSION.map(adresse =>
          caches.match(adresse)
            .then(r => r || fetch(adresse).then(res => (contenuVersionne(new URL(adresse, self.location.href), res) ? res : null)))
            .then(r => r && c.put(adresse, r))
            .catch(() => {})),
      ])
    )
  );
});

// Activation : supprime tous les anciens caches et prend le contrôle
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => {
        // ⚠️ UNE PREMIÈRE INSTALLATION N'EST PAS UNE MISE À JOUR (UXO-11, 2026-11-04).
        // `activate` se déclenche aussi sur un appareil vierge : annoncer
        // SW_UPDATED à chaque fois faisait écrire « Mise à jour disponible —
        // recharge pour l'appliquer » (app-09) sur le tout premier écran d'un
        // nouveau visiteur, qui n'avait rien à mettre à jour.
        // La preuve qu'une version précédente a tourné ici, c'est son cache :
        // durable, contrairement à une variable posée dans `install` (le
        // navigateur peut arrêter le worker entre les deux événements). Le préfixe
        // compte : le centre de pilotage (`passio-pilotage-*`, même origine) n'est
        // pas une version de l'application.
        // ⚠️ LA GARDE EST ICI, PAS DANS LA PAGE. Une page ouverte sans contrôleur
        // qui reçoit un VRAI déploiement ne recharge pas toute seule
        // (`hadController`, pwa-detect.js) : pour elle, ce message est la seule
        // façon de l'apprendre. Le filtrer côté page la laisserait sur l'ancienne
        // version, en silence.
        const versionPrecedente = keys.some(k => k !== CACHE && k.startsWith("passio-v"));
        return Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
          .then(() => self.clients.claim()) // Prend le contrôle immédiatement
          .then(() => {
            if (!versionPrecedente) return;
            // Notifie tous les onglets ouverts de recharger
            return self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
              clients.forEach(client => client.postMessage({ type: "SW_UPDATED" }));
            });
          });
      })
  );
});

// ════════════════════════════════════════════════════════════════════════
// WEB PUSH — appels entrants même app fermée
// ════════════════════════════════════════════════════════════════════════
// Identifiant d'activité admis dans une URL ouverte par une notification
// (même forme que le routeur `#irl-event-` d'app-07 et que _shared/rappels.js).
const ID_ACTIVITE_RE = /^[\w-]{1,64}$/;

// Accusé de réception (2026-11-06, supabase/functions/_shared/reception.js) :
// APRÈS l'affichage, un dépôt SANS CONTENU — { pid, genre } — dans
// telemetry_events, à l'adresse que porte la notification (URL du projet et clé
// anon, publique). Le pid est aléatoire et ne voyage que dans la notification :
// le serveur ne compte que les pid qu'il a envoyés. L'affichage ne dépend JAMAIS
// de l'accusé, et une adresse qui n'a pas sa forme n'est jamais appelée.
// Genres accusés : `pilotage`, `rappel`, `appel` (2026-11-07, un appel sur dix
// en porte un : supabase/functions/_shared/appels.js) et `notif` (même jour, une
// notification sociale sur vingt).
const RE_PID_PUSH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RE_BASE_ACCUSE = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;
// La clé : l'ancienne anon (un JWT) ou la nouvelle, publiable (2026-11-07). La
// publiable ne part QU'EN `apikey` : en Bearer, la plateforme la lit comme un JWT
// et refuse la requête (« Invalid JWT »).
const RE_CLE_ACCUSE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const RE_PUBLIABLE_ACCUSE = /^sb_publishable_[A-Za-z0-9_-]{8,200}$/;
function accuser(data, genre) {
  try {
    const a = data && data.ack;
    if (!data || !RE_PID_PUSH.test(String(data.pid || "")) || !a || typeof a !== "object") return Promise.resolve();
    const u = String(a.u || ""), k = String(a.k || "");
    const publiable = RE_PUBLIABLE_ACCUSE.test(k);
    if (!RE_BASE_ACCUSE.test(u) || !(RE_CLE_ACCUSE.test(k) || publiable) || k.length >= 2000) return Promise.resolve();
    const octets = new Uint8Array(8);
    crypto.getRandomValues(octets);
    const corps = [{
      event_id: Array.from(octets, (o) => o.toString(16).padStart(2, "0")).join(""),
      client_ts: new Date().toISOString(), type: "push", action: "recu", status: "ok",
      meta: { pid: data.pid, genre: String(genre || "").slice(0, 16) },
    }];
    const envoyer = () => fetch(u + "/rest/v1/telemetry_events", {
      method: "POST",
      headers: publiable ? { "Content-Type": "application/json", apikey: k, Prefer: "return=minimal" }
        : { "Content-Type": "application/json", apikey: k, Authorization: "Bearer " + k, Prefer: "return=minimal" },
      body: JSON.stringify(corps),
    });
    // Un refus de débit (429 : le réservoir des envois anonymes est commun) ou une
    // coupure : UN second essai après 5 s, jamais plus — l'événement push ne vit
    // que le temps de son waitUntil.
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    return envoyer()
      .then((r) => (r && r.status === 429 ? pause(5000).then(envoyer) : r), () => pause(5000).then(envoyer))
      .then(() => {}, () => {});
  } catch (_e) { return Promise.resolve(); }
}

// Réception d'une push : affiche une notification « Appel entrant » persistante
// avec un bouton Répondre. Le tap ouvre l'app sur l'écran d'appel.
self.addEventListener("push", e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_e) { data = {}; }

  // Alerte du PILOTAGE (fonction `pilotage`, veille pg_cron) : le tap ouvre
  // /pilotage/, jamais l'app. Texte borné : il vient du serveur, mais une
  // notification n'a rien à faire d'un paragraphe.
  if (data.type === "pilotage") {
    const titre = String(data.titre || "PASSIO Pilotage").slice(0, 80);
    e.waitUntil(self.registration.showNotification(titre, {
      body: String(data.texte || "").slice(0, 160),
      tag: "passio-pilotage",
      renotify: true,
      icon: "./pilotage/icons/pilot-192.png",
      badge: "./icon-192.png",
      data: { url: "./pilotage/" },
    }).then(() => accuser(data, "pilotage")));
    return;
  }

  // Rappel d'activité (veille pg_cron → fonction `pilotage`, _shared/rappels.js,
  // 2026-10-05) — app fermée. Le tap ouvre l'activité. L'identifiant entre dans
  // une URL : il est revérifié ici, quoi que le serveur ait vérifié. Une même
  // activité garde UNE notification (tag) : le rappel de H-2 remplace la veille.
  if (data.type === "rappel") {
    const id = ID_ACTIVITE_RE.test(String(data.eventId || "")) ? String(data.eventId) : "";
    e.waitUntil(self.registration.showNotification("⏰ " + String(data.titre || "Ton activité").slice(0, 70), {
      body: String(data.texte || "").slice(0, 160),
      tag: "passio-rappel-" + (id || "activite"),
      renotify: true,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      data: { url: id ? "./#irl-event-" + id : "./" },
    }).then(() => accuser(data, "rappel")));
    return;
  }

  // Notif sociale (like, follow, commentaire, message…) — app fermée ou en arrière-plan.
  // L'accusé APRÈS l'affichage (2026-11-07) : une notification sur vingt, tirée par
  // `notify-call`, porte un pid ; sans pid, rien ne part. Ni le texte, ni le genre,
  // ni l'emoji n'entrent dans l'accusé, et le tap n'en sait rien.
  if (data.type === "notif") {
    const opts = {
      body: data.text || "Nouvelle notification",
      tag: "passio-notif-" + (data.kind || "notif"),
      renotify: true,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      data: { url: "./" },
    };
    e.waitUntil(self.registration.showNotification((data.emoji || "🔔") + " PASSIO", opts).then(() => accuser(data, "notif")));
    return;
  }

  if (data.type !== "call") return;
  const title = (data.emoji || "📞") + " " + (data.name || "Quelqu'un") + " t'appelle";
  const opts = {
    body: data.kind === "video" ? "Appel vidéo entrant — touche pour répondre" : "Appel entrant — touche pour répondre",
    tag: "passio-call-" + (data.callId || ""),
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: { callId: data.callId, from: data.from, kind: data.kind, name: data.name, emoji: data.emoji },
    actions: [
      { action: "answer", title: "✅ Répondre" },
      { action: "decline", title: "📵 Refuser" },
    ],
  };
  // L'accusé APRÈS l'affichage (2026-11-07) : un appel tiré au sort par
  // `notify-call` porte un pid ; sans pid, rien ne part. L'interface d'appel
  // (titre, boutons, `data` du tap) n'en sait rien.
  e.waitUntil(self.registration.showNotification(title, opts).then(() => accuser(data, "appel")));
});

// Tap sur la notification (ou un de ses boutons) → ouvre/focus l'app avec les
// paramètres d'appel dans l'URL. La page lit ?call=… au boot et ouvre l'écran
// d'appel entrant (réponse explicite par l'utilisateur).
self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "decline") return;

  // Alerte du pilotage → ouvrir le pilotage (onglet existant s'il y en a un).
  if (e.notification.tag === "passio-pilotage") {
    e.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
        for (const c of clients) { if (c.url && c.url.indexOf("/pilotage/") >= 0 && "focus" in c) return c.focus(); }
        if (self.clients.openWindow) return self.clients.openWindow("./pilotage/");
      })
    );
    return;
  }

  // Notif sociale → ouvrir/focuser l'app (pas de paramètres d'appel).
  if (e.notification.tag && e.notification.tag.startsWith("passio-notif-")) {
    e.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
        for (const c of clients) { if ("focus" in c) return c.focus(); }
        if (self.clients.openWindow) return self.clients.openWindow("./");
      })
    );
    return;
  }

  // Notification qui porte sa DESTINATION (`data.url`) : rappel d'activité, et
  // le digest « ça se passe près de toi » (app-07, `tag: "irl-digest"`) — qui,
  // faute de cette branche, tombait dans le traitement d'un APPEL ci-dessous et
  // ouvrait l'accueil avec un `?call=` vide au lieu de l'activité. Seules deux
  // formes sont admises (l'accueil, ou une activité) : rien d'autre n'est ouvert.
  const d = e.notification.data || {};
  if (typeof d.url === "string" && !d.callId) {
    const m = /^\.\/#irl-event-([\w-]{1,64})$/.exec(d.url);
    const id = m ? m[1] : "";
    e.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
        for (const c of clients) {
          if ("focus" in c) {
            // App ouverte : elle ouvre l'activité elle-même (même routeur qu'un lien).
            if (id) c.postMessage({ type: "OUVRIR_ACTIVITE", id });
            return c.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(id ? "./#irl-event-" + id : "./");
      })
    );
    return;
  }

  const qs = "?call=" + encodeURIComponent(d.callId || "") +
             "&from=" + encodeURIComponent(d.from || "") +
             "&kind=" + encodeURIComponent(d.kind || "voice") +
             "&cname=" + encodeURIComponent(d.name || "") +
             "&cemoji=" + encodeURIComponent(d.emoji || "");
  const target = "./" + qs;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        if ("focus" in c) {
          // App déjà ouverte : on la focus et on lui transmet l'appel via message.
          c.postMessage({ type: "INCOMING_CALL", call: d });
          return c.focus();
        }
      }
      // App fermée : on l'ouvre sur l'URL qui déclenche l'écran d'appel.
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

// ── Revalidation de la page (2026-11-09) ─────────────────────────────────────
// Au-delà de cet âge, la copie gardée n'est plus revalidée : la page repart
// entière. ⚠️ UN 304 N'APPORTE PAS LES EN-TÊTES DE SÉCURITÉ (mesuré sur Netlify :
// ni CSP ni Permissions-Policy dans le 304) — une copie servie sur 304 garde ceux
// de son propre téléchargement. Une CSP modifiée sans que la page change
// s'applique donc au plus tard au bout de ce délai, jamais « jamais ».
const PAGE_REVALIDATION_MAX_MS = 24 * 3600 * 1000;

// La copie gardée de la page : celle de l'adresse, sinon celle pré-cachée à
// l'installation. Ne rejette jamais (Safari, navigation privée : `caches.match`
// peut rejeter) — rend null. Une copie qui ne serait pas la bonne ne coûte rien :
// l'ETag est l'empreinte du CONTENU, Netlify ne répond 304 qu'à l'identique.
function chercherCopiePage(cle) {
  return caches.match(cle)
    .then(c => c || caches.match("./index.html"))
    .then(c => c || null)
    .catch(() => null);
}

// L'ETag à renvoyer en `If-None-Match`, ou null pour tout retélécharger : pas de
// copie, pas d'ETag, pas de date lisible, copie trop ancienne. ⚠️ L'âge se lit en
// VALEUR ABSOLUE : la date est celle du serveur, l'horloge celle du téléphone, et
// un téléphone en retard de quelques secondes rendait un âge négatif — refuser
// le négatif l'aurait privé de toute revalidation, pour toujours.
function etagRevalidable(copie) {
  try {
    if (!copie || copie.status !== 200) return null;
    const etag = copie.headers.get("ETag");
    const date = Date.parse(copie.headers.get("Date") || "");
    if (!etag || !Number.isFinite(date)) return null;
    if (Math.abs(Date.now() - date) > PAGE_REVALIDATION_MAX_MS) return null;
    return etag;
  } catch (e) { return null; }
}

// Fetch : network-first pour index.html, cache-first pour le reste
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Ne pas intercepter les appels externes (Supabase, CDN Leaflet, etc.)
  if (url.hostname !== self.location.hostname) return;

  // Les médias passent par /media/* (Edge Function, docs/CDN_MEDIAS.md) : MÊME
  // origine que l'app depuis le 2026-09-11, donc ils tomberaient dans le
  // stale-while-revalidate ci-dessous — chaque vidéo vue (25 Mo) copiée dans
  // le Cache Storage de l'appareil, sans borne, et un média supprimé servi à
  // vie depuis l'appareil (la revalidation reçoit un 404, qui ne remplace
  // rien). Le cache HTTP du navigateur suffit : l'Edge Function pose ses
  // propres en-têtes. On laisse passer, comme les appels externes.
  if (url.pathname.startsWith("/media/")) return;

  // Liens courts de partage (/p/<id>, /u/<id>, /e/<id>) : l'Edge Function
  // netlify/edge-functions/apercu.js répond un 302 vers le lien profond. JAMAIS
  // de cache ici : le stale-while-revalidate ci-dessous, s'il gardait un jour une
  // réponse, la resservirait à vie. Réseau seul — et HORS LIGNE, quand la PWA
  // installée capte le lien, on renvoie vers le lien profond que l'app ouvre
  // depuis son repli index.html (même table que la fonction), plutôt que vers la
  // page d'erreur du navigateur.
  if (/^\/[pue]\//.test(url.pathname)) {
    if (e.request.mode !== "navigate") return;
    const lien = /^\/([pue])\/([A-Za-z0-9_-]{1,100})\/?$/.exec(url.pathname);
    const hash = lien ? { p: "#post-", u: "#user-", e: "#irl-event-" }[lien[1]] + lien[2] : "";
    // L'invitation (`inv`, un uuid de compte) suit le lien, comme le fait la fonction en ligne.
    const inv = url.searchParams.get("inv");
    const q = inv && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inv) ? "?inv=" + inv.toLowerCase() : "";
    e.respondWith(fetch(e.request).catch(() => Response.redirect(self.location.origin + "/" + q + hash, 302)));
    return;
  }

  // index.html → toujours réseau d'abord pour avoir la dernière version — mais
  // une requête CONDITIONNELLE (2026-11-09, capacité sans investir).
  //
  // ⚠️ LA PAGE ENTIÈRE (106 Ko compressés) PARTAIT À CHAQUE OUVERTURE. Netlify la
  // sert en `no-store` (`_headers`) et ce worker la redemandait en `no-store` : jamais
  // de 304, alors que Netlify en rend un sur `If-None-Match` (mesuré le 2026-11-09).
  // À 25 000 appareils ouvrant l'app trois fois par jour, ~240 Go/mois — plus que
  // les 100 Go du forfait Netlify à eux seuls, pour une page qui ne change qu'au
  // déploiement. On renvoie donc l'ETag de la copie gardée ici : un 304 (quelques
  // centaines d'octets) fait servir cette copie, un 200 la remplace.
  // Le cache HTTP du navigateur reste en `no-store` : rien n'y est écrit, ni la page
  // ni une adresse portant des jetons de connexion (audit 2026-11-06).
  // `/`, `/index.html` et `/?…` portent le MÊME ETag (mesuré) : la copie pré-cachée
  // à l'installation (`./index.html`) vaut pour la première navigation qui suit un
  // déploiement — sans elle, la page partait deux fois par mise en ligne.
  if (
    url.pathname === "/" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("index.html")
  ) {
    // La clé de cache est l'adresse SANS requête ni fragment (audit 2026-11-06) :
    // une navigation depuis un lien de connexion porte des jetons dans son URL, et
    // `Cache.put` conserverait la requête telle quelle sur l'appareil.
    const cle = new Request(url.origin + url.pathname);
    e.respondWith(
      chercherCopiePage(cle)
        .then(copie => {
          const etag = etagRevalidable(copie);
          // `redirect: "manual"` comme la navigation elle-même : une réponse
          // REDIRIGÉE rendue à une navigation est refusée par le navigateur.
          const requete = etag
            ? new Request(e.request.url, { headers: { "If-None-Match": etag }, cache: "no-store", credentials: "same-origin", redirect: "manual" })
            : e.request;
          return fetch(requete, { cache: "no-store" }).then(res => {
            if (res && res.status === 304 && copie) return copie;
            // Cloner AVANT que le body soit lu (le clone est asynchrone via
            // caches.open ; res part vers le navigateur en parallèle).
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then(c => c.put(cle, copy)).catch(() => {});
            }
            return res;
          });
        })
        // ⚠️ respondWith NE DOIT JAMAIS résoudre sur undefined/null : Safari
        // affiche « Returned response is null » et refuse la page. On garantit
        // donc TOUJOURS une Response réelle en dernier recours.
        // Hors ligne : la copie la plus récente d'abord (celle de l'adresse, gardée
        // au dernier 200), puis celle de l'installation.
        .catch(() =>
          chercherCopiePage(cle)
            .then(cached => cached || caches.match(e.request, { ignoreSearch: true }))
            .then(cached => cached || new Response(
              "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
              "<title>PASSIO</title><body style='font-family:system-ui;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:2rem;color:#333'>" +
              "<div><p style='font-size:1.1rem'>Connexion interrompue.</p>" +
              "<p><a href='./' style='color:#7c3aed;font-weight:600'>Recharger PASSIO</a></p></div></body>",
              { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
            ))
            .catch(() => new Response("", { status: 503 }))
        )
    );
    return;
  }

  // Scripts SANS chaîne de version → réseau d'abord.
  // En prod, les 9 scripts app/ et styles.css portent chacun le hash de LEUR
  // contenu (`app/app-04-comments-shop.js?v=93f3893599`) : l'URL d'un fichier ne
  // change que si lui change. Ils ont leur propre branche, plus bas (le cache
  // d'abord, sans revalidation : `estVersionne`).
  // Sans hash — c'est le cas des js/app-*.js servis tels quels en dev — un cache
  // servi d'abord renverrait indéfiniment l'ANCIEN script au premier chargement, et
  // ne rafraîchirait que pour la fois d'après. Le 2026-08-14, ça a produit trois faux
  // échecs de débogage d'affilée : les correctifs étaient bons, c'est du code
  // périmé qui était testé. Un piège qui coûte des heures et ne se voit pas.
  // ⚠️ La protection de la prod vient donc du HASH, pas de ce worker : si les
  // chaînes `?v=` disparaissaient un jour du build, le mélange de versions
  // reviendrait en silence.
  if (url.pathname.endsWith(".js") && !url.search) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(c => c || new Response("", { status: 503 })))
    );
    return;
  }

  // ⚠️ UN FICHIER VERSIONNÉ NE CHANGE JAMAIS SOUS SON ADRESSE (2026-11-09) → le
  // cache d'abord, le réseau seulement s'il manque, et AUCUNE revalidation. Les 9
  // scripts app/ et styles.css portent l'empreinte de leur contenu : une nouvelle
  // version, c'est une nouvelle adresse. Les revalider en arrière-plan (le
  // stale-while-revalidate ci-dessous, leur sort jusque-là) ne pouvait rien
  // apprendre, et coûtait sous WebKit une requête par script à CHAQUE ouverture
  // (mesuré : 9) — le cache HTTP que consulte le `fetch` d'un worker WebKit n'a pas
  // ce que l'installation a rangé. Verrou : tests/e2e/app-scripts-par-fichier.spec.js ④.
  // ⚠️ SEUL CE QUI EST BIEN UN SCRIPT (ou une feuille de style) ENTRE AU CACHE
  // (`contenuVersionne`) : sans revalidation, une page de portail captif (200,
  // text/html) rangée sous l'adresse d'un script y resterait jusqu'à ce que ce
  // fichier change — et l'installation la recopierait de version en version.
  if (estVersionne(url)) {
    e.respondWith(
      caches.match(e.request)
        .catch(() => null) // Safari, navigation privée : `caches.match` peut rejeter
        .then(cached => cached || fetch(e.request).then(res => {
          if (contenuVersionne(url, res)) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
          }
          return res;
        }))
        .catch(() => new Response("", { status: 503 }))
    );
    return;
  }

  // Icônes, manifest et assets → stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => {
        // Réseau absent : on sert depuis le cache et on notifie l'app
        if (cached) {
          self.clients.matchAll({ includeUncontrolled: true }).then(clients =>
            clients.forEach(c => c.postMessage({ type: "OFFLINE" }))
          );
        }
        return cached || new Response("", { status: 503 });
      });
      return cached || network;
    // caches.match peut rejeter (Safari navigation privée) → on tente le réseau,
    // et on ne laisse JAMAIS respondWith recevoir un rejet non géré.
    }).catch(() => fetch(e.request).catch(() => new Response("", { status: 503 })))
  );
});
