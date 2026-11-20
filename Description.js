"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Description = void 0;
/**
 * What a rule does, said as data (civ-clone/web-renderer#1196): one or more effect descriptions, given to the rule as
 *  another of its items, beside its criteria and effect:
 *
 * ```ts
 * new YieldModifier(
 *   new Criterion(…),
 *   new Effect(…),
 *   new Description({ type: 'yield_percent', subject: Library, yield: Research, value: 0.5, of: 'base' })
 * )
 * ```
 *
 * Nothing reads it while the rule runs: it is for whatever explains the rules to a player, which reads it from the
 *  rules that are enabled, so a rule set that replaces or disables a rule replaces or drops what is said about it too.
 *  Build the effect and its description from the same values, so the two can't disagree.
 */
class Description {
    constructor(...effects) {
        effects.forEach((effect) => {
            if (effect === null ||
                typeof effect !== 'object' ||
                typeof effect.type !== 'string' ||
                effect.type === '') {
                throw new TypeError('Description: each effect needs a `type`, a non-empty string.');
            }
        });
        this._effects = Object.freeze(effects.map((effect) => Object.freeze({ ...effect })));
    }
    /** The effects described, in the order they were given. */
    effects() {
        return [...this._effects];
    }
}
exports.Description = Description;
exports.default = Description;
//# sourceMappingURL=Description.js.map