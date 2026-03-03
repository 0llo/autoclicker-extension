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
let waitingFallbackInterval = null;
let mutationObserver = null;
let isWaitingActive = false;
let targetTimeMsGlobal = null;

function clickElement(selector) {
  const el = document.querySelector(selector);
  // 要素が存在し、かつdisabledでないことを確認
  if (el && !el.disabled && !el.hasAttribute('disabled') && !el.classList.contains('disabled')) {
    console.log(`[Auto-Clicker] Found element: ${selector}. Attempting to click...`);
    
    // ネイティブClick (可能であれば)
    if (typeof el.click === 'function') {
      el.click();
    }
    
    // Reactなどの合成イベント用にイベント送出
    const events = ['mousedown', 'mouseup', 'click'];
    events.forEach(eventName => {
      const ev = new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window });
      el.dispatchEvent(ev);
    });
    
    console.log(`[Auto-Clicker] Successfully triggered click at ${new Date().toISOString()}`);
    return true;
  }
  return false;
}

function startHybridWaiting(selector, targetTimeMs) {
  isWaitingActive = true;
  targetTimeMsGlobal = targetTimeMs;
  
  const INTENSE_POLLING_MARGIN = 60000; // 1分前から超高速監視モード

  console.log(`[Auto-Clicker] Waiting started for ${selector}. expected target: ${new Date(targetTimeMs).toLocaleString()}`);

  function check() {
    if (!isWaitingActive) return false;
    // 見つかったらPC時間に関係なく即クリックして終了する
    if (clickElement(selector)) {
      finishWaiting();
      return true;
    }
    return false;
  }

  function checkLoop() {
    if (!isWaitingActive) return;

    const now = Date.now();
    const timeRemaining = targetTimeMsGlobal - now;

    // 1分前〜15分後の範囲で本格的に検知を開始
    if (timeRemaining <= INTENSE_POLLING_MARGIN) {
      if (check()) return;

      if (now > targetTimeMsGlobal + 900000) { // ターゲット時間から15分経過で自動キャンセル
        console.log("[Auto-Clicker] 時間切れにより終了します。");
        finishWaiting();
        return;
      }
      
      // 次のフレームを要求
      waitingRafId = requestAnimationFrame(checkLoop);
    } else {
      // 遠い場合は省エネで1秒おきにチェック
      const sleepTime = Math.min(1000, timeRemaining - INTENSE_POLLING_MARGIN);
      setTimeout(checkLoop, sleepTime);
    }
  }

  // 裏タブでrequestAnimationFrameが停止した場合の保険
  waitingFallbackInterval = setInterval(() => {
    if (!isWaitingActive) return;
    const timeRemaining = targetTimeMsGlobal - Date.now();
    if (timeRemaining <= INTENSE_POLLING_MARGIN) {
      check();
    }
  }, 250);

  // MutationObserverでDOMの変更をミリ秒単位でフック
  mutationObserver = new MutationObserver((mutations) => {
    if (!isWaitingActive) return;
    const timeRemaining = targetTimeMsGlobal - Date.now();
    // 余裕を持って1分前から要素の出現・変化を即座に監視
    if (timeRemaining <= INTENSE_POLLING_MARGIN) {
       check();
    }
  });

  mutationObserver.observe(document.body, { 
    childList: true, 
    subtree: true,
    attributes: true, 
    attributeFilter: ['disabled', 'class', 'style', 'id']
  });

  checkLoop();
}

function finishWaiting() {
  isWaitingActive = false;
  if (waitingRafId) cancelAnimationFrame(waitingRafId);
  if (waitingFallbackInterval) { clearInterval(waitingFallbackInterval); waitingFallbackInterval = null; }
  if (mutationObserver) mutationObserver.disconnect();
  
  chrome.storage.local.set({ isWaiting: false });
  chrome.runtime.sendMessage({ action: "waitingFinished" });
  console.log("[Auto-Clicker] Finished waiting process.");
}

function cancelWaiting() {
  isWaitingActive = false;
  if (waitingRafId) cancelAnimationFrame(waitingRafId);
  if (waitingFallbackInterval) { clearInterval(waitingFallbackInterval); waitingFallbackInterval = null; }
  if (mutationObserver) mutationObserver.disconnect();
  console.log("[Auto-Clicker] Waiting cancelled.");
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startPicker") {
    startPicker();
  } else if (request.action === "startWaiting") {
    cancelWaiting(); // 中複実行防止
    startHybridWaiting(request.selector, request.targetTime);
  } else if (request.action === "cancelWaiting") {
    cancelWaiting();
  }
});

// --- Auto-Resume on Page Load ---
chrome.storage.local.get(['isWaiting', 'selector', 'targetTime'], (result) => {
  if (result.isWaiting && result.selector && result.targetTime) {
    const targetTimeMs = new Date(result.targetTime).getTime();
    const now = Date.now();
    
    // リロードしても待機情報を引き継ぐ猶予を従来の5秒から15分（900000ms）に変更
    // これによりサイトがカウントダウン0で自動リロードしても確実にクリック処理が再開される
    if (now <= targetTimeMs + 900000) {
      console.log("[Auto-Clicker] リロード検知: 自動で待機状態を再開します...");
      startHybridWaiting(result.selector, targetTimeMs);
    } else {
      chrome.storage.local.set({ isWaiting: false });
      setTimeout(() => chrome.runtime.sendMessage({ action: "waitingFinished" }), 1000);
    }
  }
});
