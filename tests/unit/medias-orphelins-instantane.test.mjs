import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../scripts/medias-orphelins.js',import.meta.url),'utf8');
const object={name:'fixture_alive.webp',size:8,created_at:'2000-01-01T00:00:00Z'};
function fixture(args=[]){
  const rows=[...Array.from({length:1000},()=>({media_url:null})),{media_url:'https://fixture.invalid/'+object.name}];
  const seen=[],calls=[],messages=[];
  let configReads=0,deleted=0,shifted=false;
  const module={exports:{}};
  const process={argv:['node','medias-orphelins.js',...args],exitCode:0,exit(code){throw Object.assign(Error('fixture_exit'),{code});}};
  const sandbox={module,process,URL,Response,
    require(name){assert.equal(name,'../tests/e2e/compte-e2e.js');return {configAdmin(){configReads++;return {url:'https://gc-fixture.invalid',cle:'synthetic-key'};}};},
    console:{log(...a){messages.push(a.join(' '));},error(...a){messages.push(a.join(' '));}},
    async fetch(input,init={}){
      const u=new URL(input);assert.equal(u.origin,'https://gc-fixture.invalid');
      calls.push({path:u.pathname,method:init.method||'GET'});
      if(u.pathname==='/rest/v1/posts'){
        const offset=Number(u.searchParams.get('offset'));
        // Une écriture concurrente retire une ligne déjà lue. La référence
        // toujours vivante passe de la position1000 à999 avant la page suivante.
        if(offset>0&&!shifted){rows.shift();shifted=true;}
        const page=rows.slice(offset,offset+1000);seen.push(...page);return Response.json(page);
      }
      if(['/rest/v1/profiles','/rest/v1/stories','/rest/v1/conv_messages','/rest/v1/user_state'].includes(u.pathname))return Response.json([]);
      if(u.pathname==='/storage/v1/object/list/content')return Response.json([{name:object.name,created_at:object.created_at,metadata:{size:8}}]);
      if(u.pathname==='/storage/v1/object/list/attachments')return Response.json([]);
      if(u.pathname==='/storage/v1/object/content'&&init.method==='DELETE'){deleted++;return Response.json({});}
      throw Error('unexpected_fixture_request');
    },
  };
  vm.runInNewContext(source+'\nglobalThis.runFixture = main;',sandbox);
  return {run:()=>sandbox.runFixture(),module,rows,seen,calls,messages,process,
    get configReads(){return configReads;},get deleted(){return deleted;}};
}

test('pagination concurrente : une référence vivante peut manquer au rapport malgré toutes les réponses200',async()=>{
  const f=fixture();await f.run();
  assert.ok(f.rows.some(r=>r.media_url?.includes(object.name)));
  assert.ok(!f.seen.some(r=>r.media_url?.includes(object.name)));
  assert.equal(f.module.exports.classerOrphelins([object],JSON.stringify(f.seen)).orphelins.length,1);
  assert.equal(f.deleted,0);
});

test('--appliquer refuse avant credential et HTTP : aucune suppression sur une absence de référence non prouvée',async()=>{
  const f=fixture(['--appliquer']);await f.run();
  assert.equal(f.deleted,0,'un média encore référencé ne doit pas être supprimé');
  assert.equal(f.calls.length,0);
  assert.equal(f.configReads,0);
  assert.equal(f.process.exitCode,2);
  assert.ok(f.messages.some(m=>m.includes('GC_SNAPSHOT_REQUIRED')));
});
