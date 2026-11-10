import {
  RuleRegistry,
  UnknownRuleError,
  instance as ruleRegistryInstance,
} from './RuleRegistry';
import { RuleSet, RuleSetEntry, RuleSetError } from './RuleSet';
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
 * rule the tree says should run is left exactly as it is, so a rule that play
 * has switched off for its own reasons (`rule.disable()`, as several packages
 * do for a moment at a time) is not switched back on by a change to some
 * other set. `state()` is what the sets say, not `rule.enabled()`.
 *
 * **Rules are switched as they arrive.** Packages load in name order, so a set
 * is often registered before the rules it names. The registry listens to the
 * `RuleRegistry`, so an alternative that is not the chosen one is off from the
 * moment it is registered, and no host has to remember to apply anything.
 * `check()` is for the host to call once every package is in: until then a
 * rule id nothing has registered is not an error, and after it is.
 *
 * One registry to a `RuleRegistry`. Two would each switch the same rules;
 * `dispose()` one before making another for the same rules.
 */
export class RuleSetRegistry implements IRuleSetRegistry {
  private _chosen: Map<string, string> = new Map();
  /** The rules that start off, worked out when first asked after the tree changes. */
  private _defaultOff: Set<string> | null = null;
  private _effective: Map<string, boolean> = new Map();
  private _pending: Map<string, RuleSetEntry[]> = new Map();
  private _rules: RuleRegistry;
  private _sets: Map<string, RuleSet> = new Map();
  private _stopListening: () => void;
  private _subscriptions: Map<RuleSet, () => void> = new Map();
  /** The rules this has switched off: the only ones it will switch back on. */
  private _switchedOff: Set<string> = new Set();
  private _values: Map<string, boolean> = new Map();

  constructor(rules: RuleRegistry) {
    this._rules = rules;

    this._stopListening = rules.onRegister((rule: Rule): void => {
      const id = rule.id();

      // A new rule under an id that should be off: this one has not been switched yet, whatever the last was.
      if (id !== null && this._effective.get(id) === false) {
        this._switchedOff.delete(id);
        this._switch(id, false);
      }
    });
  }

  /** The rules these sets switch. */
  ruleRegistry(): RuleRegistry {
    return this._rules;
  }

  /**
   * Stops listening to the rules and to its sets, and switches back on what
   * it had switched off. For a registry that is being replaced.
   */
  dispose(): void {
    this._stopListening();
    this._subscriptions.forEach((stop) => stop());
    this._subscriptions.clear();
    this._sets.clear();
    this._pending.clear();
    this._values.clear();
    this._chosen.clear();
    this._defaultOff = null;

    this._apply();
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
   * them could never be switched. All of them are looked at before any is
   * taken in, so a refusal leaves the registry as it was.
   */
  register(...sets: RuleSet[]): void {
    const incoming = new Map<string, RuleSet>(),
      look = (set: RuleSet): void => {
        const known = incoming.get(set.id()) ?? this._sets.get(set.id());

        if (known === set) {
          return;
        }

        if (known) {
          throw this._duplicate(set.id());
        }

        incoming.set(set.id(), set);

        set.members().forEach((member) => {
          if (member instanceof RuleSet) {
            look(member);
          }
        });
      };

    sets.forEach(look);

    try {
      sets.forEach((set) => this._adopt(set));
    } finally {
      this._apply();
    }
  }

  /**
   * Taken out, along with the sets given to it as members that nothing else
   * registered holds, and its id out of every set that held it: an id left
   * behind would be read as a rule's.
   */
  unregister(...sets: RuleSet[]): void {
    const drop = (set: RuleSet): void => {
      if (this._sets.get(set.id()) !== set) {
        return;
      }

      this._sets.delete(set.id());
      this._chosen.delete(set.id());
      this._subscriptions.get(set)?.();
      this._subscriptions.delete(set);

      set.members().forEach((member) => {
        if (
          member instanceof RuleSet &&
          !this.entries().some((other) => other.has(member))
        ) {
          drop(member);
        }
      });
    };

    try {
      sets.forEach((set) => {
        drop(set);

        // Each tells its subscription, which prunes and applies.
        this.entries().forEach((other) => other.remove(set.id()));
      });
    } finally {
      this._defaultOff = null;
      this._apply();
    }
  }

  /**
   * Add members to the set registered as `id`, now or when it arrives.
   *
   * This is how a plugin adds its rules to another package's set without
   * importing it, and without caring which of the two loads first. `check()`
   * reports a set that never arrived.
   */
  extend(id: string, ...members: RuleSetEntry[]): void {
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
   * holds, for a choice, which is chosen from and not switched, and for a set
   * with nothing to switch (see `RuleSetDescription.switchable`).
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

    this._tops().forEach((top) => visit(top.id(), false, new Set()));

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

    try {
      choices.forEach((choice) => {
        try {
          if (typeof choice.value === 'string') {
            this._choose(choice.id, choice.value);

            return;
          }

          if (typeof choice.value !== 'boolean') {
            throw new RuleSetError(
              `A choice is switched (a boolean) or picked (an id): '${choice.id}' is neither.`
            );
          }

          this._set(choice.id, choice.value);
        } catch (error) {
          if (!(error instanceof RuleSetError)) {
            throw error;
          }

          unknown.push(choice);
        }
      });
    } finally {
      this._apply();
    }

    return unknown;
  }

  /** Everything back as the sets declare it. */
  reset(): void {
    this._values.clear();
    this._chosen.clear();

    this._apply();
  }

  /** The whole tree, from the sets no other holds, for a UI to draw. */
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
          switchable: true,
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
        ? {
            id,
            kind: 'choice',
            state: 'on',
            active,
            switchable: false,
            chosen,
            members,
          }
        : {
            id,
            kind: 'set',
            state: this.state(id),
            active,
            switchable: this._leaves(id).length > 0,
            members,
          };
    };

    return this._tops().map((top) => describe(top.id(), true, new Set()));
  }

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

    this._sets.forEach((set) => {
      if (this._rules.getById(set.id()) !== null) {
        throw new DuplicateRuleSetIdError(
          `'${set.id()}' is the id of a rule set and of a rule. A set that ` +
            'names it would mean the set, and the rule could not be reached.'
        );
      }
    });

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

  private _duplicate(id: string): DuplicateRuleSetIdError {
    return new DuplicateRuleSetIdError(
      `Two rule sets claim the id '${id}'. An id addresses one set, so one ` +
        'of them could never be switched. To add to a set that exists, use ' +
        '`extend`.'
    );
  }

  private _adopt(set: RuleSet): void {
    const existing = this._sets.get(set.id());

    if (existing === set) {
      return;
    }

    if (existing) {
      throw this._duplicate(set.id());
    }

    this._sets.set(set.id(), set);
    this._defaultOff = null;
    this._subscriptions.set(
      set,
      set.subscribe((): void => {
        this._defaultOff = null;

        // A member that has gone is no longer a choice to remember: added back, it is not chosen again by surprise.
        const chosen = this._chosen.get(set.id());

        if (chosen !== undefined && !set.memberIds().includes(chosen)) {
          this._chosen.delete(set.id());
        }

        try {
          this._adoptMembers(set);
        } finally {
          this._apply();
        }
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

    const leaves = this._leaves(id);

    if (leaves.length === 0) {
      throw new RuleSetError(
        `RuleSet '${id}' has nothing to switch: it reaches no rule except ` +
          'through a choice, and a choice is chosen from.'
      );
    }

    leaves.forEach((leaf) => this._values.set(leaf, on));
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

    if (chosen !== undefined && members.includes(chosen)) {
      return chosen;
    }

    return members[0] ?? null;
  }

  /**
   * Where a walk of the whole tree starts: the sets no other holds, then any
   * set none of those reaches. The second only happens when a set is inside
   * itself, which `check()` refuses, but until it has, such a set's rules are
   * still switched, described and saved.
   */
  private _tops(): RuleSet[] {
    const tops = this.roots(),
      reached = new Set<string>(),
      reach = (id: string): void => {
        if (reached.has(id)) {
          return;
        }

        reached.add(id);

        this._sets.get(id)?.memberIds().forEach(reach);
      };

    tops.forEach((top) => reach(top.id()));

    this._sets.forEach((set) => {
      if (!reached.has(set.id())) {
        tops.push(set);
        reach(set.id());
      }
    });

    return tops;
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

    this._tops().forEach((top) => visit(top.id(), true, new Set()));

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

  /**
   * Off: switched off, once, and remembered. On: switched back on only if
   * this is what switched it off. See the class comment.
   */
  private _switch(id: string, on: boolean): void {
    const rule = this._rules.getById(id);

    if (on) {
      if (this._switchedOff.delete(id) && rule !== null) {
        this._rules.enableById(id);
      }

      return;
    }

    // Not registered yet: `onRegister` switches it when it is.
    if (rule === null || this._switchedOff.has(id)) {
      return;
    }

    this._switchedOff.add(id);
    this._rules.disableById(id);
  }
}

export const instance: RuleSetRegistry = new RuleSetRegistry(
  ruleRegistryInstance
);

export default RuleSetRegistry;
