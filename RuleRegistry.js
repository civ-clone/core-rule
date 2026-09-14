"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instance = exports.RuleRegistry = exports.DuplicateRuleIdError = exports.UnknownRuleError = void 0;
const EntityRegistry_1 = require("@civ-clone/core-registry/EntityRegistry");
const Rule_1 = require("./Rule");
class UnknownRuleError extends Error {
}
exports.UnknownRuleError = UnknownRuleError;
class DuplicateRuleIdError extends Error {
}
exports.DuplicateRuleIdError = DuplicateRuleIdError;
class RuleRegistry extends EntityRegistry_1.EntityRegistry {
    constructor() {
        super(Rule_1.default);
        this._cache = new Map();
        this._byId = new Map();
        this._constraints = new Map();
    }
    entries() {
        const sorted = super
            .entries()
            .sort((a, b) => a.priority().value() - b.priority().value());
        // The common path, and 1,055 rules deep: no relative constraints means
        // nothing to reposition, and `entries()` stays exactly as cheap as before.
        if (this._constraints.size === 0) {
            return sorted;
        }
        return this._ordered(sorted);
    }
    /**
     * Apply `before`/`after` constraints on top of the priority sort.
     *
     * Repositioning rather than arithmetic on priority numbers, deliberately.
     * Giving a rule `target.priority() - 1` looks simpler and is wrong twice
     * over: priorities are shared (`Normal` is 2000 for almost everything, so
     * "one less" collides with whatever else sits there), and it silently breaks
     * when the target's own priority later changes. Position is what `before`
     * means, so position is what gets set.
     *
     * `Array.prototype.sort` is stable, so rules with equal priority keep
     * registration order and this only moves what asked to be moved.
     */
    _ordered(sorted) {
        const result = sorted.filter((rule) => !this._constraints.has(rule));
        // Grouped by target and side, then each group spliced in as a unit.
        //
        // Inserting one at a time does not work and the test for it says why:
        // two rules both `after('pkg:a')` each splice at `index + 1`, so the
        // second lands *before* the first and they come out reversed. Grouping
        // makes the order within a group explicit — priority order, since they
        // are peers and something has to decide — instead of a consequence of
        // which way the loop happens to run.
        const groups = new Map();
        sorted
            .filter((rule) => this._constraints.has(rule))
            .forEach((rule) => {
            var _a;
            const { side, id } = this._constraints.get(rule);
            const key = `${side}:${id}`;
            groups.set(key, [...((_a = groups.get(key)) !== null && _a !== void 0 ? _a : []), rule]);
        });
        groups.forEach((rules, key) => {
            const side = key.slice(0, key.indexOf(':'));
            const id = key.slice(key.indexOf(':') + 1);
            const target = this._byId.get(id);
            const at = target ? result.indexOf(target) : -1;
            if (at === -1) {
                // The target is gone — unregistered, or replaced by something
                // unnamed. Keep the rules rather than dropping them: a constraint is
                // about *order*, and losing a rule entirely is a worse answer than
                // ordering it imperfectly.
                result.push(...rules);
                return;
            }
            result.splice(side === 'before' ? at : at + 1, 0, ...rules);
        });
        return result;
    }
    /** The rule registered under `id`, or `null`. */
    getById(id) {
        var _a;
        return (_a = this._byId.get(id)) !== null && _a !== void 0 ? _a : null;
    }
    /**
     * Every one of these throws on an unknown id rather than doing nothing.
     *
     * That is the whole reason to prefer them over reaching for a priority
     * number: a plugin that means to replace `civ1-city:city/grow` and mistypes
     * it should fail at load, not run a game in which its override silently
     * never applied. An unknown id is far more likely to be a typo or a version
     * mismatch than an intentional no-op.
     */
    _require(id) {
        const rule = this._byId.get(id);
        if (!rule) {
            throw new UnknownRuleError(`No rule is registered as '${id}'. Either it is misspelled, or the ` +
                'package that declares it is not loaded, or its id changed.');
        }
        return rule;
    }
    /** Swap the named rule for others. The replacements need not be named. */
    replace(id, ...rules) {
        this.unregister(this._require(id));
        this.register(...rules);
    }
    disableById(id) {
        this._require(id).disable();
        this.invalidateCache(this._require(id));
    }
    enableById(id) {
        this._require(id).enable();
        this.invalidateCache(this._require(id));
    }
    /** Register `rules` so they run immediately before the named one. */
    before(id, ...rules) {
        this._require(id);
        rules.forEach((rule) => this._constraints.set(rule, { side: 'before', id }));
        this.register(...rules);
    }
    /** Register `rules` so they run immediately after the named one. */
    after(id, ...rules) {
        this._require(id);
        rules.forEach((rule) => this._constraints.set(rule, { side: 'after', id }));
        this.register(...rules);
    }
    get(ruleType) {
        if (!this._cache.has(ruleType)) {
            this._cache.set(ruleType, this.filter((rule) => rule.enabled() && rule instanceof ruleType));
        }
        return this._cache.get(ruleType) || [];
    }
    invalidateCache(rule) {
        this._cache.delete(rule instanceof Rule_1.default
            ? rule.constructor
            : rule);
    }
    process(ruleType, ...args) {
        return this.get(ruleType)
            .filter((rule) => rule.validate(...args))
            .map((rule) => rule.process(...args));
    }
    register(...rules) {
        rules.forEach((rule) => {
            const id = rule.id();
            if (id === null) {
                return;
            }
            const existing = this._byId.get(id);
            if (existing && existing !== rule) {
                // Two rules under one id makes `replace` and `disable` ambiguous, and
                // the loser would be unaddressable. Same reasoning as `ClassRegistry`:
                // refusing at registration turns a silent mis-resolution into a
                // startup error.
                throw new DuplicateRuleIdError(`Two rules claim the id '${id}'. Ids address a single rule, so one ` +
                    'of them could never be replaced or disabled.');
            }
            this._byId.set(id, rule);
        });
        super.register(...rules);
        rules.forEach((rule) => this.invalidateCache(rule));
    }
    unregister(...rules) {
        rules.forEach((rule) => {
            const id = rule.id();
            if (id !== null && this._byId.get(id) === rule) {
                this._byId.delete(id);
            }
            this._constraints.delete(rule);
        });
        super.unregister(...rules);
        rules.forEach((rule) => this.invalidateCache(rule));
    }
}
exports.RuleRegistry = RuleRegistry;
exports.instance = new RuleRegistry();
exports.default = RuleRegistry;
//# sourceMappingURL=RuleRegistry.js.map