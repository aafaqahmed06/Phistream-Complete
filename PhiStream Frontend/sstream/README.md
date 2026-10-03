# Østreams — homepage

A single-page marketing site for a brand studio that works for **content
creators**. Built with Next.js (App Router), TypeScript, Tailwind CSS v4 and
Motion.

## Run it

```bash
npm install                  # here, and once in ../../Phistream Backend
cp .env.example .env.local
npm run dev:all  # site AND backend, both on http://localhost:3000
npm run build    # the real gate -- must pass with zero TS errors
```

Everything is served from **one port**:

| URL | Served by |
|---|---|
| `http://localhost:3000/` and `/apply` | this site |
| `http://localhost:3000/api/v1/...` | the backend, proxied |
| `http://localhost:3000/health`, `/health/ready` | the backend, proxied |
| `http://localhost:3000/docs` | the backend's Swagger UI, proxied |

`npm run dev:all` (`scripts/dev-all.mjs`) starts the backend's own
`npm run dev` on an internal port (`127.0.0.1:4000`, loopback only) and this
site's `next dev` on 3000, with prefixed `[api]` / `[web]` output. Ctrl+C stops
both. `next.config.ts` rewrites `/api/*`, `/health*` and `/docs*` to
`BACKEND_URL`, so the browser only ever sees one origin and CORS never comes
into play. Override `PORT`, `BACKEND_PORT` or `BACKEND_DIR` if needed;
`BACKEND_DIR` defaults to `../../phistream-backend` (the folder's name in the
Phistream-Complete repo) or `../../Phistream Backend`, whichever exists.

To run the two separately instead: start the backend with its `PORT=4000`,
then `npm run dev` here.

**Before production:** behind this proxy the backend sees every request as
coming from the Next.js server, so its per-IP rate limits (e.g. 5 contact
messages per 10 minutes) are shared by all visitors. Next.js does not append
the client IP to `X-Forwarded-For`, so trusting that header would let clients
spoof it. In production, put a reverse proxy (nginx, Caddy, the host's load
balancer) in front that routes `/api` to the backend and sets
`X-Forwarded-For`, and set the backend's `TRUST_PROXY` to match.

## Backend integration

All calls go through `lib/api.ts`. The browser calls the same-origin path
`/api/v1`; server rendering calls `BACKEND_URL` directly. Errors arrive as an
`ApiError` carrying the backend's error `code`, field `details` and
`Retry-After`.

| Where | Endpoint | Notes |
|---|---|---|
| Homepage services, pull quote, CTA email, footer socials | `GET /content/home` | Server-rendered, revalidated every 60s. If the API is down each section falls back to `lib/content.ts` |
| Contact form in the closing CTA | `POST /contact` | Always a generic thank-you on 202, by design. Hidden honeypot field |
| `/apply` form | `GET /applications/form`, `GET /content/services`, `POST /applications` | Questions are rendered from the published form version. A `409 FORM_VERSION_OUTDATED` reloads the questions and keeps contact details |
| `/apply` after submitting | `GET /applications/:id/status` | The status token lives in `sessionStorage` only, never in a URL |
| `/apply` FAQs | `GET /content/home` | Hidden when there are none |
| Funnel analytics | `POST /analytics/events` | `application_start` / `application_submit` via `sendBeacon` (`lib/analytics.ts`) |

UTM `utm_source` / `utm_campaign` are kept for the visit and attached to
contact messages, applications and analytics events.

Not wired yet, because no page exists for them: the onboarding/VSL funnel
(`/content/onboarding`) and the applicant scheduling page
(`/scheduling/session`, which the backend links to via `SCHEDULING_PAGE_URL`).

## The idea

An expensive editorial serif, and a gold sticker stuck to it.

The build before this one was tasteful, restrained and read like a consultancy —
which was the problem, given the audience is people who make things for the
internet for a living. The revamp keeps the typography and the contrast
discipline and adds a pulse: headlines that land word-by-word like burned-in
captions, case studies rebuilt as a thumbnail wall, split-flap counters, and a
client crawl whose speed is driven by how fast you are scrolling.

The tone rule throughout: **the sentences are quiet, the four or five words that
matter are loud.** Light Fraunces for the prose, heavy WONK Fraunces inside a
gold block for the words doing the work.

## Design system

Five colours, five roles — the brand palette, unchanged. Contrast ratios below
are computed from the WCAG 2.1 relative-luminance formula and are the reason
several class choices look odd.

| Token | Hex | Role |
|---|---|---|
| `gold` | `#C89B3C` | Icons, CTAs, links, key statistics, highlight fills, live indicators |
| `ink` | `#2B211A` | Primary surface, wordmark ink |
| `cream` | `#F3EFE6` | Light surfaces, cards on dark |
| `taupe` | `#A69377` | Captions, muted text, dividers |
| `gold-deep` | `#8A6A2A` | Hover / active, secondary emphasis |

### The two rules

**1. Taupe and gold are dark-surface text colours.**

| On ink `#2B211A` | | On cream `#F3EFE6` | |
|---|---|---|---|
| cream | 13.70:1 | ink | 13.70:1 |
| gold | 6.15:1 | ink / 70% | 5.47:1 |
| taupe | 5.29:1 | gold-deep | 4.38:1 ← large text only |
| gold-deep | 3.13:1 ← large only | **taupe** | **2.59:1 ✗** |
| | | **gold** | **2.23:1 ✗** |

So muted text on cream is `text-ink/70`, never `text-taupe`, and emphasis on
cream is `gold-deep`, never `gold`. Gold is the accent on ink and `gold-deep` is
the accent on cream; using either on the wrong surface is a contrast bug, not a
style choice.

**2. Gold is a fill and an accent, never a large background.**

The brand guide is explicit — *"never used for large body backgrounds"* — and it
decides more of the markup than anything else here:

- The client-crawl band is **cream** and the footer phrase band is **ink**. Both
  were gold fills in the first pass at this revamp and both had to go.
- The services rows invert to **ink** on hover, not gold.
- Where gold *does* fill — a button, an inline `.highlight`, a row marker, a
  ticker chip — it carries **ink** text at **6.15:1**, which is more contrast
  than the body copy around it, not less.

One knock-on worth knowing: muted text on a gold fill has to be **full ink**.
`ink/70` over gold composites to 3.53:1, which fails at label size. That is why
`Eyebrow` deliberately has no `on-gold` tone.

Fill pairings, for reference:

| | |
|---|---|
| ink on gold | 6.15:1 ✓ AA any size, on either surface |
| ink / 70% on gold | 3.53:1 ✗ |
| gold vs 90%-ink-over-cream | 4.63:1 ✓ (3:1 non-text threshold) |

## Structure

```
app/
  layout.tsx        fonts (Fraunces / DM Sans / JetBrains Mono), metadata, Scanlines
  page.tsx          composes the 12 sections in order
  globals.css       @theme tokens, contrast reference, keyframes, reduced motion
components/
  Nav Hero TickerBand StatsBand Services Work Approach
  StudioRail PullQuote Thinking CtaBand Footer
  ScrollProgress CursorGlow
  ui/               Wordmark, Eyebrow, Button, Sticker, Ticker, Scanlines
  motion/           Reveal (+ RevealGroup/RevealItem), Lift, SplitFlap
lib/
  content.ts        every string on the page — single source of truth
  theme.ts          typed palette mirror + contrast table
  motion.ts         shared easings, springs, viewport + ticker config
```

## Decisions that look like mistakes but aren't

**The hero headline animates with CSS, not Motion.** It is almost certainly the
LCP element, and a CSS animation starts at first paint while a Motion variant
must wait for hydration. Everything below the fold uses Motion. The headline is
authored as *words* in `lib/content.ts`, not as lines of prose, because each word
is its own animated span.

**Marquee gaps live inside each item, not on the flex container.** With a
container gap the track is `sum(items) + (2N-1) * gap`, so translating `-50%`
misses by half a gap and the loop stutters once per cycle.

**The velocity ticker maps scroll velocity across `[-MAX, +MAX]` rather than
`[0, MAX]`.** A one-sided mapping clamped at zero would stall the crawl instead
of reversing it when you scroll up. The clamp is on the *output*, so a hard flick
hits a ceiling instead of smearing the type past readability.

**The progress bar is gold, which is only safe because of where it lives.** The
header is either transparent over the ink hero or solid ink once scrolled — it is
never over cream. Against ink that is 6.15:1; against 90%-ink-over-cream, 4.63:1.

**The services list inverts to ink while the thinking list only recolours.** The
services section is cream, so an ink row is a real inversion. The thinking
section is ink, so an ink row would be nothing at all — that one has to move in
type (gold, 6.15:1) instead.

**The cursor glow is a radial-gradient background, not a blurred element.** A
`filter: blur()` repainting on every mouse move is the classic way to tank a
scroll. It also caches its bounding rect and only re-measures on pointerenter,
scroll and resize, so the pointermove handler performs no layout reads.

**Scanlines are 6% ink with no blend mode.** A blended full-viewport layer forces
the page into a compositing group and costs real frames. At 6%, cream-on-ink
inside the overlay is still 12.25:1 and ink-on-cream only gains contrast.

## Known gaps

- No photography exists yet. Every visual is a generated plate: a radial wash, a
  blueprint grid and a ghosted glyph. `<Image>` slots are marked in
  `StudioRail.tsx` and `Work.tsx`; the aspect ratios and rounding are in place.
- Nav and footer links are root-relative anchors (`/#work`) so they also work
  from `/apply`, or `#` placeholders. Case-study plates link to `#`.
- The newsletter form posts to `#`. It needs an endpoint.
- The thumbnail durations and view counts in `work.items` are illustrative.
  Swap them for real numbers before this goes near a client.
