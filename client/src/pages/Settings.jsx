import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { toast, useAuth } from '../store.jsx';
import { NavBar, SrcMark, HelpLink } from '../ui.jsx';
import { GoogleG } from './Auth.jsx';

export default function Settings() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  // /settings#account deep-links the security tab — where the Google linking
  // round-trip returns to.
  const [tab, setTab] = useState(() => (window.location.hash === '#account' ? 'account' : 'sources'));
  const [sources, setSources] = useState([]);
  const [members, setMembers] = useState([]);
  const [billing, setBilling] = useState(null);
  const [invEmail, setInvEmail] = useState('');
  // Organization writing profile — merged into every generation's policy.
  const [wp, setWp] = useState(null);
  const [wpBusy, setWpBusy] = useState(false);
  // Sign-in & security: linked identities + password state.
  const [sec, setSec] = useState(null);
  const [secErr, setSecErr] = useState('');
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  // A failure must surface: silently swallowing it leaves the tab on
  // "Loading sign-in methods…" forever.
  const loadSec = () => api('/auth/identities')
    .then((d) => { setSec(d); setSecErr(''); })
    .catch((e) => setSecErr(e.message || 'Could not load your sign-in methods'));

  useEffect(() => {
    api('/sources').then((d) => setSources(d.sources)).catch(() => {});
    api('/team').then((d) => setMembers(d.members)).catch(() => {});
    api('/billing').then(setBilling).catch(() => {});
    loadSec();
    api('/style-profile').then((d) => setWp({
      guide: d.profile.guide || 'docify',
      voice: d.profile.voice || '',
      version: d.profile.version || 1,
      notes: d.profile.notes || '',
      termsText: (d.profile.terms || []).map((t) => t.use + ' => ' + (Array.isArray(t.not) ? t.not.join(', ') : t.not)).join('\n'),
      prohibitedText: (d.profile.prohibited || []).join(', ')
    })).catch(() => {});
  }, []);

  async function saveWp() {
    setWpBusy(true);
    try {
      const terms = wp.termsText.split('\n').map((l) => {
        const [use, not] = l.split('=>').map((s) => (s || '').trim());
        return use ? { use, not: not || '' } : null;
      }).filter(Boolean);
      const d = await api('/style-profile', {
        method: 'PUT',
        body: { guide: wp.guide, voice: wp.voice, notes: wp.notes, terms, prohibited: wp.prohibitedText }
      });
      setWp((w) => ({ ...w, version: d.profile.version }));
      toast('success', 'Writing profile saved', 'Version ' + d.profile.version + ' now shapes every new generation and Doc sync update.');
    } catch (e) { toast('error', 'Could not save', e.message); }
    finally { setWpBusy(false); }
  }

  async function linkGoogle() {
    try {
      const d = await api('/auth/link/google', { method: 'POST' });
      // Full-page redirect to the consent screen; come back to this tab.
      try { sessionStorage.setItem('authDest', '/settings#account'); } catch { /* ignore */ }
      window.location.href = d.url;
    } catch (e) { toast('error', 'Could not start Google linking', e.message); }
  }

  async function unlinkIdentity(id, provider) {
    try {
      await api('/auth/identities/' + id, { method: 'DELETE' });
      toast('success', provider + ' disconnected', 'That sign-in method has been removed');
      loadSec();
    } catch (e) { toast('error', 'Could not disconnect', e.message); }
  }

  async function savePassword() {
    if (pwBusy) return;
    if (pwNew.length < 8) return toast('error', 'Password too short', 'Use at least 8 characters');
    if (pwNew !== pwConfirm) return toast('error', 'Passwords don’t match', 'Retype the confirmation');
    setPwBusy(true);
    try {
      await api('/auth/set-password', {
        method: 'POST',
        body: sec && sec.hasPassword ? { password: pwNew, currentPassword: pwCurrent } : { password: pwNew }
      });
      toast('success', sec && sec.hasPassword ? 'Password changed' : 'Password set',
        'You can now also log in with your email and this password');
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
      loadSec();
      refresh(); // keep the cached user (hasPassword) in sync
    } catch (e) { toast('error', 'Could not save password', e.message); }
    finally { setPwBusy(false); }
  }

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
          {[['sources', 'Connected sources'], ['writing', 'Writing style'], ['team', 'Team'], ['billing', 'Billing'], ['account', 'Sign-in & security']].map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        {tab === 'writing' && (
          !wp ? <p className="body01 t2">Loading writing profile…</p> : (
            <div style={{ maxWidth: 720 }}>
              <p className="body01 t2">
                Your organization&apos;s voice, applied automatically to every generation and Doc sync update.
                Documents always start from the <b>Docify Professional Style</b> plus a document-type profile —
                these settings customize that default. Current version: v{wp.version}.
              </p>
              <div className="grid2 mt6">
                <div className="field">
                  <label htmlFor="wpguide">Style-guide bias</label>
                  <select id="wpguide" className="select" value={wp.guide} onChange={(e) => setWp({ ...wp, guide: e.target.value })}>
                    <option value="docify">Docify Professional Style (default)</option>
                    <option value="microsoft">Microsoft Writing Style</option>
                    <option value="google">Google developer documentation style</option>
                    <option value="custom">Custom (described in the policy notes)</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="wpvoice">Voice</label>
                  <select id="wpvoice" className="select" value={wp.voice} onChange={(e) => setWp({ ...wp, voice: e.target.value })}>
                    <option value="">Professional (default)</option>
                    <option value="conversational">Conversational</option>
                    <option value="formal">Formal</option>
                    <option value="direct">Direct and minimal</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="wpterms">Preferred terminology — one per line: preferred =&gt; never use</label>
                <textarea id="wpterms" className="textarea mono" rows={5} style={{ fontSize: 13 }}
                  placeholder={'sign in => log in, login\nworkspace => account area\nAcme Cloud => acme cloud, ACME cloud'}
                  value={wp.termsText} onChange={(e) => setWp({ ...wp, termsText: e.target.value })} />
                <span className="helper">The chosen term is used everywhere — headings, steps, tables, and notes. Variants are flagged in the quality report.</span>
              </div>
              <div className="field">
                <label htmlFor="wpban">Prohibited words (comma-separated)</label>
                <input id="wpban" className="input" placeholder="e.g. simply, obviously, leverage, cutting-edge"
                  value={wp.prohibitedText} onChange={(e) => setWp({ ...wp, prohibitedText: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="wpnotes">Organization writing policy (optional)</label>
                <textarea id="wpnotes" className="textarea" rows={4}
                  placeholder="Anything your style guide requires — e.g. 'Refer to customers as members. Spell out numbers under ten. Product name is always Docify, never Docgen.'"
                  value={wp.notes} onChange={(e) => setWp({ ...wp, notes: e.target.value })} />
              </div>
              <div className="row" style={{ gap: 12 }}>
                <button className="btn btn--primary btn--field" disabled={wpBusy} onClick={saveWp}>
                  {wpBusy ? 'Saving…' : 'Save writing profile'}
                </button>
                <button className="btn btn--ghost btn--field" disabled={wpBusy}
                  onClick={() => setWp({ ...wp, guide: 'docify', voice: '', termsText: '', prohibitedText: '', notes: '' })}>
                  Reset to default profile
                </button>
              </div>
            </div>
          )
        )}

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

        {tab === 'account' && (
          secErr ? (
            <div className="stack" style={{ maxWidth: 720 }}>
              <p className="body01">Could not load your sign-in methods — {secErr}</p>
              <button className="btn btn--tertiary btn--field" style={{ alignSelf: 'flex-start' }}
                onClick={() => { setSecErr(''); loadSec(); }}>Try again</button>
            </div>
          ) : !sec ? <p className="body01 t2">Loading sign-in methods…</p> : (
            <div className="stack" style={{ maxWidth: 720 }}>
              <p className="body01 t2">
                Ways you can sign in to this account. Keep at least one — add a second so you&apos;re never locked out.
              </p>

              {/* Google identity */}
              <div className="tile tile--white row row--between" style={{ padding: '16px 24px' }}>
                <div className="row">
                  <span className="srcmark"><GoogleG size={22} /></span>
                  <div>
                    <p className="h01">Google</p>
                    {(() => {
                      const g = sec.identities.find((i) => i.provider === 'google');
                      return <p className="helper mono">{g ? g.email : 'Not connected'}</p>;
                    })()}
                  </div>
                </div>
                <div className="row">
                  {(() => {
                    const g = sec.identities.find((i) => i.provider === 'google');
                    if (g) return (
                      <>
                        <span className="tag tag--green">Connected</span>
                        <button className="linkbtn" onClick={() => unlinkIdentity(g.id, 'Google')}>Disconnect</button>
                      </>
                    );
                    if (!sec.available.google) return <span className="tag tag--gray">Not configured on this server</span>;
                    return <button className="btn btn--tertiary btn--field" onClick={linkGoogle}>Connect Google</button>;
                  })()}
                </div>
              </div>

              {/* Email + password */}
              <div className="tile tile--white" style={{ padding: '16px 24px' }}>
                <div className="row row--between">
                  <div>
                    <p className="h01">Email &amp; password</p>
                    <p className="helper">
                      {sec.hasPassword
                        ? 'A password is set — you can log in with your email address.'
                        : 'No password yet — add one to also log in with your email address.'}
                    </p>
                  </div>
                  {sec.hasPassword
                    ? <span className="tag tag--green">Enabled</span>
                    : <span className="tag tag--gray">Not set</span>}
                </div>
                <div className="mt5" style={{ maxWidth: 380 }}>
                  {sec.hasPassword && (
                    <div className="field">
                      <label htmlFor="pwCurrent">Current password</label>
                      <input id="pwCurrent" className="input" type="password" autoComplete="current-password"
                        value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} />
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="pwNew">{sec.hasPassword ? 'New password (8+ characters)' : 'Password (8+ characters)'}</label>
                    <input id="pwNew" className="input" type="password" autoComplete="new-password"
                      value={pwNew} onChange={(e) => setPwNew(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="pwConfirm">Confirm password</label>
                    <input id="pwConfirm" className="input" type="password" autoComplete="new-password"
                      value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && savePassword()} />
                  </div>
                  <button className="btn btn--primary btn--field" disabled={pwBusy} onClick={savePassword}>
                    {pwBusy ? 'Saving…' : sec.hasPassword ? 'Change password' : 'Set password'}
                  </button>
                </div>
              </div>
            </div>
          )
        )}
      </div>
      <NavBar back="/automation" />
    </>
  );
}
