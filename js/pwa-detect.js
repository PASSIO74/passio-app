    if ('serviceWorker' in navigator) {
      // ══════════════════════════════════════════════════════════════════
      // UNE MISE À JOUR NE COUPE NI UN APPEL, NI UN LIVE, NI UNE SAISIE
      // ──────────────────────────────────────────────────────────────────
      // Chaque build qui change réinstalle le worker, et une page contrôlée se
      // rechargeait aussitôt, quoi qu'elle fût en train de faire : mesuré le
      // 2026-11-04 avec le vrai worker et deux vrais artefacts, un appel en cours,
      // une sonnerie et un Live tombaient en moins d'une seconde, et ce qu'on
      // tapait disparaissait (24 caractères tapés, 0 relu dans une conversation ;
      // tout perdu au Studio et dans un commentaire). Fiche :
      // docs/journal/social-messagerie.md.
      //
      // Le rechargement n'est donc jamais annulé : il attend. La nouvelle version
      // a déjà pris la main, seule la page reste sur l'ancienne le temps de finir.
      //
      // ⚠️ L'ÉTAT D'APPEL SE LIT SUR `window.`, ET C'EST CE QUI REND LA LECTURE
      // SÛRE. Ce script tourne en tête de page, avant le bloc app : un `_call` nu
      // lèverait une ReferenceError si le bloc n'a pas chargé, et la page ne se
      // rechargerait plus jamais.
      //
      // ⚠️ IL Y A UN TROU ENTRE LE GESTE ET L'ÉTAT. `acceptIncomingCall` efface la
      // sonnerie, puis attend la permission du micro AVANT de poser `_call` : à cet
      // instant ni l'un ni l'autre n'existe, et recharger perdrait un appel que
      // l'utilisateur vient d'accepter. `_appelLanceA` (app-05) couvre ce trou, et
      // il est BORNÉ dans le temps : un geste abandonné ne retient pas la page.
      const PREPARATION_APPEL_MS = 60000;
      const appelOuLiveEnCours = () => {
        if (window._call || window._callIncoming || window._vliveHost || window._vliveView) return true;
        const lance = window._appelLanceA;
        return typeof lance === 'number' && performance.now() - lance < PREPARATION_APPEL_MS;
      };
      // ⚠️ SEUL COMPTE CE QUE L'UTILISATEUR A TAPÉ (`isTrusted`). Un champ que
      // l'application remplit elle-même (un brouillon restauré, un formulaire de
      // profil) n'a rien à perdre : s'il retenait la page, un simple champ prérempli
      // suffirait à ne plus jamais appliquer de mise à jour. Un WeakSet, pour ne
      // rien retenir d'un champ retiré du DOM ; le texte n'est lu que pour savoir
      // s'il est vide.
      const TYPES_SANS_TEXTE = /^(checkbox|radio|range|color|file|button|submit|reset|image|hidden)$/i;
      const champsSaisis = new WeakSet();
      document.addEventListener('input', (e) => {
        const c = e.target;
        if (!e.isTrusted || !c) return;
        if (c.tagName === 'TEXTAREA' || (c.tagName === 'INPUT' && !TYPES_SANS_TEXTE.test(c.type))) champsSaisis.add(c);
      }, true);
      // Un champ d'un écran masqué ou d'un panneau sorti sur le côté ne compte plus :
      // `#convFpInput` garde son texte quand la conversation se referme, et celui-ci
      // est déjà dans le brouillon. ⚠️ LE CADRE, PAS LA FENÊTRE : sur un grand écran,
      // `.app-shell` ne fait que 440 px, et le panneau refermé reste dans la fenêtre,
      // découpé seulement par le cadre. Pas de test vertical : dans un long formulaire,
      // le champ rempli passe souvent au-dessus ou au-dessous de ce qu'on regarde.
      const saisieEnCours = () => {
        const champs = document.querySelectorAll('input, textarea');
        for (let i = 0; i < champs.length; i++) {
          const c = champs[i];
          if (!champsSaisis.has(c) || !c.value.trim()) continue;
          const r = c.getBoundingClientRect();
          const cadre = (c.closest('.app-shell') || document.documentElement).getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.right > cadre.left && r.left < cadre.right) return true;
        }
        return false;
      };
      const pageOccupee = () => appelOuLiveEnCours() || saisieEnCours();
      window.addEventListener('load', async () => {
        try {
          // ⚠️ CAPTURÉ AVANT register : y a-t-il DÉJÀ un SW qui contrôle la page ?
          // - Première visite : controller === null → la 1re prise de contrôle
          //   (skipWaiting+claim) NE DOIT PAS recharger (sinon la page « saute »
          //   pendant que l'utilisateur saisit le code d'accès → bug testeur iOS).
          // - Visites suivantes : controller existe → un controllerchange = vraie
          //   mise à jour → on recharge pour appliquer la nouvelle version.
          const hadController = !!navigator.serviceWorker.controller;
          // Lu par le toast de mise à jour (app-09). Une page sans contrôleur ne recharge
          // pas d'elle-même : pour elle, ce toast reste la seule annonce (UXO-11).
          window.passioMajDifferee = () => hadController && pageOccupee();
          const reg = await navigator.serviceWorker.register('./sw.js');
          // ══════════════════════════════════════════════════════════════════
          // VÉRIFIER LA MISE À JOUR SANS JAMAIS LE DIRE À PERSONNE
          // ──────────────────────────────────────────────────────────────────
          // ⚠️ `update()` REND UNE PROMESSE, et le `try/catch` qui entoure ce
          // bloc NE L'ATTRAPE PAS : elle rejette plus tard, hors de la pile.
          // Le rejet remontait donc à `unhandledrejection` (js/platform.js) et
          // s'inscrivait dans `client_errors` — « Promise rejetée:
          // newestWorker is null », 5 occurrences en 24 h le 2026-09-08, pile
          // `update@[native code]`, sans le moindre effet pour l'utilisateur.
          //
          // « newestWorker is null » est le libellé de WebKit (iOS/Safari)
          // quand `update()` est demandé sur une registration qui n'a PLUS
          // aucun worker — installing, waiting et active tous nuls :
          // désinscription, worker devenu redondant, stockage du site vidé.
          // La minuterie de 60 s garde une référence sur cette registration :
          // elle repose donc la question toutes les minutes, et chaque refus
          // repartait en base.
          //
          // Deux gardes, et les deux comptent : on ne demande la mise à jour
          // que s'il reste un worker à mettre à jour, et on AVALE le rejet —
          // c'est une vérification d'arrière-plan, son échec n'a rien à dire.
          // ⚠️ UN SEUL POINT D'APPEL : la vérification immédiate et la
          // minuterie passent par ce passeur, sinon la seconde rouvrirait le
          // défaut à elle seule.
          const majSilencieuse = (r) => {
            if (!r || (!r.installing && !r.waiting && !r.active)) return;
            try {
              const p = r.update();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch (e) {}
          };
          // Vérifie les mises à jour immédiatement puis toutes les 60s
          majSilencieuse(reg);
          setInterval(() => { if (!document.hidden) majSilencieuse(reg); }, 60000);
          // Garde anti-boucle : controllerchange ET SW_UPDATED peuvent arriver
          // quasi simultanément → on ne recharge qu'UNE fois, jamais en boucle.
          let _reloaded = false;
          // ⚠️ UN RECHARGEMENT REPORTÉ NE SE PERD PAS : on relit l'état au lieu de
          // brancher chaque fin d'appel, parce qu'un appel finit par de nombreux
          // chemins (raccrocher, le pair raccroche, refus, connexion perdue, pas de
          // réponse, session expirée) et qu'en oublier un laisserait la page sur
          // l'ancienne version. Minuterie armée seulement le temps du report.
          // Le calme à attendre laisse lire le toast de fin (« Live terminé · 3 min »,
          // un toast vit 3 s) et rattrape un appel relancé aussitôt.
          const CALME_AVANT_RECHARGE_MS = 3500;
          let _attente = null;
          const attendreLaFin = () => {
            if (_attente) return;
            let calmeDepuis = 0;
            _attente = setInterval(() => {
              if (pageOccupee()) { calmeDepuis = 0; return; }
              const t = performance.now();
              if (!calmeDepuis) { calmeDepuis = t; return; }
              if (t - calmeDepuis < CALME_AVANT_RECHARGE_MS) return;
              clearInterval(_attente);
              _attente = null;
              reloadOnce();
            }, 500);
          };
          const reloadOnce = () => {
            if (!hadController) return; // jamais de reload à la 1re installation
            if (_reloaded) return;
            if (pageOccupee()) { attendreLaFin(); return; }
            _reloaded = true;
            window.location.reload();
          };
          // Quand un nouveau SW prend le contrôle → recharge la page (sauf 1re fois)
          navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
          // Message SW_UPDATED envoyé par le nouveau SW → recharge (sauf 1re fois)
          navigator.serviceWorker.addEventListener('message', e => {
            if (e.data && e.data.type === 'SW_UPDATED') reloadOnce();
          });
          // Active le SW en attente immédiatement
          const activate = (sw) => sw && sw.postMessage({ type: 'SKIP_WAITING' });
          if (reg.waiting) activate(reg.waiting);
          reg.addEventListener('updatefound', () => {
            const n = reg.installing;
            if (!n) return;
            n.addEventListener('statechange', () => {
              if (n.state === 'installed' && navigator.serviceWorker.controller) activate(n);
            });
          });
        } catch(e) {}
      });
    }
