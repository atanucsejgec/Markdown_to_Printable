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
    h1:   2.0,
    h2:   1.7,
    h3:   1.4,
    h4:   1.2,
    body: 1.0,
    code: 0.9
};

// Paper dimensions in mm
const PAPER_SIZES = {
    A4:     { w: 210,  h: 297 },
    A3:     { w: 297,  h: 420 },
    A5:     { w: 148,  h: 210 },
    Letter: { w: 215.9,h: 279.4 },
    Legal:  { w: 215.9,h: 355.6 }
};

// ─── DOM REFS ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const DOM = {
    markdownInput:   $('markdownInput'),
    previewContent:  $('previewContent'),
    paperPreview:    $('paperPreview'),
    dropZone:        $('dropZone'),
    fileInput:       $('fileInput'),
    charCount:       $('charCount'),
    lineCount:       $('lineCount'),
    wordCount:       $('wordCount'),
    progressOverlay: $('progressOverlay'),
    progressBar:     $('progressBar'),
    progressText:    $('progressText'),
    toast:           $('toast'),

    // Settings
    fontFamily:      $('fontFamily'),
    bgColor:         $('bgColor'),
    bgColorHex:      $('bgColorHex'),
    textColor:       $('textColor'),
    textColorHex:    $('textColorHex'),
    linkColor:       $('linkColor'),
    linkColorHex:    $('linkColorHex'),
    sizeMode:        $('sizeMode'),
    baseSize:        $('baseSize'),
    lineHeight:      $('lineHeight'),
    headingGap:      $('headingGap'),
    paraGap:         $('paraGap'),
    listGap:         $('listGap'),
    zeroSpace:       $('zeroSpace'),
    columns:         $('columns'),
    paperSize:       $('paperSize'),
    orientPortrait:  $('orientPortrait'),
    orientLandscape: $('orientLandscape'),
    marginTop:       $('marginTop'),
    marginBot:       $('marginBot'),
    marginLeft:      $('marginLeft'),
    marginRight:     $('marginRight'),

    // Displays
    h1SizeDisplay:   $('h1SizeDisplay'),
    h2SizeDisplay:   $('h2SizeDisplay'),
    h3SizeDisplay:   $('h3SizeDisplay'),
    h4SizeDisplay:   $('h4SizeDisplay'),
    bodySizeDisplay: $('bodySizeDisplay'),
    codeSizeDisplay: $('codeSizeDisplay'),

    // Fixed inputs
    h1Fixed:         $('h1Fixed'),
    h2Fixed:         $('h2Fixed'),
    h3Fixed:         $('h3Fixed'),
    h4Fixed:         $('h4Fixed'),
    bodyFixed:       $('bodyFixed'),
    codeFixed:       $('codeFixed'),

    fontSizeRelative: $('fontSizeMode_relative'),
    fontSizeFixed:    $('fontSizeMode_fixed'),
};

// ─── MARKED CONFIG ───────────────────────────────────────────────────────────
marked.setOptions({
    breaks: true,
    gfm: true,
});

// ─── MATH RENDERING (KaTeX) ─────────────────────────────────────────────────
function renderMath(element) {
    if (typeof renderMathInElement === 'function') {
        renderMathInElement(element, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true },
            ],
            throwOnError: false,
        });
    }
}

// ─── INIT ────────────────────────────────────────────────────────────────────
function init() {
    bindEvents();
    updateSizeDisplays();
    applyPreviewStyles();
    updatePreview();
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
        DOM.fontSizeFixed.style.display    = STATE.settings.sizeMode === 'fixed'    ? '' : 'none';
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
    ['h1Fixed','h2Fixed','h3Fixed','h4Fixed','bodyFixed','codeFixed'].forEach(id => {
        $(id).addEventListener('input', () => {
            const key = id.replace('Fixed','');
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

    ['marginTop','marginBot','marginLeft','marginRight'].forEach(id => {
        $(id).addEventListener('input', () => {
            const key = id.replace('margin','').toLowerCase();
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
    const allowed = ['text/markdown','text/plain','text/x-markdown',''];
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
    DOM.charCount.textContent = `${txt.length} chars`;
    DOM.lineCount.textContent = `${txt.split('\n').length} lines`;
    DOM.wordCount.textContent = `${txt.trim() ? txt.trim().split(/\s+/).length : 0} words`;
}

// ─── DEBOUNCE PREVIEW ────────────────────────────────────────────────────────
let previewTimer = null;
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
        DOM.previewContent.innerHTML = marked.parse(md);
        renderMath(DOM.previewContent);
    } catch(e) {
        DOM.previewContent.innerHTML = `<p style="color:red">Parse error: ${e.message}</p>`;
    }
}

// ─── SIZE CALCULATIONS ───────────────────────────────────────────────────────
function getElementSizes() {
    const s = STATE.settings;
    if (s.sizeMode === 'relative') {
        const base = s.baseSize;
        return {
            h1:   +(base * SIZE_RATIOS.h1).toFixed(1),
            h2:   +(base * SIZE_RATIOS.h2).toFixed(1),
            h3:   +(base * SIZE_RATIOS.h3).toFixed(1),
            h4:   +(base * SIZE_RATIOS.h4).toFixed(1),
            body: +(base * SIZE_RATIOS.body).toFixed(1),
            code: +(base * SIZE_RATIOS.code).toFixed(1),
        };
    } else {
        return { ...s.fixedSizes };
    }
}

function updateSizeDisplays() {
    const sz = getElementSizes();
    DOM.h1SizeDisplay.textContent   = sz.h1;
    DOM.h2SizeDisplay.textContent   = sz.h2;
    DOM.h3SizeDisplay.textContent   = sz.h3;
    DOM.h4SizeDisplay.textContent   = sz.h4;
    DOM.bodySizeDisplay.textContent = sz.body;
    DOM.codeSizeDisplay.textContent = sz.code;
}

// ─── APPLY PREVIEW STYLES ────────────────────────────────────────────────────
function applyPreviewStyles() {
    const s = STATE.settings;
    const sz = getElementSizes();
    const m = s.margins;
    const paper = PAPER_SIZES[s.paperSize] || PAPER_SIZES.A4;

    // Px per mm at 96dpi
    const pxPerMm = 96 / 25.4;

    let paperW = paper.w;
    let paperH = paper.h;
    if (s.orientation === 'landscape') { [paperW, paperH] = [paperH, paperW]; }

    const paperWpx = paperW * pxPerMm;

    // Paper preview dimensions
    DOM.paperPreview.style.width    = `${paperWpx}px`;
    DOM.paperPreview.style.minHeight = `${paperH * pxPerMm}px`;
    DOM.paperPreview.style.background = s.bgColor;
    DOM.paperPreview.style.color = s.textColor;

    // Content padding = margins
    DOM.previewContent.style.padding =
        `${m.top * 10}mm ${m.right * 10}mm ${m.bot * 10}mm ${m.left * 10}mm`;

    // Columns
    if (s.columns > 1) {
        DOM.previewContent.style.columnCount = s.columns;
        DOM.previewContent.style.columnGap   = '8mm';
    } else {
        DOM.previewContent.style.columnCount = '';
        DOM.previewContent.style.columnGap   = '';
    }

    // Build inline CSS for preview content
    const hGap = s.zeroSpace ? 0 : s.headingGap;
    const pGap = s.zeroSpace ? 0 : s.paraGap;
    const lGap = s.zeroSpace ? 0 : s.listGap;

    // pt to px: 1pt = 1.333px
    const ptToPx = pt => `${(pt * 1.3333).toFixed(2)}px`;

    let css = `
        font-family: ${s.fontFamily};
        font-size: ${ptToPx(sz.body)};
        line-height: ${s.lineHeight};
        color: ${s.textColor};
        background: ${s.bgColor};
    `;

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
            background: rgba(0,0,0,0.06);
            padding: 1px 3px;
            border-radius: 2px;
        }
        #previewContent pre {
            font-size: ${ptToPx(sz.code)};
            font-family: 'Courier New', monospace;
            background: rgba(0,0,0,0.06);
            padding: ${pGap + 4}px 8px;
            margin: ${pGap}px 0;
            border-radius: 3px;
            overflow-x: auto;
            line-height: ${s.lineHeight};
        }
        #previewContent pre code {
            background: none;
            padding: 0;
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

    DOM.fontFamily.value    = STATE.settings.fontFamily;
    DOM.bgColor.value       = STATE.settings.bgColor;
    DOM.bgColorHex.textContent = STATE.settings.bgColor;
    DOM.textColor.value     = STATE.settings.textColor;
    DOM.textColorHex.textContent = STATE.settings.textColor;
    DOM.linkColor.value     = STATE.settings.linkColor;
    DOM.linkColorHex.textContent = STATE.settings.linkColor;
    DOM.sizeMode.value      = STATE.settings.sizeMode;
    DOM.baseSize.value      = STATE.settings.baseSize;
    DOM.lineHeight.value    = STATE.settings.lineHeight;
    DOM.headingGap.value    = STATE.settings.headingGap;
    DOM.paraGap.value       = STATE.settings.paraGap;
    DOM.listGap.value       = STATE.settings.listGap;
    DOM.zeroSpace.checked   = STATE.settings.zeroSpace;
    DOM.columns.value       = STATE.settings.columns;
    DOM.paperSize.value     = STATE.settings.paperSize;
    DOM.orientPortrait.checked = true;
    DOM.marginTop.value     = STATE.settings.margins.top;
    DOM.marginBot.value     = STATE.settings.margins.bot;
    DOM.marginLeft.value    = STATE.settings.margins.left;
    DOM.marginRight.value   = STATE.settings.margins.right;

    DOM.fontSizeRelative.style.display = '';
    DOM.fontSizeFixed.style.display    = 'none';

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

    const htmlContent = marked.parse(STATE.markdown || '');

    // Build a temporary container to render math, then extract HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    renderMath(tempDiv);
    const renderedContent = tempDiv.innerHTML;

    // Collect KaTeX CSS for self-contained export
    let katexCSS = '';
    try {
        for (const sheet of document.styleSheets) {
            if (sheet.href && sheet.href.includes('katex')) {
                katexCSS = `<link rel="stylesheet" href="${sheet.href}">`;
                break;
            }
        }
    } catch(e) { /* ignore cross-origin errors */ }

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
    ${s.columns > 1 ? `column-count: ${s.columns}; column-gap: 8mm;` : ''}
}
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
<body>${renderedContent}</body>
</html>`;
}

// ─── DOWNLOAD HANDLER ────────────────────────────────────────────────────────
async function handleDownload() {
    if (!STATE.markdown.trim()) {
        showToast('Please enter some Markdown first!', 'warning');
        return;
    }

    switch (STATE.format) {
        case 'pdf':  await downloadPDF();  break;
        case 'doc':  downloadDOC();         break;
        case 'html': downloadHTML();        break;
    }
}

// ─── PDF DOWNLOAD (FIXED) ─────────────────────────────────────────────────────
async function downloadPDF() {
    showProgress('Generating PDF...', 10);

    try {
        if (!STATE.markdown.trim()) {
            hideProgress();
            showToast('No content to export!', 'warning');
            return;
        }

        const s     = STATE.settings;
        const sz    = getElementSizes();
        const m     = s.margins;
        const paper = PAPER_SIZES[s.paperSize] || PAPER_SIZES.A4;

        let paperW = paper.w, paperH = paper.h;
        if (s.orientation === 'landscape') { [paperW, paperH] = [paperH, paperW]; }

        const MM_TO_PX      = 96 / 25.4;
        const SCALE         = 2;

        const marginLpx     = m.left  * 10 * MM_TO_PX;
        const marginRpx     = m.right * 10 * MM_TO_PX;
        const marginTpx     = m.top   * 10 * MM_TO_PX;
        const marginBpx     = m.bot   * 10 * MM_TO_PX;
        const contentWpx    = Math.floor((paperW * MM_TO_PX) - marginLpx - marginRpx);
        const pageHpx       = Math.floor(paperH  * MM_TO_PX);
        const availableHpx  = Math.floor(pageHpx - marginTpx - marginBpx);

        const hGap  = s.zeroSpace ? 0 : s.headingGap;
        const pGap  = s.zeroSpace ? 0 : s.paraGap;
        const lGap  = s.zeroSpace ? 0 : s.listGap;
        const p2px  = pt => `${(pt * 1.3333).toFixed(2)}px`;

        updateProgress(15, 'Building render layer...');

        // ── STEP 1: Create render container directly on body ──
        const renderDiv = document.createElement('div');
        renderDiv.className = 'pdfRenderContent';
        renderDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: ${contentWpx}px;
            background: ${s.bgColor};
            color: ${s.textColor};
            font-family: ${s.fontFamily};
            font-size: ${p2px(sz.body)};
            line-height: ${s.lineHeight};
            padding: 0;
            margin: 0;
            box-sizing: border-box;
            overflow: visible;
            z-index: -1;
            pointer-events: none;
        `;

        renderDiv.innerHTML = marked.parse(STATE.markdown);
        document.body.appendChild(renderDiv);
        renderMath(renderDiv);

        // ── STEP 2: Inject styles scoped to renderDiv ──
        const style = document.createElement('style');
        style.id = '__pdfStyle';
        style.textContent = buildRenderStyles(sz, s, hGap, pGap, lGap, p2px);
        document.head.appendChild(style);

        // ── STEP 3: Wait for full layout + KaTeX font loading ──
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        // Wait for KaTeX fonts to finish loading
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }
        await new Promise(r => setTimeout(r, 500));

        const totalH   = renderDiv.scrollHeight;
        const totalPages = Math.max(1, Math.ceil(totalH / availableHpx));

        updateProgress(25, `Rendering ${totalPages} page(s)...`);

        // ── STEP 4: Capture full content as ONE canvas ──
        const fullCanvas = await html2canvas(renderDiv, {
            scale           : SCALE,
            useCORS         : true,
            allowTaint      : true,
            logging         : false,
            backgroundColor : s.bgColor || '#ffffff',
            width           : contentWpx,
            height          : totalH,
            windowWidth     : contentWpx,
            windowHeight    : totalH,
            x               : 0,
            y               : 0,
            scrollX         : 0,
            scrollY         : 0,
            foreignObjectRendering : false,
            removeContainer : true,
            onclone         : (clonedDoc) => {
                // Copy all KaTeX stylesheets into the cloned document
                const katexLinks = document.querySelectorAll('link[href*="katex"]');
                katexLinks.forEach(link => {
                    const clonedLink = clonedDoc.createElement('link');
                    clonedLink.rel = 'stylesheet';
                    clonedLink.href = link.href;
                    clonedDoc.head.appendChild(clonedLink);
                });
                // Also copy the PDF render styles
                const pdfStyle = clonedDoc.createElement('style');
                pdfStyle.textContent = buildRenderStyles(sz, s, hGap, pGap, lGap, p2px);
                clonedDoc.head.appendChild(pdfStyle);
            }
        });

        updateProgress(60, 'Slicing pages...');

        // ── STEP 6: Cleanup DOM ──
        document.body.removeChild(overlay);
        document.head.removeChild(style);

        // ── STEP 7: Create PDF ──
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation : s.orientation === 'landscape' ? 'l' : 'p',
            unit        : 'mm',
            format      : [paperW, paperH],
            compress    : true,
        });

        const pdfX        = m.left * 10;
        const pdfY        = m.top  * 10;
        const pdfContentW = paperW - (m.left * 10) - (m.right * 10);
        const pdfContentH = paperH - (m.top  * 10) - (m.bot   * 10);

        // Canvas pixels per page
        const canvasPageH = Math.round(availableHpx * SCALE);

        // ── STEP 8: Slice canvas and add each page ──
        for (let page = 0; page < totalPages; page++) {
            if (page > 0) pdf.addPage([paperW, paperH]);

            updateProgress(
                60 + Math.round((page / totalPages) * 35),
                `Page ${page + 1} / ${totalPages}`
            );

            const srcY = page * canvasPageH;
            const srcH = Math.min(canvasPageH, fullCanvas.height - srcY);
            if (srcH <= 0) break;

            // Create page slice canvas
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width  = fullCanvas.width;
            pageCanvas.height = srcH;

            const ctx = pageCanvas.getContext('2d');
            // Fill with background color first
            ctx.fillStyle = s.bgColor || '#ffffff';
            ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            // Draw slice
            ctx.drawImage(
                fullCanvas,
                0, srcY, fullCanvas.width, srcH,
                0, 0,    fullCanvas.width, srcH
            );

            const imgData  = pageCanvas.toDataURL('image/png');
            // Actual height this slice represents in mm
            const sliceHmm = (srcH / canvasPageH) * pdfContentH;

            pdf.addImage(
                imgData, 'PNG',
                pdfX, pdfY,
                pdfContentW,
                sliceHmm,
                '',
                'FAST'
            );
        }

        updateProgress(100, 'Done!');
        await new Promise(r => setTimeout(r, 150));

        pdf.save('document.pdf');
        hideProgress();
        showToast('PDF downloaded!', 'success');

    } catch (err) {
        // Safe cleanup
        const ov = document.querySelector('div[style*="z-index: -1"]');
        const st = document.getElementById('__pdfStyle');
        if (ov) document.body.removeChild(ov);
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

        // Use mhtml format for Word compatibility
        const docContent = `
MIME-Version: 1.0
Content-Type: multipart/related; boundary="boundary-md-convert"

--boundary-md-convert
Content-Type: text/html; charset="utf-8"

${printHTML}

--boundary-md-convert--`;

        // Simpler approach: use HTML blob that Word can open
        const blob = new Blob(['\ufeff', printHTML], {
            type: 'application/msword'
        });

        updateProgress(100, 'Done!');

        const url  = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href     = url;
        link.download = 'document.doc';
        link.click();
        URL.revokeObjectURL(url);

        setTimeout(hideProgress, 300);
        showToast('DOC downloaded!', 'success');

    } catch(err) {
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
        const url  = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href     = url;
        link.download = 'document.html';
        link.click();
        URL.revokeObjectURL(url);

        updateProgress(100, 'Done!');
        setTimeout(hideProgress, 300);
        showToast('HTML downloaded!', 'success');

    } catch(err) {
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
    DOM.progressBar.style.width  = pct + '%';
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
    t.className   = 'toast ' + type;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── SAMPLE MARKDOWN ─────────────────────────────────────────────────────────
function loadSample() {
    const sample = `# Mail Products
Mails & Parcel Services available for domestic and international customers.
Product Features Prohibited items and booking guidelines apply.

## International Letter Post
India Post provides basic letter post services to over 190 countries worldwide.
Blind Literature, Printed Papers, and Small Packets are accepted categories.
printed documentation for business and personal communication is supported.
In the international post, various weight limits apply per destination country
(including books and registered items with tracking support).
International Tracked Packets offer end-to-end delivery confirmation.
In the international post, surface mail and airmail options are both available.
airlifted parcels (SAL) are cost-effective with moderate delivery times.
Express Mail Service (EMS) guarantees the fastest international delivery.

### Booking
International Letter Post can be booked at any head post office.

### Letter Post Network
These services are available across 25,000+ post offices in India.

### Registration
Registration facility is available for all letter post categories.

## Domestic Services
Speed Post, Registered Post, Parcel Post, and Business Parcel services.

### Speed Post
- Guaranteed next-day delivery in metro cities
- Time-bound delivery commitment
- Real-time tracking via SMS and web portal
- Available 24x7 at select offices

### Registered Post
- Proof of posting and delivery
- Compensation on loss or damage
- Suitable for important documents

## Parcel Services
Parcel booking with volumetric weight calculation applies.

| Service | Weight Limit | Delivery Time |
|---------|-------------|---------------|
| Speed Post | 35 kg | 1-4 days |
| Parcel Post | 35 kg | 4-7 days |
| EMS | 30 kg | 3-5 days |
| SAL | 20 kg | 7-14 days |

## Tracking
All registered and speed post items can be tracked at **indiapost.gov.in**

\`\`\`
Track: www.indiapost.gov.in/track
API: api.indiapost.gov.in/tracking/v2
\`\`\`

> **Note:** Rates and delivery times are subject to revision. 
> Contact your nearest post office for current tariffs.

---
*India Post — Connecting India since 1854*`;

    DOM.markdownInput.value = sample;
    STATE.markdown = sample;
    updateStats();
    updatePreview();
    showToast('Sample loaded!', 'success');
}

// ─── START ────────────────────────────────────────────────────────────────────
init();