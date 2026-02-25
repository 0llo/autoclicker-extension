document.getElementById('start').addEventListener('click', async () => {
  const interval = parseInt(document.getElementById('interval').value, 10) || 1000;
  // 現在アクティブなタブを取得
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // 対象のタブでスクリプトを実行
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: startClicker,
    args: [interval]
  });
});

document.getElementById('stop').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: stopClicker
  });
});

// --- 以下の関数はWebページ側のコンテキストで実行されます ---

function startClicker(interval) {
  if (window.autoClickerInterval) return;
  
  console.log(`オートクリッカー開始 (${interval}ms間隔)`);
  window.autoClickerInterval = setInterval(() => {
    // 画面中央の要素を取得してクリック（必要に応じてロジックを変更してください）
    const element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    if (element) {
      element.click();
      console.log("クリックしました:", element);
    }
  }, interval);
}

function stopClicker() {
  if (window.autoClickerInterval) {
    clearInterval(window.autoClickerInterval);
    window.autoClickerInterval = null;
    console.log("オートクリッカー停止");
  }
}
