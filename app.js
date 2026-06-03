// Global State
let allCoins = [];

const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbxYm7IeKUWEYqbrM6gok38yhK-n2Cy_sx5k_is3fDEU0J1elkgMOfBMHSqPpVVHvq3s/exec";

// DOM Elements
const grid = document.getElementById('coins-grid');
const loader = document.getElementById('loader');
const searchInput = document.getElementById('search-input');
const filterCountry = document.getElementById('filter-country');
const filterYear = document.getElementById('filter-year');
const sortBy = document.getElementById('sort-by');
const countryListDOM = document.getElementById('country-list');
const yearListDOM = document.getElementById('year-list');
const modal = document.getElementById('coin-modal');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

// Dashboard Elements
const tabCollection = document.getElementById('tab-collection');
const tabOwned = document.getElementById('tab-owned');
const tabDashboard = document.getElementById('tab-dashboard');
const tabHistory = document.getElementById('tab-history');
const appContent = document.getElementById('app-content');
const dashboardContent = document.getElementById('dashboard-content');
const historyContent = document.getElementById('history-content');
const headerControls = document.querySelector('.header-controls');

let currentTab = 'all';
let coinHistoryLogs = [];



// Rarity Helper
function calculateRarity(tiraturaStr) {
    if (!tiraturaStr || tiraturaStr === 'Sconosciuta' || tiraturaStr === 'N/D') return null;
    
    let num = 0;
    const str = String(tiraturaStr).toLowerCase().replace(/ /g, '');
    
    let cleanStr = str.replace(/[a-z]/g, '');
    cleanStr = cleanStr.replace(/\./g, '').replace(',', '.');
    
    num = parseFloat(cleanStr);
    if (str.includes('milioni')) {
        num = num * 1000000;
    }
    
    if (!num || isNaN(num)) return null;
    
    // Scale 1 to 5 based on actual CSV percentiles
    // Colors: Dark Green (Common) to Red (Rare)
    if (num <= 133500) return { score: 1, color: '#ef4444' }; // Red (Molto Rara)
    if (num <= 500000) return { score: 2, color: '#f97316' }; // Orange (Rara)
    if (num <= 1000000) return { score: 3, color: '#facc15' }; // Yellow (Non Comune)
    if (num <= 3019675) return { score: 4, color: '#84cc16' }; // Lime/Light Green (Comune)
    return { score: 5, color: '#15803d' }; // Dark Green (Molto Comune)
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    fetchCoins();
    setupEventListeners();
});

// Load data from static JS file (avoids fetch CORS issues on local file://)
async function fetchCoins() {
    try {
        allCoins = [...allCoinsData]; // array globally defined in data.js
        
        let savedQuantities = {};
        const localQuantities = JSON.parse(localStorage.getItem('coinQuantities') || '{}');
        
        // Try fetching from Google Sheets
        try {
            const response = await fetch(GOOGLE_SHEET_URL);
            const responseData = await response.json();
            
            if (responseData.quantities !== undefined) {
                // New backend format
                savedQuantities = responseData.quantities;
                coinHistoryLogs = responseData.history || [];
            } else {
                // Old backend format fallback
                savedQuantities = responseData;
            }
            
            // Auto-migrate local data to cloud if cloud is empty
            if (Object.keys(savedQuantities).length === 0 && Object.keys(localQuantities).length > 0) {
                console.log("Migrando i dati locali sul cloud...");
                savedQuantities = {};
                for (let localId in localQuantities) {
                    const coin = allCoins.find(c => c.id == localId);
                    if (coin) {
                        const sheetId = coin.id;
                        savedQuantities[sheetId] = localQuantities[localId];
                        fetch(GOOGLE_SHEET_URL, {
                            method: 'POST',
                            body: JSON.stringify({id: sheetId, qty: localQuantities[localId]})
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Nessuna connessione al cloud, uso salvataggio locale.', e);
            savedQuantities = localQuantities;
        }
        
        allCoins = allCoins.map(coin => {
            const sheetId = coin.id;
            
            if (savedQuantities[sheetId] !== undefined) {
                coin.quantita = savedQuantities[sheetId];
            } else if (localQuantities[coin.id] !== undefined) {
                coin.quantita = localQuantities[coin.id];
            }
            // Pre-calculate rarity score for sorting
            const r = calculateRarity(coin.tiratura);
            coin.rarityScore = r ? r.score : 6; // Assign 6 for Sconosciuta
            return coin;
        });
        
        // Populate datalists
        const uniqueCountries = [...new Set(allCoins.map(c => c.paese))].sort();
        const uniqueYears = [...new Set(allCoins.map(c => c.anno))].sort((a,b) => b - a);
        countryListDOM.innerHTML = uniqueCountries.map(c => `<option value="${c}">`).join('');
        yearListDOM.innerHTML = uniqueYears.map(y => `<option value="${y}">`).join('');
        
        // Hide loader and show grid
        loader.style.display = 'none';
        grid.style.display = 'grid';
        
        updateGlobalStats();
        renderCoins(allCoins);
        renderDashboard();
    } catch (error) {
        console.error("Errore durante il caricamento dati:", error);
        loader.innerHTML = `<p style="color: #ef4444;">Errore nel caricamento del file data.js.</p>`;
    }
}

// Render coins to grid
function renderCoins(coins) {
    if (coins.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">Nessuna moneta trovata.</p>';
        return;
    }

    grid.innerHTML = coins.map(coin => {
        try {
            // Fix image path
            let imgSrc = null;
            if (coin.percorso_immagine) {
                const pathStr = String(coin.percorso_immagine).replace(/\\/g, '/');
                imgSrc = pathStr.startsWith('http') ? pathStr : 'backend/' + pathStr;
            }
            const rarity = calculateRarity(coin.tiratura);
            const rarityHtml = rarity ? `
                <div class="rarity-badge" title="Rarità: ${rarity.score}/5 (Tiratura: ${coin.tiratura})">
                    <i data-lucide="star" fill="${rarity.color}" stroke="${rarity.color}"></i>
                    <span>${rarity.score}</span>
                </div>
            ` : '';
            
            let flagName = '';
            if (coin.paese) {
                if (coin.paese === 'VATICANO') flagName = 'Vaticano';
                else if (coin.paese === 'OLANDA') flagName = 'Paesi_Bassi';
                else if (coin.paese === 'SAN MARINO') flagName = 'San_Marino';
                else {
                    flagName = coin.paese.charAt(0).toUpperCase() + coin.paese.slice(1).toLowerCase();
                }
            }
            
            return `
                <div class="coin-card" id="coin-card-${coin.id}" onclick='openModal(${coin.id})'>
                    <div class="coin-image-wrapper">
                        <div class="qty-badge" id="qty-badge-${coin.id}" style="display: ${coin.quantita && coin.quantita > 0 ? 'flex' : 'none'}">${coin.quantita || 0}</div>
                        ${rarityHtml}
                        ${imgSrc 
                            ? `<img src="${imgSrc}" alt="${coin.tema}" loading="lazy">` 
                            : `<div class="coin-placeholder"><i data-lucide="image" style="width:40px;height:40px;margin-bottom:0.5rem"></i>Nessuna Immagine</div>`
                        }
                    </div>
                    <div class="coin-info">
                        <h4 class="coin-title">${coin.tema || 'Senza Titolo'}</h4>
                        <div class="coin-meta">
                            <span class="country" style="display:flex; align-items:center; gap:0.5rem;">
                                ${coin.paese}
                                ${flagName ? `<img src="bandiere_europee/${flagName}.png" alt="${coin.paese}" style="width: 22px; height: 15px; object-fit: cover; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);" onerror="this.style.display='none'">` : ''}
                            </span>
                            <span class="badge">${coin.anno}</span>
                        </div>
                    </div>
                </div>
            `;
        } catch (err) {
            console.error("Error rendering coin:", coin, err);
            return `<div style="color:red">Error coin ${coin.id}: ${err.message}</div>`;
        }
    }).join('');
    
    // Re-initialize lucide icons for new elements
    lucide.createIcons();
}

// Setup Event Listeners
function setupEventListeners() {
    searchInput.addEventListener('input', applyFilters);
    filterCountry.addEventListener('input', applyFilters);
    filterYear.addEventListener('input', applyFilters);
    sortBy.addEventListener('change', applyFilters);
    
    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if(e.target === modal) closeModal();
    });
    
    // Tab switching
    tabCollection.addEventListener('click', () => {
        currentTab = 'all';
        tabCollection.classList.add('active');
        if(tabOwned) tabOwned.classList.remove('active');
        tabDashboard.classList.remove('active');
        if(tabHistory) tabHistory.classList.remove('active');
        appContent.style.display = 'block';
        dashboardContent.style.display = 'none';
        if(historyContent) historyContent.style.display = 'none';
        headerControls.style.display = 'flex';
        applyFilters();
    });

    if (tabOwned) {
        tabOwned.addEventListener('click', () => {
            currentTab = 'owned';
            tabOwned.classList.add('active');
            tabCollection.classList.remove('active');
            tabDashboard.classList.remove('active');
            if(tabHistory) tabHistory.classList.remove('active');
            appContent.style.display = 'block';
            dashboardContent.style.display = 'none';
            if(historyContent) historyContent.style.display = 'none';
            headerControls.style.display = 'flex';
            applyFilters();
        });
    }
    
    tabDashboard.addEventListener('click', () => {
        tabDashboard.classList.add('active');
        tabCollection.classList.remove('active');
        if(tabOwned) tabOwned.classList.remove('active');
        if(tabHistory) tabHistory.classList.remove('active');
        appContent.style.display = 'none';
        dashboardContent.style.display = 'block';
        if(historyContent) historyContent.style.display = 'none';
        headerControls.style.display = 'none'; // Nascondo i filtri
        renderDashboard(); 
    });

    if (tabHistory) {
        tabHistory.addEventListener('click', () => {
            tabHistory.classList.add('active');
            tabDashboard.classList.remove('active');
            tabCollection.classList.remove('active');
            if(tabOwned) tabOwned.classList.remove('active');
            appContent.style.display = 'none';
            dashboardContent.style.display = 'none';
            historyContent.style.display = 'block';
            headerControls.style.display = 'none'; // Nascondo i filtri
            renderHistory();
        });
    }
    
}

// Filter and Sort Logic
function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase();
    const fCountry = filterCountry.value.toLowerCase();
    const fYear = filterYear.value.toLowerCase();
    const sortVal = sortBy.value;
    
    let filtered = allCoins.filter(coin => {
        const matchSearch = (coin.tema && coin.tema.toLowerCase().includes(searchTerm)) || 
                            (coin.paese && coin.paese.toLowerCase().includes(searchTerm)) || 
                            (coin.anno && coin.anno.toString().includes(searchTerm));
        
        const matchCountry = !fCountry || (coin.paese && coin.paese.toLowerCase().includes(fCountry));
        const matchYear = !fYear || (coin.anno && coin.anno.toString().includes(fYear));
        const matchTab = currentTab === 'all' || (currentTab === 'owned' && coin.quantita && coin.quantita > 0);
        
        return matchSearch && matchCountry && matchYear && matchTab;
    });
    
    // Sort logic
    if (sortVal === 'year-desc') {
        filtered.sort((a, b) => b.anno - a.anno);
    } else if (sortVal === 'year-asc') {
        filtered.sort((a, b) => a.anno - b.anno);
    } else if (sortVal === 'country-az') {
        filtered.sort((a, b) => a.paese.localeCompare(b.paese));
    } else if (sortVal === 'country-za') {
        filtered.sort((a, b) => b.paese.localeCompare(a.paese));
    } else if (sortVal === 'rarity-asc') {
        filtered.sort((a, b) => a.rarityScore - b.rarityScore);
    } else if (sortVal === 'rarity-desc') {
        filtered.sort((a, b) => b.rarityScore - a.rarityScore);
    } else if (sortVal === 'qty-desc') {
        filtered.sort((a, b) => (b.quantita || 0) - (a.quantita || 0));
    } else if (sortVal === 'qty-asc') {
        filtered.sort((a, b) => (a.quantita || 0) - (b.quantita || 0));
    }
    
    renderCoins(filtered);
}

let activeCoinId = null;
let pendingQuantity = null;

// Modal Logic
window.openModal = function(coinId) {
    const coin = allCoins.find(c => c.id === coinId);
    if (!coin) return;
    activeCoinId = coin.id;
    pendingQuantity = coin.quantita || 0;
    
    let imgSrc = null;
    if (coin.percorso_immagine) {
        const pathStr = String(coin.percorso_immagine).replace(/\\/g, '/');
        imgSrc = pathStr.startsWith('http') ? pathStr : 'backend/' + pathStr;
    }
    
    let flagName = '';
    if (coin.paese) {
        if (coin.paese === 'VATICANO') flagName = 'Vaticano';
        else if (coin.paese === 'OLANDA') flagName = 'Paesi_Bassi';
        else if (coin.paese === 'SAN MARINO') flagName = 'San_Marino';
        else {
            flagName = coin.paese.charAt(0).toUpperCase() + coin.paese.slice(1).toLowerCase();
        }
    }
    
    const rarity = calculateRarity(coin.tiratura);
    const rarityHtml = rarity ? `
        <div class="detail-item">
            <span class="detail-label">Rarità</span>
            <span class="detail-value" style="display:flex;align-items:center;gap:0.4rem">
                <div style="position:relative; width:24px; height:24px; display:flex; align-items:center; justify-content:center;">
                    <i data-lucide="star" fill="${rarity.color}" stroke="${rarity.color}" style="position:absolute; width:100%; height:100%; z-index:1;"></i>
                    <span style="position:relative; z-index:2; font-weight:bold; font-size:0.8rem; color:#083344">${rarity.score}</span>
                </div>
                ${rarity.score} / 5
            </span>
        </div>
    ` : '';
    
    modalBody.innerHTML = `
        <h2 style="grid-column: 1 / -1; font-size: 2.2rem; font-weight: 800; margin-bottom: 0.5rem; line-height: 1.2; text-align: center;">${coin.tema || 'Moneta Commemorativa'}</h2>
        
        <div class="modal-image">
            ${imgSrc 
                ? `<img src="${imgSrc}" alt="${coin.tema}">` 
                : `<div class="coin-placeholder" style="color:var(--text-main);opacity:1"><i data-lucide="image" style="width:64px;height:64px;margin-bottom:1rem"></i>Nessuna Immagine</div>`
            }
        </div>
        
        <div class="modal-details">
            <div class="quantity-controls" style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.8rem; background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 12px; flex-wrap: nowrap;">
                <span style="font-weight: 600; font-size: 1.1rem; margin-right: 0.5rem;">Possedute:</span>
                <button onclick="changePendingQuantity(-1)" style="width: 36px; height: 36px; border-radius: 50%; border: none; background: var(--glass-border); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;"><i data-lucide="minus" style="width:18px"></i></button>
                <span id="modal-qty" style="font-size: 1.5rem; font-weight: 800; min-width: 30px; text-align: center;">${pendingQuantity}</span>
                <button onclick="changePendingQuantity(1)" style="width: 36px; height: 36px; border-radius: 50%; border: none; background: var(--accent-main); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0;"><i data-lucide="plus" style="width:18px"></i></button>
                
                <button id="modal-save-btn" onclick="savePendingQuantity()" disabled style="margin-left: auto; padding: 0.6rem 1rem; border-radius: 8px; border: 1px solid rgba(14, 165, 233, 0.3); font-weight: 600; font-family: 'Inter', sans-serif; transition: all 0.3s; display: flex; align-items: center; gap: 0.5rem; background: rgba(14, 165, 233, 0.1); color: rgba(14, 165, 233, 0.8); cursor: not-allowed; box-shadow: none; white-space: nowrap;">
                    <i data-lucide="save" style="width: 16px;"></i> Salva
                </button>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2.5rem; align-items: start;">
                <!-- Colonna Sinistra -->
                <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <div class="detail-item">
                        <span class="detail-label">Paese</span>
                        <span class="detail-value" style="display:flex;align-items:center;gap:0.5rem">
                            ${coin.paese}
                            ${flagName ? `<img src="bandiere_europee/${flagName}.png" alt="${coin.paese}" style="width: 24px; height: 16px; object-fit: cover; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);" onerror="this.style.display='none'">` : ''}
                        </span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Data Emissione</span>
                        <span class="detail-value"><i data-lucide="calendar" style="width:16px;vertical-align:middle"></i> ${coin.data_emissione || 'Sconosciuta'}</span>
                    </div>
                    ${rarityHtml}
                </div>
                
                <!-- Colonna Destra -->
                <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                    <div class="detail-item">
                        <span class="detail-label">Anno</span>
                        <span class="detail-value badge" style="width:fit-content">${coin.anno}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Tiratura</span>
                        <span class="detail-value" style="display:flex;align-items:center;gap:0.4rem"><i data-lucide="activity" style="width:18px"></i> ${coin.tiratura || 'Sconosciuta'}</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="detail-item" style="grid-column: 1 / -1; margin-top: 0.5rem; border-top: 1px solid var(--glass-border); padding-top: 1rem;">
            <span class="detail-label" style="display: block; text-align: center; font-size: 1rem; font-weight: 800; letter-spacing: 1px; color: var(--accent-main);">Descrizione</span>
            <div class="desc-box" style="margin-top: 0.8rem; text-align: justify; line-height: 1.6; font-size: 0.95rem;">
                ${coin.descrizione || 'Nessuna descrizione disponibile per questa moneta.'}
            </div>
        </div>
    `;
    
    lucide.createIcons();
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

function closeModal() {
    if (activeCoinId !== null) {
        const coin = allCoins.find(c => c.id === activeCoinId);
        if (coin && pendingQuantity !== (coin.quantita || 0)) {
            // Unsaved changes, show custom confirm modal
            document.getElementById('confirm-modal').classList.remove('hidden');
            return;
        }
    }
    forceCloseModal();
}

window.forceCloseModal = function() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    activeCoinId = null;
    pendingQuantity = null;
    applyFilters();
}

window.discardChanges = function() {
    document.getElementById('confirm-modal').classList.add('hidden');
    forceCloseModal();
}

window.saveAndClose = function() {
    document.getElementById('confirm-modal').classList.add('hidden');
    savePendingQuantity();
    forceCloseModal();
}

window.changePendingQuantity = function(delta) {
    if (pendingQuantity + delta < 0) return;
    pendingQuantity += delta;
    document.getElementById('modal-qty').innerText = pendingQuantity;
    
    const coin = allCoins.find(c => c.id === activeCoinId);
    const originalQty = coin ? (coin.quantita || 0) : 0;
    
    const saveBtn = document.getElementById('modal-save-btn');
    if (saveBtn) {
        if (pendingQuantity !== originalQty) {
            saveBtn.disabled = false;
            saveBtn.style.background = 'white';
            saveBtn.style.color = '#0f172a';
            saveBtn.style.border = '1px solid white';
            saveBtn.style.cursor = 'pointer';
            saveBtn.style.boxShadow = '0 4px 15px rgba(255, 255, 255, 0.4)';
        } else {
            saveBtn.disabled = true;
            saveBtn.style.background = 'rgba(14, 165, 233, 0.1)';
            saveBtn.style.color = 'rgba(14, 165, 233, 0.8)';
            saveBtn.style.border = '1px solid rgba(14, 165, 233, 0.3)';
            saveBtn.style.cursor = 'not-allowed';
            saveBtn.style.boxShadow = 'none';
        }
    }
}

window.savePendingQuantity = function() {
    if (!activeCoinId) return;
    const coin = allCoins.find(c => c.id === activeCoinId);
    if (!coin) return;
    
    const originalQuantity = (coin.quantita || 0);
    if (pendingQuantity === originalQuantity) return;
    
    const coinId = activeCoinId;
    const newQuantity = pendingQuantity;
    const delta = newQuantity - originalQuantity;
    
    coin.quantita = newQuantity;
    
    // Add to History locally for immediate feedback
    const now = new Date();
    const historyRecord = {
        date: now.toLocaleDateString('it-IT'),
        time: now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        delta: delta,
        paese: coin.paese,
        anno: coin.anno,
        tema: coin.tema
    };
    coinHistoryLogs.unshift(historyRecord); // Add to beginning
    
    // Save to localStorage (only for quantities fallback)
    const localQuantities = JSON.parse(localStorage.getItem('coinQuantities') || '{}');
    localQuantities[coinId] = newQuantity;
    localStorage.setItem('coinQuantities', JSON.stringify(localQuantities));
    
    // Push to Google Sheets (Async)
    const sheetId = coin.id;
    fetch(GOOGLE_SHEET_URL, {
        method: 'POST',
        body: JSON.stringify({
            id: sheetId, 
            qty: newQuantity,
            delta: historyRecord.delta,
            date: historyRecord.date,
            time: historyRecord.time,
            paese: historyRecord.paese,
            anno: historyRecord.anno,
            tema: historyRecord.tema
        })
    }).catch(err => console.error("Sync failed:", err));
    
    // Update grid view badge directly
    const badge = document.getElementById(`qty-badge-${coinId}`);
    if (badge) {
        badge.innerText = newQuantity;
        badge.style.display = newQuantity > 0 ? 'flex' : 'none';
    }
    
    updateGlobalStats();
    if (document.getElementById('tab-dashboard').classList.contains('active')) {
        renderDashboard();
    }
    
    // Reset save button state to indicate success
    const saveBtn = document.getElementById('modal-save-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.style.background = 'rgba(14, 165, 233, 0.1)';
        saveBtn.style.color = 'rgba(14, 165, 233, 0.8)';
        saveBtn.style.border = '1px solid rgba(14, 165, 233, 0.3)';
        saveBtn.style.cursor = 'not-allowed';
        saveBtn.style.boxShadow = 'none';
        saveBtn.innerHTML = '<i data-lucide="check" style="width: 16px;"></i> Salvato';
        lucide.createIcons();
        
        setTimeout(() => {
            if (saveBtn && saveBtn.disabled) {
                saveBtn.innerHTML = '<i data-lucide="save" style="width: 16px;"></i> Salva';
                lucide.createIcons();
            }
        }, 2000);
    }
}

function updateGlobalStats() {
    let uniqueOwned = 0;
    allCoins.forEach(coin => {
        if (coin.quantita && coin.quantita > 0) {
            uniqueOwned++;
        }
    });
    const headerOwned = document.getElementById('header-owned');
    const headerTotal = document.getElementById('header-total');
    const headerPercent = document.getElementById('header-percent');
    
    if (headerOwned) headerOwned.innerText = uniqueOwned;
    if (headerTotal) headerTotal.innerText = allCoins.length;
    if (headerPercent) {
        const pct = allCoins.length > 0 ? (uniqueOwned / allCoins.length) * 100 : 0;
        headerPercent.innerText = pct.toFixed(1);
    }
}

// Dashboard Render Logic
function renderDashboard() {
    let totalUniqueOwned = 0;
    let totalCoinsPhysical = 0;
    let countryCount = {};
    let yearCount = {};
    
    allCoins.forEach(coin => {
        const qty = coin.quantita || 0;
        if (qty > 0) {
            totalUniqueOwned++;
            totalCoinsPhysical += qty;
            
            countryCount[coin.paese] = (countryCount[coin.paese] || 0) + qty;
            yearCount[coin.anno] = (yearCount[coin.anno] || 0) + qty;
        }
    });
    
    const percentage = allCoins.length > 0 ? ((totalUniqueOwned / allCoins.length) * 100).toFixed(1) : 0;
    const doppioni = totalCoinsPhysical - totalUniqueOwned;
    
    // Sort top countries
    const topCountries = Object.entries(countryCount).sort((a,b) => b[1] - a[1]).slice(0, 5);
    // Sort top years
    const topYears = Object.entries(yearCount).sort((a,b) => b[1] - a[1]).slice(0, 5);
    
    dashboardContent.innerHTML = `
        <div class="dashboard-grid">
            <div class="stat-card">
                <div class="stat-title"><i data-lucide="target" style="width:16px"></i> Completamento</div>
                <div class="stat-value">${totalUniqueOwned} <span style="font-size: 1.2rem; color: var(--text-muted)">/ ${allCoins.length}</span></div>
                <div class="stat-sub">Possiedi il <strong>${percentage}%</strong> dell'intera collezione.</div>
            </div>
            
            <div class="stat-card">
                <div class="stat-title"><i data-lucide="award" style="width:16px"></i> Monete Uniche</div>
                <div class="stat-value">${totalUniqueOwned}</div>
                <div class="stat-sub">Tipi di monete diverse.</div>
            </div>

            <div class="stat-card">
                <div class="stat-title"><i data-lucide="copy" style="width:16px"></i> Doppioni</div>
                <div class="stat-value">${doppioni}</div>
                <div class="stat-sub">Monete da scambiare.</div>
            </div>

            <div class="stat-card">
                <div class="stat-title"><i data-lucide="layers" style="width:16px"></i> Pezzi Totali</div>
                <div class="stat-value">${totalCoinsPhysical}</div>
                <div class="stat-sub">La somma fisica totale.</div>
            </div>
        </div>
        
        <div style="margin-bottom: 2rem;">
            <div class="stat-title" style="margin-bottom: 1rem;"><i data-lucide="grid" style="width:16px"></i> Matrice Collezione (Possedute / Emesse)</div>
            <div class="matrix-container glass-panel" style="overflow-x: auto; border-radius: 16px;">
                <table style="width: 100%; border-collapse: collapse; min-width: 800px; text-align: center; font-size: 0.9rem;">
                    <thead>
                        <tr>
                            <th style="position: sticky; left: 0; background: var(--bg-color); z-index: 10; border-bottom: 1px solid var(--glass-border); border-right: 1px solid var(--glass-border); padding: 1rem; text-align: left; min-width: 160px; box-shadow: 2px 0 5px rgba(0,0,0,0.2);">Paese</th>
                            <th style="border-bottom: 1px solid var(--glass-border); padding: 1rem; color: var(--text-muted); font-weight: 600; min-width: 80px; border-right: 1px solid rgba(255,255,255,0.05);">Emesse</th>
                            ${(() => {
                                const sortedYears = [...new Set(allCoins.map(c => c.anno))].sort((a,b) => a - b);
                                return sortedYears.map(y => `<th style="border-bottom: 1px solid var(--glass-border); padding: 1rem; color: var(--accent-color);">${y}</th>`).join('');
                            })()}
                            <th style="border-bottom: 1px solid var(--glass-border); padding: 1rem; color: #3b82f6; font-weight: 800; min-width: 100px; border-left: 1px solid rgba(255,255,255,0.05);">Possedute</th>
                            <th style="border-bottom: 1px solid var(--glass-border); padding: 1rem; color: #3b82f6; font-weight: 800; min-width: 80px;">Frazione</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${[...new Set(allCoins.map(c => c.paese))].sort().map(country => {
                            const countryCoins = allCoins.filter(c => c.paese === country);
                            const countryTotalIssued = countryCoins.length;
                            const countryTotalOwned = countryCoins.filter(c => c.quantita && c.quantita > 0).length;
                            
                            let flagName = '';
                            if (country === 'VATICANO') flagName = 'Vaticano';
                            else if (country === 'OLANDA') flagName = 'Paesi_Bassi';
                            else if (country === 'SAN MARINO') flagName = 'San_Marino';
                            else flagName = country.charAt(0).toUpperCase() + country.slice(1).toLowerCase();

                            let trHtml = `
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                    <td style="position: sticky; left: 0; background: var(--bg-color); z-index: 10; border-right: 1px solid var(--glass-border); padding: 0.8rem 1rem; text-align: left; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; box-shadow: 2px 0 5px rgba(0,0,0,0.2);">
                                        ${flagName ? `<img src="bandiere_europee/${flagName}.png" alt="${country}" style="width: 22px; height: 15px; object-fit: cover; border-radius: 2px;">` : ''}
                                        ${country}
                                    </td>
                                    <td style="padding: 0.8rem; font-weight: 800; color: var(--text-muted); border-right: 1px solid rgba(255,255,255,0.05);">${countryTotalIssued}</td>
                            `;

                            [...new Set(allCoins.map(c => c.anno))].sort((a,b) => a - b).forEach(year => {
                                const yearCoins = countryCoins.filter(c => c.anno === year);
                                const issuedCount = yearCoins.length;
                                const ownedCount = yearCoins.filter(c => c.quantita && c.quantita > 0).length;
                                
                                let bgStyle = '';
                                let textValue = '';
                                
                                if (issuedCount > 0) {
                                    textValue = ownedCount;
                                    if (ownedCount === 0) bgStyle = 'background: rgba(239, 68, 68, 0.2); color: #fca5a5;'; // Red
                                    else if (ownedCount < issuedCount) bgStyle = 'background: rgba(245, 158, 11, 0.25); color: #fcd34d;'; // Orange
                                    else bgStyle = 'background: rgba(34, 197, 94, 0.25); color: #86efac; font-weight: bold;'; // Green
                                }
                                
                                trHtml += `<td style="${bgStyle} padding: 0.8rem; border-left: 1px solid rgba(255,255,255,0.02); border-right: 1px solid rgba(255,255,255,0.02);">${textValue}</td>`;
                            });

                            trHtml += `
                                    <td style="padding: 0.8rem; font-weight: 800; color: #93c5fd; background: rgba(59, 130, 246, 0.05); border-left: 1px solid rgba(255,255,255,0.05);">${countryTotalOwned}</td>
                                    <td style="padding: 0.8rem; font-weight: 600; color: var(--text-main); background: rgba(59, 130, 246, 0.05);">${countryTotalOwned} / ${countryTotalIssued}</td>
                                </tr>
                            `;
                            return trHtml;
                        }).join('')}
                        ${(() => {
                            const sortedYears = [...new Set(allCoins.map(c => c.anno))].sort((a,b) => a - b);
                            const totalIssuedGlobal = allCoins.length;
                            const totalOwnedGlobal = allCoins.filter(c => c.quantita && c.quantita > 0).length;
                            
                            let totalsRow = `
                                <tr style="border-top: 2px solid var(--glass-border); background: rgba(0,0,0,0.2);">
                                    <td style="position: sticky; left: 0; background: var(--bg-color); z-index: 10; border-right: 1px solid var(--glass-border); padding: 1rem; text-align: left; font-weight: 800; color: var(--text-main); box-shadow: 2px 0 5px rgba(0,0,0,0.2);">
                                        Totale Emesse
                                    </td>
                                    <td style="padding: 1rem; font-weight: 800; color: var(--text-muted); border-right: 1px solid rgba(255,255,255,0.05);">${totalIssuedGlobal}</td>
                            `;
                            
                            let fractionRow = `
                                <tr style="background: rgba(0,0,0,0.2);">
                                    <td style="position: sticky; left: 0; background: var(--bg-color); z-index: 10; border-right: 1px solid var(--glass-border); padding: 1rem; text-align: left; font-weight: 800; color: var(--accent-main); box-shadow: 2px 0 5px rgba(0,0,0,0.2);">
                                        Completamento
                                    </td>
                                    <td style="padding: 1rem; font-weight: 800; color: var(--text-muted); border-right: 1px solid rgba(255,255,255,0.05);"></td>
                            `;

                            sortedYears.forEach(year => {
                                const yearCoins = allCoins.filter(c => c.anno === year);
                                const issued = yearCoins.length;
                                const owned = yearCoins.filter(c => c.quantita && c.quantita > 0).length;
                                
                                totalsRow += `<td style="padding: 1rem; font-weight: bold; color: var(--text-muted);">${issued}</td>`;
                                fractionRow += `<td style="padding: 1rem; font-weight: bold; color: var(--text-main); font-size: 0.85rem; white-space: nowrap;">${owned} / ${issued}</td>`;
                            });

                            totalsRow += `
                                    <td style="padding: 1rem; border-left: 1px solid rgba(255,255,255,0.05);"></td>
                                    <td style="padding: 1rem;"></td>
                                </tr>
                            `;

                            fractionRow += `
                                    <td style="padding: 1rem; font-weight: 800; color: #93c5fd; background: rgba(59, 130, 246, 0.05); border-left: 1px solid rgba(255,255,255,0.05);">${totalOwnedGlobal}</td>
                                    <td style="padding: 1rem; font-weight: 800; color: var(--text-main); background: rgba(59, 130, 246, 0.05); white-space: nowrap;">${totalOwnedGlobal} / ${totalIssuedGlobal}</td>
                                </tr>
                            `;

                            return totalsRow + fractionRow;
                        })()}
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="dashboard-grid">
            <div class="stat-card">
                <div class="stat-title"><i data-lucide="map" style="width:16px"></i> Top Paesi Posseduti</div>
                <div class="stat-list">
                    ${topCountries.length === 0 ? '<div class="stat-sub">Nessuna moneta posseduta.</div>' : ''}
                    ${topCountries.map(c => {
                        let flagName = '';
                        if (c[0]) {
                            if (c[0] === 'VATICANO') flagName = 'Vaticano';
                            else if (c[0] === 'OLANDA') flagName = 'Paesi_Bassi';
                            else if (c[0] === 'SAN MARINO') flagName = 'San_Marino';
                            else {
                                flagName = c[0].charAt(0).toUpperCase() + c[0].slice(1).toLowerCase();
                            }
                        }
                        
                        return `
                        <div class="stat-list-item">
                            <span style="display:flex; align-items:center; gap:0.5rem;">
                                ${c[0]}
                                ${flagName ? `<img src="bandiere_europee/${flagName}.png" alt="${c[0]}" style="width: 22px; height: 15px; object-fit: cover; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);" onerror="this.style.display='none'">` : ''}
                            </span>
                            <span class="badge">${c[1]} pz</span>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-title"><i data-lucide="calendar" style="width:16px"></i> Top Anni Posseduti</div>
                <div class="stat-list">
                    ${topYears.length === 0 ? '<div class="stat-sub">Nessuna moneta posseduta.</div>' : ''}
                    ${topYears.map(y => `
                        <div class="stat-list-item">
                            <span>${y[0]}</span>
                            <span class="badge">${y[1]} pz</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    lucide.createIcons();
}

// Export CSV Logic
document.getElementById('export-csv-btn')?.addEventListener('click', () => {
    // Filter owned coins
    const ownedCoins = allCoins.filter(c => c.quantita && c.quantita > 0);
    
    if (ownedCoins.length === 0) {
        alert("Non hai ancora inserito monete nella tua collezione!");
        return;
    }
    
    // Create CSV content
    const headers = ["ID", "Anno", "Paese", "Titolo", "Tiratura", "Quantita_Posseduta"];
    const csvRows = [headers.join(',')];
    
    ownedCoins.forEach(coin => {
        const id = coin.id || '';
        const anno = coin.anno || '';
        const paese = `"${String(coin.paese || '').replace(/"/g, '""')}"`;
        const titolo = `"${String(coin.tema || '').replace(/"/g, '""')}"`;
        const tiratura = `"${String(coin.tiratura || '').replace(/"/g, '""')}"`;
        const qty = coin.quantita || 0;
        
        csvRows.push(`${id},${anno},${paese},${titolo},${tiratura},${qty}`);
    });
    
    const csvString = csvRows.join('\n');
    const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' }); // Added BOM for Excel UTF-8 compat
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    link.setAttribute("download", `Le_Mie_Monete_${dateStr}_${timeStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// Render History
function renderHistory() {
    if (!historyContent) return;
    
    if (coinHistoryLogs.length === 0) {
        historyContent.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 4rem 1rem; background: var(--glass-bg); border-radius: 16px; border: 1px solid var(--glass-border);">
                <i data-lucide="clock" style="width: 48px; height: 48px; margin-bottom: 1rem; opacity: 0.5;"></i>
                <h3 style="font-family: 'Outfit'; font-size: 1.5rem; color: var(--text-main); margin-bottom: 0.5rem;">Nessuna Modifica</h3>
                <p>La cronologia delle modifiche apparirà qui.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    let html = `
        <div class="stat-title" style="margin-bottom: 1.5rem;"><i data-lucide="history" style="width:16px"></i> Registro Operazioni</div>
        <div style="display: flex; flex-direction: column; gap: 1rem;">
    `;
    
    coinHistoryLogs.forEach(log => {
        const isAdd = log.delta > 0;
        const color = isAdd ? '#22c55e' : '#ef4444'; // Green or Red
        const sign = isAdd ? '+' : ''; // Negative already has '-'
        const icon = isAdd ? 'arrow-up-right' : 'arrow-down-right';
        
        let flagName = '';
        if (log.paese === 'VATICANO') flagName = 'Vaticano';
        else if (log.paese === 'OLANDA') flagName = 'Paesi_Bassi';
        else if (log.paese === 'SAN MARINO') flagName = 'San_Marino';
        else flagName = log.paese.charAt(0).toUpperCase() + log.paese.slice(1).toLowerCase();
        
        // Format date to DD/MM/YYYY if it's a valid date string
        let displayDate = log.date;
        try {
            // Check if it's a long Date string from Google Sheets
            if (displayDate.length > 15) {
                const d = new Date(displayDate);
                if (!isNaN(d.getTime())) {
                    displayDate = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
                }
            }
        } catch(e) {}
        
        html += `
            <div class="glass-panel" style="display: flex; align-items: center; justify-content: space-between; padding: 1.2rem; border-radius: 12px; border-left: 4px solid ${color};">
                <div style="display: flex; flex-direction: column; gap: 0.3rem;">
                    <div style="display: flex; align-items: center; gap: 0.8rem;">
                        ${log.idOperazione ? `
                        <span style="color: var(--accent-color); font-size: 0.85rem; font-weight: 800; background: rgba(6, 182, 212, 0.1); padding: 0.1rem 0.5rem; border-radius: 4px;">
                            #${log.idOperazione}
                        </span>` : `
                        <span style="color: #f59e0b; font-size: 0.85rem; font-weight: 800; background: rgba(245, 158, 11, 0.1); padding: 0.1rem 0.5rem; border-radius: 4px;">
                            <i data-lucide="cloud-upload" style="width:12px; margin-right:2px"></i>Inviata
                        </span>`}
                        <span style="color: var(--text-muted); font-size: 0.85rem; font-weight: 600;">
                            <i data-lucide="calendar" style="width:12px; margin-right: 2px;"></i> ${displayDate}
                        </span>
                        <span style="color: var(--text-muted); font-size: 0.85rem; font-weight: 600;">
                            <i data-lucide="clock" style="width:12px; margin-right: 2px;"></i> ${log.time}
                        </span>
                    </div>
                    <div style="font-weight: 600; font-size: 1rem; color: var(--text-main); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                        ${flagName ? `<img src="bandiere_europee/${flagName}.png" alt="${log.paese}" style="width: 20px; height: 14px; object-fit: cover; border-radius: 2px; box-shadow: 0 1px 2px rgba(0,0,0,0.5);">` : ''}
                        <strong style="font-weight: 800;">${log.paese} (${log.anno})</strong> - <span style="color: var(--text-muted);">${log.tema}</span>
                    </div>
                </div>
                
                <div style="display: flex; align-items: center; justify-content: center; background: ${color}20; color: ${color}; border: 1px solid ${color}40; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 800; font-size: 1.2rem; min-width: 80px;">
                    <i data-lucide="${icon}" style="width:18px; margin-right: 4px;"></i> ${sign}${log.delta}
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    historyContent.innerHTML = html;
    lucide.createIcons();
}
