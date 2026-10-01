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
Short, declarative, no exclamation marks except "SOLD". Error copy comes from `web/src/lib/bidGate.ts` (rejectionCopy) and FRONTEND_GUIDE.md §A9.

## Workflow
1. Check every phase state exists in the state gallery (`/dev/states`).
2. After UI changes run `npm run typecheck && npm run build` and add/extend fixtures when adding states.
3. Before finishing: no banned items, tokens only, keyboard path works.
