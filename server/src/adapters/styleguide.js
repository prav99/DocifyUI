/* ================= Docify content governance =================
   One resolved WRITING POLICY per generation, merged from layered profiles:

     platform rules (non-overridable)
       → track base profile (technical | marketing)
         → document-type profile
           → tenant writing profile (org terminology, voice, prohibitions)
             → uploaded skill.md + manual instructions (sanitized)

   The policy is compiled into a deterministic prompt block, stored with the
   generation for audit/reproducibility, enforced after generation by a
   deterministic style audit (scores + findings), and safe violations are
   auto-corrected. This is why two documents generated a month apart read
   like the same writer produced them. */

const j = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

/* ------------------------------ Base profiles ------------------------------ */
// "Docify Professional Technical Style" — inspired by the shared ground of
// major public style guides (clarity, consistency, global readability,
// translation readiness); expressed in our own words.
export const TRACK_BASE = {
  technical: {
    styleProfile: 'docify-technical-default',
    label: 'Docify Professional Technical Style',
    voice: { formality: 'professional', neutrality: 'neutral', confidence: 'authoritative', person: 'second person ("you")' },
    sentence: {
      activeVoice: true, maxSentenceWords: 28, concise: true,
      rules: [
        'Prefer active voice; passive only when the actor is unknown or irrelevant',
        'One idea per sentence; average under 20 words, never over 28',
        'Address the reader as "you"; never "the user" in procedures',
        'Present tense for behavior ("the command returns"), imperative for steps ("Run the command")',
        'No marketing language, no unsupported claims, no exclamation marks',
        'Expand "e.g." and "i.e." to "for example" and "that is"',
        'Sentence-case headings; no terminal punctuation in headings',
        'Numbered lists only for ordered steps; bullets for unordered facts',
        'Fenced code blocks for commands, file names and values in backticks',
        'Write for a global audience: no idioms, no cultural references, translation-friendly phrasing'
      ]
    }
  },
  marketing: {
    styleProfile: 'docify-marketing-default',
    label: 'Docify Marketing Style',
    voice: { formality: 'confident', neutrality: 'benefit-led', confidence: 'assured', person: 'second person ("you")' },
    sentence: {
      activeVoice: true, maxSentenceWords: 24, concise: true,
      rules: [
        'Lead with the benefit, then the proof; every claim must be supported by the source material',
        'Short, energetic sentences; vary rhythm; average under 16 words',
        'Speak to "you"; write about the product by name, never "our solution"',
        'Concrete verbs over abstractions; no buzzword chains ("synergy", "leverage", "cutting-edge")',
        'At most one exclamation mark per document',
        'Numbers beat adjectives: prefer "cuts review time 40%" over "dramatically faster"',
        'Sentence-case headings that state a benefit or a fact',
        'Close sections with a clear next step where natural'
      ]
    }
  }
};

/* --------------------------- Document-type profiles --------------------------- */
// Keyed by the catalog docType ids. requiredSections are MANDATORY (never
// removed by user customization); tone adapts within the stable voice.
export const DOCTYPE_PROFILES = {
  api: {
    name: 'API reference', tone: 'precise and factual',
    requiredSections: ['Overview', 'Authentication', 'Endpoints', 'Errors'],
    rules: [
      'Every endpoint: method, path, parameters (name, type, required), request body, response codes with schemas, one realistic example',
      'Document errors with cause and remedy; never leave a status code unexplained',
      'Parameter tables over prose; identical column order throughout'
    ]
  },
  userguide: {
    name: 'User guide', tone: 'instructional and supportive',
    requiredSections: ['Overview', 'Prerequisites', 'Troubleshooting'],
    rules: [
      'Task-oriented: each procedure states its goal, numbered steps, expected result, and verification',
      'State prerequisites before the first step — never mid-procedure',
      'Notes for helpful context, cautions for data risk, warnings for irreversible actions'
    ]
  },
  install: {
    name: 'Installation guide', tone: 'directive and unambiguous',
    requiredSections: ['System requirements', 'Prerequisites', 'Installation', 'Verification'],
    rules: [
      'Exact versions, exact commands, one command per step',
      'Every installation path ends with a verification step the reader can run',
      'Include uninstall/rollback guidance where the source reveals it'
    ]
  },
  quickstart: {
    name: 'Quick start', tone: 'brisk and encouraging',
    requiredSections: ['Prerequisites', 'Steps'],
    rules: ['One happy path only — link out for options', 'Reader reaches a working result in under ten steps', 'No theory beyond two sentences of context']
  },
  troubleshoot: {
    name: 'Troubleshooting guide', tone: 'calm and diagnostic',
    requiredSections: ['Overview'],
    rules: ['Symptom → cause → resolution structure for every entry', 'Exact error text in code formatting so readers can search', 'Never blame the reader; describe conditions, not mistakes']
  },
  relnotes: {
    name: 'Release notes', tone: 'concise and factual',
    requiredSections: ['New features', 'Resolved issues'],
    rules: [
      'Past tense, one line per change, strongest changes first',
      'Include Known issues, Deprecations, Compatibility, and Upgrade considerations when the source reveals them',
      'No adjectives on features — say what changed, not how great it is'
    ]
  },
  admin: {
    name: 'Administration guide', tone: 'authoritative and careful',
    requiredSections: ['Overview', 'Configuration'],
    rules: ['Every configuration option: name, type, default, effect, restart requirement', 'Security implications called out beside the option, not in a separate chapter']
  },
  announce: {
    name: 'Release announcement', tone: 'energetic and newsworthy',
    requiredSections: ['Summary'],
    rules: ['Inverted pyramid: the single biggest change in the first sentence', 'Quote-ready sentences; every claim traceable to a real change']
  },
  onepager: {
    name: 'Feature one-pager', tone: 'persuasive and concrete',
    requiredSections: ['Problem', 'Solution'],
    rules: ['Problem before solution, always', 'Three benefits maximum — each with a concrete proof point']
  },
  social: {
    name: 'Social copy', tone: 'punchy and human',
    requiredSections: [],
    rules: ['Each variant self-contained and channel-sized', 'One idea per post; end with a hook or call to action']
  },
  custlog: {
    name: 'Customer changelog', tone: 'plain and friendly',
    requiredSections: ['What’s new'],
    rules: ['Plain language — no internal jargon, no file paths', 'Explain the benefit of each change in the same line']
  }
};

/* ------------------------------ Terminology ------------------------------ */
// Default preferred terms. `safe: true` pairs are auto-corrected after
// generation (unambiguous, meaning-preserving); the rest are flagged only.
export const DEFAULT_TERMS = [
  { use: 'sign in', not: ['log in', 'log-in', 'login (as a verb)'], match: /\blog[- ]?in\b/gi, replace: 'sign in', safe: true },
  { use: 'email', not: ['e-mail'], match: /\be-mail\b/gi, replace: 'email', safe: true },
  { use: 'repository', not: ['repo'], match: /\brepos?\b/g, safe: false },
  { use: 'select', not: ['click on'], match: /\bclick on\b/gi, replace: 'select', safe: true },
  { use: 'for example', not: ['e.g.'], match: /\be\.g\.,?\s/gi, replace: 'for example, ', safe: true },
  { use: 'that is', not: ['i.e.'], match: /\bi\.e\.,?\s/gi, replace: 'that is, ', safe: true },
  { use: 'use', not: ['utilize', 'utilise'], match: /\butili[sz]e/gi, replace: 'use', safe: true },
  { use: 'application', not: ['app (in formal docs)'], match: /\bapps?\b/g, safe: false }
];

export const STYLE_GUIDES = {
  docify: 'Docify Professional Style (default)',
  microsoft: 'Bias toward Microsoft Writing Style conventions: warm-but-crisp, contractions welcome, sentence case everywhere',
  google: 'Bias toward Google developer-documentation conventions: second person, present tense, standard American spelling',
  custom: 'Organization style guide (from the tenant profile notes)'
};

/* --------------------------- Custom-input sanitizer --------------------------- */
// skill.md files and manual instructions are UNTRUSTED. Strip prompt-injection
// attempts before they reach the model; report what was removed.
const INJECTION_PATTERNS = [
  /(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|rules|prompts)/gi,
  /\b(system\s+prompt|developer\s+message)\b/gi,
  /\breveal\b.{0,40}\b(prompt|secret|token|key|credential)/gi,
  /\byou\s+are\s+now\b/gi,
  /\bact\s+as\s+(?:an?\s+)?(?:unrestricted|jailbroken|dan)\b/gi,
  /\bdo\s+anything\s+now\b/gi
];

export function sanitizeCustomText(text, maxLen = 20000) {
  let t = String(text || '').slice(0, maxLen);
  const flagged = [];
  for (const re of INJECTION_PATTERNS) {
    if (re.test(t)) {
      flagged.push(re.source.slice(0, 40));
      t = t.replace(re, '[removed]');
    }
    re.lastIndex = 0;
  }
  return { text: t.trim(), flagged };
}

/* ----------------------------- Policy resolution ----------------------------- */
export function resolveWritingPolicy({ track = 'technical', docType = '', format = 'markdown', brief = {}, tenant = null, skillText = '', instructions = '' } = {}) {
  const base = TRACK_BASE[track] || TRACK_BASE.technical;
  const dt = DOCTYPE_PROFILES[docType] || { name: docType || 'document', tone: 'clear and professional', requiredSections: [], rules: [] };
  const tcfg = tenant ? j(tenant.config, {}) : {};
  const tenantTerms = Array.isArray(tcfg.terms) ? tcfg.terms.filter((x) => x && x.use) : [];
  const skill = sanitizeCustomText(skillText, 60000);
  const manual = sanitizeCustomText(instructions, 8000);
  return {
    version: 1,
    documentType: docType,
    documentTypeName: dt.name,
    track,
    outputFormat: format,
    styleProfile: (tenant && tenant.guide && tenant.guide !== 'docify') ? tenant.guide : base.styleProfile,
    styleLabel: base.label,
    guideBias: tenant && STYLE_GUIDES[tenant.guide] && tenant.guide !== 'docify' ? STYLE_GUIDES[tenant.guide] : '',
    tenantProfile: tenant ? { name: tenant.name, version: tenant.version } : null,
    voice: { ...base.voice, ...(tenant && tenant.voice ? { formality: tenant.voice } : {}), ...(brief.tone ? { tone: brief.tone } : {}) },
    tone: brief.tone || dt.tone,
    audience: brief.audience || '',
    sentenceRules: base.sentence.rules,
    docTypeRules: dt.rules,
    requiredSections: dt.requiredSections,
    preferredTerms: [
      // Tenant terms take precedence over the defaults they duplicate.
      ...tenantTerms.map((x) => ({ use: x.use, not: Array.isArray(x.not) ? x.not : String(x.not || '').split(',').map((s) => s.trim()).filter(Boolean), safe: false })),
      ...DEFAULT_TERMS.filter((d) => !tenantTerms.some((x) => x.use.toLowerCase() === d.use.toLowerCase()))
    ],
    prohibited: Array.isArray(tcfg.prohibited) ? tcfg.prohibited.filter(Boolean).slice(0, 50) : [],
    tenantNotes: String(tcfg.notes || '').slice(0, 4000),
    customSkillApplied: !!skill.text,
    manualInstructionsApplied: !!manual.text,
    sanitized: { skillFlagged: skill.flagged, manualFlagged: manual.flagged },
    _skillText: skill.text,
    _manualText: manual.text
  };
}

// Deterministic prompt block. Layer ORDER implements precedence: custom rules
// may refine style, but the final NON-OVERRIDABLE block always wins.
export function compileStylePrompt(policy) {
  const p = policy;
  const L = [];
  L.push('WRITING STANDARD — ' + p.styleLabel + ' (' + p.documentTypeName + ')');
  L.push('Voice: ' + Object.values(p.voice).join(', ') + '. Tone for this document: ' + p.tone + '.' + (p.audience ? ' Audience: ' + p.audience + '.' : ''));
  L.push(p.sentenceRules.map((r) => '- ' + r).join('\n'));
  if (p.docTypeRules.length) L.push('Document-type rules:\n' + p.docTypeRules.map((r) => '- ' + r).join('\n'));
  if (p.guideBias) L.push('Organization style-guide preference: ' + p.guideBias + '.');
  if (p.tenantNotes) L.push('Organization writing policy:\n' + p.tenantNotes);
  const terms = p.preferredTerms.slice(0, 20).map((t) => '"' + t.use + '" (never: ' + t.not.join(', ') + ')').join('; ');
  if (terms) L.push('Terminology — use exactly these terms everywhere, including headings and tables: ' + terms + '.');
  if (p.prohibited.length) L.push('Prohibited words (never use): ' + p.prohibited.join(', ') + '.');
  if (p._skillText) L.push('CUSTOM STYLE (from the customer’s skill file — refines the standard above; where it states a style preference, it wins):\n' + p._skillText.slice(0, 12000));
  if (p._manualText) L.push('CUSTOM INSTRUCTIONS (highest style priority):\n' + p._manualText.slice(0, 4000));
  L.push('NON-OVERRIDABLE:\n- Ground every statement in the source material; never invent facts, numbers, or endpoints\n' +
    (p.requiredSections.length ? '- These sections are mandatory and must appear: ' + p.requiredSections.join(', ') + '\n' : '') +
    '- Pick one term per concept and use it consistently through the whole document\n' +
    '- Keep one continuous voice from the first sentence to the last, including inside tables and notes');
  return L.join('\n\n');
}

/* ------------------------------- Style audit ------------------------------- */
const stripCode = (md) => String(md || '').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

export function styleAudit(content, policy) {
  const text = stripCode(content);
  const findings = [];

  // Terminology consistency.
  let termViolations = 0;
  for (const t of policy.preferredTerms) {
    if (!t.match) continue;
    const hits = (text.match(t.match) || []).length;
    t.match.lastIndex = 0;
    if (hits > 0) {
      termViolations++;
      findings.push({
        kind: 'terminology', preferred: t.use, detected: t.not[0], occurrences: hits,
        action: t.safe ? 'Auto-corrected to “' + t.use + '”' : 'Replace with “' + t.use + '”'
      });
    }
  }
  // Prohibited words.
  for (const w of policy.prohibited) {
    const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    const hits = (text.match(re) || []).length;
    if (hits) findings.push({ kind: 'prohibited', preferred: '(remove)', detected: w, occurrences: hits, action: 'Remove or replace — prohibited by your organization policy' });
  }
  // Heading hierarchy: no level jumps.
  const heads = [...String(content || '').matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => ({ level: m[1].length, title: m[2] }));
  let hierarchyJumps = 0;
  for (let i = 1; i < heads.length; i++) {
    if (heads[i].level > heads[i - 1].level + 1) hierarchyJumps++;
  }
  if (hierarchyJumps) findings.push({ kind: 'structure', preferred: 'sequential heading levels', detected: hierarchyJumps + ' level jump(s)', occurrences: hierarchyJumps, action: 'Do not skip heading levels (## → ####)' });
  // Required sections present (fuzzy heading match).
  const headingBlob = heads.map((h) => h.title.toLowerCase()).join(' | ');
  const missing = policy.requiredSections.filter((s) => !headingBlob.includes(s.toLowerCase().split(' ')[0]));
  for (const s of missing) findings.push({ kind: 'structure', preferred: s, detected: 'section missing', occurrences: 1, action: 'Add the mandatory “' + s + '” section' });
  // Sentence length.
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 25);
  const long = sentences.filter((s) => s.split(/\s+/).length > 32);
  if (sentences.length && long.length / sentences.length > 0.12) {
    findings.push({ kind: 'voice', preferred: 'sentences under ~28 words', detected: long.length + ' long sentences', occurrences: long.length, action: 'Split long sentences — global readability suffers past 28 words' });
  }
  // Passive-voice heuristic.
  const passive = (text.match(/\b(?:is|are|was|were|been|being|be)\s+\w+(?:ed|en)\b/g) || []).length;
  const passiveRatio = sentences.length ? passive / sentences.length : 0;
  if (passiveRatio > 0.35) {
    findings.push({ kind: 'voice', preferred: 'active voice', detected: Math.round(passiveRatio * 100) + '% passive constructions', occurrences: passive, action: 'Rewrite passive sentences in active voice' });
  }

  const pct = (bad, scale) => Math.max(40, Math.round(100 - bad * scale));
  const scores = {
    terminology: pct(termViolations + findings.filter((f) => f.kind === 'prohibited').length, 12),
    structure: policy.requiredSections.length ? Math.round(((policy.requiredSections.length - missing.length) / policy.requiredSections.length) * 100) : 100,
    formatting: pct(hierarchyJumps, 15),
    voice: pct((passiveRatio > 0.35 ? 2 : 0) + (sentences.length && long.length / sentences.length > 0.12 ? 2 : 0), 12)
  };
  scores.overall = Math.round((scores.terminology + scores.structure + scores.formatting + scores.voice) / 4);
  return { scores, findings: findings.slice(0, 20) };
}

// Deterministic, meaning-preserving corrections only (safe pairs, outside
// code). Everything else stays a finding for the human to decide.
export function autofixText(md, policy) {
  const parts = String(md || '').split(/(```[\s\S]*?```|`[^`\n]*`)/);
  let fixes = 0;
  const out = parts.map((part, i) => {
    if (i % 2 === 1) return part; // code — never touched
    let p2 = part;
    for (const t of policy.preferredTerms) {
      if (!t.safe || !t.match || !t.replace) continue;
      p2 = p2.replace(t.match, (m) => {
        fixes++;
        return m[0] === m[0].toUpperCase()
          ? t.replace.charAt(0).toUpperCase() + t.replace.slice(1)
          : t.replace;
      });
      t.match.lastIndex = 0;
    }
    return p2;
  }).join('');
  return { text: out, fixes };
}

/* -------------------- Doc sync: match the surrounding style --------------------
   Sample the section a change is spliced into and conform the new lines to
   its conventions — list markers, heading case, bold-lead pattern — plus the
   terminology safe-fixes. Deterministic, so inserts stop reading like a
   different author. */
export function matchSurroundingStyle(newLines, surroundingLines, policy) {
  const around = (surroundingLines || []).join('\n');
  const bulletsDash = (around.match(/^\s*-\s+/gm) || []).length;
  const bulletsStar = (around.match(/^\s*\*\s+/gm) || []).length;
  const marker = bulletsStar > bulletsDash ? '*' : '-';
  const boldLead = (around.match(/^\s*[-*]\s+\*\*[^*]+\*\*/gm) || []).length >= 2;
  const heads = [...around.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1]);
  const titleCase = heads.length >= 2 && heads.every((h) => /^[A-Z]/.test(h) && h.split(' ').filter((w) => w.length > 3).every((w) => /^[A-Z]/.test(w)));

  let out = (newLines || []).map((line) => {
    let l = line;
    // Conform the list marker.
    l = l.replace(/^(\s*)[-*](\s+)/, '$1' + marker + '$2');
    // Bold-lead bullets if the document does that.
    if (boldLead && new RegExp('^\\s*\\' + marker + '\\s+(?!\\*\\*)([A-Z][\\w -]{2,40}):').test(l)) {
      l = l.replace(new RegExp('^(\\s*\\' + marker + '\\s+)([A-Z][\\w -]{2,40}):'), '$1**$2:**');
    }
    // Heading case conformance.
    const hm = l.match(/^(#{1,6}\s+)(.+)$/);
    if (hm) {
      l = hm[1] + (titleCase
        ? hm[2].replace(/\b([a-z])(\w{3,})/g, (m, a, b) => a.toUpperCase() + b)
        : hm[2].charAt(0).toUpperCase() + hm[2].slice(1).replace(/\b([A-Z])(\w+)/g, (m, a, b, off) => (off === 0 ? m : /^(API|SDK|HTTP|URL|ID|CLI|JSON|YAML|OAuth)/.test(m) ? m : a.toLowerCase() + b)));
    }
    return l;
  });
  if (policy) out = out.map((l) => autofixText(l, policy).text);
  return out;
}
