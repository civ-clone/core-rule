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
  priority(): Priority;
  process(...args: C): R | void;
  validate(...args: C): boolean;
}

export class Rule<C extends any[] = any[], R = any> implements IRule<C, R> {
  private _criteria: Criteria<C> | undefined;
  private _enabled: boolean = true;
  private _effect: Effect<C, R> | undefined;
  private _priority: Priority = new Normal();

  constructor(...values: (Priority | Criterion<C> | Effect<C, R>)[]) {
    const criteria: Criterion<C>[] = [];

    values.forEach((value: Priority | Criterion<C> | Effect<C, R>): void => {
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
    });

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
