// ==========================================
// 1. INITIALIZE INDEXEDDB (UPGRADED TO V2)
// ==========================================
const request = indexedDB.open("RupeeTrackerDB", 2);

request.onupgradeneeded = (e) => { 
    db = e.target.result; 
    
    // Core Transactions Store
    if(!db.objectStoreNames.contains("transactions")) { 
        db.createObjectStore("transactions", { keyPath: "id", autoIncrement: true }); 
    }
    
    // New Smart Obligations Store (EMIs & Subscriptions)
    if(!db.objectStoreNames.contains("obligations")) {
        const obStore = db.createObjectStore("obligations", { keyPath: "id", autoIncrement: true });
        obStore.createIndex('billingDate', 'billingDate', { unique: false });
    }
};

request.onsuccess = (e) => { 
    db = e.target.result; 
    
    // Safely trigger initialization functions from app.js and security.js
    if (typeof initSelectorCachePointers === 'function') initSelectorCachePointers(); 
    if (typeof initializeCategoriesStorageSystem === 'function') initializeCategoriesStorageSystem(); 
    if (typeof initSecurityEngine === 'function') initSecurityEngine(); 
    if (typeof fetchAndDisplay === 'function') fetchAndDisplay(); 
};

request.onerror = (e) => {
    console.error("IndexedDB initialization failed:", e);
};

// ==========================================
// 2. DATA PORTABILITY (CSV IMPORT / EXPORT)
// ==========================================
function parseCSVLine(text) {
    let result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (char === '"') {
            if (inQuotes && text[i+1] === '"') {
                current += '"';
                i++; 
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function exportToCSV() {
  if (allTransactions.length === 0) { 
      if (typeof triggerNativeAppAlert === 'function') {
          triggerNativeAppAlert("No data available to export."); 
      } else {
          alert("No data available to export.");
      }
      return; 
  }
  
  let csvContent = "data:text/csv;charset=utf-8,ID,Description,Amount,Category,Date\n";
  allTransactions.forEach(t => {
    let safeText = t.text ? t.text.replace(/"/g, '""') : 'Untitled';
    let safeCat = t.category ? t.category.replace(/"/g, '""') : 'Uncategorized';
    csvContent += `${t.id},"${safeText}",${t.amount},"${safeCat}",${t.dateString}\n`;
  });
  
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  const exportDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  link.setAttribute("download", `FinWise_Backup_${exportDateStr}.csv`);
  document.body.appendChild(link); 
  link.click(); 
  document.body.removeChild(link);
  
  if (typeof triggerSuccessNotification === 'function') {
      triggerSuccessNotification("Export complete!");
  }
}

function importFromCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const fileName = file.name;
  const reader = new FileReader();
  
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.split("\n").slice(1);
    const tx = db.transaction("transactions", "readwrite");
    const store = tx.objectStore("transactions");
    
    const importBatchId = 'batch_' + Date.now(); 
    let importedCount = 0;
    
    lines.forEach(line => {
      if (!line.trim()) return;
      
      const parts = parseCSVLine(line.trim());
      
      if (parts && parts.length >= 5) {
        let cleanText = parts[1] ? parts[1].trim() : 'Imported Entry';
        let cleanCat = parts[3] ? parts[3].trim() : 'Other';
        let amt = parseFloat(parts[2]);
        let dateStr = parts[4] ? parts[4].trim() : ''; 
        
        if(!isNaN(amt) && dateStr) {
           const parsedDate = new Date(dateStr);
           store.add({
             text: cleanText || 'Imported Entry', 
             amount: amt, 
             category: cleanCat || 'Other',
             date: parsedDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
             timestamp: parsedDate.getTime(), 
             dateString: dateStr,
             batchId: importBatchId 
           });
           importedCount++;
        }
      }
    });
    
    tx.oncomplete = () => {
      let history = JSON.parse(localStorage.getItem('finwise-import-history') || '[]');
      const istLogTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
      history.push({ id: importBatchId, date: istLogTime, count: importedCount, fileName: fileName });
      localStorage.setItem('finwise-import-history', JSON.stringify(history));
      
      if (typeof fetchAndDisplay === 'function') fetchAndDisplay();
      if (typeof refreshImportHistoryUI === 'function') refreshImportHistoryUI();
      if (typeof triggerSuccessNotification === 'function') triggerSuccessNotification(`Imported ${importedCount} entries from ${fileName}!`);
      if (typeof closeModal === 'function') closeModal('preferences-modal');
    };
  };
  reader.readAsText(file);
  event.target.value = ''; 
}

// ==========================================
// 3. IMPORT HISTORY MANAGEMENT
// ==========================================
function refreshImportHistoryUI() {
  const list = document.getElementById('import-history-list');
  if (!list) return;
  
  let historyRaw = JSON.parse(localStorage.getItem('finwise-import-history') || '[]');
  
  if (historyRaw.length === 0) {
    list.innerHTML = `<p style="font-size:0.8rem; color:var(--text-muted); text-align:center; margin: 0;">No import history found.</p>`;
    return;
  }

  let nameCounts = {};
  let processedHistory = historyRaw.map(b => {
      let fName = b.fileName || "Unknown File";
      nameCounts[fName] = (nameCounts[fName] || 0) + 1;
      return { ...b, isDuplicate: nameCounts[fName] > 1, fName: fName };
  }).reverse(); 

  list.innerHTML = processedHistory.map(batch => `
    <label style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding:8px; border-bottom:1px solid var(--border); cursor:pointer;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <input type="checkbox" class="import-batch-checkbox" value="${batch.id}" style="width: 18px; height: 18px; margin: 0; accent-color: var(--primary);">
        <div>
          <div style="font-size:0.85rem; font-weight:bold; color: var(--text-main);">
            ${batch.fName}
            ${batch.isDuplicate ? '<span style="background: var(--alert-bg); color: var(--alert-text); font-size: 0.6rem; padding: 2px 6px; border-radius: 4px; margin-left: 6px; vertical-align: middle;">Duplicate File</span>' : ''}
          </div>
          <div style="font-size:0.7rem; color:var(--text-muted); margin-top: 2px;">${batch.count} items imported • ${batch.date}</div>
        </div>
      </div>
    </label>
  `).join('');
}

function deleteSelectedImports() {
  const checkboxes = document.querySelectorAll('.import-batch-checkbox:checked');
  if (checkboxes.length === 0) {
    if (typeof triggerNativeAppAlert === 'function') {
        triggerNativeAppAlert("Please select at least one import batch to delete.");
    }
    return;
  }

  const batchIdsToDelete = Array.from(checkboxes).map(cb => cb.value);
  const tx = db.transaction("transactions", "readwrite");
  const store = tx.objectStore("transactions");
  const req = store.openCursor();
  
  req.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      if (batchIdsToDelete.includes(cursor.value.batchId)) {
        cursor.delete();
      }
      cursor.continue();
    }
  };
  
  tx.oncomplete = () => {
    let history = JSON.parse(localStorage.getItem('finwise-import-history') || '[]');
    history = history.filter(h => !batchIdsToDelete.includes(h.id));
    localStorage.setItem('finwise-import-history', JSON.stringify(history));
    
    if (typeof fetchAndDisplay === 'function') fetchAndDisplay();
    if (typeof refreshImportHistoryUI === 'function') refreshImportHistoryUI();
    if (typeof triggerSuccessNotification === 'function') triggerSuccessNotification(`Cleaned up ${batchIdsToDelete.length} import batches successfully.`);
  };
}