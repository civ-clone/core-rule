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
    /**
     * `every` with a plain loop, for the same reason as `RuleRegistry.process`:
     * this runs once per rule per dispatch, twenty-one million times in a
     * thirty-turn game, and the closure it allocated was doing nothing the loop
     * does not. Short-circuiting on the first false is `every`'s behaviour and
     * is kept — most of those twenty-one million exit on criterion one.
     */
    validate(...args) {
        for (let index = 0; index < this._criteria.length; index++) {
            if (!this._criteria[index].validate(...args)) {
                return false;
            }
        }
        return true;
    }
}
exports.Criteria = Criteria;
exports.default = Criteria;
//# sourceMappingURL=Criteria.js.map