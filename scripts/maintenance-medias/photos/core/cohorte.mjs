const PREFIXES=['avatars','covers','passion_photos','passion_covers','events'];
export function projeter(payload,base){
 const analyse=base.analyser(payload),index=new Map(analyse.objets_classes.map(x=>[x.empreinte,x]));
 const motifs={HORS_CINQ_PREFIXES:0,USAGE_PERSONNEL_REFERENCE:0,USAGE_MIXTE_REFERENCE:0};
 const hors=Object.fromEntries(PREFIXES.map(k=>[k,0])),cohorte=[];
 for(const o of payload.tables.objects.rows){
  const empreinte=base.empreinteObjet(o),x=index.get(empreinte);if(!x)throw Error('COHERENCE');
  const prefixe=o.name.split('/')[0],raisons=[];
  if(!PREFIXES.includes(prefixe))raisons.push('HORS_CINQ_PREFIXES');
  if(x.usages.personnel>0)raisons.push('USAGE_PERSONNEL_REFERENCE');
  if(x.classe==='MIXTE_RETENU')raisons.push('USAGE_MIXTE_REFERENCE');
  if(raisons.length){for(const r of raisons)motifs[r]++;cohorte.push({empreinte,classe_reference:x.classe,motifs:raisons});}
  else hors[prefixe]++;
 }
 cohorte.sort((a,b)=>a.empreinte.localeCompare(b.empreinte));
 const exclus=Object.values(hors).reduce((a,b)=>a+b,0);
 if(cohorte.length+exclus!==analyse.objets||index.size!==analyse.objets)throw Error('COHERENCE');
 return {format:'passio-cohorte-heritage/1',objets_observes:analyse.objets,cohorte_proposee:cohorte.length,
  motifs_non_disjoints:motifs,objets_cohorte:cohorte,
  hors_cohorte:{objets:exclus,prefixes:hors,statut_sur_non_etabli:true},
  analyse_reference:{couverture_liste_fermee:analyse.couverture_liste_fermee,classes:analyse.classes,
   references:analyse.references,inconnus:analyse.inconnus,empreinte_contexte:analyse.empreinte_contexte},
  liens_sans_objet:{occurrences:analyse.references.SANS_OBJET,nombre_cles_distinctes_non_observe:true,
   traitement_separe:true,aucun_objet_a_copier_deduit:true},
  objets_sans_usage_non_declares_orphelins:true,empreintes_metadonnees_pas_octets:true,
  public_owner_descriptif_sans_consentement:true,autorisation_mutation:false,go_commercial:false};
}

