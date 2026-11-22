import {createHash} from 'node:crypto';import {contratPrive} from '../contexte.mjs';
export const CONTRAT=Object.freeze({cible:'njkiyoklssvefstljemx',destination_bucket:'content-heritage-prive',get empreintes_cohorte(){return contratPrive().empreintes_cohorte;},get empreinte_contexte(){return contratPrive().empreinte_contexte;},sql_lecture_sha256:'74fd29adbdbdc702148bddc1f61c19c33f433026a08d0f20916df2f859cb1956'});
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/,sha=v=>createHash('sha256').update(v).digest('hex'),refus=c=>{throw Object.assign(Error(c),{code:c});};
export function verifierCohorte(observation){
 const a=observation?.analyse??observation,p=contratPrive();
 if(a?.objets_observes!==p.objets_observes||a.cohorte_proposee!==14||a.analyse_reference?.empreinte_contexte!==p.empreinte_contexte||a.analyse_reference?.couverture_liste_fermee!==false)refus('COHORTE_DERIVEE');
 const reel=(a.objets_cohorte||[]).map(x=>x.empreinte).sort();
 if(JSON.stringify(reel)!==JSON.stringify([...p.empreintes_cohorte].sort()))refus('COHORTE_DERIVEE');
 return {objets:p.objets_observes,copies:14,couverture_liste_fermee:false};
}
function texte(v,max=8192){if(typeof v!=='string'||!v||Buffer.byteLength(v)>max||v.includes('\0'))refus('FORME');return v;}
function objet(o,bucket){
 if(!o||!UUID.test(o.id)||o.bucket!==bucket||!UUID.test(o.owner||'')||o.owner!==o.owner_id)refus('PROPRIETAIRE');
 for(const k of ['name','version','mime','size'])texte(o[k]);if(!/^[0-9]{1,12}$/.test(o.size))refus('FORME');
 if(o.etag!==null)texte(o.etag);return o;
}
// Même tuple que dd024 : seule la projection du reçu ne contient pas ces valeurs.
export function empreintePhysique(o){return sha(JSON.stringify(['content-reference/1',o.id,o.bucket,o.name,o.version,o.owner,o.owner_id,o.mime,o.size,o.etag]));}
const utf8=v=>`pg_catalog.convert_from(pg_catalog.decode('${Buffer.from(texte(v)).toString('hex')}','hex'),'UTF8')`;
const nulTexte=v=>v===null?'NULL::pg_catalog.text':utf8(v);
export function preparerCasDestination(source,destination){
 objet(source,'content');
 if(!destination||!UUID.test(destination.id)||destination.bucket!==CONTRAT.destination_bucket||destination.name!==source.name||destination.owner!==null||destination.owner_id!==null)refus('CAS_DESTINATION');
 texte(destination.version);texte(destination.mime);texte(destination.size);if(destination.etag!==null)texte(destination.etag);
 // Chaînes issues de RAM encodées en hex UTF8, aucun identifiant SQL libre.
 // Uniquement UPDATE de la destination. Le retour raw doit rester en RAM.
 const cle=utf8(source.name),sid=`'${source.id}'::pg_catalog.uuid`,did=`'${destination.id}'::pg_catalog.uuid`,uid=`'${source.owner}'::pg_catalog.uuid`,owner=utf8(source.owner_id);
 const conforme=(alias,o)=>`${alias}.version IS NOT DISTINCT FROM ${utf8(o.version)}
   AND (${alias}.metadata OPERATOR(pg_catalog.->>) 'mimetype') IS NOT DISTINCT FROM ${utf8(o.mime)}
   AND (${alias}.metadata OPERATOR(pg_catalog.->>) 'size') IS NOT DISTINCT FROM ${utf8(o.size)}
   AND (${alias}.metadata OPERATOR(pg_catalog.->>) 'eTag') IS NOT DISTINCT FROM ${nulTexte(o.etag)}`;
 return `WITH admissible AS MATERIALIZED (
 SELECT d.id FROM ONLY storage.objects d JOIN ONLY storage.objects s ON s.id OPERATOR(pg_catalog.=) ${sid}
 WHERE d.id OPERATOR(pg_catalog.=) ${did} AND d.bucket_id OPERATOR(pg_catalog.=) '${CONTRAT.destination_bucket}'
 AND d.name OPERATOR(pg_catalog.=) ${cle} AND ${conforme('d',destination)} AND d.owner IS NULL AND d.owner_id IS NULL
 AND s.bucket_id OPERATOR(pg_catalog.=) 'content' AND s.name OPERATOR(pg_catalog.=) ${cle} AND ${conforme('s',source)}
 AND s.owner OPERATOR(pg_catalog.=) ${uid} AND s.owner_id OPERATOR(pg_catalog.=) ${owner}
 AND EXISTS(SELECT 1 FROM ONLY auth.users u WHERE u.id OPERATOR(pg_catalog.=) ${uid})
 AND EXISTS(SELECT 1 FROM ONLY public.profiles p WHERE p.id OPERATOR(pg_catalog.=) ${owner})
 AND NOT EXISTS(SELECT 1 FROM ONLY public.comptes_en_suppression c WHERE c.user_id OPERATOR(pg_catalog.=) ${owner} AND c.statut IN ('en_cours','purgee','supprimee')))
 UPDATE ONLY storage.objects d SET owner=${uid},owner_id=${owner} FROM admissible a
 WHERE d.id OPERATOR(pg_catalog.=) a.id AND d.bucket_id OPERATOR(pg_catalog.=) '${CONTRAT.destination_bucket}'
 AND d.name OPERATOR(pg_catalog.=) ${cle} AND ${conforme('d',destination)} AND d.owner IS NULL AND d.owner_id IS NULL
 RETURNING d.id::pg_catalog.text,d.version,d.owner::pg_catalog.text,d.owner_id;`;
}

