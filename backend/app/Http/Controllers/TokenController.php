<?php

namespace App\Http\Controllers;

use App\Models\Token;
use App\Models\MarketSnapshot;
use App\Services\BuyZoneService;
use App\Services\CoinGeckoService;
use App\Services\DefiLlamaService;
use App\Services\EtherscanService;
use App\Services\MomentumService;
use App\Services\ScoringService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TokenController extends Controller
{
    public function __construct(
        private CoinGeckoService $coinGecko,
        private ScoringService $scoring,
        private BuyZoneService $buyZone,
        private DefiLlamaService $defiLlama,
        private EtherscanService $etherscan,
        private MomentumService $momentum,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Token::with(['latestMarketSnapshot', 'latestCompositeScore'])
            ->with(['gateScores' => fn ($q) => $q->whereIn('id', function ($sub) {
                $sub->selectRaw('MAX(id)')
                    ->from('gate_scores')
                    ->groupBy('token_id', 'gate');
            })]);

        if ($request->has('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('symbol', 'ilike', "%{$search}%")
                  ->orWhere('name', 'ilike', "%{$search}%");
            });
        }

        if ($request->has('chain')) {
            $query->where('chain', $request->input('chain'));
        }

        $sortBy = $request->input('sort', 'name');
        $sortDir = $request->input('dir', 'asc');
        $allowed = ['name', 'symbol', 'chain', 'created_at'];
        if (in_array($sortBy, $allowed)) {
            $query->orderBy($sortBy, $sortDir);
        }

        $tokens = $query->paginate($request->input('per_page', 25));

        return response()->json($tokens);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'coingecko_id' => 'required|string|unique:tokens,coingecko_id',
        ]);

        $coinData = $this->coinGecko->getCoinDetail($validated['coingecko_id']);

        if (!$coinData) {
            return response()->json(['message' => 'Token not found on CoinGecko'], 404);
        }

        $profile = $this->coinGecko->parseTokenProfile($coinData);
        $token = Token::create($profile);

        $snapshot = $this->coinGecko->parseMarketSnapshot($coinData);
        $token->marketSnapshots()->create(array_merge($snapshot, [
            'date' => Carbon::today(),
        ]));

        $token->load('latestMarketSnapshot');

        return response()->json($token, 201);
    }

    public function show(string $id): JsonResponse
    {
        $token = Token::with([
            'latestMarketSnapshot',
            'latestCompositeScore',
            'latestDefiMetric',
            'latestHolderSnapshot',
            'manualInputs',
            'gateScores' => fn ($q) => $q->whereIn('id', function ($sub) {
                $sub->selectRaw('MAX(id)')
                    ->from('gate_scores')
                    ->groupBy('token_id', 'gate');
            }),
        ])->findOrFail($id);

        if (!$token->description_en && $token->coingecko_id) {
            $coinData = $this->coinGecko->getCoinDetail($token->coingecko_id);
            if ($coinData) {
                $profile = $this->coinGecko->parseTokenProfile($coinData);
                $token->update([
                    'description_en' => $profile['description_en'],
                    'website' => $profile['website'] ?? $token->website,
                    'github_url' => $profile['github_url'] ?? $token->github_url,
                    'twitter_handle' => $profile['twitter_handle'] ?? $token->twitter_handle,
                    'categories' => !empty($profile['categories']) ? $profile['categories'] : $token->categories,
                ]);
                $token->refresh();
            }
        }

        return response()->json($token);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $token = Token::findOrFail($id);

        $validated = $request->validate([
            'user_notes' => 'nullable|string',
            'description_id' => 'nullable|string',
            'translation_source' => 'nullable|in:manual,google,llm',
            'chain' => 'nullable|string',
        ]);

        $token->update($validated);

        return response()->json($token);
    }

    public function destroy(string $id): JsonResponse
    {
        $token = Token::findOrFail($id);
        $token->delete();

        return response()->json(['message' => 'Token deleted']);
    }

    public function scores(string $id): JsonResponse
    {
        $token = Token::with([
            'gateScores' => fn ($q) => $q->orderByDesc('created_at'),
            'compositeScores' => fn ($q) => $q->orderByDesc('created_at'),
        ])->findOrFail($id);

        return response()->json([
            'gate_scores' => $token->gateScores->take(10),
            'composite_scores' => $token->compositeScores->take(10),
        ]);
    }

    public function buyZone(string $id): JsonResponse
    {
        $token = Token::with(['latestMarketSnapshot', 'latestCompositeScore'])->findOrFail($id);
        $result = $this->buyZone->calculate($token);

        return response()->json($result);
    }

    public function score(string $id): JsonResponse
    {
        $token = Token::with('latestMarketSnapshot')->findOrFail($id);
        $result = $this->scoring->scoreToken($token);

        $token->load(['latestCompositeScore', 'gateScores' => fn ($q) => $q->where('run_id', $result['run_id'])]);

        return response()->json([
            'token' => $token,
            'scoring' => $result,
        ]);
    }

    public function searchCoinGecko(Request $request): JsonResponse
    {
        $request->validate([
            'q' => 'required|string|min:2',
        ]);

        $results = $this->coinGecko->searchCoins($request->input('q'));

        $coins = collect($results['coins'] ?? [])->take(20)->map(fn ($coin) => [
            'id' => $coin['id'],
            'symbol' => strtoupper($coin['symbol']),
            'name' => $coin['name'],
            'thumb' => $coin['thumb'] ?? null,
            'market_cap_rank' => $coin['market_cap_rank'] ?? null,
            'already_added' => Token::where('coingecko_id', $coin['id'])->exists(),
        ]);

        return response()->json(['coins' => $coins]);
    }

    public function refreshMarketData(string $id): JsonResponse
    {
        $token = Token::findOrFail($id);

        $coinData = $this->coinGecko->getCoinDetail($token->coingecko_id);

        if (!$coinData) {
            return response()->json(['message' => 'Failed to fetch market data'], 502);
        }

        $snapshot = $this->coinGecko->parseMarketSnapshot($coinData);
        $token->marketSnapshots()->updateOrCreate(
            ['date' => Carbon::today()],
            $snapshot,
        );

        $profile = $this->coinGecko->parseTokenProfile($coinData);
        $token->update([
            'logo_url' => $profile['logo_url'],
            'description_en' => $profile['description_en'],
            'website' => $profile['website'],
            'github_url' => $profile['github_url'],
            'twitter_handle' => $profile['twitter_handle'],
            'categories' => $profile['categories'],
        ]);

        $token->load('latestMarketSnapshot');

        return response()->json($token);
    }

    public function fetchDefi(string $id): JsonResponse
    {
        $token = Token::with('latestMarketSnapshot')->findOrFail($id);

        $slug = $this->defiLlama->findProtocolSlug($token->name, $token->symbol);

        if (!$slug) {
            return response()->json([
                'found' => false,
                'message' => 'Protocol not found on DefiLlama',
            ]);
        }

        $tvl = $this->defiLlama->getProtocolTvl($slug);
        $fees = $this->defiLlama->getProtocolFees($slug);
        $revenue = $this->defiLlama->getProtocolRevenue($slug);

        if ($tvl === null && !$fees && !$revenue) {
            return response()->json([
                'found' => false,
                'message' => 'Failed to fetch protocol data',
            ]);
        }

        $metrics = $this->defiLlama->buildMetrics($tvl ?? 0, $fees, $revenue);

        $token->defiMetrics()->updateOrCreate(
            ['date' => Carbon::today()],
            $metrics,
        );

        $token->load('latestDefiMetric');

        $mc = (float) ($token->latestMarketSnapshot?->market_cap ?? 0);
        $ratios = [];
        if ($mc > 0) {
            if ($metrics['tvl'] > 0) {
                $ratios['mcap_tvl'] = round($mc / $metrics['tvl'], 2);
            }
            if ($metrics['revenue_24h'] > 0) {
                $ratios['ps_ratio'] = round($mc / ($metrics['revenue_24h'] * 365), 2);
            }
            if ($metrics['fees_24h'] > 0) {
                $ratios['pf_ratio'] = round($mc / ($metrics['fees_24h'] * 365), 2);
            }
        }

        return response()->json([
            'found' => true,
            'slug' => $slug,
            'metrics' => $metrics,
            'ratios' => $ratios,
            'defi_metric' => $token->latestDefiMetric,
        ]);
    }

    public function fetchHolders(string $id): JsonResponse
    {
        $token = Token::with('latestMarketSnapshot')->findOrFail($id);

        if (empty($token->contract_address)) {
            return response()->json([
                'found' => false,
                'message' => 'No contract address available for holder data',
            ]);
        }

        $holders = $this->etherscan->getTokenHolders($token->contract_address);

        if (!$holders) {
            return response()->json([
                'found' => false,
                'message' => 'Failed to fetch holder data (Ethplorer supports Ethereum ERC-20 tokens only)',
            ]);
        }

        $analysis = $this->etherscan->analyzeHolderConcentration($holders);

        $tokenInfo = $this->etherscan->getTokenInfo($token->contract_address);
        $totalHolders = (int) ($tokenInfo['holdersCount'] ?? $analysis['total_holders']);

        $token->holderSnapshots()->updateOrCreate(
            ['date' => Carbon::today()],
            [
                'top10_pct' => $analysis['top10_pct'],
                'top50_pct' => $analysis['top50_pct'],
                'total_holders' => $totalHolders,
            ],
        );

        $token->load('latestHolderSnapshot');

        return response()->json([
            'found' => true,
            'analysis' => array_merge($analysis, ['total_holders' => $totalHolders]),
            'holder_snapshot' => $token->latestHolderSnapshot,
        ]);
    }

    public function scoreHistory(string $id): JsonResponse
    {
        $token = Token::findOrFail($id);

        $composites = $token->compositeScores()
            ->orderBy('created_at')
            ->get()
            ->map(fn ($cs) => [
                'date' => $cs->created_at->toDateTimeString(),
                'composite_score' => (float) $cs->composite_score,
                'verdict' => $cs->verdict,
                'run_id' => $cs->run_id,
            ]);

        $gates = $token->gateScores()
            ->orderBy('created_at')
            ->get()
            ->groupBy('run_id')
            ->map(fn ($group) => [
                'date' => $group->first()->created_at->toDateTimeString(),
                'gate1' => (float) ($group->firstWhere('gate', 1)?->score ?? 0),
                'gate2' => (float) ($group->firstWhere('gate', 2)?->score ?? 0),
                'gate3' => (float) ($group->firstWhere('gate', 3)?->score ?? 0),
            ])
            ->values();

        return response()->json([
            'composite_history' => $composites,
            'gate_history' => $gates,
        ]);
    }

    public function fetchMomentum(string $id): JsonResponse
    {
        $token = Token::findOrFail($id);
        $data = $this->momentum->calculateMomentum($token);

        return response()->json($data);
    }
}
