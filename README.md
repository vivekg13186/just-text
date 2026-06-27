# Just Text

A lightweight, cross-platform notepad built with **Tauri 2** (Rust backend + vanilla HTML/CSS/JS frontend). Tiny native binaries, Material Design Icons, and no JavaScript framework or build step.

## Features

- **Multi-tab editing** with unsaved-change indicators
- **Line numbers** in a synced gutter
- **Cut / copy / paste** (native), plus **Copy All to Clipboard**
- **Find & Replace** with match-case, whole-word, wrap-around, replace and replace-all
- **Line tools**: sort (asc / desc / case-insensitive), remove duplicates, remove empty lines, trim trailing whitespace, and keep/remove lines that *start with*, *end with*, or *contain* text — applied to the selection or the whole document
- **Local file** open and save (native dialogs)
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

## Project layout

```
src/                     frontend (no build step)
  index.html
  styles.css
  main.js                tabs, gutter, find/replace, line ops, file I/O
  lineops.js             pure line-transformation functions (also unit-tested)
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
| Toggle theme | `Ctrl/Cmd+T` |

## Notes

- The frontend also runs in a plain browser (open `src/index.html`) for quick UI tweaks — file dialogs are disabled outside the desktop app.
- To regenerate icons from a single source image: `cargo tauri icon path/to/icon.png`.
