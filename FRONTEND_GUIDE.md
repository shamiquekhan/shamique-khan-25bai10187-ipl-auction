# Frontend Guide — Live IPL Mega Auction Platform

### Professional, non-generic UI/UX + how to install and use UI/UX `SKILL.md` files

> Companion to `GUIDE.md`. That file covers engine, protocol and deployment; this one covers **everything the user sees**: design direction, tokens, components, states, motion, accessibility, verification, and the AI design skills that help you get there without the "generic AI look".
> Written 30 Sep 2026. Skill install commands were checked against each project's own README/docs on this date. These projects move fast, so run `--help` or read the README if a command fails.

---

## Part A — The frontend

### A0. What "professional" means for this product

You are not building a marketing site. You are building **operations software that is also a live broadcast**. Three surfaces, three very different viewing conditions:

| Surface | Who / where | Distance & device | Design priority |
|---|---|---|---|
| **Live Board** `/board` | ~50–100 people in a hall, non-technical | 5–15 m, projector, 16:9, no interaction | **Legibility at distance**, instant comprehension, zero scroll, calm until something happens |
| **Team Console** `/team` | One franchise rep, seated, under time pressure | 40 cm, phone portrait, one thumb | **One unmistakable action**, no mis-taps, clear reason when disabled |
| **Auctioneer Desk** `/admin` | One trained operator, speed matters | 60 cm, laptop, keyboard | **Density + speed + safety**: shortcuts, no accidental destructive clicks |

**Design concept: "broadcast control room."** Think sports-broadcast graphics + trading-desk clarity: dark neutral surfaces, condensed display type for numbers, one accent colour, hairline dividers, and team colours used as *identity* (a strip, a chip, the SOLD moment) rather than as decoration. Drama is reserved for the two moments that deserve it: **the clock running out** and **SOLD**.

**Five principles (put these in your viva notes):**

1. **One focal point per screen.** Board → the bid. Console → the BID button. Desk → the lot + gavel.
2. **State is always visible.** Connection, phase and "why can't I click this" are never hidden.
3. **Numbers are the hero.** Money and time get the biggest, cleanest type, tabular figures, no decoration.
4. **Colour never carries meaning alone.** Always pair with text/icon/position.
5. **Restraint.** If an element doesn't help someone decide, bid or gavel, remove it.

---

### A1. The anti-slop rulebook

"AI slop" is what you get when defaults go unquestioned. Ban these explicitly and **write the replacement**:

| ❌ Generic tell | ✅ Do instead |
|---|---|
| Inter/Roboto/system default everywhere | Deliberate pairing (§A3): a condensed display face for numbers + one neutral UI sans |
| Purple→blue gradient, neon glow, blurred glassmorphism cards | Flat tonal surfaces (4 steps of ink), 1 px hairlines, one accent |
| `rounded-2xl shadow-lg` on everything, cards inside cards | 2–4 px radius max, separation via spacing + dividers; **no nested cards** |
| Centered hero + three identical feature cards on the landing page | A functional entry screen: three large rows (Board / Team / Desk) + status line |
| Emoji as icons (🏏🔥), mixed icon styles | **One** icon set (Lucide), consistent 1.75 px stroke, labelled |
| Tailwind `gray-500` body text on dark (low contrast) | Tokenised text tiers with verified contrast (§A2) |
| Placeholder "Team A/Team B", "John Doe", lorem ipsum | Real franchise names/codes, real-looking players, realistic prices |
| Animations on everything (bounce, pulse, float) | Motion only for **state change**: bid update, timer urgency, SOLD reveal |
| Toast for every event | Toasts only for errors the user must act on; successes are shown *in place* |
| Full-page spinner | Inline "Connecting…" status + last known state kept on screen |
| Jargon ("HAMMER phase", "STALE_BID") | Plain language (§A9 copy table) |
| Fake stats/testimonials/marketing copy | None. This is a tool |
| Unlabelled icon-only buttons | Text label always; icon supports it |
| Default browser focus ring removed | Custom, high-contrast `:focus-visible` ring |

**Rule of thumb:** if a screenshot could belong to any random SaaS template, it isn't done.

---

### A2. Design tokens

Use **Tailwind CSS v4** (CSS-first config) so tokens live in one CSS file. Colours in **OKLCH** so lightness steps are perceptually even. Contrast values below were estimated from OKLCH lightness; **verify final pairs with a contrast checker** (DevTools shows ratios in the colour picker).

```css
/* web/src/styles/tokens.css */
@import "tailwindcss";

@theme {
  /* ── Type ─────────────────────────────── */
  --font-display: "Barlow Condensed", "Arial Narrow", "Helvetica Neue", sans-serif;
  --font-sans:    "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono:    "IBM Plex Mono", ui-monospace, "Cascadia Mono", monospace;

  /* ── Surfaces (dark, faintly cool neutral) ── */
  --color-ink-950: oklch(0.15 0.012 250);   /* page background            */
  --color-ink-900: oklch(0.19 0.014 250);   /* panels                     */
  --color-ink-800: oklch(0.24 0.016 250);   /* raised / hover             */
  --color-ink-700: oklch(0.33 0.016 250);   /* strong border, disabled bg */
  --color-ink-600: oklch(0.45 0.014 250);   /* hairline on 950            */

  /* ── Text tiers ─────────────────────────── */
  --color-text-1: oklch(0.97 0.004 250);    /* primary        ~16:1 on 950 */
  --color-text-2: oklch(0.80 0.008 250);    /* secondary      ~10:1        */
  --color-text-3: oklch(0.68 0.010 250);    /* tertiary/meta  ~6.5:1 (never smaller than 16px) */

  /* ── Accent + semantic ───────────────────── */
  --color-gold-400: oklch(0.82 0.15 85);    /* THE accent: bid, primary action */
  --color-gold-600: oklch(0.66 0.13 80);    /* pressed / borders               */
  --color-live:     oklch(0.80 0.17 150);   /* bidding open, connected         */
  --color-warn:     oklch(0.82 0.15 75);    /* ≤10 s, needs attention          */
  --color-danger:   oklch(0.70 0.20 25);    /* ≤5 s, errors, destructive       */
  --color-on-accent: oklch(0.16 0.012 250); /* text on gold/live/warn fills    */

  /* ── Radius / spacing / motion ──────────── */
  --radius-sm: 3px;
  --radius-md: 6px;
  --spacing: 0.25rem;                        /* Tailwind v4 base unit */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 400ms;
}

/* Board-only fluid type. min() with vh stops wide-but-short screens overflowing. */
:root {
  --fs-timer:  min(16vw, 30vh);
  --fs-bid:    min(13vw, 24vh);
  --fs-player: min(6.2vw, 11vh);
  --fs-lead:   min(4.4vw, 8vh);
  --fs-meta:   max(1.6vw, 22px);   /* never below 22px on the board */
  --fs-chip:   max(1.25vw, 18px);
}

html { color-scheme: dark; background: var(--color-ink-950); color: var(--color-text-1); }
body { font-family: var(--font-sans); font-optical-sizing: auto; -webkit-font-smoothing: antialiased; }

.num { font-family: var(--font-display); font-variant-numeric: tabular-nums lining-nums; letter-spacing: 0.01em; }

:where(:focus-visible) { outline: 3px solid var(--color-gold-400); outline-offset: 3px; border-radius: var(--radius-sm); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

**Colour rules**

- **Gold is the only accent.** It marks *the thing you act on or the thing that matters most right now* (current bid, BID button). If everything is gold, nothing is.
- Semantic colours (`live`, `warn`, `danger`) appear **only** for state: timer urgency, connection, errors.
- **Team colours** are data. Use them in: leader banner strip, ribbon chip edge, SOLD overlay fill. Always compute readable text on top (§A10).
- Never put `text-3` on a surface lighter than `ink-800`.

---

### A3. Typography

| Role | Face | Weights | Used for |
|---|---|---|---|
| Display / numerals | **Barlow Condensed** | 600, 700 | Bid, timer, player name, purses, team codes |
| UI / body | **IBM Plex Sans** | 400, 500, 600 | Labels, buttons, tables, forms |
| Mono (optional) | IBM Plex Mono | 500 | Activity-log timestamps, IDs |

Both are open-licensed (SIL OFL) and free. **Self-host them** (don't use the Google Fonts CDN) because your primary deployment is a **LAN with no guaranteed internet**:

```bash
npm i -w web @fontsource/barlow-condensed @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono
```

```ts
// web/src/main.tsx (import only latin subsets + needed weights → small, fast)
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
```

**Rules**

- Money and time always use `.num` (tabular figures) so digits don't jitter as the bid changes. **Test this**: if Barlow Condensed's tabular figures don't hold width in your build, set the timer in IBM Plex Mono instead.
- Sentence case for UI text. ALL CAPS only for short status labels (`LIVE`, `SOLD`, `UNSOLD`), with `letter-spacing: 0.06em`.
- Scale (app surfaces): 14 / 16 / 20 / 28 / 40 px. Board uses the fluid tokens above.
- Line length: never more than ~60 characters in the admin panel copy.
- Number formatting: `₹5.2 Cr` and `₹80 L` (from `formatLakhs`); the **unit is smaller** (`0.4em`) than the figure so the digits dominate.

---

### A4. Layout system

**Grid:** 4 px base. Spacing steps: 4, 8, 12, 16, 24, 32, 48, 64. Don't invent in-betweens.

**Breakpoints (by surface, not by generic device names)**

| Surface | Target | Notes |
|---|---|---|
| Board | 1920×1080 primary; must also hold at 1280×720, 1366×768, 1024×768 (4:3 projector) and 1920×1200 (16:10) | `height: 100dvh; overflow: hidden`, CSS Grid with named areas, fluid tokens use `min(vw, vh)` |
| Team | 360–430 px wide portrait; landscape must not break | Primary action pinned to bottom, respects `env(safe-area-inset-bottom)` |
| Admin | ≥1280 px laptop; tolerate 1024 | 3-column grid, panels scroll independently, top bar fixed |

**Projector reality (test, don't assume):**

- Projectors wash out: dark greys blend into black and low-contrast pairs disappear. Keep text tiers ≥ 4.5:1 and make dividers `ink-600`, not `ink-800`.
- Overscan can crop edges: keep **48 px safe margins** on the board.
- As a rule of thumb for legibility, character height should scale with viewing distance (roughly 2.5 cm of character height per 3 m). At 10–15 m that means secondary text on a 1080p board should be **≥ 28 px** and nothing meaningful below **22 px**.
- Test on the real projector at least once before the event/demo, or emulate by viewing your monitor from 3 m and shrinking the browser to ~⅓ size.

#### Board layout (named grid areas)

```
┌────────────────────────────────────────────────────────────────────┐
│ header   IPL MEGA AUCTION · Round 1 · Set 2         ● LIVE        │  ~7vh
├──────────────────────────────────┬─────────────────────────────────┤
│ player                           │ clock                           │
│  ROLE · NATIONALITY · SET        │           00:14                 │  ~52vh
│  VIRAT SHARMA                    │   (hero, colour by urgency)     │
│  Base ₹2 Cr                      │                                 │
├──────────────────────────────────┼─────────────────────────────────┤
│ bid   CURRENT BID  ₹5.2 Cr       │ leader ▌MUMBAI  (team colour)   │  ~24vh
├──────────────────────────────────┴─────────────────────────────────┤
│ ribbon  15 team cells: code · purse · squad n/7 · ✓ / needs WK     │  ~13vh
├────────────────────────────────────────────────────────────────────┤
│ ticker  recent bids …                          Sold 12 · Left 58   │  ~4vh
└────────────────────────────────────────────────────────────────────┘
```

```css
.board {
  display: grid; height: 100dvh; overflow: hidden; padding: 24px 48px;
  gap: 0; grid-template-rows: 7vh 52vh 24vh 13vh 4vh;
  grid-template-columns: 1.15fr 1fr;
  grid-template-areas:
    "header  header"
    "player  clock"
    "bid     leader"
    "ribbon  ribbon"
    "ticker  ticker";
}
```

Separate regions with **hairlines** (`border-top: 1px solid var(--color-ink-600)`), not boxes.

---

### A5. Component specifications

For each component: purpose → anatomy → states → rules.

#### A5.1 `Timer`
- Anatomy: digits `MM:SS` (or just seconds under 60), optional thin progress bar beneath.
- **Tone by urgency:** `>10s` text-1 · `≤10s` warn · `≤5s` danger + a subtle scale pulse per second (1.0→1.03, 300 ms, `ease-out`). Under reduced-motion: colour only.
- States: `LIVE` (counting), `PAUSED` (frozen digits + "PAUSED" label, dimmed to text-2), `HAMMER` ("TIME UP", digits `00`, danger), `ON_DECK`/`IDLE` (`--:--`).
- Never re-renders React at 60 fps: update `textContent` from an interval (code in §A10).

#### A5.2 `BidDisplay` (board)
- Big figure + smaller `Cr`. Label above: `CURRENT BID` or `BASE PRICE` (before first bid).
- On change: old value slides up 8 px and fades (120 ms), new value slides in (200 ms). No count-up rolling, which is slow to read and wrong mid-animation.

#### A5.3 `LeaderBanner`
- Team-colour **strip (12 px)** + team full name (display face) + code. If nobody has bid: "No bids yet" in text-2.
- On leader change: strip flashes to full width for 250 ms then settles.

#### A5.4 `TeamRibbon` (board) / `TeamCell`
- 15 cells in an 8+7 grid (or 5×3 on a taller region). Each cell: 6 px colour edge · `CODE` · purse (`₹92.4 Cr`) · `n/7` squad · compliance mark.
- Compliance = icon **and** text: `✓ Ready` or `Needs WK`, `Needs 2 bowlers`.
- Leader's cell gets a gold 2 px underline. Low-purse (<10%) turns the purse figure warn. **No animation** other than the underline moving.

#### A5.5 `SoldOverlay`
- Full-bleed **team colour** background, readable text via `readableOn()`, giant: `SOLD` → player name → `to MUMBAI` → `₹5.2 Cr`.
- Sequence (total ≈ 3.5 s): fade in 200 ms → hold → dismiss automatically **or immediately when the next lot goes on deck / live**. It must never block the next lot.
- `UNSOLD` variant: neutral ink surface, no team colour, "UNSOLD" + player + base price.
- Optional gavel sound (Web Audio, needs a prior click).

#### A5.6 `BidButton` (team)
- ≥ **72 px** tall, full width, pinned to bottom, label `BID ₹5.2 Cr` (figure = server's `nextBid`).
- States: `enabled` (gold) · `pending` (spinner + "Sending…", disabled) · `leading` ("You're leading" with a check, ink-700) · `blocked` (with reason line) · `offline`.
- **Reason line is mandatory whenever disabled**, directly under the button, text-2, 16 px.
- No optimistic price change. Truth arrives via `state`.

#### A5.7 `ConnectionBadge` (all surfaces)
- `● LIVE` (live colour) · `● RECONNECTING…` (warn, slow blink) · `● OFFLINE` (danger). Always top-right. On offline: keep the last state visible but dim it slightly and disable actions.

#### A5.8 Admin controls
- **Primary action changes with phase** (a single large button): `Put on deck` → `Start lot` → `Pause` ⇄ `Resume` → `SOLD` / `UNSOLD`. Only valid actions are enabled; invalid ones are hidden or clearly disabled with a tooltip reason.
- `SOLD` (gold, key **S**), `UNSOLD` (ink-700 with outline, key **U**), shown with `<kbd>` hints.
- After SOLD: an **8-second inline Undo bar** ("Sold to MUM at ₹5.2 Cr · Undo"). No modal.
- Destructive: `Reset auction` uses **press-and-hold 1.5 s** or type-to-confirm. Never a single click.
- Settings in a side drawer; changes take effect on **Save**, with a diff summary.

---

### A6. Screen-by-screen state matrix

Design every one of these **before** styling. Missing states are what make a demo look unprofessional.

**Live Board**

| Phase | Shows |
|---|---|
| `NOT_STARTED` | Event title, "Auction begins soon", team ribbon with purses, QR + URL to join |
| `ON_DECK` | Player card, base price, clock `--:--`, label "NEXT UP" |
| `LIVE` | Everything, clock counting |
| `PAUSED` | Frozen clock + "PAUSED", bid disabled look |
| `HAMMER` | Clock `00`, "TIME UP", leader highlighted, waiting for auctioneer |
| `IDLE` (after result) | Result overlay, then "Next lot shortly" |
| `BREAK` | Big "BREAK", admin's note, optional countdown, squads summary |
| `ENDED` | Final summary: total spent, most expensive buy, squads link |
| Disconnected | Last state dimmed + "RECONNECTING" badge |

**Team Console:** logged-out · login error (wrong passcode; rate-limited) · waiting (no lot) · lot on deck · live/enabled · live/leading · live/blocked (reason) · time up · sold to you / sold to others · break · offline.

**Admin:** pre-auction · idle · on deck · live · paused · time up · break · ended · offline · error banner.

---

### A7. Motion

Motion communicates **change**, not personality.

| Moment | Effect | Duration | Easing |
|---|---|---|---|
| New bid | Old figure up+fade, new in | 120 / 200 ms | `--ease-out` |
| Leader change | Team-colour strip wipe | 250 ms | `--ease-out` |
| Timer ≤ 5 s | 1.03 scale pulse each second | 300 ms | ease-out |
| Sold overlay | Fade in, hold, fade out | 200 / 3000 / 300 ms | `--ease-out` |
| Button press | `transform: scale(0.98)` | 80 ms | linear |

Rules: animate only `transform` and `opacity`; keep one CSS animation running at a time; honour `prefers-reduced-motion` (already in tokens). No libraries needed. Framer Motion / GSAP would add weight and a viva liability for no benefit here.

---

### A8. Accessibility (not optional; it's also good UX in a loud hall)

- **Contrast:** body ≥ 4.5:1, large text ≥ 3:1; verify all token pairs and team-colour overlays.
- **Colour independence:** urgency shown by number + colour + (≤5 s) pulse; team shown by name + colour; compliance by icon + words.
- **Targets:** ≥ 48×48 px on the Team Console; ≥ 40 px on admin.
- **Keyboard:** everything on Admin reachable and operable by keyboard; visible focus ring (token above); logical tab order.
- **Screen readers / live regions:** the timer has `role="timer"` with `aria-live="off"` (don't announce every second). A separate **polite** region announces state changes, throttled:

```tsx
<div className="sr-only" aria-live="polite" aria-atomic="true">
  {announcement /* e.g. "Mumbai leads at 5.2 crore" ; update at most once per bid, not per tick */}
</div>
```

- Team console: don't disable browser zoom (`user-scalable=no` is an accessibility failure). Prevent accidental double-tap zoom with `touch-action: manipulation` on buttons.
- Forms: real `<label>`s, `autocomplete="off"` on passcode, `inputmode="text"` and uppercase transform for 6-char codes.
- Reduced motion respected. No flashing faster than 3 Hz (photosensitivity).

---

### A9. Realtime UX + microcopy

**Principles**

- The UI is a **projection of server state**. Never show something the server hasn't confirmed as if it were true.
- On send, the button goes `pending`. On ack `ok` do nothing visual (the state message updates everything). On error, show the plain-language reason **in place** (under the button), not a toast.
- After a reconnect, the first `state` replaces everything silently. No "you missed events" screens.

**Error-code → copy (plain language, non-technical room)**

| Server code | Show |
|---|---|
| `LOT_NOT_LIVE` | Bidding isn't open right now. |
| `TIMER_EXPIRED` | Time's up for this player. |
| `ALREADY_LEADING` | You're already the highest bidder. |
| `STALE_BID` | Someone bid first. New price: ₹5.4 Cr. *(button updates to the new price)* |
| `INSUFFICIENT_PURSE` | Not enough purse for this bid. |
| `RESERVE_VIOLATION` | This bid would leave too little to complete your squad. |
| `SQUAD_FULL` | Your squad is full. |
| `STALE_LOT` | The auction moved on to another player. |
| timeout (no ack) | Couldn't confirm your bid. Check the price and try again. |
| login failure | That code didn't work. Check with the organiser. |
| rate-limited | Too many attempts. Wait a minute and try again. |

**Voice:** short, declarative, no exclamation marks except the single word `SOLD`. Times in 24-h or "in 12 s", money always with unit.

---

### A10. Reference implementations (drop-in)

**Format + contrast helpers**

```ts
// web/src/lib/color.ts
const lin = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminance = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const INK = "#0B0E14", PAPER = "#F6F7F9";
/** pick whichever of INK / PAPER has more contrast on the team colour */
export const readableOn = (bg: string) => {
  const L = luminance(bg);
  return ratio(L, luminance(INK)) >= ratio(L, luminance(PAPER)) ? INK : PAPER;
};
```

**Timer (no per-frame React renders)**

```tsx
// web/src/components/Timer.tsx
import { useEffect, useRef, useState } from "react";
import { remainingMs } from "../lib/clock";

type Tone = "ok" | "warn" | "danger";
const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : String(s).padStart(2, "0"));

export function Timer({ phase, deadlineAt, pausedMs }: { phase: string; deadlineAt: number | null; pausedMs: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [tone, setTone] = useState<Tone>("ok");

  useEffect(() => {
    if (phase !== "LIVE" || deadlineAt == null) return;
    const tick = () => {
      const s = Math.ceil(remainingMs(deadlineAt) / 1000);
      if (ref.current) ref.current.textContent = fmt(s);
      const next: Tone = s <= 5 ? "danger" : s <= 10 ? "warn" : "ok";
      setTone((p) => (p === next ? p : next));            // re-render only when tone changes
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [phase, deadlineAt]);

  const label =
    phase === "PAUSED" ? "PAUSED" : phase === "HAMMER" ? "TIME UP" : phase === "LIVE" ? "" : phase === "ON_DECK" ? "NEXT UP" : "";
  const static_ =
    phase === "PAUSED" && pausedMs != null ? fmt(Math.ceil(pausedMs / 1000)) : phase === "HAMMER" ? "00" : "--";

  return (
    <div role="timer" aria-live="off" data-tone={phase === "HAMMER" ? "danger" : tone}
         className="num text-center leading-none data-[tone=ok]:text-text-1 data-[tone=warn]:text-warn data-[tone=danger]:text-danger"
         style={{ fontSize: "var(--fs-timer)" }}>
      <span ref={ref}>{phase === "LIVE" ? "" : static_}</span>
      {label && <div className="font-sans text-text-2 tracking-[0.06em] uppercase" style={{ fontSize: "var(--fs-meta)" }}>{label}</div>}
    </div>
  );
}
```

**Bid gate (pure function, unit-testable; the single source of "why is this disabled")**

```ts
// web/src/lib/bidGate.ts
import type { PublicState, Me } from "@shared/types";
export type Gate = { kind: "enabled" | "leading" | "blocked" | "offline"; reason?: string };

export function bidGate(s: PublicState | null, me: Me | null, online: boolean): Gate {
  if (!online) return { kind: "offline", reason: "Reconnecting…" };
  if (!s || !me) return { kind: "blocked", reason: "Loading…" };
  if (s.phase === "PAUSED") return { kind: "blocked", reason: "Bidding is paused." };
  if (s.phase === "HAMMER") return { kind: "blocked", reason: "Time's up for this player." };
  if (s.phase !== "LIVE" || !s.lot) return { kind: "blocked", reason: "Bidding isn't open right now." };
  if (s.lot.leaderTeamId === me.team.id) return { kind: "leading", reason: "You're the highest bidder." };
  if (me.squad.length >= s.settings.maxSquad) return { kind: "blocked", reason: "Your squad is full." };
  if (me.team.purse < s.lot.nextBid) return { kind: "blocked", reason: "Not enough purse for this bid." };
  return { kind: "enabled" };   // server still re-validates everything (reserve rule etc.)
}
```

**BidButton**

```tsx
export function BidButton({ gate, price, pending, onBid }: { gate: Gate; price: string; pending: boolean; onBid: () => void }) {
  const disabled = gate.kind !== "enabled" || pending;
  return (
    <div className="fixed inset-x-0 bottom-0 bg-ink-950/95 px-4 pt-3" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
      <button onClick={onBid} disabled={disabled}
        className="num h-[76px] w-full rounded-md text-[40px] font-bold tracking-wide touch-manipulation select-none
                   bg-gold-400 text-on-accent active:scale-[0.98] transition-transform duration-75
                   disabled:bg-ink-700 disabled:text-text-2">
        {pending ? "Sending…" : gate.kind === "leading" ? "You're leading" : `BID ${price}`}
      </button>
      <p className="mt-2 min-h-6 text-center text-[16px] text-text-2" aria-live="polite">{gate.reason ?? ""}</p>
    </div>
  );
}
```

**Sold overlay (team-colour + safe text)**

```tsx
<div className="fixed inset-0 grid place-items-center animate-[fade_200ms_var(--ease-out)]"
     style={{ background: team.color, color: readableOn(team.color) }} role="status">
  <div className="text-center num leading-[0.9]">
    <div style={{ fontSize: "min(22vw, 36vh)" }}>SOLD</div>
    <div style={{ fontSize: "min(6vw, 10vh)" }}>{player.name}</div>
    <div className="font-sans" style={{ fontSize: "min(3.4vw, 6vh)" }}>to {team.name}</div>
    <div style={{ fontSize: "min(10vw, 18vh)" }}>{formatLakhs(price)}</div>
  </div>
</div>
```

**Keeping the phone awake + haptics**

```ts
let lock: WakeLockSentinel | null = null;
export async function keepAwake() { try { lock = await navigator.wakeLock?.request("screen"); } catch { /* ignore */ } }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") keepAwake(); });
export const buzz = (ms = 30) => navigator.vibrate?.(ms);
```

---

### A11. Iconography, imagery, sound

- **Icons:** `lucide-react`, one set only (`Gavel`, `Pause`, `Play`, `Undo2`, `Wifi`, `WifiOff`, `Users`, `Trophy`, `Download`). Size 20/24, stroke 1.75, always with a text label.
- **Player imagery:** skip photos unless you own the rights. Use a typographic avatar (initials in a `ink-800` square with a role badge). Cleaner, faster, no copyright risk.
- **Team logos:** don't use real franchise logos (trademarks). Use the code + colour identity.
- **Sound (optional, board only):** a single short gavel/tick asset (CC0 or self-made). Gate behind an "Enable sound" control (autoplay policy). Never loop.

### A12. Performance budget

- Route-level code splitting: `React.lazy` for `/board`, `/team`, `/admin` so a phone downloads only the Team bundle. Target: **Team route < 150 KB gzipped JS**.
- Fonts: latin subsets, 5 files total, `font-display: swap` (Fontsource default), `<link rel="preload">` for the two display weights.
- State: a single `useAuction` store; derive with selectors; `memo` the 15 `TeamCell`s so a bid re-renders only the cells whose props changed.
- No runtime CSS-in-JS. No heavy chart or animation libraries.

---

### A13. Verification loop (how you prove it's good, not just claim it)

1. **State gallery route** `/dev/states?state=LIVE_LOW_TIMER`: renders each surface from **fixtures** (no server). Cover every row of §A6. This is the single most useful dev tool: you can review, screenshot and skill-critique every state without running a full auction.
2. **Playwright screenshots** (free):

   ```bash
   npm i -D -w web @playwright/test @axe-core/playwright && npx playwright install chromium
   ```

   ```ts
   // tests/ui/visual.spec.ts
   import { test } from "@playwright/test";
   const states = ["NOT_STARTED","ON_DECK","LIVE","LIVE_LOW_TIMER","PAUSED","HAMMER","SOLD","UNSOLD","BREAK","ENDED","OFFLINE"];
   const sizes = { board: [1920,1080], board43: [1024,768], team: [390,844], admin: [1366,768] } as const;
   for (const [surface, [w,h]] of Object.entries(sizes))
     for (const s of states)
       test(`${surface} ${s}`, async ({ page }) => {
         await page.setViewportSize({ width: w, height: h });
         await page.goto(`/dev/states/${surface.replace("43","")}?state=${s}`);
         await page.screenshot({ path: `docs/screenshots/${surface}-${s}.png` });
       });
   ```

3. **Accessibility:** `@axe-core/playwright` (`new AxeBuilder({ page }).analyze()`) on each state; then a Lighthouse pass in Chrome DevTools (Accessibility ≥ 95, Performance ≥ 90 on Team).
4. **Distance test:** screenshot on a big screen, stand 3 m back, shrink to ⅓ size. Can you read the bid, leader and timer?
5. **Real-device test:** 3 real phones (one old Android), on the hotspot, bid concurrently.
6. **Skill review passes** (Part B): `critique` → `audit` → Vercel guidelines review. Fix, re-screenshot.

### A14. Definition of done (frontend)

- [ ] No horizontal or vertical scroll on the Board at 1920×1080, 1280×720, 1024×768
- [ ] Bid, leader and timer readable from the back of a room (distance test passed)
- [ ] All states in §A6 exist and were screenshotted
- [ ] Every disabled control shows a reason
- [ ] Connection badge on every surface; reconnect verified by toggling airplane mode
- [ ] Contrast verified for all token pairs and for `readableOn` on all 15 team colours
- [ ] Keyboard-only run-through of the Admin desk succeeds
- [ ] `prefers-reduced-motion` verified
- [ ] axe: zero serious/critical violations
- [ ] No banned items from §A1 remain
- [ ] Fonts self-hosted; app works with the network disconnected (LAN mode)
- [ ] You can explain every token and layout decision (viva)

---

## Part B — Installing UI/UX `SKILL.md` files

### B1. What a skill is (and how it loads)

An **Agent Skill** is a folder containing a `SKILL.md` (YAML frontmatter + instructions) and optional `scripts/`, `references/`, `assets/`. It uses **progressive disclosure**: only `name` + `description` sit in context all the time; the body loads when your request matches the description; bundled files load on demand. Installing many skills therefore costs little, but overlapping descriptions can make the agent pick the wrong one, so keep the set small.

```
my-skill/
├── SKILL.md            ← required
├── references/…        ← optional deep docs
└── scripts/…           ← optional helpers the agent can run
```

```yaml
---
name: my-skill            # lowercase, digits, hyphens; ≤64 chars; can't contain "anthropic" or "claude"
description: What it does AND when to use it   # non-empty, ≤1024 chars
---
```

### B2. Where skills live

| Surface | Location / method |
|---|---|
| **Claude Code, personal (all projects)** | `~/.claude/skills/<name>/SKILL.md` (Windows: `%USERPROFILE%\.claude\skills\<name>\SKILL.md`) |
| **Claude Code, project-scoped (commit to repo)** | `<repo>/.claude/skills/<name>/SKILL.md` |
| **Claude Code, plugin marketplace** | `/plugin marketplace add <owner/repo>` then `/plugin install …` |
| **Claude.ai / Claude Desktop** | Zip the skill **folder**, then upload in Settings (Features/Capabilities, wording varies). Needs code execution enabled; Pro, Max, Team or Enterprise plan. Per-user, and separate from Claude Code |
| **Claude API** | `/v1/skills` endpoints (not needed here) |

Notes: Claude Code watches existing skill directories and picks up changes in-session; if you create a brand-new `.claude/skills/` directory, restart once. Skills uploaded on one surface are **not** shared with the others. (This chat environment already ships with a built-in `frontend-design` skill.)

### B3. Security first (read before installing anything)

Skills can include scripts and instructions that the agent will follow, so **treat them like code you run**:

- Prefer **original repos** (`anthropics/*`, `pbakaus/impeccable`, `vercel-labs/agent-skills`, `nextlevelbuilder/ui-ux-pro-max-skill`). Aggregator sites (skills.sh, mdskills, etc.) are mirrors: fine for browsing, but install from the source repo.
- **Read `SKILL.md` and any `scripts/` before installing.** Look for network calls, `curl | sh`, credential access, or instructions that tell the agent to ignore rules.
- Note that `web-design-guidelines` deliberately **fetches its rule list from GitHub at run time**, so its behaviour depends on remote content. Acceptable for a well-known Vercel repo, but you should know it.
- Pin a version/commit when you can; avoid `-y` (auto-yes) flags on things you haven't read.
- Don't install 20 skills. Overlap = noise.

### B4. The recommended set (for this project)

| Priority | Skill | Source | Role | Use it for |
|---|---|---|---|---|
| ★ Must | **frontend-design** | Anthropic (`anthropics/claude-code` plugin, also in `anthropics/claude-plugins-official`) | Aesthetic direction; pushes against generic output | Establishing the visual concept before you build each surface |
| ★ Must | **impeccable** | `pbakaus/impeccable` | Design vocabulary with ~23 commands (`critique`, `audit`, `polish`, `typeset`, `layout`, `harden`, `animate`, `distill`…) plus deterministic anti-pattern detection | The refine loop; catching slop mechanically |
| ★ Must | **web-design-guidelines** | `vercel-labs/agent-skills` | **Quality gate**: reviews UI code against 100+ Web Interface Guidelines (accessibility, forms, focus, animation, typography), outputs terse `file:line` findings | Final review before you record the demo |
| Optional | **ui-ux-pro-max** | `nextlevelbuilder/ui-ux-pro-max-skill` | Searchable design database (styles, palettes, font pairings, UX guidelines, chart types) | Only if you want *options* for palette/type before committing. This guide already gives you a direction |
| Optional | Vercel `composition-patterns` / `react-best-practices` | `vercel-labs/agent-skills` | React architecture / performance rules (the latter is Next.js-leaning) | Nice for component structure; skip if short on time |
| Yours | **auction-ui** (custom, §B8) | your repo | Encodes *this* project's tokens and rules so every AI edit stays consistent | Always on for this repo |

**How they fit together:** `frontend-design` and `impeccable` both fight generic aesthetics and overlap, so if you hear two competing voices, keep `impeccable` as the driver and let `frontend-design` do the initial concept. `web-design-guidelines` is not a generator; it's the gate at the end. Your own `auction-ui` skill is the tiebreaker: its rules win.

### B5. Install: Claude Code (recommended path)

**Prereqs:** Claude Code installed, Node 18+ (for `npx`), Git.

#### 1) frontend-design (Anthropic)

```bash
# inside Claude Code
/plugin marketplace add anthropics/claude-code
/plugin                      # → Browse and install plugins → frontend-design → Install
```

Alternative CLI route:

```bash
npx skills add anthropics/claude-code --skill frontend-design
```

Manual route (project-scoped). The raw path has moved between repos over time, so if the URL 404s, use the marketplace route above:

```bash
mkdir -p .claude/skills/frontend-design
curl -fsSL -o .claude/skills/frontend-design/SKILL.md \
  https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md
```

#### 2) impeccable

Any one of:

```bash
npx impeccable install                                   # official installer (README)
npx skills add https://github.com/pbakaus/impeccable --skill impeccable
# or, inside Claude Code:
/plugin marketplace add pbakaus/impeccable               # then /plugin → install Impeccable
```

Then, from your repo root, inside Claude Code:

```text
/impeccable init         # inspects the project, writes PRODUCT.md (durable product truth)
/impeccable document     # records your existing visual system in DESIGN.md
```

Impeccable writes working files (critique/polish screenshots, caches, per-developer config) under `.impeccable/`. Check what it created and add cache/screenshot folders to `.gitignore`; keep `PRODUCT.md` and `DESIGN.md` committed (they're useful project docs).

#### 3) web-design-guidelines (Vercel)

```bash
npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines
# or, inside Claude Code:
/plugin marketplace add vercel-labs/agent-skills
# or manually:
git clone https://github.com/vercel-labs/agent-skills.git
cp -r agent-skills/skills/web-design-guidelines ~/.claude/skills/        # macOS/Linux
```

Windows PowerShell:

```powershell
git clone https://github.com/vercel-labs/agent-skills.git
Copy-Item -Recurse agent-skills\skills\web-design-guidelines "$env:USERPROFILE\.claude\skills\"
```

#### 4) (Optional) ui-ux-pro-max

```bash
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
```

#### 5) Verify

```text
/skills                     # list loaded skills; you should see each name
```

If one is missing: check the path is `…/skills/<name>/SKILL.md`, the file starts with `---` and has `name:`; restart Claude Code once.

Smoke tests: *"Review web/src/pages/Board.tsx against the web design guidelines"* · *"/impeccable critique board"*.

### B6. Install: Claude.ai / Claude Desktop (no terminal)

1. Enable **Code execution and file creation** in Settings → Capabilities.
2. Download or clone the skill repo; **zip the skill folder itself** (the zip should contain `<skill-name>/SKILL.md`, not a bare file).
3. Settings → Capabilities/Features → Skills → upload the zip → toggle on.
4. Remember: this is separate from Claude Code, and per-user.
5. Limits: skills that need a terminal, browser or your local files (Impeccable's live mode, Playwright loops) work best in **Claude Code**.

### B7. Using the skills: the per-surface workflow

Run this loop **for each surface** (Board → Team → Admin), one at a time:

| Step | Command / action | Output |
|---|---|---|
| 1. Ground | `/impeccable init` once; paste §B9 into `PRODUCT.md`; keep §A2 tokens in `tokens.css` | Shared context |
| 2. Concept | Ask `frontend-design`: *"Design direction for the Live Board per PRODUCT.md and auction-ui skill; broadcast control-room, dark, single gold accent. Don't deviate from tokens."* | Layout sketch in code |
| 3. Build | Implement from §A4–A5 + the state gallery | Working screens |
| 4. Critique | `/impeccable critique board` | Hierarchy/clarity review |
| 5. Audit | `/impeccable audit board` | a11y, performance, responsive findings |
| 6. Targeted fixes | `/impeccable typeset board`, `layout`, `harden` (edge cases/overflow/long names), `distill` (remove clutter) | Refined UI |
| 7. Gate | *"Review web/src/pages/Board.tsx and its components against the web design guidelines"* | `file:line` violations to fix |
| 8. Prove | Playwright screenshots + axe (§A13) | Evidence for README/video |
| 9. Polish | `/impeccable polish board` last | Ship-ready |

**How to prompt so you stay in control (and pass the viva):**

- Give constraints, not vibes: *"Use only tokens from tokens.css. No new colours. No cards inside cards."*
- Make it **explain** decisions and then read them: you must be able to defend the type scale, colour usage and layout.
- Accept changes **in small diffs**, commit each (`style(board): tighten ribbon spacing`).
- Reject anything that reintroduces §A1 banned items.
- Disclose AI use in the README (allowed; must be understood).

### B8. Your own project skill: `auction-ui`

Create `.claude/skills/auction-ui/SKILL.md` and commit it. It pins this project's design system so every AI edit stays consistent.

````markdown
---
name: auction-ui
description: Design system and UI rules for the Live IPL Mega Auction frontend (Live Board, Team Console, Auctioneer Desk). Use whenever creating or editing anything under web/src (components, pages, styles), reviewing UI, or choosing colours, type, spacing, copy or motion for this project.
---

# Auction UI — project design rules

## Product context
Realtime in-hall franchise auction. Three surfaces: Board (projector, 5–15 m, read-only), Team Console (phone, one thumb), Admin Desk (laptop, keyboard). The server is the source of truth; the UI never computes money or winners.

## Non-negotiables
- Tokens live in `web/src/styles/tokens.css`. Use them. Never hard-code colours, sizes or fonts.
- Dark "broadcast control room": flat tonal surfaces (ink-950/900/800), 1px hairlines, radius ≤ 6px.
- ONE accent (gold-400): current bid, primary action. Semantic colours (live/warn/danger) only for state.
- Team colours only for identity: leader strip, ribbon edge, SOLD overlay. Text on them via `readableOn()`.
- Fonts: Barlow Condensed (numbers, names, big display), IBM Plex Sans (UI). Numerals use `.num` (tabular). Self-hosted.
- Money is integer lakhs; format only with `formatLakhs`. Unit smaller than figure.
- Board: no scroll at 1920×1080, 1280×720, 1024×768; nothing meaningful < 22px; 48px safe margins.
- Team: BID button ≥ 72px, pinned bottom, safe-area aware; every disabled state shows a reason line.
- Admin: keyboard shortcuts (Space, S, U, N); destructive actions need press-and-hold or type-to-confirm; Undo bar after SOLD.
- Motion: only transform/opacity; ≤ 400ms; respect prefers-reduced-motion; no decorative animation.
- Accessibility: contrast ≥ 4.5:1, focus-visible ring, colour never the only signal, timer aria-live off + a throttled polite live region.

## Banned
Purple/blue gradients, glow, glassmorphism, nested cards, rounded-2xl+shadow-lg, emoji icons, gray-500 on dark, placeholder team names, full-page spinners, toasts for successes, unlabeled icon buttons, jargon in UI copy (use plain language: "Time's up", not "HAMMER").

## Copy
Short, declarative, no exclamation marks except "SOLD". Error copy comes from the table in FRONTEND_GUIDE.md §A9.

## Workflow
1. Check every phase state exists in the state gallery (`/dev/states`).
2. After changes run `npm run ui:shots` and `npm run ui:a11y`; inspect screenshots.
3. Before finishing: no banned items, tokens only, keyboard path works.
````

Keep it under ~100 lines; long skills dilute the instructions.

### B9. `PRODUCT.md` seed for Impeccable (edit to taste)

```markdown
# Product
Live IPL Mega Auction Platform — realtime franchise auction for an in-person VITBMUN-style event.

## Users
- Audience in a hall (non-technical) watching a projector.
- Franchise representatives bidding from phones under time pressure.
- One auctioneer operating a laptop desk.

## Purpose
Run an auction end to end with trustworthy bids, purses and results, visible to everyone instantly.

## Tone
Confident, calm, broadcast-grade. Drama only at the clock and at SOLD. Plain language.

## Anti-goals
Not a marketing site. No gradients/glow/glass, no decorative motion, no jargon, no clutter.

## Constraints
Works offline on a LAN (self-hosted fonts, no CDN). Projector legibility. Accessible (WCAG AA).
```

### B10. Troubleshooting

| Problem | Fix |
|---|---|
| Skill doesn't appear in `/skills` | Path must be `skills/<name>/SKILL.md`; file must start with `---` + `name:`; restart Claude Code (new `.claude/skills/` dir requires it) |
| Skill never triggers | Description too vague. Say what it does **and when** (mention file paths/tasks). Or invoke by name/slash command |
| Two skills fight | Remove the weaker overlap; make `auction-ui` explicit about precedence |
| `npx skills add` fails | Check Node ≥ 18, network, and the repo README for the current command; fall back to the manual copy |
| Windows path issues | Use PowerShell examples in §B5; `~` is `%USERPROFILE%` |
| Claude.ai upload rejected | Zip must contain the skill **folder** with `SKILL.md`; name is lowercase-hyphens and can't include reserved words; code execution must be on |
| Output still looks generic | Your tokens/constraints aren't in context. Point the agent at `tokens.css` and `auction-ui`, ask for a critique, and delete banned patterns by hand |
| Vercel review can't fetch rules | It pulls the guideline file from GitHub at run time; check connectivity or paste the guidelines into the prompt |

### B11. Realistic expectations

Skills raise the floor, not the ceiling. They stop the worst defaults and give you a shared vocabulary, but **taste and decisions are yours**: the concept, the token values, the state matrix, the copy. Those are also what you'll be asked about in the viva. Use the skills to *critique and accelerate*, and make sure every visual choice has a one-sentence reason you can say out loud.

---

## Sources

- Anthropic Agent Skills overview and locations (`~/.claude/skills`, `.claude/skills`, Claude.ai zip upload, frontmatter limits): https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- `anthropics/skills` (marketplace add, plugin install): https://github.com/anthropics/skills
- Anthropic `frontend-design` plugin install (marketplace + manual): https://kasata.medium.com/how-to-install-and-use-frontend-design-claude-code-plugin-a-step-by-step-guide-0917d933cc6a and the VS Code port listing pointing to `anthropics/claude-plugins-official`
- Impeccable (commands, install, `PRODUCT.md`/`DESIGN.md`, `.impeccable/`): https://github.com/pbakaus/impeccable
- Vercel `web-design-guidelines` (SKILL.md, runtime-fetched rules, install): https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md and https://vercel.com/docs/agent-resources/skills
- `ui-ux-pro-max`: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Survey/roles of the skills above (layering advice, treating third-party skills as untrusted code): https://ruoqijin.com/blog/frontend-design-skills-ai-agents and https://lazyskills.sh/skills/frontend-design

> Star counts, install counts and command counts on third-party sites change daily and sometimes disagree; this guide deliberately omits them. Confirm current commands in each project's README before installing.
