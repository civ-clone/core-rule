import Criterion, { ICriterion } from './Criterion';
export interface ICriteria<C extends any[] = any[]> extends ICriterion<C> {
  criteria(): Criterion<C>[];
}
export declare class Criteria<C extends any[] = any[]>
  extends Criterion<C>
  implements ICriteria<C> {
  #private;
  constructor(...criteria: Criterion<C>[]);
  criteria(): Criterion<C>[];
  validate(...args: C): boolean;
}
export default Criteria;
