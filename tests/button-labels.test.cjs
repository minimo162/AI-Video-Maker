const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {fixture,html,tick}=require('./workflow.test.cjs');
const root=path.join(__dirname,'..');
const documents=['README.md','00_START_HERE.txt','00_START_HERE.html','USER_GUIDE.md',...fs.readdirSync(path.join(root,'docs')).filter(name=>/\.(md|html|txt)$/.test(name)).map(name=>'docs/'+name)];
// Limit this check to the video creation action; saved-video download links are separate controls.
function checkGuidance(buttonLabel,sources){
 for(const [name,text] of sources){
  const labels=[...text.matchAll(/「([^」]+)」/g)].map(match=>match[1].replace(/\*\*/g,'')).filter(label=>/^動画を.*(?:作|ダウンロード)/.test(label));
  for(const label of labels)assert.equal(label,buttonLabel,name+' の動画作成案内が実際のボタン名と一致する');
 }
}
const sources=[['index.html',html],...documents.map(name=>[name,fs.readFileSync(path.join(root,name),'utf8')])];
function exportButtonLabel(markup){
 const button=markup.match(/<button\b[^>]*\bid="export"[^>]*>([^<]+)<\/button>/);
 assert.ok(button,'動画作成ボタンがある');
 return button[1].trim();
}
const buttonLabel=exportButtonLabel(html);
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name)}
(async()=>{
 await test('画面・メッセージ・配布文書の動画作成案内は実際のボタン名と一致する',()=>{
  assert.equal(buttonLabel,'動画を作成してダウンロード');
  checkGuidance(buttonLabel,sources);
  for(const name of ['index.html','README.md','00_START_HERE.txt','00_START_HERE.html','USER_GUIDE.md','docs/GETTING_STARTED_JA.md']){
   const text=sources.find(([file])=>file===name)[1].replace(/\*\*/g,'');
   assert.ok(text.includes('「'+buttonLabel+'」'),name+' に動画作成の案内がある');
  }
 });
 await test('ボタンだけの改名や旧名称の案内を照合で検出する',()=>{
  const renamed=html.replace(/(<button\b[^>]*\bid="export"[^>]*>)[^<]+/, '$1動画を書き出す');
  assert.throws(()=>checkGuidance(exportButtonLabel(renamed),sources),assert.AssertionError);
  assert.throws(()=>checkGuidance(buttonLabel,[['案内','「動画を作って保存」を押します。']]),assert.AssertionError);
 });
 await test('完成工程の案内ボタンも実際の動画作成ボタン名と一致する',async()=>{
  const f=fixture();await f.source();await f.apply();await f.audio();f.step(4);await tick();
  assert.equal(f.E.guideAction.textContent,buttonLabel);
 });
 console.log(count+' button label consistency tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
