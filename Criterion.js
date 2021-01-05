"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
};
var _criterion;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Criterion = void 0;
class Criterion {
    constructor(criterion) {
        _criterion.set(this, null);
        if (criterion) {
            __classPrivateFieldSet(this, _criterion, criterion);
        }
    }
    validate(...args) {
        if (__classPrivateFieldGet(this, _criterion) === null) {
            return true;
        }
        return __classPrivateFieldGet(this, _criterion).call(this, ...args);
    }
}
exports.Criterion = Criterion;
_criterion = new WeakMap();
exports.default = Criterion;
//# sourceMappingURL=Criterion.js.map