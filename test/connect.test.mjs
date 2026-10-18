import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {connectToken, validPasscode, validDocument} from '../dist/planner-assets/document.js';
import worker from '../dist/_worker.js';

const scene = (element = {type:'text',left:30,top:40,width:300,text:'A complete answer',fontSize:10,lineHeight:12}) => ({schema_version:1,layout_version:'one-to-one-v1',pages:[{width:612,height:792,background:'template-2',elements:[element]}]});

test('connect URLs accept generated opaque tokens and no extra path or encoded separators', () => {
  const token = 'Abc123'.repeat(5)+'Z9';
  assert.equal(connectToken(`/connect/${token}`), token);
  assert.equal(connectToken(`/connect/${token}/`), token);
  for (const path of ['/connect/short', `/connect/${token}/other`, '/connect/%2f'+token, `/121-planner/${token}`]) assert.equal(connectToken(path), null);
});

test('passcodes use the same bounded alphabet as the server', () => {
  assert.equal(validPasscode('NewSecure123'), true);
  for (const code of ['', '1234567', 'A'.repeat(65), ' spaces123', 'password🔒', null]) assert.equal(validPasscode(code), false);
});

test('scene validation accepts PDF geometry and treats pasted markup as text', () => {
  assert.equal(validDocument(scene()), true);
  assert.equal(validDocument(scene({type:'text',left:30,top:40,width:300,text:'<img src=x onerror=alert(1)>',fontSize:10,lineHeight:12})), true);
  assert.equal(validDocument(scene({type:'rect',left:30,top:40,width:100,height:.5,color:'#333333'})), true);
  assert.equal(validDocument(scene({type:'image',left:30,top:40,width:100,height:40,src:'data:image/png;base64,YWJjZA==',fit:'contain'})), true);
});

test('scene validation rejects scriptable sources, arbitrary CSS/HTML and nonfinite geometry', () => {
  for (const src of ['https://attacker.invalid/private', 'javascript:alert(1)', 'data:image/svg+xml;base64,YWJjZA==']) assert.equal(validDocument(scene({type:'image',left:1,top:2,width:30,height:40,src})), false);
  assert.equal(validDocument({...scene(), html:'<script>bad()</script>'}), false);
  assert.equal(validDocument(scene({type:'text',left:NaN,top:40,width:300,text:'value',fontSize:10})), false);
  assert.equal(validDocument(scene({type:'text',left:30,top:40,width:300,text:'value',fontSize:10,style:'position:fixed'})), false);
  assert.equal(validDocument(scene({type:'rect',left:0,top:0,width:10,height:10,color:'url(https://attacker.invalid)'})), false);
  const unsafe = scene(); unsafe.pages[0].background = '../../private'; assert.equal(validDocument(unsafe), false);
  assert.equal(validDocument({...scene(),pages:Array(101).fill(scene().pages[0])}), false);
});

test('Cloudflare serves the protected route separately and prevents cache/indexing', async () => {
  let received;
  const result=await worker.fetch(new Request('https://chaptercompanion.app/connect/'+'A'.repeat(32)),{ASSETS:{fetch:async(request)=>{received=new URL(request.url).pathname;return new Response('page',{headers:{'Content-Type':'text/html'}});}}});
  assert.equal(received,'/planner-connect');
  assert.equal(result.status,200);
  assert.equal(result.headers.get('Cache-Control'),'no-store, max-age=0');
  assert.match(result.headers.get('X-Robots-Tag'),/noindex, nofollow, noarchive/);
  const rejected=await worker.fetch(new Request('https://chaptercompanion.app/connect/'+'A'.repeat(32),{method:'POST'}),{});
  assert.equal(rejected.status,405);
  const html=await readFile(new URL('../dist/planner-connect.html',import.meta.url),'utf8');
  assert.match(html,/src="\/planner-assets\/connect.js"/);
  assert.doesNotMatch(html,/<iframe|<embed|<object|download=/i);
  assert.doesNotMatch(html,/id="lock"|>Lock planner</);
});

test('worksheet backgrounds and font retain the hashes synchronized from Flutter PDF assets', async () => {
  const manifest=JSON.parse(await readFile(new URL('../config/planner-template-assets.json',import.meta.url),'utf8'));
  const hash=(bytes)=>createHash('sha256').update(bytes).digest('hex');
  for(const [name,expected] of Object.entries(manifest)) {
    const actual=await readFile(new URL(`../dist/planner-assets/${name}`,import.meta.url));
    assert.equal(hash(actual),expected,`${name} drifted`);
  }
});
