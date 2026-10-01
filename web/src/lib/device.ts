/** Device helpers: wake lock + haptics for the Team Console (§A10). */
let lock: WakeLockSentinel | null = null;

export async function keepAwake(): Promise<void> {
  try {
    lock = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    /* unsupported or denied — fine */
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") keepAwake();
});

export const buzz = (ms = 30): void => {
  navigator.vibrate?.(ms);
};
