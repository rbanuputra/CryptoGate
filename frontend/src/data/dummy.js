export const dummyTokens = [
  {
    id: 1,
    coingecko_id: 'ethereum',
    symbol: 'ETH',
    name: 'Ethereum',
    chain: 'ethereum',
    logo_url: 'https://coin-images.coingecko.com/coins/images/279/small/ethereum.png',
    categories: ['Smart Contract Platform', 'Layer 1 (L1)', 'Proof of Stake (PoS)'],
    website: 'https://ethereum.org',
    twitter_handle: 'ethereum',
    github_url: 'https://github.com/ethereum/go-ethereum',
    description_en: 'Ethereum is a global, open-source platform for decentralized applications.',
    description_id: 'Ethereum adalah platform open-source global untuk aplikasi terdesentralisasi.',
    user_notes: 'Blue chip, baseline comparison',
    latest_market_snapshot: {
      price: 2533.31,
      market_cap: 309395515984,
      fdv: 309395515984,
      circulating_supply: 122130709,
      total_supply: 122130709,
      max_supply: null,
      volume_24h: 18234567890,
    },
    latest_composite_score: {
      composite_score: 7.8,
      verdict: 'PASS',
      weights: { gate1: 0.35, gate2: 0.40, gate3: 0.25 },
    },
    gate_scores: [
      { gate: 1, score: 8.2, breakdown: { mc_fdv_ratio: 1.0, emission_revenue: 1.5, unlock_pressure: 0.1 } },
      { gate: 2, score: 7.5, breakdown: { ps_ratio: 12.3, mcap_tvl: 0.8, capital_efficiency: 0.15 } },
      { gate: 3, score: 7.8, breakdown: { top10_concentration: 0.35, volume_depth: 8.5, spread: 0.02 } },
    ],
  },
  {
    id: 2,
    coingecko_id: 'aave',
    symbol: 'AAVE',
    name: 'Aave',
    chain: 'ethereum',
    logo_url: 'https://coin-images.coingecko.com/coins/images/12645/small/aave-token-round.png',
    categories: ['DeFi', 'Lending/Borrowing'],
    website: 'https://aave.com',
    twitter_handle: 'aaborrowingave',
    github_url: 'https://github.com/aave',
    description_en: 'Aave is a decentralized non-custodial liquidity protocol.',
    description_id: null,
    user_notes: null,
    latest_market_snapshot: {
      price: 268.45,
      market_cap: 4023675000,
      fdv: 4294500000,
      circulating_supply: 14987432,
      total_supply: 16000000,
      max_supply: 16000000,
      volume_24h: 345678901,
    },
    latest_composite_score: {
      composite_score: 7.2,
      verdict: 'PASS',
      weights: { gate1: 0.35, gate2: 0.40, gate3: 0.25 },
    },
    gate_scores: [
      { gate: 1, score: 7.5, breakdown: { mc_fdv_ratio: 0.94, emission_revenue: 0.8, unlock_pressure: 0.05 } },
      { gate: 2, score: 7.8, breakdown: { ps_ratio: 8.5, mcap_tvl: 0.35, capital_efficiency: 0.12 } },
      { gate: 3, score: 5.8, breakdown: { top10_concentration: 0.48, volume_depth: 15.2, spread: 0.08 } },
    ],
  },
  {
    id: 3,
    coingecko_id: 'chainlink',
    symbol: 'LINK',
    name: 'Chainlink',
    chain: 'ethereum',
    logo_url: 'https://coin-images.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
    categories: ['Oracle', 'Smart Contract Platform'],
    website: 'https://chain.link',
    twitter_handle: 'chainlink',
    github_url: 'https://github.com/smartcontractkit/chainlink',
    description_en: 'Chainlink is a decentralized oracle network.',
    description_id: 'Chainlink adalah jaringan oracle terdesentralisasi.',
    user_notes: null,
    latest_market_snapshot: {
      price: 14.82,
      market_cap: 9345678901,
      fdv: 14820000000,
      circulating_supply: 630615000,
      total_supply: 1000000000,
      max_supply: 1000000000,
      volume_24h: 567890123,
    },
    latest_composite_score: {
      composite_score: 5.4,
      verdict: 'WATCH',
      weights: { gate1: 0.35, gate2: 0.40, gate3: 0.25 },
    },
    gate_scores: [
      { gate: 1, score: 4.2, breakdown: { mc_fdv_ratio: 0.63, emission_revenue: 6.5, unlock_pressure: 0.45 } },
      { gate: 2, score: 6.1, breakdown: { ps_ratio: 45.2, mcap_tvl: 2.1, capital_efficiency: 0.04 } },
      { gate: 3, score: 6.5, breakdown: { top10_concentration: 0.52, volume_depth: 12.8, spread: 0.05 } },
    ],
  },
  {
    id: 4,
    coingecko_id: 'render-token',
    symbol: 'RENDER',
    name: 'Render',
    chain: 'solana',
    logo_url: 'https://coin-images.coingecko.com/coins/images/11636/small/rndr.png',
    categories: ['AI & Compute', 'DePIN'],
    website: 'https://rendernetwork.com',
    twitter_handle: 'rendernetwork',
    github_url: null,
    description_en: 'Render Network is a decentralized GPU rendering platform.',
    description_id: null,
    user_notes: 'AI narrative play',
    latest_market_snapshot: {
      price: 7.23,
      market_cap: 3745890000,
      fdv: 3867450000,
      circulating_supply: 518105263,
      total_supply: 534900000,
      max_supply: 534900000,
      volume_24h: 234567890,
    },
    latest_composite_score: {
      composite_score: 6.1,
      verdict: 'PASS',
      weights: { gate1: 0.35, gate2: 0.40, gate3: 0.25 },
    },
    gate_scores: [
      { gate: 1, score: 7.8, breakdown: { mc_fdv_ratio: 0.97, emission_revenue: 2.1, unlock_pressure: 0.08 } },
      { gate: 2, score: 5.2, breakdown: { ps_ratio: 85.3, mcap_tvl: null, capital_efficiency: null } },
      { gate: 3, score: 5.8, breakdown: { top10_concentration: 0.42, volume_depth: 18.5, spread: 0.12 } },
    ],
  },
  {
    id: 5,
    coingecko_id: 'worldcoin-wld',
    symbol: 'WLD',
    name: 'Worldcoin',
    chain: 'ethereum',
    logo_url: 'https://coin-images.coingecko.com/coins/images/31069/small/worldcoin.jpeg',
    categories: ['AI & Compute', 'Identity'],
    website: 'https://worldcoin.org',
    twitter_handle: 'worldcoin',
    github_url: null,
    description_en: 'Worldcoin is a digital identity and cryptocurrency project.',
    description_id: null,
    user_notes: null,
    latest_market_snapshot: {
      price: 2.15,
      market_cap: 1234567890,
      fdv: 21500000000,
      circulating_supply: 574215000,
      total_supply: 10000000000,
      max_supply: 10000000000,
      volume_24h: 189012345,
    },
    latest_composite_score: {
      composite_score: 2.8,
      verdict: 'FAIL',
      weights: { gate1: 0.35, gate2: 0.40, gate3: 0.25 },
    },
    gate_scores: [
      { gate: 1, score: 1.5, breakdown: { mc_fdv_ratio: 0.057, emission_revenue: 95.0, unlock_pressure: 3.2 } },
      { gate: 2, score: 2.1, breakdown: { ps_ratio: null, mcap_tvl: null, capital_efficiency: null } },
      { gate: 3, score: 6.2, breakdown: { top10_concentration: 0.38, volume_depth: 22.1, spread: 0.15 } },
    ],
  },
  {
    id: 6,
    coingecko_id: 'uniswap',
    symbol: 'UNI',
    name: 'Uniswap',
    chain: 'ethereum',
    logo_url: 'https://coin-images.coingecko.com/coins/images/12504/small/uniswap-logo.png',
    categories: ['DeFi', 'DEX', 'AMM'],
    website: 'https://uniswap.org',
    twitter_handle: 'Uniswap',
    github_url: 'https://github.com/Uniswap',
    description_en: 'Uniswap is a decentralized exchange protocol on Ethereum.',
    description_id: 'Uniswap adalah protokol pertukaran terdesentralisasi di Ethereum.',
    user_notes: null,
    latest_market_snapshot: {
      price: 10.85,
      market_cap: 6510000000,
      fdv: 10850000000,
      circulating_supply: 600000000,
      total_supply: 1000000000,
      max_supply: 1000000000,
      volume_24h: 412345678,
    },
    latest_composite_score: {
      composite_score: 5.9,
      verdict: 'WATCH',
      weights: { gate1: 0.35, gate2: 0.40, gate3: 0.25 },
    },
    gate_scores: [
      { gate: 1, score: 5.5, breakdown: { mc_fdv_ratio: 0.60, emission_revenue: 4.2, unlock_pressure: 0.35 } },
      { gate: 2, score: 6.8, breakdown: { ps_ratio: 15.8, mcap_tvl: 1.2, capital_efficiency: 0.08 } },
      { gate: 3, score: 4.8, breakdown: { top10_concentration: 0.55, volume_depth: 25.3, spread: 0.04 } },
    ],
  },
];

export const dummyWatchlists = [
  {
    id: 1,
    name: 'Bear Market Gems',
    description: 'Tokens with strong fundamentals at discounted prices',
    tokens_count: 4,
    created_at: '2026-10-10T08:00:00Z',
    tokens: [dummyTokens[0], dummyTokens[1], dummyTokens[2], dummyTokens[3]],
  },
  {
    id: 2,
    name: 'AI Narrative',
    description: 'AI and compute related tokens',
    tokens_count: 2,
    created_at: '2026-10-11T10:00:00Z',
    tokens: [dummyTokens[3], dummyTokens[4]],
  },
  {
    id: 3,
    name: 'DeFi Blue Chips',
    description: 'Established DeFi protocols with revenue',
    tokens_count: 3,
    created_at: '2026-10-12T12:00:00Z',
    tokens: [dummyTokens[0], dummyTokens[1], dummyTokens[5]],
  },
];

export const dummySectors = {
  'RWA (Real World Assets)': ['Real World Assets (RWA)', 'Tokenized Assets', 'Tokenized Treasuries'],
  'AI & Compute': ['Artificial Intelligence (AI)', 'AI Agents', 'AI Applications'],
  'DePIN': ['DePIN'],
  'L1 Infrastructure': ['Smart Contract Platform', 'Layer 1 (L1)', 'Proof of Stake (PoS)'],
  'L2 & Scaling': ['Layer 2 (L2)', 'Rollup', 'SideChain'],
  'DeFi Core': ['DeFi', 'DEX', 'AMM', 'Lending/Borrowing', 'Perpetuals'],
  'Oracle & Data': ['Oracle', 'Analytics'],
  'Gaming & Metaverse': ['Gaming (GameFi)', 'Metaverse'],
  'Meme': ['Meme', 'Dog-Themed'],
  'Liquid Staking': ['Liquid Staking'],
};

export const dummyWeights = {
  weights: { gate1: 0.35, gate2: 0.40, gate3: 0.25 },
  momentum_mode: 'multiplier',
};

export const gateNames = {
  1: 'Tokenomics & Emisi',
  2: 'Valuation Metrics',
  3: 'Deteksi Manipulasi',
};

export function formatNumber(num) {
  if (num === null || num === undefined) return '—';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

export function formatPrice(num) {
  if (num === null || num === undefined) return '—';
  if (num >= 1) return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${num.toFixed(6)}`;
}

export function formatSupply(num) {
  if (num === null || num === undefined) return '—';
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(0);
}
