import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getCatalog, setToken } from '../api.js';
import { toast, useAuth } from '../store.jsx';
import { NavBar, SrcMark, HelpLink, Modal } from '../ui.jsx';
import { GoogleG } from './Auth.jsx';

export default function Settings() {
  const nav = useNavigate();
  const { user, refresh, logout } = useAuth();
  // /settings#account deep-links the security tab — where the Google linking
  // round-trip returns to.
  const [tab, setTab] = useState(() => (window.location.hash === '#account' ? 'account' : 'sources'));
  // null = still loading; [] = loaded and genuinely empty. Collapsing the two
  // would show "nothing connected" when the request actually failed.
  const [sources, setSources] = useState(null);
  const [srcErr, setSrcErr] = useState('');
  const [members, setMembers] = useState(null);
  const [teamErr, setTeamErr] = useState('');
  const [billing, setBilling] = useState(null);
  const [billErr, setBillErr] = useState('');
  // Plans, caps, and format names come from /catalog so this page can never
  // advertise a limit the server does not enforce.
  const [catalog, setCatalog] = useState(null);
  const [invEmail, setInvEmail] = useState('');
  const [invBusy, setInvBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [remBusy, setRemBusy] = useState(false);
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
  // Account deletion — irreversible, so it is gated behind typing the address.
  const [delOpen, setDelOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState('');
  const [delBusy, setDelBusy] = useState(false);

  // A failure must surface: silently swallowing it leaves the tab on
  // "Loading sign-in methods…" forever.
  const loadSec = () => api('/auth/identities')
    .then((d) => { setSec(d); setSecErr(''); })
    .catch((e) => setSecErr(e.message || 'Could not load your sign-in methods'));

  const loadSources = () => api('/sources')
    .then((d) => { setSources(d.sources || []); setSrcErr(''); })
    .catch((e) => setSrcErr(e.message || 'Could not load your connected sources'));

  const loadTeam = () => api('/team')
    .then((d) => { setMembers(d.members || []); setTeamErr(''); })
    .catch((e) => setTeamErr(e.message || 'Could not load your team'));

  // Seat usage lives in /billing, so every membership change reloads it too.
  const loadBilling = () => api('/billing')
    .then((d) => { setBilling(d); setBillErr(''); })
    .catch((e) => setBillErr(e.message || 'Could not load your plan'));

  useEffect(() => {
    loadSources();
    loadTeam();
    loadBilling();
    getCatalog().then(setCatalog).catch(() => {});
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
    if (sec && sec.hasPassword && !pwCurrent) return toast('error', 'Current password required', 'Enter the password you sign in with today');
    if (pwNew.length < 8) return toast('error', 'Password too short', 'Use at least 8 characters');
    if (pwNew !== pwConfirm) return toast('error', 'Passwords don’t match', 'Retype the confirmation');
    setPwBusy(true);
    try {
      // Changing a password revokes every session issued before it — including
      // this tab's. The endpoint hands back a freshly signed token so the
      // person who just proved they know the password is not the one logged out.
      const res = await api('/auth/set-password', {
        method: 'POST',
        body: sec && sec.hasPassword ? { password: pwNew, currentPassword: pwCurrent } : { password: pwNew }
      });
      if (res && res.token) setToken(res.token);
      toast('success', sec && sec.hasPassword ? 'Password changed' : 'Password set',
        'You can now also log in with your email and this password');
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
      loadSec();
      refresh(); // keep the cached user (hasPassword) in sync
    } catch (e) { toast('error', 'Could not save password', e.message); }
    finally { setPwBusy(false); }
  }

  async function deleteAccount() {
    if (delBusy) return;
    setDelBusy(true);
    try {
      await api('/account', { method: 'DELETE', body: { confirm: delConfirm.trim() } });
      toast('success', 'Account deleted', 'Your account and its documents have been removed.');
      logout();
      // logout() only clears the session token. The in-progress wizard state
      // holds the deleted account's content — including any uploaded SKILL.md
      // body — and would otherwise be inherited by the next signup in this
      // browser.
      try { sessionStorage.clear(); } catch { /* ignore */ }
      nav('/');
    } catch (e) { toast('error', 'Could not delete account', e.message); }
    finally { setDelBusy(false); }
  }

  async function invite() {
    if (invBusy) return;
    const email = invEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return toast('error', 'Enter a valid email', 'An address is required to send an invite');
    }
    // A duplicate invite would silently consume a second seat.
    if ((members || []).some((m) => (m.email || '').toLowerCase() === email.toLowerCase())) {
      return toast('error', 'Already on the team', email + ' already holds a seat on this account');
    }
    setInvBusy(true);
    try {
      const d = await api('/team/invite', { method: 'POST', body: { email } });
      if (d.member) setMembers((m) => [...(m || []), d.member]); else await loadTeam();
      // Whether an email actually left the server depends on its mail
      // configuration, so report what the server says. With nothing to go on,
      // claim only the part this client can see: the seat is taken.
      const emailed = d.emailed !== undefined ? d.emailed : d.emailSent;
      toast(emailed === false ? 'info' : 'success', 'Seat reserved for ' + email,
        d.message || (emailed === true
          ? 'An invitation email is on its way.'
          : emailed === false
            ? 'No invitation email was sent — this server has no mail configured, so tell them yourself.'
            : 'They now hold a seat on this account.'));
      setInvEmail('');
      loadBilling();
    } catch (e) { toast('error', 'Invite failed', e.message); }
    finally { setInvBusy(false); }
  }

  // DELETE /api/team/:id removes the membership row and frees the seat. The
  // owner's own row is never offered — losing it would leave the account with
  // no owner and no way to restore one.
  async function removeMember() {
    if (remBusy || !removeTarget) return;
    const m = removeTarget;
    setRemBusy(true);
    try {
      await api('/team/' + m.id, { method: 'DELETE' });
      setRemoveTarget(null);
      // Re-read rather than splice: the seat counter has to come from the
      // server or the two disagree after a concurrent change.
      await loadTeam();
      loadBilling();
      toast('success', 'Removed from the team',
        (m.email || 'That member') + ' no longer holds a seat on this account.');
    } catch (e) { toast('error', 'Could not remove', e.message); }
    finally { setRemBusy(false); }
  }

  // Plan display comes from the catalog (names, prices, format ids) and the
  // caps come from /billing's usage block, which the server resolved against
  // PLAN_LIMITS — nothing about entitlements is written down twice here.
  const planId = (billing && billing.plan) || (user && user.plan) || 'free';
  const planDef = ((catalog && catalog.plans) || {})[planId] || null;
  const planName = planDef ? planDef.name : planId.charAt(0).toUpperCase() + planId.slice(1);
  const planCaps = ((catalog && catalog.planLimits) || {})[planId] || null;
  const usage = (billing && billing.usage) || {};
  // null = unlimited, undefined = this build of the API did not say, in which
  // case the row is omitted rather than guessed at.
  const docCap = usage.documents ? usage.documents.limit : (planCaps ? planCaps.docsPerMonth : undefined);
  const pipeCap = usage.pipelines ? usage.pipelines.limit : (planCaps ? planCaps.pipelines : undefined);
  const seatCap = usage.seats ? usage.seats.limit
    : (planCaps && planCaps.seats !== 'purchased' ? planCaps.seats : undefined);
  const formatNames = (ids) => {
    const all = [].concat(...Object.values((catalog && catalog.formats) || {}));
    return ids.map((id) => (all.find((f) => f.id === id) || {}).name || id);
  };
  const countLine = (n, one, many) => (n == null ? 'Unlimited ' + many : n + ' ' + (n === 1 ? one : many));
  const usageLine = (u) => (!u ? '—' : u.limit == null ? u.used + ' used · unlimited' : u.used + ' of ' + u.limit);

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
                {/* This only refills the form — the saved profile is unchanged
                    until Save runs, so the label must not imply otherwise. */}
                <button className="btn btn--ghost btn--field" disabled={wpBusy}
                  onClick={() => setWp({ ...wp, guide: 'docify', voice: '', termsText: '', prohibitedText: '', notes: '' })}>
                  Reset fields to default
                </button>
              </div>
              <p className="helper">Resetting only clears these fields — save to apply it to future generations.</p>
            </div>
          )
        )}

        {tab === 'sources' && (
          <div className="stack" style={{ maxWidth: 720 }}>
            {srcErr && (
              <div className="stack">
                <p className="body01">Could not load your connected sources — {srcErr}</p>
                <button className="btn btn--tertiary btn--field" style={{ alignSelf: 'flex-start' }}
                  onClick={() => { setSrcErr(''); loadSources(); }}>Try again</button>
              </div>
            )}
            {!srcErr && sources === null && <p className="body01 t2">Loading connected sources…</p>}
            {!srcErr && sources !== null && sources.length === 0 && <p className="body01 t2">No sources connected yet.</p>}
            {(sources || []).map((s) => (
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
          teamErr ? (
            <div className="stack" style={{ maxWidth: 720 }}>
              <p className="body01">Could not load your team — {teamErr}</p>
              <button className="btn btn--tertiary btn--field" style={{ alignSelf: 'flex-start' }}
                onClick={() => { setTeamErr(''); loadTeam(); }}>Try again</button>
            </div>
          ) : members === null ? <p className="body01 t2">Loading team…</p> : (
            <>
              <table className="dtable" style={{ maxWidth: 720 }}>
                <thead><tr><th>NAME</th><th>EMAIL</th><th>ROLE</th><th>ACTION</th></tr></thead>
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
                      <td>
                        {m.role === 'Owner'
                          ? <span className="helper">Account owner</span>
                          : <button className="linkbtn" onClick={() => setRemoveTarget(m)}>Remove</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="helper mt5" style={{ maxWidth: 720 }}>
                {usage.seats
                  ? (usage.seats.limit == null
                    ? usage.seats.used + ' seats in use on the ' + planName + ' plan, which has no seat limit. '
                    : usage.seats.used + ' of ' + usage.seats.limit + ' seats in use on the ' + planName + ' plan. ')
                  : ''}
                Removing someone frees their seat immediately.
              </p>
              <div className="row mt5" style={{ maxWidth: 720, alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label htmlFor="invEmail">Invite by email</label>
                  <input id="invEmail" className="input" type="email" placeholder="teammate@company.com"
                    value={invEmail} onChange={(e) => setInvEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && invite()} />
                </div>
                <button className="btn btn--primary btn--field" disabled={invBusy} onClick={invite}>
                  {invBusy ? 'Sending…' : 'Send invite'}
                </button>
              </div>
            </>
          )
        )}

        {tab === 'billing' && (
          billErr ? (
            <div className="stack" style={{ maxWidth: 560 }}>
              <p className="body01">Could not load your plan — {billErr}</p>
              <button className="btn btn--tertiary btn--field" style={{ alignSelf: 'flex-start' }}
                onClick={() => { setBillErr(''); loadBilling(); }}>Try again</button>
            </div>
          ) : !billing ? <p className="body01 t2">Loading plan…</p> : (
            <div className="tile tile--white" style={{ padding: 24, maxWidth: 560 }}>
              <div className="row row--between">
                <h2 className="h02">Current plan</h2>
                <span className={'tag ' + (planId === 'free' ? 'tag--gray' : 'tag--blue')}>{planName}</span>
              </div>
              {planDef && planDef.monthly != null && (
                <p className="body01 mt5">
                  {planDef.monthly === 0
                    ? 'No charge.'
                    : '$' + (billing.cycle === 'annual' ? planDef.annual : planDef.monthly) + ' per month'
                      + (billing.cycle === 'annual' ? ', billed annually' : '')}
                </p>
              )}
              {planId === 'enterprise' && <p className="body01 mt5">Custom pricing.</p>}

              {(docCap !== undefined || planCaps) && (
                <>
                  <p className="label01 t2 mt6">WHAT THIS PLAN INCLUDES</p>
                  <ul className="body01 mt3" style={{ paddingLeft: 18 }}>
                    {docCap !== undefined && <li>{countLine(docCap, 'document', 'documents')} per month</li>}
                    {seatCap !== undefined && <li>{countLine(seatCap, 'seat', 'seats')}</li>}
                    {pipeCap !== undefined && (
                      <li>{pipeCap === 0 ? 'No automation pipelines' : countLine(pipeCap, 'automation pipeline', 'automation pipelines')}</li>
                    )}
                    {planCaps && (
                      <li>{planCaps.formats == null
                        ? 'Every export format, including DITA'
                        : formatNames(planCaps.formats).join(', ') + ' exports'}</li>
                    )}
                    {planCaps && planCaps.sources != null && <li>{countLine(planCaps.sources, 'connected source', 'connected sources')}</li>}
                    {planCaps && planCaps.watermark && <li>Documents carry a Docify watermark</li>}
                  </ul>
                </>
              )}

              {usage.documents && (
                <>
                  <p className="label01 t2 mt6">THIS MONTH</p>
                  <div className="row row--between mt3"><span className="body01 t2">Documents</span><span className="mono">{usageLine(usage.documents)}</span></div>
                  <div className="row row--between mt3"><span className="body01 t2">Automation pipelines</span><span className="mono">{usageLine(usage.pipelines)}</span></div>
                  <div className="row row--between mt3"><span className="body01 t2">Seats</span><span className="mono">{usageLine(usage.seats)}</span></div>
                  {usage.resetsOn && (
                    <div className="row row--between mt3"><span className="body01 t2">Document count resets</span><span className="mono">{usage.resetsOn}</span></div>
                  )}
                </>
              )}

              {/* Invoice figures are only meaningful for a plan the server
                  actually bills for; anything else would be an invented $0. */}
              {billing.nextInvoice && (
                <>
                  <p className="label01 t2 mt6">BILLING</p>
                  <div className="row row--between mt3"><span className="body01 t2">Cycle</span><span className="mono">{billing.cycle === 'annual' ? 'Annual' : 'Monthly'}</span></div>
                  <div className="row row--between mt3"><span className="body01 t2">Next invoice</span><span className="mono">{billing.nextInvoice}</span></div>
                  {typeof billing.amount === 'number' && (
                    <div className="row row--between mt3"><span className="body01 t2">Amount</span><span className="mono">${billing.amount.toLocaleString()}</span></div>
                  )}
                </>
              )}

              {planId === 'enterprise' ? (
                <button className="btn btn--tertiary mt5" onClick={() => nav('/contact')}>Talk to us about your plan<span className="ico">→</span></button>
              ) : (
                <>
                  <button className="btn btn--primary mt5" onClick={() => nav('/pricing')}>
                    {planId === 'free' ? 'See paid plans' : 'Compare plans'}<span className="ico">→</span>
                  </button>
                  {/* Seat count is part of the plan record, and there is no
                      self-service control that changes it. */}
                  <p className="helper mt3">
                    Need more seats or a different plan?{' '}
                    <button className="linkbtn" style={{ fontSize: 12 }} onClick={() => nav('/contact')}>Get in touch</button>.
                  </p>
                </>
              )}
            </div>
          )
        )}

        {/* The sign-in methods and the delete control are independent: a
            failed /auth/identities call must not hide the only route the
            privacy policy promises for erasing an account. */}
        {tab === 'account' && (
          <div className="stack" style={{ maxWidth: 720 }}>
          {secErr ? (
            <div className="stack">
              <p className="body01">Could not load your sign-in methods — {secErr}</p>
              <button className="btn btn--tertiary btn--field" style={{ alignSelf: 'flex-start' }}
                onClick={() => { setSecErr(''); loadSec(); }}>Try again</button>
            </div>
          ) : !sec ? <p className="body01 t2">Loading sign-in methods…</p> : (
            <>
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
            </>
          )}

          {/* Delete account — the privacy policy promises this, so it has
              to be reachable, and it genuinely erases the data. */}
          <div className="tile tile--white" style={{ padding: '16px 24px', borderLeft: '3px solid #da1e28' }}>
            <div className="row row--between" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div>
                <p className="h01">Delete account</p>
                <p className="helper">
                  Permanently removes your account, documents, version history, connections, and settings.
                  This cannot be undone.
                </p>
              </div>
              {!delOpen && (
                <button className="btn btn--ghost btn--field" style={{ color: '#da1e28' }}
                  onClick={() => setDelOpen(true)}>Delete account</button>
              )}
            </div>
            {delOpen && (
              <div className="mt5" style={{ maxWidth: 380 }}>
                <div className="field">
                  <label htmlFor="delConfirm">Type <span className="mono">{user ? user.email : 'your email'}</span> to confirm</label>
                  <input id="delConfirm" className="input" autoComplete="off"
                    value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && deleteAccount()} />
                </div>
                <div className="row" style={{ gap: 12 }}>
                  {/* The server rejects a mismatch anyway; keeping the button
                      inert until the address matches avoids a confusing 400. */}
                  <button className="btn btn--field" style={{ background: '#da1e28', color: '#fff' }}
                    disabled={delBusy || !!(user && delConfirm.trim().toLowerCase() !== (user.email || '').toLowerCase())}
                    onClick={deleteAccount}>
                    {delBusy ? 'Deleting…' : 'Permanently delete'}
                  </button>
                  <button className="btn btn--ghost btn--field" disabled={delBusy}
                    onClick={() => { setDelOpen(false); setDelConfirm(''); }}>Cancel</button>
                </div>
                  </div>
                )}
              </div>
          </div>
        )}
      </div>

      <Modal open={!!removeTarget} onClose={() => { if (!remBusy) setRemoveTarget(null); }}>
        <div className="mhead">
          <h3 className="h02">Remove {removeTarget ? removeTarget.email : 'member'}?</h3>
          <button className="mclose" aria-label="Close" disabled={remBusy} onClick={() => setRemoveTarget(null)}>✕</button>
        </div>
        <div className="mbody">
          <p className="body01 t2">
            {removeTarget && removeTarget.status === 'invited'
              ? 'Their pending invitation is cancelled and the seat becomes available again. You can invite them back at any time.'
              : 'They lose their seat on this account, which becomes available again. Documents they created stay in this account.'}
          </p>
        </div>
        <div className="mfoot">
          <button className="btn btn--ghost btn--center" disabled={remBusy} onClick={() => setRemoveTarget(null)}>Cancel</button>
          <button className="btn btn--primary btn--center" style={{ background: 'var(--button-danger)' }}
            disabled={remBusy} onClick={removeMember}>
            {remBusy ? 'Removing…' : 'Remove member'}
          </button>
        </div>
      </Modal>

      <NavBar back="/automation" />
    </>
  );
}
