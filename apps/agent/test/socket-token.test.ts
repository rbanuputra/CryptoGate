import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySocketToken } from "../src/server/socket-token.js";

const mint = (secret: string, exp: number) =>
  `${exp}.${createHmac("sha256", secret).update(String(exp)).digest("hex")}`;

test("accepts a valid unexpired token", () => {
  assert.equal(verifySocketToken(mint("s3cret", Date.now() + 60_000), "s3cret"), true);
});

test("rejects expired, wrong-secret, tampered and malformed tokens", () => {
  assert.equal(verifySocketToken(mint("s3cret", Date.now() - 1), "s3cret"), false);
  assert.equal(verifySocketToken(mint("other", Date.now() + 60_000), "s3cret"), false);
  const good = mint("s3cret", Date.now() + 60_000);
  assert.equal(verifySocketToken(good.replace(/^\d+/, String(Date.now() + 9e9)), "s3cret"), false);
  assert.equal(verifySocketToken(undefined, "s3cret"), false);
  assert.equal(verifySocketToken("nodot", "s3cret"), false);
  assert.equal(verifySocketToken("123.zz", "s3cret"), false);
});
