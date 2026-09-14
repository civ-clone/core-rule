import And from './Criteria/And';
import Criteria from './Criteria';
import Criterion from './Criterion';
import Effect from './Effect';
import { Normal } from './Priorities';
import Priority from './Priority';

export interface IRule<C extends any[] = any[], R = any> {
  disable(): void;
  enable(): void;
  enabled(): boolean;
  id(): string | null;
  priority(): Priority;
  process(...args: C): R | void;
  validate(...args: C): boolean;
}

export class Rule<C extends any[] = any[], R = any> implements IRule<C, R> {
  private _criteria: Criteria<C> | undefined;
  private _enabled: boolean = true;
  private _effect: Effect<C, R> | undefined;
  private _id: string | null = null;
  private _priority: Priority = new Normal();

  /**
   * An optional identifier, as the first argument:
   *
   * ```ts
   * new Created(
   *   'civ1-city:city/created/register',
   *   new Criterion(…),
   *   new Effect(…)
   * )
   * ```
   *
   * **Optional, so this lands package by package.** Unnamed rules keep working
   * exactly as before — of the 1,055 rules a real game registers, most are
   * collecting rules that compose fine and have no reason to be addressable.
   * What an identifier buys is the ability to name *one instance*, which is
   * what `RuleRegistry.replace`, `disable`, `before` and `after` need and what
   * no amount of subclassing can provide: there are 1,055 instances and 163
   * classes.
   *
   * The convention is `package:path/to/rule`, so an identifier says where to
   * look for what it names.
   */
  constructor(...values: (string | Priority | Criterion<C> | Effect<C, R>)[]) {
    const criteria: Criterion<C>[] = [];

    values.forEach(
      (value: string | Priority | Criterion<C> | Effect<C, R>): void => {
        if (typeof value === 'string') {
          if (this._id !== null) {
            throw new TypeError(
              `Rule: id already specified as '${this._id}', but '${value}' ` +
                'was also provided.'
            );
          }

          this._id = value;

          return;
        }

        if (value instanceof Effect) {
          if (this._effect) {
            throw new TypeError(
              'Rule: effect already specified, but another was provided.'
            );
          }

          this._effect = value;

          return;
        }

        if (value instanceof Criterion) {
          criteria.push(value);

          return;
        }

        this._priority = value;
      }
    );

    if (criteria.length) {
      this._criteria = new And(...criteria);
    }
  }

  disable(): void {
    this._enabled = false;
  }

  enable(): void {
    this._enabled = true;
  }

  /** The identifier this rule was constructed with, if any. */
  id(): string | null {
    return this._id;
  }

  enabled(): boolean {
    return this._enabled;
  }

  priority(): Priority {
    return this._priority;
  }

  process(...args: C): R | void {
    if (!this._enabled) {
      return;
    }

    if (this._effect instanceof Effect) {
      return this._effect.apply(...args);
    }
  }

  validate(...args: C): boolean {
    if (!this._enabled) {
      return false;
    }

    if (this._criteria instanceof Criterion) {
      return this._criteria.validate(...args);
    }

    return true;
  }
}

export default Rule;
