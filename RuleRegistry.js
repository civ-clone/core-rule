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
        super(Rule_1.Rule);
        this._cache = new Map();
        this._enabled = new Map();
        this._enabledAt = new Map();
        this._byId = new Map();
        this._constraints = new Map();
        this._listeners = [];
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
    // Neither empties the cache: it holds every rule of a type whether on or off, and `get` notices what has been
    //  switched for itself.
    disableById(id) {
        this._require(id).disable();
    }
    enableById(id) {
        this._require(id).enable();
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
    /**
     * The enabled rules of a type, in the order they run.
     *
     * The cache behind it holds every rule of the type, switched on or not. It
     * used to hold only those enabled when it was built, so a rule switched
     * back on with `rule.enable()` — which no registry hears — stayed out until
     * something else emptied the cache (civ-clone/web-renderer#158).
     *
     * The answer is kept too, and looked at again only when some rule, anywhere,
     * has been switched since (`switchCount`): one look at each rule of the type,
     * and nothing allocated unless one of them was. With every rule on, the
     * answer is the cache itself.
     */
    get(ruleType) {
        var _a;
        const rules = this._ofType(ruleType), kept = (_a = this._enabled.get(ruleType)) !== null && _a !== void 0 ? _a : rules, switches = (0, Rule_1.switchCount)();
        if (this._enabledAt.get(ruleType) === switches) {
            return kept;
        }
        this._enabledAt.set(ruleType, switches);
        let at = 0, current = true;
        for (let index = 0; index < rules.length; index++) {
            if (!rules[index].enabled()) {
                continue;
            }
            if (kept[at++] !== rules[index]) {
                current = false;
                break;
            }
        }
        if (current && at === kept.length) {
            return kept;
        }
        const enabled = rules.filter((rule) => rule.enabled());
        // All of them on again: the cache itself is the answer, as it was before any was switched.
        if (enabled.length === rules.length) {
            this._enabled.delete(ruleType);
            return rules;
        }
        this._enabled.set(ruleType, enabled);
        return enabled;
    }
    _ofType(ruleType) {
        const cached = this._cache.get(ruleType);
        if (cached) {
            return cached;
        }
        const rules = this.filter((rule) => rule instanceof ruleType);
        this._cache.set(ruleType, rules);
        return rules;
    }
    invalidateCache(rule) {
        const ruleType = rule instanceof Rule_1.Rule
            ? rule.constructor
            : rule;
        this._cache.delete(ruleType);
        this._enabled.delete(ruleType);
        this._enabledAt.delete(ruleType);
    }
    /**
     * Plain loops rather than `filter().map()`.
     *
     * This is the hottest loop in the engine: a 30-turn headless game makes
     * 143,148 `process(MovementCost, …)` calls, each walking 148 rules, and
     * 98.5% of every rule validation in a run happens right here. `filter` and
     * `map` each allocate a closure per call on top of their arrays, for no
     * reason other than how the line reads.
     *
     * Every rule is still validated *before* any rule is processed, which is
     * what `filter().map()` did and is not an incidental detail: a rule's effect
     * can change what a later rule's criteria look at, so interleaving the two
     * passes would be a behavioural change and not an optimisation.
     *
     * It walks every rule of the type and not only the enabled ones: `validate`
     * answers `false` for a rule that is off, so none is processed, and the
     * loop does not pay for `get`'s look at each rule first.
     */
    process(ruleType, ...args) {
        const rules = this._ofType(ruleType), matched = [];
        for (let index = 0; index < rules.length; index++) {
            if (rules[index].validate(...args)) {
                matched.push(rules[index]);
            }
        }
        const results = new Array(matched.length);
        for (let index = 0; index < matched.length; index++) {
            results[index] = matched[index].process(...args);
        }
        return results;
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
        if (this._listeners.length === 0) {
            return;
        }
        // Every listener hears of every rule, whatever another listener does: the rules are in by now, so one that
        //  throws must not leave the rest untold. The first error is thrown once all have been.
        const errors = [];
        rules.forEach((rule) => [...this._listeners].forEach((listener) => {
            try {
                listener(rule);
            }
            catch (error) {
                errors.push(error);
            }
        }));
        if (errors.length > 0) {
            throw errors[0];
        }
    }
    /**
     * Told of each rule as it is registered, after it is in. Returns how to stop
     * listening.
     *
     * For `RuleSetRegistry`, which has to switch off a rule that a set says
     * starts off whenever that rule arrives: packages load in name order, so a
     * set is often registered before the rules it names.
     */
    onRegister(listener) {
        this._listeners.push(listener);
        return () => {
            this._listeners = this._listeners.filter((other) => other !== listener);
        };
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