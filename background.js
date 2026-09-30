// background.js - Service Worker for in-page text search extension

chrome.runtime.onInstalled.addListener((details) => {
    console.log('Text Search Extension installed:', details.reason);

    // Initialize default settings if not exists
    chrome.storage.sync.get([
        'shortcut',
        'autoMove',
        'highlightColor',
        'activeHighlightColor',
        'defaultBarCount',
        'lastBarsState'
    ], (result) => {
        const defaults = {};
        if (!result.shortcut) {
            defaults.shortcut = { ctrl: true, alt: false, shift: false, meta: false, key: 'f' };
        }
        if (typeof result.autoMove !== 'boolean') {
            defaults.autoMove = true;
        }
        if (!result.highlightColor) {
            defaults.highlightColor = '#ffe600';
        }
        if (!result.activeHighlightColor) {
            defaults.activeHighlightColor = '#ff8f00';
        }
        if (typeof result.defaultBarCount !== 'number') {
            defaults.defaultBarCount = 1;
        }

        if (Object.keys(defaults).length > 0) {
            chrome.storage.sync.set(defaults);
        }
    });
});
