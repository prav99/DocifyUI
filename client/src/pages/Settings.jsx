import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { toast } from '../store.jsx';
import { NavBar, SrcMark, HelpLink } from '../ui.jsx';

export default function Settings() {
  const nav = useNavigate();
  const [tab, setTab] = useState('sources');
  const [sources, setSources] = useState([]);
  const [members, setMembers] = useState([]);
  const [billing, setBilling] = useState(null);
  const [invEmail, setInvEmail] = useState('');

  useEffect(() => {
    api('/sources').then((d) => setSources(d.sources)).catch(() => {});
    api('/team').then((d) => setMembers(d.members)).catch(() => {});
    api('/billing').then(setBilling).catch(() => {});
  }, []);

  async function invite() {
    if (!invEmail.includes('@')) return toast('error', 'Enter a valid email', 'An address is required to send an invite');
    try {
      const d = await api('/team/invite', { method: 'POST', body: { email: invEmail } });
      setMembers((m) => [...m, d.member]);
      toast('success', 'Invite sent', invEmail + ' will receive an email shortly');
      setInvEmail('');
    } catch (e) { toast('error', 'Invite failed', e.message); }
  }

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 className="h04">Team &amp; settings</h1>
          <HelpLink topic="settings" />
        </div>
        <div className="tabs mt7">
          {[['sources', 'Connected sources'], ['team', 'Team'], ['billing', 'Billing']].map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === 'sources' && (
          <div className="stack" style={{ maxWidth: 720 }}>
            {sources.length === 0 && <p className="body01 t2">No sources connected yet.</p>}
            {sources.map((s) => (
              <div key={s.id} className="tile tile--white row row--between" style={{ padding: '16px 24px' }}>
                <div className="row">
                  <SrcMark id={s.provider} />
                  <div>
                    <p className="h01">{s.provider.charAt(0).toUpperCase() + s.provider.slice(1)}</p>
                    <p className="helper mono">{s.detail}</p>
                  </div>
                </div>
                <div className="row">
                  {s.connected
                    ? <span className="tag tag--green">Connected</span>
                    : <span className="tag tag--gray">No credentials on file</span>}
                </div>
              </div>
            ))}
            <button className="btn btn--tertiary" onClick={() => nav('/source')}>Connect another source<span className="ico">+</span></button>
          </div>
        )}

        {tab === 'team' && (
          <>
            <table className="dtable" style={{ maxWidth: 720 }}>
              <thead><tr><th>NAME</th><th>EMAIL</th><th>ROLE</th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className={m.status === 'invited' ? 't2' : ''}>{m.status === 'invited' ? 'Pending' : m.name}</td>
                    <td className="mono" style={{ fontSize: 13 }}>{m.email}</td>
                    <td>
                      <span className={'tag ' + (m.role === 'Owner' ? 'tag--purple' : m.status === 'invited' ? 'tag--amber' : 'tag--gray')}>
                        {m.status === 'invited' ? 'Invited' : m.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row mt6" style={{ maxWidth: 720, alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <label htmlFor="invEmail">Invite by email</label>
                <input id="invEmail" className="input" type="email" placeholder="teammate@company.com"
                  value={invEmail} onChange={(e) => setInvEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && invite()} />
              </div>
              <button className="btn btn--primary btn--field" onClick={invite}>Send invite</button>
            </div>
          </>
        )}

        {tab === 'billing' && billing && (
          <div className="tile tile--white" style={{ padding: 24, maxWidth: 560 }}>
            <div className="row row--between">
              <h2 className="h02">Current plan</h2>
              <span className={'tag ' + (billing.plan === 'team' ? 'tag--blue' : 'tag--gray')}>
                {billing.plan.charAt(0).toUpperCase() + billing.plan.slice(1)}
              </span>
            </div>
            {billing.plan === 'team' ? (
              <>
                <p className="body01 mt5">{billing.seats} seats · billed {billing.cycle === 'annual' ? 'annually' : 'monthly'}</p>
                <div className="row row--between mt3"><span className="body01 t2">Next invoice</span><span className="mono">{billing.nextInvoice}</span></div>
                <div className="row row--between mt3"><span className="body01 t2">Amount</span><span className="mono">${billing.amount.toLocaleString()}</span></div>
              </>
            ) : (
              <>
                <p className="body01 mt5 t2">5 watermarked generations per month, 1 source, PDF and Word only.</p>
                <button className="btn btn--primary mt5" onClick={() => nav('/pricing')}>Upgrade to Team<span className="ico">→</span></button>
              </>
            )}
          </div>
        )}
      </div>
      <NavBar back="/automation" />
    </>
  );
}
