"use strict";

// Projection de reprise, jamais modification de l'archive : uniquement les
// chaînes des champs que le client interprète comme un média. Les lexèmes
// numériques, les champs libres et les enveloppes inconnues restent intacts.
const PROD = "https://njkiyoklssvefstljemx.supabase.co";
const SITE = "https://passio-app.netlify.app";
const TABLES = new Set(["profiles", "posts", "stories", "events", "user_state", "conv_messages"]);
const MEDIA_POST = new Set(["image", "photo", "video", "audio", "cover", "poster", "coverPhotoUrl"]);
const MEDIA_PARTAGE = new Set(["media", "image", "photo", "video", "audio", "cover", "poster", "coverUrl", "coverPhotoUrl"]);
const propre = (o, k) => o !== null && typeof o === "object" && Object.hasOwn(o, k);
const refus = (code) => { throw new Error("Projection médias : " + code); };

function origine(v) {
  return typeof v === "string" && /^https:\/\/[a-z]{20}\.supabase\.co$/.test(v) ? v : null;
}

// Parcours itératif et substitutions de tokens : pas de resérialisation de
// la ligne entière (bigint/numeric exacts, même dans un JSON incorporé).
function transformerJson(texte, transformer, transformerBooleen = (v) => v) {
  const racine = JSON.parse(texte); // syntaxe seulement ; aucune valeur numérique recopiée
  const pile = [], chemin = [], changements = [];
  let i = 0;
  const cle = () => { const p = pile[pile.length - 1]; return p?.type === "{" ? p.cle : p?.index; };
  while (i < texte.length) {
    const c = texte[i];
    if (c === '"') {
      let fin = i + 1;
      while (fin < texte.length) { if (texte[fin] === "\\") fin += 2; else if (texte[fin++] === '"') break; }
      const p = pile[pile.length - 1];
      if (p?.type === "{" && p.attendCle) { p.cle = JSON.parse(texte.slice(i, fin)); p.attendCle = false; }
      else if (chemin.length <= 10) {
        const valeur = JSON.parse(texte.slice(i, fin));
        const suite = transformer(valeur, pile.length ? [...chemin, cle()] : [], racine);
        if (suite !== valeur) changements.push({ debut: i, fin, texte: JSON.stringify(suite) });
      }
      i = fin; continue;
    }
    if ((c === 't' || c === 'f') && chemin.length <= 10) {
      const jeton = c === 't' ? 'true' : 'false', valeur = c === 't';
      const suite = transformerBooleen(valeur, pile.length ? [...chemin, cle()] : [], racine);
      if (typeof suite !== 'boolean') throw new Error('Projection booléenne invalide');
      if (suite !== valeur) changements.push({ debut: i, fin: i + jeton.length, texte: String(suite) });
      i += jeton.length; continue;
    }
    if (c === "{" || c === "[") {
      const ajoute = pile.length > 0;
      if (ajoute) chemin.push(cle());
      pile.push({ type: c, attendCle: c === "{", index: 0, ajoute });
    } else if (c === "}" || c === "]") {
      if (pile.pop().ajoute) chemin.pop();
    } else if (c === ",") {
      const p = pile[pile.length - 1];
      if (p.type === "{") p.attendCle = true; else p.index++;
    }
    i++;
  }
  if (!changements.length) return texte;
  const parties = []; let debut = 0;
  for (const c of changements) { parties.push(texte.slice(debut, c.debut), c.texte); debut = c.fin; }
  parties.push(texte.slice(debut));
  return parties.join("");
}

function valeurA(racine, chemin) {
  let v = racine;
  for (const cle of chemin) { if (!propre(v, cle)) return null; v = v[cle]; }
  return v;
}
const parent = (racine, chemin) => valeurA(racine, chemin.slice(0, -1));
function overlay(chemin, racine) {
  return chemin.length === 3 && chemin[0] === "overlays" && Number.isInteger(chemin[1])
    && chemin[2] === "url" && parent(racine, chemin)?.type === "gif";
}
function partage(chemin) { return chemin.length === 1 && MEDIA_PARTAGE.has(chemin[0]); }
function post(chemin, racine) {
  return (chemin.length === 1 && MEDIA_POST.has(chemin[0])) || overlay(chemin, racine)
    || (chemin.length === 3 && chemin[0] === "steps" && Number.isInteger(chemin[1]) && ["photo", "video", "audio"].includes(chemin[2]))
    || (chemin[0] === "sharedReelData" && partage(chemin.slice(1)));
}

function creerProjection({ source, cible, lireIndex, lireSeaux }) {
  const src = origine(source), dst = origine(cible);
  let index, seaux;
  function url(valeur, pieceJointe = false) {
    if (!valeur || /^(?:data:|blob:)/i.test(valeur)) return valeur;
    let u;
    try { u = new URL(valeur); } catch {
      if (!valeur.startsWith("/media/") && !valeur.startsWith("/storage/v1/")) return valeur;
      if (valeur.startsWith("/storage/v1/")) refus("FORME_RELATIVE_INCONNUE");
    }
    if (u?.origin === "https://media.passio.invalid") return valeur;
    const alias = valeur.startsWith("/media/") || (u?.origin === SITE && u.pathname.startsWith("/media/"));
    if (!alias && u?.origin !== src) {
      if (!src && u && /^[a-z]{20}\.supabase\.co$/.test(u.hostname)) refus("SOURCE_INCONNUE");
      return valeur;
    }
    if (!src || !dst || src === dst) refus("PROJETS_INVALIDES");
    if (alias && src !== PROD) refus("ALIAS_PRODUCTION_AMBIGU");
    const brut = alias ? (valeur.startsWith("/") ? valeur : valeur.slice(SITE.length)) : valeur.slice(src.length);
    if (!alias && !valeur.startsWith(src + "/")) refus("ORIGINE_NON_CANONIQUE");
    if (u?.username || u?.password || /[\\\u0000-\u001f\u007f]/.test(brut)) refus("CHEMIN_INVALIDE");
    const chemin = brut.split(/[?#]/, 1)[0];
    const m = alias ? /^\/media\/(content)\/(.+)$/.exec(chemin)
      : /^\/storage\/v1\/(?:object|render\/image)\/(public|sign|authenticated)\/([^/]+)\/(.+)$/.exec(chemin);
    if (!m) refus("FORME_INTERNE_INCONNUE");
    const mode = alias ? "public" : m[1];
    let segments;
    try { segments = (alias ? m[1] + "/" + m[2] : m[2] + "/" + m[3]).split("/").map(decodeURIComponent); }
    catch { refus("ENCODAGE_INVALIDE"); }
    if (segments.some(s => !s || s === "." || s === ".." || /[/\\\u0000-\u001f\u007f]/.test(s))) refus("CHEMIN_INVALIDE");
    if (!index) {
      index = lireIndex();
      if (!index || index.erreur || !index.objets) refus("INDEX_NON_ATTESTE");
    }
    if (!seaux) {
      const att = lireSeaux();
      if (!att?.ok) refus("SEAUX_NON_ATTESTES");
      seaux = new Map(att.seaux.map(b => [b.id, b]));
    }
    const b = seaux.get(segments[0]), nom = segments.join("/");
    if (!propre(index.objets, nom)) refus("OBJET_HORS_INDEX");
    if (!b || typeof b.public !== "boolean") refus("SEAU_INCONNU");
    const prive = !b.public;
    if (prive && !(pieceJointe && b.id === "attachments")) refus("LECTEUR_PRIVE_NON_PRIS_EN_CHARGE");
    if (!prive && mode !== "public") refus("VISIBILITE_INCOHERENTE");
    const route = prive ? "authenticated" : "public";
    return dst + "/storage/v1/object/" + route + "/" + segments.map(encodeURIComponent).join("/");
  }
  function projeterLigne(table, texte) {
    if (!TABLES.has(table)) return texte;
    return transformerJson(texte, (valeur, chemin, racine) => {
      const champ = chemin[0];
      if ((table === "profiles" && ((chemin.length === 1 && ["avatar_url", "cover_url"].includes(champ))
        || (chemin.length === 3 && champ === "passions" && Number.isInteger(chemin[1]) && ["photoUrl", "coverUrl"].includes(chemin[2]))))
        || (table === "events" && chemin.length === 1 && champ === "cover_url")
        || (["posts", "stories"].includes(table) && ((chemin.length === 1 && champ === "media_url") || overlay(chemin, racine)))) return url(valeur);
      if (table === "posts" && champ === "shared_data") {
        if (chemin.length === 1) {
          let v; try { v = JSON.parse(valeur); } catch { return valeur; }
          if (!v || typeof v !== "object" || Array.isArray(v)) return valeur;
          return transformerJson(valeur, (s, p) => partage(p) ? url(s) : s);
        }
        if (partage(chemin.slice(1))) return url(valeur);
      }
      if (table === "conv_messages" && chemin.length === 1 && champ === "content") {
        let v; try { v = JSON.parse(valeur); } catch { return valeur; }
        if (!v || !["media", "audio", "doc", "gif"].includes(v.type)) return valeur;
        return transformerJson(valeur, (s, p) => p.length === 1 && p[0] === "url" ? url(s, v.type !== "gif") : s);
      }
      if (table === "user_state" && champ === "data") {
        const p = chemin.slice(1);
        if ((p.length === 3 && p[0] === "user" && p[1] === "general" && ["photoUrl", "coverUrl"].includes(p[2]))
          || (p.length === 4 && p[0] === "user" && p[1] === "profiles" && Number.isInteger(p[2]) && ["photoUrl", "coverUrl"].includes(p[3]))
          || (p.length === 6 && p[0] === "user" && p[1] === "profiles" && Number.isInteger(p[2]) && p[3] === "passions"
            && Number.isInteger(p[4]) && ["photoUrl", "coverUrl"].includes(p[5]))) return url(valeur);
        if (p[0] === "userPosts" && Number.isInteger(p[1]) && post(p.slice(2), valeurA(racine, chemin.slice(0, 3)))) return url(valeur);
      }
      return valeur;
    });
  }
  return { projeterLigne };
}

module.exports = { creerProjection, transformerJson, TABLES };
