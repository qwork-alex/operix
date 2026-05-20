import fs from "node:fs"; import path from "node:path";
const ROOT = "src";
const out = [];
const reLiteral = />\s*([A-Za-zÀ-ÿ][^<{}\n]{2,}?)\s*</g;
const reAttr = /(placeholder|title|aria-label)=("|')([^"']{2,})\2/g;
const reToast = /toast\(\s*\{[^}]*?(title|description)\s*:\s*("|`)([^"`]{2,})\2/gs;
function walk(d){for(const f of fs.readdirSync(d,{withFileTypes:true})){
  const p=path.join(d,f.name);
  if(f.isDirectory()){ if(!/node_modules|ui$/.test(p)) walk(p); continue; }
  if(!/\.tsx?$/.test(f.name)) continue;
  const src=fs.readFileSync(p,"utf8");
  let hits=0,sample=[];
  for(const m of src.matchAll(reLiteral)){ const t=m[1].trim(); if(/^[A-Z][a-zà-ÿ]/.test(t) && !/^(true|false|null)$/.test(t)){hits++; if(sample.length<3)sample.push(t);} }
  for(const m of src.matchAll(reAttr)){ hits++; if(sample.length<3)sample.push(`${m[1]}="${m[3]}"`); }
  for(const m of src.matchAll(reToast)){ hits++; if(sample.length<3)sample.push(`toast:${m[3]}`); }
  if(hits>0) out.push({p, hits, sample});
}}
walk(ROOT);
out.sort((a,b)=>b.hits-a.hits);
let md="# i18n Audit\n\nGenerated: "+new Date().toISOString()+"\nTotal files with hardcoded literals: "+out.length+"\n\n";
md+="| File | Hits | Sample |\n|---|---|---|\n";
for(const r of out.slice(0,80)) md+=`| ${r.p} | ${r.hits} | ${r.sample.join(" / ").replace(/\|/g,"\\|").slice(0,120)} |\n`;
fs.writeFileSync("/mnt/documents/i18n_audit.md",md);
console.log("files:",out.length," top:",out.slice(0,5).map(r=>r.p+":"+r.hits).join(", "));
