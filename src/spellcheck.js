"use strict";

// Advanced spell checker built on Typo.js (Hunspell en_US):
//  - squiggly underlines for misspellings via a synced overlay layer
//  - right-click a misspelled word for suggestions / add-to-dictionary / ignore
//  - personal dictionary persisted in localStorage
(function (root) {
  const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)*/g;
  const CUSTOM_KEY = "justtext.customDict";
  const ENABLED_KEY = "justtext.spellEnabled";

  const Spellcheck = {
    editor: null,
    highlights: null,
    button: null,
    statusCb: null,
    typo: null,
    ready: false,
    enabled: false,
    _cache: new Map(), // word(lowercased) -> isCorrect
    _custom: new Set(),
    _ignore: new Set(),
    _charWidth: 8,
    _debounce: null,
    _wrap: false,

    setWrap(on) {
      this._wrap = !!on;
    },

    init(editor, highlights, button, statusCb) {
      this.editor = editor;
      this.highlights = highlights;
      this.button = button;
      this.statusCb = statusCb || function () {};
      this._loadCustom();
      this.enabled = localStorage.getItem(ENABLED_KEY) !== "0";
      this._measureChar();

      if (this.button) {
        this.button.onclick = () => this.toggle();
        this.button.classList.toggle("active", this.enabled);
      }
      this.editor.addEventListener("contextmenu", (e) => this._onContextMenu(e));
      this.editor.addEventListener("keydown", (e) => {
        // Ctrl+. / Cmd+. : suggest spellings for the word at the caret
        if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === ".") {
          e.preventDefault();
          this.suggestAtCaret();
        } else if (e.key === "Escape" && this._menu) {
          this._closeMenu();
        }
      });
      document.addEventListener("click", () => this._closeMenu());
      window.addEventListener("resize", () => this._measureChar());

      if (this.enabled) this._ensureLoaded();
      else this._clear();
    },

    // ---- dictionary loading ----
    async _ensureLoaded() {
      if (this.ready || this._loading) return;
      this._loading = true;
      this.statusCb("Loading spell-check dictionary…");
      try {
        const base = "dictionaries/en_US/en_US";
        const [aff, dic] = await Promise.all([
          fetch(base + ".aff").then((r) => r.text()),
          fetch(base + ".dic").then((r) => r.text()),
        ]);
        // eslint-disable-next-line no-undef
        this.typo = new Typo("en_US", aff, dic);
        this.ready = true;
        this.statusCb("Spell-check ready");
        this.refresh();
      } catch (err) {
        this.statusCb("Spell-check failed to load");
        console.error("spellcheck:", err);
      } finally {
        this._loading = false;
      }
    },

    _loadCustom() {
      try {
        const arr = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
        this._custom = new Set(arr);
      } catch {
        this._custom = new Set();
      }
    },
    _saveCustom() {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify([...this._custom]));
    },

    // ---- enable / disable ----
    setEnabled(on) {
      this.enabled = on;
      localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
      if (this.button) this.button.classList.toggle("active", on);
      if (on) {
        this._ensureLoaded();
        if (this.ready) this.refresh();
      } else {
        this._clear();
      }
    },
    toggle() {
      this.setEnabled(!this.enabled);
    },

    // ---- checking ----
    _isCorrect(word) {
      if (word.length < 2) return true;
      if (/\d/.test(word)) return true;
      const lower = word.toLowerCase();
      if (this._custom.has(lower) || this._ignore.has(lower)) return true;
      if (this._cache.has(lower)) return this._cache.get(lower);
      const ok = this.typo ? this.typo.check(word) : true;
      this._cache.set(lower, ok);
      return ok;
    },

    // ---- overlay rendering ----
    refresh() {
      if (!this.enabled || !this.ready) return;
      clearTimeout(this._debounce);
      this._debounce = setTimeout(() => this._render(), 200);
    },
    refreshNow() {
      if (!this.enabled || !this.ready) return;
      this._render();
    },

    _render() {
      const text = this.editor.value;
      let html = "";
      let last = 0;
      let m;
      WORD_RE.lastIndex = 0;
      while ((m = WORD_RE.exec(text)) !== null) {
        const word = m[0];
        if (this._isCorrect(word)) continue;
        html += esc(text.slice(last, m.index));
        html += '<mark class="sp-err">' + esc(word) + "</mark>";
        last = m.index + word.length;
      }
      html += esc(text.slice(last));
      this.highlights.innerHTML = html;
      this.syncScroll();
    },

    _clear() {
      if (this.highlights) this.highlights.innerHTML = "";
    },

    syncScroll() {
      if (!this.highlights) return;
      this.highlights.scrollTop = this.editor.scrollTop;
      this.highlights.scrollLeft = this.editor.scrollLeft;
    },

    onInput() {
      // text changed: drop the overlay immediately so stale marks don't linger
      if (this.enabled && this.ready) this.refresh();
    },
    onScroll() {
      this.syncScroll();
    },
    onTabSwitch() {
      this._ignore.clear();
      if (this.enabled && this.ready) this.refreshNow();
      else this._clear();
    },

    // ---- char width for click->word mapping (monospace) ----
    _measureChar() {
      const cs = getComputedStyle(this.editor);
      const canvas = (this._canvas = this._canvas || document.createElement("canvas"));
      const ctx = canvas.getContext("2d");
      ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
      this._charWidth = ctx.measureText("MMMMMMMMMM").width / 10 || 8;
      this._lineHeight = parseFloat(cs.lineHeight) || 18;
      this._padL = parseFloat(cs.paddingLeft) || 0;
      this._padT = parseFloat(cs.paddingTop) || 0;
    },

    // Find the word surrounding an absolute offset in the textarea value.
    _wordAtIndex(index) {
      const v = this.editor.value;
      const isW = (ch) => ch && /[A-Za-z']/.test(ch);
      let s = index, e = index;
      while (s > 0 && isW(v[s - 1])) s--;
      while (e < v.length && isW(v[e])) e++;
      const raw = v.slice(s, e);
      const lead = (raw.match(/^'+/) || [""])[0].length; // trim leading apostrophes
      const word = raw.replace(/^'+|'+$/g, "");
      if (!word) return null;
      return { word, start: s + lead, end: s + lead + word.length };
    },

    // Map a click to the nearest character offset (monospace arithmetic).
    _wordAtPoint(clientX, clientY) {
      const rect = this.editor.getBoundingClientRect();
      const x = clientX - rect.left - this._padL + this.editor.scrollLeft;
      const y = clientY - rect.top - this._padT + this.editor.scrollTop;
      const row = Math.floor(y / this._lineHeight);
      const col = Math.round(x / this._charWidth);
      const lines = this.editor.value.split("\n");
      if (row < 0 || row >= lines.length) return null;
      const c = Math.max(0, Math.min(col, lines[row].length));
      let base = 0;
      for (let i = 0; i < row; i++) base += lines[i].length + 1;
      return this._wordAtIndex(base + c);
    },

    // Pixel position (viewport coords) just below a given character offset.
    _caretXY(index) {
      const before = this.editor.value.slice(0, index);
      const rows = before.split("\n");
      const row = rows.length - 1;
      const col = rows[row].length;
      const rect = this.editor.getBoundingClientRect();
      return {
        x: rect.left + this._padL + col * this._charWidth - this.editor.scrollLeft,
        y: rect.top + this._padT + (row + 1) * this._lineHeight - this.editor.scrollTop,
      };
    },

    // Ctrl+Space entry point: suggest for the word at the caret.
    suggestAtCaret() {
      if (!this.ready) {
        this._ensureLoaded();
        this.statusCb("Spell-check still loading — try again in a moment");
        return;
      }
      const hit = this._wordAtIndex(this.editor.selectionStart);
      if (!hit) {
        this.statusCb("No word at cursor");
        return;
      }
      if (this._isCorrect(hit.word)) {
        this.statusCb(`"${hit.word}" looks correct`);
        return;
      }
      const suggestions = (this.typo.suggest(hit.word, 7) || []).filter(Boolean);
      const { x, y } = this._caretXY(hit.start);
      this._openMenu(x, y, hit, suggestions);
    },

    // ---- context menu ----
    _onContextMenu(e) {
      if (!this.enabled || !this.ready) return; // allow native menu
      // In wrap mode the monospace coordinate math is unreliable; right-click
      // moves the caret in the textarea, so use the caret offset instead.
      const hit = this._wrap
        ? this._wordAtIndex(this.editor.selectionStart)
        : this._wordAtPoint(e.clientX, e.clientY);
      if (!hit || this._isCorrect(hit.word)) return; // not a misspelling -> native menu
      e.preventDefault();
      const suggestions = (this.typo.suggest(hit.word, 7) || []).filter(Boolean);
      this._openMenu(e.clientX, e.clientY, hit, suggestions);
    },

    _openMenu(x, y, hit, suggestions) {
      this._closeMenu();
      const menu = document.createElement("div");
      menu.className = "spell-menu";
      menu.style.left = x + "px";
      menu.style.top = y + "px";

      const addItem = (label, fn, cls) => {
        const b = document.createElement("button");
        b.textContent = label;
        if (cls) b.className = cls;
        b.onmousedown = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          fn();
          this._closeMenu();
        };
        menu.appendChild(b);
      };

      if (suggestions.length) {
        suggestions.forEach((s) => addItem(s, () => this._replace(hit, s), "sp-suggest"));
      } else {
        const none = document.createElement("div");
        none.className = "sp-none";
        none.textContent = "No suggestions";
        menu.appendChild(none);
      }
      const hr = document.createElement("hr");
      menu.appendChild(hr);
      addItem("Add to Dictionary", () => this._addToDict(hit.word));
      addItem("Ignore", () => this._ignoreWord(hit.word));

      document.body.appendChild(menu);
      this._menu = menu;
      // keep within viewport
      const r = menu.getBoundingClientRect();
      if (r.right > innerWidth) menu.style.left = innerWidth - r.width - 6 + "px";
      if (r.bottom > innerHeight) menu.style.top = innerHeight - r.height - 6 + "px";
    },

    _closeMenu() {
      if (this._menu) {
        this._menu.remove();
        this._menu = null;
      }
    },

    _replace(hit, word) {
      this.editor.setRangeText(word, hit.start, hit.end, "end");
      this.editor.focus();
      // trigger main.js input handling (dirty, gutter) + our refresh
      this.editor.dispatchEvent(new Event("input", { bubbles: true }));
      this.refreshNow();
    },
    _addToDict(word) {
      this._custom.add(word.toLowerCase());
      this._saveCustom();
      this._cache.delete(word.toLowerCase());
      this.refreshNow();
      this.statusCb(`Added "${word}" to dictionary`);
    },
    _ignoreWord(word) {
      this._ignore.add(word.toLowerCase());
      this.refreshNow();
    },
  };

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  root.Spellcheck = Spellcheck;
})(window);
