import { test } from "node:test";
import assert from "node:assert/strict";
import { dailySharpe } from "../src/backtest/multi-runner.js";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);

test("sharpe is 0 for windows shorter than 5 days or with no trades", () => {
  assert.equal(dailySharpe([{ time: T0, equity: 10_000 }], T0, T0 + 3 * DAY), 0);
  assert.equal(dailySharpe([{ time: T0, equity: 10_000 }], T0, T0 + 30 * DAY), 0);
});

test("a few losing trades over two weeks gives a modest, finite sharpe (not thousands)", () => {
  const curve = [
    { time: T0, equity: 10_000 },
    { time: T0 + 3 * DAY, equity: 9_746 },
    { time: T0 + 4 * DAY, equity: 9_498 },
    { time: T0 + 13 * DAY, equity: 9_270 },
  ];
  const s = dailySharpe(curve, T0, T0 + 14 * DAY);
  assert.ok(s < 0 && s > -50, `sharpe ${s}`);
});

test("steady daily gains with noise give a positive sharpe", () => {
  const curve = [{ time: T0, equity: 10_000 }];
  let eq = 10_000;
  for (let d = 1; d <= 30; d++) {
    eq *= 1 + (d % 2 ? 0.004 : 0.001);
    curve.push({ time: T0 + d * DAY - 1000, equity: eq });
  }
  assert.ok(dailySharpe(curve, T0, T0 + 30 * DAY) > 1);
});
