"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Criteria = void 0;
const Criterion_1 = require("./Criterion");
class Criteria extends Criterion_1.default {
    constructor(...criteria) {
        super();
        this._criteria = [];
        criteria.forEach((criterion) => {
            this._criteria.push(criterion);
        });
    }
    criteria() {
        return this._criteria;
    }
    validate(...args) {
        return this._criteria.every((criterion) => criterion.validate(...args));
    }
}
exports.Criteria = Criteria;
exports.default = Criteria;
//# sourceMappingURL=Criteria.js.map