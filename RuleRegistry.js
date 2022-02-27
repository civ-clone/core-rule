"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _RuleRegistry_cache;
Object.defineProperty(exports, "__esModule", { value: true });
exports.instance = exports.RuleRegistry = void 0;
const EntityRegistry_1 = require("@civ-clone/core-registry/EntityRegistry");
const Rule_1 = require("./Rule");
class RuleRegistry extends EntityRegistry_1.EntityRegistry {
    constructor() {
        super(Rule_1.default);
        _RuleRegistry_cache.set(this, new Map());
    }
    entries() {
        return super
            .entries()
            .sort((a, b) => a.priority().value() - b.priority().value());
    }
    get(RuleType) {
        if (!__classPrivateFieldGet(this, _RuleRegistry_cache, "f").has(RuleType)) {
            __classPrivateFieldGet(this, _RuleRegistry_cache, "f").set(RuleType, this.filter((rule) => rule.enabled()).filter((rule) => rule instanceof RuleType));
        }
        return __classPrivateFieldGet(this, _RuleRegistry_cache, "f").get(RuleType) || [];
    }
    invalidateCache(rule) {
        __classPrivateFieldGet(this, _RuleRegistry_cache, "f").delete(rule.constructor);
    }
    process(RuleType, ...args) {
        return this.get(RuleType)
            .filter((rule) => rule.validate(...args))
            .map((rule) => rule.process(...args));
    }
    register(...rules) {
        super.register(...rules);
        rules.forEach((rule) => this.invalidateCache(rule));
    }
    unregister(...rules) {
        super.unregister(...rules);
        rules.forEach((rule) => this.invalidateCache(rule));
    }
}
exports.RuleRegistry = RuleRegistry;
_RuleRegistry_cache = new WeakMap();
exports.instance = new RuleRegistry();
exports.default = RuleRegistry;
//# sourceMappingURL=RuleRegistry.js.map