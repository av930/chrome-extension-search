// ==========================================================================================================
// background.js - Service Worker for in-page text search extension
// 페이지 내 텍스트 검색 확장 프로그램의 백그라운드 서비스 워커 스크립트.
// ==========================================================================================================

// ## 단계 100: 확장 프로그램 설치 및 초기 설정 초기화
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
chrome.runtime.onInstalled.addListener((details) => {
    // 설치 또는 업데이트 로그 기록
    console.log('Text Search Extension installed:', details.reason);

    // 스토리지에 기본 설정값이 없을 경우 기본값으로 초기화
    chrome.storage.sync.get([
        'shortcut',
        'autoMove',
        'highlightColor',
        'activeHighlightColor',
        'defaultBarCount',
        'lastBarsState',
        'ignoreDelimiters'
    ], (result) => {
        const defaults = {};

        // 기본 단축키: Ctrl + F
        if (!result.shortcut) {
            defaults.shortcut = { ctrl: true, alt: false, shift: false, meta: false, key: 'f' };
        }
        // 첫 번째 일치 항목 자동 스크롤 이동 기본값: true
        if (typeof result.autoMove !== 'boolean') {
            defaults.autoMove = true;
        }
        // 기본 일치 하이라이트 색상: 노란색
        if (!result.highlightColor) {
            defaults.highlightColor = '#ffe600';
        }
        // 활성 일치 하이라이트 색상: 주황색
        if (!result.activeHighlightColor) {
            defaults.activeHighlightColor = '#ff8f00';
        }
        // 기본 검색바 개수 초기값: 2개
        if (typeof result.defaultBarCount !== 'number') {
            defaults.defaultBarCount = 2;
        }
        // 선택기능 단어 확장 시 무시할 구분자 기본값: '-'
        if (typeof result.ignoreDelimiters !== 'string') {
            defaults.ignoreDelimiters = '-';
        }

        // 미설정 항목이 있는 경우 스토리지에 일괄 저장
        if (Object.keys(defaults).length > 0) {
            chrome.storage.sync.set(defaults);
        }
    });
});
