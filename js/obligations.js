// ==========================================
// 1. RECURRING BILLS UI & SAVING
// ==========================================

function toggleEndDateField() {
  const type = document.getElementById('ob-type').value;
  const container = document.getElementById('end-date-container');
  
  if (type === 'EMI') {
      container.style.display = 'block';
  } else { 
      container.style.display = 'none'; 
      document.getElementById('ob-end-date').value = ''; 
  }
}

function executeSaveObligation() {
  const title = document.getElementById('ob-title').value.trim();
  const amount = parseFloat(document.getElementById('ob-amount').value);
  const type = document.getElementById('ob-type').value;
  const category = document.getElementById('ob-category').value;
  const billingDate = parseInt(document.getElementById('ob-date').value);
  const endDate = document.getElementById('ob-end-date').value || null;

  if (!title || isNaN(amount) || isNaN(billingDate)) {
      if (typeof triggerNativeAppAlert === 'function') {
          triggerNativeAppAlert("Please fill in all details for this bill.");
      } else {
          alert("Please fill in all details for this bill.");
      }
      return;
  }

  // Safety constraint: Billing date must be a valid calendar day
  if (billingDate < 1 || billingDate > 31) {
      if (typeof triggerNativeAppAlert === 'function') {
          triggerNativeAppAlert("Billing day must be between 1 and 31.");
      }
      return;
  }

  // STRICT CHECK FOR EMI END DATE
  if (type === 'EMI' && (!endDate || endDate.trim() === '')) {
      if (typeof triggerNativeAppAlert === 'function') {
          triggerNativeAppAlert("Please select an end date for your EMI.");
      } else {
          alert("Please select an end date for your EMI.");
      }
      return;
  }

  const tx = db.transaction(['obligations'], 'readwrite');
  tx.objectStore('obligations').add({ 
      title: title, 
      amount: amount, 
      type: type, 
      category: category, 
      billingDate: billingDate, 
      endDate: endDate, 
      lastProcessedMonth: null
  });

  tx.oncomplete = () => {
      document.getElementById('ob-title').value = ''; 
      document.getElementById('ob-amount').value = '';
      document.getElementById('ob-end-date').value = '';
      
      if (typeof triggerSuccessNotification === 'function') {
          triggerSuccessNotification("Bill saved!");
      }
      
      renderObligationsList();
  };
}

function renderObligationsList() {
  const listContainer = document.getElementById('obligations-list');
  if(!listContainer) return;
  
  listContainer.innerHTML = '';
  
  if (!db || !db.objectStoreNames.contains('obligations')) return;
  
  const tx = db.transaction(['obligations'], 'readonly');
  
  tx.objectStore('obligations').openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
          const item = cursor.value;
          const div = document.createElement('div');
          
          div.style.background = 'var(--bg-card)';
          div.style.padding = '12px'; 
          div.style.borderRadius = '12px';
          div.style.border = '1px solid var(--border)'; 
          div.style.display = 'flex'; 
          div.style.justifyContent = 'space-between'; 
          div.style.alignItems = 'center';
          div.style.boxShadow = '0 2px 6px rgba(0,0,0,0.02)';
          
          // Privacy Masking Logic
          const displayAmt = (typeof isPrivacyMode !== 'undefined' && isPrivacyMode) ? '••••••' : item.amount;
          
          // SVG Replace: Trash Bin Icon
          const deleteSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

          let detailsHTML = `
            <div>
                <strong style="font-size: 0.9rem; color: var(--text-main);">${item.title}</strong> 
                <br>
                <small style="color:var(--text-muted); font-size: 0.75rem; font-weight: 600;">₹${displayAmt} • Due on the ${item.billingDate}</small>
                ${item.endDate ? `<br><small style="color:var(--expense); font-size: 0.65rem; font-weight: 700;">Ends: ${item.endDate}</small>` : ''}
            </div>
            <button style="background:rgba(220, 38, 38, 0.1); color:var(--expense); border:1px solid rgba(220, 38, 38, 0.2); box-shadow:none; width:36px; height:36px; padding:0; display:flex; justify-content:center; align-items:center; border-radius:10px; cursor:pointer;" onclick="executeDeleteObligation(${item.id})">
              ${deleteSvg}
            </button>
          `;
          
          div.innerHTML = detailsHTML;
          listContainer.appendChild(div);
          cursor.continue();
      }
  };
}

function executeDeleteObligation(id) {
  const tx = db.transaction(['obligations'], 'readwrite');
  tx.objectStore('obligations').delete(id);
  tx.oncomplete = () => {
      if (typeof triggerSuccessNotification === 'function') {
          triggerSuccessNotification("Bill removed");
      }
      renderObligationsList();
  };
}

// ==========================================
// 2. GATEKEEPER ENGINE (AUTO-PROMPT LOGIC)
// ==========================================

function runGatekeeperCheck() {
  if (!db || !db.objectStoreNames.contains('obligations')) return;

  const tx = db.transaction("obligations", "readonly");
  tx.objectStore("obligations").getAll().onsuccess = (e) => {
      const obligations = e.target.result || [];
      
      const istDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const currentDay = istDate.getDate();
      const currentYearMonth = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, '0')}`;
      const currentDateStringForEnd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(istDate);
      
      const daysInCurrentMonth = new Date(istDate.getFullYear(), istDate.getMonth() + 1, 0).getDate();

      let pending = obligations.filter(ob => {
          let effectiveBillingDay = ob.billingDate > daysInCurrentMonth ? daysInCurrentMonth : ob.billingDate;
          
          if (currentDay < effectiveBillingDay) return false;
          if (ob.lastProcessedMonth === currentYearMonth) return false;
          if (ob.type === 'EMI' && ob.endDate && currentDateStringForEnd > ob.endDate) return false;
          
          return true; 
      });
      
      renderPendingObligations(pending);
  };
}

function renderPendingObligations(pendingItems) {
  const container = document.getElementById('pending-obligations-list');
  const modal = document.getElementById('gatekeeper-modal');
  
  if(!container || !modal) return;
  
  container.innerHTML = '';
  
  if(pendingItems.length === 0) { 
      modal.style.display = 'none'; 
      return; 
  }
  
  modal.style.display = 'flex';
  
  // SVG Replace: Skip and Log Icons
  const skipSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: text-bottom;"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>`;
  const logSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: text-bottom;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

  pendingItems.forEach(item => {
      const div = document.createElement('div');
      div.style.background = 'var(--bg-main)'; 
      div.style.padding = '16px'; 
      div.style.borderRadius = '14px';
      div.style.border = '1px solid var(--border)';
      
      let displayAmount = item.amount;
      if (typeof isPrivacyMode !== 'undefined' && isPrivacyMode) {
          displayAmount = '••••••';
      } else if (typeof formatToIndianRupee === 'function') {
          displayAmount = formatToIndianRupee(item.amount).split('.')[0];
      }

      div.innerHTML = `
          <div style="display:flex; justify-content:space-between; margin-bottom: 14px; align-items:center;">
            <div>
                <strong style="font-size: 1rem; color: var(--text-main); display:block; margin-bottom: 2px;">${item.title}</strong>
                <small style="color: var(--text-muted); font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">${item.type} • Due on the ${item.billingDate}</small>
            </div>
            <strong style="color:var(--expense); font-size: 1.15rem;">₹${displayAmount}</strong>
          </div>
          <div style="display:flex; gap: 10px;">
            <button onclick="processObligation(${item.id}, 'skip')" style="flex:1; background:var(--bg-card); color:var(--text-main); border:1px solid var(--border); box-shadow: 0 2px 4px rgba(0,0,0,0.02); font-size: 0.85rem; padding: 10px; margin: 0; display: flex; align-items: center; justify-content: center;">
              ${skipSvg} Skip
            </button>
            <button onclick="processObligation(${item.id}, 'log')" style="flex:1; background:var(--primary); color:white; border:none; box-shadow: 0 4px 10px rgba(46,125,50,0.2); font-size: 0.85rem; padding: 10px; margin: 0; display: flex; align-items: center; justify-content: center;">
              ${logSvg} Log
            </button>
          </div>
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
              text: obligation.title, 
              amount: -Math.abs(obligation.amount), 
              category: obligation.category || 'Utilities', 
              date: istDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }), 
              timestamp: istDate.getTime(), 
              dateString: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(istDate) 
          });
      }
      
      tx.oncomplete = () => { 
          if (typeof triggerSuccessNotification === 'function') {
              if(action === 'log') {
                  triggerSuccessNotification(`${obligation.title} logged as an expense!`);
              } else {
                  triggerSuccessNotification(`${obligation.title} skipped for this month.`);
              }
          }
          
          if (typeof fetchAndDisplay === 'function') fetchAndDisplay(); 
          runGatekeeperCheck(); 
      };
  };
}