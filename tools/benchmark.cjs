// Compares a ground-truth operation table with the event list the app produced, without a browser.
// Usage: node tools/benchmark.cjs truth.csv prompt.txt [--tolerance 1] [--scan-seconds 95] [--recording "名前"] [--environment "Edge 130"]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function loadBench(){
 const html=fs.readFileSync(path.join(__dirname,'benchmark.html'),'utf8'),sandbox={module:{exports:{}}};
 vm.createContext(sandbox);vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],sandbox);return sandbox.module.exports;
}
function main(argv){
 const args={},files=[];
 for(let i=0;i<argv.length;i++){if(argv[i].startsWith('--'))args[argv[i].slice(2)]=argv[++i];else files.push(argv[i])}
 if(files.length!==2)throw Error('使い方：node tools/benchmark.cjs 正解.csv 依頼文.txt [--tolerance 1] [--scan-seconds 秒] [--recording 録画名] [--environment 環境]');
 const B=loadBench(),truth=B.parseTruth(fs.readFileSync(files[0],'utf8')),parsed=B.parseEvents(fs.readFileSync(files[1],'utf8'));
 const r=B.score(truth,parsed,{tolerance:args.tolerance?Number(args.tolerance):1,scanSeconds:Number(args['scan-seconds'])||0});
 return B.report(r,{recording:args.recording,environment:args.environment,date:args.date??new Date().toISOString().slice(0,10)});
}
if(require.main===module){try{console.log(main(process.argv.slice(2)))}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={loadBench,main};
