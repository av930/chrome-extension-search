// content.js - In-page text search script with multiple search bars, distinct highlight colors, and navigation

(function () {
    'use strict';

    // Prevent duplicate injection
    if (window.__chromeSearchExtensionLoaded) {
        return;
    }
    window.__chromeSearchExtensionLoaded = true;

    // Distinct highlight color palettes for multiple search bars
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

    // Global configuration from storage
    let config = {
        shortcut: { ctrl: true, alt: false, shift: false, meta: false, key: 'f' },
        highlightColor: '#ffe600',
        activeHighlightColor: '#ff8f00',
        autoMove: true,
        defaultBarCount: 2,
        lastBarsState: null,
        ignoreDelimiters: '-'
    };

    // State
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

    // Predefined vibrant colors for bookmark pins
    const BOOKMARK_COLORS = [
        '#29b6f6', '#ab47bc', '#26a69a', '#ffa726',
        '#ef5350', '#ec407a', '#7e57c2', '#42a5f5',
        '#26c6da', '#66bb6a', '#9ccc65', '#d4e157',
        '#ffee58', '#ffca28', '#8d6e63', '#78909c'
    ];

    function getRandomBookmarkColor() {
        return BOOKMARK_COLORS[Math.floor(Math.random() * BOOKMARK_COLORS.length)];
    }

    // Load bookmarks from chrome.storage.local
    function loadBookmarks(callback) {
        if (!chrome.runtime?.id) {
            if (callback) callback();
            return;
        }
        chrome.storage.local.get(['bookmarks'], (result) => {
            if (Array.isArray(result.bookmarks)) {
                bookmarks = result.bookmarks;
            } else {
                bookmarks = [];
            }
            if (callback) callback();
        });
    }

    // Save bookmarks to chrome.storage.local
    function saveBookmarks() {
        if (!chrome.runtime?.id) return;
        chrome.storage.local.set({ bookmarks: bookmarks });
    }

    // Load configuration from chrome.storage
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
            if (result.shortcut) config.shortcut = result.shortcut;
            if (result.highlightColor) {
                config.highlightColor = result.highlightColor;
                COLOR_PALETTES[0].highlight = result.highlightColor;
                COLOR_PALETTES[0].badge = result.highlightColor;
            }
            if (result.activeHighlightColor) {
                config.activeHighlightColor = result.activeHighlightColor;
                COLOR_PALETTES[0].active = result.activeHighlightColor;
            }
            if (typeof result.autoMove === 'boolean') config.autoMove = result.autoMove;
            if (typeof result.defaultBarCount === 'number') config.defaultBarCount = result.defaultBarCount;
            if (Array.isArray(result.lastBarsState)) config.lastBarsState = result.lastBarsState;
            if (typeof result.ignoreDelimiters === 'string') config.ignoreDelimiters = result.ignoreDelimiters;
            if (callback) callback();
        });
    }

    // Save current bars state to storage
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

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
            if (changes.bookmarks) {
                bookmarks = changes.bookmarks.newValue || [];
                if (isBarVisible) {
                    renderBookmarks();
                }
            }
            return;
        }
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

    // Create Base UI Container in Shadow DOM
    function createUI() {
        if (shadowRoot && hostElement && hostElement.isConnected) return;

        if (hostElement && !hostElement.isConnected) {
            (document.body || document.documentElement).appendChild(hostElement);
            return;
        }

        // Remove any old orphaned root element if present
        const oldRoot = document.getElementById('chrome-ext-search-root');
        if (oldRoot) {
            oldRoot.remove();
        }

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

    // Create a new Search Bar instance
    function createSearchBar(initData = {}, focusInput = true) {
        createUI();

        const opts = (typeof initData === 'string') ? { query: initData } : (initData || {});
        const initialQuery = opts.query || '';
        const initialCase = !!opts.caseSensitive;
        const initialWord = !!opts.wholeWord;
        const initialRegex = !!opts.useRegex;

        const barIndex = bars.length;
        const palette = COLOR_PALETTES[barIndex % COLOR_PALETTES.length];
        const barId = nextBarId++;

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

        // Apply initial checkbox states
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

        // Attach event listeners for this bar
        bar.ui.input.addEventListener('focus', () => {
            setActiveBar(bar);
        });

        bar.ui.input.addEventListener('input', (e) => {
            bar.query = e.target.value;
            bar.ui.btnClear.classList.toggle('visible', !!bar.query);
            performAllSearches(bar);
            saveBarsState();
        });

        bar.ui.btnClear.addEventListener('click', () => {
            bar.query = '';
            bar.ui.input.value = '';
            bar.ui.btnClear.classList.remove('visible');
            bar.ui.input.focus();
            performAllSearches(bar);
            saveBarsState();
        });

        bar.ui.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    moveToPrev(bar);
                } else {
                    moveToNext(bar);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                removeSearchBar(bar);
            } else if (e.key === 'F3') {
                e.preventDefault();
                if (e.shiftKey) {
                    moveToPrev(bar);
                } else {
                    moveToNext(bar);
                }
            } else if (e.key === 'F4') {
                e.preventDefault();
                moveToPrev(bar);
            }
        });

        bar.ui.btnNext.addEventListener('click', () => moveToNext(bar));
        bar.ui.btnPrev.addEventListener('click', () => moveToPrev(bar));

        bar.ui.chkCase.addEventListener('change', (e) => {
            bar.caseSensitive = e.target.checked;
            bar.ui.labelCase.classList.toggle('active', bar.caseSensitive);
            performAllSearches(bar);
            saveBarsState();
        });

        bar.ui.chkWord.addEventListener('change', (e) => {
            bar.wholeWord = e.target.checked;
            bar.ui.labelWord.classList.toggle('active', bar.wholeWord);
            performAllSearches(bar);
            saveBarsState();
        });

        bar.ui.chkRegex.addEventListener('change', (e) => {
            bar.useRegex = e.target.checked;
            bar.ui.labelRegex.classList.toggle('active', bar.useRegex);
            performAllSearches(bar);
            saveBarsState();
        });

        bar.ui.btnAdd.addEventListener('click', () => {
            createSearchBar({}, true);
            saveBarsState();
        });

        bar.ui.btnClose.addEventListener('click', () => {
            removeSearchBar(bar);
        });

        if (bar.ui.btnBookmark) {
            bar.ui.btnBookmark.addEventListener('click', () => {
                addBookmark(bar);
            });
        }

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

    // Set currently active bar for keyboard navigation
    function setActiveBar(bar) {
        activeBar = bar;
        bars.forEach(b => {
            b.rowEl.classList.toggle('active-bar', b === bar);
        });
    }

    // Remove a single Search Bar
    function removeSearchBar(bar) {
        if (bars.length <= 1) {
            hideAllSearchBars();
            return;
        }

        const index = bars.indexOf(bar);
        if (index !== -1) {
            bars.splice(index, 1);
            bar.rowEl.remove();
        }

        // Reassign active bar if needed
        if (activeBar === bar) {
            const nextActive = bars[Math.max(0, index - 1)] || bars[0];
            if (nextActive) {
                setActiveBar(nextActive);
                nextActive.ui.input.focus();
            }
        }

        performAllSearches();
        saveBarsState();
    }

    // Add current page and search keyword to bookmarks
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

    // Delete a bookmark by ID
    function deleteBookmark(bookmarkId) {
        bookmarks = bookmarks.filter(b => b.id !== bookmarkId);
        saveBookmarks();
        renderBookmarks();
    }

    // Open bookmarked page and auto-populate search keyword
    function openBookmark(bookmark) {
        if (!bookmark) return;

        // Save pending search query to session storage so new page or current page can consume it
        try {
            sessionStorage.setItem('search_ext_pending_query', bookmark.keyword || '');
        } catch (e) {}

        const currentUrl = window.location.href;
        // Compare URLs ignoring hash or search if identical
        if (currentUrl === bookmark.url) {
            applyPendingBookmarkQuery(bookmark.keyword || '');
        } else {
            window.location.href = bookmark.url;
        }
    }

    // Apply pending query to the first search bar and trigger search
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

    // Get current text selection, or initialize selection from the active search match
    function getOrInitSelection() {
        const sel = window.getSelection();
        if (!sel) return null;

        if (sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().length > 0) {
            return sel;
        }

        // If no user selection exists, select the current active match element
        const target = activeBar || bars[0];
        if (target && target.matches && target.matches.length > 0 && target.currentIndex >= 0) {
            const activeEl = target.matches[target.currentIndex];
            if (activeEl && activeEl.isConnected) {
                const range = document.createRange();
                range.selectNodeContents(activeEl);
                sel.removeAllRanges();
                sel.addRange(range);
                return sel;
            }
        }

        return (sel.rangeCount > 0 && !sel.isCollapsed) ? sel : null;
    }

    // Helper: Check if character is an ignored delimiter
    function isIgnoredDelimiter(char) {
        if (!char || typeof config.ignoreDelimiters !== 'string') return false;
        return config.ignoreDelimiters.includes(char);
    }

    // Expand current selection to the left by words (default: 1)
    function expandSelectionLeft(wordCount = 1) {
        const sel = getOrInitSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        let startNode = range.startContainer;
        let startOffset = range.startOffset;
        const fixedEndNode = range.endContainer;
        const fixedEndOffset = range.endOffset;

        // Anchor at fixed end, focus at moving start
        sel.setBaseAndExtent(fixedEndNode, fixedEndOffset, startNode, startOffset);

        for (let step = 0; step < wordCount; step++) {
            let lastLen = sel.toString().length;
            sel.modify('extend', 'backward', 'word');
            if (sel.toString().length === lastLen) {
                sel.modify('extend', 'backward', 'word');
            }
            if (sel.toString().length === lastLen) {
                break; // Cannot expand further
            }

            // If ignoreDelimiters are configured, bridge across them
            if (config.ignoreDelimiters) {
                let loopCount = 0;
                while (loopCount++ < 15) {
                    const currentText = sel.toString();
                    if (!currentText) break;

                    // 1) If current selection starts with an ignored delimiter, expand backward further
                    if (isIgnoredDelimiter(currentText[0])) {
                        const lenBefore = currentText.length;
                        sel.modify('extend', 'backward', 'word');
                        if (sel.toString().length > lenBefore) continue;
                    }

                    // 2) Peek at the preceding character
                    const currentRange = sel.getRangeAt(0).cloneRange();
                    const lenBeforePeek = currentText.length;
                    sel.modify('extend', 'backward', 'character');
                    const textWithPeek = sel.toString();

                    if (textWithPeek.length > lenBeforePeek) {
                        const prevChar = textWithPeek[0];
                        if (isIgnoredDelimiter(prevChar)) {
                            // Preceding char is an ignored delimiter: bridge across it
                            sel.modify('extend', 'backward', 'word');
                            continue;
                        } else {
                            // Restore back to currentRange (revert 1 character extension)
                            sel.setBaseAndExtent(
                                fixedEndNode,
                                fixedEndOffset,
                                currentRange.startContainer,
                                currentRange.startOffset
                            );
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }
        }
    }

    // Expand current selection to the right by words (default: 1)
    function expandSelectionRight(wordCount = 1) {
        const sel = getOrInitSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        const fixedStartNode = range.startContainer;
        const fixedStartOffset = range.startOffset;
        let endNode = range.endContainer;
        let endOffset = range.endOffset;

        // Anchor at fixed start, focus at moving end
        sel.setBaseAndExtent(fixedStartNode, fixedStartOffset, endNode, endOffset);

        for (let step = 0; step < wordCount; step++) {
            let lastLen = sel.toString().length;
            sel.modify('extend', 'forward', 'word');
            if (sel.toString().length === lastLen) {
                sel.modify('extend', 'forward', 'word');
            }
            if (sel.toString().length === lastLen) {
                break; // Cannot expand further
            }

            // If ignoreDelimiters are configured, bridge across them
            if (config.ignoreDelimiters) {
                let loopCount = 0;
                while (loopCount++ < 15) {
                    const currentText = sel.toString();
                    if (!currentText) break;

                    // 1) If current selection ends with an ignored delimiter, expand forward further
                    if (isIgnoredDelimiter(currentText[currentText.length - 1])) {
                        const lenBefore = currentText.length;
                        sel.modify('extend', 'forward', 'word');
                        if (sel.toString().length > lenBefore) continue;
                    }

                    // 2) Peek at the succeeding character
                    const currentRange = sel.getRangeAt(0).cloneRange();
                    const lenBeforePeek = currentText.length;
                    sel.modify('extend', 'forward', 'character');
                    const textWithPeek = sel.toString();

                    if (textWithPeek.length > lenBeforePeek) {
                        const nextChar = textWithPeek[textWithPeek.length - 1];
                        if (isIgnoredDelimiter(nextChar)) {
                            // Next char is an ignored delimiter: bridge across it
                            sel.modify('extend', 'forward', 'word');
                            continue;
                        } else {
                            // Restore back to currentRange (revert 1 character extension)
                            sel.setBaseAndExtent(
                                fixedStartNode,
                                fixedStartOffset,
                                currentRange.endContainer,
                                currentRange.endOffset
                            );
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }
        }
    }

    // Copy selected text to clipboard and provide visual feedback
    async function handleTextSelectAction(btnEl) {
        const sel = getOrInitSelection();
        let textToCopy = (sel && !sel.isCollapsed) ? sel.toString() : '';

        if (!textToCopy) {
            const target = activeBar || bars[0];
            if (target && target.query) {
                textToCopy = target.query;
            }
        }

        if (!textToCopy) return;

        let copied = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(textToCopy);
                copied = true;
            }
        } catch (e) {}

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

    // Render bookmark clips in common bar (right to left)
    function renderBookmarks() {
        if (!bookmarksContainer) return;
        bookmarksContainer.innerHTML = '';

        if (!bookmarks || bookmarks.length === 0) {
            return;
        }

        // Render bookmarks (bookmarks-bar uses flex-direction: row-reverse, so appending order naturally places newest on the right)
        bookmarks.forEach(bm => {
            const clipItem = document.createElement('div');
            clipItem.className = 'bookmark-clip-item';

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

    // Show search bar container
    function showSearchBar() {
        createUI();
        isBarVisible = true;
        hostElement.style.setProperty('display', 'block', 'important');

        const selectedText = window.getSelection()?.toString().trim();
        const initialQuery = (selectedText && selectedText.length < 100) ? selectedText : '';

        const setupBars = () => {
            if (bars.length === 0) {
                let statesToRestore = [];
                if (Array.isArray(config.lastBarsState) && config.lastBarsState.length > 0) {
                    statesToRestore = config.lastBarsState;
                } else {
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

                statesToRestore.forEach((state, idx) => {
                    const isFirst = (idx === 0);
                    const bar = createSearchBar(state, isFirst);
                    if (isFirst && initialQuery) {
                        bar.query = initialQuery;
                        bar.ui.input.value = initialQuery;
                        bar.ui.btnClear.classList.add('visible');
                    }
                });

                const firstBar = bars[0];
                if (firstBar) {
                    setActiveBar(firstBar);
                    firstBar.ui.input.focus();
                    firstBar.ui.input.select();
                }

                performAllSearches();
            } else {
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

        if (config._loaded) {
            setupBars();
        } else {
            loadConfig(() => setupBars());
        }

        loadBookmarks(() => {
            renderBookmarks();
        });
    }

    // Hide search bar container & clean all highlights
    function hideAllSearchBars() {
        if (!isBarVisible) return;
        saveBarsState();
        isBarVisible = false;
        if (hostElement) {
            hostElement.style.setProperty('display', 'none', 'important');
        }
        cleanAllHighlights();
        bars.forEach(b => {
            b.rowEl.remove();
        });
        bars = [];
        activeBar = null;
    }

    // Clean all highlights from the document
    function cleanAllHighlights() {
        const marks = document.querySelectorAll('mark.search-ext-highlight');
        marks.forEach(mark => {
            const parent = mark.parentNode;
            if (parent) {
                while (mark.firstChild) {
                    parent.insertBefore(mark.firstChild, mark);
                }
                parent.removeChild(mark);
                parent.normalize();
            }
        });
        bars.forEach(bar => {
            bar.matches = [];
            bar.currentIndex = -1;
            updateCountDisplay(bar, 0, 0);
        });
    }

    // Helper: Escape Regex
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Compile regex for a specific bar
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
            if (bar.useRegex) {
                bar.ui.inputBox.classList.add('invalid');
            }
            return null;
        }
    }

    // Multi-bar synchronized text search and highlighting
    function performAllSearches(triggeringBar = null) {
        cleanAllHighlights();

        // Compile regexes for all bars
        const activeSearchBars = [];
        bars.forEach(bar => {
            const regex = compileBarRegex(bar);
            if (regex) {
                activeSearchBars.push({
                    bar: bar,
                    regex: regex
                });
            }
        });

        if (activeSearchBars.length === 0) {
            return;
        }

        // TreeWalker to traverse text nodes
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;

                    const tag = parent.tagName;
                    if (
                        tag === 'SCRIPT' ||
                        tag === 'STYLE' ||
                        tag === 'NOSCRIPT' ||
                        tag === 'TEXTAREA' ||
                        tag === 'INPUT' ||
                        tag === 'IFRAME' ||
                        tag === 'OBJECT' ||
                        tag === 'SELECT' ||
                        parent.id === 'chrome-ext-search-root' ||
                        parent.closest('#chrome-ext-search-root') ||
                        parent.isContentEditable
                    ) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        // Collect matching nodes
        const nodesToProcess = [];
        let currentNode = walker.nextNode();
        while (currentNode) {
            const val = currentNode.nodeValue;
            let matched = false;
            for (const item of activeSearchBars) {
                item.regex.lastIndex = 0;
                if (item.regex.test(val)) {
                    matched = true;
                    break;
                }
            }
            if (matched) {
                nodesToProcess.push(currentNode);
            }
            currentNode = walker.nextNode();
        }

        // Process and highlight each text node
        nodesToProcess.forEach(textNode => {
            const text = textNode.nodeValue;
            const intervals = [];

            // Find all match intervals from all search bars
            activeSearchBars.forEach(({ bar, regex }) => {
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

            // Sort intervals: earliest start first, then longest match
            intervals.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

            // Remove overlapping intervals
            const nonOverlapping = [];
            let lastEnd = 0;
            for (const item of intervals) {
                if (item.start >= lastEnd) {
                    nonOverlapping.push(item);
                    lastEnd = item.end;
                }
            }

            // Build replacement fragment
            const frag = document.createDocumentFragment();
            let curIdx = 0;

            for (const item of nonOverlapping) {
                if (item.start > curIdx) {
                    frag.appendChild(document.createTextNode(text.substring(curIdx, item.start)));
                }

                const mark = document.createElement('mark');
                mark.className = 'search-ext-highlight';
                mark.dataset.barId = String(item.bar.id);
                mark.textContent = text.substring(item.start, item.end);
                mark.style.backgroundColor = item.bar.colorConfig.highlight;
                mark.style.color = item.bar.colorConfig.text;

                frag.appendChild(mark);
                item.bar.matches.push(mark);

                curIdx = item.end;
            }

            if (curIdx < text.length) {
                frag.appendChild(document.createTextNode(text.substring(curIdx)));
            }

            const parent = textNode.parentNode;
            if (parent) {
                parent.replaceChild(frag, textNode);
            }
        });

        // Update each search bar's index, display, and active highlight
        bars.forEach(bar => {
            const total = bar.matches.length;
            if (total > 0) {
                if (bar.currentIndex < 0 || bar.currentIndex >= total) {
                    bar.currentIndex = 0;
                }
                updateCountDisplay(bar, bar.currentIndex + 1, total);
                highlightActiveMatch(bar);
            } else {
                bar.currentIndex = -1;
                updateCountDisplay(bar, 0, 0);
            }
        });

        // Auto-move if triggered by user input
        if (triggeringBar && config.autoMove && triggeringBar.matches.length > 0) {
            scrollToCurrentMatch(triggeringBar);
        }
    }

    // Update count display for a specific bar
    function updateCountDisplay(bar, current, total) {
        if (!bar.ui.countInfo) return;
        bar.ui.countInfo.textContent = `${current} of ${total}`;
    }

    // Highlight the active match for a specific bar
    function highlightActiveMatch(bar) {
        bar.matches.forEach((el, i) => {
            if (i === bar.currentIndex) {
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
        });
    }

    // Scroll the active match of a specific bar into center view
    function scrollToCurrentMatch(bar) {
        if (bar.currentIndex < 0 || bar.currentIndex >= bar.matches.length) return;
        const target = bar.matches[bar.currentIndex];
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
        }
    }

    // Navigate to next match for a specific bar
    function moveToNext(bar) {
        const total = bar.matches.length;
        if (total === 0) return;

        bar.currentIndex = (bar.currentIndex + 1) % total;
        updateCountDisplay(bar, bar.currentIndex + 1, total);
        highlightActiveMatch(bar);
        scrollToCurrentMatch(bar);
    }

    // Navigate to previous match for a specific bar
    function moveToPrev(bar) {
        const total = bar.matches.length;
        if (total === 0) return;

        bar.currentIndex = (bar.currentIndex - 1 + total) % total;
        updateCountDisplay(bar, bar.currentIndex + 1, total);
        highlightActiveMatch(bar);
        scrollToCurrentMatch(bar);
    }

    // Check if keyboard event matches configured shortcut
    function matchesShortcut(e, shortcut) {
        if (!shortcut) return false;
        const targetKey = (shortcut.key || 'f').toLowerCase();
        const eventKey = (e.key || '').toLowerCase();
        const eventCode = (e.code || '').toLowerCase();

        // Support both character key match and physical key code (e.g. KeyF for Korean IME)
        const keyMatch = (eventKey === targetKey) ||
                         (eventCode === 'key' + targetKey) ||
                         (targetKey === 'f' && (e.keyCode === 70 || e.which === 70));

        const ctrlMatch = !!shortcut.ctrl === !!e.ctrlKey;
        const altMatch = !!shortcut.alt === !!e.altKey;
        const shiftMatch = !!shortcut.shift === !!e.shiftKey;
        const metaMatch = !!shortcut.meta === !!e.metaKey;
        return keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch;
    }

    // Global Keydown listener for shortcut and F3/F4 navigation
    window.addEventListener('keydown', (e) => {
        // Custom shortcut (default: Ctrl+F)
        if (matchesShortcut(e, config.shortcut)) {
            e.preventDefault();
            e.stopPropagation();
            showSearchBar();
            return;
        }

        // F3 -> Move Next for active bar
        if (e.key === 'F3') {
            const target = activeBar || bars[0];
            if (target && target.matches.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                if (e.shiftKey) {
                    moveToPrev(target);
                } else {
                    moveToNext(target);
                }
            }
            return;
        }

        // F4 -> Move Prev for active bar
        if (e.key === 'F4') {
            const target = activeBar || bars[0];
            if (target && target.matches.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                moveToPrev(target);
            }
            return;
        }

        // Escape when bars are open
        if (e.key === 'Escape' && isBarVisible) {
            e.preventDefault();
            hideAllSearchBars();
        }
    }, true);

    // Message listener for external requests (e.g. from popup or background)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request && request.type === 'OPEN_SEARCH') {
            showSearchBar();
            sendResponse({ success: true });
            return true;
        }
        return false;
    });

    // Sync bookmarks when user switches back to this tab
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

    // Check if there is a pending bookmark query to consume on page load
    function checkPendingBookmarkQuery() {
        try {
            const pendingQuery = sessionStorage.getItem('search_ext_pending_query');
            if (pendingQuery !== null) {
                sessionStorage.removeItem('search_ext_pending_query');
                // Allow page DOM to stabilize slightly before applying
                setTimeout(() => {
                    applyPendingBookmarkQuery(pendingQuery);
                }, 150);
            }
        } catch (e) {}
    }

    // Initialize
    loadConfig(() => {
        loadBookmarks();
        checkPendingBookmarkQuery();
    });
})();
