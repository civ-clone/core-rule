"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instance = exports.RuleRegistry = void 0;
const EntityRegistry_1 = require("@civ-clone/core-registry/EntityRegistry");
const Rule_1 = require("./Rule");
class RuleRegistry extends EntityRegistry_1.EntityRegistry {
    constructor() {
        super(Rule_1.default);
        this._cache = new Map();
    }
    entries() {
        return super
            .entries()
            .sort((a, b) => a.priority().value() - b.priority().value());
    }
    get(ruleType) {
        if (!this._cache.has(ruleType)) {
            this._cache.set(ruleType, this.filter((rule) => rule.enabled() && rule instanceof ruleType));
        }
        return this._cache.get(ruleType) || [];
    }
    invalidateCache(rule) {
        this._cache.delete(rule instanceof Rule_1.default
            ? rule.constructor
            : rule);
    }
    process(ruleType, ...args) {
        return this.get(ruleType)
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
exports.instance = new RuleRegistry();
exports.default = RuleRegistry;
//# sourceMappingURL=RuleRegistry.js.map