import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { BidAck, Me, PublicState } from "@auction/shared";
import { formatLakhs, ROLE_LABEL } from "../lib/format.js";
import { bidGate, rejectionCopy } from "../lib/bidGate.js";
import { readableOn } from "../lib/color.js";
import { buzz, keepAwake } from "../lib/device.js";
import { useAuction } from "../lib/useAuction.js";
import { ConnectionBadge } from "../components/ConnectionBadge.js";
import { BidButton } from "../components/BidButton.js";

const TOKEN_KEY = "auction_team_token";

export default function Team({
  fixtureState,
  fixtureMe,
  fixtureOffline,
}: {
  fixtureState?: PublicState;
  fixtureMe?: Me;
  fixtureOffline?: boolean;
} = {}) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const live = useAuction("team", token);
  const state = fixtureState ?? live.state;
  const me = fixtureMe ?? live.me;
  const online = fixtureOffline != null ? !fixtureOffline : live.online;
  const socket = live.socket;
  const [tab, setTab] = useState<"bid" | "squad">("bid");

  useEffect(() => {
    if (token) keepAwake();
  }, [token]);

  // ---- login ----
  const [teamCode, setTeamCode] = useState("");
  const [passcode, setPasscode] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamCode, passcode: passcode.toUpperCase() }),
      });
      const j = await r.json();
      if (!j.ok) {
        setLoginError(
          r.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : "That code didn't work. Check with the organiser."
        );
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, j.token);
      setToken(j.token);
    } catch {
      setLoginError("Can't reach the auction server. Check the Wi-Fi.");
    } finally {
      setLoggingIn(false);
    }
  };

  // ---- bidding ----
  const [pending, setPending] = useState(false);
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const gate = bidGate(state, me, online);

  const sendBid = async () => {
    if (!socket?.connected || !state?.lot || pending) return;
    setPending(true);
    setErrorLine(null);
    try {
      const ack = (await socket.emitWithAck("bid", {
        playerId: state.lot.player.id,
        expectedAmount: state.lot.nextBid,
        clientBidId: crypto.randomUUID(),
      })) as BidAck;
      if (ack.ok) {
        buzz(30); // success is shown in place by the incoming state
      } else {
        setErrorLine(rejectionCopy(ack.code!, ack.required));
      }
    } catch {
      setErrorLine("Couldn't confirm your bid. Check the price and try again.");
    } finally {
      setPending(false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  // ---------- logged out (fixtures render the console directly) ----------
  if (!token && !fixtureState) {
    return (
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
        <h1 className="num text-center text-4xl font-bold text-gold-400">Team login</h1>
        <form onSubmit={login} className="space-y-4">
          <div>
            <label htmlFor="team" className="mb-1 block text-[16px] text-text-2">
              Your franchise
            </label>
            <select
              id="team"
              value={teamCode}
              onChange={(e) => setTeamCode(e.target.value)}
              className="w-full rounded-md border border-ink-600 bg-ink-900 p-3 text-[18px]"
              required
            >
              <option value="">Choose…</option>
              {(state?.teams ?? []).map((t) => (
                <option key={t.id} value={t.code}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pass" className="mb-1 block text-[16px] text-text-2">
              Passcode
            </label>
            <input
              id="pass"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value.toUpperCase())}
              className="num w-full rounded-md border border-ink-600 bg-ink-900 p-3 text-[24px] tracking-[0.2em] uppercase"
              placeholder="······"
              maxLength={6}
              autoComplete="off"
              inputMode="text"
              required
            />
          </div>
          {loginError && <div className="text-[16px] text-danger">{loginError}</div>}
          <button
            type="submit"
            disabled={loggingIn}
            className="h-14 w-full rounded-md bg-gold-400 text-[20px] font-semibold text-on-accent disabled:bg-ink-700 disabled:text-text-2"
          >
            {loggingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  const lot = state?.lot ?? null;
  const isSoldToMe =
    state?.lastResult?.outcome === "SOLD" && state.lastResult.teamId === me?.team.id;

  // ---------- console ----------
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      {/* Header — text colour computed for contrast on the team colour (§A8) */}
      <div
        className="relative overflow-hidden flex items-stretch justify-between shadow-md"
        style={{
          background: me?.team.color ?? "var(--color-ink-900)",
          color: me ? readableOn(me.team.color) : "var(--color-text-1)",
        }}
      >
        <div className="flex-1 p-4 z-10">
          <div className="text-[15px] font-medium tracking-wide">{me?.team.name ?? "…"}</div>
          <div className="num text-[42px] font-bold leading-none tracking-tight mt-1">
            {me ? formatLakhs(me.team.purse) : "—"}
          </div>
          {me && (
            <div className="mt-2 h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-black/25">
              <div
                className="h-full bg-current transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, (me.team.purse / 12500) * 100))}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex flex-col items-end justify-between p-3 z-10">
          <ConnectionBadge online={online} />
          <button onClick={logout} className="text-[13px] font-semibold underline">
            Log out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-ink-600 bg-ink-900/50">
        {(["bid", "squad"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 p-3 text.medium text-[16px] transition-colors ${
              tab === t ? "border-b-2 border-gold-400 text-gold-400 font-bold bg-ink-850" : "text-text-2 hover:text-text-1"
            }`}
          >
            {t === "bid" ? "Bid Console" : `My Squad (${me?.squad.length ?? 0})`}
          </button>
        ))}
      </div>

      {tab === "bid" ? (
        <div className="flex-1 space-y-4 p-4 pb-40">
          {/* Lot card */}
          {lot ? (
            <div className="panel-card p-5 space-y-3">
              <div className="flex items-center justify-between text-[13px] text-text-2">
                <span className="num font-semibold text-text-1 bg-ink-800 px-2.5 py-0.5 rounded border border-ink-700">
                  {ROLE_LABEL[lot.player.role] ?? lot.player.role}
                </span>
                <span>Set {lot.player.setNo} · Base {formatLakhs(lot.player.basePrice)}</span>
              </div>
              <div className="num text-[30px] font-bold leading-tight">{lot.player.name}</div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-ink-800">
                <div className="rounded bg-ink-950 p-2.5 border border-ink-800">
                  <div className="text-[12px] uppercase text-text-2 font-medium">Current bid</div>
                  <div className="num text-[26px] font-bold text-gold-400 mt-0.5">
                    {lot.currentBid != null ? formatLakhs(lot.currentBid) : "—"}
                  </div>
                </div>
                <div className="rounded bg-ink-950 p-2.5 border border-ink-800 text-right">
                  <div className="text-[12px] uppercase text-text-2 font-medium">Next bid</div>
                  <div className="num text-[26px] font-bold text-text-1 mt-0.5">{formatLakhs(lot.nextBid)}</div>
                </div>
              </div>
              <div className="text-[15px] font-medium text-text-2 pt-1 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${gate.kind === "leading" ? "bg-live animate-ping" : "bg-ink-600"}`} />
                {gate.kind === "leading"
                  ? "You're the highest bidder."
                  : lot.leaderTeamId != null
                    ? `Leading: ${state?.teams.find((t) => t.id === lot.leaderTeamId)?.name}`
                    : "No bids yet"}
              </div>
            </div>
          ) : (
            <div className="panel-card p-8 text-center text-[16px] text-text-2 space-y-2">
              <div className="num text-xl font-bold text-text-1">
                {state?.phase === "HAMMER"
                  ? "Time's up for this player."
                  : "No player on the block right now."}
              </div>
              <div className="text-sm">Standby for the auctioneer to call the next lot.</div>
            </div>
          )}

          {/* Sold moment, in place */}
          {isSoldToMe && (
            <div className="fade-in panel-card border-gold-400/50 bg-gold-400/10 p-5 text-center glow-gold">
              <div className="num text-[40px] font-bold text-gold-400 tracking-wide">SOLD!</div>
              <div className="text-[16px] text-text-1 font-medium mt-1">
                {state?.lastResult?.playerName} joined your squad for{" "}
                <span className="num font-bold text-gold-400">{formatLakhs(state?.lastResult?.price ?? 0)}</span>
              </div>
            </div>
          )}

          {/* Purse detail */}
          {me && (
            <div className="rounded-md bg-ink-900 border border-ink-800 p-3 text-[14px] text-text-2 flex items-center justify-between">
              <span>Purse remaining: <strong className="num text-text-1">{formatLakhs(me.team.purse)}</strong></span>
              {me.effectivePurse < me.team.purse && (
                <span className="text-xs text-warn font-medium">Usable reserve: {formatLakhs(me.effectivePurse)}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        // ---- squad tab ----
        <div className="flex-1 p-4 pb-40 space-y-4">
          {me && (
            <div className="panel-card p-4 text-[15px] space-y-2">
              <div className="font-bold text-gold-400 uppercase tracking-wider text-xs">Squad Compliance Status</div>
              <div className="text-text-2">
                <span className="num font-semibold text-text-1">{me.compliance.size}</span> players · WK <span className="num font-semibold text-text-1">{me.compliance.wk}</span> · Bowlers{" "}
                <span className="num font-semibold text-text-1">{me.compliance.bowlers}</span>
              </div>
              {me.compliance.ok ? (
                <div className="text-live font-semibold flex items-center gap-1.5 text-sm">
                  <span>✓</span> Ready to play (meets all squad rules).
                </div>
              ) : (
                <div className="text-warn font-semibold flex items-center gap-1.5 text-sm">
                  <span>⚠</span> Still needs: {me.compliance.missing.join(", ")}
                </div>
              )}
            </div>
          )}
          
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-text-3 px-1">Purchased Roster</div>
            {(me?.squad ?? []).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between panel-card px-3.5 py-3 transition-colors hover:border-ink-600"
              >
                <div className="flex items-center gap-2.5">
                  <span className={`num rounded px-2 py-0.5 text-xs font-bold ${
                    p.role === "BAT" ? "bg-blue-950 text-blue-400 border border-blue-800" :
                    p.role === "BOWL" ? "bg-red-950 text-red-400 border border-red-800" :
                    p.role === "AR" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" :
                    "bg-amber-950 text-amber-400 border border-amber-800"
                  }`}>
                    {p.role}
                  </span>
                  <span className="font-medium text-text-1">{p.name}</span>
                </div>
                <div className="num font-bold text-gold-400 text-[16px]">{formatLakhs(p.price)}</div>
              </div>
            ))}
            {(me?.squad.length ?? 0) === 0 && (
              <div className="panel-card p-8 text-center text-[15px] text-text-2">
                No players bought yet. Your bids will appear here once sold.
              </div>
            )}
          </div>
          <Link to="/squads" className="mt-4 inline-block text-[14px] text-gold-400 hover:underline">
            View All Franchises Squads →
          </Link>
        </div>
      )}

      {/* The one unmistakable action, pinned bottom */}
      {tab === "bid" && (
        <BidButton
          gate={gate}
          price={lot ? formatLakhs(lot.nextBid) : "—"}
          pending={pending}
          onBid={sendBid}
        />
      )}

      {/* Server rejections shown in place, under the button area */}
      {errorLine && (
        <div
          role="alert"
          className="fixed inset-x-0 bottom-[136px] mx-auto max-w-md px-4 text-center"
        >
          <div className="fade-in inline-block rounded-md bg-ink-800 px-4 py-2 text-[16px] text-danger">
            {errorLine}
          </div>
        </div>
      )}
    </div>
  );
}
