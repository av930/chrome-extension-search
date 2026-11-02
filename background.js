// ==========================================================================================================
// background.js - Service Worker for in-page text search extension
// 페이지 내 텍스트 검색 확장 프로그램의 백그라운드 서비스 워커 스크립트.
// ==========================================================================================================

// ## 단계 100: 확장 프로그램 설치 및 초기 설정 초기화
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//----------------------------------------------------------------------------------------------------------
// Date 객체를 YYMMDD.HHmm 형식(예: 261003.1432)의 버전 문자열로 변환한다.
// 입력: date - Date 객체 (기본값: 현재 시각)
// 출력: "YYMMDD.HHmm" 형태의 포맷팅된 문자열
//----------------------------------------------------------------------------------------------------------
function formatPackageLoadTime(date = new Date()) {
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yy}${mm}${dd}.${hh}${min}`;
}

const USER_SETTING_KEYS = [
    'shortcut',
    'autoMove',
    'showDashboard',
    'highlightColor',
    'activeHighlightColor',
    'defaultBarCount',
    'lastBarsState',
    'ignoreDelimiters'
];
const LEGACY_SYNC_CLEANUP_KEY = 'legacySyncCleanupComplete';

function initializeLocalSettings() {
    chrome.storage.local.get(USER_SETTING_KEYS, (result) => {
        const defaults = {};

        if (!result.shortcut) defaults.shortcut = { ctrl: true, alt: false, shift: false, meta: false, key: 'f' };
        if (typeof result.autoMove !== 'boolean') defaults.autoMove = true;
        if (typeof result.showDashboard !== 'boolean') defaults.showDashboard = false;
        if (!result.highlightColor) defaults.highlightColor = '#ffe600';
        if (!result.activeHighlightColor) defaults.activeHighlightColor = '#ff8f00';
        if (typeof result.defaultBarCount !== 'number') defaults.defaultBarCount = 2;
        if (typeof result.ignoreDelimiters !== 'string') defaults.ignoreDelimiters = '-';

        if (Object.keys(defaults).length > 0) chrome.storage.local.set(defaults);
    });
}

function migrateLegacySyncSettings() {
    chrome.storage.local.get([...USER_SETTING_KEYS, LEGACY_SYNC_CLEANUP_KEY], (localSettings) => {
        if (localSettings[LEGACY_SYNC_CLEANUP_KEY]) {
            initializeLocalSettings();
            return;
        }

        chrome.storage.sync.get(USER_SETTING_KEYS, (syncSettings) => {
            const migratedSettings = {};
            USER_SETTING_KEYS.forEach((key) => {
                if (typeof localSettings[key] === 'undefined' && typeof syncSettings[key] !== 'undefined') {
                    migratedSettings[key] = syncSettings[key];
                }
            });

            chrome.storage.local.set(migratedSettings, () => {
                chrome.storage.sync.clear(() => {
                    if (chrome.runtime.lastError) {
                        initializeLocalSettings();
                        return;
                    }
                    chrome.storage.local.set({ [LEGACY_SYNC_CLEANUP_KEY]: true }, initializeLocalSettings);
                });
            });
        });
    });
}

// 서비스 워커 초기 로드 시 패키지 로드 시각 저장 상태 확인
chrome.storage.local.get(['packageLoadTime'], (res) => {
    if (!res || !res.packageLoadTime) {
        chrome.storage.local.set({ packageLoadTime: formatPackageLoadTime(new Date()) });
    }
});

chrome.runtime.onInstalled.addListener((details) => {
    // 설치 또는 업데이트 로그 기록
    console.log('Text Search Extension installed:', details.reason);

    // 로컬 패키지 로드 시각 기록 (마켓플레이스로부터의 업데이트가 아닌 경우 갱신)
    const manifest = chrome.runtime.getManifest ? chrome.runtime.getManifest() : {};
    const isFromStore = Boolean(manifest.update_url && manifest.update_url.includes('google.com'));
    if (!isFromStore) {
        chrome.storage.local.set({ packageLoadTime: formatPackageLoadTime(new Date()) });
    }

    migrateLegacySyncSettings();
});
