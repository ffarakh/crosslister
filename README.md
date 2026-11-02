# Crosslister

List an item once, then review per-platform versions and publish to every connected marketplace with one confirmation.

## Integration status (1 Nov 2026)

| Platform | Status | Detail |
|---|---|---|
| **eBay UK** | **Implemented · awaiting credentials** | Official Sell Inventory + Account + Taxonomy APIs with OAuth. Full flow is tested against a simulated Inventory API. Not yet verified against eBay's sandbox; that needs your keys. |
| **Facebook Marketplace** | **Awaiting approval (blocked)** | No public listing API. Meta's Marketplace Partner Item/Seller APIs are for approved classified-listing businesses only. Automated posting through scripts or extensions isn't permitted by Meta's terms. |
| **Vinted UK** | **Awaiting approval (blocked)** | The only sanctioned route is Vinted Pro Integrations (`POST https://pro.svc.vinted.com/api/v1/items`, HMAC-signed), for allowlisted Vinted Pro businesses only. Vinted's T&Cs ban third-party listing tools and have been actively enforced since Sept 2026. |

Facebook and Vinted are fully supported in the editor, overrides, validation and review. When you publish, they return an explicit **blocked** result saying what would unblock them. They are never silently skipped and never turned into a copy-paste export.

**Why there's no browser extension.** You chose not to automate FB/Vinted against their terms. The approved routes for both (Meta partner API, Vinted Pro Integrations) are server-side APIs, so an extension adds nothing. If access is granted later, only the adapter body in `src/lib/publish/adapters/blocked.ts` changes. The editor, validation, orchestrator and results already handle that platform.

**What would unblock each platform:**
- **Vinted:** open or convert to a Vinted Pro account (sole trader is enough in the UK), then request Vinted Pro Integrations allowlisting. Note: Vinted treats buy-to-resell on a standard account as commercial selling and expects a Pro account for it.
- **Facebook:** acceptance into Meta's Marketplace Partner programme. This is realistically aimed at businesses with classified inventory, not individual sellers.

## Architecture

```
Browser (Next.js app)                Server (Next.js route handlers)          External
─────────────────────                ───────────────────────────────          ────────
Editor ── photos ───────────────────────────────────────────────────────────▶ Supabase Storage (private, per-user folder)
  │  shared fields + per-platform overrides (autosaved JSON)  ─▶ /api/listings ─▶ Supabase Postgres (RLS)
  │  "Draft from photos"  ─────────────────▶ /api/listings/:id/ai ───────────▶ Anthropic Messages API (vision, forced tool schema)
  │  Review (final version + hash per platform) ◀─ /api/listings/:id/review
  └─ Publish (confirmed + reviewed hashes) ─▶ /api/listings/:id/publish
                                                 └─ orchestrator ─┬─ eBay adapter ─▶ eBay Inventory API (OAuth user token)
                                                                  ├─ Facebook adapter → blocked (reason + resolution)
                                                                  └─ Vinted adapter  → blocked (reason + resolution)
```

- **Inheritance** (`src/lib/listing/resolve.ts`): a platform's value is `shared` unless that key exists in `platforms[p].overrides`. Shared edits never touch overrides. "Reset to shared value" deletes the key. Attributes override per attribute.
- **Publishing safety** (`src/lib/publish/orchestrator.ts`):
  - Each platform runs independently, so partial failures are isolated.
  - Postgres `claim_platform_publish()` with `unique(listing_id, platform)` acts as a lock. Published, in-flight and uncertain rows can't be re-claimed.
  - eBay uses a deterministic SKU `CL-<listingId>`. The adapter checks eBay for an existing live offer before creating anything.
  - A timeout during `publishOffer` → the adapter checks eBay immediately. If that's still inconclusive, the result is **uncertain**, and the next attempt reconciles with eBay before any resubmission.
  - A crashed in-flight attempt older than 10 minutes is reconciled the same way.
- **Review integrity:** the review screen returns a content hash per platform. Publish rejects the request (409) if the listing changed after review.
- **Isolation:** every query runs as the signed-in user via the Supabase anon key + session. There is no service-role key in the app. RLS on all tables; storage policies restrict each user to their own folder. eBay tokens are AES-256-GCM encrypted at rest.
- **AI rules** (`src/lib/ai/generate.ts`):
  - Each value is tagged as read from a label, clearly visible, or unknown.
  - Unknowns become questions, never values.
  - Brand is filled only if it's on a label or clearly printed.
  - The AI never sets condition, never applies the price estimate (shown as an estimate with a "use" button), and never overwrites anything you typed or confirmed.
  - AI-sourced values are badged until you confirm them.
  - Photos are only downscaled to max 2000px. No editing or generated images.

## Checklist: what you need to supply

1. **Supabase project** (free tier is fine): project URL + anon/publishable key.
2. **Anthropic API key** (console.anthropic.com).
3. **eBay developer account** (developer.ebay.com), with:
   - Sandbox **and** Production keysets (App ID, Cert ID).
   - A **RuName** per environment, with its *auth accepted URL* set to `https://<your-app>/api/ebay/callback`.
   - A **sandbox test seller** user (Developer portal → Sandbox → Create Test Users).
4. **eBay seller account set-up** (once per environment):
   - Opt in to business policies (there's a button on the Connections page).
   - Create postage, payment and returns policies in Seller Hub.
   - Set an item location (the Connections page creates one from your postcode).
5. A 32-byte `TOKEN_ENCRYPTION_KEY`.

## Local development

```bash
npm install
cp .env.example .env.local        # fill in values
# apply the database schema (either):
#   Supabase dashboard → SQL editor → run supabase/migrations/0001_init.sql then 0002_storage.sql
#   or: npx supabase link --project-ref <ref> && npx supabase db push
npm run dev                       # http://localhost:3000
npm test                          # 53 tests
npm run typecheck
```

In Supabase → Authentication → URL Configuration, add `http://localhost:3000/auth/callback` (and your deployed URL) to the redirect URLs. Sign-in is by email magic link.

eBay may refuse a plain-http accept URL. If it does, test OAuth against your deployed URL or an HTTPS tunnel, and point the RuName at it.

## Deployment (Vercel)

1. Push to GitHub and import into Vercel.
2. Add every variable from `.env.example`. Set `APP_URL` to the deployed origin and keep `EBAY_ENV=sandbox` until sandbox checks pass.
3. Add the deployed `/auth/callback` to Supabase redirect URLs, and set the RuName accept URL to the deployed `/api/ebay/callback`.
4. The publish and AI routes use `maxDuration = 120`. Your Vercel plan needs to allow that.

## Connecting marketplaces

- **eBay:** Connections → *Connect eBay account* → sign in on eBay and grant access. Then choose default policies and location and press *Save defaults*. New items pick these defaults up automatically.
- **Facebook / Vinted:** nothing to connect. The Connections page shows the blocker and what would resolve it.

## Live eBay check (sandbox only — never real inventory)

1. Set `EBAY_ENV=sandbox` with sandbox keys/RuName, and connect your **sandbox test seller**.
2. Opt in to policies, create the three policies and a location.
3. Create an item, upload any photo, pick a category and fill the required item specifics.
4. Review → publish → open the sandbox listing link from the result.
5. Press publish again: you should get **already live** with no second listing.

**One thing to confirm here.** Photos are sent to eBay as 24-hour signed Supabase URLs. eBay fetches images when the offer is published. If the sandbox rejects signed URLs, switch to eBay's Media API image upload in `src/lib/publish/adapters/ebay.ts`. This is the main unverified assumption.

Only switch `EBAY_ENV=production` once the sandbox run is clean. Production uses separate keys, a separate RuName and a fresh connection.

## What's verified (`npm test`)

| Behaviour | How |
|---|---|
| Shared-field inheritance & platform overrides | Spec example (£30 eBay / £25 Vinted / FB collection), shared edits propagate, overrides preserved, reset, per-attribute overrides, photo order |
| Required-field validation | Core fields, eBay 80-char title, category-required item specifics, FB collection location, Vinted parcel size, unconfirmed AI guesses block |
| Partial publishing failures | eBay succeeds while FB/Vinted report blocked; eBay rejection with eBay's message; invalid platform skipped without claiming; adapter crash → uncertain |
| Duplicate prevention | Repeat publish, simultaneous clicks, lost local state (eBay already live), DB unique + claim lock |
| Uncertain results | Timeout after commit detected; unconfirmable timeout → uncertain → reconciled → single listing; stale crashed attempt |
| User data isolation | Real migration in embedded Postgres: other users can't read, update, delete, claim, attach rows, or see eBay tokens |
| AI safeguards | No invented brand/attributes, no condition, no auto price, never overwrites your edits, structured output validated |

**Not yet verified:** live calls to eBay (needs your credentials), and the UI in a browser against a real Supabase project.
