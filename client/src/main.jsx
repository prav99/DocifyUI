import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './styles.css';
import { AuthProvider, FlowProvider, Toasts, useAuth } from './store.jsx';
import { TopBar } from './ui.jsx';
import Landing from './pages/Landing.jsx';
import { Signup, LoginRedirect, OAuthComplete } from './pages/Auth.jsx';
import Source from './pages/Source.jsx';
import DocType from './pages/DocType.jsx';
import Format from './pages/Format.jsx';
import Generate from './pages/Generate.jsx';
import Quality from './pages/Quality.jsx';
import ExportPage from './pages/ExportPage.jsx';
import Pricing from './pages/Pricing.jsx';
import Checkout from './pages/Checkout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Automation from './pages/Automation.jsx';
import DocSync from './pages/DocSync.jsx';
import Settings from './pages/Settings.jsx';
import { Docs, DocArticle } from './pages/Docs.jsx';
import Help from './pages/Help.jsx';
import Legal from './pages/Legal.jsx';
import Contact from './pages/Contact.jsx';
import { trackPageview, installClickTracking } from './analytics.js';

function Analytics() {
  const loc = useLocation();
  React.useEffect(() => { installClickTracking(); }, []);
  React.useEffect(() => {
    trackPageview(loc.pathname + loc.search);
  }, [loc.pathname, loc.search]);
  return null;
}

function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="page"><p className="body01 t2">Loading…</p></div>;
  if (!user) return <Navigate to="/signup" state={{ from: loc.pathname }} replace />;
  return children;
}

function ScrollTop() {
  const loc = useLocation();
  React.useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return null;
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
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/login" element={<LoginRedirect />} />
              <Route path="/oauth/complete" element={<OAuthComplete />} />
              <Route path="/source" element={<RequireAuth><Source /></RequireAuth>} />
              <Route path="/doctype" element={<RequireAuth><DocType /></RequireAuth>} />
              <Route path="/format" element={<RequireAuth><Format /></RequireAuth>} />
              <Route path="/generate" element={<RequireAuth><Generate /></RequireAuth>} />
              <Route path="/quality" element={<RequireAuth><Quality /></RequireAuth>} />
              <Route path="/export" element={<RequireAuth><ExportPage /></RequireAuth>} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
              <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route path="/automation" element={<RequireAuth><Automation /></RequireAuth>} />
              <Route path="/sync" element={<RequireAuth><DocSync /></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/docs/:slug" element={<DocArticle />} />
              <Route path="/help" element={<Help />} />
              <Route path="/help/:topic" element={<Help />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/legal/:slug" element={<Legal />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Toasts />
        </FlowProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);
