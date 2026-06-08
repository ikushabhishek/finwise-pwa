let db;

const request = indexedDB.open("RupeeTrackerDB", 2);

request.onupgradeneeded = (e) => { 
    db = e.target.result; 
    if(!db.objectStoreNames.contains("transactions")) { 
        db.createObjectStore("transactions", { keyPath: "id", autoIncrement: true }); 
    }
    if(!db.objectStoreNames.contains("obligations")) {
        const obStore = db.createObjectStore("obligations", { keyPath: "id", autoIncrement: true });
        obStore.createIndex('billingDate', 'billingDate', { unique: false });
    }
};

request.onsuccess = (e) => { 
    db = e.target.result; 
    if (typeof initSelectorCachePointers === 'function') initSelectorCachePointers(); 
    if (typeof initializeCategoriesStorageSystem === 'function') initializeCategoriesStorageSystem(); 
    if (typeof initSecurityEngine === 'function') initSecurityEngine(); 
    if (typeof fetchAndDisplay === 'function') fetchAndDisplay(); 
};

function parseCSVLine(text) {
    let result = [], current = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (char === '"') { if (inQuotes && text[i+1] === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; } } 
        else if (char === ',' && !inQuotes) { result.push(current); current = ''; } else { current += char; }
    }
    result.push(current); return result;
}

function exportToCSV() {
  if (allTransactions.length === 0) { triggerNativeAppAlert("No data available to export."); return; }
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
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  triggerSuccessNotification("Export complete!");
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
        let cleanText = parts[1].trim(), cleanCat = parts[3].trim(), amt = parseFloat(parts[2]), dateStr = parts[4].trim(); 
        if(!isNaN(amt) && dateStr) {
           const parsedDate = new Date(dateStr);
           store.add({
             text: cleanText || 'Imported Entry', amount: amt, category: cleanCat || 'Other',
             date: parsedDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
             timestamp: parsedDate.getTime(), dateString: dateStr, batchId: importBatchId 
           });
           importedCount++;
        }
      }
    });
    
    tx.oncomplete = () => {
      fetchAndDisplay();
      triggerSuccessNotification(`Imported ${importedCount} entries!`);
      closeModal('preferences-modal');
    };
  };
  reader.readAsText(file); event.target.value = ''; 
}