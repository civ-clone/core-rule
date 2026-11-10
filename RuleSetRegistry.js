"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instance = exports.RuleSetRegistry = exports.RuleSetCycleError = exports.DuplicateRuleSetIdError = exports.UnknownRuleSetError = void 0;
const RuleRegistry_1 = require("./RuleRegistry");
const RuleSet_1 = require("./RuleSet");
class UnknownRuleSetError extends RuleSet_1.RuleSetError {
}
exports.UnknownRuleSetError = UnknownRuleSetError;
class DuplicateRuleSetIdError extends RuleSet_1.RuleSetError {
}
exports.DuplicateRuleSetIdError = DuplicateRuleSetIdError;
class RuleSetCycleError extends RuleSet_1.RuleSetError {
}
exports.RuleSetCycleError = RuleSetCycleError;
/**
 * The rule sets of a game, what has been chosen in them, and the switching of
 * the rules to match (civ-clone/web-renderer#158).
 *
 * **What runs is worked out from the tree, every time.** A rule runs when it
 * is switched on and some path to it from the top is active, where a path is
 * active unless it passes through a member of a choice that is not the chosen
 * one. So a rule shared by two alternatives runs whichever is chosen, and
 * choosing an alternative back gives its rules the settings they had.
 *
 * **Two kinds of switching, kept apart:**
 *
 * - `set(id, on)` for a rule, or for a plain set, where it reaches every rule
 *   beneath, through the sets inside it. It stops at a choice: a choice always
 *   has exactly one member on, and switching its parent off does not change
 *   that. The same goes for a set that starts off: `{ enabled: false }` does
 *   not reach into a choice inside it.
 * - `choose(id, member)` for a choice.
 *
 * **It only switches off, and only switches back on what it switched off.** A
 * rule the tree says should run is left exactly as it is, and a rule that is
 * already off when the tree says it should be is not counted as this
 * registry's. So a rule that play has switched off for its own reasons
 * (`rule.disable()`, as several packages do for a moment at a time), or that a
 * package registers switched off, is not switched on by a set being switched
 * off and on again. `state()` is what the sets say, not `rule.enabled()`.
 *
 * **Rules are switched as they arrive.** Packages load in name order, so a set
 * is often registered before the rules it names. The registry listens to the
 * `RuleRegistry`, so an alternative that is not the chosen one is off from the
 * moment it is registered, and no host has to remember to apply anything.
 * `check()` is for the host to call once every package is in: until then a
 * rule id nothing has registered is not an error, and after it is.
 *
 * One registry to a `RuleRegistry`. Two would each switch the same rules;
 * `dispose()` one before making another for the same rules. (`instance`,
 * below, is the one for the `RuleRegistry` module's own `instance`, and
 * listens to it from the moment this module is imported: with no sets, it
 * switches nothing.)
 */
class RuleSetRegistry {
    constructor(rules) {
        this._chosen = new Map();
        /** The rules that start off, worked out when first asked after the tree changes. */
        this._defaultOff = null;
        this._effective = new Map();
        this._pending = new Map();
        this._sets = new Map();
        this._subscriptions = new Map();
        /** The rules this has switched off: the only ones it will switch back on. */
        this._switchedOff = new Set();
        this._values = new Map();
        this._rules = rules;
        this._stopListening = rules.onRegister((rule) => {
            var _a;
            const id = rule.id();
            if (id === null) {
                return;
            }
            // Off if the sets say so; and back on if this is a rule that was switched off and has since left every set, or
            //  was unregistered while its set was switched back on.
            this._switch(id, (_a = this._effective.get(id)) !== null && _a !== void 0 ? _a : true);
        });
    }
    /** The rules these sets switch. */
    ruleRegistry() {
        return this._rules;
    }
    /**
     * Stops listening to the rules and to its sets, and switches back on what
     * it had switched off. For a registry that is being replaced.
     */
    dispose() {
        this._stopListening();
        this._subscriptions.forEach((stop) => stop());
        this._subscriptions.clear();
        this._sets.clear();
        this._pending.clear();
        this._values.clear();
        this._chosen.clear();
        this._defaultOff = null;
        this._apply();
    }
    /** Every set, in the order registered, whether or not another holds it. */
    entries() {
        return [...this._sets.values()];
    }
    get(id) {
        var _a;
        return (_a = this._sets.get(id)) !== null && _a !== void 0 ? _a : null;
    }
    /** The sets no other set holds: where a UI starts drawing. */
    roots() {
        const held = new Set();
        this._sets.forEach((set) => set.memberIds().forEach((member) => held.add(member)));
        return this.entries().filter((set) => !held.has(set.id()));
    }
    /**
     * A set, and every set given to it as a member, and theirs.
     *
     * Two sets under one id are refused, as two rules under one id are: one of
     * them could never be switched. All of them are looked at before any is
     * taken in, so a refusal leaves the registry as it was.
     */
    register(...sets) {
        const incoming = new Map(), look = (set) => {
            var _a;
            const known = (_a = incoming.get(set.id())) !== null && _a !== void 0 ? _a : this._sets.get(set.id());
            if (known === set) {
                return;
            }
            if (known) {
                throw this._duplicate(set.id());
            }
            incoming.set(set.id(), set);
            set.members().forEach((member) => {
                if (member instanceof RuleSet_1.RuleSet) {
                    look(member);
                }
            });
        };
        sets.forEach(look);
        try {
            sets.forEach((set) => this._adopt(set));
        }
        finally {
            this._apply();
        }
    }
    /**
     * Taken out, along with the sets given to it as members that nothing else
     * registered holds.
     *
     * No other set is changed: sets are their package's own objects, and may be
     * in another game's registry too. A set that names this one by id keeps the
     * id, which `check()` then reports unless a set is registered under it
     * again, as when one is swapped for another. A registered set that was
     * *given* this one holds the set itself, and would put it straight back, so
     * that is refused: take it out of there first.
     */
    unregister(...sets) {
        sets.forEach((set) => {
            const holder = this.entries().find((other) => !sets.includes(other) &&
                this._sets.get(set.id()) === set &&
                other.members().includes(set));
            if (holder) {
                throw new RuleSet_1.RuleSetError(`RuleSet '${set.id()}' is a member of '${holder.id()}', which is ` +
                    'still registered: remove it from there first.');
            }
        });
        const drop = (set) => {
            var _a;
            if (this._sets.get(set.id()) !== set) {
                return;
            }
            this._sets.delete(set.id());
            this._chosen.delete(set.id());
            (_a = this._subscriptions.get(set)) === null || _a === void 0 ? void 0 : _a();
            this._subscriptions.delete(set);
            set.members().forEach((member) => {
                if (member instanceof RuleSet_1.RuleSet &&
                    !this.entries().some((other) => other.members().includes(member))) {
                    drop(member);
                }
            });
        };
        sets.forEach(drop);
        this._defaultOff = null;
        this._apply();
    }
    /**
     * Add members to the set registered as `id`, now or when it arrives.
     *
     * This is how a plugin adds its rules to another package's set without
     * importing it, and without caring which of the two loads first. `check()`
     * reports a set that never arrived.
     */
    extend(id, ...members) {
        var _a;
        const set = this._sets.get(id);
        if (set) {
            set.add(...members);
            return;
        }
        // Looked at now, as `add` would: a member that can't be one should fail here, where it was given, and not in
        //  whichever package registers the set later.
        const held = members.map((member) => {
            const memberId = (0, RuleSet_1.idOf)(member);
            if (memberId === id) {
                throw new RuleSet_1.RuleSetError(`RuleSet '${id}' cannot be a member of itself.`);
            }
            return member instanceof RuleSet_1.RuleSet ? member : memberId;
        });
        this._pending.set(id, [...((_a = this._pending.get(id)) !== null && _a !== void 0 ? _a : []), ...held]);
    }
    /**
     * Switch a rule, or every rule a plain set reaches, on or off.
     *
     * Throws for an id that is neither a registered set nor a rule some set
     * holds, for a choice, which is chosen from and not switched, and for a set
     * with nothing to switch (see `RuleSetDescription.switchable`).
     */
    set(id, on) {
        this._set(id, on);
        this._apply();
    }
    /** Pick the member of a choice that is on. */
    choose(id, member) {
        this._choose(id, member);
        this._apply();
    }
    /** A rule's setting, or a set's from the rules it switches. */
    state(id) {
        const set = this._sets.get(id);
        if (!set) {
            this._requireMember(id);
            return this._value(id) ? 'on' : 'off';
        }
        if (set.exclusive()) {
            return 'on';
        }
        const leaves = this._leaves(id);
        if (leaves.every((leaf) => this._value(leaf))) {
            return 'on';
        }
        return leaves.some((leaf) => this._value(leaf)) ? 'mixed' : 'off';
    }
    /** The member of a choice that is on: the one picked, or else the first. */
    chosen(id) {
        const set = this._requireSet(id);
        if (!set.exclusive()) {
            throw new RuleSet_1.RuleSetError(`RuleSet '${id}' is not a choice.`);
        }
        return this._chosenOf(set);
    }
    /**
     * How the tree differs from its defaults, as the shortest list that says
     * so, from the top down. This is what a save keeps.
     *
     * A set switched as a whole is one line, not one per rule, so that
     * restoring it into a later version, where the set has gained a rule,
     * switches that rule with the rest.
     */
    choices() {
        const choices = [], said = new Set(), say = (id, value) => {
            const key = `${id}\n${String(value)}`;
            if (!said.has(key)) {
                said.add(key);
                choices.push({ id, value });
            }
        }, differs = (rule) => this._value(rule) !== this._default(rule), visit = (id, covered, path) => {
            const set = this._sets.get(id);
            if (!set) {
                if (!covered && differs(id)) {
                    say(id, this._value(id));
                }
                return;
            }
            if (path.has(id)) {
                return;
            }
            path.add(id);
            if (set.exclusive()) {
                const chosen = this._chosenOf(set);
                if (chosen !== null && chosen !== set.memberIds()[0]) {
                    say(id, chosen);
                }
                // What is beneath an alternative keeps its settings while another is chosen, so all of them are walked.
                set.memberIds().forEach((member) => visit(member, false, path));
            }
            else {
                let coveredBelow = covered;
                if (!covered) {
                    const leaves = this._leaves(id);
                    // Said as a whole only when the whole of it was changed: a set that is all off because half of it
                    //  starts off says nothing about that half, which is left to whatever its own defaults become.
                    if (leaves.length > 0 && leaves.every(differs)) {
                        const state = this.state(id);
                        if (state !== 'mixed') {
                            say(id, state === 'on');
                            coveredBelow = true;
                        }
                    }
                }
                set.memberIds().forEach((member) => {
                    const inner = this._sets.get(member);
                    // A choice beneath a set that has been said is still its own to say.
                    visit(member, (inner === null || inner === void 0 ? void 0 : inner.exclusive()) ? false : coveredBelow, path);
                });
            }
            path.delete(id);
        };
        this._tops().forEach((top) => visit(top.id(), false, new Set()));
        return choices;
    }
    /**
     * Back to the defaults, then each choice in turn. Returns those that could
     * not be made, because nothing registered answers to the id any more: a
     * save from a build with a set this one lacks should load and say so, not
     * be refused.
     */
    restore(choices) {
        const unknown = [];
        this._values.clear();
        this._chosen.clear();
        try {
            choices.forEach((choice) => {
                try {
                    if (typeof choice.value === 'string') {
                        this._choose(choice.id, choice.value);
                        return;
                    }
                    if (typeof choice.value !== 'boolean') {
                        throw new RuleSet_1.RuleSetError(`A choice is switched (a boolean) or picked (an id): '${choice.id}' is neither.`);
                    }
                    this._set(choice.id, choice.value);
                }
                catch (error) {
                    if (!(error instanceof RuleSet_1.RuleSetError)) {
                        throw error;
                    }
                    unknown.push(choice);
                }
            });
        }
        finally {
            this._apply();
        }
        return unknown;
    }
    /** Everything back as the sets declare it. */
    reset() {
        this._values.clear();
        this._chosen.clear();
        this._apply();
    }
    /** The whole tree, from the sets no other holds, for a UI to draw. */
    describe() {
        const describe = (id, active, path) => {
            const set = this._sets.get(id);
            if (!set) {
                return {
                    id,
                    kind: 'rule',
                    state: this._value(id) ? 'on' : 'off',
                    active,
                    switchable: true,
                    members: [],
                };
            }
            const chosen = set.exclusive() ? this._chosenOf(set) : null, inside = new Set(path).add(id), members = set
                .memberIds()
                .filter((member) => !inside.has(member))
                .map((member) => describe(member, active && (!set.exclusive() || member === chosen), inside));
            return set.exclusive()
                ? {
                    id,
                    kind: 'choice',
                    state: 'on',
                    active,
                    switchable: false,
                    chosen,
                    members,
                }
                : {
                    id,
                    kind: 'set',
                    state: this.state(id),
                    active,
                    switchable: this._leaves(id).length > 0,
                    members,
                };
        };
        return this._tops().map((top) => describe(top.id(), true, new Set()));
    }
    /**
     * For the host, once every package has loaded: throws for a rule id that
     * nothing registered, a set `extend` was given members for that never
     * arrived, a set under the id of a rule, and a set that is inside itself.
     *
     * Until then none of those is an error, since the package that settles it
     * may simply not have loaded yet. After it, each is a typo or a missing
     * package, and should stop the game starting and not quietly leave a rule
     * running.
     */
    check() {
        if (this._pending.size > 0) {
            throw new UnknownRuleSetError(`Members were added to rule set(s) that were never registered: ${[
                ...this._pending.keys(),
            ]
                .sort()
                .join(', ')}.`);
        }
        this._sets.forEach((set) => {
            if (this._rules.getById(set.id()) !== null) {
                throw new DuplicateRuleSetIdError(`'${set.id()}' is the id of a rule set and of a rule. A set that ` +
                    'names it would mean the set, and the rule could not be reached.');
            }
        });
        const walk = (id, path) => {
            const set = this._sets.get(id);
            if (!set) {
                if (this._rules.getById(id) === null) {
                    throw new RuleRegistry_1.UnknownRuleError(`Rule set '${path[path.length - 1]}' names '${id}', which is ` +
                        'neither a registered rule nor a registered rule set.');
                }
                return;
            }
            if (path.includes(id)) {
                throw new RuleSetCycleError(`Rule set '${id}' is inside itself: ${[...path, id].join(' → ')}.`);
            }
            set.memberIds().forEach((member) => walk(member, [...path, id]));
        };
        this._sets.forEach((set) => walk(set.id(), []));
    }
    _duplicate(id) {
        return new DuplicateRuleSetIdError(`Two rule sets claim the id '${id}'. An id addresses one set, so one ` +
            'of them could never be switched. To add to a set that exists, use ' +
            '`extend`.');
    }
    _adopt(set) {
        const existing = this._sets.get(set.id());
        if (existing === set) {
            return;
        }
        if (existing) {
            throw this._duplicate(set.id());
        }
        this._sets.set(set.id(), set);
        this._defaultOff = null;
        this._subscriptions.set(set, set.subscribe(() => {
            this._defaultOff = null;
            // A member that has gone is no longer a choice to remember: added back, it is not chosen again by surprise.
            const chosen = this._chosen.get(set.id());
            if (chosen !== undefined && !set.memberIds().includes(chosen)) {
                this._chosen.delete(set.id());
            }
            try {
                this._adoptMembers(set);
            }
            finally {
                this._apply();
            }
        }));
        const pending = this._pending.get(set.id());
        if (pending) {
            this._pending.delete(set.id());
            // Tells the subscription above, which adopts and applies.
            set.add(...pending);
        }
        this._adoptMembers(set);
        // Switched before it arrived, through a set that named it by id: until now the id was taken for a rule's, and
        //  the setting was kept against it. It passes to the rules the set switches, except any switched themselves since.
        const held = this._values.get(set.id());
        if (held !== undefined) {
            this._values.delete(set.id());
            this._leaves(set.id()).forEach((leaf) => {
                if (!this._values.has(leaf)) {
                    this._values.set(leaf, held);
                }
            });
        }
    }
    _adoptMembers(set) {
        set.members().forEach((member) => {
            if (member instanceof RuleSet_1.RuleSet) {
                this._adopt(member);
            }
        });
    }
    _requireSet(id) {
        const set = this._sets.get(id);
        if (!set) {
            throw new UnknownRuleSetError(`No rule set is registered as '${id}'. Either it is misspelled, or ` +
                'the package that declares it is not loaded, or its id changed.');
        }
        return set;
    }
    /** Throws unless some registered set holds `id` as a rule. */
    _requireMember(id) {
        for (const set of this._sets.values()) {
            if (set.memberIds().includes(id)) {
                return;
            }
        }
        throw new UnknownRuleSetError(`'${id}' is neither a registered rule set nor a rule that one holds.`);
    }
    _set(id, on) {
        const set = this._sets.get(id);
        if (!set) {
            this._requireMember(id);
            this._values.set(id, on);
            return;
        }
        if (set.exclusive()) {
            throw new RuleSet_1.RuleSetError(`RuleSet '${id}' is a choice: choose one of its members.`);
        }
        const leaves = this._leaves(id);
        if (leaves.length === 0) {
            throw new RuleSet_1.RuleSetError(`RuleSet '${id}' has nothing to switch: it reaches no rule except ` +
                'through a choice, and a choice is chosen from.');
        }
        leaves.forEach((leaf) => this._values.set(leaf, on));
    }
    _choose(id, member) {
        const set = this._requireSet(id);
        if (!set.exclusive()) {
            throw new RuleSet_1.RuleSetError(`RuleSet '${id}' is not a choice.`);
        }
        if (!set.memberIds().includes(member)) {
            throw new UnknownRuleSetError(`'${member}' is not a member of the choice '${id}'.`);
        }
        this._chosen.set(id, member);
    }
    _chosenOf(set) {
        var _a;
        const members = set.memberIds(), chosen = this._chosen.get(set.id());
        if (chosen !== undefined && members.includes(chosen)) {
            return chosen;
        }
        return (_a = members[0]) !== null && _a !== void 0 ? _a : null;
    }
    /**
     * Where a walk of the whole tree starts: the sets no other holds, then any
     * set none of those reaches. The second only happens when a set is inside
     * itself, which `check()` refuses, but until it has, such a set's rules are
     * still switched, described and saved.
     */
    _tops() {
        const tops = this.roots(), reached = new Set(), reach = (id) => {
            var _a;
            if (reached.has(id)) {
                return;
            }
            reached.add(id);
            (_a = this._sets.get(id)) === null || _a === void 0 ? void 0 : _a.memberIds().forEach(reach);
        };
        tops.forEach((top) => reach(top.id()));
        this._sets.forEach((set) => {
            if (!reached.has(set.id())) {
                tops.push(set);
                reach(set.id());
            }
        });
        return tops;
    }
    /**
     * The rules a plain set switches: those beneath it through plain sets
     * only. A choice beneath is not entered.
     */
    _leaves(id, path = new Set()) {
        const set = this._sets.get(id);
        if (!set) {
            return [id];
        }
        if (set.exclusive() || path.has(id)) {
            return [];
        }
        path.add(id);
        const leaves = new Set();
        set
            .memberIds()
            .forEach((member) => this._leaves(member, path).forEach((leaf) => leaves.add(leaf)));
        path.delete(id);
        return [...leaves];
    }
    _value(rule) {
        var _a;
        return (_a = this._values.get(rule)) !== null && _a !== void 0 ? _a : this._default(rule);
    }
    /** On, unless a plain set declared `{ enabled: false }` switches it. */
    _default(rule) {
        if (this._defaultOff === null) {
            const off = new Set();
            this._sets.forEach((set) => {
                if (!set.exclusive() && !set.enabledByDefault()) {
                    this._leaves(set.id()).forEach((leaf) => off.add(leaf));
                }
            });
            this._defaultOff = off;
        }
        return !this._defaultOff.has(rule);
    }
    /** Whether each rule in the tree runs: see the class comment. */
    _evaluate() {
        const effective = new Map(), visit = (id, active, path) => {
            var _a;
            const set = this._sets.get(id);
            if (!set) {
                effective.set(id, ((_a = effective.get(id)) !== null && _a !== void 0 ? _a : false) || (active && this._value(id)));
                return;
            }
            if (path.has(id)) {
                return;
            }
            path.add(id);
            const chosen = set.exclusive() ? this._chosenOf(set) : null;
            set
                .memberIds()
                .forEach((member) => visit(member, active && (!set.exclusive() || member === chosen), path));
            path.delete(id);
        };
        this._tops().forEach((top) => visit(top.id(), true, new Set()));
        return effective;
    }
    _apply() {
        this._defaultOff = null;
        this._effective = this._evaluate();
        this._effective.forEach((on, id) => this._switch(id, on));
        // A rule this switched off, and that no set holds any more, goes back on: nothing else would ever do it.
        [...this._switchedOff]
            .filter((id) => !this._effective.has(id))
            .forEach((id) => this._switch(id, true));
    }
    /**
     * Off: switched off if it is on, and remembered as this registry's doing.
     * On: switched back on only if it is remembered. See the class comment.
     */
    _switch(id, on) {
        const rule = this._rules.getById(id);
        // Not registered, yet or any more: `onRegister` switches it when it is, and what is remembered is kept until then.
        if (rule === null) {
            return;
        }
        if (on) {
            if (this._switchedOff.delete(id)) {
                this._rules.enableById(id);
            }
            return;
        }
        if (rule.enabled()) {
            this._switchedOff.add(id);
            this._rules.disableById(id);
        }
    }
}
exports.RuleSetRegistry = RuleSetRegistry;
exports.instance = new RuleSetRegistry(RuleRegistry_1.instance);
exports.default = RuleSetRegistry;
//# sourceMappingURL=RuleSetRegistry.js.map