// Static checks for the distributed documents: every relative link must point to a file that ships in the ZIP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const packageScript=fs.readFileSync(path.join(root,'scripts/package.py'),'utf8');
const listed=[...packageScript.match(/^files=\[([^\]]*)\]/m)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
const fixtures=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?fixtures(dir+'/'+e.name):[dir+'/'+e.name]);
const shipped=new Set([...listed,...fixtures('tests/fixtures')]);
function brokenLinks(names,read){
 const broken=[];
 for(const name of names){
  if(!/\.(md|html)$/.test(name))continue;
  const text=read(name),targets=name.endsWith('.md')?[...text.matchAll(/\]\(([^)\s]+)\)/g)].map(m=>m[1]):[...text.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map(m=>m[1]);
  for(const target of targets){
   if(/^[a-z][a-z0-9+.-]*:/i.test(target)||target.startsWith('#'))continue;
   const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(name),target.split('#')[0].split('?')[0]));
   if(!names.includes(resolved))broken.push(name+' -> '+target);
  }
 }
 return broken;
}
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name)}
test('配布する文書の相対リンクはすべて配布物の中のファイルを指す',()=>{
 const names=[...shipped];for(const name of names)assert.ok(fs.existsSync(path.join(root,name)),name+' が存在する');
 assert.deepEqual(brokenLinks(names,name=>fs.readFileSync(path.join(root,name),'utf8')),[]);
 assert.ok(names.includes('docs/GETTING_STARTED_JA.md'),'READMEから案内する初心者ガイドを同梱する');
});
test('切れたリンクとフラグメント付きのリンクを区別する',()=>{
 const docs={'README.md':'[ok](docs/A.md#top) [web](https://example.invalid/) [anchor](#x) [bad](docs/missing.md)','docs/A.md':'[up](../README.md) [img](img/x.png)','page.html':'<a href="docs/A.md">a</a><a href="gone.html">b</a>'};
 assert.deepEqual(brokenLinks(Object.keys(docs),n=>docs[n]),['README.md -> docs/missing.md','docs/A.md -> img/x.png','page.html -> gone.html']);
});
test('テストファイルと文書はすべて配布の許可リストに載っている',()=>{
 for(const name of fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.cjs')))assert.ok(shipped.has('tests/'+name),'tests/'+name+' がpackage.pyの許可リストにある');
 for(const name of fs.readdirSync(path.join(root,'tools')))assert.ok(shipped.has('tools/'+name),'tools/'+name+' がpackage.pyの許可リストにある');
 for(const name of fs.readdirSync(path.join(root,'docs')).filter(n=>/\.(md|html|txt)$/.test(n)))assert.ok(shipped.has('docs/'+name),'docs/'+name+' がpackage.pyの許可リストにある');
});
console.log(count+' document link tests passed.');
