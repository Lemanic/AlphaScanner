import os
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ.get("API_KEY", "").strip()
TAOSTATS_URL = "https://api.taostats.io/api/dtao/tradingview/udf/history"
REQUEST_TIMEOUT = 20

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)


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

    if not API_KEY or API_KEY == "your_taostats_api_key":
        return jsonify({"s": "error", "errmsg": "API_KEY is not configured in .env"}), 500

    headers = {
        "Authorization": API_KEY,
        "accept": "application/json",
    }
    params = {
        "symbol": symbol,
        "resolution": resolution,
        "from": frm,
        "to": to,
    }

    try:
        r = requests.get(TAOSTATS_URL, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5050"))
    app.run(host="0.0.0.0", port=port, debug=True)
