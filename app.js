// ==========================================================================
// TTS Text Workspace — Core Application Logic
// ==========================================================================

// DOM Elements
const editor = document.getElementById('editor');
const scrollContainer = document.getElementById('scrollContainer');
const btnPaste = document.getElementById('btnPaste');
const btnClear = document.getElementById('btnClear');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const btnPlayPause = document.getElementById('btnPlayPause');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const lblTime = document.getElementById('lblTime');
const lblCounter = document.getElementById('lblCounter');
const lblStatus = document.getElementById('lblStatus');
const trackBar = document.getElementById('trackBar');
const trackFill = document.getElementById('trackFill');
const scrollResumePill = document.getElementById('scrollResumePill');
const btnToggleClean = document.getElementById('btnToggleClean');
const cleanIcon = document.getElementById('cleanIcon');
const cleanLabel = document.getElementById('cleanLabel');

// State Variables
let sentences = [];
let currentIndex = -1;
let isPlaying = false;
let currentSpeed = 1.45;
let sessionId = 0;
let hindiVoice = null;
let isCleanMode = true;
let rawOriginalText = '';
let cleanedText = '';

// Smart Auto-Scroll State
let isAutoScrollEnabled = true;
let isProgrammaticScrolling = false;

// Real-Time Audio Timings State
let totalDurationSeconds = 0;
let currentElapsedSeconds = 0;
let sentenceStartTimestamp = 0;
let playbackTimer = null;
const WORDS_PER_MINUTE_BASE = 130; // Natural baseline speaking rate in words/min at 1.0x

// --------------------------------------------------------------------------
// 1. Voice Initialization (Google Hindi)
// --------------------------------------------------------------------------
function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    hindiVoice = voices.find(v => v.name.includes('Google') && (v.lang.includes('hi') || v.name.includes('हिन्दी') || v.name.includes('Hindi'))) ||
                 voices.find(v => v.lang.startsWith('hi')) ||
                 voices.find(v => v.name.includes('Hindi')) ||
                 null;
}

if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
}

// --------------------------------------------------------------------------
// 2. Timing Helpers & Formatting
// --------------------------------------------------------------------------
function formatTime(totalSec) {
    const s = Math.floor(Math.max(0, totalSec));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    const mm = String(mins).padStart(2, '0');
    const ss = String(secs).padStart(2, '0');
    return `${mm}:${ss}`;
}

// Calculate estimated duration for each sentence bundle based on word count and current speed
function calculateSentenceTimings() {
    let accumTime = 0;
    sentences.forEach(s => {
        const words = countWords(s.text);
        const dur = (words / WORDS_PER_MINUTE_BASE) * 60 / currentSpeed;
        s.startTime = accumTime;
        s.duration = dur;
        accumTime += dur;
    });
    totalDurationSeconds = accumTime;
    updateTimeDisplay();
}

function updateTimeDisplay() {
    if (!sentences.length || totalDurationSeconds <= 0) {
        lblTime.textContent = "00:00 / 00:00";
        return;
    }
    lblTime.textContent = `${formatTime(currentElapsedSeconds)} / ${formatTime(totalDurationSeconds)}`;
}

function startTimer() {
    stopTimer();
    playbackTimer = setInterval(() => {
        if (!isPlaying || currentIndex < 0 || currentIndex >= sentences.length) return;
        const curSentence = sentences[currentIndex];
        const elapsedInSentence = (Date.now() - sentenceStartTimestamp) / 1000;
        currentElapsedSeconds = Math.min(
            totalDurationSeconds,
            curSentence.startTime + Math.min(elapsedInSentence, curSentence.duration)
        );

        updateTimeDisplay();

        if (totalDurationSeconds > 0) {
            const pct = Math.min(100, (currentElapsedSeconds / totalDurationSeconds) * 100);
            trackFill.style.width = `${pct}%`;
        }
    }, 200);
}

function stopTimer() {
    if (playbackTimer) {
        clearInterval(playbackTimer);
        playbackTimer = null;
    }
}

// --------------------------------------------------------------------------
// 3. Speed Slider Control
// --------------------------------------------------------------------------
speedSlider.addEventListener('input', (e) => {
    currentSpeed = parseFloat(e.target.value);
    speedValue.textContent = currentSpeed.toFixed(2) + 'x';

    // Recalculate duration with new speed
    if (sentences.length > 0) {
        calculateSentenceTimings();
    }

    // If currently speaking, restart current sentence at new speed
    if (isPlaying && currentIndex >= 0) {
        playSentence(currentIndex);
    }
});

// --------------------------------------------------------------------------
// 4. Smart User Scroll Detection
// --------------------------------------------------------------------------
function isElementVisible(el, container) {
    const elRect = el.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    // 60px margin top/bottom so text isn't obscured by floating bars
    return (elRect.top >= contRect.top + 60 && elRect.bottom <= contRect.bottom - 70);
}

function smartScrollToElement(el) {
    if (!el || !isAutoScrollEnabled) return;

    // If already visible in viewport, DO NOT scroll
    if (isElementVisible(el, scrollContainer)) {
        return;
    }

    isProgrammaticScrolling = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
        isProgrammaticScrolling = false;
    }, 600);
}

function handleUserManualScroll() {
    if (isProgrammaticScrolling) return;

    // User is manually browsing: pause auto-scrolling
    if (isAutoScrollEnabled) {
        isAutoScrollEnabled = false;
        scrollResumePill.classList.add('show');
    }
}

scrollContainer.addEventListener('wheel', handleUserManualScroll, { passive: true });
scrollContainer.addEventListener('touchmove', handleUserManualScroll, { passive: true });

scrollResumePill.addEventListener('click', () => {
    isAutoScrollEnabled = true;
    scrollResumePill.classList.remove('show');
    if (currentIndex >= 0 && sentences[currentIndex]) {
        sentences[currentIndex].element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

// --------------------------------------------------------------------------
// 4.5 Intelligent Text & Symbol Sanitizer (Junk Cleaner for Clean TTS)
// --------------------------------------------------------------------------
function cleanTextForTTS(rawText) {
    if (!rawText) return '';
    let s = String(rawText);

    // 1. Remove non-printable / zero-width spaces and control characters
    s = s.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ');

    // 2. Markdown Links: [Link Title](https://...) -> Link Title
    s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // 3. Raw URLs: remove http/https URLs so TTS doesn't spell out links
    s = s.replace(/https?:\/\/\S+/gi, '');

    // 4. Code blocks and inline code markers: ``` code ``` -> code
    s = s.replace(/```[\s\S]*?```/g, (match) => {
        return match.replace(/```[a-z0-9_-]*/gi, '').replace(/```/g, '');
    });
    s = s.replace(/`+/g, '');

    // 5. Markdown Headings (#, ##, ###) at line start or surrounded by space
    s = s.replace(/(^|\n)\s*#+\s*/g, '$1');
    s = s.replace(/(^|\s)#+(?=\s|$)/g, '$1');

    // 6. Markdown Blockquotes (> text)
    s = s.replace(/(^|\n)\s*>+\s*/g, '$1');

    // 7. Horizontal dividers (---, ===, ___, ***)
    s = s.replace(/(^|\n)\s*[-=*_]{3,}\s*($|\n)/g, '$1\n');

    // 8. Markdown Bold / Italic / Strikethrough markers (keep text inside)
    s = s.replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1');
    s = s.replace(/_{1,3}([^_\n]+)_{1,3}/g, '$1');
    s = s.replace(/~{1,2}([^~\n]+)~{1,2}/g, '$1');

    // 9. Junk / Decorative Symbols, Brackets, Arrows, Bullets, Odd Currencies
    // Strips user-specified: ##***°`><]}}€£ as well as bullets, arrows, degree, etc.
    s = s.replace(/[#*°`><\[\]{}€£¥•●○■□▪▫◆◇★☆✦✧➔➜→←⇒►▶➤▲▼※§¶^|\\~_]/g, ' ');

    // 10. Clean up repeated punctuation noise (e.g. ,,,, -> ,  ||  .... -> .)
    s = s.replace(/([.।!?]){2,}/g, '$1');
    s = s.replace(/,{2,}/g, ',');
    s = s.replace(/[-]{2,}/g, ' ');

    // 11. Normalize spaces around valid speech punctuation
    s = s.replace(/\s+([,।!?;:])/g, '$1');
    s = s.replace(/([,।!?;:])(?!\s|$)/g, '$1 ');

    // 12. Normalize multiple spaces and extra blank lines
    s = s.replace(/[ \t]+/g, ' ');
    s = s.replace(/(^|\n)[ \t]+/g, '$1');
    s = s.replace(/[ \t]+($|\n)/g, '$1');
    s = s.replace(/\n\s*\n\s*\n+/g, '\n\n');

    return s.trim();
}

function updateCleanToggleUI() {
    if (!btnToggleClean) return;
    if (isCleanMode) {
        btnToggleClean.classList.add('active');
        cleanIcon.textContent = '🧹';
        cleanLabel.textContent = 'Clean Text';
        btnToggleClean.title = 'Clean mode active (Click to view Original text)';
    } else {
        btnToggleClean.classList.remove('active');
        cleanIcon.textContent = '📄';
        cleanLabel.textContent = 'Original';
        btnToggleClean.title = 'Original mode active (Click to view Clean text)';
    }
}

function toggleCleanMode() {
    isCleanMode = !isCleanMode;
    updateCleanToggleUI();

    // If we have text loaded, switch views dynamically
    if (rawOriginalText) {
        const activeText = isCleanMode ? (cleanedText || cleanTextForTTS(rawOriginalText)) : rawOriginalText;
        const bundles = processTextInto20WordBundles(activeText, 20);
        if (!bundles.length) return;

        // Maintain relative reading position if currently playing or navigated
        const currentRatio = (sentences.length > 0 && currentIndex >= 0) ? (currentIndex / sentences.length) : 0;
        const wasPlaying = isPlaying;

        if (wasPlaying) {
            window.speechSynthesis.cancel();
            isPlaying = false;
            stopTimer();
        }

        renderSentences(bundles);

        const targetIndex = Math.min(sentences.length - 1, Math.max(0, Math.round(currentRatio * (sentences.length - 1))));
        currentIndex = targetIndex;

        if (wasPlaying) {
            playSentence(targetIndex);
        } else {
            highlightSentence(targetIndex);
            updateProgress();
        }
    }
}

if (btnToggleClean) {
    btnToggleClean.addEventListener('click', toggleCleanMode);
}

// --------------------------------------------------------------------------
// 5. 20-Word Sentence Bundling & Punctuation-to-Comma Logic
// --------------------------------------------------------------------------
function countWords(str) {
    return str.trim().split(/\s+/).filter(Boolean).length;
}

function processTextInto20WordBundles(text, minWords = 20) {
    text = text.trim();
    if (!text) return [];

    // Protect decimals e.g. 3.14 -> 3___DEC___14 and abbreviations
    let s = text.replace(/(\d+)\.(\d+)/g, '$1___DEC___$2');
    s = s.replace(/\b(Mr|Mrs|Dr|Prof|vs|etc)\./gi, '$1___DOT___');

    // Split text into raw chunks by Hindi purna viram (।), period (.), exclamation (!), question mark (?), or newlines
    const rawParts = s.split(/([।!?…]+|\.(?!\S)|\r?\n+)/);

    const rawUnits = [];
    for (let i = 0; i < rawParts.length; i += 2) {
        const chunk = (rawParts[i] || '').trim();
        const punct = (rawParts[i + 1] || '').trim();
        if (chunk) {
            rawUnits.push({ text: chunk, punct: punct });
        } else if (punct && rawUnits.length) {
            rawUnits[rawUnits.length - 1].punct += punct;
        }
    }

    const bundles = [];
    let currentUnits = [];
    let currentWordCount = 0;
    let bundleId = 0;

    for (let i = 0; i < rawUnits.length; i++) {
        const u = rawUnits[i];
        const wCount = countWords(u.text);
        currentUnits.push(u);
        currentWordCount += wCount;

        // When we accumulate at least 20 words, finalize this whole line/bundle!
        if (currentWordCount >= minWords) {
            const bundledText = buildBundle(currentUnits);
            if (bundledText) {
                bundles.push({ id: bundleId++, text: bundledText });
            }
            currentUnits = [];
            currentWordCount = 0;
        }
    }

    // Remaining trailing units if any
    if (currentUnits.length > 0) {
        const bundledText = buildBundle(currentUnits);
        if (bundledText) {
            bundles.push({ id: bundleId++, text: bundledText });
        }
    }

    return bundles;
}

function buildBundle(units) {
    if (units.length === 0) return '';
    let result = '';
    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        const cleanText = u.text.replace(/___DEC___/g, '.').replace(/___DOT___/g, '.');
        const isLast = (i === units.length - 1);

        if (isLast) {
            // Last sentence in the bundle keeps its natural ending (. or । or ?)
            let endPunct = u.punct.replace(/\r?\n+/g, '').replace(/___DEC___/g, '.');
            if (!endPunct || endPunct === ',') endPunct = '।';
            result += cleanText + endPunct;
        } else {
            // Intermediate sentences: replace . / । / \n with a comma so Google speaks continuously!
            if (cleanText.endsWith(',')) {
                result += cleanText + ' ';
            } else {
                result += cleanText + ', ';
            }
        }
    }
    return result.trim();
}

// --------------------------------------------------------------------------
// 6. Render Bundles into Workspace (Double-Click Support)
// --------------------------------------------------------------------------
function renderSentences(bundleList) {
    editor.innerHTML = '';
    sentences = [];

    bundleList.forEach((b) => {
        const div = document.createElement('div');
        div.className = 'tts-sentence';
        div.id = `b-${b.id}`;
        div.textContent = b.text;
        div.title = 'Double-click to start speaking from here';

        // DOUBLE-CLICK: Instantly start speaking from this bundle
        div.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            jumpAndPlay(b.id);
        });

        editor.appendChild(div);
        sentences.push({
            id: b.id,
            text: b.text,
            element: div,
            startTime: 0,
            duration: 0
        });
    });

    calculateSentenceTimings();
}

// --------------------------------------------------------------------------
// 7. Highlight & Progress Updates
// --------------------------------------------------------------------------
function highlightSentence(idx) {
    sentences.forEach((s, i) => {
        if (i === idx) {
            s.element.classList.add('active');
            s.element.classList.remove('played');
            smartScrollToElement(s.element);
        } else if (i < idx) {
            s.element.classList.remove('active');
            s.element.classList.add('played');
        } else {
            s.element.classList.remove('active', 'played');
        }
    });
}

function updateProgress() {
    if (!sentences.length) {
        lblCounter.textContent = "Line 0 / 0";
        trackFill.style.width = "0%";
        updateTimeDisplay();
        return;
    }
    const cur = Math.max(1, currentIndex + 1);
    lblCounter.textContent = `Line ${cur} / ${sentences.length}`;
    updateTimeDisplay();
}

// --------------------------------------------------------------------------
// 8. Speech Playback Engine with Real-Time Timers
// --------------------------------------------------------------------------
function playSentence(idx) {
    if (idx < 0 || idx >= sentences.length) {
        finishPlayback();
        return;
    }

    window.speechSynthesis.cancel();

    currentIndex = idx;
    const currentSession = ++sessionId;
    isPlaying = true;
    btnPlayPause.textContent = '⏸';
    lblStatus.textContent = "Playing";
    highlightSentence(idx);

    // Sync base elapsed time with this sentence's start time
    const curSentence = sentences[idx];
    currentElapsedSeconds = curSentence.startTime;
    sentenceStartTimestamp = Date.now();
    updateProgress();
    startTimer();

    const utter = new SpeechSynthesisUtterance(curSentence.text);

    if (!hindiVoice) loadVoices();
    if (hindiVoice) utter.voice = hindiVoice;

    utter.rate = currentSpeed;

    utter.onend = () => {
        if (currentSession === sessionId && isPlaying) {
            const nextIdx = currentIndex + 1;
            if (nextIdx < sentences.length) {
                playSentence(nextIdx);
            } else {
                finishPlayback();
            }
        }
    };

    utter.onerror = () => {
        if (currentSession === sessionId && isPlaying) {
            const nextIdx = currentIndex + 1;
            if (nextIdx < sentences.length) {
                playSentence(nextIdx);
            } else {
                finishPlayback();
            }
        }
    };

    window.speechSynthesis.speak(utter);
}

function finishPlayback() {
    isPlaying = false;
    stopTimer();
    btnPlayPause.textContent = '▶';
    window.speechSynthesis.cancel();
    lblStatus.textContent = "Finished";

    // Remove active highlight from all sentences
    sentences.forEach(s => {
        s.element.classList.remove('active');
        s.element.classList.add('played');
    });

    // Time & track set to 100% complete
    currentElapsedSeconds = totalDurationSeconds;
    updateTimeDisplay();
    trackFill.style.width = "100%";
    if (sentences.length) {
        lblCounter.textContent = `Line ${sentences.length} / ${sentences.length}`;
    }
}

function jumpAndPlay(idx) {
    if (idx < 0 || idx >= sentences.length) return;

    // Re-enable auto-scroll when user explicitly jumps
    isAutoScrollEnabled = true;
    scrollResumePill.classList.remove('show');

    window.speechSynthesis.cancel();
    playSentence(idx);
}

function togglePlayPause() {
    if (!sentences.length) return;

    if (isPlaying) {
        window.speechSynthesis.cancel();
        isPlaying = false;
        stopTimer();
        btnPlayPause.textContent = '▶';
        lblStatus.textContent = "Paused";
    } else {
        if (currentIndex === -1) currentIndex = 0;
        playSentence(currentIndex);
    }
}

function stopPlayback() {
    isPlaying = false;
    stopTimer();
    btnPlayPause.textContent = '▶';
    window.speechSynthesis.cancel();
    lblStatus.textContent = "Ready";
    currentElapsedSeconds = 0;
    updateTimeDisplay();
    trackFill.style.width = "0%";
    sentences.forEach(s => s.element.classList.remove('active'));
}

// --------------------------------------------------------------------------
// 9. Text Ingestion on Paste
// --------------------------------------------------------------------------
function handlePastedText(rawText) {
    if (!rawText || !rawText.trim()) return;

    stopPlayback();
    rawOriginalText = rawText.trim();
    cleanedText = cleanTextForTTS(rawOriginalText);

    // Use cleaned text by default if clean mode is enabled
    const activeText = isCleanMode ? (cleanedText || rawOriginalText) : rawOriginalText;
    const bundles = processTextInto20WordBundles(activeText, 20);
    if (!bundles.length) return;

    isAutoScrollEnabled = true;
    scrollResumePill.classList.remove('show');

    renderSentences(bundles);
    currentIndex = 0;
    updateProgress();

    // Start speaking immediately
    playSentence(0);
}

// --------------------------------------------------------------------------
// 10. Event Handlers & Shortcuts
// --------------------------------------------------------------------------
btnPlayPause.addEventListener('click', togglePlayPause);
btnPrev.addEventListener('click', () => { if (currentIndex > 0) jumpAndPlay(currentIndex - 1); });
btnNext.addEventListener('click', () => { if (currentIndex < sentences.length - 1) jumpAndPlay(currentIndex + 1); });

btnClear.addEventListener('click', () => {
    stopPlayback();
    editor.innerHTML = '';
    sentences = [];
    rawOriginalText = '';
    cleanedText = '';
    currentIndex = -1;
    totalDurationSeconds = 0;
    currentElapsedSeconds = 0;
    updateProgress();
    lblCounter.textContent = "Line 0 / 0";
    lblTime.textContent = "00:00 / 00:00";
    lblStatus.textContent = "Ready";
    scrollResumePill.classList.remove('show');
    editor.focus();
});

// Scrubbing / Clicking on timeline bar jumps to that percentage
trackBar.addEventListener('click', (e) => {
    if (!sentences.length || totalDurationSeconds <= 0) return;
    const rect = trackBar.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSeconds = fraction * totalDurationSeconds;

    // Find sentence matching target seconds
    let targetIdx = 0;
    for (let i = 0; i < sentences.length; i++) {
        if (targetSeconds >= sentences[i].startTime) {
            targetIdx = i;
        } else {
            break;
        }
    }
    jumpAndPlay(targetIdx);
});

// Paste button
btnPaste.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) handlePastedText(text);
    } catch (err) {
        const manual = prompt("Paste your text here:");
        if (manual) handlePastedText(manual);
    }
});

// Document paste (Ctrl + V)
document.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (text && text.trim()) handlePastedText(text);
});

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && (sentences.length > 0 && document.activeElement !== editor)) {
        e.preventDefault();
        togglePlayPause();
    } else if (e.code === 'ArrowLeft' && document.activeElement !== editor) {
        e.preventDefault();
        if (currentIndex > 0) jumpAndPlay(currentIndex - 1);
    } else if (e.code === 'ArrowRight' && document.activeElement !== editor) {
        e.preventDefault();
        if (currentIndex < sentences.length - 1) jumpAndPlay(currentIndex + 1);
    }
});
