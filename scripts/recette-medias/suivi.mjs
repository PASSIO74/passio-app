import {CIBLE} from './parcours.mjs';
function verifie(r,status,A,B){
  if(!Array.isArray(r)||r.length!==1)throw Error('SUIVI_CARDINALITE');
  const row=r[0];if(!row||Object.keys(row).sort().join(',')!=='follower_id,following_id,status'||row.follower_id!==B||row.following_id!==A||row.status!==status)throw Error('SUIVI_STATUT');
}
export async function accepterSuivi(send,A,B){
  const filter='follower_id=eq.'+B+'&following_id=eq.'+A;
  const base=CIBLE+'/rest/v1/follows?select=follower_id,following_id,status';
  verifie(await send(B,'POST',base,{follower_id:B,following_id:A},201),'pending',A,B);
  verifie(await send(A,'PATCH',base+'&'+filter+'&status=eq.pending',{status:'accepted'},200),'accepted',A,B);
  for(const id of [A,B])verifie(await send(id,'GET',base+'&'+filter,undefined,200),'accepted',A,B);
}
