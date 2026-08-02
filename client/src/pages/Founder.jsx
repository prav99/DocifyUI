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

/* Two separate questions per vendor, which an earlier version of this panel
   conflated into one:
     configured — the snippet in index.html carries a real ID, not a placeholder;
     loadedHere — the tag is actually running on THIS page.
   They differ by design. GA4 runs on every route, but Clarity is restricted to
   public marketing pages: the authenticated app renders customer source and
   documentation, which must never reach a session-replay vendor. /founder is an
   app route, so Clarity being absent here is the privacy rule doing its job —
   not a broken install. Reading the snippet text (rather than a loaded global)
   is what makes "configured" answerable from a page the tag never runs on. */
function analyticsStatus() {
  const snippets = [...document.querySelectorAll('script')]
    .map((s) => (s.src || '') + ' ' + (s.textContent || '')).join('\n');
  const configured = (marker, placeholder) => snippets.includes(marker) && !snippets.includes(placeholder);
  return {
    ga: {
      configured: configured('googletagmanager.com/gtag/js?id=', 'GA_MEASUREMENT_ID'),
      loadedHere: typeof window.gtag === 'function'
    },
    clarity: {
      configured: configured('clarity.ms/tag/', 'CLARITY_PROJECT_ID'),
      loadedHere: typeof window.clarity === 'function'
    }
  };
}

/* Dates arrive as ISO strings; a missing one must not render "Invalid Date". */
const stamp = (v, withTime = true) => {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) return 'unknown';
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
};

export default function Founder() {
  usePageMeta({ title: 'Founder metrics', description: 'Business metrics for the account owner.' });
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [an] = useState(analyticsStatus);

  useEffect(() => {
    let live = true;
    api('/admin/metrics')
      .then((d) => { if (live) setData(d); })
      // A network failure and a 403 both land here, so the title stays neutral
      // and the server's own wording carries the reason.
      .catch((e) => { if (live) setErr(e.message || 'Could not reach the server'); });
    return () => { live = false; };
  }, []);

  if (err) {
    return (
      <div className="page page--narrow">
        <h1 className="h04">Founder metrics</h1>
        <div className="mt6"><Notif kind="info" title="Metrics unavailable">{err}</Notif></div>
      </div>
    );
  }
  if (!data) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  // Defaults so a partial payload degrades to zeros instead of a blank screen.
  const c = data.customers || {}, p = data.product || {}, wl = data.waitlist || {};
  const n = (v) => (typeof v === 'number' ? v : 0);
  const signups = c.signupsByDay || [], recentUsers = c.recent || [], waitlistRecent = wl.recent || [];

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <div className="row row--between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="h04">Founder metrics</h1>
          <p className="body01 t2 mt3">Only you can see this page. Data as of {stamp(data.generatedAt)}.</p>
        </div>
        <button className="btn btn--tertiary btn--field" onClick={() => window.location.reload()}>Refresh</button>
      </div>

      {/* ---------- 1 · Customers ---------- */}
      <h2 className="h02 mt7 mb5">Customers</h2>
      <div className="grid4">
        <Stat label="Accounts created" num={n(c.total)} helper={n(c.new7d) + ' new in the last 7 days'} kind="info" />
        <Stat label="Tried the product" num={n(c.activated)} helper="Generated a doc, pipeline, or doc sync" kind={c.activated ? 'good' : 'warn'} />
        <Stat label="Verified emails" num={n(c.verified)} helper={n(c.viaOauth) + ' signed up with Google/GitHub/GitLab'} kind={c.verified ? 'good' : 'warn'} />
        <Stat label="On a paid plan" num={n(c.paying)} helper="Plan other than free" kind={c.paying ? 'good' : 'warn'} />
      </div>

      <div className="grid2 mt5">
        <div className="tile tile--white" style={{ padding: 20 }}>
          <p className="label01 t2 mb3">SIGNUPS — LAST 14 DAYS</p>
          {signups.length === 0
            ? <p className="body01 t2">No signup history yet.</p>
            : <Spark series={signups} />}
        </div>
        <div className="tile tile--white" style={{ padding: 20 }}>
          <p className="label01 t2 mb3">WAITLIST ({n(wl.total)})</p>
          {waitlistRecent.length === 0
            ? <p className="body01 t2">No waitlist entries yet — these come from “coming soon” sources on the signup page.</p>
            : waitlistRecent.map((w) => (
              <p key={w.id} className="body01" style={{ padding: '4px 0', borderBottom: '1px solid var(--layer-01)' }}>
                <span className="mono" style={{ fontSize: 13 }}>{w.email}</span>
                <span className="t2"> — wants {w.provider || 'a source'} · {stamp(w.createdAt, false)}</span>
              </p>
            ))}
          {wl.total > waitlistRecent.length && (
            <p className="helper mt3">Showing the {waitlistRecent.length} most recent of {n(wl.total)}.</p>
          )}
        </div>
      </div>

      <h3 className="h01 mt6 mb3">Latest signups</h3>
      {recentUsers.length === 0 ? <p className="body01 t2">No customers yet.</p> : (
        <table className="dtable">
          <thead><tr><th>EMAIL</th><th>PLAN</th><th>VERIFIED</th><th>VIA</th><th>JOINED</th></tr></thead>
          <tbody>
            {recentUsers.map((u) => (
              <tr key={u.email + u.createdAt}>
                <td className="mono" style={{ fontSize: 13 }}>{u.email}</td>
                <td><span className="tag tag--outline">{u.plan || 'free'}</span></td>
                <td>{u.emailVerified ? <span className="tag tag--green">yes</span> : <span className="tag tag--amber">no</span>}</td>
                <td className="t2">{u.oauthProvider || 'email'}</td>
                <td className="t2">{stamp(u.createdAt, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ---------- 2 · Product usage ---------- */}
      <h2 className="h02 mt7 mb5">Product usage</h2>
      <div className="grid4">
        <Stat label="Documents generated" num={n(p.generationsTotal)}
          helper={n(p.generations7d) + ' in the last 7 days · '
            + (p.generationsComplete ? 'avg score ' + n(p.avgScore) + ' across ' + n(p.generationsComplete) + ' completed' : 'none completed yet')}
          kind={p.generationsTotal ? 'good' : 'warn'} />
        <Stat label="Automation pipelines" num={n(p.pipelines)} helper={n(p.pipelinesActive) + ' active · ' + n(p.pipelineRuns) + ' total runs'} kind={p.pipelinesActive ? 'good' : 'warn'} />
        <Stat label="Doc sync baselines" num={n(p.syncDocs)} helper={n(p.syncUpdates) + ' AI updates · ' + n(p.syncApproved) + ' approved'} kind={p.syncDocs ? 'good' : 'warn'} />
        <Stat label="Connected sources" num={n(p.connectedSources)}
          helper={Object.entries(p.sourcesByProvider || {}).map(([k, v]) => k + ' ' + v).join(' · ') || 'None yet'} kind="info" />
      </div>

      {/* ---------- 3 · Website traffic ---------- */}
      <h2 className="h02 mt7 mb5">Website visitors</h2>
      <p className="body01 t2 mb5">
        Visitor counts live in the vendors' own consoles — Docify does not read them back, so this
        section reports how each tag is installed, not how many people visited.
      </p>
      <div className="grid2">
        <div className="tile tile--white" style={{ padding: 20 }}>
          <p className="body01"><b>Google Analytics 4 — {an.ga.configured ? 'configured' : 'not configured'}</b></p>
          {an.ga.configured ? (
            <>
              <p className="helper mt2">
                Counts visitors, traffic sources, pages and button clicks on every route, this one included.
                {an.ga.loadedHere ? '' : ' The tag did not initialise in this browser, which normally means an ad-blocker — visits from other browsers are still counted.'}
              </p>
              <a className="btn btn--tertiary btn--sm btn--center mt5" href="https://analytics.google.com" target="_blank" rel="noreferrer">Open GA4 →</a>
            </>
          ) : (
            <p className="helper mt2">
              The snippet in <span className="mono">client/index.html</span> still carries{' '}
              <span className="mono">GA_MEASUREMENT_ID</span>, so nothing is being counted. Create a free
              property at analytics.google.com, paste the ID in and redeploy — walkthrough in{' '}
              <span className="mono">docs/ANALYTICS-SETUP.md</span>.
            </p>
          )}
        </div>
        <div className="tile tile--white" style={{ padding: 20 }}>
          <p className="body01"><b>Microsoft Clarity — {an.clarity.configured ? 'configured' : 'not configured'}</b></p>
          {an.clarity.configured ? (
            <>
              <p className="helper mt2">
                Heatmaps and session replay on the public marketing pages only. It is deliberately not
                loaded inside the app — this dashboard included — so customer code and documentation are
                never recorded. Its absence on this page is that rule working, not a broken install.
                {an.clarity.loadedHere ? ' Warning: it IS running on this page, which the route filter in index.html should have prevented.' : ''}
              </p>
              <a className="btn btn--tertiary btn--sm btn--center mt5" href="https://clarity.microsoft.com" target="_blank" rel="noreferrer">Open Clarity →</a>
            </>
          ) : (
            <p className="helper mt2">
              The snippet in <span className="mono">client/index.html</span> still carries{' '}
              <span className="mono">CLARITY_PROJECT_ID</span>, so no sessions are being recorded. Create a
              free project at clarity.microsoft.com, paste the ID in and redeploy — walkthrough in{' '}
              <span className="mono">docs/ANALYTICS-SETUP.md</span>.
            </p>
          )}
        </div>
      </div>
      {(!an.ga.configured || !an.clarity.configured) && (
        <div className="mt5">
          <Notif kind="warning" title="Visitor tracking is not fully configured">
            Numbers will be incomplete until both snippets in <span className="mono">client/index.html</span>{' '}
            carry a real ID and the site is redeployed. Walkthrough:{' '}
            <span className="mono">docs/ANALYTICS-SETUP.md</span>.
          </Notif>
        </div>
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
