// --- Element Picker Logic ---
let pickerOverlay = null;

function highlightElement(e) {
  if (pickerOverlay) {
    const rect = e.target.getBoundingClientRect();
    pickerOverlay.style.top = rect.top + window.scrollY + 'px';
    pickerOverlay.style.left = rect.left + window.scrollX + 'px';
    pickerOverlay.style.width = rect.width + 'px';
    pickerOverlay.style.height = rect.height + 'px';
  }
}

function getCssSelector(element) {
  if (element.id) {
    return `#${element.id}`;
  }
  let selector = element.tagName.toLowerCase();
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).join('.');
    if (classes) {
      selector += `.${classes}`;
    }
  }
  return selector;
}

function handleElementClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const selector = getCssSelector(e.target);
  
  // Clean up picker
  document.removeEventListener('mousemove', highlightElement);
  document.removeEventListener('click', handleElementClick, true);
  if (pickerOverlay) pickerOverlay.remove();
  pickerOverlay = null;

  // Save selector to storage and notify popup
  chrome.storage.local.set({ selector: selector });
  chrome.runtime.sendMessage({ action: "selectorPicked", selector: selector });
  alert(`セレクターを記録しました: ${selector}`);
}

function startPicker() {
  if (pickerOverlay) return;
  pickerOverlay = document.createElement('div');
  pickerOverlay.style.position = 'absolute';
  pickerOverlay.style.backgroundColor = 'rgba(0, 150, 255, 0.3)';
  pickerOverlay.style.border = '2px solid rgb(0, 150, 255)';
  pickerOverlay.style.pointerEvents = 'none';
  pickerOverlay.style.zIndex = '999999';
  pickerOverlay.style.transition = 'top 0.05s, left 0.05s, width 0.05s, height 0.05s';
  document.body.appendChild(pickerOverlay);

  document.addEventListener('mousemove', highlightElement);
  document.addEventListener('click', handleElementClick, true);
}


// --- Waiting and Clicking Logic ---
let waitingRafId = null;
let mutationObserver = null;
let isWaitingActive = false;

function clickElement(selector) {
  const el = document.querySelector(selector);
  if (el) {
    // Dispatch a complete set of events in case it's a complex React/Vue button
    const events = ['mousedown', 'mouseup', 'click'];
    events.forEach(eventName => {
      const ev = new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window });
      el.dispatchEvent(ev);
    });
    
    console.log(`[Auto-Clicker] Clicked element: ${selector} at ${new Date().toISOString()}`);
    return true;
  }
  return false;
}

function startHybridWaiting(selector, targetTimeMs) {
  isWaitingActive = true;
  
  // Start intense polling 5 seconds before target time
  const INTENSE_POLLING_MARGIN = 5000; 

  console.log(`[Auto-Clicker] Waiting started for ${selector} at target time ${new Date(targetTimeMs).toLocaleString()}`);

  function checkLoop() {
    if (!isWaitingActive) return;

    const now = Date.now();
    const timeRemaining = targetTimeMs - now;

    if (timeRemaining <= 0) {
      // Time is up, try clicking
      if (clickElement(selector)) {
        finishWaiting();
        return;
      } else {
        // Not found yet. Keep looping as fast as possible waiting for DOM update.
        waitingRafId = requestAnimationFrame(checkLoop);
      }
    } else if (timeRemaining <= INTENSE_POLLING_MARGIN) {
      // Intense polling phase: use requestAnimationFrame for sub-millisecond precision checking
      waitingRafId = requestAnimationFrame(checkLoop);
    } else {
      // Far away from target, use setTimeout to be friendly to CPU
      const sleepTime = Math.min(1000, timeRemaining - INTENSE_POLLING_MARGIN);
      setTimeout(checkLoop, sleepTime);
    }
  }

  // Setup MutationObserver to immediately catch DOM changes (like button appearing) 
  // without waiting for the next requestAnimationFrame cycle during the intense period
  mutationObserver = new MutationObserver((mutations) => {
    if (!isWaitingActive) return;
    const now = Date.now();
    
    // Only intercept via DOM changes if we are very close to target or past it
    if (targetTimeMs - now <= INTENSE_POLLING_MARGIN) {
      if (clickElement(selector)) {
        finishWaiting();
      }
    }
  });

  mutationObserver.observe(document.body, { 
    childList: true, 
    subtree: true,
    attributes: true, 
    attributeFilter: ['style', 'class', 'disabled'] // in case it appears by class change or was disabled
  });

  // Kick off the loop
  checkLoop();
}

function finishWaiting() {
  isWaitingActive = false;
  if (waitingRafId) cancelAnimationFrame(waitingRafId);
  if (mutationObserver) mutationObserver.disconnect();
  
  chrome.storage.local.set({ isWaiting: false });
  chrome.runtime.sendMessage({ action: "waitingFinished" });
  console.log("[Auto-Clicker] Finished waiting process.");
}

function cancelWaiting() {
  isWaitingActive = false;
  if (waitingRafId) cancelAnimationFrame(waitingRafId);
  if (mutationObserver) mutationObserver.disconnect();
  console.log("[Auto-Clicker] Waiting cancelled.");
}


// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startPicker") {
    startPicker();
  } else if (request.action === "startWaiting") {
    cancelWaiting(); // Prevent multiple loops
    startHybridWaiting(request.selector, request.targetTime);
  } else if (request.action === "cancelWaiting") {
    cancelWaiting();
  }
});
