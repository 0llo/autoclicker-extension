document.addEventListener('DOMContentLoaded', async () => {
  const selectorInput = document.getElementById('selector');
  const targetTimeInput = document.getElementById('target-time');
  const pickBtn = document.getElementById('pick-btn');
  const startBtn = document.getElementById('start-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const statusDiv = document.getElementById('status');
  const countdownDiv = document.getElementById('countdown');

  let countdownInterval = null;

  // Set default time to today at 10:00:00
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const defaultTimeString = `${year}-${month}-${day}T10:00:00`;
  targetTimeInput.value = defaultTimeString;

  // Load saved state
  chrome.storage.local.get(['selector', 'targetTime', 'isWaiting'], (result) => {
    if (result.selector) selectorInput.value = result.selector;
    if (result.isWaiting && result.targetTime) {
      targetTimeInput.value = result.targetTime;
      setWaitingState(true, new Date(result.targetTime).getTime());
    }
  });

  function setWaitingState(isWaiting, targetTimeMs = null) {
    if (isWaiting) {
      startBtn.disabled = true;
      cancelBtn.disabled = false;
      selectorInput.disabled = true;
      targetTimeInput.disabled = true;
      pickBtn.disabled = true;
      statusDiv.textContent = "待機中です...";
      statusDiv.style.color = "blue";
      
      if (targetTimeMs) {
        startCountdown(targetTimeMs);
      }
    } else {
      startBtn.disabled = false;
      cancelBtn.disabled = true;
      selectorInput.disabled = false;
      targetTimeInput.disabled = false;
      pickBtn.disabled = false;
      statusDiv.textContent = "";
      stopCountdown();
    }
  }

  function startCountdown(targetTimeMs) {
    stopCountdown();
    const updateCountdown = () => {
      const remaining = targetTimeMs - Date.now();
      if (remaining <= 0) {
        countdownDiv.textContent = "実行時間になりました！";
        countdownDiv.style.color = "#4CAF50";
        stopCountdown();
      } else {
        const h = String(Math.floor(remaining / 3600000)).padStart(2, '0');
        const m = String(Math.floor((remaining % 3600000) / 60000)).padStart(2, '0');
        const s = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
        const ms = String(remaining % 1000).padStart(3, '0');
        countdownDiv.textContent = `残り: ${h}:${m}:${s}.${ms}`;
        countdownDiv.style.color = "#d32f2f";
      }
    };
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 50);
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    if (countdownDiv) {
      countdownDiv.textContent = "";
    }
  }

  async function sendMessageToTab(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
      console.warn("Could not send message to tab. It might not be loadable or a chrome:// page.", e);
      if (message.action === "startPicker") {
        alert("このページでは要素を選択できません。");
      }
    }
  }

  // Pick an element
  pickBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      sendMessageToTab(tab.id, { action: "startPicker" });
      window.close(); // Close popup to let user pick
    }
  });

  // Receive picked selector from content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "selectorPicked") {
      selectorInput.value = request.selector;
      chrome.storage.local.set({ selector: request.selector });
    } else if (request.action === "waitingFinished") {
      setWaitingState(false);
      chrome.storage.local.set({ isWaiting: false });
    }
  });

  // Start waiting
  startBtn.addEventListener('click', async () => {
    const selector = selectorInput.value.trim();
    const targetTime = targetTimeInput.value;

    if (!selector || !targetTime) {
      alert("セレクターと日時を入力してください。");
      return;
    }

    const timestamp = new Date(targetTime).getTime();
    if (timestamp <= Date.now()) {
      alert("未来の日時を指定してください。");
      return;
    }

    chrome.storage.local.set({ 
      selector, 
      targetTime, 
      isWaiting: true 
    });

    setWaitingState(true, timestamp);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      sendMessageToTab(tab.id, { 
        action: "startWaiting", 
        selector: selector, 
        targetTime: timestamp 
      });
    }
  });

  // Cancel waiting
  cancelBtn.addEventListener('click', async () => {
    chrome.storage.local.set({ isWaiting: false });
    setWaitingState(false);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      sendMessageToTab(tab.id, { action: "cancelWaiting" });
    }
  });
});
