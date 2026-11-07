/**
 * Backtest CLI.
 *   tsx src/backtest/cli.ts --symbol BTCUSDT --htf 4h           (fetch from Binance)
 *   tsx src/backtest/cli.ts --chart-csv a.csv --htf-csv b.csv --htf 4h
 */
import type { Candle, Timeframe } from "@cryptogate/shared";
import { backtestSmc, BACKTEST_DEFAULT } from "./runner.js";
import { fetchKlines, loadCsv } from "./data-loader.js";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const symbol = arg("symbol", "BTCUSDT")!;
  const chartTf = (arg("chart", "15m") as Timeframe);
  const htfTf = (arg("htf", "4h") as Timeframe);
  const chartCsv = arg("chart-csv");
  const htfCsv = arg("htf-csv");

  let chart: Candle[];
  let htf: Candle[];
  if (chartCsv && htfCsv) {
    console.log(`Loading CSVs: ${chartCsv}, ${htfCsv}`);
    chart = loadCsv(chartCsv);
    htf = loadCsv(htfCsv);
  } else {
    console.log(`Fetching ${symbol} ${chartTf}/${htfTf} from Binance...`);
    chart = await fetchKlines(symbol, chartTf, { limit: 1500 });
    htf = await fetchKlines(symbol, htfTf, { limit: 1000 });
  }
  console.log(`chart bars=${chart.length} htf bars=${htf.length}`);

  const res = backtestSmc(chart, htf, htfTf, BACKTEST_DEFAULT);
  const s = res.stats;
  console.log("\n=== SMC Sweep backtest ===");
  console.log(`trades=${s.totalTrades} WR=${(s.winRate * 100).toFixed(1)}% ` +
    `PF=${s.profitFactor} return=${s.totalReturnPct}% maxDD=${s.maxDrawdownPct}% avgR=${s.avgR}`);
  console.log(`final equity=$${res.finalEquity.toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
