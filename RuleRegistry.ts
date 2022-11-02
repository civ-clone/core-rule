import {
  EntityRegistry,
  IEntityRegistry,
} from '@civ-clone/core-registry/EntityRegistry';
import { IConstructor } from '@civ-clone/core-registry/Registry';
import Rule from './Rule';

type RuleArgs<T extends Rule> = T extends Rule<infer C, any> ? C : never;
type RuleReturn<T extends Rule> = T extends Rule<any[], infer R> ? R : never;

export interface IRuleRegistry<
  T extends Rule = Rule,
  P extends any[] = any[],
  R = any
> extends IEntityRegistry<T> {
  get<RuleType extends T = T>(ruleType: IConstructor<RuleType>): RuleType[];
  invalidateCache(rule: T | IConstructor<T>): void;
  process<RuleType extends T = T>(
    ruleType: IConstructor<RuleType>,
    ...args: RuleArgs<RuleType>
  ): RuleReturn<RuleType>[];
}

interface RuleCacheMap extends Map<IConstructor<Rule>, Rule[]> {
  get<T extends Rule>(ruleType: IConstructor<T>): T[];
  set<T extends Rule>(ruleType: IConstructor<T>, rules: T[]): this;
}

export class RuleRegistry
  extends EntityRegistry<Rule>
  implements IRuleRegistry
{
  #cache: RuleCacheMap = new Map();

  constructor() {
    super(Rule);
  }

  entries(): Rule[] {
    return super
      .entries()
      .sort(
        (a: Rule, b: Rule): number =>
          a.priority().value() - b.priority().value()
      );
  }

  get<RuleType extends Rule>(ruleType: IConstructor<RuleType>): RuleType[] {
    if (!this.#cache.has(ruleType)) {
      this.#cache.set(
        ruleType,
        this.filter(
          (rule: Rule): rule is RuleType =>
            rule.enabled() && rule instanceof ruleType
        )
      );
    }

    return this.#cache.get(ruleType) || [];
  }

  invalidateCache(rule: Rule | IConstructor<Rule>): void {
    this.#cache.delete(
      rule instanceof Rule
        ? (rule.constructor as IConstructor<Rule>)
        : (rule as IConstructor<Rule>)
    );
  }

  process<RuleType extends Rule>(
    ruleType: IConstructor<RuleType>,
    ...args: RuleArgs<RuleType>
  ): RuleReturn<RuleType>[] {
    return this.get(ruleType)
      .filter((rule: RuleType): boolean => rule.validate(...args))
      .map((rule: RuleType): RuleReturn<RuleType> => rule.process(...args));
  }

  register(...rules: Rule[]) {
    super.register(...rules);

    rules.forEach((rule: Rule): void => this.invalidateCache(rule));
  }

  unregister(...rules: Rule[]): void {
    super.unregister(...rules);

    rules.forEach((rule: Rule): void => this.invalidateCache(rule));
  }
}

export const instance: RuleRegistry = new RuleRegistry();

export default RuleRegistry;
