import { buildReportModel, renderReportHtml, renderReportPdf, renderReportPptx, traceableReportName } from '/sessions/modest-eager-volta/mnt/DocifyUI/server/src/adapters/report.js';
import fs from 'fs';
// realistic serializeReport-shaped sample
const ser = {
  overall: 82, verdict: 'Review recommended', gate: 85, gatePassed: false, assistantGate: 75,
  dimensions: [
    { id:'llm', name:'LLM readiness', weight:0.30, desc:'Findable & citable by AI', score:78, open:2, total:3 },
    { id:'readability', name:'Readability', weight:0.20, desc:'Clarity out of context', score:88, open:1, total:2 },
    { id:'completeness', name:'Completeness', weight:0.20, desc:'Prereqs, limits, examples', score:70, open:2, total:2 },
    { id:'consistency', name:'Consistency', weight:0.15, desc:'One term one meaning', score:90, open:0, total:1 },
    { id:'links', name:'Link health', weight:0.08, desc:'', score:100, open:0, total:0 },
    { id:'style', name:'Style', weight:0.07, desc:'', score:75, open:0, total:0 }
  ],
  assistants: [
    { id:'chatgpt', name:'ChatGPT', score:80, probability:83, ready:true, heldBackBy:null },
    { id:'claude', name:'Claude', score:78, probability:80, ready:true, heldBackBy:null },
    { id:'gemini', name:'Gemini', score:72, probability:70, ready:false, heldBackBy:'Completeness' }
  ],
  issues: [
    { id:'title', cat:'LLM readiness', dim:'llm', title:'Title is not search-optimized', body:'Too generic to match queries.', fix:'Rename with product + tasks.', target:'Document title', before:'API reference', after:'API reference — endpoints, authentication, and errors', fixed:true, gain:4 },
    { id:'prereq', cat:'Completeness', dim:'completeness', title:'Missing prerequisites', body:'No "Before you begin" section.', fix:'Add prerequisites.', target:'New section (top)', before:'(missing)', after:'"Before you begin" — account, API key.', fixed:false, gain:6 },
    { id:'example', cat:'Completeness', dim:'completeness', title:'No runnable example', body:'Add a worked curl example.', fix:'Add example.', target:'New section (end)', before:'(no runnable example)', after:'curl POST /v1/charges', fixed:false, gain:5 }
  ],
  links: [ { url:'/docs/token-rotation-guide', file:'authentication.md, line 24', status:'404', why:'Target page removed in v2.3.' } ],
  style: [ { t:'Sentence length', pass:true, d:'Avg 16 words' }, { t:'Active voice', pass:false, d:'3 passive sentences' } ],
  fixedCount:1, remaining:2, aiScore:78, title:'API reference — endpoints, authentication, and errors'
};
const meta = { title: ser.title, repo:'prav99/DocifyUI', branch:'main', pr:'PR #184', commit:'a7f3d91c', docType:'API reference', format:'markdown', version:20, reviewStatus:'Review recommended' };
const model = buildReportModel(ser, meta);

const html = renderReportHtml(model, { preset:'full' });
const pdf = await renderReportPdf(model, { preset:'full' });
const pptx = await renderReportPptx(model, { preset:'full' });
const htmlExec = renderReportHtml(model, { preset:'executive' });

let pass=0, fail=0; const ok=(n,c,x)=>{ if(c)pass++; else {fail++;console.log('  ✗ '+n+(x?' — '+x:''));} };
ok('HTML valid', html.startsWith('<!DOCTYPE html') && html.includes('</html>'));
ok('HTML has overall score', html.includes('>82<'), 'score');
ok('HTML has verdict', html.includes('Review recommended'));
ok('HTML has a finding', html.includes('Title is not search-optimized'));
ok('HTML has broken link', html.includes('token-rotation-guide'));
ok('HTML responsive+print css', html.includes('@media print') && html.includes('max-width:820px'));
ok('PDF signature %PDF', pdf.slice(0,5).toString()==='%PDF-', pdf.slice(0,5).toString());
ok('PDF non-trivial size', pdf.length>4000, 'bytes='+pdf.length);
ok('PPTX zip signature PK', pptx.slice(0,2).toString()==='PK', pptx.slice(0,2).toString());
ok('PPTX non-trivial size', pptx.length>20000, 'bytes='+pptx.length);
// preset changes sections: executive omits the judge/links/style sections
ok('exec preset drops judge section', !htmlExec.includes('id="judge"') && html.includes('id="judge"'));
ok('exec preset keeps exec+scores+recommendation', htmlExec.includes('id="exec"') && htmlExec.includes('id="scores"') && htmlExec.includes('id="recommendation"'));
// data consistency: overall score identical everywhere (82 present in all)
ok('score consistent HTML', html.includes('82'));
ok('filename traceable pdf', traceableReportName(meta,'pdf','full')==='docifyui-ai-quality-report-pr-184.pdf', traceableReportName(meta,'pdf','full'));
ok('filename executive variant', traceableReportName(meta,'pptx','executive')==='docifyui-ai-quality-executive-summary-pr-184.pptx', traceableReportName(meta,'pptx','executive'));

fs.writeFileSync('/tmp/report.pdf', pdf); fs.writeFileSync('/tmp/report.pptx', pptx); fs.writeFileSync('/tmp/report.html', html);
console.log('\n'+(fail===0?'✓ ALL PASS':'✗ FAIL')+' — '+pass+' passed, '+fail+' failed  |  pdf='+pdf.length+'b pptx='+pptx.length+'b html='+html.length+'b');
process.exit(fail===0?0:1);
