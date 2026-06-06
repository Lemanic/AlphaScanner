// ============================================================================
// AlphaScanner — Lightweight Charts + VuManChu Cipher B
// ============================================================================

// ----- Cipher B parameters --------------------------------------------------
const WT_CHANNEL_LEN = 9;
const WT_AVERAGE_LEN = 12;
const WT_MA_LEN      = 3;
const RSI_LEN        = 14;
const MFI_PERIOD     = 60;
const MFI_MULTIPLIER = 150;
const MFI_POS_Y      = 2.5;

const OB_LEVEL  =  53;
const OB_LEVEL2 =  60;
const OS_LEVEL  = -53;
const OS_LEVEL2 = -60;
const OS_LEVEL3 = -75;

// ----- Math utilities -------------------------------------------------------
function ema(data, period) {
  const k = 2 / (period + 1);
  const result = new Array(data.length).fill(NaN);
  let start = data.findIndex(v => !isNaN(v));
  if (start < 0) return result;
  result[start] = data[start];
  for (let i = start + 1; i < data.length; i++) {
    const prev = result[i - 1];
    if (isNaN(data[i]) || isNaN(prev)) { result[i] = prev; continue; }
    result[i] = data[i] * k + prev * (1 - k);
  }
  return result;
}

function sma(data, period) {
  const result = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    if (slice.some(v => isNaN(v))) continue;
    result[i] = slice.reduce((a, b) => a + b, 0) / period;
  }
  return result;
}

function rsi(closes, period) {
  const result = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return result;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    result[i] = 100 - 100 / (1 + (avgLoss === 0 ? Infinity : avgGain / avgLoss));
  }
  return result;
}

function absArr(data) {
  return data.map(v => Math.abs(v));
}

// ----- Cipher B core --------------------------------------------------------
function calcWaveTrend(highs, lows, closes, chlen, avglen, malen) {
  const ap  = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  const esa = ema(ap, chlen);
  const diff = ap.map((v, i) => Math.abs(v - esa[i]));
  const d   = ema(diff, chlen);
  const ci  = ap.map((v, i) => {
    const denom = 0.015 * d[i];
    return denom === 0 ? 0 : (v - esa[i]) / denom;
  });
  const wt1 = ema(ci, avglen);
  const wt2 = sma(wt1, malen);
  const wtVwap = wt1.map((v, i) => v - wt2[i]);
  return { wt1, wt2, wtVwap };
}

function calcMFI(opens, highs, lows, closes, period, multiplier, posY) {
  const raw = closes.map((c, i) => {
    const hl = highs[i] - lows[i];
    return hl === 0 ? 0 : ((c - opens[i]) / hl) * multiplier;
  });
  const result = sma(raw, period);
  return result.map(v => isNaN(v) ? NaN : v - posY);
}

function detectSignals(wt1, wt2) {
  const signals = [];
  for (let i = 1; i < wt1.length; i++) {
    if (isNaN(wt1[i]) || isNaN(wt2[i]) || isNaN(wt1[i-1]) || isNaN(wt2[i-1])) continue;
    const crossUp   = (wt1[i-1] < wt2[i-1]) && (wt1[i] >= wt2[i]);
    const crossDown = (wt1[i-1] > wt2[i-1]) && (wt1[i] <= wt2[i]);
    const oversold   = wt2[i] <= OS_LEVEL;
    const overbought = wt2[i] >= OB_LEVEL;
    if (crossUp   && oversold)   signals.push({ index: i, type: 'buy'  });
    if (crossDown && overbought) signals.push({ index: i, type: 'sell' });
  }
  return signals;
}

// ----- Lightweight Charts API shim (v4 / v5) --------------------------------
const LWC = window.LightweightCharts;

function addCandle(chart, opts) {
  if (chart.addCandlestickSeries) return chart.addCandlestickSeries(opts);
  return chart.addSeries(LWC.CandlestickSeries, opts);
}
function addLine(chart, opts) {
  if (chart.addLineSeries) return chart.addLineSeries(opts);
  return chart.addSeries(LWC.LineSeries, opts);
}
function addHist(chart, opts) {
  if (chart.addHistogramSeries) return chart.addHistogramSeries(opts);
  return chart.addSeries(LWC.HistogramSeries, opts);
}
function addArea(chart, opts) {
  if (chart.addAreaSeries) return chart.addAreaSeries(opts);
  return chart.addSeries(LWC.AreaSeries, opts);
}
function setMarkers(series, markers) {
  if (series.setMarkers) { series.setMarkers(markers); return; }
  if (LWC.createSeriesMarkers) LWC.createSeriesMarkers(series, markers);
}

// ----- Chart construction ---------------------------------------------------
const chartCommon = {
  layout: {
    background: { type: 'solid', color: '#131722' },
    textColor:  '#d1d4dc',
    fontSize: 11,
  },
  grid: {
    vertLines: { color: '#1f2330' },
    horzLines: { color: '#1f2330' },
  },
  rightPriceScale: {
    borderColor: '#2a2e39',
  },
  timeScale: {
    borderColor: '#2a2e39',
    timeVisible: true,
    secondsVisible: false,
  },
  crosshair: {
    mode: 0,
    vertLine: { color: '#4994ec', width: 1, style: 3 },
    horzLine: { color: '#4994ec', width: 1, style: 3 },
  },
};

const priceEl = document.getElementById('price-panel');
const wtEl    = document.getElementById('wt-panel');
const rsiEl   = document.getElementById('rsi-panel');
const statusEl = document.getElementById('status');

const priceChart = LWC.createChart(priceEl, { ...chartCommon });
const wtChart    = LWC.createChart(wtEl,    { ...chartCommon, timeScale: { ...chartCommon.timeScale, visible: false } });
const rsiChart   = LWC.createChart(rsiEl,   { ...chartCommon });

// Price series
const candleSeries = addCandle(priceChart, {
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderUpColor: '#26a69a',
  borderDownColor: '#ef5350',
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
});

const volumeSeries = addHist(priceChart, {
  priceFormat: { type: 'volume' },
  priceScaleId: '',
  color: '#26a69a55',
});
volumeSeries.priceScale().applyOptions({
  scaleMargins: { top: 0.8, bottom: 0 },
});

// WT panel series — WT1 filled area, WT2 plain line on top
const wt1Area = addArea(wtChart, {
  topColor:    'rgba(73,148,236,0.30)',
  bottomColor: 'rgba(73,148,236,0)',
  lineColor:   'rgba(73,148,236,0.9)',
  lineWidth:   1,
  priceLineVisible: false,
  lastValueVisible: false,
});
const wt2Series = addLine(wtChart, {
  color: 'rgba(255,255,255,0.5)',
  lineWidth: 1,
  priceLineVisible: false,
  lastValueVisible: false,
});
const wtVwapSeries = addLine(wtChart, {
  color: '#ffffff88',
  lineWidth: 2,
  priceLineVisible: false,
  lastValueVisible: false,
});
// MFI shares the WT price scale and is compressed into [-99, -95] so it
// renders as a thin band at the bottom of the WT panel.
const mfiSeries = addHist(wtChart, {
  priceScaleId: 'right',
  priceLineVisible: false,
  lastValueVisible: false,
  base: -97,
});

// Horizontal reference lines on WT panel (drawn on wt2Series).
// ±53 = mid OB/OS, brighter. ±60 = strong OB/OS, dimmer.
[
  { level: OB_LEVEL,  opacity: 0.4 },
  { level: OB_LEVEL2, opacity: 0.2 },
  { level: OS_LEVEL,  opacity: 0.4 },
  { level: OS_LEVEL2, opacity: 0.2 },
].forEach(({ level, opacity }) => {
  wt2Series.createPriceLine({
    price: level,
    color: `rgba(255,255,255,${opacity})`,
    lineWidth: 1,
    lineStyle: 2, // dashed
    axisLabelVisible: false,
    title: '',
  });
});

// RSI panel — use multi-segment lines to vary color
const rsiSeriesArr = []; // pool of line series so we can clear between renders
function getRsiSegmentSeries(color) {
  const s = addLine(rsiChart, {
    color,
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });
  rsiSeriesArr.push(s);
  return s;
}

// Anchor RSI series for price-line creation / crosshair sync — created lazily.
let rsiAnchor = null;

// ----- Sync: time range + crosshair ----------------------------------------
const charts = [priceChart, wtChart, rsiChart];

let syncing = false;
charts.forEach((src, i) => {
  src.timeScale().subscribeVisibleLogicalRangeChange(range => {
    if (syncing || !range) return;
    syncing = true;
    charts.forEach((dst, j) => {
      if (j !== i) dst.timeScale().setVisibleLogicalRange(range);
    });
    syncing = false;
  });
});

charts.forEach((src, i) => {
  src.subscribeCrosshairMove(param => {
    charts.forEach((dst, j) => {
      if (j === i) return;
      const anchor = dst.__crosshairAnchor;
      if (!anchor) return;
      if (!param || param.time === undefined || param.time === null) {
        dst.clearCrosshairPosition();
      } else {
        dst.setCrosshairPosition(NaN, param.time, anchor);
      }
    });
  });
});

priceChart.__crosshairAnchor = candleSeries;
wtChart.__crosshairAnchor    = wt2Series;
// rsiAnchor is set after first data render

// ----- Resize ---------------------------------------------------------------
function resizeAll() {
  priceChart.applyOptions({ width: priceEl.clientWidth, height: priceEl.clientHeight });
  wtChart.applyOptions(   { width: wtEl.clientWidth,    height: wtEl.clientHeight });
  rsiChart.applyOptions(  { width: rsiEl.clientWidth,   height: rsiEl.clientHeight });
}
window.addEventListener('resize', resizeAll);
resizeAll();

// ----- Data fetching --------------------------------------------------------
function setStatus(text, cls = '') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + cls;
}

const errorOverlay = document.getElementById('error-overlay');
const errorTitle   = document.getElementById('error-title');
const errorDetail  = document.getElementById('error-detail');
const errorRetry   = document.getElementById('error-retry');

function showError(symbol, message) {
  errorTitle.textContent = `Failed to load ${symbol}`;
  errorDetail.textContent = message;
  errorOverlay.hidden = false;
}

function hideError() {
  errorOverlay.hidden = true;
}

errorRetry.addEventListener('click', () => {
  hideError();
  loadAndRender();
});

async function fetchBars(symbol, resolution) {
  // Pick a `from` window sized to give ~500-1000 candles for the resolution.
  const now = Math.floor(Date.now() / 1000);
  const secPerBar = resolutionToSeconds(resolution);
  const lookbackBars = 1000;
  const from = now - secPerBar * lookbackBars;

  const url = `/api/bars?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&from=${from}&to=${now}`;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.errmsg || `HTTP ${r.status}`);
  }
  return await r.json();
}

function resolutionToSeconds(res) {
  if (res === '1D') return 86400;
  if (res === '7D') return 7 * 86400;
  if (res === '30D') return 30 * 86400;
  const n = parseInt(res, 10);
  return (isNaN(n) ? 60 : n) * 60;
}

// ----- Render ---------------------------------------------------------------
function clearRsiSegments() {
  rsiSeriesArr.forEach(s => {
    try { rsiChart.removeSeries(s); } catch (e) { /* ignore */ }
  });
  rsiSeriesArr.length = 0;
  rsiAnchor = null;
}

function rsiColorFor(v) {
  if (v <= 30) return '#3ee145';
  if (v >= 60) return '#e13e3e';
  return '#c33ee1';
}

function renderRSI(times, rsiVals) {
  clearRsiSegments();

  // Build color-uniform segments. To keep continuity, when color changes we
  // end the current segment AT the new point (overlap by one), then start a
  // new segment from that point.
  let currentColor = null;
  let currentSeries = null;
  let currentData = [];
  const flush = () => {
    if (currentSeries && currentData.length) currentSeries.setData(currentData);
  };

  for (let i = 0; i < rsiVals.length; i++) {
    const v = rsiVals[i];
    if (isNaN(v)) continue;
    const col = rsiColorFor(v);
    if (col !== currentColor) {
      // close prior segment with overlap
      if (currentSeries) {
        currentData.push({ time: times[i], value: v });
        flush();
      }
      currentColor = col;
      currentSeries = getRsiSegmentSeries(col);
      currentData = [{ time: times[i], value: v }];
    } else {
      currentData.push({ time: times[i], value: v });
    }
  }
  flush();

  rsiAnchor = rsiSeriesArr[0] || null;
  rsiChart.__crosshairAnchor = rsiAnchor;

  // Reference horizontal lines at 30 and 60 — attach to first segment series.
  if (rsiAnchor) {
    [30, 60].forEach(level => {
      rsiAnchor.createPriceLine({
        price: level,
        color: 'rgba(255,255,255,0.3)',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: false,
        title: '',
      });
    });
  }
}

async function loadAndRender() {
  const symbol = document.getElementById('symbol').value;
  const resolution = document.getElementById('resolution').value;
  setStatus('loading…', 'loading');
  hideError();

  let data;
  try {
    data = await fetchBars(symbol, resolution);
  } catch (e) {
    setStatus('error', 'error');
    showError(symbol, e.message);
    return;
  }

  if (!data || data.s !== 'ok' || !Array.isArray(data.t) || data.t.length === 0) {
    setStatus('no data', 'error');
    showError(symbol, 'No data returned from upstream.');
    return;
  }

  const t = data.t;
  const o = data.o;
  const h = data.h;
  const l = data.l;
  const c = data.c;
  const v = data.v || c.map(() => 0);

  // Candles
  const candles = t.map((ts, i) => ({
    time: ts,
    open:  o[i],
    high:  h[i],
    low:   l[i],
    close: c[i],
  }));
  candleSeries.setData(candles);

  // Volume
  const volume = t.map((ts, i) => ({
    time: ts,
    value: v[i],
    color: c[i] >= o[i] ? '#26a69a55' : '#ef535055',
  }));
  volumeSeries.setData(volume);

  // WaveTrend
  const { wt1, wt2, wtVwap } = calcWaveTrend(h, l, c, WT_CHANNEL_LEN, WT_AVERAGE_LEN, WT_MA_LEN);

  const wt1Data = t.map((ts, i) => ({ time: ts, value: wt1[i] })).filter(p => !isNaN(p.value));
  const wt2Data = t.map((ts, i) => ({ time: ts, value: wt2[i] })).filter(p => !isNaN(p.value));
  const wtVwapData = t.map((ts, i) => ({ time: ts, value: wtVwap[i] })).filter(p => !isNaN(p.value));

  wt1Area.setData(wt1Data);
  wt2Series.setData(wt2Data);
  wtVwapSeries.setData(wtVwapData);

  // MFI — compress into [-99, -95] band so it sits at the bottom of the WT
  // panel without overlapping the WT lines. Centered at -97, amplitude ±2.
  const mfi = calcMFI(o, h, l, c, MFI_PERIOD, MFI_MULTIPLIER, MFI_POS_Y);
  const maxAbsMfi = mfi.reduce((m, v) => isNaN(v) ? m : Math.max(m, Math.abs(v)), 0) || 1;
  const mfiData = t.map((ts, i) => {
    const v = mfi[i];
    if (isNaN(v)) return null;
    return {
      time: ts,
      value: -97 + (v / maxAbsMfi) * 2,
      color: v >= 0 ? '#3ee14588' : '#ff3d2e88',
    };
  }).filter(Boolean);
  mfiSeries.setData(mfiData);

  // Buy/Sell signals
  const signals = detectSignals(wt1, wt2);
  const markers = signals.map(s => s.type === 'buy'
    ? { time: t[s.index], position: 'belowBar', color: '#3ee145', shape: 'arrowUp',   text: 'B' }
    : { time: t[s.index], position: 'aboveBar', color: '#ef5350', shape: 'arrowDown', text: 'S' }
  );
  setMarkers(wt2Series, markers);

  // RSI
  const rsiVals = rsi(c, RSI_LEN);
  renderRSI(t, rsiVals);

  // Fit content
  priceChart.timeScale().fitContent();
  wtChart.timeScale().fitContent();
  rsiChart.timeScale().fitContent();

  setStatus(`${symbol} • ${resolution} • ${t.length} bars`);
}

// ----- Wire up controls -----------------------------------------------------
document.getElementById('symbol').addEventListener('change', loadAndRender);
document.getElementById('resolution').addEventListener('change', loadAndRender);

// Initial load
loadAndRender();
