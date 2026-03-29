from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from api.stocks import (
    get_stock_data, 
    search_symbols, 
    cache, 
    get_watchlist, 
    save_watchlist, 
    get_key_financials,
    get_lists,
    import_csv_tickers
)
from fastapi import UploadFile, File
import uvicorn
import os

app = FastAPI(title="StocksPulse-py")

# Serve static files (HTML, CSS, JS)
static_dir = os.path.join(os.path.dirname(__file__), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)

app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def read_root():
    """Serve the main index.html file."""
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        with open(index_file, "r") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>StocksPulse-py</h1><p>Static frontend not found yet.</p>", status_code=404)

@app.get("/api/watchlist/{list_name}")
async def watchlist_by_name(list_name: str):
    """Get a specific watchlist."""
    return get_watchlist(list_name)

@app.post("/api/save-watchlist")
async def save_watchlist_endpoint(payload: dict):
    """Save a watchlist from the frontend."""
    list_name = payload.get("list_name", "default")
    symbols = payload.get("symbols", [])
    save_watchlist(symbols, list_name)
    return {"status": "ok"}

@app.get("/api/lists")
async def list_names():
    """Get all watchlist names."""
    return get_lists()

@app.post("/api/import-csv")
async def import_csv(file: UploadFile = File(...), list_name: str = "default"):
    """Import tickers from a CSV file."""
    content = await file.read()
    tickers = import_csv_tickers(content.decode("utf-8"))
    
    current = get_watchlist(list_name)
    added = 0
    for t in tickers:
        if t not in current:
            current.append(t)
            added += 1
    
    save_watchlist(current, list_name)
    return {"status": "success", "added": added, "total": len(current)}

@app.get("/api/financials/{symbol}")
async def financials(symbol: str):
    """Get key financials for a symbol."""
    data = get_key_financials(symbol)
    if not data:
        raise HTTPException(status_code=404, detail="Financials not found")
    return data

@app.get("/api/stocks/{symbol}")
async def get_stock(symbol: str, list_name: str = "default"):
    """Get detailed stock information."""
    data = get_stock_data(symbol)
    if not data:
        raise HTTPException(status_code=404, detail="Stock not found")
    
    # Update watchlist if not already in there
    current = get_watchlist(list_name)
    if data["symbol"] not in current:
        current.insert(0, data["symbol"])
        save_watchlist(current, list_name)
        
    return data

@app.get("/api/search")
async def search(q: str):
    """Search for symbols."""
    results = search_symbols(q)
    return results

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
