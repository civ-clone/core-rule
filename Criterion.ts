export interface ICriterion<C extends any[] = any[]> {
  validate(...args: C): boolean;
}

export class Criterion<C extends any[] = any[]> implements ICriterion<C> {
  private _criterion: ((...args: C) => boolean) | null = null;

  constructor(criterion?: (...args: C) => boolean) {
    if (criterion) {
      this._criterion = criterion;
    }
  }

  validate(...args: C): boolean {
    if (this._criterion === null) {
      return true;
    }

    return this._criterion(...args);
  }
}

export default Criterion;
