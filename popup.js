// ==========================================================================================================
// popup.js - Handles popup logic and embedded options for text search extension
// 브라우저 툴바 팝업 UI의 이벤트 제어 및 설정(단축키, 바 개수, 무시구분자 등) 실시간 동기화 스크립트.
// ==========================================================================================================

// ## 단계 100: 기본 환경설정 상수 및 상태 변수 정의
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
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

//----------------------------------------------------------------------------------------------------------
// 단축키 설정 객체를 사람이 읽기 쉬운 문자열 형태로 변환한다.
// 입력: shortcut - 단축키 조합 객체 { ctrl, alt, shift, meta, key }
// 출력: "Ctrl + F" 형태의 포맷팅된 문자열
//----------------------------------------------------------------------------------------------------------
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

//----------------------------------------------------------------------------------------------------------
// 팝업 하단에 피드백 토스트 알림 메시지를 일시적으로 표시한다.
// 입력: message - 화면에 표시할 문자열
// 출력: 없음
//----------------------------------------------------------------------------------------------------------
function showToast(message) {
    const toast = document.getElementById('statusToast');
    if (!toast) return;
    toast.textContent = message;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.textContent = '';
    }, 2000);
}

//----------------------------------------------------------------------------------------------------------
// Chrome 내부 시스템 페이지 및 웹스토어 등 스크립트 주입 제한 URL 여부를 판별한다.
// 입력: url - 대상 탭의 URL 문자열
// 출력: true(제한된 페이지) 또는 false(일반 웹페이지)
//----------------------------------------------------------------------------------------------------------
function isRestrictedUrl(url) {
    if (!url) return true;
    const restrictedProtocols = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'view-source:', 'data:'];
    if (restrictedProtocols.some(proto => url.startsWith(proto))) return true;
    if (url.includes('chrome.google.com/webstore') || url.includes('chromewebstore.google.com')) return true;
    return false;
}

// ## 단계 200: DOM 로드 및 설정값 초기화 / 이벤트 바인딩
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
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

    // 스토리지에 저장된 사용자 설정값 불러오기
    chrome.storage.sync.get([
        'shortcut',
        'autoMove',
        'defaultBarCount',
        'highlightColor',
        'activeHighlightColor',
        'ignoreDelimiters'
    ], (result) => {
        // 단축키 설정 복원
        if (result.shortcut) {
            currentShortcut = { ...result.shortcut };
        }
        shortcutDisplay.value = formatShortcutString(currentShortcut);

        // 기본 검색바 개수 복원 (기본값: 2)
        defaultBarCountInput.value = (typeof result.defaultBarCount === 'number')
            ? result.defaultBarCount
            : DEFAULT_CONFIG.defaultBarCount;

        // 자동 이동 옵션 복원
        autoMoveToggle.checked = (typeof result.autoMove === 'boolean')
            ? result.autoMove
            : DEFAULT_CONFIG.autoMove;

        // 선택기능 무시구분자 복원 (기본값: '-')
        ignoreDelimitersInput.value = (typeof result.ignoreDelimiters === 'string')
            ? result.ignoreDelimiters
            : DEFAULT_CONFIG.ignoreDelimiters;

        // 하이라이트 색상 복원
        highlightColorInput.value = result.highlightColor || DEFAULT_CONFIG.highlightColor;
        activeHighlightColorInput.value = result.activeHighlightColor || DEFAULT_CONFIG.activeHighlightColor;
    });

// ## 단계 210: 검색창 열기 액션 처리
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    openSearchBtn.addEventListener('click', async () => {
        try {
            // 현재 활성화된 탭 조회
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.id) return;

            // 시스템 페이지 여부 검사
            if (isRestrictedUrl(tab.url)) {
                showToast('시스템 페이지에서는 검색을 실행할 수 없습니다.');
                return;
            }

            // 활성 탭의 content script로 검색창 열기 메시지 전송
            chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SEARCH' }, async (response) => {
                const err = chrome.runtime.lastError;
                if (!err && response?.success) {
                    window.close();
                    return;
                }

                // 기존 탭에 content script가 아직 주입되지 않은 경우 동적 삽입 후 재시도
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
                            void chrome.runtime.lastError;
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

// ## 단계 220: 단축키 녹음 및 초기화 이벤트
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
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
        // 보조키 단독 입력 시에는 대기
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
            return;
        }

        // ESC 키 입력 시 녹음 취소
        if (key === 'Escape') {
            isRecording = false;
            shortcutDisplay.classList.remove('recording');
            shortcutDisplay.value = formatShortcutString(currentShortcut);
            return;
        }

        // 새 단축키 객체 저장
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

        // 스토리지에 새 단축키 영구 저장
        chrome.storage.sync.set({ shortcut: currentShortcut }, () => {
            showToast('단축키가 저장되었습니다.');
        });
    });

    // 기본 단축키(Ctrl+F)로 초기화
    resetShortcutBtn.addEventListener('click', () => {
        currentShortcut = { ...DEFAULT_CONFIG.shortcut };
        isRecording = false;
        shortcutDisplay.classList.remove('recording');
        shortcutDisplay.value = formatShortcutString(currentShortcut);

        chrome.storage.sync.set({ shortcut: currentShortcut }, () => {
            showToast('Ctrl + F로 초기화되었습니다.');
        });
    });

// ## 단계 230: 옵션 변경 실시간 저장 이벤트
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // 기본 검색바 개수 변경 (1~6개 범위 제한)
    defaultBarCountInput.addEventListener('change', () => {
        let count = parseInt(defaultBarCountInput.value, 10);
        if (isNaN(count) || count < 1) count = 1;
        if (count > 6) count = 6;
        defaultBarCountInput.value = count;

        chrome.storage.sync.set({
            defaultBarCount: count,
            lastBarsState: null // 새 기본 개수로 열리도록 이전 상태 리셋
        }, () => {
            showToast(`기본 검색바 개수가 ${count}개로 설정되었습니다.`);
        });
    });

    // 자동 스크롤 이동(Auto-Move) 토글 변경
    autoMoveToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ autoMove: autoMoveToggle.checked }, () => {
            showToast('자동 이동 설정이 저장되었습니다.');
        });
    });

    // 선택기능 무시구분자 변경
    ignoreDelimitersInput.addEventListener('change', () => {
        const val = ignoreDelimitersInput.value;
        chrome.storage.sync.set({ ignoreDelimiters: val }, () => {
            showToast('무시 구분자 설정이 저장되었습니다.');
        });
    });

    // 일반 일치 하이라이트 색상 변경
    highlightColorInput.addEventListener('change', () => {
        chrome.storage.sync.set({ highlightColor: highlightColorInput.value }, () => {
            showToast('하이라이트 색상이 저장되었습니다.');
        });
    });

    // 활성 일치 하이라이트 색상 변경
    activeHighlightColorInput.addEventListener('change', () => {
        chrome.storage.sync.set({ activeHighlightColor: activeHighlightColorInput.value }, () => {
            showToast('활성 색상이 저장되었습니다.');
        });
    });
});
