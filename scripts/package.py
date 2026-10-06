"""Create the public distribution from an explicit allowlist, never the source DOCX."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json, re
root=Path(__file__).resolve().parent.parent
(root/'.private').mkdir(exist_ok=True)
files=['index.html','prototype.html','README.md','USER_GUIDE.md','ACCEPTANCE.md','VALIDATION.md','LICENSE','.gitignore','tests/core.test.cjs','tests/editor.test.cjs','tests/media-controller.test.cjs','tests/workflow.test.cjs','REVIEW.md','scripts/package.py']
patterns=[r'gh[pousr]_[A-Za-z0-9]{20,}',r'github_pat_[A-Za-z0-9_]+',r'AKIA[A-Z0-9]{16}',r'-----BEGIN .*PRIVATE KEY-----',r'https://[^\s]+[?&]sig=',r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}',r'libfile_[A-Za-z0-9]+',r'file_000000',r'C:\\Users\\']
manifest={}
for name in files:
    p=root/name
    text=p.read_text(encoding='utf-8')
    # Scanner code necessarily contains the pattern strings; all other public files are scanned.
    if name!='scripts/package.py':
        for pattern in patterns:
            if re.search(pattern,text):
                raise SystemExit('Review required: '+name+' matched '+pattern)
    manifest[name]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
out=root/'AI-Video-Maker.zip'
with ZipFile(out,'w',ZIP_DEFLATED) as z:
    for name in files:z.write(root/name,'AI-Video-Maker/'+name)
    z.writestr('AI-Video-Maker/MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
with ZipFile(out) as z:
    assert z.testzip() is None
    assert not any('.private' in n or n.endswith('.docx') for n in z.namelist())
(root/'.private/public-files.json').write_text(json.dumps([{'path':name,'content':(root/name).read_text(encoding='utf-8')} for name in files],ensure_ascii=False),encoding='utf-8')
print(json.dumps({'archive':str(out),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'files':len(files),'scan':'no sensitive patterns detected'},ensure_ascii=False))
