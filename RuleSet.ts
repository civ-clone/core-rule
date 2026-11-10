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

export class RuleSetError extends Error {}

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
export class RuleSet {
  private _enabled: boolean;
  private _exclusive: boolean;
  private _id: string;
  private _listeners: (() => void)[] = [];
  private _members: RuleSetMember[] = [];

  constructor(id: string, ...values: (RuleSetOptions | RuleSetMember)[]) {
    if (typeof id !== 'string' || id === '') {
      throw new RuleSetError('RuleSet: an id is required.');
    }

    this._id = id;

    const options: RuleSetOptions = {},
      members: RuleSetMember[] = [];

    values.forEach((value) => {
      if (typeof value === 'string' || value instanceof RuleSet) {
        members.push(value);

        return;
      }

      Object.assign(options, value);
    });

    this._exclusive = options.exclusive ?? false;
    this._enabled = options.enabled ?? true;

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

  has(member: RuleSetMember): boolean {
    return this.memberIds().includes(idOf(member));
  }

  /** Added to the end. One already there, by id, is left where it is. */
  add(...members: RuleSetMember[]): this {
    let changed = false;

    members.forEach((member) => {
      if (idOf(member) === this._id) {
        throw new RuleSetError(
          `RuleSet '${this._id}' cannot be a member of itself.`
        );
      }

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

  remove(...members: RuleSetMember[]): this {
    const ids = members.map(idOf),
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

  private changed(): void {
    [...this._listeners].forEach((listener) => listener());
  }
}

export const idOf = (member: RuleSetMember): string =>
  typeof member === 'string' ? member : member.id();

export default RuleSet;
