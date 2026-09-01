"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ruleset = void 0;
class Ruleset {
    constructor(...rules) {
        this._rules = [];
        this._rules.push(...rules);
    }
    add(...rules) {
        this._rules.push(...rules);
    }
    enable() {
        this._rules.forEach((rule) => rule.enable());
    }
    disable() {
        this._rules.forEach((rule) => rule.disable());
    }
    remove(...rules) {
        rules.forEach((rule) => {
            const index = this._rules.indexOf(rule);
            if (index !== -1) {
                this._rules.splice(index, 1);
            }
        });
    }
}
exports.Ruleset = Ruleset;
exports.default = Ruleset;
//# sourceMappingURL=Ruleset.js.map