/**
 * ============================================================
 * CNDS Event Handler
 * Cloudficient Nimbus Design System v1.0.0
 *
 * Centralized event management with namespacing and delegation
 * ============================================================
 */

(() => {
  "use strict";

  const namespaceRegex = /\.([a-zA-Z0-9_-]+)/;
  const stripNamespaceRegex = /\.([a-zA-Z0-9_-]+)/g;
  const stripUidRegex = /::(\d+)$/;

  // Internal event storage
  const eventRegistry = new Map();
  let uidEvent = 1;

  function makeEventUid(element, uid) {
    return (uid && `${uid}::${uidEvent++}`) || element.uidEvent || uidEvent++;
  }

  function getElementEvents(element) {
    const uid = makeEventUid(element);
    element.uidEvent = uid;
    if (!eventRegistry.has(uid)) {
      eventRegistry.set(uid, {});
    }
    return eventRegistry.get(uid);
  }

  function findHandler(events, callable, delegationSelector = null) {
    for (const [uid, handler] of Object.entries(events)) {
      if (
        handler.callable === callable &&
        handler.delegationSelector === delegationSelector
      ) {
        return handler;
      }
    }
    return null;
  }

  function normalizeParameters(originalTypeEvent, handler, delegationFunction) {
    const isDelegated = typeof handler === "string";
    const callable = isDelegated
      ? delegationFunction
      : handler || delegationFunction;
    let typeEvent = getTypeEvent(originalTypeEvent);

    return [isDelegated, callable, typeEvent];
  }

  function getTypeEvent(event) {
    // Strip namespace
    event = event.replace(stripNamespaceRegex, "");
    return event;
  }

  function getNamespace(event) {
    const match = event.match(namespaceRegex);
    return match ? match[1] : "";
  }

  function addHandler(
    element,
    originalTypeEvent,
    handler,
    delegationSelector,
    oneOff
  ) {
    if (typeof originalTypeEvent !== "string" || !element) return;

    const [isDelegated, callable, typeEvent] = normalizeParameters(
      originalTypeEvent,
      handler,
      delegationSelector
    );

    // If handler is a string (delegation selector), adjust params
    if (typeof handler === "string") {
      delegationSelector = handler;
      handler = delegationSelector;
    }

    const events = getElementEvents(element);
    if (!events[typeEvent]) {
      events[typeEvent] = {};
    }

    const existingHandler = findHandler(
      events[typeEvent],
      callable,
      isDelegated ? delegationSelector : null
    );
    if (existingHandler) {
      existingHandler.oneOff = existingHandler.oneOff && oneOff;
      return;
    }

    const uid = makeEventUid(
      callable,
      originalTypeEvent.replace(stripNamespaceRegex, "")
    );
    const namespace = getNamespace(originalTypeEvent);

    const fn = isDelegated
      ? function delegationHandler(event) {
          const domElements = element.querySelectorAll(delegationSelector);
          for (
            let { target } = event;
            target && target !== this;
            target = target.parentNode
          ) {
            for (const domElement of domElements) {
              if (domElement !== target) continue;

              // Hydrate event with delegateTarget
              Object.defineProperty(event, "delegateTarget", {
                configurable: true,
                get: () => target
              });

              if (oneOff) {
                EventHandler.off(
                  element,
                  originalTypeEvent,
                  delegationSelector,
                  callable
                );
              }

              return callable.apply(target, [event]);
            }
          }
        }
      : function handler(event) {
          if (oneOff) {
            EventHandler.off(element, originalTypeEvent, callable);
          }
          return callable.apply(element, [event]);
        };

    fn.delegationSelector = isDelegated ? delegationSelector : null;
    fn.callable = callable;
    fn.oneOff = oneOff;
    fn.uidEvent = uid;
    fn.namespace = namespace;

    events[typeEvent][uid] = fn;
    element.addEventListener(typeEvent, fn, isDelegated);
  }

  function removeHandler(
    element,
    events,
    typeEvent,
    handler,
    delegationSelector
  ) {
    const handlerKey = Object.keys(events[typeEvent]).find((key) => {
      const h = events[typeEvent][key];
      return (
        h.callable === handler && h.delegationSelector === delegationSelector
      );
    });

    if (!handlerKey) return;

    const fn = events[typeEvent][handlerKey];
    element.removeEventListener(typeEvent, fn, !!delegationSelector);
    delete events[typeEvent][handlerKey];
  }

  function removeNamespacedHandlers(element, events, typeEvent, namespace) {
    for (const [handlerKey, handler] of Object.entries(
      events[typeEvent] || {}
    )) {
      if (handler.namespace === namespace) {
        element.removeEventListener(
          typeEvent,
          handler,
          !!handler.delegationSelector
        );
        delete events[typeEvent][handlerKey];
      }
    }
  }

  /**
   * EventHandler - Centralized event management
   */
  const EventHandler = {
    /**
     * Add an event listener
     * @param {HTMLElement} element
     * @param {string} event - Event type with optional namespace (e.g., 'click.cnds.modal')
     * @param {string|Function} handlerOrSelector - Delegation selector or handler
     * @param {Function} [delegatedHandler] - Handler when using delegation
     */
    on(element, event, handlerOrSelector, delegatedHandler) {
      addHandler(element, event, handlerOrSelector, delegatedHandler, false);
    },

    /**
     * Add a one-time event listener
     * @param {HTMLElement} element
     * @param {string} event
     * @param {string|Function} handlerOrSelector
     * @param {Function} [delegatedHandler]
     */
    one(element, event, handlerOrSelector, delegatedHandler) {
      addHandler(element, event, handlerOrSelector, delegatedHandler, true);
    },

    /**
     * Remove event listener(s)
     * @param {HTMLElement} element
     * @param {string} originalTypeEvent
     * @param {string|Function} [handlerOrSelector]
     * @param {Function} [delegatedHandler]
     */
    off(element, originalTypeEvent, handlerOrSelector, delegatedHandler) {
      if (typeof originalTypeEvent !== "string" || !element) return;

      const [isDelegated, callable, typeEvent] = normalizeParameters(
        originalTypeEvent,
        handlerOrSelector,
        delegatedHandler
      );

      const namespace = getNamespace(originalTypeEvent);
      const events = getElementEvents(element);

      if (namespace) {
        // Remove all handlers for this namespace
        for (const eventType of Object.keys(events)) {
          removeNamespacedHandlers(element, events, eventType, namespace);
        }
        return;
      }

      if (!events[typeEvent]) return;

      if (
        typeof handlerOrSelector !== "function" &&
        typeof delegatedHandler !== "function"
      ) {
        // Remove all handlers for this event type
        for (const [key, handler] of Object.entries(events[typeEvent])) {
          element.removeEventListener(
            typeEvent,
            handler,
            !!handler.delegationSelector
          );
          delete events[typeEvent][key];
        }
        return;
      }

      removeHandler(
        element,
        events,
        typeEvent,
        callable,
        isDelegated ? handlerOrSelector : null
      );
    },

    /**
     * Trigger a custom event
     * @param {HTMLElement} element
     * @param {string} event - Full namespaced event name, e.g. 'show.cnds.modal'
     * @param {Object} [args={}]
     * @returns {CustomEvent}
     *
     * Dispatches the event using the FULL namespaced type so that user code can
     * listen via element.addEventListener('show.cnds.modal', handler) as documented.
     * Note: EventHandler.on() strips the namespace before registering, so it listens
     * for the base type (e.g. 'show'). Use native addEventListener() for full-name
     * namespaced listeners (e.g. 'show.cnds.modal').
     */
    trigger(element, event, args = {}) {
      if (typeof event !== "string" || !element) return null;

      const namespace = getNamespace(event);

      // Dispatch with the full namespaced event type (e.g. 'show.cnds.modal')
      // so that element.addEventListener('show.cnds.modal', ...) works as documented.
      const customEvent = new CustomEvent(event, {
        bubbles: true,
        cancelable: true,
        detail: args
      });

      if (namespace) {
        customEvent.namespace = namespace;
      }

      element.dispatchEvent(customEvent);
      return customEvent;
    }
  };

  // Export
  window.Nimbus = window.Nimbus || {};
  window.Nimbus.EventHandler = EventHandler;
})();
