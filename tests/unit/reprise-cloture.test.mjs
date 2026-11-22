import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const C=require('../../scripts/lib/reprise-cloture-medias.js');
const {ETAPES}=require('../../scripts/schema-executable.js');

const ids=[
  'fonction:public.media_heritage_stockage_public(text,text)',
  'fonction:public.media_heritage_ref_categorie(text)',
  'fonction:public.media_heritage_refs(jsonb)',
  'fonction:public.media_heritage_stockage()',
  'fonction:public.media_heritage_references()',
  'policy:media_heritage_insert','policy:media_heritage_update',
  'trigger:storage.objects.media_heritage_stockage',
  'trigger:public.posts.media_heritage_references','trigger:public.stories.media_heritage_references',
];
const absentes=()=>ids.map(identite=>({identite,presente:false,marque:null,empreinte:null,definition:null,etat:null,proprietaires_ok:false}));

test('archive historique sans clôture : aucun objet ni commentaire ajouté',()=>{
  assert.deepEqual(C.rendre(absentes()),[]);
  const etape=ETAPES.find(e=>e.titre.startsWith('Clôture médias'));
  assert.ok(etape);assert.equal(etape.sql,C.SQL);assert.deepEqual(etape.rendu(absentes()),[]);
});

test('métadonnées incomplètes, dupliquées ou étrangères : aucune reconstruction partielle',()=>{
  for(const rows of [null,absentes().slice(1),[...absentes(),absentes()[0]],absentes().map((r,i)=>i===9?absentes()[0]:r),absentes().map((r,i)=>i===0?{...r,identite:'fonction:public.inconnue()'}:r)]) {
    assert.throws(()=>C.rendre(rows),/reprise_cloture_source_inconnue/);
  }
});

test('une clôture partielle ou un objet marqué sans contrat complet reste refusé',()=>{
  const rows=absentes();rows[0]={...rows[0],presente:true,marque:C.MARQUE,proprietaires_ok:true};
  assert.throws(()=>C.rendre(rows),/reprise_cloture_source_partielle_ou_derivee/);
});

test('un état de déclencheur inconnu ne devient jamais ENABLE ordinaire',()=>{
  for(const etat of [undefined,null,'X','enable always; select 1']) {
    assert.throws(()=>C.rendreDeclencheurs([{def:'CREATE TRIGGER x',sch:'public',table_name:'t',tgname:'x',etat}]),/reprise_declencheur_source_inconnu/);
  }
});

test('les noms de table et de déclencheur restent des identifiants délimités',()=>{
  const [sql]=C.rendreDeclencheurs([{def:'CREATE TRIGGER x',sch:'public',table_name:'table"exemple',tgname:'trigger"exemple',etat:'A'}]);
  assert.ok(sql.includes('alter table "public"."table""exemple" enable always trigger "trigger""exemple";'));
});
