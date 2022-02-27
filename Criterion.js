"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Criterion_criterion;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Criterion = void 0;
class Criterion {
    constructor(criterion) {
        _Criterion_criterion.set(this, null);
        if (criterion) {
            __classPrivateFieldSet(this, _Criterion_criterion, criterion, "f");
        }
    }
    validate(...args) {
        if (__classPrivateFieldGet(this, _Criterion_criterion, "f") === null) {
            return true;
        }
        return __classPrivateFieldGet(this, _Criterion_criterion, "f").call(this, ...args);
    }
}
exports.Criterion = Criterion;
_Criterion_criterion = new WeakMap();
exports.default = Criterion;
//# sourceMappingURL=Criterion.js.map