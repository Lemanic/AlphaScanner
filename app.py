import os
import time
import threading
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ.get("API_KEY", "").strip()
TAOSTATS_BARS_URL = "https://api.taostats.io/api/dtao/tradingview/udf/history"
TAOSTATS_POOL_URL = "https://api.taostats.io/api/dtao/pool/latest/v1"
REQUEST_TIMEOUT = 20
SUBNETS_CACHE_TTL = 300  # seconds

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

_subnets_cache = {"ts": 0.0, "data": None}
_subnets_lock = threading.Lock()


def _api_key_ok():
    return bool(API_KEY) and API_KEY != "your_taostats_api_key"


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/bars")
def bars():
    symbol = request.args.get("symbol", "").strip()
    resolution = request.args.get("resolution", "").strip()
    frm = request.args.get("from", "").strip()
    to = request.args.get("to", "").strip()

    if not symbol or not resolution or not frm or not to:
        return jsonify({"s": "error", "errmsg": "missing required params: symbol, resolution, from, to"}), 400
    if not _api_key_ok():
        return jsonify({"s": "error", "errmsg": "API_KEY is not configured in .env"}), 500

    headers = {"Authorization": API_KEY, "accept": "application/json"}
    params = {"symbol": symbol, "resolution": resolution, "from": frm, "to": to}
    print(f"[bars] symbol={symbol!r} params={params}", flush=True)

    try:
        r = requests.get(TAOSTATS_BARS_URL, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
    except requests.exceptions.Timeout:
        return jsonify({"s": "error", "errmsg": "upstream timeout"}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({"s": "error", "errmsg": f"upstream error: {e}"}), 502

    if r.status_code == 401:
        return jsonify({"s": "error", "errmsg": "unauthorized — check API_KEY"}), 401
    if r.status_code == 404:
        return jsonify({"s": "error", "errmsg": "symbol not found"}), 404
    if r.status_code >= 400:
        return jsonify({"s": "error", "errmsg": f"upstream status {r.status_code}", "body": r.text[:500]}), r.status_code

    try:
        return jsonify(r.json())
    except ValueError:
        return jsonify({"s": "error", "errmsg": "invalid JSON from upstream"}), 502


@app.route("/api/subnets")
def subnets():
    if not _api_key_ok():
        return jsonify({"error": "API_KEY is not configured in .env"}), 500

    now = time.time()
    with _subnets_lock:
        if _subnets_cache["data"] is not None and now - _subnets_cache["ts"] < SUBNETS_CACHE_TTL:
            return jsonify(_subnets_cache["data"])

    try:
        r = requests.get(
            TAOSTATS_POOL_URL,
            headers={"Authorization": API_KEY, "accept": "application/json"},
            params={"limit": 256, "page": 1},
            timeout=REQUEST_TIMEOUT,
        )
    except requests.exceptions.Timeout:
        return jsonify({"error": "upstream timeout"}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"upstream error: {e}"}), 502

    if r.status_code == 401:
        return jsonify({"error": "unauthorized — check API_KEY"}), 401
    if r.status_code >= 400:
        return jsonify({"error": f"upstream status {r.status_code}"}), r.status_code

    try:
        payload = r.json()
    except ValueError:
        return jsonify({"error": "invalid JSON from upstream"}), 502

    raw = payload.get("data") or []
    result = sorted(
        (
            {
                "netuid": item["netuid"],
                "name": item.get("name") or "Unknown",
                "symbol": f"SUB-{item['netuid']}",
            }
            for item in raw
            if isinstance(item, dict) and "netuid" in item
        ),
        key=lambda x: x["netuid"],
    )

    with _subnets_lock:
        _subnets_cache["ts"] = now
        _subnets_cache["data"] = result

    return jsonify(result)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5050"))
    app.run(host="0.0.0.0", port=port, debug=True)
