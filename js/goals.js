/**
 * FinWise - Phase 3: Goal-Based Budgeting Logic
 * Handles creating goals, calculating savings progress, archiving, and rendering UI.
 */

// ==========================================
// 1. GOAL CREATION & MANAGEMENT
// ==========================================
function saveNewGoal() {
    const titleInput = document.getElementById('goal-title-input');
    const targetInput = document.getElementById('goal-target-input');
    const deadlineInput = document.getElementById('goal-deadline-input');

    const title = titleInput.value.trim();
    // Safely parse the comma-formatted Indian Rupee string
    const targetAmount = parseIndianCommaStringToFloat(targetInput.value);
    const deadline = deadlineInput.value;

    if (!title) {
        triggerNativeAppAlert("Please enter a goal name.");
        return;
    }
    if (isNaN(targetAmount) || targetAmount <= 0) {
        triggerNativeAppAlert("Please enter a valid target amount.");
        return;
    }

    const newGoal = {
        id: 'goal_' + Date.now().toString(),
        title: title,
        targetAmount: targetAmount,
        deadline: deadline || null,
        status: 'active', // Track whether it is active or in the vault
        congratsShown: false, // Prevent the completion popup from showing repeatedly
        createdAt: new Date().toISOString()
    };

    const transaction = db.transaction(['goals'], 'readwrite');
    const store = transaction.objectStore('goals');
    const request = store.add(newGoal);

    request.onsuccess = () => {
        triggerSuccessNotification("Goal created successfully!");
        closeModal('add-goal-modal');
        
        titleInput.value = '';
        targetInput.value = '';
        deadlineInput.value = '';

        renderGoals();
        populateGoalDropdowns();
    };

    request.onerror = (e) => {
        console.error("Error saving goal", e);
        triggerNativeAppAlert("Failed to save goal.");
    };
}

function deleteGoal(goalId) {
    document.getElementById('simple-confirm-title').innerText = "Delete Goal?";
    document.getElementById('simple-confirm-msg').innerText = "Are you sure? Any savings linked to this goal will remain in your history, but the goal tracking will be removed.";
    
    const confirmBtn = document.getElementById('simple-confirm-btn');
    
    // Bind the actual deletion logic to the Yes button
    confirmBtn.onclick = function() {
        const transaction = db.transaction(['goals'], 'readwrite');
        const store = transaction.objectStore('goals');
        
        store.delete(goalId).onsuccess = () => {
            triggerSuccessNotification("Goal deleted.");
            closeModal('simple-confirm-modal');
            renderGoals();
            populateGoalDropdowns();
            if (typeof renderArchiveVault === 'function') renderArchiveVault();
        };
    };
    
    document.getElementById('simple-confirm-modal').style.display = 'flex'; 
}

function archiveGoal(goalId) {
    const tx = db.transaction(['goals'], 'readwrite');
    const store = tx.objectStore('goals');
    
    store.get(goalId).onsuccess = (e) => {
        let goal = e.target.result;
        if (goal) {
            goal.status = 'archived'; // Move to Vault
            store.put(goal).onsuccess = () => {
                triggerSuccessNotification("Goal archived successfully!");
                renderGoals();
                populateGoalDropdowns();
                if (typeof renderArchiveVault === 'function') renderArchiveVault();
            };
        }
    };
}

// ==========================================
// 2. MATH ENGINE & PROGRESS CALCULATION
// ==========================================
function renderGoals() {
    const container = document.getElementById('goals-list-container');
    if (!container) return;

    if (!db.objectStoreNames.contains("goals")) return;

    const goalsTx = db.transaction(['goals'], 'readwrite'); 
    const goalsStore = goalsTx.objectStore('goals');
    const goalsReq = goalsStore.getAll();

    goalsReq.onsuccess = () => {
        const allStoredGoals = goalsReq.result;
        
        // Filter out goals that are in the Archive Vault
        const activeGoals = allStoredGoals.filter(g => g.status !== 'archived');

        if (activeGoals.length === 0) {
            container.innerHTML = `
                <div class="empty-state-premium" style="margin-top: 0;">
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0;">You haven't set any savings goals yet. Tap '+ New Goal' to get started!</p>
                </div>
            `;
            return;
        }

        const transTx = db.transaction(['transactions'], 'readonly');
        const transStore = transTx.objectStore('transactions');
        const transReq = transStore.getAll();

        transReq.onsuccess = () => {
            const allTransactions = transReq.result;
            container.innerHTML = ''; 

            activeGoals.forEach(goal => {
                const linkedSavings = allTransactions.filter(tx => 
                    tx.type === 'save' && tx.linkedGoal === goal.id
                );

                const currentSaved = linkedSavings.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0);
                
                let progressPercent = (currentSaved / goal.targetAmount) * 100;
                
                // TRIGGER CONGRATS POPUP IF 100% REACHED
                if (progressPercent >= 100 && !goal.congratsShown) {
                    goal.congratsShown = true;
                    // Save flag so it doesn't trigger every time you open the app
                    const updateTx = db.transaction(['goals'], 'readwrite');
                    updateTx.objectStore('goals').put(goal);
                    
                    triggerGoalCongratsModal(goal);
                }

                if (progressPercent > 100) progressPercent = 100;

                const formattedSaved = isPrivacyMode ? '••••' : currentSaved.toLocaleString('en-IN', { maximumFractionDigits: 0 });
                const formattedTarget = isPrivacyMode ? '••••' : goal.targetAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 });

                let deadlineText = '';
                if (goal.deadline) {
                    const dateObj = new Date(goal.deadline);
                    deadlineText = ` • Target: ${dateObj.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`;
                }

                const goalCard = document.createElement('div');
                goalCard.className = 'goal-card';
                goalCard.innerHTML = `
                    <div class="goal-header" style="align-items: center; margin-bottom: 10px;">
                        <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                            <div class="goal-title" style="margin: 0; font-size: 0.95rem;">${goal.title}</div>
                            <div class="goal-meta" style="margin: 0; padding: 3px 8px; background: var(--tab-bg); border-radius: 12px; font-size: 0.7rem; display: inline-block;">
                                ${isPrivacyMode ? '••' : progressPercent.toFixed(0)}%
                            </div>
                        </div>
                        <button onclick="deleteGoal('${goal.id}')" style="background: transparent; border: none; box-shadow: none; padding: 4px; color: var(--text-muted); width: auto; margin: 0; display: flex; align-items: center; justify-content: center;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                    <div class="goal-progress-wrapper" style="margin-bottom: 8px;">
                        <div class="goal-progress-fill" style="width: ${progressPercent}%;"></div>
                    </div>
                    <div class="goal-amounts" style="font-size: 0.75rem;">
                        <span style="color: var(--save);">₹${formattedSaved}</span>
                        <span style="color: var(--text-muted);">₹${formattedTarget}${deadlineText}</span>
                    </div>
                `;
                container.appendChild(goalCard);
            });
        };
    };
}

function triggerGoalCongratsModal(goal) {
    document.getElementById('congrats-goal-name').innerText = goal.title;
    const archiveBtn = document.getElementById('congrats-archive-btn');
    
    archiveBtn.onclick = function() {
        archiveGoal(goal.id);
        closeModal('goal-congrats-modal');
    };
    
    document.getElementById('goal-congrats-modal').style.display = 'flex';
}

// ==========================================
// 3. UI INTEGRATION (DROPDOWNS)
// ==========================================
function populateGoalDropdowns() {
    const lightningGoalSelect = document.getElementById('lightning-linked-goal');
    if (!lightningGoalSelect) return;

    if (!db.objectStoreNames.contains("goals")) return;

    const transaction = db.transaction(['goals'], 'readonly');
    const store = transaction.objectStore('goals');
    const request = store.getAll();

    request.onsuccess = () => {
        const goals = request.result;
        lightningGoalSelect.innerHTML = '<option value="" selected>No Goal Linked (Optional)</option>';

        // Only populate active goals in the quick-add dropdown
        const activeGoals = goals.filter(g => g.status !== 'archived');

        activeGoals.forEach(goal => {
            const option = document.createElement('option');
            option.value = goal.id;
            option.textContent = goal.title;
            lightningGoalSelect.appendChild(option);
        });
    };
}

// ==========================================
// 4. ARCHIVE VAULT LOGIC & HARD DELETE
// ==========================================
function switchArchiveTab(tabId, element) {
    document.querySelectorAll('#archive-vault-modal .tab').forEach(t => t.classList.remove('active'));
    element.classList.add('active');
    
    document.getElementById('archive-content-goals').style.display = tabId === 'goals' ? 'block' : 'none';
    document.getElementById('archive-content-emis').style.display = tabId === 'emis' ? 'block' : 'none';
}

function renderArchiveVault() {
    renderArchivedGoals();
    if (typeof renderArchivedObligations === 'function') {
        renderArchivedObligations();
    }
}

function renderArchivedGoals() {
    const container = document.getElementById('archived-goals-list-container');
    if (!container) return;

    if (!db.objectStoreNames.contains("goals")) return;

    const goalsTx = db.transaction(['goals'], 'readonly');
    const goalsReq = goalsTx.objectStore('goals').getAll();

    goalsReq.onsuccess = () => {
        const archivedGoals = goalsReq.result.filter(g => g.status === 'archived');

        if (archivedGoals.length === 0) {
            container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; margin: 20px 0;">No completed goals in the vault yet.</p>`;
            return;
        }

        // FIXED: Swapped the download icon for the Hard Delete trash can icon
        container.innerHTML = archivedGoals.map(goal => {
            const formattedTarget = isPrivacyMode ? '••••' : goal.targetAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 });
            return `
            <div style="background: rgba(99, 102, 241, 0.05); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 12px; padding: 14px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main); margin-bottom: 2px;">${goal.title}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--save)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Completed: ₹${formattedTarget}
                    </div>
                </div>
                <button onclick="confirmHardDeleteGoal('${goal.id}')" style="background: transparent; color: var(--expense); border: none; width: 28px; height: 28px; display: flex; justify-content: center; align-items: center; cursor: pointer; padding: 0;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
            `;
        }).join('');
    };
}

// Custom handler specifically for permanently deleting goals from the vault
function confirmHardDeleteGoal(goalId) {
    document.getElementById('hard-delete-id').value = goalId;
    document.getElementById('hard-delete-type').value = 'goal';
    
    const confirmBtn = document.getElementById('hard-delete-modal').querySelector('.modal-footer button:last-child');
    
    // Store original function from HTML if not already stored
    if (!confirmBtn.dataset.originalOnclick) {
        confirmBtn.dataset.originalOnclick = confirmBtn.getAttribute('onclick');
    }
    
    // Temporarily replace it for Goal Deletion
    confirmBtn.setAttribute('onclick', `executeHardDeleteGoal('${goalId}')`);
    
    document.getElementById('hard-delete-modal').style.display = 'flex';
}

function executeHardDeleteGoal(goalId) {
    const tx = db.transaction("goals", "readwrite");
    tx.objectStore("goals").delete(goalId);
    
    tx.oncomplete = () => {
        triggerSuccessNotification("Goal permanently deleted.");
        closeModal('hard-delete-modal');
        renderArchivedGoals();
        
        // Restore the original onclick logic for EMIs
        const confirmBtn = document.getElementById('hard-delete-modal').querySelector('.modal-footer button:last-child');
        confirmBtn.setAttribute('onclick', confirmBtn.dataset.originalOnclick);
    };
}

// ==========================================
// 5. INITIALIZATION HOOK
// ==========================================
function initGoalsModule() {
    renderGoals();
    populateGoalDropdowns();
}