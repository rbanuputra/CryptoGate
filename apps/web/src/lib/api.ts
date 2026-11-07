import type {
  AgentStatusDto,
  AgentConfigDto,
  AgentControlAction,
  BacktestRequestDto,
  BacktestResultDto,
  EquityPointDto,
  PositionView,
  RegimeDto,
  ScreenerDto,
  SignalRecordDto,
  StrategyStat,
  TradesResponse,
} from "@cryptogate/shared";

const BASE = "/api/agent";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  status: () => get<AgentStatusDto>("/status"),
  trades: () => get<TradesResponse>("/trades"),
  signals: () => get<SignalRecordDto[]>("/signals"),
  equity: () => get<EquityPointDto[]>("/equity"),
  positions: () => get<PositionView[]>("/positions"),
  regime: () => get<RegimeDto[]>("/regime"),
  screener: () => get<ScreenerDto | null>("/screener"),
  strategies: () => get<StrategyStat[]>("/strategies"),
  config: () => get<AgentConfigDto>("/config"),
  async putConfig(patch: Partial<AgentConfigDto>): Promise<AgentConfigDto> {
    const res = await fetch(`${BASE}/config`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`config HTTP ${res.status}`);
    return res.json();
  },
  async control(action: AgentControlAction) {
    const res = await fetch(`${BASE}/agent/${action}`, { method: "POST" });
    return res.json();
  },
  async closePosition(symbol: string) {
    const res = await fetch(`${BASE}/position/${symbol}/close`, { method: "POST" });
    return res.json();
  },
  async runBacktest(req: BacktestRequestDto): Promise<BacktestResultDto> {
    const res = await fetch(`${BASE}/backtest/run`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error((err as { error: string }).error ?? `HTTP ${res.status}`);
    }
    return res.json();
  },
};
