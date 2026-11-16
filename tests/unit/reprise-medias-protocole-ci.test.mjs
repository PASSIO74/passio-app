import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import './lib/bash-windows.mjs';

// Vrai wrapper ; seuls PostgreSQL et son fils Node sont doublés. Le vrai SQL
// est éprouvé par le runner natif, pas par ces contrôles de protocole.
const wrapper=new URL('../sql/reprise-medias-portables.test.sh',import.meta.url);
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
function bac(options={}) {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'passio-reprise-ci-protocole-')),bin=path.join(base,'bin'),tmp=path.join(base,'tmp'),log=path.join(base,'log');
  fs.mkdirSync(bin);fs.mkdirSync(tmp);
  const ecrire=(nom,texte)=>{const f=path.join(bin,nom);fs.writeFileSync(f,texte);fs.chmodSync(f,0o755);};
  const trace='printf "%s\\n" "'+ '${0##*/}' +' $*" >> "$PASSIO_PROTOCOL_LOG"\n';
  ecrire('id','#!/usr/bin/env bash\n[ "$1" = -u ] && { echo 1001; exit 0; }; exit 1\n');
  ecrire('pg_isready','#!/usr/bin/env bash\n'+trace+'exit "${PASSIO_PROTOCOL_OCCUPIED:-2}"\n');
  ecrire('psql','#!/usr/bin/env bash\n'+trace+'echo unexpected_psql >&2;exit 91\n');
  ecrire('initdb','#!/usr/bin/env bash\n'+trace+`if [ "$1" = --version ]; then echo "initdb (PostgreSQL) ${options.pg||'18.6'}"; exit 0; fi
if [ "\${PASSIO_PROTOCOL_INIT_FAIL:-0}" = 1 ]; then exit 11; fi
while [ "$#" -gt 0 ]; do if [ "$1" = -D ]; then shift; mkdir -p "$1"; fi; shift; done
`);
  ecrire('pg_ctl','#!/usr/bin/env bash\n'+trace+`data='';action=''
while [ "$#" -gt 0 ]; do case "$1" in -D) shift;data="$1";; start|stop)action="$1";; esac;shift;done
if [ "$action" = start ]; then
 [ "\${PASSIO_PROTOCOL_START_FAIL:-0}" != 1 ] || exit 15
 printf '12345\\n' > "$data/postmaster.pid"
fi
if [ "$action" = stop ]; then
 [ "\${PASSIO_PROTOCOL_STOP_FAIL:-0}" != 1 ] || exit 12
 rm -- "$data/postmaster.pid"
fi
`);
  const proxy=path.join(base,'node-proxy.cjs');
  fs.writeFileSync(proxy,`const fs=require('node:fs'),{spawnSync}=require('node:child_process');
const a=process.argv.slice(2);
if(a[0]==='-p'&&a[1]==='process.versions.node'){process.stdout.write(process.env.PASSIO_PROTOCOL_NODE||'22.23.5');process.exit(0);}
if(a[0]?.endsWith('reprise-medias-portables-runner.mjs')){
 const arg=n=>a[a.indexOf(n)+1];
 const pgpass=arg('--password-file'),marker=arg('--cluster-marker'),data=arg('--data-directory');
 if(!pgpass||!marker||!data||!fs.readFileSync(marker,'utf8').startsWith('PASSIO_REPRISE_URLS_CI_'))process.exit(93);
 if(!/^127[.]0[.]0[.]1:55472:[*]:postgres:[0-9a-f]{64}\\n$/.test(fs.readFileSync(pgpass,'utf8')))process.exit(94);
 if(process.platform!=='win32'&&(fs.statSync(pgpass).mode&0o777)!==0o600)process.exit(95);
 fs.appendFileSync(process.env.PASSIO_PROTOCOL_LOG,'RUNNER '+JSON.stringify(a)+'\\n');
 const code=Number(process.env.PASSIO_PROTOCOL_RUNNER_FAIL||0);
 fs.writeFileSync(arg('--output'),JSON.stringify({ok:code===0,nettoyage_absence:code===0,cluster_directory_checked:true,postgres_version_num:180006,checks:Array.from({length:18},()=>({ok:true}))}));process.exit(code);
}
const r=spawnSync(process.execPath,a,{stdio:'inherit',env:process.env});process.exit(r.status??96);
`);
  ecrire('node','#!/usr/bin/env bash\nexec '+quote(process.execPath.replace(/\\/g,'/'))+' '+quote(proxy.replace(/\\/g,'/'))+' "$@"\n');
  const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,TMPDIR:tmp.replace(/\\/g,'/'),PASSIO_REPRISE_URLS_PGBIN:bin.replace(/\\/g,'/'),PASSIO_PROTOCOL_LOG:log,
    PASSIO_PROTOCOL_NODE:options.node||'22.23.5',PASSIO_PROTOCOL_OCCUPIED:String(options.occupied??2),PASSIO_PROTOCOL_RUNNER_FAIL:String(options.runnerFail||0),
    PASSIO_PROTOCOL_INIT_FAIL:String(options.initFail||0),PASSIO_PROTOCOL_STOP_FAIL:String(options.stopFail||0),PASSIO_PROTOCOL_START_FAIL:String(options.startFail||0)};
  const r=spawnSync('bash',['--noprofile','--norc',fileURLToPath(wrapper).replace(/\\/g,'/')],{env,encoding:'utf8',timeout:30000});
  return {base,tmp,r,log:fs.existsSync(log)?fs.readFileSync(log,'utf8'):'',restes:fs.readdirSync(tmp)};
}
function nettoyer(b) {
  assert.equal(path.dirname(path.resolve(b.base)),path.resolve(os.tmpdir()));
  assert.ok(path.basename(b.base).startsWith('passio-reprise-ci-protocole-'));
  fs.rmSync(b.base,{recursive:true,force:true});
}
test('wrapperCI : PG18 fourni et Node22, SCRAM/pgpass dédié, port local, arrêt et absence du dossier',()=>{
  const b=bac();try{
    assert.equal(b.r.status,0,b.r.stderr);assert.match(b.r.stdout,/PostgreSQL\) 18\.6/);
    assert.match(b.log,/pg_isready -h 127\.0\.0\.1 -p 55472 -t 1/);
    assert.match(b.log,/initdb -D .* --auth=scram-sha-256 --pwfile=/);
    assert.match(b.log,/RUNNER .*--data-directory.*--cluster-marker/);
    assert.match(b.log,/pg_ctl -D .* stop -m fast -w -t 10/);assert.deepEqual(b.restes,[]);
  }finally{nettoyer(b);}
});
test('PG17 explicitement mesuré demeure accepté ; PG16 et Node24 refusés avant initialisation',()=>{
  for(const [options,code]of [[{pg:'17.12'},0],[{pg:'16.15'},1],[{node:'24.16.0'},1]]){
    const b=bac(options);try{
      assert.equal(b.r.status,code,b.r.stderr);
      if(code)assert.doesNotMatch(b.log,/initdb -D|RUNNER /);else assert.match(b.r.stdout,/PostgreSQL\) 17\.12/);
      assert.deepEqual(b.restes,[]);
    }finally{nettoyer(b);}
  }
});
test('port occupé ou état inconnu : aucun cluster ni runner lancé',()=>{
  for(const occupied of [0,1,3]){const b=bac({occupied});try{
    assert.equal(b.r.status,1);assert.doesNotMatch(b.log,/initdb -D|pg_ctl|RUNNER /);assert.deepEqual(b.restes,[]);
  }finally{nettoyer(b);}}
});
test('échec runner ou initdb : rouge propagé et nettoyage de la seule source dédiée',()=>{
  for(const [options,code]of [[{runnerFail:7},7],[{initFail:1},11]]){const b=bac(options);try{
    assert.equal(b.r.status,code,b.r.stderr);assert.deepEqual(b.restes,[]);
    if(options.runnerFail)assert.match(b.log,/ stop -m fast /);else assert.doesNotMatch(b.log,/RUNNER /);
  }finally{nettoyer(b);}}
});
test('un arrêt de cluster non prouvé garde son répertoire marqué et rend rouge',()=>{
  for(const options of [{stopFail:1},{startFail:1}]){const b=bac(options);try{
    assert.equal(b.r.status,1);assert.equal(b.restes.length,1);
    assert.match(fs.readFileSync(path.join(b.tmp,b.restes[0],'PASSIO_REPRISE_URLS_CI'),'utf8'),/^PASSIO_REPRISE_URLS_CI_/);
  }finally{nettoyer(b);}}
});
