# Crosslister

List an item once, review per-marketplace versions, and publish to eBay in one click — with Facebook Marketplace and Vinted versions prepared for fast manual posting.

**Live:** https://crosslister-psi.vercel.app

## What it does

- **Upload photos once.** An AI draft (Claude, vision) reads *your* photos and writes the title, description and item specifics. It never invents brand, size, model or condition, and never edits or replaces photos.
- **Pricing research.** The draft looks up the item's RRP and the cheapest brand-new prices at UK retailers (with links), and the free eBay Browse API shows current live eBay listings with the cheapest and typical price.
- **Photo check.** The AI rates your photos (good / usable / reshoot) with specific tips.
- **Shared listing + per-platform overrides.** Every marketplace inherits the shared fields; edit a value on a platform tab to override it there only (e.g. £30 on eBay, £25 on Vinted). "Reset to shared value" undoes it.
- **Validation before publishing**, including eBay's category-required item specifics (pre-added as blanks when you pick a category).
- **One-click eBay publishing** through eBay's official Sell Inventory API with OAuth.
- **Facebook Marketplace & Vinted helpers.** Neither platform offers a listing API to individual sellers, and both prohibit automated posting, so the app prepares tailored, ready-to-paste text (collection/cash terms for Facebook; brand-new framing and specifics for Vinted) with one-tap copy and photo download.

## Integration status

| Platform | Status |
|---|---|
| eBay UK | **Live** — official Sell Inventory + Account + Taxonomy + Browse APIs, OAuth, production keyset |
| Facebook Marketplace | Manual posting helper. No API is available for individual sellers. |
| Vinted UK | Manual posting helper. The only API (Vinted Pro Integrations) requires a Vinted Pro business account plus allowlisting. |

## Architecture

```
Browser (Next.js)                 Server (Next.js route handlers)                 External
Editor ── photos ───────────────────────────────────────────────────────────────▶ Supabase Storage
  │  shared fields + overrides ─▶ /api/listings ───────────────────────────────▶ Supabase Postgres (RLS)
  │  Draft from photos ─────────▶ /api/listings/:id/ai ────────────────────────▶ Anthropic API (vision + web search)
  │  Pricing ───────────────────▶ /api/ebay/comps ─────────────────────────────▶ eBay Browse API
  │  Review (final version + content hash) ◀─ /api/listings/:id/review
  └─ Publish (confirmed hashes) ▶ /api/listings/:id/publish ─▶ orchestrator ──▶ eBay Inventory API
```

**Publishing safety**
- Each platform publishes independently, so one failure never blocks the others.
- A Postgres claim function plus `unique(listing_id, platform)` prevent duplicate listings.
- A deterministic eBay SKU means eBay is checked for an existing live offer before anything is created.
- A timed-out publish is marked *uncertain* and reconciled with eBay before any retry.
- Publish is refused if the listing changed after it was reviewed (content-hash check).

## Security

- Every database table has Row Level Security; each user sees only their own data. There is no service-role key in the app.
- eBay OAuth tokens are encrypted at rest (AES-256-GCM).
- Strict Content-Security-Policy, HSTS, `X-Frame-Options: DENY`, nosniff, and locked-down Referrer and Permissions policies.
- Per-user rate limits, enforced in Postgres, on AI drafting, eBay lookups and publishing.
- eBay Marketplace Account Deletion notification endpoint (`/api/ebay/deletion`).
- Every API route except the OAuth callbacks requires sign-in. No dependency vulnerabilities at last audit.

## Setup

**You need:**
- A Supabase project
- An Anthropic API key (optional; enables AI drafting)
- An eBay developer account with a production keyset, a RuName, and the account-deletion endpoint registered

```bash
npm install
cp .env.example .env.local     # fill in values
# apply supabase/migrations/*.sql in order (SQL editor or `supabase db push`)
npm run dev
npm test                       # 53 tests
```

**Environment variables:**
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- App: `APP_URL`, `TOKEN_ENCRYPTION_KEY` (32 bytes, base64)
- AI: `ANTHROPIC_API_KEY`
- eBay: `EBAY_ENV` (`sandbox` or `production`), `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RUNAME`, `EBAY_VERIFICATION_TOKEN`

**eBay settings to register:**
- RuName accept URL: `<APP_URL>/api/ebay/callback`
- RuName decline URL: `<APP_URL>/connections`
- Account-deletion endpoint: `<APP_URL>/api/ebay/deletion`, with the same verification token as `EBAY_VERIFICATION_TOKEN`

Sign-in is email + password (Supabase Auth). Turn off "Confirm email" and, for a private deployment, turn off new sign-ups once accounts exist.

## Tests

53 tests (Vitest), including real migrations run in an embedded Postgres:
- Inheritance and overrides
- Required-field validation
- Partial publishing failures
- Duplicate prevention, including simultaneous clicks
- Uncertain-result reconciliation
- Per-user data isolation (RLS) and the claim lock
- AI safeguards
