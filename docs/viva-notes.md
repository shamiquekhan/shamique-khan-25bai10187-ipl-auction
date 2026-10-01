# Viva & Technical Project Defense Notes

### Live IPL Mega Auction Platform — Technical Deep Dive

Use this document to prepare for the project viva / Q&A. Every answer below reflects the exact implementation in the codebase.

---

## 1. Concurrency & Race Condition Prevention

### **Q: How does the server prevent two franchises from placing a bid at the exact same millisecond?**
> **Answer:**
> - Node.js runs JavaScript on a single thread. Socket event callbacks are queued sequentially in the event loop.
> - Each bid execution inside `placeBid()` runs within a synchronous `better-sqlite3` `BEGIN IMMEDIATE` transaction. Because calls to `better-sqlite3` are synchronous (no `await` inside the transaction), no other JS code or DB write can interleave while a bid is evaluated.
> - `BEGIN IMMEDIATE` acquires SQLite's write lock up front before reading.
> - Bids require optimistic concurrency matching: `req.expectedAmount === calculatedNextBid`. The 1st socket's bid succeeds and increments `version` and `currentBid`. The 2nd socket's bid fails with `STALE_BID` because `expectedAmount` no longer equals the updated required price. The client receives `{ ok: false, code: "STALE_BID", required: nextBid }` along with the fresh snapshot.

---

## 2. Monetary & Arithmetic Precision

### **Q: Why use integer lakhs instead of floating point numbers for currency?**
> **Answer:**
> - IEEE 754 floating point arithmetic introduces binary representation errors (`0.1 + 0.2 = 0.30000000000000004`), which lead to off-by-one currency bugs and drift over multiple transactions.
> - In our system, 1 Crore = 100 Lakhs. All purses, base prices, bids, and sold prices are stored and calculated as pure **integers in lakhs** (e.g. ₹125 Cr = `12500` lakhs).
> - Currency formatting (`formatLakhs()`) is applied strictly at the UI boundary.
> - This guarantees mathematical money conservation: $\sum \text{sold\_price} + \sum \text{remaining\_purses} = \text{total\_starting\_purses}$.

---

## 3. Realtime Synchronization & Clock Drift

### **Q: How do you guarantee clients stay in sync without refreshing the page?**
> **Answer:**
> - The server uses Socket.IO to broadcast full `PublicState` snapshots on every mutation, incrementing a monotonic `version` counter (`version++`).
> - Clients version-guard incoming state (`if (s.version >= prev.version) setState(s)`), rendering partial or out-of-order updates impossible.
> - **Timer Sync**: The server does NOT emit per-second timer ticks. It broadcasts an absolute server epoch timestamp (`deadlineAt`) and `serverNow`. Clients perform clock synchronization over socket ping samples to calculate `offset = serverTime - clientTime`. Local countdowns are rendered via `requestAnimationFrame`/intervals using `deadlineAt - (Date.now() + offset)`.

---

## 4. Security & Authentication Model

### **Q: How are team and admin sessions secured?**
> **Answer:**
> - **Passcodes**: 6-character unambiguous alphabetic codes (excluding `0/O/1/I`) generated at seed time, stored using `crypto.scryptSync` with per-passcode salts (`salt:hash`).
> - **Session Tokens**: 32 random bytes (`crypto.randomBytes(32)`). Only the SHA-256 hash (`crypto.createHash('sha256')`) is stored in SQLite.
> - **Socket Identity**: Socket middleware resolves tokens upon handshake and attaches identity to `socket.data`. Event handlers strictly infer `teamId` from `socket.data.teamId`, ignoring any team IDs in client event payloads to prevent impersonation.

---

## 5. Failure Recovery & Fault Tolerance

### **Q: What happens if the server process crashes mid-auction?**
> **Answer:**
> - SQLite WAL (Write-Ahead Logging) mode ensures all completed transactions are persisted immediately to disk.
> - **Boot Recovery**: On startup, the server checks `auction_state`. If `phase === 'LIVE'` (indicating a crash while a lot was active), it automatically transitions the state to `PAUSED` with a safe remaining time (`bidResetSeconds * 1000`).
> - Upon restart, all connected clients reconnect automatically, receive the latest state, and see the lot as `PAUSED` until the auctioneer explicitly resumes bidding.
