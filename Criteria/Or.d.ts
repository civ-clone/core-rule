import Criteria from '../Criteria';
export declare class Or<C extends any[] = any[]> extends Criteria<C> {
  validate(...args: C): boolean;
}
export default Or;
