/**
 * API + WebSocket server (Module: API Server). Minimal foundation — REST
 * endpoints and Socket.io push that the Next.js dashboard consumes.
 */
import { createServer, type Server as HttpServer } from "node:http";
import express, { type Express } from "express";
import { Server as IOServer } from "socket.io";

export interface AgentStatus {
  status: "running" | "paused" | "stopped";
  uptimeMs: number;
  activeCoins: string[];
  startedAt: number;
}

export interface ServerHandle {
  app: Express;
  http: HttpServer;
  io: IOServer;
  emit: (event: string, payload: unknown) => void;
  listen: (port: number) => void;
}

export function buildServer(getStatus: () => AgentStatus): ServerHandle {
  const app = express();
  app.use(express.json());

  app.get("/api/status", (_req, res) => res.json(getStatus()));
  app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

  const http = createServer(app);
  const io = new IOServer(http, { cors: { origin: "*" } });
  io.on("connection", (socket) => {
    socket.emit("agent_status", getStatus());
  });

  return {
    app,
    http,
    io,
    emit: (event, payload) => io.emit(event, payload),
    listen: (port: number) =>
      http.listen(port, () => console.log(`[server] API+WS listening on :${port}`)),
  };
}
