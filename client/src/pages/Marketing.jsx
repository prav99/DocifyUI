import React from 'react';
import { toast } from '../store.jsx';
import { NavBar } from '../ui.jsx';

export function Docs() {
  const cats = [
    { t: 'Getting started', items: ['Connect your first source', 'Generate an API reference', 'Read a quality report'] },
    { t: 'Quality pipeline', items: ['How the LLM judge scores AI readiness', 'Style profiles and custom rules', 'Link verification behavior'] },
    { t: 'Automation', items: ['CI pipeline setup', 'Quality gates in CI', 'Webhook events'] },
    { t: 'Account & billing', items: ['Roles and permissions', 'Plans and invoicing', 'SSO configuration (Enterprise)'] }
  ];
  return (
    <>
      <div className="page">
        <h1 className="h04">Docs &amp; help center</h1>
        <div className="field mt7" style={{ maxWidth: 480 }}>
          <label htmlFor="docSearch">Search</label>
          <input id="docSearch" className="input" placeholder="Search guides, e.g. quality gate" />
        </div>
        <div className="grid4 mt6">
          {cats.map((c) => (
            <div key={c.t} className="tile">
              <p className="h01 mb3">{c.t}</p>
              {c.items.map((it) => (
                <p key={it} className="body01 mt3">
                  <a onClick={() => toast('info', 'Demo build', 'Article stubs are not included in this build')}>{it}</a>
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
      <NavBar back="/" />
    </>
  );
}
