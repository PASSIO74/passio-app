// La tête du fil est toujours relue avec les droits du lecteur. xmin change à
// chaque mise à jour de la ligne, y compris pour une modification du profil.
const PassioCartesFil = (() => {
  const versions = "id,xmin,profiles!author_id(xmin)";
  const duree = 120000;

  function versionConnue(ligne) {
    return ligne && typeof ligne.id === "string" && /^\d+$/.test(ligne.xmin)
      && ligne.profiles && /^\d+$/.test(ligne.profiles.xmin);
  }

  function identiques(a, b) {
    return versionConnue(a) && versionConnue(b)
      && a.xmin === b.xmin && a.profiles.xmin === b.profiles.xmin;
  }

  function versionsIndisponibles(reponse) {
    return reponse.error && (reponse.error.code === "42501" || /\bxmin\b/i.test(reponse.error.message || ""));
  }

  async function lire(colonnes, interroger, cache, admissible = () => true) {
    const avecVersions = "xmin," + colonnes.replace("profiles!author_id(", "profiles!author_id(xmin,");
    const maintenant = Date.now();
    async function complete() {
      const reponse = await interroger(avecVersions);
      if (versionsIndisponibles(reponse)) return interroger(colonnes);
      return preparer(reponse, maintenant + duree);
    }
    function preparer(reponse, expiration) {
      if (reponse.error || !Array.isArray(reponse.data) || !reponse.data.length
          || !reponse.data.every(versionConnue)) return reponse;
      // La projection des médias protégés modifie les lignes qui lui sont
      // confiées. Garder les lignes HTTP brutes en mémoire, sans les partager.
      const lignes = new Map();
      const data = reponse.data.map(r => {
        if (!admissible(r)) return r;
        lignes.set(r.id, r);
        return typeof structuredClone === "function" ? structuredClone(r) : JSON.parse(JSON.stringify(r));
      });
      return { ...reponse, data, cache: lignes.size ? { expiration, lignes } : null };
    }
    if (!cache || maintenant >= cache.expiration) return complete();

    const tete = await interroger(versions);
    if (tete.error) {
      if (versionsIndisponibles(tete)) return interroger(colonnes);
      return tete;
    }
    if (!Array.isArray(tete.data) || !tete.data.length) return tete;
    if (!tete.data.every(versionConnue)) return complete();
    const nouvelles = tete.data.filter(r => !identiques(r, cache.lignes.get(r.id)));
    if (nouvelles.length === tete.data.length) return complete();
    const lignes = new Map(cache.lignes);
    if (nouvelles.length) {
      const detail = await interroger(avecVersions, nouvelles.map(r => r.id));
      if (versionsIndisponibles(detail)) return interroger(colonnes);
      if (detail.error) return detail;
      const parId = new Map((detail.data || []).map(r => [r.id, r]));
      // Une suppression, une édition ou un changement de visibilité entre les
      // deux lectures impose de reprendre la page et son curseur d'un seul coup.
      if (nouvelles.some(r => !identiques(r, parId.get(r.id)))) return complete();
      for (const r of nouvelles) lignes.set(r.id, parId.get(r.id));
    }
    return preparer({ ...tete, data: tete.data.map(r => lignes.get(r.id)) }, cache.expiration);
  }
  return { lire };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PassioCartesFil;
