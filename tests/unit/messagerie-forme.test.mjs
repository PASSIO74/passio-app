import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const a4 = readFileSync(new URL('../../js/app-04-comments-shop.js', import.meta.url), 'utf8');
const a8 = readFileSync(new URL('../../js/app-08-ui-modals-tour.js', import.meta.url), 'utf8');
function context(rows = []) {
  const ctx = vm.createContext({ console, MY_UID: 'moi', window: {}, _diag() {},
    _compteAuthReel: () => true, supaTs: (s) => Date.parse(s), MSG_LECTURE_MAX: 100, MSG_PAGE_LECTURE: 50,
    _fractionMicrosecondes: () => 0, _reactionKeySure: (s) => typeof s === 'string' ? s : '',
    supa: { from(table) {
      const data = table === 'conv_messages' ? rows : table === 'conversations'
        ? [{id:'conv_bad', is_group:true}, {id:'conv_ok', is_group:true}]
        : table === 'conv_members' ? [{conv_id:'conv_bad',user_id:'moi'}, {conv_id:'conv_ok',user_id:'moi'}] : [];
      const q = {then: (resolve) => resolve({data, error:null})};
      for (const k of ['select','eq','in','order','range','limit']) q[k] = () => q;
      return q;
    }}
  });
  vm.runInContext(a4.slice(a4.indexOf('function _messageContentData(') >= 0 ? a4.indexOf('function _messageContentData(') : a4.indexOf('function applyMsgContentData('), a4.indexOf('// Téléchargement doc depuis store global')), ctx);
  vm.runInContext(a8.slice(a8.indexOf('async function supaLoadMessages('), a8.indexOf('// ───────── Accusés de lecture réels')), ctx);
  vm.runInContext(a8.slice(a8.indexOf('async function supaLoadMyConversations('), a8.indexOf('// supaSubscribeMessages() remplacée')), ctx);
  return ctx;
}
const mauvais = [
  {type:'media',url:'https://example.test/a',fileType:1},
  {type:'audio',url:'https://example.test/a',filename:1},
  {type:'text',text:{a:1}}, {type:'text',rt:{id:1,t:[]}},
  {type:'gif',url:{}}, {type:'location',lat:'abc',lng:2},
  {type:'text',sp:{e:[]}}, {type:'react',target:{},emoji:'x'},
  {type:'inconnu'}, []
].map(JSON.stringify).concat(['{bad', '[bad']);
function row(id, conv_id, content) { return {id,conv_id,from_id:'autre',content,created_at:'2026-11-16T10:00:00Z'}; }
for (const [i, raw] of mauvais.entries()) {
  test('B06-N1 liste et fil conservent les messages sains, cas ' + i, async () => {
    const ctx = context([row('bad','conv_bad',raw),row('ok','conv_ok','message sain')]);
    const convs = await ctx.supaLoadMyConversations();
    assert.equal(convs.length, 2, 'une ligne invalide ne vide pas la liste');
    assert.equal(convs.find(c => c.id === 'conv_ok').messages[0].text, 'message sain');
    const msgs = await ctx.supaLoadMessages('conv_bad');
    assert.equal(msgs.length, 2, 'une ligne invalide ne vide pas le fil');
    assert.equal(msgs.find(m => m.id === 'ok').text, 'message sain');
    const bad = msgs.find(m => m.id === 'bad');
    assert.equal(typeof bad.text, 'string');
    assert.equal(bad.text, '[Message invalide]');
    assert.equal(bad._ctrl, undefined);
  });
}
test('formats légitimes, texte ancien et réponse emoji tronquée', () => {
  const ctx = context();
  for (const d of [{type:'text',text:'bonjour',rt:{id:'msg1',t:'\ud83d',n:'Test'}},
    {type:'media',url:'https://example.test/a',fileType:'video/mp4'},
    {type:'audio',url:'https://example.test/a',fileType:'audio/mp4',filename:'Message vocal (2s)'},
    {type:'doc',url:'https://example.test/a',filename:'document.pdf'},
    {type:'location',lat:48,lng:2,url:'https://example.test/a'}, {type:'gif',url:'https://example.test/a'}]) {
    const m = {text:JSON.stringify(d)};
    ctx.applyMsgContentData(m);
    assert.notEqual(m.text, '[Message invalide]');
    if (d.type === 'text') { assert.equal(m.text, 'bonjour'); assert.equal(m.replyTo.t, '\ud83d'); }
    if (d.type === 'audio') assert.equal(m.voiceDuration, 2);
  }
  const m = {text:'texte ancien'}; ctx.applyMsgContentData(m); assert.equal(m.text,'texte ancien');
});

test('texte scalaire ancien et format t ; dernière clé comme JSON.parse', () => {
  const ctx = context();
  for (const raw of ['42','null','true','"texte ancien"']) {const m={text:raw};ctx.applyMsgContentData(m);assert.equal(m.text,raw);}
  const m={text:'{"type":"t","text":"ancien"}'};ctx.applyMsgContentData(m);assert.equal(m.text,'ancien');
  const bon={text:'{"type":"media","fileType":1,"fileType":"video/mp4","url":"https://example.test/a"}'};ctx.applyMsgContentData(bon);assert.equal(bon.video,'https://example.test/a');
  const mauvais={text:'{"type":"media","fileType":"video/mp4","fileType":1,"url":"https://example.test/a"}'};ctx.applyMsgContentData(mauvais);assert.equal(mauvais.text,'[Message invalide]');
});
