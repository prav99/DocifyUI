import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFlow, useAuth, toast } from '../store.jsx';
import { NavBar, HelpLink, Notif } from '../ui.jsx';
import { SUPPORT_EMAIL, supportMailto } from '../config.js';
import posthog from '../posthog.js';

const PRICES = {
  starter: { monthly: 29, annual: 24, seatsIncluded: 2 },
  team: { monthly: 99, annual: 79, seatsIncluded: 5, extraSeat: 12 }
};
const MAX_SEATS = 100;

/* Online payment is not enabled: the server fails closed with 503 rather than
   granting a plan it cannot charge for. Two consequences are deliberate here:

   1. The disclosure sits ABOVE the payment section, before a visitor can reach
      a card field — a footnote under the pay button is a disclosure only in
      the sense that it exists.
   2. The card fields are inert. They are rendered so the summary reads as a
      real checkout, but they are disabled and unnamed, so nothing can be
      typed, autofilled, kept in component state, logged, or submitted. The
      request body below carries plan, cycle, seats, and an optional tax ID —
      no payment instrument in any form. */

export default function Checkout() {
  const nav = useNavigate();
  const { flow } = useFlow();
  const { refresh } = useAuth();
  const [taxId, setTaxId] = useState('');
  const [state, setState] = useState('idle'); // idle | busy | done
  const [err, setErr] = useState('');
  const [seats, setSeats] = useState(5); // Team only; minimum 5 included seats

  const plan = flow.plan === 'starter' ? 'starter' : 'team';
  const planName = plan === 'starter' ? 'Starter' : 'Team';
  const p = PRICES[plan];
  const annual = flow.billing === 'annual';
  const base = annual ? p.annual : p.monthly;
  const planSeats = plan === 'team' ? seats : p.seatsIncluded;
  const extraSeats = plan === 'team' ? Math.max(0, seats - p.seatsIncluded) : 0;
  const extraCost = extraSeats * (p.extraSeat || 0);
  const perMonth = base + extraCost;
  const subtotal = annual ? perMonth * 12 : perMonth;
  // Stated from the two prices rather than a round number typed by hand — the
  // annual saving differs per plan (Starter 17%, Team 20%).
  const discountPct = Math.round((1 - p.annual / p.monthly) * 100);

  async function pay() {
    setState('busy');
    setErr('');
    try {
      await api('/billing/checkout', {
        method: 'POST',
        body: { plan, cycle: flow.billing, seats: planSeats, taxId: taxId.trim() }
      });
      setState('done');
      posthog.capture('payment_completed', {
        plan,
        billing_cycle: flow.billing,
        seats: planSeats,
        amount: subtotal,
      });
      toast('success', planName + ' plan is active', 'Your plan has been updated.');
      refresh();
      setTimeout(() => nav('/dashboard'), 1200);
    } catch (e) {
      setState('idle');
      setErr(e.message || 'Checkout is unavailable');
      posthog.captureException(e, { event: 'payment_error', plan });
      toast('error', 'Checkout could not complete', e.message);
    }
  }

  return (
    <>
      <div className="page">
        <div className="row row--between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 className="h04">Checkout</h1>
          <HelpLink topic="checkout" />
        </div>

        {/* Before anything that looks like a payment form. */}
        <div className="mt5">
          <Notif kind="warning" title="Online payment is not available yet — this checkout cannot charge you">
            Docify has no live payment processor connected, so no card is accepted, stored, or charged.
            The card fields below are inert placeholders: they are disabled and nothing you could type in
            them would ever leave this page. To start a paid plan today, email{' '}
            <a href={supportMailto('Paid plan enquiry — ' + planName)}>{SUPPORT_EMAIL}</a> and we will
            arrange it directly.
          </Notif>
        </div>

        <div className="grid2 mt5" style={{ alignItems: 'start' }}>
          <div className="tile tile--white" style={{ padding: 24 }}>
            <h2 className="h02 mb2">Payment details</h2>
            <p className="helper mb5">
              Disabled — shown so you can see what checkout will ask for once payments are live.
              No card data is collected here.
            </p>
            <fieldset disabled style={{ border: 0, padding: 0, margin: 0, opacity: 0.55 }} aria-describedby="ccOff">
              <p id="ccOff" className="helper mb3">These fields cannot be filled in.</p>
              <div className="field"><label htmlFor="ccName">Name on card</label>
                <input id="ccName" className="input" placeholder="Jane Doe" autoComplete="off" readOnly /></div>
              <div className="field"><label htmlFor="ccNum">Card number</label>
                <input id="ccNum" className="input mono" placeholder="•••• •••• •••• ••••" autoComplete="off" readOnly /></div>
              <div className="grid2">
                <div className="field"><label htmlFor="ccExp">Expiry</label>
                  <input id="ccExp" className="input mono" placeholder="MM / YY" autoComplete="off" readOnly /></div>
                <div className="field"><label htmlFor="ccCvc">CVC</label>
                  <input id="ccCvc" className="input mono" placeholder="•••" autoComplete="off" readOnly /></div>
              </div>
            </fieldset>
            <div className="field mt5"><label htmlFor="taxId">Tax ID / VAT number (optional)</label>
              <input id="taxId" className="input mono" placeholder="e.g. GSTIN 29ABCDE1234F1Z5"
                maxLength={64} value={taxId} onChange={(e) => setTaxId(e.target.value)} /></div>
            <p className="helper">Kept with your account so invoices carry it once billing is live. Prices exclude applicable taxes.</p>
          </div>

          <div className="tile" style={{ padding: 24 }}>
            <h2 className="h02 mb5">Order summary</h2>
            {plan === 'team' ? (
              <>
                <div className="row row--between mb3">
                  <span className="body01">Team plan · includes {p.seatsIncluded} seats</span>
                  <span className="mono">${base} / mo</span>
                </div>
                <div className="row row--between mb3" style={{ alignItems: 'center' }}>
                  <span className="body01 t2" id="seatLabel">Seats</span>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <button className="btn btn--tertiary" aria-label="Remove one seat"
                      disabled={seats <= p.seatsIncluded} onClick={() => setSeats((s) => Math.max(p.seatsIncluded, s - 1))}>−</button>
                    <span className="mono" style={{ minWidth: 24, textAlign: 'center' }}
                      role="status" aria-live="polite" aria-labelledby="seatLabel">{seats}</span>
                    <button className="btn btn--tertiary" aria-label="Add one seat"
                      disabled={seats >= MAX_SEATS} onClick={() => setSeats((s) => Math.min(MAX_SEATS, s + 1))}>+</button>
                  </div>
                </div>
                <div className="row row--between mb3">
                  <span className="body01 t2">Extra seats · {extraSeats} × ${p.extraSeat} / mo</span>
                  <span className="mono">${extraCost} / mo</span>
                </div>
                <div className="row row--between mb3">
                  <span className="body01 t2">Subtotal per month</span>
                  <span className="mono">${base} + ${extraCost} = ${perMonth}</span>
                </div>
              </>
            ) : (
              <div className="row row--between mb3">
                <span className="body01">Starter plan · {p.seatsIncluded} seats included</span>
                <span className="mono">${base} / mo</span>
              </div>
            )}
            <div className="row row--between mb3"><span className="body01 t2">Billing cycle</span><span>{annual ? 'Annual' : 'Monthly'}</span></div>
            {annual && <div className="row row--between mb3"><span className="body01 t2">Annual discount</span><span className="check">−{discountPct}% applied</span></div>}
            {annual && <div className="row row--between mb3"><span className="body01 t2">Billed for 12 months</span><span className="mono">${perMonth} × 12</span></div>}
            <div className="divider" style={{ margin: '16px 0' }} />
            <div className="row row--between"><span className="h02">Would be due today</span><span className="h03 mono">${subtotal.toLocaleString()}</span></div>
            <p className="helper mt2">{annual ? '12 months, renews annually' : 'Renews monthly'} · cancel any time by contacting support</p>

            {err && (
              <div className="mt5">
                <Notif kind="error" title="Checkout did not complete">
                  {err} Nothing was charged and your plan is unchanged.{' '}
                  <a href={supportMailto('Paid plan enquiry — ' + planName)}>Email {SUPPORT_EMAIL}</a> to arrange a paid plan.
                </Notif>
              </div>
            )}

            <button className="btn btn--primary mt6" style={{ width: '100%' }}
              disabled={state !== 'idle'} onClick={pay}>
              {state === 'idle' ? 'Continue · $' + subtotal.toLocaleString()
                : state === 'busy' ? 'Checking…' : 'Plan updated ✓'}
            </button>
            <p className="helper mt3">
              This asks the server to activate the plan. While payments are unavailable it will decline —
              it never charges a card, because there is no card and no processor.
            </p>
          </div>
        </div>
      </div>
      <NavBar back="/pricing" />
    </>
  );
}
