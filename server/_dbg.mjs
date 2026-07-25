import PDFDocument from 'pdfkit';
const orig = PDFDocument.prototype.addPage;
let n = 0;
PDFDocument.prototype.addPage = function(...a){ n++; const line = (new Error().stack.split('\n')[2]||'').trim(); console.error('addPage #'+n+' <- '+line); return orig.apply(this, a); };
const { buildReportModel, renderReportPdf } = await import('/sessions/modest-eager-volta/mnt/DocifyUI/server/src/adapters/report.js');
const ser = {overall:82,verdict:"Review recommended",gate:85,gatePassed:false,assistantGate:75,
 dimensions:[{id:"llm",name:"LLM readiness",weight:.3,score:78,open:2,total:3},{id:"readability",name:"Readability",weight:.2,score:88,open:1,total:2},{id:"completeness",name:"Completeness",weight:.2,score:70,open:2,total:2},{id:"consistency",name:"Consistency",weight:.15,score:90,open:0,total:1},{id:"links",name:"Link health",weight:.08,score:100,open:0,total:0},{id:"style",name:"Style",weight:.07,score:75,open:0,total:0}],
 assistants:[{id:"chatgpt",name:"ChatGPT",score:80,probability:83,ready:true},{id:"claude",name:"Claude",score:78,probability:80,ready:true},{id:"gemini",name:"Gemini",score:72,probability:70,ready:false,heldBackBy:"Completeness"}],
 issues:[{id:"title",cat:"LLM readiness",dim:"llm",title:"Title is not search-optimized",body:"Too generic.",fix:"Rename.",target:"Document title",before:"API reference",after:"API reference long",fixed:true},{id:"prereq",cat:"Completeness",dim:"completeness",title:"Missing prerequisites",body:"No before you begin.",fix:"Add prerequisites.",fixed:false}],
 links:[{url:"/docs/x",file:"a.md",status:"404",why:"gone"}],style:[{t:"Sentence length",pass:true,d:"ok"}],fixedCount:1,remaining:1,title:"API reference"};
const model = buildReportModel(ser, { title: ser.title, repo:'prav99/DocifyUI', format:'markdown' });
await renderReportPdf(model, { preset:'full' });
console.error('TOTAL addPage calls: '+n);
