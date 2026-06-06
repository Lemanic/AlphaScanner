# AlphaScanner

Local web application for browsing Alpha token charts from the Bittensor network, with a Market Cipher B (VuManChu Cipher B) indicator overlay.

- **Backend:** Python + Flask (proxy to the taostats.io REST API)
- **Frontend:** TradingView Lightweight Charts + a JS implementation of VMC Cipher B
- **Data source:** taostats.io UDF endpoint

## Setup

1. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

2. Edit `.env` and set your taostats API key:

   ```
   API_KEY=tao-xxxxxxxxxxxxxxxxxxxxxxxx
   ```

3. Run the server:

   ```bash
   python app.py
   ```

4. Open <http://localhost:5050> in your browser. (Override the port with `PORT=8080 python app.py`.)

## Usage

Choose a subnet (TAO, SUB-1, SUB-4, SUB-8, SUB-19, SUB-62) and a resolution (1m, 5m, 15m, 1h, 4h, 1D) from the header. The chart re-fetches and re-renders on every change.

Three stacked panels share a synchronized X axis and crosshair:

1. **Price (60%)** — candlesticks + volume histogram
2. **WaveTrend (25%)** — WT1 area, WT2 line, VWAP diff, MFI histogram, buy/sell markers, ±53/±60 reference lines
3. **RSI (15%)** — RSI line with per-segment color (green ≤30, red ≥60, purple between) and 30/60 reference lines

## Project layout

```
alphascanner/
├── app.py            # Flask server + /api/bars proxy
├── requirements.txt
├── .env              # API_KEY=...
├── static/
│   ├── index.html
│   ├── chart.js      # Lightweight Charts + VMC Cipher B
│   └── style.css
└── README.md
```

## API

`GET /api/bars?symbol=SUB-4&resolution=60&from=<unix>&to=<unix>`

Returns the taostats UDF response unchanged:

```json
{ "s": "ok", "t": [...], "o": [...], "h": [...], "l": [...], "c": [...], "v": [...] }
```
