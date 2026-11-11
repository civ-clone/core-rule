import { RuleRegistry, instance as ruleRegistryInstance } from './RuleRegistry';
import {
  RuleSet,
  RuleSetEntry,
  RuleSetError,
  RuleSetMember,
  RuleSetOptions,
  idOf,
} from './RuleSet';
import Rule from './Rule';

// The registry of each `RuleRegistry` that has one, so that whatever is handed a game's rules can find the sets that
//  go with them, and nothing makes a second.
const registries: WeakMap<RuleRegistry, RuleSetRegistry> = new WeakMap();

export class UnknownRuleSetError extends RuleSetError {}
export class DuplicateRuleSetIdError extends RuleSetError {}
export class RuleSetCycleError extends RuleSetError {}
export class RuleSetConflictError extends RuleSetError {}
export class RuleSetOptionConflictError extends RuleSetError {}
export class RuleSetNoDefaultError extends RuleSetError {}

export type RuleSetState = 'on' | 'off' | 'mixed';

/**
 * What can be wrong with a game's sets (see `validate()`). These stop a game
 * starting (`blocking`):
 *
 * - `conflict`: two sets in force, something of each of which runs,
 *   supersede the same registered rule, neither supersedes the other, and
 *   neither is beneath the other. One has to be switched off.
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

const blocking: { [kind in RuleSetProblemKind]: boolean } = {
  conflict: true,
  cycle: true,
  'duplicate-id': true,
  'option-conflict': true,
  'no-default': true,
  'unknown-member': false,
  'unknown-superseded': false,
};

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
   * Whether the path to this node is live: `false` beneath a member of a
   * choice that is not the one chosen, for what is superseded, and beneath a
   * superseded set (except what the superseding set holds through a live path
   * itself, which has an active node there). What is not active keeps its
   * setting. A rule runs exactly when it is registered, switched on, and at
   * least one of its nodes is active.
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
 * What `get` gives for a set with more than one declaration: a `RuleSet` for
 * reading, which refuses to be changed. A change to it would reach no
 * declaration, and so would be lost without a word: add to the set with
 * `RuleSetRegistry.extend`, or through a declaration of it.
 */
class MergedRuleSetView extends RuleSet {
  // Unset while `RuleSet`'s constructor adds the members, so that it can.
  private _sealed: boolean = false;

  constructor(id: string, ...values: (RuleSetOptions | RuleSetEntry)[]) {
    super(id, ...values);

    this._sealed = true;
  }

  add(...entries: RuleSetEntry[]): this {
    this._refuse();

    return super.add(...entries);
  }

  remove(...entries: RuleSetEntry[]): this {
    this._refuse();

    return super.remove(...entries);
  }

  private _refuse(): void {
    if (this._sealed) {
      throw new RuleSetError(
        `RuleSet '${this.id()}' is declared in more than one place, and this ` +
          'is all of them together, which cannot be changed: use ' +
          '`RuleSetRegistry.extend`, or one of its declarations.'
      );
    }
  }
}

/**
 * A set as the registry sees it: every declaration of its id taken together,
 * in the order they arrived (civ-clone/web-renderer#954). Worked out from them
 * each time it is asked, so a declaration that changes is seen at once, and
 * never written back to them: each is its package's own object, and may be in
 * another game's registry too.
 */
class MergedRuleSet {
  private _declarations: RuleSet[] = [];
  private _id: string;
  /** What `toRuleSet` gave, until anything about the set changes. */
  private _view: RuleSet | null = null;

  constructor(id: string) {
    this._id = id;
  }

  id(): string {
    return this._id;
  }

  declarations(): RuleSet[] {
    return [...this._declarations];
  }

  holds(declaration: RuleSet): boolean {
    return this._declarations.includes(declaration);
  }

  add(declaration: RuleSet): void {
    this._declarations.push(declaration);
    this.changed();
  }

  remove(declaration: RuleSet): void {
    this._declarations = this._declarations.filter(
      (other) => other !== declaration
    );
    this.changed();
  }

  /** A declaration of it has changed. */
  changed(): void {
    this._view = null;
  }

  /** Each declaration's in turn, a repeat left out: a set given as itself takes the place of its id, as in `add`. */
  members(): RuleSetMember[] {
    const members: RuleSetMember[] = [],
      at = new Map<string, number>();

    this._declarations.forEach((declaration) =>
      declaration.members().forEach((member) => {
        const index = at.get(idOf(member));

        if (index === undefined) {
          at.set(idOf(member), members.length);
          members.push(member);

          return;
        }

        if (member instanceof RuleSet && !(members[index] instanceof RuleSet)) {
          members[index] = member;
        }
      })
    );

    return members;
  }

  memberIds(): string[] {
    return this.members().map(idOf);
  }

  has(member: RuleSetEntry): boolean {
    return this.memberIds().includes(idOf(member));
  }

  /** The first value stated for an option, if any declaration states one. */
  stated<K extends keyof RuleSetOptions>(key: K): RuleSetOptions[K] {
    for (const declaration of this._declarations) {
      const value = declaration.stated()[key];

      if (value !== undefined) {
        return value;
      }
    }

    return undefined;
  }

  exclusive(): boolean {
    return this.stated('exclusive') ?? false;
  }

  enabledByDefault(): boolean {
    return this.stated('enabled') ?? true;
  }

  supersedes(): string[] {
    return [
      ...new Set(
        this._declarations.flatMap((declaration) => declaration.supersedes())
      ),
    ];
  }

  /** A choice's default: the one stated, if it is a member, or else the first. */
  defaultMember(): string | null {
    const members = this.memberIds(),
      stated = this.stated('default');

    if (stated !== undefined && members.includes(stated)) {
      return stated;
    }

    return members[0] ?? null;
  }

  /**
   * The set as one `RuleSet`: the declaration itself when there is only one,
   * and otherwise one made to say what they say together, the same one until
   * the set changes, and which refuses to be changed itself.
   */
  toRuleSet(): RuleSet {
    if (this._declarations.length === 1) {
      return this._declarations[0];
    }

    if (this._view !== null) {
      return this._view;
    }

    const stated = this.stated('default'),
      supersedes = this.supersedes(),
      options: RuleSetOptions = this.exclusive()
        ? {
            exclusive: true,
            ...(stated !== undefined && this.memberIds().includes(stated)
              ? { default: stated }
              : {}),
          }
        : { enabled: this.enabledByDefault() };

    if (supersedes.length > 0) {
      options.supersedes = supersedes;
    }

    this._view = new MergedRuleSetView(this._id, options, ...this.members());

    return this._view;
  }
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
 * nothing); and while it is, nothing it supersedes runs, except what the set
 * itself holds through a live path (through the chosen member of any choice
 * beneath it). A set it names means every rule beneath that set,
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
 * moment it is registered, and no host has to remember to apply anything. A
 * replacement rule that arrives puts its superseding set in force then; but
 * the `RuleRegistry` says nothing when a rule is unregistered, so one that is
 * taken out leaves its set in force until the sets are next applied (by any
 * `set`, `choose`, `register` and the like).
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
export class RuleSetRegistry implements IRuleSetRegistry {
  /** Each rule id, and the superseding sets that hold it through a live path: worked out again after each apply. */
  private _holdersOf: Map<string, string[]> | null = null;
  /** The superseding sets in force as last worked out. */
  private _inForceNow: Set<string> = new Set();
  private _cache: {
    beneath: Map<string, { rules: Set<string>; sets: Set<string> }>;
    live: Map<string, { rules: Set<string>; sets: Set<string> }>;
    reach: Map<string, { rules: Set<string>; sets: Set<string> }>;
  } | null = null;
  private _chosen: Map<string, string> = new Map();
  /** The rules that start off, worked out when first asked after the tree changes. */
  private _defaultOff: Set<string> | null = null;
  private _effective: Map<string, boolean> = new Map();
  /** This registry's own declaration of each set `extend` was given members for. */
  private _extensions: Map<string, RuleSet> = new Map();
  /** The members each call to `extend` gave each set, by id. */
  private _extended: Map<string, string[][]> = new Map();
  private _rules: RuleRegistry;
  private _sets: Map<string, MergedRuleSet> = new Map();
  private _stopListening: () => void;
  private _subscriptions: Map<RuleSet, () => void> = new Map();
  /** The rules this has switched off, each by id: the only ones it will switch back on. */
  private _switchedOff: Map<string, Rule> = new Map();
  /** When each setting in `_values` was made, to tell an older one from a newer. */
  private _setAt: Map<string, number> = new Map();
  private _settings: number = 0;
  private _values: Map<string, boolean> = new Map();

  /**
   * The registry for these rules: the one there is, or a new one.
   *
   * What a `Game` given only its `rules` uses, so that it has the sets the
   * packages registered for those rules and not an empty registry of its own
   * beside them.
   */
  static of(rules: RuleRegistry): RuleSetRegistry {
    return registries.get(rules) ?? new RuleSetRegistry(rules);
  }

  constructor(rules: RuleRegistry) {
    if (registries.has(rules)) {
      throw new RuleSetError(
        'These rules already have a RuleSetRegistry: use ' +
          '`RuleSetRegistry.of(rules)` for it, or dispose it first.'
      );
    }

    registries.set(rules, this);

    this._rules = rules;

    this._stopListening = rules.onRegister((rule: Rule): void => {
      const id = rule.id();

      if (id === null) {
        return;
      }

      // A rule that a superseding set holds through a live path can bring that set into force, and so switch off
      //  other rules: a replacement counts only once it is there. Its arrival can never take a set out of force, so
      //  a set already in force has nothing to gain from working everything out again.
      if (
        (this._holders().get(id) ?? []).some(
          (holder) => !this._inForceNow.has(holder)
        )
      ) {
        this._apply();

        return;
      }

      // Off if the sets say so; and back on if this is a rule that was switched off and has since left every set, or
      //  was unregistered while its set was switched back on.
      this._switch(id, this._effective.get(id) ?? true);
    });
  }

  /** The rules these sets switch. */
  ruleRegistry(): RuleRegistry {
    return this._rules;
  }

  /**
   * Stops listening to the rules and to its sets, switches back on what it
   * had switched off, and is no longer the registry `of` these rules. For one
   * that is being replaced.
   */
  dispose(): void {
    if (registries.get(this._rules) === this) {
      registries.delete(this._rules);
    }

    this._stopListening();
    this._subscriptions.forEach((stop) => stop());
    this._subscriptions.clear();
    this._sets.clear();
    this._extensions.clear();
    this._extended.clear();
    this._values.clear();
    this._setAt.clear();
    this._chosen.clear();
    this._defaultOff = null;
    this._effective = new Map();
    this._holdersOf = null;
    this._inForceNow = new Set();

    // By the rule and not its id: one that is not registered just now would otherwise stay off for good, since
    //  nothing is listening for it to come back.
    this._switchedOff.forEach((rule) => rule.enable());
    this._switchedOff.clear();
  }

  /**
   * Every set, in the order its id was first registered, whether or not
   * another holds it. Each is as `get` gives it.
   */
  entries(): RuleSet[] {
    return [...this._sets.values()].map((set) => set.toRuleSet());
  }

  /**
   * The set registered as `id`: its declaration, when there is one, or else a
   * `RuleSet` that says what all of them say together. That one is the same
   * object until anything about the set changes, and throws if `add` or
   * `remove` is called on it: add with `extend`, or through a declaration.
   * Nor does a listener `subscribe`d to it hear of later changes: subscribe to
   * a declaration. `declarations(id)` gives each.
   *
   * Within a declaration's own listener, the registry may not have caught up
   * with the change yet: it hears of it as one listener among the others.
   */
  get(id: string): RuleSet | null {
    return this._sets.get(id)?.toRuleSet() ?? null;
  }

  /** Each declaration of the set `id`, in the order registered. */
  declarations(id: string): RuleSet[] {
    return this._sets.get(id)?.declarations() ?? [];
  }

  /** The sets no other set holds: where a UI starts drawing. */
  roots(): RuleSet[] {
    return this._roots().map((set) => set.toRuleSet());
  }

  /**
   * A set, and every set given to it as a member, and theirs.
   *
   * One under an id that is registered already is another declaration of
   * that set, and joins it: see the class comment.
   */
  register(...sets: RuleSet[]): void {
    // Looked for first, through the members too, so a refusal leaves the registry as it was.
    const seen = new Set<RuleSet>(),
      look = (set: RuleSet): void => {
        if (seen.has(set)) {
          return;
        }

        seen.add(set);
        this._refuseView(set);
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
  unregister(...sets: RuleSet[]): void {
    sets.forEach((set) => this._refuseView(set));

    const declarations = [...this._sets.values()].flatMap((set) =>
      set.declarations()
    );

    sets.forEach((set) => {
      const holder = declarations.find(
        (other) =>
          !sets.includes(other) &&
          declarations.includes(set) &&
          other.members().includes(set)
      );

      if (holder) {
        throw new RuleSetError(
          `RuleSet '${set.id()}' is a member of '${holder.id()}', which is ` +
            'still registered: remove it from there first.'
        );
      }
    });

    // The sets named first, all of them, and then whichever of the sets they were given nothing still registered
    //  names, by the set or by its id: so it does not matter which of two sets holding a third is named first.
    const orphans: RuleSet[] = [],
      drop = (set: RuleSet): void => {
        const merged = this._sets.get(set.id());

        if (!merged?.holds(set)) {
          return;
        }

        merged.remove(set);
        this._subscriptions.get(set)?.();
        this._subscriptions.delete(set);

        if (this._extensions.get(set.id()) === set) {
          this._extensions.delete(set.id());
          this._extended.delete(set.id());
        }

        if (merged.declarations().length === 0) {
          this._sets.delete(set.id());
          this._chosen.delete(set.id());
        } else {
          this._forgetChosen(merged);
        }

        set.members().forEach((member) => {
          if (member instanceof RuleSet) {
            orphans.push(member);
          }
        });
      };

    sets.forEach(drop);

    // An orphan stays while a registered declaration holds that very object, or names its id with nothing else to
    //  answer to it: another declaration of the id answers for itself.
    while (orphans.length > 0) {
      const orphan = orphans.shift()!,
        declarations = [...this._sets.values()].flatMap((set) =>
          set.declarations()
        ),
        alone =
          (this._sets.get(orphan.id())?.declarations() ?? []).filter(
            (other) => other !== orphan
          ).length === 0;

      if (
        !declarations.some(
          (other) =>
            other.members().includes(orphan) ||
            (alone && other.memberIds().includes(orphan.id()))
        )
      ) {
        drop(orphan);
      }
    }

    this._defaultOff = null;
    this._apply();
  }

  /**
   * Add members to the set `id`: shorthand for declaring the set with them and
   * no options, so the set is there from now on, whether or not another
   * package declares it too, and whichever loads first.
   */
  extend(id: string, ...members: RuleSetEntry[]): void {
    const known = this._extensions.get(id);

    // Every call is counted, though all of them share one declaration: each may be a different package's, and a
    //  choice they add to has a default that depends on which loads first (see `no-default`).
    if (known) {
      // Tells the subscription, which adopts and applies.
      known.add(...members);
    } else {
      // Made whole before it is registered: a member that can't be one fails here, where it was given.
      const declaration = new RuleSet(id, ...members);

      this._extensions.set(id, declaration);
      this.register(declaration);
    }

    if (members.length > 0) {
      this._extended.set(id, [
        ...(this._extended.get(id) ?? []),
        members.map(idOf),
      ]);
    }
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

  /** The member of a choice that is on: the one picked, or else its default. */
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

          if (chosen !== null && chosen !== set.defaultMember()) {
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
    this._setAt.clear();
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
    this._setAt.clear();
    this._chosen.clear();

    this._apply();
  }

  /** The whole tree, from the sets no other holds, for a UI to draw. */
  describe(): RuleSetDescription[] {
    return this._cached(() => this._describe());
  }

  private _describe(): RuleSetDescription[] {
    const superseded = this._supersession(),
      // Only said where there is something to say, so a tree with nothing superseded is described as it always was.
      supersession = (
        id: string
      ): Pick<RuleSetDescription, 'supersedes' | 'supersededBy'> => {
        const set = this._sets.get(id),
          by = superseded.get(id);

        return {
          ...(set && set.supersedes().length > 0
            ? { supersedes: set.supersedes() }
            : {}),
          ...(by ? { supersededBy: by } : {}),
        };
      },
      describe = (
        id: string,
        onPath: boolean,
        path: Set<string>
      ): RuleSetDescription => {
        const set = this._sets.get(id),
          active = onPath && !superseded.has(id);

        if (!set) {
          return {
            id,
            kind: 'rule',
            state: this._value(id) ? 'on' : 'off',
            active,
            switchable: true,
            ...supersession(id),
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
              ...supersession(id),
              members,
            }
          : {
              id,
              kind: 'set',
              state: this.state(id),
              active,
              switchable: this._leaves(id).length > 0,
              ...supersession(id),
              members,
            };
      };

    return this._tops().map((top) => describe(top.id(), true, new Set()));
  }

  /**
   * For the host, once every package has loaded: throws for the first of the
   * problems `validate()` finds that stops a game starting, for a host with
   * nobody to show them to. One that is only shown does not throw.
   */
  check(): void {
    const problem = this.validate().find((problem) => problem.blocking);

    if (problem === undefined) {
      return;
    }

    switch (problem.kind) {
      case 'duplicate-id':
        throw new DuplicateRuleSetIdError(problem.message);

      case 'cycle':
        throw new RuleSetCycleError(problem.message);

      case 'option-conflict':
        throw new RuleSetOptionConflictError(problem.message);

      case 'no-default':
        throw new RuleSetNoDefaultError(problem.message);

      default:
        throw new RuleSetConflictError(problem.message);
    }
  }

  /**
   * Every problem with the sets as they stand, as data, for a setup window to
   * show before a game starts: see `RuleSetProblemKind`. Empty when there are
   * none.
   *
   * The orphans (`unknown-*`) only mean anything once every package has
   * loaded, and even then are only shown. A `conflict` is the player's to
   * settle, by switching one of the two sets off, and goes as soon as they do.
   */
  validate(): RuleSetProblem[] {
    return this._cached(() => this._validate());
  }

  private _validate(): RuleSetProblem[] {
    const problems: RuleSetProblem[] = [],
      said = new Set<string>(),
      report = (
        problem: Omit<RuleSetProblem, 'blocking'>,
        key: string
      ): void => {
        if (!said.has(key)) {
          said.add(key);
          problems.push({ ...problem, blocking: blocking[problem.kind] });
        }
      };

    this._sets.forEach((set) => {
      if (this._rules.getById(set.id()) !== null) {
        report(
          {
            kind: 'duplicate-id',
            ids: [set.id()],
            message:
              `'${set.id()}' is the id of a rule set and of a rule. A set that ` +
              'names it would mean the set, and the rule could not be reached.',
          },
          `duplicate-id\n${set.id()}`
        );
      }
    });

    // Every path, as `check()` has always walked them, so that the first problem found is the one it always threw.
    const walk = (id: string, path: string[]): void => {
      const set = this._sets.get(id);

      if (!set) {
        const parent = path[path.length - 1];

        if (this._rules.getById(id) === null) {
          report(
            {
              kind: 'unknown-member',
              ids: [parent, id],
              message:
                `Rule set '${parent}' names '${id}', which is ` +
                'neither a registered rule nor a registered rule set.',
            },
            `unknown-member\n${parent}\n${id}`
          );
        }

        return;
      }

      if (path.includes(id)) {
        const loop = path.slice(path.indexOf(id));

        report(
          {
            kind: 'cycle',
            ids: loop,
            message: `Rule set '${id}' is inside itself: ${[...path, id].join(
              ' → '
            )}.`,
          },
          `cycle\n${[...loop].sort().join('\n')}`
        );

        return;
      }

      set.memberIds().forEach((member) => walk(member, [...path, id]));
    };

    this._sets.forEach((set) => walk(set.id(), []));

    this._sets.forEach((set) =>
      set.supersedes().forEach((id) => {
        if (!this._sets.has(id) && this._rules.getById(id) === null) {
          report(
            {
              kind: 'unknown-superseded',
              ids: [set.id(), id],
              message:
                `Rule set '${set.id()}' supersedes '${id}', which is ` +
                'neither a registered rule nor a registered rule set.',
            },
            `unknown-superseded\n${set.id()}\n${id}`
          );
        }
      })
    );

    this._sets.forEach((set) => {
      const through = this._supersedesItself(set);

      if (through !== null) {
        const loop = [set.id(), ...through];

        report(
          {
            kind: 'cycle',
            ids: [...new Set(loop)],
            message:
              `Rule set '${set.id()}' supersedes itself: ${loop.join(' → ')}` +
              (through[through.length - 1] === set.id()
                ? '.'
                : `, which holds '${set.id()}'.`),
          },
          `supersedes\n${[...new Set(loop)].sort().join('\n')}`
        );
      }
    });

    this._sets.forEach((set) => {
      const declarations = set.declarations();

      (['exclusive', 'enabled', 'default'] as const).forEach((key) => {
        const values = [
          ...new Set(
            declarations
              .map((declaration) => declaration.stated()[key])
              .filter((value) => value !== undefined)
          ),
        ];

        if (values.length > 1) {
          report(
            {
              kind: 'option-conflict',
              ids: [set.id()],
              message:
                `The declarations of rule set '${set.id()}' disagree on ` +
                `\`${key}\`: ${values
                  .map((value) => JSON.stringify(value))
                  .join(', ')}. Until they agree, the first ` +
                `(${JSON.stringify(values[0])}) stands.`,
            },
            `option-conflict\n${set.id()}\n${key}`
          );
        }
      });

      // Each declaration may be sound alone, and the two together not.
      if (
        set.exclusive() &&
        declarations.some(
          (declaration) => declaration.stated().enabled === false
        )
      ) {
        report(
          {
            kind: 'option-conflict',
            ids: [set.id()],
            message:
              `Rule set '${set.id()}' is declared a choice, and also to ` +
              'start switched off, but a choice always has one member on.',
          },
          `option-conflict\n${set.id()}\nchoice-off`
        );
      }

      if (!set.exclusive()) {
        return;
      }

      const stated = set.stated('default'),
        members = set.memberIds(),
        extension = this._extensions.get(set.id()),
        // Each declaration that brings members, and each call to `extend` whose members are still there, though all of
        //  those share one declaration.
        contributions =
          declarations.filter(
            (declaration) =>
              declaration !== extension && declaration.memberIds().length > 0
          ).length +
          (this._extended.get(set.id()) ?? []).filter((given) =>
            given.some((member) => extension?.memberIds().includes(member))
          ).length;

      if (stated !== undefined && !members.includes(stated)) {
        report(
          {
            kind: 'unknown-member',
            ids: [set.id(), stated],
            message:
              `The choice '${set.id()}' has '${stated}' as its default, ` +
              'which is none of its members: its first member is the ' +
              'default until it is.',
          },
          `unknown-member\n${set.id()}\n${stated}`
        );
      }

      // A default that is none of the members is no default: the first member is, whichever arrived first.
      if (
        (stated === undefined || !members.includes(stated)) &&
        contributions > 1
      ) {
        report(
          {
            kind: 'no-default',
            ids: [set.id()],
            message:
              `The choice '${set.id()}' has members from more than one ` +
              'declaration, and none of them states a `default` that is ' +
              'one of its members, so which is chosen at first would ' +
              'depend on the order they load in.',
          },
          `no-default\n${set.id()}`
        );
      }
    });

    // Only sets that something of runs, as it is worked out: two sets that a third in force supersedes both of change
    //  nothing between them, and asking the player to switch one off would be asking for nothing.
    const effective = this._evaluate(),
      runs = (set: MergedRuleSet): boolean =>
        [...this._beneath(set.id()).rules].some(
          (rule) =>
            effective.get(rule) === true && this._rules.getById(rule) !== null
        ),
      inForce = this._inForce().filter(runs);

    inForce.forEach((first, index) =>
      inForce.slice(index + 1).forEach((second) => {
        const firstReach = this._reach(first),
          secondReach = this._reach(second),
          // A rule nothing registered is an orphan, not a conflict: if it arrives, both its replacements are in force.
          shared = [...firstReach.rules].filter(
            (rule) =>
              secondReach.rules.has(rule) && this._rules.getById(rule) !== null
          );

        // One beneath the other, at any depth, is one subtree and not two alternatives: there is nothing to choose.
        if (
          shared.length === 0 ||
          firstReach.sets.has(second.id()) ||
          secondReach.sets.has(first.id()) ||
          this._beneath(first.id()).sets.has(second.id()) ||
          this._beneath(second.id()).sets.has(first.id())
        ) {
          return;
        }

        // Only what can be done: a choice, or a set whose rules are all beneath choices, has no switch.
        const switchable = [first, second].filter(
            (set) => !set.exclusive() && this._leaves(set.id()).length > 0
          ),
          remedy =
            switchable.length === 2
              ? 'switch one of them off.'
              : switchable.length === 1
              ? `switch '${switchable[0].id()}' off (the other has no ` +
                'switch).'
              : 'neither can be switched off, so the packages they come ' +
                'from cannot be used together.';

        report(
          {
            kind: 'conflict',
            ids: [first.id(), second.id()],
            message:
              `Rule sets '${first.id()}' and '${second.id()}' both supersede ` +
              `${shared.map((rule) => `'${rule}'`).join(', ')}, and neither ` +
              `supersedes the other: ${remedy}`,
          },
          `conflict\n${first.id()}\n${second.id()}`
        );
      })
    );

    return problems;
  }

  /** A merged set is no declaration: registering it, or taking it out, would mean nothing. */
  private _refuseView(set: RuleSet): void {
    if (set instanceof MergedRuleSetView) {
      throw new RuleSetError(
        `RuleSet '${set.id()}' is every declaration of the set together, ` +
          'not a declaration: register or unregister one of ' +
          `\`declarations('${set.id()}')\` instead.`
      );
    }
  }

  private _adopt(set: RuleSet): void {
    this._refuseView(set);

    const existing = this._sets.get(set.id());

    if (existing?.holds(set)) {
      return;
    }

    const merged = existing ?? new MergedRuleSet(set.id());

    merged.add(set);
    this._sets.set(set.id(), merged);
    this._defaultOff = null;
    this._subscriptions.set(
      set,
      set.subscribe((): void => {
        this._defaultOff = null;

        const current = this._sets.get(set.id());

        if (current) {
          current.changed();
          this._forgetChosen(current);
        }

        try {
          this._adoptMembers(set);
        } finally {
          this._apply();
        }
      })
    );

    this._adoptMembers(set);

    // Only the first declaration of an id can find a setting kept against it.
    if (existing) {
      return;
    }

    // Switched before it arrived, through a set that named it by id: until now the id was taken for a rule's, and
    //  the setting was kept against it. It passes to the rules the set switches, except any switched themselves since
    //  (and not before: an older setting of a rule gives way, as it would have had the set been there).
    const held = this._values.get(set.id()),
      heldAt = this._setAt.get(set.id()) ?? 0;

    if (held !== undefined) {
      this._values.delete(set.id());
      this._setAt.delete(set.id());

      this._leaves(set.id()).forEach((leaf) => {
        if ((this._setAt.get(leaf) ?? -1) < heldAt) {
          this._values.set(leaf, held);
          this._setAt.set(leaf, heldAt);
        }
      });
    }
  }

  private _adoptMembers(set: RuleSet): void {
    set.members().forEach((member) => {
      if (member instanceof RuleSet) {
        this._adopt(member);
      }
    });
  }

  /** A member that has gone is no longer a choice to remember: added back, it is not chosen again by surprise. */
  private _forgetChosen(set: MergedRuleSet): void {
    const chosen = this._chosen.get(set.id());

    if (chosen !== undefined && !set.memberIds().includes(chosen)) {
      this._chosen.delete(set.id());
    }
  }

  private _requireSet(id: string): MergedRuleSet {
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

    const at = ++this._settings,
      write = (rule: string): void => {
        this._values.set(rule, on);
        this._setAt.set(rule, at);
      };

    if (!set) {
      this._requireMember(id);
      write(id);

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

    leaves.forEach(write);
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

  private _chosenOf(set: MergedRuleSet): string | null {
    const chosen = this._chosen.get(set.id());

    if (chosen !== undefined && set.memberIds().includes(chosen)) {
      return chosen;
    }

    return set.defaultMember();
  }

  /** The sets no other set holds. */
  private _roots(): MergedRuleSet[] {
    const held = new Set<string>();

    this._sets.forEach((set) =>
      set.memberIds().forEach((member) => held.add(member))
    );

    return [...this._sets.values()].filter((set) => !held.has(set.id()));
  }

  /**
   * Where a walk of the whole tree starts: the sets no other holds, then any
   * set none of those reaches. The second only happens when a set is inside
   * itself, which `check()` refuses, but until it has, such a set's rules are
   * still switched, described and saved.
   */
  private _tops(): MergedRuleSet[] {
    const tops = this._roots(),
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

    // A superseded rule need not be in any set: the rule a set takes the place of is usually another package's, which
    //  that package never put in one.
    this._supersession().forEach((by, id) => {
      if (!this._sets.has(id)) {
        effective.set(id, false);
      }
    });

    return effective;
  }

  /**
   * Every rule, and every set, beneath `id`, through every member of a choice
   * and not only the chosen one: what superseding it means.
   */
  private _beneath(id: string): { rules: Set<string>; sets: Set<string> } {
    const cached = this._cache?.beneath.get(id);

    if (cached) {
      return cached;
    }

    const rules = new Set<string>(),
      sets = new Set<string>(),
      visit = (member: string): void => {
        const set = this._sets.get(member);

        if (!set) {
          rules.add(member);

          return;
        }

        if (sets.has(member)) {
          return;
        }

        sets.add(member);
        set.memberIds().forEach(visit);
      };

    visit(id);

    const beneath = { rules, sets };

    this._cache?.beneath.set(id, beneath);

    return beneath;
  }

  /**
   * Every rule, and every set, beneath `id` through live paths only: through
   * the chosen member of any choice, as whether a set is in force is worked
   * out. What a set exempts from its own superseding.
   */
  private _live(id: string): { rules: Set<string>; sets: Set<string> } {
    const cached = this._cache?.live.get(id);

    if (cached) {
      return cached;
    }

    const rules = new Set<string>(),
      sets = new Set<string>(),
      visit = (member: string): void => {
        const set = this._sets.get(member);

        if (!set) {
          rules.add(member);

          return;
        }

        if (sets.has(member)) {
          return;
        }

        sets.add(member);

        const chosen = set.exclusive() ? this._chosenOf(set) : null;

        set
          .memberIds()
          .filter((other) => !set.exclusive() || other === chosen)
          .forEach(visit);
      };

    visit(id);

    const live = { rules, sets };

    this._cache?.live.set(id, live);

    return live;
  }

  /**
   * `work`, with what `_beneath` and `_reach` find kept until it is done:
   * nothing changes the tree meanwhile, and a long chain of sets superseding
   * one another would otherwise be walked again for each.
   */
  private _cached<T>(work: () => T): T {
    if (this._cache !== null) {
      return work();
    }

    this._cache = { beneath: new Map(), live: new Map(), reach: new Map() };

    try {
      return work();
    } finally {
      this._cache = null;
    }
  }

  /**
   * What a set supersedes, carried through: what it names, everything beneath
   * those, and what every set among them supersedes in turn, however those
   * sets are switched; except what the set itself holds through a live path
   * (see `_live`). So a set can take the place of the whole of another while
   * keeping one of its rules, by holding that rule too; and a rule it holds as
   * an alternative not chosen is superseded with the rest.
   */
  private _reach(set: MergedRuleSet): {
    rules: Set<string>;
    sets: Set<string>;
  } {
    const cached = this._cache?.reach.get(set.id());

    if (cached) {
      return cached;
    }

    const own = this._live(set.id()),
      rules = new Set<string>(),
      sets = new Set<string>(),
      named = new Set<string>(),
      queue = set.supersedes();

    while (queue.length > 0) {
      const id = queue.shift()!;

      if (named.has(id)) {
        continue;
      }

      named.add(id);

      const beneath = this._beneath(id);

      beneath.rules.forEach((rule) => rules.add(rule));
      beneath.sets.forEach((other) => {
        sets.add(other);
        queue.push(...this._sets.get(other)!.supersedes());
      });
    }

    own.rules.forEach((rule) => rules.delete(rule));
    own.sets.forEach((other) => sets.delete(other));

    const reach = { rules, sets };

    this._cache?.reach.set(set.id(), reach);

    return reach;
  }

  /**
   * The ids, from what `set` names, by which it comes to supersede itself:
   * the last of them is the set, or a set that holds it. `null` when it does
   * not.
   */
  private _supersedesItself(set: MergedRuleSet): string[] | null {
    const from = new Map<string, string | null>(),
      queue: string[] = [];

    set.supersedes().forEach((id) => {
      if (!from.has(id)) {
        from.set(id, null);
        queue.push(id);
      }
    });

    while (queue.length > 0) {
      const id = queue.shift()!,
        beneath = this._beneath(id).sets;

      if (beneath.has(set.id())) {
        const through: string[] = [];

        for (let at: string | null = id; at !== null; at = from.get(at)!) {
          through.unshift(at);
        }

        return through;
      }

      beneath.forEach((other) =>
        this._sets
          .get(other)!
          .supersedes()
          .forEach((next) => {
            if (!from.has(next)) {
              from.set(next, id);
              queue.push(next);
            }
          })
      );
    }

    return null;
  }

  /**
   * The sets that supersede something and are in force, in the order
   * registered: some path to the set is active, and at least one registered
   * rule beneath it, through the chosen member of any choice, is switched on.
   * By the settings alone: see the class comment.
   */
  private _inForce(): MergedRuleSet[] {
    const superseding = [...this._sets.values()].filter(
      (set) => set.supersedes().length > 0
    );

    // Most games: nothing to walk the tree for.
    if (superseding.length === 0) {
      return [];
    }

    const active = new Set<string>(),
      reach = (id: string): void => {
        const set = this._sets.get(id);

        if (!set || active.has(id)) {
          return;
        }

        active.add(id);

        const chosen = set.exclusive() ? this._chosenOf(set) : null;

        set
          .memberIds()
          .filter((member) => !set.exclusive() || member === chosen)
          .forEach(reach);
      },
      switchedOn = (id: string, path: Set<string>): boolean => {
        const set = this._sets.get(id);

        // A rule that is not there yet replaces nothing: until it is, what it would replace runs.
        if (!set) {
          return this._value(id) && this._rules.getById(id) !== null;
        }

        if (path.has(id)) {
          return false;
        }

        path.add(id);

        const chosen = set.exclusive() ? this._chosenOf(set) : null,
          on = set
            .memberIds()
            .filter((member) => !set.exclusive() || member === chosen)
            .some((member) => switchedOn(member, path));

        path.delete(id);

        return on;
      };

    this._tops().forEach((top) => reach(top.id()));

    return superseding.filter(
      (set) => active.has(set.id()) && switchedOn(set.id(), new Set())
    );
  }

  /** Each rule id, and the superseding sets that hold it through a live path. */
  private _holders(): Map<string, string[]> {
    if (this._holdersOf === null) {
      const holders = new Map<string, string[]>();

      this._cached(() =>
        this._sets.forEach((set) => {
          if (set.supersedes().length === 0) {
            return;
          }

          this._live(set.id()).rules.forEach((rule) =>
            holders.set(rule, [...(holders.get(rule) ?? []), set.id()])
          );
        })
      );

      this._holdersOf = holders;
    }

    return this._holdersOf;
  }

  /** What is superseded just now, rules and sets, each by the sets in force that supersede it. */
  private _supersession(): Map<string, string[]> {
    const superseded = new Map<string, string[]>(),
      inForce = this._inForce();

    this._inForceNow = new Set(inForce.map((set) => set.id()));

    inForce.forEach((set) => {
      const { rules, sets } = this._reach(set);

      [...sets, ...rules].forEach((id) =>
        superseded.set(id, [...(superseded.get(id) ?? []), set.id()])
      );
    });

    return superseded;
  }

  private _apply(): void {
    this._defaultOff = null;
    this._holdersOf = null;
    this._effective = this._cached(() => this._evaluate());

    this._effective.forEach((on, id) => this._switch(id, on));

    // A rule this switched off, and that no set holds any more, goes back on: nothing else would ever do it.
    [...this._switchedOff.keys()]
      .filter((id) => !this._effective.has(id))
      .forEach((id) => this._switch(id, true));
  }

  /**
   * Off: switched off if it is on, and remembered as this registry's doing.
   * On: switched back on only if it is the very rule remembered: one that has
   * since been replaced under the same id was never this registry's to switch
   * on. See the class comment.
   */
  private _switch(id: string, on: boolean): void {
    const rule = this._rules.getById(id);

    // Not registered, yet or any more: `onRegister` switches it when it is, and what is remembered is kept until then.
    if (rule === null) {
      return;
    }

    if (on) {
      const mine = this._switchedOff.get(id);

      this._switchedOff.delete(id);

      if (mine === rule) {
        this._rules.enableById(id);
      }

      return;
    }

    if (rule.enabled()) {
      this._switchedOff.set(id, rule);
      this._rules.disableById(id);

      return;
    }

    // Already off. If that was this registry's doing, it still is; if another rule was, that one is gone.
    if (this._switchedOff.get(id) !== rule) {
      this._switchedOff.delete(id);
    }
  }
}

export const instance: RuleSetRegistry =
  RuleSetRegistry.of(ruleRegistryInstance);

export default RuleSetRegistry;
