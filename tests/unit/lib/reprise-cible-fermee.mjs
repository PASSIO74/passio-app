import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../../../scripts/lib/reprise-medias-fermes.js');
// Les anciennes fixtures n'ont pas de table de réglages. Le vrai lecteur et
// la vraie garde tournent ; seule cette nouvelle lecture de catalogue est doublée.
export function avecCibleFermee(fetch) {
  return async (url,init={})=>{
    if(String(url).endsWith('/database/query')&&typeof init.body==='string') {
      const b=JSON.parse(init.body);
      if(b.query===M.SQL_CATALOGUE) {
        assert.equal(b.read_only,true);assert.equal(init.redirect,'error');
        return new Response(JSON.stringify([{lecture_seule:true,presente:false,genre:null,non_filtree:true}]));
      }
    }
    return fetch(url,init);
  };
}
