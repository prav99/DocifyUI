import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFlow, useAuth, toast } from '../store.jsx';
import { NavBar, HelpLink } from '../ui.jsx';

export default function Checkout() {
  const nav = useNavigate();
  const { flow } = useFlow();
  const { refresh } = useAuth();
  const [taxId, setTaxId] = useState('');
  const [state, setState] = useState('idle'); // idle | busy | done

  const annual = flow.billing === 'annual';
  const per = annual ? 26 : 32;
  const seats = 5;
  const subtotal = annual ? per * seats * 12 : per * seats;

  async function pay() {
    setState('busy');
    try {
      await api('/billing/checkout', {
        method: 'POST',
        body: { plan: 'team', cycle: flow.billing, seats, taxId }
      });
      setState('done');
      toast('success', 'Payment successful', 'Team plan is active — receipt sent to your email');
      refresh();
      setTimeout(() => nav('/dashboard'), 1200);
    } catch (e) {
      setState('idle');
      toast('error', 'Payment failed', e.message);
    }
  }

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 className="h04">Checkout</h1>
          <HelpLink topic="checkout" />
        </div>
        <div className="grid2 mt7" style={{ alignItems: 'start' }}>
          <div className="tile tile--white" style={{ padding: 24 }}>
            <h2 className="h02 mb5">Payment details</h2>
            <div className="field"><label htmlFor="ccName">Name on card</label>
              <input id="ccName" className="input" placeholder="Jane Doe" /></div>
            <div className="field"><label htmlFor="ccNum">Card number</label>
              <input id="ccNum" className="input mono" placeholder="4242 4242 4242 4242" inputMode="numeric" /></div>
            <div className="grid2">
              <div className="field"><label htmlFor="ccExp">Expiry</label>
                <input id="ccExp" className="input mono" placeholder="MM / YY" /></div>
              <div className="field"><label htmlFor="ccCvc">CVC</label>
                <input id="ccCvc" className="input mono" placeholder="123" /></div>
            </div>
            <div className="field"><label htmlFor="taxId">Tax ID / VAT number (optional)</label>
              <input id="taxId" className="input mono" placeholder="e.g. GSTIN 29ABCDE1234F1Z5"
                value={taxId} onChange={(e) => setTaxId(e.target.value)} /></div>
            <p className="helper">Invoices include your tax ID for expensing. Prices exclude applicable taxes.</p>
          </div>

          <div className="tile" style={{ padding: 24 }}>
            <h2 className="h02 mb5">Order summary</h2>
            <div className="row row--between mb3"><span className="body01">Team plan · {seats} seats</span><span className="mono">${per} / user / mo</span></div>
            <div className="row row--between mb3"><span className="body01 t2">Billing cycle</span><span>{annual ? 'Annual' : 'Monthly'}</span></div>
            {annual && <div className="row row--between mb3"><span className="body01 t2">Annual discount</span><span className="check">−20% applied</span></div>}
            <div className="divider" style={{ margin: '16px 0' }} />
            <div className="row row--between"><span className="h02">Due today</span><span className="h03 mono">${subtotal.toLocaleString()}</span></div>
            <p className="helper mt2">{annual ? '12 months, renews annually' : 'Renews monthly'} · cancel anytime from Billing</p>
            <button className="btn btn--primary mt6" style={{ width: '100%' }}
              disabled={state !== 'idle'} onClick={pay}>
              {state === 'idle' ? 'Pay now · $' + subtotal.toLocaleString()
                : state === 'busy' ? 'Processing…' : 'Payment confirmed ✓'}
            </button>
            <p className="helper mt3">Demo build — the payments adapter simulates the charge. Swap in Stripe for production.</p>
          </div>
        </div>
      </div>
      <NavBar back="/pricing" />
    </>
  );
}
