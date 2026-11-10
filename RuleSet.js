"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.idOf = exports.RuleSet = exports.RuleSetError = void 0;
const Rule_1 = require("./Rule");
class RuleSetError extends Error {
}
exports.RuleSetError = RuleSetError;
const isMember = (value) => typeof value === 'string' ||
    value instanceof RuleSet ||
    value instanceof Rule_1.default;
/**
 * A named group of rules that are switched together
 * (civ-clone/web-renderer#158).
 *
 * **By id, not by instance.** A set says `'civ1-unit:city/build/obsolete/Spearman'`
 * and never holds the `Rule`, so it describes any `Game`'s rules, a save can
 * record what was chosen, and a set may name a rule from a package that has
 * not loaded yet. A `Rule` given as a member is taken by its id, and one
 * without an id is refused: there would be no way to say which rule was meant.
 *
 * **Sets inside sets,** so a parent can be switched as one and can show that
 * its children differ. **Mutable,** so a later plugin can add its rules, or
 * whole sets, to one that exists: see `RuleSetRegistry.extend` for doing that
 * before the set is there.
 *
 * A set only describes. `RuleSetRegistry` holds what has been chosen and
 * switches the rules.
 */
class RuleSet {
    constructor(id, ...values) {
        var _a, _b;
        this._listeners = [];
        this._members = [];
        if (typeof id !== 'string' || id === '') {
            throw new RuleSetError('RuleSet: an id is required.');
        }
        this._id = id;
        const options = {}, members = [];
        values.forEach((value) => {
            if (isMember(value)) {
                members.push(value);
                return;
            }
            // Anything else has to be the options, and only the options: an object that is neither would otherwise be
            //  merged in and ignored, and the rule or set it was meant to be would silently not be a member.
            if (value === null ||
                typeof value !== 'object' ||
                Object.getPrototypeOf(value) !== Object.prototype ||
                Object.keys(value).some((key) => !['enabled', 'exclusive'].includes(key))) {
                throw new RuleSetError(`RuleSet '${id}': a member is a rule id, a Rule with an id or a ` +
                    'RuleSet, and the options are `exclusive` and `enabled`.');
            }
            Object.assign(options, value);
        });
        this._exclusive = (_a = options.exclusive) !== null && _a !== void 0 ? _a : false;
        this._enabled = (_b = options.enabled) !== null && _b !== void 0 ? _b : true;
        if (this._exclusive && options.enabled === false) {
            throw new RuleSetError(`RuleSet '${id}': a choice always has one member on, so it cannot ` +
                'start switched off.');
        }
        this.add(...members);
    }
    id() {
        return this._id;
    }
    /** Whether this is a choice between its members. */
    exclusive() {
        return this._exclusive;
    }
    /** Whether its rules start switched on. */
    enabledByDefault() {
        return this._enabled;
    }
    members() {
        return [...this._members];
    }
    /** Each member's id, in order: a rule's, or a set's. */
    memberIds() {
        return this._members.map(exports.idOf);
    }
    has(member) {
        return this.memberIds().includes((0, exports.idOf)(member));
    }
    /** Added to the end. One already there, by id, is left where it is. */
    add(...entries) {
        // All of them looked at before any is added, so a refusal leaves the set as it was.
        const members = entries.map((entry) => {
            if (!isMember(entry)) {
                throw new RuleSetError(`RuleSet '${this._id}': a member is a rule id, a Rule with an id ` +
                    'or a RuleSet.');
            }
            const member = entry instanceof Rule_1.default ? (0, exports.idOf)(entry) : entry;
            if ((0, exports.idOf)(member) === this._id) {
                throw new RuleSetError(`RuleSet '${this._id}' cannot be a member of itself.`);
            }
            return member;
        });
        let changed = false;
        members.forEach((member) => {
            const at = this.memberIds().indexOf((0, exports.idOf)(member));
            if (at === -1) {
                this._members.push(member);
                changed = true;
                return;
            }
            // The set itself says more than its id does, so it takes the id's place.
            if (member instanceof RuleSet && this._members[at] !== member) {
                this._members[at] = member;
                changed = true;
            }
        });
        if (changed) {
            this.changed();
        }
        return this;
    }
    remove(...entries) {
        const ids = entries.map(exports.idOf), kept = this._members.filter((member) => !ids.includes((0, exports.idOf)(member)));
        if (kept.length !== this._members.length) {
            this._members = kept;
            this.changed();
        }
        return this;
    }
    /** Told of every change to the members. Returns how to stop listening. */
    subscribe(listener) {
        this._listeners.push(listener);
        return () => {
            this._listeners = this._listeners.filter((other) => other !== listener);
        };
    }
    // Every listener hears, whatever another does with the news: the change has been made by now, and a set may be in
    //  more than one game's registry. The first error is thrown once all have been told.
    changed() {
        const errors = [];
        [...this._listeners].forEach((listener) => {
            try {
                listener();
            }
            catch (error) {
                errors.push(error);
            }
        });
        if (errors.length > 0) {
            throw errors[0];
        }
    }
}
exports.RuleSet = RuleSet;
const idOf = (member) => {
    if (typeof member === 'string') {
        return member;
    }
    const id = member.id();
    if (id === null) {
        throw new RuleSetError('A rule needs an id to be a member of a RuleSet: sets hold rules by id.');
    }
    return id;
};
exports.idOf = idOf;
exports.default = RuleSet;
//# sourceMappingURL=RuleSet.js.map