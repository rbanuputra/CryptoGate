import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Search, X, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from 'cn';
import {
  fetchWatchlists, fetchWatchlist, createWatchlist, deleteWatchlist,
  addTokenToWatchlist, removeTokenFromWatchlist, searchCoinGecko, addToken,
  fetchTokens,
} from '@/lib/api';
import { formatNumber, formatPrice } from '@/lib/format';
import VerdictBadge from '@/components/tokens/VerdictBadge';

export default function Watchlist() {
  const [watchlists, setWatchlists] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingToken, setAddingToken] = useState(null);

  useEffect(() => {
    loadWatchlists();
  }, []);

  const loadDetail = useCallback(async (id) => {
    try {
      setDetailLoading(true);
      const data = await fetchWatchlist(id);
      setSelectedDetail(data);
    } catch {
      setSelectedDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setSelectedDetail(null);
  }, [selectedId, loadDetail]);

  async function loadWatchlists() {
    try {
      setLoading(true);
      const data = await fetchWatchlists();
      setWatchlists(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const wl = await createWatchlist(newName, newDesc || null);
      setWatchlists([...watchlists, { ...wl, tokens_count: 0 }]);
      setNewName('');
      setNewDesc('');
      setShowCreate(false);
      setSelectedId(wl.id);
    } catch {
      // silent
    }
  }

  async function handleDelete(id) {
    try {
      await deleteWatchlist(id);
      setWatchlists(watchlists.filter(w => w.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedDetail(null);
      }
    } catch {
      // silent
    }
  }

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        setSearching(true);
        const coins = await searchCoinGecko(searchQuery);
        setSearchResults(coins);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  async function handleAddCoin(coin) {
    if (!selectedId || addingToken === coin.id) return;
    try {
      setAddingToken(coin.id);
      let tokenData;
      if (coin.already_added) {
        const allTokens = selectedDetail?.tokens || [];
        tokenData = allTokens.find(t => t.coingecko_id === coin.id);
        if (!tokenData) {
          const res = await fetchTokens({ search: coin.id, perPage: 1 });
          tokenData = res.data[0];
        }
      } else {
        tokenData = await addToken(coin.id);
      }
      if (tokenData) {
        await addTokenToWatchlist(selectedId, tokenData.id);
        await loadDetail(selectedId);
        await loadWatchlists();
      }
    } catch (err) {
      if (err.response?.status === 409) {
        // already in watchlist
      }
    } finally {
      setAddingToken(null);
    }
  }

  async function handleRemoveToken(tokenId) {
    if (!selectedId) return;
    try {
      await removeTokenFromWatchlist(selectedId, tokenId);
      await loadDetail(selectedId);
      await loadWatchlists();
    } catch {
      // silent
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Watchlists</h1>
          <p className="text-sm text-muted-foreground">Manage token lists for screening</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New Watchlist
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-medium">Name</label>
                <Input placeholder="Watchlist name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <Input placeholder="Optional" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
              </div>
              <Button onClick={handleCreate}>Create</Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {watchlists.map((wl) => (
                <div
                  key={wl.id}
                  onClick={() => setSelectedId(wl.id)}
                  className={cn(
                    'group cursor-pointer rounded-lg border p-3 transition-colors',
                    selectedId === wl.id
                      ? 'border-primary/50 bg-accent'
                      : 'border-transparent hover:bg-accent/50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{wl.name}</span>
                        <Badge variant="secondary" className="text-xs">{wl.tokens_count}</Badge>
                      </div>
                      {wl.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">{wl.description}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); handleDelete(wl.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {watchlists.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">No watchlists yet.</p>
              )}
            </>
          )}
        </div>

        <div>
          {selectedId ? (
            <Card>
              {detailLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : selectedDetail ? (
                <>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle>{selectedDetail.name}</CardTitle>
                      {selectedDetail.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{selectedDetail.description}</p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowSearch(!showSearch)}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add Token
                    </Button>
                  </CardHeader>

                  {showSearch && (
                    <>
                      <Separator />
                      <div className="p-4">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Search CoinGecko..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-9"
                            autoFocus
                          />
                          <button
                            onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        {searching && (
                          <div className="mt-3 flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        {searchResults.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {searchResults.map((coin) => (
                              <div key={coin.id} className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-accent">
                                <div className="flex items-center gap-2.5">
                                  {coin.thumb ? (
                                    <img src={coin.thumb} alt="" className="h-5 w-5 rounded-full" />
                                  ) : (
                                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                                      {coin.symbol?.slice(0, 2)}
                                    </div>
                                  )}
                                  <span className="text-sm">{coin.name}</span>
                                  <span className="text-xs text-muted-foreground">{coin.symbol}</span>
                                  {coin.market_cap_rank && (
                                    <span className="text-xs text-muted-foreground">#{coin.market_cap_rank}</span>
                                  )}
                                </div>
                                <Button
                                  variant="ghost" size="sm" className="h-7 text-xs"
                                  disabled={addingToken === coin.id}
                                  onClick={() => handleAddCoin(coin)}
                                >
                                  {addingToken === coin.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : coin.already_added ? 'Add to list' : 'Add'}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                          <p className="mt-3 text-center text-sm text-muted-foreground">No results</p>
                        )}
                      </div>
                    </>
                  )}

                  <Separator />

                  <div>
                    {selectedDetail.tokens?.map((token) => {
                      const ms = token.latest_market_snapshot;
                      return (
                        <div key={token.id} className="flex items-center justify-between border-b last:border-0 px-4 py-3 hover:bg-accent/50 transition-colors">
                          <Link to={`/token/${token.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                            {token.logo_url ? (
                              <img src={token.logo_url} alt="" className="h-7 w-7 rounded-full" />
                            ) : (
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                                {token.symbol?.slice(0, 2)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{token.name}</p>
                              <p className="text-xs text-muted-foreground">{token.symbol}</p>
                            </div>
                          </Link>
                          <div className="flex items-center gap-5">
                            <div className="text-right hidden sm:block">
                              <p className="text-sm tabular-nums">{formatPrice(ms?.price)}</p>
                              <p className="text-xs tabular-nums text-muted-foreground">{formatNumber(ms?.market_cap)}</p>
                            </div>
                            <VerdictBadge verdict={token.latest_composite_score?.verdict} />
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveToken(token.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {(!selectedDetail.tokens || selectedDetail.tokens.length === 0) && (
                      <p className="py-12 text-center text-sm text-muted-foreground">Empty. Click "Add Token" to get started.</p>
                    )}
                  </div>
                </>
              ) : null}
            </Card>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground">Select a watchlist to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
