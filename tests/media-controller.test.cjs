// Deterministic API simulation for cancellation/cleanup races. No browser codecs are qualified.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const tick=()=>new Promise(r=>setImmediate(r));
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5))}assert.fail('condition did not settle')}
function fixture(){
 const state={scheduled:[],silentClocks:[],recorders:[],tracks:[],frames:[],drawn:[],videos:[],clock:0,resumeGate:null,missingStop:false,fastRecorderTimeout:false,contexts:[],windowListeners:{},streamError:false,rejectSource:false,probeFail:false,probeDecodeFail:false,startFail:false,securityFail:false,probeDelay:null,demoClock:0,downloads:[],fills:[]};
 class E {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.value='';this.files=[];this.listeners={};this.width=1920;this.height=1080;this.readyState=4;this.duration=12;this.videoWidth=1280;this.videoHeight=720;this.paused=true;this._time=0;if(tag==='video')state.videos.push(this)}
  append(...es){this.children.push(...es)}replaceChildren(...es){this.children=[...es]}setAttribute(k,v){this[k]=v}removeAttribute(k){delete this[k]}focus(){}select(){}click(){if(this.tagName==='a')state.downloads.push(this);return this.onclick?.()}load(){queueMicrotask(()=>{this.emit('loadedmetadata');this.emit('loadeddata')})}pause(){this.paused=true}play(){this.paused=false;if(this._src?.startsWith('blob:probe'))this._time=.1;return Promise.resolve()}
  addEventListener(k,f){(this.listeners[k]??=[]).push(f)}removeEventListener(k,f){this.listeners[k]=(this.listeners[k]??[]).filter(v=>v!==f)}emit(k){for(const f of [...(this.listeners[k]??[])])f();this['on'+k]?.()}
  set src(s){this._src=s;queueMicrotask(()=>{if(state.rejectSource||(state.probeDecodeFail&&s.startsWith('blob:probe')&&s.includes('mp4'))){this.emit('error');return}this.emit('loadedmetadata');this.emit('loadeddata')})}get src(){return this._src}set currentTime(v){this._time=v;queueMicrotask(()=>this.emit('seeked'))}get currentTime(){return this._time}
  getContext(){return {getImageData:()=>({data:new Uint8ClampedArray(256*144*4)}),measureText:s=>({width:s.length*20}),drawImage(v){if(v.src)state.drawn.push(v.currentTime)},fillRect(...args){state.fills.push({args,fill:this.fillStyle})},strokeRect(){},fillText(){},save(){},restore(){}}}
  captureStream(){if(state.streamError)throw Error('captureStream failed');const t={kind:'video',probe:this!==els.preview,stopped:false,stop(){this.stopped=true}};state.tracks.push(t);return new Stream([t])}
 }
 class Stream {constructor(tracks){this.tracks=tracks}getTracks(){return this.tracks}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video')}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio')}}
 class AC {constructor(){this.state='running';this.sampleRate=8000;this.destination={};state.contexts.push(this)}get currentTime(){return state.clock}resume(){return state.resumeGate??Promise.resolve()}decodeAudioData(){return Promise.resolve({duration:2})}close(){this.state='closed';return Promise.resolve()}createBuffer(channels,length,rate){const data=new Float32Array(length);return {duration:length/rate,sampleRate:rate,getChannelData:()=>data}}createOscillator(){return {frequency:{value:0},connect(){},start(){},stop(){},disconnect(){}}}createBufferSource(){const n={connect(){},start(...args){this.startArgs=args;state.scheduled.push(this)},stop(){this.stopped=true}};return n}createMediaStreamDestination(){const t={kind:'audio',stopped:false,stop(){this.stopped=true}};state.tracks.push(t);return {stream:new Stream([t]),disconnect(){}}}}
 AC.prototype.createConstantSource=function(){const n={offset:{value:1},connect(dest){this.destination=dest},start(){this.started=true},stop(){this.stopped=true},disconnect(){this.disconnected=true}};state.silentClocks.push(n);return n};
 class Recorder {constructor(stream,options){this.state='inactive';this.stream=stream;this.mimeType=options.mimeType;this.probe=stream.getTracks().some(t=>t.probe);state.recorders.push(this)}static isTypeSupported(){return true}start(timeslice){if(timeslice)this.probe=false;if((this.probe&&state.probeFail&&(state.probeFail==='all'||this.mimeType.includes('mp4')))||(!this.probe&&state.startFail&&this.mimeType.includes('mp4'))){const e=Error('synthetic start failure');if(state.securityFail)e.name='SecurityError';throw e}this.state='recording';this.started=true}stop(){this.state='inactive';if(this.mimeType.includes('mp4')&&(state.missingStop==='all'||state.missingStop===(this.probe?'probe':'actual')))return;queueMicrotask(()=>{if(this.probe)this.ondataavailable?.({data:new Blob(['probe'])});this.onstop?.()})}}
 const els={};for(const m of html.matchAll(/id="([^"]+)"/g))els[m[1]]=new E();
 els.quality.value='1080';els.format.value='auto';els.timeline.value='0';
 const listeners={};const doc={getElementById:id=>els[id],createElement:tag=>new E(tag),querySelectorAll:()=>[],fonts:{ready:Promise.resolve()},addEventListener:(k,f)=>listeners[k]=f,hidden:false};
 const sandbox={document:doc,window:{AudioContext:AC,MediaRecorder:Recorder,addEventListener:(k,f)=>state.windowListeners[k]=f},navigator:{},confirm:()=>true,URL:{createObjectURL:blob=>blob instanceof Blob&&blob.size===5?'blob:probe:'+blob.type:'blob:synthetic',revokeObjectURL(){}},Blob,File:require('node:buffer').File,performance:{now:()=>state.demoClock},TextDecoder,MediaStream:Stream,MediaRecorder:Recorder,HTMLCanvasElement:E,console,queueMicrotask,setTimeout:(fn,ms)=>ms===5000&&state.fastRecorderTimeout?setTimeout(fn,5):ms===60000?0:ms===80&&state.probeDelay?(state.probeDelay(fn),0):ms===80||ms===100?(queueMicrotask(fn),0):setTimeout(fn,ms),clearTimeout,requestAnimationFrame:f=>{state.frames.push(f);return state.frames.length},cancelAnimationFrame(){},module:{exports:{}}};
 vm.createContext(sandbox);scripts.forEach(s=>vm.runInContext(s,sandbox));
 async function file(id,files){els[id].files=files;await els[id].onchange()}
 async function ready(){await file('sourceFile',[{name:'synthetic.mp4',size:100,lastModified:0}]);els.proposal.value=JSON.stringify({schemaVersion:1,title:'試験',scenes:[{id:'s001',sourceIn:0,sourceOut:6,narration:'説明1',caption:'要点1',captionPosition:'bottom',regionId:'',effect:'none'},{id:'s002',sourceIn:6,sourceOut:12,narration:'説明2',caption:'要点2',captionPosition:'bottom',regionId:'',effect:'none'}],questions:[]});await els.applyProposal.onclick();const bytes=new Uint8Array(44);bytes.set(Buffer.from('RIFF'));bytes.set(Buffer.from('WAVE'),8);await file('audioFiles',['s001','s002'].map(id=>({name:id+'.wav',arrayBuffer:async()=>bytes.buffer})));els.credits.value='合成音';els.credits.onchange()}
 return {state,els,ready,tick,doc,listeners,file,Recorder,sandbox};
}
(async()=>{
 let count=0;
 const run=async(name,fn)=>{await fn();count++;console.log('PASS '+name)};
 await run('40分3GBの録画を音声初期化なしに読み込む',async()=>{const f=fixture();Object.defineProperty(Object.getPrototypeOf(f.els.sourceVideo),'duration',{get(){return 2400},set(){}});await f.file('sourceFile',[{name:'long.mp4',size:3000000000,lastModified:0}]);assert.match(f.els.sourceInfo.textContent,/2400.0秒/);assert.equal(f.state.contexts.length,0)});
 await run('遅いメタデータを60秒待ち取消で直ちに解放する',async()=>{const f=fixture(),timers=new Map();let next=0;f.sandbox.setTimeout=(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id};f.sandbox.clearTimeout=id=>timers.delete(id);const make=f.doc.createElement;let probe;f.doc.createElement=tag=>{const e=make(tag);if(tag==='video'){probe=e;Object.defineProperty(e,'src',{configurable:true,set(v){this._src=v},get(){return this._src}})}return e};const pending=f.file('sourceFile',[{name:'slow.mp4',size:1,lastModified:0}]);await tick();assert.deepEqual([...timers.values()].map(t=>t.ms),[60000]);f.els.cancel.onclick();await pending;assert.equal(timers.size,0);assert.equal((probe.listeners.loadedmetadata||[]).length,0);assert.equal(f.els.editable.disabled,false);assert.doesNotMatch(f.els.sourceInfo.textContent,/slow.mp4/);probe.emit('loadedmetadata');assert.doesNotMatch(f.els.sourceInfo.textContent,/slow.mp4/)});
 await run('タイムアウトの詳細を残し再試行成功後もコピーできる',async()=>{const f=fixture();await f.ready();const old=f.els.sourceInfo.textContent,make=f.doc.createElement;let timeout;f.sandbox.setTimeout=(fn,ms)=>{assert.equal(ms,60000);timeout=fn;return 1};f.sandbox.clearTimeout=()=>{};f.doc.createElement=tag=>{const e=make(tag);if(tag==='video')Object.defineProperty(e,'src',{configurable:true,set(v){this._src=v},get(){return this._src}});return e};const pending=f.file('sourceFile',[{name:'large.mp4',size:3000000000,lastModified:0,type:'video/mp4'}]);await tick();timeout();await pending;assert.equal(f.els.sourceInfo.textContent,old);assert.equal(f.els.sourceDiagnostics.hidden,false);assert.match(f.els.sourceErrorDetails.value,/動画情報の取得/);assert.match(f.els.sourceErrorDetails.value,/3000000000 bytes/);assert.match(f.els.sourceErrorDetails.value,/60秒/);const details=f.els.sourceErrorDetails.value;f.doc.createElement=make;f.sandbox.setTimeout=setTimeout;f.sandbox.clearTimeout=clearTimeout;await f.file('sourceFile',[{name:'retry.mp4',size:20,lastModified:0}]);assert.match(f.els.sourceInfo.textContent,/retry.mp4/);assert.equal(f.els.sourceErrorDetails.value,details);let copied;f.sandbox.navigator.clipboard={writeText:async text=>{copied=text}};await f.els.copySourceError.onclick();assert.equal(copied,details);f.sandbox.navigator.clipboard=null;await f.els.copySourceError.onclick();assert.match(f.els.sourceErrorCopyStatus.textContent,/手動でコピー/)});
 await run('メタデータの後で届く先頭フレームをシークせず待つ',async()=>{const f=fixture(),v=f.els.sourceVideo;v.readyState=1;Object.defineProperty(v,'currentTime',{get(){return 0},set(){throw Error('initial seek must not be needed')}});const pending=f.file('sourceFile',[{name:'slow-frame.mp4',size:1,lastModified:0}]);await tick();assert.equal(f.els.editable.disabled,true);assert.match(f.els.sourceFeedback.textContent,/先頭の映像/);v.readyState=2;v.emit('loadeddata');await pending;assert.match(f.els.sourceInfo.textContent,/slow-frame.mp4/)});
 await run('メタデータが遅れて届いても期限前なら成功する',async()=>{const f=fixture(),make=f.doc.createElement;let probe;f.doc.createElement=tag=>{const e=make(tag);if(tag==='video'){probe=e;Object.defineProperty(e,'src',{configurable:true,set(v){this._src=v},get(){return this._src}})}return e};const pending=f.file('sourceFile',[{name:'delayed.mp4',size:1,lastModified:0}]);await tick();assert.equal(f.els.editable.disabled,true);probe.emit('loadedmetadata');await pending;assert.match(f.els.sourceInfo.textContent,/delayed.mp4/);assert.equal(f.els.editable.disabled,false)});
 await run('デコード失敗と対応外形式を区別して編集内容を保持する',async()=>{for(const code of [3,4]){const f=fixture();await f.ready();const old=f.els.sourceInfo.textContent,make=f.doc.createElement;f.doc.createElement=tag=>{const e=make(tag);if(tag==='video'){e.error={code};Object.defineProperty(e,'src',{configurable:true,set(v){this._src=v;queueMicrotask(()=>this.emit('error'))},get(){return this._src}})}return e};await f.file('sourceFile',[{name:'bad.mp4',size:1,lastModified:0}]);assert.equal(f.els.sourceInfo.textContent,old);assert.match(f.els.sourceErrorDetails.value,new RegExp('MediaError '+code));assert.equal(f.els.editable.disabled,false)}});
 await run('準備中のプレビュー取消後に音声を開始しない',async()=>{const f=fixture();await f.ready();let resume;f.state.resumeGate=new Promise(r=>resume=r);const pending=f.els.play.onclick();await tick();f.els.cancel.onclick();resume();await tick();await tick();const scheduled=f.state.scheduled.length;f.els.cancel.onclick();await pending;assert.equal(scheduled,0)});
 await run('ストリーム初期化失敗でも編集ロックを解除',async()=>{const f=fixture();await f.ready();f.state.streamError=true;let error;try{await f.els.export.onclick()}catch(e){error=e}assert.equal(error,undefined);assert.equal(f.els.editable.disabled,false);assert.match(f.els.status.textContent,/captureStream failed/)});
 await run('合成デモの初期化失敗でも旧編集データとロック状態を維持',async()=>{const f=fixture();await f.ready();const title=f.els.title.value;f.state.streamError=true;await f.els.demo.onclick();assert.equal(f.els.editable.disabled,false);assert.equal(f.els.title.value,title);assert.match(f.els.status.textContent,/captureStream failed/)});
 await run('準備中の書き出し取消で記録・音声を開始せずトラック解放',async()=>{const f=fixture();await f.ready();let resume;f.state.resumeGate=new Promise(r=>resume=r);const pending=f.els.export.onclick();await tick();f.els.cancel.onclick();resume();await pending;assert.equal(f.state.scheduled.length,0);assert.ok(f.state.recorders.filter(r=>!r.probe).every(r=>!r.started));assert.ok(f.state.tracks.every(t=>t.stopped));assert.equal(f.els.editable.disabled,false);assert.equal(f.els.exportResult.children.length,0)});
 await run('再生・取消を反復して二重音声を残さない',async()=>{const f=fixture();await f.ready();for(let i=0;i<3;i++){const pending=f.els.play.onclick();await tick();await tick();assert.equal(f.state.scheduled.filter(n=>!n.stopped).length,2);f.els.cancel.onclick();await pending;assert.equal(f.state.scheduled.filter(n=>!n.stopped).length,0)}});
 await run('書き出し・取消・再実行で部分動画を保存しない',async()=>{const f=fixture();await f.ready();for(let i=0;i<3;i++){const pending=f.els.export.onclick();await tick();await tick();assert.equal(f.state.recorders.at(-1).started,true);f.els.cancel.onclick();await pending;assert.equal(f.els.exportResult.children.length,0);assert.ok(f.state.tracks.every(t=>t.stopped));assert.equal(f.state.scheduled.filter(n=>!n.stopped).length,0);assert.equal(f.els.editable.disabled,false)}});
 await run('WebMエンコーダーエラーで直ちに音声停止・トラック解放',async()=>{const f=fixture();await f.ready();f.els.format.value='webm';const pending=f.els.export.onclick();await tick();await tick();f.state.recorders.at(-1).onerror({error:{message:'synthetic encoder error'}});await pending;assert.ok(f.state.scheduled.every(n=>n.stopped));assert.ok(f.state.tracks.every(t=>t.stopped));assert.equal(f.els.exportResult.children.length,0);assert.match(f.els.status.textContent,/synthetic encoder error/)});
 await run('タブ非表示で書き出し中断・編集データ維持',async()=>{const f=fixture();await f.ready();const title=f.els.title.value,pending=f.els.export.onclick();await tick();await tick();f.doc.hidden=true;f.listeners.visibilitychange();await pending;assert.ok(f.state.scheduled.every(n=>n.stopped));assert.equal(f.els.title.value,title);assert.equal(f.els.exportResult.children.length,0)});
 await run('動画デコード失敗の差替えで旧素材・構成を維持',async()=>{const f=fixture();await f.ready();const title=f.els.title.value,source=f.els.sourceInfo.textContent;f.state.rejectSource=true;await f.file('sourceFile',[{name:'broken.mp4',size:500,lastModified:1}]);assert.equal(f.els.title.value,title);assert.equal(f.els.sourceInfo.textContent,source);assert.equal(f.els.editable.disabled,false)});
 await run('場面区間外のフレームは描画へ取り込まない',async()=>{const f=fixture();await f.ready();f.state.drawn=[];const pending=f.els.play.onclick();await tick();await tick();assert.deepEqual(f.state.scheduled.map(n=>n.startArgs[0]),[.15,6.15]);f.state.clock=5.99;f.els.sourceVideo.currentTime=6.1;await f.state.frames.shift()();assert.ok(f.state.drawn.every(t=>t>=0&&t<6));assert.equal(f.els.sourceVideo.paused,true);f.els.cancel.onclick();await pending});
 await run('試聴の音声準備待ちで新規作成しても後から音声を開始しない',async()=>{const f=fixture();await f.ready();let resume;f.state.resumeGate=new Promise(r=>resume=r);const pending=f.els.audioList.children[0].children[2].onclick();await tick();f.els.newProject.onclick();resume();await pending;await tick();assert.equal(f.state.scheduled.length,0);assert.equal(f.els.title.value,'新しい手順動画');assert.equal(f.els.sourceWorkspace.hidden,true)});
 await run('試聴の音声準備待ちで工程を戻しても後から音声を開始しない',async()=>{const f=fixture();await f.ready();let resume;f.state.resumeGate=new Promise(r=>resume=r);const pending=f.els.audioList.children[0].children[2].onclick();await tick();f.els.editSource.onclick();resume();await pending;await tick();assert.equal(f.state.scheduled.length,0)});
 await run('試聴を連打しても最後の音声だけ開始する',async()=>{const f=fixture();await f.ready();let resume;f.state.resumeGate=new Promise(r=>resume=r);const first=f.els.audioList.children[0].children[2].onclick(),second=f.els.audioList.children[1].children[2].onclick();resume();await Promise.all([first,second]);await tick();assert.equal(f.state.scheduled.length,1);f.els.newProject.onclick();assert.equal(f.state.scheduled.filter(n=>!n.stopped).length,0)});
 await run('出力形式を変えると旧動画を無効化して再生成へ戻す',async()=>{const f=fixture();await f.ready();f.els.sceneCards.children[1].children[0].children[4].onclick();f.els.nextStep.onclick();f.els.nextStep.onclick();f.els.nextStep.onclick();await tick();const pending=f.els.export.onclick();await tick();await tick();const rec=f.state.recorders.at(-1);assert.equal(rec.started,true);rec.ondataavailable({data:new Blob(['synthetic encoded video'])});f.state.clock=6;f.els.sourceVideo.currentTime=5.99;await f.state.frames.shift()();await pending;assert.match(f.els.exportResult.children[1].download,/\.mp4$/);assert.equal(f.els.guideAction.textContent,'もう一度ダウンロード');f.els.format.value='webm';f.els.format.onchange();assert.equal(f.els.exportResult.children.length,0);assert.equal(f.els.guideAction.textContent,'動画を作成してダウンロード');assert.match(f.els.outputSettingsSummary.textContent,/WebM/);assert.equal(f.els.guideAction.disabled,false)});
 await run('短い音声付き実録と映像再生を通してから本番記録を始める',async()=>{const f=fixture();await f.ready();const pending=f.els.export.onclick();await tick();await tick();const probe=f.state.recorders.find(r=>r.probe),actual=f.state.recorders.find(r=>!r.probe);assert.equal(probe.started,true);assert.ok(probe.stream.getAudioTracks().length);assert.ok(probe.stream.getVideoTracks().length);assert.ok(probe.stream.getTracks().every(t=>t.stopped));assert.equal(actual.started,true);f.els.cancel.onclick();await pending});
 await run('MP4の短時間記録開始に失敗したら実録できるWebMを選ぶ',async()=>{const f=fixture();await f.ready();f.state.probeFail=true;const pending=f.els.export.onclick();await tick();await tick();const actual=f.state.recorders.filter(r=>!r.probe);assert.equal(actual.length,1);assert.match(actual[0].mimeType,/webm/);assert.ok(f.state.recorders.filter(r=>r.probe).every(r=>r.stream.getTracks().every(t=>t.stopped)));f.els.cancel.onclick();await pending});
 await run('MP4試験動画のデコード失敗でもWebMを実録確認する',async()=>{const f=fixture();await f.ready();f.state.probeDecodeFail=true;const pending=f.els.export.onclick();await tick();await tick();assert.match(f.state.recorders.filter(r=>!r.probe)[0].mimeType,/webm/);f.els.cancel.onclick();await pending});
 await run('MP4の本番start失敗を破棄してWebMを先頭から記録する',async()=>{const f=fixture();await f.ready();f.state.startFail=true;const pending=f.els.export.onclick();await tick();await tick();const actual=f.state.recorders.filter(r=>!r.probe);assert.equal(actual.length,2);assert.match(actual[0].mimeType,/mp4/);assert.match(actual[1].mimeType,/webm/);assert.equal(actual[1].started,true);assert.ok(actual[0].stream.getTracks().every(t=>t.stopped));assert.equal(f.els.exportResult.children.length,0);f.els.cancel.onclick();await pending});
 await run('MP4実行中のエラー後はWebMだけ保存し音声を二重にしない',async()=>{const f=fixture();await f.ready();f.els.sceneCards.children[1].children[0].children[4].onclick();const pending=f.els.export.onclick();await tick();await tick();const first=f.state.recorders.filter(r=>!r.probe)[0];first.onerror({error:Error('MP4 runtime error')});await tick();await tick();const next=f.state.recorders.filter(r=>!r.probe)[1];assert.match(next.mimeType,/webm/);assert.ok(first.stream.getTracks().every(t=>t.stopped));assert.equal(f.state.scheduled.filter(n=>!n.stopped).length,1);next.ondataavailable({data:new Blob(['synthetic output'])});f.state.clock=6;f.els.sourceVideo.currentTime=5.99;await f.state.frames.at(-1)();await pending;assert.match(f.els.exportResult.children[1].download,/\.webm$/);assert.equal(f.state.scheduled.filter(n=>!n.stopped).length,0);assert.ok(f.state.tracks.every(t=>t.stopped))});
 await run('形式試験がすべて失敗したら本番記録を始めず編集を保持する',async()=>{const f=fixture();await f.ready();const title=f.els.title.value;f.state.probeFail='all';await f.els.export.onclick();assert.equal(f.state.recorders.filter(r=>!r.probe).length,0);assert.equal(f.els.exportResult.children.length,0);assert.equal(f.els.title.value,title);assert.equal(f.els.editable.disabled,false);assert.ok(f.state.tracks.every(t=>t.stopped));assert.match(f.els.status.textContent,/使える動画形式を確認できません/)});
 await run('形式試験中の取消は別形式を始めず後始末までロックする',async()=>{const f=fixture();await f.ready();let resume;f.state.probeDelay=fn=>resume=fn;const pending=f.els.export.onclick();await tick();f.els.cancel.onclick();assert.equal(f.els.editable.disabled,true);f.els.newProject.onclick();assert.notEqual(f.els.title.value,'新しい手順動画');f.state.probeDelay=null;resume();await pending;assert.equal(f.state.recorders.length,1);assert.ok(f.state.recorders[0].probe);assert.equal(f.els.editable.disabled,false);assert.equal(f.els.exportResult.children.length,0);assert.ok(f.state.tracks.every(t=>t.stopped))});
 await run('形式試験中の非表示は別形式へ切り替えず中断する',async()=>{const f=fixture();await f.ready();let resume;f.state.probeDelay=fn=>resume=fn;const pending=f.els.export.onclick();await tick();f.doc.hidden=true;f.listeners.visibilitychange();f.state.probeDelay=null;resume();await pending;assert.equal(f.state.recorders.length,1);assert.equal(f.els.exportResult.children.length,0);assert.ok(f.state.tracks.every(t=>t.stopped));assert.match(f.els.status.textContent,/非表示/)});
 await run('同じ画質では形式試験を再利用し画質変更後は確認し直す',async()=>{const f=fixture();await f.ready();for(let i=0;i<3;i++){if(i===2){f.els.quality.value='720';f.els.quality.onchange()}const pending=f.els.export.onclick();await tick();await tick();f.els.cancel.onclick();await pending;assert.equal(f.state.recorders.filter(r=>r.probe).length,i===2?2:1)}});
 await run('記録のアクセス拒否は形式を替えて再試行しない',async()=>{const f=fixture();await f.ready();f.state.startFail=true;f.state.securityFail=true;await f.els.export.onclick();assert.equal(f.state.recorders.filter(r=>!r.probe).length,1);assert.doesNotMatch(f.state.recorders.at(-1).mimeType,/webm/);assert.equal(f.els.exportResult.children.length,0);assert.ok(f.state.tracks.every(t=>t.stopped))});
 await run('練習用は720pで完成工程へ進み素材の自動ダウンロードをしない',async()=>{const f=fixture();const pending=f.els.demo.onclick();await tick();await tick();const rec=f.state.recorders.filter(r=>!r.probe).at(-1);assert.ok(rec.started);rec.ondataavailable({data:new Blob(['synthetic practice'])});f.state.demoClock=12000;await f.state.frames.at(-1)();await pending;assert.equal(f.els.quality.value,'720');assert.equal(f.els.step4.hidden,false);assert.equal(f.els.sceneCards.children.length,2);assert.equal(f.els.practiceAssetLinks.children.length,3);assert.equal(f.els.practiceAssetPanel.hidden,false);assert.equal(f.state.downloads.length,0);f.els.practiceAssetLinks.children.forEach(b=>b.click());assert.equal(f.state.downloads.length,3);assert.match(f.state.downloads[0].download,/synthetic-recording/);assert.equal(f.state.downloads[1].download,'s001.wav');assert.equal(f.state.downloads[2].download,'s002.wav');f.els.practiceAssetLinks.children[0].click();assert.equal(f.state.downloads.length,4);f.els.newProject.onclick();assert.equal(f.els.practiceAssetPanel.hidden,true);assert.equal(f.els.practiceAssetLinks.children.length,0)});
 await run('練習用のMP4開始失敗ではWebMに替えて準備できる',async()=>{const f=fixture();f.state.startFail=true;const pending=f.els.demo.onclick();await tick();await tick();const actual=f.state.recorders.filter(r=>!r.probe);assert.equal(actual.length,2);assert.match(actual[1].mimeType,/webm/);actual[1].ondataavailable({data:new Blob(['synthetic practice'])});f.state.demoClock=12000;await f.state.frames.at(-1)();await pending;assert.equal(f.els.step4.hidden,false);assert.match(f.els.practiceAssetLinks.children[0].textContent,/webm/);assert.ok(f.state.tracks.every(t=>t.stopped))});
 await run('練習作成の取消は次の描画を待たず終了し元の作業を保持する',async()=>{const f=fixture();await f.ready();const title=f.els.title.value;const pending=f.els.demo.onclick();await tick();await tick();f.els.cancel.onclick();await pending;assert.equal(f.els.title.value,title);assert.equal(f.els.sceneCards.children.length,2);assert.equal(f.els.practiceAssetLinks.children.length,0);assert.equal(f.els.editable.disabled,false);assert.ok(f.state.tracks.every(t=>t.stopped))});
 await run('練習作成中の非表示も部分素材を残さず終了する',async()=>{const f=fixture();const pending=f.els.demo.onclick();await tick();await tick();f.doc.hidden=true;f.listeners.visibilitychange();await pending;assert.equal(f.els.practiceAssetLinks.children.length,0);assert.equal(f.els.sceneCards.children.length,0);assert.ok(f.state.tracks.every(t=>t.stopped));assert.equal(f.els.editable.disabled,false)});
 await run('練習作成でアクセス拒否が出たら形式を変えて続けない',async()=>{const f=fixture();f.state.startFail=true;f.state.securityFail=true;await f.els.demo.onclick();assert.equal(f.state.recorders.filter(r=>!r.probe).length,1);assert.equal(f.els.practiceAssetLinks.children.length,0);assert.equal(f.els.editable.disabled,false);assert.ok(f.state.tracks.every(t=>t.stopped))});
 await run('練習素材の保存ボタンは別録画への置換後に残さない',async()=>{const f=fixture();const pending=f.els.demo.onclick();await tick();await tick();f.state.recorders.filter(r=>!r.probe).at(-1).ondataavailable({data:new Blob(['synthetic practice'])});f.state.demoClock=12000;await f.state.frames.at(-1)();await pending;assert.equal(f.els.practiceAssetLinks.children.length,3);await f.file('sourceFile',[{name:'my-recording.mp4',size:400,lastModified:2}]);assert.equal(f.els.practiceAssetPanel.hidden,true);assert.equal(f.els.practiceAssetLinks.children.length,0)});
 await run('H.264指定のないMP4は候補にせずWebMで記録する',async()=>{const f=fixture();await f.ready();f.Recorder.isTypeSupported=t=>!/avc1/.test(t);const pending=f.els.export.onclick();await tick();await tick();assert.ok(f.state.recorders.length>0);assert.ok(f.state.recorders.every(r=>/webm/.test(r.mimeType)));f.els.cancel.onclick();await pending});
 await run('シーク前にフレーム通知を登録し待機時間で止まらない',async()=>{const f=fixture();await f.ready();const v=f.els.sourceVideo;let waiting=null,fired=0;Object.getPrototypeOf(v).toBlob=cb=>cb(new Blob(['png']));v.requestVideoFrameCallback=cb=>{waiting=cb;return 1};v.cancelVideoFrameCallback=()=>{waiting=null};Object.defineProperty(v,'currentTime',{configurable:true,get(){return this._time},set(t){this._time=t;const cb=waiting;waiting=null;queueMicrotask(()=>{this.emit('seeked');if(cb){fired++;cb()}})}});const started=Date.now();await f.els.storyboard.onclick();assert.equal(fired,27);assert.ok(Date.now()-started<2000,'seek waited for the frame-callback timeout');assert.equal(f.els.downloads.children.length,1)});
 await run('元動画の速度・ミュート変更後も両動画を等速・無音で合成プレビューする',async()=>{
  const f=fixture();await f.ready();const source=f.els.sourceVideo,next=f.state.videos[0];
  for(const v of [source,next]){v.playbackRate=2;v.muted=false}
  const pending=f.els.play.onclick();await tick();await tick();
  for(const v of [source,next]){assert.equal(v.playbackRate,1);assert.equal(v.muted,true)}
  assert.equal(source.paused,false);f.state.clock=6.1;source.currentTime=5.99;next.currentTime=6.1;await f.state.frames.at(-1)();
  assert.equal(next.paused,false);assert.equal(next.playbackRate,1);assert.equal(next.muted,true);assert.equal(f.state.scheduled.filter(n=>!n.stopped).length,2);
  f.els.cancel.onclick();await pending;assert.equal(f.els.sourceVideo.controls,true);assert.ok(f.state.scheduled.every(n=>n.stopped));
 });
 await run('元動画を倍速・ミュート解除しても等速に戻し同期エラーなく書き出す',async()=>{
  const f=fixture();await f.ready();const source=f.els.sourceVideo,next=f.state.videos[0];source.playbackRate=2;source.muted=false;
  const pending=f.els.export.onclick();await tick();await tick();assert.equal(source.playbackRate,1);assert.equal(source.muted,true);
  const recorder=f.state.recorders.find(r=>!r.probe);assert.ok(recorder.started);recorder.ondataavailable({data:new Blob(['synthetic output'])});
  f.state.clock=1;source.currentTime=f.state.clock*source.playbackRate;await f.state.frames.at(-1)();assert.equal(recorder.state,'recording');
  f.state.clock=6.1;source.currentTime=5.99;next.currentTime=6.1;await f.state.frames.at(-1)();assert.equal(next.playbackRate,1);assert.equal(next.muted,true);
  f.state.clock=12;next.currentTime=11.99;await f.state.frames.at(-1)();await pending;
  assert.match(f.els.exportResult.children[1].download,/\.(mp4|webm)$/);assert.doesNotMatch(f.els.status.textContent,/同期が崩れ/);assert.ok(f.state.tracks.every(t=>t.stopped));assert.ok(f.state.scheduled.every(n=>n.stopped));
 });
 await run('声なしプレビューは保持したWAVをスケジュールしない',async()=>{const f=fixture();await f.ready();f.els.useNarration.checked=false;f.els.useNarration.onchange();const pending=f.els.play.onclick();await tick();await tick();assert.equal(f.state.scheduled.length,0);f.els.cancel.onclick();await pending;assert.equal(f.els.editable.disabled,false)});
 await run('声なし書き出しは元映像の再生位置で場面と終了を進める',async()=>{
  const f=fixture();await f.ready();f.els.useNarration.checked=false;f.els.useNarration.onchange();f.state.demoClock=50000;
  const pending=f.els.export.onclick();await tick();await tick();const recorder=f.state.recorders.find(r=>!r.probe);assert.ok(recorder.started);
  f.state.clock=1000;f.state.demoClock=51000;f.els.sourceVideo.currentTime=1;await f.state.frames.at(-1)();
  assert.equal(recorder.state,'recording');assert.equal(Number(f.els.timeline.value),1);assert.equal(f.state.scheduled.length,0);
  f.state.demoClock=56100;f.els.sourceVideo.currentTime=5.99;f.state.videos[0].currentTime=6.1;await f.state.frames.at(-1)();
  assert.equal(recorder.state,'recording');assert.ok(Math.abs(Number(f.els.timeline.value)-6)<.00001);
  recorder.ondataavailable({data:new Blob(['synthetic output'])});f.state.demoClock=62000;f.state.videos[0].currentTime=11.99;await f.state.frames.at(-1)();await pending;
  assert.match(f.els.exportResult.children[1].download,/\.(mp4|webm)$/);assert.equal(Number(f.els.timeline.value),12);assert.ok(f.state.tracks.every(t=>t.stopped));
 });
 await run('声なし途中プレビューも元映像の再生位置に追従する',async()=>{
  const f=fixture();await f.ready();f.els.useNarration.checked=false;f.els.useNarration.onchange();f.els.timeline.value='2';f.state.demoClock=50000;
  const pending=f.els.play.onclick();await tick();await tick();f.state.clock=1000;f.state.demoClock=51000;f.els.sourceVideo.currentTime=3;await f.state.frames.at(-1)();
  assert.equal(Number(f.els.timeline.value),3);assert.equal(f.state.scheduled.length,0);f.els.cancel.onclick();await pending;assert.equal(f.els.editable.disabled,false);
 });
 await run('声なしは0.35秒超の時計差でも書き出しを続け場面を飛ばさない',async()=>{
  const f=fixture();await f.ready();f.els.useNarration.checked=false;f.els.useNarration.onchange();
  const pending=f.els.export.onclick();await tick();await tick();const rec=f.state.recorders.find(r=>!r.probe);
  f.state.demoClock=1000;f.els.sourceVideo.currentTime=.2;await f.state.frames.at(-1)();
  assert.equal(rec.state,'recording');assert.equal(Number(f.els.timeline.value),.2);assert.equal(f.state.scheduled.length,0);
  f.state.demoClock=15000;f.els.sourceVideo.currentTime=5.99;await f.state.frames.at(-1)();
  assert.equal(rec.state,'recording');assert.equal(Number(f.els.timeline.value),6);assert.equal(f.state.videos[0].paused,false);
  f.state.demoClock=16000;f.state.videos[0].currentTime=6.2;await f.state.frames.at(-1)();assert.equal(Number(f.els.timeline.value),6.2);
  rec.ondataavailable({data:new Blob(['subtitle output'])});f.state.demoClock=22000;f.state.videos[0].currentTime=11.99;await f.state.frames.at(-1)();await pending;
  assert.equal(Number(f.els.timeline.value),12);assert.match(f.els.exportResult.children[1].download,/mp4$/);assert.doesNotMatch(f.els.status.textContent,/同期が崩れ/);assert.ok(f.state.tracks.every(t=>t.stopped));
 });
 await run('声なしでも映像の停止と早すぎる終了はダウンロードを止める',async()=>{
  for(const failure of ['stalled','ended','error']){const f=fixture();await f.ready();f.els.useNarration.checked=false;f.els.useNarration.onchange();const pending=f.els.export.onclick();await tick();await tick();
   if(failure==='stalled')f.state.demoClock=1100;
   if(failure==='ended'){f.els.sourceVideo.currentTime=1;f.els.sourceVideo.ended=true}
   if(failure==='error')f.els.sourceVideo.error={code:3};
   await f.state.frames.at(-1)();await pending;assert.equal(f.state.downloads.length,0);assert.match(f.els.status.textContent,/映像デコードが停止|場面の途中|映像を読み取れません/);assert.ok(f.state.tracks.every(t=>t.stopped));
  }
 });
 await run('声ありでは0.35秒超の同期ずれを引き続き拒否する',async()=>{const f=fixture();await f.ready();const pending=f.els.export.onclick();await tick();await tick();f.state.clock=1;f.els.sourceVideo.currentTime=.2;await f.state.frames.at(-1)();await pending;assert.match(f.els.status.textContent,/映像と音声の同期/);assert.equal(f.state.downloads.length,0)});
 await run('声なしの途中再生は切り出し元の開始時刻を差し引く',async()=>{const f=fixture();await f.ready();f.els.useNarration.checked=false;f.els.useNarration.onchange();f.els.timeline.value='8';const pending=f.els.play.onclick();await tick();await tick();assert.equal(f.els.sourceVideo.currentTime,8);f.state.demoClock=10000;f.els.sourceVideo.currentTime=8.3;await f.state.frames.at(-1)();assert.equal(Number(f.els.timeline.value),8.3);f.els.cancel.onclick();await pending});
 await run('声なしの短い場面は末尾静止を含めて終了し静止部分からも再開できる',async()=>{for(const start of [0,.25]){const f=fixture();await f.file('sourceFile',[{name:'short.mp4',size:100,lastModified:0}]);f.els.proposal.value=JSON.stringify({schemaVersion:1,title:'short',scenes:[{id:'s001',sourceIn:0,sourceOut:.2,narration:'',caption:'字幕',captionPosition:'bottom',regionId:'',effect:'none'}],questions:[]});await f.els.applyProposal.onclick();f.els.useNarration.checked=false;f.els.useNarration.onchange();f.els.timeline.value=String(start);const pending=f.els.play.onclick();await tick();await tick();if(start===0){f.els.sourceVideo.currentTime=.199;f.state.demoClock=200;await f.state.frames.at(-1)();assert.equal(Number(f.els.timeline.value),.2)}f.state.demoClock=500;await f.state.frames.at(-1)();await pending;assert.equal(Number(f.els.timeline.value),.4);assert.equal(f.els.editable.disabled,false)}});
 await run('声なし記録はゼロ値の音声時計を持ち取消・再試行で解放する',async()=>{
  const f=fixture();await f.ready();f.els.useNarration.checked=false;f.els.useNarration.onchange();
  for(let i=0;i<2;i++){const pending=f.els.export.onclick();await tick();await tick();const clock=f.state.silentClocks.at(-1);
   assert.equal(clock.offset.value,0);assert.equal(clock.started,true);assert.equal(clock.stopped,undefined);assert.ok(clock.destination.stream.getAudioTracks().length);assert.equal(f.state.scheduled.length,0);
   f.els.cancel.onclick();await pending;assert.equal(clock.stopped,true);assert.equal(clock.disconnected,true);assert.ok(f.state.tracks.every(t=>t.stopped));assert.equal(f.els.exportResult.children.length,0);
  }assert.equal(f.state.silentClocks.length,2);
 });
 await run('声なしMP4失敗後も無音の時計を破棄してWebMへ切り替える',async()=>{
  const f=fixture();await f.ready();f.els.useNarration.checked=false;f.els.useNarration.onchange();f.state.startFail=true;
  const pending=f.els.export.onclick();await tick();await tick();assert.equal(f.state.silentClocks.length,2);assert.equal(f.state.silentClocks[0].stopped,true);assert.equal(f.state.silentClocks[0].disconnected,true);assert.equal(f.state.silentClocks[1].stopped,undefined);
  assert.match(f.state.recorders.filter(r=>!r.probe).at(-1).mimeType,/webm/);f.els.cancel.onclick();await pending;assert.ok(f.state.silentClocks.every(n=>n.stopped&&n.disconnected));assert.equal(f.state.scheduled.length,0);
 });
 await run('提示フレームを監視して保持し停止後の古い通知は破棄する',async()=>{
  const f=fixture();await f.ready();const v=f.els.sourceVideo;let nextId=0;const callbacks=new Map();
  v.requestVideoFrameCallback=cb=>{callbacks.set(++nextId,cb);return nextId};v.cancelVideoFrameCallback=id=>callbacks.delete(id);
  const pending=f.els.play.onclick();await tick();await tick();assert.equal(callbacks.size,1);
  const [id,cb]=[...callbacks][0];callbacks.delete(id);f.state.clock=.5;v.currentTime=.5;const before=f.state.drawn.length;cb(500,{mediaTime:.5});
  assert.equal(f.state.drawn.length,before+1);assert.equal(callbacks.size,1);await f.state.frames.at(-1)();
  f.els.cancel.onclick();await pending;assert.equal(callbacks.size,0);const after=f.state.drawn.length;cb(600,{mediaTime:.6});assert.equal(f.state.drawn.length,after);assert.equal(callbacks.size,0);
 });
 await run('再生位置だけが進み提示フレームが止まったら出力を成功扱いしない',async()=>{
  const f=fixture();await f.ready();const v=f.els.sourceVideo;let cancelled=false;
  v.requestVideoFrameCallback=()=>1;v.cancelVideoFrameCallback=()=>{cancelled=true};
  const pending=f.els.export.onclick();await tick();await tick();f.state.clock=1.1;v.currentTime=1.1;await f.state.frames.at(-1)();await pending;
  assert.match(f.els.status.textContent,/映像デコードが停止/);assert.equal(f.els.exportResult.children.length,0);assert.equal(cancelled,true);assert.ok(f.state.tracks.every(t=>t.stopped));
 });
 await run('音声予約の途中失敗で既に予約した音声を停止し再試行できる',async()=>{
  for(const action of ['play','export']){
  const f=fixture();await f.ready();
  // The first scene starts successfully; scheduling the second fails.
  const originalPush=f.state.scheduled.push;let attempts=0;
  f.state.scheduled.push=function(node){if(++attempts===2)throw Error('audio start failed');return originalPush.call(this,node)};
  await f.els[action].onclick();assert.match(f.els.status.textContent,/audio start failed/);
  assert.ok(f.state.scheduled.every(n=>n.stopped));assert.equal(f.els.editable.disabled,false);
  f.state.scheduled.push=originalPush;const retry=f.els[action].onclick();await tick();await tick();
  assert.equal(f.state.scheduled.filter(n=>!n.stopped).length,2);f.els.cancel.onclick();await retry;
  assert.ok(f.state.tracks.every(t=>t.stopped));assert.equal(f.els.exportResult.children.length,0);
  }
 });
 await run('場面末尾より早いendedを静止画延長として成功扱いしない',async()=>{
  const f=fixture();await f.ready();const pending=f.els.export.onclick();await tick();await tick();
  f.state.clock=1;f.els.sourceVideo.currentTime=1;f.els.sourceVideo.ended=true;
  await f.state.frames.at(-1)();
  // A failed frame must release the operation, without waiting for the rest of the timeline.
  await tick();assert.equal(f.els.editable.disabled,false);await pending;
  assert.match(f.els.status.textContent,/映像.*終了/);assert.equal(f.els.exportResult.children.length,0);
  assert.ok(f.state.scheduled.every(n=>n.stopped));assert.ok(f.state.tracks.every(t=>t.stopped));
 });
 await run('音声resumeが未完了のままでも取消でロック解除し再実行できる',async()=>{
  for(const action of ['play','export']){
   const f=fixture();await f.ready();let resume;f.state.resumeGate=new Promise(r=>resume=r);
   const pending=f.els[action].onclick();await tick();f.els.cancel.onclick();await tick();await tick();
   assert.equal(f.els.editable.disabled,false);await pending;assert.equal(f.state.scheduled.length,0);
   assert.equal(f.els.status.className,'warning');assert.doesNotMatch(f.els.status.textContent,/音声を準備できません/);
   f.state.resumeGate=null;const retry=f.els[action].onclick();await tick();await tick();
   assert.equal(f.state.scheduled.filter(n=>!n.stopped).length,2);
   resume();await tick();assert.equal(f.state.scheduled.filter(n=>!n.stopped).length,2);
   assert.equal(f.els.editable.disabled,true);f.els.cancel.onclick();await retry;
   assert.ok(f.state.scheduled.every(n=>n.stopped));assert.ok(f.state.tracks.every(t=>t.stopped));
  }
 });
 await run('映像の正しい末尾のendedは正常に次場面へ進める',async()=>{
  const f=fixture();await f.ready();const pending=f.els.export.onclick();await tick();await tick();
  const recorder=f.state.recorders.find(r=>!r.probe);recorder.ondataavailable({data:new Blob(['synthetic output'])});
  f.state.clock=5.99;f.els.sourceVideo.currentTime=5.99;f.els.sourceVideo.ended=true;await f.state.frames.at(-1)();
  assert.equal(recorder.state,'recording');f.state.clock=6.1;f.state.videos[0].currentTime=6.1;await f.state.frames.at(-1)();
  f.state.clock=12;f.state.videos[0].currentTime=11.99;f.state.videos[0].ended=true;await f.state.frames.at(-1)();await pending;
  assert.match(f.els.exportResult.children[1].download,/\.(mp4|webm)$/);assert.ok(f.state.tracks.every(t=>t.stopped));
 });
 await run('MP4停止通知欠落後も部分出力を破棄してWebMの本番記録を完了する',async()=>{
  const f=fixture();await f.ready();f.state.missingStop='actual';f.state.fastRecorderTimeout=true;
  const pending=f.els.export.onclick();await tick();await tick();
  f.state.clock=12;f.state.videos[0].currentTime=11.99;await f.state.frames.at(-1)();
  await until(()=>f.state.recorders.some(r=>!r.probe&&r.mimeType.includes('webm'))||!f.els.editable.disabled);
  const next=f.state.recorders.find(r=>!r.probe&&r.mimeType.includes('webm'));assert.ok(next,'WebM fallback did not start');
  await tick();await tick();assert.ok(f.state.recorders.find(r=>!r.probe&&r.mimeType.includes('mp4')).stream.getTracks().every(t=>t.stopped));
  next.ondataavailable({data:new Blob(['webm output'])});f.state.clock=24;f.state.videos[0].currentTime=11.99;await f.state.frames.at(-1)();await pending;
  assert.match(f.els.exportResult.children[1].download,/\.webm$/);assert.equal(f.state.downloads.length,1);assert.ok(f.state.tracks.every(t=>t.stopped));
 });
 await run('形式試験のMP4停止通知欠落は次の候補へ進む',async()=>{
  const f=fixture();await f.ready();f.state.missingStop='probe';f.state.fastRecorderTimeout=true;
  const pending=f.els.export.onclick();await until(()=>f.state.recorders.some(r=>!r.probe)||!f.els.editable.disabled);
  const actual=f.state.recorders.find(r=>!r.probe);assert.ok(actual,'codec qualification stopped before fallback');assert.match(actual.mimeType,/webm/);
  f.els.cancel.onclick();await pending;assert.ok(f.state.tracks.every(t=>t.stopped));assert.equal(f.state.downloads.length,0);
 });
 await run('pagehideは声あり・声なし記録を中断し履歴退避時だけ音声状態を保持する',async()=>{
  for(const persisted of [false,true])for(const silent of [false,true]){
   const f=fixture();await f.ready();if(silent){f.els.useNarration.checked=false;f.els.useNarration.onchange()}
   const pending=f.els.export.onclick();await tick();await tick();const context=f.state.contexts[0],title=f.els.title.value;
   f.state.windowListeners.pagehide({persisted});await pending;
   assert.equal(context.state,persisted?'running':'closed');assert.equal(f.els.title.value,title);
   assert.equal(f.state.downloads.length,0);assert.ok(f.state.tracks.every(t=>t.stopped));assert.ok(f.state.scheduled.every(n=>n.stopped));
   assert.ok(f.state.silentClocks.every(n=>n.stopped&&n.disconnected));assert.equal(f.els.editable.disabled,false);
   if(persisted){const retry=f.els.export.onclick();await tick();await tick();assert.equal(f.state.recorders.filter(r=>!r.probe).length,2);f.els.cancel.onclick();await retry}
  }
 });
 await run('pagehideが音声準備中・形式試験中に起きても保存や再試行を開始しない',async()=>{
  for(const persisted of [false,true])for(const phase of ['resume','probe']){
   const f=fixture();await f.ready();let release;if(phase==='resume')f.state.resumeGate=new Promise(r=>release=r);else f.state.probeDelay=fn=>release=fn;
   const pending=f.els.export.onclick();await tick();f.state.windowListeners.pagehide({persisted});release();await pending;
   assert.equal(f.state.recorders.filter(r=>!r.probe).length,0);assert.equal(f.state.downloads.length,0);assert.ok(f.state.tracks.every(t=>t.stopped));assert.equal(f.els.editable.disabled,false);
  }
 });
 await run('停止通知欠落の後始末でもアクセス拒否を別形式で再試行しない',async()=>{
  const f=fixture();await f.ready();f.state.missingStop='actual';f.state.fastRecorderTimeout=true;
  const pending=f.els.export.onclick();await tick();await tick();const actual=f.state.recorders.find(r=>!r.probe);
  const denied=Error('runtime access denied');denied.name='SecurityError';actual.onerror({error:denied});await pending;
  assert.equal(f.state.recorders.filter(r=>!r.probe).length,1);assert.match(f.els.status.textContent,/runtime access denied/);
  assert.ok(f.state.tracks.every(t=>t.stopped));assert.equal(f.state.downloads.length,0);assert.equal(actual.onstop,null);
 });
 await run('停止通知欠落でも取消は別形式へ進まず後始末後に再実行できる',async()=>{
  const f=fixture();await f.ready();f.state.missingStop='actual';f.state.fastRecorderTimeout=true;
  const pending=f.els.export.onclick();await tick();await tick();f.els.cancel.onclick();assert.equal(f.els.editable.disabled,true);await pending;
  assert.equal(f.state.recorders.filter(r=>!r.probe).length,1);assert.equal(f.els.status.className,'warning');assert.equal(f.els.editable.disabled,false);
  assert.ok(f.state.tracks.every(t=>t.stopped));assert.equal(f.state.downloads.length,0);
  f.state.missingStop=false;const retry=f.els.export.onclick();await tick();await tick();assert.equal(f.state.recorders.filter(r=>!r.probe).length,2);
  f.els.cancel.onclick();await retry;assert.ok(f.state.tracks.every(t=>t.stopped));
 });
 await run('終了待ち中のアクセス拒否は停止タイムアウトより優先し形式を替えない',async()=>{
  for(const name of ['SecurityError','NotAllowedError']){
   const f=fixture();await f.ready();f.state.missingStop='actual';f.state.fastRecorderTimeout=true;
   const pending=f.els.export.onclick();await tick();await tick();const actual=f.state.recorders.find(r=>!r.probe),stop=actual.stop.bind(actual);
   actual.stop=()=>{stop();queueMicrotask(()=>{const error=Error('denied while finishing');error.name=name;actual.onerror?.({error})})};
   f.state.clock=12;f.state.videos[0].currentTime=11.99;await f.state.frames.at(-1)();
   await until(()=>f.state.recorders.filter(r=>!r.probe).length>1||!f.els.editable.disabled);
   assert.equal(f.state.recorders.filter(r=>!r.probe).length,1);await pending;
   assert.match(f.els.status.textContent,/denied while finishing/);assert.equal(f.state.downloads.length,0);assert.ok(f.state.tracks.every(t=>t.stopped));
  }
 });
 console.log(count+' simulated media controller tests passed; browser acceptance remains unverified.');
})().catch(e=>{console.error(e);process.exitCode=1});
