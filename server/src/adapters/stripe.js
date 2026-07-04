// Mock payments adapter.
// Production swap: replace with Stripe Checkout Sessions + webhooks,
// keeping the same return shape.

import { PLANS } from '../catalog.js';

export async function charge({ plan, cycle, seats }) {
  const p = PLANS[plan];
  if (!p || p.monthly === null) throw new Error('Plan not chargeable');
  const per = cycle === 'annual' ? p.annual : p.monthly;
  const total = cycle === 'annual' ? per * seats * 12 : per * seats;
  const next = new Date();
  if (cycle === 'annual') next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return {
    ok: true,
    total,
    currency: 'USD',
    receiptId: 'rcpt_' + Math.random().toString(36).slice(2, 10),
    nextInvoice: next.toISOString().slice(0, 10)
  };
}
