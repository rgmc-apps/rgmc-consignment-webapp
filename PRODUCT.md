# Product

## Register

product

## Users

RGMC sales agents working in the field in the Philippines. They stand in supermarkets and retail stores — SM, Robinsons, Puregold — while logging orders on a phone. The environment is loud, bright, and time-pressured. They tap through screens quickly, often one-handed. The app is a daily work tool they use for every customer visit.

## Product Purpose

A mobile-first PWA for consignment order management. Sales agents log sales orders and return orders per customer per brand visit, submit them to Business Central via a GCP API, and track submission history. The core loop is: select customer → add order lines → submit. Success means agents spend less time on paperwork and more time with customers.

## Brand Personality

Warm, approachable, human. The app should feel like a capable colleague — not cold software. Feedback should feel encouraging. Errors should feel fixable, not alarming. The gold (#A07320) brand color carries warmth; motion should match it.

## Anti-references

- Generic enterprise SaaS (SAP, Oracle): avoid gray, committee-designed, bloated UIs
- Flat icon-grid dashboards: no hero-metric cards, no big-number KPI grids, no gradient accents

## Design Principles

1. **Speed is respect** — agents are between customers. Every interaction should feel immediate. Never make them wait.
2. **Warm, not soft** — approachable doesn't mean playful. Feedback is encouraging; nothing is bubbly or animated for its own sake.
3. **Field-tested clarity** — the interface must read in bright sunlight, one-handed, on a small screen. Contrast and tap targets matter more than decoration.
4. **Fail gracefully** — poor signal is the norm. Errors and failed submissions must feel recoverable, not fatal.
5. **The gold earns its place** — the brand accent is a signal, not a decoration. Use it where it communicates something (active state, success, brand identity).

## Accessibility & Inclusion

WCAG AA minimum. Tap targets 44×44px minimum. `prefers-reduced-motion` respected — all animations must degrade gracefully. Color must not be the sole means of conveying state (pair with icon or text).
