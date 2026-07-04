import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getCatalog } from '../api.js';
import { useFlow, toast } from '../store.jsx';
import { NavBar, Notif } from '../ui.jsx';

export default function Format() {
  const nav = useNavigate();
  const { flow, setFlow } = useFlow();
  const [catalog, setCatalog] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getCatalog().then(setCatalog); }, []);
  if (!catalog) return <div className="page"><p className="body01 t2">Loading…</p></div>;

  const list = catalog.formats[flow.track] || [];
  const cur = list.find((f) => f.id === flow.format) || null;
  const unsupported = cur && !cur.ok;

  async function generate() {
    setBusy(true);
    try {
      const d = await api('/generations', {
        method: 'POST',
        body: {
          repo: flow.repo || flow.provider, branch: 'main', track: flow.track,
          docTypes: flow.docTypes, format: flow.format,
          instructions: flow.instructions, files: flow.files, provider: flow.provider || 'github'
        }
      });
      setFlow({ genId: d.generation.id });
      nav('/generate');
    } catch (e) { toast('error', 'Could not start generation', e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="page">
        <h1 className="h04">Choose an output format</h1>
        <p className="body01 t2 mt3">Formats differ by track. Everything on the roadmap is listed — items marked coming soon are visible so you can tell us they matter.</p>

        <div className="grid4 mt7">
          {list.map((f) => (
            <div key={f.id} className={'tile tile--click' + (flow.format === f.id ? ' tile--selected' : '')}
              onClick={() => setFlow({ format: f.id, genId: null })}>
              <div className="row row--between">
                <p className="h01">{f.name}</p>
                {f.ok ? null : <span className="tag tag--gray">Coming soon</span>}
              </div>
              <p className="helper mt2">{f.desc}</p>
            </div>
          ))}
        </div>

        {unsupported && (
          <div className="mt6">
            <Notif kind="warning" title="Format not yet supported">
              This output format is not currently supported. We will add support for it in a future release.
            </Notif>
          </div>
        )}
      </div>
      <NavBar back="/doctype"
        nextLabel={unsupported ? 'Pick a supported format to continue' : 'Generate document'}
        disabled={unsupported || !flow.format || busy}
        note={unsupported ? null : cur ? 'Output: ' + cur.name : null}
        onNext={generate} />
    </>
  );
}
