import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import logging
import os
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TickerCache:
    def __init__(self, expiry_minutes=5):
        self._cache = {}
        self._expiry = expiry_minutes

    def get(self, key):
        if key in self._cache:
            data, timestamp = self._cache[key]
            if datetime.now() - timestamp < timedelta(minutes=self._expiry):
                return data
        return None

    def set(self, key, value):
        self._cache[key] = (value, datetime.now())

# Initialize cache
cache = TickerCache()

WATCHLIST_FILE = "watchlist.json"

def get_lists() -> List[str]:
    """Get the names of all available watchlists."""
    lists = []
    for f in os.listdir("."):
        if f.startswith("watchlist_") and f.endswith(".json"):
            lists.append(f.replace("watchlist_", "").replace(".json", ""))
    return lists if lists else ["default"]

def get_watchlist(list_name: str = "default") -> List[str]:
    filename = f"watchlist_{list_name}.json" if list_name != "default" else "watchlist.json"
    if os.path.exists(filename):
        try:
            with open(filename, "r") as f:
                return json.load(f)
        except:
            pass
    return ["AAPL", "MSFT", "NVDA", "TSLA", "GOOGL"]

def save_watchlist(symbols: List[str], list_name: str = "default"):
    filename = f"watchlist_{list_name}.json" if list_name != "default" else "watchlist.json"
    with open(filename, "w") as f:
        json.dump(symbols, f)

def import_csv_tickers(csv_content: str) -> List[str]:
    """Extract tickers from a CSV string."""
    import re
    tickers = re.findall(r'([A-Z.]{1,8})', csv_content.upper())
    return list(set(tickers))

def get_stock_data(ticker_symbol: str) -> Optional[Dict]:
    """Fetch current price and 1-day history for a ticker."""
    cached_data = cache.get(ticker_symbol)
    if cached_data:
        return cached_data

    try:
        ticker = yf.Ticker(ticker_symbol)
        
        # Get basic info
        info = ticker.info
        if not info or 'regularMarketPrice' not in info:
            logger.warning(f"Basic info missing for {ticker_symbol}, trying history...")
        
        # Get historical data for the last 5 days to calculate 1d change
        history = ticker.history(period="5d", interval="1d")
        
        if history.empty:
            logger.error(f"No history or info found for {ticker_symbol}")
            return None

        # Current data (from last closed day or realtime if available)
        current_price = info.get('regularMarketPrice')
        prev_close = info.get('previousClose')
        
        if current_price is None and not history.empty:
            current_price = history['Close'].iloc[-1]
            prev_close = history['Close'].iloc[-2] if len(history) > 1 else current_price

        change = current_price - prev_close
        change_pct = (change / prev_close) * 100 if prev_close else 0

        # Historical data for chart (last 7 days by default)
        chart_data = history.tail(30).reset_index()
        chart_points = []
        for _, row in chart_data.iterrows():
            d = row['Date']
            # Handle timezone-aware datetime from newer yfinance versions
            if hasattr(d, 'date'):
                d = d.date()
            chart_points.append({
                "date": str(d),
                "value": round(float(row['Close']), 2)
            })

        # Get current metrics relative to 52-week high
        fifty_two_week_high = info.get('fiftyTwoWeekHigh', 0)
        pct_of_52w_high = (current_price / fifty_two_week_high * 100) if fifty_two_week_high else 0
        pct_off_52w_high = 100 - pct_of_52w_high  # how far below the 52w high

        data = {
            "symbol": ticker_symbol.upper(),
            "name": info.get('longName', ticker_symbol.upper()),
            "price": round(current_price, 2),
            "change": round(change, 2),
            "changePercent": round(change_pct, 2),
            "pctOf52wHigh": round(pct_of_52w_high, 2),
            "pctOff52wHigh": round(pct_off_52w_high, 2),
            "currency": info.get('currency', 'USD'),
            "chart": chart_points,
            "timestamp": datetime.now().isoformat()
        }
        
        cache.set(ticker_symbol, data)
        return data
        
    except Exception as e:
        logger.error(f"Error fetching data for {ticker_symbol}: {e}")
        return None

def get_key_financials(symbol: str) -> Optional[Dict]:
    """Fetch key financial metrics for a symbol."""
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        return {
            "symbol": symbol.upper(),
            "marketCap": info.get('marketCap'),
            "trailingPE": info.get('trailingPE'),
            "forwardPE": info.get('forwardPE'),
            "dividendYield": info.get('dividendYield', 0) * 100 if info.get('dividendYield') else 0,
            "eps": info.get('trailingEps'),
            "bookValue": info.get('bookValue'),
            "revenue": info.get('totalRevenue'),
            "sector": info.get('sector'),
            "industry": info.get('industry'),
            "summary": info.get('longBusinessSummary')
        }
    except Exception as e:
        logger.error(f"Error fetching financials for {symbol}: {e}")
        return None

def search_symbols(query: str) -> List[Dict]:
    """Search for symbols by validating the ticker against yfinance."""
    data = get_stock_data(query)
    if data:
        return [{"symbol": data["symbol"], "name": data["name"]}]
    return []
