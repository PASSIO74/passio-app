import {planPrive,exigerContexte,refuser} from './contexte.mjs';
const caps=new WeakMap();
export function ouvrirAutorisation(){const p=exigerContexte(),c=Object.freeze({});caps.set(c,{p,engage:false});return c;}
export function exigerAutorisation(cap,operation){const c=caps.get(cap);if(!c||operation!=='COPIE_SEULE')refuser('AUTORISATION_ABSENTE');if(exigerContexte()!==c.p)refuser('AUTORISATION_ABSENTE');return planPrive();}
export function engagerTransport(cap,operation,lane){exigerAutorisation(cap,operation);const c=caps.get(cap);if(lane!=='COPIE'||c.engage)refuser('TRANSPORT_DEJA_ENGAGE');c.engage=true;}
export function fermerAutorisation(cap){caps.delete(cap);}
