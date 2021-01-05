"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
};
var _cache, _invalidateCache;
Object.defineProperty(exports, "__esModule", { value: true });
exports.instance = exports.RuleRegistry = void 0;
const EntityRegistry_1 = require("@civ-clone/core-registry/EntityRegistry");
const Rule_1 = require("./Rule");
class RuleRegistry extends EntityRegistry_1.EntityRegistry {
    constructor() {
        super(Rule_1.default);
        _cache.set(this, new Map());
        _invalidateCache.set(this, (rule) => {
            __classPrivateFieldGet(this, _cache).delete(rule.constructor);
        });
    }
    entries() {
        return super
            .entries()
            .sort((a, b) => a.priority().value() - b.priority().value());
    }
    get(RuleType) {
        if (!__classPrivateFieldGet(this, _cache).has(RuleType)) {
            __classPrivateFieldGet(this, _cache).set(RuleType, this.filter((rule) => rule instanceof RuleType));
        }
        return __classPrivateFieldGet(this, _cache).get(RuleType) || [];
    }
    process(RuleType, ...args) {
        return this.get(RuleType)
            .filter((rule) => rule.validate(...args))
            .map((rule) => rule.process(...args));
    }
    register(...rules) {
        super.register(...rules);
        rules.forEach((rule) => __classPrivateFieldGet(this, _invalidateCache).call(this, rule));
    }
    unregister(...rules) {
        super.unregister(...rules);
        rules.forEach((rule) => __classPrivateFieldGet(this, _invalidateCache).call(this, rule));
    }
}
exports.RuleRegistry = RuleRegistry;
_cache = new WeakMap(), _invalidateCache = new WeakMap();
exports.instance = new RuleRegistry();
exports.default = RuleRegistry;
//# sourceMappingURL=RuleRegistry.js.map