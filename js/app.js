// ==========================================
// 1. GLOBAL VARIABLES & STATE
// ==========================================
const DOM = {};
let db;
let allTransactions = [];
let checkedItemIds = []; 
let currentVisibleIds = []; 
let currentTab = 'all';
let dateOffset = 0; 
let activeTransactionNature = 'expense';

let currentActiveMainScreen = 'home'; 

let bulkRowIncrementalPointer = 0;
let expenseChartInstance = null;
let compareChartInstance = null; 

let isPrivacyMode = localStorage.getItem('finwise-privacy') === 'true';
let currentWealthView = 'cash'; // Tracks Liquid Cash vs Net Worth

// ---> LIGHTNING ADD GLOBAL STATE <---
let lightningAmountStr = "0";
let lightningNature = "expense";
let lightningSelectedCategory = "";

// ==========================================
// 2. DOM SELECTOR CACHING
// ==========================================
function initSelectorCachePointers() {
  DOM.balance = document.getElementById('balance');
  DOM.income = document.getElementById('stat-value-left') || document.getElementById('total-income');
  DOM.expense = document.getElementById('stat-value-right') || document.getElementById('total-expense');
  DOM.list = document.getElementById('list');
  DOM.emptyMsg = document.getElementById('empty-msg');
  DOM.fBalance = document.getElementById('filtered-balance');
  DOM.fInc = document.getElementById('filtered-inc');
  DOM.fExp = document.getElementById('filtered-exp');
  DOM.breakdown = document.getElementById('breakdown-list');
  DOM.insightsCard = document.getElementById('insights-card-element');
  DOM.insightsTitle = document.getElementById('insights-title');
  DOM.insightsText = document.getElementById('insights-text');
  DOM.searchInput = document.getElementById('search-input');
  
  if(DOM.searchInput) {
    DOM.searchInput.addEventListener('input', debounce(() => { applyFilters(); }, 200));
  }
}

// ==========================================
// 3. UTILITIES & HELPERS
// ==========================================

function toggleWealthView(view) {
    currentWealthView = view;
    const btnCash = document.getElementById('view-toggle-cash');
    const btnNW = document.getElementById('view-toggle-networth');

    if(btnCash && btnNW) {
        if(view === 'cash') {
            btnCash.style.background = 'rgba(255,255,255,0.2)';
            btnCash.style.color = 'white';
            btnNW.style.background = 'transparent';
            btnNW.style.color = 'rgba(255,255,255,0.7)';
        } else {
            btnNW.style.background = 'rgba(255,255,255,0.2)';
            btnNW.style.color = 'white';
            btnCash.style.background = 'transparent';
            btnCash.style.color = 'rgba(255,255,255,0.7)';
        }
    }
    
    if (typeof fetchAndDisplay === 'function') fetchAndDisplay();
}

function formatToIndianRupee(number) { 
    return Number(number).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); 
}

function parseIndianCommaStringToFloat(strValue) { 
    if (!strValue) return 0; 
    const cleanString = strValue.toString().replace(/,/g, '').trim(); 
    return parseFloat(cleanString); 
}

function maskInputToIndianCommas(inputField) {
  let rawValue = inputField.value.replace(/[^0-9.]/g, ''); 
  const splitParts = rawValue.split('.');
  let integerPart = splitParts[0]; 
  let decimalPart = splitParts.length > 1 ? '.' + splitParts[1].substring(0, 2) : '';
  
  if (integerPart) { 
      let numObj = parseFloat(integerPart); 
      if (!isNaN(numObj)) { 
          integerPart = numObj.toLocaleString('en-IN', { maximumFractionDigits: 0 }); 
      } 
  }
  inputField.value = integerPart + decimalPart;
}

function formatTo12HourTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
  }).toUpperCase();
}

function triggerSuccessNotification(msg) {
  const toast = document.getElementById('success-toast'); 
  document.getElementById('toast-message').innerText = msg;
  toast.classList.add('toast-visible'); 
  setTimeout(() => { toast.classList.remove('toast-visible'); }, 2000);
}

function triggerNativeAppAlert(messageText) {
  document.getElementById('app-alert-message').innerText = messageText; 
  document.getElementById('app-alert-modal').style.display = 'flex';
}

function closeModal(id) { 
    document.getElementById(id).style.display = 'none'; 
    document.body.style.overflow = ''; 
}

function debounce(callbackFunc, waitingDelayDuration) {
  let timerAllocationId; 
  return (...executionArguments) => { 
      clearTimeout(timerAllocationId); 
      timerAllocationId = setTimeout(() => { callbackFunc.apply(this, executionArguments); }, waitingDelayDuration); 
  };
}

window.addEventListener('scroll', () => {
  if (currentActiveMainScreen === 'logs') { 
      const topBtn = document.getElementById('scroll-top-trigger'); 
      if (window.scrollY > 200) topBtn.classList.add('scroll-visible'); 
      else topBtn.classList.remove('scroll-visible'); 
  }
});

function scrollToLogsTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openPreferencesModal() { 
  if (typeof refreshImportHistoryUI === 'function') refreshImportHistoryUI();
  if (typeof renderObligationsList === 'function') renderObligationsList();
  if (typeof syncCategoriesDropdownSelectorsUI === 'function') syncCategoriesDropdownSelectorsUI(); 
  
  document.getElementById('preferences-modal').style.display = 'block'; 
  document.body.style.overflow = 'hidden'; 
}

function togglePrivacyMode() {
    isPrivacyMode = !isPrivacyMode;
    localStorage.setItem('finwise-privacy', isPrivacyMode);
    
    const btn = document.getElementById('privacy-toggle-btn');
    const showSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const hideSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
    
    if (btn) btn.innerHTML = isPrivacyMode ? hideSvg : showSvg;
    
    applyFilters(); 
    if (currentActiveMainScreen === 'compare') runPeriodComparison();
}

// ==========================================
// 4. CATEGORY MANAGER & DYNAMIC EMOJI ENGINE
// ==========================================
const systemDefaultCategoriesPreset = ["Food & Dining", "Shopping", "Utilities & Bills", "Transport & Fuel", "Business", "Miscellaneous"];
let workspaceActiveExpenseCategories = [];

function getCategoryStyle(catName) {
  const catMap = {
    'Food & Dining': { icon: '🍔', color: 'var(--expense)', bg: 'rgba(220, 38, 38, 0.1)' },
    'Food': { icon: '🍔', color: 'var(--expense)', bg: 'rgba(220, 38, 38, 0.1)' },
    'Utilities & Bills': { icon: '💡', color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.1)' },
    'Utilities': { icon: '💡', color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.1)' },
    'Entertainment': { icon: '🍿', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
    'Transport & Fuel': { icon: '🚗', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
    'Travel': { icon: '🚗', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
    'Shopping': { icon: '🛍️', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.1)' },
    'Salary': { icon: '💰', color: 'var(--income)', bg: 'rgba(22, 163, 74, 0.1)' },
    'Freelance': { icon: '💻', color: 'var(--income)', bg: 'rgba(22, 163, 74, 0.1)' },
    'Bonus': { icon: '✨', color: 'var(--income)', bg: 'rgba(22, 163, 74, 0.1)' },
    'Business': { icon: '💼', color: 'var(--income)', bg: 'rgba(22, 163, 74, 0.1)' },
    'Other Income': { icon: '🔄', color: 'var(--income)', bg: 'rgba(22, 163, 74, 0.1)' },
    'Share Market': { icon: '📈', color: 'var(--save)', bg: 'rgba(99, 102, 241, 0.1)' },
    'Mutual Funds': { icon: '📊', color: 'var(--save)', bg: 'rgba(99, 102, 241, 0.1)' },
    'Bank Savings': { icon: '🏦', color: 'var(--save)', bg: 'rgba(99, 102, 241, 0.1)' },
    'Other Investments': { icon: '💎', color: 'var(--save)', bg: 'rgba(99, 102, 241, 0.1)' },
    'Miscellaneous': { icon: '📦', color: 'var(--text-muted)', bg: 'var(--badge-bg)' }
  };
  
  if (catMap[catName]) return { ...catMap[catName], cleanName: catName };

  const emojiRegex = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
  const match = catName.match(emojiRegex);
  
  if (match && match[0]) {
      return { 
          icon: match[0], 
          cleanName: catName.replace(emojiRegex, '').trim() || catName,
          color: 'var(--primary)', 
          bg: 'rgba(46, 125, 50, 0.1)' 
      };
  }
  
  return { icon: '🏷️', cleanName: catName, color: 'var(--primary)', bg: 'rgba(46, 125, 50, 0.1)' };
}

function initializeCategoriesStorageSystem() {
  const records = localStorage.getItem('finwise-custom-expense-tags');
  if(records) { 
      workspaceActiveExpenseCategories = JSON.parse(records); 
  } else { 
      workspaceActiveExpenseCategories = [...systemDefaultCategoriesPreset]; 
      localStorage.setItem('finwise-custom-expense-tags', JSON.stringify(workspaceActiveExpenseCategories)); 
  }
  syncCategoriesDropdownSelectorsUI();
}

function syncCategoriesDropdownSelectorsUI() {
  const editSelect = document.getElementById('edit-expense-category');
  const obSelect = document.getElementById('ob-category');
  
  let fragMarkupOptions = "";
  for (let i = 0, len = workspaceActiveExpenseCategories.length; i < len; i++) { 
      let cat = workspaceActiveExpenseCategories[i]; 
      fragMarkupOptions += `<option value="${cat}">${cat}</option>`; 
  }
  if(editSelect) editSelect.innerHTML = fragMarkupOptions;
  if(obSelect) obSelect.innerHTML = fragMarkupOptions;
}

function openCategoryManagerModal() {
  const container = document.getElementById('category-tags-list-container'); 
  if (!container) return;
  
  const frag = document.createDocumentFragment();
  workspaceActiveExpenseCategories.forEach((cat, idx) => {
    const row = document.createElement('div'); 
    row.style.display = "flex"; 
    row.style.justifyContent = "space-between"; 
    row.style.alignItems = "center"; 
    row.style.padding = "6px 4px"; 
    row.style.borderBottom = "1px solid var(--border)"; 
    row.style.fontSize = "0.85rem";
    
    const isSystemPreset = systemDefaultCategoriesPreset.includes(cat);
    row.innerHTML = `<span>${cat}</span> ${isSystemPreset ? '<small style="color:var(--text-muted); font-size:0.65rem; font-weight:bold;">PRESET</small>' : `<span style="color:var(--expense); font-weight:bold; cursor:pointer;" onclick="executeDeleteCustomCategoryTag(${idx})">Remove</span>`}`;
    frag.appendChild(row);
  });
  
  container.innerHTML = ""; 
  container.appendChild(frag);
  document.getElementById('new-custom-tag-input').value = ""; 
  document.getElementById('category-manager-modal').style.display = 'flex';
}

function executeSaveNewCustomCategoryTag() {
  const tagVal = document.getElementById('new-custom-tag-input').value.trim();
  if(!tagVal) { 
      triggerNativeAppAlert("Please enter a valid category name."); 
      return; 
  }
  if(workspaceActiveExpenseCategories.includes(tagVal)) { 
      triggerNativeAppAlert("This category already exists."); 
      return; 
  }
  
  workspaceActiveExpenseCategories.push(tagVal); 
  localStorage.setItem('finwise-custom-expense-tags', JSON.stringify(workspaceActiveExpenseCategories));
  syncCategoriesDropdownSelectorsUI(); 
  openCategoryManagerModal(); 
  
  if (document.getElementById('lightning-add-modal').style.display === 'block' || document.getElementById('lightning-add-modal').style.display === 'flex') {
      renderLightningCategoryChips();
  }

  triggerSuccessNotification("Category added!");
}

function executeDeleteCustomCategoryTag(indexPointer) {
  workspaceActiveExpenseCategories.splice(indexPointer, 1); 
  localStorage.setItem('finwise-custom-expense-tags', JSON.stringify(workspaceActiveExpenseCategories));
  syncCategoriesDropdownSelectorsUI(); 
  openCategoryManagerModal(); 
  
  if (document.getElementById('lightning-add-modal').style.display === 'block' || document.getElementById('lightning-add-modal').style.display === 'flex') {
      renderLightningCategoryChips();
  }
  applyFilters();
}

// ==========================================
// 5. DASHBOARD CYCLE & BASELINE
// ==========================================
function toggleDashboardConfigPanel() {
  const displaySheet = document.getElementById('dashboard-config-display-sheet'); 
  const fieldsSheet = document.getElementById('dashboard-config-fields-sheet'); 
  const actionBtn = document.getElementById('dashboard-config-toggle-btn');
  const now = new Date(); 
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  
  if(fieldsSheet.style.display === 'none') {
    displaySheet.style.display = 'none'; 
    fieldsSheet.style.display = 'block'; 
    
    actionBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Cancel`;
    
    document.getElementById('dash-cycle-day-input').max = daysInMonth; 
    document.getElementById('dash-cycle-day-input').value = localStorage.getItem('finwise-cycle-day') || '1';
    document.getElementById('dash-budget-limit-input').value = localStorage.getItem('finwise-budget-limit') || '';
    document.getElementById('dash-op-bal-input').value = localStorage.getItem('finwise-op-bal') || ''; 
    document.getElementById('dash-cl-bal-input').value = localStorage.getItem('finwise-cl-bal') || '';
  } else { 
    displaySheet.style.display = 'block'; 
    fieldsSheet.style.display = 'none'; 
    actionBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit`; 
  }
}

function saveDashboardCycleAndBaselineConfig() {
  const cycleInput = document.getElementById('dash-cycle-day-input'); 
  const maxDays = parseInt(cycleInput.max) || 31; 
  let day = parseInt(cycleInput.value);
  
  if (isNaN(day) || day < 1 || day > maxDays) { 
      triggerNativeAppAlert(`Please enter a valid start date between 1 and ${maxDays}.`); 
      return; 
  }
  
  localStorage.setItem('finwise-cycle-day', day); 
  localStorage.setItem('finwise-budget-limit', document.getElementById('dash-budget-limit-input').value.trim());
  localStorage.setItem('finwise-op-bal', document.getElementById('dash-op-bal-input').value.trim()); 
  localStorage.setItem('finwise-cl-bal', document.getElementById('dash-cl-bal-input').value.trim());
  
  document.getElementById('dashboard-config-display-sheet').style.display = 'block'; 
  document.getElementById('dashboard-config-fields-sheet').style.display = 'none'; 
  
  document.getElementById('dashboard-config-toggle-btn').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit`;
  
  triggerSuccessNotification("Budget settings updated!"); 
  applyFilters();
}

// ==========================================
// 6. LIGHTNING ADD (CUSTOM NUMPAD ENGINE)
// ==========================================

function openLightningAdd() {
    lightningAmountStr = "0";
    lightningNature = "expense";
    lightningSelectedCategory = "";
    document.getElementById('lightning-desc').value = "";
    
    if (typeof populateGoalDropdowns === 'function') {
        populateGoalDropdowns();
    }
    
    setLightningNature('expense');
    updateLightningDisplay();
    
    document.getElementById('lightning-add-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function setLightningNature(nature) {
    lightningNature = nature;
    const container = document.getElementById('lightning-nature-slider');
    const goalContainer = document.getElementById('lightning-goal-link-container');
    const display = document.getElementById('lightning-amount-display');
    
    container.classList.remove('nature-expense', 'nature-income', 'nature-save');
    
    if (nature === 'income') {
        container.classList.add('nature-income');
        display.style.color = 'var(--income)';
        if(goalContainer) goalContainer.style.display = 'none';
    } else if (nature === 'save') {
        container.classList.add('nature-save');
        display.style.color = 'var(--save)';
        if(goalContainer) goalContainer.style.display = 'flex'; 
    } else {
        container.classList.add('nature-expense');
        display.style.color = 'var(--expense)';
        if(goalContainer) goalContainer.style.display = 'none';
    }
    
    renderLightningCategoryChips();
}

function renderLightningCategoryChips() {
    const container = document.getElementById('lightning-category-chips');
    if (!container) return;
    container.innerHTML = "";
    lightningSelectedCategory = ""; 
    
    let categories = [];
    if (lightningNature === 'income') {
        categories = ["Salary", "Freelance", "Bonus", "Business", "Other Income"];
    } else if (lightningNature === 'save') {
        categories = ["Share Market", "Mutual Funds", "Bank Savings", "Other Investments"];
    } else {
        categories = workspaceActiveExpenseCategories; 
    }
    
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = "quick-chip";
        const styleObj = getCategoryStyle(cat);
        btn.innerHTML = `${styleObj.icon} ${styleObj.cleanName}`;
        btn.onclick = (e) => {
            e.preventDefault();
            selectLightningChip(btn, cat);
        };
        container.appendChild(btn);
    });
}

function selectLightningChip(btnElement, catName) {
    document.querySelectorAll('.quick-chip').forEach(c => c.classList.remove('selected'));
    btnElement.classList.add('selected');
    lightningSelectedCategory = catName;
}

function handleLightningNumpad(val) {
    if (lightningAmountStr === "0" && val !== ".") {
        lightningAmountStr = val;
    } else {
        if(val === '.' && lightningAmountStr.includes('.')) return;
        
        if (lightningAmountStr.includes('.') && val !== '.') {
            const parts = lightningAmountStr.split('.');
            if (parts[1] && parts[1].length >= 2) return; 
        }

        if(lightningAmountStr.length > 10) return; 
        
        lightningAmountStr += val;
    }
    updateLightningDisplay();
}

function handleLightningBackspace() {
    if (lightningAmountStr.length <= 1) {
        lightningAmountStr = "0";
    } else {
        lightningAmountStr = lightningAmountStr.slice(0, -1);
    }
    updateLightningDisplay();
}

function updateLightningDisplay() {
    const num = parseFloat(lightningAmountStr);
    const display = document.getElementById('lightning-amount-display');
    
    if(isNaN(num)) {
        display.innerText = "₹0";
    } else {
        let prefix = "₹";
        if(lightningAmountStr.endsWith('.')) {
            display.innerText = prefix + num.toLocaleString('en-IN') + '.';
        } else if (lightningAmountStr.includes('.')) {
            const parts = lightningAmountStr.split('.');
            display.innerText = prefix + parseInt(parts[0]).toLocaleString('en-IN') + '.' + parts[1];
        } else {
            display.innerText = prefix + num.toLocaleString('en-IN');
        }
    }
}

function executeLightningSave() {
    const amount = parseFloat(lightningAmountStr);
    let text = document.getElementById('lightning-desc').value.trim() || 'Quick Entry';
    
    if(isNaN(amount) || amount <= 0) {
        triggerNativeAppAlert("Please enter an amount greater than 0.");
        return;
    }
    
    if(!lightningSelectedCategory) {
        triggerNativeAppAlert("Please select a category for this entry.");
        return;
    }
    
    const today = new Date(); 
    const istDateFormatted = today.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const istDateStringForFiltering = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
    
    const finalAmount = (lightningNature === 'expense' || lightningNature === 'save') ? -amount : amount;
    
    const linkedGoalDropdown = document.getElementById('lightning-linked-goal');
    const linkedGoal = (lightningNature === 'save' && linkedGoalDropdown) ? linkedGoalDropdown.value : null;
    
    const tx = db.transaction("transactions", "readwrite"); 
    const store = tx.objectStore("transactions");
    
    store.add({ 
        text: text, 
        amount: finalAmount, 
        type: lightningNature,
        category: lightningSelectedCategory, 
        linkedGoal: linkedGoal,
        date: istDateFormatted, 
        timestamp: today.getTime(), 
        dateString: istDateStringForFiltering 
    });
    
    tx.oncomplete = () => { 
        closeModal('lightning-add-modal');
        fetchAndDisplay(); 
        if (linkedGoalDropdown) linkedGoalDropdown.value = "";
        triggerSuccessNotification("Saved successfully"); 
    };
}

// ==========================================
// 7. FILTERS & DISPLAY LOGIC
// ==========================================
function fetchAndDisplay() { 
    const tx = db.transaction("transactions", "readonly"); 
    tx.objectStore("transactions").getAll().onsuccess = (e) => { 
        allTransactions = e.target.result || []; 
        applyFilters(); 
        
        if (typeof renderGoals === 'function') {
            renderGoals();
        }
    }; 
}

function switchTab(tabName, element) { 
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); 
    element.classList.add('active'); 
    currentTab = tabName; 
    dateOffset = 0; 
    document.getElementById('start-date').value = ''; 
    document.getElementById('end-date').value = ''; 
    applyFilters(); 
}

function adjustPeriodOffset(direction) { 
    if (currentTab === 'all' || currentTab === 'custom') return; 
    dateOffset += direction; 
    applyFilters(); 
}

function getCalculatedPeriodBounds() {
  let startDate = new Date(); 
  let endDate = new Date(); 
  const cycleDay = parseInt(localStorage.getItem('finwise-cycle-day') || '1');
  
  if (currentTab === 'daily') { 
      startDate.setDate(startDate.getDate() + dateOffset); 
      startDate.setHours(0, 0, 0, 0); 
      endDate.setDate(endDate.getDate() + dateOffset); 
      endDate.setHours(23, 59, 59, 999); 
  } 
  else if (currentTab === 'weekly') { 
      let relativeEnd = new Date(); 
      relativeEnd.setDate(relativeEnd.getDate() + (dateOffset * 7)); 
      let relativeStart = new Date(relativeEnd); 
      relativeStart.setDate(relativeEnd.getDate() - 6); 
      relativeStart.setHours(0, 0, 0, 0); 
      relativeEnd.setHours(23, 59, 59, 999); 
      startDate = relativeStart; 
      endDate = relativeEnd; 
  } 
  else if (currentTab === 'monthly') {
    let baseDate = new Date(); 
    baseDate.setMonth(baseDate.getMonth() + dateOffset); 
    let year = baseDate.getFullYear(); 
    let month = baseDate.getMonth(); 
    let currentAnchorToday = new Date();
    
    if (dateOffset === 0) { 
        if (currentAnchorToday.getDate() < cycleDay) { 
            startDate = new Date(year, month - 1, cycleDay); 
            endDate = new Date(year, month, cycleDay - 1); 
        } else { 
            startDate = new Date(year, month, cycleDay); 
            endDate = new Date(year, month + 1, cycleDay - 1); 
        } 
    } 
    else { 
        let evaluatedStart = new Date(currentAnchorToday.getFullYear(), currentAnchorToday.getMonth() + dateOffset, cycleDay); 
        if (currentAnchorToday.getDate() < cycleDay) { 
            evaluatedStart = new Date(currentAnchorToday.getFullYear(), currentAnchorToday.getMonth() + dateOffset - 1, cycleDay); 
        } 
        startDate = evaluatedStart; 
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate() - 1); 
    }
    startDate.setHours(0, 0, 0, 0); 
    endDate.setHours(23, 59, 59, 999);
  }
  return { startDate, endDate };
}

function applyFilters() {
  if(!DOM.searchInput) return; 
  
  const searchQuery = DOM.searchInput.value.toLowerCase(); 
  const filterNature = document.getElementById('filter-nature').value; 
  const startDateVal = document.getElementById('start-date').value; 
  const endDateVal = document.getElementById('end-date').value;
  
  const navContainer = document.getElementById('period-nav-container'); 
  const customContainer = document.getElementById('custom-range-container'); 
  const displayLabel = document.getElementById('period-display-label'); 
  const bounds = getCalculatedPeriodBounds();
  
  if (currentTab === 'all') { 
      navContainer.style.display = 'none'; 
      customContainer.style.display = 'none'; 
  } 
  else if (currentTab === 'custom') { 
      navContainer.style.display = 'none'; 
      customContainer.style.display = 'block'; 
  } 
  else {
    navContainer.style.display = 'flex'; 
    customContainer.style.display = 'none'; 
    const labelOptions = { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' };
    
    if (currentTab === 'monthly') { 
        displayLabel.innerText = `${bounds.startDate.toLocaleDateString('en-IN', {month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata'})} (${bounds.startDate.getDate()} - ${bounds.endDate.getDate()})`; 
    } 
    else if (currentTab === 'daily') { 
        displayLabel.innerText = bounds.startDate.toLocaleDateString('en-IN', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata'}); 
    } 
    else { 
        displayLabel.innerText = `${bounds.startDate.toLocaleDateString('en-IN', labelOptions)} - ${bounds.endDate.toLocaleDateString('en-IN', labelOptions)}`; 
    }
  }

  let startBoundaryTime = bounds.startDate.getTime(); 
  let endBoundaryTime = bounds.endDate.getTime();

  let filtered = allTransactions.filter(t => {
    let tDate = t.timestamp ? new Date(t.timestamp) : new Date(); 
    const itemTimestamp = tDate.getTime(); 
    
    const itemDateString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(tDate);
    
    if (currentTab === 'custom') { 
        if (startDateVal && itemDateString < startDateVal) return false; 
        if (endDateVal && itemDateString > endDateVal) return false; 
    } 
    else if (currentTab !== 'all') { 
        if (itemTimestamp < startBoundaryTime || itemTimestamp > endBoundaryTime) return false; 
    }
    
    if (searchQuery && !t.text.toLowerCase().includes(searchQuery)) return false;
    
    const txType = t.type || (t.amount < 0 ? 'expense' : 'income');
    
    if (filterNature === 'income' && txType !== 'income') return false; 
    if (filterNature === 'expense' && txType !== 'expense') return false;
    if (filterNature === 'save' && txType !== 'save') return false;
    
    return true;
  });

  currentVisibleIds = filtered.map(t => t.id); 
  document.getElementById('master-select-label').style.display = filtered.length > 0 ? "flex" : "none";
  
  const masterCheckbox = document.getElementById('master-checkbox'); 
  masterCheckbox.checked = currentVisibleIds.length > 0 && currentVisibleIds.every(id => checkedItemIds.includes(id));
  
  let fBalance = 0, fIncome = 0, fExpense = 0; 
  filtered.forEach(t => { 
      const txType = t.type || (t.amount < 0 ? 'expense' : 'income');
      
      fBalance += t.amount; 
      
      if (txType === 'income') fIncome += t.amount; 
      if (txType === 'expense') fExpense += Math.abs(t.amount); 
  });

  DOM.fBalance.innerText = isPrivacyMode ? '₹ ••••••' : `${fBalance >= 0 ? '' : '-'}₹${formatToIndianRupee(Math.abs(fBalance))}`; 
  DOM.fBalance.className = fBalance >= 0 ? 'amt-inc' : 'amt-exp'; 
  DOM.fInc.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(fIncome)}`; 
  DOM.fExp.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(fExpense)}`;

  renderUI(filtered); 
  calculateMasterSummaryTotals(allTransactions); 
  renderPercentageBreakdown(filtered); 
  generateSmartInsights(filtered); 
  syncToolbarState();
  
  if (currentActiveMainScreen === 'insights') {
    setTimeout(() => renderChart(filtered), 10);
  }
}

// ==========================================
// 8. LIST ACTIONS & SUMMARY RENDERING
// ==========================================

function updateMasterBalanceCard(allTx, allObs) {
    let totalIncome = 0;
    let totalExpense = 0;
    let totalSaved = 0;

    allTx.forEach(t => {
        const amt = parseFloat(t.amount);
        if (t.type === 'income') totalIncome += amt;
        if (t.type === 'expense') totalExpense += Math.abs(amt);
        if (t.type === 'save') totalSaved += Math.abs(amt);
    });

    const liquidBalance = totalIncome - totalExpense - totalSaved;

    let totalDebt = 0;
    allObs.forEach(ob => {
        // FIXED: Parsing the comma string so that Debt actually adds up correctly
        let pAmt = parseIndianCommaStringToFloat(ob.principal);
        if (ob.type === 'EMI' && ob.status !== 'archived' && pAmt > 0) {
            totalDebt += pAmt;
        }
    });

    const totalAssets = liquidBalance + totalSaved;
    const netWorth = totalAssets - totalDebt;

    const balEl = document.getElementById('balance');
    const valLeft = document.getElementById('stat-value-left') || document.getElementById('total-income');
    const valRight = document.getElementById('stat-value-right') || document.getElementById('total-expense');
    const labelLeft = document.getElementById('stat-label-left');
    const labelRight = document.getElementById('stat-label-right');
    const titleLabel = document.getElementById('master-balance-label');

    if (currentWealthView === 'cash') {
        if (titleLabel) titleLabel.innerText = "Total Liquid Balance";
        if (labelLeft) labelLeft.innerText = "INCOME";
        if (labelRight) labelRight.innerText = "EXPENSES";
        
        if(balEl) balEl.innerText = isPrivacyMode ? '₹••••' : `₹${formatToIndianRupee(liquidBalance)}`;
        if(valLeft) valLeft.innerText = isPrivacyMode ? '₹••••' : `₹${formatToIndianRupee(totalIncome)}`;
        if(valRight) valRight.innerText = isPrivacyMode ? '₹••••' : `₹${formatToIndianRupee(totalExpense)}`;
    } else {
        if (titleLabel) titleLabel.innerText = "Total Net Worth";
        if (labelLeft) labelLeft.innerText = "TOTAL ASSETS";
        if (labelRight) labelRight.innerText = "TOTAL DEBT";
        
        if(balEl) balEl.innerText = isPrivacyMode ? '₹••••' : `₹${formatToIndianRupee(netWorth)}`;
        if(valLeft) valLeft.innerText = isPrivacyMode ? '₹••••' : `₹${formatToIndianRupee(totalAssets)}`;
        if(valRight) valRight.innerText = isPrivacyMode ? '₹••••' : `₹${formatToIndianRupee(totalDebt)}`;
    }
}

function calculateMasterSummaryTotals(masterArray) {
  let openingBalanceBaseline = parseIndianCommaStringToFloat(localStorage.getItem('finwise-op-bal') || '0'); 
  let closingBalanceTarget = localStorage.getItem('finwise-cl-bal') ? parseIndianCommaStringToFloat(localStorage.getItem('finwise-cl-bal')) : null; 
  let cycleDayValueSetting = localStorage.getItem('finwise-cycle-day') || '1'; 
  let manualBudgetLimitSetting = parseIndianCommaStringToFloat(localStorage.getItem('finwise-budget-limit') || '0');
  
  let balance = openingBalanceBaseline, income = 0, expense = 0, saved = 0;
  
  masterArray.forEach(t => { 
      const txType = t.type || (t.amount < 0 ? 'expense' : 'income');
      
      balance += t.amount; 
      
      if (txType === 'income') income += t.amount; 
      if (txType === 'expense') expense += Math.abs(t.amount); 
      if (txType === 'save') saved += Math.abs(t.amount); 
  });
  
  const titleLabel = document.getElementById('master-balance-label');
  const labelLeft = document.getElementById('stat-label-left');
  const labelRight = document.getElementById('stat-label-right');
  
  if (currentWealthView === 'cash') {
      if (titleLabel) titleLabel.innerText = "Total Liquid Balance";
      if (labelLeft) labelLeft.innerText = "INCOME";
      if (labelRight) labelRight.innerText = "EXPENSES";
  } else {
      if (titleLabel) titleLabel.innerText = "Total Net Worth";
      if (labelLeft) labelLeft.innerText = "TOTAL ASSETS";
      if (labelRight) labelRight.innerText = "TOTAL DEBT";
  }

  // Phase 4 Math Engine - Calculating Net Worth (Assets - Debt)
  if (window.db && db.objectStoreNames.contains("obligations")) {
      const tx = db.transaction("obligations", "readonly");
      tx.objectStore("obligations").getAll().onsuccess = (e) => {
          const allObs = e.target.result || [];
          let totalDebt = 0;
          
          allObs.forEach(ob => {
              // FIXED: Correctly parse comma strings for Debt calculations
              let parsedPrincipal = parseIndianCommaStringToFloat(ob.principal);
              if (ob.type === 'EMI' && ob.status !== 'archived' && parsedPrincipal > 0) {
                  totalDebt += parsedPrincipal;
              }
          });

          const totalAssets = balance + saved;
          const netWorth = totalAssets - totalDebt;

          if (currentWealthView === 'cash') {
              if(DOM.balance) DOM.balance.innerText = isPrivacyMode ? '₹ ••••••' : `${balance >= 0 ? '' : '-'}₹${formatToIndianRupee(Math.abs(balance))}`;
              if (DOM.income) DOM.income.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(income)}`;
              if (DOM.expense) DOM.expense.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(expense)}`;
          } else {
              if(DOM.balance) DOM.balance.innerText = isPrivacyMode ? '₹ ••••••' : `${netWorth >= 0 ? '' : '-'}₹${formatToIndianRupee(Math.abs(netWorth))}`;
              if (DOM.income) DOM.income.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(totalAssets)}`;
              if (DOM.expense) DOM.expense.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(totalDebt)}`;
          }
      };
  } else {
      const totalAssets = balance + saved;
      const netWorth = totalAssets;

      if (currentWealthView === 'cash') {
          if(DOM.balance) DOM.balance.innerText = isPrivacyMode ? '₹ ••••••' : `${balance >= 0 ? '' : '-'}₹${formatToIndianRupee(Math.abs(balance))}`;
          if (DOM.income) DOM.income.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(income)}`;
          if (DOM.expense) DOM.expense.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(expense)}`;
      } else {
          if(DOM.balance) DOM.balance.innerText = isPrivacyMode ? '₹ ••••••' : `${netWorth >= 0 ? '' : '-'}₹${formatToIndianRupee(Math.abs(netWorth))}`;
          if (DOM.income) DOM.income.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(totalAssets)}`;
          if (DOM.expense) DOM.expense.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(0)}`;
      }
  }

  const velocityWrapper = document.getElementById('budget-velocity-tracker'); 
  const velocityTitle = document.getElementById('velocity-title-label'); 
  const velocityLabel = document.getElementById('velocity-percentage-label'); 
  const velocityFill = document.getElementById('velocity-progress-bar-fill');
  
  let computationalLimitAnchor = manualBudgetLimitSetting > 0 ? manualBudgetLimitSetting : income;

  if (computationalLimitAnchor > 0) {
    if(velocityWrapper) velocityWrapper.style.display = 'block'; 
    if(velocityTitle) velocityTitle.innerText = manualBudgetLimitSetting > 0 ? "MONTHLY SPENDING LIMIT" : "INCOME SPENT";
    let velocityPercentageValue = (expense / computationalLimitAnchor) * 100; 
    
    if(velocityLabel) velocityLabel.innerText = isPrivacyMode ? `••% SPENT` : `${Math.round(velocityPercentageValue)}% SPENT`; 
    if(velocityFill) velocityFill.style.width = `${Math.min(velocityPercentageValue, 100)}%`;
    
    if (velocityPercentageValue >= 85) { 
        if(velocityFill) velocityFill.style.backgroundColor = '#f87171'; 
        if(velocityFill) velocityFill.style.boxShadow = '0 0 10px rgba(248, 113, 113, 0.4)'; 
    } 
    else if (velocityPercentageValue >= 70) { 
        if(velocityFill) velocityFill.style.backgroundColor = '#fbbf24'; 
        if(velocityFill) velocityFill.style.boxShadow = '0 0 10px rgba(251, 191, 36, 0.4)'; 
    } 
    else { 
        if(velocityFill) velocityFill.style.backgroundColor = '#ffffff'; 
        if(velocityFill) velocityFill.style.boxShadow = '0 0 8px rgba(255, 255, 255, 0.4)'; 
    }
  } else { 
      if(velocityWrapper) velocityWrapper.style.display = 'none'; 
  }

  const widgetCard = document.getElementById('reconcile-status-widget'); 
  const displaySheet = document.getElementById('dashboard-config-display-sheet'); 
  const fieldsSheet = document.getElementById('dashboard-config-fields-sheet'); 
  const actionLinkBtn = document.getElementById('dashboard-config-toggle-btn'); 
  const titleHeaderSpan = document.getElementById('config-card-header-title');
  
  let suffixMarker = "th"; 
  if(cycleDayValueSetting == '1') suffixMarker = "st"; 
  else if(cycleDayValueSetting == '2') suffixMarker = "nd"; 
  else if(cycleDayValueSetting == '3') suffixMarker = "rd";
  
  if(!widgetCard) return;

  const recCycleLabel = document.getElementById('rec-cycle-label');
  const recBudgetLabel = document.getElementById('rec-budget-label');
  const recOpLabel = document.getElementById('rec-op-label');

  if(recCycleLabel) recCycleLabel.innerText = `${cycleDayValueSetting}${suffixMarker} of the Month`; 
  
  if(recBudgetLabel) {
      recBudgetLabel.innerText = manualBudgetLimitSetting > 0 ? 
          (isPrivacyMode ? '₹ •••••• (Fixed)' : `₹${formatToIndianRupee(manualBudgetLimitSetting).split('.')[0]} (Fixed limit)`) 
          : "Not Set (Using Income)"; 
  }
      
  if(recOpLabel) recOpLabel.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(openingBalanceBaseline)}`;

  const SETTINGS_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

  if(!localStorage.getItem('finwise-op-bal') && fieldsSheet && fieldsSheet.style.display === 'none') {
    widgetCard.style.display = 'block'; 
    if(displaySheet) displaySheet.style.display = 'none'; 
    if(fieldsSheet) fieldsSheet.style.display = 'block'; 
    if(actionLinkBtn) actionLinkBtn.style.display = 'none'; 
    
    if(titleHeaderSpan) titleHeaderSpan.innerHTML = `${SETTINGS_ICON_SVG} Setup Monthly Budget`;
  } else {
    widgetCard.style.display = 'block'; 
    if(actionLinkBtn) actionLinkBtn.style.display = 'inline-flex';
    
    if(titleHeaderSpan) {
        if(fieldsSheet && fieldsSheet.style.display === 'none') { 
            titleHeaderSpan.innerHTML = `${SETTINGS_ICON_SVG} Monthly Budget Setup`; 
        } else { 
            titleHeaderSpan.innerHTML = `${SETTINGS_ICON_SVG} Edit Configuration`; 
        }
    }
    
    const svgBalanced = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:middle; margin-left:2px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
    const svgAlert = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:middle; margin-left:2px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    
    const recClLabel = document.getElementById('rec-cl-label');
    const diffTitle = document.getElementById('rec-diff-title');
    const diffLabel = document.getElementById('rec-diff-label');

    if(closingBalanceTarget !== null) {
      if(recClLabel) recClLabel.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(closingBalanceTarget)}`; 
      let variance = balance - closingBalanceTarget; 
      
      if(Math.abs(variance) < 0.01) { 
          if(diffTitle) diffTitle.innerHTML = `Budget Status: <span class="reconcile-status-badge" style="background-color: rgba(22, 163, 74, 0.2); color: var(--income);">On Track ${svgBalanced}</span>`; 
          if(diffLabel) {
              diffLabel.innerText = "Perfect Match"; 
              diffLabel.className = "amt-inc"; 
          }
      } 
      else { 
          if(diffTitle) diffTitle.innerHTML = `Budget Status: <span class="reconcile-status-badge" style="background-color: rgba(220, 38, 38, 0.1); color: var(--expense);">Off Target ${svgAlert}</span>`; 
          if(diffLabel) {
              diffLabel.innerText = isPrivacyMode ? '₹ ••••••' : `${variance >= 0 ? '+' : '-'}₹${formatToIndianRupee(Math.abs(variance))}`; 
              diffLabel.className = variance >= 0 ? "amt-inc" : "amt-exp"; 
          }
      }
    } else {
      if(recClLabel) recClLabel.innerText = "Not Configured"; 
      if(diffTitle) diffTitle.innerHTML = `Tracking Status: <span class="reconcile-status-badge" style="background-color: var(--badge-bg); color: var(--badge-text);">Active</span>`; 
      if(diffLabel) {
          diffLabel.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(balance)}`; 
          diffLabel.className = balance >= 0 ? "amt-inc" : "amt-exp";
      }
    }
  }
}

function renderUI(transactions) {
  const fragmentBuffer = document.createDocumentFragment(); 
  DOM.list.innerHTML = ""; 
  
  if (transactions.length === 0) {
      DOM.emptyMsg.style.display = "flex";
  } else {
      DOM.emptyMsg.style.display = "none";
  }
  
  transactions.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0)).forEach((t, index) => {
    const txType = t.type || (t.amount < 0 ? 'expense' : 'income');
    const baseDateString = t.date || new Date(t.timestamp).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }); 
    const timeMarkerString = t.timestamp ? formatTo12HourTime(t.timestamp) : '12:00:00 AM'; 
    const catLabel = t.category || 'Miscellaneous'; 
    const isChecked = checkedItemIds.includes(t.id);
    const styleObj = getCategoryStyle(catLabel);
    
    let amountClass = 'amt-exp';
    let sign = '-';
    if (txType === 'income') { amountClass = 'amt-inc'; sign = '+'; }
    else if (txType === 'save') { amountClass = 'amt-sav'; sign = '-'; } 
    
    const displayAmount = isPrivacyMode ? '••••••' : `${sign} ₹${formatToIndianRupee(Math.abs(t.amount))}`;
    
    const li = document.createElement('li'); 
    li.style.animationDelay = `${Math.min(index * 0.02, 0.24)}s`; 
    
    li.innerHTML = `
      <input type="checkbox" class="log-checkbox" onchange="handleItemCheckbox(this, ${t.id})" ${isChecked ? 'checked' : ''}>
      <div class="list-icon-wrapper" style="background-color: ${styleObj.bg}; color: ${styleObj.color};">${styleObj.icon}</div>
      <div class="list-content">
        <div class="list-info">
          <h4>${t.text}</h4>
          <small>${baseDateString} • ${timeMarkerString}</small>
        </div>
        <div style="text-align: right;">
          <span class="${amountClass}">${displayAmount}</span>
          <div style="font-size: 0.65rem; font-weight: 700; color: ${styleObj.color}; margin-top: 4px; text-transform: uppercase;">${styleObj.cleanName}</div>
        </div>
      </div>
    `;
    fragmentBuffer.appendChild(li);
  });
  DOM.list.appendChild(fragmentBuffer);
}

function toggleSelectAll(masterBox) { 
    if (masterBox.checked) { 
        currentVisibleIds.forEach(id => { 
            if (!checkedItemIds.includes(id)) checkedItemIds.push(id); 
        }); 
    } else { 
        checkedItemIds = checkedItemIds.filter(id => !currentVisibleIds.includes(id)); 
    } 
    applyFilters(); 
}

function handleItemCheckbox(checkbox, id) { 
    if (checkbox.checked) { 
        if (!checkedItemIds.includes(id)) checkedItemIds.push(id); 
    } else { 
        checkedItemIds = checkedItemIds.filter(item => item !== id); 
    } 
    applyFilters(); 
}

function syncToolbarState() { 
    const toolbar = document.getElementById('toolbar'); 
    const text = document.getElementById('toolbar-text'); 
    if (checkedItemIds.length > 0) { 
        toolbar.style.display = 'flex'; 
        text.innerText = `${checkedItemIds.length} item${checkedItemIds.length > 1 ? 's' : ''} selected`; 
    } else { 
        toolbar.style.display = 'none'; 
    } 
}

function openDeleteModal() { 
    document.getElementById('delete-confirm-input').value = ''; 
    document.getElementById('delete-modal-msg').innerHTML = `You are about to delete the selected entries.`; 
    document.getElementById('delete-modal').style.display = 'flex'; 
}

function confirmBatchDelete() { 
    const verification = document.getElementById('delete-confirm-input').value.trim(); 
    if (verification !== "DELETE") { 
        triggerNativeAppAlert("Incorrect text. Type DELETE to confirm."); 
        return; 
    } 
    const tx = db.transaction("transactions", "readwrite"); 
    const store = tx.objectStore("transactions"); 
    
    checkedItemIds.forEach(id => store.delete(id)); 
    
    tx.oncomplete = () => { 
        checkedItemIds = []; 
        closeModal('delete-modal'); 
        fetchAndDisplay(); 
        triggerSuccessNotification("Deleted Successfully"); 
    }; 
}

function openResetModal() { 
    closeModal('preferences-modal'); 
    document.getElementById('reset-confirm-input').value = ''; 
    document.getElementById('reset-modal').style.display = 'flex'; 
}

function confirmSystemReset() { 
    const verification = document.getElementById('reset-confirm-input').value.trim(); 
    if (verification !== "RESET") { 
        triggerNativeAppAlert("Incorrect text. Type RESET to confirm."); 
        return; 
    } 
    const tx = db.transaction("transactions", "readwrite"); 
    tx.objectStore("transactions").clear(); 
    
    tx.oncomplete = () => { 
        checkedItemIds = []; 
        closeModal('reset-modal'); 
        fetchAndDisplay(); 
        triggerSuccessNotification("App Reset Successfully"); 
    }; 
}

function toggleCategoryInput(context) {
  const typeId = context === 'add' ? 'type' : 'edit-type'; 
  const expId = context === 'add' ? 'expense-cat-container' : 'edit-expense-cat-container'; 
  const incId = context === 'add' ? 'income-cat-container' : 'edit-income-cat-container';
  
  const type = context === 'add' ? activeTransactionNature : document.getElementById(typeId).value;
  
  const expContainer = document.getElementById(expId);
  const incContainer = document.getElementById(incId);
  
  if (expContainer) expContainer.style.display = type === 'income' ? 'none' : 'block'; 
  if (incContainer) incContainer.style.display = type === 'income' ? 'block' : 'none';
}

function openEditModal() {
  const singleContainer = document.getElementById('single-edit-fields'); 
  const desc = document.getElementById('edit-modal-desc');
  
  if (checkedItemIds.length === 1) {
    const target = allTransactions.find(t => t.id === checkedItemIds[0]); 
    if (!target) return;
    
    desc.innerText = "Update your entry details."; 
    singleContainer.style.display = "block"; 
    document.getElementById('edit-text').value = target.text;
    
    const rawAbs = Math.abs(target.amount); 
    const integerPart = Math.floor(rawAbs).toLocaleString('en-IN'); 
    const decimalPart = (rawAbs % 1).toFixed(2).substring(1);
    
    document.getElementById('edit-amount').value = integerPart + decimalPart; 
    
    const txType = target.type || (target.amount < 0 ? 'expense' : 'income');
    const editTypeSelect = document.getElementById('edit-type');
    
    if (!editTypeSelect.querySelector('option[value="save"]')) {
         editTypeSelect.insertAdjacentHTML('beforeend', '<option value="save">Save/Invest</option>');
    }
    editTypeSelect.value = txType;
    
    toggleCategoryInput('edit');
    
    if (txType !== 'income') document.getElementById('edit-expense-category').value = target.category; 
    else document.getElementById('edit-income-category').value = target.category;
    
  } else {
    desc.innerText = `Editing ${checkedItemIds.length} entries at once. You can only change whether they are Income/Expense and their Category.`; 
    singleContainer.style.display = "none"; 
    document.getElementById('edit-type').value = 'expense'; 
    toggleCategoryInput('edit');
  }
  document.getElementById('edit-modal').style.display = 'flex';
}

function saveBatchEdit() {
  const tx = db.transaction("transactions", "readwrite"); 
  const store = tx.objectStore("transactions"); 
  const newType = document.getElementById('edit-type').value; 
  const newCategory = newType === 'income' ? (document.getElementById('edit-income-category').value.trim() || 'Other Income') : document.getElementById('edit-expense-category').value;
  
  if (checkedItemIds.length === 1) {
    const targetId = checkedItemIds[0]; 
    const newText = document.getElementById('edit-text').value.trim(); 
    const newAmtRaw = parseIndianCommaStringToFloat(document.getElementById('edit-amount').value);
    
    if(!newText || isNaN(newAmtRaw) || newAmtRaw <= 0) { 
        triggerNativeAppAlert("Please enter valid details to save."); 
        return; 
    }
    
    store.get(targetId).onsuccess = (e) => { 
        let record = e.target.result; 
        record.text = newText; 
        record.amount = (newType === 'expense' || newType === 'save') ? -newAmtRaw : newAmtRaw; 
        record.type = newType;
        record.category = newCategory; 
        store.put(record); 
    };
  } else {
    checkedItemIds.forEach(id => { 
        store.get(id).onsuccess = (e) => { 
            let record = e.target.result; 
            const rawAbsAmt = Math.abs(record.amount); 
            record.amount = (newType === 'expense' || newType === 'save') ? -rawAbsAmt : rawAbsAmt; 
            record.type = newType;
            record.category = newCategory; 
            store.put(record); 
        }; 
    });
  }
  
  tx.oncomplete = () => { 
      checkedItemIds = []; 
      closeModal('edit-modal'); 
      fetchAndDisplay(); 
      triggerSuccessNotification("Changes Saved Successfully"); 
  };
}

// ==========================================
// 9. CHARTS, REPORTS & INSIGHTS
// ==========================================
function renderPercentageBreakdown(transactions) {
  const fragmentBuffer = document.createDocumentFragment(); 
  DOM.breakdown.innerHTML = ""; 
  let totalIncome = 0, expensesMap = {};
  
  transactions.forEach(t => { 
      const txType = t.type || (t.amount < 0 ? 'expense' : 'income');
      
      if (txType === 'income') totalIncome += t.amount; 
      else if (txType === 'expense') { 
          const cat = t.category || 'Miscellaneous'; 
          expensesMap[cat] = (expensesMap[cat] || 0) + Math.abs(t.amount); 
      } 
  });
  
  const expenseKeys = Object.keys(expensesMap);
  if (expenseKeys.length === 0) {
    DOM.breakdown.innerHTML = `<div class="empty-state-premium" style="padding: 20px;"><div class="empty-icon" style="font-size: 2rem;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg></div><h4 style="font-size: 0.95rem;">No Spending Data</h4><p style="font-size: 0.8rem;">Log some expenses to see your breakdown.</p></div>`; 
    return;
  }
  
  expenseKeys.sort((a, b) => expensesMap[b] - expensesMap[a]).forEach(cat => {
    const amt = expensesMap[cat]; 
    let percentage = totalIncome > 0 ? (amt / totalIncome) * 100 : 0;
    
    const displayAmt = isPrivacyMode ? '••••' : formatToIndianRupee(amt).split('.')[0];
    const styleObj = getCategoryStyle(cat);
    
    const itemRow = document.createElement('div'); 
    itemRow.className = "breakdown-item";
    
    itemRow.innerHTML = `
      <div class="breakdown-label">
        <span>${styleObj.icon} ${styleObj.cleanName} (₹${displayAmt})</span>
        <span style="color: var(--text-muted);">${totalIncome > 0 ? (isPrivacyMode ? '••%' : percentage.toFixed(1) + '%') : 'Logged'}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${Math.min(percentage, 100)}%; background-color: ${percentage > 30 ? 'var(--expense)' : '#fb923c'};"></div>
      </div>
    `;
    fragmentBuffer.appendChild(itemRow);
  });
  DOM.breakdown.appendChild(fragmentBuffer);
}

function generateSmartInsights(transactions) {
  DOM.insightsCard.className = "insights-card"; 
  let income = 0, expense = 0, catMap = {};
  
  transactions.forEach(t => { 
      const txType = t.type || (t.amount < 0 ? 'expense' : 'income');
      
      if (txType === 'income') income += t.amount; 
      else if (txType === 'expense') { 
          expense += Math.abs(t.amount); 
          catMap[t.category] = (catMap[t.category] || 0) + Math.abs(t.amount); 
      } 
  });
  
  const svgIdea = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg>`;
  const svgAlert = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  const svgHighAlert = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"></path></svg>`;
  const svgSearch = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
  const svgLightning = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
  const svgSparkle = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

  if (transactions.length === 0) { 
      DOM.insightsTitle.innerHTML = `${svgIdea} Your Money Insights`; 
      DOM.insightsText.innerText = "Add some income and expenses to see your money tips here."; 
      return; 
  }
  
  if (income === 0 && expense > 0) { 
      DOM.insightsCard.classList.add('danger-state'); 
      DOM.insightsTitle.innerHTML = `${svgAlert} Action Needed: Add Your Income`; 
      DOM.insightsText.innerHTML = "Tracking expenses is great! Now, add your income to see how much you are actually saving."; 
      return; 
  }
  
  let manualBudgetLimitSetting = parseIndianCommaStringToFloat(localStorage.getItem('finwise-budget-limit') || '0'); 
  let dynamicInsightDenominator = manualBudgetLimitSetting > 0 ? manualBudgetLimitSetting : income; 
  const burnRate = (expense / dynamicInsightDenominator) * 100;
  
  const displayBurnRate = isPrivacyMode ? '••' : burnRate.toFixed(0);
  const displaySaveRate = isPrivacyMode ? '••' : (100 - burnRate).toFixed(0);
  
  if (burnRate > 85) { 
      DOM.insightsCard.classList.add('danger-state'); 
      DOM.insightsTitle.innerHTML = `${svgHighAlert} Alert: Spending Too Fast`; 
      DOM.insightsText.innerHTML = `You have spent <strong>${displayBurnRate}%</strong> of your monthly limit. Try to hold back on non-essential spending.`; 
      return; 
  }
  
  let shoppingCost = catMap['Shopping'] || 0, entertainmentCost = catMap['Entertainment'] || 0; 
  let variableWants = shoppingCost + entertainmentCost, essentialNeeds = (catMap['Food & Dining'] || 0) + (catMap['Utilities & Bills'] || 0);
  
  if (variableWants > essentialNeeds && variableWants > 0) { 
      DOM.insightsCard.classList.add('warning-state'); 
      DOM.insightsTitle.innerHTML = `${svgSearch} Wants vs. Needs Check`; 
      
      const displayWants = isPrivacyMode ? '••••' : formatToIndianRupee(variableWants).split('.')[0];
      const displayNeeds = isPrivacyMode ? '••••' : formatToIndianRupee(essentialNeeds).split('.')[0];
      
      DOM.insightsText.innerHTML = `Lifestyle spending (Shopping & Fun: ₹${displayWants}) is higher than basic needs (Food & Bills: ₹${displayNeeds}). Consider scaling back lifestyle costs.`; 
      return; 
  }
  
  if (burnRate > 50) { 
      DOM.insightsCard.classList.add('warning-state'); 
      DOM.insightsTitle.innerHTML = `${svgLightning} Review: Spending Limit`; 
      DOM.insightsText.innerHTML = `You have spent <strong>${displayBurnRate}%</strong> of your budget. You are doing okay, but cutting out small extra costs can help you save more.`; 
      return; 
  }
  
  DOM.insightsCard.className = "insights-card"; 
  DOM.insightsTitle.innerHTML = `${svgSparkle} Great Job: Healthy Saving!`; 
  DOM.insightsText.innerHTML = `Awesome work! You are saving <strong>${displaySaveRate}%</strong> of your budget. Keep it up!`;
}

function renderChart(transactionsToRender) {
  if(!transactionsToRender) transactionsToRender = allTransactions;
    
  const ctx = document.getElementById('expenseChart').getContext('2d');
  let expensesMap = {};
  let totalExpense = 0;
  let totalIncome = 0;

  transactionsToRender.forEach(t => {
    const txType = t.type || (t.amount < 0 ? 'expense' : 'income');
    
    if (txType === 'expense') {
      let cat = t.category || 'Miscellaneous';
      expensesMap[cat] = (expensesMap[cat] || 0) + Math.abs(t.amount);
      totalExpense += Math.abs(t.amount);
    } else if (txType === 'income') {
      totalIncome += t.amount;
    }
  });

  const emptyState = document.getElementById('insights-empty-state');
  const ratioCard = document.getElementById('income-expense-comparison');
  const chartCard = document.getElementById('insights-chart-wrapper');
  const breakdownList = document.getElementById('insights-detailed-list');

  if (totalExpense === 0 && totalIncome === 0) {
     if(emptyState) emptyState.style.display = 'flex';
     if(ratioCard) ratioCard.style.display = 'none';
     if(chartCard) chartCard.style.display = 'none';
     if(breakdownList) breakdownList.style.display = 'none';
     return;
  }

  if(emptyState) emptyState.style.display = 'none';
  if(ratioCard) ratioCard.style.display = 'block';

  if(document.getElementById('insight-inc-label')) {
      document.getElementById('insight-inc-label').innerText = isPrivacyMode ? '₹ ••••••' : '₹' + totalIncome.toLocaleString('en-IN', {minimumFractionDigits: 0});
  }
  if(document.getElementById('insight-exp-label')) {
      document.getElementById('insight-exp-label').innerText = isPrivacyMode ? '₹ ••••••' : '₹' + totalExpense.toLocaleString('en-IN', {minimumFractionDigits: 0});
  }
  
  let totalFlow = totalIncome + totalExpense;
  let incPct = totalFlow > 0 ? (totalIncome / totalFlow) * 100 : 0;
  if (totalIncome > 0 && incPct < 2) incPct = 2; 
  if(document.getElementById('insight-ratio-bar')) document.getElementById('insight-ratio-bar').style.width = incPct + '%';

  const svgTarget = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:text-bottom;"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`;
  const svgAlert = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:text-bottom;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  const svgRocket = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:text-bottom;"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path></svg>`;
  const svgIdea = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:text-bottom;"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg>`;
  const svgScale = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:text-bottom;"><rect width="8" height="18" x="3" y="3" rx="2"></rect><rect width="8" height="18" x="13" y="3" rx="2"></rect></svg>`;

  let ratioText = "";
  if (totalIncome > totalExpense && totalExpense > 0) {
     let savingsRate = ((totalIncome - totalExpense) / totalIncome) * 100;
     const displaySaveRate = isPrivacyMode ? '••%' : `${savingsRate.toFixed(1)}%`;
     ratioText = `Great job! You are keeping <span style="color:var(--income)">${displaySaveRate}</span> of your logged income. ${svgTarget}`;
  } else if (totalExpense > totalIncome && totalIncome > 0) {
     let deficit = totalExpense - totalIncome;
     const displayDeficit = isPrivacyMode ? '••••••' : deficit.toLocaleString('en-IN');
     ratioText = `You are spending <span style="color:var(--expense)">₹${displayDeficit}</span> more than you earned. ${svgAlert}`;
  } else if (totalIncome > 0 && totalExpense === 0) {
     ratioText = `You have 100% savings right now. Time to invest? ${svgRocket}`;
  } else if (totalExpense > 0 && totalIncome === 0) {
     ratioText = `Tracking expenses is great! Don't forget to log your income to see your savings rate. ${svgIdea}`;
  } else {
     ratioText = `You broke perfectly even! ${svgScale}`;
  }
  if(document.getElementById('insight-ratio-text')) document.getElementById('insight-ratio-text').innerHTML = ratioText;

  if (totalExpense === 0) {
     if(chartCard) chartCard.style.display = 'none';
     if(breakdownList) breakdownList.style.display = 'none';
     return;
  }

  if(chartCard) chartCard.style.display = 'block';
  if(breakdownList) breakdownList.style.display = 'block';

  const sortedCategories = Object.keys(expensesMap).sort((a,b) => expensesMap[b] - expensesMap[a]);
  const labels = sortedCategories.map(cat => getCategoryStyle(cat).cleanName);
  const data = sortedCategories.map(cat => expensesMap[cat]);

  if (expenseChartInstance) { expenseChartInstance.destroy(); }

  expenseChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Amount Spent',
        data: data,
        backgroundColor: '#3b82f6',
        borderRadius: 6,
        barThickness: 'flex',
        maxBarThickness: 40
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function(context) { return isPrivacyMode ? ' ₹ ••••••' : ' ₹' + context.raw.toLocaleString('en-IN'); } } }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(200,200,200,0.1)' }, ticks: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#94a3b8' : '#64748b' } },
        x: { grid: { display: false }, ticks: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#94a3b8' : '#64748b' } }
      }
    }
  });

  let detailedHTML = `<h4 style="margin-bottom:12px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">Detailed Breakdown</h4>`;
  sortedCategories.forEach(cat => {
    let amt = expensesMap[cat];
    let pct = ((amt / totalExpense) * 100).toFixed(1);
    
    const displayAmt = isPrivacyMode ? '••••' : amt.toLocaleString('en-IN', {minimumFractionDigits:2});
    const displayPct = isPrivacyMode ? '••' : pct;
    const styleObj = getCategoryStyle(cat);
    
    detailedHTML += `
      <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border); font-size:0.85rem;">
         <span style="font-weight:600;">${styleObj.icon} ${styleObj.cleanName}</span>
         <span>
           <span style="color:var(--text-muted); font-size:0.75rem; margin-right:8px;">${displayPct}%</span> 
           <span style="font-weight:700; color:var(--expense);">₹${displayAmt}</span>
         </span>
      </div>`;
  });
  if(breakdownList) breakdownList.innerHTML = detailedHTML;
}

function triggerDynamicPeriodFinancialReport() {
  const bounds = getCalculatedPeriodBounds(); 
  const labelLabel = document.getElementById('report-window-date-bounds-label'); 
  const sheetBody = document.getElementById('financial-report-metrics-sheet-body');
  
  if(currentTab === 'all') { 
      labelLabel.innerText = "All-Time Summary Report"; 
  } else if (currentTab === 'custom') { 
      let st = document.getElementById('start-date').value || 'Start'; 
      let en = document.getElementById('end-date').value || 'Present'; 
      labelLabel.innerText = `Selected Timeframe: ${st} to ${en}`; 
  } else { 
      labelLabel.innerText = `Selected Timeframe: ${bounds.startDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} - ${bounds.endDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`; 
  }

  if(allTransactions.length === 0 || DOM.emptyMsg.style.display === 'flex') { 
      triggerNativeAppAlert("No matching data found for this timeframe. Please log entries to run reports."); 
      return; 
  }

  let reportInflow = 0, reportOutflow = 0, reportCategoricalMap = {}; 
  let sd = document.getElementById('start-date').value; 
  let ed = document.getElementById('end-date').value; 
  let startBoundaryTime = bounds.startDate.getTime(); 
  let endBoundaryTime = bounds.endDate.getTime();
  
  allTransactions.forEach(t => {
    let tDate = t.timestamp ? new Date(t.timestamp) : new Date(); 
    const itemTimestamp = tDate.getTime(); 
    
    const itemDateString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(tDate);
    
    if (currentTab === 'custom') { 
        if (sd && itemDateString < sd) return; 
        if (ed && itemDateString > ed) return; 
    } else if (currentTab !== 'all') { 
        if (itemTimestamp < startBoundaryTime || itemTimestamp > endBoundaryTime) return; 
    }
    
    const txType = t.type || (t.amount < 0 ? 'expense' : 'income');
    
    if(txType === 'income') { 
        reportInflow += t.amount; 
    } else if (txType === 'expense') { 
        let absVal = Math.abs(t.amount); 
        reportOutflow += absVal; 
        let tag = t.category || 'Miscellaneous'; 
        reportCategoricalMap[tag] = (reportCategoricalMap[tag] || 0) + absVal; 
    }
  });

  let netSavingsValue = reportInflow - reportOutflow; 
  let calculatedSavingsPercent = reportInflow > 0 ? (netSavingsValue / reportInflow) * 100 : 0; 
  let categoryRowsHTMLStr = "";
  
  Object.keys(reportCategoricalMap).sort((a,b) => reportCategoricalMap[b] - reportCategoricalMap[a]).forEach(key => {
    const rowAmt = isPrivacyMode ? '••••' : formatToIndianRupee(reportCategoricalMap[key]).split('.')[0];
    const styleObj = getCategoryStyle(key);
    categoryRowsHTMLStr += `<tr style="border-bottom:1px solid var(--border); font-size:0.8rem;"><td style="padding:6px 0; font-weight:500;">${styleObj.icon} ${styleObj.cleanName}</td><td style="padding:6px 0; text-align:right; font-weight:700; color:var(--expense);">₹${rowAmt}</td></tr>`;
  });

  const displayInflow = isPrivacyMode ? '••••••' : formatToIndianRupee(reportInflow);
  const displayOutflow = isPrivacyMode ? '••••••' : formatToIndianRupee(reportOutflow);
  const displayNet = isPrivacyMode ? '••••••' : formatToIndianRupee(netSavingsValue);
  const displayRate = isPrivacyMode ? '••%' : (reportInflow > 0 && netSavingsValue > 0 ? calculatedSavingsPercent.toFixed(1) + '%' : '0.0%');

  sheetBody.innerHTML = `
    <div style="background:var(--bg-main); border:1px solid var(--border); padding:12px; border-radius:14px; margin-bottom:14px;">
      <div class="reconcile-row"><span>Total Income:</span><span class="amt-inc" style="font-weight:bold;">₹${displayInflow}</span></div>
      <div class="reconcile-row"><span>Total Expenses:</span><span class="amt-exp" style="font-weight:bold;">₹${displayOutflow}</span></div>
      <div class="reconcile-row" style="border-top:1px dashed var(--border); padding-top:6px; margin-top:6px; font-weight:bold;"><span>Net Savings:</span><span class="${netSavingsValue >= 0 ? 'amt-inc' : 'amt-exp'}">₹${displayNet}</span></div>
      <div class="reconcile-row" style="font-size:0.75rem; margin-bottom:0; color:var(--text-muted);"><span>Savings Rate:</span><span style="font-weight:bold; color:var(--text-main);">${displayRate}</span></div>
    </div>
    <label style="font-size:0.72rem; color:var(--text-muted); font-weight:700; display:block; margin-bottom:4px; letter-spacing:0.5px;">EXPENSE BREAKDOWN</label>
    <table style="width:100%; border-collapse:collapse;">
      <thead>
         <tr style="border-bottom:2px solid var(--border); font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">
            <th style="text-align:left; padding-bottom:4px;">Category</th>
            <th style="text-align:right; padding-bottom:4px;">Amount</th>
         </tr>
      </thead>
      <tbody>
         ${categoryRowsHTMLStr || '<tr><td colspan="2" style="font-size:0.8rem; color:var(--text-muted); padding:10px 0;">No expenses recorded for this period.</td></tr>'}
      </tbody>
    </table>`;
    
  document.getElementById('financial-report-modal').style.display = 'flex';
}

// ==========================================
// 10. DYNAMIC VARIANCE COMPARISON ENGINE
// ==========================================

function getQuickCompareDates(mode) {
    const today = new Date();
    let aStart = new Date(today);
    let aEnd = new Date(today);
    let bStart = new Date(today);
    let bEnd = new Date(today);
    let labelA = "Period 1", labelB = "Period 2";

    if (mode === 'month') {
        aStart = new Date(today.getFullYear(), today.getMonth(), 1);
        aEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        bStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        bEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        labelA = "This Month"; labelB = "Last Month";
    } else if (mode === 'week') {
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
        aStart = new Date(today.setDate(diff));
        aEnd = new Date(aStart);
        aEnd.setDate(aStart.getDate() + 6);

        bStart = new Date(aStart);
        bStart.setDate(aStart.getDate() - 7);
        bEnd = new Date(aEnd);
        bEnd.setDate(aEnd.getDate() - 7);
        labelA = "This Week"; labelB = "Last Week";
    } else if (mode === 'day') {
        aStart = new Date();
        aEnd = new Date();
        bStart = new Date();
        bStart.setDate(today.getDate() - 1);
        bEnd = new Date(bStart);
        labelA = "Today"; labelB = "Yesterday";
    }

    const format = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return {
        startA: format(aStart), endA: format(aEnd),
        startB: format(bStart), endB: format(bEnd),
        labelA, labelB
    };
}

function handleCompareModeChange() {
    const mode = document.getElementById('compare-mode-selector').value;
    const customFields = document.getElementById('custom-compare-fields');
    
    if (mode === 'custom') {
        customFields.style.display = 'flex';
    } else {
        customFields.style.display = 'none';
        runPeriodComparison(); 
    }
}

function runPeriodComparison() {
  const mode = document.getElementById('compare-mode-selector').value;
  let startA, endA, startB, endB;
  let labelA = "Period 1", labelB = "Period 2";

  if (mode === 'custom') {
      startA = document.getElementById('comp-a-start').value;
      endA = document.getElementById('comp-a-end').value;
      startB = document.getElementById('comp-b-start').value;
      endB = document.getElementById('comp-b-end').value;
  } else {
      const autoDates = getQuickCompareDates(mode);
      startA = autoDates.startA;
      endA = autoDates.endA;
      startB = autoDates.startB;
      endB = autoDates.endB;
      labelA = autoDates.labelA;
      labelB = autoDates.labelB;
  }
  
  if (!startA || !endA || !startB || !endB) {
      document.getElementById('compare-empty-state').style.display = 'flex';
      document.getElementById('compare-results-container').style.display = 'none';
      return;
  }
  
  let incA = 0, expA = 0, catMapA = {};
  let incB = 0, expB = 0, catMapB = {};
  let hasData = false;
  
  allTransactions.forEach(t => {
      let tDate = t.timestamp ? new Date(t.timestamp) : new Date(); 
      const itemDateString = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(tDate);
      
      const txType = t.type || (t.amount < 0 ? 'expense' : 'income');
      let absVal = Math.abs(t.amount);
      let cat = t.category || 'Miscellaneous';
      
      if (itemDateString >= startA && itemDateString <= endA) {
          hasData = true;
          if (txType === 'income') incA += absVal;
          else if (txType === 'expense') {
             expA += absVal;
             catMapA[cat] = (catMapA[cat] || 0) + absVal;
          }
      }
      
      if (itemDateString >= startB && itemDateString <= endB) {
          hasData = true;
          if (txType === 'income') incB += absVal;
          else if (txType === 'expense') {
             expB += absVal;
             catMapB[cat] = (catMapB[cat] || 0) + absVal;
          }
      }
  });
  
  const emptyState = document.getElementById('compare-empty-state');
  const resultsContainer = document.getElementById('compare-results-container');
  
  if (!hasData) {
      emptyState.style.display = 'flex';
      resultsContainer.style.display = 'none';
      return;
  }
  
  emptyState.style.display = 'none';
  resultsContainer.style.display = 'block';

  let savA = incA - expA;
  let savB = incB - expB;

  let insightsCard = document.getElementById('compare-smart-insights');
  insightsCard.className = "insights-card"; 
  let expDiff = expA - expB;
  let savDiff = savA - savB;
  
  const svgIdea = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path></svg>`;
  const svgUp = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:text-bottom; margin-right:4px;"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>`;
  const svgDown = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:text-bottom; margin-right:4px;"><polyline points="12 5 12 19"></polyline><polyline points="19 12 12 19 5 12"></polyline></svg>`;
  const svgScale = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:text-bottom; margin-right:4px;"><rect width="8" height="18" x="3" y="3" rx="2"></rect><rect width="8" height="18" x="13" y="3" rx="2"></rect></svg>`;
  const svgMoney = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:text-bottom; margin-right:4px;"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`;
  const svgAlert = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:text-bottom; margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

  let insightText = `<h4 style="margin-bottom:8px; display: flex; align-items: center;">${svgIdea} Comparison Insight</h4>`;
  
  if (expA > expB) {
      insightsCard.classList.add('warning-state');
      insightText += `<p style="margin-bottom:6px;">${svgUp} You spent <strong>${isPrivacyMode ? '₹••••' : '₹'+formatToIndianRupee(Math.abs(expDiff)).split('.')[0]} MORE</strong> in ${labelA} compared to ${labelB}.</p>`;
  } else if (expA < expB) {
      insightsCard.classList.add('success-state');
      insightText += `<p style="margin-bottom:6px;">${svgDown} Great job! You spent <strong>${isPrivacyMode ? '₹••••' : '₹'+formatToIndianRupee(Math.abs(expDiff)).split('.')[0]} LESS</strong> in ${labelA}.</p>`;
  } else {
      insightText += `<p style="margin-bottom:6px;">${svgScale} Your spending was exactly the same across both periods.</p>`;
  }

  if (savDiff > 0) {
      insightText += `<p>${svgMoney} Your net savings improved by <strong>${isPrivacyMode ? '₹••••' : '₹'+formatToIndianRupee(savDiff).split('.')[0]}</strong>!</p>`;
  } else if (savDiff < 0) {
      insightText += `<p>${svgAlert} Your net savings dropped by <strong>${isPrivacyMode ? '₹••••' : '₹'+formatToIndianRupee(Math.abs(savDiff)).split('.')[0]}</strong>.</p>`;
  }
  
  insightsCard.innerHTML = insightText;

  document.getElementById('comp-header-a').innerText = labelA;
  document.getElementById('comp-header-b').innerText = labelB;

  document.getElementById('comp-metric-inc-a').innerText = isPrivacyMode ? '₹••••' : `₹${formatToIndianRupee(incA).split('.')[0]}`;
  document.getElementById('comp-metric-inc-b').innerText = isPrivacyMode ? '₹••••' : `₹${formatToIndianRupee(incB).split('.')[0]}`;
  document.getElementById('comp-metric-exp-a').innerText = isPrivacyMode ? '₹••••' : `₹${formatToIndianRupee(expA).split('.')[0]}`;
  document.getElementById('comp-metric-exp-b').innerText = isPrivacyMode ? '₹••••' : `₹${formatToIndianRupee(expB).split('.')[0]}`;
  document.getElementById('comp-metric-sav-a').innerText = isPrivacyMode ? '₹••••' : `₹${formatToIndianRupee(savA).split('.')[0]}`;
  document.getElementById('comp-metric-sav-b').innerText = isPrivacyMode ? '₹••••' : `₹${formatToIndianRupee(savB).split('.')[0]}`;
  
  document.getElementById('comp-metric-sav-a').className = savA >= 0 ? "amt-inc" : "amt-exp";
  document.getElementById('comp-metric-sav-b').className = savB >= 0 ? "amt-inc" : "amt-exp";

  const ctx = document.getElementById('compareBarChart').getContext('2d');
  if (compareChartInstance) { compareChartInstance.destroy(); }
  
  compareChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Income', 'Spent', 'Saved'],
      datasets: [
        {
          label: labelA,
          data: [incA, expA, savA],
          backgroundColor: ['#16a34a', '#dc2626', '#3b82f6'],
          borderRadius: 4
        },
        {
          label: labelB,
          data: [incB, expB, savB],
          backgroundColor: ['#4ade80', '#f87171', '#93c5fd'],
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#f8fafc' : '#0f172a' } },
        tooltip: { callbacks: { label: function(context) { return isPrivacyMode ? ' ₹ ••••••' : ' ₹' + context.raw.toLocaleString('en-IN'); } } }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(200,200,200,0.1)' }, ticks: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#94a3b8' : '#64748b' } },
        x: { grid: { display: false }, ticks: { color: document.documentElement.getAttribute('data-theme') === 'dark' ? '#94a3b8' : '#64748b' } }
      }
    }
  });

  let allCategories = new Set([...Object.keys(catMapA), ...Object.keys(catMapB)]);
  let breakdownHTML = '';
  
  const iconUp = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:middle; margin-right:2px;"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;
  const iconDown = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:inline; vertical-align:middle; margin-right:2px;"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;
  
  Array.from(allCategories).forEach(cat => {
      let valA = catMapA[cat] || 0;
      let valB = catMapB[cat] || 0;
      if (valA === 0 && valB === 0) return;
      
      let catVariance = valA - valB; 
      let color = catVariance > 0 ? 'var(--expense)' : (catVariance < 0 ? 'var(--income)' : 'var(--text-muted)');
      let sign = catVariance > 0 ? iconUp : (catVariance < 0 ? iconDown : '');
      
      const displayVar = isPrivacyMode ? '••••' : formatToIndianRupee(Math.abs(catVariance)).split('.')[0];
      const displayValA = isPrivacyMode ? '••••' : formatToIndianRupee(valA).split('.')[0];
      const displayValB = isPrivacyMode ? '••••' : formatToIndianRupee(valB).split('.')[0];
      const styleObj = getCategoryStyle(cat);
      
      breakdownHTML += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); font-size: 0.85rem;">
         <div>
            <div style="font-weight: 600;">${styleObj.icon} ${styleObj.cleanName}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">${labelA}: ₹${displayValA} | ${labelB}: ₹${displayValB}</div>
         </div>
         <div style="text-align: right;">
            <div style="font-weight: 700; color: ${color};">${sign} ₹${displayVar}</div>
         </div>
      </div>`;
  });
  
  document.getElementById('compare-category-list').innerHTML = breakdownHTML || '<p style="font-size: 0.8rem; color: var(--text-muted);">No category data to compare.</p>';
}

// ==========================================
// 11. APP NAVIGATION & THEME
// ==========================================
function switchMainScreen(targetView) {
  currentActiveMainScreen = targetView;
  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active-view'));
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('nav-active'));
  document.getElementById('scroll-top-trigger').classList.remove('scroll-visible');

  let safeTarget = targetView === 'add' ? 'home' : targetView;

  document.getElementById(`view-${safeTarget}`).classList.add('active-view');
  
  const navBtn = document.getElementById(`nav-btn-${safeTarget}`);
  if(navBtn) navBtn.classList.add('nav-active');

  const sharedFilters = document.getElementById('shared-time-filters');
  if(safeTarget === 'logs' || safeTarget === 'insights') {
     sharedFilters.style.display = 'block';
  } else {
     sharedFilters.style.display = 'none';
  }

  if(safeTarget === 'home') {
    if (DOM.searchInput) DOM.searchInput.value = '';
    const filterNature = document.getElementById('filter-nature');
    if (filterNature) filterNature.value = 'all';
    
    const startDate = document.getElementById('start-date');
    const endDate = document.getElementById('end-date');
    if (startDate) startDate.value = '';
    if (endDate) endDate.value = '';
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const allTimeTab = document.querySelector('.tab');
    if (allTimeTab) allTimeTab.classList.add('active');
    
    currentTab = 'all'; 
    dateOffset = 0; 
    checkedItemIds = [];
  }
  
  if (safeTarget === 'compare') {
      const modeSelect = document.getElementById('compare-mode-selector');
      if (modeSelect && modeSelect.value === 'custom') {
          modeSelect.value = 'month'; 
          handleCompareModeChange();
      }
      setTimeout(() => runPeriodComparison(), 10);
  }
  
  applyFilters();
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme'); 
  const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', targetTheme); 
  localStorage.setItem('rupee-tracker-theme', targetTheme); 
  
  const lightSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
  const darkSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
  
  document.getElementById('theme-btn').innerHTML = targetTheme === 'dark' ? `${lightSvg} Light` : `${darkSvg} Dark`;
  
  if(currentActiveMainScreen === 'insights') applyFilters(); 
  if(currentActiveMainScreen === 'compare') runPeriodComparison();
}

const savedTheme = localStorage.getItem('rupee-tracker-theme') || 'light'; 
document.documentElement.setAttribute('data-theme', savedTheme); 
window.addEventListener('DOMContentLoaded', () => {
    const tb = document.getElementById('theme-btn');
    const lightSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    const darkSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    if(tb) tb.innerHTML = savedTheme === 'dark' ? `${lightSvg} Light` : `${darkSvg} Dark`;
    
    const privacyBtn = document.getElementById('privacy-toggle-btn');
    const showSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const hideSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
    if(privacyBtn && isPrivacyMode) privacyBtn.innerHTML = hideSvg;
});

// ==========================================
// 12. PWA REGISTRATION (SERVICE WORKER)
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      if (reg.waiting) { 
          showUpdateAvailableBanner(reg.waiting); 
      }
      reg.onupdatefound = () => { 
          const installingWorker = reg.installing; 
          installingWorker.onstatechange = () => { 
              if (installingWorker.state === 'installed') { 
                  if (navigator.serviceWorker.controller) { 
                      showUpdateAvailableBanner(installingWorker); 
                  } 
              } 
          }; 
      };
    }).catch(err => console.error(err));
    
    let refreshing = false; 
    navigator.serviceWorker.addEventListener('controllerchange', () => { 
        if (!refreshing) { 
            window.location.reload(); 
            refreshing = true; 
        } 
    });
  });
}

function showUpdateAvailableBanner(worker) { 
    const updateToast = document.getElementById('update-toast'); 
    const updateBtn = document.getElementById('update-refresh-btn'); 
    updateToast.classList.add('toast-visible'); 
    updateBtn.onclick = () => { 
        worker.postMessage({ action: 'skipWaiting' }); 
    }; 
}