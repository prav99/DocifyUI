// Mock payments adapter.
// Production swap: replace with Stripe Checkout Sessions + webhooks,
// keeping the same return shape.

import { PLANS } from '../catalog.js';

// No real processor is wired up yet, so this returns false and callers must
// refuse to grant a paid plan. Flip it only when a genuine payment provider
// (and its webhook confirmation) is in place — an unpaid self-upgrade would
// make every plan limit on the server decorative.
export const paymentsLive = () => Boolean(process.env.PAYMENTS_PROVIDER);

export async function charge({ plan, cycle, seats }) {
  const p = PLANS[plan];
  if (!p || p.monthly === null) throw new Error('Plan not chargeable');
  // Setting PAYMENTS_PROVIDER is what opens the checkout route (api.js), but
  // this file still takes no money. Refusing here is the difference between
  // "payments are not switched on" and "we issued a receipt for a payment that
  // never happened, and upgraded the account on the strength of it" — so the
  // env var alone can never grant a plan.
  if (paymentsLive()) {
    throw new Error('PAYMENTS_PROVIDER is set, but no payment integration is implemented yet — nothing was charged. Unset it, or wire up a real processor before enabling checkout.');
  }
  const per = cycle === 'annual' ? p.annual : p.monthly;
  const total = cycle === 'annual' ? per * seats * 12 : per * seats;
  const next = new Date();
  if (cycle === 'annual') next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return {
    // `simulated` travels with the receipt so nothing downstream can present
    // this as evidence of a real payment.
    ok: true,
    simulated: true,
    total,
    currency: 'USD',
    receiptId: 'sim_' + Math.random().toString(36).slice(2, 10),
    nextInvoice: next.toISOString().slice(0, 10)
  };
}
