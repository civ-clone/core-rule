"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Ruleset_rules;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ruleset = void 0;
class Ruleset {
    constructor(...rules) {
        _Ruleset_rules.set(this, []);
        __classPrivateFieldGet(this, _Ruleset_rules, "f").push(...rules);
    }
    add(...rules) {
        __classPrivateFieldGet(this, _Ruleset_rules, "f").push(...rules);
    }
    enable() {
        __classPrivateFieldGet(this, _Ruleset_rules, "f").forEach((rule) => rule.enable());
    }
    disable() {
        __classPrivateFieldGet(this, _Ruleset_rules, "f").forEach((rule) => rule.disable());
    }
    remove(...rules) {
        rules.forEach((rule) => {
            const index = __classPrivateFieldGet(this, _Ruleset_rules, "f").indexOf(rule);
            if (index !== -1) {
                __classPrivateFieldGet(this, _Ruleset_rules, "f").splice(index, 1);
            }
        });
    }
}
exports.Ruleset = Ruleset;
_Ruleset_rules = new WeakMap();
exports.default = Ruleset;
//# sourceMappingURL=Ruleset.js.map