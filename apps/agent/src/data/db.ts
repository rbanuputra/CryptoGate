import type { PrismaLike } from "../monitoring/journal.js";

let _client: PrismaLike | null = null;
let _attempted = false;

export async function getPrismaClient(): Promise<PrismaLike | null> {
  if (_attempted) return _client;
  _attempted = true;

  if (!process.env.DATABASE_URL) {
    console.log("[db] DATABASE_URL not set — using in-memory journal.");
    return null;
  }

  try {
    const mod = await import("@prisma/client");
    const PrismaClient = (mod as Record<string, unknown>).PrismaClient as new () => PrismaLike;
    _client = new PrismaClient();
    console.log("[db] Prisma client connected to Postgres.");
    return _client;
  } catch (e) {
    console.warn("[db] @prisma/client not available (run `npx prisma generate` first). Falling back to in-memory.", e instanceof Error ? e.message : e);
    return null;
  }
}
