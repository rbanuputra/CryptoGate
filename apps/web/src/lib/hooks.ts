"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { AGENT_URL } from "./api";

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
  if (!socket) socket = io(AGENT_URL, { transports: ["websocket"], autoConnect: true });
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
