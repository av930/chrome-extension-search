// ==========================================================================================================
// content.js - In-page text search script with multiple search bars, distinct highlight colors, and navigation
// 웹 페이지 본문에 삽입되어 다중 검색바 오버레이, 실시간 증분 하이라이트, 북마크 및 텍스트 선택 확장을 수행하는 스크립트.
// ==========================================================================================================

(function () {
    'use strict';

    // 중복 스크립트 실행 방지 플래그 검사
    if (window.__chromeSearchExtensionLoaded) {
        return;
    }
    window.__chromeSearchExtensionLoaded = true;

// ## 단계 100: 검색바 고유 하이라이트 팔레트 및 전역 상태 정의
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // 다중 검색바별로 자동 할당되는 6가지 테마 색상 팔레트
    const COLOR_PALETTES = [
        {
            name: 'yellow',
            highlight: '#ffe600',
            text: '#000000',
            active: '#ff8f00',
            activeText: '#ffffff',
            activeOutline: '#e65100',
            badge: '#ffd600'
        },
        {
            name: 'cyan',
            highlight: '#00e5ff',
            text: '#000000',
            active: '#0091ea',
            activeText: '#ffffff',
            activeOutline: '#01579b',
            badge: '#00b0ff'
        },
        {
            name: 'magenta',
            highlight: '#ff4081',
            text: '#ffffff',
            active: '#c51162',
            activeText: '#ffffff',
            activeOutline: '#880e4f',
            badge: '#f50057'
        },
        {
            name: 'lime',
            highlight: '#76ff03',
            text: '#000000',
            active: '#2e7d32',
            activeText: '#ffffff',
            activeOutline: '#1b5e20',
            badge: '#64dd17'
        },
        {
            name: 'purple',
            highlight: '#e040fb',
            text: '#ffffff',
            active: '#aa00ff',
            activeText: '#ffffff',
            activeOutline: '#4a148c',
            badge: '#d500f9'
        },
        {
            name: 'orange',
            highlight: '#ff6e40',
            text: '#ffffff',
            active: '#dd2c00',
            activeText: '#ffffff',
            activeOutline: '#bf360c',
            badge: '#ff3d00'
        }
    ];

    // 스토리지와 동기화되는 전역 확장 프로그램 설정 객체
    let config = {
        shortcut: { ctrl: true, alt: false, shift: false, meta: false, key: 'f' },
        highlightColor: '#ffe600',
        activeHighlightColor: '#ff8f00',
        autoMove: true,
        defaultBarCount: 2,
        lastBarsState: null,
        ignoreDelimiters: '-'
    };

    // UI 인스턴스 및 런타임 제어 상태 변수
    let isBarVisible = false;
    let shadowRoot = null;
    let hostElement = null;
    let commonBar = null;
    let barsContainer = null;
    let bookmarksContainer = null;
    let bookmarks = [];
    let bars = [];
    let nextBarId = 1;
    let activeBar = null;

    // 동적 콘텐츠(SPA/무한 스크롤) 감시 상태 - isHighlighting은 확장 자체 DOM 변경을 무시하기 위한 가드 플래그
    let domObserver = null;
    let domObserverTimer = null;
    let isHighlighting = false;
    const DOM_OBSERVER_DELAY = 400;

    // 북마크 핀 생성 시 내부를 채울 생동감 있는 16가지 고유 색상 목록
    const BOOKMARK_COLORS = [
        '#29b6f6', '#ab47bc', '#26a69a', '#ffa726',
        '#ef5350', '#ec407a', '#7e57c2', '#42a5f5',
        '#26c6da', '#66bb6a', '#9ccc65', '#d4e157',
        '#ffee58', '#ffca28', '#8d6e63', '#78909c'
    ];

    //------------------------------------------------------------------------------------------------------
    // 북마크 핀 아이콘에 할당할 랜덤 색상 코드를 반환한다.
    // 입력: 없음
    // 출력: 16진수 색상 코드 문자열 (예: '#29b6f6')
    //------------------------------------------------------------------------------------------------------
    function getRandomBookmarkColor() {
        return BOOKMARK_COLORS[Math.floor(Math.random() * BOOKMARK_COLORS.length)];
    }

// ## 단계 200: 스토리지 데이터 동기화 및 영구 저장 관리
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //------------------------------------------------------------------------------------------------------
    // chrome.storage.local에 저장된 북마크 배열 데이터를 비동기 조회하여 메모리에 로드한다.
    // 입력: callback - 로드 완료 후 실행할 콜백 함수
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function loadBookmarks(callback) {
        if (!chrome.runtime?.id) {
            if (callback) callback();
            return;
        }
        chrome.storage.local.get(['bookmarks'], (result) => {
            bookmarks = Array.isArray(result.bookmarks) ? result.bookmarks : [];
            if (callback) callback();
        });
    }

    //------------------------------------------------------------------------------------------------------
    // 현재 메모리의 북마크 배열을 chrome.storage.local에 영구 저장한다.
    // 입력: 없음
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function saveBookmarks() {
        if (!chrome.runtime?.id) return;
        chrome.storage.local.set({ bookmarks: bookmarks });
    }

    //------------------------------------------------------------------------------------------------------
    // chrome.storage.sync에서 사용자 설정(단축키, 바 개수, 색상, 무시구분자 등)을 불러온다.
    // 입력: callback - 설정 로드 완료 후 실행할 콜백 함수
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function loadConfig(callback) {
        if (!chrome.runtime?.id) {
            if (callback) callback();
            return;
        }
        chrome.storage.sync.get([
            'shortcut',
            'highlightColor',
            'activeHighlightColor',
            'autoMove',
            'defaultBarCount',
            'lastBarsState',
            'ignoreDelimiters'
        ], (result) => {
            config._loaded = true;
            if (chrome.runtime.lastError) {
                if (callback) callback();
                return;
            }
            // 단축키 설정 적용
            if (result.shortcut) config.shortcut = result.shortcut;

            // 1번 검색바 일반 하이라이트 색상 설정 적용
            if (result.highlightColor) {
                config.highlightColor = result.highlightColor;
                COLOR_PALETTES[0].highlight = result.highlightColor;
                COLOR_PALETTES[0].badge = result.highlightColor;
            }

            // 1번 검색바 활성 하이라이트 색상 설정 적용
            if (result.activeHighlightColor) {
                config.activeHighlightColor = result.activeHighlightColor;
                COLOR_PALETTES[0].active = result.activeHighlightColor;
            }

            // 기타 사용자 옵션(자동 이동, 검색바 개수, 무시구분자) 동기화
            if (typeof result.autoMove === 'boolean') config.autoMove = result.autoMove;
            if (typeof result.defaultBarCount === 'number') config.defaultBarCount = result.defaultBarCount;
            if (Array.isArray(result.lastBarsState)) config.lastBarsState = result.lastBarsState;
            if (typeof result.ignoreDelimiters === 'string') config.ignoreDelimiters = result.ignoreDelimiters;

            if (callback) callback();
        });
    }

    //------------------------------------------------------------------------------------------------------
    // 현재 열려있는 검색바들의 상태(옵션값, 검색어 등)를 저장하여 재실행 시 복원할 수 있도록 한다.
    // 입력: 없음
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function saveBarsState() {
        if (!chrome.runtime?.id) return;
        if (bars.length === 0) return;
        const state = bars.map(b => ({
            caseSensitive: !!b.caseSensitive,
            wholeWord: !!b.wholeWord,
            useRegex: !!b.useRegex,
            query: b.query || ''
        }));
        config.lastBarsState = state;
        chrome.storage.sync.set({ lastBarsState: state });
    }

    // Chrome Storage 쓰기 한도 쿼터(분당 120회)를 보호하기 위한 저장 디바운스 함수
    let saveBarsStateTimer = null;
    function debouncedSaveBarsState(delay = 400) {
        if (saveBarsStateTimer) clearTimeout(saveBarsStateTimer);
        saveBarsStateTimer = setTimeout(() => {
            saveBarsState();
        }, delay);
    }

    // 빠른 타이핑 시 불필요한 전체 DOM 재탐색을 방지하는 검색 디바운스 함수 (80ms)
    let searchDebounceTimer = null;
    function debouncedPerformAllSearches(bar, delay = 80) {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            performAllSearches(bar);
        }, delay);
    }

    // 다른 탭이나 팝업에서 변경된 스토리지 이벤트를 실시간 감지하여 반영
    chrome.storage.onChanged.addListener((changes, areaName) => {
        // 북마크 변경(로컬 스토리지) 실시간 동기화
        if (areaName === 'local') {
            if (changes.bookmarks) {
                bookmarks = changes.bookmarks.newValue || [];
                if (isBarVisible) {
                    renderBookmarks();
                }
            }
            return;
        }

        // 공통 환경설정(싱크 스토리지) 동기화
        if (areaName !== 'sync') return;
        if (changes.shortcut) config.shortcut = changes.shortcut.newValue;
        if (changes.highlightColor) {
            config.highlightColor = changes.highlightColor.newValue;
            COLOR_PALETTES[0].highlight = config.highlightColor;
            COLOR_PALETTES[0].badge = config.highlightColor;
            performAllSearches();
        }
        if (changes.activeHighlightColor) {
            config.activeHighlightColor = changes.activeHighlightColor.newValue;
            COLOR_PALETTES[0].active = config.activeHighlightColor;
            performAllSearches();
        }
        if (changes.autoMove) config.autoMove = changes.autoMove.newValue;
        if (changes.defaultBarCount) config.defaultBarCount = changes.defaultBarCount.newValue;
        if (changes.lastBarsState) config.lastBarsState = changes.lastBarsState.newValue;
        if (changes.ignoreDelimiters) config.ignoreDelimiters = changes.ignoreDelimiters.newValue;
    });

// ## 단계 300: Shadow DOM 기반 검색 UI 루트 컨테이너 및 공통 바 생성
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //------------------------------------------------------------------------------------------------------
    // 웹 페이지 고유 CSS와 격리된 Shadow DOM 루트와 상단 공통 바 및 검색바 컨테이너를 생성한다.
    // 기존에 루트 요소가 DOM에서 분리되었을 경우 재부착 처리를 함께 수행한다.
    // 입력: 없음
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function createUI() {
        // 이미 유효하게 DOM에 부착되어 있다면 재사용
        if (shadowRoot && hostElement && hostElement.isConnected) return;

        // DOM에서 일시 분리된 경우 본문에 재연결
        if (hostElement && !hostElement.isConnected) {
            (document.body || document.documentElement).appendChild(hostElement);
            return;
        }

        // 기존 고아 루트 요소가 존재하면 정리
        const oldRoot = document.getElementById('chrome-ext-search-root');
        if (oldRoot) {
            oldRoot.remove();
        }

        // 최상위 호스트 컨테이너 엘리먼트 생성 및 고정 위치 지정
        hostElement = document.createElement('div');
        hostElement.id = 'chrome-ext-search-root';
        hostElement.style.setProperty('position', 'fixed', 'important');
        hostElement.style.setProperty('top', '10px', 'important');
        hostElement.style.setProperty('right', '14px', 'important');
        hostElement.style.setProperty('z-index', '2147483647', 'important');
        hostElement.style.setProperty('display', 'none', 'important');
        hostElement.style.setProperty('margin', '0', 'important');
        hostElement.style.setProperty('padding', '0', 'important');
        hostElement.style.setProperty('transform', 'none', 'important');
        hostElement.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

        // 캡슐화된 Shadow DOM 트리 생성
        shadowRoot = hostElement.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = `
            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }
            .bars-container {
                display: flex;
                flex-direction: column;
                gap: 6px;
                align-items: flex-end;
                max-width: calc(100vw - 28px);
            }
            .search-bar {
                display: flex;
                align-items: center;
                background-color: #2b2d3c;
                border: 1px solid #3d4054;
                border-radius: 9999px;
                padding: 4px 10px;
                gap: 6px;
                color: #e1e3ea;
                font-size: 13px;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55);
                user-select: none;
                white-space: nowrap;
                flex-shrink: 0;
                transition: opacity 0.15s ease, border-color 0.15s ease;
            }
            .search-bar.active-bar {
                border-color: #5b6282;
            }
            .btn-add {
                background-color: #383a4c;
                border: none;
                outline: none;
                border-radius: 50%;
                width: 22px;
                height: 22px;
                color: #d1d4e2;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                padding: 0;
                flex-shrink: 0;
                transition: background-color 0.12s, color 0.12s, transform 0.12s;
            }
            .btn-add:hover {
                background-color: #4d72b8;
                color: #ffffff;
                transform: scale(1.08);
            }
            .btn-add svg {
                width: 14px;
                height: 14px;
                fill: currentColor;
            }
            .color-badge {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                flex-shrink: 0;
                box-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
            }
            .search-label {
                color: #d1d4e2;
                font-size: 12px;
                font-weight: 500;
                white-space: nowrap;
                flex-shrink: 0;
            }
            .input-box {
                display: flex;
                align-items: center;
                background-color: #161722;
                border: 1.5px solid #36384a;
                border-radius: 9999px;
                padding: 2px 6px 2px 10px;
                gap: 6px;
                flex-shrink: 1;
                min-width: 140px;
                transition: border-color 0.15s;
            }
            .input-box:focus-within {
                border-color: #4d72b8;
            }
            .input-box.invalid {
                border-color: #f38688 !important;
            }
            .search-input {
                background: transparent;
                border: none;
                outline: none;
                color: #ffffff;
                font-size: 12px;
                width: 115px;
                min-width: 60px;
                font-family: inherit;
            }
            .search-input::placeholder {
                color: #5c6072;
            }
            .count-info {
                color: #8f95a8;
                font-size: 11px;
                min-width: 42px;
                text-align: right;
                white-space: nowrap;
            }
            .btn-clear {
                background: #2b2e3e;
                border: none;
                outline: none;
                color: #8f95a8;
                border-radius: 50%;
                width: 15px;
                height: 15px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 9px;
                line-height: 1;
                padding: 0;
                visibility: hidden;
                transition: background-color 0.1s, color 0.1s;
            }
            .btn-clear.visible {
                visibility: visible;
            }
            .btn-clear:hover {
                background-color: #3f445c;
                color: #ffffff;
            }
            .nav-group {
                display: flex;
                align-items: center;
                background-color: #383a4c;
                border-radius: 9999px;
                padding: 1px 3px;
                gap: 2px;
                flex-shrink: 0;
            }
            .btn-nav {
                background: transparent;
                border: none;
                outline: none;
                color: #e2e5f2;
                border-radius: 9999px;
                width: 22px;
                height: 22px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                padding: 0;
                transition: background-color 0.1s, color 0.1s;
            }
            .btn-nav:hover {
                background-color: rgba(255, 255, 255, 0.2);
                color: #ffffff;
            }
            .btn-nav svg {
                width: 14px;
                height: 14px;
                fill: currentColor;
                stroke: currentColor;
                stroke-width: 1px;
            }
            .btn-close {
                background-color: #383a4c;
                border: none;
                outline: none;
                border-radius: 50%;
                width: 22px;
                height: 22px;
                color: #c0c4d6;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 11px;
                padding: 0;
                flex-shrink: 0;
                transition: background-color 0.1s, color 0.1s;
            }
            .btn-close:hover {
                background-color: #ed4245;
                color: #ffffff;
            }
            .options-group {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
            }
            .opt-label {
                display: flex;
                align-items: center;
                gap: 4px;
                color: #c8cbd8;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                user-select: none;
                white-space: nowrap;
                flex-shrink: 0;
                transition: color 0.1s;
            }
            .opt-label:hover {
                color: #ffffff;
            }
            .opt-label.active {
                color: #ffffff;
            }
            .opt-label input[type="checkbox"] {
                -webkit-appearance: none;
                appearance: none;
                background-color: #383a4c;
                border: 1px solid #5a5d73;
                border-radius: 3px;
                width: 13px;
                height: 13px;
                cursor: pointer;
                margin: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                position: relative;
                flex-shrink: 0;
                transition: background-color 0.12s, border-color 0.12s;
            }
            .opt-label input[type="checkbox"]:hover {
                border-color: #8c90a8;
            }
            .opt-label input[type="checkbox"]:checked {
                background-color: #4d72b8;
                border-color: #6088d4;
            }
            .opt-label input[type="checkbox"]:checked::after {
                content: '';
                width: 3px;
                height: 6px;
                border: solid #ffffff;
                border-width: 0 2px 2px 0;
                transform: rotate(45deg);
                position: relative;
                top: -1px;
            }
            .btn-bookmark {
                background: transparent;
                border: none;
                outline: none;
                color: #38bdf8;
                border-radius: 50%;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                padding: 0;
                flex-shrink: 0;
                transition: color 0.15s, background-color 0.15s, transform 0.15s;
            }
            .btn-bookmark:hover {
                background-color: rgba(56, 189, 248, 0.2);
                color: #7dd3fc;
                transform: scale(1.15);
            }
            .btn-bookmark svg {
                width: 16px;
                height: 16px;
            }
            .bookmarks-bar {
                display: flex;
                flex-direction: row-reverse;
                align-items: center;
                gap: 8px;
                max-width: 100%;
                overflow-x: auto;
                scrollbar-width: thin;
            }
            .common-bar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background-color: #3f4459;
                border: 1px solid #545b77;
                border-radius: 12px;
                padding: 6px 12px;
                gap: 12px;
                color: #e1e3ea;
                font-size: 13px;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55);
                user-select: none;
                white-space: nowrap;
                flex-shrink: 0;
                width: 100%;
                min-height: 48px;
            }
            .common-left-group {
                display: flex;
                align-items: center;
                gap: 2px;
                flex-shrink: 0;
            }
            .btn-thick-nav {
                background: transparent;
                border: none;
                outline: none;
                color: #38bdf8;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                padding: 0;
                border-radius: 4px;
                transition: background-color 0.15s, color 0.15s, transform 0.1s;
            }
            .btn-thick-nav:hover {
                background-color: rgba(56, 189, 248, 0.15);
                color: #7dd3fc;
                transform: scale(1.08);
            }
            .btn-thick-nav:active {
                transform: scale(0.95);
            }
            .btn-thick-nav svg {
                width: 20px;
                height: 20px;
            }
            .btn-text-select {
                background: transparent;
                border: none;
                outline: none;
                color: #ffffff;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                padding: 3px 5px;
                border-radius: 4px;
                font-family: inherit;
                transition: background-color 0.15s, color 0.15s;
            }
            .btn-text-select:hover {
                background-color: rgba(255, 255, 255, 0.12);
                color: #38bdf8;
            }
            .common-right-group {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
                margin-left: auto;
            }
            .bookmark-clip-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 3px;
                flex-shrink: 0;
            }
            .btn-pin-clip {
                background: rgba(30, 32, 44, 0.9);
                border: 1px solid #4a5068;
                border-radius: 6px;
                padding: 4px 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.15s, border-color 0.15s, background-color 0.15s;
            }
            .btn-pin-clip:hover {
                transform: translateY(-2px);
                border-color: #6088d4;
                background-color: #2b2e3e;
            }
            .btn-pin-clip svg {
                width: 18px;
                height: 18px;
                filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
            }
            .btn-clip-delete {
                background-color: #232533;
                border: 1px solid #4a5068;
                color: #8f95a8;
                border-radius: 4px;
                width: 20px;
                height: 16px;
                font-size: 10px;
                line-height: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                padding: 0;
                transition: background-color 0.1s, color 0.1s, border-color 0.1s;
            }
            .btn-clip-delete:hover {
                background-color: #ed4245;
                border-color: #ed4245;
                color: #ffffff;
            }
        `;

        barsContainer = document.createElement('div');
        barsContainer.className = 'bars-container';

        // Create common-bar at the top
        commonBar = document.createElement('div');
        commonBar.className = 'common-bar';
        commonBar.innerHTML = `
            <div class="common-left-group">
                <button type="button" class="btn-thick-nav btn-fast-prev" title="선택 영역 왼쪽 3단어 확장 (Expand selection 3 words left)">
                    <svg viewBox="0 0 24 24">
                        <path d="M19 6L14 12L19 18 M14 6L9 12L14 18 M9 6L4 12L9 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <button type="button" class="btn-thick-nav btn-thick-prev" title="선택 영역 왼쪽 1단어 확장 (Expand selection 1 word left)">
                    <svg viewBox="0 0 24 24">
                        <path d="M15 5L8 12L15 19" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <button type="button" class="btn-text-select" title="현재 선택된 텍스트 클립보드로 복사 (Copy selected text)">
                    text select
                </button>
                <button type="button" class="btn-thick-nav btn-thick-next" title="선택 영역 오른쪽 1단어 확장 (Expand selection 1 word right)">
                    <svg viewBox="0 0 24 24">
                        <path d="M9 5L16 12L9 19" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <button type="button" class="btn-thick-nav btn-fast-next" title="선택 영역 오른쪽 3단어 확장 (Expand selection 3 words right)">
                    <svg viewBox="0 0 24 24">
                        <path d="M5 6L10 12L5 18 M10 6L15 12L10 18 M15 6L20 12L15 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
            <div class="common-right-group bookmarks-bar"></div>
        `;

        bookmarksContainer = commonBar.querySelector('.bookmarks-bar');

        // Attach event listeners for common bar buttons
        const btnFastPrev = commonBar.querySelector('.btn-fast-prev');
        const btnThickPrev = commonBar.querySelector('.btn-thick-prev');
        const btnTextSelect = commonBar.querySelector('.btn-text-select');
        const btnThickNext = commonBar.querySelector('.btn-thick-next');
        const btnFastNext = commonBar.querySelector('.btn-fast-next');

        // Prevent mousedown from clearing the page text selection
        btnFastPrev.addEventListener('mousedown', (e) => e.preventDefault());
        btnThickPrev.addEventListener('mousedown', (e) => e.preventDefault());
        btnTextSelect.addEventListener('mousedown', (e) => e.preventDefault());
        btnThickNext.addEventListener('mousedown', (e) => e.preventDefault());
        btnFastNext.addEventListener('mousedown', (e) => e.preventDefault());

        btnFastPrev.addEventListener('click', (e) => {
            e.preventDefault();
            expandSelectionLeft(3);
        });

        btnThickPrev.addEventListener('click', (e) => {
            e.preventDefault();
            expandSelectionLeft(1);
        });

        btnThickNext.addEventListener('click', (e) => {
            e.preventDefault();
            expandSelectionRight(1);
        });

        btnFastNext.addEventListener('click', (e) => {
            e.preventDefault();
            expandSelectionRight(3);
        });

        btnTextSelect.addEventListener('click', (e) => {
            e.preventDefault();
            handleTextSelectAction(btnTextSelect);
        });

        shadowRoot.appendChild(style);
        barsContainer.appendChild(commonBar);
        shadowRoot.appendChild(barsContainer);
        (document.body || document.documentElement).appendChild(hostElement);
    }

// ## 단계 400: 개별 검색바 인스턴스 생성, 관리 및 이벤트 바인딩
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //------------------------------------------------------------------------------------------------------
    // 검색바 인스턴스 요소를 생성하고 옵션 체크박스 및 내비게이션 이벤트를 바인딩한다.
    // 생성된 검색바는 bars 배열에 추가되고 활성 바(activeBar)로 지정된다.
    // 입력: initData - 초기 검색어 및 옵션 { query, caseSensitive, wholeWord, useRegex }
    //       focusInput - 생성 직후 검색창 인풋 포커스 여부 (boolean)
    // 출력: 생성된 bar 인스턴스 객체
    //------------------------------------------------------------------------------------------------------
    function createSearchBar(initData = {}, focusInput = true) {
        createUI();

        // 초기화 데이터 및 검색 옵션 파싱
        const opts = (typeof initData === 'string') ? { query: initData } : (initData || {});
        const initialQuery = opts.query || '';
        const initialCase = !!opts.caseSensitive;
        const initialWord = !!opts.wholeWord;
        const initialRegex = !!opts.useRegex;

        // 색상 팔레트 및 고유 ID 할당
        const barIndex = bars.length;
        const palette = COLOR_PALETTES[barIndex % COLOR_PALETTES.length];
        const barId = nextBarId++;

        // 검색바 행(row) DOM 생성
        const row = document.createElement('div');
        row.className = 'search-bar';
        row.dataset.barId = String(barId);

        row.innerHTML = `
            <button type="button" class="btn-add" title="새 검색바 추가 (Add search row)">
                <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
            <button type="button" class="btn-close" title="닫기 (Close)">✕</button>
            <span class="color-badge" style="background-color: ${palette.badge};" title="하이라이트 색상"></span>
            <span class="search-label">Find in Page:</span>
            <div class="input-box">
                <input type="text" class="search-input" placeholder="검색..." spellcheck="false" autocomplete="off" />
                <span class="count-info">0 of 0</span>
                <button type="button" class="btn-clear" title="지우기">✕</button>
            </div>
            <div class="nav-group">
                <button type="button" class="btn-nav btn-prev" title="이전 (Shift+Enter, F4)">
                    <svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>
                </button>
                <button type="button" class="btn-nav btn-next" title="다음 (Enter, F3)">
                    <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                </button>
            </div>
            <div class="options-group">
                <label class="opt-label opt-case" title="대소문자 구분">
                    <input type="checkbox" class="chk-case">
                    <span>MatchCase</span>
                </label>
                <label class="opt-label opt-word" title="단어 단위 일치">
                    <input type="checkbox" class="chk-word">
                    <span>ByWord</span>
                </label>
                <label class="opt-label opt-regex" title="정규 표현식 검색">
                    <input type="checkbox" class="chk-regex">
                    <span>RegExp</span>
                </label>
                <button type="button" class="btn-bookmark" title="현재 페이지 및 검색어 북마크 (Pin to bookmarks)">
                    <svg viewBox="0 0 24 24">
                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6l1 1 1-1v-6H18v-2l-2-2z" transform="rotate(45 12 12)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        `;

        barsContainer.appendChild(row);

        // 검색바 인스턴스 데이터 구조 및 UI 엘리먼트 캐싱
        const bar = {
            id: barId,
            rowEl: row,
            colorConfig: palette,
            query: initialQuery,
            caseSensitive: initialCase,
            wholeWord: initialWord,
            useRegex: initialRegex,
            matches: [],
            currentIndex: -1,
            ui: {
                btnAdd: row.querySelector('.btn-add'),
                inputBox: row.querySelector('.input-box'),
                input: row.querySelector('.search-input'),
                countInfo: row.querySelector('.count-info'),
                btnClear: row.querySelector('.btn-clear'),
                btnPrev: row.querySelector('.btn-prev'),
                btnNext: row.querySelector('.btn-next'),
                btnClose: row.querySelector('.btn-close'),
                chkCase: row.querySelector('.chk-case'),
                labelCase: row.querySelector('.opt-case'),
                chkWord: row.querySelector('.chk-word'),
                labelWord: row.querySelector('.opt-word'),
                chkRegex: row.querySelector('.chk-regex'),
                labelRegex: row.querySelector('.opt-regex'),
                btnBookmark: row.querySelector('.btn-bookmark')
            }
        };

        // 초기 옵션 체크박스 상태 반영
        bar.ui.chkCase.checked = initialCase;
        bar.ui.labelCase.classList.toggle('active', initialCase);

        bar.ui.chkWord.checked = initialWord;
        bar.ui.labelWord.classList.toggle('active', initialWord);

        bar.ui.chkRegex.checked = initialRegex;
        bar.ui.labelRegex.classList.toggle('active', initialRegex);

        if (initialQuery) {
            bar.ui.input.value = initialQuery;
            bar.ui.btnClear.classList.add('visible');
        }

        // 검색바 인풋 포커스 시 활성 바로 설정
        bar.ui.input.addEventListener('focus', () => {
            setActiveBar(bar);
        });

        // 입력값 변경 시 실시간 증분 검색 트리거 (디바운스로 고속 타이핑 렉 및 스토리지 쿼터 초과 방지)
        bar.ui.input.addEventListener('input', (e) => {
            bar.query = e.target.value;
            bar.ui.btnClear.classList.toggle('visible', !!bar.query);
            debouncedPerformAllSearches(bar, 80);
            debouncedSaveBarsState(400);
        });

        // 지우기(✕) 버튼 클릭 시 입력값 즉시 초기화
        bar.ui.btnClear.addEventListener('click', () => {
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            bar.query = '';
            bar.ui.input.value = '';
            bar.ui.btnClear.classList.remove('visible');
            bar.ui.input.focus();
            performAllSearches(bar);
            saveBarsState();
        });

        // 인풋 내 키보드 내비게이션(Enter, Shift+Enter, ESC, F3, F4)
        bar.ui.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                // 엔터 입력 시 대기 중인 디바운스 즉시 실행 보장
                if (searchDebounceTimer) {
                    clearTimeout(searchDebounceTimer);
                    performAllSearches(bar);
                }
                e.shiftKey ? moveToPrev(bar) : moveToNext(bar);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                removeSearchBar(bar);
            } else if (e.key === 'F3') {
                e.preventDefault();
                e.shiftKey ? moveToPrev(bar) : moveToNext(bar);
            } else if (e.key === 'F4') {
                e.preventDefault();
                moveToPrev(bar);
            }
        });

        // 이전/다음 화살표 클릭 핸들러
        bar.ui.btnNext.addEventListener('click', () => moveToNext(bar));
        bar.ui.btnPrev.addEventListener('click', () => moveToPrev(bar));

        // 대소문자 구분(MatchCase) 토글
        bar.ui.chkCase.addEventListener('change', (e) => {
            bar.caseSensitive = e.target.checked;
            bar.ui.labelCase.classList.toggle('active', bar.caseSensitive);
            performAllSearches(bar);
            saveBarsState();
        });

        // 단어 단위(ByWord) 토글
        bar.ui.chkWord.addEventListener('change', (e) => {
            bar.wholeWord = e.target.checked;
            bar.ui.labelWord.classList.toggle('active', bar.wholeWord);
            performAllSearches(bar);
            saveBarsState();
        });

        // 정규식(RegExp) 토글
        bar.ui.chkRegex.addEventListener('change', (e) => {
            bar.useRegex = e.target.checked;
            bar.ui.labelRegex.classList.toggle('active', bar.useRegex);
            performAllSearches(bar);
            saveBarsState();
        });

        // 새 검색바 추가(+) 및 검색바 닫기(✕)
        bar.ui.btnAdd.addEventListener('click', () => {
            createSearchBar({}, true);
            saveBarsState();
        });

        bar.ui.btnClose.addEventListener('click', () => {
            removeSearchBar(bar);
        });

        // 북마크 핀 버튼 클릭 핸들러
        if (bar.ui.btnBookmark) {
            bar.ui.btnBookmark.addEventListener('click', () => {
                addBookmark(bar);
            });
        }

        // 인스턴스 배열 등록 및 활성화
        bars.push(bar);
        setActiveBar(bar);

        if (focusInput) {
            bar.ui.input.focus();
            bar.ui.input.select();
        }

        if (initialQuery) {
            performAllSearches(bar);
        }

        return bar;
    }

    //------------------------------------------------------------------------------------------------------
    // 지정된 검색바를 현재 활성 검색바(activeBar)로 설정하고 테두리 스타일을 업데이트한다.
    // 입력: bar - 활성화할 검색바 인스턴스 객체
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function setActiveBar(bar) {
        activeBar = bar;
        bars.forEach(b => {
            b.rowEl.classList.toggle('active-bar', b === bar);
        });
    }

    //------------------------------------------------------------------------------------------------------
    // 단일 검색바 인스턴스를 닫고 DOM 및 배열에서 제거한다. 마지막 바일 경우 전체를 숨긴다.
    // 입력: bar - 제거할 검색바 인스턴스 객체
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function removeSearchBar(bar) {
        // 검색바가 1개만 남은 상태에서 닫으면 전체 검색 오버레이 숨김
        if (bars.length <= 1) {
            hideAllSearchBars();
            return;
        }

        const index = bars.indexOf(bar);
        if (index !== -1) {
            bars.splice(index, 1);
            bar.rowEl.remove();
        }

        // 닫힌 바가 활성 상태였으면 인접한 다른 바에 포커스 승계
        if (activeBar === bar) {
            const nextActive = bars[Math.max(0, index - 1)] || bars[0];
            if (nextActive) {
                setActiveBar(nextActive);
                nextActive.ui.input.focus();
            }
        }

        // 나머지 검색바 하이라이트 재계산 및 상태 저장
        performAllSearches();
        saveBarsState();
    }

// ## 단계 500: 페이지 및 검색 키워드 북마크 관리 모듈
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //------------------------------------------------------------------------------------------------------
    // 현재 활성 페이지 URL과 해당 검색바의 입력 검색어를 북마크 목록에 추가한다.
    // 추가 시 16가지 고유 색상 중 랜덤 색상을 부여하고 스토리지에 동기화한다.
    // 입력: bar - 북마크를 생성한 검색바 인스턴스 객체
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function addBookmark(bar) {
        const keyword = (bar && bar.ui.input.value) ? bar.ui.input.value.trim() : '';
        const currentUrl = window.location.href;
        const newBookmark = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            url: currentUrl,
            keyword: keyword,
            color: getRandomBookmarkColor(),
            createdAt: Date.now()
        };

        bookmarks.push(newBookmark);
        saveBookmarks();
        renderBookmarks();
    }

    //------------------------------------------------------------------------------------------------------
    // 지정된 고유 ID의 북마크를 목록에서 삭제하고 뷰를 갱신한다.
    // 입력: bookmarkId - 삭제할 북마크의 고유 ID 문자열
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function deleteBookmark(bookmarkId) {
        bookmarks = bookmarks.filter(b => b.id !== bookmarkId);
        saveBookmarks();
        renderBookmarks();
    }

    //------------------------------------------------------------------------------------------------------
    // 북마크 클릭 시 해당 URL로 이동하거나 현재 페이지인 경우 검색창에 키워드를 즉시 주입한다.
    // 페이지 이동이 필요한 경우 세션 스토리지에 키워드를 임시 저장하여 새 페이지 로드 시 복원한다.
    // 입력: bookmark - 열고자 하는 북마크 객체 { url, keyword, color }
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function openBookmark(bookmark) {
        if (!bookmark) return;

        // 다른 페이지 이동 후 자동 복원할 수 있도록 세션 스토리지에 키워드 기록
        try {
            sessionStorage.setItem('search_ext_pending_query', bookmark.keyword || '');
        } catch (e) {}

        const currentUrl = window.location.href;
        // 동일 페이지인 경우 페이지 이동 없이 검색창에 즉시 반영
        if (currentUrl === bookmark.url) {
            applyPendingBookmarkQuery(bookmark.keyword || '');
        } else {
            window.location.href = bookmark.url;
        }
    }

    //------------------------------------------------------------------------------------------------------
    // 북마크에 저장된 검색 키워드를 1번 검색바에 주입하고 자동 검색을 실행한다.
    // 입력: keyword - 검색창에 입력할 문자열
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function applyPendingBookmarkQuery(keyword) {
        showSearchBar();
        if (bars.length > 0) {
            const firstBar = bars[0];
            firstBar.query = keyword;
            firstBar.ui.input.value = keyword;
            firstBar.ui.btnClear.classList.toggle('visible', !!keyword);
            setActiveBar(firstBar);
            firstBar.ui.input.focus();
            firstBar.ui.input.select();
            performAllSearches(firstBar);
            saveBarsState();
        }
    }

    //------------------------------------------------------------------------------------------------------
    // 상단 공통 바 우측에 저장된 북마크 핀 클립들을 역순(오른쪽부터 왼쪽으로)으로 렌더링한다.
    // 각 클립은 지정 색상 푸시핀 아이콘 및 하단 ✕ 삭제 버튼으로 구성된다.
    // 입력: 없음
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function renderBookmarks() {
        if (!bookmarksContainer) return;
        bookmarksContainer.innerHTML = '';

        if (!bookmarks || bookmarks.length === 0) {
            return;
        }

        // flex-direction: row-reverse 적용으로 순서대로 추가하면 최신 북마크가 오른쪽에 배치됨
        bookmarks.forEach(bm => {
            const clipItem = document.createElement('div');
            clipItem.className = 'bookmark-clip-item';

            // 핀 아이콘 버튼 생성
            const pinBtn = document.createElement('button');
            pinBtn.type = 'button';
            pinBtn.className = 'btn-pin-clip';
            pinBtn.title = `이동 및 검색: "${bm.keyword || '(전체)'}"\nURL: ${bm.url}`;
            pinBtn.innerHTML = `
                <svg viewBox="0 0 24 24">
                    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6l1 1 1-1v-6H18v-2l-2-2z" transform="rotate(45 12 12)" fill="${bm.color}" stroke="${bm.color}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
            pinBtn.addEventListener('click', () => {
                openBookmark(bm);
            });

            // ✕ 삭제 버튼 생성
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn-clip-delete';
            delBtn.title = '북마크 삭제';
            delBtn.textContent = '✕';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteBookmark(bm.id);
            });

            clipItem.appendChild(pinBtn);
            clipItem.appendChild(delBtn);
            bookmarksContainer.appendChild(clipItem);
        });
    }

// ## 단계 600: 텍스트 선택(Selection) 확장 및 클립보드 복사 모듈
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //------------------------------------------------------------------------------------------------------
    // 현재 웹페이지의 텍스트 선택 영역을 반환하거나, 없을 경우 활성 검색어 일치 위치를 기본 선택한다.
    // 입력: 없음
    // 출력: Selection 객체 또는 null
    //------------------------------------------------------------------------------------------------------
    function getOrInitSelection() {
        const sel = window.getSelection();
        if (!sel) return null;

        // 이미 사용자가 텍스트를 드래그 선택 중인 경우 그대로 반환
        if (sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().length > 0) {
            return sel;
        }

        // 선택 영역이 없다면 현재 검색 일치 항목 엘리먼트를 선택 영역으로 초기화
        const target = activeBar || bars[0];
        if (target && target.matches && target.matches.length > 0 && target.currentIndex >= 0) {
            const activeMatch = target.matches[target.currentIndex];
            if (activeMatch && activeMatch.element && activeMatch.element.isConnected) {
                if (activeMatch.type === 'mark') {
                    const range = document.createRange();
                    range.selectNodeContents(activeMatch.element);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    return sel;
                } else if (activeMatch.type === 'input') {
                    try {
                        activeMatch.element.focus();
                        if (typeof activeMatch.element.setSelectionRange === 'function') {
                            activeMatch.element.setSelectionRange(activeMatch.start, activeMatch.end);
                        }
                    } catch (e) {}
                }
            }
        }

        return (sel.rangeCount > 0 && !sel.isCollapsed) ? sel : null;
    }

    //------------------------------------------------------------------------------------------------------
    // 지정된 문자가 사용자가 옵션에서 설정한 '선택기능 무시구분자'에 포함되는지 확인한다.
    // 입력: char - 검사할 단일 문자
    // 출력: true(무시할 구분자) 또는 false
    //------------------------------------------------------------------------------------------------------
    function isIgnoredDelimiter(char) {
        if (!char || typeof config.ignoreDelimiters !== 'string') return false;
        return config.ignoreDelimiters.includes(char);
    }

    //------------------------------------------------------------------------------------------------------
    // 텍스트 선택 영역을 지정 방향('backward' 또는 'forward')으로 지정 단어 수만큼 확장한다.
    // 무시 구분자(예: '-')가 연결되어 있는 경우 끊기지 않고 1단어로 묶어 확장한다.
    // 입력: direction - 'backward'(왼쪽) 또는 'forward'(오른쪽)
    //       wordCount - 확장할 단어 개수 (기본값: 1)
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function expandSelection(direction, wordCount = 1) {
        const sel = getOrInitSelection();
        if (!sel || sel.rangeCount === 0) return;

        const isBack = (direction === 'backward');
        const range = sel.getRangeAt(0);

        // backward 확장 시 end 고정/start 이동, forward 확장 시 start 고정/end 이동
        const fixedNode = isBack ? range.endContainer : range.startContainer;
        const fixedOffset = isBack ? range.endOffset : range.startOffset;
        const movingNode = isBack ? range.startContainer : range.endContainer;
        const movingOffset = isBack ? range.startOffset : range.endOffset;

        sel.setBaseAndExtent(fixedNode, fixedOffset, movingNode, movingOffset);

        for (let step = 0; step < wordCount; step++) {
            let lastLen = sel.toString().length;
            sel.modify('extend', direction, 'word');

            // 공백에서 정지된 경우 한 번 더 전진
            if (sel.toString().length === lastLen) {
                sel.modify('extend', direction, 'word');
            }
            if (sel.toString().length === lastLen) {
                break;
            }

            // 무시구분자(예: '-') 연결 처리 (루프 제한 15회로 안전성 보장)
            if (config.ignoreDelimiters) {
                let loopCount = 0;
                while (loopCount++ < 15) {
                    const currentText = sel.toString();
                    if (!currentText) break;

                    const boundaryChar = isBack ? currentText[0] : currentText[currentText.length - 1];

                    // 현재 선택 가장자리가 무시구분자이면 추가 단어 확장
                    if (isIgnoredDelimiter(boundaryChar)) {
                        const lenBefore = currentText.length;
                        sel.modify('extend', direction, 'word');
                        if (sel.toString().length > lenBefore) continue;
                    }

                    // 다음 인접 문자 1글자를 미리 확장하여 검사
                    const currentRange = sel.getRangeAt(0).cloneRange();
                    const lenBeforePeek = currentText.length;
                    sel.modify('extend', direction, 'character');
                    const textWithPeek = sel.toString();

                    if (textWithPeek.length > lenBeforePeek) {
                        const peekChar = isBack ? textWithPeek[0] : textWithPeek[textWithPeek.length - 1];
                        if (isIgnoredDelimiter(peekChar)) {
                            // 인접 문자가 무시구분자이면 건너뛰어 계속 확장
                            sel.modify('extend', direction, 'word');
                            continue;
                        } else {
                            // 일반 문자이면 1글자 peek 취소하고 원래 범위로 복원
                            const revertNode = isBack ? currentRange.startContainer : currentRange.endContainer;
                            const revertOffset = isBack ? currentRange.startOffset : currentRange.endOffset;
                            sel.setBaseAndExtent(fixedNode, fixedOffset, revertNode, revertOffset);
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }
        }
    }

    // 왼쪽(backward) 단어 단위 확장 래퍼 함수
    function expandSelectionLeft(wordCount = 1) {
        expandSelection('backward', wordCount);
    }

    // 오른쪽(forward) 단어 단위 확장 래퍼 함수
    function expandSelectionRight(wordCount = 1) {
        expandSelection('forward', wordCount);
    }

    //------------------------------------------------------------------------------------------------------
    // 현재 선택된 텍스트(또는 활성 검색어)를 클립보드로 복사하고 버튼에 시각적 피드백을 제공한다.
    // 입력: btnEl - 클릭된 'text select' 버튼 엘리먼트
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    async function handleTextSelectAction(btnEl) {
        const sel = getOrInitSelection();
        let textToCopy = (sel && !sel.isCollapsed) ? sel.toString() : '';

        // 브라우저 텍스트 선택이 없으면 현재 활성 검색어 또는 일치 텍스트 사용
        if (!textToCopy) {
            const target = activeBar || bars[0];
            if (target && target.matches && target.matches.length > 0 && target.currentIndex >= 0) {
                const activeMatch = target.matches[target.currentIndex];
                if (activeMatch && activeMatch.type === 'input' && activeMatch.element) {
                    textToCopy = activeMatch.element.value.substring(activeMatch.start, activeMatch.end);
                }
            }
            if (!textToCopy && target && target.query) {
                textToCopy = target.query;
            }
        }

        if (!textToCopy) return;

        // 클립보드 API 비동기 복사 시도
        let copied = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(textToCopy);
                copied = true;
            }
        } catch (e) {}

        // 실패 시 document.execCommand 폴백 실행
        if (!copied) {
            try {
                const ta = document.createElement('textarea');
                ta.value = textToCopy;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                ta.style.pointerEvents = 'none';
                document.body.appendChild(ta);
                ta.select();
                copied = document.execCommand('copy');
                document.body.removeChild(ta);
            } catch (e) {}
        }

        // 복사 성공 시 버튼 텍스트 피드백 표시 (1초간 초록색 Copied!)
        if (btnEl && copied) {
            const originalText = btnEl.textContent;
            btnEl.textContent = 'Copied!';
            btnEl.style.color = '#4ade80';
            setTimeout(() => {
                btnEl.textContent = originalText;
                btnEl.style.color = '';
            }, 1000);
        }
    }

// ## 단계 700: 검색창 노출, 숨김 및 하이라이트 정리
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //------------------------------------------------------------------------------------------------------
    // 검색창 오버레이 컨테이너를 화면에 표시하고 이전 검색바 상태 또는 기본 검색바를 생성한다.
    // 마우스 드래그 선택 텍스트가 있을 경우 첫 번째 검색창에 자동 입력된다.
    // 입력: 없음
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function showSearchBar() {
        createUI();
        isBarVisible = true;
        hostElement.style.setProperty('display', 'block', 'important');

        // SPA/무한 스크롤로 늦게 로드되는 콘텐츠도 자동 검색되도록 DOM 감시 시작
        startDomObserver();

        // 페이지 내 드래그된 텍스트(일반 텍스트 및 input/textarea 선택 영역)가 있으면 초기 검색어로 활용
        let selectedText = window.getSelection()?.toString().trim();
        if (!selectedText) {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
                try {
                    const start = activeEl.selectionStart;
                    const end = activeEl.selectionEnd;
                    if (typeof start === 'number' && typeof end === 'number' && start !== end) {
                        selectedText = activeEl.value.substring(start, end).trim();
                    }
                } catch (e) {}
            }
        }
        const initialQuery = (selectedText && selectedText.length < 100) ? selectedText : '';

        // 검색바 인스턴스 생성 및 복원 헬퍼
        const setupBars = () => {
            if (bars.length === 0) {
                let statesToRestore = [];
                // 이전 세션에서 저장된 검색바가 있으면 그대로 복원
                if (Array.isArray(config.lastBarsState) && config.lastBarsState.length > 0) {
                    statesToRestore = config.lastBarsState;
                } else {
                    // 없을 경우 기본 설정된 검색바 개수(기본값: 2)만큼 빈 바 생성
                    const count = Math.max(1, config.defaultBarCount || 2);
                    for (let i = 0; i < count; i++) {
                        statesToRestore.push({
                            caseSensitive: false,
                            wholeWord: false,
                            useRegex: false,
                            query: ''
                        });
                    }
                }

                // 각 검색바 인스턴스 복원 및 생성
                statesToRestore.forEach((state, idx) => {
                    const isFirst = (idx === 0);
                    const bar = createSearchBar(state, isFirst);
                    if (isFirst && initialQuery) {
                        bar.query = initialQuery;
                        bar.ui.input.value = initialQuery;
                        bar.ui.btnClear.classList.add('visible');
                    }
                });

                // 첫 번째 검색바를 활성화하고 텍스트 전체 선택
                const firstBar = bars[0];
                if (firstBar) {
                    setActiveBar(firstBar);
                    firstBar.ui.input.focus();
                    firstBar.ui.input.select();
                }

                performAllSearches();
            } else {
                // 이미 검색바가 열려있다면 활성 바에 포커스
                const targetBar = activeBar || bars[0];
                setActiveBar(targetBar);
                if (initialQuery) {
                    targetBar.query = initialQuery;
                    targetBar.ui.input.value = initialQuery;
                    targetBar.ui.btnClear.classList.add('visible');
                    performAllSearches(targetBar);
                }
                targetBar.ui.input.focus();
                targetBar.ui.input.select();
            }
        };

        // 설정 로드 완료 상태에 따라 즉시 또는 콜백 실행
        if (config._loaded) {
            setupBars();
        } else {
            loadConfig(() => setupBars());
        }

        // 최신 북마크 목록 렌더링
        loadBookmarks(() => {
            renderBookmarks();
        });
    }

    //------------------------------------------------------------------------------------------------------
    // 검색창 오버레이를 화면에서 숨기고 모든 본문 하이라이트와 검색바 요소를 정리한다.
    // 입력: 없음
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function hideAllSearchBars() {
        if (!isBarVisible) return;
        saveBarsState();
        isBarVisible = false;

        // 동적 콘텐츠 감시자 해제 (검색창이 닫힌 상태에서는 불필요한 오버헤드)
        stopDomObserver();

        // 컨테이너 숨김 처리
        if (hostElement) {
            hostElement.style.setProperty('display', 'none', 'important');
        }

        // 본문 내 모든 하이라이트 태그 제거 및 상태 초기화
        cleanAllHighlights();
        bars.forEach(b => {
            b.rowEl.remove();
        });
        bars = [];
        activeBar = null;
    }

    //------------------------------------------------------------------------------------------------------
    // 본문 및 Shadow DOM/동일 출처 iframe에 삽입된 모든 <mark> 하이라이트를 원본 텍스트 노드로 언랩 복원한다.
    // 또한 input/textarea 요소에 적용된 하이라이트 클래스 및 테두리 스타일을 원상 복구한다.
    // 성능 최적화: mark별 개별 normalize 호출 대신 부모 노드들을 Set에 모아 한 번씩만 normalize()를 수행한다.
    // 입력: roots - 재사용할 검색 루트 배열 (생략 시 내부에서 직접 수집)
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function cleanAllHighlights(roots = null) {
        const rootList = roots || collectSearchRoots();
        const parentsToNormalize = new Set();
        let found = 0;

        // 각 루트(본문/Shadow Root/iframe 문서)별로 하이라이트 수집 후 언랩 처리
        rootList.forEach(root => {
            let marks;
            try { marks = root.querySelectorAll('mark.search-ext-highlight'); } catch (e) { return; }
            found += marks.length;

            marks.forEach(mark => {
                const parent = mark.parentNode;
                if (parent) {
                    // mark 자식 노드들을 상위로 끌어올린 후 mark 태그 삭제
                    while (mark.firstChild) {
                        parent.insertBefore(mark.firstChild, mark);
                    }
                    parent.removeChild(mark);
                    parentsToNormalize.add(parent);
                }
            });

            // input/textarea 하이라이트 제거 및 원본 테두리 스타일 복원
            let inputMatches;
            try {
                inputMatches = root.querySelectorAll('.search-ext-input-highlight, .search-ext-input-active');
            } catch (e) { return; }

            inputMatches.forEach(el => {
                el.classList.remove('search-ext-input-highlight', 'search-ext-input-active');
                if (el.dataset.searchExtOrigOutline !== undefined) {
                    el.style.outline = el.dataset.searchExtOrigOutline;
                    delete el.dataset.searchExtOrigOutline;
                } else {
                    el.style.outline = '';
                }
                if (el.dataset.searchExtOrigOutlineOffset !== undefined) {
                    el.style.outlineOffset = el.dataset.searchExtOrigOutlineOffset;
                    delete el.dataset.searchExtOrigOutlineOffset;
                } else {
                    el.style.outlineOffset = '';
                }
            });
        });

        if (found === 0) return;

        // 수집된 부모 노드들에 대해 중복 없이 1회씩만 텍스트 노드 병합 수행
        parentsToNormalize.forEach(p => {
            if (p.isConnected) {
                p.normalize();
            }
        });

        // 각 검색바의 일치 항목 배열 및 카운트 디스플레이 초기화
        bars.forEach(bar => {
            bar.matches = [];
            bar.currentIndex = -1;
            updateCountDisplay(bar, 0, 0);
        });
    }

// ## 단계 800: 다중 검색바 정규식 컴파일 및 실시간 텍스트 하이라이트 엔진
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // 제외 대상 input 타입 집합 (비밀번호, 비가시, 버튼 등 텍스트 검색과 무관한 폼 요소)
    const EXCLUDED_INPUT_TYPES = new Set([
        'password', 'hidden', 'checkbox', 'radio',
        'file', 'button', 'submit', 'reset', 'image', 'range', 'color'
    ]);

    //------------------------------------------------------------------------------------------------------
    // 지정된 엘리먼트가 검색 가능한 텍스트 입력 폼(input 또는 textarea)인지 판별한다.
    // 입력: el - 검사 대상 엘리먼트
    // 출력: true(검색 가능) 또는 false
    //------------------------------------------------------------------------------------------------------
    function isSearchableInputElement(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
        const tag = el.tagName;
        if (tag === 'TEXTAREA') return true;
        if (tag === 'INPUT') {
            const type = (el.type || 'text').toLowerCase();
            return !EXCLUDED_INPUT_TYPES.has(type);
        }
        return false;
    }

    //------------------------------------------------------------------------------------------------------
    // 문자열 내 특수 기호를 안전하게 이스케이프하여 정규식 리터럴 패턴으로 만든다.
    // 입력: string - 원본 텍스트
    // 출력: 이스케이프된 정규식 패턴 문자열
    //------------------------------------------------------------------------------------------------------
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    //------------------------------------------------------------------------------------------------------
    // 특정 검색바의 쿼리와 일치 옵션(대소문자, 단어단위, 정규식)을 조합하여 RegExp 객체를 생성한다.
    // 정규식 오류가 발생할 경우 입력창에 invalid 에러 스타일을 부여한다.
    // 입력: bar - 검색바 인스턴스 객체
    // 출력: 유효한 RegExp 인스턴스 또는 null
    //------------------------------------------------------------------------------------------------------
    function compileBarRegex(bar) {
        bar.ui.inputBox.classList.remove('invalid');
        const raw = bar.useRegex ? bar.query : bar.query.trim();
        if (!raw) return null;

        let pattern;
        if (bar.useRegex) {
            pattern = raw;
            if (bar.wholeWord) {
                pattern = `\\b(?:${pattern})\\b`;
            }
        } else {
            pattern = escapeRegExp(raw);
            if (bar.wholeWord) {
                pattern = `\\b${pattern}\\b`;
            }
        }

        const flags = 'g' + (bar.caseSensitive ? '' : 'i');
        try {
            return new RegExp(pattern, flags);
        } catch (e) {
            // 잘못된 정규식 패턴 입력 시 붉은 테두리 표시
            if (bar.useRegex) {
                bar.ui.inputBox.classList.add('invalid');
            }
            return null;
        }
    }

    // 검색바당 최대 렌더링 가능한 하이라이트 노드 상한선 (브라우저 메모리 고갈 및 탭 프리징 방지)
    const MAX_MATCHES_PER_BAR = 1500;

    // Shadow DOM / iframe 중첩 탐색 시 무한 재귀 및 과도한 순회를 막는 깊이 제한
    const MAX_ROOT_DEPTH = 12;

    //------------------------------------------------------------------------------------------------------
    // 검색 대상이 되는 모든 DOM 루트를 수집한다 (본문 + open Shadow DOM + 동일 출처 iframe 문서).
    // 최신 웹앱(Web Components, 문서 뷰어 등)은 텍스트가 Shadow DOM 내부에 존재하여 일반 TreeWalker로는
    // 접근이 불가능하므로, 각 루트를 개별적으로 순회할 수 있도록 평탄화된 배열로 반환한다.
    // 입력: root - 탐색 시작 노드, out - 결과 누적 배열, depth - 현재 재귀 깊이
    // 출력: 검색 가능한 루트 노드 배열
    //------------------------------------------------------------------------------------------------------
    function collectSearchRoots(root = document.body, out = [], depth = 0) {
        if (!root || depth > MAX_ROOT_DEPTH) return out;
        out.push(root);

        // 현재 루트 내부의 모든 엘리먼트를 훑어 중첩된 Shadow Root / iframe 문서를 재귀 수집
        let elements;
        try { elements = root.querySelectorAll('*'); } catch (e) { return out; }

        for (const el of elements) {
            // 확장 프로그램 자체 UI 호스트는 탐색 대상에서 제외
            if (el.id === 'chrome-ext-search-root') continue;

            // open 모드 Shadow Root 내부 진입 (closed 모드는 스펙상 접근 불가)
            if (el.shadowRoot) {
                collectSearchRoots(el.shadowRoot, out, depth + 1);
                continue;
            }

            // 동일 출처 iframe/frame 문서 진입 (교차 출처는 보안 정책상 접근 시 예외 발생 → 무시)
            const tag = el.tagName;
            if (tag === 'IFRAME' || tag === 'FRAME') {
                try {
                    const doc = el.contentDocument;
                    if (doc && doc.body) collectSearchRoots(doc.body, out, depth + 1);
                } catch (e) { /* cross-origin frame: 접근 불가하므로 건너뜀 */ }
            }
        }
        return out;
    }

    //------------------------------------------------------------------------------------------------------
    // 텍스트 노드의 부모 엘리먼트가 실제 화면에 렌더링되는 상태인지 판별한다.
    // display:none / visibility:hidden 영역의 텍스트는 스크롤 이동이 불가능해 검색 결과에서 제외하되,
    // 접힌 <details> 내부는 브라우저 기본 검색과 동일하게 검색 대상으로 허용한다.
    // 입력: el - 검사 대상 엘리먼트, cache - 엘리먼트별 판정 결과 캐시 Map
    // 출력: 검색 대상 여부 (true/false)
    //------------------------------------------------------------------------------------------------------
    function isVisibleForSearch(el, cache) {
        const cached = cache.get(el);
        if (cached !== undefined) return cached;

        let visible;
        // 접힌 <details> 하위는 렌더링되지 않지만 탐색 후 자동 펼침 처리되므로 허용
        if (el.closest && el.closest('details:not([open])')) visible = true;
        else if (typeof el.checkVisibility === 'function') visible = el.checkVisibility({ checkVisibilityCSS: true });
        else visible = !!(el.offsetParent || el.getClientRects().length);

        cache.set(el, visible);
        return visible;
    }

    //------------------------------------------------------------------------------------------------------
    // 모든 검색바의 패턴을 페이지 전체에서 동시에 탐색하여 겹침 없이 하이라이트 요소를 생성한다.
    // 검색 범위: 일반 본문 + open Shadow DOM(Web Components) + 동일 출처 iframe 문서
    // 성능 최적화:
    // 1) 일반 문자열 검색 시 정규식 대신 C++ 기반의 indexOf/includes 사전 검사로 비매칭 노드 고속 통과
    // 2) TreeWalker에서 비 HTML 네임스페이스(SVG/MathML) 및 비텍스트 태그 사전 제외
    // 3) 비용이 큰 렌더링 가시성 검사는 텍스트 매칭에 성공한 노드에 대해서만 수행 후 캐싱
    // 4) mark 스타일 적용 시 cssText 1회 일괄 할당
    // 5) MAX_MATCHES_PER_BAR 상한선 보호로 대량 매칭 시에도 브라우저 반응성 유지
    // 입력: triggeringBar - 사용자 입력이 발생한 검색바 (자동 스크롤 대상)
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function performAllSearches(triggeringBar = null) {
        // 하이라이트 삽입/제거로 인한 자체 DOM 변경을 MutationObserver가 재검색 트리거로 오인하지 않도록 차단
        isHighlighting = true;

        // 본문 + Shadow DOM + 동일 출처 iframe을 모두 포함한 검색 루트를 1회만 수집하여 재사용
        const searchRoots = collectSearchRoots();
        cleanAllHighlights(searchRoots);

        // 유효한 검색 패턴이 있는 검색바들만 선별 및 사전 최적화 데이터 캐싱
        const activeSearchBars = [];
        bars.forEach(bar => {
            const raw = bar.useRegex ? bar.query : bar.query.trim();
            if (!raw) return;
            const regex = compileBarRegex(bar);
            if (regex) {
                activeSearchBars.push({
                    bar: bar,
                    regex: regex,
                    raw: raw,
                    isSimpleText: !bar.useRegex && !bar.wholeWord,
                    caseSensitive: bar.caseSensitive,
                    lowerRaw: raw.toLowerCase()
                });
            }
        });

        if (activeSearchBars.length === 0) {
            releaseHighlightingFlag();
            return;
        }

        // 텍스트 노드 및 검색 가능한 폼 입력 필드(input, textarea)를 아우르는 복합 필터
        const combinedFilter = {
            acceptNode: (node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.id === 'chrome-ext-search-root' || (node.closest && node.closest('#chrome-ext-search-root'))) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    const tag = node.tagName;
                    if (
                        tag === 'SCRIPT' ||
                        tag === 'STYLE' ||
                        tag === 'NOSCRIPT' ||
                        tag === 'TEMPLATE' ||
                        tag === 'CANVAS' ||
                        tag === 'AUDIO' ||
                        tag === 'VIDEO' ||
                        tag === 'OBJECT' ||
                        tag === 'IFRAME' ||
                        tag === 'FRAME' ||
                        tag === 'SELECT'
                    ) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    if (isSearchableInputElement(node)) {
                        const val = node.value || node.placeholder || '';
                        if (val && val.trim()) {
                            return NodeFilter.FILTER_ACCEPT;
                        }
                        return NodeFilter.FILTER_REJECT;
                    }

                    return NodeFilter.FILTER_SKIP;
                }

                if (node.nodeType === Node.TEXT_NODE) {
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    if (parent.namespaceURI !== 'http://www.w3.org/1999/xhtml') return NodeFilter.FILTER_REJECT;

                    const pTag = parent.tagName;
                    if (
                        pTag === 'SCRIPT' ||
                        pTag === 'STYLE' ||
                        pTag === 'NOSCRIPT' ||
                        pTag === 'TEXTAREA' ||
                        pTag === 'INPUT' ||
                        pTag === 'IFRAME' ||
                        pTag === 'OBJECT' ||
                        pTag === 'SELECT' ||
                        pTag === 'OPTION' ||
                        pTag === 'CANVAS' ||
                        pTag === 'AUDIO' ||
                        pTag === 'VIDEO' ||
                        pTag === 'TEMPLATE' ||
                        parent.id === 'chrome-ext-search-root' ||
                        (parent.closest && parent.closest('#chrome-ext-search-root')) ||
                        parent.isContentEditable
                    ) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }

                return NodeFilter.FILTER_REJECT;
            }
        };

        // 본문 + Shadow DOM + 동일 출처 iframe을 모두 포함한 검색 루트 재사용
        const visibilityCache = new Map();
        const nodesToProcess = [];

        // 각 루트별로 텍스트 노드 및 input 요소를 순회하며 검색 패턴 부합 노드 수집
        searchRoots.forEach(root => {
            const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
                combinedFilter
            );
            let currentNode = walker.nextNode();

            while (currentNode) {
                const isText = (currentNode.nodeType === Node.TEXT_NODE);
                const val = isText ? currentNode.nodeValue : (currentNode.value || currentNode.placeholder || '');
                let matched = false;

                for (const item of activeSearchBars) {
                    if (item.bar.matches.length >= MAX_MATCHES_PER_BAR) continue;
                    if (item.isSimpleText) {
                        const hasMatch = item.caseSensitive
                            ? val.includes(item.raw)
                            : val.toLowerCase().includes(item.lowerRaw);
                        if (hasMatch) { matched = true; break; }
                    } else {
                        item.regex.lastIndex = 0;
                        if (item.regex.test(val)) { matched = true; break; }
                    }
                }

                // 화면에 렌더링되지 않는(display:none 등) 영역은 이동이 불가능하므로 최종 제외
                const targetEl = isText ? currentNode.parentElement : currentNode;
                if (matched && isVisibleForSearch(targetEl, visibilityCache)) {
                    nodesToProcess.push({
                        node: currentNode,
                        isText: isText,
                        text: val
                    });
                }
                currentNode = walker.nextNode();
            }
        });

        // 각 노드별 일치 구간 계산 및 하이라이트/매치 등록
        nodesToProcess.forEach(item => {
            const text = item.text;
            const intervals = [];

            // 각 검색바별 일치 구간 계산 (한도 초과된 바는 매칭 생성 제외)
            activeSearchBars.forEach(({ bar, regex }) => {
                if (bar.matches.length >= MAX_MATCHES_PER_BAR) return;
                regex.lastIndex = 0;
                let match;
                while ((match = regex.exec(text)) !== null) {
                    const len = match[0].length;
                    if (len === 0) {
                        if (regex.lastIndex === match.index) {
                            regex.lastIndex++;
                        }
                        continue;
                    }
                    intervals.push({
                        start: match.index,
                        end: match.index + len,
                        bar: bar
                    });
                }
            });

            if (intervals.length === 0) return;

            // 시작 위치 오름차순, 길이 내림차순 정렬
            intervals.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

            // 중첩되는 구간 제거 (선착순 우선 처리)
            const nonOverlapping = [];
            let lastEnd = 0;
            for (const interval of intervals) {
                if (interval.start >= lastEnd) {
                    nonOverlapping.push(interval);
                    lastEnd = interval.end;
                }
            }

            if (item.isText) {
                // DocumentFragment를 이용해 노드 일괄 교체
                const frag = document.createDocumentFragment();
                let curIdx = 0;

                for (const interval of nonOverlapping) {
                    // 매칭 이전 일반 텍스트 노드 추가
                    if (interval.start > curIdx) {
                        frag.appendChild(document.createTextNode(text.substring(curIdx, interval.start)));
                    }

                    // 하이라이트 mark 엘리먼트 생성 및 cssText 1회 일괄 할당
                    const mark = document.createElement('mark');
                    mark.className = 'search-ext-highlight';
                    mark.dataset.barId = String(interval.bar.id);
                    mark.textContent = text.substring(interval.start, interval.end);
                    mark.style.cssText = `background-color:${interval.bar.colorConfig.highlight};color:${interval.bar.colorConfig.text};`;

                    frag.appendChild(mark);
                    interval.bar.matches.push({
                        type: 'mark',
                        element: mark,
                        bar: interval.bar
                    });

                    curIdx = interval.end;
                }

                // 마지막 잔여 텍스트 노드 추가
                if (curIdx < text.length) {
                    frag.appendChild(document.createTextNode(text.substring(curIdx)));
                }

                const parent = item.node.parentNode;
                if (parent) {
                    parent.replaceChild(frag, item.node);
                }
            } else {
                // INPUT / TEXTAREA 요소: 매칭 구간 등록 및 초기 하이라이트 클래스/아웃라인 적용
                const inputEl = item.node;
                if (inputEl.dataset.searchExtOrigOutline === undefined) {
                    inputEl.dataset.searchExtOrigOutline = inputEl.style.outline || '';
                    inputEl.dataset.searchExtOrigOutlineOffset = inputEl.style.outlineOffset || '';
                }
                inputEl.classList.add('search-ext-input-highlight');
                const firstBar = nonOverlapping[0].bar;
                inputEl.style.outline = `2px solid ${firstBar.colorConfig.highlight}`;
                inputEl.style.outlineOffset = '-1px';

                for (const interval of nonOverlapping) {
                    if (interval.bar.matches.length >= MAX_MATCHES_PER_BAR) continue;
                    interval.bar.matches.push({
                        type: 'input',
                        element: inputEl,
                        start: interval.start,
                        end: interval.end,
                        bar: interval.bar
                    });
                }
            }
        });

        // 각 검색바의 일치 건수 표시 및 첫 번째 일치 항목 활성화
        bars.forEach(bar => {
            const total = bar.matches.length;
            if (total > 0) {
                if (bar.currentIndex < 0 || bar.currentIndex >= total) {
                    bar.currentIndex = 0;
                }
                const totalDisplay = total >= MAX_MATCHES_PER_BAR ? `${MAX_MATCHES_PER_BAR}+` : total;
                updateCountDisplay(bar, bar.currentIndex + 1, totalDisplay);
                highlightActiveMatch(bar);
            } else {
                bar.currentIndex = -1;
                updateCountDisplay(bar, 0, 0);
            }
        });

        // 활성 검색바가 존재하고 매칭이 있으면 활성 바의 activeMatch를 최종 우선 적용
        if (activeBar && activeBar.matches.length > 0) {
            highlightActiveMatch(activeBar);
        }

        // 자동 이동(Auto-Move) 옵션 활성화 시 첫 일치 항목으로 화면 스크롤
        if (triggeringBar && config.autoMove && triggeringBar.matches.length > 0) {
            scrollToCurrentMatch(triggeringBar);
        }

        releaseHighlightingFlag();
    }

    //------------------------------------------------------------------------------------------------------
    // 하이라이트 작업 종료 플래그를 마이크로태스크 이후에 해제한다.
    // MutationObserver 콜백은 마이크로태스크로 전달되므로 즉시 해제하면 자체 변경을 감지해 무한 재검색이 발생한다.
    // 입력: 없음
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function releaseHighlightingFlag() {
        setTimeout(() => { isHighlighting = false; }, 0);
    }

    //------------------------------------------------------------------------------------------------------
    // 검색바의 일치 건수 카운트 라벨(예: "1 of 10") 텍스트를 업데이트한다.
    // 입력: bar - 검색바 인스턴스 객체
    //       current - 현재 인덱스 (1-based)
    //       total - 전체 일치 개수
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function updateCountDisplay(bar, current, total) {
        if (!bar.ui.countInfo) return;
        bar.ui.countInfo.textContent = `${current} of ${total}`;
    }

    //------------------------------------------------------------------------------------------------------
    // 현재 검색바에서 활성화된 일치 항목과 일반 일치 항목의 하이라이트 색상 및 아웃라인을 구분 적용한다.
    // 입력: bar - 검색바 인스턴스 객체
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function highlightActiveMatch(bar) {
        const inputMatchesMap = new Map();

        bar.matches.forEach((match, i) => {
            const isActive = (i === bar.currentIndex);
            if (match.type === 'mark') {
                const el = match.element;
                if (isActive) {
                    el.classList.add('search-ext-active');
                    el.style.backgroundColor = bar.colorConfig.active;
                    el.style.color = bar.colorConfig.activeText;
                    el.style.outline = `2px solid ${bar.colorConfig.activeOutline}`;
                } else {
                    el.classList.remove('search-ext-active');
                    el.style.backgroundColor = bar.colorConfig.highlight;
                    el.style.color = bar.colorConfig.text;
                    el.style.outline = 'none';
                }
            } else if (match.type === 'input') {
                const el = match.element;
                if (!inputMatchesMap.has(el)) {
                    inputMatchesMap.set(el, { hasActive: false, activeMatch: null });
                }
                const entry = inputMatchesMap.get(el);
                if (isActive) {
                    entry.hasActive = true;
                    entry.activeMatch = match;
                }
            }
        });

        inputMatchesMap.forEach((entry, el) => {
            if (el.dataset.searchExtOrigOutline === undefined) {
                el.dataset.searchExtOrigOutline = el.style.outline || '';
                el.dataset.searchExtOrigOutlineOffset = el.style.outlineOffset || '';
            }
            if (entry.hasActive && entry.activeMatch) {
                el.classList.add('search-ext-input-active');
                el.classList.remove('search-ext-input-highlight');
                el.style.outline = `2px solid ${bar.colorConfig.activeOutline}`;
                el.style.outlineOffset = '-1px';
                try {
                    el.focus({ preventScroll: true });
                    if (typeof el.setSelectionRange === 'function') {
                        el.setSelectionRange(entry.activeMatch.start, entry.activeMatch.end);
                    }
                } catch (e) {}
            } else {
                el.classList.remove('search-ext-input-active');
                el.classList.add('search-ext-input-highlight');
                el.style.outline = `2px solid ${bar.colorConfig.highlight}`;
                el.style.outlineOffset = '-1px';
            }
        });
    }

    //------------------------------------------------------------------------------------------------------
    // 활성화된 일치 항목 엘리먼트를 화면 중앙으로 부드럽게 스크롤한다.
    // 입력: bar - 검색바 인스턴스 객체
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function scrollToCurrentMatch(bar) {
        if (bar.currentIndex < 0 || bar.currentIndex >= bar.matches.length) return;
        const match = bar.matches[bar.currentIndex];
        if (!match) return;
        const target = match.element;
        if (!target) return;

        // 접힌 <details> 내부에 위치한 경우 상위 요소를 모두 펼쳐야 화면에 노출됨
        let ancestor = target.parentElement;
        while (ancestor) {
            if (ancestor.tagName === 'DETAILS' && !ancestor.open) ancestor.open = true;
            ancestor = ancestor.parentElement;
        }

        target.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
        });
    }

    //------------------------------------------------------------------------------------------------------
    // SPA/무한 스크롤처럼 동적으로 추가되는 콘텐츠를 감지해 현재 검색어를 자동 재적용한다.
    // 확장 자체 하이라이트 삽입으로 인한 무한 루프를 막기 위해 isHighlighting 플래그와 디바운스를 사용한다.
    // 입력: 없음
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function startDomObserver() {
        if (domObserver || !document.body) return;

        domObserver = new MutationObserver((mutations) => {
            if (isHighlighting || !isBarVisible) return;
            if (!bars.some(b => b.query && b.query.trim())) return;

            // 실제 텍스트를 가진 노드가 새로 추가된 경우에만 재검색 (시계/애니메이션 등 무의미한 변경 무시)
            const hasNewText = mutations.some(m =>
                m.type === 'childList' &&
                Array.from(m.addedNodes).some(n =>
                    (n.nodeType === Node.TEXT_NODE || n.nodeType === Node.ELEMENT_NODE) &&
                    n.textContent && n.textContent.trim() &&
                    !(n.nodeType === Node.ELEMENT_NODE && n.id === 'chrome-ext-search-root')
                )
            );
            if (!hasNewText) return;

            clearTimeout(domObserverTimer);
            domObserverTimer = setTimeout(() => {
                if (!isHighlighting && isBarVisible) performAllSearches(null);
            }, DOM_OBSERVER_DELAY);
        });

        domObserver.observe(document.body, { childList: true, subtree: true });
    }

    // 검색창을 닫을 때 감시자를 해제하여 불필요한 오버헤드 제거
    function stopDomObserver() {
        if (domObserver) { domObserver.disconnect(); domObserver = null; }
        clearTimeout(domObserverTimer);
    }

    // 사용자가 웹페이지 내 input/textarea 폼 값을 직접 입력/수정할 때도 실시간 동기화 재검색
    window.addEventListener('input', (e) => {
        if (!isBarVisible || isHighlighting) return;
        if (!bars.some(b => b.query && b.query.trim())) return;
        const target = e.target;
        if (target && isSearchableInputElement(target)) {
            if (target.classList.contains('search-input')) return;
            clearTimeout(domObserverTimer);
            domObserverTimer = setTimeout(() => {
                if (!isHighlighting && isBarVisible) performAllSearches(null);
            }, DOM_OBSERVER_DELAY);
        }
    }, true);

// ## 단계 900: 키보드 내비게이션 및 전역 단축키 핸들러
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    //------------------------------------------------------------------------------------------------------
    // 지정된 검색바의 다음 일치 항목으로 순환 이동한다.
    // 입력: bar - 검색바 인스턴스 객체
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function moveToNext(bar) {
        const total = bar.matches.length;
        if (total === 0) return;

        bar.currentIndex = (bar.currentIndex + 1) % total;
        updateCountDisplay(bar, bar.currentIndex + 1, total);
        highlightActiveMatch(bar);
        scrollToCurrentMatch(bar);
    }

    //------------------------------------------------------------------------------------------------------
    // 지정된 검색바의 이전 일치 항목으로 순환 이동한다.
    // 입력: bar - 검색바 인스턴스 객체
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function moveToPrev(bar) {
        const total = bar.matches.length;
        if (total === 0) return;

        bar.currentIndex = (bar.currentIndex - 1 + total) % total;
        updateCountDisplay(bar, bar.currentIndex + 1, total);
        highlightActiveMatch(bar);
        scrollToCurrentMatch(bar);
    }

    //------------------------------------------------------------------------------------------------------
    // 키보드 이벤트가 사용자가 등록한 단축키 설정과 일치하는지 판별한다 (한/영 키 및 물리 코드 호환).
    // 입력: e - KeyboardEvent 객체
    //       shortcut - 저장된 단축키 객체 { ctrl, alt, shift, meta, key }
    // 출력: true(단축키 일치) 또는 false
    //------------------------------------------------------------------------------------------------------
    function matchesShortcut(e, shortcut) {
        if (!shortcut) return false;
        const targetKey = (shortcut.key || 'f').toLowerCase();
        const eventKey = (e.key || '').toLowerCase();
        const eventCode = (e.code || '').toLowerCase();

        // 한글 입력기 상태에서도 단축키가 정상 트리거되도록 물리 키 코드(KeyF) 병행 검사
        const keyMatch = (eventKey === targetKey) ||
                         (eventCode === 'key' + targetKey) ||
                         (targetKey === 'f' && (e.keyCode === 70 || e.which === 70));

        const ctrlMatch = !!shortcut.ctrl === !!e.ctrlKey;
        const altMatch = !!shortcut.alt === !!e.altKey;
        const shiftMatch = !!shortcut.shift === !!e.shiftKey;
        const metaMatch = !!shortcut.meta === !!e.metaKey;
        return keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch;
    }

    // 웹페이지 전역 키보드 단축키 및 F3/F4 탐색 이벤트 리스너
    window.addEventListener('keydown', (e) => {
        // 커스텀 검색 호출 단축키 (기본: Ctrl+F)
        if (matchesShortcut(e, config.shortcut)) {
            e.preventDefault();
            e.stopPropagation();
            showSearchBar();
            return;
        }

        // F3 키: 활성 검색바의 다음 일치 항목 이동 (Shift+F3은 이전 이동)
        if (e.key === 'F3') {
            const target = activeBar || bars[0];
            if (target && target.matches.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                e.shiftKey ? moveToPrev(target) : moveToNext(target);
            }
            return;
        }

        // F4 키: 활성 검색바의 이전 일치 항목 이동
        if (e.key === 'F4') {
            const target = activeBar || bars[0];
            if (target && target.matches.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                moveToPrev(target);
            }
            return;
        }

        // ESC 키: 검색창이 열려있을 때 닫기
        if (e.key === 'Escape' && isBarVisible) {
            e.preventDefault();
            hideAllSearchBars();
        }
    }, true);

// ## 단계 990: 외부 메시지 수신, 탭 활성화 감지 및 초기화
    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    // 팝업 또는 백그라운드로부터 전달되는 OPEN_SEARCH 메시지 처리
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request && request.type === 'OPEN_SEARCH') {
            showSearchBar();
            sendResponse({ success: true });
            return true;
        }
        return false;
    });

    // 탭 전환 복귀 시 최신 북마크 스토리지 동기화
    window.addEventListener('focus', () => {
        loadBookmarks(() => {
            if (isBarVisible) {
                renderBookmarks();
            }
        });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            loadBookmarks(() => {
                if (isBarVisible) {
                    renderBookmarks();
                }
            });
        }
    });

    //------------------------------------------------------------------------------------------------------
    // 북마크 클릭으로 페이지 이동 후 세션에 대기 중인 검색 키워드가 있는지 확인하여 자동 검색을 수행한다.
    // 입력: 없음
    // 출력: 없음
    //------------------------------------------------------------------------------------------------------
    function checkPendingBookmarkQuery() {
        try {
            const pendingQuery = sessionStorage.getItem('search_ext_pending_query');
            if (pendingQuery !== null) {
                sessionStorage.removeItem('search_ext_pending_query');
                // DOM 렌더링 안정화를 위해 소폭 지연 후 검색어 주입
                setTimeout(() => {
                    applyPendingBookmarkQuery(pendingQuery);
                }, 150);
            }
        } catch (e) {}
    }

    // content script 초기 실행 시 환경설정 로드 및 대기 쿼리 확인
    loadConfig(() => {
        loadBookmarks();
        checkPendingBookmarkQuery();
    });
})();
