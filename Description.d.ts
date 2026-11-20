/**
 * A value an effect description holds: a number, a word, a flag, a class (a building, a yield, a terrain…), which a
 *  reader names by its class, so only named classes belong here, not arrow or anonymous functions; a list of them, or
 *  a record of them (`{ Food: 1 }`).
 */
export type DescribedValue =
  | string
  | number
  | boolean
  | null
  | Function
  | DescribedValue[]
  | {
      [field: string]: DescribedValue | undefined;
    };
/**
 * What one effect of a rule does, as data a reader can put into words without knowing the rule: its `type`
 *  (`yield_percent`, `content`…), which says what the rest mean, and the fields that type has. `subject` is what the
 *  effect belongs to: the building, Wonder or other class whose entry it is described in.
 *
 * ```ts
 * { type: 'yield_percent', subject: Library, yield: Research, value: 0.5, of: 'base' }
 * ```
 */
export interface EffectDescription {
  type: string;
  /** A field left `undefined` is dropped, so a typed description can have optional fields. */
  [field: string]: DescribedValue | undefined;
}
/** A description declared as an `interface`: anything with a `type`. */
export interface DescriptionShape {
  type: string;
}
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
export declare class Description {
  private _effects;
  /**
   * Each effect is an `EffectDescription`, or any shape with a `type` (an `interface` has no index signature, so it
   *  wouldn't be one), whose fields are checked as they are copied.
   */
  constructor(...effects: (EffectDescription | DescriptionShape)[]);
  /** The effects described, in the order they were given. */
  effects(): EffectDescription[];
}
export default Description;
