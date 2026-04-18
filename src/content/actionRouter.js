(() => {
  if (window.__MEDBOT_ACTION_ROUTER_READY__) {
    return;
  }

  window.__MEDBOT_ACTION_ROUTER_READY__ = true;

  class ActionRouter {
    constructor(options = {}) {
      this.handlers = new Map();
      this.logger = options.logger || (() => {});
      this.createFailure = options.createFailure || ((message) => ({ ok: false, message }));
    }

    register(intent, handler) {
      if (typeof intent !== "string" || intent.trim().length === 0) {
        throw new Error("ActionRouter.register(intent, handler) requires an intent.");
      }

      if (typeof handler !== "function") {
        throw new Error(`ActionRouter handler for "${intent}" must be a function.`);
      }

      this.handlers.set(intent, handler);
      return this;
    }

    registerMany(handlerMap) {
      for (const [intent, handler] of Object.entries(handlerMap || {})) {
        this.register(intent, handler);
      }

      return this;
    }

    has(intent) {
      return this.handlers.has(intent);
    }

    async route(command, context = {}) {
      const validation = this.validate(command);
      if (!validation.ok) {
        this.log("failure", { reason: validation.message });
        return this.createFailure(validation.message);
      }

      const intent = command.intent;
      const handler = this.handlers.get(intent);

      this.log("start", { intent });

      try {
        const result = await handler(command, context);

        if (!result || typeof result !== "object" || typeof result.ok !== "boolean") {
          this.log("failure", { intent, reason: "invalid_handler_result" });
          return this.createFailure(`Intent "${intent}" returned an invalid result.`);
        }

        this.log(result.ok ? "success" : "failure", {
          intent,
          message: result.message || ""
        });

        return result;
      } catch (error) {
        const message = error?.message || String(error);
        this.log("error", { intent, message });
        return this.createFailure(`Action router failed for "${intent}": ${message}`);
      }
    }

    validate(command) {
      if (!command || typeof command !== "object" || Array.isArray(command)) {
        return { ok: false, message: "AI command must be a JSON object." };
      }

      if (typeof command.intent !== "string" || command.intent.trim().length === 0) {
        return { ok: false, message: "AI command is missing an intent." };
      }

      if (!this.handlers.has(command.intent)) {
        return { ok: false, message: `Unsupported intent "${command.intent}".` };
      }

      return { ok: true };
    }

    log(status, details = {}) {
      this.logger("action_router", status, details);
    }
  }

  window.MedBotActionRouter = {
    ActionRouter,
    createActionRouter: (options) => new ActionRouter(options)
  };
})();
