import Criterion, { ICriterion } from './Criterion';

export interface ICriteria<C extends any[] = any[]> extends ICriterion<C> {
  criteria(): Criterion<C>[];
}

export class Criteria<C extends any[] = any[]>
  extends Criterion<C>
  implements ICriteria<C>
{
  private _criteria: Criterion<C>[] = [];

  constructor(...criteria: Criterion<C>[]) {
    super();

    criteria.forEach((criterion: Criterion<C>): void => {
      this._criteria.push(criterion);
    });
  }

  criteria(): Criterion<C>[] {
    return this._criteria;
  }

  /**
   * `every` with a plain loop, for the same reason as `RuleRegistry.process`:
   * this runs once per rule per dispatch, twenty-one million times in a
   * thirty-turn game, and the closure it allocated was doing nothing the loop
   * does not. Short-circuiting on the first false is `every`'s behaviour and
   * is kept — most of those twenty-one million exit on criterion one.
   */
  validate(...args: C): boolean {
    for (let index = 0; index < this._criteria.length; index++) {
      if (!this._criteria[index].validate(...args)) {
        return false;
      }
    }

    return true;
  }
}

export default Criteria;
