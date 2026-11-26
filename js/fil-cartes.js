// La base relit les vingt cartes avec les droits du lecteur, dans un seul
// instantané. Une valeur absente de la Map ne peut jamais alimenter une carte.
const PassioCartesFil = (() => {
  const duree = 120000;
  const champsCarte = ["id", "xmin", "author_id", "passion_id", "mood", "content", "media_url", "created_at",
    "edited_at", "is_reel", "overlays", "vlog", "shared_from_post_id", "shared_data", "event_id", "profiles"];
  const champsProfil = ["xmin", "username", "emoji", "color", "avatar_url", "is_private"];
  function contient(objet, champs) {
    return objet && typeof objet === "object" && champs.every(c => Object.prototype.hasOwnProperty.call(objet, c));
  }
  function revision(r) {
    return String(r.xmin) + "." + (r.profiles ? r.profiles.xmin : "-");
  }
  async function lire(appeler, cache, admissible = () => true) {
    const maintenant = Date.now();
    const precedent = cache && maintenant < cache.expiration ? cache : null;
    const connues = precedent ? Object.fromEntries(Array.from(precedent.lignes, ([id, r]) => [id, revision(r)])) : {};
    const reponse = await appeler(connues);
    if (reponse.error) return reponse;
    if (!Array.isArray(reponse.data) || reponse.data.length > 20) return { error: { code: "PAGE_FIL_INVALIDE" } };
    const lignes = new Map(), data = [], vus = new Set();
    for (const item of reponse.data) {
      if (!item || typeof item.post_id !== "string" || vus.has(item.post_id)
          || !/^\d{1,10}\.(?:\d{1,10}|-)$/.test(item.version)) return { error: { code: "PAGE_FIL_INVALIDE" } };
      vus.add(item.post_id);
      if (item.carte !== null && (!contient(item.carte, champsCarte) ||
          (item.carte.profiles !== null && !contient(item.carte.profiles, champsProfil)))) return { error: { code: "PAGE_FIL_INVALIDE" } };
      const r = item.carte === null ? precedent?.lignes.get(item.post_id) : item.carte;
      if (!r || r.id !== item.post_id || revision(r) !== item.version) return { error: { code: "PAGE_FIL_INVALIDE" } };
      if (admissible(r)) {
        lignes.set(r.id, r);
        // La projection des médias et le rendu peuvent modifier leur copie.
        data.push(typeof structuredClone === "function" ? structuredClone(r) : JSON.parse(JSON.stringify(r)));
      } else {
        data.push(r);
      }
    }
    return { ...reponse, data, cache: lignes.size ? { expiration: precedent ? precedent.expiration : maintenant + duree, lignes } : null };
  }
  return { lire };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PassioCartesFil;
