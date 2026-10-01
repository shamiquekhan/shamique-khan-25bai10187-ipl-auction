# Decision log (viva notes)

One or two lines per decision — what was chosen and why. Doubles as viva prep.

| # | Decision | Why |
|---|---|---|
| 1 | Node.js + TypeScript everywhere | One language for server + client; first-class WebSocket ecosystem; typed shared protocol |
| 2 | Socket.IO over raw `ws` | Auto-reconnect, acks (needed for bid results), rooms (`team:<id>`), heartbeat |
| 3 | SQLite via `better-sqlite3`, WAL | Zero cost/ops, ACID, and **synchronous** calls → no `await` between a bid's read and write |
| 4 | Single process, single writer | One auction room; removes all cross-process races; scaling is a documented limitation |
| 5 | Money as integer lakhs everywhere | Floats rounding errors are integrity bugs; format to ₹Cr only at the UI edge |
| 6 | First bid = base price; tier from CURRENT bid (490→510, 500→550) | Stated assumption from the brief's ambiguity; pure function `nextBidAmount` |
| 7 | Purse deducted at SOLD, not per bid | Only one live lot; a team leads ≤1 lot; bid-time check is `purse >= required` |
| 8 | `BEGIN IMMEDIATE` transactions | Write lock taken up front; writes serialise even across processes |
| 9 | `clientBidId` UNIQUE idempotency key | Network retry can never double-bid; duplicate returns the original success |
| 10 | `expectedAmount` optimistic concurrency | Loser of a same-instant race gets `STALE_BID` + fresh state instead of bidding blind |
| 11 | Identity from `socket.data`, never payload | Middleware resolves the handshake token once; clients cannot impersonate teams |
| 12 | scrypt passcode hashes; SHA-256-stored session tokens | No plaintext secrets at rest; constant-time compares |
| 13 | Absolute `deadline_at` + re-read on fire | The timestamp is authoritative, not the `setTimeout` callback; stale fires are no-ops |
| 14 | Fixed reset to `bidResetSeconds` on each bid | Chosen variant of the brief's ambiguity; stated in README assumptions |
| 15 | Snapshots, not deltas | ~10 KB state; self-healing on reconnect; no ordering bugs; version guard drops stragglers |
| 16 | No per-second server ticks | Clients count down locally after median-of-5 clock sync; cheaper and drift-free |
| 17 | `HAMMER` phase after expiry | Bidding locks; the auctioneer confirms — mirrors "going once, twice, sold"; `autoHammer` optional |
| 18 | `events` append-only audit trail | Powers activity log; disputed last-second bids have server timestamps |
| 19 | Boot recovery: LIVE → PAUSED | A crashed server never silently resumes a timer; the auctioneer resumes consciously |
| 20 | Fictional teams/players in seed data | Trademark hygiene; real event would re-seed with its own lists |

## Known limitations (honest answers for the viva)

- Multi-room or horizontal scaling would need a shared lock/queue (or one Durable Object per room).
- SQLite is single-writer — fine for one room, not for heavy concurrent write analytics.
- The admin password is a single shared secret; per-auctioneer accounts would need a users table.
- No real payments — purses are bookkeeping only.
