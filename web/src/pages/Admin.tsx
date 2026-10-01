import { useEffect, useRef, useState } from "react";
import { Gavel, Pause, Play, Undo2, Download, AlertTriangle } from "lucide-react";
import type { Settings, PublicState } from "@auction/shared";
import { useAuction } from "../lib/useAuction.js";
import { formatLakhs, ROLE_LABEL } from "../lib/format.js";
import { ConnectionBadge } from "../components/ConnectionBadge.js";

const TOKEN_KEY = "auction_admin_token";

interface PlayerRow {
  id: number;
  name: string;
  role: string;
  nationality: string | null;
  basePrice: number;
  setNo: number;
  status: string;
  soldTo: number | null;
  soldPrice: number | null;
}

/** Press-and-hold 1.5 s button for destructive actions (§A5.8). */
function HoldButton({
  label,
  onHold,
  disabled,
}: {
  label: string;
  onHold: () => void;
  disabled?: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = useRef(false);

  const start = () => {
    if (disabled) return;
    done.current = false;
    setProgress(0);
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / 1500);
      setProgress(p);
      if (p >= 1 && !done.current) {
        done.current = true;
        stop();
        onHold();
      }
    }, 50);
  };
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setProgress(0);
  };

  return (
    <button
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      disabled={disabled}
      className="relative overflow-hidden rounded-md border border-danger p-3 font-medium text-danger disabled:opacity-40"
    >
      <span
        className="absolute inset-y-0 left-0 bg-danger/20"
        style={{ width: `${progress * 100}%` }}
        aria-hidden
      />
      <span className="relative">{label}</span>
    </button>
  );
}

export default function Admin({
  fixtureState,
  fixtureOffline,
}: {
  fixtureState?: PublicState;
  fixtureOffline?: boolean;
} = {}) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const live = useAuction("admin", token);
  const state = fixtureState ?? live.state;
  const online = fixtureOffline != null ? !fixtureOffline : live.online;
  const socket = live.socket;

  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = await r.json();
      if (!j.ok) {
        setLoginError(
          r.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : "Wrong password."
        );
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, j.token);
      setToken(j.token);
    } catch {
      setLoginError("Can't reach the server.");
    }
  };

  const [queue, setQueue] = useState<PlayerRow[]>([]);
  const [search, setSearch] = useState("");
  const [breakNote, setBreakNote] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [undoInfo, setUndoInfo] = useState<{ text: string; key: string } | null>(null);
  const [errBanner, setErrBanner] = useState<string | null>(null);
  const lastSoldKey = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/players?status=PENDING");
        const j = await r.json();
        if (alive) setQueue(j.players);
      } catch {
        /* keep last */
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const emit = (event: string, body: unknown = {}) =>
    new Promise<void>((resolve) => {
      if (!socket?.connected) return resolve();
      socket.emit(event, body, (res: any) => {
        if (!res?.ok) {
          setErrBanner(
            res?.code === "BAD_PHASE"
              ? "That action doesn't fit the current stage."
              : res?.code === "NO_BIDS"
                ? "No bids to sell — use Unsold instead."
                : res?.code === "HAS_BIDS"
                  ? "There are bids on this player — use Sold."
                  : "That didn't work."
          );
        } else {
          setErrBanner(null);
        }
        resolve();
      });
    });

  const phase = state?.phase ?? "NOT_STARTED";

  // 8-second inline Undo bar after a sale (§A5.8).
  useEffect(() => {
    const lr = state?.lastResult;
    if (lr?.outcome !== "SOLD" || lr.teamId == null) return;
    const key = `${lr.playerId}:${lr.price}`;
    if (lastSoldKey.current === key) return;
    lastSoldKey.current = key;
    const team = state?.teams.find((t) => t.id === lr.teamId);
    setUndoInfo({
      text: `Sold to ${team?.code ?? "?"} at ${formatLakhs(lr.price ?? 0)}`,
      key,
    });
    const t = setTimeout(() => setUndoInfo(null), 8000);
    return () => clearTimeout(t);
  }, [state?.lastResult?.playerId, state?.lastResult?.price]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Space start/pause · S sold · U unsold · N next · R reset timer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!token) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        if (phase === "ON_DECK") emit("admin:startLot");
        else if (phase === "LIVE") emit("admin:pause");
        else if (phase === "PAUSED") emit("admin:resume");
      }
      if (e.key === "s" || e.key === "S") emit("admin:sold");
      if (e.key === "u" || e.key === "U") emit("admin:unsold");
      if (e.key === "n" || e.key === "N") emit("admin:nextLot");
      if (e.key === "r" || e.key === "R") emit("admin:resetTimer");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [token, phase, socket]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!token && !fixtureState) {
    return (
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-6 p-6">
        <h1 className="num text-center text-4xl font-bold text-gold-400">Auctioneer login</h1>
        <form onSubmit={login} className="space-y-4">
          <div>
            <label htmlFor="apass" className="mb-1 block text-[16px] text-text-2">
              Admin password
            </label>
            <input
              id="apass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-ink-600 bg-ink-900 p-3 text-[18px]"
              autoComplete="off"
              required
            />
          </div>
          {loginError && <div className="text-[16px] text-danger">{loginError}</div>}
          <button className="h-14 w-full rounded-md bg-gold-400 text-[20px] font-semibold text-on-accent">
            Sign in
          </button>
        </form>
      </div>
    );
  }

  const filteredQueue = queue.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      String(p.setNo) === search.trim()
  );

  const primary =
    phase === "NOT_STARTED"
      ? { label: "Start auction", action: "admin:startAuction" }
      : phase === "IDLE"
        ? { label: "Put on deck", action: "admin:nextLot" }
        : phase === "ON_DECK"
          ? { label: "Start lot", action: "admin:startLot" }
          : phase === "LIVE"
            ? { label: "Pause", action: "admin:pause" }
            : phase === "PAUSED"
              ? { label: "Resume", action: "admin:resume" }
              : null;

  const canGavel = ["LIVE", "PAUSED", "HAMMER"].includes(phase);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between border-b border-ink-600 bg-ink-900/50 px-4 py-3 gap-3">
        <div className="flex items-center gap-4">
          <h1 className="num text-[26px] font-bold text-gold-400 leading-none">Auctioneer desk</h1>
          <div className="hidden lg:flex items-center gap-2 border-l border-ink-700 pl-4">
            <span className="kbd-capsule"><kbd>Space</kbd> Start/Pause</span>
            <span className="kbd-capsule"><kbd>S</kbd> Sold</span>
            <span className="kbd-capsule"><kbd>U</kbd> Unsold</span>
            <span className="kbd-capsule"><kbd>N</kbd> Next Lot</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[14px] text-text-2">
          <span className="rounded bg-ink-800 border border-ink-700 px-3 py-1 font-semibold text-text-1">
            {phase === "HAMMER" ? "Time up — awaiting your call" : phase.replace("_", " ")}
          </span>
          <span className="num font-medium">Round {state?.round ?? 1}</span>
          <span className="num text-text-3">
            {state?.queue.remaining ?? 0} left · {state?.queue.sold ?? 0} sold
          </span>
          <ConnectionBadge online={online} />
        </div>
      </header>

      {errBanner && (
        <div role="alert" className="border-b border-danger/40 bg-danger/10 px-4 py-2 text-[14px] text-danger">
          {errBanner}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-12 gap-4 p-4">
        {/* Left: queue */}
        <aside className="col-span-3 flex min-h-0 flex-col border border-ink-700">
          <div className="border-b border-ink-700 p-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or set"
              aria-label="Search players"
              className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-[14px]"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredQueue.map((p) => (
              <button
                key={p.id}
                onClick={() => emit("admin:nextLot", { playerId: p.id })}
                className="w-full border-b border-ink-800 px-3 py-2 text-left hover:bg-ink-800"
              >
                <div className="text-[14px] font-medium">{p.name}</div>
                <div className="text-[12px] text-text-2">
                  {ROLE_LABEL[p.role]} · base {formatLakhs(p.basePrice)} · set {p.setNo}
                </div>
              </button>
            ))}
            {filteredQueue.length === 0 && (
              <div className="p-3 text-[14px] text-text-2">Queue is empty.</div>
            )}
          </div>
        </aside>

        {/* Centre: lot + controls */}
        <main className="col-span-6 flex min-h-0 flex-col gap-4">
          <section className="border border-ink-700 p-4">
            {state?.lot ? (
              <>
                <div className="text-[12px] text-text-2">
                  {ROLE_LABEL[state.lot.player.role]} · {state.lot.player.nationality ?? ""} · base{" "}
                  {formatLakhs(state.lot.player.basePrice)}
                </div>
                <div className="num text-[40px] font-bold leading-none">{state.lot.player.name}</div>
                <div className="mt-2 flex items-baseline gap-6 text-[16px]">
                  <span className="text-text-2">
                    Bid:{" "}
                    <span className="num text-[20px] font-bold text-gold-400">
                      {state.lot.currentBid != null ? formatLakhs(state.lot.currentBid) : "—"}
                    </span>
                  </span>
                  <span className="text-text-2">
                    Next: <span className="num text-[20px] font-bold">{formatLakhs(state.lot.nextBid)}</span>
                  </span>
                  <span className="text-text-2">
                    Leader:{" "}
                    <span className="num text-[20px] font-bold">
                      {state.lot.leaderTeamId != null
                        ? state.teams.find((t) => t.id === state.lot!.leaderTeamId)?.code
                        : "—"}
                    </span>
                  </span>
                </div>
              </>
            ) : (
              <div className="text-[16px] text-text-2">No player on the block.</div>
            )}
          </section>

          {/* Primary action + gavel */}
          <div className="grid grid-cols-3 gap-3">
            {primary ? (
              <button
                onClick={() => emit(primary.action)}
                className="rounded-md bg-gold-400 p-5 text-[20px] font-bold text-on-accent"
              >
                {primary.label}
              </button>
            ) : (
              <div className="rounded-md border border-ink-700 p-5 text-center text-[14px] text-text-2">
                {phase === "HAMMER" ? "Your call:" : "—"}
              </div>
            )}
            <button
              onClick={() => emit("admin:sold")}
              disabled={!canGavel}
              className="flex items-center justify-center gap-2 rounded-md bg-gold-400 p-5 text-[20px] font-bold text-on-accent disabled:bg-ink-700 disabled:text-text-2"
            >
              <Gavel size={24} strokeWidth={1.75} aria-hidden /> Sold <kbd className="text-[14px] opacity-70">S</kbd>
            </button>
            <button
              onClick={() => emit("admin:unsold")}
              disabled={!canGavel}
              className="flex items-center justify-center gap-2 rounded-md border border-ink-600 bg-ink-800 p-5 text-[20px] font-bold disabled:opacity-40"
            >
              Unsold <kbd className="text-[14px] opacity-70">U</kbd>
            </button>
          </div>

          {/* Secondary row */}
          <div className="grid grid-cols-4 gap-3">
            <button
              onClick={() => emit("admin:resetTimer")}
              disabled={!["LIVE", "HAMMER"].includes(phase)}
              className="rounded-md border border-ink-600 p-3 font-medium disabled:opacity-40"
            >
              Reset timer <kbd className="opacity-60">R</kbd>
            </button>
            <button
              onClick={() => emit("admin:undoLast")}
              disabled={!["IDLE", "ON_DECK"].includes(phase)}
              className="flex items-center justify-center gap-2 rounded-md border border-ink-600 p-3 font-medium disabled:opacity-40"
            >
              <Undo2 size={20} strokeWidth={1.75} aria-hidden /> Undo sale
            </button>
            <button
              onClick={() => emit("admin:cancelBids")}
              disabled={!canGavel}
              className="rounded-md border border-ink-600 p-3 font-medium disabled:opacity-40"
            >
              Cancel bids
            </button>
            <button
              onClick={() => emit("admin:break", { note: breakNote })}
              disabled={!["IDLE", "ON_DECK"].includes(phase)}
              className="rounded-md border border-ink-600 p-3 font-medium disabled:opacity-40"
            >
              Break
            </button>
          </div>

          {/* Break note + end break + new round */}
          <div className="grid grid-cols-4 gap-3">
            <input
              value={breakNote}
              onChange={(e) => setBreakNote(e.target.value)}
              placeholder="Note shown on the board"
              aria-label="Break note"
              className="col-span-2 rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-[14px]"
            />
            <button
              onClick={() => emit("admin:endBreak")}
              disabled={phase !== "BREAK"}
              className="rounded-md border border-ink-600 p-3 font-medium disabled:opacity-40"
            >
              End break
            </button>
            <button
              onClick={() => emit("admin:newRound")}
              disabled={phase !== "IDLE"}
              className="rounded-md border border-ink-600 p-3 font-medium disabled:opacity-40"
            >
              New round
            </button>
          </div>

          {/* Destructive + exports */}
          <div className="mt-auto grid grid-cols-4 items-end gap-3">
            <HoldButton
              label="Reset auction (hold)"
              onHold={() => emit("admin:resetAuction")}
              disabled={false}
            />
            <HoldButton
              label="End auction (hold)"
              onHold={() => emit("admin:end")}
              disabled={phase === "ENDED"}
            />
            <a
              href={`/api/export/sold.csv?token=${token}`}
              className="flex items-center justify-center gap-2 rounded-md border border-ink-600 p-3 font-medium hover:bg-ink-800"
            >
              <Download size={20} strokeWidth={1.75} aria-hidden /> sold.csv
            </a>
            <a
              href={`/api/export/squads.json?token=${token}`}
              className="flex items-center justify-center gap-2 rounded-md border border-ink-600 p-3 font-medium hover:bg-ink-800"
            >
              <Download size={20} strokeWidth={1.75} aria-hidden /> squads.json
            </a>
          </div>
        </main>

        {/* Right: settings + recent */}
        <aside className="col-span-3 flex min-h-0 flex-col gap-4">
          <div className="border border-ink-700">
            <button
              onClick={() => setShowSettings((s) => !s)}
              className="flex w-full items-center justify-between border-b border-ink-700 p-3 font-medium"
            >
              Settings
              <span className="text-[12px] text-text-2">{showSettings ? "hide" : "show"}</span>
            </button>
            {showSettings && <SettingsForm socket={socket} settings={state?.settings ?? null} />}
          </div>
          <div className="min-h-0 flex-1 border border-ink-700 p-3">
            <div className="mb-2 text-[14px] font-medium">Activity</div>
            <div className="space-y-1 text-[14px] text-text-2">
              {(state?.recent ?? []).slice(0, 14).map((e, i) => (
                <div key={`${e.ts}-${i}`} className="truncate border-b border-ink-800 pb-1">
                  {e.text}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Undo bar */}
      {undoInfo && (
        <div className="fade-in fixed inset-x-0 bottom-0 z-40 border-t border-gold-600 bg-ink-900 px-4 py-3">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-[16px]">
              <AlertTriangle size={20} strokeWidth={1.75} className="text-gold-400" aria-hidden />
              {undoInfo.text}
            </span>
            <button
              onClick={() => {
                emit("admin:undoLast");
                setUndoInfo(null);
              }}
              className="flex items-center gap-2 rounded-md bg-gold-400 px-4 py-2 font-semibold text-on-accent"
            >
              <Undo2 size={20} strokeWidth={1.75} aria-hidden /> Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsForm({
  socket,
  settings,
}: {
  socket: any;
  settings: Settings | null;
}) {
  const [draft, setDraft] = useState<Settings | null>(settings);
  useEffect(() => setDraft(settings), [settings]);
  if (!draft || !settings) return <div className="p-3 text-[14px] text-text-2">Loading…</div>;

  const changed = (k: keyof Settings) => draft[k] !== settings[k];
  const num = (k: keyof Settings, label: string) => (
    <label key={k} className="block text-[14px]">
      <span className="text-text-2">
        {label}
        {changed(k) && <span className="ml-1 text-gold-400">•</span>}
      </span>
      <input
        type="number"
        value={String(draft[k])}
        onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })}
        className="mt-1 w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1"
      />
    </label>
  );
  const bool = (k: keyof Settings, label: string) => (
    <label key={k} className="flex items-center justify-between py-1 text-[14px]">
      <span className="text-text-2">
        {label}
        {changed(k) && <span className="ml-1 text-gold-400">•</span>}
      </span>
      <input
        type="checkbox"
        checked={Boolean(draft[k])}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })}
      />
    </label>
  );

  return (
    <div className="space-y-2 p-3">
      {num("lotSeconds", "Lot timer (seconds)")}
      {num("bidResetSeconds", "Bid reset (seconds)")}
      {num("minSquad", "Minimum squad")}
      {num("maxSquad", "Maximum squad")}
      {num("minWK", "Minimum keepers")}
      {num("minBowlers", "Minimum bowlers")}
      {num("minBasePrice", "Reserve base (lakhs)")}
      {bool("allrounderCountsAsBowler", "All-rounders count as bowlers")}
      {bool("enforcePurseReserve", "Enforce squad reserve")}
      {bool("autoHammer", "Auto-sell when time runs out")}
      <button
        onClick={() =>
          socket?.emit("admin:settings", draft, (res: any) => {
            if (!res?.ok) alert("Some values are outside allowed ranges.");
          })
        }
        className="w-full rounded-md bg-gold-400 py-2 font-semibold text-on-accent"
      >
        Save settings
      </button>
      <p className="text-[12px] text-text-2">Changes apply on save. • marks edits.</p>
    </div>
  );
}
