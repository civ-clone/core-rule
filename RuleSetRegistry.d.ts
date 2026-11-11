import { RuleRegistry } from './RuleRegistry';
import { RuleSet, RuleSetEntry, RuleSetError } from './RuleSet';
export declare class UnknownRuleSetError extends RuleSetError {}
export declare class DuplicateRuleSetIdError extends RuleSetError {}
export declare class RuleSetCycleError extends RuleSetError {}
export declare class RuleSetConflictError extends RuleSetError {}
export declare class RuleSetOptionConflictError extends RuleSetError {}
export declare class RuleSetNoDefaultError extends RuleSetError {}
export type RuleSetState = 'on' | 'off' | 'mixed';
/**
 * What can be wrong with a game's sets (see `validate()`). These stop a game
 * starting (`blocking`):
 *
 * - `conflict`: two sets in force, something of each of which runs,
 *   supersede the same registered rule, and neither supersedes the other. One
 *   has to be switched off.
 * - `cycle`: a set inside itself, or superseding itself through others.
 * - `duplicate-id`: a set's id is also a rule's.
 * - `option-conflict`: two declarations of a set state an option differently.
 *   Until it is settled, the first stated stands.
 * - `no-default`: a choice whose members come from more than one declaration,
 *   or call to `extend`, none of which states its `default`, so its default
 *   would depend on the order the packages load in.
 *
 * These are only shown, since the id may simply belong to a package that is
 * not loaded: what it names is left out, and switched as usual if it arrives.
 *
 * - `unknown-member`: a set names an id that is neither a rule nor a set, or
 *   a choice's `default` is none of its members.
 * - `unknown-superseded`: a set supersedes an id that is neither.
 */
export type RuleSetProblemKind =
  | 'conflict'
  | 'cycle'
  | 'duplicate-id'
  | 'option-conflict'
  | 'no-default'
  | 'unknown-member'
  | 'unknown-superseded';
/**
 * One problem, as data for a UI to show. `ids` are the sets and rules
 * involved, the set first where there is one; `message` says it for a person;
 * `blocking` is whether a game may start while it stands, the same for every
 * host.
 */
export type RuleSetProblem = {
  kind: RuleSetProblemKind;
  ids: string[];
  message: string;
  blocking: boolean;
};
/**
 * One thing chosen: a rule or a plain set switched on or off (`boolean`), or
 * the member of a choice that was picked (its id).
 */
export type RuleSetChoice = {
  id: string;
  value: boolean | string;
};
/** A set, a choice or a rule as a UI would draw it, with what is beneath. */
export type RuleSetDescription = {
  id: string;
  kind: 'set' | 'choice' | 'rule';
  /**
   * A rule: whether it is switched on. A set: `on` when every rule it
   * switches is, `off` when none is, `mixed` otherwise. A choice is always
   * `on`: see `chosen`.
   */
  state: RuleSetState;
  /**
   * `false` beneath a member of a choice that is not the one chosen, and for
   * what is superseded and beneath it: what is there keeps its setting, and
   * none of it runs.
   */
  active: boolean;
  /** A set or choice: the ids it supersedes, as it declares them. */
  supersedes?: string[];
  /** Superseded just now: the sets in force that supersede it. */
  supersededBy?: string[];
  /**
   * Whether `set(id, …)` has anything to switch: a rule always, a choice
   * never, and a set when it reaches at least one rule without passing through
   * a choice. A set that holds only choices is a heading, not a checkbox.
   */
  switchable: boolean;
  /** A choice's chosen member. `null` for one with no members. */
  chosen?: string | null;
  members: RuleSetDescription[];
};
export interface IRuleSetRegistry {
  check(): void;
  choices(): RuleSetChoice[];
  choose(id: string, member: string): void;
  chosen(id: string): string | null;
  declarations(id: string): RuleSet[];
  describe(): RuleSetDescription[];
  dispose(): void;
  entries(): RuleSet[];
  extend(id: string, ...members: RuleSetEntry[]): void;
  get(id: string): RuleSet | null;
  register(...sets: RuleSet[]): void;
  reset(): void;
  restore(choices: RuleSetChoice[]): RuleSetChoice[];
  roots(): RuleSet[];
  ruleRegistry(): RuleRegistry;
  set(id: string, on: boolean): void;
  state(id: string): RuleSetState;
  unregister(...sets: RuleSet[]): void;
  validate(): RuleSetProblem[];
}
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
 * **Unless it is superseded** (civ-clone/web-renderer#954). A set that
 * `supersedes` rules or sets is in force when some path to it is active and
 * at least one registered rule beneath it, through the chosen members of any
 * choice, is switched on (a replacement that has not loaded replaces
 * nothing); and while it is, nothing it supersedes runs, except what is
 * beneath the set itself. A set it names means every rule beneath that set,
 * choices and all, and it carries through: a set in force also supersedes
 * what the sets it names supersede, and so on, however those sets are
 * switched. What is superseded keeps its setting, as
 * what is beneath an alternative not chosen does, and none of it is saved:
 * it is worked out from the sets, like the rest. Whether a set is in force
 * goes by the settings alone, never by whether it is itself superseded, so
 * the answer never depends on itself.
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
 * `validate()` and `check()` are for the host once every package is in.
 *
 * **A set belongs to no package** (civ-clone/web-renderer#954). Any package
 * may declare a set under an id, and every declaration of an id is one set:
 * their members together, in the order they arrived, and their options where
 * they state them (see `validate()` for when they disagree). Each declaration
 * is left as its package made it.
 *
 * **One registry to a `RuleRegistry`,** found with `RuleSetRegistry.of(rules)`,
 * which makes it the first time. Two would each switch the same rules, and
 * whichever was asked would know only its own sets and choices, so a second
 * `new RuleSetRegistry(rules)` is refused until the first is disposed.
 * (`instance`, below, is the one for the `RuleRegistry` module's own
 * `instance`, and listens to it from the moment this module is imported: with
 * no sets, it switches nothing.)
 */
export declare class RuleSetRegistry implements IRuleSetRegistry {
  private _cache;
  private _chosen;
  /** The rules that start off, worked out when first asked after the tree changes. */
  private _defaultOff;
  private _effective;
  /** This registry's own declaration of each set `extend` was given members for. */
  private _extensions;
  /** How many calls to `extend` gave each set members. */
  private _extended;
  private _rules;
  private _sets;
  private _stopListening;
  private _subscriptions;
  /** The rules this has switched off, each by id: the only ones it will switch back on. */
  private _switchedOff;
  /** When each setting in `_values` was made, to tell an older one from a newer. */
  private _setAt;
  private _settings;
  private _values;
  /**
   * The registry for these rules: the one there is, or a new one.
   *
   * What a `Game` given only its `rules` uses, so that it has the sets the
   * packages registered for those rules and not an empty registry of its own
   * beside them.
   */
  static of(rules: RuleRegistry): RuleSetRegistry;
  constructor(rules: RuleRegistry);
  /** The rules these sets switch. */
  ruleRegistry(): RuleRegistry;
  /**
   * Stops listening to the rules and to its sets, switches back on what it
   * had switched off, and is no longer the registry `of` these rules. For one
   * that is being replaced.
   */
  dispose(): void;
  /**
   * Every set, in the order its id was first registered, whether or not
   * another holds it. Each is as `get` gives it.
   */
  entries(): RuleSet[];
  /**
   * The set registered as `id`: its declaration, when there is one, or else a
   * new `RuleSet` that says what all of them say together, made afresh each
   * time and switching nothing if changed. `declarations(id)` gives each.
   */
  get(id: string): RuleSet | null;
  /** Each declaration of the set `id`, in the order registered. */
  declarations(id: string): RuleSet[];
  /** The sets no other set holds: where a UI starts drawing. */
  roots(): RuleSet[];
  /**
   * A set, and every set given to it as a member, and theirs.
   *
   * One under an id that is registered already is another declaration of
   * that set, and joins it: see the class comment.
   */
  register(...sets: RuleSet[]): void;
  /**
   * Taken out, each declaration given, along with the sets given to it as
   * members that nothing else registered holds. The set lasts while any
   * declaration of its id does.
   *
   * No other set is changed: sets are their package's own objects, and may be
   * in another game's registry too. A set that names this one by id keeps the
   * id, which `validate()` then reports unless a set is registered under it
   * again, as when one is swapped for another. A registered set that was
   * *given* this one holds the set itself, and would put it straight back, so
   * that is refused: take it out of there first.
   */
  unregister(...sets: RuleSet[]): void;
  /**
   * Add members to the set `id`: shorthand for declaring the set with them and
   * no options, so the set is there from now on, whether or not another
   * package declares it too, and whichever loads first.
   */
  extend(id: string, ...members: RuleSetEntry[]): void;
  /**
   * Switch a rule, or every rule a plain set reaches, on or off.
   *
   * Throws for an id that is neither a registered set nor a rule some set
   * holds, for a choice, which is chosen from and not switched, and for a set
   * with nothing to switch (see `RuleSetDescription.switchable`).
   */
  set(id: string, on: boolean): void;
  /** Pick the member of a choice that is on. */
  choose(id: string, member: string): void;
  /** A rule's setting, or a set's from the rules it switches. */
  state(id: string): RuleSetState;
  /** The member of a choice that is on: the one picked, or else its default. */
  chosen(id: string): string | null;
  /**
   * How the tree differs from its defaults, as the shortest list that says
   * so, from the top down. This is what a save keeps.
   *
   * A set switched as a whole is one line, not one per rule, so that
   * restoring it into a later version, where the set has gained a rule,
   * switches that rule with the rest.
   */
  choices(): RuleSetChoice[];
  /**
   * Back to the defaults, then each choice in turn. Returns those that could
   * not be made, because nothing registered answers to the id any more: a
   * save from a build with a set this one lacks should load and say so, not
   * be refused.
   */
  restore(choices: RuleSetChoice[]): RuleSetChoice[];
  /** Everything back as the sets declare it. */
  reset(): void;
  /** The whole tree, from the sets no other holds, for a UI to draw. */
  describe(): RuleSetDescription[];
  private _describe;
  /**
   * For the host, once every package has loaded: throws for the first of the
   * problems `validate()` finds that stops a game starting, for a host with
   * nobody to show them to. One that is only shown does not throw.
   */
  check(): void;
  /**
   * Every problem with the sets as they stand, as data, for a setup window to
   * show before a game starts: see `RuleSetProblemKind`. Empty when there are
   * none.
   *
   * The orphans (`unknown-*`) only mean anything once every package has
   * loaded, and even then are only shown. A `conflict` is the player's to
   * settle, by switching one of the two sets off, and goes as soon as they do.
   */
  validate(): RuleSetProblem[];
  private _validate;
  private _adopt;
  private _adoptMembers;
  /** A member that has gone is no longer a choice to remember: added back, it is not chosen again by surprise. */
  private _forgetChosen;
  private _requireSet;
  /** Throws unless some registered set holds `id` as a rule. */
  private _requireMember;
  private _set;
  private _choose;
  private _chosenOf;
  /** The sets no other set holds. */
  private _roots;
  /**
   * Where a walk of the whole tree starts: the sets no other holds, then any
   * set none of those reaches. The second only happens when a set is inside
   * itself, which `check()` refuses, but until it has, such a set's rules are
   * still switched, described and saved.
   */
  private _tops;
  /**
   * The rules a plain set switches: those beneath it through plain sets
   * only. A choice beneath is not entered.
   */
  private _leaves;
  private _value;
  /** On, unless a plain set declared `{ enabled: false }` switches it. */
  private _default;
  /** Whether each rule in the tree runs: see the class comment. */
  private _evaluate;
  /**
   * Every rule, and every set, beneath `id`, through every member of a choice
   * and not only the chosen one: what superseding it means.
   */
  private _beneath;
  /**
   * `work`, with what `_beneath` and `_reach` find kept until it is done:
   * nothing changes the tree meanwhile, and a long chain of sets superseding
   * one another would otherwise be walked again for each.
   */
  private _cached;
  /**
   * What a set supersedes, carried through: what it names, everything beneath
   * those, and what every set among them supersedes in turn, however those
   * sets are switched; except what is beneath the set itself. So a set can
   * take the place of the whole of another while keeping one of its rules, by
   * holding that rule too.
   */
  private _reach;
  /**
   * The ids, from what `set` names, by which it comes to supersede itself:
   * the last of them is the set, or a set that holds it. `null` when it does
   * not.
   */
  private _supersedesItself;
  /**
   * The sets that supersede something and are in force, in the order
   * registered: some path to the set is active, and at least one registered
   * rule beneath it, through the chosen member of any choice, is switched on.
   * By the settings alone: see the class comment.
   */
  private _inForce;
  /** What is superseded just now, rules and sets, each by the sets in force that supersede it. */
  private _supersession;
  private _apply;
  /**
   * Off: switched off if it is on, and remembered as this registry's doing.
   * On: switched back on only if it is the very rule remembered: one that has
   * since been replaced under the same id was never this registry's to switch
   * on. See the class comment.
   */
  private _switch;
}
export declare const instance: RuleSetRegistry;
export default RuleSetRegistry;
