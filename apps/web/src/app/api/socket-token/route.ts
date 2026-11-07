import { createHmac } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!(await getServerSession(authOptions))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const secret = process.env.API_SECRET;
  if (!secret) return Response.json({ token: "" });
  const exp = String(Date.now() + 60_000);
  const sig = createHmac("sha256", secret).update(exp).digest("hex");
  return Response.json({ token: `${exp}.${sig}` });
}
