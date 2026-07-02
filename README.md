# Just Text

A lightweight, cross-platform notepad built with **Tauri 2** (Rust backend + vanilla HTML/CSS/JS frontend). Tiny native binaries, Material Design Icons, and no JavaScript framework or build step.

## Features

- **Multi-tab editing** with unsaved-change indicators
- **Line numbers** in a synced gutter
- **Word wrap** toggle (`Alt+Z`, remembered between sessions) — soft-wrap long lines; the line-number gutter hides while wrapped
- **Cut / copy / paste** (native), plus **Copy All to Clipboard**
- **Find & Replace** with match-case, whole-word, wrap-around, replace and replace-all
- **Line tools**: sort (asc / desc / case-insensitive), remove duplicates, remove empty lines, trim trailing whitespace, and keep/remove lines that *start with*, *end with*, or *contain* text — applied to the selection or the whole document
- **Markdown preview** (`Ctrl/Cmd+Shift+P`) — live split-pane GitHub-flavored markdown with syntax-highlighted code blocks, tables, task lists, blockquotes, images, and **Mermaid diagrams**. Theme-aware and fully offline (libraries are bundled).
- **Local file** open and save (native dialogs) — open **any text file** (the dialog defaults to all files, with a text/code convenience filter), multi-select supported
- **Drag & drop** files onto the window to open them (each in a new tab)
- **AI assistant** — configure a provider (OpenAI-compatible, Anthropic, or local Ollama) and run a prompt over the selection or whole document to summarize, rewrite, fix, translate, etc., with one-click presets; preview the result and Replace / Insert / Copy. Requests route through the Rust HTTP layer (no browser CORS issues).
- **AI autocomplete** — toggle on inline "ghost text" completions from the same provider: pause while typing at the end of the document and a greyed suggestion appears; press **Tab** to accept, **Esc** to dismiss. Off by default (it makes API calls as you type). An optional separate **autocomplete model** can be set (e.g. a small fast model) so it differs from the model used by the AI panel.
- **Advanced spell check** (Hunspell `en_US` via [Typo.js](https://github.com/cfinke/Typo.js)) — squiggly underlines, suggestions via right-click **or `Ctrl/Cmd+.`** on the word at the cursor, *Add to Dictionary* (personal dictionary persisted locally), and *Ignore*; toggle from the toolbar. The dictionary is bundled, so it works fully offline.
- **Material Design Icons** ([MDI](https://pictogrammers.com/library/mdi/)) embedded inline as SVG — no icon font or network dependency
- **Light & dark themes** (toggle with `Ctrl/Cmd+T`, remembered between sessions)
- **Small native executable** per platform via the Tauri bundler

## Prerequisites

1. **Rust** — install from <https://rustup.rs>
2. **System WebView deps** (Linux only): `webkit2gtk`, `libappindicator`, `librsvg`, `patchelf` — see <https://tauri.app/start/prerequisites/>. macOS and Windows use the OS's built-in WebView2 / WKWebView.
3. **Tauri CLI**:

   ```bash
   cargo install tauri-cli --version "^2.0"
   ```

## Run in development

From the project root:

```bash
cargo tauri dev
```

This launches the app with hot-reloadable frontend files (no Node/Vite needed — the frontend is plain files in `src/`).

## Build a release executable

```bash
cargo tauri build
```

Bundles land in `src-tauri/target/release/bundle/`:

- **Windows** → `.msi` / `.exe`
- **macOS** → `.app` / `.dmg`
- **Linux** → `.AppImage` / `.deb` / `.rpm`

> Build on the target OS (Tauri does not cross-compile the system WebView).

## Automated release builds

`.github/workflows/release.yml` builds installers for **Windows, macOS (Intel + Apple Silicon), and Linux** and attaches them to a GitHub Release. Cut a release by pushing a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow creates a **draft** release with all platform binaries attached — review and publish it from the GitHub Releases page. You can also trigger it manually from the Actions tab (`workflow_dispatch`). No secrets to configure; it uses the built-in `GITHUB_TOKEN`.

## AI assistant setup

Click **AI** in the toolbar (or `Ctrl/Cmd+J`) → **Provider** to configure:

- **OpenAI-compatible** — works with OpenAI and any compatible endpoint (OpenRouter, Together, LM Studio, vLLM…). Set the Base URL (default `https://api.openai.com/v1`), API key, and model (e.g. `gpt-4o-mini`).
- **Anthropic (Claude)** — Base URL `https://api.anthropic.com`, your API key, and a model (e.g. `claude-3-5-sonnet-latest`).
- **Ollama (local)** — Base URL `http://localhost:11434`, no key, and a local model (e.g. `llama3.1`). Run `ollama serve` first.

Then select text (or leave none to use the whole document), pick a preset or type a prompt, **Run**, and **Replace / Insert below / Copy** the result.

Provider settings — including the API key — are stored locally in the app's data directory (browser `localStorage`) in plaintext. Use a key scoped/limited to your needs. Requests are made from the Rust side via the Tauri HTTP plugin, so they aren't subject to browser CORS.

## Running on macOS (unsigned builds)

The CI release builds are **not code-signed or notarized**, so macOS Gatekeeper will block them — you'll see *"Just Text is damaged and can't be opened"* (downloading sets a quarantine flag, and Apple Silicon also requires a valid signature). This is expected; the app is fine. To run it, re-sign it ad-hoc and clear the quarantine flag **once**:

1. Open the downloaded `.dmg` and drag **`Just Text.app`** into `/Applications` (you can't modify it inside the mounted dmg), then eject the dmg.
2. In Terminal:

   ```bash
   APP="/Applications/Just Text.app"
   xattr -dr com.apple.quarantine "$APP"
   codesign --force --deep --sign - "$APP"
   open "$APP"
   ```

The app launches now and stays launchable. Notes:

- Use the **`aarch64`** asset for Apple Silicon (M1–M4) or the **`x86_64`** asset for Intel Macs.
- If `xattr` reports *"operation not permitted"*, prefix the command with `sudo`.
- To remove all warnings for every user (no manual step), the app must be signed with an Apple **Developer ID** and notarized — this needs a paid Apple Developer account.

## Project layout

```
src/                     frontend (no build step)
  index.html
  styles.css
  main.js                tabs, gutter, find/replace, line ops, file I/O
  lineops.js             pure line-transformation functions (also unit-tested)
  spellcheck.js          spell-check overlay, suggestions, personal dictionary
  ai.js                  AI provider config + summarize/transform panel
  autocomplete.js        AI inline ghost-text completions (Tab to accept)
  preview.js             markdown preview (marked + highlight.js + mermaid)
  typo.js                bundled Typo.js (Hunspell) engine
  dictionaries/en_US/    bundled en_US.aff / en_US.dic
  vendor/                bundled libs: marked, DOMPurify, highlight.js, mermaid
src-tauri/               Rust backend
  Cargo.toml
  tauri.conf.json        window, bundle, withGlobalTauri config
  capabilities/          permission grants (core + dialog)
  icons/                 app icons
  src/
    main.rs              entry point
    lib.rs               Tauri commands: local file read/write
tests/lineops.test.js    dependency-free tests (node tests/lineops.test.js)
legacy-pyside6/          the previous PySide6/Qt implementation (kept for reference)
```

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| New tab | `Ctrl/Cmd+N` |
| Open file | `Ctrl/Cmd+O` |
| Save / Save As | `Ctrl/Cmd+S` / `+Shift+S` |
| Close tab | `Ctrl/Cmd+W` |
| Find & Replace | `Ctrl/Cmd+F` |
| Copy all to clipboard | `Ctrl/Cmd+Shift+C` |
| Spelling suggestions for word at cursor | `Ctrl/Cmd+.` |
| Open AI assistant | `Ctrl/Cmd+J` |
| Toggle markdown preview | `Ctrl/Cmd+Shift+P` |
| Toggle word wrap | `Alt+Z` |
| Toggle theme | `Ctrl/Cmd+T` |

## Notes

- The frontend also runs in a plain browser (open `src/index.html`) for quick UI tweaks — file dialogs are disabled outside the desktop app.
- To regenerate icons from a single source image: `cargo tauri icon path/to/icon.png`.


# How to run to app

```bash
APP="/Applications/Just Text.app"
xattr -dr com.apple.quarantine "$APP"
codesign --force --deep --sign - "$APP"
open "$APP"
```