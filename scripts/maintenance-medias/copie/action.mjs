// Entrypoint d'ACTION JS : le runtime token reste à l'intérieur de cette action.
import {copieServeur,qualificationServeur} from './serveur.mjs';
try{
 const operation=process.env.INPUT_OPERATION;
 if(operation==='qualification')console.log(JSON.stringify(await qualificationServeur()));
 else if(operation==='copie-seule')console.log(JSON.stringify(await copieServeur()));
 else throw Error('OPERATION_REFUSEE');
}catch{
 console.log(JSON.stringify({ok:false,categorie:'OPERATION_RETENUE',reprise_automatique:false,commercial_go:false}));process.exitCode=2;
}
