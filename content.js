let pickerActive = false;
let waitInterval = null;
let waitObserver = null;
let overlay = null;
let isWaitingPhase = false;

// ピッカー用オーバーレイの作成
function createOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '9999999';
    overlay.style.backgroundColor = 'rgba(26, 115, 232, 0.2)';
    overlay.style.border = '2px solid #1a73e8';
    overlay.style.display = 'none';
    
    // キャンセル案内テキスト
    const text = document.createElement('div');
    text.textContent = 'クリックで選択 / ESCでキャンセル';
    text.style.position = 'absolute';
    text.style.top = '-25px';
    text.style.left = '-2px';
    text.style.backgroundColor = '#1a73e8';
    text.style.color = 'white';
    text.style.padding = '2px 8px';
    text.style.borderRadius = '4px';
    text.style.fontSize = '12px';
    text.style.fontWeight = 'bold';
    text.style.whiteSpace = 'nowrap';
    overlay.appendChild(text);
    
    document.documentElement.appendChild(overlay);
}

function getSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).filter(c => c);
        if (classes.length > 0) return `${el.tagName.toLowerCase()}.${classes.join('.')}`;
    }
    return el.tagName.toLowerCase();
}

function handleMouseOver(e) {
    if (!pickerActive) return;
    const target = e.target;
    if (target === overlay || overlay.contains(target)) return;
    
    const rect = target.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
}

function handleMouseOut(e) {
    if (!pickerActive) return;
    if (overlay) overlay.style.display = 'none';
}

function handleClick(e) {
    if (!pickerActive) return;
    e.preventDefault();
    e.stopPropagation();
    
    stopPicker();
    const selector = getSelector(e.target);
    
    // Popupに選択したセレクターを送る
    chrome.runtime.sendMessage({ action: 'PICKED_SELECTOR', selector: selector });
    
    // UIフィードバック (緑色に一瞬光らせる)
    const originalOutline = e.target.style.outline;
    e.target.style.outline = '3px solid #34a853';
    setTimeout(() => {
        e.target.style.outline = originalOutline;
    }, 1000);
}

function handleKeyDown(e) {
    if (!pickerActive) return;
    if (e.key === 'Escape') {
        stopPicker();
    }
}

function startPicker() {
    if (isWaitingPhase) {
        alert("待機中はピッカーを使用できません。");
        return;
    }
    createOverlay();
    pickerActive = true;
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
}

function stopPicker() {
    pickerActive = false;
    if (overlay) {
        overlay.style.display = 'none';
    }
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
}

/* =========================================
   待機・クリック実行処理 (Hybrid approach)
   ========================================= */

function startWaiting(selector, targetTimeMs) {
    stopWaiting();
    isWaitingPhase = true;
    
    console.log(`[AutoClicker] 待機開始 - 対象: ${selector}, 予定時刻: ${new Date(targetTimeMs).toLocaleString()}.${String(targetTimeMs).slice(-3)}`);
    
    const PRE_POLL_MS = 5000; // 本番の5秒前から超高精度監視モードに入る
    
    waitInterval = setInterval(() => {
        const now = Date.now();
        if (now >= targetTimeMs - PRE_POLL_MS) {
            clearInterval(waitInterval);
            waitInterval = null;
            startHighPrecisionPhase(selector, targetTimeMs);
        }
    }, 100);
}

function startHighPrecisionPhase(selector, targetTimeMs) {
    console.log(`[AutoClicker] 高精度監視モード突入! (${selector})`);
    
    let clicked = false;
    
    const tryClick = () => {
        if (clicked) return true;
        
        const now = Date.now();
        if (now >= targetTimeMs) {
            const el = document.querySelector(selector);
            if (el) {
                // 要素が存在すれば最速でクリック
                el.click();
                clicked = true;
                console.log(`[AutoClicker] 🔥クリック成功🔥 時刻: ${now} (誤差 +${now - targetTimeMs}ms)`);
                stopWaiting();
                
                // 通知
                alert(`オートクリック成功！\n実行時刻: ${new Date(now).toLocaleString()}.${String(now).slice(-3)}\nセレクター: ${selector}`);
                return true;
            }
        }
        return false;
    };

    // 1. requestAnimationFrame (画面描画のたびに毎回チェック = 最高速ループ)
    const loop = () => {
        if (clicked || !isWaitingPhase) return;
        if (tryClick()) return;
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    
    // 2. MutationObserver (ボタンが現れたり、classが変わったりした瞬間に検知)
    waitObserver = new MutationObserver(() => {
        if (!clicked && isWaitingPhase) {
            tryClick();
        }
    });

    if (document.body) {
        waitObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
    }
}

function stopWaiting() {
    isWaitingPhase = false;
    if (waitInterval) {
        clearInterval(waitInterval);
        waitInterval = null;
    }
    if (waitObserver) {
        waitObserver.disconnect();
        waitObserver = null;
    }
}

// Popupからのメッセージを受信
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'START_PICKER') {
        startPicker();
        sendResponse({ success: true });
    } else if (msg.action === 'STOP_PICKER') {
        stopPicker();
        sendResponse({ success: true });
    } else if (msg.action === 'START_WAITING') {
        startWaiting(msg.selector, msg.targetTimeMs);
        sendResponse({ success: true });
    } else if (msg.action === 'STOP_WAITING') {
        stopWaiting();
        sendResponse({ success: true });
    }
    return true; 
});
