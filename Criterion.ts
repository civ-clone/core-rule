export interface ICriterion<C extends any[] = any[]> {
  validate(...args: C): boolean;
}

export class Criterion<C extends any[] = any[]> implements ICriterion<C> {
  #criterion: ((...args: C) => boolean) | null = null;

  constructor(criterion?: (...args: C) => boolean) {
    if (criterion) {
      this.#criterion = criterion;
    }
  }

  validate(...args: C): boolean {
    if (this.#criterion === null) {
      return true;
    }

    return this.#criterion(...args);
  }
}

export default Criterion;
