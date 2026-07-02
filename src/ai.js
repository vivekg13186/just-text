"use strict";

// AI assistant: configure a provider (OpenAI-compatible, Anthropic, or local
// Ollama) and run a prompt over the selection or whole document to summarize,
// rewrite, fix, translate, etc. HTTP goes through the Tauri HTTP plugin so
// provider APIs aren't blocked by browser CORS.
(function (root) {
  const TAURI = window.__TAURI__ || null;
  const httpFetch =
    TAURI && TAURI.http && TAURI.http.fetch ? TAURI.http.fetch : window.fetch.bind(window);

  const CFG_KEY = "justtext.ai";

  const DEFAULTS = {
    openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-3-5-sonnet-latest" },
    ollama: { baseUrl: "http://localhost:11434", model: "llama3.1" },
  };

  const PRESETS = [
    ["Summarize", "Summarize the text concisely, keeping the key points."],
    ["Improve writing", "Improve the writing: fix grammar, clarity and flow while preserving meaning and tone."],
    ["Fix grammar", "Fix only spelling and grammar mistakes. Do not otherwise change the wording or style."],
    ["Make concise", "Make the text more concise without losing important information."],
    ["Expand", "Expand the text with more detail and explanation."],
    ["Bullet points", "Rewrite the text as a clear, well-organized bulleted list."],
    ["Professional tone", "Rewrite the text in a clear, professional tone."],
    ["Translate to…", "Translate the text into "],
  ];

  const SYSTEM =
    "You are a precise writing assistant embedded in a plain-text editor. " +
    "Apply the user's instruction to the provided text. " +
    "Return ONLY the resulting text — no explanations, no preamble, no markdown code fences.";

  const AI = {
    editor: null,
    statusCb: null,
    _scope: null,
    _output: "",

    init(editor, statusCb) {
      this.editor = editor;
      this.statusCb = statusCb || function () {};
      this.cfg = this._load();
      this._bind();
    },

    // ---- config ----
    _load() {
      let cfg = {};
      try {
        cfg = JSON.parse(localStorage.getItem(CFG_KEY) || "{}");
      } catch {
        cfg = {};
      }
      cfg.provider = cfg.provider || "openai";
      return cfg;
    },
    _save() {
      localStorage.setItem(CFG_KEY, JSON.stringify(this.cfg));
    },
    isConfigured() {
      const c = this.cfg;
      if (!c.provider || !c.model || !c.baseUrl) return false;
      if (c.provider !== "ollama" && !c.apiKey) return false;
      return true;
    },

    // ---- DOM wiring ----
    _bind() {
      this.$ = (id) => document.getElementById(id);
      this.$("btn-ai").onclick = () => this.open();
      this.$("ai-close").onclick = () => this.close();
      this.$("ai-overlay").onclick = (e) => {
        if (e.target === this.$("ai-overlay")) this.close();
      };
      this.$("ai-settings-link").onclick = () => this._showSettings(true);
      this.$("ai-settings-back").onclick = () => this._showSettings(false);
      this.$("ai-save").onclick = () => this._onSave();
      this.$("ai-provider").onchange = () => this._onProviderChange();

      // preset chips
      const chips = this.$("ai-presets");
      PRESETS.forEach(([label, text]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ai-chip";
        b.textContent = label;
        b.onclick = () => {
          this.$("ai-prompt").value = text;
          this.$("ai-prompt").focus();
          if (text.endsWith(" ")) {
            const p = this.$("ai-prompt");
            p.setSelectionRange(p.value.length, p.value.length);
          }
        };
        chips.appendChild(b);
      });

      this.$("ai-run").onclick = () => this.run();
      this.$("ai-replace").onclick = () => this._apply("replace");
      this.$("ai-insert").onclick = () => this._apply("insert");
      this.$("ai-copy").onclick = () => this._apply("copy");
    },

    open() {
      // capture scope (selection vs whole document) before focus moves
      const s = this.editor.selectionStart;
      const e = this.editor.selectionEnd;
      this._scope = e > s ? { start: s, end: e } : { whole: true };
      this.$("ai-scope").textContent = e > s ? `Selected text (${e - s} chars)` : "Whole document";

      this._showOutput("");
      this.$("ai-overlay").hidden = false;
      if (!this.isConfigured()) {
        this._showSettings(true);
        this.statusCb("Configure an AI provider to continue");
      } else {
        this._showSettings(false);
        this.$("ai-prompt").focus();
      }
    },
    close() {
      this.$("ai-overlay").hidden = true;
    },

    _showSettings(on) {
      this.$("ai-main").hidden = on;
      this.$("ai-settings").hidden = !on;
      if (on) {
        this.$("ai-provider").value = this.cfg.provider;
        this._onProviderChange(true);
        this.$("ai-key").value = this.cfg.apiKey || "";
        this.$("ai-model").value = this.cfg.model || "";
        this.$("ai-completion-model").value = this.cfg.completionModel || "";
        this.$("ai-baseurl").value = this.cfg.baseUrl || "";
      }
    },
    _onProviderChange(keepValues) {
      const p = this.$("ai-provider").value;
      const d = DEFAULTS[p];
      // only overwrite when switching provider (not when first populating)
      if (!keepValues) {
        this.$("ai-baseurl").value = d.baseUrl;
        this.$("ai-model").value = d.model;
      }
      this.$("ai-key-row").style.display = p === "ollama" ? "none" : "";
      this.$("ai-model").placeholder = d.model;
      this.$("ai-baseurl").placeholder = d.baseUrl;
    },
    _onSave() {
      const p = this.$("ai-provider").value;
      this.cfg = {
        provider: p,
        baseUrl: (this.$("ai-baseurl").value || DEFAULTS[p].baseUrl).trim(),
        model: (this.$("ai-model").value || DEFAULTS[p].model).trim(),
        completionModel: this.$("ai-completion-model").value.trim(),
        apiKey: this.$("ai-key").value.trim(),
      };
      this._save();
      this.statusCb("AI provider saved");
      this._showSettings(false);
      this.$("ai-prompt").focus();
    },

    // ---- run ----
    _scopeText() {
      if (this._scope && this._scope.whole) return this.editor.value;
      if (this._scope) return this.editor.value.slice(this._scope.start, this._scope.end);
      return this.editor.value;
    },

    async run() {
      if (!this.isConfigured()) {
        this._showSettings(true);
        return;
      }
      const instruction = this.$("ai-prompt").value.trim();
      if (!instruction) {
        this.statusCb("Enter a prompt first");
        this.$("ai-prompt").focus();
        return;
      }
      const text = this._scopeText();
      const user = text ? `${instruction}\n\nTEXT:\n${text}` : instruction;

      this._setBusy(true);
      this.statusCb("Asking the model…");
      try {
        const out = await this._complete(SYSTEM, user);
        this._output = out.trim();
        this._showOutput(this._output);
        this.statusCb("Done");
      } catch (err) {
        this._showOutput("");
        this.statusCb("AI request failed");
        this.$("ai-error").textContent = String(err.message || err);
        this.$("ai-error").hidden = false;
      } finally {
        this._setBusy(false);
      }
    },

    _setBusy(on) {
      this.$("ai-run").disabled = on;
      this.$("ai-spinner").hidden = !on;
      this.$("ai-error").hidden = true;
    },

    _showOutput(text) {
      const has = !!text;
      this.$("ai-output-wrap").hidden = !has;
      this.$("ai-output").value = text || "";
    },

    // ---- autocomplete (used by autocomplete.js) ----
    async completion(before) {
      if (!this.isConfigured()) throw new Error("AI provider not configured");
      const system =
        "You are an inline autocomplete engine inside a plain-text editor. " +
        "Continue the user's text naturally from where it stops. " +
        "Return ONLY the continuation to append directly after the given text — " +
        "do not repeat any of the input, do not add quotes, labels or explanations. " +
        "Keep it brief: at most one sentence or line.";
      // use the dedicated autocomplete model if the user set one
      return this._complete(system, before, this.cfg.completionModel || undefined);
    },

    // ---- provider calls ----
    async _complete(system, user, modelOverride) {
      const c = this.cfg;
      const base = c.baseUrl.replace(/\/+$/, "");
      const model = modelOverride || c.model;
      let url, headers, body, pick;

      if (c.provider === "anthropic") {
        url = base + "/v1/messages";
        headers = {
          "Content-Type": "application/json",
          "x-api-key": c.apiKey,
          "anthropic-version": "2023-06-01",
        };
        body = {
          model,
          max_tokens: 4096,
          system,
          messages: [{ role: "user", content: user }],
        };
        pick = (j) => (j.content && j.content[0] && j.content[0].text) || "";
      } else if (c.provider === "ollama") {
        url = base + "/api/chat";
        headers = { "Content-Type": "application/json" };
        body = {
          model,
          stream: false,
          options: { temperature: 0.3 },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        };
        pick = (j) => (j.message && j.message.content) || "";
      } else {
        // OpenAI-compatible
        url = base + "/chat/completions";
        headers = {
          "Content-Type": "application/json",
          Authorization: "Bearer " + c.apiKey,
        };
        body = {
          model,
          temperature: 0.3,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        };
        pick = (j) => (j.choices && j.choices[0] && j.choices[0].message.content) || "";
      }

      const res = await httpFetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let detail = "";
        try {
          detail = await res.text();
        } catch {}
        throw new Error(`HTTP ${res.status} — ${detail.slice(0, 300)}`);
      }
      const json = await res.json();
      const out = pick(json);
      if (!out) throw new Error("Empty response from model");
      return out;
    },

    // ---- apply result ----
    _apply(mode) {
      const out = this._output;
      if (!out) return;
      if (mode === "copy") {
        navigator.clipboard.writeText(out).catch(() => {});
        this.statusCb("Copied AI output to clipboard");
        this.close();
        return;
      }
      const ed = this.editor;
      if (this._scope && this._scope.whole) {
        if (mode === "insert") {
          ed.value = ed.value + (ed.value.endsWith("\n") || !ed.value ? "" : "\n") + out;
        } else {
          ed.value = out;
        }
      } else {
        const { start, end } = this._scope;
        if (mode === "insert") {
          ed.setRangeText("\n" + out, end, end, "end");
        } else {
          ed.setRangeText(out, start, end, "end");
        }
      }
      ed.dispatchEvent(new Event("input", { bubbles: true }));
      ed.focus();
      this.statusCb(mode === "insert" ? "Inserted AI output" : "Replaced text with AI output");
      this.close();
    },
  };

  root.AI = AI;
})(window);
