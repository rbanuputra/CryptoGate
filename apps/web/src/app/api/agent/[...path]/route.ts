import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

const AGENT = process.env.AGENT_INTERNAL_URL ?? "http://localhost:4000";

async function proxy(req: Request, ctx: { params: { path: string[] } }): Promise<Response> {
  if (!(await getServerSession(authOptions))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { path } = ctx.params;
  if (path.some((p) => p === ".." || p === ".")) {
    return Response.json({ error: "bad path" }, { status: 400 });
  }

  const headers: Record<string, string> = {};
  if (process.env.API_SECRET) headers.Authorization = `Bearer ${process.env.API_SECRET}`;
  const contentType = req.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  try {
    const res = await fetch(`${AGENT}/api/${path.join("/")}${new URL(req.url).search}`, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : undefined,
      cache: "no-store",
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ error: "agent unreachable" }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT };
