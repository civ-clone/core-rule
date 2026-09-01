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

  validate(...args: C): boolean {
    return this._criteria.every((criterion: Criterion<C>): boolean =>
      criterion.validate(...args)
    );
  }
}

export default Criteria;
