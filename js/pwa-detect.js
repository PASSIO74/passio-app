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
          // Vérifie les mises à jour immédiatement puis toutes les 60s
          reg.update();
          setInterval(() => { if (!document.hidden) reg.update(); }, 60000);
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
