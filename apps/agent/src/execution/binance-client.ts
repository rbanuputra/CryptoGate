/**
 * Re-exports from the unified exchange module for backwards compatibility.
 * New code should import from "../exchange/index.js" or "../exchange/adapter.js".
 */
export { PaperExchangeClient } from "../exchange/index.js";
export type { ExchangeClient, OrderParams, OrderResult, OrderSide, OrderType } from "../exchange/adapter.js";
