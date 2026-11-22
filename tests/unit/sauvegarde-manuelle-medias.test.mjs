import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {parse} from './lib/yaml-mini.mjs';
import {decide} from './lib/expression-github.mjs';
const workflow=parse(fs.readFileSync(new URL('../../.github/workflows/sauvegarde.yml',import.meta.url),'utf8'));
const step=workflow.jobs.sauvegarder.steps.find(s=>String(s.run).includes('node scripts/sauvegarde-donnees.js --sortie'));
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
for(const c of [
  {event:'schedule',day:'2',requested:undefined,media:false},
  {event:'schedule',day:'7',requested:undefined,media:true},
  {event:'schedule',day:'2',requested:true,media:false},
  {event:'workflow_dispatch',day:'2',requested:undefined,media:false},
  {event:'workflow_dispatch',day:'2',requested:false,media:false},
  {event:'workflow_dispatch',day:'2',requested:true,media:true},
  {event:'workflow_dispatch',day:'7',requested:false,media:true},
])test(`sauvegarde ${c.event}, jour ${c.day}, option ${c.requested} : médias ${c.media}`,()=>{
  const ctx={github:{event_name:c.event},inputs:{avec_medias:c.requested}};
  assert.match(step.env.MEDIAS_DEMANDES,/^\$\{\{[\s\S]*\}\}$/);
  const requested=decide(step.env.MEDIAS_DEMANDES.slice(3,-2).trim(),ctx);
  // Execute the real shell step, with only date and node replaced. No exporter runs.
  const prelude=`date(){ printf '%s\\n' '${c.day}'; }; node(){ printf '%s\\n' "$@"; };\n`;
  const env={PATH:'/usr/bin:/bin',SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC_ONLY',MEDIAS_DEMANDES:String(requested)};
  for(const k of ['SystemRoot','WINDIR'])if(process.env[k])env[k]=process.env[k];
  const r=spawnSync(bash,['--noprofile','--norc','-c',prelude+step.run],{env,encoding:'utf8',timeout:5000,windowsHide:true,maxBuffer:65536});
  assert.ifError(r.error);assert.equal(r.status,0,r.stderr);
  assert.deepEqual(r.stdout.trim().split(/\r?\n/),['scripts/sauvegarde-donnees.js','--sortie','sauvegarde','--avec-comptes',...(c.media?['--avec-medias']:[])]);
});
test('option manuelle désactivée par défaut, cible main protégée et chiffrement conservé',()=>{
  const input=workflow.on.workflow_dispatch.inputs.avec_medias;
  assert.equal(input.type,'boolean');assert.equal(String(input.default),'false');
  for(const [event,ref,allowed]of[['workflow_dispatch','refs/heads/main',true],['workflow_dispatch','refs/heads/autre',false],['schedule','refs/heads/main',true]])assert.equal(decide(workflow.jobs.sauvegarder.if,{github:{event_name:event,ref}}),allowed);
  const encrypt=workflow.jobs.sauvegarder.steps.find(s=>s.name==='Chiffrer'),upload=workflow.jobs.sauvegarder.steps.find(s=>String(s.uses).startsWith('actions/upload-artifact@'));
  assert.match(encrypt.run,/age -r/);assert.equal(upload.with.path,'${{ env.nom }}');
});
