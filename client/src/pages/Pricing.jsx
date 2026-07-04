import React from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFlow, useAuth, toast } from '../store.jsx';
import { NavBar } from '../ui.jsx';

const ROWS = [
  ['Sources', '1 source', 'All sources', 'All sources'],
  ['Generations', '5 / month, watermarked', 'Unlimited', 'Unlimited'],
  ['Output formats', 'PDF, Word only', 'All formats', 'All formats'],
  ['Quality checks', 'Overview only', 'Full pipeline + AI judge', 'Full pipeline + AI judge'],
  ['CI/CD automation', '—', 'Included', 'Included'],
  ['Custom style-guide rules', '—', '—', 'Included'],
  ['SSO (SAML / OIDC)', '—', '—', 'Included'],
  ['Audit logs', '—', '—', 'Included'],
  ['Support', 'Community', 'Business hours', 'Dedicated + SLA']
];

export default function Pricing() {
  const nav = useNavigate();
  const { flow, setFlow } = useFlow();
  const { user } = useAuth();
  const annual = flow.billing === 'annual';
  const teamPrice = annual ? 26 : 32;

  async function choose(plan) {
    setFlow({ plan });
    if (plan === 'team') return nav(user ? '/checkout' : '/signup');
    if (plan === 'free') {
      if (user) { try { await api('/billing/checkout', { method: 'POST', body: { plan: 'free' } }); } catch { /* ignore */ } }
      toast('info', 'Staying on Free', '5 watermarked generations per month');
      return nav(user ? '/dashboard' : '/signup');
    }
    toast('info', 'Request sent', 'Our enterprise team will reach out within one business day');
  }

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="h04">Pricing</h1>
            <p className="body01 t2 mt3">Start free. Upgrade when the whole team wants their docs to write themselves.</p>
          </div>
          <div className="row" style={{ gap: 0 }}>
            <button className={'chip' + (!annual ? ' on' : '')} onClick={() => setFlow({ billing: 'monthly' })}>Monthly</button>
            <button className={'chip' + (annual ? ' on' : '')} onClick={() => setFlow({ billing: 'annual' })}>Annual · save 20%</button>
          </div>
        </div>

        <div className="scrollx mt7">
        <div className="pricegrid">
          <div className="phead"><span className="label01 t2">PLANS</span></div>
          <div className="phead">
            <p className="h02">Free</p><p className="h04 mono">$0</p><p className="helper">Per user, forever</p>
            <button className="btn btn--tertiary btn--field mt3" style={{ width: '100%' }} onClick={() => choose('free')}>Stay on Free</button>
          </div>
          <div className="phead pop">
            <div className="row row--between" style={{ width: '100%' }}>
              <p className="h02">Team</p><span className="tag tag--blue">Most popular</span>
            </div>
            <p className="h04 mono">${teamPrice}</p>
            <p className="helper">Per user / month, billed {annual ? 'annually' : 'monthly'}</p>
            <button className="btn btn--primary btn--field mt3" style={{ width: '100%' }} onClick={() => choose('team')}>Choose Team</button>
          </div>
          <div className="phead">
            <p className="h02">Enterprise</p><p className="h04 mono">Custom</p><p className="helper">Annual contract</p>
            <button className="btn btn--tertiary btn--field mt3" style={{ width: '100%' }} onClick={() => choose('enterprise')}>Contact us</button>
          </div>
          {ROWS.map((r) => (
            <React.Fragment key={r[0]}>
              <div className="rowlabel">{r[0]}</div><div>{r[1]}</div><div>{r[2]}</div><div>{r[3]}</div>
            </React.Fragment>
          ))}
        </div>
        </div>
      </div>
      <NavBar back="/export" next={user ? '/checkout' : '/signup'} nextLabel="Continue to checkout"
        note={'Team plan · billed ' + (annual ? 'annually' : 'monthly')} />
    </>
  );
}
