"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Criteria_criteria;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Criteria = void 0;
const Criterion_1 = require("./Criterion");
class Criteria extends Criterion_1.default {
    constructor(...criteria) {
        super();
        _Criteria_criteria.set(this, []);
        criteria.forEach((criterion) => {
            __classPrivateFieldGet(this, _Criteria_criteria, "f").push(criterion);
        });
    }
    criteria() {
        return __classPrivateFieldGet(this, _Criteria_criteria, "f");
    }
    validate(...args) {
        return __classPrivateFieldGet(this, _Criteria_criteria, "f").every((criterion) => criterion.validate(...args));
    }
}
exports.Criteria = Criteria;
_Criteria_criteria = new WeakMap();
exports.default = Criteria;
//# sourceMappingURL=Criteria.js.map