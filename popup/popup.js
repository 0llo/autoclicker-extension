document.addEventListener('DOMContentLoaded', async () => {
  const selectorInput = document.getElementById('selector');
  const targetTimeInput = document.getElementById('target-time');
  const pickBtn = document.getElementById('pick-btn');
  const startBtn = document.getElementById('start-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const statusDiv = document.getElementById('status');

  // Load saved state
  chrome.storage.local.get(['selector', 'targetTime', 'isWaiting'], (result) => {
    if (result.selector) selectorInput.value = result.selector;
    if (result.targetTime) targetTimeInput.value = result.targetTime;
    if (result.isWaiting) {
      setWaitingState(true);
    }
  });

  function setWaitingState(isWaiting) {
    if (isWaiting) {
      startBtn.disabled = true;
      cancelBtn.disabled = false;
      selectorInput.disabled = true;
      targetTimeInput.disabled = true;
      pickBtn.disabled = true;
      statusDiv.textContent = "待機中です...";
      statusDiv.style.color = "blue";
    } else {
      startBtn.disabled = false;
      cancelBtn.disabled = true;
      selectorInput.disabled = false;
      targetTimeInput.disabled = false;
      pickBtn.disabled = false;
      statusDiv.textContent = "";
    }
  }

  // Pick an element
  pickBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: "startPicker" });
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

    setWaitingState(true);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { 
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
      chrome.tabs.sendMessage(tab.id, { action: "cancelWaiting" });
    }
  });
});
