/* ============================================
   MDConvert — Main Application
   Full Markdown → PDF / DOC / HTML Converter
============================================ */

'use strict';

// ─── STATE ───────────────────────────────────────────────────────────────────
const STATE = {
    markdown: '',
    format: 'pdf',
    previewEnabled: true,
    syncScroll: true,
    settings: {
        fontFamily: 'Helvetica, Arial, sans-serif',
        bgColor: '#ffffff',
        textColor: '#000000',
        linkColor: '#0000EE',
        sizeMode: 'relative',
        baseSize: 10,
        lineHeight: 1.0,
        headingGap: 2,
        paraGap: 2,
        listGap: 1,
        zeroSpace: true,
        columns: 1,
        paperSize: 'A4',
        orientation: 'portrait',
        margins: { top: 1, bot: 1, left: 1, right: 1 },
        fixedSizes: { h1: 20, h2: 17, h3: 14, h4: 12, body: 10, code: 9 }
    }
};

// Base ratios for relative mode (multiplied by baseSize)
const SIZE_RATIOS = {
    h1: 2.0,
    h2: 1.7,
    h3: 1.4,
    h4: 1.2,
    body: 1.0,
    code: 0.9
};

// Paper dimensions in mm
const PAPER_SIZES = {
    A4: { w: 210, h: 297 },
    A3: { w: 297, h: 420 },
    A5: { w: 148, h: 210 },
    Letter: { w: 215.9, h: 279.4 },
    Legal: { w: 215.9, h: 355.6 }
};

// ─── DOM REFS ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const DOM = {
    markdownInput: $('markdownInput'),
    previewContent: $('previewContent'),
    paperPreview: $('paperPreview'),
    dropZone: $('dropZone'),
    fileInput: $('fileInput'),
    charCount: $('charCount'),
    lineCount: $('lineCount'),
    wordCount: $('wordCount'),
    progressOverlay: $('progressOverlay'),
    progressBar: $('progressBar'),
    progressText: $('progressText'),
    toast: $('toast'),

    // Settings
    fontFamily: $('fontFamily'),
    bgColor: $('bgColor'),
    bgColorHex: $('bgColorHex'),
    textColor: $('textColor'),
    textColorHex: $('textColorHex'),
    linkColor: $('linkColor'),
    linkColorHex: $('linkColorHex'),
    sizeMode: $('sizeMode'),
    baseSize: $('baseSize'),
    lineHeight: $('lineHeight'),
    headingGap: $('headingGap'),
    paraGap: $('paraGap'),
    listGap: $('listGap'),
    zeroSpace: $('zeroSpace'),
    columns: $('columns'),
    paperSize: $('paperSize'),
    orientPortrait: $('orientPortrait'),
    orientLandscape: $('orientLandscape'),
    marginTop: $('marginTop'),
    marginBot: $('marginBot'),
    marginLeft: $('marginLeft'),
    marginRight: $('marginRight'),

    // Displays
    h1SizeDisplay: $('h1SizeDisplay'),
    h2SizeDisplay: $('h2SizeDisplay'),
    h3SizeDisplay: $('h3SizeDisplay'),
    h4SizeDisplay: $('h4SizeDisplay'),
    bodySizeDisplay: $('bodySizeDisplay'),
    codeSizeDisplay: $('codeSizeDisplay'),

    // Fixed inputs
    h1Fixed: $('h1Fixed'),
    h2Fixed: $('h2Fixed'),
    h3Fixed: $('h3Fixed'),
    h4Fixed: $('h4Fixed'),
    bodyFixed: $('bodyFixed'),
    codeFixed: $('codeFixed'),

    fontSizeRelative: $('fontSizeMode_relative'),
    fontSizeFixed: $('fontSizeMode_fixed'),

    // New feature refs
    themeToggle: $('themeToggle'),
    themeIcon: $('themeIcon'),
    findReplaceBar: $('findReplaceBar'),
    findInput: $('findInput'),
    replaceInput: $('replaceInput'),
    findCount: $('findCount'),
    findCaseSensitive: $('findCaseSensitive'),
    readingTime: $('readingTime'),
    wordGoalInput: $('wordGoalInput'),
    wordGoalBarWrap: $('wordGoalBarWrap'),
    wordGoalBar: $('wordGoalBar'),
    wordGoalPct: $('wordGoalPct'),
    codeTheme: $('codeTheme'),
    syncScrollBtn: $('syncScrollBtn'),
    previewWrapper: $('previewWrapper'),
};

// ─── MARKED CONFIG ───────────────────────────────────────────────────────────
marked.setOptions({
    breaks: true,
    gfm: true,
});

// ─── MATH RENDERING (KaTeX) ─────────────────────────────────────────────────
// Protect math blocks from marked.js mangling (underscores → <em>, etc.)
// by extracting them before markdown parsing and reinserting after.
// Also protects fenced code blocks from being matched by math regex.
const _mathPlaceholders = [];
const _codeBlockPlaceholders = [];

function protectMath(mdText) {
    _mathPlaceholders.length = 0;
    _codeBlockPlaceholders.length = 0;
    let idx = 0;
    let codeIdx = 0;

    // Step 0: Extract fenced code blocks first so $variable inside code isn't treated as math
    mdText = mdText.replace(/```[\s\S]*?```/g, (match) => {
        const placeholder = `%%CODE_BLOCK_${codeIdx}%%`;
        _codeBlockPlaceholders.push({ placeholder, content: match });
        codeIdx++;
        return placeholder;
    });

    // Also protect inline code: `...$...`
    mdText = mdText.replace(/`[^`]+`/g, (match) => {
        const placeholder = `%%CODE_BLOCK_${codeIdx}%%`;
        _codeBlockPlaceholders.push({ placeholder, content: match });
        codeIdx++;
        return placeholder;
    });

    // Protect display math: $$...$$  (including multi-line)
    mdText = mdText.replace(/\$\$([\s\S]+?)\$\$/g, (match, content) => {
        const placeholder = `%%MATH_DISPLAY_${idx}%%`;
        _mathPlaceholders.push({ placeholder, content: content.trim(), display: true });
        idx++;
        return placeholder;
    });

    // Protect \\[...\\]  display math
    mdText = mdText.replace(/\\\[[\s\S]+?\\\]/g, (match) => {
        const placeholder = `%%MATH_DISPLAY_${idx}%%`;
        const content = match.slice(2, -2).trim();
        _mathPlaceholders.push({ placeholder, content, display: true });
        idx++;
        return placeholder;
    });

    // Protect inline math: $...$  (single-line, not greedy)
    mdText = mdText.replace(/\$([^\$\n]+?)\$/g, (match, content) => {
        const placeholder = `%%MATH_INLINE_${idx}%%`;
        _mathPlaceholders.push({ placeholder, content: content.trim(), display: false });
        idx++;
        return placeholder;
    });

    // Protect \\(...\\)  inline math
    mdText = mdText.replace(/\\\((.+?)\\\)/g, (match, content) => {
        const placeholder = `%%MATH_INLINE_${idx}%%`;
        _mathPlaceholders.push({ placeholder, content: content.trim(), display: false });
        idx++;
        return placeholder;
    });

    // Restore code block placeholders so marked can process them normally
    for (const { placeholder, content } of _codeBlockPlaceholders) {
        mdText = mdText.replace(placeholder, content);
    }

    return mdText;
}

function restoreMath(html) {
    // Guard: if KaTeX failed to load from CDN, show raw LaTeX gracefully
    if (typeof katex === 'undefined') {
        for (const { placeholder, content, display } of _mathPlaceholders) {
            const escaped = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const wrapper = display
                ? `<div style="text-align:center;font-family:monospace;padding:8px;background:rgba(0,0,0,0.04);border-radius:4px">${escaped}</div>`
                : `<code>${escaped}</code>`;
            html = html.replace(placeholder, wrapper);
        }
        return html;
    }

    for (const { placeholder, content, display } of _mathPlaceholders) {
        try {
            const rendered = katex.renderToString(content, {
                displayMode: display,
                throwOnError: false,
            });
            html = html.replace(placeholder, rendered);
        } catch (e) {
            // If KaTeX fails, show the raw LaTeX in a styled span
            const escaped = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const wrapper = display
                ? `<div class="katex-error" style="color:red;text-align:center">${escaped}</div>`
                : `<span class="katex-error" style="color:red">${escaped}</span>`;
            html = html.replace(placeholder, wrapper);
        }
    }
    return html;
}

// ─── INIT ────────────────────────────────────────────────────────────────────
function init() {
    loadTheme();
    restoreSession();
    bindEvents();
    updateSizeDisplays();
    applyPreviewStyles();
    updatePreview();
    updateStats();
}

// ─── BIND EVENTS ─────────────────────────────────────────────────────────────
function bindEvents() {

    // Textarea input
    DOM.markdownInput.addEventListener('input', () => {
        STATE.markdown = DOM.markdownInput.value;
        updateStats();
        if (STATE.previewEnabled) debouncePreview();
    });

    // File input
    DOM.fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) readFile(file);
        e.target.value = '';
    });

    // Drag and drop
    const dz = DOM.dropZone;
    dz.addEventListener('dragover', e => {
        e.preventDefault();
        dz.classList.add('drag-over');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) readFile(file);
    });

    // Sample button
    $('sampleBtn').addEventListener('click', loadSample);

    // Clear button
    $('clearBtn').addEventListener('click', () => {
        DOM.markdownInput.value = '';
        STATE.markdown = '';
        updateStats();
        updatePreview();
        showToast('Cleared!');
    });

    // Paste button
    $('pasteBtn').addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            DOM.markdownInput.value = text;
            STATE.markdown = text;
            updateStats();
            updatePreview();
            showToast('Pasted from clipboard!', 'success');
        } catch {
            showToast('Clipboard access denied', 'error');
        }
    });

    // Preview toggle
    $('togglePreview').addEventListener('click', () => {
        STATE.previewEnabled = !STATE.previewEnabled;
        $('togglePreview').textContent = STATE.previewEnabled ? 'Preview ON' : 'Preview OFF';
        $('togglePreview').classList.toggle('active-toggle', STATE.previewEnabled);
        if (STATE.previewEnabled) updatePreview();
    });

    // Fullscreen
    $('fullscreenBtn').addEventListener('click', () => {
        const pp = DOM.paperPreview;
        if (!document.fullscreenElement) {
            pp.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    });

    // Reset settings
    $('resetSettings').addEventListener('click', resetSettings);

    // ── Appearance ──
    DOM.fontFamily.addEventListener('change', () => {
        STATE.settings.fontFamily = DOM.fontFamily.value;
        applyPreviewStyles();
    });

    DOM.bgColor.addEventListener('input', () => {
        STATE.settings.bgColor = DOM.bgColor.value;
        DOM.bgColorHex.textContent = DOM.bgColor.value;
        applyPreviewStyles();
    });

    DOM.textColor.addEventListener('input', () => {
        STATE.settings.textColor = DOM.textColor.value;
        DOM.textColorHex.textContent = DOM.textColor.value;
        applyPreviewStyles();
    });

    DOM.linkColor.addEventListener('input', () => {
        STATE.settings.linkColor = DOM.linkColor.value;
        DOM.linkColorHex.textContent = DOM.linkColor.value;
        applyPreviewStyles();
    });

    // ── Typography ──
    DOM.sizeMode.addEventListener('change', () => {
        STATE.settings.sizeMode = DOM.sizeMode.value;
        DOM.fontSizeRelative.style.display = STATE.settings.sizeMode === 'relative' ? '' : 'none';
        DOM.fontSizeFixed.style.display = STATE.settings.sizeMode === 'fixed' ? '' : 'none';
        applyPreviewStyles();
    });

    // Base size +/-
    $('baseSizePlus').addEventListener('click', () => {
        const v = parseFloat(DOM.baseSize.value) + 1;
        if (v <= 72) { DOM.baseSize.value = v; STATE.settings.baseSize = v; updateSizeDisplays(); applyPreviewStyles(); }
    });
    $('baseSizeMinus').addEventListener('click', () => {
        const v = parseFloat(DOM.baseSize.value) - 1;
        if (v >= 6) { DOM.baseSize.value = v; STATE.settings.baseSize = v; updateSizeDisplays(); applyPreviewStyles(); }
    });
    DOM.baseSize.addEventListener('input', () => {
        STATE.settings.baseSize = parseFloat(DOM.baseSize.value) || 10;
        updateSizeDisplays();
        applyPreviewStyles();
    });

    // Line height +/-
    $('lineHeightPlus').addEventListener('click', () => {
        const v = (parseFloat(DOM.lineHeight.value) + 0.1).toFixed(1);
        if (v <= 3.0) { DOM.lineHeight.value = v; STATE.settings.lineHeight = parseFloat(v); applyPreviewStyles(); }
    });
    $('lineHeightMinus').addEventListener('click', () => {
        const v = (parseFloat(DOM.lineHeight.value) - 0.1).toFixed(1);
        if (v >= 0.8) { DOM.lineHeight.value = v; STATE.settings.lineHeight = parseFloat(v); applyPreviewStyles(); }
    });
    DOM.lineHeight.addEventListener('input', () => {
        STATE.settings.lineHeight = parseFloat(DOM.lineHeight.value) || 1.0;
        applyPreviewStyles();
    });

    // Fixed size inputs
    ['h1Fixed', 'h2Fixed', 'h3Fixed', 'h4Fixed', 'bodyFixed', 'codeFixed'].forEach(id => {
        $(id).addEventListener('input', () => {
            const key = id.replace('Fixed', '');
            STATE.settings.fixedSizes[key] = parseFloat($(id).value) || 10;
            applyPreviewStyles();
        });
    });

    // ── Spacing ──
    bindNumberInput('headingGap', 'headingGapPlus', 'headingGapMinus', 0, 20, 1, v => {
        STATE.settings.headingGap = v; applyPreviewStyles();
    });
    bindNumberInput('paraGap', 'paraGapPlus', 'paraGapMinus', 0, 20, 1, v => {
        STATE.settings.paraGap = v; applyPreviewStyles();
    });
    bindNumberInput('listGap', 'listGapPlus', 'listGapMinus', 0, 20, 1, v => {
        STATE.settings.listGap = v; applyPreviewStyles();
    });

    DOM.zeroSpace.addEventListener('change', () => {
        STATE.settings.zeroSpace = DOM.zeroSpace.checked;
        applyPreviewStyles();
    });

    // ── Page Setup ──
    DOM.columns.addEventListener('change', () => {
        STATE.settings.columns = parseInt(DOM.columns.value);
        applyPreviewStyles();
    });

    DOM.paperSize.addEventListener('change', () => {
        STATE.settings.paperSize = DOM.paperSize.value;
        updatePaperSize();
    });

    DOM.orientPortrait.addEventListener('change', () => {
        STATE.settings.orientation = 'portrait';
        updatePaperSize();
    });

    DOM.orientLandscape.addEventListener('change', () => {
        STATE.settings.orientation = 'landscape';
        updatePaperSize();
    });

    ['marginTop', 'marginBot', 'marginLeft', 'marginRight'].forEach(id => {
        $(id).addEventListener('input', () => {
            const key = id.replace('margin', '').toLowerCase();
            STATE.settings.margins[key] = parseFloat($(id).value) || 0;
            applyPreviewStyles();
        });
    });

    // ── Format buttons ──
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            STATE.format = btn.dataset.format;
        });
    });

    // ── Download & Print ──
    $('downloadBtn').addEventListener('click', handleDownload);
    $('printBtn').addEventListener('click', handlePrint);

    // ── Theme Toggle ──
    DOM.themeToggle.addEventListener('click', toggleTheme);

    // ── Markdown Toolbar ──
    document.querySelectorAll('.tb-btn').forEach(btn => {
        btn.addEventListener('click', () => handleToolbarAction(btn.dataset.action));
    });

    // ── Keyboard shortcuts ──
    DOM.markdownInput.addEventListener('keydown', handleEditorShortcuts);

    // ── Find & Replace ──
    $('findReplaceToggle').addEventListener('click', toggleFindReplace);
    $('findReplaceClose').addEventListener('click', () => { DOM.findReplaceBar.style.display = 'none'; });
    $('findNext').addEventListener('click', () => findInText('next'));
    $('findPrev').addEventListener('click', () => findInText('prev'));
    $('replaceOne').addEventListener('click', replaceInText);
    $('replaceAll').addEventListener('click', replaceAllInText);
    DOM.findInput.addEventListener('input', () => findInText('next'));
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'h') { e.preventDefault(); toggleFindReplace(); }
    });

    // ── TOC Generator ──
    $('generateTOC').addEventListener('click', generateTOC);

    // ── Clear Saved Data ──
    $('clearSavedData').addEventListener('click', () => {
        localStorage.removeItem('mdconvert_content');
        localStorage.removeItem('mdconvert_settings');
        localStorage.removeItem('mdconvert_wordgoal');
        showToast('Saved data cleared!', 'success');
    });

    // ── Auto-save (debounced) ──
    setInterval(autoSave, 2000);

    // ── Word Goal ──
    DOM.wordGoalInput.addEventListener('input', updateWordGoal);
    const savedGoal = localStorage.getItem('mdconvert_wordgoal');
    if (savedGoal) { DOM.wordGoalInput.value = savedGoal; updateWordGoal(); }

    // ── Code Theme ──
    DOM.codeTheme.addEventListener('change', () => {
        const theme = DOM.codeTheme.value;
        document.getElementById('hljs-theme').href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${theme}.min.css`;
        updatePreview();
    });

    // ── Sync Scroll ──
    DOM.syncScrollBtn.addEventListener('click', toggleSyncScroll);
    initSyncScroll();
}

// ─── HELPER: Bind number input with +/- buttons ───────────────────────────
function bindNumberInput(inputId, plusId, minusId, min, max, step, cb) {
    const input = $(inputId);
    $(plusId).addEventListener('click', () => {
        const v = parseFloat(input.value) + step;
        if (v <= max) { input.value = v; cb(v); }
    });
    $(minusId).addEventListener('click', () => {
        const v = parseFloat(input.value) - step;
        if (v >= min) { input.value = v; cb(v); }
    });
    input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (!isNaN(v)) cb(v);
    });
}

// ─── FILE READER ─────────────────────────────────────────────────────────────
function readFile(file) {
    // Validate file type by extension and MIME
    const allowedMime = ['text/markdown', 'text/plain', 'text/x-markdown', ''];
    const allowedExt = ['.md', '.txt', '.markdown', '.mdown', '.mkd', '.readme'];
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    const nameLC = file.name.toLowerCase();

    if (!allowedMime.includes(file.type) && !allowedExt.includes(ext) && nameLC !== 'readme') {
        showToast(`Unsupported file type: ${file.name}`, 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = e => {
        DOM.markdownInput.value = e.target.result;
        STATE.markdown = e.target.result;
        updateStats();
        updatePreview();
        showToast(`Loaded: ${file.name}`, 'success');
    };
    reader.onerror = () => showToast('Failed to read file', 'error');
    reader.readAsText(file, 'UTF-8');
}

// ─── STATS ───────────────────────────────────────────────────────────────────
function updateStats() {
    const txt = STATE.markdown;
    const wordCnt = txt.trim() ? txt.trim().split(/\s+/).length : 0;
    DOM.charCount.textContent = `${txt.length} chars`;
    DOM.lineCount.textContent = `${txt.split('\n').length} lines`;
    DOM.wordCount.textContent = `${wordCnt} words`;
    // Reading time (~200 WPM)
    const mins = Math.max(1, Math.ceil(wordCnt / 200));
    DOM.readingTime.textContent = `~${wordCnt === 0 ? 0 : mins} min read`;
    // Word goal
    updateWordGoal();
}

// ─── DEBOUNCE PREVIEW ────────────────────────────────────────────────────────
let previewTimer = null;
// ─── SYNC SCROLL ─────────────────────────────────────────────────────────────
let _syncScrollLock = false;
let _syncScrollRAF = null;

function toggleSyncScroll() {
    STATE.syncScroll = !STATE.syncScroll;
    DOM.syncScrollBtn.classList.toggle('active-toggle', STATE.syncScroll);
    DOM.syncScrollBtn.textContent = STATE.syncScroll ? '🔗 Sync Scroll On' : '🔓 Sync Scroll Off';
    showToast(STATE.syncScroll ? 'Sync scroll ON' : 'Sync scroll OFF');
}

function initSyncScroll() {
    const editor = DOM.markdownInput;
    const preview = DOM.previewWrapper;

    // ── Continuous scroll sync (proportion-based, for scrolling) ──
    editor.addEventListener('scroll', () => {
        if (!STATE.syncScroll || _syncScrollLock) return;
        _syncScrollLock = true;
        cancelAnimationFrame(_syncScrollRAF);
        _syncScrollRAF = requestAnimationFrame(() => {
            const scrollPct = editor.scrollTop / Math.max(1, editor.scrollHeight - editor.clientHeight);
            preview.scrollTop = scrollPct * (preview.scrollHeight - preview.clientHeight);
            setTimeout(() => { _syncScrollLock = false; }, 30);
        });
    });

    preview.addEventListener('scroll', () => {
        if (!STATE.syncScroll || _syncScrollLock) return;
        _syncScrollLock = true;
        cancelAnimationFrame(_syncScrollRAF);
        _syncScrollRAF = requestAnimationFrame(() => {
            const scrollPct = preview.scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight);
            editor.scrollTop = scrollPct * (editor.scrollHeight - editor.clientHeight);
            setTimeout(() => { _syncScrollLock = false; }, 30);
        });
    });

    // ── Scroll sync helpers (source-line based) ──
    function getCursorLineNumber() {
        const textBefore = editor.value.substring(0, editor.selectionStart);
        return textBefore.split('\n').length - 1;
    }

    function findPreviewElementForLine(line) {
        const tagged = DOM.previewContent.querySelectorAll('[data-source-line]');
        if (tagged.length === 0) return null;
        let best = null;
        let bestDist = Infinity;
        for (const el of tagged) {
            const srcLine = parseInt(el.getAttribute('data-source-line'), 10);
            const dist = Math.abs(srcLine - line);
            if (srcLine <= line && dist < bestDist) { best = el; bestDist = dist; }
        }
        if (!best) {
            for (const el of tagged) {
                const srcLine = parseInt(el.getAttribute('data-source-line'), 10);
                const dist = Math.abs(srcLine - line);
                if (dist < bestDist) { best = el; bestDist = dist; }
            }
        }
        return best;
    }

    function syncPreviewScrollToEditor() {
        if (!STATE.syncScroll) return;
        const cursorLine = getCursorLineNumber();
        const targetEl = findPreviewElementForLine(cursorLine);
        if (!targetEl) return;
        _syncScrollLock = true;
        cancelAnimationFrame(_syncScrollRAF);
        _syncScrollRAF = requestAnimationFrame(() => {
            const previewRect = preview.getBoundingClientRect();
            const elRect = targetEl.getBoundingClientRect();
            const offsetInPreview = elRect.top - previewRect.top + preview.scrollTop;
            preview.scrollTop = Math.max(0, offsetInPreview - previewRect.height * 0.3);
            setTimeout(() => { _syncScrollLock = false; }, 60);
        });
    }

    function syncEditorScrollToPreview(e) {
        if (!STATE.syncScroll) return;
        let target = e.target;
        while (target && target !== DOM.previewContent) {
            if (target.hasAttribute && target.hasAttribute('data-source-line')) break;
            target = target.parentElement;
        }
        if (!target || !target.hasAttribute || !target.hasAttribute('data-source-line')) {
            const rect = preview.getBoundingClientRect();
            const clickY = e.clientY - rect.top + preview.scrollTop;
            const tagged = DOM.previewContent.querySelectorAll('[data-source-line]');
            let best = null, bestDist = Infinity;
            for (const el of tagged) {
                const dist = Math.abs(el.offsetTop - clickY);
                if (dist < bestDist) { best = el; bestDist = dist; }
            }
            target = best;
        }
        if (!target || !target.getAttribute) return;
        const sourceLine = parseInt(target.getAttribute('data-source-line'), 10);
        if (isNaN(sourceLine)) return;
        _syncScrollLock = true;
        cancelAnimationFrame(_syncScrollRAF);
        _syncScrollRAF = requestAnimationFrame(() => {
            const lines = editor.value.split('\n');
            const lineH = editor.scrollHeight / Math.max(1, lines.length);
            editor.scrollTop = Math.max(0, sourceLine * lineH - editor.clientHeight * 0.3);
            setTimeout(() => { _syncScrollLock = false; }, 60);
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    //  BIDIRECTIONAL SELECTION MIRRORING
    //  Select text in one panel → highlight same text in the other.
    //  Highlights persist until user clicks elsewhere or presses Escape.
    // ═══════════════════════════════════════════════════════════════════

    // --- Clear all <mark class="sync-selection"> from preview ---
    function clearPreviewHighlights() {
        const marks = DOM.previewContent.querySelectorAll('mark.sync-selection');
        marks.forEach(mark => {
            const parent = mark.parentNode;
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
            parent.normalize();
        });
    }

    // --- Strip markdown syntax for plain-text matching ---
    function stripMarkdown(text) {
        return text
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/\*\*/g, '').replace(/\*/g, '')
            .replace(/~~/g, '').replace(/`/g, '')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/^\s*[-*+]\s+/gm, '')
            .replace(/^\s*\d+\.\s+/gm, '')
            .replace(/^\s*>\s*/gm, '');
    }

    // --- Find and highlight text inside preview DOM ---
    function highlightTextInPreview(searchText) {
        if (!searchText || searchText.length < 1) return false;

        const walker = document.createTreeWalker(
            DOM.previewContent, NodeFilter.SHOW_TEXT, null
        );
        const matchRanges = [];
        const searchLower = searchText.toLowerCase();
        let node;

        // Single-node matches
        while ((node = walker.nextNode())) {
            const nodeLower = node.textContent.toLowerCase();
            let startIdx = nodeLower.indexOf(searchLower);
            while (startIdx !== -1) {
                const range = document.createRange();
                range.setStart(node, startIdx);
                range.setEnd(node, startIdx + searchText.length);
                matchRanges.push(range);
                startIdx = nodeLower.indexOf(searchLower, startIdx + 1);
            }
        }

        // Cross-node match fallback
        if (matchRanges.length === 0) {
            const fullText = (DOM.previewContent.textContent || '').toLowerCase();
            const idx = fullText.indexOf(searchLower);
            if (idx >= 0) {
                const walker2 = document.createTreeWalker(
                    DOM.previewContent, NodeFilter.SHOW_TEXT, null
                );
                let charCount = 0, startNode = null, startOff = 0, endNode = null, endOff = 0, n;
                while ((n = walker2.nextNode())) {
                    const len = n.textContent.length;
                    if (!startNode && charCount + len > idx) {
                        startNode = n; startOff = idx - charCount;
                    }
                    if (charCount + len >= idx + searchText.length) {
                        endNode = n; endOff = idx + searchText.length - charCount;
                        break;
                    }
                    charCount += len;
                }
                if (startNode && endNode) {
                    try {
                        const range = document.createRange();
                        range.setStart(startNode, startOff);
                        range.setEnd(endNode, endOff);
                        matchRanges.push(range);
                    } catch (e) { /* skip */ }
                }
            }
        }

        // Wrap matches with <mark class="sync-selection"> (reverse order)
        for (let i = matchRanges.length - 1; i >= 0; i--) {
            try {
                const mark = document.createElement('mark');
                mark.className = 'sync-selection';
                matchRanges[i].surroundContents(mark);
            } catch (e) {
                try {
                    const mark = document.createElement('mark');
                    mark.className = 'sync-selection';
                    const frag = matchRanges[i].extractContents();
                    mark.appendChild(frag);
                    matchRanges[i].insertNode(mark);
                } catch (e2) { /* skip */ }
            }
        }
        return matchRanges.length > 0;
    }

    // --- Find text in editor and set selection range ---
    function selectTextInEditor(searchText) {
        if (!searchText || searchText.length < 1) return;
        const val = editor.value;
        let idx = val.indexOf(searchText);
        if (idx === -1) idx = val.toLowerCase().indexOf(searchText.toLowerCase());

        // Fallback: search stripped lines
        if (idx === -1) {
            const lines = val.split('\n');
            const searchLower = searchText.toLowerCase();
            let charPos = 0;
            for (let i = 0; i < lines.length; i++) {
                const stripped = stripMarkdown(lines[i]).toLowerCase();
                const mIdx = stripped.indexOf(searchLower);
                if (mIdx !== -1) {
                    const origIdx = lines[i].toLowerCase().indexOf(
                        searchLower.substring(0, Math.min(searchLower.length, 15))
                    );
                    idx = charPos + (origIdx !== -1 ? origIdx : mIdx);
                    break;
                }
                charPos += lines[i].length + 1;
            }
        }

        if (idx !== -1) {
            editor.setSelectionRange(idx, idx + searchText.length);
            // Scroll to selection
            const lineNum = val.substring(0, idx).split('\n').length - 1;
            const lines = val.split('\n');
            const lineH = editor.scrollHeight / Math.max(1, lines.length);
            editor.scrollTop = Math.max(0, lineNum * lineH - editor.clientHeight * 0.3);
        }
    }

    // --- Editor → Preview: mirror text selection ---
    let _selMirrorTimer = null;

    function onEditorSelection() {
        if (!STATE.syncScroll) return;
        clearTimeout(_selMirrorTimer);
        _selMirrorTimer = setTimeout(() => {
            clearPreviewHighlights();

            const selStart = editor.selectionStart;
            const selEnd = editor.selectionEnd;

            if (selStart === selEnd) {
                // No selection, just scroll-sync
                syncPreviewScrollToEditor();
                return;
            }

            const selectedText = editor.value.substring(selStart, selEnd);
            if (!selectedText.trim()) return;

            // Strip markdown syntax and search in preview
            const plainText = stripMarkdown(selectedText).trim();
            if (!plainText) return;

            highlightTextInPreview(plainText);
            syncPreviewScrollToEditor();
        }, 80);
    }

    editor.addEventListener('mouseup', onEditorSelection);
    editor.addEventListener('keyup', (e) => {
        if (e.shiftKey || ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
            'Home','End','PageUp','PageDown'].includes(e.key)) {
            onEditorSelection();
        }
    });
    editor.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            setTimeout(onEditorSelection, 50);
        }
    });

    // --- Preview → Editor: mirror text selection ---
    function onPreviewSelection() {
        if (!STATE.syncScroll) return;
        clearTimeout(_selMirrorTimer);
        _selMirrorTimer = setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

            const range = sel.getRangeAt(0);
            if (!DOM.previewContent.contains(range.commonAncestorContainer)) return;

            const selectedText = sel.toString().trim();
            if (!selectedText) return;

            selectTextInEditor(selectedText);
        }, 80);
    }

    preview.addEventListener('mouseup', onPreviewSelection);

    // --- Clear highlights on plain click / Escape ---
    editor.addEventListener('mousedown', () => {
        setTimeout(() => {
            if (editor.selectionStart === editor.selectionEnd) {
                clearPreviewHighlights();
            }
        }, 10);
    });

    preview.addEventListener('mousedown', () => {
        clearPreviewHighlights();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            clearPreviewHighlights();
            if (document.activeElement === editor) {
                const pos = editor.selectionEnd;
                editor.setSelectionRange(pos, pos);
            }
        }
    });

    // --- Preview click scroll-sync (only when no text selected) ---
    preview.addEventListener('click', (e) => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
            syncEditorScrollToPreview(e);
        }
    });
}




function debouncePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 200);
}

// ─── UPDATE PREVIEW ──────────────────────────────────────────────────────────
function updatePreview() {
    const md = STATE.markdown.trim();
    if (!md) {
        DOM.previewContent.innerHTML = '<p class="empty-preview">Your converted document will appear here...</p>';
        return;
    }
    try {
        // 1. Protect math blocks from marked.js mangling
        const protected_md = protectMath(md);
        // 2. Parse markdown (math is safe as placeholders)
        let html = marked.parse(protected_md);
        
        // Sanitize parsed HTML to prevent XSS (protects against malicious markdown)
        if (typeof DOMPurify !== 'undefined') {
            html = DOMPurify.sanitize(html);
        }
        
        // 3. Restore math: replace placeholders with KaTeX-rendered output
        html = restoreMath(html);
        DOM.previewContent.innerHTML = html;
        // Syntax highlighting
        if (typeof hljs !== 'undefined') {
            DOM.previewContent.querySelectorAll('pre code').forEach(block => {
                hljs.highlightElement(block);
            });
        }
        // 4. Tag preview elements with source line numbers for sync-scroll
        _tagPreviewWithSourceLines();
    } catch (e) {
        DOM.previewContent.innerHTML = `<p style="color:red">Parse error: ${e.message}</p>`;
    }
}

// ─── SOURCE-LINE TAGGING ─────────────────────────────────────────────────────
// After rendering, tag each top-level block element in the preview with
// data-source-line so the sync scroll can map clicks precisely.
function _tagPreviewWithSourceLines() {
    const mdText = STATE.markdown;
    if (!mdText) return;

    const mdLines = mdText.split('\n');
    const children = DOM.previewContent.children;

    // Build an array of { lineIndex, text } for non-blank markdown lines
    // to match against rendered blocks.
    let nextSearchLine = 0;

    for (let i = 0; i < children.length; i++) {
        const el = children[i];
        // Get the first few words of the rendered element's text
        const elText = (el.textContent || '').trim();
        if (!elText) continue;

        // Extract a short snippet to search for in the source
        const snippet = elText.substring(0, 60).replace(/\s+/g, ' ').trim();
        if (!snippet) continue;

        // Search forward from nextSearchLine for a line containing this snippet
        let found = -1;
        for (let j = nextSearchLine; j < mdLines.length; j++) {
            // Strip markdown syntax characters for comparison
            const rawLine = mdLines[j]
                .replace(/^#{1,6}\s+/, '')  // headings
                .replace(/^\s*[-*+]\s+/, '') // list items
                .replace(/^\s*\d+\.\s+/, '') // ordered list
                .replace(/^\s*>\s*/, '')     // blockquote
                .replace(/\*\*/g, '')        // bold
                .replace(/\*/g, '')          // italic
                .replace(/~~/g, '')          // strikethrough
                .replace(/`/g, '')           // inline code
                .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links
                .trim();

            if (!rawLine) continue;

            // Check if the snippet starts with the raw line or vice versa
            const snippetLower = snippet.toLowerCase();
            const rawLower = rawLine.toLowerCase();
            if (snippetLower.startsWith(rawLower.substring(0, 30)) ||
                rawLower.startsWith(snippetLower.substring(0, 30))) {
                found = j;
                nextSearchLine = j + 1;
                break;
            }
        }

        if (found >= 0) {
            el.setAttribute('data-source-line', found);
        }
    }
}

// ─── SIZE CALCULATIONS ───────────────────────────────────────────────────────
function getElementSizes() {
    const s = STATE.settings;
    if (s.sizeMode === 'relative') {
        const base = s.baseSize;
        return {
            h1: +(base * SIZE_RATIOS.h1).toFixed(1),
            h2: +(base * SIZE_RATIOS.h2).toFixed(1),
            h3: +(base * SIZE_RATIOS.h3).toFixed(1),
            h4: +(base * SIZE_RATIOS.h4).toFixed(1),
            body: +(base * SIZE_RATIOS.body).toFixed(1),
            code: +(base * SIZE_RATIOS.code).toFixed(1),
        };
    } else {
        return { ...s.fixedSizes };
    }
}

function updateSizeDisplays() {
    const sz = getElementSizes();
    DOM.h1SizeDisplay.textContent = sz.h1;
    DOM.h2SizeDisplay.textContent = sz.h2;
    DOM.h3SizeDisplay.textContent = sz.h3;
    DOM.h4SizeDisplay.textContent = sz.h4;
    DOM.bodySizeDisplay.textContent = sz.body;
    DOM.codeSizeDisplay.textContent = sz.code;
}

// ─── APPLY PREVIEW STYLES ────────────────────────────────────────────────────
function applyPreviewStyles() {
    const s = STATE.settings;
    const sz = getElementSizes();
    const m = s.margins;
    const paper = PAPER_SIZES[s.paperSize] || PAPER_SIZES.A4;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // Px per mm at 96dpi
    const pxPerMm = 96 / 25.4;

    let paperW = paper.w;
    let paperH = paper.h;
    if (s.orientation === 'landscape') { [paperW, paperH] = [paperH, paperW]; }

    const paperWpx = paperW * pxPerMm;

    // Paper preview dimensions
    DOM.paperPreview.style.width = `${paperWpx}px`;
    DOM.paperPreview.style.minHeight = `${paperH * pxPerMm}px`;
    DOM.paperPreview.style.background = s.bgColor;
    DOM.paperPreview.style.color = s.textColor;

    // Build inline CSS for preview content
    const hGap = s.zeroSpace ? 0 : s.headingGap;
    const pGap = s.zeroSpace ? 0 : s.paraGap;
    const lGap = s.zeroSpace ? 0 : s.listGap;

    // pt to px: 1pt = 1.333px
    const ptToPx = pt => `${(pt * 1.3333).toFixed(2)}px`;

    DOM.previewContent.style.cssText = `
        padding: ${m.top * 10}mm ${m.right * 10}mm ${m.bot * 10}mm ${m.left * 10}mm;
        font-family: ${s.fontFamily};
        font-size: ${ptToPx(sz.body)};
        line-height: ${s.lineHeight};
        color: ${s.textColor};
        background: ${s.bgColor};
        column-count: ${s.columns > 1 ? s.columns : 'auto'};
        column-gap: ${s.columns > 1 ? '8mm' : 'normal'};
    `;

    // Inject dynamic style tag
    let styleTag = document.getElementById('dynamicStyle');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamicStyle';
        document.head.appendChild(styleTag);
    }

    styleTag.textContent = `
        #previewContent h1 {
            font-size: ${ptToPx(sz.h1)};
            margin-top: ${hGap}px;
            margin-bottom: ${hGap}px;
            line-height: ${s.lineHeight};
            font-family: ${s.fontFamily};
            color: ${s.textColor};
        }
        #previewContent h2 {
            font-size: ${ptToPx(sz.h2)};
            margin-top: ${hGap}px;
            margin-bottom: ${hGap}px;
            line-height: ${s.lineHeight};
            font-family: ${s.fontFamily};
            color: ${s.textColor};
        }
        #previewContent h3 {
            font-size: ${ptToPx(sz.h3)};
            margin-top: ${hGap}px;
            margin-bottom: ${hGap}px;
            line-height: ${s.lineHeight};
            font-family: ${s.fontFamily};
            color: ${s.textColor};
        }
        #previewContent h4 {
            font-size: ${ptToPx(sz.h4)};
            margin-top: ${hGap}px;
            margin-bottom: ${hGap}px;
            line-height: ${s.lineHeight};
            font-family: ${s.fontFamily};
            color: ${s.textColor};
        }
        #previewContent h5, #previewContent h6 {
            font-size: ${ptToPx(sz.body)};
            margin-top: ${hGap}px;
            margin-bottom: ${hGap}px;
            line-height: ${s.lineHeight};
            font-family: ${s.fontFamily};
            color: ${s.textColor};
        }
        #previewContent p {
            margin-top: ${pGap}px;
            margin-bottom: ${pGap}px;
            line-height: ${s.lineHeight};
            font-size: ${ptToPx(sz.body)};
        }
        #previewContent ul, #previewContent ol {
            margin-top: ${lGap}px;
            margin-bottom: ${lGap}px;
            padding-left: 1.6em;
        }
        #previewContent li {
            margin-top: ${lGap}px;
            margin-bottom: ${lGap}px;
            line-height: ${s.lineHeight};
            font-size: ${ptToPx(sz.body)};
        }
        #previewContent code {
            font-size: ${ptToPx(sz.code)};
            font-family: 'Courier New', monospace;
            background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'};
            color: ${s.textColor};
            padding: 1px 3px;
            border-radius: 2px;
        }
        #previewContent pre {
            font-size: ${ptToPx(sz.code)};
            font-family: 'Courier New', monospace;
            background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
            color: ${s.textColor};
            padding: ${pGap + 4}px 8px;
            margin: ${pGap}px 0;
            border-radius: 3px;
            overflow-x: auto;
            line-height: ${s.lineHeight};
        }
        #previewContent pre code {
            background: none;
            padding: 0;
            color: inherit;
        }
        #previewContent blockquote {
            margin: ${pGap}px 0;
            padding: ${pGap}px 10px;
            border-left: 3px solid ${s.textColor}55;
            color: ${s.textColor}99;
            font-size: ${ptToPx(sz.body)};
        }
        #previewContent a {
            color: ${s.linkColor};
        }
        #previewContent table {
            border-collapse: collapse;
            width: 100%;
            margin: ${pGap}px 0;
            font-size: ${ptToPx(sz.body)};
        }
        #previewContent th, #previewContent td {
            border: 1px solid ${s.textColor}33;
            padding: 3px 6px;
            text-align: left;
        }
        #previewContent th {
            background: ${s.textColor}11;
            font-weight: 700;
        }
        #previewContent hr {
            border: none;
            border-top: 1px solid ${s.textColor}33;
            margin: ${pGap * 2}px 0;
        }
        #previewContent img {
            max-width: 100%;
        }
        #previewContent strong {
            font-weight: 700;
        }
        #previewContent em {
            font-style: italic;
        }
    `;

    updateSizeDisplays();
}

// ─── UPDATE PAPER SIZE ───────────────────────────────────────────────────────
function updatePaperSize() {
    applyPreviewStyles();
}

// ─── RESET SETTINGS ──────────────────────────────────────────────────────────
function resetSettings() {
    STATE.settings = {
        fontFamily: 'Helvetica, Arial, sans-serif',
        bgColor: '#ffffff', textColor: '#000000', linkColor: '#0000EE',
        sizeMode: 'relative', baseSize: 10, lineHeight: 1.0,
        headingGap: 2, paraGap: 2, listGap: 1, zeroSpace: true,
        columns: 1, paperSize: 'A4', orientation: 'portrait',
        margins: { top: 1, bot: 1, left: 1, right: 1 },
        fixedSizes: { h1: 20, h2: 17, h3: 14, h4: 12, body: 10, code: 9 }
    };

    DOM.fontFamily.value = STATE.settings.fontFamily;
    DOM.bgColor.value = STATE.settings.bgColor;
    DOM.bgColorHex.textContent = STATE.settings.bgColor;
    DOM.textColor.value = STATE.settings.textColor;
    DOM.textColorHex.textContent = STATE.settings.textColor;
    DOM.linkColor.value = STATE.settings.linkColor;
    DOM.linkColorHex.textContent = STATE.settings.linkColor;
    DOM.sizeMode.value = STATE.settings.sizeMode;
    DOM.baseSize.value = STATE.settings.baseSize;
    DOM.lineHeight.value = STATE.settings.lineHeight;
    DOM.headingGap.value = STATE.settings.headingGap;
    DOM.paraGap.value = STATE.settings.paraGap;
    DOM.listGap.value = STATE.settings.listGap;
    DOM.zeroSpace.checked = STATE.settings.zeroSpace;
    DOM.columns.value = STATE.settings.columns;
    DOM.paperSize.value = STATE.settings.paperSize;
    DOM.orientPortrait.checked = true;
    DOM.marginTop.value = STATE.settings.margins.top;
    DOM.marginBot.value = STATE.settings.margins.bot;
    DOM.marginLeft.value = STATE.settings.margins.left;
    DOM.marginRight.value = STATE.settings.margins.right;

    DOM.fontSizeRelative.style.display = '';
    DOM.fontSizeFixed.style.display = 'none';

    // Re-apply theme-appropriate document colors
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    applyThemeDocColors(currentTheme);

    applyPreviewStyles();
    showToast('Settings reset!');
}

// ─── BUILD PRINT HTML ────────────────────────────────────────────────────────
function buildPrintHTML() {
    const s = STATE.settings;
    const sz = getElementSizes();
    const m = s.margins;
    const paper = PAPER_SIZES[s.paperSize] || PAPER_SIZES.A4;

    let paperW = paper.w;
    let paperH = paper.h;
    if (s.orientation === 'landscape') { [paperW, paperH] = [paperH, paperW]; }

    const hGap = s.zeroSpace ? 0 : s.headingGap;
    const pGap = s.zeroSpace ? 0 : s.paraGap;
    const lGap = s.zeroSpace ? 0 : s.listGap;

    const protectedMd = protectMath(STATE.markdown || '');
    let htmlContent = marked.parse(protectedMd);
    if (typeof DOMPurify !== 'undefined') {
        htmlContent = DOMPurify.sanitize(htmlContent);
    }
    const renderedContent = restoreMath(htmlContent);

    // Collect KaTeX CSS for self-contained export
    let katexCSS = '';
    try {
        for (const sheet of document.styleSheets) {
            if (sheet.href && sheet.href.includes('katex')) {
                katexCSS = `<link rel="stylesheet" href="${sheet.href}">`;
                break;
            }
        }
    } catch (e) { /* ignore cross-origin errors */ }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Document</title>
${katexCSS}
<style>
@page {
    size: ${paperW}mm ${paperH}mm;
    margin: ${m.top}cm ${m.right}cm ${m.bot}cm ${m.left}cm;
}
* { box-sizing: border-box; }
body {
    margin: 0;
    padding: 0;
    font-family: ${s.fontFamily};
    font-size: ${sz.body}pt;
    line-height: ${s.lineHeight};
    color: ${s.textColor};
    background: ${s.bgColor};
}
h1, h2, h3, h4, h5, h6, p, ul, ol, blockquote, table, hr { break-inside: avoid; }
${s.columns > 1 ? `.col-wrap { column-count: ${s.columns}; column-gap: 8mm; } .col-wrap > * { break-inside: avoid; }` : ''}
h1 {
    font-size: ${sz.h1}pt;
    margin: ${hGap}px 0;
    line-height: ${s.lineHeight};
    font-weight: 700;
}
h2 {
    font-size: ${sz.h2}pt;
    margin: ${hGap}px 0;
    line-height: ${s.lineHeight};
    font-weight: 700;
}
h3 {
    font-size: ${sz.h3}pt;
    margin: ${hGap}px 0;
    line-height: ${s.lineHeight};
    font-weight: 700;
}
h4 {
    font-size: ${sz.h4}pt;
    margin: ${hGap}px 0;
    line-height: ${s.lineHeight};
    font-weight: 700;
}
h5, h6 {
    font-size: ${sz.body}pt;
    margin: ${hGap}px 0;
    line-height: ${s.lineHeight};
    font-weight: 700;
}
p {
    margin: ${pGap}px 0;
    line-height: ${s.lineHeight};
    font-size: ${sz.body}pt;
}
ul, ol {
    margin: ${lGap}px 0;
    padding-left: 1.5em;
}
li {
    margin: ${lGap}px 0;
    line-height: ${s.lineHeight};
    font-size: ${sz.body}pt;
}
code {
    font-size: ${sz.code}pt;
    font-family: 'Courier New', monospace;
    background: rgba(0,0,0,0.07);
    padding: 1px 3px;
}
pre {
    font-size: ${sz.code}pt;
    font-family: 'Courier New', monospace;
    background: rgba(0,0,0,0.07);
    padding: ${pGap + 4}px 8px;
    margin: ${pGap}px 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: ${s.lineHeight};
}
pre code { background: none; padding: 0; }
blockquote {
    margin: ${pGap}px 0;
    padding: ${pGap}px 10px;
    border-left: 3px solid ${s.textColor}55;
    color: ${s.textColor}99;
}
a { color: ${s.linkColor}; }
table {
    border-collapse: collapse;
    width: 100%;
    margin: ${pGap}px 0;
    font-size: ${sz.body}pt;
}
th, td {
    border: 1px solid ${s.textColor}33;
    padding: 3px 6px;
    text-align: left;
}
th {
    background: ${s.textColor}11;
    font-weight: 700;
}
hr {
    border: none;
    border-top: 1px solid ${s.textColor}33;
    margin: ${pGap * 2}px 0;
}
img { max-width: 100%; }
strong { font-weight: 700; }
em { font-style: italic; }
</style>
</head>
<body>${s.columns > 1 ? `<div class="col-wrap">${renderedContent}</div>` : renderedContent}</body>
</html>`;
}

// ─── GET DYNAMIC FILENAME ────────────────────────────────────────────────────
function getExportFilename(extension) {
    const match = STATE.markdown.match(/^#\s+(.+)$/m);
    if (match && match[1]) {
        let name = match[1].trim().replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
        if (name.length > 50) name = name.substring(0, 50);
        return name + '.' + extension;
    }
    return 'document.' + extension;
}

// ─── DOWNLOAD HANDLER ────────────────────────────────────────────────────────
async function handleDownload() {
    if (!STATE.markdown.trim()) {
        showToast('Please enter some Markdown first!', 'warning');
        return;
    }

    switch (STATE.format) {
        case 'pdf': await downloadPDF(); break;
        case 'doc': downloadDOC(); break;
        case 'html': downloadHTML(); break;
    }
}

// ─── PDF DOWNLOAD ─────────────────────────────────────────────────────────────
async function downloadPDF() {
    showProgress('Generating PDF...', 10);

    let iframe = null;

    try {
        if (!STATE.markdown.trim()) {
            hideProgress();
            showToast('No content to export!', 'warning');
            return;
        }

        const s = STATE.settings;
        const sz = getElementSizes();
        const m = s.margins;
        const paper = PAPER_SIZES[s.paperSize] || PAPER_SIZES.A4;

        let paperW = paper.w, paperH = paper.h;
        if (s.orientation === 'landscape') { [paperW, paperH] = [paperH, paperW]; }

        const MM_TO_PX = 96 / 25.4;
        const SCALE = 2;

        const marginLpx = m.left * 10 * MM_TO_PX;
        const marginRpx = m.right * 10 * MM_TO_PX;
        const marginTpx = m.top * 10 * MM_TO_PX;
        const marginBpx = m.bot * 10 * MM_TO_PX;
        const contentWpx = Math.floor((paperW * MM_TO_PX) - marginLpx - marginRpx);
        const pageHpx = Math.floor(paperH * MM_TO_PX);
        const availableHpx = Math.floor(pageHpx - marginTpx - marginBpx);

        const hGap = s.zeroSpace ? 0 : s.headingGap;
        const pGap = s.zeroSpace ? 0 : s.paraGap;
        const lGap = s.zeroSpace ? 0 : s.listGap;

        updateProgress(15, 'Building render layer...');

        // ── STEP 1: Render markdown to HTML with math ──
        const protectedMd = protectMath(STATE.markdown);
        let htmlContent = marked.parse(protectedMd);
        if (typeof DOMPurify !== 'undefined') {
            htmlContent = DOMPurify.sanitize(htmlContent);
        }
        const renderedHTML = restoreMath(htmlContent);

        // ── STEP 2: Build complete HTML for the iframe ──
        // Collect all KaTeX inline styles (the rendered spans use inline styles)
        let katexCSSLink = '';
        try {
            for (const sheet of document.styleSheets) {
                if (sheet.href && sheet.href.includes('katex')) {
                    katexCSSLink = `<link rel="stylesheet" href="${sheet.href}">`;
                    break;
                }
            }
        } catch (e) { /* ignore */ }

        const iframeHTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
${katexCSSLink}
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    width: ${contentWpx}px;
    background: ${s.bgColor};
    color: ${s.textColor};
    font-family: ${s.fontFamily};
    font-size: ${(sz.body * 1.3333).toFixed(2)}px;
    line-height: ${s.lineHeight};
    overflow: visible;
}
h1 { font-size: ${(sz.h1 * 1.3333).toFixed(2)}px; font-weight: 700; margin: ${hGap}px 0; line-height: ${s.lineHeight}; color: ${s.textColor}; }
h2 { font-size: ${(sz.h2 * 1.3333).toFixed(2)}px; font-weight: 700; margin: ${hGap}px 0; line-height: ${s.lineHeight}; color: ${s.textColor}; }
h3 { font-size: ${(sz.h3 * 1.3333).toFixed(2)}px; font-weight: 700; margin: ${hGap}px 0; line-height: ${s.lineHeight}; color: ${s.textColor}; }
h4 { font-size: ${(sz.h4 * 1.3333).toFixed(2)}px; font-weight: 700; margin: ${hGap}px 0; line-height: ${s.lineHeight}; color: ${s.textColor}; }
h5, h6 { font-size: ${(sz.body * 1.3333).toFixed(2)}px; font-weight: 700; margin: ${hGap}px 0; line-height: ${s.lineHeight}; color: ${s.textColor}; }
p { margin: ${pGap}px 0; line-height: ${s.lineHeight}; font-size: ${(sz.body * 1.3333).toFixed(2)}px; }
ul, ol { margin: ${lGap}px 0; padding-left: 1.5em; }
li { margin: ${lGap}px 0; line-height: ${s.lineHeight}; font-size: ${(sz.body * 1.3333).toFixed(2)}px; }
code { font-size: ${(sz.code * 1.3333).toFixed(2)}px; font-family: 'Courier New', monospace; background: rgba(0,0,0,0.07); padding: 1px 3px; }
pre { font-size: ${(sz.code * 1.3333).toFixed(2)}px; font-family: 'Courier New', monospace; background: rgba(0,0,0,0.07); padding: ${pGap + 4}px 8px; margin: ${pGap}px 0; white-space: pre-wrap; word-wrap: break-word; line-height: ${s.lineHeight}; }
pre code { background: none; padding: 0; }
blockquote { margin: ${pGap}px 0; padding: ${pGap}px 10px; border-left: 3px solid ${s.textColor}55; color: ${s.textColor}99; }
a { color: ${s.linkColor}; }
table { border-collapse: collapse; width: 100%; margin: ${pGap}px 0; font-size: ${(sz.body * 1.3333).toFixed(2)}px; }
th, td { border: 1px solid ${s.textColor}33; padding: 3px 6px; text-align: left; }
th { background: ${s.textColor}11; font-weight: 700; }
hr { border: none; border-top: 1px solid ${s.textColor}33; margin: ${pGap * 2}px 0; }
img { max-width: 100%; }
strong { font-weight: 700; }
em { font-style: italic; }
h1, h2, h3, h4, h5, h6, p, ul, ol, blockquote, table, hr { break-inside: avoid; }
${s.columns > 1 ? `.col-wrap { column-count: ${s.columns}; column-gap: 8mm; } .col-wrap > * { break-inside: avoid; }` : ''}
</style>
</head>
<body>${s.columns > 1 ? `<div class="col-wrap">${renderedHTML}</div>` : renderedHTML}</body>
</html>`;

        // ── STEP 3: Create iframe and write content ──
        iframe = document.createElement('iframe');
        iframe.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            width: ${contentWpx}px;
            height: ${pageHpx}px;
            border: none;
            z-index: -9999;
            opacity: 0;
            pointer-events: none;
        `;
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(iframeHTML);
        iframeDoc.close();

        // ── STEP 4: Wait for iframe content + fonts to load ──
        await new Promise(r => setTimeout(r, 800));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        // Wait for fonts inside iframe
        try {
            if (iframe.contentDocument.fonts && iframe.contentDocument.fonts.ready) {
                await iframe.contentDocument.fonts.ready;
            }
        } catch (e) { /* ignore */ }
        await new Promise(r => setTimeout(r, 300));

        updateProgress(20, 'Measuring content...');

        const iframeBody = iframeDoc.body;
        // Resize iframe to full content height
        const totalH = iframeBody.scrollHeight;
        iframe.style.height = totalH + 'px';

        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        await new Promise(r => setTimeout(r, 200));

        // ── STEP 4b: Find safe page break points between elements ──
        // Walk all block-level children and find Y positions that don't cut through elements
        const contentRoot = s.columns > 1 ? iframeBody.querySelector('.col-wrap') || iframeBody : iframeBody;
        const blockChildren = Array.from(contentRoot.children);

        // Elements that must NOT be split across pages
        const ATOMIC_TAGS = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'TABLE', 'HR'];

        // Collect the bottom edge of every block child (recursively for nested)
        function collectBlockEdges(parent) {
            const edges = [];
            const children = Array.from(parent.children);
            for (const child of children) {
                const rect = child.getBoundingClientRect();
                const bodyRect = iframeBody.getBoundingClientRect();
                const top = Math.round(rect.top - bodyRect.top);
                const bottom = Math.round(rect.bottom - bodyRect.top);
                edges.push({ top, bottom, tag: child.tagName });

                // For PRE (code blocks): collect line-level edges so they CAN be split
                if (child.tagName === 'PRE') {
                    // Try to get edges from child CODE element's text lines
                    const codeEl = child.querySelector('code') || child;
                    const lineHeight = parseFloat(getComputedStyle(codeEl).lineHeight) || 16;
                    const prePadTop = parseFloat(getComputedStyle(child).paddingTop) || 0;
                    const prePadBot = parseFloat(getComputedStyle(child).paddingBottom) || 0;
                    const innerTop = top + prePadTop;
                    const innerBot = bottom - prePadBot;
                    // Generate break points at each line within the code block
                    for (let y = innerTop + lineHeight; y < innerBot; y += lineHeight) {
                        edges.push({ top: Math.round(y - lineHeight), bottom: Math.round(y), tag: '_CODE_LINE' });
                    }
                }
                // For non-atomic elements (not text, not code, not table): recurse into children
                else if (child.children.length > 0 && !ATOMIC_TAGS.includes(child.tagName) && child.tagName !== 'CODE') {
                    edges.push(...collectBlockEdges(child));
                }
            }
            return edges;
        }

        const allEdges = collectBlockEdges(contentRoot);
        // Sort by bottom position and deduplicate
        allEdges.sort((a, b) => a.bottom - b.bottom);

        // Compute safe break points: for each page boundary, find the nearest
        // element boundary that fits within the page
        const breakYs = [0]; // pixel positions where each page starts
        let nextPageEnd = availableHpx;

        while (nextPageEnd < totalH) {
            // Find the last element whose bottom fits within this page
            let bestBreak = nextPageEnd; // fallback: cut at exact boundary
            for (let i = allEdges.length - 1; i >= 0; i--) {
                const edge = allEdges[i];
                if (edge.bottom <= nextPageEnd && edge.bottom > breakYs[breakYs.length - 1]) {
                    bestBreak = edge.bottom;
                    break;
                }
            }
            // Safety: if bestBreak hasn't moved (no element boundary found), use a line-height snap
            if (bestBreak <= breakYs[breakYs.length - 1]) {
                bestBreak = nextPageEnd; // force progress to avoid infinite loop
            }
            breakYs.push(bestBreak);
            nextPageEnd = bestBreak + availableHpx;
        }

        const smartTotalPages = breakYs.length;

        updateProgress(25, `Rendering ${smartTotalPages} page(s)...`);

        // ── STEP 5: Capture full content as ONE canvas using html2canvas ──
        const fullCanvas = await html2canvas(iframeBody, {
            scale: SCALE,
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: s.bgColor || '#ffffff',
            width: contentWpx,
            height: totalH,
            windowWidth: contentWpx,
            windowHeight: totalH,
            foreignObjectRendering: false,
        });

        updateProgress(60, 'Slicing pages...');

        // ── STEP 6: Remove iframe ──
        document.body.removeChild(iframe);
        iframe = null;

        // ── STEP 7: Create PDF ──
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: s.orientation === 'landscape' ? 'l' : 'p',
            unit: 'mm',
            format: [paperW, paperH],
            compress: true,
        });

        const pdfX = m.left * 10;
        const pdfY = m.top * 10;
        const pdfContentW = paperW - (m.left * 10) - (m.right * 10);
        const pdfContentH = paperH - (m.top * 10) - (m.bot * 10);

        const canvasPageH = Math.round(availableHpx * SCALE);

        // ── STEP 8: Slice canvas at smart break points ──
        for (let page = 0; page < smartTotalPages; page++) {
            if (page > 0) pdf.addPage([paperW, paperH]);

            updateProgress(
                60 + Math.round((page / smartTotalPages) * 35),
                `Page ${page + 1} / ${smartTotalPages}`
            );

            const sliceStartPx = breakYs[page];
            const sliceEndPx = (page + 1 < breakYs.length) ? breakYs[page + 1] : totalH;
            const sliceHpx = sliceEndPx - sliceStartPx;
            if (sliceHpx <= 0) break;

            // Convert to canvas coordinates (scaled)
            const srcY = Math.round(sliceStartPx * SCALE);
            const srcH = Math.min(Math.round(sliceHpx * SCALE), fullCanvas.height - srcY);
            if (srcH <= 0) break;

            // Create page slice canvas
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = fullCanvas.width;
            pageCanvas.height = srcH;

            const ctx = pageCanvas.getContext('2d');
            ctx.fillStyle = s.bgColor || '#ffffff';
            ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            ctx.drawImage(
                fullCanvas,
                0, srcY, fullCanvas.width, srcH,
                0, 0, fullCanvas.width, srcH
            );

            const imgData = pageCanvas.toDataURL('image/png');
            // Actual height this slice represents in mm
            const sliceHmm = (sliceHpx / availableHpx) * pdfContentH;

            pdf.addImage(
                imgData, 'PNG',
                pdfX, pdfY,
                pdfContentW,
                Math.min(sliceHmm, pdfContentH),
                '',
                'FAST'
            );
        }

        updateProgress(100, 'Done!');
        await new Promise(r => setTimeout(r, 150));

        pdf.save(getExportFilename('pdf'));
        hideProgress();
        showToast('PDF downloaded!', 'success');

    } catch (err) {
        // Safe cleanup
        if (iframe && iframe.parentNode) {
            document.body.removeChild(iframe);
        }
        const st = document.getElementById('__pdfStyle');
        if (st) document.head.removeChild(st);
        hideProgress();
        showToast('PDF Error: ' + err.message, 'error');
        console.error('PDF Error:', err);
    }
}

// ── Build scoped render styles ─────────────────────────────────────────────
function buildRenderStyles(sz, s, hGap, pGap, lGap, p2px) {
    const col = s.columns > 1
        ? `column-count: ${s.columns}; column-gap: 8mm;`
        : '';
    return `
        /* headings */
        #__pdfStyle ~ body div h1, div[style*="${sz.h1}"] h1 { color: red; }

        /* We target by parent renderDiv directly via attribute hack –
           instead use a wrapper class */
        .pdfRenderContent { ${col} }

        .pdfRenderContent h1 {
            font-size: ${p2px(sz.h1)} !important;
            font-weight: 700 !important;
            margin: ${hGap}px 0 !important;
            line-height: ${s.lineHeight} !important;
            color: ${s.textColor} !important;
            font-family: ${s.fontFamily} !important;
        }
        .pdfRenderContent h2 {
            font-size: ${p2px(sz.h2)} !important;
            font-weight: 700 !important;
            margin: ${hGap}px 0 !important;
            line-height: ${s.lineHeight} !important;
            color: ${s.textColor} !important;
            font-family: ${s.fontFamily} !important;
        }
        .pdfRenderContent h3 {
            font-size: ${p2px(sz.h3)} !important;
            font-weight: 700 !important;
            margin: ${hGap}px 0 !important;
            line-height: ${s.lineHeight} !important;
            color: ${s.textColor} !important;
            font-family: ${s.fontFamily} !important;
        }
        .pdfRenderContent h4 {
            font-size: ${p2px(sz.h4)} !important;
            font-weight: 700 !important;
            margin: ${hGap}px 0 !important;
            line-height: ${s.lineHeight} !important;
            color: ${s.textColor} !important;
            font-family: ${s.fontFamily} !important;
        }
        .pdfRenderContent h5,
        .pdfRenderContent h6 {
            font-size: ${p2px(sz.body)} !important;
            font-weight: 700 !important;
            margin: ${hGap}px 0 !important;
            line-height: ${s.lineHeight} !important;
            color: ${s.textColor} !important;
            font-family: ${s.fontFamily} !important;
        }
        .pdfRenderContent p {
            font-size: ${p2px(sz.body)} !important;
            margin: ${pGap}px 0 !important;
            line-height: ${s.lineHeight} !important;
            color: ${s.textColor} !important;
            font-family: ${s.fontFamily} !important;
        }
        .pdfRenderContent ul,
        .pdfRenderContent ol {
            margin: ${lGap}px 0 !important;
            padding-left: 1.5em !important;
        }
        .pdfRenderContent li {
            font-size: ${p2px(sz.body)} !important;
            margin: ${lGap}px 0 !important;
            line-height: ${s.lineHeight} !important;
            color: ${s.textColor} !important;
            font-family: ${s.fontFamily} !important;
        }
        .pdfRenderContent code {
            font-size: ${p2px(sz.code)} !important;
            font-family: 'Courier New', monospace !important;
            background: rgba(0,0,0,0.07) !important;
            padding: 1px 4px !important;
            border-radius: 2px !important;
            color: ${s.textColor} !important;
        }
        .pdfRenderContent pre {
            font-size: ${p2px(sz.code)} !important;
            font-family: 'Courier New', monospace !important;
            background: rgba(0,0,0,0.07) !important;
            padding: ${pGap + 4}px 8px !important;
            margin: ${pGap}px 0 !important;
            border-radius: 3px !important;
            white-space: pre-wrap !important;
            word-wrap: break-word !important;
            line-height: ${s.lineHeight} !important;
            color: ${s.textColor} !important;
        }
        .pdfRenderContent pre code {
            background: none !important;
            padding: 0 !important;
        }
        .pdfRenderContent blockquote {
            margin: ${pGap}px 0 !important;
            padding: ${pGap}px 10px !important;
            border-left: 3px solid #999999 !important;
            color: #555555 !important;
            font-size: ${p2px(sz.body)} !important;
            font-family: ${s.fontFamily} !important;
        }
        .pdfRenderContent a {
            color: ${s.linkColor} !important;
            text-decoration: underline !important;
        }
        .pdfRenderContent table {
            border-collapse: collapse !important;
            width: 100% !important;
            margin: ${pGap}px 0 !important;
            font-size: ${p2px(sz.body)} !important;
            font-family: ${s.fontFamily} !important;
            color: ${s.textColor} !important;
        }
        .pdfRenderContent th,
        .pdfRenderContent td {
            border: 1px solid #cccccc !important;
            padding: 3px 6px !important;
            text-align: left !important;
        }
        .pdfRenderContent th {
            background: #eeeeee !important;
            font-weight: 700 !important;
            color: #000000 !important;
        }
        .pdfRenderContent hr {
            border: none !important;
            border-top: 1px solid #cccccc !important;
            margin: ${pGap * 2}px 0 !important;
        }
        .pdfRenderContent img    { max-width: 100% !important; }
        .pdfRenderContent strong { font-weight: 700 !important; color: ${s.textColor} !important; }
        .pdfRenderContent em     { font-style: italic !important; color: ${s.textColor} !important; }
    `;
}

// ─── DOC DOWNLOAD ─────────────────────────────────────────────────────────────
function downloadDOC() {
    showProgress('Generating DOC...', 30);

    try {
        const printHTML = buildPrintHTML();

        updateProgress(70, 'Building document...');

        // Use HTML blob that Word can open
        const blob = new Blob(['\ufeff', printHTML], {
            type: 'application/msword'
        });

        updateProgress(100, 'Done!');

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = getExportFilename('doc');
        link.click();
        URL.revokeObjectURL(url);

        setTimeout(hideProgress, 300);
        showToast('DOC downloaded!', 'success');

    } catch (err) {
        hideProgress();
        showToast('DOC generation failed: ' + err.message, 'error');
    }
}

// ─── HTML DOWNLOAD ────────────────────────────────────────────────────────────
function downloadHTML() {
    showProgress('Generating HTML...', 50);

    try {
        const printHTML = buildPrintHTML();
        const blob = new Blob([printHTML], { type: 'text/html; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = getExportFilename('html');
        link.click();
        URL.revokeObjectURL(url);

        updateProgress(100, 'Done!');
        setTimeout(hideProgress, 300);
        showToast('HTML downloaded!', 'success');

    } catch (err) {
        hideProgress();
        showToast('HTML generation failed: ' + err.message, 'error');
    }
}

// ─── PRINT ───────────────────────────────────────────────────────────────────
function handlePrint() {
    if (!STATE.markdown.trim()) {
        showToast('Please enter some Markdown first!', 'warning');
        return;
    }

    const printHTML = buildPrintHTML();
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:210mm;height:297mm;';
    document.body.appendChild(iframe);

    iframe.contentDocument.open();
    iframe.contentDocument.write(printHTML);
    iframe.contentDocument.close();

    iframe.contentWindow.focus();

    setTimeout(() => {
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 500);
}

// ─── PROGRESS ────────────────────────────────────────────────────────────────
function showProgress(text, pct) {
    DOM.progressOverlay.style.display = 'flex';
    DOM.progressText.textContent = text;
    DOM.progressBar.style.width = pct + '%';
}

function updateProgress(pct, text) {
    DOM.progressBar.style.width = pct + '%';
    if (text) DOM.progressText.textContent = text;
}

function hideProgress() {
    DOM.progressOverlay.style.display = 'none';
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = '') {
    const t = DOM.toast;
    t.textContent = msg;
    t.className = 'toast ' + type;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── SAMPLE MARKDOWN ─────────────────────────────────────────────────────────
function loadSample() {
    const sample = `# MDConvert — Feature Showcase
Welcome to **MDConvert**! This sample demonstrates every formatting feature supported by the converter. Use it as a quick reference or to test your export settings.

## Text Formatting
You can write in **bold**, *italic*, ***bold italic***, and ~~strikethrough~~. Inline \`code snippets\` are also supported with monospace styling.

Here is a [clickable link](https://github.com) and an auto-linked URL: https://example.com

## Headings
All six heading levels are supported:

### Heading Level 3
#### Heading Level 4
##### Heading Level 5
###### Heading Level 6

## Lists

### Unordered List
- First item
- Second item with **bold** text
- Third item
  - Nested item A
  - Nested item B
    - Deeply nested item

### Ordered List
1. Step one — install the tool
2. Step two — write your Markdown
3. Step three — export to PDF
   1. Choose page size
   2. Set margins
   3. Click download

### Task List
- [x] Write Markdown content
- [x] Customize typography settings
- [ ] Export to PDF
- [ ] Share with team

## Tables

| Feature | Status | Description |
|---------|--------|-------------|
| Live Preview | ✅ Ready | Real-time rendered output |
| PDF Export | ✅ Ready | Smart page-break detection |
| DOC Export | ✅ Ready | Word-compatible format |
| Dark Mode | ✅ Ready | Full theme support |
| Math (KaTeX) | ✅ Ready | Inline & display equations |
| Syntax Highlighting | ✅ Ready | 8+ code themes |

## Code Blocks

Syntax-highlighted code blocks with language detection:

\`\`\`javascript
// Fibonacci sequence generator
function fibonacci(n) {
    const seq = [0, 1];
    for (let i = 2; i < n; i++) {
        seq.push(seq[i - 1] + seq[i - 2]);
    }
    return seq;
}

console.log(fibonacci(10));
// Output: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
\`\`\`

\`\`\`python
# Quick sort implementation
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

print(quicksort([3, 6, 8, 10, 1, 2, 1]))
\`\`\`

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Hello World</title>
</head>
<body>
    <h1>Hello, MDConvert!</h1>
</body>
</html>
\`\`\`

## Blockquotes

> "The best way to predict the future is to invent it."
> — *Alan Kay*

> **Tip:** You can nest blockquotes for threaded discussions:
>
> > This is a nested reply.
> >
> > > And this goes even deeper!

## Mathematics (KaTeX)

MDConvert supports LaTeX math rendering via KaTeX.

**Inline math:** The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$ and Euler's identity is $e^{i\\pi} + 1 = 0$.

**Display math:**

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}
$$

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

## Horizontal Rules

Use horizontal rules to separate sections:

---

## Images

Images render inline and scale to fit the page width:

![Placeholder Image](https://via.placeholder.com/600x200/2563eb/ffffff?text=MDConvert+Preview)

## Mixed Content Example

Below is a realistic document snippet combining multiple features:

### API Response Format

The server returns a JSON object with the following structure:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`id\` | string | Yes | Unique identifier |
| \`name\` | string | Yes | Display name |
| \`email\` | string | No | Contact email |
| \`score\` | number | Yes | Rating from $0$ to $100$ |
| \`tags\` | array | No | Classification labels |

\`\`\`json
{
    "id": "usr_29a3b7",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "score": 94.5,
    "tags": ["premium", "verified"],
    "metadata": {
        "created": "2025-01-15T08:30:00Z",
        "lastLogin": "2025-04-28T14:22:00Z"
    }
}
\`\`\`

> **Note:** All API responses are paginated. Use \`?page=2&limit=25\` query parameters for pagination.

### Quick Stats

- **Total Users:** 12,482
- **Active Today:** 3,891
- **Avg. Score:** $\\bar{x} = 78.3$
- **Std. Deviation:** $\\sigma = 12.7$

---

*Generated by **MDConvert** — Markdown to PDF / DOC / HTML*`;


    DOM.markdownInput.value = sample;
    STATE.markdown = sample;
    updateStats();
    updatePreview();
    showToast('Sample loaded!', 'success');
}

// ─── THEME ───────────────────────────────────────────────────────────────────
const DARK_DOC_COLORS = { bg: '#1a1a2e', text: '#e2e8f0', link: '#60a5fa' };
const LIGHT_DOC_COLORS = { bg: '#ffffff', text: '#000000', link: '#0000EE' };

function applyThemeDocColors(theme) {
    const colors = theme === 'dark' ? DARK_DOC_COLORS : LIGHT_DOC_COLORS;
    STATE.settings.bgColor = colors.bg;
    STATE.settings.textColor = colors.text;
    STATE.settings.linkColor = colors.link;
    // Sync UI controls
    DOM.bgColor.value = colors.bg;
    DOM.bgColorHex.textContent = colors.bg;
    DOM.textColor.value = colors.text;
    DOM.textColorHex.textContent = colors.text;
    DOM.linkColor.value = colors.link;
    DOM.linkColorHex.textContent = colors.link;
}

function loadTheme() {
    const saved = localStorage.getItem('mdconvert_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    DOM.themeIcon.textContent = saved === 'dark' ? '☀️' : '🌙';
    applyThemeDocColors(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    DOM.themeIcon.textContent = next === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('mdconvert_theme', next);
    applyThemeDocColors(next);
    applyPreviewStyles();
    showToast(`${next === 'dark' ? '🌙 Dark' : '☀️ Light'} mode`, 'success');
}

// ─── MARKDOWN TOOLBAR ────────────────────────────────────────────────────────
function handleToolbarAction(action) {
    const ta = DOM.markdownInput;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = ta.value.substring(start, end);
    let before = '', after = '', insert = '';

    switch (action) {
        case 'h1': before = '# '; insert = sel || 'Heading 1'; break;
        case 'h2': before = '## '; insert = sel || 'Heading 2'; break;
        case 'h3': before = '### '; insert = sel || 'Heading 3'; break;
        case 'bold': before = '**'; after = '**'; insert = sel || 'bold text'; break;
        case 'italic': before = '*'; after = '*'; insert = sel || 'italic text'; break;
        case 'strikethrough': before = '~~'; after = '~~'; insert = sel || 'strikethrough'; break;
        case 'code': before = '`'; after = '`'; insert = sel || 'code'; break;
        case 'link': before = '['; after = '](url)'; insert = sel || 'link text'; break;
        case 'image': before = '!['; after = '](url)'; insert = sel || 'alt text'; break;
        case 'ul': before = '- '; insert = sel || 'list item'; break;
        case 'ol': before = '1. '; insert = sel || 'list item'; break;
        case 'quote': before = '> '; insert = sel || 'blockquote'; break;
        case 'hr': insert = '\n---\n'; break;
        case 'table':
            insert = '| Header | Header |\n|--------|--------|\n| Cell   | Cell   |';
            break;
        case 'codeblock':
            before = '```\n'; after = '\n```'; insert = sel || 'code here';
            break;
        default: return;
    }

    const replacement = before + insert + after;
    ta.setRangeText(replacement, start, end, 'end');
    STATE.markdown = ta.value;
    updateStats();
    if (STATE.previewEnabled) debouncePreview();
    ta.focus();
}

function handleEditorShortcuts(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); handleToolbarAction('bold'); break;
        case 'i': e.preventDefault(); handleToolbarAction('italic'); break;
        case 'k': e.preventDefault(); handleToolbarAction('link'); break;
    }
}

// ─── FIND & REPLACE ──────────────────────────────────────────────────────────
let findMatches = [];
let findIndex = -1;

function toggleFindReplace() {
    const bar = DOM.findReplaceBar;
    if (bar.style.display === 'none') {
        bar.style.display = '';
        DOM.findInput.focus();
    } else {
        bar.style.display = 'none';
    }
}

function findInText(dir) {
    const query = DOM.findInput.value;
    if (!query) { DOM.findCount.textContent = '0/0'; findMatches = []; return; }

    const text = DOM.markdownInput.value;
    const caseSensitive = DOM.findCaseSensitive.checked;
    const searchText = caseSensitive ? text : text.toLowerCase();
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    findMatches = [];
    let idx = searchText.indexOf(searchQuery);
    while (idx !== -1) {
        findMatches.push(idx);
        idx = searchText.indexOf(searchQuery, idx + 1);
    }

    if (findMatches.length === 0) {
        DOM.findCount.textContent = '0/0';
        findIndex = -1;
        return;
    }

    if (dir === 'next') {
        findIndex = (findIndex + 1) % findMatches.length;
    } else {
        findIndex = (findIndex - 1 + findMatches.length) % findMatches.length;
    }

    const pos = findMatches[findIndex];
    DOM.markdownInput.focus();
    DOM.markdownInput.setSelectionRange(pos, pos + query.length);
    DOM.findCount.textContent = `${findIndex + 1}/${findMatches.length}`;
}

function replaceInText() {
    if (findMatches.length === 0 || findIndex < 0) return;
    const q = DOM.findInput.value;
    const r = DOM.replaceInput.value;
    const pos = findMatches[findIndex];
    DOM.markdownInput.setRangeText(r, pos, pos + q.length, 'end');
    STATE.markdown = DOM.markdownInput.value;
    updateStats();
    if (STATE.previewEnabled) debouncePreview();
    findInText('next');
}

function replaceAllInText() {
    const q = DOM.findInput.value;
    const r = DOM.replaceInput.value;
    if (!q) return;
    const caseSensitive = DOM.findCaseSensitive.checked;
    const flags = caseSensitive ? 'g' : 'gi';
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    DOM.markdownInput.value = DOM.markdownInput.value.replace(new RegExp(escaped, flags), r);
    STATE.markdown = DOM.markdownInput.value;
    updateStats();
    if (STATE.previewEnabled) debouncePreview();
    findMatches = [];
    findIndex = -1;
    DOM.findCount.textContent = '0/0';
    showToast('All replaced!', 'success');
}

// ─── TABLE OF CONTENTS ───────────────────────────────────────────────────────
function generateTOC() {
    const md = STATE.markdown;
    if (!md.trim()) { showToast('No content to generate TOC from', 'warning'); return; }

    const lines = md.split('\n');
    const tocLines = ['## Table of Contents', ''];
    let inCodeBlock = false;

    for (const line of lines) {
        if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
        if (inCodeBlock) continue;
        const match = line.match(/^(#{1,6})\s+(.+)/);
        if (match) {
            const level = match[1].length;
            const text = match[2].trim();
            const anchor = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            const indent = '  '.repeat(level - 1);
            tocLines.push(`${indent}- [${text}](#${anchor})`);
        }
    }

    if (tocLines.length <= 2) { showToast('No headings found', 'warning'); return; }

    const toc = tocLines.join('\n') + '\n\n';
    const ta = DOM.markdownInput;
    const pos = ta.selectionStart;
    ta.setRangeText(toc, pos, pos, 'end');
    STATE.markdown = ta.value;
    updateStats();
    updatePreview();
    showToast('TOC inserted!', 'success');
}

// ─── AUTO-SAVE & SESSION RESTORE ─────────────────────────────────────────────
function autoSave() {
    if (STATE.markdown) {
        localStorage.setItem('mdconvert_content', STATE.markdown);
    }
    localStorage.setItem('mdconvert_settings', JSON.stringify(STATE.settings));
}

function restoreSession() {
    const savedContent = localStorage.getItem('mdconvert_content');
    const savedSettings = localStorage.getItem('mdconvert_settings');

    if (savedContent) {
        DOM.markdownInput.value = savedContent;
        STATE.markdown = savedContent;
    }

    if (savedSettings) {
        try {
            const s = JSON.parse(savedSettings);
            Object.assign(STATE.settings, s);
            // Sync UI with restored settings
            DOM.fontFamily.value = s.fontFamily || 'Helvetica, Arial, sans-serif';
            DOM.bgColor.value = s.bgColor || '#ffffff';
            DOM.bgColorHex.textContent = s.bgColor || '#ffffff';
            DOM.textColor.value = s.textColor || '#000000';
            DOM.textColorHex.textContent = s.textColor || '#000000';
            DOM.linkColor.value = s.linkColor || '#0000EE';
            DOM.linkColorHex.textContent = s.linkColor || '#0000EE';
            DOM.sizeMode.value = s.sizeMode || 'relative';
            DOM.baseSize.value = s.baseSize || 10;
            DOM.lineHeight.value = s.lineHeight || 1.0;
            DOM.headingGap.value = s.headingGap ?? 2;
            DOM.paraGap.value = s.paraGap ?? 2;
            DOM.listGap.value = s.listGap ?? 1;
            DOM.zeroSpace.checked = s.zeroSpace !== false;
            DOM.columns.value = s.columns || 1;
            DOM.paperSize.value = s.paperSize || 'A4';
            if (s.orientation === 'landscape') DOM.orientLandscape.checked = true;
            else DOM.orientPortrait.checked = true;
            if (s.margins) {
                DOM.marginTop.value = s.margins.top ?? 1;
                DOM.marginBot.value = s.margins.bot ?? 1;
                DOM.marginLeft.value = s.margins.left ?? 1;
                DOM.marginRight.value = s.margins.right ?? 1;
            }
            DOM.fontSizeRelative.style.display = s.sizeMode === 'fixed' ? 'none' : '';
            DOM.fontSizeFixed.style.display = s.sizeMode === 'fixed' ? '' : 'none';
        } catch (e) { /* ignore parse errors */ }
    }

    if (savedContent) {
        showToast('Session restored!', 'success');
    }
}

// ─── WORD GOAL ───────────────────────────────────────────────────────────────
function updateWordGoal() {
    const goal = parseInt(DOM.wordGoalInput.value) || 0;
    if (goal > 0) {
        localStorage.setItem('mdconvert_wordgoal', goal);
        const txt = STATE.markdown;
        const words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
        const pct = Math.min(100, Math.round((words / goal) * 100));
        DOM.wordGoalBarWrap.style.display = '';
        DOM.wordGoalBar.style.width = pct + '%';
        DOM.wordGoalBar.classList.toggle('complete', pct >= 100);
        DOM.wordGoalPct.textContent = pct + '%';
    } else {
        DOM.wordGoalBarWrap.style.display = 'none';
        DOM.wordGoalPct.textContent = '';
    }
}

// ─── START ────────────────────────────────────────────────────────────────────
init();