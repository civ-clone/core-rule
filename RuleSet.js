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
 * its children differ. **Mutable,** so the package that made it can add to it
 * later.
 *
 * **One of perhaps several declarations of its id.** Any package may declare
 * a set under an id, and a `RuleSetRegistry` takes every declaration of an id
 * as one set: their members together, and their options where they state
 * them. So a plugin adds its rules to another package's set by declaring the
 * set again with them (or with `RuleSetRegistry.extend`), without importing
 * it and whichever loads first. An option that is not given is no opinion,
 * and `stated()` says which were.
 *
 * **It can take another package's place** (civ-clone/web-renderer#954):
 * `{ supersedes: [...] }` names rules, or sets, that do not run while this set
 * is in force, without their package knowing. What it supersedes is fixed
 * when it is made.
 *
 * A set only describes. `RuleSetRegistry` holds what has been chosen and
 * switches the rules.
 */
class RuleSet {
    constructor(id, ...values) {
        var _a, _b, _c;
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
                Object.keys(value).some((key) => !['default', 'enabled', 'exclusive', 'supersedes'].includes(key))) {
                throw new RuleSetError(`RuleSet '${id}': a member is a rule id, a Rule with an id or a ` +
                    'RuleSet, and the options are `exclusive`, `default`, `enabled` ' +
                    'and `supersedes`.');
            }
            Object.assign(options, value);
        });
        this._exclusive = (_a = options.exclusive) !== null && _a !== void 0 ? _a : false;
        this._enabled = (_b = options.enabled) !== null && _b !== void 0 ? _b : true;
        const supersedes = options.supersedes === undefined ? [] : options.supersedes;
        if (!Array.isArray(supersedes) ||
            supersedes.some((other) => typeof other !== 'string' || other === '')) {
            throw new RuleSetError(`RuleSet '${id}': \`supersedes\` is a list of the ids of rules or ` +
                'rule sets.');
        }
        // Taking its own place would mean it never ran while it was on: whatever was meant, it was not that.
        if (supersedes.includes(id)) {
            throw new RuleSetError(`RuleSet '${id}' cannot supersede itself.`);
        }
        this._supersedes = [...new Set(supersedes)];
        if (this._exclusive && options.enabled === false) {
            throw new RuleSetError(`RuleSet '${id}': a choice always has one member on, so it cannot ` +
                'start switched off.');
        }
        // Not looked for among the members: another declaration of the set may bring it.
        if (options.default !== undefined &&
            (options.exclusive !== true ||
                typeof options.default !== 'string' ||
                options.default === '')) {
            throw new RuleSetError(`RuleSet '${id}': \`default\` is the id of a member, and only a ` +
                'choice (`exclusive: true`) has one.');
        }
        this._default = (_c = options.default) !== null && _c !== void 0 ? _c : null;
        // What was said, and only that: a declaration that leaves an option out has no opinion on it.
        this._stated = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
        if (this._stated.supersedes !== undefined) {
            this._stated.supersedes = this.supersedes();
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
    /** A choice's default member as stated, or `null` for its first. */
    defaultMember() {
        return this._default;
    }
    /** The options this declaration gave, and none it left out. */
    stated() {
        return { ...this._stated };
    }
    /** The ids of the rules and sets this one takes the place of while it is in force. */
    supersedes() {
        return [...this._supersedes];
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