import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { PublicState, Me } from "@auction/shared";
import { syncClock } from "./clock.js";

export type Role = "viewer" | "team" | "admin";

/**
 * One socket per page. Receives full snapshots; ignores stale versions.
 * No local money math — everything renders from `state`.
 */
export function useAuction(role: Role, token?: string | null) {
  const [state, setState] = useState<PublicState | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [online, setOnline] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io({
      auth: { token: token ?? undefined },
      reconnection: true,
      reconnectionDelayMax: 3000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setOnline(true);
      syncClock(socket);
    });
    socket.on("disconnect", () => setOnline(false));
    socket.on("state", (s: PublicState) =>
      setState((prev) => (!prev || s.version >= prev.version ? s : prev))
    );
    socket.on("me", (m: Me) => setMe(m));

    const interval = setInterval(() => {
      if (socket.connected) syncClock(socket);
    }, 30_000);

    return () => {
      clearInterval(interval);
      socket.close();
      socketRef.current = null;
    };
  }, [token, role]);

  return { state, me, online, socket: socketRef.current };
}
