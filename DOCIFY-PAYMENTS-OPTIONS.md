# How Docify Collects Money — Options for an India-Based Founder

*Researched 1 August 2026. Not legal or tax advice — a practising Indian CA must confirm anything GST/FEMA-related.*

# Collecting Recurring Payments as a Solo Indian Founder Selling to US/EU (August 2026)

> **Not legal, tax, or financial advice.** I am not a licensed advisor. Payment-provider pricing and RBI/GST rules change frequently, and several sources below are vendor-authored (competitors reviewing each other). **Have a practising Indian CA confirm anything GST/FEMA/FIRA-related before you act, and confirm live pricing on each provider's own pricing page on the day you sign up.**

---

## 0. The single most important correction up front

**The RBI e-mandate / card-on-file tokenisation regime largely does not apply to your business.**

Per [Stripe's India recurring payments docs](https://docs.stripe.com/india-recurring-payments): e-mandate requirements apply to **India-issued cards and UPI**. "International cards are **not** subject to India's e-mandate requirements." International recurring subscriptions are explicitly supported and unrestricted.

So the ₹15,000 AFA threshold, the 24-hour pre-debit notification, the 26-hour card charge delay, the UPI ₹15,000 recurring cap — none of that touches a US or EU customer paying with a US/EU card. Your problem is **not** RBI recurring rules. Your problem is **getting a merchant account at all**, plus **export/GST paperwork on the money landing in India**.

(For completeness, the [2026 revised RBI e-mandate framework](https://www.indialaw.in/blog/banking-and-finance/rbi-e-mandate-framework-2026/) standardises rules across cards, UPI and PPIs, keeps the ₹15,000 no-AFA ceiling for general recurring, raises it to ₹1,00,000 for specified categories like insurance/MF/credit-card bills, and mandates a 24h pre-debit opt-out notice. Relevant only if you later sell to Indian customers.)

---

## 1. Stripe India

| Question | Answer (Aug 2026) |
|---|---|
| Can a new Indian business onboard? | **No, not by self-serve.** Stripe India has been **invite-only since 2024** and remains so. |
| Can it charge international customers? | Yes — if you get in, and if you opt into exports. |
| Recurring for US/EU cards? | Fully supported, RBI e-mandate rules don't apply. |

**Details:**
- [Stripe support](https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india): "businesses from India can't sign up for a new Stripe account through our website, and must request an invite instead." Stripe states it supports "a select number of businesses, with a focus on international expansion." Selection criteria are not public; anecdotally it favours businesses with existing volume — **a pre-revenue solo founder is unlikely to be invited.** *(The "unlikely" part is inference from reported founder experience, not a Stripe statement — mark as unverified.)*
- If you did get in, per [Stripe's India exports docs](https://docs.stripe.com/india-accept-international-payments):
  - Must be a **registered entity** (sole proprietorship, LLP, or company) — **individual accounts cannot accept international payments.**
  - **IEC (Importer Exporter Code)** from [DGFT](https://dgft.gov.in/CP/) — optional for services-only businesses *unless* you accept AMEX international or claim Foreign Trade Policy benefits.
  - Must select a single **RBI transaction purpose code** (for SaaS, the P08xx "Computer/IT services" range, likely P0802/P0807 — confirm with your CA/AD bank).
  - **Payouts settle in INR only.**
  - **3DS is mandatory** on international cards.
  - Stripe's FIRC substitute: **Standard Chartered issues a monthly "payment advice"** to your registered email listing export charges in each payout. This is the document your CA will use — it is *not* a classic bank FIRC.

**Verdict: treat Stripe India as unavailable.** Request an invite for optionality, but do not build a plan around it.

---

## 2. Merchant-of-Record options — the section that matters most

An MoR becomes the **legal seller** to your customer. It collects, charges/remits US sales tax, EU VAT, UK VAT, AU/CA GST etc., owns chargebacks, then pays you as a **supplier**. This removes essentially the entire foreign indirect-tax burden — the thing a solo founder cannot realistically do across 30+ jurisdictions.

### Comparison (list prices, Aug 2026 — verify before signing)

| Provider | Headline fee | Surcharges | India sellers? | Onboarding friction |
|---|---|---|---|---|
| **Dodo Payments** | **4% + $0.40** (US domestic); India domestic 4% + $0.15 | +1.5% intl cards/APMs, +0.5% subscriptions, +3% BNPL/PayPal, $30 dispute, $1 refund, $25 USD SWIFT payout for non-US | **Yes — explicitly. India-founded (Bengaluru), no registered company required, PAN mandatory** | Lowest. Individual/sole-prop accepted |
| **Polar** | Starter (free) **5% + 50¢**; Pro $20/mo 3.8%+40¢; Growth $100/mo 3.6%+35¢; Scale $400/mo 3.4%+30¢ | +1.5% non-US cards; payouts $2/mo + 0.25% + $0.25; FX 0.25%–1% | **Yes — India is on the [supported-countries list](https://polar.apidocumentation.com/documentation/polar-as-merchant-of-record/supported-countries)** (payouts via Stripe **Connect Express**, whose country coverage is far broader than Stripe Payments India) | Low |
| **Paddle** | **5% + 50¢** | FX margin on payout claimed at ~2–3% over mid-market *(claimed by competitor blog — unverified)* | **Not excluded** — [Paddle's unsupported list](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle) (Russia, Iran, Cuba, NK, etc.) does **not** include India | **Highest risk.** Documented rejections of pre-revenue/no-processing-history sellers; typical review 3–7 business days, some report 2–3 cycles |
| **Creem** | **3.9% + $0.40** | +2% revenue splits, +2% affiliates, +5% cart recovery, intl payout **$7 or 1% (whichever higher)** | Not explicitly documented for India — **unverified** | Reported ~8h approval, but large waitlist |
| **Lemon Squeezy** | Legacy ~5% + 50¢ | — | Historically supported India | **Do not start here.** Being folded into **Stripe Managed Payments**; [LS says](https://www.lemonsqueezy.com/blog/2026-update) no shutdown date but heavy users should plan migration |
| **Stripe Managed Payments** | **+3.5% on top of standard Stripe fees** → ~**6.4% + $0.30** US domestic; 8–10%+ on intl w/ FX | — | **Effectively no** — rollout is primarily US-based businesses in good Stripe standing; India is invite-only upstream | N/A for you |
| **FastSpring** | Negotiated, typically **5.9% → 3.9%** by volume; ranges of 5–8% cited | Pro-services fees $5k–$50k for custom work | Not documented for India — **unverified** | Enterprise sales motion; wrong fit at 0 customers |

### What the MoR actually removes
- **US sales tax:** yes — MoR registers/remits in economic-nexus states. You never file a US return.
- **EU VAT (incl. OSS/MOSS for digital services):** yes — MoR charges and remits. This is the biggest single win; without an MoR, a non-EU seller of B2C digital services technically needs non-Union OSS registration from the **first euro** (no threshold).
- **UK VAT, CA/AU GST, JP CT, etc.:** yes, in each provider's covered jurisdictions.
- **Invoicing, dunning, chargebacks, PCI:** yes.
- **Indian GST/FEMA on the money you receive:** **NO.** Still 100% yours. See §5.

### Flags specific to Indian founders
1. **Dodo Payments is the only one built for this problem.** Founded 2023 in Bengaluru by Rishabh Goel and Ayush Agarwal explicitly for founders locked out of Stripe. Onboards individuals/sole proprietors; PAN mandatory; payout minimum **$50**; bi-monthly payout default (1–15 → 18th; 16–EOM → 4th).
2. **Polar is the cheapest credible second option** and India is confirmed on the payout list — the Stripe Connect Express distinction is the key mechanism (you don't need Stripe India to receive Polar payouts).
3. **Paddle is the most mature but riskiest to *apply* to pre-revenue.** A March 2026 rejection with no appeal is documented; a [2024 HN thread](https://news.ycombinator.com/item?id=41179262) describes the same chicken-and-egg ("rejected because I have no processing statements").
4. **The FIRA gap is real and under-discussed.** Multiple India-focused sources note **Paddle provides no India-format FIRA/eFIRC auto-generation**. [niryatbox's Dodo FIRA analysis](https://niryatbox.com/blog/dodo-payments-fira-firc-india-saas-exporters) is blunt: MoR payout ≠ automatic FIRA; INR and global-currency payout paths are handled differently with different documents; **test with one small payout and get your bank to confirm in writing** that it will issue FIRA/FIRC-style evidence before you scale.

⚠️ **Source-bias warning:** Dodo's blog reviews Paddle/Polar/Creem/FastSpring; Creem's blog reviews Dodo; Fungies reviews everyone; Skydo and Xflow review each other. Treat all comparative fee claims from these as directional, and confirm on the vendor's own pricing page.

---

## 3. Indian gateways + PayPal (you stay merchant of record)

### Razorpay
- **International cards: ~3%** per transaction; **Subscriptions add ~0.99–1%**; **+18% GST on fees**. So an international recurring charge lands near **~4.7% all-in**.
- Supports 130–160+ currencies; [holds a final RBI cross-border PA-CB licence](https://razorpay.com/blog/razorpay-rbi-cross-border-licence-global-payments/).
- **EEFC multi-currency settlement** available for international card payments in USD/EUR/GBP/AED/SGD with zero INR conversion — genuinely useful if you want to hold USD.
- **Activation is the catch:** you must be fully KYC'd and live on domestic payments *first*, then apply for international enablement; approval is bank-dependent and Razorpay itself suggests supplying existing invoices/FIRA/settlement reports to help win approval — again hard at zero revenue.
- **International recurring is the weak spot.** Razorpay's own subscription content is written around *collecting from Indian customers* under RBI mandates, not Indian merchants billing foreign cards. **I could not verify that Razorpay Subscriptions reliably supports card-on-file recurring on foreign-issued cards — treat as unverified and ask their sales team directly before relying on it.**

### Cashfree
- **International payment gateway: 2.99%** standard (a 2.69% promo ran Sep 18–Dec 31 2025 for new signups with ≤₹1 Cr monthly GTV and ≥40% UPI GTV — **expired**).
- **Global Collections** (bank-transfer rails, not cards): **1–1.5%** depending on volume, 30+ currencies, 150+ countries, INR settlement in ~48h, **cap of USD 10,000 per invoice**.
- Subscriptions/e-mandates exist but are built around **Indian** netbanking/card/UPI mandates.
- Same activation gate as Razorpay.

### PayPal (India business)
- **4.4% + fixed fee** ($0.30 USD) on international commercial receipts, **plus 3–4% FX markup** on USD→INR → realistically **~7.5–8.5% all-in**. Micropayments tier 6% + $0.05.
- **India cannot hold foreign-currency balances.** PayPal auto-converts and auto-withdraws to your Indian bank account daily (manual withdrawal unavailable). Domestic INR receiving was discontinued 1 April 2021 — **international USD only**, which is exactly your use case.
- **Subscriptions/recurring are available** on PayPal Business.
- **Since early 2026 PayPal India issues automated weekly digital FIRA** for business accounts — a real compliance advantage over most MoRs.
- **Verdict:** most expensive, but the **fastest to activate**, works today, and gives you FIRA. Perfectly reasonable as customer #1–5 infrastructure.

### Honourable mention: export-collection rails (not gateways)
Not subscription tools, but relevant for invoice-based B2B:
- **Skydo** — flat **$19+GST** up to $2,000; **$29+GST** for $2,001–$10,000; **0.30%+GST** above $10,000; **mid-market FX, no markup**; **instant FIRA on every transaction**; holds final **RBI PA-CB authorisation granted 9 Jan 2026**; ISO 27001:2022 + SOC 2. On a $2,000 invoice that's ~1%; on a $10,000 invoice ~0.3%.
- **Xflow** — comparable positioning, automated compliance/FIRA.

For a $2,000 annual contract, Skydo at ~$19 beats an MoR at ~5–7% ($100–140) by a wide margin — **but you then owe all the foreign VAT/sales-tax compliance yourself.** That trade is fine at 5 customers, dangerous at 200.

---

## 4. The "incorporate in the US" route

**Cost & timeline:**
- **Stripe Atlas: $500 one-time** — Delaware C-Corp formation, year 1 registered agent, EIN handling, 83(b) workflow, partner perks. **~$100/yr** registered agent thereafter. Formation typically days; EIN for a foreign founder without SSN can take weeks.
- Ongoing US costs (not in the $500): Delaware franchise tax + annual report (**$450+/yr minimum for most small C-Corps**), US federal return + **Form 5472/1120** for foreign-owned entities (penalty for missing 5472 is **$25,000**), BOI/CTA reporting *(BOI's applicability to domestic entities has swung with litigation and rulemaking — **verify current status**)*, US bookkeeping/CPA typically **$1,000–3,000/yr**.

**The India-side cost nobody quotes:**
- An Indian resident owning a foreign company is an **Overseas Investment** under FEMA. Depending on structure it goes via **ODI** (through an Indian entity, routed through your AD bank, **often months**) or via **LRS** as a resident individual under the **Overseas Investment Rules/Regulations 2022**. There are restrictions on layering, round-tripping and financial-services activity.
- Plus ongoing: **Form APR/OPI annual reporting**, **Schedule FA** disclosure in your ITR (non-disclosure of foreign assets carries Black Money Act exposure), and Indian tax on worldwide income.
- **This is the single most-underestimated item in "just do Stripe Atlas."** Get a CA who has actually filed ODI/LRS-route overseas investments before you spend the $500.

**Verdict at 0 customers: overkill.** $500 is cheap; the recurring **$1,500–4,000/yr** of US+India compliance, plus months of FEMA process, plus personal Black Money Act exposure for a filing slip, is not. **Revisit when you have ~$5–10k MRR, a US-investor requirement, or MoR fees clearly exceed the compliance cost** (roughly: an MoR costs you ~5–6% vs Stripe US ~2.9% + your own tax stack — the ~3% delta only pays for a US entity somewhere north of ~$8–10k MRR, and even then only if you actually want the entity).

---

## 5. Indian export-of-services compliance (the part that is yours regardless)

### GST on export of services
- Software/SaaS supplied to a foreign recipient is **zero-rated** under **Sec. 16, IGST Act**, provided all five conditions of **Sec. 2(6), IGST Act** are met: supplier in India, recipient outside India, place of supply outside India, **payment received in convertible foreign exchange (or INR where RBI permits)**, and supplier & recipient are not merely establishments of the same person.
- **File an LUT in Form RFD-11** (annually, per financial year) to export **without paying IGST upfront**. Otherwise you pay IGST and claim refund — worse for cash flow.
- Report exports in **GSTR-1 Table 6A**, reconcile with **GSTR-3B**. ITC refunds claimed via **Form RFD-01** with FIRC/BRC proof.
- **GST registration**: export of services is inter-state supply; registration thresholds/exemption for zero-rated exporters are a live, fact-specific question — **ask your CA**, do not assume you're exempt.

### FIRC / FIRA
- **FIRA (Foreign Inward Remittance Advice)**, successor to FIRC, is your primary proof that payment came in convertible foreign exchange. Your AD bank or PA-CB provider issues it.
- Who gives you clean FIRA today: **Skydo** (instant, per transaction), **Xflow**, **PayPal India** (weekly automated digital FIRA since early 2026), **Cashfree/Razorpay** (via their export products), **Stripe India** (monthly Standard Chartered payment advice).
- Who is murky: **most MoRs**, notably **Paddle** (no India-format FIRA generation) and **Dodo** (documented as *not* automatic; depends on payout path).

### Does an MoR change who owes what?
**Yes for foreign tax. No for Indian tax — and it can complicate it.**

- **Foreign indirect tax (US sales tax, EU/UK VAT, AU/CA GST):** shifts entirely to the MoR. You owe nothing, register nowhere. This is the whole value proposition.
- **Indian GST:** your supply is now to **the MoR entity**, not the end customer. If the MoR entity is **foreign** (Paddle.com Market Ltd — UK; Polar's contracting entity; FastSpring — US), your recipient is outside India and the export/zero-rating analysis can still work. **If the contracting/paying entity is Indian, that leg could become a domestic supply attracting 18% GST** — a material risk with an India-headquartered MoR. **Confirm which legal entity contracts with you and which entity remits your payout, in writing, before onboarding.**
- **Indian direct tax:** MoR payouts are your business income, taxed normally. Unchanged.
- **The documentation problem:** you invoice/receive from the MoR, while your "customers" have receipts in the MoR's name. Your export file must hang together — contract, MoR statements, your payout invoice, and bank FIRA — as a single coherent trail. Several India-focused sources warn this is exactly where MoR users get caught in GST refund scrutiny.

**Concrete action:** before scaling on any MoR, run **one small real payout**, take the resulting bank credit + MoR documents to your AD bank and CA, and get confirmation that (a) the bank will issue FIRA-style evidence and (b) the CA is comfortable with the zero-rated export position. Cheap insurance.

---

## 6. What founders actually do for the first 5–20 customers

**Manual invoicing is normal, correct, and what most B2B SaaS actually does at this stage.** This is not a hack or a compromise.

- Most early B2B SaaS gets paid by **invoice**, not by self-serve subscription — no automated card-on-file, no dunning logic.
- The common failure mode is the opposite of what founders fear: **overbuilding billing before validating how customers want to pay** — weeks on Stripe Billing, pricing tiers, proration and AR automation before anyone has paid.
- **US/EU B2B buyers expect and often prefer invoicing** — many mid-size finance teams cannot pay a SaaS subscription by corporate card anyway; they want a PO, an invoice, NET-30, and ACH/wire.
- **Payment links** are the sweet spot: send a link, customer pays, no billing platform. Useful for one-off signup fees, custom upgrades, and manual renewals.

**Practical first-customer stack (deploy this week):**
1. **Annual contracts, paid upfront by invoice.** Solves recurring billing by eliminating it — one payment per customer per year. Also better for cash and churn.
2. **Collection rail:** Skydo/Xflow invoice (cheapest, instant FIRA) for larger B2B invoices, or a **PayPal invoice/link** if the customer insists on card and you want zero setup. Razorpay international payment link if/when enabled.
3. **A real invoice** with your GSTIN, "Supply meant for export of services under LUT — no IGST payable", LUT ARN, SAC code (9983xx/9973xx range — confirm with CA), customer's foreign address, and USD amount.
4. **File your LUT** for FY 2026-27 if you haven't.
5. **Save every FIRA.**

Do **not** build subscription billing until customers are asking to pay monthly by card, or you're above ~10–15 customers where manual renewal chasing actually costs you time.

---

## 7. Recommendation ranking — 0 customers today, first 5–20 US/EU customers, minimum setup

### Tier 1 — do this now (week 1)

**① Manual annual invoicing via Skydo (or Xflow) + LUT filed.**
- **Cost:** ~$19–29 flat per invoice, mid-market FX, instant FIRA. On a $2,000 annual contract that's **~1%** vs ~6% for an MoR.
- **Setup:** days. RBI-licensed PA-CB (Skydo's final authorisation, 9 Jan 2026). Cleanest possible Indian compliance trail.
- **Trade-off:** *you* are the merchant of record, so **you** own EU VAT / US sales-tax exposure. At 5–20 customers with mostly B2B buyers this is a manageable, deliberately-accepted risk — B2B EU sales generally reverse-charge to the customer if you collect a valid VAT number, and US sales-tax nexus for a foreign seller at this volume is negligible. **Get your CA's sign-off on this reasoning; it does not hold for B2C.**
- **Why first:** cheapest, fastest, most compliant on the India side, and it forces you to talk to your first customers about pricing.

### Tier 2 — set up in parallel, switch on when you want self-serve (weeks 2–6)

**② Dodo Payments** — best MoR fit for an Indian solo founder.
- Onboards individuals/sole proprietors, PAN-based KYC, no company required. Built by Indian founders for exactly your situation. 4% + $0.40 base, +0.5% subscriptions, +1.5% intl cards → **~5.3% on a US customer, ~6.8% on an EU customer.** $50 payout minimum.
- **Mandatory diligence before scaling:** confirm in writing (a) **which legal entity** invoices you and pays you — if it's an Indian entity, get your CA's view on whether your leg is still a zero-rated export; (b) whether your bank will issue FIRA on that payout. Run one small payout first.

**③ Polar** — best pure-economics MoR, India confirmed on the payout list.
- Starter free tier 5% + 50¢ (+1.5% non-US cards, + small payout fees). Upgrade to Pro ($20/mo, 3.8%+40¢) only above **~$1,379/mo** in sales. India is on the supported-countries list via Stripe **Connect Express** — you do not need Stripe India.
- Same FIRA/entity diligence applies. Note: the legacy **4% + 40¢ "Early Member"** rate is gone for orgs created after 27 May 2026.

### Tier 3 — apply opportunistically, don't depend on it

**④ Paddle** — most mature MoR, best tax coverage, best B2B invoicing/enterprise features. **But apply expecting rejection at zero revenue**, and know that its India FIRA story is the weakest. Revisit at real MRR.

**⑤ PayPal India** — ~7.5–8.5% all-in and ugly FX, but activates fastest, supports subscriptions, and gives you **automated weekly digital FIRA**. Keep it as a fallback for the one customer who insists on paying by card *today*.

**⑥ Razorpay / Cashfree international** — good rates (~3–4.7% all-in for Razorpay recurring; Cashfree Global Collections 1–1.5%) and excellent India compliance, **but** you must be live on domestic first, international enablement is bank-discretionary and hard pre-revenue, and **international card recurring is unverified**. Start the application now so it's ready in 3–6 months; don't wait on it.

### Tier 4 — not now

**⑦ Stripe India** — request an invite for optionality; assume no.

**⑧ Creem / FastSpring** — Creem's headline 3.9%+$0.40 is attractive but India support is undocumented and payout fees ($7-or-1% intl) bite at small ticket sizes. FastSpring is enterprise-motion and wrong at this stage.

**⑨ Stripe Atlas / Delaware C-Corp / US LLC** — **overkill and actively risky at pre-revenue.** $500 up front is trivial; **$1,500–4,000/yr** of dual-country compliance, months of FEMA ODI/LRS process, and personal Black Money Act exposure are not. Revisit at ~$5–10k MRR or when an investor requires it.

**⑩ Stripe Managed Payments / Lemon Squeezy** — SMP is the most expensive MoR (~6.4%+ domestic, 8–10%+ international) and effectively US-only right now; LS is in migration limbo. Don't start on either.

---

## 8. Decision shortcut

```
Customer will pay annually by invoice/wire?  →  Skydo/Xflow  (~1%, clean FIRA)   ← do this for #1–10
Customer insists on card, today, one-off?    →  PayPal invoice (~8%, has FIRA)
You want self-serve monthly subscriptions?   →  Dodo Payments (India-native) or Polar (cheapest)
Above ~$5–10k MRR and MoR fees hurt?         →  Then evaluate Razorpay/Cashfree direct, or a US entity
```

**Three things to do this week, in order:**
1. **File your LUT** (Form RFD-11) for FY 2026-27 — free, 10 minutes, and everything else depends on it.
2. **Open a Skydo (or Xflow) account** — start invoicing your first customers annually.
3. **Book 45 minutes with a CA who has filed GST export refunds and handled MoR payouts** — specifically to pressure-test (a) your zero-rating position, (b) whether you need GST registration at your volume, and (c) what FIRA evidence your bank will accept from an MoR payout.

**Explicitly unverified / needs your own confirmation:**
- Razorpay Subscriptions support for card-on-file recurring on **foreign-issued** cards.
- Whether Creem and FastSpring accept India-based sellers.
- Paddle's actual FX margin on INR payouts (2–3% figure is competitor-sourced).
- Current BOI/CTA reporting applicability for a new US entity.
- Which legal entity each MoR uses to contract with and pay an Indian supplier — **the single highest-value question for your GST position, and none of the public docs answer it.**

---

**Sources:**
- [Stripe: India recurring payments](https://docs.stripe.com/india-recurring-payments)
- [Stripe: Accept international payments from India](https://docs.stripe.com/india-accept-international-payments)
- [Stripe Support: Accounts are invite-only in India](https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india)
- [Stripe Managed Payments](https://stripe.com/managed-payments) · [Paddle's analysis of SMP](https://www.paddle.com/resources/stripe-managed-payments) · [Dodo: SMP fees explained](https://dodopayments.com/blogs/stripe-managed-payments-fees-explained)
- [RBI E-Mandate Framework 2026 (India Law)](https://www.indialaw.in/blog/banking-and-finance/rbi-e-mandate-framework-2026/) · [Outlook Business](https://www.outlookbusiness.com/ampstories/news/rbi-e-mandate-framework-2026-new-rules-for-auto-pay-upi-cards-wallets) · [Policy Edge](https://www.policyedge.in/p/rbi-standardises-recurring-payment-rules-with-revised-e-mandate-framework)
- [Polar: Fees](https://polar.sh/docs/merchant-of-record/fees) · [Polar: Supported countries](https://polar.apidocumentation.com/documentation/polar-as-merchant-of-record/supported-countries)
- [Dodo Payments: Pricing](https://dodopayments.com/pricing) · [Dodo Payments: FAQ](https://docs.dodopayments.com/miscellaneous/faq)
- [Paddle: Which countries are supported](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle) · [Paddle: Which countries does Paddle charge sales tax/VAT for](https://www.paddle.com/help/sell/tax/which-countries-does-paddle-charge-sales-tax-or-vat-for) · [HN: Paddle rejection, no processing statements](https://news.ycombinator.com/item?id=41179262) · [ShubHQ: why processors reject SaaS in 2026](https://shubhq.com/blog/payment-processor-compliance-trap/)
- [Lemon Squeezy: 2026 update](https://www.lemonsqueezy.com/blog/2026-update) · [Stripe acquires Lemon Squeezy](https://www.lemonsqueezy.com/blog/stripe-acquires-lemon-squeezy)
- [Creem: Best MoR for SaaS 2026](https://www.creem.io/blog/best-merchant-of-record-saas-2026) · [Dodo: Creem.io review](https://dodopayments.com/blogs/creem-io-review) · [Fungies: MoR pricing guide 2026](https://fungies.io/merchant-of-record-pricing-guide-2026/) · [Dodo: FastSpring pricing explained](https://dodopayments.com/blogs/fastspring-pricing-explained)
- [Razorpay: Accept international payments](https://razorpay.com/accept-international-payments/) · [Razorpay docs: International payments](https://razorpay.com/docs/payments/international-payments/) · [Razorpay: RBI cross-border licence](https://razorpay.com/blog/razorpay-rbi-cross-border-licence-global-payments/) · [Razorpay: EEFC settlement](https://razorpay.com/blog/razorpay-eefc-for-international-card-payments/) · [Razorpay: MoR vs international gateway](https://razorpay.com/blog/merchant-of-record-vs-international-payment-gateway-decision-guide/)
- [Cashfree: International payment gateway](https://www.cashfree.com/international-payment-gateway/) · [Skydo: Cashfree international charges](https://www.skydo.com/blog/cashfree-international-payments)
- [Skydo: PayPal fees in India 2026](https://www.skydo.com/compare/paypal-pricing) · [Skydo: PayPal business account for Indian exporters](https://www.skydo.com/blog/paypal-business-account-for-indian-exporters) · [PayPal IN: Recurring payments](https://www.paypal.com/in/business/accept-payments/checkout/recurring)
- [Xflow: Skydo review](https://www.xflowpay.com/blog/skydo-review) · [Xflow: Export of services under GST](https://www.xflowpay.com/blog/export-of-services-under-gst) · [niryatbox: Skydo vs Xflow vs Dodo for Indian exporters](https://niryatbox.com/blog/skydo-xflow-dodo-payments-india-exporters-comparison)
- [niryatbox: Dodo Payments FIRA/FIRC for India SaaS exporters](https://niryatbox.com/blog/dodo-payments-fira-firc-india-saas-exporters) · [Skydo: FIRA & LUT guide for SaaS exporters](https://www.skydo.com/blog/fira-gst-refund-saas-exporters-india) · [Karbon: LUT & GST exports](https://www.karboncard.com/blog/lut-gst-exports-guide) · [DGFT: GST and Exports (PDF)](https://content.dgft.gov.in/Website/GAE.pdf)
- [Stripe Atlas pricing 2026](https://sparklaun.ch/compare/stripe-atlas) · [Stripe Atlas for Indian founders](https://www.globalsolo.global/blog/stripe-atlas-indian-founders-invite-only-guide-2026) · [FEMA Expert: Form ODI filing guide 2026](https://femaexpert.com/fema-expert-blogs/form-odi-filing-guide-2026-rbi-rules-process-compliance-for-indian-businesses/) · [Accorp: LRS vs ODI for Indian founders](https://accorppartners.com/blogs/cpa-services/apr/lrs-vs-odi-which-route-should-an-indian-founder-use-to-fund-their-foreign-company)
- [Mercury: How SaaS founders can get paid before setting up Stripe Billing](https://mercury.com/blog/saas-founders-stripe-billing) · [Wise: Payment links guide](https://wise.com/us/blog/payment-links)