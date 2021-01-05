"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
};
var _criteria, _effect, _priority;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rule = void 0;
const And_1 = require("./Criteria/And");
const Criterion_1 = require("./Criterion");
const Effect_1 = require("./Effect");
const Priorities_1 = require("./Priorities");
class Rule {
    constructor(...values) {
        _criteria.set(this, void 0);
        _effect.set(this, void 0);
        _priority.set(this, new Priorities_1.Normal());
        const criteria = [];
        values.forEach((value) => {
            if (value instanceof Effect_1.default) {
                if (__classPrivateFieldGet(this, _effect)) {
                    throw new TypeError('Rule: effect already specified, but another was provided.');
                }
                __classPrivateFieldSet(this, _effect, value);
                return;
            }
            if (value instanceof Criterion_1.default) {
                criteria.push(value);
                return;
            }
            __classPrivateFieldSet(this, _priority, value);
        });
        if (criteria.length) {
            __classPrivateFieldSet(this, _criteria, new And_1.default(...criteria));
        }
    }
    priority() {
        return __classPrivateFieldGet(this, _priority);
    }
    process(...args) {
        if (__classPrivateFieldGet(this, _effect) instanceof Effect_1.default) {
            return __classPrivateFieldGet(this, _effect).apply(...args);
        }
    }
    validate(...args) {
        if (__classPrivateFieldGet(this, _criteria) instanceof Criterion_1.default) {
            return __classPrivateFieldGet(this, _criteria).validate(...args);
        }
        return true;
    }
}
exports.Rule = Rule;
_criteria = new WeakMap(), _effect = new WeakMap(), _priority = new WeakMap();
exports.default = Rule;
//# sourceMappingURL=Rule.js.map