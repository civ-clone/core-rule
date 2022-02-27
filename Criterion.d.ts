export interface ICriterion<C extends any[] = any[]> {
  validate(...args: C): boolean;
}
export declare class Criterion<C extends any[] = any[]>
  implements ICriterion<C>
{
  #private;
  constructor(criterion?: (...args: C) => boolean);
  validate(...args: C): boolean;
}
export default Criterion;
