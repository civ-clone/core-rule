"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
};
var _criteria;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Criteria = void 0;
const Criterion_1 = require("./Criterion");
class Criteria extends Criterion_1.default {
    constructor(...criteria) {
        super();
        _criteria.set(this, []);
        criteria.forEach((criterion) => {
            __classPrivateFieldGet(this, _criteria).push(criterion);
        });
    }
    criteria() {
        return __classPrivateFieldGet(this, _criteria);
    }
    validate(...args) {
        return __classPrivateFieldGet(this, _criteria).every((criterion) => criterion.validate(...args));
    }
}
exports.Criteria = Criteria;
_criteria = new WeakMap();
exports.default = Criteria;
//# sourceMappingURL=Criteria.js.map