/**
 * ============================================================
 * CNDS Carousel Component
 * Cloudficient Nimbus Design System v1.0.0
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler, SelectorEngine, Utils } =
    window.Nimbus;

  const NAME = "carousel";
  const EVENT_KEY = `.cnds.${NAME}`;

  const EVENT_SLIDE = `slide${EVENT_KEY}`;
  const EVENT_SLID = `slid${EVENT_KEY}`;

  const CLASS_ACTIVE = "active";
  const CLASS_NEXT = "carousel-item-next";
  const CLASS_PREV = "carousel-item-prev";
  const CLASS_START = "carousel-item-start";
  const CLASS_END = "carousel-item-end";

  const SELECTOR_ACTIVE = ".carousel-item.active";
  const SELECTOR_ITEM = ".carousel-item";
  const SELECTOR_INNER = ".carousel-inner";
  const SELECTOR_INDICATORS = ".carousel-indicators";
  const SELECTOR_DATA_SLIDE = "[data-cnds-slide], [data-cnds-slide-to]";

  const DIRECTION_LEFT = "left";
  const DIRECTION_RIGHT = "right";
  const DIRECTION_NEXT = "next";
  const DIRECTION_PREV = "prev";

  const ORDER_NEXT = DIRECTION_NEXT;
  const ORDER_PREV = DIRECTION_PREV;

  const Default = {
    interval: 5000,
    keyboard: true,
    pause: "hover",
    ride: false,
    wrap: true,
    touch: true
  };

  const DefaultType = {
    interval: "number|boolean",
    keyboard: "boolean",
    pause: "string|boolean",
    ride: "boolean|string",
    wrap: "boolean",
    touch: "boolean"
  };

  class Carousel extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      this._interval = null;
      this._activeElement = null;
      this._isSliding = false;
      this._swipeHelper = null;

      this._indicatorsElement = SelectorEngine.findOne(
        SELECTOR_INDICATORS,
        this._element
      );

      this._addEventListeners();

      if (this._config.ride === "carousel") {
        this.cycle();
      }
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

    // --- Public API ---

    next() {
      this._slide(ORDER_NEXT);
    }

    prev() {
      this._slide(ORDER_PREV);
    }

    pause() {
      if (this._isSliding) {
        // Let the transition finish, then pause
      }
      this._clearInterval();
    }

    cycle() {
      this._clearInterval();
      if (this._config.interval && this._config.interval > 0) {
        this._interval = setInterval(() => this.next(), this._config.interval);
      }
    }

    to(index) {
      const items = this._getItems();
      if (index > items.length - 1 || index < 0) return;

      if (this._isSliding) {
        EventHandler.one(this._element, EVENT_SLID, () => this.to(index));
        return;
      }

      const activeIndex = this._getItemIndex(this._getActive());

      if (activeIndex === index) return;

      const order = index > activeIndex ? ORDER_NEXT : ORDER_PREV;
      this._slide(order, items[index]);
    }

    dispose() {
      this._clearInterval();
      EventHandler.off(this._element, EVENT_KEY);
      super.dispose();
    }

    // --- Private ---

    _addEventListeners() {
      if (this._config.keyboard) {
        EventHandler.on(this._element, `keydown${EVENT_KEY}`, (event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            this.prev();
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            this.next();
          }
        });
      }

      if (this._config.pause === "hover") {
        EventHandler.on(this._element, `mouseenter${EVENT_KEY}`, () =>
          this.pause()
        );
        EventHandler.on(this._element, `mouseleave${EVENT_KEY}`, () =>
          this.cycle()
        );
      }

      // Touch support
      if (this._config.touch) {
        this._addTouchEventListeners();
      }
    }

    _addTouchEventListeners() {
      let startX = 0;
      let startY = 0;

      EventHandler.on(this._element, `touchstart${EVENT_KEY}`, (event) => {
        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
      });

      EventHandler.on(this._element, `touchend${EVENT_KEY}`, (event) => {
        const endX = event.changedTouches[0].clientX;
        const endY = event.changedTouches[0].clientY;
        const diffX = endX - startX;
        const diffY = endY - startY;

        // Only handle horizontal swipes
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
          if (diffX > 0) {
            this.prev();
          } else {
            this.next();
          }
        }
      });
    }

    _getItems() {
      return SelectorEngine.find(SELECTOR_ITEM, this._element);
    }

    _getActive() {
      return SelectorEngine.findOne(SELECTOR_ACTIVE, this._element);
    }

    _getItemIndex(element) {
      return this._getItems().indexOf(element);
    }

    _getItemByOrder(order, activeElement) {
      const items = this._getItems();
      const activeIndex = items.indexOf(activeElement);
      const isNext = order === ORDER_NEXT;
      const delta = isNext ? 1 : -1;
      const nextIndex = (activeIndex + delta + items.length) % items.length;

      if (!this._config.wrap) {
        if (isNext && activeIndex === items.length - 1) return activeElement;
        if (!isNext && activeIndex === 0) return activeElement;
      }

      return items[nextIndex];
    }

    _slide(order, element = null) {
      if (this._isSliding) return;

      const activeElement = this._getActive();
      const isNext = order === ORDER_NEXT;
      const nextElement = element || this._getItemByOrder(order, activeElement);

      if (nextElement === activeElement) return;

      const nextElementIndex = this._getItemIndex(nextElement);
      const directionClassName = isNext ? CLASS_START : CLASS_END;
      const orderClassName = isNext ? CLASS_NEXT : CLASS_PREV;

      const slideEvent = EventHandler.trigger(this._element, EVENT_SLIDE, {
        relatedTarget: nextElement,
        direction: isNext ? DIRECTION_LEFT : DIRECTION_RIGHT,
        from: this._getItemIndex(activeElement),
        to: nextElementIndex
      });

      if (slideEvent.defaultPrevented) return;

      this._isSliding = true;
      this._clearInterval();

      this._setActiveIndicatorElement(nextElementIndex);

      // Trigger the CSS transition
      nextElement.classList.add(orderClassName);

      // Force reflow
      void nextElement.offsetHeight;

      activeElement.classList.add(directionClassName);
      nextElement.classList.add(directionClassName);

      const transitionDuration =
        Utils.getTransitionDuration(activeElement) || 600;

      setTimeout(() => {
        nextElement.classList.remove(directionClassName, orderClassName);
        nextElement.classList.add(CLASS_ACTIVE);

        activeElement.classList.remove(
          CLASS_ACTIVE,
          orderClassName,
          directionClassName
        );

        this._isSliding = false;

        EventHandler.trigger(this._element, EVENT_SLID, {
          relatedTarget: nextElement,
          direction: isNext ? DIRECTION_LEFT : DIRECTION_RIGHT,
          from: this._getItemIndex(activeElement),
          to: nextElementIndex
        });

        // Resume cycling
        if (this._config.interval) {
          this.cycle();
        }
      }, transitionDuration);
    }

    _setActiveIndicatorElement(index) {
      if (!this._indicatorsElement) return;

      const indicators = SelectorEngine.find(
        "[data-cnds-slide-to]",
        this._indicatorsElement
      );

      for (const indicator of indicators) {
        indicator.classList.remove(CLASS_ACTIVE);
        indicator.removeAttribute("aria-current");
      }

      if (indicators[index]) {
        indicators[index].classList.add(CLASS_ACTIVE);
        indicators[index].setAttribute("aria-current", "true");
      }
    }

    _clearInterval() {
      if (this._interval) {
        clearInterval(this._interval);
        this._interval = null;
      }
    }

    // --- Static ---

    static jQueryInterface(config) {
      return this.each(function () {
        const data = Carousel.getOrCreateInstance(this, config);

        if (typeof config === "string") {
          if (typeof data[config] === "undefined") {
            throw new TypeError(`No method named "${config}"`);
          }
          data[config]();
        }
      });
    }
  }

  // --- Data API ---
  EventHandler.on(document, "click", SELECTOR_DATA_SLIDE, function (event) {
    // Try explicit target first, then find closest carousel ancestor
    let target = Utils.getElement(
      this.getAttribute("data-cnds-target") || this.getAttribute("href")
    );

    if (!target || !target.classList.contains("carousel")) {
      target = this.closest(".carousel");
    }

    if (!target || !target.classList.contains("carousel")) return;

    event.preventDefault();

    const carousel = Carousel.getOrCreateInstance(target);
    const slideIndex = this.getAttribute("data-cnds-slide-to");

    if (slideIndex !== null && slideIndex !== undefined) {
      carousel.to(parseInt(slideIndex, 10));
    } else if (this.getAttribute("data-cnds-slide") === "prev") {
      carousel.prev();
    } else {
      carousel.next();
    }
  });

  // Register with Data API
  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, Carousel);
  }

  // Export
  window.Nimbus.Carousel = Carousel;
})();
