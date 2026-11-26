// ═══════════════════════════════════════════════════════════════════════════
// LIVE ET APPEL VIDÉO — RETOURNER LA CAMÉRA SUR ANDROID (2026-11-26)
//
// Défaut vécu (capture Android) : « une seule caméra fonctionne, je n'arrive pas
// à retourner » — toast « Une seule caméra disponible ». Beaucoup d'Android
// refusent d'ouvrir une seconde caméra tant que la première tourne
// (NotReadableError) ; l'ancien code demandait l'arrière AVANT de lâcher l'avant.
// Le banc simule ce téléphone : deux caméras, une seule ouvrable à la fois, et
// un repli souple qui rend la MÊME caméra quand l'autre est refusée.
//
// ① live : la caméra passe bien à l'arrière, et l'avant est libérée ;
// ② retourner deux fois revient à l'avant ;
// ③ appel vidéo : même chemin, même résultat ;
// ④ téléphone à UNE caméra : la caméra d'origine est rouverte (pas d'écran noir) ;
// ⑤ live en pause : la nouvelle caméra part éteinte ;
// ⑥ double appui simultané (live ET appel) : un seul échange, une seule caméra ;
// ⑦ live terminé / appel raccroché PENDANT le changement : aucune caméra allumée ;
// ⑧ appel : caméra coupée PENDANT le changement → la nouvelle part éteinte.
// Le simulateur libère une caméra 120 ms APRÈS stop(), comme Android.
// ═══════════════════════════════════════════════════════════════════════════
const { test, expect } = require("@playwright/test");
const { bootOnboarded } = require("./app-helper");

// Faux Android : `cameras` = liste des appareils ; une caméra ouverte bloque l'autre.
async function fauxAndroid(page, cameras) {
  await page.evaluate((cameras) => {
    const ouvertes = new Set();
    window.__cams = cameras;
    window.__delaiLiberation = 120;
    window.__retard = 0;
    window.__ouvertes = ouvertes;
    const piste = (cam) => {
      const cv = document.createElement("canvas"); cv.width = 16; cv.height = 16;
      cv.getContext("2d").fillRect(0, 0, 16, 16);
      const t = cv.captureStream(5).getVideoTracks()[0];
      const stopOrig = t.stop.bind(t);
      t.getSettings = () => ({ deviceId: cam.id, facingMode: cam.facing });
      t.stop = () => {
        // Android libère la caméra APRÈS un délai ; arrêter une piste finie ne libère rien.
        if (t.readyState === "live") setTimeout(() => ouvertes.delete(cam.id), window.__delaiLiberation);
        stopOrig();
      };
      t.__cam = cam.id;
      ouvertes.add(cam.id);
      return t;
    };
    const erreur = (n) => { const e = new Error(n); e.name = n; return e; };
    navigator.mediaDevices.enumerateDevices = async () => cameras.map(c => ({ kind: "videoinput", deviceId: c.id, label: c.label, groupId: "" }));
    navigator.mediaDevices.getUserMedia = async (c) => {
      if (window.__retard) await new Promise(r => setTimeout(r, window.__retard));
      const v = (c && c.video) || {};
      let cam = null;
      if (v.deviceId) cam = cameras.find(x => x.id === (v.deviceId.exact || v.deviceId));
      else if (v.facingMode && v.facingMode.exact) {
        cam = cameras.find(x => x.facing === v.facingMode.exact);
        if (!cam) throw erreur("OverconstrainedError");
      } else {
        const voulu = v.facingMode;
        cam = cameras.find(x => x.facing === voulu && !(ouvertes.size && !ouvertes.has(x.id)))
          || cameras.find(x => ouvertes.has(x.id)) || cameras[0];      // le souple rend la caméra déjà ouverte
      }
      if (!cam) throw erreur("NotFoundError");
      if (ouvertes.size && !ouvertes.has(cam.id)) throw erreur("NotReadableError");
      const st = new MediaStream(); st.addTrack(piste(cam)); return st;
    };
    window.__piste = piste;
  }, cameras);
}

const DEUX = [
  { id: "cam-avant", facing: "user", label: "camera2 1, facing front" },
  { id: "cam-arriere", facing: "environment", label: "camera2 0, facing back" },
];

async function hoteLive(page, cameras = DEUX) {
  await bootOnboarded(page);
  await fauxAndroid(page, cameras);
  await page.evaluate(() => {
    window.__toasts = [];
    const t0 = toast; toast = (m) => { window.__toasts.push(m); try { t0(m); } catch (e) {} };
    _vliveSend = () => {};
    _vliveApplyHostQuality = () => {};
    const stream = new MediaStream();
    stream.addTrack(window.__piste(window.__cams[0]));
    const remplacees = [];
    const sender = { track: stream.getVideoTracks()[0], replaceTrack: async (t) => { remplacees.push(t.__cam); sender.track = t; } };
    window.__remplacees = remplacees;
    window._vliveHost = { stream, pcs: { v1: { pc: { getSenders: () => [sender] } } }, paused: false, title: "Banc" };
    _vliveRenderUI("host", { title: "Banc" });
  });
}

const etat = (page) => page.evaluate(() => ({
  cam: window._vliveHost.stream.getVideoTracks().map(t => t.__cam),
  ouvertes: Array.from(window.__ouvertes),
  envoyee: window.__remplacees.slice(-1)[0] || null,
  facing: window._vliveHost._facing,
  toasts: window.__toasts,
}));

test.describe("Retourner la caméra — Android, une caméra à la fois", () => {
  test("① live : passe à l'arrière, l'avant est libérée, les spectateurs la reçoivent", async ({ page }) => {
    await hoteLive(page);
    await page.locator('#vliveOverlay button[aria-label="Changer de caméra"]').click();
    await expect.poll(async () => (await etat(page)).cam).toEqual(["cam-arriere"]);
    const e = await etat(page);
    expect(e.ouvertes).toEqual(["cam-arriere"]);
    expect(e.envoyee).toBe("cam-arriere");
    expect(e.facing).toBe("environment");
    expect(e.toasts.join(" ")).not.toMatch(/seule caméra|Impossible/);
    expect(await page.evaluate(() => document.getElementById("vliveVideo").style.transform)).toBe("none");
  });

  test("② deux appuis : retour à l'avant", async ({ page }) => {
    await hoteLive(page);
    await page.evaluate(() => flipVliveCamera());
    await page.evaluate(() => flipVliveCamera());
    const e = await etat(page);
    expect(e.cam).toEqual(["cam-avant"]);
    expect(e.ouvertes).toEqual(["cam-avant"]);
    expect(e.facing).toBe("user");
  });

  test("③ appel vidéo : même chemin", async ({ page }) => {
    await bootOnboarded(page);
    await fauxAndroid(page, DEUX);
    const r = await page.evaluate(async () => {
      _callApplyMediaQuality = async () => {};
      const localStream = new MediaStream();
      localStream.addTrack(window.__piste(window.__cams[0]));
      let envoyee = null;
      const sender = { track: localStream.getVideoTracks()[0], replaceTrack: async (t) => { envoyee = t.__cam; sender.track = t; } };
      window._call = { kind: "video", pc: { getSenders: () => [sender] }, localStream };
      await flipCallCamera();
      return { cam: localStream.getVideoTracks().map(t => t.__cam), envoyee, ouvertes: Array.from(window.__ouvertes), facing: window._call._facing };
    });
    expect(r).toEqual({ cam: ["cam-arriere"], envoyee: "cam-arriere", ouvertes: ["cam-arriere"], facing: "environment" });
  });

  test("④ une seule caméra : on ne touche à rien, jamais d'écran noir", async ({ page }) => {
    await hoteLive(page, [DEUX[0]]);
    await page.evaluate(() => flipVliveCamera());
    const e = await etat(page);
    expect(e.cam).toEqual(["cam-avant"]);
    expect(e.ouvertes).toEqual(["cam-avant"]);
    expect(e.facing).not.toBe("environment");   // rien n'a été retourné
    expect(await page.evaluate(() => window._vliveHost.stream.getVideoTracks()[0].readyState)).toBe("live");
    expect(e.toasts.join(" ")).toMatch(/Impossible d'ouvrir l'autre caméra/);
  });

  test("⑤ live en pause : la nouvelle caméra part éteinte", async ({ page }) => {
    await hoteLive(page);
    await page.evaluate(() => toggleVlivePause());
    await page.evaluate(() => flipVliveCamera());
    const r = await page.evaluate(() => window._vliveHost.stream.getVideoTracks().map(t => [t.__cam, t.enabled]));
    expect(r).toEqual([["cam-arriere", false]]);
  });

  test("⑥ double appui simultané : un seul échange (live puis appel)", async ({ page }) => {
    await hoteLive(page);
    await page.evaluate(() => Promise.all([flipVliveCamera(), flipVliveCamera()]));
    await page.waitForTimeout(200);
    let e = await etat(page);
    expect(e.cam).toEqual(["cam-arriere"]);
    expect(e.ouvertes).toEqual(["cam-arriere"]);
    const r = await page.evaluate(async () => {
      _callApplyMediaQuality = async () => {};
      window._vliveHost.stream.getTracks().forEach(t => t.stop());
      window._vliveHost = null;
      await new Promise(r => setTimeout(r, 200));
      const localStream = new MediaStream();
      localStream.addTrack(window.__piste(window.__cams[0]));
      const sender = { track: localStream.getVideoTracks()[0], replaceTrack: async (t) => { sender.track = t; } };
      window._call = { kind: "video", pc: { getSenders: () => [sender] }, localStream };
      await Promise.all([flipCallCamera(), flipCallCamera()]);
      await new Promise(r => setTimeout(r, 200));
      return { cam: localStream.getVideoTracks().map(t => t.__cam), envoyee: sender.track.__cam, ouvertes: Array.from(window.__ouvertes) };
    });
    expect(r).toEqual({ cam: ["cam-arriere"], envoyee: "cam-arriere", ouvertes: ["cam-arriere"] });
  });

  test("⑦ fin du live ou de l'appel PENDANT le changement : aucune caméra ne reste allumée", async ({ page }) => {
    await hoteLive(page);
    const live = await page.evaluate(async () => {
      window.__retard = 150;
      const p = flipVliveCamera();
      await new Promise(r => setTimeout(r, 50));
      _vliveTeardown();
      await p;
      await new Promise(r => setTimeout(r, 300));
      return Array.from(window.__ouvertes);
    });
    expect(live).toEqual([]);
    const appel = await page.evaluate(async () => {
      _callApplyMediaQuality = async () => {};
      const localStream = new MediaStream();
      localStream.addTrack(window.__piste(window.__cams[0]));
      const sender = { track: localStream.getVideoTracks()[0], replaceTrack: async (t) => { sender.track = t; } };
      window._call = { kind: "video", pc: { getSenders: () => [sender] }, localStream };
      const p = flipCallCamera();
      await new Promise(r => setTimeout(r, 50));
      localStream.getTracks().forEach(t => t.stop());   // ce que fait le raccrochage
      window._call = null;
      await p;
      await new Promise(r => setTimeout(r, 300));
      return Array.from(window.__ouvertes);
    });
    expect(appel).toEqual([]);
  });

  test("⑧ appel : caméra coupée pendant le changement, la nouvelle part éteinte", async ({ page }) => {
    await bootOnboarded(page);
    await fauxAndroid(page, DEUX);
    const r = await page.evaluate(async () => {
      _callApplyMediaQuality = async () => {};
      window.__retard = 150;
      const localStream = new MediaStream();
      localStream.addTrack(window.__piste(window.__cams[0]));
      const sender = { track: localStream.getVideoTracks()[0], replaceTrack: async (t) => { sender.track = t; } };
      window._call = { kind: "video", pc: { getSenders: () => [sender] }, localStream };
      const p = flipCallCamera();
      await new Promise(r => setTimeout(r, 50));
      toggleCallVideo(null);                             // l'utilisateur coupe sa caméra
      await p;
      return localStream.getVideoTracks().map(t => [t.__cam, t.enabled]);
    });
    expect(r).toEqual([["cam-arriere", false]]);
  });
});
