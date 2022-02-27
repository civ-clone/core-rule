"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _Rule_criteria, _Rule_enabled, _Rule_effect, _Rule_priority;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rule = void 0;
const And_1 = require("./Criteria/And");
const Criterion_1 = require("./Criterion");
const Effect_1 = require("./Effect");
const Priorities_1 = require("./Priorities");
class Rule {
    constructor(...values) {
        _Rule_criteria.set(this, void 0);
        _Rule_enabled.set(this, true);
        _Rule_effect.set(this, void 0);
        _Rule_priority.set(this, new Priorities_1.Normal());
        const criteria = [];
        values.forEach((value) => {
            if (value instanceof Effect_1.default) {
                if (__classPrivateFieldGet(this, _Rule_effect, "f")) {
                    throw new TypeError('Rule: effect already specified, but another was provided.');
                }
                __classPrivateFieldSet(this, _Rule_effect, value, "f");
                return;
            }
            if (value instanceof Criterion_1.default) {
                criteria.push(value);
                return;
            }
            __classPrivateFieldSet(this, _Rule_priority, value, "f");
        });
        if (criteria.length) {
            __classPrivateFieldSet(this, _Rule_criteria, new And_1.default(...criteria), "f");
        }
    }
    disable() {
        __classPrivateFieldSet(this, _Rule_enabled, false, "f");
    }
    enable() {
        __classPrivateFieldSet(this, _Rule_enabled, true, "f");
    }
    enabled() {
        return __classPrivateFieldGet(this, _Rule_enabled, "f");
    }
    priority() {
        return __classPrivateFieldGet(this, _Rule_priority, "f");
    }
    process(...args) {
        if (!__classPrivateFieldGet(this, _Rule_enabled, "f")) {
            return;
        }
        if (__classPrivateFieldGet(this, _Rule_effect, "f") instanceof Effect_1.default) {
            return __classPrivateFieldGet(this, _Rule_effect, "f").apply(...args);
        }
    }
    validate(...args) {
        if (!__classPrivateFieldGet(this, _Rule_enabled, "f")) {
            return false;
        }
        if (__classPrivateFieldGet(this, _Rule_criteria, "f") instanceof Criterion_1.default) {
            return __classPrivateFieldGet(this, _Rule_criteria, "f").validate(...args);
        }
        return true;
    }
}
exports.Rule = Rule;
_Rule_criteria = new WeakMap(), _Rule_enabled = new WeakMap(), _Rule_effect = new WeakMap(), _Rule_priority = new WeakMap();
exports.default = Rule;
//# sourceMappingURL=Rule.js.map