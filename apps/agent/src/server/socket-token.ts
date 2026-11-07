import { createHmac, timingSafeEqual } from "node:crypto";

/** Token format: `<expiryMs>.<hex hmac-sha256 of expiryMs>`, minted by the web app. */
export function verifySocketToken(token: unknown, secret: string, now = Date.now()): boolean {
  if (typeof token !== "string") return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  const expected = createHmac("sha256", secret).update(exp).digest();
  const given = Buffer.from(sig, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
