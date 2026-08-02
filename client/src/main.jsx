import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './styles.css';
import { AuthProvider, FlowProvider, Toasts, useAuth } from './store.jsx';
import { TopBar } from './ui.jsx';
import Landing from './pages/Landing.jsx';
import { Signup, LoginRedirect, OAuthComplete, ResetPassword } from './pages/Auth.jsx';
import { trackPageview, installClickTracking, safeUrl } from './analytics.js';
import posthog from './posthog.js';

/* Everything past the front door is loaded on demand. The landing page is the
   only route most visitors ever see, and it must not carry the authenticated
   app's code. Landing and Auth stay eager — they are first paint. */
const Source = React.lazy(() => import('./pages/Source.jsx'));
const DocType = React.lazy(() => import('./pages/DocType.jsx'));
const Format = React.lazy(() => import('./pages/Format.jsx'));
const Generate = React.lazy(() => import('./pages/Generate.jsx'));
const Quality = React.lazy(() => import('./pages/Quality.jsx'));
const ExportPage = React.lazy(() => import('./pages/ExportPage.jsx'));
const Pricing = React.lazy(() => import('./pages/Pricing.jsx'));
const Checkout = React.lazy(() => import('./pages/Checkout.jsx'));
const Dashboard = React.lazy(() => import('./pages/Dashboard.jsx'));
const Automation = React.lazy(() => import('./pages/Automation.jsx'));
const DocSync = React.lazy(() => import('./pages/DocSync.jsx'));
const Repos = React.lazy(() => import('./pages/Repos.jsx'));
const Founder = React.lazy(() => import('./pages/Founder.jsx'));
const Settings = React.lazy(() => import('./pages/Settings.jsx'));
const Docs = React.lazy(() => import('./pages/Docs.jsx').then((m) => ({ default: m.Docs })));
const DocArticle = React.lazy(() => import('./pages/Docs.jsx').then((m) => ({ default: m.DocArticle })));
const Help = React.lazy(() => import('./pages/Help.jsx'));
const Legal = React.lazy(() => import('./pages/Legal.jsx'));
const Contact = React.lazy(() => import('./pages/Contact.jsx'));
const Status = React.lazy(() => import('./pages/Status.jsx'));
const Governance = React.lazy(() => import('./pages/Governance.jsx'));
const History = React.lazy(() => import('./pages/History.jsx'));
const Assistant = React.lazy(() => import('./Assistant.jsx'));

function PageLoading() {
  return <div className="page"><p className="body01 t2">Loading…</p></div>;
}

/* Routes are code-split, so a page arrives as its own file. After a deploy the
   old filenames are gone: a tab left open overnight asks for a chunk that no
   longer exists, the import rejects, and React unmounts the whole tree — a
   white screen with nothing to click. This turns that into an explanation and
   a reload, which fetches the new build. */
class ChunkBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { console.error('route failed to load:', err); }
  componentDidUpdate(prev) {
    // A failed boundary stays failed; clear it when the user navigates away.
    if (this.state.failed && prev.routeKey !== this.props.routeKey) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page">
        <h1 className="h04">This page could not be loaded</h1>
        <p className="body01 t2 mt3">
          Docify was updated while this tab was open, so part of the app is no longer available.
          Reloading picks up the new version — nothing you were working on is lost.
        </p>
        <button className="btn btn--primary mt5" onClick={() => window.location.reload()}>Reload Docify</button>
      </div>
    );
  }
}

// The click listener attaches to document and is never removed, so installing
// it twice would double-count every click.
let clickTrackingInstalled = false;

function Analytics() {
  const loc = useLocation();
  const { user, ready } = useAuth();
  React.useEffect(() => {
    if (clickTrackingInstalled) return;
    clickTrackingInstalled = true;
    installClickTracking();
  }, []);
  React.useEffect(() => {
    trackPageview(loc.pathname + loc.search);
    posthog.capture('$pageview', { $current_url: safeUrl() });
    // Stop session replay the moment the visitor enters the authenticated
    // app — those screens render customer source and documentation.
    if (/^\/(dashboard|source|doctype|format|generate|quality|export|checkout|settings|automation|sync|repos|standardize|history|founder|oauth)/.test(loc.pathname)) {
      try { if (window.clarity) window.clarity('stop'); } catch { /* vendor absent */ }
    }
  }, [loc.pathname, loc.search]);
  // Identify the user on page refresh when already logged in. Analytics gets
  // an opaque id and the plan only — never the customer's email or name.
  React.useEffect(() => {
    if (ready && user) {
      posthog.identify(String(user.id || ''), { plan: user.plan || undefined });
    }
  }, [ready, user]);
  return null;
}

function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <PageLoading />;
  // Carry the whole location, query included, so an expired session lands the
  // user back exactly where they were once they sign in again.
  if (!user) return <Navigate to="/signup" state={{ from: loc.pathname + loc.search }} replace />;
  return children;
}

function ScrollTop() {
  const loc = useLocation();
  React.useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return null;
}

function AppRoutes() {
  const loc = useLocation();
  return (
      <ChunkBoundary routeKey={loc.pathname}>
      <React.Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<LoginRedirect />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/oauth/complete" element={<OAuthComplete />} />
          <Route path="/source" element={<RequireAuth><Source /></RequireAuth>} />
          <Route path="/doctype" element={<RequireAuth><DocType /></RequireAuth>} />
          <Route path="/format" element={<RequireAuth><Format /></RequireAuth>} />
          <Route path="/generate" element={<RequireAuth><Generate /></RequireAuth>} />
          <Route path="/quality" element={<RequireAuth><Quality /></RequireAuth>} />
          <Route path="/quality/:genId" element={<RequireAuth><Quality /></RequireAuth>} />
          <Route path="/export" element={<RequireAuth><ExportPage /></RequireAuth>} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/automation" element={<RequireAuth><Automation /></RequireAuth>} />
          <Route path="/automation/:id" element={<RequireAuth><Automation /></RequireAuth>} />
          <Route path="/sync" element={<RequireAuth><DocSync /></RequireAuth>} />
          <Route path="/repos" element={<RequireAuth><Repos /></RequireAuth>} />
          <Route path="/standardize" element={<RequireAuth><Governance /></RequireAuth>} />
          {/* Old URL keeps working — bookmarks, help links, history */}
          <Route path="/governance" element={<Navigate to="/standardize" replace />} />
          <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
          <Route path="/history/:id" element={<RequireAuth><History /></RequireAuth>} />
          <Route path="/founder" element={<RequireAuth><Founder /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/docs/:slug" element={<DocArticle />} />
          <Route path="/help" element={<Help />} />
          <Route path="/help/:topic" element={<Help />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/legal/:slug" element={<Legal />} />
          <Route path="/status" element={<Status />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </React.Suspense>
      </ChunkBoundary>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FlowProvider>
          <ScrollTop />
          <Analytics />
          <TopBar />
          <main>
            <AppRoutes />
          </main>
          <Toasts />
          {/* The help widget floats over every page — it can arrive a beat late
              rather than delay first paint. */}
          <React.Suspense fallback={null}><Assistant /></React.Suspense>
        </FlowProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);
