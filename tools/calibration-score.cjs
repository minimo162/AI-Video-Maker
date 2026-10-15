// Scores a Copilot transcription of a calibration PNG without a browser.
// Usage: node tools/calibration-score.cjs --seed <seed> --preset full|two|one [--copilot "メモ"] answer.txt
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function loadCalib(){
 const html=fs.readFileSync(path.join(__dirname,'calibration.html'),'utf8'),sandbox={module:{exports:{}}};
 vm.createContext(sandbox);vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],sandbox);return sandbox.module.exports;
}
function main(argv){
 const args={preset:'full'},files=[];
 for(let i=0;i<argv.length;i++){if(argv[i].startsWith('--'))args[argv[i].slice(2)]=argv[++i];else files.push(argv[i])}
 if(!args.seed||files.length!==1)throw Error('使い方：node tools/calibration-score.cjs --seed <乱数の種> --preset full|two|one [--copilot "Copilotの種類"] 回答.txt');
 const Calib=loadCalib(),key=Calib.makeKey(args.seed,args.preset),result=Calib.score(key,fs.readFileSync(files[0],'utf8'));
 return Calib.report(key,result,{copilot:args.copilot,date:args.date??new Date().toISOString().slice(0,10)});
}
if(require.main===module){try{console.log(main(process.argv.slice(2)))}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={loadCalib,main};
