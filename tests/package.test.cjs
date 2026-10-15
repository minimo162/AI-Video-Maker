const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const execFile=require('node:util').promisify(require('node:child_process').execFile);
const root=path.join(__dirname,'..');
let count=0;async function test(name,fn){await fn();count++;console.log('PASS '+name)}
(async()=>{
let python;
for(const [command,args] of [['python3',[]],['python',[]],['py',['-3']]]){
 try{
  const version=await execFile(command,[...args,'-c','import sys; print(sys.version_info.major)']);
  if(version.stdout.trim()==='3'){python={command,args};break}
 }catch(e){if(e.code!=='ENOENT')throw e}
}
if(!python){console.log('SKIP 配布ZIPの検証: Python 3 が見つかりません（python3 / python / py -3）');return}
await test('配布ZIPとMANIFESTにdocsの2文書を含め許可リスト外の文書を除外する',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-video-maker-package-'));
 try{
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
   if((entry.isFile()&&(!entry.name.startsWith('.')||entry.name==='.gitignore')&&!entry.name.endsWith('.zip'))||['docs','scripts','tests','tools'].includes(entry.name))fs.cpSync(path.join(root,entry.name),path.join(dir,entry.name),{recursive:true});
  }
  fs.writeFileSync(path.join(dir,'docs','unlisted.md'),'Not for distribution');
  const result=JSON.parse((await execFile(python.command,[...python.args,path.join(dir,'scripts/package.py')])).stdout);
  assert.equal(result.scan,'no sensitive patterns detected');
  await execFile(python.command,[...python.args,'-c',`
import hashlib, json, pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(root / 'AI-Video-Maker.zip') as archive:
    assert archive.testzip() is None
    manifest = json.loads(archive.read('AI-Video-Maker/MANIFEST.json'))
    for name in ['docs/GETTING_STARTED_JA.md', 'docs/CODE_REVIEW_JA.md']:
        data = (root / name).read_bytes()
        assert archive.read('AI-Video-Maker/' + name) == data
        assert manifest[name] == {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
    assert 'docs/unlisted.md' not in manifest
    assert 'AI-Video-Maker/docs/unlisted.md' not in archive.namelist()
`,dir],{encoding:'utf8'});
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
await test('配布ZIPの中で相対リンクがすべて解決し、切れたリンクがあれば作成を失敗させる',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-video-maker-links-'));
 try{
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
   if((entry.isFile()&&(!entry.name.startsWith('.')||entry.name==='.gitignore')&&!entry.name.endsWith('.zip'))||['docs','scripts','tests','tools'].includes(entry.name))fs.cpSync(path.join(root,entry.name),path.join(dir,entry.name),{recursive:true});
  }
  const ok=JSON.parse((await execFile(python.command,[...python.args,path.join(dir,'scripts/package.py')])).stdout);
  assert.equal(ok.links,'all relative links resolve');
  await execFile(python.command,[...python.args,'-c',`
import pathlib, sys, zipfile
with zipfile.ZipFile(pathlib.Path(sys.argv[1]) / 'AI-Video-Maker.zip') as archive:
    names = set(archive.namelist())
    assert 'AI-Video-Maker/docs/GETTING_STARTED_JA.md' in names
    assert 'AI-Video-Maker/tests/fixtures/proposals/null-title.txt' in names
`,dir],{encoding:'utf8'});
  fs.appendFileSync(path.join(dir,'README.md'),'\n[消えた文書](docs/MISSING.md)\n');
  await assert.rejects(execFile(python.command,[...python.args,path.join(dir,'scripts/package.py')]),e=>/Broken links in archive: README\.md -> docs\/MISSING\.md/.test(e.stderr));
  assert.equal(fs.existsSync(path.join(dir,'AI-Video-Maker.zip')),false,'リンク切れのZIPを残さない');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
console.log(count+' distribution packaging tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
