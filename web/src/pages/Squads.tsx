import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatLakhs, ROLE_LABEL } from "../lib/format.js";

interface SquadTeam {
  id: number;
  code: string;
  name: string;
  color: string;
  purse: number;
  squad: { name: string; role: string; nationality: string | null; price: number; round: number }[];
}

export default function Squads() {
  const [squads, setSquads] = useState<SquadTeam[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/squads");
        const j = await r.json();
        if (alive) setSquads(j.squads);
      } catch {
        /* keep last data */
      }
    };
    load();
    const id = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl p-6 sm:p-8 space-y-8">
      <div className="flex items-center justify-between border-b border-ink-800 pb-4">
        <div>
          <h1 className="num text-4xl font-bold text-gold-400">Franchise Squad Rosters</h1>
          <p className="mt-1 text-sm text-text-2">Realtime squad composition and purse utilization across all 15 franchises.</p>
        </div>
        <Link to="/" className="num font-semibold text-text-2 hover:text-gold-400 underline">
          ← Return to Landing
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {(squads ?? []).map((t) => (
          <div
            key={t.id}
            className="panel-card overflow-hidden transition-all duration-200 hover:border-ink-600"
            style={{ borderTop: `4px solid ${t.color}` }}
          >
            <div className="p-4 bg-ink-900/60 border-b border-ink-800 flex items-center justify-between">
              <div>
                <div className="font-bold text-lg text-text-1 flex items-center gap-2">
                  <span>{t.name}</span>
                  <span className="num text-xs rounded bg-ink-800 border border-ink-700 px-2 py-0.5 text-text-2">{t.code}</span>
                </div>
                <div className="num text-xs text-text-2 mt-0.5">
                  Squad size: <strong className="text-text-1">{t.squad.length}</strong> players
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase text-text-3 font-semibold">Remaining Purse</div>
                <div className="num text-lg font-bold text-gold-400">{formatLakhs(t.purse)}</div>
              </div>
            </div>

            <div className="p-3">
              <table className="w-full text-sm">
                <tbody>
                  {t.squad.map((p) => (
                    <tr key={p.name} className="border-b border-ink-850 hover:bg-ink-850/50">
                      <td className="py-2 font-medium text-text-1">{p.name}</td>
                      <td className="py-2 text-right">
                        <span className={`num rounded px-2 py-0.5 text-xs font-bold ${
                          p.role === "BAT" ? "bg-blue-950 text-blue-400 border border-blue-800" :
                          p.role === "BOWL" ? "bg-red-950 text-red-400 border border-red-800" :
                          p.role === "AR" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" :
                          "bg-amber-950 text-amber-400 border border-amber-800"
                        }`}>
                          {p.role}
                        </span>
                      </td>
                      <td className="py-2 text-right num font-bold text-text-1">{formatLakhs(p.price)}</td>
                    </tr>
                  ))}
                  {t.squad.length === 0 && (
                    <tr>
                      <td className="py-6 text-center text-text-3 italic" colSpan={3}>
                        No players acquired yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
