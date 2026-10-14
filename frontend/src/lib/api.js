import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// ── Tokens ──

export async function fetchTokens({ search, chain, sort, dir, page, perPage } = {}) {
  const params = {};
  if (search) params.search = search;
  if (chain) params.chain = chain;
  if (sort) params.sort = sort;
  if (dir) params.dir = dir;
  if (page) params.page = page;
  if (perPage) params.per_page = perPage;
  const { data } = await api.get('/tokens', { params });
  return data;
}

export async function fetchToken(id) {
  const { data } = await api.get(`/tokens/${id}`);
  return data;
}

export async function addToken(coingeckoId) {
  const { data } = await api.post('/tokens', { coingecko_id: coingeckoId });
  return data;
}

export async function updateToken(id, payload) {
  const { data } = await api.put(`/tokens/${id}`, payload);
  return data;
}

export async function deleteToken(id) {
  await api.delete(`/tokens/${id}`);
}

export async function fetchTokenScores(id) {
  const { data } = await api.get(`/tokens/${id}/scores`);
  return data;
}

export async function refreshTokenMarketData(id) {
  const { data } = await api.post(`/tokens/${id}/refresh`);
  return data;
}

export async function scoreToken(id) {
  const { data } = await api.post(`/tokens/${id}/score`);
  return data;
}

export async function fetchBuyZone(id) {
  const { data } = await api.get(`/tokens/${id}/buy-zone`);
  return data;
}

// ── Investment Plans ──

export async function fetchPlans(tokenId) {
  const { data } = await api.get(`/tokens/${tokenId}/plans`);
  return data;
}

export async function createPlan(tokenId, plan) {
  const { data } = await api.post(`/tokens/${tokenId}/plans`, plan);
  return data;
}

export async function updatePlan(tokenId, planId, plan) {
  const { data } = await api.put(`/tokens/${tokenId}/plans/${planId}`, plan);
  return data;
}

export async function deletePlan(tokenId, planId) {
  await api.delete(`/tokens/${tokenId}/plans/${planId}`);
}

// ── Alerts ──

export async function fetchAlerts(params = {}) {
  const { data } = await api.get('/alerts', { params });
  return data;
}

export async function createAlert(alert) {
  const { data } = await api.post('/alerts', alert);
  return data;
}

export async function updateAlert(id, payload) {
  const { data } = await api.put(`/alerts/${id}`, payload);
  return data;
}

export async function deleteAlert(id) {
  await api.delete(`/alerts/${id}`);
}

export async function createAlertsFromPlan(tokenId, plan) {
  const { data } = await api.post(`/tokens/${tokenId}/alerts/from-plan`, plan);
  return data;
}

export async function fetchAlertLogs(params = {}) {
  const { data } = await api.get('/alerts/logs', { params });
  return data;
}

export async function checkAlerts() {
  const { data } = await api.post('/alerts/check');
  return data;
}

// ── DeFi & Holders ──

export async function fetchDefiData(tokenId) {
  const { data } = await api.post(`/tokens/${tokenId}/fetch-defi`);
  return data;
}

export async function fetchHolderData(tokenId) {
  const { data } = await api.post(`/tokens/${tokenId}/fetch-holders`);
  return data;
}

// ── Analytics ──

export async function fetchAnalytics() {
  const { data } = await api.get('/analytics/overview');
  return data;
}

export async function fetchSectorMomentum() {
  const { data } = await api.get('/analytics/sector-momentum');
  return data;
}

// ── Score History & Derivatives & Momentum ──

export async function fetchScoreHistory(tokenId) {
  const { data } = await api.get(`/tokens/${tokenId}/score-history`);
  return data;
}

export async function fetchMomentum(tokenId) {
  const { data } = await api.get(`/tokens/${tokenId}/momentum`);
  return data;
}

// ── Search CoinGecko ──

export async function searchCoinGecko(q) {
  const { data } = await api.get('/search/coingecko', { params: { q } });
  return data.coins;
}

// ── Watchlists ──

export async function fetchWatchlists() {
  const { data } = await api.get('/watchlists');
  return data;
}

export async function fetchWatchlist(id) {
  const { data } = await api.get(`/watchlists/${id}`);
  return data;
}

export async function createWatchlist(name, description) {
  const { data } = await api.post('/watchlists', { name, description });
  return data;
}

export async function updateWatchlist(id, payload) {
  const { data } = await api.put(`/watchlists/${id}`, payload);
  return data;
}

export async function deleteWatchlist(id) {
  await api.delete(`/watchlists/${id}`);
}

export async function addTokenToWatchlist(watchlistId, tokenId, notes) {
  const { data } = await api.post(`/watchlists/${watchlistId}/tokens`, {
    token_id: tokenId,
    notes,
  });
  return data;
}

export async function removeTokenFromWatchlist(watchlistId, tokenId) {
  await api.delete(`/watchlists/${watchlistId}/tokens/${tokenId}`);
}

// ── Screening ──

export async function runScreening({ watchlistId, tokenIds } = {}) {
  const payload = {};
  if (watchlistId) payload.watchlist_id = watchlistId;
  if (tokenIds) payload.token_ids = tokenIds;
  const { data } = await api.post('/screening/run', payload);
  return data;
}

export async function fetchScreeningStatus(runId) {
  const { data } = await api.get(`/screening/status/${runId}`);
  return data;
}

// ── Discovery ──

export async function runDiscovery(perCategory = 15) {
  const { data } = await api.post('/discover/run', { per_category: perCategory });
  return data;
}

export async function runRefreshAll() {
  const { data } = await api.post('/discover/refresh');
  return data;
}

// ── Settings ──

export async function fetchWeights() {
  const { data } = await api.get('/settings/weights');
  return data;
}

export async function updateWeights(weights, momentumMode) {
  const { data } = await api.put('/settings/weights', {
    weights,
    momentum_mode: momentumMode,
  });
  return data;
}

export async function fetchSectors() {
  const { data } = await api.get('/sectors');
  return data;
}
