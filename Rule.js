"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rule = exports.switchCount = void 0;
const And_1 = require("./Criteria/And");
const Criterion_1 = require("./Criterion");
const Description_1 = require("./Description");
const Effect_1 = require("./Effect");
const Priorities_1 = require("./Priorities");
const Priority_1 = require("./Priority");
// How many times any rule has been switched on or off. `RuleRegistry` keeps its answer to "which rules of this type are
//  enabled" and needs to know when to look again; a rule is switched through the rule itself as often as through a
//  registry, so the rule is the only place that can count.
let switches = 0;
const switchCount = () => switches;
exports.switchCount = switchCount;
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
        this._descriptions = [];
        this._enabled = true;
        this._id = null;
        this._priority = new Priorities_1.Normal();
        const criteria = [];
        values.forEach((value) => {
            var _a, _b;
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
            // What it does, as data, for whatever explains the rules (civ-clone/web-renderer#1196). Known by its shape as
            //  well, so one from another copy of this package is read too, rather than taken for the priority.
            if (value instanceof Description_1.default ||
                typeof value.effects === 'function') {
                this._descriptions.push(...value.effects());
                return;
            }
            if (value instanceof Priority_1.default ||
                typeof (value === null || value === void 0 ? void 0 : value.value) === 'function') {
                this._priority = value;
                return;
            }
            throw new TypeError(`Rule: '${(_b = (_a = value === null || value === void 0 ? void 0 : value.constructor) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : typeof value}' is not an id, Priority, Criterion, Effect or Description ` +
                '(is it from another copy of @civ-clone/core-rule?).');
        });
        if (criteria.length) {
            this._criteria = new And_1.default(...criteria);
        }
    }
    /**
     * What the rule does, as data (`Description`): every effect described, in the order given, or none for a rule that
     *  says nothing about itself. Read whether or not the rule is enabled: whatever explains the rules asks `enabled()`.
     */
    descriptions() {
        return [...this._descriptions];
    }
    disable() {
        if (this._enabled) {
            switches++;
        }
        this._enabled = false;
    }
    enable() {
        if (!this._enabled) {
            switches++;
        }
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