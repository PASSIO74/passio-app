    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          // ⚠️ CAPTURÉ AVANT register : y a-t-il DÉJÀ un SW qui contrôle la page ?
          // - Première visite : controller === null → la 1re prise de contrôle
          //   (skipWaiting+claim) NE DOIT PAS recharger (sinon la page « saute »
          //   pendant que l'utilisateur saisit le code d'accès → bug testeur iOS).
          // - Visites suivantes : controller existe → un controllerchange = vraie
          //   mise à jour → on recharge pour appliquer la nouvelle version.
          const hadController = !!navigator.serviceWorker.controller;
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
          const reloadOnce = () => {
            if (!hadController) return; // jamais de reload à la 1re installation
            if (_reloaded) return;
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
