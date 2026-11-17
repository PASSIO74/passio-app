"use strict";
const { createHash, randomUUID } = require("node:crypto");

const BUCKET = "content-protected";
const TABLES = ["media_reservations", "media_assets", "media_objects"];
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const EXTENSIONS = new Map(Object.entries({
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm", "audio/mp4": "m4a", "audio/webm": "webm",
  "audio/ogg": "ogg", "audio/mpeg": "mp3",
}));

function refuser(categorie) { throw new Error("reprise_medias_proteges_" + categorie); }

// Un UUID d'objet peut survivre à un upsert. Rattacher le GET à la version de
// Storage. Sur un ancien catalogue sans version, toute modification du tuple
// invalide la preuve de secours (même une modification sans effet sur les octets).
const VERSION_SQL = "coalesce(nullif(to_jsonb(s)->>'version',''),'tuple:'||s.xmin::text)";
const ETAG_MD5 = /^(?:[0-9a-f]{32}|"[0-9a-f]{32}")$/i;

async function md5Distant({ ref, url, cle, man }, nom, taille, prod, etag) {
  if (!/^[a-z]{20}$/.test(ref) || ref === prod || url !== `https://${ref}.supabase.co` || man.projet === url) refuser("cible");
  const segments = nom.split("/");
  if (segments.length < 2 || !/^[a-z0-9][a-z0-9_.-]*$/i.test(segments[0]) ||
      segments.some(s => !s || s === "." || s === ".." || /[\\\x00-\x1f\x7f]/u.test(s))) refuser("chemin");
  if (!Number.isSafeInteger(taille) || taille < 0) refuser("taille");
  const cible = url + "/storage/v1/object/" + segments.map(encodeURIComponent).join("/") + "?reprise=" + randomUUID();
  const controller = new AbortController();
  const delai = setTimeout(() => controller.abort(), 30000);
  try {
    const headers = { apikey: cle, Authorization: "Bearer " + cle, "Accept-Encoding": "identity", "Cache-Control": "no-cache" };
    const multipart = /^(?:([0-9a-f]{32}-[0-9]+)|"([0-9a-f]{32}-[0-9]+)")$/i.exec(etag || "");
    if (multipart) headers["If-Match"] = '"' + (multipart[1] || multipart[2]) + '"';
    const r = await fetch(cible, {
      redirect: "error", signal: controller.signal, cache: "no-store", headers,
    });
    const longueur = r.headers.get("Content-Length");
    if (r.status !== 200 || r.redirected || !r.body || r.headers.has("Content-Range") ||
        (multipart && r.headers.has("ETag") && r.headers.get("ETag") !== headers["If-Match"]) ||
        (r.headers.get("Content-Encoding") || "identity").toLowerCase() !== "identity" ||
        (longueur !== null && longueur !== String(taille))) refuser("relecture");
    const hash = createHash("md5");
    let recus = 0;
    for await (const morceau of r.body) {
      recus += morceau.byteLength;
      if (recus > taille) refuser("taille");
      hash.update(morceau);
    }
    if (recus !== taille || controller.signal.aborted) refuser("relecture");
    return hash.digest("hex");
  } finally {
    clearTimeout(delai);
    controller.abort();
  }
}

function uniques(objets) {
  const parCle = new Map();
  for (const objet of objets) parCle.set(objet.name, parCle.has(objet.name) ? null : objet);
  return parCle;
}

async function empreintesPhysiques(ctx, index, lireCatalogue, prod, selection) {
  const avant = await lireCatalogue();
  const prises = new Map();
  for (const [nom, objet] of uniques(avant)) {
    const fichier = index[nom];
    if (!fichier || (selection && !selection.has(nom)) || !objet || !objet.vivant ||
        !UUID.test(objet.identite) || !objet.version || Number(objet.taille) !== fichier.taille || objet.taille == null ||
        ETAG_MD5.test(objet.etag || "")) continue;
    try {
      const md5 = await md5Distant(ctx, nom, fichier.taille, prod, objet.etag);
      prises.set(nom, { id: objet.identite, version: objet.version, etag: objet.etag, md5 });
    } catch {
      // Sans empreinte comparable, le verdict ordinaire classe ce fichier non vérifié ou divergent.
    }
  }
  if (!prises.size) return { objets: avant, physiques: prises };
  const apres = await lireCatalogue();
  const relus = uniques(apres);
  for (const [nom, p] of prises) {
    const o = relus.get(nom);
    if (!o?.vivant || o.identite !== p.id || o.version !== p.version || o.etag !== p.etag ||
        o.taille == null || Number(o.taille) !== index[nom].taille) prises.delete(nom);
  }
  return { objets: apres, physiques: prises };
}

function preparer({ tables, index, inventaire, lire, sansMedias, manifesteMedias }) {
  const nombreTables = TABLES.filter(nom => Object.hasOwn(tables, nom)).length;
  const cles = Object.keys(index?.objets || {}).filter(cle => cle.startsWith(BUCKET + "/"));
  if (!nombreTables && !cles.length) return null;
  if (nombreTables !== TABLES.length) refuser("schema_partiel");
  const objets = lire("media_objects");
  const assets = lire("media_assets");
  if (objets.length !== tables.media_objects.exporte || assets.length !== tables.media_assets.exporte) refuser("nombre_archive");
  if ((objets.length || cles.length) && (sansMedias || !index?.objets || !inventaire?.objets ||
      !/^[0-9a-f]{64}$/.test(manifesteMedias?.index_sha256 || "") ||
      !/^[0-9a-f]{64}$/.test(manifesteMedias?.proprietaires_sha256 || ""))) refuser("preuve_archive");

  const proprietaires = new Map(assets.map(asset => [asset.id, asset.owner_id]));
  const parCle = new Map(), idsSource = new Set(), variantes = new Set(), originaux = new Set();
  if (proprietaires.size !== assets.length) refuser("asset_duplique");
  for (const objet of objets) {
    const owner = proprietaires.get(objet.asset_id);
    const ext = EXTENSIONS.get(objet.mime_type);
    if (!UUID.test(owner) || !UUID.test(objet.asset_id) || !UUID.test(objet.storage_object_id) ||
        !["original", "poster", "v720"].includes(objet.variant) || !ext ||
        (objet.variant !== "original" && !objet.mime_type.startsWith("image/"))) refuser("registre");
    const variante = owner + "/" + objet.asset_id + "/" + objet.variant;
    if (objet.bucket_id !== BUCKET || objet.object_key !== variante + "." + ext ||
        !Number.isSafeInteger(objet.byte_size) || objet.byte_size < 1 || objet.byte_size > 27262976) refuser("cle_ou_taille");
    if (idsSource.has(objet.storage_object_id) || variantes.has(variante)) refuser("bijection_archive");
    idsSource.add(objet.storage_object_id);
    variantes.add(variante);
    if (objet.variant === "original") originaux.add(objet.asset_id);
    const cle = BUCKET + "/" + objet.object_key;
    const fichier = index.objets[cle], prop = inventaire.objets[cle];
    if (!fichier || fichier.taille !== objet.byte_size || !/^[0-9a-f]{32}$/.test(fichier.md5) ||
        !prop || (prop.owner !== owner && prop.owner_id !== owner) ||
        (prop.owner !== null && prop.owner !== owner) || (prop.owner_id !== null && prop.owner_id !== owner)) refuser("inventaire");
    parCle.set(cle, {
      asset_id: objet.asset_id, variant: objet.variant, object_key: objet.object_key,
      mime_type: objet.mime_type, byte_size: objet.byte_size, source: objet.storage_object_id,
      asset_owner: owner, owner: prop.owner, owner_id: prop.owner_id, md5: fichier.md5,
    });
  }
  if (originaux.size !== assets.length) refuser("original_absent");
  if (cles.length !== parCle.size) refuser("objet_sans_registre");
  return parCle;
}

// Les résultats lisibles sont bornés à 100 objets. Les écritures revalident leurs propres
// prédicats dans le même statement. Une collision UNIQUE annule le lot ; le rejeu accepte
// aussi un registre déjà réconcilié. Aucun octet ni identifiant ne sort dans le bilan.
function requete(ecrire) {
  const verrou = ecrire ? " for share of s, b" : "";
  const base = `with attendu as materialized (
    select * from jsonb_to_recordset($1::jsonb) x(asset_id uuid, variant text, object_key text,
      mime_type text, byte_size bigint, source uuid, asset_owner text, owner uuid, owner_id text, md5 text,
      relu_id uuid, relu_version text, relu_etag text, relu_md5 text)
  ), vivants as materialized (
    select s.id,s.name,s.owner,s.owner_id,s.metadata,${VERSION_SQL} as version
    from storage.objects s join storage.buckets b on b.id=s.bucket_id
    where b.id='content-protected' and b.public=false and s.archived_at is null and s.is_delete_marker=false
      and s.name in (select object_key from attendu)${verrou}
  ), conformes as materialized (
    select x.source,s.id as cible,m.storage_object_id as inscrit,m.asset_id,m.variant
    from attendu x join public.media_assets a on a.id=x.asset_id and a.owner_id=x.asset_owner
    join public.media_objects m on m.asset_id=a.id and m.variant=x.variant
    join vivants s on s.name=x.object_key
    where m.bucket_id='content-protected' and m.object_key=x.object_key
      and m.mime_type=x.mime_type and m.byte_size=x.byte_size
      and m.storage_object_id in (x.source,s.id)
      and s.owner is not distinct from x.owner and s.owner_id is not distinct from x.owner_id
      and s.metadata->>'mimetype'=x.mime_type and s.metadata->>'size'=x.byte_size::text
      and (lower(s.metadata->>'eTag') in (x.md5,'"'||x.md5||'"')
        or (coalesce(s.metadata->>'eTag','') !~* '^(?:[0-9a-f]{32}|"[0-9a-f]{32}")$'
          and x.relu_id=s.id and x.relu_version=s.version and x.relu_md5=x.md5
          and x.relu_etag is not distinct from (s.metadata->>'eTag')))
      and (select count(*) from vivants v where v.name=s.name)=1
      and not exists(select 1 from storage.objects ancien where ancien.id=x.source and ancien.id<>s.id)
      and not exists(select 1 from unnest(array['public.media_assets','public.media_objects','public.media_reservations']) t(nom)
        where obj_description(to_regclass(t.nom),'pg_class') is distinct from 'PASSIO protected-media v1 2026-11-16')
      ${ecrire ? "for update of m for share of a" : ""}
  )`;
  if (!ecrire) return base + " select source,cible,inscrit from conformes";
  return base + `, corrections as (
    update public.media_objects m set storage_object_id=c.cible from conformes c
    where m.asset_id=c.asset_id and m.variant=c.variant and m.storage_object_id=c.source
      and c.source<>c.cible and (select count(*) from conformes)=(select count(*) from attendu)
    returning m.asset_id,m.variant,m.storage_object_id
  ) select c.source,c.cible,coalesce(r.storage_object_id,c.inscrit) as inscrit
    from conformes c left join corrections r using(asset_id,variant)`;
}

async function rapprocher(plan, sql, ecrire, physiques = new Map()) {
  const correspondances = new Map(), idsCible = new Set();
  const objets = [...plan].map(([cle, ligne]) => {
    const p = physiques.get(cle);
    return p ? { ...ligne, relu_id: p.id, relu_version: p.version, relu_etag: p.etag ?? null, relu_md5: p.md5 } : ligne;
  });
  for (let debut = 0; debut < objets.length; debut += 100) {
    const lot = objets.slice(debut, debut + 100);
    let lignes;
    try { lignes = await sql(requete(ecrire), [JSON.stringify(lot)]); }
    catch { refuser("lecture_ou_collision"); }
    if (!Array.isArray(lignes) || lignes.length !== lot.length) refuser("preuve_cible");
    const sources = new Set(lot.map(l => l.source));
    for (const l of lignes) {
      if (!sources.delete(l.source) || !UUID.test(l.cible) || l.inscrit !== l.cible || idsCible.has(l.cible)) refuser("identite_cible");
      idsCible.add(l.cible);
      correspondances.set(l.source, l.cible);
    }
  }
  return correspondances;
}

module.exports = { BUCKET, TABLES, VERSION_SQL, ETAG_MD5, preparer, rapprocher, empreintesPhysiques };
