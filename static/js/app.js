/* ---- State ---- */
let SYMBOLS = [];
let stocksData = [];
let sortCol = 'name';
let sortDir = 1; // 1 asc, -1 desc

const tbody = document.getElementById('stocks-body');
const searchInput = document.getElementById('symbol-search');
const csvUpload = document.getElementById('csv-upload');
const modalContainer = document.getElementById('modal-container');
const modalContent = document.getElementById('modal-content');
const modalTitle = document.getElementById('modal-title');
const listLabel = document.getElementById('list-label');

let state = { isLoaded: false, currentList: 'default' };

/* ---- Data Fetching ---- */
async function fetchWatchlist() {
    try {
        const res = await fetch(`/api/watchlist/${state.currentList}`);
        SYMBOLS = await res.json();
    } catch {
        SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL'];
    }
}

async function fetchStock(symbol) {
    try {
        const res = await fetch(`/api/stocks/${symbol}?list_name=${state.currentList}`);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function updateDashboard() {
    if (!state.isLoaded) {
        await fetchWatchlist();
        state.isLoaded = true;
    }
    listLabel.textContent = `${state.currentList === 'default' ? 'Default' : state.currentList} Watchlist`;

    tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">Loading market data…</td></tr>`;
    const results = await Promise.all(SYMBOLS.map(fetchStock));
    stocksData = results.filter(Boolean);
    renderTable();
}

/* ---- Table Rendering ---- */
function renderTable() {
    const sorted = [...stocksData].sort((a, b) => {
        const av = a[sortCol], bv = b[sortCol];
        if (typeof av === 'string') return sortDir * av.localeCompare(bv);
        return sortDir * (av - bv);
    });

    tbody.innerHTML = '';
    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">No stocks in this list.</td></tr>`;
        return;
    }

    sorted.forEach(stock => {
        const isPos = stock.change >= 0;
        const cls = isPos ? 'positive' : 'negative';
        const sign = isPos ? '+' : '';
        const pctOf = stock.pctOf52wHigh ?? 0;
        const pctOff = stock.pctOff52wHigh ?? (100 - pctOf);
        const barColor = pctOf >= 90 ? '#34c759' : pctOf >= 70 ? '#007aff' : '#ff9f0a';
        const offColor = pctOff <= 5 ? '#34c759' : pctOff <= 15 ? '#ff9f0a' : '#ff3b30';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="td-company-name">${stock.name}</div>
            </td>
            <td class="td-ticker">${stock.symbol}</td>
            <td class="td-right td-price">${stock.price.toFixed(2)} <span style="font-size:11px;color:#666">${stock.currency}</span></td>
            <td class="td-right ${cls}">${sign}${stock.change.toFixed(2)}</td>
            <td class="td-right ${cls}">${sign}${stock.changePercent.toFixed(2)}%</td>
            <td class="td-right">
                <div style="display:flex;flex-direction:column;align-items:flex-end">
                    <span>${pctOf.toFixed(1)}%</span>
                    <div class="td-52w-bar">
                        <div class="td-52w-fill" style="width:${Math.min(pctOf,100)}%;background:${barColor}"></div>
                    </div>
                </div>
            </td>
            <td class="td-right" style="color:${offColor}">
                -${pctOff.toFixed(1)}%
            </td>
            <td class="td-right">
                <button class="btn-fin" onclick="showFinancials('${stock.symbol}')">Financials</button>
                <button class="btn-remove" onclick="removeSymbol('${stock.symbol}')" title="Remove">×</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/* ---- Sorting ---- */
document.querySelectorAll('#stocks-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) {
            sortDir *= -1;
            th.classList.toggle('sorted-asc', sortDir === 1);
            th.classList.toggle('sorted-desc', sortDir === -1);
        } else {
            document.querySelectorAll('#stocks-table th').forEach(h => {
                h.classList.remove('sorted-asc', 'sorted-desc');
            });
            sortCol = col;
            sortDir = 1;
            th.classList.add('sorted-asc');
        }
        renderTable();
    });
});

/* ---- Remove Symbol ---- */
function removeSymbol(symbol) {
    SYMBOLS = SYMBOLS.filter(s => s !== symbol);
    stocksData = stocksData.filter(s => s.symbol !== symbol);
    // Persist
    fetch(`/api/watchlist/${state.currentList}`, { method: 'GET' }).then(() => {
        // Save updated list
        fetch('/api/save-watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ list_name: state.currentList, symbols: SYMBOLS })
        }).catch(() => {});
    });
    renderTable();
}

/* ---- Modal Helpers ---- */
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

async function shareApp() {
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'StocksPulse',
                text: 'Check out my stock dashboard!',
                url: window.location.href
            });
        } catch {}
    } else {
        alert('Share not supported on this device/browser.');
    }
}

function openModal(title, html) {
    modalTitle.textContent = title;
    modalContent.innerHTML = html;
    modalContainer.style.display = 'flex';
}
function closeModal() {
    modalContainer.style.display = 'none';
    document.querySelector('.modal-card').classList.remove('modal-chart');
}

async function showFinancials(symbol) {
    // Switch modal to full-screen chart mode
    const modalCard = document.querySelector('.modal-card');
    modalCard.classList.add('modal-chart');
    modalContainer.style.display = 'flex';

    modalTitle.textContent = `${symbol} — Chart & Financials`;
    modalContent.innerHTML = `
        <div id="tv-chart-wrap" style="width:100%; height:480px; border-radius:12px; overflow:hidden; margin-bottom:24px; border:1px solid rgba(255,255,255,0.08)">
            <div id="tv-chart-container" style="width:100%; height:100%"></div>
        </div>
        <div id="fin-metrics"><p class="loading-cell">Loading financial metrics…</p></div>
    `;

    // Inject TradingView chart (only load the script once)
    function mountChart() {
        if (document.getElementById('tv-chart-container').querySelector('iframe')) return;
        /* global TradingView */
        new TradingView.widget({
            container_id: 'tv-chart-container',
            symbol: symbol,
            interval: 'D',
            timezone: 'Etc/UTC',
            theme: 'dark',
            style: '1',          // candlestick
            locale: 'en',
            width: '100%',
            height: 480,
            toolbar_bg: '#0a0a0a',
            hide_side_toolbar: false,
            allow_symbol_change: false,
            studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies'],
            show_popup_button: true,
            popup_width: '1000',
            popup_height: '650',
        });
    }

    if (window.TradingView) {
        mountChart();
    } else {
        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/tv.js';
        script.onload = mountChart;
        document.head.appendChild(script);
    }

    // Load financials from backend in parallel
    try {
        const res = await fetch(`/api/financials/${symbol}`);
        const d = await res.json();
        document.getElementById('fin-metrics').innerHTML = `
            <h4 style="font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#666;margin-bottom:16px">Key Financials</h4>
            <div class="fin-grid">
                <div class="fin-item"><span class="fin-label">Market Cap</span><span class="fin-value">${fmt(d.marketCap)}</span></div>
                <div class="fin-item"><span class="fin-label">Trailing P/E</span><span class="fin-value">${d.trailingPE?.toFixed(2) ?? 'N/A'}</span></div>
                <div class="fin-item"><span class="fin-label">Forward P/E</span><span class="fin-value">${d.forwardPE?.toFixed(2) ?? 'N/A'}</span></div>
                <div class="fin-item"><span class="fin-label">Div. Yield</span><span class="fin-value">${d.dividendYield?.toFixed(2) ?? '0'}%</span></div>
                <div class="fin-item"><span class="fin-label">EPS (TTM)</span><span class="fin-value">${d.eps?.toFixed(2) ?? 'N/A'}</span></div>
                <div class="fin-item"><span class="fin-label">Book Value</span><span class="fin-value">${d.bookValue?.toFixed(2) ?? 'N/A'}</span></div>
                <div class="fin-item"><span class="fin-label">Revenue</span><span class="fin-value">${fmt(d.revenue)}</span></div>
                <div class="fin-item"><span class="fin-label">Sector</span><span class="fin-value">${d.sector ?? 'N/A'}</span></div>
                <div class="fin-item"><span class="fin-label">Industry</span><span class="fin-value">${d.industry ?? 'N/A'}</span></div>
            </div>
            <p style="margin-top:16px;font-size:12px;color:#555;line-height:1.7">${d.summary ? d.summary.slice(0, 500) + '…' : ''}</p>
        `;
    } catch {
        document.getElementById('fin-metrics').innerHTML = '<p style="color:#666">Could not load financial metrics.</p>';
    }
}

async function showLists() {
    openModal('Switch Watchlist', '<p class="loading-cell">Loading…</p>');
    const res = await fetch('/api/lists');
    const lists = await res.json();
    modalContent.innerHTML = lists.map(name => `
        <div class="list-item" onclick="switchList('${name}')">
            <span>${name}</span>
            ${state.currentList === name ? '<span style="color:#007aff">●</span>' : ''}
        </div>
    `).join('') +
    `<div class="list-item" onclick="createNewList()" style="color:#007aff">+ Create New List</div>`;
}

function switchList(name) {
    state.currentList = name;
    state.isLoaded = false;
    closeModal();
    updateDashboard();
}

function createNewList() {
    const name = prompt('Enter new list name:');
    if (name) switchList(name.toLowerCase().replace(/[^a-z0-9]/g, '_'));
}

function fmt(n) {
    if (!n) return 'N/A';
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    return n.toLocaleString();
}

/* ---- Event Listeners ---- */
document.getElementById('modal-close').onclick = closeModal;
document.getElementById('btn-lists').onclick = showLists;
document.getElementById('btn-import').onclick = () => csvUpload.click();
document.getElementById('nav-add').onclick = e => { e.preventDefault(); searchInput.focus(); };

// Share Button logic
const btnShare = document.getElementById('btn-share');
if (btnShare) btnShare.onclick = shareApp;

// Refresh Button logic
const btnRefresh = document.getElementById('btn-refresh');
if (btnRefresh) btnRefresh.onclick = () => { state.isLoaded = false; updateDashboard(); };

document.addEventListener('DOMContentLoaded', () => {
    updateDashboard();
    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/static/sw.js').catch(() => {});
    }
});

csvUpload.onchange = async e => {
    if (!e.target.files.length) return;
    const body = new FormData();
    body.append('file', e.target.files[0]);
    body.append('list_name', state.currentList);
    const res = await fetch('/api/import-csv', { method: 'POST', body });
    const r = await res.json();
    alert(`Imported ${r.added} new tickers!`);
    state.isLoaded = false;
    updateDashboard();
};

searchInput.addEventListener('keypress', async e => {
    if (e.key !== 'Enter') return;
    const symbol = searchInput.value.toUpperCase().trim();
    if (!symbol) return;

    // Visual feedback
    searchInput.disabled = true;
    searchInput.placeholder = `Fetching ${symbol}…`;

    const data = await fetchStock(symbol);

    searchInput.disabled = false;
    searchInput.placeholder = 'Enter ticker or name...';
    searchInput.value = '';

    if (data) {
        // Add to SYMBOLS list if not already present
        if (!SYMBOLS.includes(data.symbol)) {
            SYMBOLS.unshift(data.symbol);
        }
        // Add/update in stocksData directly — no full reload needed
        const existing = stocksData.findIndex(s => s.symbol === data.symbol);
        if (existing === -1) {
            stocksData.unshift(data);
        } else {
            stocksData[existing] = data;
        }
        renderTable();
    } else {
        alert(`"${symbol}" not found. Please check the ticker and try again.`);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    updateDashboard();
    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/static/sw.js').catch(() => {});
    }
});
