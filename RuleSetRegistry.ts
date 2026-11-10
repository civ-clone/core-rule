import { RuleRegistry, UnknownRuleError } from './RuleRegistry';
import { RuleSet, RuleSetError, RuleSetMember, idOf } from './RuleSet';
import Rule from './Rule';

export class UnknownRuleSetError extends RuleSetError {}
export class DuplicateRuleSetIdError extends RuleSetError {}
export class RuleSetCycleError extends RuleSetError {}

export type RuleSetState = 'on' | 'off' | 'mixed';

/**
 * One thing chosen: a rule or a plain set switched on or off (`boolean`), or
 * the member of a choice that was picked (its id).
 */
export type RuleSetChoice = { id: string; value: boolean | string };

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
  entries(): RuleSet[];
  extend(id: string, ...members: RuleSetMember[]): void;
  get(id: string): RuleSet | null;
  register(...sets: RuleSet[]): void;
  reset(): void;
  restore(choices: RuleSetChoice[]): RuleSetChoice[];
  roots(): RuleSet[];
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
 *   that.
 * - `choose(id, member)` for a choice.
 *
 * **Rules are switched as they arrive.** Packages load in name order, so a set
 * is often registered before the rules it names. The registry listens to the
 * `RuleRegistry`, so an alternative that is not the chosen one is off from the
 * moment it is registered, and no host has to remember to apply anything.
 * `check()` is for the host to call once every package is in: until then a
 * rule id nothing has registered is not an error, and after it is.
 */
export class RuleSetRegistry implements IRuleSetRegistry {
  private _chosen: Map<string, string> = new Map();
  /** The rules that start off, worked out when first asked after the tree changes. */
  private _defaultOff: Set<string> | null = null;
  private _effective: Map<string, boolean> = new Map();
  private _pending: Map<string, RuleSetMember[]> = new Map();
  private _rules: RuleRegistry;
  private _sets: Map<string, RuleSet> = new Map();
  private _subscriptions: Map<RuleSet, () => void> = new Map();
  /** The rules this has switched off, to switch back on if they leave every set. */
  private _switchedOff: Set<string> = new Set();
  private _values: Map<string, boolean> = new Map();

  constructor(rules: RuleRegistry) {
    this._rules = rules;

    rules.onRegister((rule: Rule): void => {
      const id = rule.id();

      if (id !== null && this._effective.has(id)) {
        this._switch(id, this._effective.get(id)!);
      }
    });
  }

  /** Every set, in the order registered, whether or not another holds it. */
  entries(): RuleSet[] {
    return [...this._sets.values()];
  }

  get(id: string): RuleSet | null {
    return this._sets.get(id) ?? null;
  }

  /** The sets no other set holds: where a UI starts drawing. */
  roots(): RuleSet[] {
    const held = new Set<string>();

    this._sets.forEach((set) =>
      set.memberIds().forEach((member) => held.add(member))
    );

    return this.entries().filter((set) => !held.has(set.id()));
  }

  /**
   * A set, and every set given to it as a member, and theirs.
   *
   * Two sets under one id are refused, as two rules under one id are: one of
   * them could never be switched.
   */
  register(...sets: RuleSet[]): void {
    sets.forEach((set) => this._adopt(set));

    this._apply();
  }

  unregister(...sets: RuleSet[]): void {
    sets.forEach((set) => {
      if (this._sets.get(set.id()) !== set) {
        return;
      }

      this._sets.delete(set.id());
      this._defaultOff = null;
      this._chosen.delete(set.id());
      this._subscriptions.get(set)?.();
      this._subscriptions.delete(set);
    });

    this._apply();
  }

  /**
   * Add members to the set registered as `id`, now or when it arrives.
   *
   * This is how a plugin adds its rules to another package's set without
   * importing it, and without caring which of the two loads first. `check()`
   * reports a set that never arrived.
   */
  extend(id: string, ...members: RuleSetMember[]): void {
    const set = this._sets.get(id);

    if (set) {
      set.add(...members);

      return;
    }

    this._pending.set(id, [...(this._pending.get(id) ?? []), ...members]);
  }

  /**
   * Switch a rule, or every rule a plain set reaches, on or off.
   *
   * Throws for an id that is neither a registered set nor a rule some set
   * holds, and for a choice, which is chosen from and not switched.
   */
  set(id: string, on: boolean): void {
    this._set(id, on);
    this._apply();
  }

  /** Pick the member of a choice that is on. */
  choose(id: string, member: string): void {
    this._choose(id, member);
    this._apply();
  }

  /** A rule's setting, or a set's from the rules it switches. */
  state(id: string): RuleSetState {
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
  chosen(id: string): string | null {
    const set = this._requireSet(id);

    if (!set.exclusive()) {
      throw new RuleSetError(`RuleSet '${id}' is not a choice.`);
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
  choices(): RuleSetChoice[] {
    const choices: RuleSetChoice[] = [],
      said = new Set<string>(),
      say = (id: string, value: boolean | string): void => {
        const key = `${id}\n${String(value)}`;

        if (!said.has(key)) {
          said.add(key);
          choices.push({ id, value });
        }
      },
      differs = (rule: string): boolean =>
        this._value(rule) !== this._default(rule),
      visit = (id: string, covered: boolean, path: Set<string>): void => {
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
        } else {
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
            visit(member, inner?.exclusive() ? false : coveredBelow, path);
          });
        }

        path.delete(id);
      };

    this.roots().forEach((root) => visit(root.id(), false, new Set()));

    return choices;
  }

  /**
   * Back to the defaults, then each choice in turn. Returns those that could
   * not be made, because nothing registered answers to the id any more: a
   * save from a build with a set this one lacks should load and say so, not
   * be refused.
   */
  restore(choices: RuleSetChoice[]): RuleSetChoice[] {
    const unknown: RuleSetChoice[] = [];

    this._values.clear();
    this._chosen.clear();

    choices.forEach((choice) => {
      try {
        if (typeof choice.value === 'string') {
          this._choose(choice.id, choice.value);

          return;
        }

        this._set(choice.id, choice.value);
      } catch (error) {
        if (!(error instanceof RuleSetError)) {
          throw error;
        }

        unknown.push(choice);
      }
    });

    this._apply();

    return unknown;
  }

  /** Everything back as the sets declare it. */
  reset(): void {
    this._values.clear();
    this._chosen.clear();

    this._apply();
  }

  /** The whole tree from `roots()`, for a UI to draw. */
  describe(): RuleSetDescription[] {
    const describe = (
      id: string,
      active: boolean,
      path: Set<string>
    ): RuleSetDescription => {
      const set = this._sets.get(id);

      if (!set) {
        return {
          id,
          kind: 'rule',
          state: this._value(id) ? 'on' : 'off',
          active,
          members: [],
        };
      }

      const chosen = set.exclusive() ? this._chosenOf(set) : null,
        inside = new Set(path).add(id),
        members = set
          .memberIds()
          .filter((member) => !inside.has(member))
          .map((member) =>
            describe(
              member,
              active && (!set.exclusive() || member === chosen),
              inside
            )
          );

      return set.exclusive()
        ? { id, kind: 'choice', state: 'on', active, chosen, members }
        : { id, kind: 'set', state: this.state(id), active, members };
    };

    return this.roots().map((root) => describe(root.id(), true, new Set()));
  }

  /**
   * For the host, once every package has loaded: throws for a rule id that
   * nothing registered, a set `extend` was given members for that never
   * arrived, and a set that is inside itself.
   *
   * Until then none of those is an error, since the package that settles it
   * may simply not have loaded yet. After it, each is a typo or a missing
   * package, and should stop the game starting and not quietly leave a rule
   * running.
   */
  check(): void {
    if (this._pending.size > 0) {
      throw new UnknownRuleSetError(
        `Members were added to rule set(s) that were never registered: ${[
          ...this._pending.keys(),
        ]
          .sort()
          .join(', ')}.`
      );
    }

    const walk = (id: string, path: string[]): void => {
      const set = this._sets.get(id);

      if (!set) {
        if (this._rules.getById(id) === null) {
          throw new UnknownRuleError(
            `Rule set '${path[path.length - 1]}' names '${id}', which is ` +
              'neither a registered rule nor a registered rule set.'
          );
        }

        return;
      }

      if (path.includes(id)) {
        throw new RuleSetCycleError(
          `Rule set '${id}' is inside itself: ${[...path, id].join(' → ')}.`
        );
      }

      set.memberIds().forEach((member) => walk(member, [...path, id]));
    };

    this._sets.forEach((set) => walk(set.id(), []));
  }

  private _adopt(set: RuleSet): void {
    const existing = this._sets.get(set.id());

    if (existing === set) {
      return;
    }

    if (existing) {
      throw new DuplicateRuleSetIdError(
        `Two rule sets claim the id '${set.id()}'. An id addresses one set, ` +
          'so one of them could never be switched. To add to a set that ' +
          'exists, use `extend`.'
      );
    }

    this._sets.set(set.id(), set);
    this._defaultOff = null;
    this._subscriptions.set(
      set,
      set.subscribe((): void => {
        this._defaultOff = null;
        this._adoptMembers(set);
        this._apply();
      })
    );

    const pending = this._pending.get(set.id());

    if (pending) {
      this._pending.delete(set.id());

      // Tells the subscription above, which adopts and applies.
      set.add(...pending);
    }

    this._adoptMembers(set);
  }

  private _adoptMembers(set: RuleSet): void {
    set.members().forEach((member) => {
      if (member instanceof RuleSet) {
        this._adopt(member);
      }
    });
  }

  private _requireSet(id: string): RuleSet {
    const set = this._sets.get(id);

    if (!set) {
      throw new UnknownRuleSetError(
        `No rule set is registered as '${id}'. Either it is misspelled, or ` +
          'the package that declares it is not loaded, or its id changed.'
      );
    }

    return set;
  }

  /** Throws unless some registered set holds `id` as a rule. */
  private _requireMember(id: string): void {
    for (const set of this._sets.values()) {
      if (set.memberIds().includes(id)) {
        return;
      }
    }

    throw new UnknownRuleSetError(
      `'${id}' is neither a registered rule set nor a rule that one holds.`
    );
  }

  private _set(id: string, on: boolean): void {
    const set = this._sets.get(id);

    if (!set) {
      this._requireMember(id);
      this._values.set(id, on);

      return;
    }

    if (set.exclusive()) {
      throw new RuleSetError(
        `RuleSet '${id}' is a choice: choose one of its members.`
      );
    }

    this._leaves(id).forEach((leaf) => this._values.set(leaf, on));
  }

  private _choose(id: string, member: string): void {
    const set = this._requireSet(id);

    if (!set.exclusive()) {
      throw new RuleSetError(`RuleSet '${id}' is not a choice.`);
    }

    if (!set.memberIds().includes(member)) {
      throw new UnknownRuleSetError(
        `'${member}' is not a member of the choice '${id}'.`
      );
    }

    this._chosen.set(id, member);
  }

  private _chosenOf(set: RuleSet): string | null {
    const members = set.memberIds(),
      chosen = this._chosen.get(set.id());

    // One that has since been removed is no longer a choice to honour.
    if (chosen !== undefined && members.includes(chosen)) {
      return chosen;
    }

    return members[0] ?? null;
  }

  /**
   * The rules a plain set switches: those beneath it through plain sets
   * only. A choice beneath is not entered.
   */
  private _leaves(id: string, path: Set<string> = new Set()): string[] {
    const set = this._sets.get(id);

    if (!set) {
      return [id];
    }

    if (set.exclusive() || path.has(id)) {
      return [];
    }

    path.add(id);

    const leaves = new Set<string>();

    set
      .memberIds()
      .forEach((member) =>
        this._leaves(member, path).forEach((leaf) => leaves.add(leaf))
      );

    path.delete(id);

    return [...leaves];
  }

  private _value(rule: string): boolean {
    return this._values.get(rule) ?? this._default(rule);
  }

  /** On, unless a plain set declared `{ enabled: false }` switches it. */
  private _default(rule: string): boolean {
    if (this._defaultOff === null) {
      const off = new Set<string>();

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
  private _evaluate(): Map<string, boolean> {
    const effective = new Map<string, boolean>(),
      visit = (id: string, active: boolean, path: Set<string>): void => {
        const set = this._sets.get(id);

        if (!set) {
          effective.set(
            id,
            (effective.get(id) ?? false) || (active && this._value(id))
          );

          return;
        }

        if (path.has(id)) {
          return;
        }

        path.add(id);

        const chosen = set.exclusive() ? this._chosenOf(set) : null;

        set
          .memberIds()
          .forEach((member) =>
            visit(
              member,
              active && (!set.exclusive() || member === chosen),
              path
            )
          );

        path.delete(id);
      };

    // From every set and not only the roots: a set inside itself has no root above it, and its rules are still
    //  switched until `check()` says so. A set reached again from its parent adds nothing a rule's `||` does not
    //  already hold, except beneath an unchosen alternative, where starting from it as if it were a root would wrongly
    //  make it active: so only the roots, and whatever no root reaches.
    const reached = new Set<string>(),
      reach = (id: string): void => {
        if (reached.has(id)) {
          return;
        }

        reached.add(id);

        this._sets.get(id)?.memberIds().forEach(reach);
      };

    this.roots().forEach((root) => {
      visit(root.id(), true, new Set());
      reach(root.id());
    });

    this._sets.forEach((set) => {
      if (!reached.has(set.id())) {
        visit(set.id(), true, new Set());
        reach(set.id());
      }
    });

    return effective;
  }

  private _apply(): void {
    this._defaultOff = null;
    this._effective = this._evaluate();

    this._effective.forEach((on, id) => this._switch(id, on));

    // A rule this switched off, and that no set holds any more, goes back on: nothing else would ever do it.
    [...this._switchedOff]
      .filter((id) => !this._effective.has(id))
      .forEach((id) => this._switch(id, true));
  }

  private _switch(id: string, on: boolean): void {
    if (on) {
      this._switchedOff.delete(id);
    } else {
      this._switchedOff.add(id);
    }

    const rule = this._rules.getById(id);

    // Not registered yet: `onRegister` switches it when it is.
    if (rule === null || rule.enabled() === on) {
      return;
    }

    if (on) {
      this._rules.enableById(id);

      return;
    }

    this._rules.disableById(id);
  }
}

export default RuleSetRegistry;
