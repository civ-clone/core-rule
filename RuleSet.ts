import Rule from './Rule';

/** A rule by its id, a set, or the id of a set registered elsewhere. */
export type RuleSetMember = string | RuleSet;

/** What can be given as a member: a `Rule` is taken by its id. */
export type RuleSetEntry = RuleSetMember | Rule;

export type RuleSetOptions = {
  /**
   * A choice: exactly one member is on, the first until another is chosen.
   * A member can be one rule or a whole set of them.
   */
  exclusive?: boolean;
  /** `false` for a plain set whose rules start switched off. */
  enabled?: boolean;
};

export class RuleSetError extends Error {}

const isMember = (value: unknown): value is RuleSetEntry =>
  typeof value === 'string' ||
  value instanceof RuleSet ||
  value instanceof Rule;

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
 * its children differ. **Mutable,** so a later plugin can add its rules, or
 * whole sets, to one that exists: see `RuleSetRegistry.extend` for doing that
 * before the set is there.
 *
 * A set only describes. `RuleSetRegistry` holds what has been chosen and
 * switches the rules.
 */
export class RuleSet {
  private _enabled: boolean;
  private _exclusive: boolean;
  private _id: string;
  private _listeners: (() => void)[] = [];
  private _members: RuleSetMember[] = [];

  constructor(id: string, ...values: (RuleSetOptions | RuleSetEntry)[]) {
    if (typeof id !== 'string' || id === '') {
      throw new RuleSetError('RuleSet: an id is required.');
    }

    this._id = id;

    const options: RuleSetOptions = {},
      members: RuleSetEntry[] = [];

    values.forEach((value) => {
      if (isMember(value)) {
        members.push(value);

        return;
      }

      // Anything else has to be the options, and only the options: an object that is neither would otherwise be
      //  merged in and ignored, and the rule or set it was meant to be would silently not be a member.
      if (
        value === null ||
        typeof value !== 'object' ||
        Object.getPrototypeOf(value) !== Object.prototype ||
        Object.keys(value).some(
          (key) => !['enabled', 'exclusive'].includes(key)
        )
      ) {
        throw new RuleSetError(
          `RuleSet '${id}': a member is a rule id, a Rule with an id or a ` +
            'RuleSet, and the options are `exclusive` and `enabled`.'
        );
      }

      Object.assign(options, value);
    });

    this._exclusive = options.exclusive ?? false;
    this._enabled = options.enabled ?? true;

    if (this._exclusive && options.enabled === false) {
      throw new RuleSetError(
        `RuleSet '${id}': a choice always has one member on, so it cannot ` +
          'start switched off.'
      );
    }

    this.add(...members);
  }

  id(): string {
    return this._id;
  }

  /** Whether this is a choice between its members. */
  exclusive(): boolean {
    return this._exclusive;
  }

  /** Whether its rules start switched on. */
  enabledByDefault(): boolean {
    return this._enabled;
  }

  members(): RuleSetMember[] {
    return [...this._members];
  }

  /** Each member's id, in order: a rule's, or a set's. */
  memberIds(): string[] {
    return this._members.map(idOf);
  }

  has(member: RuleSetEntry): boolean {
    return this.memberIds().includes(idOf(member));
  }

  /** Added to the end. One already there, by id, is left where it is. */
  add(...entries: RuleSetEntry[]): this {
    // All of them looked at before any is added, so a refusal leaves the set as it was.
    const members = entries.map((entry): RuleSetMember => {
      if (!isMember(entry)) {
        throw new RuleSetError(
          `RuleSet '${this._id}': a member is a rule id, a Rule with an id ` +
            'or a RuleSet.'
        );
      }

      const member = entry instanceof Rule ? idOf(entry) : entry;

      if (idOf(member) === this._id) {
        throw new RuleSetError(
          `RuleSet '${this._id}' cannot be a member of itself.`
        );
      }

      return member;
    });

    let changed = false;

    members.forEach((member) => {
      const at = this.memberIds().indexOf(idOf(member));

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

  remove(...entries: RuleSetEntry[]): this {
    const ids = entries.map(idOf),
      kept = this._members.filter((member) => !ids.includes(idOf(member)));

    if (kept.length !== this._members.length) {
      this._members = kept;
      this.changed();
    }

    return this;
  }

  /** Told of every change to the members. Returns how to stop listening. */
  subscribe(listener: () => void): () => void {
    this._listeners.push(listener);

    return (): void => {
      this._listeners = this._listeners.filter((other) => other !== listener);
    };
  }

  // Every listener hears, whatever another does with the news: the change has been made by now, and a set may be in
  //  more than one game's registry. The first error is thrown once all have been told.
  private changed(): void {
    const errors: unknown[] = [];

    [...this._listeners].forEach((listener) => {
      try {
        listener();
      } catch (error) {
        errors.push(error);
      }
    });

    if (errors.length > 0) {
      throw errors[0];
    }
  }
}

export const idOf = (member: RuleSetEntry): string => {
  if (typeof member === 'string') {
    return member;
  }

  const id = member.id();

  if (id === null) {
    throw new RuleSetError(
      'A rule needs an id to be a member of a RuleSet: sets hold rules by id.'
    );
  }

  return id;
};

export default RuleSet;
