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

export const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:4000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${AGENT_URL}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  status: () => get<AgentStatusDto>("/api/status"),
  trades: () => get<TradesResponse>("/api/trades"),
  signals: () => get<SignalRecordDto[]>("/api/signals"),
  equity: () => get<EquityPointDto[]>("/api/equity"),
  positions: () => get<PositionView[]>("/api/positions"),
  regime: () => get<RegimeDto[]>("/api/regime"),
  screener: () => get<ScreenerDto | null>("/api/screener"),
  strategies: () => get<StrategyStat[]>("/api/strategies"),
  config: () => get<AgentConfigDto>("/api/config"),
  async putConfig(patch: Partial<AgentConfigDto>): Promise<AgentConfigDto> {
    const res = await fetch(`${AGENT_URL}/api/config`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`config HTTP ${res.status}`);
    return res.json();
  },
  async control(action: AgentControlAction) {
    const res = await fetch(`${AGENT_URL}/api/agent/${action}`, { method: "POST" });
    return res.json();
  },
  async closePosition(symbol: string) {
    const res = await fetch(`${AGENT_URL}/api/position/${symbol}/close`, { method: "POST" });
    return res.json();
  },
  async runBacktest(req: BacktestRequestDto): Promise<BacktestResultDto> {
    const res = await fetch(`${AGENT_URL}/api/backtest/run`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error((err as { error: string }).error ?? `HTTP ${res.status}`);
    }
    return res.json();
  },
};
