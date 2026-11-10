"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.idOf = exports.RuleSet = exports.RuleSetError = void 0;
class RuleSetError extends Error {
}
exports.RuleSetError = RuleSetError;
/**
 * A named group of rules that are switched together
 * (civ-clone/web-renderer#158).
 *
 * **By id, not by instance.** A set says `'civ1-unit:city/build/obsolete/Spearman'`
 * and never holds the `Rule`, so it describes any `Game`'s rules, a save can
 * record what was chosen, and a set may name a rule from a package that has
 * not loaded yet.
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
            if (typeof value === 'string' || value instanceof RuleSet) {
                members.push(value);
                return;
            }
            Object.assign(options, value);
        });
        this._exclusive = (_a = options.exclusive) !== null && _a !== void 0 ? _a : false;
        this._enabled = (_b = options.enabled) !== null && _b !== void 0 ? _b : true;
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
    add(...members) {
        let changed = false;
        members.forEach((member) => {
            if ((0, exports.idOf)(member) === this._id) {
                throw new RuleSetError(`RuleSet '${this._id}' cannot be a member of itself.`);
            }
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
    remove(...members) {
        const ids = members.map(exports.idOf), kept = this._members.filter((member) => !ids.includes((0, exports.idOf)(member)));
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
    changed() {
        [...this._listeners].forEach((listener) => listener());
    }
}
exports.RuleSet = RuleSet;
const idOf = (member) => typeof member === 'string' ? member : member.id();
exports.idOf = idOf;
exports.default = RuleSet;
//# sourceMappingURL=RuleSet.js.map