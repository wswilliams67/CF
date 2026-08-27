/**
 * ============================================================
 * CNDS File Upload Plugin
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Drag & drop file upload with preview, validation,
 * progress tracking, and file list management.
 *
 * Usage:
 *   <div data-cnds-file-upload-init>
 *     <input type="file" multiple />
 *   </div>
 *
 * ============================================================
 */

(() => {
  "use strict";

  const { Utils, EventHandler, NimbusComponent } = window.Nimbus;

  const NAME = "fileupload";
  const EVENT_KEY = ".cnds." + NAME;
  const EVENT_ADD = "add" + EVENT_KEY;
  const EVENT_REMOVE = "remove" + EVENT_KEY;
  const EVENT_ERROR = "error" + EVENT_KEY;
  const EVENT_CHANGE = "change" + EVENT_KEY;

  const UPLOAD_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>';
  const FILE_ICON = "📄";
  const IMAGE_EXTENSIONS = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
    "bmp",
    "ico"
  ];

  const Default = {
    multiple: true,
    maxFiles: 10,
    maxSize: 10 * 1024 * 1024, // 10MB
    acceptedTypes: null, // e.g. "image/*,.pdf,.doc"
    showPreview: true,
    showFileList: true,
    autoUpload: false,
    uploadUrl: null,
    uploadMethod: "POST",
    uploadFieldName: "file",
    dropzoneText: "Drag & drop files here or <strong>browse</strong>",
    dropzoneHint: "",
    disabled: false
  };

  const DefaultType = {
    multiple: "boolean",
    maxFiles: "number",
    maxSize: "number",
    acceptedTypes: "(string|null)",
    showPreview: "boolean",
    showFileList: "boolean",
    autoUpload: "boolean",
    uploadUrl: "(string|null)",
    uploadMethod: "string",
    uploadFieldName: "string",
    dropzoneText: "string",
    dropzoneHint: "string",
    disabled: "boolean"
  };

  class FileUpload extends NimbusComponent {
    constructor(element, config = {}) {
      super(element, config);

      this._fileInput = null;
      this._dropzone = null;
      this._fileList = null;
      this._files = []; // { file, id, status, progress, error }

      this._init();
    }

    static get NAME() {
      return NAME;
    }
    static get Default() {
      return Default;
    }
    static get DefaultType() {
      return DefaultType;
    }

    // --- Public API ---

    getFiles() {
      return this._files.map(function (f) {
        return f.file;
      });
    }

    getFileData() {
      return this._files.slice();
    }

    addFiles(fileListOrArray) {
      var files = Array.from(fileListOrArray);
      files.forEach(this._addFile.bind(this));
      this._renderFileList();
      EventHandler.trigger(this._element, EVENT_CHANGE, {
        files: this.getFiles()
      });
    }

    removeFile(id) {
      var idx = this._files.findIndex(function (f) {
        return f.id === id;
      });
      if (idx === -1) return;
      var removed = this._files.splice(idx, 1)[0];
      this._renderFileList();
      EventHandler.trigger(this._element, EVENT_REMOVE, { file: removed.file });
      EventHandler.trigger(this._element, EVENT_CHANGE, {
        files: this.getFiles()
      });
    }

    clearFiles() {
      this._files = [];
      this._renderFileList();
      if (this._fileInput) this._fileInput.value = "";
      EventHandler.trigger(this._element, EVENT_CHANGE, { files: [] });
    }

    upload() {
      if (!this._config.uploadUrl) return;
      this._files.forEach(this._uploadFile.bind(this));
    }

    disable() {
      this._config.disabled = true;
      this._dropzone.classList.add("disabled");
      if (this._fileInput) this._fileInput.disabled = true;
    }

    enable() {
      this._config.disabled = false;
      this._dropzone.classList.remove("disabled");
      if (this._fileInput) this._fileInput.disabled = false;
    }

    dispose() {
      this._files = [];
      super.dispose();
    }

    // --- Private ---

    _init() {
      this._element.classList.add("file-upload");

      // Find existing file input
      this._fileInput = this._element.querySelector('input[type="file"]');

      // Build dropzone
      this._buildDropzone();

      // Build file list container
      if (this._config.showFileList) {
        this._fileList = document.createElement("ul");
        this._fileList.className = "file-upload-list";
        this._element.appendChild(this._fileList);
      }

      // Bind events
      this._bindEvents();

      if (this._config.disabled) {
        this.disable();
      }
    }

    _buildDropzone() {
      this._dropzone = document.createElement("div");
      this._dropzone.className = "file-upload-dropzone";

      // Create file input if not found
      if (!this._fileInput) {
        this._fileInput = document.createElement("input");
        this._fileInput.type = "file";
      }

      this._fileInput.multiple = this._config.multiple;
      if (this._config.acceptedTypes) {
        this._fileInput.accept = this._config.acceptedTypes;
      }

      // Icon
      var icon = document.createElement("div");
      icon.className = "file-upload-icon";
      icon.innerHTML = UPLOAD_ICON;

      // Text
      var text = document.createElement("div");
      text.className = "file-upload-text";
      text.innerHTML = this._config.dropzoneText;

      // Hint
      var hint = document.createElement("div");
      hint.className = "file-upload-hint";
      if (this._config.dropzoneHint) {
        hint.textContent = this._config.dropzoneHint;
      } else {
        var parts = [];
        if (this._config.maxSize) {
          parts.push("Max " + this._formatSize(this._config.maxSize));
        }
        if (this._config.maxFiles) {
          parts.push("up to " + this._config.maxFiles + " files");
        }
        hint.textContent = parts.join(" · ");
      }

      this._dropzone.appendChild(this._fileInput);
      this._dropzone.appendChild(icon);
      this._dropzone.appendChild(text);
      this._dropzone.appendChild(hint);

      this._element.insertBefore(this._dropzone, this._element.firstChild);
    }

    _bindEvents() {
      var self = this;

      // Click to browse
      EventHandler.on(this._dropzone, "click", function (e) {
        if (e.target === self._fileInput) return;
        if (self._config.disabled) return;
        self._fileInput.click();
      });

      // File input change
      EventHandler.on(this._fileInput, "change", function () {
        if (self._fileInput.files.length > 0) {
          self.addFiles(self._fileInput.files);
          self._fileInput.value = "";
        }
      });

      // Drag events
      EventHandler.on(this._dropzone, "dragover", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!self._config.disabled) {
          self._dropzone.classList.add("dragover");
        }
      });

      EventHandler.on(this._dropzone, "dragleave", function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._dropzone.classList.remove("dragover");
      });

      EventHandler.on(this._dropzone, "drop", function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._dropzone.classList.remove("dragover");
        if (self._config.disabled) return;
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
          self.addFiles(e.dataTransfer.files);
        }
      });
    }

    _addFile(file) {
      // Check max files
      if (this._files.length >= this._config.maxFiles) {
        EventHandler.trigger(this._element, EVENT_ERROR, {
          file: file,
          error:
            "Maximum number of files (" + this._config.maxFiles + ") reached"
        });
        return;
      }

      // Check file size
      if (file.size > this._config.maxSize) {
        this._files.push({
          file: file,
          id: Utils.getUID("fu"),
          status: "error",
          progress: 0,
          error:
            "File exceeds maximum size of " +
            this._formatSize(this._config.maxSize)
        });
        EventHandler.trigger(this._element, EVENT_ERROR, {
          file: file,
          error: "File too large"
        });
        return;
      }

      // Check accepted types
      if (this._config.acceptedTypes && !this._isAcceptedType(file)) {
        this._files.push({
          file: file,
          id: Utils.getUID("fu"),
          status: "error",
          progress: 0,
          error: "File type not accepted"
        });
        EventHandler.trigger(this._element, EVENT_ERROR, {
          file: file,
          error: "File type not accepted"
        });
        return;
      }

      var fileData = {
        file: file,
        id: Utils.getUID("fu"),
        status: "ready",
        progress: 0,
        error: null
      };

      this._files.push(fileData);
      EventHandler.trigger(this._element, EVENT_ADD, { file: file });

      if (this._config.autoUpload && this._config.uploadUrl) {
        this._uploadFile(fileData);
      }
    }

    _isAcceptedType(file) {
      var accepted = this._config.acceptedTypes.split(",").map(function (t) {
        return t.trim();
      });
      var fileName = file.name.toLowerCase();
      var fileType = file.type;

      return accepted.some(function (accept) {
        if (accept.startsWith(".")) {
          return fileName.endsWith(accept.toLowerCase());
        }
        if (accept.endsWith("/*")) {
          var category = accept.split("/")[0];
          return fileType.startsWith(category + "/");
        }
        return fileType === accept;
      });
    }

    _renderFileList() {
      if (!this._fileList) return;
      this._fileList.innerHTML = "";

      var self = this;
      this._files.forEach(function (fileData) {
        var li = document.createElement("li");
        li.className = "file-upload-item";
        if (fileData.status === "error") li.classList.add("error");
        if (fileData.status === "complete") li.classList.add("success");

        // Preview
        var preview = document.createElement("div");
        preview.className = "file-upload-preview";
        var ext = fileData.file.name.split(".").pop().toLowerCase();
        if (self._config.showPreview && IMAGE_EXTENSIONS.indexOf(ext) !== -1) {
          var img = document.createElement("img");
          img.alt = fileData.file.name;
          var reader = new FileReader();
          reader.onload = function (e) {
            img.src = e.target.result;
          };
          reader.readAsDataURL(fileData.file);
          preview.appendChild(img);
        } else {
          var iconSpan = document.createElement("span");
          iconSpan.className = "file-upload-preview-icon";
          iconSpan.textContent = FILE_ICON;
          preview.appendChild(iconSpan);
        }

        // Info
        var info = document.createElement("div");
        info.className = "file-upload-info";

        var name = document.createElement("div");
        name.className = "file-upload-name";
        name.textContent = fileData.file.name;
        info.appendChild(name);

        var size = document.createElement("div");
        size.className = "file-upload-size";
        size.textContent = self._formatSize(fileData.file.size);
        info.appendChild(size);

        if (fileData.error) {
          var errMsg = document.createElement("div");
          errMsg.className = "file-upload-error-msg";
          errMsg.textContent = fileData.error;
          info.appendChild(errMsg);
        }

        if (fileData.status === "uploading") {
          var progressWrap = document.createElement("div");
          progressWrap.className = "file-upload-progress";
          var progressBar = document.createElement("div");
          progressBar.className = "file-upload-progress-bar";
          progressBar.style.width = fileData.progress + "%";
          if (fileData.progress >= 100) progressBar.classList.add("complete");
          progressWrap.appendChild(progressBar);
          info.appendChild(progressWrap);
        }

        // Remove button
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "file-upload-remove";
        removeBtn.innerHTML = "×";
        removeBtn.setAttribute("aria-label", "Remove file");
        removeBtn.addEventListener("click", function () {
          self.removeFile(fileData.id);
        });

        li.appendChild(preview);
        li.appendChild(info);
        li.appendChild(removeBtn);
        self._fileList.appendChild(li);
      });
    }

    _uploadFile(fileData) {
      if (!this._config.uploadUrl) return;

      var self = this;
      var xhr = new XMLHttpRequest();
      var formData = new FormData();
      formData.append(this._config.uploadFieldName, fileData.file);

      fileData.status = "uploading";
      fileData.progress = 0;

      xhr.upload.addEventListener("progress", function (e) {
        if (e.lengthComputable) {
          fileData.progress = Math.round((e.loaded / e.total) * 100);
          self._renderFileList();
        }
      });

      xhr.addEventListener("load", function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          fileData.status = "complete";
          fileData.progress = 100;
        } else {
          fileData.status = "error";
          fileData.error = "Upload failed (HTTP " + xhr.status + ")";
        }
        self._renderFileList();
      });

      xhr.addEventListener("error", function () {
        fileData.status = "error";
        fileData.error = "Upload failed";
        self._renderFileList();
      });

      xhr.open(this._config.uploadMethod, this._config.uploadUrl);
      xhr.send(formData);
    }

    _formatSize(bytes) {
      if (bytes === 0) return "0 B";
      var units = ["B", "KB", "MB", "GB"];
      var i = Math.floor(Math.log(bytes) / Math.log(1024));
      return (
        (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + " " + units[i]
      );
    }

    static jQueryInterface(config) {
      return this.each(function () {
        var instance = FileUpload.getInstance(this);
        if (!instance) {
          instance = new FileUpload(
            this,
            typeof config === "object" ? config : {}
          );
        }
        if (typeof config === "string") {
          if (typeof instance[config] !== "function") {
            throw new TypeError("No method named " + config);
          }
          instance[config]();
        }
      });
    }
  }

  // Auto-init
  function autoInit(root) {
    if (root === undefined) root = document;
    root
      .querySelectorAll("[data-cnds-file-upload-init]")
      .forEach(function (el) {
        if (!FileUpload.getInstance(el)) {
          new FileUpload(el);
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      autoInit();
    });
  } else {
    autoInit();
  }

  window.Nimbus = window.Nimbus || {};
  window.Nimbus.FileUpload = FileUpload;

  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, FileUpload);
  }
})();
