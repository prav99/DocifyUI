# Docify — Pricing Strategy Redesign

**Date:** 1 August 2026 · **Status:** implemented (see §12)
**Inputs:** product understanding and docs-market benchmark from `DOCIFY-BUSINESS-ANALYSIS.md` (31 Jul 2026); fresh adjacent-market research verified 1 Aug 2026; all market figures carry sources in the research appendix. No fabricated numbers: modeled figures are labeled.

## 1. Analysis of the current pricing page

Three tiers: Free (1 source, 5 watermarked generations, PDF/Word) · Team **$26/user/mo annual, $32 monthly** (everything unlimited) · Enterprise (custom, no floor). Problems: (a) **wrong value metric** — automation value scales with pipelines and documents, not logged-in humans; per-user pricing punishes adding reviewers, the exact behavior the product wants; (b) **unlimited generations = unbounded Anthropic COGS** with no upgrade path; (c) **a missing rung** between Free and Team for the indie/duo segment the GTM outbound targets; (d) **price-as-signal risk** — $26/seat next to Mintlify $450/workspace reads "toy," not "bargain"; (e) no trial, no guarantee, no trust row.

## 2. Competitive pricing benchmark (verified 31 Jul – 1 Aug 2026)

**Docs platforms:** Mintlify Starter $0 → Pro **$450/mo annual** + $0.01/credit (AI gated to Pro+); ReadMe $0 → Pro **$250/mo** (+$150 Ask AI, $20/extra admin) → Enterprise $3,000+; GitBook Premium $65/site+$12/user → Ultimate $249/site+$12/user; Document360 quote-only; Archbee $80/$350 flat; Doctave $99/$399; Promptless **$500–$4,000/mo** by page count; Theneo $120–400; Fern Docs $0/$150/custom.
**Adjacent AI dev tools (the price anchors in your buyer's head):** GitHub Copilot Business **$19/seat** + credit pool, Enterprise $39/seat; Cursor Pro $20, Teams **$40/seat**; CodeRabbit Pro **$24/seat annual**, Pro Plus $48; Devin Pro $20, **Teams $80 base + $40/seat**; Atlassian Rovo Dev **$20/dev** + 2,000 credits, 30-day trial.
**Patterns:** (1) hybrid seat + credit/usage pool is now the dominant AI pricing model; (2) 20% annual discount is the norm; (3) trials 14–30 days, mostly card-free; (4) enterprise = SSO/audit/SLA behind "contact us," usually with a real floor; (5) base+seat hybrids exist at scale (Devin Teams, GitBook site+seats) — buyers understand them.

## 3. Market positioning recommendation

**Value-for-money freemium with hybrid team pricing.** Not budget (signals toy and attracts churny buyers), not premium (no brand, no case studies yet — the analysis's honest constraint), not pure usage-based (unpredictable bills are the #1 complaint against Mintlify's credits). Docify enters as *"the governed documentation platform that costs less than one AI code-review seat per person"*: Team at $79/mo ÷ 5 seats ≈ **$16/person — under every adjacent anchor** (Copilot $19, Rovo $20, Cursor $40, CodeRabbit $24) and **5.7× under Mintlify Pro** with a governance feature set none of them have. Rejected alternatives: repository-based (penalizes microservice teams arbitrarily), pure credits (bill anxiety), doc-volume (unmeasurable pre-sale), pure seats (see §1a).

## 4–6. The new structure, matrix, and rationale

| | **Free** | **Starter** | **Team** ⭐ Most popular | **Enterprise** |
|---|---|---|---|---|
| Price monthly | $0 | $29 | $99 | Custom, annual |
| Price annual (−20%) | $0 | **$24/mo** | **$79/mo** | Custom |
| Seats | 1 | 2 | **5 included, +$12/seat** | Custom |
| Sources | 1 | All | All | All |
| Generations/mo | 5 (watermarked) | 60 | 250 pooled, fair use | Custom |
| Automation pipelines | — | 1 | 10 | Unlimited |
| Export formats | PDF, Word | All except DITA | All incl. DITA | All |
| AI quality pipeline | Overview only | Full | Full + readiness | Full + custom rules |
| Usage analytics | — | — | ✓ | ✓ |
| SSO (SAML/OIDC) / audit logs | — | — | — | ✓ |
| Support | Community | Email | Priority | Dedicated + SLA |
| Security | Read-only OAuth everywhere | ← | ← | + DPA, security review, invoicing/PO |

**Why Team is the highlighted plan:** it is the first tier with the full automation story (10 pipelines), maps to the ICP (5–50-dev API-first teams), and its $79 五-seat framing produces the strongest per-person arithmetic on the page. **Why a Starter rung:** the GTM outbound targets indie/duo builders; $29 was the price the original GTM research validated, and it sits below the $30–40 "no-approval-needed" expense threshold. **Why generation caps:** every AI generation costs real Anthropic tokens; caps convert unbounded COGS into the upgrade path (the lesson of Mintlify's credit system) while "500 pooled, fair use" avoids credit-anxiety framing. **Why a base+seat hybrid:** captures pipeline value from small heavy teams (floor) without punishing seat expansion ($12 marginal seat is the cheapest in the market). **Enterprise:** keep "Custom" on the page; hold an internal floor of **$500–1,000/mo billed annually** (ReadMe's public floor is $3,000 — there is room), gate SSO/audit/DPA there per market norm.

**Trial:** 14-day Team trial, **no credit card** (norm: CodeRabbit 14d, Rovo 30d). **Guarantee:** 30-day money-back on annual plans (cheap trust at this stage; annual is prepaid). **Grandfathering:** existing $26 signups keep their price forever. **Founding-customer offer** (GTM): first 20 get 50% off Team for life.

## 7. Comparison snapshot for sales use

A 5-person team: Docify Team **$79/mo** vs Mintlify Pro $450 + credits vs ReadMe Pro $250 + $150 AI vs GitBook Ultimate $249+$60 seats vs Promptless $500 — with Docify the only one combining merge-triggered updates, a numeric quality gate, span-level human review, DITA/Word export, and an AI-readiness score.

## 8. Justification summary (per decision)

Every number traces to one of: verified competitor price (§2), the GTM plan's validated price points ($29/$99), the COGS constraint (caps), the ICP definition (5-seat inclusion), or a stated market norm (20% annual, 14-day trial). No number is aspirational-ARR-driven; at this stage pricing is a positioning instrument, not a revenue maximizer — the modeled customer ROI (§9) leaves >10× headroom for later increases once case studies exist.

## 9. ROI calculator — updated assumptions and formulas

Unchanged inputs: releases/mo (4), team doc-hours/release (11, labeled internal assumption), loaded rate ($95, BLS-derived). Unchanged formula: `current = releases × hours × rate`. **Changed:** `docify = base + max(0, people − 5) × 12` where base = $79 annual / $99 monthly (was `people × 26`). Break-even = `docify ÷ rate` — defaults now give **$130 → $79/mo and 1.4 h → 0.8 h (~50 min)**: the story got *stronger*. Verified consistent across: calculator tile ("Team $79 · 5 seats included"), verdict sentence, FAQ payback answer (~$16/person, 40–60 min team break-even), metrics band ($79), CTA subline, server FAQ JSON-LD, prerendered crawler content, and structured-data offers. The overview film's ROI scene compares **labor only** ($1,045 manual vs ~$71 review labor at $95/hr) and names no subscription price — it remains correct under the new pricing by design; no film edit required (§11).

## 10. Landing page changes (implemented)

Calculator formula + tile copy; FAQ payback rewrite (+ server-side JSON-LD mirror); metrics band $26→$79 framing; final CTA subline; pricing-page meta title/description; SoftwareApplication offers (Free 0 / Starter 24 / Team 79).

## 11. Video updates required

**None for correctness** — an audit of all nine films found zero subscription-price references; the master film's savings scene was deliberately built on labor arithmetic so pricing could change without re-cutting it. Optional later: a pricing beat could be added to the outcomes scene once real customer numbers exist.

## 12. Prioritized implementation plan

**HIGH — done today:** 4-tier catalog + pricing page + checkout seat math; calculator + all messaging consistency; SEO/JSON-LD; this report.
**HIGH — user action:** connect Stripe before the trial can convert; upgrade Railway (trial expiring).
**MEDIUM — this month:** ~~enforce generation caps and seat counts server-side~~ (done — `PLAN_LIMITS` in `catalog.js`, metered by the `UsageEvent` ledger); trial-expiry emails; founding-customer coupon flow; grandfather flag for existing accounts.
**LOW — later:** usage-analytics dashboard promised by Team tier; enterprise floor experiments; regional pricing; annual-prepay invoicing.
