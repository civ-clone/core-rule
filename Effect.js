"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Effect = void 0;
class Effect {
    constructor(effect) {
        this._effect = effect;
    }
    apply(...args) {
        return this._effect(...args);
    }
}
exports.Effect = Effect;
exports.default = Effect;
//# sourceMappingURL=Effect.js.map