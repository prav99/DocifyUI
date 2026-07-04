// Static product catalog. Single source of truth served to the client at /api/catalog.

export const SOURCES = [
  { id: 'github', name: 'GitHub', desc: 'Repositories, READMEs, code comments, commit history', avail: true },
  { id: 'gitlab', name: 'GitLab', desc: 'Projects, wikis, merge request context', avail: true },
  { id: 'bitbucket', name: 'Bitbucket', desc: 'Repositories and pipelines metadata', avail: true },
  { id: 'jira', name: 'Jira', desc: 'Issues, epics, release versions for changelogs', avail: true },
  { id: 'openapi', name: 'OpenAPI / Swagger', desc: 'Spec-first API reference generation', avail: false },
  { id: 'confluence', name: 'Confluence', desc: 'Existing pages as source material', avail: false },
  { id: 'notion', name: 'Notion', desc: 'Docs and databases as source material', avail: false },
  { id: 'azdo', name: 'Azure DevOps', desc: 'Repos, boards, and wikis', avail: false }
];

export const DOCTYPES = {
  technical: [
    { id: 'api', name: 'API reference', desc: 'Endpoints, parameters, schemas, auth, examples', common: true },
    { id: 'userguide', name: 'User guide', desc: 'Task-oriented walkthroughs for end users', common: true },
    { id: 'install', name: 'Installation & setup guide', desc: 'Prerequisites, environments, first run', common: true },
    { id: 'quickstart', name: 'Quick start guide', desc: 'Zero to first successful call in one page', common: false },
    { id: 'troubleshoot', name: 'Troubleshooting & FAQ', desc: 'Known errors, causes, and resolutions', common: false },
    { id: 'relnotes', name: 'Release notes / changelog', desc: 'What changed, per version, from commits and issues', common: false },
    { id: 'admin', name: 'Admin & configuration guide', desc: 'Config reference, permissions, deployment options', common: false }
  ],
  marketing: [
    { id: 'announce', name: 'Release announcement', desc: 'Blog-ready announcement of a release', common: false },
    { id: 'onepager', name: 'Feature one-pager', desc: 'Single-page benefit-led feature summary', common: true },
    { id: 'social', name: 'Social / launch copy', desc: 'Short-form posts for a launch moment', common: false },
    { id: 'custlog', name: 'Customer-facing changelog', desc: 'Plain-language what is new page', common: false }
  ]
};

export const FORMATS = {
  technical: [
    { id: 'dita', name: 'DITA', desc: 'Topic-based XML for enterprise pipelines', ok: true, ext: '.dita' },
    { id: 'pdf', name: 'PDF', desc: 'Print-ready, paginated output', ok: true, ext: '.pdf.txt' },
    { id: 'word', name: 'Word', desc: '.docx for review workflows', ok: true, ext: '.docx.txt' },
    { id: 'markdown', name: 'Markdown', desc: 'Repo-native docs, static site ready', ok: true, ext: '.md' },
    { id: 'html', name: 'HTML / Web Help', desc: 'Hosted help center output', ok: false, ext: '.html' },
    { id: 'docbook', name: 'DocBook XML', desc: 'Legacy publishing toolchains', ok: false, ext: '.xml' },
    { id: 'epub', name: 'ePub', desc: 'Offline reader distribution', ok: false, ext: '.epub' }
  ],
  marketing: [
    { id: 'pdf', name: 'PDF', desc: 'Shareable one-pagers and briefs', ok: true, ext: '.pdf.txt' },
    { id: 'word', name: 'Word', desc: '.docx for stakeholder edits', ok: true, ext: '.docx.txt' },
    { id: 'markdown', name: 'Markdown', desc: 'CMS-ready copy blocks', ok: true, ext: '.md' },
    { id: 'htmlsnip', name: 'HTML landing snippet', desc: 'Drop-in landing page section', ok: false, ext: '.html' },
    { id: 'socialpack', name: 'Social post pack', desc: 'Sized variants per channel', ok: false, ext: '.zip' },
    { id: 'pptx', name: 'Slide deck (PPTX)', desc: 'Launch deck starter', ok: false, ext: '.pptx' },
    { id: 'email', name: 'Email / newsletter', desc: 'Announcement email HTML', ok: false, ext: '.html' }
  ]
};

export const PLANS = {
  free: { id: 'free', name: 'Free', monthly: 0, annual: 0 },
  team: { id: 'team', name: 'Team', monthly: 32, annual: 26 },
  enterprise: { id: 'enterprise', name: 'Enterprise', monthly: null, annual: null }
};

export const CI_YAML = [
  'name: docgen-regenerate',
  'on:',
  '  push:',
  '    branches: [main]',
  '',
  'jobs:',
  '  regenerate-docs:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v4',
  '      - name: Regenerate documentation',
  '        uses: docgen/generate-action@v2',
  '        with:',
  '          api-key: ${{ secrets.DOCGEN_API_KEY }}',
  '          project: payments-api-reference',
  '          formats: dita,markdown',
  '          quality-gate: 85',
  '      - name: Upload quality report',
  '        uses: actions/upload-artifact@v4',
  '        with:',
  '          name: docgen-quality-report',
  '          path: .docgen/report.html'
].join('\n');

export function docTypeName(track, id) {
  const list = DOCTYPES[track] || [];
  const hit = list.find((d) => d.id === id);
  return hit ? hit.name : 'API reference';
}

export function formatDef(track, id) {
  const list = FORMATS[track] || [];
  return list.find((f) => f.id === id) || null;
}
