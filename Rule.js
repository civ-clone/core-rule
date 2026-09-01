"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rule = void 0;
const And_1 = require("./Criteria/And");
const Criterion_1 = require("./Criterion");
const Effect_1 = require("./Effect");
const Priorities_1 = require("./Priorities");
class Rule {
    constructor(...values) {
        this._enabled = true;
        this._priority = new Priorities_1.Normal();
        const criteria = [];
        values.forEach((value) => {
            if (value instanceof Effect_1.default) {
                if (this._effect) {
                    throw new TypeError('Rule: effect already specified, but another was provided.');
                }
                this._effect = value;
                return;
            }
            if (value instanceof Criterion_1.default) {
                criteria.push(value);
                return;
            }
            this._priority = value;
        });
        if (criteria.length) {
            this._criteria = new And_1.default(...criteria);
        }
    }
    disable() {
        this._enabled = false;
    }
    enable() {
        this._enabled = true;
    }
    enabled() {
        return this._enabled;
    }
    priority() {
        return this._priority;
    }
    process(...args) {
        if (!this._enabled) {
            return;
        }
        if (this._effect instanceof Effect_1.default) {
            return this._effect.apply(...args);
        }
    }
    validate(...args) {
        if (!this._enabled) {
            return false;
        }
        if (this._criteria instanceof Criterion_1.default) {
            return this._criteria.validate(...args);
        }
        return true;
    }
}
exports.Rule = Rule;
exports.default = Rule;
//# sourceMappingURL=Rule.js.map