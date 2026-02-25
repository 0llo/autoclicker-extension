document.addEventListener('DOMContentLoaded', () => {
    const selectorInput = document.getElementById('selector');
    const pickBtn = document.getElementById('pickBtn');
    const targetTimeInput = document.getElementById('targetTime');
    const statusText = document.getElementById('statusText');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');

    // 状態復元
    chrome.storage.local.get(['savedSelector', 'savedTime', 'isWaiting'], (data) => {
        if (data.savedSelector) selectorInput.value = data.savedSelector;
        if (data.savedTime) targetTimeInput.value = data.savedTime;
        
        if (data.isWaiting) {
            setWaitingUI(true);
        }
    });

    // 入力変更で保存
    selectorInput.addEventListener('change', () => {
        chrome.storage.local.set({ savedSelector: selectorInput.value });
    });
    targetTimeInput.addEventListener('change', () => {
        chrome.storage.local.set({ savedTime: targetTimeInput.value });
    });

    // ピッカー起動
    pickBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    files: ['content.js'] // 念のためロード
                }, () => {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'START_PICKER' });
                    window.close(); // ポップアップを閉じる
                });
            }
        });
    });

    // 待機開始
    startBtn.addEventListener('click', () => {
        const selector = selectorInput.value.trim();
        const timeStr = targetTimeInput.value;

        if (!selector || !timeStr) {
            alert('セレクターと実行日時を両方入力してください。');
            return;
        }

        const targetTimeMs = new Date(timeStr).getTime();
        if (targetTimeMs <= Date.now()) {
            alert('未来の日時を設定してください。');
            return;
        }

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                const tabId = tabs[0].id;

                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content.js']
                }, () => {
                    chrome.tabs.sendMessage(tabId, {
                        action: 'START_WAITING',
                        selector: selector,
                        targetTimeMs: targetTimeMs
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            alert('このページでは実行できません。\n' + chrome.runtime.lastError.message);
                            return;
                        }
                        
                        chrome.storage.local.set({ isWaiting: true, waitingTabId: tabId });
                        setWaitingUI(true);
                    });
                });
            }
        });
    });

    // キャンセル
    stopBtn.addEventListener('click', () => {
        chrome.storage.local.get(['waitingTabId'], (data) => {
            if (data.waitingTabId) {
                chrome.tabs.sendMessage(data.waitingTabId, { action: 'STOP_WAITING' }, () => {
                    chrome.runtime.lastError; // エラー無視
                });
            }
            chrome.storage.local.set({ isWaiting: false });
            setWaitingUI(false);
        });
    });

    // content script からのメッセージ（ピッカーで選択完了した時など）
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'PICKED_SELECTOR') {
            selectorInput.value = msg.selector;
            chrome.storage.local.set({ savedSelector: msg.selector });
        }
    });

    function setWaitingUI(isWaiting) {
        if (isWaiting) {
            statusText.textContent = '待機中... (そのタブを開いたままにしてください)';
            statusText.style.color = '#e53935';
            statusText.style.fontWeight = 'bold';
            startBtn.disabled = true;
            stopBtn.disabled = false;
            selectorInput.disabled = true;
            targetTimeInput.disabled = true;
            pickBtn.disabled = true;
        } else {
            statusText.textContent = '待機していません';
            statusText.style.color = '#333';
            statusText.style.fontWeight = 'normal';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            selectorInput.disabled = false;
            targetTimeInput.disabled = false;
            pickBtn.disabled = false;
        }
    }
});
