# TTS Text Workspace

A minimalist, distraction-free in-browser Text-to-Speech (TTS) workspace with real-time sentence synchronization, Google Hindi voice support, smooth speed control, and smart auto-scrolling.

## Features
- **Instant Speech on Paste**: Automatically splits pasted text into sentences and begins speaking immediately in Google Hindi.
- **Double-Click to Jump**: Double-click any sentence or line to instantly start reading from that point.
- **Smooth Speed Slider**: Easily adjust playback speed from `0.75x` up to `2.50x` (default `1.45x`) using a continuous slider.
- **Full-Width Canvas**: Responsive, full-width comfortable reading layout without large empty margins.
- **Smart Auto-Scroll Lock**: Automatically centers active sentences, but intelligently pauses auto-scrolling if you scroll manually with mouse wheel or touch gestures to inspect other text.
- **Keyboard Shortcuts**:
  - `Space`: Play / Pause
  - `←` / `→`: Previous / Next sentence
  - `Ctrl + V`: Paste text and start reading
- **100% Client-Side**: No backend server or installation required. Runs directly in any modern web browser or via GitHub Pages.

## Project Structure
```text
├── index.html   # Main HTML structure
├── style.css    # Clean dark theme and responsive styles
├── app.js       # Core SpeechSynthesis logic, parsing, and interaction handlers
└── README.md    # Documentation
```

## How to Run
Simply open `index.html` in your web browser (Chrome, Edge, Brave, etc.) or host it on GitHub Pages.
