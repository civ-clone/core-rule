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
var _effect;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Effect = void 0;
class Effect {
    constructor(effect) {
        _effect.set(this, void 0);
        __classPrivateFieldSet(this, _effect, effect);
    }
    apply(...args) {
        return __classPrivateFieldGet(this, _effect).call(this, ...args);
    }
}
exports.Effect = Effect;
_effect = new WeakMap();
exports.default = Effect;
//# sourceMappingURL=Effect.js.map