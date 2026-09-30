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
        defaultBarCount: 1,
        lastBarsState: null
    };

    // State
    let isBarVisible = false;
    let shadowRoot = null;
    let hostElement = null;
    let barsContainer = null;
    let bars = [];
    let nextBarId = 1;
    let activeBar = null;

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
            'lastBarsState'
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
    });

    // Create Base UI Container in Shadow DOM
    function createUI() {
        if (shadowRoot) return;

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
                flex-shrink: 0;
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
                color: #c0c4d6;
                border-radius: 9999px;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                padding: 0;
                transition: background-color 0.1s, color 0.1s;
            }
            .btn-nav:hover {
                background-color: rgba(255, 255, 255, 0.15);
                color: #ffffff;
            }
            .btn-nav svg {
                width: 10px;
                height: 10px;
                fill: currentColor;
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
        `;

        barsContainer = document.createElement('div');
        barsContainer.className = 'bars-container';

        shadowRoot.appendChild(style);
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
                    <span>Match Case</span>
                </label>
                <label class="opt-label opt-word" title="단어 단위 일치">
                    <input type="checkbox" class="chk-word">
                    <span>By Word</span>
                </label>
                <label class="opt-label opt-regex" title="정규 표현식 검색">
                    <input type="checkbox" class="chk-regex">
                    <span>RegExp</span>
                </label>
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
                labelRegex: row.querySelector('.opt-regex')
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
                    const count = Math.max(1, config.defaultBarCount || 1);
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

    // Initialize
    loadConfig();
})();
