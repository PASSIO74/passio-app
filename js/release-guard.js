/* ═══════════════════════════════════════════════════════════════════════════
 * PASSIO — Release Guard navigateur.
 *
 * Un onglet N doit pouvoir cohabiter avec un déploiement N+1 sans que PASSIO
 * prétende que tout le monde exécute la même version. Le build injecte
 * window.PASSIO_RELEASE et publie /release.json ; ce module compare les deux,
 * expose l'état réel et émet un signal de télémétrie en cas de version skew.
 *
 * IMPORTANT : il ne force JAMAIS de reload. Détecter une version différente est
 * une preuve d'observation, pas une autorisation à interrompre l'utilisateur.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  if (window.PassioReleaseGuard) return;

  var current = window.PASSIO_RELEASE || null;
  var state = {
    configured: !!(current && current.buildId),
    checking: false,
    checkedAt: null,
    latest: null,
    active: false,
    currentBuildId: current && current.buildId || null,
    latestBuildId: null,
    lastError: null,
  };
  var lastReportedPair = null;

  function snapshot() {
    return {
      configured: state.configured,
      checking: state.checking,
      checkedAt: state.checkedAt,
      latest: state.latest,
      active: state.active,
      currentBuildId: state.currentBuildId,
      latestBuildId: state.latestBuildId,
      lastError: state.lastError,
    };
  }

  function emitSkew(latest) {
    var pair = String(state.currentBuildId || "?") + "->" + String(latest && latest.buildId || "?");
    if (pair === lastReportedPair) return;
    lastReportedPair = pair;
    try {
      if (window.tel && typeof window.tel.track === "function") {
        window.tel.track("release", "version_skew", {
          status: "warn",
          severity: "warn",
          message: "Un client PASSIO ouvert exécute une release différente de la release actuellement servie.",
          meta: {
            current_build: String(state.currentBuildId || "").slice(0, 32),
            latest_build: String(latest && latest.buildId || "").slice(0, 32),
            current_commit: String(current && current.commit || "").slice(0, 40),
            latest_commit: String(latest && latest.commit || "").slice(0, 40),
          },
        });
        if (typeof window.tel.flush === "function") window.tel.flush();
      }
    } catch (e) {}
  }

  async function check() {
    if (!state.configured || state.checking) return snapshot();
    state.checking = true;
    try {
      var res = await fetch("/release.json?ts=" + Date.now(), {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res || !res.ok) throw new Error("release.json HTTP " + (res && res.status));
      var latest = await res.json();
      if (!latest || typeof latest.buildId !== "string" || !latest.buildId) throw new Error("release.json invalide");
      state.latest = latest;
      state.latestBuildId = latest.buildId;
      state.active = latest.buildId !== state.currentBuildId;
      state.checkedAt = new Date().toISOString();
      state.lastError = null;
      window.PASSIO_VERSION_SKEW = snapshot();
      if (state.active) emitSkew(latest);
      return snapshot();
    } catch (e) {
      state.checkedAt = new Date().toISOString();
      state.lastError = String(e && e.message || e).slice(0, 240);
      window.PASSIO_VERSION_SKEW = snapshot();
      return snapshot();
    } finally {
      state.checking = false;
    }
  }

  window.PassioReleaseGuard = { check: check, state: snapshot };
  window.PASSIO_VERSION_SKEW = snapshot();

  if (!state.configured) return; // dev non construit : honnête no-op.

  // Vérification au retour au premier plan + contrôle périodique léger.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("online", function () { check(); });
  setTimeout(check, 4000);
  setInterval(function () {
    if (document.visibilityState === "visible") check();
  }, 5 * 60 * 1000);
})();
