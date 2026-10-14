/**
 * ============================================================
 * CNDS Input Clear
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Behaviour for the clear affordance on a text or search field.
 * Figma: Nimbus/InputField — `Show Clear`.
 *
 * The CSS for the control already ships in components/forms.css as
 * `.cf-input-clear`, and the styleguide documents the markup. This
 * supplies the behaviour that markup implies, so every field does not
 * hand-wire the same six lines:
 *
 *   · the control is present only while there is something to clear
 *   · clicking it empties the field and returns focus to it
 *   · a native `input` event is dispatched, so anything already
 *     listening to the field (a search, a filter, a form) reacts
 *     exactly as it does to typing
 *
 * Usage — put the attribute on the INPUT; the control is found as a
 * sibling inside the same .cf-input-wrapper:
 *
 *   <div class="cf-input-wrapper">
 *     <input type="text" class="cf-input-control" data-cnds-input-clear-init />
 *     <button type="button" class="mdi mdi-close-circle cf-input-clear"
 *             aria-label="Clear field" hidden></button>
 *   </div>
 *
 * Use type="text", NOT type="search": the search type paints the
 * browser's own clear control, which differs per browser and is not the
 * design system's icon.
 *
 * Events:
 *   cleared.cnds.input-clear   fired on the input after it is emptied
 *
 * Methods:
 *   Nimbus.InputClear.getOrCreateInstance(input)
 *   instance.clear()    empty the field programmatically
 *   instance.sync()     re-read the value and show/hide the control
 *   instance.dispose()
 * ============================================================
 */

(() => {
  "use strict";

  const { NimbusComponent, EventHandler } = window.Nimbus;

  const NAME = "input-clear";
  const EVENT_KEY = `.cnds.${NAME}`;
  const SELECTOR_CLEAR = ".cf-input-clear";

  class InputClear extends NimbusComponent {
    constructor(element, config) {
      super(element, config);

      /* The control is a sibling inside .cf-input-wrapper. Scoped to the
         wrapper rather than the document so two fields side by side cannot
         pick up each other's control. */
      const scope = this._element.closest(".cf-input-wrapper") ||
                    this._element.parentElement;
      this._clear = scope ? scope.querySelector(SELECTOR_CLEAR) : null;

      if (!this._clear) return;      // styled markup absent; nothing to wire

      this._onInput = () => this.sync();
      this._onClick = (event) => {
        event.preventDefault();
        this.clear();
      };

      EventHandler.on(this._element, `input${EVENT_KEY}`, this._onInput);
      EventHandler.on(this._clear, `click${EVENT_KEY}`, this._onClick);

      this.sync();
    }

    static get NAME() {
      return NAME;
    }

    /** Show the control only while the field has a value. */
    sync() {
      if (!this._clear) return;
      this._clear.hidden = !this._element.value;
    }

    /**
     * Empty the field, tell the world, and hand focus back.
     *
     * The native `input` event matters: a consumer listening for typing
     * should not need a second listener for clearing. Focus returns to the
     * field because the operator cleared it in order to type again — and
     * leaving focus on a control that has just hidden itself strands the
     * keyboard.
     */
    clear() {
      if (!this._clear) return;

      this._element.value = "";
      this.sync();
      this._element.dispatchEvent(new Event("input", { bubbles: true }));
      this._element.focus();

      EventHandler.trigger(this._element, `cleared${EVENT_KEY}`);
    }

    dispose() {
      if (this._clear) {
        EventHandler.off(this._element, `input${EVENT_KEY}`, this._onInput);
        EventHandler.off(this._clear, `click${EVENT_KEY}`, this._onClick);
      }
      super.dispose();
    }
  }

  // ---------------------------------------------------------------------
  // Export + DataAPI registration
  // ---------------------------------------------------------------------
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.InputClear = InputClear;

  /* Registered under "input-clear", so the DataAPI auto-initialises every
     [data-cnds-input-clear-init] — the same named-init convention as
     data-cnds-select-init. */
  if (window.Nimbus.DataAPI) {
    window.Nimbus.DataAPI.registerComponent(NAME, InputClear);
  }
})();
