/**
 * FinWise - Phase 3: Goal-Based Budgeting Logic
 * Handles creating goals, calculating savings progress, and rendering UI.
 */

// ==========================================
// 1. GOAL CREATION & MANAGEMENT
// ==========================================

function saveNewGoal() {
    const titleInput = document.getElementById('goal-title-input');
    const targetInput = document.getElementById('goal-target-input');
    const deadlineInput = document.getElementById('goal-deadline-input');

    const title = titleInput.value.trim();
    const targetAmount = parseFloat(targetInput.value);
    const deadline = deadlineInput.value;

    if (!title) {
        showToast("Please enter a goal name.");
        return;
    }
    if (isNaN(targetAmount) || targetAmount <= 0) {
        showToast("Please enter a valid target amount.");
        return;
    }

    const newGoal = {
        id: 'goal_' + Date.now().toString(),
        title: title,
        targetAmount: targetAmount,
        deadline: deadline || null,
        createdAt: new Date().toISOString()
    };

    // Save to IndexedDB 'goals' store
    const transaction = db.transaction(['goals'], 'readwrite');
    const store = transaction.objectStore('goals');
    const request = store.add(newGoal);

    request.onsuccess = () => {
        showToast("Goal created successfully!");
        closeModal('add-goal-modal');
        
        // Clear inputs
        titleInput.value = '';
        targetInput.value = '';
        deadlineInput.value = '';

        // Refresh UI
        renderGoals();
        populateGoalDropdowns();
    };

    request.onerror = (e) => {
        console.error("Error saving goal", e);
        showToast("Failed to save goal.");
    };
}

function deleteGoal(goalId) {
    if (!confirm("Are you sure you want to delete this goal? Linked savings will not be deleted, but they will be unlinked.")) return;

    const transaction = db.transaction(['goals'], 'readwrite');
    const store = transaction.objectStore('goals');
    const request = store.delete(goalId);

    request.onsuccess = () => {
        showToast("Goal deleted.");
        renderGoals();
        populateGoalDropdowns();
    };
}

// ==========================================
// 2. MATH ENGINE & PROGRESS CALCULATION
// ==========================================

function renderGoals() {
    const container = document.getElementById('goals-list-container');
    if (!container) return;

    // We need both Goals and Transactions to calculate progress
    const goalsTx = db.transaction(['goals'], 'readonly');
    const goalsStore = goalsTx.objectStore('goals');
    const goalsReq = goalsStore.getAll();

    goalsReq.onsuccess = () => {
        const goals = goalsReq.result;

        if (goals.length === 0) {
            container.innerHTML = `
                <div class="empty-state-premium">
                    <p style="color: var(--text-muted); font-size: 0.9rem;">You haven't set any savings goals yet. Tap '+ New Goal' to get started!</p>
                </div>
            `;
            return;
        }

        // Now fetch all transactions to sum up the saved amounts per goal
        const transTx = db.transaction(['transactions'], 'readonly');
        const transStore = transTx.objectStore('transactions');
        const transReq = transStore.getAll();

        transReq.onsuccess = () => {
            const allTransactions = transReq.result;
            container.innerHTML = ''; // Clear loading/empty text

            goals.forEach(goal => {
                // Find all 'save' transactions linked to this specific goal
                const linkedSavings = allTransactions.filter(tx => 
                    tx.type === 'save' && tx.linkedGoal === goal.id
                );

                // Calculate total saved for this goal
                const currentSaved = linkedSavings.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
                
                // Calculate percentage (capped at 100%)
                let progressPercent = (currentSaved / goal.targetAmount) * 100;
                if (progressPercent > 100) progressPercent = 100;

                // Format numbers to Indian Rupee format
                const formattedSaved = currentSaved.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
                const formattedTarget = goal.targetAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

                // Determine deadline text if it exists
                let deadlineText = '';
                if (goal.deadline) {
                    const dateObj = new Date(goal.deadline);
                    deadlineText = `• Target: ${dateObj.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`;
                }

                // Build the Goal Card HTML
                const goalCard = document.createElement('div');
                goalCard.className = 'goal-card';
                goalCard.innerHTML = `
                    <div class="goal-header">
                        <div>
                            <div class="goal-title">${goal.title}</div>
                            <div class="goal-meta">${progressPercent.toFixed(1)}% Completed ${deadlineText}</div>
                        </div>
                        <button onclick="deleteGoal('${goal.id}')" style="background: transparent; border: none; box-shadow: none; padding: 0; color: var(--text-muted);">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                    <div class="goal-progress-wrapper">
                        <div class="goal-progress-fill" style="width: ${progressPercent}%;"></div>
                    </div>
                    <div class="goal-amounts">
                        <span style="color: var(--save);">${formattedSaved}</span>
                        <span style="color: var(--text-muted);">${formattedTarget}</span>
                    </div>
                `;
                container.appendChild(goalCard);
            });
        };
    };
}

// ==========================================
// 3. UI INTEGRATION (DROPDOWNS)
// ==========================================

function populateGoalDropdowns() {
    const lightningGoalSelect = document.getElementById('lightning-linked-goal');
    if (!lightningGoalSelect) return;

    const transaction = db.transaction(['goals'], 'readonly');
    const store = transaction.objectStore('goals');
    const request = store.getAll();

    request.onsuccess = () => {
        const goals = request.result;
        
        // Reset dropdown to default option
        lightningGoalSelect.innerHTML = '<option value="" selected>No Goal Linked (Optional)</option>';

        // Populate with active goals
        goals.forEach(goal => {
            const option = document.createElement('option');
            option.value = goal.id;
            option.textContent = goal.title;
            lightningGoalSelect.appendChild(option);
        });
    };
}

// ==========================================
// 4. INITIALIZATION HOOK
// ==========================================

// This function acts as a bridge to ensure goals render when the DB is ready.
// We can call this from app.js once indexedDB finishes loading.
function initGoalsModule() {
    renderGoals();
    populateGoalDropdowns();
}