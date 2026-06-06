# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```bash
# Install dependencies (once)
.venv/bin/pip install -r requirements.txt

# Start the server
.venv/bin/python app.py
# → http://localhost:5050

# Stop the server
lsof -ti :5050 | xargs kill
```

Port 5000 is taken by macOS AirPlay on this machine — the app runs on **5050**. Override with `PORT=8080 .venv/bin/python app.py`.

The `.env` file must contain a valid taostats API key:
```
API_KEY=tao-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:xxxxxxxx
```

Flask runs in `debug=True` mode, so `app.py` changes are hot-reloaded automatically. Static file changes (`chart.js`, `style.css`, `index.html`) take effect on browser reload — no server restart needed.

## Architecture

Single-process Flask app serving both a REST proxy and the static frontend.

### Backend (`app.py`)

Two upstream endpoints are used:
- **`TAOSTATS_BARS_URL`** — `https://api.taostats.io/api/dtao/tradingview/udf/history` — OHLCV candle data (TradingView UDF format).
- **`TAOSTATS_POOL_URL`** — `https://api.taostats.io/api/dtao/pool/latest/v1` — subnet list (netuid, name).

The `/api/subnets/latest/v1` endpoint suggested by taostats docs does not exist (404). The pool endpoint is used instead and returns the same metadata.

`/api/subnets` caches the 5-minute TTL subnet list in `_subnets_cache` (thread-safe with `_subnets_lock`).

The API response shape from taostats uses `{"s": "ok", "t": [...], "o": [...], "h": [...], "l": [...], "c": [...], "v": [...]}`. When `s == "no_data"` or `t` is an empty array, the frontend shows a soft info card rather than an error.

### Frontend (`static/`)

All chart logic lives in `chart.js` — there is no build step. The file is loaded directly as a plain ES5-compatible script.

**Three stacked Lightweight Charts panels** share a synchronized X-axis and crosshair:
1. **Price panel (60%)** — candlestick + volume histogram overlay
2. **WaveTrend panel (25%)** — WT1 area, WT2 line, wtVwap line, MFI histogram, buy/sell markers
3. **RSI panel (15%)** — multi-segment colored RSI line

**Cross-panel sync** uses `subscribeVisibleLogicalRangeChange` (range lock) and `subscribeCrosshairMove` + `setCrosshairPosition` (crosshair lock). Each chart stores a `.__crosshairAnchor` series reference for the crosshair call. The RSI anchor (`rsiAnchor`) is set lazily after each render because RSI segments are removed and recreated on every data load.

**Lightweight Charts v4/v5 shim**: `addCandle`, `addLine`, `addHist`, `addArea`, `setMarkers` wrapper functions handle API differences between v4 (`chart.addCandlestickSeries`) and v5 (`chart.addSeries(LWC.CandlestickSeries, …)`).

**State object** (`state`) holds `{symbol, netuid, subnetName, subnets[]}`. Subnet selection and chart rendering are driven entirely through this object — there is no subnet `<select>` dropdown.

**MFI rendering quirk**: raw MFI values are normalized to a `[-99, -95]` band (formula: `-97 + (mfi / maxAbsMfi) * 2`) so the histogram sits at the bottom of the WaveTrend panel without overlapping WT1/WT2 lines.

**RSI color segments**: instead of a single line series with changing color, multiple `LineSeries` instances are created per render (`rsiSeriesArr`), one per color-uniform segment (green ≤30, red ≥60, purple in between), with 1-point overlap at color transitions for visual continuity. All are destroyed and recreated on each `loadAndRender()` call.

**Resolution values** sent to the API: `60`, `240`, `1D`, `7D`. The display labels (`1H`, `4H`, `1D`, `1W`) are mapped via `RES_LABELS`. Default is `60` (1H).

**Sidebar** (280px, collapsible): populated from `/api/subnets` on boot. Defaults to netuid 4 (Targon). On mobile (`< 768px`) it overlays the chart and auto-closes after a subnet is selected. `ResizeObserver` on each chart panel triggers `resizeAll()` when the sidebar opens/closes.

## API notes

- `Authorization` header value is the raw API key string (not `Bearer <key>`).
- `/api/bars` accepts `symbol=SUB-{netuid}` — subnet 0 is the TAO root token.
- The taostats pool endpoint returns results in arbitrary order; `app.py` sorts by `netuid` ascending before caching.
