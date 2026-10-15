/**
 * ============================================================
 * CNDS Stepper / Wizard Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler, SelectorEngine } = window.Nimbus;

  const NAME = "stepper";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_STEP_CHANGE = `stepChange${EVENT_KEY}`;
  const EVENT_STEP_COMPLETE = `stepComplete${EVENT_KEY}`;
  const EVENT_COMPLETE = `complete${EVENT_KEY}`;

  const SLIDE_DURATION = 200;
  const HEADER_HEIGHT_REM = 4; // matches CSS height: 4rem on .stepper-step

  const Default = {
    linear: false,
    noEditable: false,
    animation: true,
    mobileBarBreakpoint: 4
  };

  const DefaultType = {
    linear: "boolean",
    noEditable: "boolean",
    animation: "boolean",
    mobileBarBreakpoint: "number"
  };

  class Stepper extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      this._steps = SelectorEngine.find(".stepper-step", this._element);
      this._contentItems = SelectorEngine.find(
        ".stepper-content-item",
        this._element
      );
      this._activeIndex = 0;

      this._mobileHead = null;
      this._mobileFooter = null;
      this._mobileStepNum = null;
      this._mobileDots = null;
      this._mobileProgressBar = null;
      this._mobileBackBtn = null;
      this._mobileNextBtn = null;
      this._resizeHandler = null;

      this._init();
    }

    static get Default() {
      return Default;
    }

    static get DefaultType() {
      return DefaultType;
    }

    static get NAME() {
      return NAME;
    }

    _getConfig(config) {
      const base = super._getConfig(config);
      // data-cnds-stepper-* attributes aren't read by the base class (it strips
      // data-cnds- leaving stepperLinear, not linear), so read them directly.
      // Map camelCase config keys to their kebab-case attribute suffixes.
      const attrMap = {
        linear: "linear",
        noEditable: "no-editable",
        animation: "animation",
        mobileBarBreakpoint: "mobile-bar-breakpoint"
      };
      for (const [key, attrSuffix] of Object.entries(attrMap)) {
        const val = this._element.getAttribute(`data-cnds-stepper-${attrSuffix}`);
        if (val === null) continue;
        if (val === "true") base[key] = true;
        else if (val === "false") base[key] = false;
        else if (val !== "" && !isNaN(val)) base[key] = Number(val);
      }
      return base;
    }

    // --- Public API ---

    get activeStep() {
      return this._activeIndex;
    }

    get totalSteps() {
      return this._steps.length;
    }

    next() {
      if (this._activeIndex < this._steps.length - 1) {
        this._setStep(this._activeIndex + 1);
      }
    }

    prev() {
      if (this._activeIndex > 0) {
        this._setStep(this._activeIndex - 1);
      }
    }

    to(index) {
      if (index < 0 || index >= this._steps.length) return;

      if (this._config.linear && index > this._activeIndex + 1) return;

      this._setStep(index);
    }

    completeStep(index) {
      if (index === undefined) index = this._activeIndex;
      if (this._steps[index]) {
        this._steps[index].classList.add("completed");
        this._steps[index].classList.remove("active", "error");

        EventHandler.trigger(this._element, EVENT_STEP_COMPLETE, {
          step: index
        });
      }
    }

    setError(index) {
      if (index === undefined) index = this._activeIndex;
      if (this._steps[index]) {
        this._steps[index].classList.add("error");
        this._steps[index].classList.remove("completed");
      }
    }

    reset() {
      for (const step of this._steps) {
        step.classList.remove("active", "completed", "error", "disabled");
        const content = SelectorEngine.findOne(".stepper-content", step);
        if (content) content.style.cssText = "";
      }
      for (const content of this._contentItems) {
        content.classList.remove("active");
      }
      this._activeIndex = 0;
      this._updateUI();
      this._initHeight();
      if (this._isMobile()) this._updateMobileUI();
    }

    dispose() {
      if (this._resizeHandler) {
        window.removeEventListener("resize", this._resizeHandler);
        this._resizeHandler = null;
      }
      this._destroyMobileElements();
      EventHandler.off(this._element, EVENT_KEY);
      super.dispose();
    }

    // --- Private ---

    _isMobile() {
      return this._element.classList.contains("stepper-mobile");
    }

    _init() {
      // Apply layout class from data attribute
      const type = this._element.getAttribute("data-cnds-stepper-type");
      if (type === "vertical" && !this._element.classList.contains("stepper-vertical")) {
        this._element.classList.add("stepper-vertical");
      }
      if (type === "mobile" && !this._element.classList.contains("stepper-mobile")) {
        this._element.classList.add("stepper-mobile");
      }

      const activeStep = this._steps.findIndex((s) =>
        s.classList.contains("active")
      );
      if (activeStep >= 0) {
        this._activeIndex = activeStep;
      }

      this._updateUI();
      this._initOptionalSteps();

      if (this._isMobile()) {
        this._createMobileElements();
      }
      this._initHeight();

      // Responsive breakpoint switching
      const vertBP = parseInt(this._element.getAttribute("data-cnds-stepper-vertical-breakpoint"), 10);
      const mobileBP = parseInt(this._element.getAttribute("data-cnds-stepper-mobile-breakpoint"), 10);
      if (vertBP || mobileBP) {
        this._initResponsive(vertBP || 0, mobileBP || 0);
      }

      this._bindEvents();
    }

    _initResponsive(vertBP, mobileBP) {
      const apply = () => {
        const width = window.innerWidth;
        const wasMobile = this._element.classList.contains("stepper-mobile");
        const wasVertical = this._element.classList.contains("stepper-vertical");

        let newMode = "horizontal";
        if (mobileBP && width <= mobileBP) newMode = "mobile";
        else if (vertBP && width <= vertBP) newMode = "vertical";

        const isMobile = newMode === "mobile";
        const isVertical = newMode === "vertical";

        if (isMobile === wasMobile && isVertical === wasVertical) return;

        this._element.classList.toggle("stepper-mobile", isMobile);
        this._element.classList.toggle("stepper-vertical", isVertical);

        if (isMobile && !wasMobile) {
          this._createMobileElements();
        } else if (!isMobile && wasMobile) {
          this._destroyMobileElements();
          this._element.style.height = "";
        }

        this._initHeight();
      };

      this._resizeHandler = apply;
      window.addEventListener("resize", apply);
      apply();
    }

    _createMobileElements() {
      if (this._mobileHead) return;

      // Head: "Step X of Y"
      const head = document.createElement("div");
      head.className = "stepper-mobile-head";
      const stepNum = document.createElement("span");
      stepNum.className = "stepper-mobile-step-num";
      const stepTotal = document.createElement("span");
      stepTotal.className = "stepper-mobile-step-total";
      stepTotal.textContent = this._steps.length;
      head.appendChild(document.createTextNode("Step "));
      head.appendChild(stepNum);
      head.appendChild(document.createTextNode(" of "));
      head.appendChild(stepTotal);
      this._element.insertBefore(head, this._element.firstChild);
      this._mobileHead = head;
      this._mobileStepNum = stepNum;

      // Footer: Back + (progress bar for > mobileBarBreakpoint steps) + Next
      const footer = document.createElement("div");
      footer.className = "stepper-mobile-footer";

      const backBtn = document.createElement("button");
      backBtn.type = "button";
      backBtn.className = "btn btn-tertiary stepper-mobile-back-btn";
      backBtn.textContent = "Back";

      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "btn btn-tertiary stepper-mobile-next-btn";
      nextBtn.textContent = "Next";

      footer.appendChild(backBtn);

      if (this._steps.length > this._config.mobileBarBreakpoint) {
        const progress = document.createElement("div");
        progress.className = "stepper-mobile-progress";
        const progressBar = document.createElement("div");
        progressBar.className = "stepper-mobile-progress-bar";
        progress.appendChild(progressBar);
        footer.appendChild(progress);
        this._mobileProgressBar = progressBar;
      } else {
        const dotsEl = document.createElement("div");
        dotsEl.className = "stepper-mobile-dots";
        for (let i = 0; i < this._steps.length; i++) {
          const dot = document.createElement("span");
          dot.className = "stepper-mobile-dot";
          dotsEl.appendChild(dot);
        }
        footer.appendChild(dotsEl);
        this._mobileDots = dotsEl.querySelectorAll(".stepper-mobile-dot");
      }

      footer.appendChild(nextBtn);
      this._element.appendChild(footer);
      this._mobileFooter = footer;
      this._mobileBackBtn = backBtn;
      this._mobileNextBtn = nextBtn;

      EventHandler.on(backBtn, `click${EVENT_KEY}`, () => this.prev());
      EventHandler.on(nextBtn, `click${EVENT_KEY}`, () => this.next());

      this._updateMobileUI();
    }

    _destroyMobileElements() {
      if (this._mobileBackBtn) EventHandler.off(this._mobileBackBtn, EVENT_KEY);
      if (this._mobileNextBtn) EventHandler.off(this._mobileNextBtn, EVENT_KEY);
      if (this._mobileHead) { this._mobileHead.remove(); this._mobileHead = null; }
      if (this._mobileFooter) { this._mobileFooter.remove(); this._mobileFooter = null; }
      this._mobileStepNum = null;
      this._mobileDots = null;
      this._mobileProgressBar = null;
      this._mobileBackBtn = null;
      this._mobileNextBtn = null;
    }

    _updateMobileUI() {
      if (!this._mobileHead) return;

      this._mobileStepNum.textContent = this._activeIndex + 1;

      if (this._mobileDots) {
        this._mobileDots.forEach((dot, i) => {
          dot.classList.toggle("active", i === this._activeIndex);
          dot.classList.toggle("completed", i < this._activeIndex);
        });
      }

      if (this._mobileProgressBar) {
        const pct = ((this._activeIndex + 1) / this._steps.length) * 100;
        this._mobileProgressBar.style.width = pct + "%";
      }

      if (this._mobileBackBtn) this._mobileBackBtn.disabled = this._activeIndex === 0;
      if (this._mobileNextBtn) this._mobileNextBtn.disabled = this._activeIndex === this._steps.length - 1;
    }

    _validateStep(stepIndex) {
      const step = this._steps[stepIndex];
      if (!step) return true;
      const required = SelectorEngine.find("[required]", step);
      if (!required.length) return true;
      let valid = true;
      for (const el of required) {
        const field = el.closest(".cf-input-field");
        if (el.checkValidity()) {
          if (field) field.classList.remove("is-invalid");
        } else {
          if (field) field.classList.add("is-invalid");
          valid = false;
        }
      }
      return valid;
    }

    _clearStepValidation(stepIndex) {
      const step = this._steps[stepIndex];
      if (!step) return;
      SelectorEngine.find(".cf-input-field.is-invalid", step).forEach(
        (f) => f.classList.remove("is-invalid")
      );
    }

    _setStep(index) {
      const prevIndex = this._activeIndex;

      // Block navigation to a disabled step (no-editable locks completed steps)
      if (this._steps[index] && this._steps[index].classList.contains("disabled")) return;

      if (this._config.linear && index > prevIndex) {
        const isOptional = this._steps[prevIndex] &&
          this._steps[prevIndex].classList.contains("stepper-optional");
        if (!isOptional && !this._validateStep(prevIndex)) return;
      }

      const changeEvent = EventHandler.trigger(
        this._element,
        EVENT_STEP_CHANGE,
        { from: prevIndex, to: index }
      );

      if (changeEvent.defaultPrevented) return;

      if (index > prevIndex) {
        if (this._config.noEditable) {
          this._steps[prevIndex].classList.add("disabled");
        }
        this._clearStepValidation(prevIndex);
        this.completeStep(prevIndex);
      }

      this._activeIndex = index;
      this._updateUI();

      if (this._isMobile()) {
        this._updateMobileUI();
        this._initHeight();
      } else if (this._isVertical()) {
        this._animateVerticalTransition(prevIndex, index);
      } else {
        this._slideContent(prevIndex, index);
      }

      if (
        index === this._steps.length - 1 &&
        this._steps.every((s) => s.classList.contains("completed"))
      ) {
        EventHandler.trigger(this._element, EVENT_COMPLETE);
      }
    }

    _updateUI() {
      this._steps.forEach((step, i) => {
        step.classList.toggle("active", i === this._activeIndex);
      });

      this._contentItems.forEach((content, i) => {
        content.classList.toggle("active", i === this._activeIndex);
      });
    }

    _initOptionalSteps() {
      for (const step of this._steps) {
        if (step.getAttribute("data-cnds-stepper-optional") !== "true") continue;
        step.classList.add("stepper-optional");
        const head = SelectorEngine.findOne(".stepper-head", step);
        if (!head) continue;
        const label = SelectorEngine.findOne(".stepper-label", head);
        if (!label || SelectorEngine.findOne(".stepper-sublabel", head)) continue;
        const group = document.createElement("span");
        group.className = "stepper-label-group";
        label.after(group);
        group.appendChild(label);
        const sublabel = document.createElement("span");
        sublabel.className = "stepper-sublabel";
        sublabel.textContent = "Optional";
        group.appendChild(sublabel);
      }
    }

    _isHorizontal() {
      return !this._element.classList.contains("stepper-vertical") &&
             !this._element.classList.contains("stepper-mobile");
    }

    _isVertical() {
      return this._element.classList.contains("stepper-vertical");
    }

    _initVerticalHeights() {
      for (let i = 0; i < this._steps.length; i++) {
        const content = this._getStepContent(i);
        if (!content) continue;
        // Clear any stale inline styles left by horizontal slide or mode switch
        content.style.left = "";
        content.style.display = "";
        content.style.transition = "";
        if (i === this._activeIndex) {
          content.style.height = "auto";
          content.style.opacity = "1";
          content.style.overflow = "visible";
        } else {
          content.style.height = "0";
          content.style.opacity = "0";
          content.style.overflow = "hidden";
        }
      }
    }

    _animateVerticalTransition(fromIndex, toIndex) {
      if (!this._config.animation) {
        this._initVerticalHeights();
        return;
      }

      const fromEl = this._getStepContent(fromIndex);
      const toEl = this._getStepContent(toIndex);

      // Collapse outgoing panel: snap from auto/current to px then animate to 0
      if (fromEl) {
        const h = fromEl.getBoundingClientRect().height;
        fromEl.style.transition = "none";
        fromEl.style.height = h + "px";
        fromEl.style.overflow = "hidden";
        fromEl.offsetHeight; // eslint-disable-line no-unused-expressions
        fromEl.style.transition = `height ${SLIDE_DURATION}ms ease-in-out, opacity ${SLIDE_DURATION}ms ease-in-out`;
        fromEl.style.height = "0";
        fromEl.style.opacity = "0";
        setTimeout(() => {
          fromEl.style.transition = "";
        }, SLIDE_DURATION + 16);
      }

      // Expand incoming panel: animate from 0 to scrollHeight then settle to auto
      if (toEl) {
        const targetH = toEl.scrollHeight;
        toEl.style.transition = "none";
        toEl.style.height = "0";
        toEl.style.opacity = "0";
        toEl.style.overflow = "hidden";
        toEl.offsetHeight; // eslint-disable-line no-unused-expressions
        toEl.style.transition = `height ${SLIDE_DURATION}ms ease-in-out, opacity ${SLIDE_DURATION}ms ease-in-out`;
        toEl.style.height = targetH + "px";
        toEl.style.opacity = "1";

        const onEnd = (e) => {
          if (e.propertyName !== "height") return;
          toEl.removeEventListener("transitionend", onEnd);
          if (this._steps[toIndex] && this._steps[toIndex].classList.contains("active")) {
            toEl.style.transition = "";
            toEl.style.height = "auto";
            toEl.style.overflow = "visible";
          }
        };
        toEl.addEventListener("transitionend", onEnd);
      }
    }

    _getStepContent(stepIndex) {
      return this._steps[stepIndex]
        ? SelectorEngine.findOne(".stepper-content", this._steps[stepIndex])
        : null;
    }

    _initHeight() {
      if (this._isMobile()) {
        this._initMobileHeight();
        return;
      }

      if (this._isVertical()) {
        // Vertical layout is height:auto — clear any stale inline height from
        // a previous horizontal or mobile render, then set per-panel heights.
        this._element.style.height = "";
        this._initVerticalHeights();
        return;
      }

      if (!this._isHorizontal()) {
        this._element.style.height = "";
        return;
      }

      const activeContent = this._getStepContent(this._activeIndex);
      if (!activeContent) return;

      // Ensure active content is visible for measurement (CSS may hide it before
      // .active class is applied on first render)
      activeContent.style.display = "block";

      const pxPerRem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const headerPx = HEADER_HEIGHT_REM * pxPerRem;
      this._element.style.height = headerPx + activeContent.scrollHeight + "px";
    }

    _initMobileHeight() {
      const head = this._mobileHead;
      const footer = this._mobileFooter;
      if (!head || !footer) return;

      // Clear any stale inline display values from prior calls so CSS rules
      // (.stepper-step.active .stepper-content { display:block }) take full effect.
      for (const step of this._steps) {
        const c = SelectorEngine.findOne(".stepper-content", step);
        if (c) c.style.display = "";
      }

      const content = this._getStepContent(this._activeIndex);
      if (!content) return;

      const headH = head.offsetHeight;
      const footerH = footer.offsetHeight;
      const contentH = content.scrollHeight;

      // Set CSS variable so content top tracks actual head height
      this._element.style.setProperty("--stepper-mobile-content-top", headH + "px");

      this._element.style.height = headH + contentH + footerH + "px";
    }

    _slideContent(fromIndex, toIndex) {
      if (!this._isHorizontal() || !this._config.animation) return;

      const fromEl = this._getStepContent(fromIndex);
      const toEl = this._getStepContent(toIndex);

      if (!toEl) return;

      const dir = toIndex > fromIndex ? 1 : -1;

      // Position incoming content off-screen, make it visible for measurement
      toEl.style.transition = "none";
      toEl.style.left = dir > 0 ? "100%" : "-100%";
      toEl.style.display = "block";

      // Update stepper height to fit incoming content
      const pxPerRem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const headerPx = HEADER_HEIGHT_REM * pxPerRem;
      this._element.style.height = headerPx + toEl.scrollHeight + "px";

      // Slide outgoing content away
      if (fromEl) {
        fromEl.style.transition = `left ${SLIDE_DURATION}ms ease-in-out`;
        fromEl.style.left = dir > 0 ? "-100%" : "100%";
      }

      // Force reflow so the browser registers the off-screen start position
      toEl.offsetHeight; // eslint-disable-line no-unused-expressions

      // Slide incoming content to center
      toEl.style.transition = `left ${SLIDE_DURATION}ms ease-in-out`;
      toEl.style.left = "0";

      // Cleanup inline styles after animation completes
      setTimeout(() => {
        if (fromEl) fromEl.style.cssText = "";
        toEl.style.transition = "";
        toEl.style.left = "";
      }, SLIDE_DURATION + 16);
    }

    _bindEvents() {
      for (let i = 0; i < this._steps.length; i++) {
        const head = SelectorEngine.findOne(".stepper-head", this._steps[i]);
        if (head) {
          EventHandler.on(head, `click${EVENT_KEY}`, () => {
            if (this._steps[i].classList.contains("disabled")) return;
            if (this._isMobile()) return; // mobile uses its own nav buttons

            if (this._config.linear) {
              if (
                this._steps[i].classList.contains("completed") ||
                i <= this._activeIndex + 1
              ) {
                this.to(i);
              }
            } else {
              this.to(i);
            }
          });
        }
      }
    }

    static jQueryInterface(config, ...args) {
      return this.each(function () {
        const data = Stepper.getOrCreateInstance(this, config);
        if (typeof config === "string") {
          if (typeof data[config] === "undefined") {
            throw new TypeError(`No method named "${config}"`);
          }
          data[config](...args);
        }
      });
    }
  }

  // Register with Data API
  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, Stepper);
  }

  // Export
  window.Nimbus.Stepper = Stepper;
})();
