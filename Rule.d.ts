import Criterion from './Criterion';
import Effect from './Effect';
import Priority from './Priority';
export interface IRule<C extends any[] = any[], R = any> {
  priority(): Priority;
  process(...args: C): R | void;
  validate(...args: C): boolean;
}
export declare class Rule<C extends any[] = any[], R = any>
  implements IRule<C, R> {
  #private;
  constructor(...values: (Priority | Criterion<C> | Effect<C, R>)[]);
  priority(): Priority;
  process(...args: C): R | void;
  validate(...args: C): boolean;
}
export default Rule;
