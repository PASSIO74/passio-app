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
    conversationsState=[c]; saveConversations(); goTo('messages'); renderMessages();
    return {list:document.getElementById('messageList').textContent, thread:(function(){if(!document.getElementById('convFpThread')){const el=document.createElement('div');el.id='convFpThread';document.body.appendChild(el);}renderConvFpThread(c,'Banc');return document.getElementById('convFpThread').textContent;})()};
  });
  expect(result.list).toContain('Banc de forme');
  expect(result.thread).toContain('message sain conservé');
  expect(result.thread.match(/\[Message invalide\]/g)).toHaveLength(4);
});
