let currentPinInput = "";
let isSettingUpPin = false;
let isVerifyingToDisablePin = false; 
let setupPinStep = 1; 
let tempSetupPin = "";

function initSecurityEngine() {
  const savedPin = localStorage.getItem('finwise-pin');
  const enableCheckbox = document.getElementById('pin-enable-checkbox');
  
  if(enableCheckbox) enableCheckbox.checked = !!savedPin;

  if (savedPin) {
    const lockScreen = document.getElementById('security-lock-screen');
    lockScreen.style.display = 'flex';
    document.getElementById('lock-title').innerText = "Verify Identity";
    document.getElementById('pin-entry-ui').style.display = 'block';

    if (localStorage.getItem('finwise-biometric-id')) {
        document.getElementById('biometric-unlock-btn').style.display = 'block';
        setTimeout(() => unlockWithBiometrics(true), 300);
    } else {
        if (window.PublicKeyCredential) {
          PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(isAvail => {
            if (isAvail) document.getElementById('biometric-unlock-btn').style.display = 'block';
          }).catch(() => {});
        }
    }
  } else {
    document.getElementById('security-lock-screen').style.display = 'none';
    if (typeof runGatekeeperCheck === 'function') runGatekeeperCheck();
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && localStorage.getItem('finwise-pin')) {
     if (document.getElementById('security-lock-screen').style.display === 'none') {
         initSecurityEngine();
     }
  }
});

function unlockAppSuccess() {
    if (isVerifyingToDisablePin) {
       localStorage.removeItem('finwise-pin');
       localStorage.removeItem('finwise-biometric-id');
       document.getElementById('pin-enable-checkbox').checked = false;
       document.getElementById('security-lock-screen').style.display = 'none';
       isVerifyingToDisablePin = false;
       openPreferencesModal();
    } else {
      document.getElementById('security-lock-screen').style.display = 'none';
      if (typeof runGatekeeperCheck === 'function') runGatekeeperCheck();
    }
    currentPinInput = ""; 
    updatePinDisplay();
}

function handlePinInput(num) {
  if (currentPinInput.length < 4) {
    currentPinInput += num; 
    updatePinDisplay();
    if (currentPinInput.length === 4) {
        setTimeout(processPinComplete, 200);
    }
  }
}

function handlePinBackspace() {
  if (currentPinInput.length > 0) { 
      currentPinInput = currentPinInput.slice(0, -1); 
      updatePinDisplay(); 
  }
}

function updatePinDisplay() {
  const dots = document.getElementById('pin-display').children;
  for (let i = 0; i < 4; i++) {
    if (i < currentPinInput.length) {
        dots[i].classList.add('filled');
    } else {
        dots[i].classList.remove('filled');
    }
  }
}

function processPinComplete() {
  const savedPin = localStorage.getItem('finwise-pin');
  
  if (isSettingUpPin) {
    if (setupPinStep === 1) { 
        tempSetupPin = currentPinInput; 
        currentPinInput = ""; 
        setupPinStep = 2; 
        updatePinDisplay(); 
    } else {
      if (currentPinInput === tempSetupPin) {
        localStorage.setItem('finwise-pin', currentPinInput);
        document.getElementById('security-lock-screen').style.display = 'none';
        isSettingUpPin = false;
      } else { 
          tempSetupPin = ""; 
          currentPinInput = ""; 
          updatePinDisplay(); 
          
          // Optional: Add a brief visual shake here for incorrect setup match
          const pinDisplay = document.getElementById('pin-display');
          pinDisplay.classList.add('pin-shake');
          setTimeout(() => pinDisplay.classList.remove('pin-shake'), 400);
      }
    }
  } else if (isVerifyingToDisablePin) {
    if (currentPinInput === savedPin) {
        unlockAppSuccess();
    } else { 
        currentPinInput = ""; 
        updatePinDisplay(); 
    }
  } else {
    if (currentPinInput === savedPin) {
        unlockAppSuccess();
    } else { 
        currentPinInput = ""; 
        updatePinDisplay(); 
        
        // Shake on wrong unlock pin
        const pinDisplay = document.getElementById('pin-display');
        pinDisplay.classList.add('pin-shake');
        setTimeout(() => pinDisplay.classList.remove('pin-shake'), 400);
    }
  }
}

function togglePinSetupMode(checkbox) {
  const savedPin = localStorage.getItem('finwise-pin');
  
  if (!checkbox.checked && savedPin) {
    checkbox.checked = true; 
    isVerifyingToDisablePin = true; 
    currentPinInput = ""; 
    updatePinDisplay();
    document.getElementById('security-lock-screen').style.display = 'flex';
    document.getElementById('lock-title').innerText = "Enter PIN to Disable";
    
    if(localStorage.getItem('finwise-biometric-id')) {
        setTimeout(() => unlockWithBiometrics(true), 300);
    }
    closeModal('preferences-modal'); 
    return;
  }
  
  if (checkbox.checked) {
    closeModal('preferences-modal'); 
    isSettingUpPin = true; 
    setupPinStep = 1; 
    tempSetupPin = ""; 
    currentPinInput = ""; 
    updatePinDisplay();
    
    document.getElementById('lock-title').innerText = "Create New PIN";
    document.getElementById('security-lock-screen').style.display = 'flex';
  }
}

function cancelPinSetup() {
    isSettingUpPin = false; 
    isVerifyingToDisablePin = false;
    currentPinInput = "";
    tempSetupPin = "";
    
    // Uncheck the toggle visually since we cancelled
    const enableCheckbox = document.getElementById('pin-enable-checkbox');
    if(enableCheckbox) enableCheckbox.checked = !!localStorage.getItem('finwise-pin');
    
    document.getElementById('security-lock-screen').style.display = 'none';
    openPreferencesModal();
}

async function unlockWithBiometrics(isAuto = false) {
  try {
    const challenge = new Uint8Array(32); 
    window.crypto.getRandomValues(challenge);
    
    let savedBioId = localStorage.getItem('finwise-biometric-id');
    
    if (!savedBioId) {
        // Register new biometric credential
        const credential = await navigator.credentials.create({
            publicKey: { 
                challenge, 
                rp: { name: "FinWise", id: window.location.hostname }, 
                user: { id: new Uint8Array(16), name: "user", displayName: "User" }, 
                pubKeyCredParams: [{ type: "public-key", alg: -7 }], 
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" }, 
                timeout: 60000 
            }
        });
        
        if (credential) {
            localStorage.setItem('finwise-biometric-id', btoa(String.fromCharCode.apply(null, new Uint8Array(credential.rawId))));
            unlockAppSuccess();
        }
    } else {
        // Verify existing biometric credential
        const rawId = new Uint8Array(atob(savedBioId).split('').map(c => c.charCodeAt(0)));
        const assertion = await navigator.credentials.get({
            publicKey: { 
                challenge, 
                rpId: window.location.hostname, 
                allowCredentials: [{ type: "public-key", id: rawId }], 
                userVerification: "required" 
            }
        });
        
        if (assertion) unlockAppSuccess();
    }
  } catch (err) { 
      console.error("Biometric error:", err); 
      // Fails silently, user can just type their PIN.
  }
}