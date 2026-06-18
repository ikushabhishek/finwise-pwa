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
    const type = document.getElementById('ob-type').value;
    const category = document.getElementById('ob-category').value;
    const billingDate = parseInt(document.getElementById('ob-date').value);
    const endDate = document.getElementById('ob-end-date').value || null;
    
    const amount = parseIndianCommaStringToFloat(document.getElementById('ob-amount').value);
    const principal = type === 'EMI' ? parseIndianCommaStringToFloat(document.getElementById('ob-principal').value) || 0 : 0;
    const interestRate = type === 'EMI' ? parseFloat(document.getElementById('ob-interest').value) || 0 : 0;

    if (!title || isNaN(amount) || amount <= 0 || isNaN(billingDate)) {
        triggerNativeAppAlert("Please fill in all valid details for the commitment.");
        return;
    }

    if (billingDate < 1 || billingDate > 31) {
        triggerNativeAppAlert("Day must be between 1 and 31.");
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
        principal,          
        interest: interestRate, 
        lastProcessedMonth: null,
        status: 'active', 
        createdAt: Date.now()
    });

    tx.oncomplete = () => {
        document.getElementById('ob-title').value = '';
        document.getElementById('ob-amount').value = '';
        document.getElementById('ob-date').value = '';
        document.getElementById('ob-end-date').value = '';
        document.getElementById('ob-principal').value = '';
        document.getElementById('ob-interest').value = '';
        
        triggerSuccessNotification("Commitment saved!");
        renderObligationsList();
    };
}

// ==========================================
// 2. RENDERING THE SETTINGS LIST & ARCHIVING
// ==========================================

function renderObligationsList() {
    const list = document.getElementById('obligations-list');
    if (!list) return;

    const tx = db.transaction("obligations", "readonly");
    tx.objectStore("obligations").getAll().onsuccess = (e) => {
        const allObs = e.target.result || [];
        
        const activeObligations = allObs.filter(ob => ob.status !== 'archived');
        
        if (activeObligations.length === 0) {
            list.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; margin: 10px 0;">No active bills or EMIs.</p>';
            return;
        }

        list.innerHTML = activeObligations.map(ob => {
            const typeColor = ob.type === 'EMI' ? 'var(--expense)' : 'var(--primary)';
            let extraDetails = '';
            
            if (ob.type === 'EMI' && ob.principal > 0) {
                const displayPrincipal = isPrivacyMode ? '••••' : formatToIndianRupee(ob.principal);
                extraDetails = `<div style="font-size: 0.7rem; color: var(--expense); font-weight: 700; margin-top: 4px;">Remaining Principal: ₹${displayPrincipal}</div>`;
            }

            const displayAmount = isPrivacyMode ? '••••' : formatToIndianRupee(ob.amount).split('.')[0];
            
            // FIXED: Added Prepay button for active EMIs
            let actionButtons = `
                <button onclick="deleteObligation(${ob.id})" style="background: transparent; color: var(--text-muted); border: 1px solid var(--border); width: 36px; height: 36px; display: flex; justify-content: center; align-items: center; border-radius: 8px; font-size: 1rem; padding: 0; box-shadow: none;">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path></svg>
                </button>
            `;

            if (ob.type === 'EMI' && ob.principal > 0) {
                actionButtons = `
                <button onclick="openPrepayModal(${ob.id}, '${ob.title.replace(/'/g, "\\'")}')" style="background: rgba(22, 163, 74, 0.1); color: var(--primary); border: 1px solid rgba(22, 163, 74, 0.2); height: 36px; padding: 0 10px; display: flex; justify-content: center; align-items: center; border-radius: 8px; font-size: 0.75rem; font-weight: bold; box-shadow: none;">Prepay</button>
                ` + actionButtons;
            }

            return `
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 12px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div>
                    <div style="font-weight: bold; font-size: 0.9rem; color: var(--text-main);">${ob.title}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                        <span style="color: ${typeColor}; font-weight: bold;">${ob.type}</span> • Day ${ob.billingDate} • ₹${displayAmount}
                    </div>
                    ${extraDetails}
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    ${actionButtons}
                </div>
            </div>
            `;
        }).join('');
    };
}

function deleteObligation(id) {
    document.getElementById('simple-confirm-title').innerText = "Cancel Commitment?";
    document.getElementById('simple-confirm-msg').innerText = "Are you sure you want to cancel this bill or EMI? It will be safely moved to your Archive Vault for your records.";
    
    const confirmBtn = document.getElementById('simple-confirm-btn');
    
    confirmBtn.onclick = function() {
        const tx = db.transaction("obligations", "readwrite");
        const store = tx.objectStore("obligations");
        
        store.get(id).onsuccess = (e) => {
            let ob = e.target.result;
            if (ob) {
                ob.status = 'archived'; // Move to vault safely
                store.put(ob).onsuccess = () => {
                    triggerSuccessNotification("Moved to Archive Vault.");
                    closeModal('simple-confirm-modal');
                    renderObligationsList();
                    if (typeof renderArchiveVault === 'function') renderArchiveVault();
                };
            }
        };
    };
    
    document.getElementById('simple-confirm-modal').style.display = 'flex'; 
}

// ==========================================
// 3. ARCHIVE VAULT & HARD DELETE (NEW)
// ==========================================
function renderArchivedObligations() {
    const container = document.getElementById('archived-obligations-list-container');
    if (!container) return;

    const tx = db.transaction("obligations", "readonly");
    tx.objectStore("obligations").getAll().onsuccess = (e) => {
        const allObs = e.target.result || [];
        const archivedObs = allObs.filter(ob => ob.status === 'archived');

        if (archivedObs.length === 0) {
            container.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; margin: 20px 0;">No past EMIs or canceled subscriptions.</p>';
            return;
        }

        // FIXED: Replaced standard vault icon with a Hard Delete (Trash) button for accidental creations
        container.innerHTML = archivedObs.map(ob => {
            const displayAmount = isPrivacyMode ? '••••' : formatToIndianRupee(ob.amount).split('.')[0];
            return `
            <div style="background: rgba(100, 116, 139, 0.05); border: 1px solid rgba(100, 116, 139, 0.2); border-radius: 12px; padding: 14px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-muted); margin-bottom: 2px; text-decoration: line-through; opacity: 0.7;">${ob.title}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> ${ob.type} • ₹${displayAmount}/mo
                    </div>
                </div>
                <button onclick="confirmHardDelete(${ob.id}, 'obligation')" style="background: transparent; color: var(--expense); border: none; width: 28px; height: 28px; display: flex; justify-content: center; align-items: center; cursor: pointer; padding: 0;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
            `;
        }).join('');
    };
}

function confirmHardDelete(id, type) {
    document.getElementById('hard-delete-id').value = id;
    document.getElementById('hard-delete-type').value = type;
    document.getElementById('hard-delete-modal').style.display = 'flex';
}

function executeHardDelete() {
    const id = parseInt(document.getElementById('hard-delete-id').value);
    const type = document.getElementById('hard-delete-type').value;
    
    if (type === 'obligation') {
        const tx = db.transaction("obligations", "readwrite");
        tx.objectStore("obligations").delete(id);
        tx.oncomplete = () => {
            triggerSuccessNotification("Permanently deleted.");
            closeModal('hard-delete-modal');
            renderObligationsList();
            if (typeof renderArchiveVault === 'function') renderArchiveVault();
        };
    }
}

// ==========================================
// 4. EXTRA PREPAYMENT LOGIC (NEW)
// ==========================================

function openPrepayModal(id, title) {
    document.getElementById('prepay-emi-id').value = id;
    document.getElementById('prepay-emi-title').innerText = title;
    document.getElementById('emi-prepay-amount').value = '';
    document.getElementById('emi-prepay-modal').style.display = 'flex';
}

function executeEmiPrepayment() {
    const id = parseInt(document.getElementById('prepay-emi-id').value);
    const amountStr = document.getElementById('emi-prepay-amount').value;
    const extraAmount = parseIndianCommaStringToFloat(amountStr);

    if (isNaN(extraAmount) || extraAmount <= 0) {
        triggerNativeAppAlert("Please enter a valid amount.");
        return;
    }

    const tx = db.transaction(["obligations", "transactions"], "readwrite");
    const obStore = tx.objectStore("obligations");

    obStore.get(id).onsuccess = (e) => {
        let obligation = e.target.result;
        if (!obligation || obligation.type !== 'EMI') return;

        if (extraAmount > obligation.principal) {
            triggerNativeAppAlert("Extra payment cannot exceed the remaining principal.");
            return;
        }

        // Apply 100% of prepayment directly to principal
        obligation.principal -= extraAmount;
        
        // Auto archive if fully paid!
        if (obligation.principal < 0.01) {
            obligation.principal = 0;
            obligation.status = 'archived';
        }

        const istDate = new Date();
        const logDescription = `${obligation.title} (Extra Prepayment)`;

        // Log the manual transaction
        tx.objectStore("transactions").add({ 
            text: logDescription, 
            amount: -Math.abs(extraAmount), 
            type: 'expense',
            category: obligation.category || 'Utilities', 
            linkedGoal: null,
            date: istDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }), 
            timestamp: istDate.getTime(), 
            dateString: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(istDate) 
        });

        obStore.put(obligation);

        tx.oncomplete = () => {
            closeModal('emi-prepay-modal');
            triggerSuccessNotification("Extra Prepayment logged!");
            
            // Trigger beautiful celebration if prepayment killed the loan!
            if (obligation.status === 'archived') {
                setTimeout(() => {
                    document.getElementById('congrats-emi-name').innerText = obligation.title;
                    document.getElementById('emi-congrats-modal').style.display = 'flex';
                }, 500);
            }
            
            renderObligationsList();
            fetchAndDisplay();
            if (typeof renderArchiveVault === 'function') renderArchiveVault();
        };
    };
}


// ==========================================
// 5. THE GATEKEEPER ENGINE (HOME SCREEN CHECKS)
// ==========================================

function runGatekeeperCheck() {
    const tx = db.transaction("obligations", "readonly");
    tx.objectStore("obligations").getAll().onsuccess = (e) => {
        const obligations = e.target.result || [];
        const istDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const currentDay = istDate.getDate();
        const currentMonthKey = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, '0')}`;
        
        const pending = obligations.filter(ob => {
            if (ob.status === 'archived') return false;

            // If the due date hasn't passed yet, don't trigger.
            if (currentDay < ob.billingDate) return false;
            
            // If we already processed it this month, don't trigger.
            if (ob.lastProcessedMonth === currentMonthKey) return false;
            
            // FIXED: Compare strict month/year string to ensure late-logins don't miss final payments
            if (ob.endDate) {
                const end = new Date(ob.endDate);
                const endMonthKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
                
                // If the current month is PAST the end month, it truly expired.
                // If it is EQUAL to the end month, it must still trigger.
                if (currentMonthKey > endMonthKey) return false;
            }

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

    list.innerHTML = pendingObligations.map(ob => {
        const displayAmount = isPrivacyMode ? '••••' : formatToIndianRupee(ob.amount).split('.')[0];
        return `
        <div style="background: var(--bg-main); border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div>
                    <div style="font-weight: bold; font-size: 0.95rem; color: var(--text-main);">${ob.title}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">Due on the ${ob.billingDate}th</div>
                </div>
                <div style="font-weight: 800; font-size: 1.1rem; color: var(--expense);">₹${displayAmount}</div>
            </div>
            <div style="display: flex; gap: 8px;">
                <button onclick="processObligation(${ob.id}, 'log')" style="flex: 1; margin: 0; padding: 10px; font-size: 0.8rem; box-shadow: none;">Log Payment</button>
                <button onclick="processObligation(${ob.id}, 'skip')" style="flex: 1; margin: 0; padding: 10px; font-size: 0.8rem; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border); box-shadow: none;">Skip</button>
            </div>
        </div>
        `;
    }).join('');

    document.getElementById('gatekeeper-modal').style.display = 'flex';
}

// ==========================================
// 6. SMART EMI PROCESSING (PRINCIPAL VS INTEREST)
// ==========================================

function processObligation(id, action) {
    const tx = db.transaction(["obligations", "transactions"], "readwrite");
    const obStore = tx.objectStore("obligations");
    
    obStore.get(id).onsuccess = (e) => {
        const obligation = e.target.result;
        const istDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        
        obligation.lastProcessedMonth = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, '0')}`;
        
        if(action === 'log') {
            let principalDeducted = 0;
            let interestCalculated = 0;
            let logDescription = obligation.title;

            if (obligation.type === 'EMI' && obligation.principal > 0 && obligation.interest > 0) {
                const monthlyRate = (obligation.interest / 100) / 12;
                interestCalculated = obligation.principal * monthlyRate;
                
                principalDeducted = obligation.amount - interestCalculated;

                if (principalDeducted > obligation.principal) {
                    principalDeducted = obligation.principal;
                }

                obligation.principal -= principalDeducted;
                
                if (obligation.principal < 0.01) {
                    obligation.principal = 0;
                    obligation.status = 'archived'; 
                }

                const displayPrin = Math.round(principalDeducted).toLocaleString('en-IN');
                const displayInt = Math.round(interestCalculated).toLocaleString('en-IN');
                logDescription = `${obligation.title} (Prin: ₹${displayPrin}, Int: ₹${displayInt})`;
            }

            tx.objectStore("transactions").add({ 
                text: logDescription, 
                amount: -Math.abs(obligation.amount), 
                type: 'expense',
                category: obligation.category || 'Utilities', 
                linkedGoal: null,
                date: istDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }), 
                timestamp: istDate.getTime(), 
                dateString: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(istDate) 
            });
        }
        
        obStore.put(obligation);
        
        tx.oncomplete = () => { 
            if (action === 'log') {
                triggerSuccessNotification(`${obligation.title} logged!`);
            } else {
                triggerSuccessNotification(`${obligation.title} skipped.`);
            }

            // FIXED: Now triggers the beautiful dedicated UI Modal instead of browser alert
            if (obligation.status === 'archived') {
                setTimeout(() => {
                    document.getElementById('congrats-emi-name').innerText = obligation.title;
                    document.getElementById('emi-congrats-modal').style.display = 'flex';
                }, 800);
            }
            
            fetchAndDisplay();
            
            document.getElementById('gatekeeper-modal').style.display = 'none';
            setTimeout(() => { runGatekeeperCheck(); }, 300);
        };
    };
}