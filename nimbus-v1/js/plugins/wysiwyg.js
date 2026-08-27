/**
 * CNDS Nimbus — WYSIWYG Editor Plugin
 * Rich text editor using contentEditable with toolbar actions
 * Zero dependencies
 */
(() => {
  "use strict";

  const { NimbusComponent, EventHandler } = window.Nimbus;

  const NAME = "wysiwyg";
  const DATA_KEY = "cnds.wysiwyg";
  const EVENT_CHANGE = "change.cnds.wysiwyg";
  const EVENT_FOCUS = "focus.cnds.wysiwyg";
  const EVENT_BLUR = "blur.cnds.wysiwyg";
  const EVENT_INIT = "init.cnds.wysiwyg";
  const SELECTOR_INIT = "[data-cnds-wysiwyg-init]";

  const Default = {
    placeholder: "Write something...",
    height: null,
    minHeight: 200,
    maxHeight: 600,
    toolbar: [
      ["bold", "italic", "underline", "strikethrough"],
      ["heading", "fontSize"],
      ["foreColor", "hiliteColor"],
      ["alignLeft", "alignCenter", "alignRight", "alignJustify"],
      ["orderedList", "unorderedList"],
      ["indent", "outdent"],
      ["link", "image", "attachment", "table", "horizontalRule"],
      ["blockquote", "code"],
      ["undo", "redo"],
      ["removeFormat", "source", "fullscreen"]
    ],
    showStatusBar: true,
    initialContent: "",
    onChange: null
  };

  const DefaultType = {
    placeholder: "string",
    height: "(number|null)",
    minHeight: "number",
    maxHeight: "number",
    toolbar: "array",
    showStatusBar: "boolean",
    initialContent: "string",
    onChange: "(function|null)"
  };

  // SVG icons for toolbar buttons (inline, no external deps)
  const ICONS = {
    bold: '<svg viewBox="0 0 24 24"><path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/></svg>',
    italic:
      '<svg viewBox="0 0 24 24"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/></svg>',
    underline:
      '<svg viewBox="0 0 24 24"><path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z"/></svg>',
    strikethrough:
      '<svg viewBox="0 0 24 24"><path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z"/></svg>',
    alignLeft:
      '<svg viewBox="0 0 24 24"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>',
    alignCenter:
      '<svg viewBox="0 0 24 24"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>',
    alignRight:
      '<svg viewBox="0 0 24 24"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>',
    alignJustify:
      '<svg viewBox="0 0 24 24"><path d="M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z"/></svg>',
    orderedList:
      '<svg viewBox="0 0 24 24"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/></svg>',
    unorderedList:
      '<svg viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>',
    indent:
      '<svg viewBox="0 0 24 24"><path d="M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 9h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/></svg>',
    outdent:
      '<svg viewBox="0 0 24 24"><path d="M11 17h10v-2H11v2zm-8-5l4 4V8l-4 4zm0 9h18v-2H3v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
    image:
      '<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
    attachment:
      '<svg viewBox="0 0 24 24"><path d="M16.5,6V17.5A4,4 0 0,1 12.5,21.5A4,4 0 0,1 8.5,17.5V5A2.5,2.5 0 0,1 11,2.5A2.5,2.5 0 0,1 13.5,5V15.5A1,1 0 0,1 12.5,16.5A1,1 0 0,1 11.5,15.5V6H10V15.5A2.5,2.5 0 0,0 12.5,18A2.5,2.5 0 0,0 15,15.5V5A4,4 0 0,0 11,1A4,4 0 0,0 7,5V17.5A5.5,5.5 0 0,0 12.5,23A5.5,5.5 0 0,0 18,17.5V6H16.5Z"/></svg>',
    table:
      '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm0-6H4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4z"/></svg>',
    horizontalRule: '<svg viewBox="0 0 24 24"><path d="M2 11h20v2H2z"/></svg>',
    blockquote:
      '<svg viewBox="0 0 24 24"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>',
    code: '<svg viewBox="0 0 24 24"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>',
    removeFormat:
      '<svg viewBox="0 0 24 24"><path d="M3.27 5L2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21 18 19.73 3.27 5zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6z"/></svg>',
    source:
      '<svg viewBox="0 0 24 24"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>',
    fullscreen:
      '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    heading: null,
    fontSize: null,
    foreColor: null,
    hiliteColor: null
  };

  // Command mapping for toolbar actions
  const COMMANDS = {
    bold: { command: "bold" },
    italic: { command: "italic" },
    underline: { command: "underline" },
    strikethrough: { command: "strikeThrough" },
    alignLeft: { command: "justifyLeft" },
    alignCenter: { command: "justifyCenter" },
    alignRight: { command: "justifyRight" },
    alignJustify: { command: "justifyFull" },
    orderedList: { command: "insertOrderedList" },
    unorderedList: { command: "insertUnorderedList" },
    indent: { command: "indent" },
    outdent: { command: "outdent" },
    undo: { command: "undo" },
    redo: { command: "redo" },
    removeFormat: { command: "removeFormat" },
    horizontalRule: { command: "insertHorizontalRule" }
  };

  const HEADING_OPTIONS = [
    { value: "p", label: "Normal" },
    { value: "h1", label: "Heading 1" },
    { value: "h2", label: "Heading 2" },
    { value: "h3", label: "Heading 3" },
    { value: "h4", label: "Heading 4" }
  ];

  const FONT_SIZE_OPTIONS = [
    { value: "1", label: "Small" },
    { value: "3", label: "Normal" },
    { value: "5", label: "Large" },
    { value: "7", label: "Huge" }
  ];

  class Wysiwyg extends NimbusComponent {
    constructor(element, config) {
      super(element, config, Default, DefaultType, DATA_KEY);
      this._toolbar = null;
      this._content = null;
      this._source = null;
      this._statusBar = null;
      this._isSourceMode = false;
      this._isFullscreen = false;
      this._savedSelection = null;
      this._dialogOverlay = null;
      this._init();
    }

    // Public API
    getHTML() {
      return this._content.innerHTML;
    }

    getText() {
      return this._content.textContent || "";
    }

    setHTML(html) {
      this._content.innerHTML = html;
      if (this._source) {
        this._source.value = html;
      }
      this._updateStatusBar();
      this._triggerChange();
    }

    insertHTML(html) {
      this._content.focus();
      this._restoreSelection();
      document.execCommand("insertHTML", false, html);
      this._triggerChange();
    }

    clear() {
      this._content.innerHTML = "";
      if (this._source) {
        this._source.value = "";
      }
      this._updateStatusBar();
      this._triggerChange();
    }

    focus() {
      this._content.focus();
    }

    toggleSource() {
      this._toggleSourceMode();
    }

    toggleFullscreen() {
      this._toggleFullscreen();
    }

    execCommand(command, value) {
      this._content.focus();
      document.execCommand(command, false, value || null);
      this._updateToolbarState();
      this._triggerChange();
    }

    dispose() {
      if (this._dialogOverlay) {
        this._dialogOverlay.remove();
      }
      // Remove generated UI but keep original element
      super.dispose();
    }

    // Private
    _init() {
      this._buildUI();
      this._bindEvents();

      if (this._config.initialContent) {
        this._content.innerHTML = this._config.initialContent;
      } else if (this._element.tagName === "TEXTAREA") {
        this._content.innerHTML = this._element.value;
        this._element.style.display = "none";
      }

      this._updateStatusBar();
      EventHandler.trigger(this._element, EVENT_INIT);
    }

    _buildUI() {
      const wrapper = document.createElement("div");
      wrapper.className = "cnds-wysiwyg";

      // Toolbar
      this._toolbar = this._buildToolbar();
      wrapper.appendChild(this._toolbar);

      // Content area
      this._content = document.createElement("div");
      this._content.className = "cnds-wysiwyg-content";
      this._content.contentEditable = "true";
      this._content.setAttribute("data-placeholder", this._config.placeholder);
      this._content.setAttribute("role", "textbox");
      this._content.setAttribute("aria-multiline", "true");
      this._content.setAttribute("aria-label", "Rich text editor");

      if (this._config.height) {
        this._content.style.height = this._config.height + "px";
        this._content.style.minHeight = "auto";
        this._content.style.maxHeight = "none";
      } else {
        this._content.style.minHeight = this._config.minHeight + "px";
        this._content.style.maxHeight = this._config.maxHeight + "px";
      }

      wrapper.appendChild(this._content);

      // Source textarea
      this._source = document.createElement("textarea");
      this._source.className = "cnds-wysiwyg-source";
      this._source.setAttribute("aria-label", "HTML source");
      wrapper.appendChild(this._source);

      // Status bar
      if (this._config.showStatusBar) {
        this._statusBar = this._buildStatusBar();
        wrapper.appendChild(this._statusBar);
      }

      // Insert wrapper
      this._element.parentNode.insertBefore(wrapper, this._element.nextSibling);
      this._wrapper = wrapper;

      // If element is a textarea, hide it
      if (this._element.tagName === "TEXTAREA") {
        this._element.style.display = "none";
      }
    }

    _buildToolbar() {
      const toolbar = document.createElement("div");
      toolbar.className = "cnds-wysiwyg-toolbar";
      toolbar.setAttribute("role", "toolbar");
      toolbar.setAttribute("aria-label", "Formatting options");

      for (const group of this._config.toolbar) {
        const groupEl = document.createElement("div");
        groupEl.className = "cnds-wysiwyg-toolbar-group";

        for (const action of group) {
          const btn = this._createToolbarButton(action);
          if (btn) {
            groupEl.appendChild(btn);
          }
        }

        if (groupEl.children.length > 0) {
          toolbar.appendChild(groupEl);
        }
      }

      return toolbar;
    }

    _createToolbarButton(action) {
      // Special controls
      if (action === "heading") {
        return this._createHeadingSelect();
      }
      if (action === "fontSize") {
        return this._createFontSizeSelect();
      }
      if (action === "foreColor") {
        return this._createColorButton("foreColor", "A", "#000000");
      }
      if (action === "hiliteColor") {
        return this._createColorButton("hiliteColor", "H", "#ffff00");
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cnds-wysiwyg-btn";
      btn.setAttribute("data-action", action);
      btn.setAttribute("title", this._getActionTitle(action));
      btn.setAttribute("aria-label", this._getActionTitle(action));

      if (ICONS[action]) {
        btn.innerHTML = ICONS[action];
      } else {
        btn.textContent = action.charAt(0).toUpperCase();
      }

      return btn;
    }

    _createHeadingSelect() {
      const select = document.createElement("select");
      select.className = "cnds-wysiwyg-select";
      select.setAttribute("data-action", "heading");
      select.setAttribute("title", "Heading");
      select.setAttribute("aria-label", "Heading level");

      for (const opt of HEADING_OPTIONS) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
      }

      return select;
    }

    _createFontSizeSelect() {
      const select = document.createElement("select");
      select.className = "cnds-wysiwyg-select";
      select.setAttribute("data-action", "fontSize");
      select.setAttribute("title", "Font Size");
      select.setAttribute("aria-label", "Font size");

      for (const opt of FONT_SIZE_OPTIONS) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === "3") option.selected = true;
        select.appendChild(option);
      }

      return select;
    }

    _createColorButton(action, label, defaultColor) {
      const wrapper = document.createElement("span");
      wrapper.className = "cnds-wysiwyg-btn cnds-wysiwyg-color";
      wrapper.setAttribute(
        "title",
        action === "foreColor" ? "Text Color" : "Highlight Color"
      );

      const text = document.createElement("span");
      text.textContent = label;
      text.style.fontWeight = "bold";
      text.style.fontSize = "14px";
      wrapper.appendChild(text);

      const input = document.createElement("input");
      input.type = "color";
      input.value = defaultColor;
      input.setAttribute("data-action", action);
      input.setAttribute(
        "aria-label",
        action === "foreColor" ? "Text color" : "Highlight color"
      );
      wrapper.appendChild(input);

      return wrapper;
    }

    _buildStatusBar() {
      const bar = document.createElement("div");
      bar.className = "cnds-wysiwyg-statusbar";

      const left = document.createElement("div");
      left.className = "cnds-wysiwyg-statusbar-left";

      const wordCount = document.createElement("span");
      wordCount.className = "cnds-wysiwyg-word-count";
      wordCount.textContent = "Words: 0";
      left.appendChild(wordCount);

      const charCount = document.createElement("span");
      charCount.className = "cnds-wysiwyg-char-count";
      charCount.textContent = "Characters: 0";
      left.appendChild(charCount);

      const right = document.createElement("div");
      right.className = "cnds-wysiwyg-statusbar-right";

      const pathInfo = document.createElement("span");
      pathInfo.className = "cnds-wysiwyg-path-info";
      pathInfo.textContent = "p";
      right.appendChild(pathInfo);

      bar.appendChild(left);
      bar.appendChild(right);

      return bar;
    }

    _bindEvents() {
      // Toolbar button clicks
      EventHandler.on(this._toolbar, "click", ".cnds-wysiwyg-btn", (e) => {
        // Case 1: user clicked directly on the 4 px color swatch strip — the
        // browser already has the native picker open, so do nothing.
        if (e.target && e.target.type === "color") return;

        e.preventDefault();
        const btn = e.delegateTarget || e.currentTarget;

        // Case 2: user clicked the "A" / "H" label area of a color button — the
        // swatch strip is only 4 px tall so most clicks land on the wrapper span.
        // Programmatically clicking the hidden input opens the OS color picker.
        const colorInput = btn.querySelector('input[type="color"]');
        if (colorInput) {
          colorInput.click();
          return;
        }

        const action = btn.getAttribute("data-action");
        if (action) {
          this._handleAction(action);
        }
      });

      // Toolbar select changes
      EventHandler.on(this._toolbar, "change", "select", (e) => {
        const select = e.target;
        const action = select.getAttribute("data-action");
        if (action === "heading") {
          this._handleHeading(select.value);
        } else if (action === "fontSize") {
          this._handleFontSize(select.value);
        }
      });

      // Color input changes
      EventHandler.on(this._toolbar, "input", 'input[type="color"]', (e) => {
        const input = e.target;
        const action = input.getAttribute("data-action");
        this._content.focus();
        this._restoreSelection();
        document.execCommand(action, false, input.value);
        this._triggerChange();
      });

      // Content events
      EventHandler.on(this._content, "input", () => {
        this._updateStatusBar();
        this._syncToTextarea();
        this._triggerChange();
      });

      EventHandler.on(this._content, "focus", () => {
        EventHandler.trigger(this._element, EVENT_FOCUS);
      });

      EventHandler.on(this._content, "blur", () => {
        this._saveSelection();
        EventHandler.trigger(this._element, EVENT_BLUR);
      });

      EventHandler.on(this._content, "keyup", () => {
        this._updateToolbarState();
      });

      EventHandler.on(this._content, "mouseup", () => {
        this._updateToolbarState();
      });

      // Paste handler — clean up pasted content
      EventHandler.on(this._content, "paste", (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData(
          "text/html"
        );
        if (text) {
          const cleaned = this._cleanPastedHTML(text);
          document.execCommand("insertHTML", false, cleaned);
        } else {
          const plain = (e.clipboardData || window.clipboardData).getData(
            "text/plain"
          );
          document.execCommand("insertText", false, plain);
        }
        this._triggerChange();
      });

      // Source textarea sync
      EventHandler.on(this._source, "input", () => {
        this._content.innerHTML = this._source.value;
        this._updateStatusBar();
        this._syncToTextarea();
        this._triggerChange();
      });

      // Keyboard shortcuts
      EventHandler.on(this._content, "keydown", (e) => {
        this._handleKeyboard(e);
      });
    }

    _handleAction(action) {
      // Simple exec commands
      if (COMMANDS[action]) {
        this._content.focus();
        this._restoreSelection();
        document.execCommand(COMMANDS[action].command, false, null);
        this._updateToolbarState();
        this._triggerChange();
        return;
      }

      // Special actions
      switch (action) {
        case "link":
          this._showLinkDialog();
          break;
        case "image":
          this._showImageDialog();
          break;
        case "attachment":
          this._showAttachmentDialog();
          break;
        case "table":
          this._showTableDialog();
          break;
        case "blockquote":
          this._content.focus();
          this._restoreSelection();
          document.execCommand("formatBlock", false, "blockquote");
          this._triggerChange();
          break;
        case "code":
          this._insertCode();
          break;
        case "source":
          this._toggleSourceMode();
          break;
        case "fullscreen":
          this._toggleFullscreen();
          break;
      }
    }

    _handleHeading(value) {
      this._content.focus();
      this._restoreSelection();
      if (value === "p") {
        document.execCommand("formatBlock", false, "p");
      } else {
        document.execCommand("formatBlock", false, value);
      }
      this._triggerChange();
    }

    _handleFontSize(value) {
      this._content.focus();
      this._restoreSelection();
      document.execCommand("fontSize", false, value);
      this._triggerChange();
    }

    _handleKeyboard(e) {
      if (!e.ctrlKey && !e.metaKey) return;

      const key = e.key.toLowerCase();
      const shortcuts = {
        b: "bold",
        i: "italic",
        u: "underline",
        z: e.shiftKey ? "redo" : "undo"
      };

      if (shortcuts[key]) {
        e.preventDefault();
        document.execCommand(shortcuts[key], false, null);
        this._updateToolbarState();
        this._triggerChange();
      }
    }

    // --- Selection management ---
    _saveSelection() {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        this._savedSelection = sel.getRangeAt(0).cloneRange();
      }
    }

    _restoreSelection() {
      if (this._savedSelection) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(this._savedSelection);
      }
    }

    // --- Toolbar state ---
    _updateToolbarState() {
      const buttons = this._toolbar.querySelectorAll(
        ".cnds-wysiwyg-btn[data-action]"
      );
      const stateCommands = ["bold", "italic", "underline", "strikethrough"];

      const commandMap = {
        bold: "bold",
        italic: "italic",
        underline: "underline",
        strikethrough: "strikeThrough"
      };

      buttons.forEach((btn) => {
        const action = btn.getAttribute("data-action");
        if (stateCommands.includes(action) && commandMap[action]) {
          const isActive = document.queryCommandState(commandMap[action]);
          btn.classList.toggle("active", isActive);
        }
      });

      // Update heading select
      const headingSelect = this._toolbar.querySelector(
        'select[data-action="heading"]'
      );
      if (headingSelect) {
        const block = document.queryCommandValue("formatBlock");
        const normalized = block.toLowerCase().replace(/[<>]/g, "");
        const match = HEADING_OPTIONS.find((o) => o.value === normalized);
        headingSelect.value = match ? match.value : "p";
      }
    }

    // --- Dialogs ---
    _showLinkDialog() {
      this._saveSelection();

      const sel = window.getSelection();
      let existingUrl = "";
      let existingText = "";

      if (sel.rangeCount > 0) {
        existingText = sel.toString();
        const anchor = sel.anchorNode.parentElement.closest("a");
        if (anchor) {
          existingUrl = anchor.href;
        }
      }

      this._showDialog(
        "Insert Link",
        [
          {
            name: "url",
            label: "URL",
            type: "text",
            value: existingUrl,
            placeholder: "https://example.com"
          },
          {
            name: "text",
            label: "Text",
            type: "text",
            value: existingText,
            placeholder: "Link text"
          },
          {
            name: "newTab",
            label: "Open in new tab",
            type: "checkbox",
            value: true
          }
        ],
        (data) => {
          this._restoreSelection();
          this._content.focus();

          const url = data.url;
          if (!url) return;

          const text = data.text || url;
          const target = data.newTab
            ? ' target="_blank" rel="noopener noreferrer"'
            : "";
          const html =
            '<a href="' +
            url +
            '"' +
            target +
            ">" +
            this._escapeHTML(text) +
            "</a>";
          document.execCommand("insertHTML", false, html);
          this._triggerChange();
        }
      );
    }

    _showImageDialog() {
      this._saveSelection();

      this._showDialog(
        "Insert Image",
        [
          {
            name: "url",
            label: "Image URL",
            type: "text",
            value: "",
            placeholder: "https://example.com/image.jpg"
          },
          {
            name: "alt",
            label: "Alt Text",
            type: "text",
            value: "",
            placeholder: "Image description"
          },
          {
            name: "width",
            label: "Width (optional)",
            type: "text",
            value: "",
            placeholder: "e.g. 300 or 50%"
          }
        ],
        (data) => {
          this._restoreSelection();
          this._content.focus();

          const url = data.url;
          if (!url) return;

          let html = '<img src="' + url + '"';
          if (data.alt) html += ' alt="' + this._escapeHTML(data.alt) + '"';
          if (data.width)
            html += ' width="' + this._escapeHTML(data.width) + '"';
          html += ' style="max-width:100%;height:auto;">';
          document.execCommand("insertHTML", false, html);
          this._triggerChange();
        }
      );
    }

    _showAttachmentDialog() {
      this._saveSelection();

      this._showDialog(
        "Insert Attachment",
        [
          {
            name: "url",
            label: "File URL",
            type: "text",
            value: "",
            placeholder: "https://example.com/file.pdf"
          },
          {
            name: "fileName",
            label: "File Name (optional)",
            type: "text",
            value: "",
            placeholder: "document.pdf"
          }
        ],
        (data) => {
          this._restoreSelection();
          this._content.focus();

          const url = data.url;
          if (!url) return;

          const fileName =
            data.fileName || url.split("/").pop() || "attachment";
          const html =
            '<a class="cnds-wysiwyg-attachment" href="' +
            url +
            '" download target="_blank" rel="noopener noreferrer">📎 ' +
            this._escapeHTML(fileName) +
            "</a>";
          document.execCommand("insertHTML", false, html);
          this._triggerChange();
        }
      );
    }

    _showTableDialog() {
      this._saveSelection();

      this._showDialog(
        "Insert Table",
        [
          {
            name: "rows",
            label: "Rows",
            type: "text",
            value: "3",
            placeholder: "3"
          },
          {
            name: "cols",
            label: "Columns",
            type: "text",
            value: "3",
            placeholder: "3"
          }
        ],
        (data) => {
          this._restoreSelection();
          this._content.focus();

          const rows = parseInt(data.rows, 10) || 3;
          const cols = parseInt(data.cols, 10) || 3;

          let html = "<table><thead><tr>";
          for (let c = 0; c < cols; c++) {
            html += "<th>Header " + (c + 1) + "</th>";
          }
          html += "</tr></thead><tbody>";
          for (let r = 0; r < rows; r++) {
            html += "<tr>";
            for (let c = 0; c < cols; c++) {
              html += "<td>&nbsp;</td>";
            }
            html += "</tr>";
          }
          html += "</tbody></table><p><br></p>";
          document.execCommand("insertHTML", false, html);
          this._triggerChange();
        }
      );
    }

    _insertCode() {
      this._content.focus();
      this._restoreSelection();

      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const text = sel.toString();
        if (text.includes("\n") || text.length > 60) {
          // Multi-line: wrap in pre>code
          const html =
            "<pre><code>" + this._escapeHTML(text) + "</code></pre><p><br></p>";
          document.execCommand("insertHTML", false, html);
        } else {
          // Inline code
          const html =
            "<code>" + this._escapeHTML(text || "code") + "</code>&nbsp;";
          document.execCommand("insertHTML", false, html);
        }
      }
      this._triggerChange();
    }

    // --- Dialog system ---
    _showDialog(title, fields, onConfirm) {
      // Remove any existing dialog before opening a new one
      if (this._dialogOverlay) {
        this._dialogOverlay.remove();
      }

      // Unique id prefix for aria-labelledby / label[for] associations
      const uid = "cnds-wd-" + Date.now();

      // Backdrop — handles click-outside-to-close and transition animation
      const overlay = document.createElement("div");
      overlay.className = "cnds-wysiwyg-dialog-overlay";

      // Dialog panel — role="dialog" + aria-modal for screen readers
      const dialog = document.createElement("div");
      dialog.className = "cnds-wysiwyg-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", uid + "-title");

      // Title — Nimbus fw-semibold heading
      const titleEl = document.createElement("h6");
      titleEl.id = uid + "-title";
      titleEl.className = "mb-3 fw-semibold";
      titleEl.textContent = title;
      dialog.appendChild(titleEl);

      const inputs = {};

      for (const field of fields) {
        // mb-3 field wrapper matches Nimbus form spacing
        const fieldEl = document.createElement("div");
        fieldEl.className = "mb-3";

        if (field.type === "checkbox") {
          // Nimbus form-check pattern
          const checkDiv = document.createElement("div");
          checkDiv.className = "form-check";

          const input = document.createElement("input");
          input.type = "checkbox";
          input.id = uid + "-" + field.name;
          input.className = "form-check-input";
          input.checked = !!field.value;
          inputs[field.name] = input;

          const label = document.createElement("label");
          label.className = "form-check-label";
          label.htmlFor = input.id;
          label.textContent = field.label;

          checkDiv.appendChild(input);
          checkDiv.appendChild(label);
          fieldEl.appendChild(checkDiv);
        } else {
          // Nimbus form-label + form-control pattern with explicit for/id association
          const label = document.createElement("label");
          label.className = "form-label";
          label.htmlFor = uid + "-" + field.name;
          label.textContent = field.label;
          fieldEl.appendChild(label);

          const input = document.createElement("input");
          input.type = field.type || "text";
          input.id = uid + "-" + field.name;
          input.className = "form-control form-control-sm";
          input.value = field.value || "";
          if (field.placeholder) input.placeholder = field.placeholder;
          inputs[field.name] = input;
          fieldEl.appendChild(input);
        }

        dialog.appendChild(fieldEl);
      }

      // Action row — Nimbus flex utilities, Nimbus btn classes
      const actions = document.createElement("div");
      actions.className = "d-flex justify-content-end gap-2 mt-3";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "btn btn-outline-secondary btn-sm";
      cancelBtn.textContent = "Cancel";

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "btn btn-primary btn-sm";
      confirmBtn.textContent = "Insert";

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      this._dialogOverlay = overlay;

      // Trigger enter animation on next frame
      requestAnimationFrame(() => {
        overlay.classList.add("show");
      });

      // Focus the first text input after the animation starts
      const firstInput = dialog.querySelector('input[type="text"]');
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
      }

      const closeDialog = () => {
        overlay.classList.remove("show");
        setTimeout(() => {
          overlay.remove();
          this._dialogOverlay = null;
        }, 200);
      };

      cancelBtn.addEventListener("click", closeDialog);

      // Click-outside closes the dialog
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeDialog();
      });

      confirmBtn.addEventListener("click", () => {
        const data = {};
        for (const [name, input] of Object.entries(inputs)) {
          data[name] = input.type === "checkbox" ? input.checked : input.value;
        }
        closeDialog();
        setTimeout(() => onConfirm(data), 220);
      });

      dialog.addEventListener("keydown", (e) => {
        // Enter confirms from any text input
        if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") {
          e.preventDefault();
          confirmBtn.click();
        }
        // Escape dismisses
        if (e.key === "Escape") {
          closeDialog();
        }
        // Tab focus trap — cycle within the dialog
        if (e.key === "Tab") {
          const focusable = dialog.querySelectorAll(
            'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      });
    }

    // --- Source mode ---
    _toggleSourceMode() {
      this._isSourceMode = !this._isSourceMode;

      if (this._isSourceMode) {
        this._source.value = this._content.innerHTML;
        this._wrapper.classList.add("source-mode");
        this._source.focus();
      } else {
        this._content.innerHTML = this._source.value;
        this._wrapper.classList.remove("source-mode");
        this._content.focus();
        this._updateStatusBar();
        this._syncToTextarea();
      }

      // Toggle source button active state
      const sourceBtn = this._toolbar.querySelector('[data-action="source"]');
      if (sourceBtn) {
        sourceBtn.classList.toggle("active", this._isSourceMode);
      }
    }

    // --- Fullscreen ---
    _toggleFullscreen() {
      this._isFullscreen = !this._isFullscreen;
      this._wrapper.classList.toggle("fullscreen", this._isFullscreen);

      if (this._isFullscreen) {
        this._wrapper.style.display = "flex";
        this._wrapper.style.flexDirection = "column";
        document.body.style.overflow = "hidden";
      } else {
        this._wrapper.style.display = "";
        this._wrapper.style.flexDirection = "";
        document.body.style.overflow = "";
      }

      const fsBtn = this._toolbar.querySelector('[data-action="fullscreen"]');
      if (fsBtn) {
        fsBtn.classList.toggle("active", this._isFullscreen);
      }
    }

    // --- Status bar ---
    _updateStatusBar() {
      if (!this._statusBar) return;

      const text = this._content.textContent || "";
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;

      const wordEl = this._statusBar.querySelector(".cnds-wysiwyg-word-count");
      const charEl = this._statusBar.querySelector(".cnds-wysiwyg-char-count");
      const pathEl = this._statusBar.querySelector(".cnds-wysiwyg-path-info");

      if (wordEl) wordEl.textContent = "Words: " + words;
      if (charEl) charEl.textContent = "Characters: " + chars;

      // Element path
      if (pathEl) {
        const sel = window.getSelection();
        if (sel.rangeCount > 0 && this._content.contains(sel.anchorNode)) {
          const path = [];
          let node = sel.anchorNode;
          if (node.nodeType === 3) node = node.parentNode;
          while (node && node !== this._content) {
            if (node.nodeType === 1) {
              path.unshift(node.tagName.toLowerCase());
            }
            node = node.parentNode;
          }
          pathEl.textContent = path.join(" > ") || "p";
        }
      }
    }

    // --- Sync ---
    _syncToTextarea() {
      if (this._element.tagName === "TEXTAREA") {
        this._element.value = this._content.innerHTML;
      }
    }

    _triggerChange() {
      EventHandler.trigger(this._element, EVENT_CHANGE, {
        html: this._content.innerHTML,
        text: this._content.textContent
      });

      if (typeof this._config.onChange === "function") {
        this._config.onChange(this._content.innerHTML);
      }
    }

    // --- Utilities ---
    _escapeHTML(str) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }

    _cleanPastedHTML(html) {
      // Remove Word/Office markup
      let clean = html
        .replace(/<meta[^>]*>/gi, "")
        .replace(/<link[^>]*>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/class="[^"]*"/gi, "")
        .replace(/style="[^"]*"/gi, "")
        .replace(/<\/?span[^>]*>/gi, "")
        .replace(/<\/?font[^>]*>/gi, "")
        .replace(/<\/?div[^>]*>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<\/?o:[^>]*>/gi, "")
        .replace(/<\/?v:[^>]*>/gi, "")
        .replace(/<\/?xml[^>]*>/gi, "");

      // Normalize whitespace
      clean = clean.replace(/\n\s*\n/g, "\n").trim();

      return clean;
    }

    _getActionTitle(action) {
      const titles = {
        bold: "Bold (Ctrl+B)",
        italic: "Italic (Ctrl+I)",
        underline: "Underline (Ctrl+U)",
        strikethrough: "Strikethrough",
        alignLeft: "Align Left",
        alignCenter: "Align Center",
        alignRight: "Align Right",
        alignJustify: "Justify",
        orderedList: "Ordered List",
        unorderedList: "Unordered List",
        indent: "Indent",
        outdent: "Outdent",
        link: "Insert Link",
        image: "Insert Image",
        attachment: "Insert Attachment",
        table: "Insert Table",
        horizontalRule: "Horizontal Rule",
        blockquote: "Blockquote",
        code: "Code",
        undo: "Undo (Ctrl+Z)",
        redo: "Redo (Ctrl+Shift+Z)",
        removeFormat: "Remove Formatting",
        source: "View Source",
        fullscreen: "Fullscreen"
      };
      return titles[action] || action;
    }

    // Static
    static get Default() {
      return Default;
    }
    static get DefaultType() {
      return DefaultType;
    }
    static get NAME() {
      return NAME;
    }

    static jQueryInterface(config, ...args) {
      return this.each(function () {
        let instance = Wysiwyg.getInstance(this);
        if (!instance) {
          instance = new Wysiwyg(
            this,
            typeof config === "object" ? config : {}
          );
        }
        if (typeof config === "string") {
          if (typeof instance[config] === "undefined") {
            throw new TypeError('No method named "' + config + '"');
          }
          instance[config](...args);
        }
      });
    }
  }

  // Auto-init
  function autoInit(root = document) {
    const elements = root.querySelectorAll(SELECTOR_INIT);
    elements.forEach((el) => {
      if (!Wysiwyg.getInstance(el)) {
        new Wysiwyg(el);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => autoInit());
  } else {
    autoInit();
  }

  // Export
  window.Nimbus.Wysiwyg = Wysiwyg;

  // Register with DataAPI
  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent("wysiwyg", Wysiwyg);
  }
})();
