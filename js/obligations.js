function toggleEndDateField() {
  const type = document.getElementById('ob-type').value;
  const container = document.getElementById('end-date-container');
  if (type === 'EMI') container.style.display = 'block';
  else { container.style.display = 'none'; document.getElementById('ob-end-date').value = ''; }
}

function executeSaveObligation() {
  const title = document.getElementById('ob-title').value.trim();
  const amount = parseFloat(document.getElementById('ob-amount').value);
  const type = document.getElementById('ob-type').value;
  const category = document.getElementById('ob-category').value;
  const billingDate = parseInt(document.getElementById('ob-date').value);
  const endDate = document.getElementById('ob-end-date').value || null;

  if (!title || isNaN(amount) || isNaN(billingDate)) return;

  const tx = db.transaction(['obligations'], 'readwrite');
  tx.objectStore('obligations').add({ title, amount, type, category, billingDate, endDate, lastProcessedMonth: null });

  tx.oncomplete = () => {
      document.getElementById('ob-title').value = ''; document.getElementById('ob-amount').value = '';
      renderObligationsList();
  };
}

function renderObligationsList() {
  const listContainer = document.getElementById('obligations-list');
  listContainer.innerHTML = '';
  const tx = db.transaction(['obligations'], 'readonly');
  tx.objectStore('obligations').openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
          const item = cursor.value;
          const div = document.createElement('div');
          div.style.padding = '12px'; div.style.borderBottom = '1px solid var(--border)'; div.style.display = 'flex'; div.style.justifyContent = 'space-between'; div.style.alignItems = 'center';
          div.innerHTML = `<div><strong>${item.title}</strong> <br><small style="color:var(--text-muted)">₹${item.amount} • Due: Day ${item.billingDate}</small></div><button style="background:transparent;color:var(--expense);box-shadow:none;width:auto;" onclick="executeDeleteObligation(${item.id})">🗑️</button>`;
          listContainer.appendChild(div);
          cursor.continue();
      }
  };
}

function executeDeleteObligation(id) {
  const tx = db.transaction(['obligations'], 'readwrite');
  tx.objectStore('obligations').delete(id);
  tx.oncomplete = () => renderObligationsList();
}

function runGatekeeperCheck() {
  const tx = db.transaction("obligations", "readonly");
  tx.objectStore("obligations").getAll().onsuccess = (e) => {
      const obligations = e.target.result || [];
      const istDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const currentDay = istDate.getDate();
      const currentYearMonth = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, '0')}`;
      
      let pending = obligations.filter(ob => {
          if (currentDay < ob.billingDate) return false;
          if (ob.lastProcessedMonth === currentYearMonth) return false;
          return true;
      });
      renderPendingObligations(pending);
  };
}

function renderPendingObligations(pendingItems) {
  const container = document.getElementById('pending-obligations-list');
  container.innerHTML = '';
  if(pendingItems.length === 0) { document.getElementById('gatekeeper-modal').style.display = 'none'; return; }
  
  document.getElementById('gatekeeper-modal').style.display = 'flex';
  pendingItems.forEach(item => {
      const div = document.createElement('div');
      div.style.background = 'var(--bg-main)'; div.style.padding = '15px'; div.style.borderRadius = '12px';
      div.innerHTML = `
          <div style="display:flex; justify-content:space-between; margin-bottom: 12px; align-items:center;"><strong>${item.title}</strong><strong style="color:var(--expense)">₹${item.amount}</strong></div>
          <div style="display:flex; gap: 8px;"><button onclick="processObligation(${item.id}, 'skip')" style="flex:1; background:var(--bg-card); color:var(--text-main); border:1px solid var(--border);">⏭️ Skip</button><button onclick="processObligation(${item.id}, 'log')" style="flex:1; background:var(--primary); color:white;">✅ Log</button></div>
      `;
      container.appendChild(div);
  });
}

function processObligation(id, action) {
  const tx = db.transaction(["obligations", "transactions"], "readwrite");
  const obStore = tx.objectStore("obligations");
  
  obStore.get(id).onsuccess = (e) => {
      const obligation = e.target.result;
      const istDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      obligation.lastProcessedMonth = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, '0')}`;
      obStore.put(obligation);
      
      if(action === 'log') {
          tx.objectStore("transactions").add({ 
              text: obligation.title, amount: -Math.abs(obligation.amount), category: obligation.category || 'Utilities', 
              date: istDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }), timestamp: istDate.getTime(), 
              dateString: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(istDate) 
          });
      }
      tx.oncomplete = () => { fetchAndDisplay(); runGatekeeperCheck(); };
  };
}