# Realtime protocol

Transport: Socket.IO (WebSocket). All payloads are JSON. Every client receives
full `PublicState` snapshots on connect and after every successful mutation;
state messages carry a monotonic `version` and clients ignore older versions.

## Identity

- `viewer` — no token. Receives `state` only.
- `team` — `POST /api/login {teamCode, passcode}` → `{ token }`. Pass the token
  as `auth: { token }` in the socket handshake. Receives `state` + private `me`
  and may emit `bid`.
- `admin` — `POST /api/admin/login {password}` (env `ADMIN_PASSWORD`) →
  `{ token }`. May emit all `admin:*` events.

Identity is resolved **once** from the handshake token into `socket.data` by
server middleware. Handlers never read identity from event payloads, so a
client cannot bid or act as another team.

## Server → Client

| Event | Payload | Notes |
|---|---|---|
| `state` | `PublicState` (full snapshot) | On connect + after every mutation. Version-guarded. |
| `me` | `Me` | Private, only to room `team:<id>`. Purse, squad, compliance, effective purse. |
| `toast` | — | (Reserved) short notifications. |

`PublicState` includes: `version`, `serverNow`, `phase`, `round`, `breakNote`,
`lot` (player, `currentBid`, `nextBid`, leader, `deadlineAt`, `remainingMs`,
`bidCount`), `lastResult`, `teams` (purse, squad counts, compliance),
`recent` events, `queue` counts and `settings`.

## Client → Server

| Event | Payload | Ack | Notes |
|---|---|---|---|
| `bid` | `{ playerId, expectedAmount, clientBidId }` | `{ok}` / `{ok:false, code, required?}` | Throttled ~5/s per socket. Retries with the same `clientBidId` bypass the throttle and hit the idempotency check. |
| `time:sync` | — | `{ serverNow }` | Used for the median-of-5 clock offset. |
| `admin:startAuction` | — | `{ok, code?}` | `NOT_STARTED → IDLE` |
| `admin:nextLot` | `{ playerId? }` | `{ok, code?}` | `IDLE → ON_DECK` |
| `admin:startLot` | — | `{ok, code?}` | `ON_DECK → LIVE` (arms first timer) |
| `admin:pause` / `admin:resume` | — | `{ok, code?}` | Stores/restores remaining ms |
| `admin:resetTimer` | — | `{ok, code?}` | Full bid-reset, back to `LIVE` |
| `admin:sold` | — | `{ok, code?}` | Atomic purse deduction; `LIVE/PAUSED/HAMMER`, needs a leader |
| `admin:unsold` | — | `{ok, code?}` | Requires **no** bids on the lot |
| `admin:undoLast` | — | `{ok, code?}` | Refunds purse + returns player to pool; `IDLE/ON_DECK` only; logged as `ADMIN_OVERRIDE` |
| `admin:cancelBids` | — | `{ok, code?}` | Clears the live lot's bids (override, logged) |
| `admin:break` / `admin:endBreak` | `{ note? }` | `{ok, code?}` | Board shows the note |
| `admin:newRound` | — | `{ok, code?}` | UNSOLD → PENDING, `round++` |
| `admin:settings` | `Partial<Settings>` | `{ok, code?}` | Zod-validated ranges |
| `admin:end` | — | `{ok, code?}` | Auction ENDED (final) |

## Error codes

`LOT_NOT_LIVE` · `STALE_LOT` · `TIMER_EXPIRED` · `ALREADY_LEADING` ·
`STALE_BID` (carries `required`) · `SQUAD_FULL` · `INSUFFICIENT_PURSE` ·
`RESERVE_VIOLATION` · `BAD_PHASE` · `NO_BIDS` · `HAS_BIDS` · `RATE_LIMITED` ·
`UNAUTHORIZED` · `BAD_REQUEST`

## Reconnect behaviour

Full snapshots + version guard make resync trivial: on any (re)connect the
server immediately emits `state` (and `me` for teams). A dropped team retries
its bid with the **same `clientBidId`** — the UNIQUE idempotency key means a
replay can never double-bid.
