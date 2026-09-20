import Criterion, { ICriterion } from './Criterion';
export interface ICriteria<C extends any[] = any[]> extends ICriterion<C> {
    criteria(): Criterion<C>[];
}
export declare class Criteria<C extends any[] = any[]> extends Criterion<C> implements ICriteria<C> {
    private _criteria;
    constructor(...criteria: Criterion<C>[]);
    criteria(): Criterion<C>[];
    /**
     * `every` with a plain loop, for the same reason as `RuleRegistry.process`:
     * this runs once per rule per dispatch, twenty-one million times in a
     * thirty-turn game, and the closure it allocated was doing nothing the loop
     * does not. Short-circuiting on the first false is `every`'s behaviour and
     * is kept — most of those twenty-one million exit on criterion one.
     */
    validate(...args: C): boolean;
}
export default Criteria;
