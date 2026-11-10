import {
  EntityRegistry,
  IEntityRegistry,
} from '@civ-clone/core-registry/EntityRegistry';
import { IConstructor } from '@civ-clone/core-registry/Registry';
import { Rule } from './Rule';
type RuleArgs<T extends Rule> = T extends Rule<infer C, any> ? C : never;
type RuleReturn<T extends Rule> = T extends Rule<any[], infer R> ? R : never;
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
  private _enabled;
  private _enabledAt;
  private _byId;
  private _constraints;
  private _listeners;
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
  /**
   * The enabled rules of a type, in the order they run.
   *
   * The cache behind it holds every rule of the type, switched on or not. It
   * used to hold only those enabled when it was built, so a rule switched
   * back on with `rule.enable()` — which no registry hears — stayed out until
   * something else emptied the cache (civ-clone/web-renderer#158).
   *
   * The answer is kept too, and looked at again only when some rule, anywhere,
   * has been switched since (`switchCount`): one look at each rule of the type,
   * and nothing allocated unless one of them was. With every rule on, the
   * answer is the cache itself.
   */
  get<RuleType extends Rule>(ruleType: IConstructor<RuleType>): RuleType[];
  private _ofType;
  invalidateCache(rule: Rule | IConstructor<Rule>): void;
  /**
   * Plain loops rather than `filter().map()`.
   *
   * This is the hottest loop in the engine: a 30-turn headless game makes
   * 143,148 `process(MovementCost, …)` calls, each walking 148 rules, and
   * 98.5% of every rule validation in a run happens right here. `filter` and
   * `map` each allocate a closure per call on top of their arrays, for no
   * reason other than how the line reads.
   *
   * Every rule is still validated *before* any rule is processed, which is
   * what `filter().map()` did and is not an incidental detail: a rule's effect
   * can change what a later rule's criteria look at, so interleaving the two
   * passes would be a behavioural change and not an optimisation.
   *
   * It walks every rule of the type and not only the enabled ones: `validate`
   * answers `false` for a rule that is off, so none is processed, and the
   * loop does not pay for `get`'s look at each rule first. So whether a rule
   * is on is read when it is that rule's turn to be validated: one switched by
   * an earlier rule's criterion in the same call is validated as it then is.
   */
  process<RuleType extends Rule>(
    ruleType: IConstructor<RuleType>,
    ...args: RuleArgs<RuleType>
  ): RuleReturn<RuleType>[];
  register(...rules: Rule[]): void;
  /**
   * Told of each rule as it is registered, after it is in. Returns how to stop
   * listening.
   *
   * For `RuleSetRegistry`, which has to switch off a rule that a set says
   * starts off whenever that rule arrives: packages load in name order, so a
   * set is often registered before the rules it names.
   */
  onRegister(listener: (rule: Rule) => void): () => void;
  unregister(...rules: Rule[]): void;
}
export declare const instance: RuleRegistry;
export default RuleRegistry;
