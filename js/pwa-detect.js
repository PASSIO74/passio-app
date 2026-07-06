    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          const reg = await navigator.serviceWorker.register('./sw.js');
          // Vérifie les mises à jour immédiatement puis toutes les 60s
          reg.update();
          setInterval(() => reg.update(), 60000);
          // Garde anti-boucle : controllerchange ET SW_UPDATED peuvent arriver
          // quasi simultanément → on ne recharge qu'UNE fois, jamais en boucle.
          let _reloaded = false;
          const reloadOnce = () => {
            if (_reloaded) return;
            _reloaded = true;
            window.location.reload();
          };
          // Quand un nouveau SW prend le contrôle → recharge la page
          navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
          // Message SW_UPDATED envoyé par le nouveau SW → recharge
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
