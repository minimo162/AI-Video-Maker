// Mask areas: painted black in every image handed to Copilot, ignored by change detection, saved and restored with the project.
// The canvas model below keeps real pixels only for the 256x144 scan canvas; larger sheets record their drawing calls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture}=require('./workflow.test.cjs');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),sandbox={module:{exports:{}}};vm.createContext(sandbox);vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],sandbox);const C=sandbox.module.exports;
const plain=v=>JSON.parse(JSON.stringify(v));
let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name)};
const MASK={x:.1,y:.1,w:.2,h:.2};
// Synthetic recording: at 5s something changes inside the masked area, at 8s something changes outside it.
function paint(buffer,time){buffer.fill(235);const box=(x,y,w,h)=>{for(let j=Math.round(y*144);j<Math.round((y+h)*144);j++)for(let i=Math.round(x*256);i<Math.round((x+w)*256);i++)for(let c=0;c<3;c++)buffer[(j*256+i)*4+c]=30};if(time>=5)box(.15,.15,.1,.1);if(time>=8)box(.6,.6,.15,.1)}
function pixelCanvas(f){
 const create=f.doc.createElement,canvases=[];
 f.doc.createElement=tag=>{const e=create(tag);if(tag!=='canvas')return e;const calls=[],record={canvas:e,calls};canvases.push(record);let buffer=null;
  const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,font:'',
   drawImage(v,...a){calls.push({op:'draw',args:a,w:e.width,h:e.height});if(e.width===256&&e.height===144&&a.length===4){buffer??=new Uint8ClampedArray(256*144*4);paint(buffer,v.currentTime??0)}},
   fillRect(x,y,w,h){calls.push({op:'fill',x,y,w,h,style:ctx.fillStyle});if(buffer&&ctx.fillStyle==='#000000')for(let j=Math.max(0,y);j<Math.min(144,y+h);j++)for(let i=Math.max(0,x);i<Math.min(256,x+w);i++)for(let c=0;c<3;c++)buffer[(j*256+i)*4+c]=0},
   getImageData(x,y,w,h){return {data:buffer&&w===256?buffer.slice():new Uint8ClampedArray(w*h*4)}},
   save(){},restore(){},strokeRect(){},fillText(){},beginPath(){},arc(){},stroke(){},measureText:t=>({width:t.length*20})};
  e.getContext=()=>ctx;return e};
 return canvases;
}
const events=f=>JSON.parse(f.E.prompt.value.match(/出来事一覧[^：\n]*：(\[[^\n]*\])/)[1]);
async function addMask(f,m=MASK){f.E.regionX.value=String(m.x*100);f.E.regionY.value=String(m.y*100);f.E.regionW.value=String(m.w*100);f.E.regionH.value=String(m.h*100);f.E.applyRegionNumbers.onclick();f.E.addMask.onclick()}
(async()=>{
await test('隠す範囲を描き先の画素へ外側に丸めて写し、範囲外や重ならない切り出しでは何もしない',()=>{
 const masks=[{id:'m01',x:.1,y:.1,w:.2,h:.2}];
 assert.deepEqual(plain(C.maskRects(masks,1,1,{x:0,y:0,w:1,h:1},{x:0,y:0,w:256,h:144})),[{x:25,y:14,w:52,h:30}]);
 assert.deepEqual(plain(C.maskRects(masks,1920,1080,{x:0,y:0,w:640,h:360},{x:100,y:50,w:640,h:360})),[{x:292,y:158,w:384,h:216}]);
 assert.deepEqual(plain(C.maskRects(masks,1920,1080,{x:300,y:200,w:640,h:360},{x:12,y:12,w:640,h:360})),[{x:12,y:12,w:276,h:124}],'切り出しと重なる部分だけ');
 assert.deepEqual(plain(C.maskRects(masks,1920,1080,{x:1000,y:600,w:640,h:360},{x:12,y:12,w:640,h:360})),[]);
 assert.deepEqual(plain(C.maskRects([],1920,1080,{x:0,y:0,w:1920,h:1080},{x:0,y:0,w:960,h:540})),[]);assert.deepEqual(plain(C.maskRects(undefined,1,1,{x:0,y:0,w:1,h:1},{x:0,y:0,w:10,h:10})),[]);
});
await test('隠す領域は作業JSONに任意で保存復元し、不正な値は拒否、Copilotの回答では変えられない',()=>{
 const base={schemaVersion:1,title:'t',source:{name:'a.mp4',size:1,lastModified:0,duration:12,width:1280,height:720},output:{width:1920,height:1080,fps:30},regions:[],scenes:[{id:'s001',sourceIn:0,sourceOut:6,narration:'',caption:'',captionPosition:'bottom',regionId:'',effect:'none'}],audioMode:'none',credits:'',questions:[],steps:[]};
 const saved={...base,masks:[{id:'m01',...MASK}]},r=C.validate(JSON.parse(JSON.stringify(saved)),saved);assert.equal(r.errors.length,0,r.errors.join());assert.deepEqual(plain(r.project.masks),saved.masks);
 assert.equal(C.validate(base,base).project.masks,undefined,'隠す領域の無い古いJSONも読める');
 for(const masks of [null,{},Array(21).fill({id:'m01',...MASK}),[{id:'m01',x:.9,y:0,w:.2,h:.1}],[{id:'1x',...MASK}],[{id:'m01',...MASK},{id:'m01',...MASK}],[{id:'m01',x:'0',y:0,w:.1,h:.1}]])assert.ok(C.validate({...base,masks},base).errors.length,JSON.stringify(masks).slice(0,40));
 const answer=C.validate({schemaVersion:1,title:'t',scenes:base.scenes,questions:[],masks:[]},saved,true);assert.equal(answer.errors.length,0);assert.deepEqual(plain(answer.project.masks),saved.masks);assert.ok(answer.warnings.some(w=>w.includes('masks')));
});
await test('隠した範囲の中の変化は出来事として数えず、範囲の外の変化は検出する',async()=>{
 const without=fixture();pixelCanvas(without);await without.source();await without.E.storyboard.click();const before=events(without).filter(e=>e[2]==='局所').map(e=>e[0]);
 assert.ok(before.some(t=>t>=5&&t<6),'隠さなければ5秒の変化を検出する '+before);assert.ok(before.some(t=>t>=8&&t<9));
 const f=fixture();pixelCanvas(f);await f.source();await addMask(f);assert.match(f.E.regionFeedback.textContent,/黒く塗りつぶし/);
 await f.E.storyboard.click();const after=events(f).filter(e=>e[2]==='局所').map(e=>e[0]);
 assert.ok(!after.some(t=>t>=4.5&&t<7),'隠した範囲の変化は数えない '+after);assert.ok(after.some(t=>t>=8&&t<9));
 assert.match(f.E.prompt.value,/黒く塗りつぶした四角は、利用者が意図的に隠した部分です（1か所）/);assert.doesNotMatch(without.E.prompt.value,/黒く塗りつぶした四角/);
});
await test('出来事画像・詳細画像・現在位置の画像のすべてで、描いた直後に隠す範囲を黒く塗る',async()=>{
 const f=fixture(),canvases=pixelCanvas(f);await f.source();await addMask(f,{x:.5,y:.5,w:.4,h:.4});await f.E.storyboard.click();
 f.E.proposal.value=JSON.stringify({schemaVersion:1,kind:'detailRequest',title:'入力',ranges:[{sourceIn:2,sourceOut:5,purpose:'セル入力'}]});await f.E.applyProposal.click();assert.match(f.E.downloads.children[0].download,/^detail-01\.png$/);
 f.E.sourceVideo.currentTime=3;await f.E.singleFrame.onclick();
 const masks=[{id:'m01',x:.5,y:.5,w:.4,h:.4}],sheets=canvases.filter(c=>c.calls.some(x=>x.op==='draw'&&x.w>256));
 assert.ok(sheets.length>=4,'出来事画像・カーソル確認・詳細画像・現在位置の画像 '+sheets.length);let checked=0;
 assert.ok(f.state.downloads.some(d=>/^frame-3\.0\.png$/.test(d.download)),'現在位置の画像を保存した');
 for(const {canvas,calls} of sheets)for(const [i,call] of calls.entries()){if(call.op!=='draw')continue;
  const a=call.args,src=a.length===8?{x:a[0],y:a[1],w:a[2],h:a[3]}:{x:0,y:0,w:1,h:1},dst=a.length===8?{x:a[4],y:a[5],w:a[6],h:a[7]}:{x:a[0],y:a[1],w:a[2],h:a[3]};
  const scale=a.length===8?dst.w/src.w:1,want=a.length===8?C.maskRects(masks,1280*scale,720*scale,{x:src.x*scale,y:src.y*scale,w:dst.w,h:dst.h},dst):C.maskRects(masks,1,1,src,dst);
  for(const r of want){assert.ok(calls.slice(i+1).some(x=>x.op==='fill'&&x.style==='#000000'&&x.x===r.x&&x.y===r.y&&x.w===r.w&&x.h===r.h),call.w+'×'+call.h+' '+JSON.stringify(r));checked++}}
 assert.ok(checked>=3,String(checked));
});
await test('隠す領域は保存した作業から復元でき、削除と取り消しもできる',async()=>{
 const f=fixture();await f.source();await f.apply();await addMask(f);f.E.saveProject.onclick();const text=await f.state.blobs.at(-1).text();assert.deepEqual(JSON.parse(text).masks,[{id:'m01',...MASK}]);
 assert.equal(f.E.masks.children.length,1);f.E.masks.children[0].children[1].onclick();assert.equal(f.E.masks.children.length,0);f.E.undo.onclick();assert.equal(f.E.masks.children.length,1);
 const g=fixture();await g.file('projectFile',[{text:async()=>text}]);assert.equal(g.E.masks.children.length,1);assert.match(g.E.prompt.value,/意図的に隠した部分/);
});
console.log(count+' mask tests passed. Real-browser pixels remain unverified.');
})().catch(e=>{console.error(e);process.exitCode=1});
