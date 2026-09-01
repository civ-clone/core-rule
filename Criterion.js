"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Criterion = void 0;
class Criterion {
    constructor(criterion) {
        this._criterion = null;
        if (criterion) {
            this._criterion = criterion;
        }
    }
    validate(...args) {
        if (this._criterion === null) {
            return true;
        }
        return this._criterion(...args);
    }
}
exports.Criterion = Criterion;
exports.default = Criterion;
//# sourceMappingURL=Criterion.js.map