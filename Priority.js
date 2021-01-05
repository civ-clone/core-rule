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
var _value;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Priority = void 0;
class Priority {
    constructor(value = 2000) {
        _value.set(this, void 0);
        __classPrivateFieldSet(this, _value, value);
    }
    value() {
        return __classPrivateFieldGet(this, _value);
    }
}
exports.Priority = Priority;
_value = new WeakMap();
exports.default = Priority;
//# sourceMappingURL=Priority.js.map