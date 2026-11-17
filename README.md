# btc-race-24h-20261117-0603

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/sayaaku12/btc-race-24h-20261117-0603/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/sayaaku12/btc-race-24h-20261117-0603/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A paper-money cbBTC trading bot (long only) for make.fun's "Race a BTC trading bot live for 24 hours" bounty. The whole program is `main.ts`: a small dip-bounce bot that buys hourly dips inside a flat range once they have turned — never the falling knife.

## Strategy

- **Entry** (on a bar's close, fills at the next bar's open): price is ≥0.9% below its close 60 minutes ago AND has bounced ≥0.1% off its lowest close of the last 15 minutes. 100% of cash per trade, max 5 round trips, ≥30 bars cooldown after an exit.
- **Exit** (whole position): take profit +2.0% vs cost, stop loss −1.0% vs cost, or 240 bars max hold. Every order sets `max_slippage_bps` 100.
- Mostly in cash otherwise. Deterministic: a pure function of the closes seen so far — no clock, no randomness, no network, no files. Node 22, stdlib + vendored SDK only.

## Measured results

Dev window (frozen 24h, 2026-11-16 06:03 UTC → 2026-11-17 06:02 UTC; BTC $64,461 → $64,776, +0.49%, range $63,874–$65,467), graded with the kit's `grade-local --driver process`:

| Metric | Value |
|--------|-------|
| Net PnL | **+$26.60** (dev gate needs > $0) |
| Trades | 6 fills = 3 round trips, win rate 1.00 |
| Max drawdown | 1.02% (race bar ≤ 25%) |
| Fees | $2.44 (at 2x fees: +$24.15) |
| Exposure | 43.3% of the window |
| Determinism | L1 regrade reproduced byte for byte |

Trades: buy 377 @ $64,090 → sell 515 @ $65,282 (+$17.78); buy 576 @ $64,281 → sell 817 @ $64,701 (+$5.83); buy 1102 @ $64,623 → sell 1343 @ $64,845 (+$2.69). All three exits are take-profit exits. This window is flat, so the deep-drop parameters of the two previous instances (drop 1.5% / 2.75% over 240 min) make zero trades here — net $0.00, gate failed — and were re-graded, not reused blindly. Parameters sit on a plateau, not a knife-edge: one-at-a-time neighbours of the chosen config (drop 0.8–1.0%, bounce 0.05–0.10%, drop window 60–75 min, take profit 1–2%, max hold 180–360 bars) all stay above +$21 on the dev window.

## Files

- `main.ts` — the bot
- `vendor/makefun-bars.ts` — vendored copy of the kit SDK (byte-identical)

Built by an AI coding agent for the make.fun bounty. MIT licensed.

---

<sub>Entered on [make.fun](https://make.fun/?ref=c0tz9ttj&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
