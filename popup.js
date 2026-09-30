// popup.js - Handles popup logic and embedded options for text search extension

const DEFAULT_CONFIG = {
    shortcut: { ctrl: true, alt: false, shift: false, meta: false, key: 'f' },
    autoMove: true,
    defaultBarCount: 2,
    highlightColor: '#ffe600',
    activeHighlightColor: '#ff8f00',
    ignoreDelimiters: '-'
};

let currentShortcut = { ...DEFAULT_CONFIG.shortcut };
let isRecording = false;
let toastTimeout = null;

function formatShortcutString(shortcut) {
    if (!shortcut) return 'Ctrl + F';
    const parts = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.alt) parts.push('Alt');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.meta) parts.push('Cmd/Win');
    const key = (shortcut.key || 'f').toUpperCase();
    if (key) parts.push(key);
    return parts.join(' + ');
}

function showToast(message) {
    const toast = document.getElementById('statusToast');
    if (!toast) return;
    toast.textContent = message;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.textContent = '';
    }, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
    const openSearchBtn = document.getElementById('openSearchBtn');
    const shortcutDisplay = document.getElementById('shortcutDisplay');
    const recordShortcutBtn = document.getElementById('recordShortcutBtn');
    const resetShortcutBtn = document.getElementById('resetShortcutBtn');
    const defaultBarCountInput = document.getElementById('defaultBarCount');
    const autoMoveToggle = document.getElementById('autoMoveToggle');
    const ignoreDelimitersInput = document.getElementById('ignoreDelimiters');
    const highlightColorInput = document.getElementById('highlightColor');
    const activeHighlightColorInput = document.getElementById('activeHighlightColor');

    // Load saved settings
    chrome.storage.sync.get([
        'shortcut',
        'autoMove',
        'defaultBarCount',
        'highlightColor',
        'activeHighlightColor',
        'ignoreDelimiters'
    ], (result) => {
        if (result.shortcut) {
            currentShortcut = { ...result.shortcut };
        }
        shortcutDisplay.value = formatShortcutString(currentShortcut);

        if (typeof result.defaultBarCount === 'number') {
            defaultBarCountInput.value = result.defaultBarCount;
        } else {
            defaultBarCountInput.value = DEFAULT_CONFIG.defaultBarCount;
        }

        if (typeof result.autoMove === 'boolean') {
            autoMoveToggle.checked = result.autoMove;
        } else {
            autoMoveToggle.checked = DEFAULT_CONFIG.autoMove;
        }

        if (typeof result.ignoreDelimiters === 'string') {
            ignoreDelimitersInput.value = result.ignoreDelimiters;
        } else {
            ignoreDelimitersInput.value = DEFAULT_CONFIG.ignoreDelimiters;
        }

        if (result.highlightColor) {
            highlightColorInput.value = result.highlightColor;
        } else {
            highlightColorInput.value = DEFAULT_CONFIG.highlightColor;
        }

        if (result.activeHighlightColor) {
            activeHighlightColorInput.value = result.activeHighlightColor;
        } else {
            activeHighlightColorInput.value = DEFAULT_CONFIG.activeHighlightColor;
        }
    });

    // Check if URL is restricted by Chrome
    function isRestrictedUrl(url) {
        if (!url) return true;
        const restrictedProtocols = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'view-source:', 'data:'];
        if (restrictedProtocols.some(proto => url.startsWith(proto))) return true;
        if (url.includes('chrome.google.com/webstore') || url.includes('chromewebstore.google.com')) return true;
        return false;
    }

    // Open search bar on active tab
    openSearchBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) return;

            if (isRestrictedUrl(tab.url)) {
                showToast('시스템 페이지에서는 검색을 실행할 수 없습니다.');
                return;
            }

            chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SEARCH' }, async (response) => {
                const err = chrome.runtime.lastError; // consume runtime.lastError
                if (!err && response?.success) {
                    window.close();
                    return;
                }

                // If content script is not yet injected on this tab, inject dynamically
                try {
                    if (chrome.scripting) {
                        await chrome.scripting.insertCSS({
                            target: { tabId: tab.id },
                            files: ['content.css']
                        }).catch(() => {});

                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            files: ['content.js']
                        });

                        chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SEARCH' }, () => {
                            void chrome.runtime.lastError; // consume runtime.lastError
                            window.close();
                        });
                    } else {
                        showToast('페이지 새로고침(F5) 후 다시 시도해 주세요.');
                    }
                } catch (injectErr) {
                    showToast('페이지에 검색창을 열 수 없습니다.');
                }
            });
        } catch (e) {
            showToast('검색창 열기에 실패했습니다.');
        }
    });

    // Shortcut recording
    recordShortcutBtn.addEventListener('click', () => {
        isRecording = true;
        shortcutDisplay.classList.add('recording');
        shortcutDisplay.value = '키를 누르세요...';
        shortcutDisplay.focus();
    });

    shortcutDisplay.addEventListener('keydown', (e) => {
        if (!isRecording) return;
        e.preventDefault();
        e.stopPropagation();

        const key = e.key;
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
            return;
        }

        if (key === 'Escape') {
            isRecording = false;
            shortcutDisplay.classList.remove('recording');
            shortcutDisplay.value = formatShortcutString(currentShortcut);
            return;
        }

        currentShortcut = {
            ctrl: e.ctrlKey,
            alt: e.altKey,
            shift: e.shiftKey,
            meta: e.metaKey,
            key: key.toLowerCase()
        };

        isRecording = false;
        shortcutDisplay.classList.remove('recording');
        shortcutDisplay.value = formatShortcutString(currentShortcut);

        chrome.storage.sync.set({ shortcut: currentShortcut }, () => {
            showToast('단축키가 저장되었습니다.');
        });
    });

    // Reset shortcut
    resetShortcutBtn.addEventListener('click', () => {
        currentShortcut = { ...DEFAULT_CONFIG.shortcut };
        isRecording = false;
        shortcutDisplay.classList.remove('recording');
        shortcutDisplay.value = formatShortcutString(currentShortcut);

        chrome.storage.sync.set({ shortcut: currentShortcut }, () => {
            showToast('Ctrl + F로 초기화되었습니다.');
        });
    });

    // Default bar count
    defaultBarCountInput.addEventListener('change', () => {
        let count = parseInt(defaultBarCountInput.value, 10);
        if (isNaN(count) || count < 1) count = 1;
        if (count > 6) count = 6;
        defaultBarCountInput.value = count;

        chrome.storage.sync.set({
            defaultBarCount: count,
            lastBarsState: null // 기본 개수 변경 시 새 기본 개수로 열리도록 리셋
        }, () => {
            showToast(`기본 검색바 개수가 ${count}개로 설정되었습니다.`);
        });
    });

    // Auto-Move toggle
    autoMoveToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ autoMove: autoMoveToggle.checked }, () => {
            showToast('자동 이동 설정이 저장되었습니다.');
        });
    });

    // Ignore delimiters for word expansion
    ignoreDelimitersInput.addEventListener('change', () => {
        const val = ignoreDelimitersInput.value;
        chrome.storage.sync.set({ ignoreDelimiters: val }, () => {
            showToast('무시 구분자 설정이 저장되었습니다.');
        });
    });

    // Highlight colors
    highlightColorInput.addEventListener('change', () => {
        chrome.storage.sync.set({ highlightColor: highlightColorInput.value }, () => {
            showToast('하이라이트 색상이 저장되었습니다.');
        });
    });

    activeHighlightColorInput.addEventListener('change', () => {
        chrome.storage.sync.set({ activeHighlightColor: activeHighlightColorInput.value }, () => {
            showToast('활성 색상이 저장되었습니다.');
        });
    });
});
