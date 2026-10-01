import type { Socket } from "socket.io-client";

/** serverTime − clientTime, estimated from round-trips. */
let offset = 0;

/** Median-of-5 offset estimate; re-run on reconnect and every ~30 s. */
export async function syncClock(socket: Socket): Promise<void> {
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const c0 = Date.now();
    try {
      const res = (await socket.emitWithAck("time:sync")) as { serverNow: number };
      const rtt = performance.now() - t0;
      samples.push(res.serverNow + rtt / 2 - (c0 + rtt));
    } catch {
      break;
    }
  }
  if (samples.length > 0) {
    samples.sort((a, b) => a - b);
    offset = samples[Math.floor(samples.length / 2)];
  }
}

export const serverTime = (): number => Date.now() + offset;

/** Countdown against an absolute server deadline. */
export const remainingMs = (deadlineAt: number): number =>
  Math.max(0, deadlineAt - serverTime());
