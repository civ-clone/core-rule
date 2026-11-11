import Rule from './Rule';
/** A rule by its id, a set, or the id of a set registered elsewhere. */
export type RuleSetMember = string | RuleSet;
/** What can be given as a member: a `Rule` is taken by its id. */
export type RuleSetEntry = RuleSetMember | Rule;
export type RuleSetOptions = {
  /**
   * A choice: exactly one member is on, its default until another is chosen.
   * A member can be one rule or a whole set of them.
   */
  exclusive?: boolean;
  /**
   * A choice's default member, by id. Without one, the first member is the
   * default: which, for a choice declared in more than one place, depends on
   * the order they load in (see `RuleSetRegistry.validate`).
   */
  default?: string;
  /** `false` for a plain set whose rules start switched off. */
  enabled?: boolean;
  /**
   * What this set takes the place of: ids of rules, or of sets, meaning every
   * rule beneath them. While the set is in force none of them runs. See
   * `RuleSetRegistry`.
   */
  supersedes?: string[];
};
export declare class RuleSetError extends Error {}
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
export declare class RuleSet {
  private _default;
  private _enabled;
  private _exclusive;
  private _id;
  private _listeners;
  private _members;
  private _stated;
  private _supersedes;
  constructor(id: string, ...values: (RuleSetOptions | RuleSetEntry)[]);
  id(): string;
  /** Whether this is a choice between its members. */
  exclusive(): boolean;
  /** Whether its rules start switched on. */
  enabledByDefault(): boolean;
  /** A choice's default member as stated, or `null` for its first. */
  defaultMember(): string | null;
  /** The options this declaration gave, and none it left out. */
  stated(): RuleSetOptions;
  /** The ids of the rules and sets this one takes the place of while it is in force. */
  supersedes(): string[];
  members(): RuleSetMember[];
  /** Each member's id, in order: a rule's, or a set's. */
  memberIds(): string[];
  has(member: RuleSetEntry): boolean;
  /** Added to the end. One already there, by id, is left where it is. */
  add(...entries: RuleSetEntry[]): this;
  remove(...entries: RuleSetEntry[]): this;
  /** Told of every change to the members. Returns how to stop listening. */
  subscribe(listener: () => void): () => void;
  private changed;
}
export declare const idOf: (member: RuleSetEntry) => string;
export default RuleSet;
