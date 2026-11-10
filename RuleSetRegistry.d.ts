import { RuleRegistry } from './RuleRegistry';
import { RuleSet, RuleSetEntry, RuleSetError } from './RuleSet';
export declare class UnknownRuleSetError extends RuleSetError {}
export declare class DuplicateRuleSetIdError extends RuleSetError {}
export declare class RuleSetCycleError extends RuleSetError {}
export type RuleSetState = 'on' | 'off' | 'mixed';
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
   * `false` beneath a member of a choice that is not the one chosen: what is
   * there keeps its setting, and none of it runs.
   */
  active: boolean;
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
export declare class RuleSetRegistry implements IRuleSetRegistry {
  private _chosen;
  /** The rules that start off, worked out when first asked after the tree changes. */
  private _defaultOff;
  private _effective;
  private _pending;
  private _rules;
  private _sets;
  private _stopListening;
  private _subscriptions;
  /** The rules this has switched off: the only ones it will switch back on. */
  private _switchedOff;
  private _values;
  constructor(rules: RuleRegistry);
  /** The rules these sets switch. */
  ruleRegistry(): RuleRegistry;
  /**
   * Stops listening to the rules and to its sets, and switches back on what
   * it had switched off. For a registry that is being replaced.
   */
  dispose(): void;
  /** Every set, in the order registered, whether or not another holds it. */
  entries(): RuleSet[];
  get(id: string): RuleSet | null;
  /** The sets no other set holds: where a UI starts drawing. */
  roots(): RuleSet[];
  /**
   * A set, and every set given to it as a member, and theirs.
   *
   * Two sets under one id are refused, as two rules under one id are: one of
   * them could never be switched. All of them are looked at before any is
   * taken in, so a refusal leaves the registry as it was.
   */
  register(...sets: RuleSet[]): void;
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
  unregister(...sets: RuleSet[]): void;
  /**
   * Add members to the set registered as `id`, now or when it arrives.
   *
   * This is how a plugin adds its rules to another package's set without
   * importing it, and without caring which of the two loads first. `check()`
   * reports a set that never arrived.
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
  /** The member of a choice that is on: the one picked, or else the first. */
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
  check(): void;
  private _duplicate;
  private _adopt;
  private _adoptMembers;
  private _requireSet;
  /** Throws unless some registered set holds `id` as a rule. */
  private _requireMember;
  private _set;
  private _choose;
  private _chosenOf;
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
  private _apply;
  /**
   * Off: switched off if it is on, and remembered as this registry's doing.
   * On: switched back on only if it is remembered. See the class comment.
   */
  private _switch;
}
export declare const instance: RuleSetRegistry;
export default RuleSetRegistry;
