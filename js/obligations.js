// ==========================================
// 1. RECURRING COMMITMENTS UI & SAVING
// ==========================================

function toggleEndDateField() {
  const type = document.getElementById('ob-type').value;
  const emiContainer = document.getElementById('emi-details-container');
  
  if (type === 'EMI') {
      emiContainer.style.display = 'flex';
  } else { 
      emiContainer.style.display = 'none'; 
      document.getElementById('ob-end-date').value = ''; 
      document.getElementById('ob-principal').value = ''; 
      document.getElementById('ob-interest').value = ''; 
  }
}

function executeSaveObligation() {
  const title = document.getElementById('ob-title').value.trim();
  const amount = parseFloat(document.getElementById('ob-amount').value);
  const type = document.getElementById('ob-type').value;
  const category = document.getElementById('ob-category').value;
  const billingDate = parseInt(document.getElementById('ob-date').value);
  const endDate = document.getElementById('ob-end-date').value || null;
  
  // New Phase 2 EMI Fields
  const principal = type === 'EMI' ? parseFloat(document.getElementById('ob-principal').value) || 0 : 0;
  const interestRate = type === 'EMI' ? parseFloat(document.getElementById('ob-interest').value) || 0 : 0;

  if (!title || isNaN(amount) || isNaN(billingDate)) {
      if (typeof triggerNativeAppAlert === 'function') {
          triggerNativeAppAlert("Please fill in all valid details for the commitment.");
      } else {
          alert("Please fill in all valid details for the commitment.");
      }
      return;
  }

  // Safety constraint: Billing date must be a valid calendar day
  if (billingDate < 1 || billingDate > 31) {
      if (typeof triggerNativeAppAlert === 'function') triggerNativeAppAlert("Day must be between 1 and 31.");
      return;
  }

  const tx = db.transaction("obligations", "readwrite");
  tx.objectStore("obligations").add({
      title, 
      amount, 
      type, 
      category, 
      billingDate, 
      endDate,
      principal,          // Added to DB
      interest: interestRate, // Added to DB
      lastProcessedMonth: null,
      createdAt: Date.now()
  });

  tx.oncomplete = () => {
      document.getElementById('ob-title').value = '';
      document.getElementById('ob-amount').value = '';
      document.getElementById('ob-date').value = '';
      document.getElementById('ob-end-date').value = '';
      document.getElementById('ob-principal').value = '';
      document.getElementById('ob-interest').value = '';
      
      if (typeof triggerSuccessNotification === 'function') triggerSuccessNotification("Commitment saved!");
      renderObligationsList();
  };
}

// ==========================================
// 2. RENDERING THE SETTINGS LIST
// ==========================================

function renderObligationsList() {
  const list = document.getElementById('obligations-list');
  if (!list) return;

  const tx = db.transaction("obligations", "readonly");
  tx.objectStore("obligations").getAll().onsuccess = (e) => {
      const obligations = e.target.result || [];
      if (obligations.length === 0) {
          list.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; margin: 10px 0;">No active bills or EMIs.</p>';
          return;
      }

      list.innerHTML = obligations.map(ob => {
          const typeColor = ob.type === 'EMI' ? 'var(--expense)' : 'var(--primary)';
          let extraDetails = '';
          
          if (ob.type === 'EMI' && ob.principal > 0) {
              const displayPrincipal = typeof formatToIndianRupee === 'function' ? formatToIndianRupee(ob.principal) : ob.principal;
              extraDetails = `<div style="font-size: 0.7rem; color: var(--expense); font-weight: 700; margin-top: 4px;">Remaining Principal: ₹${displayPrincipal}</div>`;
          }

          return `
          <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                  <div style="font-weight: bold; font-size: 0.9rem; color: var(--text-main);">${ob.title}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                      <span style="color: ${typeColor}; font-weight: bold;">${ob.type}</span> • Day ${ob.billingDate} • ₹${ob.amount}
                  </div>
                  ${extraDetails}
              </div>
              <button onclick="deleteObligation(${ob.id})" style="background: transparent; color: var(--expense); border: 1px solid var(--border); width: 36px; height: 36px; display: flex; justify-content: center; align-items: center; border-radius: 8px; font-size: 1rem; padding: 0; box-shadow: none;">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
          </div>
          `;
      }).join('');
  };
}

function deleteObligation(id) {
  const tx = db.transaction("obligations", "readwrite");
  tx.objectStore("obligations").delete(id);
  tx.oncomplete = () => {
      if (typeof triggerSuccessNotification === 'function') triggerSuccessNotification("Deleted successfully.");
      renderObligationsList();
  };
}

// ==========================================
// 3. THE GATEKEEPER ENGINE (HOME SCREEN CHECKS)
// ==========================================

function runGatekeeperCheck() {
  const tx = db.transaction("obligations", "readonly");
  tx.objectStore("obligations").getAll().onsuccess = (e) => {
      const obligations = e.target.result || [];
      const istDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const currentDay = istDate.getDate();
      const currentMonthKey = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, '0')}`;
      
      const pending = obligations.filter(ob => {
          // If the due date hasn't passed yet, don't trigger.
          if (currentDay < ob.billingDate) return false;
          
          // If we already processed it this month, don't trigger.
          if (ob.lastProcessedMonth === currentMonthKey) return false;
          
          // Check if loan has expired
          if (ob.endDate) {
              const end = new Date(ob.endDate);
              if (istDate > end) return false;
          }

          // Check if principal is fully paid off (Only for EMIs tracking principal)
          if (ob.type === 'EMI' && typeof ob.principal !== 'undefined' && ob.principal <= 0) {
              return false;
          }
          
          return true;
      });

      if (pending.length > 0) {
          showGatekeeperModal(pending);
      }
  };
}

function showGatekeeperModal(pendingObligations) {
  const list = document.getElementById('pending-obligations-list');
  if (!list) return;

  list.innerHTML = pendingObligations.map(ob => `
      <div style="background: var(--bg-main); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div>
                  <div style="font-weight: bold; font-size: 0.95rem; color: var(--text-main);">${ob.title}</div>
                  <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Due on the ${ob.billingDate}th</div>
              </div>
              <div style="font-weight: 800; font-size: 1.1rem; color: var(--expense);">₹${ob.amount}</div>
          </div>
          <div style="display: flex; gap: 8px;">
              <button onclick="processObligation(${ob.id}, 'log')" style="flex: 1; margin: 0; padding: 10px; font-size: 0.8rem; box-shadow: none;">Log Payment</button>
              <button onclick="processObligation(${ob.id}, 'skip')" style="flex: 1; margin: 0; padding: 10px; font-size: 0.8rem; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border); box-shadow: none;">Skip</button>
          </div>
      </div>
  `).join('');

  document.getElementById('gatekeeper-modal').style.display = 'flex';
}

// ==========================================
// 4. SMART EMI PROCESSING (PRINCIPAL VS INTEREST)
// ==========================================

function processObligation(id, action) {
  const tx = db.transaction(["obligations", "transactions"], "readwrite");
  const obStore = tx.objectStore("obligations");
  
  obStore.get(id).onsuccess = (e) => {
      const obligation = e.target.result;
      const istDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      
      // Mark as processed for the current month
      obligation.lastProcessedMonth = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, '0')}`;
      
      if(action === 'log') {
          // --- PHASE 2 MATH LOGIC ---
          let principalDeducted = 0;
          let interestCalculated = 0;
          let logDescription = obligation.title;

          if (obligation.type === 'EMI' && obligation.principal > 0 && obligation.interest > 0) {
              // 1. Calculate the Interest for this month: (Outstanding * Annual Rate) / 12 months
              const monthlyRate = (obligation.interest / 100) / 12;
              interestCalculated = obligation.principal * monthlyRate;
              
              // 2. The rest of the EMI goes towards the Principal
              principalDeducted = obligation.amount - interestCalculated;

              // Ensure we don't deduct more than what is owed
              if (principalDeducted > obligation.principal) {
                  principalDeducted = obligation.principal;
              }

              // 3. Shrink the Outstanding Principal in the database
              obligation.principal -= principalDeducted;
              
              // Ensure we don't have floating point dust (like 0.00000001)
              if (obligation.principal < 0.01) obligation.principal = 0;

              // 4. Add smart insights to the description so the user sees the breakdown in their history
              const displayPrin = typeof formatToIndianRupee === 'function' ? formatToIndianRupee(principalDeducted).split('.')[0] : Math.round(principalDeducted);
              const displayInt = typeof formatToIndianRupee === 'function' ? formatToIndianRupee(interestCalculated).split('.')[0] : Math.round(interestCalculated);
              logDescription = `${obligation.title} (Prin: ₹${displayPrin}, Int: ₹${displayInt})`;
          }
          // ----------------------------

          // Log the transaction (The FULL amount comes out of the bank balance)
          tx.objectStore("transactions").add({ 
              text: logDescription, 
              amount: -Math.abs(obligation.amount), 
              type: 'expense',
              category: obligation.category || 'Utilities', 
              date: istDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }), 
              timestamp: istDate.getTime(), 
              dateString: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(istDate) 
          });
      }
      
      // Save the updated obligation (with the shrunken principal) back to DB
      obStore.put(obligation);
      
      tx.oncomplete = () => { 
          if (typeof triggerSuccessNotification === 'function') {
              if(action === 'log') {
                  triggerSuccessNotification(`${obligation.title} logged to expenses!`);
              } else {
                  triggerSuccessNotification(`${obligation.title} skipped for this month.`);
              }
          }
          
          if (typeof fetchAndDisplay === 'function') fetchAndDisplay();
          
          // Check if there are more pending, otherwise close the modal
          document.getElementById('gatekeeper-modal').style.display = 'none';
          setTimeout(() => { runGatekeeperCheck(); }, 300);
      };
  };
}