import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, toast } from './store.jsx';

/* ---------- Repository-hub contextual action ----------
   One consistent escape hatch wherever a repository is being selected:
   "Add or manage repositories" carries a ?return= parameter so the hub can
   send the user straight back. Workflow state lives in React context, so
   nothing is lost while they hop over and connect a repo. */
export function RepoHubCta({ label = 'Need a different repository?', action = 'Open Repository Connections', style }) {
  const nav = useNavigate();
  const loc = useLocation();
  return (
    <p className="hubcta" style={style}>
      <span>{label}</span>
      <button type="button" className="hubcta-btn" data-track="repo-hub-cta"
        onClick={() => nav('/repos?return=' + encodeURIComponent(loc.pathname))}>
        <span className="hubcta-plus" aria-hidden="true">＋</span>{action}
      </button>
    </p>
  );
}

/* ---------- Logo: a generated document, verified ---------- */
export function LogoMark({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M6 2h13l7 7v21H6z" fill="#0f62fe" />
      <path d="M19 2v7h7z" fill="#002d9c" />
      <rect x="11" y="13" width="12" height="2.5" fill="#ffffff" />
      <rect x="11" y="18" width="9" height="2.5" fill="#ffffff" opacity=".65" />
      <path d="M12 25.5l2.8 2.8 6.2-6.2" stroke="#42be65" strokeWidth="2.8" fill="none" strokeLinecap="square" />
    </svg>
  );
}

/* ---------- Sandboxed document preview ----------
   Scripts inside the preview stay blocked (no allow-scripts), but srcDoc
   iframes resolve "#anchor" hrefs against the PARENT page URL, which the
   sandbox then blocks — so TOC links would be dead. We keep the sandbox and
   wire navigation ourselves from the parent: in-page anchors smooth-scroll
   within the frame; external links open in a new tab. */
export function PreviewFrame({ html, title = 'Document preview' }) {
  const ref = React.useRef(null);
  const wire = () => {
    const frame = ref.current;
    const doc = frame && frame.contentDocument;
    if (!doc) return;
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href') || '';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (href.startsWith('#')) {
          const el = doc.getElementById(href.slice(1));
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (/^https?:/i.test(href)) {
          window.open(href, '_blank', 'noopener');
        }
      });
    });
  };
  return <iframe ref={ref} title={title} sandbox="allow-same-origin" srcDoc={html} onLoad={wire} />;
}

/* ---------- Contextual help link: one per screen, topic = /help/<id> ---------- */
export function HelpLink({ topic, style = {} }) {
  const nav = useNavigate();
  return (
    <a
      onClick={() => nav('/help/' + topic)}
      title="Open the help article for this page"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', ...style }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="none" stroke="#0f62fe" strokeWidth="1.5" />
        <path fill="#0f62fe" d="M8.75 9.5h-1.5c0-1.9 1.6-1.9 1.6-3.1 0-.6-.5-1-1.1-1-.6 0-1 .4-1.1 1H5.1C5.2 5 6.3 4 7.8 4c1.5 0 2.6 1 2.6 2.4 0 1.7-1.65 1.8-1.65 3.1zM8 12.4a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8z" />
      </svg>
      Help
    </a>
  );
}

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

/* Real source marks — flat, single-weight, sized to the 2px grid (Carbon-style). */
const BRAND = {
  github: (
    <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true">
      <path fill="#161616" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  ),
  gitlab: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="#E24329" d="M12 21 8.4 11.2h7.2L12 21z" />
      <path fill="#FC6D26" d="M12 21 4.5 11.2h3.9L12 21zM12 21l7.5-9.8h-3.9L12 21z" />
      <path fill="#FCA326" d="M4.5 11.2 6.1 6a.33.33 0 0 1 .63 0l1.66 5.2H4.5zM19.5 11.2 17.9 6a.33.33 0 0 0-.63 0l-1.66 5.2h3.89z" />
    </svg>
  ),
  bitbucket: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="#2684FF" d="M3.42 4.5a.75.75 0 0 0-.74.87l2.6 14.06c.07.38.4.66.79.66h11.9c.29 0 .54-.2.6-.49l2.61-14.22a.75.75 0 0 0-.74-.88H3.42zm11.06 10.35H9.56L8.4 9.15h7.2l-1.12 5.7z" />
    </svg>
  ),
  jira: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="#2684FF" d="M12 2 5.9 8.1a1.55 1.55 0 0 0 0 2.2l6.1 6.1 6.1-6.1a1.55 1.55 0 0 0 0-2.2L12 2z" />
      <path fill="#0052CC" d="M12 8.9 8.9 12l3.1 3.1 3.1-3.1L12 8.9z" />
      <path fill="#2684FF" d="M12 16.2 9.2 19l2.8 3 2.8-3-2.8-2.8z" opacity=".85" />
    </svg>
  ),
  confluence: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="#2684FF" d="M3.6 16.9c3-4.9 6.9-5.2 12-2.7l3.6 1.7 1.7-3.8-4-1.9C10.3 7.1 5.5 8.4 1.9 14.2l1.7 2.7z" />
      <path fill="#0052CC" d="M20.4 7.1c-3 4.9-6.9 5.2-12 2.7L4.8 8.1 3.1 11.9l4 1.9c6.6 3.1 11.4 1.8 15-4l-1.7-2.7z" opacity=".92" />
    </svg>
  ),
  notion: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" fill="#ffffff" stroke="#161616" strokeWidth="1.6" />
      <path d="M8.6 17V7.5l6.8 9.5V7.5" stroke="#161616" strokeWidth="1.9" fill="none" />
    </svg>
  ),
  openapi: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" fill="#6BA539" />
      <path d="M12 12V3.4a8.6 8.6 0 0 1 6.1 2.5L12 12z" fill="#93C954" />
      <circle cx="12" cy="12" r="2.6" fill="#ffffff" />
    </svg>
  ),
  azdo: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="#0078D7" d="M21 6v12l-4.9 1.8-8-2.8v2.7L3 17l.05-10.3 4.6 1.5V5.9L16.1 3 21 6zM7.65 9.4v5.2l8.4 1.5V7.7l-8.4 1.7z" />
    </svg>
  )
};

export function SrcMark({ id }) {
  return <span className="srcmark">{BRAND[id] || <span className="mono" style={{ fontSize: 12 }}>?</span>}</span>;
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
// The step counter only tracks the actual document workflow, not marketing/account pages.
const STEPS = ['/source', '/doctype', '/format', '/generate', '/quality', '/export'];
export function TopBar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user } = useAuth();
  const path = '/' + (loc.pathname.split('/')[1] || '');
  const idx = STEPS.indexOf(path);
  const marketing = ['/pricing', '/docs'];
  return (
    <header className="topbar">
      {/* Logged-in users belong in their workflow — the logo takes them to
          the Source step (the post-login home), never back to the marketing
          landing page. */}
      <span className="logo" onClick={() => nav(user ? '/source' : '/')}>
        <LogoMark size={22} />
        <span className="logotext">Doc<span className="logogen">ify</span></span>
      </span>
      <nav className="topnav">
        {marketing.map((m) => (
          <a key={m} className={path === m ? 'on' : ''} onClick={() => nav(m)}>
            {m.slice(1).charAt(0).toUpperCase() + m.slice(2)}
          </a>
        ))}
        {user && (
          <a className={path === '/automation' ? 'on' : ''} onClick={() => nav('/automation')}>
            Automation
          </a>
        )}
        {user && (
          <a className={path === '/sync' ? 'on' : ''} onClick={() => nav('/sync')}>
            Doc sync
          </a>
        )}
        {user && (
          <a className={path === '/repos' ? 'on' : ''} onClick={() => nav('/repos')}>
            Repositories
          </a>
        )}
        {user && (
          <a className={path === '/standardize' ? 'on' : ''} onClick={() => nav('/standardize')}>
            Standardize
          </a>
        )}
        {user && (
          <a className={path === '/history' ? 'on' : ''} onClick={() => nav('/history')}>
            Documents<span className="navnew">●</span>
          </a>
        )}
      </nav>
      <span className="spacer" />
      {idx >= 0 && (
        <div className="stepwrap">
          <span className="steplabel">Step {idx + 1} of {STEPS.length}</span>
          <div className="stepbar"><div style={{ width: Math.round(((idx + 1) / STEPS.length) * 100) + '%' }} /></div>
        </div>
      )}
      <div className="topbar-actions">
        {user ? (
          <UserMenu user={user} />
        ) : (
          <>
            {path !== '/signup' && <button className="btn btn--ghost btn--sm btn--center" onClick={() => nav('/signup#login')}>Login</button>}
            {path !== '/signup' && <button className="btn btn--primary btn--sm btn--center" onClick={() => nav('/signup')}>Start free</button>}
          </>
        )}
      </div>
    </header>
  );
}

/* ---------- Account menu: dashboard, settings, log out ---------- */
function UserMenu({ user }) {
  const nav = useNavigate();
  const { logout } = useAuth();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const go = (to) => { setOpen(false); nav(to); };
  const signOut = () => {
    setOpen(false);
    try { sessionStorage.removeItem('docgen_flow'); } catch { /* ignore */ }
    logout();
    toast('info', 'Logged out', 'See you soon');
    nav('/');
  };
  return (
    <div className="usermenu" ref={ref}>
      <button className={'userchip userchip--btn' + (open ? ' open' : '')} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}>
        {user.email}<span className="uchev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="umenu" role="menu">
          <button role="menuitem" onClick={() => go('/dashboard')}>Dashboard</button>
          <button role="menuitem" onClick={() => go('/automation')}>Automation</button>
          <button role="menuitem" onClick={() => go('/sync')}>Doc sync</button>
          <button role="menuitem" onClick={() => go('/repos')}>Repositories</button>
          {user.isAdmin && <button role="menuitem" onClick={() => go('/founder')}>Founder metrics</button>}
          <button role="menuitem" onClick={() => go('/settings')}>Team &amp; settings</button>
          <div className="umenu-div" />
          <button role="menuitem" className="umenu-out" onClick={signOut}>Log out</button>
        </div>
      )}
    </div>
  );
}

/* ---------- Bottom nav ---------- */
export function NavBar({ back, backLabel = 'Back', next, nextLabel = 'Continue', disabled = false, note, onNext }) {
  const nav = useNavigate();
  return (
    <div className="navbar">
      <div className="inner">
        {back ? (
          <button className="btn btn--ghost btn--center" onClick={() => nav(back)}>← {backLabel}</button>
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
