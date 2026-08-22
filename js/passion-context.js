/* ═══════════════════════════════════════════════════════════════════════════
 * PASSIO — contexte passionnel actif, future-only et sans donnée personnelle.
 *
 * La persona active est `state.user.currentProfileId`, résolue par currentProfile().
 * L'identifiant LOCAL du profil n'est pas stable cross-device ; sa `passion`, elle,
 * est la clé métier déjà utilisée pour dédupliquer/fusionner les profils. On émet
 * donc uniquement cette passion dans la télémétrie, jamais le nom, la bio, la
 * photo ou l'identifiant local de persona.
 *
 * Ce signal permet au pilotage de rattacher les événements d'une session au
 * contexte passionnel qui était réellement actif, sans migration DB risquée ni
 * backfill historique inventé. Un futur schéma relationnel pourra être décidé à
 * partir de cette preuve d'usage.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  if (window.PassioPassionContext) return;

  var lastPassion = undefined;
  var lastProfileId = undefined;
  var started = false;
  var timer = null;

  // Contexte INTERNE : l'id local sert uniquement à détecter un vrai changement
  // de persona lorsque deux profils pourraient partager la même passion. Il ne
  // sort jamais de cette closure et n'est jamais exposé dans l'API globale.
  function readContext() {
    try {
      if (typeof state === "undefined" || !state || !state.user) return null;
      var p = (typeof currentProfile === "function") ? currentProfile() : null;
      if (!p) return null;
      return {
        passionId: p.passion ? String(p.passion).slice(0, 64) : null,
        profileLocalId: p.id ? String(p.id).slice(0, 64) : null,
      };
    } catch (e) { return null; }
  }

  // API publique minimale : uniquement la donnée métier utile. L'identifiant
  // local de persona reste strictement privé au module.
  function current() {
    var ctx = readContext();
    return ctx ? { passionId: ctx.passionId } : null;
  }

  function emitIfChanged(force) {
    var ctx = readContext();
    var passion = ctx && ctx.passionId || null;
    var localId = ctx && ctx.profileLocalId || null;
    if (!force && passion === lastPassion && localId === lastProfileId) return false;
    lastPassion = passion;
    lastProfileId = localId;

    // IMPORTANT : seul persona_ctx est envoyé. profileLocalId reste local car il
    // peut diverger entre appareils pour la même passion (sync défensive existante).
    try {
      if (window.tel && typeof window.tel.track === "function") {
        window.tel.track("context", "passion_active", {
          severity: "info",
          status: passion ? "ok" : "unknown",
          meta: { persona_ctx: passion || "none" },
        });
      }
    } catch (e) {}
    return true;
  }

  function start() {
    if (started) return;
    started = true;
    // Le premier signal fixe le contexte initial de la session. Le polling est
    // volontairement léger : il n'émet rien tant que le profil ne change pas.
    emitIfChanged(true);
    timer = setInterval(function () { emitIfChanged(false); }, 750);
  }

  function stop() { if (timer) clearInterval(timer); timer = null; started = false; }

  window.PassioPassionContext = {
    current: current,
    refresh: function () { return emitIfChanged(false); },
    start: start,
    stop: stop,
  };

  // Le fichier est concaténé APRÈS les app-* : state/currentProfile existent déjà.
  start();
})();
