import {writeFileSync} from 'node:fs';
import {loadBenchmarkConfig} from './config.mjs';
import assert from 'node:assert/strict';
import {chromium} from '/Users/wangziwen/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {createCloudRepository} from '../../src/cloudClient.js';
const c=loadBenchmarkConfig();const out=c.outputDir;
if(c.online && process.argv.includes('--account-b')) {
  c.emailA=c.emailB;
  c.passwordA=c.passwordB;
}
const r=await fetch(c.supabaseUrl+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json',apikey:c.anonKey},body:JSON.stringify({email:c.emailA,password:c.passwordA})});const session=await r.json();if(!session.access_token)throw Error(`Test account A authentication failed (HTTP ${r.status})`);const repo=createCloudRepository({baseUrl:c.apiUrl,getToken:async()=>session.access_token});
const fixtureNote = c.online ? 'KnowFlow benchmark '+crypto.randomUUID() : null;
if (fixtureNote) {
  await repo.saveGraph({
    id:crypto.randomUUID(),pinned:false,
    nodes:[
      {id:'root',position:{x:0,y:0},data:{title:'Benchmark root',userMessage:'Synthetic question',assistantMessage:'Synthetic answer',isRoot:true}},
      {id:'child',position:{x:300,y:0},data:{title:'Benchmark child',userMessage:'Synthetic question',assistantMessage:'Synthetic answer',parentId:'root'}}
    ],
    edges:[{id:'benchmark-edge',source:'root',target:'child',data:{relationshipType:'related-to',note:fixtureNote}}]
  },{expectedVersion:0,mutationId:crypto.randomUUID()});
}
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const result={login:c.online?'Deployed sign-in UI in separate incognito contexts':'Supabase SDK signInWithPassword through real Auth; separate incognito contexts',conflict:{},offline:{}};
async function open(){const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));await page.goto(c.frontendUrl);if (c.online) {
    await page.getByTitle('Sign in', {exact:true}).click();
    await page.getByLabel('Email', {exact:true}).fill(c.emailA);
    await page.getByLabel('Password', {exact:true}).fill(c.passwordA);
    await page.getByRole('button', {name:'Sign in',exact:true}).click();
    await page.getByText('Cloud workspace',{exact:true}).waitFor();
    const closeAccount = page.getByRole('button', {name:'Close account panel'});
    if (await closeAccount.isVisible()) await closeAccount.click();
    await page.locator('.react-flow__edge[data-id=benchmark-edge]').waitFor();
  } else await page.evaluate(async({email,password})=>{const {supabase}=await import('/src/cloudClient.js');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;},{email:c.emailA,password:c.passwordA});await page.locator('.react-flow__edge').first().waitFor();return{context,page};}
async function edit(page,relationship,expectedNote){await page.locator('.react-flow__edge').first().dispatchEvent('click');if(expectedNote) assert.equal(await page.getByLabel('Note',{exact:true}).inputValue(),expectedNote);await page.getByLabel('Relationship',{exact:true}).selectOption(relationship);await page.getByRole('button',{name:'Save changes',exact:true}).click();}
try{const [a,b]=await Promise.all([open(),open()]);if(!c.online) await b.page.screenshot({path:out+'/initial.png'});
const nextPut=page=>{const pending=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/api/graphs/'));pending.catch(()=>{});return pending;};
const ap=nextPut(a.page);await edit(a.page,'explains',fixtureNote);await a.page.clock.runFor(2000);const ar=await ap;const ag=(await ar.json()).graph;result.conflict.aExpectedVersion=ar.request().postDataJSON().expectedVersion;result.conflict.aStatus=ar.status();result.conflict.graphId=ag.id;const bp=nextPut(b.page);await edit(b.page,'contradicts',fixtureNote);await b.page.clock.runFor(2000);const br=await bp;result.conflict.bExpectedVersion=br.request().postDataJSON().expectedVersion;assert.equal(result.conflict.aExpectedVersion,result.conflict.bExpectedVersion);result.conflict.bStatus=br.status();await b.page.getByText('Conflicting changes',{exact:true}).waitFor();result.conflict.notice=await b.page.locator('.cloud-notice').innerText();assert.equal((await repo.getGraph(ag.id)).edges[0].data.relationshipType,'explains');result.conflict.aPreserved=true;if(!c.online) await b.page.screenshot({path:out+'/conflict.png'});
const recovery=nextPut(b.page);await b.page.getByRole('button',{name:'Save my edits as a new graph',exact:true}).click();const rec=await recovery;const rg=(await rec.json()).graph;assert.equal((await repo.getGraph(rg.id)).edges[0].data.relationshipType,'contradicts');assert.notEqual(rg.id,ag.id);result.conflict.recoveredGraphId=rg.id;result.conflict.bRecovered=true;result.conflict.status='PASS';
await edit(b.page,'compares-with',fixtureNote);await b.context.setOffline(true);await b.page.clock.runFor(2000);await b.page.getByText('Not saved to cloud',{exact:true}).waitFor();result.offline.notice=await b.page.locator('.cloud-notice').innerText();result.offline.localDraftRetained=await b.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('knowflow.cloud-drafts')).some(k=>localStorage[k].includes('compares-with')));assert.equal(result.offline.localDraftRetained,true);if(!c.online) await b.page.screenshot({path:out+'/offline.png'});await b.context.setOffline(false);const retry=nextPut(b.page);await b.page.getByRole('button',{name:'Retry save',exact:true}).click();const retried=await retry;result.offline.retryStatus=retried.status();assert.equal((await repo.getGraph(rg.id)).edges[0].data.relationshipType,'compares-with');const fresh=await open();await fresh.page.locator('.react-flow__edge').first().dispatchEvent('click');await fresh.page.getByLabel('Note',{exact:true}).waitFor();result.offline.freshSessionRelationship=await fresh.page.getByLabel('Relationship',{exact:true}).inputValue();assert.equal(result.offline.freshSessionRelationship,'compares-with');result.offline.status='PASS';if(!c.online) await fresh.page.screenshot({path:out+'/fresh-session.png'});
}catch(e){result.error=e.stack;process.exitCode=1;console.error(e);}finally{writeFileSync(out+'/browser-results.json',JSON.stringify(result,null,2));await browser.close();}
