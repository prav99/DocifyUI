import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Notif } from '../ui.jsx';
import { usePageMeta } from '../seo.js';

/* =========================================================================
   Founder dashboard — the business view, restricted to the account owner.
   Three questions, answered in order:
     1. How many customers tried the product?   (live, from the database)
     2. How many people visit the website?      (GA4 / Clarity — links + setup)
     3. Is Google indexing the site?            (Search Console checklist)
   ========================================================================= */

const SITE = 'https://docifydocai.com';

function Stat({ label, num, helper, kind = 'info' }) {
  return (
    <div className={'score score--' + kind}>
      <span className="label01 t2">{label}</span>
      <span className="num">{num}</span>
      <span className="helper">{helper}</span>
    </div>
  );
}

/* 14-day signup bar chart — pure divs, no library. */
function Spark({ series }) {
  const max = Math.max(1, ...series.map((s) => s.count));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 96 }}>
        {series.map((s) => (
          <div key={s.day} title={s.day + ' — ' + s.count + ' signup' + (s.count === 1 ? '' : 's')}
            style={{
              flex: 1,
              height: Math.max(3, Math.round((s.count / max) * 96)),
              background: s.count ? 'var(--button-primary)' : 'var(--border-subtle)',
              transition: 'height .2s'
            }} />
        ))}
      </div>
      <div className="row row--between mt2">
        <span className="helper">{series[0] && series[0].day}</span>
        <span className="helper">today</span>
      </div>
    </div>
  );
}

/* Detects whether the GA4 / Clarity snippets still carry placeholder IDs. */
function analyticsConfigured() {
  const scripts = [...document.querySelectorAll('script')];
  const ga = scripts.some((s) => (s.src || '').includes('googletagmanager.com') && !(s.src || '').includes('GA_MEASUREMENT_ID'));
  const clarity = scripts.some((s) => (s.src || '').includes('clarity.ms') && !(s.src || '').includes('CLARITY_PROJECT_ID'));
  return { ga, clarity };
}

export default function Founder() {
  usePageMeta({ title: 'Founder metrics', description: 'Business metrics for the account owner.' });
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [an] = useState(analyticsConfigured);

  useEffect(() => {
    api('/admin/metrics').then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) {
    return (
      <div className="page page--narrow">
        <h1 className="h04">Founder metrics</h1>
        <div className="mt6"><Notif kind="info" title="Restricted page">{err}</Notif></div>
      </div>
    );
  }
  if (!data) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  const c = data.customers, p = data.product;

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <div className="row row--between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="h04">Founder metrics</h1>
          <p className="body01 t2 mt3">Only you can see this page. Data as of {new Date(data.generatedAt).toLocaleString()}.</p>
        </div>
        <button className="btn btn--tertiary btn--field" onClick={() => window.location.reload()}>Refresh</button>
      </div>

      {/* ---------- 1 · Customers ---------- */}
      <h2 className="h02 mt7 mb5">Customers</h2>
      <div className="grid4">
        <Stat label="Accounts created" num={c.total} helper={c.new7d + ' new in the last 7 days'} kind="info" />
        <Stat label="Tried the product" num={c.activated} helper="Generated a doc, pipeline, or doc sync" kind={c.activated ? 'good' : 'warn'} />
        <Stat label="Verified emails" num={c.verified} helper={c.viaOauth + ' signed up via GitHub/GitLab'} kind="good" />
        <Stat label="On a paid plan" num={c.paying} helper="Plan other than free" kind={c.paying ? 'good' : 'warn'} />
      </div>

      <div className="grid2 mt5">
        <div className="tile tile--white" style={{ padding: 20 }}>
          <p className="label01 t2 mb3">SIGNUPS — LAST 14 DAYS</p>
          <Spark series={c.signupsByDay} />
        </div>
        <div className="tile tile--white" style={{ padding: 20 }}>
          <p className="label01 t2 mb3">WAITLIST ({data.waitlist.total})</p>
          {data.waitlist.recent.length === 0
            ? <p className="body01 t2">No waitlist entries yet — these come from “coming soon” sources on the signup page.</p>
            : data.waitlist.recent.map((w) => (
              <p key={w.id} className="body01" style={{ padding: '4px 0', borderBottom: '1px solid var(--layer-01)' }}>
                <span className="mono" style={{ fontSize: 13 }}>{w.email}</span>
                <span className="t2"> — wants {w.provider} · {new Date(w.createdAt).toLocaleDateString()}</span>
              </p>
            ))}
        </div>
      </div>

      <h3 className="h01 mt6 mb3">Latest signups</h3>
      {c.recent.length === 0 ? <p className="body01 t2">No customers yet.</p> : (
        <table className="dtable">
          <thead><tr><th>EMAIL</th><th>PLAN</th><th>VERIFIED</th><th>VIA</th><th>JOINED</th></tr></thead>
          <tbody>
            {c.recent.map((u) => (
              <tr key={u.email + u.createdAt}>
                <td className="mono" style={{ fontSize: 13 }}>{u.email}</td>
                <td><span className="tag tag--outline">{u.plan || 'free'}</span></td>
                <td>{u.emailVerified ? <span className="tag tag--green">yes</span> : <span className="tag tag--amber">no</span>}</td>
                <td className="t2">{u.oauthProvider || 'email'}</td>
                <td className="t2">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ---------- 2 · Product usage ---------- */}
      <h2 className="h02 mt7 mb5">Product usage</h2>
      <div className="grid4">
        <Stat label="Documents generated" num={p.generationsTotal} helper={p.generations7d + ' in the last 7 days · avg score ' + p.avgScore} kind="good" />
        <Stat label="Automation pipelines" num={p.pipelines} helper={p.pipelinesActive + ' active · ' + p.pipelineRuns + ' total runs'} kind={p.pipelinesActive ? 'good' : 'warn'} />
        <Stat label="Doc sync baselines" num={p.syncDocs} helper={p.syncUpdates + ' AI updates · ' + p.syncApproved + ' approved'} kind="good" />
        <Stat label="Connected sources" num={p.connectedSources}
          helper={Object.entries(p.sourcesByProvider).map(([k, v]) => k + ' ' + v).join(' · ') || 'None yet'} kind="info" />
      </div>

      {/* ---------- 3 · Website traffic ---------- */}
      <h2 className="h02 mt7 mb5">Website visitors</h2>
      {an.ga && an.clarity ? (
        <div className="grid2">
          <div className="tile tile--white" style={{ padding: 20 }}>
            <p className="body01"><b>Google Analytics is live.</b></p>
            <p className="helper mt2">Visitors, traffic sources, pages, and every button click.</p>
            <a className="btn btn--tertiary btn--sm btn--center mt5" href="https://analytics.google.com" target="_blank" rel="noreferrer">Open GA4 →</a>
          </div>
          <div className="tile tile--white" style={{ padding: 20 }}>
            <p className="body01"><b>Microsoft Clarity is live.</b></p>
            <p className="helper mt2">Session recordings and click heatmaps.</p>
            <a className="btn btn--tertiary btn--sm btn--center mt5" href="https://clarity.microsoft.com" target="_blank" rel="noreferrer">Open Clarity →</a>
          </div>
        </div>
      ) : (
        <Notif kind="warning" title="Visitor tracking is not active yet">
          The tracking code is installed but still has placeholder IDs, so no visits are being counted.
          Create a free Google Analytics 4 property (analytics.google.com) and a Microsoft Clarity project
          (clarity.microsoft.com), then replace <span className="mono">GA_MEASUREMENT_ID</span> and{' '}
          <span className="mono">CLARITY_PROJECT_ID</span> in <span className="mono">client/index.html</span> and redeploy.
          Full walkthrough: <span className="mono">docs/ANALYTICS-SETUP.md</span> in your repository.
        </Notif>
      )}

      {/* ---------- 4 · Google indexing ---------- */}
      <h2 className="h02 mt7 mb5">Google indexing</h2>
      <div className="grid2">
        <div className="tile tile--white" style={{ padding: 20 }}>
          <p className="label01 t2 mb3">READY ON YOUR SITE</p>
          <p className="body01" style={{ padding: '4px 0' }}>✓ <a href={SITE + '/sitemap.xml'} target="_blank" rel="noreferrer">sitemap.xml</a> — all public pages listed</p>
          <p className="body01" style={{ padding: '4px 0' }}>✓ <a href={SITE + '/robots.txt'} target="_blank" rel="noreferrer">robots.txt</a> — app screens excluded, sitemap referenced</p>
          <p className="body01" style={{ padding: '4px 0' }}>✓ Per-page titles, descriptions &amp; canonical URLs (server-injected for crawlers)</p>
        </div>
        <div className="tile tile--white" style={{ padding: 20 }}>
          <p className="label01 t2 mb3">ONE-TIME SETUP (YOUR GOOGLE ACCOUNT)</p>
          <p className="body01 t2" style={{ lineHeight: 1.6 }}>
            1. Open <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Google Search Console</a> and add the property <span className="mono">docifydocai.com</span>.<br />
            2. Verify via DNS (add the TXT record where your domain is registered).<br />
            3. Sitemaps → submit <span className="mono">{SITE}/sitemap.xml</span>.<br />
            4. Indexing typically starts within days; track it under Pages.
          </p>
          <a className="btn btn--tertiary btn--sm btn--center mt5"
            href={'https://www.google.com/search?q=site:docifydocai.com'} target="_blank" rel="noreferrer">
            Check current status: site:docifydocai.com →
          </a>
        </div>
      </div>
    </div>
  );
}
