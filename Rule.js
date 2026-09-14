"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rule = void 0;
const And_1 = require("./Criteria/And");
const Criterion_1 = require("./Criterion");
const Effect_1 = require("./Effect");
const Priorities_1 = require("./Priorities");
class Rule {
    /**
     * An optional identifier, as the first argument:
     *
     * ```ts
     * new Created(
     *   'civ1-city:city/created/register',
     *   new Criterion(…),
     *   new Effect(…)
     * )
     * ```
     *
     * **Optional, so this lands package by package.** Unnamed rules keep working
     * exactly as before — of the 1,055 rules a real game registers, most are
     * collecting rules that compose fine and have no reason to be addressable.
     * What an identifier buys is the ability to name *one instance*, which is
     * what `RuleRegistry.replace`, `disable`, `before` and `after` need and what
     * no amount of subclassing can provide: there are 1,055 instances and 163
     * classes.
     *
     * The convention is `package:path/to/rule`, so an identifier says where to
     * look for what it names.
     */
    constructor(...values) {
        this._enabled = true;
        this._id = null;
        this._priority = new Priorities_1.Normal();
        const criteria = [];
        values.forEach((value) => {
            if (typeof value === 'string') {
                if (this._id !== null) {
                    throw new TypeError(`Rule: id already specified as '${this._id}', but '${value}' ` +
                        'was also provided.');
                }
                this._id = value;
                return;
            }
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
    /** The identifier this rule was constructed with, if any. */
    id() {
        return this._id;
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