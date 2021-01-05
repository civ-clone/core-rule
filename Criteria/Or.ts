import Criteria from '../Criteria';
import Criterion from '../Criterion';

export class Or<C extends any[] = any[]> extends Criteria<C> {
  validate(...args: C): boolean {
    return (
      !this.criteria().length ||
      this.criteria().some((criterion: Criterion<C>): boolean =>
        criterion.validate(...args)
      )
    );
  }
}

export default Or;
