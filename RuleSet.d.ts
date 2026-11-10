/** A rule by its id, a set, or the id of a set registered elsewhere. */
export type RuleSetMember = string | RuleSet;
export type RuleSetOptions = {
  /**
   * A choice: exactly one member is on, the first until another is chosen.
   * A member can be one rule or a whole set of them.
   */
  exclusive?: boolean;
  /** `false` for a set whose rules start switched off. Ignored by a choice. */
  enabled?: boolean;
};
export declare class RuleSetError extends Error {}
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
export declare class RuleSet {
  private _enabled;
  private _exclusive;
  private _id;
  private _listeners;
  private _members;
  constructor(id: string, ...values: (RuleSetOptions | RuleSetMember)[]);
  id(): string;
  /** Whether this is a choice between its members. */
  exclusive(): boolean;
  /** Whether its rules start switched on. */
  enabledByDefault(): boolean;
  members(): RuleSetMember[];
  /** Each member's id, in order: a rule's, or a set's. */
  memberIds(): string[];
  has(member: RuleSetMember): boolean;
  /** Added to the end. One already there, by id, is left where it is. */
  add(...members: RuleSetMember[]): this;
  remove(...members: RuleSetMember[]): this;
  /** Told of every change to the members. Returns how to stop listening. */
  subscribe(listener: () => void): () => void;
  private changed;
}
export declare const idOf: (member: RuleSetMember) => string;
export default RuleSet;
