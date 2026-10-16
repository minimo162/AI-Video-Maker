// Deterministic DOM/media model for the Copilot-owned production route.
// This checks handoff state and provenance; real browser rendering, PDF JPEG
// decoding, file dialogs and Copilot's ability to read attachments need manual QA.
const assert=require('node:assert/strict');
const {fixture,tick}=require('./workflow.test.cjs');

async function ready({notes='保存前に合計を確認する',purpose='申請を登録する',extras='2.5,7.5'}={}){
 const f=fixture();await f.source();f.E.startDirect.click();
 f.E.purpose.value=purpose;f.E.purpose.onchange();
 f.E.directNotes.value=notes;f.E.directNotes.oninput();
 f.E.extraTimes.value=extras;await f.E.storyboard.click();return f;
}
async function manifest(f){await f.E.saveDirectManifest.click();return JSON.parse(await f.state.blobs.at(-1).text());}

// The minimal marker sequence is deliberately not a visual test fixture. It
// satisfies the PDF writer's JPEG dimension validation for this state test.
function modelJpeg(width,height){return new Uint8Array([255,216,255,192,0,17,8,height>>8,height&255,width>>8,width&255,3,1,17,0,2,17,0,3,17,0,255,218,0,2,255,217]);}
function exportsModel(f,{rejectBitmap=false,bitmapGate=null,invalidJpeg=false}={}){
 const calls={blobs:[],draws:[],texts:[],closed:0},create=f.doc.createElement;
 f.window.createImageBitmap=async blob=>{calls.blobs.push(blob);if(bitmapGate)await bitmapGate;if(rejectBitmap)throw Error('画像の復元に失敗しました');return {width:1280,height:720,prepared:true,close(){calls.closed++}}};
 f.doc.createElement=tag=>{const e=create(tag);if(tag!=='canvas')return e;const get=e.getContext.bind(e);
  e.getContext=kind=>{const ctx=get(kind),draw=ctx.drawImage,text=ctx.fillText;ctx.drawImage=(...args)=>{calls.draws.push(args);return draw(...args)};ctx.fillText=(...args)=>{calls.texts.push(args[0]);return text(...args)};return ctx};
  e.toBlob=fn=>queueMicrotask(()=>fn(new Blob([invalidJpeg?'invalid JPEG':modelJpeg(e.width,e.height)],{type:'image/jpeg'})));
  e.toDataURL=()=> 'data:image/png;base64,aGVsbG8=';return e;
 };
 return calls;
}

(async()=>{
 let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name)};
 await test('Copilot完成ルートは録画と目的から始め、場面とWAVを要求しない',async()=>{
  const f=fixture();assert.equal(f.E.startDirect.disabled,true);f.E.startDirect.click();assert.equal(f.visible(f.E.directPanel),false);
  await f.source();f.E.startDirect.click();assert.deepEqual(f.active(),[1]);assert.equal(f.visible(f.E.directPanel),true);assert.equal(f.E.workflowNav.hidden,true);
  assert.equal(f.E.sceneCards.children.length,0);assert.equal(f.state.audioCreations,0);assert.equal(f.E.saveDirectPdf.disabled,true);assert.equal(f.E.copyDirectPrompt.disabled,true);
  f.E.purpose.value='申請の登録';f.E.purpose.onchange();await f.E.storyboard.click();assert.equal(f.E.saveDirectPdf.disabled,false);assert.equal(f.E.copyDirectPrompt.disabled,false);
  assert.equal(f.E.sceneCards.children.length,0);assert.equal(f.state.audioCreations,0);assert.doesNotMatch(f.E.directSummary.textContent,/WAV/);
 });
 await test('素材JSONと依頼文で画像ID・元録画時刻・目的・補足が一致する',async()=>{
  const f=await ready(),m=await manifest(f);assert.equal(m.kind,'copilot-video-materials');assert.equal(m.purpose,'申請を登録する');assert.equal(m.notes,'保存前に合計を確認する');
  assert.deepEqual(m.source,{name:'synthetic.mp4',duration:12,width:1280,height:720});assert.ok(m.evidence.length>=3);
  assert.deepEqual(m.evidence.map(e=>e.id),m.evidence.map((_,i)=>'E'+String(i+1).padStart(3,'0')));
  for(const time of [2.5,7.5])assert.ok(m.evidence.some(e=>e.time===time),'requested source time '+time);
  await f.E.copyDirectPrompt.click();const text=f.state.clipboardText;assert.match(text,/目的：申請を登録する/);assert.match(text,/保存前に合計を確認する/);assert.match(text,/MP4/);
  for(const e of m.evidence){assert.ok(text.includes(e.id+' | '+e.file));assert.ok(text.includes('（'+e.time+'秒）'));assert.ok(e.time>=0&&e.time<=12)}
  assert.match(text,/クリックやその対象を示す記録ではありません/);assert.match(text,/静止画による説明動画/);assert.match(text,/JSONの提出は不要/);
  assert.equal(m.scenes,undefined);assert.equal(m.blob,undefined);assert.doesNotMatch(JSON.stringify(m),/blob:|data:image|arrayBuffer|C:\\/);
 });
 await test('PDFは準備済み画像から生成し、表紙に目的と補足を含む',async()=>{
  const f=await ready(),m=await manifest(f),calls=exportsModel(f),before=f.state.downloads.length;await f.E.saveDirectPdf.click();
  assert.equal(f.state.downloads.length,before+1);assert.equal(f.state.downloads.at(-1).download,'copilot-materials.pdf');assert.equal(f.state.blobs.at(-1).type,'application/pdf');
  const text=await f.state.blobs.at(-1).text();assert.ok(text.startsWith('%PDF-1.4'));assert.ok(text.includes('/Count '+(m.evidence.length+1)));
  assert.ok(calls.texts.includes('目的：申請を登録する'));assert.ok(calls.texts.includes('保存前に合計を確認する'));
  assert.equal(calls.draws.length,m.evidence.length);assert.ok(calls.draws.every(args=>args[0].prepared));assert.ok(calls.closed>0);
  assert.match(f.E.directFeedback.textContent,/ダウンロードを開始/);assert.doesNotMatch(f.E.directFeedback.textContent,/保存しました/);assert.match(f.E.guideAction.textContent,/依頼文/);
 });
 await test('HTMLは各画像を埋め込み、PDF保存済みとして扱わない',async()=>{
  const f=await ready({notes:'<script>誤解しない</script>'}),m=await manifest(f),calls=exportsModel(f);await f.E.saveDirectHtml.click();
  assert.equal(f.state.downloads.at(-1).download,'copilot-materials-review.html');const text=await f.state.blobs.at(-1).text();
  assert.equal((text.match(/<img /g)||[]).length,m.evidence.length);assert.ok(text.includes('data:image/png;base64,aGVsbG8='));assert.ok(text.includes('&lt;script&gt;誤解しない&lt;/script&gt;'));
  assert.doesNotMatch(text,/<script>|blob:synthetic/);assert.ok(calls.draws.every(args=>args[0].prepared));assert.match(f.E.directFeedback.textContent,/未検証/);assert.match(f.E.guideAction.textContent,/PDF/);
 });
 await test('目的と補足を変えるとPDFの保存し直しと依頼文の更新を案内する',async()=>{
  const f=await ready();exportsModel(f);await f.E.saveDirectPdf.click();await f.E.copyDirectPrompt.click();
  f.E.purpose.value='承認まで説明する';f.E.purpose.onchange();assert.match(f.E.directSummary.textContent,/保存し直/);assert.match(f.E.guideAction.textContent,/PDF/);assert.match(f.E.directPrompt.value,/目的：承認まで説明する/);
  await f.E.saveDirectPdf.click();await f.E.copyDirectPrompt.click();f.E.directNotes.value='承認権限は別途必要';f.E.directNotes.oninput();
  assert.match(f.E.directSummary.textContent,/保存し直/);assert.match(f.E.guideAction.textContent,/PDF/);assert.match(f.E.directPrompt.value,/承認権限は別途必要/);
 });
 await test('画像の再生成後は以前のPDFと依頼文の完了状態を持ち越さない',async()=>{
  const f=await ready();exportsModel(f);await f.E.saveDirectPdf.click();await f.E.copyDirectPrompt.click();
  f.E.extraTimes.value='1.5';await f.E.storyboard.click();assert.match(f.E.guideAction.textContent,/PDF/);const m=await manifest(f);assert.ok(m.evidence.some(e=>e.time===1.5));assert.ok(!m.evidence.some(e=>e.time===7.5));
 });
 await test('アプリ編集へ切り替えても既存の場面・本文・音声を保持する',async()=>{
  const f=fixture();await f.source();await f.apply();await f.audio();assert.equal(f.E.switchToDirect.hidden,false);f.E.switchToDirect.click();assert.equal(f.visible(f.E.directPanel),true);f.E.useAppEditor.click();
  assert.equal(f.visible(f.E.directPanel),false);assert.equal(f.E.workflowNav.hidden,false);assert.deepEqual(f.active(),[2]);assert.equal(f.E.sceneCards.children.length,2);
  assert.equal(f.E.sceneCards.children[0].querySelector('[data-field="narration"]').value,'説明1');assert.match(f.E.audioProgress.textContent,/2 \/ 2/);
 });
 await test('隠す領域の変更時は旧素材の保存と依頼文を止め、取消後に元へ戻る',async()=>{
  const f=await ready();exportsModel(f);await f.E.saveDirectPdf.click();f.E.applyRegionNumbers.click();f.E.addMask.click();assert.equal(f.E.masks.children.length,1);
  assert.match(f.E.directSummary.textContent,/作り直/);assert.equal(f.E.directPrompt.value,'');for(const id of ['saveDirectPdf','saveDirectHtml','saveDirectManifest','copyDirectPrompt'])assert.equal(f.E[id].disabled,true,id);
  const before=f.state.downloads.length;await f.E.saveDirectPdf.click();await f.E.saveDirectHtml.click();await f.E.saveDirectManifest.click();assert.equal(f.state.downloads.length,before);
  f.E.undo.click();assert.equal(f.E.masks.children.length,0);assert.equal(f.E.saveDirectPdf.disabled,false);assert.match(f.E.guideAction.textContent,/依頼文/);
 });
 await test('PDFとHTMLは黒く塗りつぶした準備済みシートだけを参照する',async()=>{
  const f=fixture(),create=f.doc.createElement,maskedBlobs=new Set();f.doc.createElement=tag=>{const e=create(tag);if(tag!=='canvas')return e;const context=e.getContext.bind(e),blob=e.toBlob.bind(e);let black=false;
   e.getContext=kind=>{const ctx=context(kind),fill=ctx.fillRect;ctx.fillRect=(...args)=>{if(ctx.fillStyle==='#000000')black=true;return fill(...args)};return ctx};
   e.toBlob=callback=>blob(value=>{if(e.width>256&&e.height>144){assert.equal(black,true,'exported sheet was painted black before serialization');maskedBlobs.add(value)}callback(value)});return e;
  };
  await f.source();f.E.startDirect.click();f.E.purpose.value='申請を登録する';f.E.purpose.onchange();f.E.applyRegionNumbers.click();f.E.addMask.click();await f.E.storyboard.click();assert.ok(maskedBlobs.size>0);assert.equal(f.E.directMaskNotice.hidden,false);
  const calls=exportsModel(f);await f.E.saveDirectPdf.click();await f.E.saveDirectHtml.click();assert.ok(calls.blobs.length>=2);assert.ok(calls.blobs.every(blob=>maskedBlobs.has(blob)),'handoff decodes only previously masked page blobs');assert.ok(calls.draws.every(args=>args[0].prepared),'handoff never paints the original source video');
  const text=JSON.stringify(await manifest(f));assert.doesNotMatch(text,/blob:|data:image|masks|sourceURL|arrayBuffer/);
 });
 await test('元録画の差替えで旧画像と補足を解除する',async()=>{
  const f=await ready();await f.file('sourceFile',[{name:'replacement.mp4',size:300,lastModified:5}]);
  assert.equal(f.E.directNotes.value,'');assert.equal(f.E.downloads.children.length,0);assert.equal(f.E.saveDirectPdf.disabled,true);assert.equal(f.E.copyDirectPrompt.disabled,true);assert.equal(f.E.directPrompt.value,'');
 });
 await test('新規作業でCopilot完成ルート・素材・補足を初期化する',async()=>{
  const f=await ready();f.E.newProject.click();assert.equal(f.visible(f.E.directPanel),false);assert.equal(f.E.workflowNav.hidden,false);assert.equal(f.E.directNotes.value,'');assert.equal(f.E.downloads.children.length,0);assert.equal(f.E.directPrompt.value,'');
  await f.source();assert.equal(f.visible(f.E.directPanel),false);assert.equal(f.E.startDirect.disabled,false);
 });
 await test('PDF画像復元の失敗を成功扱いせず元画像を保持する',async()=>{
  const f=await ready();exportsModel(f,{rejectBitmap:true});const before=f.state.downloads.length,pages=f.E.downloads.children.length;await f.E.saveDirectPdf.click();
  assert.equal(f.state.downloads.length,before);assert.equal(f.E.downloads.children.length,pages);assert.match(f.E.directFeedback.textContent,/画像の復元に失敗/);assert.doesNotMatch(f.E.directFeedback.textContent,/保存しました|ダウンロードを開始/);assert.match(f.E.guideAction.textContent,/PDF/);assert.equal(f.E.saveDirectPdf.disabled,false);
 });
 await test('不正なJPEGでPDF保存を止め、完了状態を付けない',async()=>{
  const f=await ready();exportsModel(f,{invalidJpeg:true});const before=f.state.downloads.length;await f.E.saveDirectPdf.click();assert.equal(f.state.downloads.length,before);assert.match(f.E.directFeedback.textContent,/JPEG/);assert.match(f.E.guideAction.textContent,/PDF/);
 });
 await test('PDF作成の取消後に遅い画像復元が終わってもダウンロードしない',async()=>{
  const f=await ready();let resolve;const gate=new Promise(r=>resolve=r);exportsModel(f,{bitmapGate:gate});const before=f.state.downloads.length,pending=f.E.saveDirectPdf.click();
  await tick();assert.equal(f.E.cancel.disabled,false);assert.equal(f.E.saveDirectPdf.disabled,true);f.E.cancel.click();resolve();await pending;
  assert.equal(f.state.downloads.length,before);assert.match(f.E.directFeedback.textContent,/取り消しました/);assert.match(f.E.guideAction.textContent,/PDF/);assert.equal(f.E.saveDirectPdf.disabled,false);
 });
 await test('依頼文コピー失敗とコピー待ち中の編集を完了扱いしない',async()=>{
  const f=await ready();exportsModel(f);await f.E.saveDirectPdf.click();f.state.clipboardFails=true;await f.E.copyDirectPrompt.click();
  assert.equal(f.E.directPromptDetails.open,true);assert.match(f.E.directFeedback.textContent,/手動でコピー/);assert.match(f.E.guideAction.textContent,/依頼文/);
  f.state.clipboardFails=false;let resolve;f.state.clipboardGate=new Promise(r=>resolve=r);const pending=f.E.copyDirectPrompt.click();await tick();f.E.directNotes.value='コピー中に変更';f.E.directNotes.oninput();resolve();await pending;
  assert.match(f.E.guideAction.textContent,/PDF/);assert.doesNotMatch(f.E.directFeedback.textContent,/依頼文をコピーしました/);assert.match(f.E.directPrompt.value,/コピー中に変更/);
 });
 console.log(count+' handoff workflow tests passed. Real browser and Copilot attachment reading remain unverified.');
})().catch(error=>{console.error(error);process.exitCode=1});
