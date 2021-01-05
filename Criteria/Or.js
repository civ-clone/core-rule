"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Or = void 0;
const Criteria_1 = require("../Criteria");
class Or extends Criteria_1.default {
    validate(...args) {
        return (!this.criteria().length ||
            this.criteria().some((criterion) => criterion.validate(...args)));
    }
}
exports.Or = Or;
exports.default = Or;
//# sourceMappingURL=Or.js.map