import { Link } from "react-router-dom";
import { Monitor, Smartphone, Gavel, Users } from "lucide-react";

const rows = [
  {
    to: "/board",
    icon: Monitor,
    title: "Live board",
    desc: "For the projector — bid, leader and clock for the whole room.",
    accent: false,
  },
  {
    to: "/team",
    icon: Smartphone,
    title: "Team console",
    desc: "Passcode login for franchise reps. One tap to bid.",
    accent: false,
  },
  {
    to: "/admin",
    icon: Gavel,
    title: "Auctioneer desk",
    desc: "Run the lots, the clock and the gavel. Admin password required.",
    accent: false,
  },
];

export default function Landing() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col justify-center gap-10 px-6 py-12">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-gold-400/30 bg-gold-400/10 px-3.5 py-1 text-xs font-semibold tracking-wider text-gold-400 uppercase">
          <span className="h-2 w-2 rounded-full bg-gold-400 animate-pulse" />
          VITBMUN Live Platform
        </div>
        <h1 className="num text-5xl sm:text-6xl font-bold tracking-tight text-gold-400">
          IPL Mega Auction
        </h1>
        <p className="max-w-xl text-lg text-text-2">
          Server-authoritative realtime bidding engine. Zero refresh needed, broadcast-grade precision across all surfaces.
        </p>
      </header>

      <nav className="grid gap-4 sm:grid-cols-3">
        {rows.map((r) => (
          <Link
            key={r.to}
            to={r.to}
            className="panel-card group flex flex-col justify-between p-6 transition-all duration-200 hover:-translate-y-1 hover:border-gold-400/50 hover:shadow-[0_0_20px_oklch(0.82_0.15_85/0.15)]"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="rounded-md bg-ink-800 p-2.5 text-gold-400 border border-ink-700 group-hover:border-gold-400/40">
                  <r.icon size={26} strokeWidth={1.75} aria-hidden />
                </div>
                <span className="text-xl text-text-3 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-gold-400" aria-hidden>
                  →
                </span>
              </div>
              <div className="num mt-6 text-2xl font-bold tracking-wide">{r.title}</div>
              <div className="mt-2 text-sm text-text-2 leading-relaxed">{r.desc}</div>
            </div>
            <div className="mt-6 pt-3 border-t border-ink-800 text-xs font-semibold text-text-3 uppercase tracking-wider group-hover:text-gold-400">
              Open Surface
            </div>
          </Link>
        ))}
      </nav>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-ink-800 pt-6 text-sm text-text-2">
        <div className="flex items-center gap-2">
          <Users size={18} strokeWidth={1.75} className="text-gold-400" aria-hidden />
          <span>Connect all devices to the same Wi-Fi / hotspot</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/squads" className="font-semibold text-text-1 underline hover:text-gold-400">
            View Final Squads
          </Link>
          <span className="text-text-3">|</span>
          <span className="num text-xs text-text-3">15 Franchises · ₹125 Cr Purse</span>
        </div>
      </footer>
    </div>
  );
}
