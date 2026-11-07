"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || undefined;

/** Poll an async fetcher on an interval; returns the latest value + error. */
export function usePolling<T>(fetcher: () => Promise<T>, ms = 5000): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fn = useRef(fetcher);
  fn.current = fetcher;
  useEffect(() => {
    let alive = true;
    const run = () => fn.current().then((d) => alive && setData(d)).catch((e) => alive && setError(String(e.message ?? e)));
    run();
    const id = setInterval(run, ms);
    return () => { alive = false; clearInterval(id); };
  }, [ms]);
  return { data, error };
}

let socket: Socket | null = null;
export function getSocket(): Socket {
  if (!socket) socket = io(WS_URL, {
    transports: ["websocket"],
    autoConnect: true,
    auth: (cb) => {
      fetch("/api/socket-token", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { token?: string }) => cb({ token: j.token ?? "" }))
        .catch(() => cb({ token: "" }));
    },
  });
  return socket;
}

/** Subscribe to a socket event; invokes handler on each message. */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void): void {
  const h = useRef(handler);
  h.current = handler;
  useEffect(() => {
    const s = getSocket();
    const cb = (p: T) => h.current(p);
    s.on(event, cb);
    return () => void s.off(event, cb);
  }, [event]);
}
