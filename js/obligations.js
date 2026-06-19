// ==========================================
// 1. UI TOGGLES & HELPERS
// ==========================================
function toggleEndDateField() {
    const type = document.getElementById('ob-type').value;
    const emiDetails = document.getElementById('emi-details-container');
    if (emiDetails) {
        emiDetails.style.display = type === 'EMI' ? 'flex' : 'none';
    }
}

// ==========================================
// 2. CORE OBLIGATIONS (EMI/SUB) ENGINE
// ==========================================
function executeSaveObligation() {
    const title = document.getElementById('ob-title').value.trim();
    const amount = parseIndianCommaStringToFloat(document.getElementById('ob-amount').value);
    const date = parseInt(document.getElementById('ob-date').value);
    const type = document.getElementById('ob-type').value;
    const category = document.getElementById('ob-category').value;
    
    let principal = 0;
    let interest = 0;
    let endDate = null;
    let addToBalance = false;
    
    if (type === 'EMI') {
        principal = parseIndianCommaStringToFloat(document.getElementById('ob-principal').value);
        interest = parseFloat(document.getElementById('ob-interest').value) || 0;
        endDate = document.getElementById('ob-end-date').value;
        const addToggle = document.getElementById('ob-add-to-balance');
        if (addToggle) addToBalance = addToggle.checked;
    }

    if (!title || amount <= 0 || isNaN(date) || date < 1 || date > 31) {
        triggerNativeAppAlert("Please fill all details correctly.");
        return;
    }

    const ob = {
        title, 
        amount, 
        date, 
        type, 
        category, 
        status: 'active', 
        createdOn: new Date().getTime(),
        lastPaidMonth: null
    };

    if (type === 'EMI') {
        ob.principal = principal;
        ob.interest = interest;
        ob.endDate = endDate;
    }

    const tx = db.transaction(["obligations", "transactions"], "readwrite");
    const store = tx.objectStore("obligations");
    store.add(ob);
    
    // PHASE 4 LOGIC: Automatically add new loan money to Bank Balance if requested
    if (type === 'EMI' && addToBalance && principal > 0) {
        const txStore = tx.objectStore("transactions");
        const today = new Date();
        txStore.add({
            text: `Loan Credited: ${title}`,
            amount: principal, // Positive amount adds to liquid cash
            type: 'income',
            category: 'Other Income', // Standard category for loan credits
            date: today.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
            timestamp: today.getTime(),
            dateString: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(today)
        });
    }

    tx.oncomplete = () => {
        triggerSuccessNotification("Commitment Saved Successfully!");
        
        // Clear Form Fields
        document.getElementById('ob-title').value = '';
        document.getElementById('ob-amount').value = '';
        document.getElementById('ob-date').value = '';
        if (type === 'EMI') {
            document.getElementById('ob-principal').value = '';
            document.getElementById('ob-interest').value = '';
            const addToggle = document.getElementById('ob-add-to-balance');
            if(addToggle) addToggle.checked = false;
        }
        
        renderObligationsList();
        // Immediately fetch to update Master Net Worth calculation
        if (typeof fetchAndDisplay === 'function') fetchAndDisplay();
    };
}

function renderObligationsList() {
    const listContainer = document.getElementById('obligations-list');
    if (!listContainer) return;

    if (!window.db) return;
    
    const tx = db.transaction("obligations", "readonly");
    const store = tx.objectStore("obligations");
    
    store.getAll().onsuccess = (e) => {
        const obs = e.target.result || [];
        listContainer.innerHTML = '';
        
        const activeObs = obs.filter(o => o.status !== 'archived');
        
        if (activeObs.length === 0) {
            listContainer.innerHTML = `<div style="text-align: center; padding: 20px 0; color: var(--text-muted); font-size: 0.85rem; background: var(--bg-main); border-radius: 12px; border: 1px dashed var(--border);">No active bills or EMIs found.</div>`;
            return;
        }
        
        activeObs.forEach(ob => {
            const isEmi = ob.type === 'EMI';
            const displayAmt = isPrivacyMode ? '••••' : formatToIndianRupee(ob.amount).split('.')[0];
            let emiExtraHtml = '';
            
            if (isEmi) {
                const displayPrincipal = isPrivacyMode ? '••••' : formatToIndianRupee(ob.principal).split('.')[0];
                emiExtraHtml = `
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px; display: flex; justify-content: space-between; align-items: center;">
                        <span>Principal Left: <strong>₹${displayPrincipal}</strong></span>
                        <button onclick="openEmiPrepayModal(${ob.id}, '${ob.title}')" style="background: transparent; color: var(--primary); font-weight: 800; border: 1px solid var(--primary); padding: 2px 8px; font-size: 0.65rem; border-radius: 4px; width: auto; margin: 0; box-shadow: none;">Prepay Extra</button>
                    </div>
                `;
            }
            
            const card = document.createElement('div');
            card.style.cssText = `background: var(--bg-card); padding: 12px; border-radius: 10px; border: 1px solid var(--border); box-shadow: 0 2px 8px rgba(0,0,0,0.02);`;
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <div style="font-weight: bold; font-size: 0.9rem; color: var(--text-main);">${ob.title}</div>
                    <div style="font-weight: 800; color: var(--expense); font-size: 0.95rem;">₹${displayAmt}</div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted);">
                    <span><span style="background: var(--badge-bg); color: var(--badge-text); padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 0.65rem; margin-right: 6px;">${ob.type.toUpperCase()}</span> Due on: ${ob.date}th</span>
                    <button onclick="confirmArchiveObligation(${ob.id})" style="background: transparent; color: var(--text-muted); border: none; font-size: 0.7rem; text-decoration: underline; box-shadow: none; padding: 0; margin: 0; width: auto;">Archive</button>
                </div>
                ${emiExtraHtml}
            `;
            listContainer.appendChild(card);
        });
    };
}

// ==========================================
// 3. THE GATEKEEPER (EMI AUTOMATION)
// ==========================================
function checkPendingObligations() {
    if (!window.db) return;
    const tx = db.transaction("obligations", "readonly");
    const store = tx.objectStore("obligations");
    
    store.getAll().onsuccess = (e) => {
        const obs = e.target.result || [];
        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const currentMonthKey = `${currentMonth}-${currentYear}`;
        
        const pending = [];
        obs.forEach(ob => {
            if (ob.status === 'archived') return;
            if (ob.lastPaidMonth === currentMonthKey) return; // Already paid this month
            
            // If the due date has arrived or passed for the current month
            if (currentDay >= ob.date) {
                pending.push(ob);
            }
        });
        
        if (pending.length > 0) {
            renderGatekeeperList(pending);
            document.getElementById('gatekeeper-modal').style.display = 'flex';
        }
    };
}

function renderGatekeeperList(pendingObs) {
    const list = document.getElementById('pending-obligations-list');
    list.innerHTML = '';
    
    pendingObs.forEach(ob => {
        const displayAmt = formatToIndianRupee(ob.amount).split('.')[0];
        const el = document.createElement('div');
        el.style.cssText = `background: var(--bg-main); border: 1px solid var(--border); padding: 12px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;`;
        
        el.innerHTML = `
            <div>
                <div style="font-weight: 800; font-size: 0.95rem; color: var(--text-main); margin-bottom: 2px;">${ob.title}</div>
                <div style="font-size: 0.75rem; color: var(--expense); font-weight: 700;">₹${displayAmt} Due</div>
            </div>
            <div style="display: flex; gap: 6px;">
                <button onclick="skipObligation(${ob.id})" style="background: transparent; color: var(--text-muted); border: 1px solid var(--border); padding: 6px 10px; font-size: 0.75rem; border-radius: 8px; box-shadow: none; width: auto; margin: 0;">Skip</button>
                <button onclick="payObligation(${ob.id})" style="background: var(--primary); color: white; border: none; padding: 6px 14px; font-size: 0.75rem; font-weight: bold; border-radius: 8px; box-shadow: 0 2px 6px rgba(46,125,50,0.3); width: auto; margin: 0;">Pay</button>
            </div>
        `;
        list.appendChild(el);
    });
}

// 💥 THE MAGIC ENGINE: Deducts liquid cash AND reduces loan automatically
function payObligation(id) {
    const tx = db.transaction(["obligations", "transactions"], "readwrite");
    const obStore = tx.objectStore("obligations");
    const txStore = tx.objectStore("transactions");
    
    obStore.get(id).onsuccess = (e) => {
        const ob = e.target.result;
        if (!ob) return;
        
        const today = new Date();
        const currentMonthKey = `${today.getMonth()}-${today.getFullYear()}`;
        
        // 1. Log the Expense Transaction
        txStore.add({
            text: `Paid: ${ob.title}`,
            amount: -Math.abs(ob.amount),
            type: 'expense',
            category: ob.category || 'Utilities & Bills',
            date: today.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
            timestamp: today.getTime(),
            dateString: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(today)
        });
        
        // 2. Update Obligation State
        ob.lastPaidMonth = currentMonthKey;
        
        let isLoanFinished = false;
        
        if (ob.type === 'EMI' && ob.principal > 0) {
            // Deduct EMI amount from remaining principal
            ob.principal -= ob.amount;
            if (ob.principal <= 0) {
                ob.principal = 0;
                ob.status = 'archived';
                isLoanFinished = true;
            }
        }
        
        obStore.put(ob);
        
        tx.oncomplete = () => {
            triggerSuccessNotification("Payment Processed Successfully!");
            checkPendingObligations(); // Refresh Gatekeeper modal
            renderObligationsList(); // Refresh Settings screen
            if (typeof fetchAndDisplay === 'function') fetchAndDisplay(); // Refresh Math Engine instantly
            
            if (isLoanFinished) {
                document.getElementById('congrats-emi-name').innerText = ob.title;
                document.getElementById('emi-congrats-modal').style.display = 'flex';
                // Close gatekeeper if open so congrats modal is visible
                document.getElementById('gatekeeper-modal').style.display = 'none'; 
            }
        };
    };
}

function skipObligation(id) {
    const tx = db.transaction("obligations", "readwrite");
    const store = tx.objectStore("obligations");
    
    store.get(id).onsuccess = (e) => {
        const ob = e.target.result;
        const today = new Date();
        ob.lastPaidMonth = `${today.getMonth()}-${today.getFullYear()}`;
        store.put(ob);
        
        tx.oncomplete = () => {
            checkPendingObligations();
        };
    };
}

// ==========================================
// 4. PREPAYMENTS & ARCHIVING
// ==========================================

function openEmiPrepayModal(id, title) {
    document.getElementById('prepay-emi-id').value = id;
    document.getElementById('prepay-emi-title').innerText = title;
    document.getElementById('emi-prepay-amount').value = '';
    document.getElementById('emi-prepay-modal').style.display = 'flex';
}

function executeEmiPrepayment() {
    const idStr = document.getElementById('prepay-emi-id').value;
    const amountStr = document.getElementById('emi-prepay-amount').value;
    
    const id = parseInt(idStr);
    const amount = parseIndianCommaStringToFloat(amountStr);
    
    if (!id || amount <= 0 || isNaN(amount)) {
        triggerNativeAppAlert("Please enter a valid extra payment amount.");
        return;
    }
    
    const tx = db.transaction(["obligations", "transactions"], "readwrite");
    const obStore = tx.objectStore("obligations");
    const txStore = tx.objectStore("transactions");
    
    obStore.get(id).onsuccess = (e) => {
        const ob = e.target.result;
        if (!ob) return;
        
        const today = new Date();
        
        // Log transaction (Liquid Cash gets reduced)
        txStore.add({
            text: `Prepayment: ${ob.title}`,
            amount: -Math.abs(amount),
            type: 'expense',
            category: ob.category || 'Miscellaneous',
            date: today.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
            timestamp: today.getTime(),
            dateString: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(today)
        });
        
        // Reduce Principal
        ob.principal -= amount;
        let isLoanFinished = false;
        
        if (ob.principal <= 0) {
            ob.principal = 0;
            ob.status = 'archived';
            isLoanFinished = true;
        }
        
        obStore.put(ob);
        
        tx.oncomplete = () => {
            closeModal('emi-prepay-modal');
            triggerSuccessNotification("Prepayment applied!");
            renderObligationsList();
            if (typeof fetchAndDisplay === 'function') fetchAndDisplay(); // Refresh Math Engine instantly
            
            if (isLoanFinished) {
                document.getElementById('congrats-emi-name').innerText = ob.title;
                document.getElementById('emi-congrats-modal').style.display = 'flex';
            }
        };
    };
}

function confirmArchiveObligation(id) {
    document.getElementById('simple-confirm-title').innerText = "Archive Item?";
    document.getElementById('simple-confirm-msg').innerText = "This will stop future tracking and move it to your Archive Vault. Are you sure?";
    
    const btn = document.getElementById('simple-confirm-btn');
    btn.onclick = () => {
        executeArchiveObligation(id);
        closeModal('simple-confirm-modal');
    };
    
    document.getElementById('simple-confirm-modal').style.display = 'flex';
}

function executeArchiveObligation(id) {
    const tx = db.transaction("obligations", "readwrite");
    const store = tx.objectStore("obligations");
    
    store.get(id).onsuccess = (e) => {
        const ob = e.target.result;
        if(ob) {
            ob.status = 'archived';
            store.put(ob);
        }
    };
    
    tx.oncomplete = () => {
        triggerSuccessNotification("Moved to Archive Vault");
        renderObligationsList();
        if (typeof renderArchiveVault === 'function') renderArchiveVault();
        if (typeof fetchAndDisplay === 'function') fetchAndDisplay(); // Triggers Math Engine rebuild
    };
}

// ==========================================
// 5. ARCHIVE VAULT RENDERING
// ==========================================

function switchArchiveTab(tab, el) {
    document.getElementById('tab-archive-goals').classList.remove('active');
    document.getElementById('tab-archive-emis').classList.remove('active');
    el.classList.add('active');
    
    document.getElementById('archive-content-goals').style.display = tab === 'goals' ? 'block' : 'none';
    document.getElementById('archive-content-emis').style.display = tab === 'emis' ? 'block' : 'none';
}

function renderArchiveVault() {
    if (!window.db) return;
    
    // Render Archived Obligations
    const obTx = db.transaction("obligations", "readonly");
    obTx.objectStore("obligations").getAll().onsuccess = (e) => {
        const obs = e.target.result || [];
        const container = document.getElementById('archived-obligations-list-container');
        if(!container) return;
        
        container.innerHTML = '';
        const archivedObs = obs.filter(o => o.status === 'archived');
        
        if (archivedObs.length === 0) {
            container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px; border: 1px dashed var(--border); border-radius: 12px;">No archived bills or EMIs.</div>`;
        } else {
            archivedObs.forEach(ob => {
                const el = document.createElement('div');
                el.style.cssText = `background: var(--bg-card); border: 1px solid var(--border); padding: 12px; border-radius: 12px; opacity: 0.8; margin-bottom: 8px; position: relative;`;
                
                el.innerHTML = `
                    <button onclick="promptHardDelete(${ob.id}, 'obligation')" style="position: absolute; right: 10px; top: 10px; background: transparent; color: var(--expense); border: none; box-shadow: none; font-size: 1.2rem; padding: 0; margin: 0; width: auto; height: auto;">&times;</button>
                    <div style="font-weight: bold; font-size: 0.95rem; color: var(--text-main); margin-bottom: 2px;">${ob.title} <span style="font-size: 0.65rem; background: var(--badge-bg); padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${ob.type}</span></div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">Amount: ₹${formatToIndianRupee(ob.amount).split('.')[0]}</div>
                    ${ob.type === 'EMI' ? `<div style="font-size: 0.75rem; color: var(--primary); font-weight: bold; margin-top: 4px;">Loan Paid Off / Closed</div>` : ''}
                `;
                container.appendChild(el);
            });
        }
    };
    
    // Render Archived Goals (Phase 3 Link)
    if (db.objectStoreNames.contains("goals")) {
        const goalTx = db.transaction("goals", "readonly");
        goalTx.objectStore("goals").getAll().onsuccess = (e) => {
            const goals = e.target.result || [];
            const container = document.getElementById('archived-goals-list-container');
            if(!container) return;
            
            container.innerHTML = '';
            const archivedGoals = goals.filter(g => g.status === 'archived');
            
            if (archivedGoals.length === 0) {
                container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px; border: 1px dashed var(--border); border-radius: 12px;">No archived goals.</div>`;
            } else {
                archivedGoals.forEach(g => {
                    const el = document.createElement('div');
                    el.style.cssText = `background: var(--bg-card); border: 1px solid var(--border); padding: 12px; border-radius: 12px; opacity: 0.8; margin-bottom: 8px; position: relative;`;
                    
                    const progress = g.target > 0 ? ((g.saved / g.target) * 100) : 0;
                    const isCompleted = progress >= 100;
                    
                    el.innerHTML = `
                        <button onclick="promptHardDelete(${g.id}, 'goal')" style="position: absolute; right: 10px; top: 10px; background: transparent; color: var(--expense); border: none; box-shadow: none; font-size: 1.2rem; padding: 0; margin: 0; width: auto; height: auto;">&times;</button>
                        <div style="font-weight: bold; font-size: 0.95rem; color: var(--text-main); margin-bottom: 2px;">${g.title}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Saved: ₹${formatToIndianRupee(g.saved).split('.')[0]} / ₹${formatToIndianRupee(g.target).split('.')[0]}</div>
                        <div style="font-size: 0.75rem; color: ${isCompleted ? 'var(--primary)' : 'var(--text-muted)'}; font-weight: bold; margin-top: 4px;">${isCompleted ? 'Goal Reached 🎉' : 'Archived Incomplete'}</div>
                    `;
                    container.appendChild(el);
                });
            }
        };
    }
}

function promptHardDelete(id, type) {
    document.getElementById('hard-delete-id').value = id;
    document.getElementById('hard-delete-type').value = type;
    document.getElementById('hard-delete-modal').style.display = 'flex';
}

function executeHardDelete() {
    const id = parseInt(document.getElementById('hard-delete-id').value);
    const type = document.getElementById('hard-delete-type').value;
    const storeName = type === 'goal' ? 'goals' : 'obligations';
    
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    
    tx.oncomplete = () => {
        closeModal('hard-delete-modal');
        triggerSuccessNotification("Permanently Deleted");
        renderArchiveVault();
    };
}