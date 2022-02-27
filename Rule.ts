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
  #criteria: Criteria<C> | undefined;
  #enabled: boolean = true;
  #effect: Effect<C, R> | undefined;
  #priority: Priority = new Normal();

  constructor(...values: (Priority | Criterion<C> | Effect<C, R>)[]) {
    const criteria: Criterion<C>[] = [];

    values.forEach((value: Priority | Criterion<C> | Effect<C, R>): void => {
      if (value instanceof Effect) {
        if (this.#effect) {
          throw new TypeError(
            'Rule: effect already specified, but another was provided.'
          );
        }

        this.#effect = value;

        return;
      }

      if (value instanceof Criterion) {
        criteria.push(value);

        return;
      }

      this.#priority = value;
    });

    if (criteria.length) {
      this.#criteria = new And(...criteria);
    }
  }

  disable(): void {
    this.#enabled = false;
  }

  enable(): void {
    this.#enabled = true;
  }

  enabled(): boolean {
    return this.#enabled;
  }

  priority(): Priority {
    return this.#priority;
  }

  process(...args: C): R | void {
    if (!this.#enabled) {
      return;
    }

    if (this.#effect instanceof Effect) {
      return this.#effect.apply(...args);
    }
  }

  validate(...args: C): boolean {
    if (!this.#enabled) {
      return false;
    }

    if (this.#criteria instanceof Criterion) {
      return this.#criteria.validate(...args);
    }

    return true;
  }
}

export default Rule;
