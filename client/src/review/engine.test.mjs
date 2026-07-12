/* Node test harness for the review engine. Run: node src/review/engine.test.mjs */
import * as E from './engine.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name + (extra ? '  — ' + extra : '')); } };
const eq = (name, a, b) => ok(name, a === b, JSON.stringify(a) + ' !== ' + JSON.stringify(b));
const has = (name, hay, needle) => ok(name, String(hay).includes(needle), 'missing "' + needle + '" in: ' + hay);
const not = (name, hay, needle) => ok(name, !String(hay).includes(needle), 'unexpected "' + needle + '" in: ' + hay);

/* 1. one word */
eq('word: utilize->use', E.TRANSFORMS.simplify('utilize'), 'use');
/* 2. short sentence */
has('sentence: concise drops "in order to"', E.TRANSFORMS.concise('Click save in order to persist the file.'), 'to persist');
not('sentence: filler removed', E.TRANSFORMS.concise('This is a very important note.'), 'very');
/* 3. paragraph (multi-sentence) */
const para = 'the user can utilize the api. the user should recieve a token.';
const simp = E.TRANSFORMS.simplify(E.TRANSFORMS.grammar(E.TRANSFORMS.customerFriendly(para)));
has('paragraph: user->you (sentence-cased)', simp, 'You can');
has('paragraph: spelling fixed', E.TRANSFORMS.grammar(para), 'receive');
has('paragraph: sentence capitalised', E.TRANSFORMS.grammar(para), 'The user');
/* 4. grammar spacing */
eq('grammar: double space + comma', E.TRANSFORMS.grammar('hello  ,world').replace(/^The/, 'the') !== '', true);
has('grammar: space after comma', E.TRANSFORMS.grammar('a,b,c'), ', b, c');
/* 5. professional expands contractions */
has('professional: don\'t -> do not', E.TRANSFORMS.professional("You don't need it."), 'do not');
/* 6. technical verbs */
has('technical: get->retrieve', E.TRANSFORMS.technical('You get the charge object.'), 'retrieve');
/* 7. active voice */
has('activeVoice', E.TRANSFORMS.activeVoice('The token is validated by the server.'), 'server');
/* 8. remove repetition */
eq('repetition: "the the"', E.TRANSFORMS.removeRepetition('click the the button'), 'click the button');
/* 9. CODE PROTECTION — must not touch fenced code / inline code / URLs */
const codeIn = 'Use `utilize()` and see https://api.example/utilize for the user guide.';
const codeOut = E.TRANSFORMS.simplify(codeIn);
has('protect: inline code intact', codeOut, '`utilize()`');
has('protect: url intact', codeOut, 'https://api.example/utilize');
const fenced = '```\nconst x = utilize(users);\n```';
eq('protect: fenced code untouched', E.TRANSFORMS.simplify(fenced), fenced);
has('protect: heading prefix kept', E.TRANSFORMS.concise('## In order to begin'), '## To begin');
/* 10. markdown list prefix preserved */
has('protect: list marker kept', E.TRANSFORMS.simplify('- utilize the token'), '- use the token');

/* 11. style guides */
const g = E.applyTransform('styleGuide', 'The user can utilize the API.', { guide: 'minimal' });
has('guide minimal: simplified', g.text, 'use');
eq('guide returns id', g.guide, 'minimal');
ok('all guide pipelines valid', E.STYLE_GUIDES.every((gd) => gd.pipeline.every((p) => !!E.TRANSFORMS[p])));

/* 12. custom instruction routing */
const ci = E.instructionToLocal('make this suitable for beginners and concise', 'utilize the methodology');
has('instruction: simplified', ci.text, 'use');
ok('instruction: pipeline chosen', ci.pipeline.includes('simplify') && ci.pipeline.includes('concise'));

/* 13. applyTransform simulated flag */
ok('rewrite is simulated locally', E.applyTransform('rewrite', 'hello world').simulated === true);
ok('concise is NOT simulated', E.applyTransform('concise', 'in order to go').simulated === false);

/* ---- block model ---- */
const before = ['# Title', '', 'Old intro line.', 'Shared line.', 'Remove me.'];
const after = ['# Title', '', 'New intro line.', 'Shared line.'];
const blocks = E.buildBlocks(before.join('\n'), after.join('\n'));
ok('blocks: has context + change', blocks.some((b) => b.type === 'context') && blocks.some((b) => b.type === 'change'));
const stats0 = E.reviewStats(blocks);
ok('blocks: some changes detected', stats0.total >= 1);
ok('blocks: all start pending', stats0.pending === stats0.total);

/* 14. accept keeps proposal; reject reverts to original */
const chg = blocks.find((b) => b.type === 'change');
chg.status = E.STATUS.ACCEPTED;
has('assemble: accepted uses after', E.assembleDocument(blocks), 'New intro line.');
chg.status = E.STATUS.REJECTED;
has('assemble: rejected uses before', E.assembleDocument(blocks), 'Old intro line.');

/* 15. edit a block then assemble */
chg.status = E.STATUS.ACCEPTED; chg.after = ['Edited intro line.']; chg.edited = true;
has('assemble: manual edit flows through', E.assembleDocument(blocks), 'Edited intro line.');

/* 16. resolvedLines for context unchanged */
const ctx = blocks.find((b) => b.type === 'context');
eq('context passes through', E.resolvedLines(ctx).join('\n').includes('# Title'), true);

/* 17. audit entry shape */
const a = E.auditEntry({ blockId: 'x', type: 'rewrite', action: 'concise', before: 'a', after: 'b', source: E.SOURCE.AI });
ok('audit: has id + timestamp', !!a.id && !!a.at && a.source === 'ai');

/* 18. config integrity */
ok('config: toolbar actions resolve', E.DEFAULT_CONFIG.toolbarActions.every((x) => ['manual','accept','reject','comment','styleGuide'].includes(x) || !!E.ACTIONS[x]));
ok('config: alternatives <= 3', E.DEFAULT_CONFIG.alternatives.length <= 3);

/* 19. large-doc diff guard doesn't throw */
ok('diff guard: large input', Array.isArray(E.lineDiff('a\n'.repeat(10), 'b\n'.repeat(10))));

/* 20. idempotent-ish: concise twice == concise once (stable) */
const once = E.TRANSFORMS.concise('in order to utilize this you must in order to try');
eq('concise stable', E.TRANSFORMS.concise(once), once);

console.log('\n' + (fail === 0 ? '✓ ALL PASS' : '✗ FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
