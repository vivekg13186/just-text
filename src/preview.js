"use strict";

// Markdown preview: renders the active document as GitHub-flavored markdown
// with syntax-highlighted code blocks and live Mermaid diagrams. Rendered in a
// split pane beside the editor, updates live, and follows the light/dark theme.
// Mermaid (~3.5 MB) is loaded lazily the first time it's needed.
(function (root) {
  const Preview = {
    editor: null,
    pane: null,
    button: null,
    wrap: null,
    statusCb: null,
    enabled: false,
    _debounce: null,
    _seq: 0,
    _mermaidReady: false,
    _mermaidPromise: null,
    _mermaidTheme: null,

    init(editor, wrap, pane, button, statusCb) {
      this.editor = editor;
      this.wrap = wrap;
      this.pane = pane;
      this.button = button;
      this.statusCb = statusCb || function () {};
      if (window.marked) {
        marked.setOptions({ gfm: true, breaks: false });
      }
      this.button.onclick = () => this.toggle();
      // don't let links navigate the whole webview away
      this.pane.addEventListener("click", (e) => {
        const a = e.target.closest && e.target.closest("a[href]");
        if (a) {
          e.preventDefault();
          this.statusCb("Links are disabled in preview");
        }
      });
    },

    toggle() {
      this.setEnabled(!this.enabled);
    },
    setEnabled(on) {
      this.enabled = on;
      this.wrap.classList.toggle("preview-on", on);
      this.pane.hidden = !on;
      this.button.classList.toggle("active", on);
      if (on) this.renderNow();
    },

    onInput() {
      if (!this.enabled) return;
      clearTimeout(this._debounce);
      this._debounce = setTimeout(() => this.renderNow(), 250);
    },
    onTabSwitch() {
      if (this.enabled) this.renderNow();
    },
    onThemeChange() {
      if (this.enabled) this.renderNow();
    },

    async renderNow() {
      if (!window.marked) {
        this.pane.innerHTML = "<p>Markdown library not loaded.</p>";
        return;
      }
      const token = ++this._seq;
      const md = this.editor.value;
      let html = marked.parse(md);
      if (window.DOMPurify) html = DOMPurify.sanitize(html);
      this.pane.innerHTML = html;

      // syntax-highlight non-mermaid code blocks
      if (window.hljs) {
        this.pane.querySelectorAll("pre code").forEach((code) => {
          if (!code.classList.contains("language-mermaid")) {
            try {
              hljs.highlightElement(code);
            } catch (_) {}
          }
        });
      }

      // collect mermaid blocks and render them
      const mermaidCodes = this.pane.querySelectorAll("code.language-mermaid");
      if (mermaidCodes.length) {
        const nodes = [];
        mermaidCodes.forEach((code) => {
          const div = document.createElement("div");
          div.className = "mermaid";
          div.textContent = code.textContent;
          const pre = code.closest("pre");
          (pre || code).replaceWith(div);
          nodes.push(div);
        });
        try {
          await this._ensureMermaid();
          if (token !== this._seq) return; // a newer render superseded us
          await mermaid.run({ nodes });
        } catch (err) {
          nodes.forEach((n) => {
            if (!n.querySelector("svg")) {
              n.classList.add("mermaid-error");
              n.textContent = "Mermaid error: " + (err && err.message ? err.message : err);
            }
          });
        }
      }
    },

    _ensureMermaid() {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      const theme = dark ? "dark" : "default";
      if (this._mermaidReady) {
        if (this._mermaidTheme !== theme) {
          mermaid.initialize({ startOnLoad: false, theme, securityLevel: "strict" });
          this._mermaidTheme = theme;
        }
        return Promise.resolve();
      }
      if (this._mermaidPromise) return this._mermaidPromise;
      this.statusCb("Loading Mermaid…");
      this._mermaidPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "vendor/mermaid.min.js";
        s.onload = () => {
          mermaid.initialize({ startOnLoad: false, theme, securityLevel: "strict" });
          this._mermaidReady = true;
          this._mermaidTheme = theme;
          this.statusCb("Preview ready");
          resolve();
        };
        s.onerror = () => reject(new Error("failed to load mermaid"));
        document.head.appendChild(s);
      });
      return this._mermaidPromise;
    },
  };

  root.Preview = Preview;
})(window);
