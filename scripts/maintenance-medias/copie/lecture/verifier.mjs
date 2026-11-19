// Vérification pure de métadonnées : aucune clé, aucun réseau, aucune approbation.
import {createHash} from 'node:crypto';
export const CIBLE='njkiyoklssvefstljemx';
export const BUCKET='content-heritage-prive';
const SHA=/^[0-9a-f]{64}$/;
export const sha=b=>createHash('sha256').update(b).digest('hex');
const refuser=c=>{throw Object.assign(Error(c),{code:c});};
const exact=(o,ks)=>{if(!o||Array.isArray(o)||typeof o!=='object'||Object.keys(o).sort().join('|')!==[...ks].sort().join('|'))refuser('METADONNEES_FORME');};
const booleen=x=>{if(typeof x!=='boolean')refuser('METADONNEES_FORME');};
const serie=(a,max)=>{if(!Array.isArray(a)||a.length>max)refuser('METADONNEES_FORME');};
const memeSerie=(a,b)=>{serie(a,32);return JSON.stringify([...a].sort())===JSON.stringify([...b].sort())&&new Set(a).size===a.length;};
const canonique=x=>Array.isArray(x)?x.map(canonique):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonique(x[k])])):x;
export function examiner(metadata,referenceBrut,PIN_REFERENCE_SHA256){
 if(!Buffer.isBuffer(referenceBrut)||referenceBrut.length>32768||sha(referenceBrut)!==PIN_REFERENCE_SHA256)refuser('REFERENCE_DERIVEE');
 let reference;try{reference=JSON.parse(referenceBrut);}catch{refuser('REFERENCE_FORME');}
 exact(reference,['format','statut','cible_source','recu_source_sha256','policies','fonctions_documentaires','sources_git','approved']);
 if(reference.format!=='passio-reference-storage-staging/1'||reference.statut!=='STAGING_SEULEMENT'||reference.cible_source!=='fcksxofaelcdmmifnwjo'||reference.approved!==false||!SHA.test(reference.recu_source_sha256))refuser('REFERENCE_FORME');
 serie(reference.policies,3);serie(reference.fonctions_documentaires,3);if(reference.policies.length!==3||reference.fonctions_documentaires.length!==3)refuser('REFERENCE_FORME');
 const ids=['passio_content_read','passio_attachments_read_membre','media_protected_select_closed'];
 if(!memeSerie(reference.policies.map(p=>p.identite),ids))refuser('REFERENCE_FORME');
 exact(metadata,['format','cible','catalogue_observe_sha256','lecture_seule','role_bypass','search_path_catalogue_premier','objets_ordinaire','bucket_ordinaire','colonnes_builtin','rls','force_rls','bucket_candidat','policies_total','policies','roles_clients','fonctions_documentaires']);
 if(metadata.format!=='passio-storage-reference-metadata/1'||metadata.cible!==CIBLE||!SHA.test(metadata.catalogue_observe_sha256))refuser('METADONNEES_FORME');
 for(const k of ['lecture_seule','role_bypass','search_path_catalogue_premier','objets_ordinaire','bucket_ordinaire','colonnes_builtin','rls','force_rls'])booleen(metadata[k]);
 if(!metadata.lecture_seule||!metadata.role_bypass||!metadata.search_path_catalogue_premier||!metadata.objets_ordinaire||!metadata.bucket_ordinaire||!metadata.colonnes_builtin||!metadata.rls)refuser('GARDE_CATALOGUE');
 if(!['ABSENT','PRIVE','PUBLIC','INDETERMINE'].includes(metadata.bucket_candidat))refuser('METADONNEES_FORME');if(!['ABSENT','PRIVE'].includes(metadata.bucket_candidat))refuser('BUCKET_PUBLIC_OU_INCONNU');
 if(metadata.policies_total!==3)refuser('ENSEMBLE_POLICIES_DIFFERENT');serie(metadata.policies,3);
 if(!memeSerie(metadata.policies.map(p=>p.identite),ids))refuser('ENSEMBLE_POLICIES_DIFFERENT');
 for(const p of metadata.policies){
  exact(p,['identite','commande','permissive','roles','types_builtin','fonctions_sures_pour_deparse','qual_sha256','check_sha256','fonctions_directes']);
  booleen(p.permissive);booleen(p.types_builtin);booleen(p.fonctions_sures_pour_deparse);
  if(!p.types_builtin||!p.fonctions_sures_pour_deparse||!SHA.test(p.qual_sha256||'')||!(p.check_sha256===null||SHA.test(p.check_sha256)))refuser('EXPRESSION_NON_VERIFIABLE');
  const r=reference.policies.find(x=>x.identite===p.identite);
  if(p.commande!=='SELECT'||p.commande!==r.commande||p.permissive!==r.permissive||!memeSerie(p.roles,r.roles)||p.qual_sha256!==r.qual_sha256||p.check_sha256!==r.check_sha256||!memeSerie(p.fonctions_directes,r.fonctions_directes))refuser('POLICY_DERIVEE');
 }
 serie(metadata.roles_clients,2);if(!memeSerie(metadata.roles_clients.map(r=>r.role),['anon','authenticated']))refuser('ROLES_INCOMPLETS');
 for(const r of metadata.roles_clients){exact(r,['role','present','superuser','bypass','owner_accessible','role_privilegie_accessible','select_table','select_colonne']);for(const k of Object.keys(r).filter(k=>k!=='role'))booleen(r[k]);if(!r.present||r.superuser||r.bypass||r.owner_accessible||r.role_privilegie_accessible)refuser('CLIENT_RLS_CONTOURNABLE');}
 serie(metadata.fonctions_documentaires,3);
 const fids=['auth.uid()','storage.foldername(text)','public.is_conv_member(text,text)'];
 if(!memeSerie(metadata.fonctions_documentaires.map(f=>f.signature),fids))refuser('FONCTIONS_INCOMPLETES');
 let fonctionsConcordantes=0;
 for(const f of metadata.fonctions_documentaires){exact(f,['signature','presente','source_sha256','sql','stable','volatilite','security_definer','arguments_oid','retour_oid','defaults','search_path_vide']);for(const k of ['presente','sql','stable','security_definer','search_path_vide'])booleen(f[k]);if(!['i','s','v'].includes(f.volatilite)||!SHA.test(f.source_sha256||'')||typeof f.arguments_oid!=='string'||!Number.isSafeInteger(f.retour_oid)||!Number.isSafeInteger(f.defaults))refuser('METADONNEES_FORME');const r=reference.fonctions_documentaires.find(x=>x.signature===f.signature);if(f.presente&&['source_sha256','sql','stable','security_definer','arguments_oid','retour_oid','defaults','search_path_vide'].every(k=>f[k]===r[k]))fonctionsConcordantes++;else refuser('FONCTION_DIRECTE_DERIVEE');}
 // Le hash ancien n'inclut pas les memberships/owner ni les3helpers directs.
 // Empreinte étendue séparée ; ABSENT->PRIVE reste un contrôle de phase distinct.
 const ordre=(a,b)=>a<b?-1:a>b?1:0;
 const contrat={cible:CIBLE,bucket:BUCKET,catalogue_observe_sha256:metadata.catalogue_observe_sha256,rls:metadata.rls,force_rls:metadata.force_rls,policies:metadata.policies.map(p=>({...p,roles:[...p.roles].sort(),fonctions_directes:[...p.fonctions_directes].sort()})).sort((a,b)=>ordre(a.identite,b.identite)),roles_clients:[...metadata.roles_clients].sort((a,b)=>ordre(a.role,b.role)),fonctions_documentaires:[...metadata.fonctions_documentaires].sort((a,b)=>ordre(a.signature,b.signature))};
 // Comparaison documentaire, pas une preuve générale des dépendances transitives.
 return Object.freeze({format:'passio-examen-reference-storage/1',cible:CIBLE,bucket:BUCKET,classe:'SET3_CONFORME_A_REFERENCE_STAGING',catalogue_observe_sha256:metadata.catalogue_observe_sha256,empreinte_contrat_lecture_sha256:sha(JSON.stringify(canonique(contrat))),reference_staging_sha256:reference.recu_source_sha256,policies_verifiees:3,roles_clients_verifies:2,fonctions_documentaires_concordantes:fonctionsConcordantes,fonctions_documentaires_observees:3,non_acces_client_par_policies_pour_ce_bucket:true,helpers_non_evalues:false,audit_transitif_helpers:false,approbation_root_produite:false,mutation_autorisee:false,commercial_go:false});
}
