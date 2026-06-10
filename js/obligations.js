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
          triggerNativeAppAlert("Please fill in all valid details for the commitment.");
      } else {
          alert("Please fill in all valid details for the commitment.");
      }
      return;
  }

  const tx = db.transaction(['obligations'], 'readwrite');
  tx.objectStore('obligations').add({ 
      title, 
      amount, 
      type, 
      category, 
      billingDate, 
      endDate, 
      lastProcessedMonth: null 
  });

  tx.oncomplete = () => {
      document.getElementById('ob-title').value = ''; 
      document.getElementById('ob-amount').value = '';
      document.getElementById('ob-end-date').value = '';
      
      if (typeof triggerSuccessNotification === 'function') {
          triggerSuccessNotification("Commitment saved!");
      }
      renderObligationsList();
  };
}

function renderObligationsList() {
  const listContainer = document.getElementById('obligations-list');
  if(!listContainer) return;
  
  listContainer.innerHTML = '';
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
          
          let detailsHTML = `
            <div>
                <strong style="font-size: 0.9rem; color: var(--text-main);">${item.title}</strong> 
                <br>
                <small style="color:var(--text-muted); font-size: 0.75rem; font-weight: 600;">₹${item.amount} • Due: Day ${item.billingDate}</small>
                ${item.endDate ? `<br><small style="color:var(--expense); font-size: 0.65rem; font-weight: 700;">Ends: ${item.endDate}</small>` : ''}
            </div>
            <button style="background:var(--alert-bg); color:var(--expense); border:1px solid var(--alert-border); box-shadow:none; width:36px; height:36px; padding:0; display:flex; justify-content:center; align-items:center; border-radius:10px; font-size:1.1rem; cursor:pointer;" onclick="executeDeleteObligation(${item.id})">🗑️</button>
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
          triggerSuccessNotification("Commitment removed");
      }
      renderObligationsList();
  };
}

function runGatekeeperCheck() {
  const tx = db.transaction("obligations", "readonly");
  tx.objectStore("obligations").getAll().onsuccess = (e) => {
      const obligations = e.target.result || [];
      const istDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const currentDay = istDate.getDate();
      const currentYearMonth = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, '0')}`;
      const currentDateStringForEnd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(istDate);
      
      const daysInCurrentMonth = new Date(istDate.getFullYear(), istDate.getMonth() + 1, 0).getDate();

      let pending = obligations.filter(ob => {
          // Handle cases where billing date is 31, but month only has 30 days
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
  if(!container) return;
  
  container.innerHTML = '';
  if(pendingItems.length === 0) { 
      document.getElementById('gatekeeper-modal').style.display = 'none'; 
      return; 
  }
  
  document.getElementById('gatekeeper-modal').style.display = 'flex';
  
  pendingItems.forEach(item => {
      const div = document.createElement('div');
      div.style.background = 'var(--bg-main)'; 
      div.style.padding = '16px'; 
      div.style.borderRadius = '14px';
      div.style.border = '1px solid var(--border)';
      
      let displayAmount = item.amount;
      if (typeof formatToIndianRupee === 'function') {
          displayAmount = formatToIndianRupee(item.amount).split('.')[0];
      }

      div.innerHTML = `
          <div style="display:flex; justify-content:space-between; margin-bottom: 14px; align-items:center;">
            <div>
                <strong style="font-size: 1rem; color: var(--text-main); display:block; margin-bottom: 2px;">${item.title}</strong>
                <small style="color: var(--text-muted); font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">${item.type} • Day ${item.billingDate}</small>
            </div>
            <strong style="color:var(--expense); font-size: 1.15rem;">₹${displayAmount}</strong>
          </div>
          <div style="display:flex; gap: 10px;">
            <button onclick="processObligation(${item.id}, 'skip')" style="flex:1; background:var(--bg-card); color:var(--text-main); border:1px solid var(--border); box-shadow: 0 2px 4px rgba(0,0,0,0.02); font-size: 0.85rem; padding: 10px;">⏭️ Skip</button>
            <button onclick="processObligation(${item.id}, 'log')" style="flex:1; background:var(--primary); color:white; border:none; box-shadow: 0 4px 10px rgba(46,125,50,0.2); font-size: 0.85rem; padding: 10px;">✅ Log</button>
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
      
      // Update the obligation so it doesn't trigger again this month
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
                  triggerSuccessNotification(`${obligation.title} logged!`);
              } else {
                  triggerSuccessNotification(`${obligation.title} skipped for this month.`);
              }
          }
          
          if (typeof fetchAndDisplay === 'function') fetchAndDisplay(); 
          runGatekeeperCheck(); 
      };
  };
}