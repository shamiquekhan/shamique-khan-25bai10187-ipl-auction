import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import type { PublicState } from "@auction/shared";
import { useAuction } from "../lib/useAuction.js";
import { formatLakhs, ROLE_LABEL } from "../lib/format.js";
import { readableOn, PAPER } from "../lib/color.js";
import { Timer } from "../components/Timer.js";
import { ConnectionBadge } from "../components/ConnectionBadge.js";
import { TeamRibbon } from "../components/TeamRibbon.js";
import { LeaderBanner } from "../components/LeaderBanner.js";
import { BidDisplay } from "../components/BidDisplay.js";
import { SoldOverlay } from "../components/SoldOverlay.js";

const PHASE_LABEL: Record<string, string> = {
  NOT_STARTED: "WAITING",
  IDLE: "NEXT LOT SOON",
  ON_DECK: "NEXT UP",
  LIVE: "BIDDING OPEN",
  PAUSED: "PAUSED",
  HAMMER: "TIME UP",
  BREAK: "BREAK",
  ENDED: "AUCTION COMPLETE",
};

function Header({ phase, round, online }: { phase: string; round: number; online: boolean }) {
  return (
    <header className="area-header flex items-center justify-between border-b border-ink-600 pb-2">
      <div className="num text-gold-400" style={{ fontSize: "var(--fs-meta)" }}>
        IPL MEGA AUCTION
      </div>
      <div className="num text-text-2" style={{ fontSize: "var(--fs-meta)" }}>
        Round {round}
      </div>
      <div className="flex items-center gap-4">
        <span
          className="num font-bold"
          style={{ fontSize: "var(--fs-meta)", color: "var(--color-live)" }}
        >
          {PHASE_LABEL[phase] ?? phase}
        </span>
        <ConnectionBadge online={online} />
      </div>
    </header>
  );
}

export default function Board({
  fixtureState,
  fixtureOffline,
}: {
  fixtureState?: PublicState;
  fixtureOffline?: boolean;
} = {}) {
  const live = useAuction("viewer");
  const state = fixtureState ?? live.state;
  const online = fixtureOffline != null ? !fixtureOffline : live.online;
  const [soundOn, setSoundOn] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Throttled polite announcement: once per bid, not per tick (§A8).
  const [announce, setAnnounce] = useState("");
  const leader = state?.teams.find((t) => t.id === state.lot?.leaderTeamId);
  useEffect(() => {
    if (state?.phase === "LIVE" && state.lot) {
      const text = state.lot.currentBid
        ? `${leader?.name ?? "Someone"} leads at ${formatLakhs(state.lot.currentBid)}`
        : `${state.lot.player.name} is up, base ${formatLakhs(state.lot.player.basePrice)}`;
      setAnnounce(text);
    }
  }, [state?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const url = `${location.origin}/team`;
    QRCode.toDataURL(url, { margin: 1, width: 240, color: { light: "#F6F7F9" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, []);

  if (!state) {
    return (
      <div className="board-full">
        <Header phase="NOT_STARTED" round={1} online={online} />
        <div className="area-stage grid place-items-center text-text-2" style={{ fontSize: "var(--fs-lead)" }}>
          Connecting…
        </div>
        <div className="area-ribbon" />
        <div className="area-ticker" />
      </div>
    );
  }

  const fullPhase =
    state.phase === "BREAK" ||
    state.phase === "NOT_STARTED" ||
    state.phase === "ENDED" ||
    (state.phase === "IDLE" && !state.lot);

  // ---- full-screen phases ----
  if (fullPhase) {
    return (
      <div className="board-full">
        <SoldOverlay
          lastResult={
            dismissed === `${state.lastResult?.playerId}:${state.lastResult?.price}` ? null : state.lastResult
          }
          teamColor={state.lastResult?.teamId != null
            ? state.teams.find((t) => t.id === state.lastResult?.teamId)?.color
            : undefined}
          teamName={state.lastResult?.teamId != null
            ? state.teams.find((t) => t.id === state.lastResult?.teamId)?.name
            : undefined}
          soundOn={soundOn}
          onDone={() =>
            setDismissed(
              state.lastResult
                ? `${state.lastResult.playerId}:${state.lastResult.price}`
                : null
            )
          }
        />
        <Header phase={state.phase} round={state.round} online={online} />
        <main className="area-stage grid place-items-center text-center">
          {state.phase === "NOT_STARTED" && (
            <div>
              <div className="num" style={{ fontSize: "var(--fs-lead)" }}>
                Auction begins soon
              </div>
              {qr && (
                <img
                  src={qr}
                  alt="QR code to join as a team on your phone"
                  className="mx-auto mt-8 rounded-md"
                  style={{ border: `8px solid ${PAPER}` }}
                />
              )}
              <div className="font-sans text-text-2" style={{ fontSize: "var(--fs-meta)" }}>
                Teams join at {location.origin}/team
              </div>
            </div>
          )}
          {state.phase === "BREAK" && (
            <div>
              <div className="num text-live" style={{ fontSize: "min(12vw, 24vh)" }}>
                BREAK
              </div>
              {state.breakNote && (
                <div className="text-text-1" style={{ fontSize: "var(--fs-lead)" }}>
                  {state.breakNote}
                </div>
              )}
            </div>
          )}
          {state.phase === "IDLE" && (
            <div className="num text-text-2" style={{ fontSize: "var(--fs-lead)" }}>
              Next lot shortly
            </div>
          )}
          {state.phase === "ENDED" && (
            <div>
              <div className="num text-gold-400" style={{ fontSize: "min(10vw, 20vh)" }}>
                AUCTION COMPLETE
              </div>
              {(() => {
                const soldPlayers = state.teams.reduce(
                  (sum: number, t) => sum + t.squadSize,
                  0
                );
                const spent = state.teams.reduce(
                  (sum: number, t) => sum + (12500 - t.purse),
                  0
                );
                const top = [...state.teams].sort((a, b) => b.squadSize - a.squadSize)[0];
                return (
                  <div
                    className="font-sans text-text-2"
                    style={{ fontSize: "var(--fs-meta)" }}
                  >
                    {soldPlayers} players sold · ₹{(spent / 100).toFixed(1)} Cr spent
                    {top && top.squadSize > 0 ? ` · busiest: ${top.name} (${top.squadSize})` : ""}
                  </div>
                );
              })()}
              <Link
                to="/squads"
                className="font-sans underline"
                style={{ fontSize: "var(--fs-meta)", color: "var(--color-live)" }}
              >
                Final squads
              </Link>
            </div>
          )}
        </main>
        <div className="area-ribbon">
          <TeamRibbon teams={state.teams} leaderTeamId={null} />
        </div>
        <div className="area-ticker" />
      </div>
    );
  }

  // ---- live lot layout ----
  const lot = state.lot!;
  const pausedMs = state.phase === "PAUSED" ? (lot.remainingMs ?? 0) : null;

  return (
    <div className="board">
      <SoldOverlay
        lastResult={state.lastResult}
        teamColor={state.lastResult?.teamId != null
          ? state.teams.find((t) => t.id === state.lastResult?.teamId)?.color
          : undefined}
        teamName={state.lastResult?.teamId != null
          ? state.teams.find((t) => t.id === state.lastResult?.teamId)?.name
          : undefined}
        soundOn={soundOn}
      />

      <Header phase={state.phase} round={state.round} online={online} />

      <section className="area-player flex flex-col justify-center border-b border-ink-600 pr-8">
        <div className="flex items-center gap-4">
          <span
            className="num rounded-sm bg-ink-800 px-3 py-0.5 text-gold-400"
            data-testid="meta-text"
            style={{ fontSize: "var(--fs-meta)" }}
          >
            {ROLE_LABEL[lot.player.role] ?? lot.player.role}
          </span>
          <span className="text-text-2" style={{ fontSize: "var(--fs-meta)" }}>
            {lot.player.nationality ?? ""} · Set {lot.player.setNo} · Base{" "}
            {formatLakhs(lot.player.basePrice)}
          </span>
        </div>
        <div
          className="num truncate leading-none"
          data-testid="player-name"
          style={{ fontSize: "var(--fs-player)" }}
        >
          {lot.player.name}
        </div>
        {!soundOn && (
          <button
            onClick={() => setSoundOn(true)}
            className="font-sans text-text-3 self-start underline"
            style={{ fontSize: "var(--fs-meta)" }}
          >
            Enable sound
          </button>
        )}
      </section>

      <section className="area-clock grid place-items-center border-b border-ink-600 pb-4 pl-8">
        <Timer
          phase={state.phase}
          deadlineAt={lot.deadlineAt}
          pausedMs={pausedMs}
        />
      </section>

      <section className="area-bid flex flex-col justify-center border-t border-ink-600 pr-8">
        <BidDisplay
          currentBid={lot.currentBid}
          basePrice={lot.player.basePrice}
        />
      </section>

      <section className="area-leader flex flex-col justify-center border-t border-l border-ink-600 pb-4 pl-8">
        <LeaderBanner
          leader={leader ?? null}
          hasBids={lot.currentBid != null}
        />
        <div className="text-text-3" style={{ fontSize: "var(--fs-chip)" }}>
          {lot.bidCount} {lot.bidCount === 1 ? "bid" : "bids"}
        </div>
      </section>

      <div className="area-ribbon border-t border-ink-600">
        <TeamRibbon teams={state.teams} leaderTeamId={lot.leaderTeamId} />
      </div>

      <footer className="area-ticker flex items-center justify-between border-t border-ink-600 pt-1">
        <div className="flex min-w-0 flex-1 gap-8 overflow-hidden text-text-2" style={{ fontSize: "var(--fs-chip)" }}>
          {state.recent.slice(0, 5).map((e, i) => (
          <span key={`${e.ts}-${i}`} className="truncate" data-testid="chip-text">
            {e.text}
          </span>
          ))}
        </div>
        <div className="num whitespace-nowrap text-text-2" style={{ fontSize: "var(--fs-chip)" }}>
          Sold {state.queue.sold} · Left {state.queue.remaining}
        </div>
      </footer>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </div>
  );
}
