// ==========================================
// SECURITY & BIOMETRIC GATEKEEPER ENGINE
// ==========================================
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
    document.getElementById('lock-subtitle').innerText = "To access FinWise";
    document.getElementById('pin-cancel-btn').innerText = "";
    
    isSettingUpPin = false;
    isVerifyingToDisablePin = false;
    currentPinInput = "";
    updatePinDisplay();

    document.getElementById('pin-entry-ui').style.display = 'block';

    if (localStorage.getItem('finwise-biometric-id')) {
        document.getElementById('biometric-unlock-btn').style.display = 'block';
        document.getElementById('biometric-unlock-btn').innerText = "🔍 Retry Biometric Unlock";
        // Auto-trigger biometric prompt
        setTimeout(() => unlockWithBiometrics(true), 300);
    } else {
        if (window.PublicKeyCredential) {
          PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(isAvail => {
            if (isAvail) {
               document.getElementById('biometric-unlock-btn').style.display = 'block';
               document.getElementById('biometric-unlock-btn').innerText = "🔍 Setup Biometric Unlock";
            }
          }).catch(err => console.log(err));
        }
    }
  } else {
    document.getElementById('security-lock-screen').style.display = 'none';
  }
}

// FORCE LOCK ON APP RESUME (BACKGROUND TO FOREGROUND)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
     if (localStorage.getItem('finwise-pin')) {
         const lockScreen = document.getElementById('security-lock-screen');
         if (lockScreen.style.display === 'none' || !isVerifyingToDisablePin) {
             initSecurityEngine();
         }
     }
  }
});

function togglePinSetupMode(checkbox) {
  const savedPin = localStorage.getItem('finwise-pin');
  
  // Verifying identity before allowing the user to turn off security
  if (!checkbox.checked && savedPin) {
    checkbox.checked = true; 
    isVerifyingToDisablePin = true;
    currentPinInput = "";
    updatePinDisplay();
    
    document.getElementById('security-lock-screen').style.display = 'flex';
    document.getElementById('lock-title').innerText = "Verify Identity";
    document.getElementById('lock-subtitle').innerText = "Enter PIN to disable security";
    document.getElementById('pin-cancel-btn').innerText = "Cancel";
    document.getElementById('pin-entry-ui').style.display = 'block';
    
    if(localStorage.getItem('finwise-biometric-id')) {
        setTimeout(() => unlockWithBiometrics(true), 300);
    }
    
    closeModal('preferences-modal');
    return;
  }

  // Normal PIN Setup Flow
  if (checkbox.checked) {
    closeModal('preferences-modal');
    isSettingUpPin = true;
    setupPinStep = 1;
    tempSetupPin = "";
    currentPinInput = "";
    updatePinDisplay();
    
    document.getElementById('security-lock-screen').style.display = 'flex';
    document.getElementById('lock-title').innerText = "Create PIN";
    document.getElementById('lock-subtitle').innerText = "Enter a 4-digit passcode";
    document.getElementById('pin-cancel-btn').innerText = "Cancel";
    
    document.getElementById('pin-entry-ui').style.display = 'block';
    document.getElementById('biometric-unlock-btn').style.display = 'none';
  }
}

function cancelPinSetup() {
  if (isSettingUpPin) {
    isSettingUpPin = false;
    document.getElementById('security-lock-screen').style.display = 'none';
    document.getElementById('pin-enable-checkbox').checked = false;
  } else if (isVerifyingToDisablePin) {
    isVerifyingToDisablePin = false;
    document.getElementById('security-lock-screen').style.display = 'none';
    openPreferencesModal();
  }
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
  if (isSettingUpPin) {
    if (setupPinStep === 1) {
      tempSetupPin = currentPinInput;
      currentPinInput = "";
      setupPinStep = 2;
      updatePinDisplay();
      document.getElementById('lock-title').innerText = "Confirm PIN";
      document.getElementById('lock-subtitle').innerText = "Re-enter your passcode";
    } else {
      if (currentPinInput === tempSetupPin) {
        localStorage.setItem('finwise-pin', currentPinInput);
        document.getElementById('security-lock-screen').style.display = 'none';
        triggerSuccessNotification("Vault secured successfully!");
        isSettingUpPin = false;
        currentPinInput = "";
        updatePinDisplay();
      } else {
        triggerPinError("PINs do not match. Try again.");
        setupPinStep = 1;
        tempSetupPin = "";
      }
    }
  } else if (isVerifyingToDisablePin) {
    const savedPin = localStorage.getItem('finwise-pin');
    if (currentPinInput === savedPin) {
       localStorage.removeItem('finwise-pin');
       localStorage.removeItem('finwise-biometric-id'); // Wipe biometric link too
       document.getElementById('pin-enable-checkbox').checked = false;
       document.getElementById('security-lock-screen').style.display = 'none';
       triggerSuccessNotification("PIN Vault disabled.");
       isVerifyingToDisablePin = false;
       currentPinInput = "";
       updatePinDisplay();
       openPreferencesModal(); 
    } else {
       triggerPinError("Incorrect PIN.");
    }
  } else {
    const savedPin = localStorage.getItem('finwise-pin');
    if (currentPinInput === savedPin) {
      unlockAppSuccess();
    } else {
      triggerPinError("Incorrect PIN.");
    }
  }
}

function triggerPinError(msg) {
  const display = document.getElementById('pin-display');
  display.classList.add('pin-shake');
  document.getElementById('lock-subtitle').innerText = msg;
  document.getElementById('lock-subtitle').style.color = "var(--expense)";
  
  if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
  
  setTimeout(() => {
    display.classList.remove('pin-shake');
    currentPinInput = "";
    updatePinDisplay();
    document.getElementById('lock-subtitle').style.color = "var(--text-muted)";
    
    if(isSettingUpPin) {
       document.getElementById('lock-subtitle').innerText = "Enter a 4-digit passcode";
       document.getElementById('lock-title').innerText = "Create PIN";
    } else if(isVerifyingToDisablePin) {
       document.getElementById('lock-subtitle').innerText = "Enter PIN to disable security";
    } else {
       document.getElementById('lock-subtitle').innerText = "To access FinWise";
    }
  }, 500);
}

// BIOMETRIC ENGINE RE-WRITE (Forces Device Fingerprint/FaceID)
async function unlockWithBiometrics(isAuto = false) {
  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    
    let savedBioId = localStorage.getItem('finwise-biometric-id');

    if (!savedBioId) {
        // SETUP MODE: First time clicking biometrics, map local device sensor
        const credential = await navigator.credentials.create({
            publicKey: {
                challenge: challenge,
                rp: { name: "FinWise", id: window.location.hostname },
                user: {
                    id: new Uint8Array(16), 
                    name: "finwise-user",
                    displayName: "FinWise PWA User"
                },
                pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                authenticatorSelection: {
                    authenticatorAttachment: "platform", // Forces LOCAL hardware (No Passkey sync)
                    userVerification: "required"
                },
                timeout: 60000
            }
        });

        if (credential) {
            const base64Id = btoa(String.fromCharCode.apply(null, new Uint8Array(credential.rawId)));
            localStorage.setItem('finwise-biometric-id', base64Id);
            document.getElementById('biometric-unlock-btn').innerText = "🔍 Retry Biometric Unlock";
            unlockAppSuccess("Biometrics Linked & Unlocked!");
        }
    } else {
        // UNLOCK MODE: Device is already mapped
        const rawId = new Uint8Array(atob(savedBioId).split('').map(c => c.charCodeAt(0)));
        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge: challenge,
                rpId: window.location.hostname,
                allowCredentials: [{ type: "public-key", id: rawId }],
                userVerification: "required"
            }
        });

        if (assertion) {
            unlockAppSuccess("Unlocked via Biometrics");
        }
    }
  } catch (err) { 
      console.error("Biometric Error: ", err);
      // If it was auto-triggered and failed/canceled, do nothing because the PIN pad is already on screen!
      // Only show error text if they manually clicked the "Retry" button and it failed again.
      if (!isAuto) {
          triggerPinError("Fingerprint failed or canceled. Please use PIN."); 
      }
  }
}

function unlockAppSuccess(toastMessage) {
    if (isVerifyingToDisablePin) {
       localStorage.removeItem('finwise-pin');
       localStorage.removeItem('finwise-biometric-id');
       document.getElementById('pin-enable-checkbox').checked = false;
       document.getElementById('security-lock-screen').style.display = 'none';
       triggerSuccessNotification("Security Disabled");
       isVerifyingToDisablePin = false;
       currentPinInput = "";
       updatePinDisplay();
       openPreferencesModal();
    } else {
      document.getElementById('security-lock-screen').style.opacity = '0';
      document.getElementById('security-lock-screen').style.transform = 'scale(1.05)';
      setTimeout(() => {
        document.getElementById('security-lock-screen').style.display = 'none';
        document.getElementById('security-lock-screen').style.opacity = '1';
        document.getElementById('security-lock-screen').style.transform = 'scale(1)';
      }, 300);
      currentPinInput = "";
      updatePinDisplay();
      if(toastMessage) triggerSuccessNotification(toastMessage);
    }
}