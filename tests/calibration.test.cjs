// Calibration sheet: geometry matches production sheets, keys are reproducible, and scoring tolerates common answer formats.
// Real Copilot readability is not measured here; see docs/CALIBRATION_JA.md.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict');
const {loadCalib,main}=require('../tools/calibration-score.cjs');
const K=loadCalib(),root=path.join(__dirname,'..');
const appHtml=fs.readFileSync(path.join(root,'index.html'),'utf8'),sandbox={module:{exports:{}}};vm.createContext(sandbox);vm.runInContext([...appHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],sandbox);const C=sandbox.module.exports;
const page=fs.readFileSync(path.join(root,'tools/calibration.html'),'utf8');
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name)}
const perfect=key=>[...key.items.map(it=>it.id+': '+it.text),...key.labels.map(l=>'T'+l.serial+': '+l.time.toFixed(1))].join('\n');
test('較正シートの大きさは1920×1080の録画で作る出来事画像と同じ',()=>{
 const full=Array.from({length:6},(_,i)=>({time:i,region:null,priority:1,kind:'全画面'}));
 for(const [preset,n] of [['full',6],['two',2]]){const sheets=C.packSheets(full.slice(0,n),1920,1080,20);assert.equal(sheets.length,1);assert.deepEqual(JSON.parse(JSON.stringify(K.sheetSize(preset))),{width:sheets[0].width,height:sheets[0].height},preset)}
 assert.deepEqual(JSON.parse(JSON.stringify(K.sheetSize('full'))),{width:3888,height:3438});
 assert.deepEqual(JSON.parse(JSON.stringify(K.sheetSize('one'))),{width:1944,height:1146},'比較用は1枚分の幅');assert.equal(C.packSheets(full.slice(0,1),1920,1080,20)[0].width,3888,'本番は1枚でも2列分の幅');
 assert.throws(()=>K.sheetSize('huge'));
});
test('同じ乱数の種なら同じ文字列、違う種なら違う文字列になり、大きさと種類が均等に入る',()=>{
 const a=K.makeKey('abc','full'),b=K.makeKey('abc','full'),c=K.makeKey('abd','full');
 assert.deepEqual(a,b);assert.notDeepEqual(a.items.map(i=>i.text),c.items.map(i=>i.text));
 assert.equal(a.items.length,144);assert.equal(a.labels.length,6);assert.equal(K.makeKey('abc','one').items.length,24);
 assert.equal(new Set(a.items.map(i=>i.id)).size,a.items.length);
 for(const size of K.SIZES)for(const script of ['latin','ja'])assert.equal(a.items.filter(i=>i.size===size&&i.script===script).length,12,size+script);
 assert.ok(a.items.filter(i=>i.script==='latin').every(i=>/^[ACDEFHJKLMNPRTUVWXY3479]{8}$/.test(i.text)),'紛らわしい文字を使わない');
 assert.ok(a.items.filter(i=>i.script==='ja').every(i=>[...i.text].length===6&&!/[A-Z0-9]/.test(i.text)));
});
test('描画は各文字列を指定の大きさで枠の中に描き、時刻ラベルは本番と同じ24px',()=>{
 for(const preset of Object.keys(K.PRESETS)){
  const key=K.makeKey('draw',preset),calls=[];let font='';
  const ctx={set font(v){font=v},get font(){return font},fillStyle:'',strokeStyle:'',lineWidth:1,fillRect(){},strokeRect(){},fillText:(text,x,y)=>calls.push({text,x,y,font})};
  K.draw(ctx,key);
  for(const it of key.items){const call=calls.find(c=>c.text===it.text&&c.x===it.x&&c.y===it.y);assert.ok(call,it.id);assert.equal(call.font,it.size+'px sans-serif');assert.ok(calls.some(c=>c.text===it.id&&c.font==='bold 28px sans-serif'))}
  for(const c of calls){assert.ok(c.x>=0&&c.y>0&&c.x<key.width-100&&c.y<key.height,JSON.stringify(c))}
  for(const l of key.labels)assert.ok(calls.some(c=>c.text==='元動画 '+l.time.toFixed(1)+'秒 ・ 全画面'&&c.font==='24px sans-serif'));
  for(const it of key.items){const cell=key.labels.find(l=>Math.abs(l.x-(it.x-92))<1000&&it.y<l.y-30&&it.y>l.y-30-K.FRAME_H);assert.ok(cell,'文字列が録画の枠の中にある '+it.id)}
 }
});
test('完全な回答は100%、表やリストの書式・全角・読めない行・誤字を区別して採点する',()=>{
 const key=K.makeKey('score','one'),full=K.score(key,perfect(key));
 assert.equal(full.answered,24);assert.ok(full.rows.every(r=>r.exactRate===1&&r.charRate===1&&r.unread===0));assert.ok(full.labels.every(l=>l.ok));
 const [a,b,c,d,e]=key.items,decorated=['回答です。','| ID | 文字列 |','|---|---|','| '+a.id+' | '+a.text+' |','- **'+b.id+'**：'+b.text.normalize('NFKC').replace(/[A-Z0-9]/g,ch=>String.fromCharCode(ch.charCodeAt(0)+0xFEE0)),c.id+': ?',d.id+': '+[...d.text].slice(1).join(''),'T1：'+key.labels[0].time.toFixed(1)+'秒'].join('\n');
 const r=K.score(key,decorated),group=it=>r.rows.find(x=>x.size===it.size&&x.script===it.script);
 assert.equal(r.answered,4);assert.equal(r.rows.reduce((n,x)=>n+x.exact,0),2,'表の行と全角の回答は完全一致');assert.equal(r.rows.reduce((n,x)=>n+x.unread,0),21,'?と未回答は読めない扱い（誤字の1件は読めた扱い）');
 assert.ok(K.parseAnswer(decorated).items.get(a.id).includes(a.text));assert.equal(K.normalize(K.parseAnswer(decorated).items.get(b.id)),b.text);
 assert.equal(group(c).unread>=1,true);assert.equal(K.distance(a.text,a.text),0);assert.equal(K.distance('ABCD','ABD'),1);
 const one=K.score({...key,items:[d]},d.id+': '+[...d.text].slice(1).join(''));assert.equal(one.rows[0].exact,0);assert.ok(Math.abs(one.rows[0].charRate-(1-1/[...d.text].length))<1e-9);
 assert.equal(K.score({...key,items:[e]},'').rows[0].unread,1);
 assert.equal(r.labels[0].ok,true);assert.equal(r.labels.slice(1).every(l=>!l.ok&&l.got===null),true);
});
test('記録用の文章は大きさごとの表と時刻ラベルの結果を含み、採点スクリプトでも同じ結果になる',()=>{
 const key=K.makeKey('cli','two'),text=K.report(key,K.score(key,perfect(key)),{copilot:'試験',date:'2026-10-15'});
 for(const size of K.SIZES)assert.match(text,new RegExp('\\| '+size+'px \\| 100% \\| 100% \\| 100% \\| 100% \\|'));
 assert.match(text,/時刻ラベル（24px）：2 \/ 2 件正解/);assert.match(text,/乱数の種 `cli`/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'calib-'));try{const file=path.join(dir,'answer.txt');fs.writeFileSync(file,perfect(key));assert.equal(main(['--seed','cli','--preset','two','--copilot','試験','--date','2026-10-15',file]),text);assert.throws(()=>main([file]),/使い方/)}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('較正ページは通信せず、依頼文は番号付きの書き写しと推測の禁止を求める',()=>{
 assert.match(page,/connect-src 'none'/);assert.doesNotMatch(page.replace(/<meta http-equiv[^>]*>/,''),/https?:\/\//);assert.doesNotMatch(page,/fetch\(|XMLHttpRequest|WebSocket/);
 assert.match(K.PROMPT,/A01: 文字列/);assert.match(K.PROMPT,/推測で補わず/);assert.match(K.PROMPT,/T1: 123\.4/);
});
console.log(count+' calibration tests passed. Real Copilot readability remains unmeasured.');
