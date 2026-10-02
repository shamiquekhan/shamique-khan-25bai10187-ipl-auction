# Live IPL Mega Auction Platform

| | |
|---|---|
| **Participant** | Shamique |
| **Registration Number** | 25BAI10187 |
| **Date of Submission** | 02 October 2026 |
| **Repo** | Shamique_25BAI10187_IPL_Auction |
| **Demo video** | https://youtu.be/hKUNN6SGS8g |
| **Live demo (optional)** | <Render/tunnel link> |

## What it is

A realtime, **server-authoritative** IPL mega-auction platform for an in-hall
event: a projector-first **Live Board**, one-tap **Team Consoles** on phones,
and an **Auctioneer Desk**. Clients send intents; a single Node process
validates every bid inside one synchronous SQLite transaction and broadcasts
versioned full-state snapshots over WebSockets. Refresh is never needed.

## Stack

Node.js 20+ · TypeScript · Express · Socket.IO · SQLite
(`better-sqlite3`, WAL) · React 19 + Vite + Tailwind v4 · Vitest

## Quick start

```bash
cp .env.example .env          # set ADMIN_PASSWORD
npm ci
npm run seed                  # creates auction.db + passcodes.csv (gitignored)
npm run build                 # builds web/dist
npm start                     # http://<your-LAN-IP>:3000
```

- Team consoles: `http://<ip>:3000/team` — passcodes are in `passcodes.csv`
- Live board: `http://<ip>:3000/board` · Auctioneer desk: `http://<ip>:3000/admin`
- Put every device on the **same Wi-Fi or hotspot**. Campus Wi-Fi with client
  isolation? Use a phone hotspot, or `cloudflared tunnel --url http://localhost:3000`
  for a free public URL (random subdomain, no SLA).

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP + WebSocket port |
| `ADMIN_PASSWORD` | `admin123` (change it!) | Auctioneer desk login |
| `DB_PATH` | `./auction.db` | SQLite file |
| `SEED_ON_EMPTY` | `false` | Seed teams/players if the DB is empty (Render: `true`) |
| `PASSCODES_CSV` | `./passcodes.csv` | Where the seeder writes team passcodes |

## Architecture

See [docs/architecture.md](docs/architecture.md) (mermaid diagram + full bid
data flow) and [docs/protocol.md](docs/protocol.md) (every socket event).

**In one line:** clients send *intents*; the server validates each bid in one
`BEGIN IMMEDIATE` SQLite transaction — dedupe → phase → deadline → leader →
amount → squad → purse → reserve → insert → reset timer → `version++` — and
broadcasts full snapshots that clients version-guard.

## Auction rules & stated assumptions

- Up to **15 franchises**, each starting with **12,500 lakhs (₹125 Cr)**.
- All money is **integer lakhs**; ₹Cr is display-only formatting.
- Increments are tiered by the **current** bid: `+10` below 100 L, `+20` below
  500 L, else `+50` (so 95→105, 490→510, 500→550).
- **First bid equals the base price** (assumption: base price is the opening bid).
- The **leader cannot re-bid** on the same lot.
- **Timer:** first deadline `lotSeconds`; every accepted bid resets the timer to
  a fixed `bidResetSeconds` (assumption: fixed reset, not `max(remaining, reset)`).
  At expiry the lot locks (`HAMMER`) until the auctioneer gavels
  (`autoHammer` setting sells/unsolds automatically).
- **Sold** is atomic: guarded purse deduction + player update in one
  transaction. **Unsold** requires no bids on the lot.
- **Squad constraints** (configurable in settings): min 7 players, ≥1 WK,
  ≥3 bowlers (ARs count as bowlers by default), max 15.
- **Reserve rule** (toggleable): a team must keep `minSquad − squadAfterBid`
  lots × min base price in purse so it can always finish a legal squad.
- Undo is restricted to the most recent sale and only while no lot is live.

## Realtime protocol

See [docs/protocol.md](docs/protocol.md).

## Security notes

- Team passcodes: 6-char unambiguous alphabet, **scrypt-hashed** at rest,
  written once to `passcodes.csv` (gitignored) to hand to teams.
- Session tokens: 32 random bytes; only their SHA-256 is stored.
- Identity comes from the authenticated socket (`socket.data`), **never** from
  event payloads — a client cannot bid as another team.
- Every payload is zod-validated; logins are rate-limited (10/min/IP).
- Exports and admin APIs require the admin token.

## Testing

One command runs the whole verification pipeline:

```bash
npm run verify     # typecheck → build → unit → race → backend → load → UI
SKIP_UI=1 npm run verify   # skip the Playwright stage
```

| Stage | What it proves |
|---|---|
| `npm run typecheck` | Strict TS across shared, server, web |
| `npm test` | 50 unit + engine tests: increment tiers, squad/reserve rules, every bid-rejection code, atomic Sold/Unsold, undo, idempotency, money conservation |
| `npm run test:race` | 10 simultaneous bids over real sockets → exactly 1 winner, 9 stale, retry with the same `clientBidId` never double-bids, viewers rejected |
| `npm run check:backend` | 76 assertions against a live server: auth, every state-machine transition, timer reset/expiry, purse deduction exactness, rate limiting, exports. Runs against a throwaway server + temp DB inside `verify`, or set `AUCTION_BASE` to target any running instance |
| `npm run load` | 15-bot soak: Σ sold == starting − remaining purses, no negative purse, snapshot version sync, latency stats |
| Playwright (in `verify`) | 27 visual/a11y tests: every board/team/admin state from the fixture gallery, no overflow at 1920×1080 and 1024×768, disabled-BID reason lines, axe: zero serious/critical violations, projector distance-legibility thresholds |

State screenshots live in `docs/screenshots/` (every phase per surface, plus
distance-test evidence). The fixture gallery itself is at
`/dev/states?surface=board&state=LIVE` — no server data required, so any state
can be reviewed or screenshotted in isolation.

The headline claims, testable by anyone on a clean clone:
- **Race safety** — the single-writer + `expectedAmount` argument, proven with concurrent sockets.
- **Money integrity** — `Σ sold_price == starting purses − remaining purses` after a full soak.
- **Legibility** — rendered board type measured against the §A4 projector thresholds (timer 307 px, bid 250 px, secondary 31 px at 1080p).

## Known limitations / future work

- Single process by design (one writer). Horizontal scaling needs a shared
  lock/queue or one Durable Object per room.
- The admin password is one shared secret; per-auctioneer accounts would need
  a users table.
- No payments — purses are bookkeeping only.
- On ephemeral hosts (Render free tier) the DB resets on redeploys; use
  `SEED_ON_EMPTY=true` there, and Mode A (laptop on LAN) for the real event.

## AI assistance disclosure

Code was drafted with AI assistance (pair-programming style) and then reviewed,
tested and understood line-by-line by the author. The decision log in
[docs/decisions.md](docs/decisions.md) explains every architectural choice.
