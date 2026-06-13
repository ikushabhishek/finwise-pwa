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

// FIXED: App boots cleanly to the Dashboard
let currentActiveMainScreen = 'home'; 

let bulkRowIncrementalPointer = 0;
let expenseChartInstance = null;
let compareChartInstance = null; 

// Privacy Mode Global State
let isPrivacyMode = localStorage.getItem('finwise-privacy') === 'true';

// ---> LIGHTNING ADD GLOBAL STATE <---
let lightningAmountStr = "0";
let lightningNature = "expense";
let lightningSelectedCategory = "";

// ==========================================
// 2. DOM SELECTOR CACHING
// ==========================================
function initSelectorCachePointers() {
  DOM.balance = document.getElementById('balance');
  DOM.income = document.getElementById('total-income');
  DOM.expense = document.getElementById('total-expense');
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
    if (btn) btn.innerText = isPrivacyMode ? '🙈' : '👁️';
    
    applyFilters(); 
    if (currentActiveMainScreen === 'compare') runPeriodComparison();
}

// ==========================================
// 4. CATEGORY MANAGER & DYNAMIC EMOJI ENGINE
// ==========================================
const systemDefaultCategoriesPreset = ["Food", "Utilities", "Entertainment", "Travel", "Shopping", "Miscellaneous"];
let workspaceActiveExpenseCategories = [];

function getCategoryStyle(catName) {
  const catMap = {
    'Food': { icon: '🍔', color: 'var(--expense)', bg: 'rgba(220, 38, 38, 0.1)' },
    'Utilities': { icon: '💡', color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.1)' },
    'Entertainment': { icon: '🍿', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
    'Travel': { icon: '🚗', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
    'Shopping': { icon: '🛍️', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.1)' },
    'Salary': { icon: '💰', color: 'var(--income)', bg: 'rgba(22, 163, 74, 0.1)' },
    'Freelance': { icon: '💻', color: 'var(--income)', bg: 'rgba(22, 163, 74, 0.1)' },
    'Bonus': { icon: '✨', color: 'var(--income)', bg: 'rgba(22, 163, 74, 0.1)' },
    'Share Market': { icon: '📈', color: 'var(--income)', bg: 'rgba(22, 163, 74, 0.1)' },
    'Other Income': { icon: '🔄', color: 'var(--income)', bg: 'rgba(22, 163, 74, 0.1)' },
    'Miscellaneous': { icon: '📦', color: 'var(--text-muted)', bg: 'var(--badge-bg)' }
  };
  
  if (catMap[catName]) return { ...catMap[catName], cleanName: catName };

  // ---> NEW: DYNAMIC EMOJI EXTRACTION ENGINE <---
  // If the user adds an emoji at the start of a custom tag, extract it to use as the icon!
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
      triggerNativeAppAlert("Please enter a valid tag name."); 
      return; 
  }
  if(workspaceActiveExpenseCategories.includes(tagVal)) { 
      triggerNativeAppAlert("This category tag already exists."); 
      return; 
  }
  
  workspaceActiveExpenseCategories.push(tagVal); 
  localStorage.setItem('finwise-custom-expense-tags', JSON.stringify(workspaceActiveExpenseCategories));
  syncCategoriesDropdownSelectorsUI(); 
  openCategoryManagerModal(); 
  
  if (document.getElementById('lightning-add-modal').style.display === 'block') {
      renderLightningCategoryChips();
  }

  triggerSuccessNotification("📦 Custom category tag appended!");
}

function executeDeleteCustomCategoryTag(indexPointer) {
  workspaceActiveExpenseCategories.splice(indexPointer, 1); 
  localStorage.setItem('finwise-custom-expense-tags', JSON.stringify(workspaceActiveExpenseCategories));
  syncCategoriesDropdownSelectorsUI(); 
  openCategoryManagerModal(); 
  
  if (document.getElementById('lightning-add-modal').style.display === 'block') {
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
    actionBtn.innerText = "✕ Cancel";
    document.getElementById('dash-cycle-day-input').max = daysInMonth; 
    document.getElementById('dash-cycle-day-input').value = localStorage.getItem('finwise-cycle-day') || '1';
    document.getElementById('dash-budget-limit-input').value = localStorage.getItem('finwise-budget-limit') || '';
    document.getElementById('dash-op-bal-input').value = localStorage.getItem('finwise-op-bal') || ''; 
    document.getElementById('dash-cl-bal-input').value = localStorage.getItem('finwise-cl-bal') || '';
  } else { 
    displaySheet.style.display = 'block'; 
    fieldsSheet.style.display = 'none'; 
    actionBtn.innerText = "✏️ Edit"; 
  }
}

function saveDashboardCycleAndBaselineConfig() {
  const cycleInput = document.getElementById('dash-cycle-day-input'); 
  const maxDays = parseInt(cycleInput.max) || 31; 
  let day = parseInt(cycleInput.value);
  
  if (isNaN(day) || day < 1 || day > maxDays) { 
      triggerNativeAppAlert(`Please enter a valid billing cycle date between 1 and ${maxDays}.`); 
      return; 
  }
  
  localStorage.setItem('finwise-cycle-day', day); 
  localStorage.setItem('finwise-budget-limit', document.getElementById('dash-budget-limit-input').value.trim());
  localStorage.setItem('finwise-op-bal', document.getElementById('dash-op-bal-input').value.trim()); 
  localStorage.setItem('finwise-cl-bal', document.getElementById('dash-cl-bal-input').value.trim());
  
  document.getElementById('dashboard-config-display-sheet').style.display = 'block'; 
  document.getElementById('dashboard-config-fields-sheet').style.display = 'none'; 
  document.getElementById('dashboard-config-toggle-btn').innerText = "✏️ Edit";
  
  triggerSuccessNotification("📅 Account setup profiles updated successfully!"); 
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
    setLightningNature('expense');
    updateLightningDisplay();
    
    document.getElementById('lightning-add-modal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function setLightningNature(nature) {
    lightningNature = nature;
    const container = document.getElementById('lightning-nature-slider');
    
    if (nature === 'income') {
        container.classList.add('nature-income');
        container.classList.remove('nature-expense');
        document.getElementById('lightning-amount-display').style.color = 'var(--income)';
    } else {
        container.classList.add('nature-expense');
        container.classList.remove('nature-income');
        document.getElementById('lightning-amount-display').style.color = 'var(--expense)';
    }
    
    renderLightningCategoryChips();
}

function renderLightningCategoryChips() {
    const container = document.getElementById('lightning-category-chips');
    if (!container) return;
    container.innerHTML = "";
    lightningSelectedCategory = ""; 
    
    let categories = [];
    if(lightningNature === 'income') {
        categories = ["Salary", "Freelance", "Bonus", "Share Market", "Other Income"];
    } else {
        categories = workspaceActiveExpenseCategories; 
    }
    
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = "quick-chip";
        const styleObj = getCategoryStyle(cat);
        // Using dynamically extracted clean name and icon
        btn.innerHTML = `${styleObj.icon} ${styleObj.cleanName}`;
        btn.onclick = () => selectLightningChip(btn, cat);
        container.appendChild(btn);
    });
}

function selectLightningChip(btnElement, catName) {
    document.querySelectorAll('.quick-chip').forEach(c => c.classList.remove('selected'));
    btnElement.classList.add('selected');
    lightningSelectedCategory = catName;
}

// ---> FIXED: 2 DECIMAL DIGIT LIMIT ENGINE <---
function handleLightningNumpad(val) {
    if (lightningAmountStr === "0" && val !== ".") {
        lightningAmountStr = val;
    } else {
        if(val === '.' && lightningAmountStr.includes('.')) return;
        
        // Prevent typing more than 2 digits after the decimal point
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
        triggerNativeAppAlert("Please select a category tag for this entry.");
        return;
    }
    
    const today = new Date(); 
    const istDateFormatted = today.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const istDateStringForFiltering = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
    
    const finalAmount = lightningNature === 'expense' ? -amount : amount;
    
    const tx = db.transaction("transactions", "readwrite"); 
    const store = tx.objectStore("transactions");
    
    store.add({ 
        text: text, 
        amount: finalAmount, 
        category: lightningSelectedCategory, 
        date: istDateFormatted, 
        timestamp: today.getTime(), 
        dateString: istDateStringForFiltering 
    });
    
    tx.oncomplete = () => { 
        closeModal('lightning-add-modal');
        fetchAndDisplay(); 
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
    if (filterNature === 'income' && t.amount < 0) return false; 
    if (filterNature === 'expense' && t.amount > 0) return false;
    
    return true;
  });

  currentVisibleIds = filtered.map(t => t.id); 
  document.getElementById('master-select-label').style.display = filtered.length > 0 ? "flex" : "none";
  
  const masterCheckbox = document.getElementById('master-checkbox'); 
  masterCheckbox.checked = currentVisibleIds.length > 0 && currentVisibleIds.every(id => checkedItemIds.includes(id));
  
  let fBalance = 0, fIncome = 0, fExpense = 0; 
  filtered.forEach(t => { 
      fBalance += t.amount; 
      if (t.amount > 0) fIncome += t.amount; 
      else fExpense += Math.abs(t.amount); 
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
function calculateMasterSummaryTotals(masterArray) {
  let openingBalanceBaseline = parseIndianCommaStringToFloat(localStorage.getItem('finwise-op-bal') || '0'); 
  let closingBalanceTarget = localStorage.getItem('finwise-cl-bal') ? parseIndianCommaStringToFloat(localStorage.getItem('finwise-cl-bal')) : null; 
  let cycleDayValueSetting = localStorage.getItem('finwise-cycle-day') || '1'; 
  let manualBudgetLimitSetting = parseIndianCommaStringToFloat(localStorage.getItem('finwise-budget-limit') || '0');
  
  let balance = openingBalanceBaseline, income = 0, expense = 0;
  masterArray.forEach(t => { 
      balance += t.amount; 
      if (t.amount > 0) income += t.amount; 
      if (t.amount < 0) expense += Math.abs(t.amount); 
  });
  
  DOM.balance.innerText = isPrivacyMode ? '₹ ••••••' : `${balance >= 0 ? '' : '-'}₹${formatToIndianRupee(Math.abs(balance))}`; 
  DOM.income.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(income)}`; 
  DOM.expense.innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(expense)}`;

  const velocityWrapper = document.getElementById('budget-velocity-tracker'); 
  const velocityTitle = document.getElementById('velocity-title-label'); 
  const velocityLabel = document.getElementById('velocity-percentage-label'); 
  const velocityFill = document.getElementById('velocity-progress-bar-fill');
  
  let computationalLimitAnchor = manualBudgetLimitSetting > 0 ? manualBudgetLimitSetting : income;

  if (computationalLimitAnchor > 0) {
    velocityWrapper.style.display = 'block'; 
    velocityTitle.innerText = manualBudgetLimitSetting > 0 ? "BUDGET VELOCITY LIMIT" : "INCOME BURN VELOCITY LIMIT";
    let velocityPercentageValue = (expense / computationalLimitAnchor) * 100; 
    
    velocityLabel.innerText = isPrivacyMode ? `••% SPENT` : `${Math.round(velocityPercentageValue)}% SPENT`; 
    velocityFill.style.width = `${Math.min(velocityPercentageValue, 100)}%`;
    
    if (velocityPercentageValue >= 85) { 
        velocityFill.style.backgroundColor = '#f87171'; 
        velocityFill.style.boxShadow = '0 0 10px rgba(248, 113, 113, 0.4)'; 
    } 
    else if (velocityPercentageValue >= 70) { 
        velocityFill.style.backgroundColor = '#fbbf24'; 
        velocityFill.style.boxShadow = '0 0 10px rgba(251, 191, 36, 0.4)'; 
    } 
    else { 
        velocityFill.style.backgroundColor = '#ffffff'; 
        velocityFill.style.boxShadow = '0 0 8px rgba(255, 255, 255, 0.4)'; 
    }
  } else { 
      velocityWrapper.style.display = 'none'; 
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

  document.getElementById('rec-cycle-label').innerText = `${cycleDayValueSetting}${suffixMarker} of the Month`; 
  
  document.getElementById('rec-budget-label').innerText = manualBudgetLimitSetting > 0 ? 
      (isPrivacyMode ? '₹ •••••• (Fixed)' : `₹${formatToIndianRupee(manualBudgetLimitSetting).split('.')[0]} (Fixed boundary)`) 
      : "Not Configured (Using Income)"; 
      
  document.getElementById('rec-op-label').innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(openingBalanceBaseline)}`;

  if(!localStorage.getItem('finwise-op-bal') && fieldsSheet.style.display === 'none') {
    widgetCard.style.display = 'block'; 
    displaySheet.style.display = 'none'; 
    fieldsSheet.style.display = 'block'; 
    actionLinkBtn.style.display = 'none'; 
    titleHeaderSpan.innerText = "🔧 Setup Financial Baseline Cycle";
  } else {
    widgetCard.style.display = 'block'; 
    actionLinkBtn.style.display = 'inline-block';
    
    if(fieldsSheet.style.display === 'none') { 
        titleHeaderSpan.innerText = "📅 Cycle & Baseline Control"; 
    } else { 
        titleHeaderSpan.innerText = "⚙️ Modify Workspace Targets"; 
    }
    
    if(closingBalanceTarget !== null) {
      document.getElementById('rec-cl-label').innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(closingBalanceTarget)}`; 
      let variance = balance - closingBalanceTarget; 
      const diffTitle = document.getElementById('rec-diff-title'); 
      const diffLabel = document.getElementById('rec-diff-label');
      
      if(Math.abs(variance) < 0.01) { 
          diffTitle.innerHTML = `Reconciliation State: <span class="reconcile-status-badge" style="background-color: rgba(22, 163, 74, 0.2); color: var(--income);">Balanced ✨</span>`; 
          diffLabel.innerText = "Perfect Match"; 
          diffLabel.className = "amt-inc"; 
      } 
      else { 
          diffTitle.innerHTML = `Reconciliation State: <span class="reconcile-status-badge" style="background-color: rgba(220, 38, 38, 0.1); color: var(--expense);">Unbalanced ⚠️</span>`; 
          diffLabel.innerText = isPrivacyMode ? '₹ ••••••' : `${variance >= 0 ? '+' : '-'}₹${formatToIndianRupee(Math.abs(variance))}`; 
          diffLabel.className = variance >= 0 ? "amt-inc" : "amt-exp"; 
      }
    } else {
      document.getElementById('rec-cl-label').innerText = "Not Configured"; 
      document.getElementById('rec-diff-title').innerHTML = `Running Target Status: <span class="reconcile-status-badge" style="background-color: var(--badge-bg); color: var(--badge-text);">Active Baseline</span>`; 
      document.getElementById('rec-diff-label').innerText = isPrivacyMode ? '₹ ••••••' : `₹${formatToIndianRupee(balance)}`; 
      document.getElementById('rec-diff-label').className = balance >= 0 ? "amt-inc" : "amt-exp";
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
    const isExpense = t.amount < 0; 
    const baseDateString = t.date || new Date(t.timestamp).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }); 
    const timeMarkerString = t.timestamp ? formatTo12HourTime(t.timestamp) : '12:00:00 AM'; 
    const catLabel = t.category || 'Miscellaneous'; 
    const isChecked = checkedItemIds.includes(t.id);
    const styleObj = getCategoryStyle(catLabel);
    
    const displayAmount = isPrivacyMode ? '••••••' : `${isExpense ? '-' : '+'} ₹${formatToIndianRupee(Math.abs(t.amount))}`;
    
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
          <span class="${isExpense ? 'amt-exp' : 'amt-inc'}">${displayAmount}</span>
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
    document.getElementById('edit-type').value = target.amount < 0 ? 'expense' : 'income'; 
    toggleCategoryInput('edit');
    
    if (target.amount < 0) document.getElementById('edit-expense-category').value = target.category; 
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
        record.amount = newType === 'expense' ? -newAmtRaw : newAmtRaw; 
        record.category = newCategory; 
        store.put(record); 
    };
  } else {
    checkedItemIds.forEach(id => { 
        store.get(id).onsuccess = (e) => { 
            let record = e.target.result; 
            const rawAbsAmt = Math.abs(record.amount); 
            record.amount = newType === 'expense' ? -rawAbsAmt : rawAbsAmt; 
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
      if (t.amount > 0) totalIncome += t.amount; 
      else { 
          const cat = t.category || 'Miscellaneous'; 
          expensesMap[cat] = (expensesMap[cat] || 0) + Math.abs(t.amount); 
      } 
  });
  
  const expenseKeys = Object.keys(expensesMap);
  if (expenseKeys.length === 0) {
    DOM.breakdown.innerHTML = `<div class="empty-state-premium" style="padding: 20px;"><div class="empty-icon" style="font-size: 2rem;">📊</div><h4 style="font-size: 0.95rem;">No Spending Data</h4><p style="font-size: 0.8rem;">Log some expenses to see your breakdown.</p></div>`; 
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
      if (t.amount > 0) income += t.amount; 
      else { 
          expense += Math.abs(t.amount); 
          catMap[t.category] = (catMap[t.category] || 0) + Math.abs(t.amount); 
      } 
  });
  
  if (transactions.length === 0) { 
      DOM.insightsTitle.innerHTML = "💡 Your Money Insights"; 
      DOM.insightsText.innerText = "Add some income and expenses to see your money tips here."; 
      return; 
  }
  
  if (income === 0 && expense > 0) { 
      DOM.insightsCard.classList.add('danger-state'); 
      DOM.insightsTitle.innerHTML = "⚠️ Action Needed: Add Your Income"; 
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
      DOM.insightsTitle.innerHTML = "🚨 Alert: High Spending Velocity"; 
      DOM.insightsText.innerHTML = `You have burned through <strong>${displayBurnRate}%</strong> of your active budget line. Limit non-essential spending immediately.`; 
      return; 
  }
  
  let shoppingCost = catMap['Shopping'] || 0, entertainmentCost = catMap['Entertainment'] || 0; 
  let variableWants = shoppingCost + entertainmentCost, essentialNeeds = (catMap['Food'] || 0) + (catMap['Utilities'] || 0);
  
  if (variableWants > essentialNeeds && variableWants > 0) { 
      DOM.insightsCard.classList.add('warning-state'); 
      DOM.insightsTitle.innerHTML = "🔍 Wants vs. Needs Check"; 
      
      const displayWants = isPrivacyMode ? '••••' : formatToIndianRupee(variableWants).split('.')[0];
      const displayNeeds = isPrivacyMode ? '••••' : formatToIndianRupee(essentialNeeds).split('.')[0];
      
      DOM.insightsText.innerHTML = `Lifestyle spending (Shopping & Fun: ₹${displayWants}) outpaces basic needs (Food & Bills: ₹${displayNeeds}). Consider scaling back lifestyle costs.`; 
      return; 
  }
  
  if (burnRate > 50) { 
      DOM.insightsCard.classList.add('warning-state'); 
      DOM.insightsTitle.innerHTML = "⚡ Review: Spending Limit"; 
      DOM.insightsText.innerHTML = `You have spent <strong>${displayBurnRate}%</strong> of your income pool. You are doing okay, but cutting out small extra costs can help you save more.`; 
      return; 
  }
  
  DOM.insightsCard.className = "insights-card"; 
  DOM.insightsTitle.innerHTML = "✨ Great Job: Healthy Saving!"; 
  DOM.insightsText.innerHTML = `Awesome work! You saved <strong>${displaySaveRate}%</strong> of your active baseline limits. Keep it up!`;
}

function renderChart(transactionsToRender) {
  if(!transactionsToRender) transactionsToRender = allTransactions;
    
  const ctx = document.getElementById('expenseChart').getContext('2d');
  let expensesMap = {};
  let totalExpense = 0;
  let totalIncome = 0;

  transactionsToRender.forEach(t => {
    if (t.amount < 0) {
      let cat = t.category || 'Miscellaneous';
      expensesMap[cat] = (expensesMap[cat] || 0) + Math.abs(t.amount);
      totalExpense += Math.abs(t.amount);
    } else if (t.amount > 0) {
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

  let ratioText = "";
  if (totalIncome > totalExpense && totalExpense > 0) {
     let savingsRate = ((totalIncome - totalExpense) / totalIncome) * 100;
     const displaySaveRate = isPrivacyMode ? '••%' : `${savingsRate.toFixed(1)}%`;
     ratioText = `Great job! You are saving <span style="color:var(--income)">${displaySaveRate}</span> of your logged income. 🎯`;
  } else if (totalExpense > totalIncome && totalIncome > 0) {
     let deficit = totalExpense - totalIncome;
     const displayDeficit = isPrivacyMode ? '••••••' : deficit.toLocaleString('en-IN');
     ratioText = `You are spending <span style="color:var(--expense)">₹${displayDeficit}</span> more than you earned. ⚠️`;
  } else if (totalIncome > 0 && totalExpense === 0) {
     ratioText = `You have 100% savings right now. Time to invest? 🚀`;
  } else if (totalExpense > 0 && totalIncome === 0) {
     ratioText = `Tracking expenses is great! Don't forget to log your income to see your savings rate. 💡`;
  } else {
     ratioText = `You broke perfectly even! ⚖️`;
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
  // Use clean names for chart labels
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
      labelLabel.innerText = "Full Ledger Archive (All-Time Workspace Statement)"; 
  } else if (currentTab === 'custom') { 
      let st = document.getElementById('start-date').value || 'Inception'; 
      let en = document.getElementById('end-date').value || 'Present'; 
      labelLabel.innerText = `Timeline Window: ${st} to ${en}`; 
  } else { 
      labelLabel.innerText = `Timeline Window: ${bounds.startDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} - ${bounds.endDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`; 
  }

  if(allTransactions.length === 0 || DOM.emptyMsg.style.display === 'flex') { 
      triggerNativeAppAlert("No ledger data matches this filter timeline. Please log entries to run reports."); 
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
    
    if(t.amount > 0) { 
        reportInflow += t.amount; 
    } else { 
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
      <div class="reconcile-row"><span>Total Inflow Earnings:</span><span class="amt-inc" style="font-weight:bold;">₹${displayInflow}</span></div>
      <div class="reconcile-row"><span>Total Outflow Spending:</span><span class="amt-exp" style="font-weight:bold;">₹${displayOutflow}</span></div>
      <div class="reconcile-row" style="border-top:1px dashed var(--border); padding-top:6px; margin-top:6px; font-weight:bold;"><span>Net Timeline Savings:</span><span class="${netSavingsValue >= 0 ? 'amt-inc' : 'amt-exp'}">₹${displayNet}</span></div>
      <div class="reconcile-row" style="font-size:0.75rem; margin-bottom:0; color:var(--text-muted);"><span>Calculated Savings Rate:</span><span style="font-weight:bold; color:var(--text-main);">${displayRate}</span></div>
    </div>
    <label style="font-size:0.72rem; color:var(--text-muted); font-weight:700; display:block; margin-bottom:4px; letter-spacing:0.5px;">TIMELINE EXPENSE PROFILE COSTS</label>
    <table style="width:100%; border-collapse:collapse;">
      <thead>
         <tr style="border-bottom:2px solid var(--border); font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">
            <th style="text-align:left; padding-bottom:4px;">Category Tag</th>
            <th style="text-align:right; padding-bottom:4px;">Net Volume</th>
         </tr>
      </thead>
      <tbody>
         ${categoryRowsHTMLStr || '<tr><td colspan="2" style="font-size:0.8rem; color:var(--text-muted); padding:10px 0;">No outflow costs cataloged for this duration.</td></tr>'}
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
      
      let absVal = Math.abs(t.amount);
      let cat = t.category || 'Miscellaneous';
      
      if (itemDateString >= startA && itemDateString <= endA) {
          hasData = true;
          if (t.amount > 0) incA += absVal;
          else {
             expA += absVal;
             catMapA[cat] = (catMapA[cat] || 0) + absVal;
          }
      }
      
      if (itemDateString >= startB && itemDateString <= endB) {
          hasData = true;
          if (t.amount > 0) incB += absVal;
          else {
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
  
  let insightText = `<h4 style="margin-bottom:8px;">💡 Comparison Insight</h4>`;
  
  if (expA > expB) {
      insightsCard.classList.add('warning-state');
      insightText += `<p style="margin-bottom:6px;">📈 You spent <strong>${isPrivacyMode ? '₹••••' : '₹'+formatToIndianRupee(Math.abs(expDiff)).split('.')[0]} MORE</strong> in ${labelA} compared to ${labelB}.</p>`;
  } else if (expA < expB) {
      insightsCard.classList.add('success-state');
      insightText += `<p style="margin-bottom:6px;">📉 Great job! You spent <strong>${isPrivacyMode ? '₹••••' : '₹'+formatToIndianRupee(Math.abs(expDiff)).split('.')[0]} LESS</strong> in ${labelA}.</p>`;
  } else {
      insightText += `<p style="margin-bottom:6px;">⚖️ Your spending was exactly the same across both periods.</p>`;
  }

  if (savDiff > 0) {
      insightText += `<p>💰 Your net savings improved by <strong>${isPrivacyMode ? '₹••••' : '₹'+formatToIndianRupee(savDiff).split('.')[0]}</strong>!</p>`;
  } else if (savDiff < 0) {
      insightText += `<p>⚠️ Your net savings dropped by <strong>${isPrivacyMode ? '₹••••' : '₹'+formatToIndianRupee(Math.abs(savDiff)).split('.')[0]}</strong>.</p>`;
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
  
  Array.from(allCategories).forEach(cat => {
      let valA = catMapA[cat] || 0;
      let valB = catMapB[cat] || 0;
      if (valA === 0 && valB === 0) return;
      
      let catVariance = valA - valB; 
      let color = catVariance > 0 ? 'var(--expense)' : (catVariance < 0 ? 'var(--income)' : 'var(--text-muted)');
      let sign = catVariance > 0 ? '↑' : (catVariance < 0 ? '↓' : '');
      
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

  // Handle routing fallback to Home
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
  document.getElementById('theme-btn').innerText = targetTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
  
  if(currentActiveMainScreen === 'insights') applyFilters(); 
  if(currentActiveMainScreen === 'compare') runPeriodComparison();
}

const savedTheme = localStorage.getItem('rupee-tracker-theme') || 'light'; 
document.documentElement.setAttribute('data-theme', savedTheme); 
window.addEventListener('DOMContentLoaded', () => {
    const tb = document.getElementById('theme-btn');
    if(tb) tb.innerText = savedTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
    
    const privacyBtn = document.getElementById('privacy-toggle-btn');
    if(privacyBtn && isPrivacyMode) privacyBtn.innerText = '🙈';
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