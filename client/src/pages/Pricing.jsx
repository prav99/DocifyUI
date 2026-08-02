import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFlow, useAuth, toast } from '../store.jsx';
import { NavBar, HelpLink } from '../ui.jsx';
import { usePageMeta } from '../seo.js';
import posthog from '../posthog.js';

// [label, Free, Starter, Team, Enterprise]
const ROWS = [
  ['Seats included', '1', '2', '5 · then $12/seat/mo', 'Custom'],
  ['Sources', '1 source', 'All sources', 'All sources', 'All sources'],
  ['Documents / month', '5, watermarked', '60', '250 pooled', 'Custom'],
  ['Automation pipelines', '—', '1', '10', 'Unlimited'],
  ['Export formats', 'PDF + Word', 'All except DITA', 'Every format incl. DITA', 'Every format incl. DITA'],
  ['AI quality pipeline', 'Overview only', 'Full pipeline', 'Full pipeline', 'Full pipeline + custom style-guide rules'],
  ['AI search readiness', 'Score on 1 document', 'Included', 'Included', 'Included'],
  ['Usage analytics', '—', '—', 'Included', 'Included'],
  // Not built yet — "On request" is the honest label until they ship. Do not
  // change these to "Included" before the code exists.
  ['SSO (SAML / OIDC)', '—', '—', '—', 'On request'],
  ['Audit logs', '—', '—', '—', 'On request'],
  ['Support', 'Community', 'Email', 'Priority', 'Dedicated · DPA + SLA · invoicing/PO']
];

// The .pricegrid class is 4 columns; these inline rules extend it to 5
// without touching styles.css (its nth-child(4n) border rule no longer lines up).
const GRID5 = { gridTemplateColumns: '200px repeat(4, 1fr)', minWidth: 880 };
const CELL = { borderRight: '1px solid var(--border-subtle)' };
const CELL_LAST = { borderRight: 'none' };

export default function Pricing() {
  usePageMeta({
    title: 'Pricing — Free, Starter, Team & Enterprise',
    description: 'Start free with 5 generations a month, no credit card. Starter from $24 and Team from $79 per month; online payment is not live yet, so paid plans are set up by our team. Enterprise adds custom style-guide rules and a DPA (SSO and audit logs on request).',
    path: '/pricing'
  });
  const nav = useNavigate();
  const { flow, setFlow } = useFlow();
  const { user } = useAuth();
  const annual = flow.billing === 'annual';
  const starterPrice = annual ? 24 : 29;
  const teamPrice = annual ? 79 : 99;
  const paidPlan = flow.plan === 'starter' ? 'Starter' : 'Team';

  async function choose(plan) {
    setFlow({ plan });
    posthog.capture('plan_selected', { plan, billing_cycle: annual ? 'annual' : 'monthly' });
    // Online payment is not live — the server's /billing/checkout fails closed
    // rather than granting a plan, so a paid plan starts as a conversation.
    if (plan === 'starter' || plan === 'team') return nav('/contact?topic=' + plan);
    if (plan === 'free') {
      if (user) { try { await api('/billing/checkout', { method: 'POST', body: { plan: 'free' } }); } catch { /* ignore */ } }
      toast('info', 'Staying on Free', '5 watermarked generations per month');
      return nav(user ? '/dashboard' : '/signup');
    }
    if (plan === 'enterprise') return nav('/contact?topic=enterprise');
  }

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="row" style={{ alignItems: 'baseline', gap: 16 }}>
              <h1 className="h04">Pricing</h1>
              <HelpLink topic="pricing" />
            </div>
            <p className="body01 t2 mt3">Start free. Upgrade when the whole team wants their docs to write themselves.</p>
          </div>
          <div className="row" style={{ gap: 0 }}>
            <button className={'chip' + (!annual ? ' on' : '')} onClick={() => setFlow({ billing: 'monthly' })}>Monthly</button>
            <button className={'chip' + (annual ? ' on' : '')} onClick={() => setFlow({ billing: 'annual' })}>Annual · save 20%</button>
          </div>
        </div>

        <div className="scrollx mt7">
        <div className="pricegrid" style={GRID5}>
          <div className="phead" style={CELL}><span className="label01 t2">PLANS</span></div>
          <div className="phead" style={CELL}>
            <p className="h02">Free</p><p className="h04 mono">$0</p><p className="helper">Forever · 1 source</p>
            <button className="btn btn--tertiary btn--field mt3" style={{ width: '100%' }} onClick={() => choose('free')}>Start free</button>
          </div>
          <div className="phead" style={CELL}>
            <p className="h02">Starter</p>
            <p className="h04 mono">${starterPrice}</p>
            <p className="helper">Per month, billed {annual ? 'annually' : 'monthly'} · 2 seats</p>
            <button className="btn btn--tertiary btn--field mt3" style={{ width: '100%' }} onClick={() => choose('starter')}>Contact us to subscribe</button>
          </div>
          <div className="phead pop" style={CELL}>
            <div className="row row--between" style={{ width: '100%' }}>
              <p className="h02">Team</p><span className="tag tag--blue">Most popular</span>
            </div>
            <p className="h04 mono">${teamPrice}</p>
            <p className="helper">Per month, billed {annual ? 'annually' : 'monthly'} · includes 5 seats, then $12/seat/mo</p>
            <button className="btn btn--primary btn--field mt3" style={{ width: '100%' }} onClick={() => choose('team')}>Contact us to subscribe</button>
          </div>
          <div className="phead" style={CELL_LAST}>
            <p className="h02">Enterprise</p><p className="h04 mono">Custom</p><p className="helper">Annual contract</p>
            <button className="btn btn--tertiary btn--field mt3" style={{ width: '100%' }} onClick={() => choose('enterprise')}>Talk to us</button>
          </div>
          {ROWS.map((r) => (
            <React.Fragment key={r[0]}>
              <div className="rowlabel" style={CELL}>{r[0]}</div>
              <div style={CELL}>{r[1]}</div>
              <div style={CELL}>{r[2]}</div>
              <div style={CELL}>{r[3]}</div>
              <div style={CELL_LAST}>{r[4]}</div>
            </React.Fragment>
          ))}
        </div>
        </div>

        <div className="row mt5" style={{ gap: 24, flexWrap: 'wrap' }}>
          <span className="helper">Free plan — 5 documents a month, no credit card</span>
          <span className="helper">Online payment is not live yet — we set paid plans up directly</span>
          <span className="helper">Switch back to Free at any time · read-only access · your source is never stored</span>
        </div>
      </div>
      <NavBar back="/export" next={'/contact?topic=' + (flow.plan === 'starter' ? 'starter' : 'team')}
        nextLabel="Contact us to subscribe"
        note={paidPlan + ' plan · billed ' + (annual ? 'annually' : 'monthly')} />
    </>
  );
}
