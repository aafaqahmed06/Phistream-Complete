# Østreams — homepage

A single-page marketing site for a brand studio that works for **content
creators**. Built with Next.js (App Router), TypeScript, Tailwind CSS v4 and
Motion.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # the real gate -- must pass with zero TS errors
```

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
- Nav and footer links are anchors within the page or `#` placeholders — this
  build is the homepage only. Case-study plates link to `#`.
- The newsletter form posts to `#`. It needs an endpoint.
- The thumbnail durations and view counts in `work.items` are illustrative.
  Swap them for real numbers before this goes near a client.
