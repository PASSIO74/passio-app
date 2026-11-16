const { test, expect } = require('@playwright/test');
const { bootOnboarded } = require('./app-helper');

test('B06-N1 : la liste et le fil restent rendus avec une enveloppe invalide', async ({ page }) => {
  await bootOnboarded(page);
  await page.route(/\/(rest|functions|storage)\/v1\//, route => route.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const result = await page.evaluate(() => {
    const raws = [
      {type:'media',url:'https://example.test/a',fileType:1},
      {type:'audio',url:'https://example.test/a',filename:1},
      {type:'text',text:{}}, {type:'text',rt:{t:[]}}
    ];
    const c = {id:'grp_forme',isGroup:true,groupName:'Banc de forme',userName:'Banc',userIds:[MY_UID],unread:0,lastAt:Date.now(),messages:[]};
    raws.forEach((d,i) => {const m={id:'bad_'+i,from:'autre',text:JSON.stringify(d),at:Date.now()+i};applyMsgContentData(m);c.messages.push(m);});
    c.messages.push({id:'sain',from:'me',text:'message sain conservé',at:Date.now()+10});
    for (const text of ['[rdv demain]', '{"a":1}']) {
      const m = {id:'legitime_'+c.messages.length,from:'me',text:'',at:Date.now()+11};
      applyMsgContentData(m, JSON.stringify({type:'text',text}));
      c.messages.push(JSON.parse(JSON.stringify(m)));
    }
    conversationsState=[c]; saveConversations(); goTo('messages'); renderMessages();
    return {list:document.getElementById('messageList').textContent, thread:(function(){if(!document.getElementById('convFpThread')){const el=document.createElement('div');el.id='convFpThread';document.body.appendChild(el);}renderConvFpThread(c,'Banc');return document.getElementById('convFpThread').textContent;})()};
  });
  expect(result.list).toContain('Banc de forme');
  expect(result.thread).toContain('message sain conservé');
  expect(result.thread).toContain('[rdv demain]');
  expect(result.thread).toContain('{"a":1}');
  expect(result.thread.match(/\[Message invalide\]/g)).toHaveLength(4);
});

test('un texte saisi ressemblant à JSON reste un texte au rendu et à l’envoi', async ({ page }) => {
  await bootOnboarded(page);
  await page.route(/\/(rest|functions|storage)\/v1\//, route => route.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const result = await page.evaluate(() => {
    const texts = ['[rdv demain]', '{"a":1}', '{"type":"media","fileType":1}'];
    const c = {id:'grp_texte_litteral',isGroup:true,groupName:'Banc',userName:'Banc',userIds:[MY_UID],messages:[]};
    conversationsState=[c];
    window.requireAuthentication=()=>true;
    const sent=[];
    _sendTextToSupa=(conv,id,content)=>sent.push(JSON.parse(content));
    for (const id of ['convFpInput','convFpThread']) {
      if (!document.getElementById(id)) {const el=document.createElement(id==='convFpInput'?'textarea':'div');el.id=id;document.body.appendChild(el);}
    }
    for (const text of texts) {
      document.getElementById('convFpInput').value=text;
      sendMessageFp(c.id,'Banc');
    }
    renderConvFpThread(c,'Banc');
    return {sent,texts,local:c.messages.map(m=>m.text),thread:document.getElementById('convFpThread').textContent};
  });
  expect(result.local).toEqual(result.texts);
  expect(result.sent.map(m=>m.type)).toEqual(['text','text','text']);
  expect(result.sent.map(m=>m.text)).toEqual(result.texts);
  for (const text of result.texts) expect(result.thread).toContain(text);
});
