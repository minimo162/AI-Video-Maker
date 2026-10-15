// Detection benchmark: metric arithmetic, parsing of the app's own prompt, and an end-to-end run on synthetic frames.
// Synthetic frames are not real recordings (no H.264 noise, ClearType text, or display scaling); see docs/BENCHMARK_JA.md.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict');
const {loadBench,main}=require('../tools/benchmark.cjs');
const {fixture}=require('./workflow.test.cjs');
const B=loadBench(),root=path.join(__dirname,'..');
const appHtml=fs.readFileSync(path.join(root,'index.html'),'utf8'),sandbox={module:{exports:{}}};vm.createContext(sandbox);vm.runInContext([...appHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],sandbox);const C=sandbox.module.exports;
const plain=v=>JSON.parse(JSON.stringify(v));
let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name)};
// Synthetic 256x144 frames sampled every 0.5s, compared the same way scanEvents() does for recordings up to 2 minutes.
function synthetic({duration=60,ops,noise=0,seed=1}){
 let s=seed;const rand=()=>(s=Math.imul(s,1103515245)+12345>>>0)/4294967296;
 const base=new Uint8ClampedArray(256*144*4).fill(235),samples=[];let prev=null;
 for(let t=0;t<=duration-.05+1e-9;t+=.5){const frame=base.slice();for(const op of ops)if(t>=op.time&&(op.until===undefined||t<op.until)){for(let y=op.y;y<op.y+op.h;y++)for(let x=op.x;x<op.x+op.w;x++)for(let c=0;c<3;c++)frame[(y*256+x)*4+c]=op.value}
  if(noise)for(let i=0;i<frame.length;i+=4){const n=Math.round((rand()*2-1)*noise);for(let c=0;c<3;c++)frame[i+c]+=n}
  samples.push({time:t,...C.frameChange(prev,frame,256)});prev=frame}
 return C.eventCaptures(samples,duration).map(c=>[Math.round(c.time*10)/10,'events-01.png',c.kind,C.regionPosition(c.region),C.cursorLabel(c.cursor)]);
}
(async()=>{
await test('正解表と出来事一覧から再現率・誤検出率・時刻のずれ・途中の状態の捕捉率を計算する',()=>{
 const truth=B.parseTruth('﻿time,kind,target,intermediate\n# コメント\n10,クリック,A,0\n20,選択,B,1\n30,入力,C,0\n40,OK,D,1\n');
 assert.deepEqual(plain(truth.map(t=>[t.time,t.intermediate])),[[10,false],[20,true],[30,false],[40,true]]);
 const events=[[0,'e1','全画面','全画面',''],[10.5,'e1','局所','上左','上左（左から10%・上から10%）'],[19.8,'e1','局所','中段中央',''],[30,'e1','カーソル','下右','下右（左から90%・上から90%）'],[33,'e1','局所','下右',''],[44,'e2','全画面','全画面',''],[50,'e2','指定','全画面',''],[56,'e2','全画面','全画面',''],[59.9,'e2','全画面','全画面','']];
 const parsed=B.parseEvents('前置き\n元動画長：60秒\n出来事一覧（元動画秒数、ファイル名、種類、画面上の位置、変化直前のマウスカーソル位置）：'+JSON.stringify(events)+'\n後の文');
 assert.equal(parsed.duration,60);assert.equal(parsed.events.length,9);
 const r=B.score(truth,parsed,{tolerance:1,scanSeconds:30});
 assert.equal(r.detections,4,'一定間隔の全画面（0・24・48・56・59.9秒）、指定時刻、カーソル周辺は数えない');
 assert.equal(r.recall,.5);assert.equal(r.missRate,.5);assert.equal(r.precision,.5);assert.equal(r.falseRate,.5);assert.equal(r.intermediate,.5);
 assert.ok(Math.abs(r.offsetMedian-.15)<1e-9);assert.ok(Math.abs(r.offsetMeanAbs-.35)<1e-9);assert.equal(r.offsetMaxAbs,.5);assert.equal(r.scanRatio,.5);
 assert.equal(r.cursorRate,2/3,'一致した出来事3件のうちカーソル位置があるのは2件');
 assert.deepEqual(plain(r.misses.map(m=>m.time)),[30,40]);assert.deepEqual(plain(r.falsePositives.map(e=>e.time)),[33,44]);
 assert.deepEqual(plain(B.anchorTimes(60)),[0,8,16,24,32,40,48,56,59.9]);
 const text=B.report(r,{recording:'合成',environment:'Node',date:'2026-10-15'});for(const s of ['| 再現率 | 50.0% |','| 誤検出率 | 50.0% |','| 途中の状態の捕捉率（2 件） | 50.0% |','| 時刻のずれ（中央値） | +0.15秒 |','| 走査時間 ÷ 録画の長さ | 50% |','取りこぼした操作：30秒 入力 C、40秒 OK D','正解に無い変化：33秒（局所・下右）、44秒（全画面・全画面）'])assert.ok(text.includes(s),s);
});
await test('不正な正解表や出来事一覧は理由を示して拒否する',()=>{
 assert.throws(()=>B.parseTruth(''),/空/);assert.throws(()=>B.parseTruth('kind\nA'),/time の列/);assert.throws(()=>B.parseTruth('time\nabc'),/2行目/);
 assert.throws(()=>B.parseEvents('出来事一覧はありません'),/読み取れません/);assert.throws(()=>B.parseEvents('[1,2]'),/1件目/);
 const empty=B.score([],{duration:null,events:[]});assert.equal(empty.recall,null);assert.equal(empty.precision,null);
});
await test('アプリが作った依頼文をそのまま貼り付けて読み取れる',async()=>{
 const f=fixture();await f.source();await f.E.storyboard.click();const parsed=B.parseEvents(f.E.prompt.value);
 assert.equal(parsed.duration,12);assert.ok(parsed.events.length>0);assert.ok(parsed.events.every(e=>Number.isFinite(e.time)&&/^events-\d\d\.png$/.test(e.file)));
 const r=B.score([],parsed);assert.equal(r.detections,0,'変化のない模擬録画では一定間隔の全画面だけになる');
});
await test('合成録画：小さなセル入力・メニュー・ダイアログ内の選択をすべて検出し、ノイズを誤検出しない',()=>{
 const ops=[{time:5,x:40,y:40,w:24,h:10,value:30},{time:15,until:17,x:160,y:20,w:60,h:50,value:90},{time:25,until:31,x:70,y:40,w:110,h:70,value:250},{time:26.5,until:31,x:80,y:60,w:40,h:8,value:20},{time:28,until:31,x:80,y:76,w:40,h:8,value:20},{time:45,x:0,y:0,w:256,h:144,value:120}];
 const truth=B.parseTruth('time,kind,target,intermediate\n5,入力,セル,0\n15,クリック,メニューを開く,0\n17,選択,メニューを閉じる,0\n25,クリック,ダイアログを開く,0\n26.5,選択,選択肢1,1\n28,選択,選択肢2,1\n31,クリック,OK,0\n45,切替,画面全体,0');
 const events=synthetic({ops,noise:3}),r=B.score(truth,{duration:60,events:events.map(e=>({time:e[0],file:e[1],kind:e[2],position:e[3],cursor:e[4]}))});
 assert.equal(r.recall,1,JSON.stringify(r.misses));assert.equal(r.intermediate,1,'ダイアログ内で選んだ状態が残る');assert.equal(r.falseRate,0,JSON.stringify(r.falsePositives));
 // Intermediate states are captured just before the next change, so they can trail the operation by up to the 1s tolerance.
 assert.ok(r.offsetMaxAbs<=1);assert.equal(r.offsetMedian,0);assert.ok(events.some(e=>e[0]===27.5)&&events.some(e=>e[0]===28),'選択肢1と選択肢2の状態がどちらも残る');
});
await test('合成録画：区画に対して小さすぎる変化は取りこぼしとして数える（感度の限界を記録する）',()=>{
 // 2x2 px on the 256x144 scan grid is about 15x15 px of a 1080p recording; its tile mean stays below the threshold.
 const ops=[{time:5,x:40,y:40,w:2,h:2,value:30},{time:20,x:100,y:60,w:30,h:12,value:30}];
 const truth=B.parseTruth('time,kind,target,intermediate\n5,入力,1文字,0\n20,入力,数式,0'),events=synthetic({ops});
 const r=B.score(truth,{duration:60,events:events.map(e=>({time:e[0],file:e[1],kind:e[2],position:e[3],cursor:e[4]}))});
 assert.equal(r.recall,.5);assert.deepEqual(plain(r.misses.map(m=>m.time)),[5]);
});
await test('採点スクリプトはページと同じ記録を出す',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bench-'));try{
  fs.writeFileSync(path.join(dir,'truth.csv'),'time,kind,target,intermediate\n10,クリック,A,0\n');fs.writeFileSync(path.join(dir,'prompt.txt'),'元動画長：60秒\n出来事一覧（…）：[[10.5,"events-01.png","局所","上左",""]]\n');
  const text=main([path.join(dir,'truth.csv'),path.join(dir,'prompt.txt'),'--scan-seconds','12','--recording','合成','--environment','Node','--date','2026-10-15']);
  assert.match(text,/\| 再現率 \| 100\.0% \|/);assert.match(text,/\| 走査時間 ÷ 録画の長さ \| 20% \|/);assert.match(text,/録画：合成、環境：Node/);assert.throws(()=>main([]),/使い方/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
 const page=fs.readFileSync(path.join(root,'tools/benchmark.html'),'utf8');assert.match(page,/connect-src 'none'/);assert.doesNotMatch(page,/fetch\(|XMLHttpRequest|WebSocket|https?:\/\//);
});
console.log(count+' detection benchmark tests passed. Real recordings remain unmeasured.');
})().catch(e=>{console.error(e);process.exitCode=1});
