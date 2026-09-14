import {
  EntityRegistry,
  IEntityRegistry,
} from '@civ-clone/core-registry/EntityRegistry';
import { IConstructor } from '@civ-clone/core-registry/Registry';
import Rule from './Rule';
declare type RuleArgs<T extends Rule> = T extends Rule<infer C, any>
  ? C
  : never;
declare type RuleReturn<T extends Rule> = T extends Rule<any[], infer R>
  ? R
  : never;
export declare class UnknownRuleError extends Error {}
export declare class DuplicateRuleIdError extends Error {}
export interface IRuleRegistry<
  T extends Rule = Rule,
  P extends any[] = any[],
  R = any
> extends IEntityRegistry<T> {
  after(id: string, ...rules: T[]): void;
  before(id: string, ...rules: T[]): void;
  disableById(id: string): void;
  enableById(id: string): void;
  get<RuleType extends T = T>(ruleType: IConstructor<RuleType>): RuleType[];
  getById(id: string): T | null;
  invalidateCache(rule: T | IConstructor<T>): void;
  process<RuleType extends T = T>(
    ruleType: IConstructor<RuleType>,
    ...args: RuleArgs<RuleType>
  ): RuleReturn<RuleType>[];
  replace(id: string, ...rules: T[]): void;
}
export declare class RuleRegistry
  extends EntityRegistry<Rule>
  implements IRuleRegistry
{
  private _cache;
  private _byId;
  private _constraints;
  constructor();
  entries(): Rule[];
  /**
   * Apply `before`/`after` constraints on top of the priority sort.
   *
   * Repositioning rather than arithmetic on priority numbers, deliberately.
   * Giving a rule `target.priority() - 1` looks simpler and is wrong twice
   * over: priorities are shared (`Normal` is 2000 for almost everything, so
   * "one less" collides with whatever else sits there), and it silently breaks
   * when the target's own priority later changes. Position is what `before`
   * means, so position is what gets set.
   *
   * `Array.prototype.sort` is stable, so rules with equal priority keep
   * registration order and this only moves what asked to be moved.
   */
  private _ordered;
  /** The rule registered under `id`, or `null`. */
  getById(id: string): Rule | null;
  /**
   * Every one of these throws on an unknown id rather than doing nothing.
   *
   * That is the whole reason to prefer them over reaching for a priority
   * number: a plugin that means to replace `civ1-city:city/grow` and mistypes
   * it should fail at load, not run a game in which its override silently
   * never applied. An unknown id is far more likely to be a typo or a version
   * mismatch than an intentional no-op.
   */
  private _require;
  /** Swap the named rule for others. The replacements need not be named. */
  replace(id: string, ...rules: Rule[]): void;
  disableById(id: string): void;
  enableById(id: string): void;
  /** Register `rules` so they run immediately before the named one. */
  before(id: string, ...rules: Rule[]): void;
  /** Register `rules` so they run immediately after the named one. */
  after(id: string, ...rules: Rule[]): void;
  get<RuleType extends Rule>(ruleType: IConstructor<RuleType>): RuleType[];
  invalidateCache(rule: Rule | IConstructor<Rule>): void;
  process<RuleType extends Rule>(
    ruleType: IConstructor<RuleType>,
    ...args: RuleArgs<RuleType>
  ): RuleReturn<RuleType>[];
  register(...rules: Rule[]): void;
  unregister(...rules: Rule[]): void;
}
export declare const instance: RuleRegistry;
export default RuleRegistry;
