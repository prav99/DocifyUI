import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './store.jsx';

/* ---------- Icons ---------- */
export const IcCheck = ({ c = '#24a148' }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill={c}><path d="M6.5 12.3 2.7 8.5l1.1-1.1 2.7 2.7 5.7-5.7 1.1 1.1z" /></svg>
);
export const IcWarn = () => (
  <svg width="16" height="16" viewBox="0 0 16 16"><path fill="#161616" d="M8 1 .5 14.5h15L8 1zm-.75 5h1.5v4.5h-1.5V6zM8 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" /></svg>
);
export const IcInfo = () => (
  <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#0043ce" /><path fill="#fff" d="M7.25 6.5h1.5V12h-1.5zM8 3.5A1 1 0 1 1 8 5.5 1 1 0 0 1 8 3.5z" /></svg>
);

export function SrcMark({ id }) {
  const letters = { github: 'GH', gitlab: 'GL', bitbucket: 'BB', jira: 'JI', openapi: 'OA', confluence: 'CF', notion: 'NO', azdo: 'AZ' };
  return <span className="srcmark">{letters[id] || '??'}</span>;
}

export function ScoreTag({ n }) {
  const cls = n >= 85 ? 'tag--green' : n >= 70 ? 'tag--amber' : 'tag--red';
  return <span className={'tag ' + cls}>{n} / 100</span>;
}

export function Notif({ kind, title, children }) {
  const icons = { warning: <IcWarn />, info: <IcInfo />, success: <IcCheck />, error: <IcWarn /> };
  return (
    <div className={'notif notif--' + kind}>
      {icons[kind]}
      <div>
        {title ? <p className="ntitle">{title}</p> : null}
        <p className="nbody mt2">{children}</p>
      </div>
    </div>
  );
}

export function Score({ label, num, helper, kind = 'good' }) {
  return (
    <div className={'score score--' + kind}>
      <span className="label01 t2">{label}</span>
      <span className="num">{num}</span>
      <span className="helper">{helper}</span>
    </div>
  );
}

/* ---------- Top bar ---------- */
const SEQ = ['/', '/signup', '/source', '/doctype', '/format', '/generate', '/quality', '/export', '/pricing', '/checkout', '/dashboard', '/automation', '/settings'];
const CRUMBS = {
  '/': 'docgen / home', '/signup': 'docgen / onboarding / signup', '/login': 'docgen / login',
  '/source': 'docgen / onboarding / source-select', '/doctype': 'docgen / onboarding / document-type',
  '/format': 'docgen / onboarding / output-format', '/generate': 'docgen / generate',
  '/quality': 'docgen / quality-review', '/export': 'docgen / export', '/pricing': 'docgen / pricing',
  '/checkout': 'docgen / checkout', '/dashboard': 'docgen / dashboard', '/automation': 'docgen / automation',
  '/settings': 'docgen / settings', '/features': 'docgen / features', '/integrations': 'docgen / integrations',
  '/customers': 'docgen / customers', '/docs': 'docgen / docs'
};

export function TopBar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();
  const path = '/' + (loc.pathname.split('/')[1] || '');
  const idx = SEQ.indexOf(path);
  const marketing = ['/features', '/integrations', '/customers', '/docs'];
  return (
    <header className="topbar">
      <span className="logo" onClick={() => nav('/')}><span className="mark">D</span>DocGen</span>
      <span className="crumb">{CRUMBS[path] || 'docgen'}</span>
      <nav className="topnav">
        {marketing.map((m) => (
          <a key={m} className={path === m ? 'on' : ''} onClick={() => nav(m)}>
            {m.slice(1).charAt(0).toUpperCase() + m.slice(2)}
          </a>
        ))}
      </nav>
      <span className="spacer" />
      {idx >= 0 && (
        <div className="stepwrap">
          <span className="steplabel">Step {idx + 1} of {SEQ.length}</span>
          <div className="stepbar"><div style={{ width: Math.round(((idx + 1) / SEQ.length) * 100) + '%' }} /></div>
        </div>
      )}
      <div className="topbar-actions">
        {user ? (
          <span className="userchip">{user.email}</span>
        ) : (
          <>
            {path !== '/login' && <button className="btn btn--ghost btn--sm btn--center" onClick={() => nav('/login')}>Login</button>}
            {path !== '/signup' && <button className="btn btn--primary btn--sm btn--center" onClick={() => nav('/signup')}>Start free</button>}
          </>
        )}
      </div>
    </header>
  );
}

/* ---------- Bottom nav ---------- */
export function NavBar({ back, next, nextLabel = 'Continue', disabled = false, note, onNext }) {
  const nav = useNavigate();
  return (
    <div className="navbar">
      <div className="inner">
        {back ? (
          <button className="btn btn--ghost btn--center" onClick={() => nav(back)}>← Back</button>
        ) : <span />}
        <div className="row">
          {note ? <span className="navnote">{note}</span> : null}
          {(next || onNext) && (
            <button className="btn btn--primary" disabled={disabled}
              onClick={() => (onNext ? onNext() : nav(next))}>
              {nextLabel}<span className="ico">→</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">{children}</div>
    </div>
  );
}
