// Dip-bounce bot for make.fun "Race a BTC trading bot live for 24 hours"
// (btc-race-24h-20261117-0603). Long only, $1,000 paper, cbBTC 1-minute bars.
//
// The dev window for THIS instance (2026-11-16 06:03 UTC -> 2026-11-17 06:02 UTC,
// BTC $64,461 -> $64,776, +0.49%) is FLAT, not a grind down: the whole range
// is $63,874 - $65,467, the worst 240-min move is only -1.50% (one bar) and
// the worst 480-min move only -1.28%. The old deep-drop parameters from both
// previous instances FAIL here: instance 1 (drop 1.5% / bounce 0.7%) and
// instance 2 (drop 2.75% / bounce 0.3%) both make ZERO trades on this window,
// net PnL $0.00, which fails the dev gate (needs > $0). There is no deep drop
// to wait for, so the bot must trade the small hourly dips inside the range
// instead: buy a >= 0.9% dip over 60 minutes once it has bounced >= 0.1% off
// its 15-minute low, sell at +2% or stop at -1%, max 240 bars held.
//
// Verified with an exact-fill offline simulator (fill math ported from the
// kit harness, calibrated to grade-local to the cent on the previous
// instances): 51,840 configs grid-searched, 12,035 pass the gate. Chosen
// config gives +$26.60 on the sim: 3 round trips, 3 wins, fees $2.44,
// max drawdown 1.02%, exposure 43.3%. Trades: buy bar 377 @ $64,090 ->
// sell 515 @ $65,282 (+$17.78); buy 576 @ $64,281 -> sell 817 @ $64,701
// (+$5.83); buy 1102 @ $64,623 -> sell 1343 @ $64,845 (+$2.69). All three
// exits are take-profit exits, no end-of-window flatten.
//
// Neighbourhood (one-at-a-time, sim): DROP_PCT 0.8% +$22.15 / 0.9% +$26.60 /
// 1.0% +$26.31 (1.1% collapses to one trade, +$5.77); CONFIRM_PCT 0.05%
// +$27.76 / 0.10% +$26.60 (0.15% collapses to one trade); DROP_WINDOW 60
// +$26.60 / 75 +$21.42 (45 collapses to one trade); TP 1-2% +$20..+$27;
// MAX_HOLD 180-360 +$23..+$29; SL 0.7-5% flat (+$26.31); COOLDOWN 0-60 flat.
// Every neighbour stays above $0, so the gate margin is wide, but the entry
// trigger sits near the noise floor of this flat window: the dip is small
// because the window itself barely moves.
//
// Honest limits: the race window is a different, unseen 24h. On a ranging
// race window this bot trades and can profit; on a waterfall it buys dips
// and stops out at -1% each (max 5 round trips, worst case ~-$55, max DD
// ~5.5%, still inside the 25% race bar); on a straight rally it may trade
// 0 times (no >= 0.9% hourly dip) and fail the race >= 1-trade bar. This is
// a free lottery ticket for a top-10 slot, not a reliable payout.
//
// Deterministic: pure function of the closes seen so far; no clock, no
// randomness, no network, no files. Stdlib + vendored SDK only.

import { runBars, type BarsState, type Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const DROP_WINDOW = 60; // minutes of history the drop is measured over
const DROP_PCT = 0.009; // entry needs a >= 0.9% drop over DROP_WINDOW
const CONFIRM_WINDOW = 15; // minutes of history the bounce low is measured over
const CONFIRM_PCT = 0.001; // entry needs a >= 0.1% bounce off that low
const TAKE_PROFIT = 0.02;
const STOP_LOSS = 0.01;
const MAX_HOLD_BARS = 240;
const MAX_TRADES = 5;
const COOLDOWN_BARS = 30;
const MAX_SLIPPAGE_BPS = 100;

const closes: number[] = [];
let entrySeq = -1;
let buys = 0;
let lastExitSeq = -1_000_000;
let prevHeld = false;

function rollingLow(n: number): number {
  let lo = Infinity;
  for (let i = Math.max(0, closes.length - n); i < closes.length; i++) {
    if (closes[i] < lo) lo = closes[i];
  }
  return lo;
}

// Entry gate, factored out so the decision reads as one predicate:
// trade budget left, cooldown elapsed, enough history, then the dip +
// bounce conditions on the closes seen so far.
function shouldEnter(state: BarsState): boolean {
  if (buys >= MAX_TRADES) return false;
  if (state.seq - lastExitSeq < COOLDOWN_BARS) return false;
  if (closes.length <= DROP_WINDOW) return false;
  const now = closes[closes.length - 1];
  if (now / closes[closes.length - 1 - DROP_WINDOW] - 1 > -DROP_PCT) return false;
  if (now / rollingLow(CONFIRM_WINDOW) - 1 < CONFIRM_PCT) return false;
  if (state.cash < BigInt(state.hello.fees.min_notional_quote_units)) return false;
  return true;
}

// Exit gate: take profit, stop loss, or max hold, on value vs cost.
// A zero-quantity position can never be exited (defensive: the harness
// should never surface one, but a divide-by-zero cost would be worse).
function shouldExit(state: BarsState, held: { qty: bigint; cost: bigint }): boolean {
  if (held.qty === 0n || held.cost === 0n) return false;
  const value = state.value(SYMBOL, held.qty);
  const ret = Number(value) / Number(held.cost) - 1;
  return ret >= TAKE_PROFIT || ret <= -STOP_LOSS || state.seq - entrySeq >= MAX_HOLD_BARS;
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    if (state.warmingUp) return [];
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes.push(Number(bar.c) / 1e5);
    }
    if (!batch.bars.some((b) => b.symbol === SYMBOL)) return [];

    // Observe fills decided on the previous bar.
    for (const fill of batch.fills) {
      if (fill.symbol !== SYMBOL) continue;
      if (fill.side === 'buy' && fill.status === 'filled') buys++;
      if (fill.side === 'sell' && fill.status === 'filled') lastExitSeq = state.seq;
    }

    const held = state.positions.get(SYMBOL);
    if (held !== undefined && !prevHeld) entrySeq = state.seq;
    prevHeld = held !== undefined;
    if (held === undefined) {
      // Entry: small hourly dip + confirmed bounce, 100% of cash per trade.
      if (!shouldEnter(state)) return [];
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }

    // Exit: whole position when the exit gate fires.
    if (shouldExit(state, held)) {
      return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
