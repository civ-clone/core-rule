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
export declare class RuleRegistry
  extends EntityRegistry<Rule>
  implements IRuleRegistry
{
  #private;
  constructor();
  entries(): Rule[];
  get<RuleType extends Rule = Rule>(
    ruleType: IConstructor<RuleType>
  ): RuleType[];
  invalidateCache(rule: Rule | IConstructor<Rule>): void;
  process<RuleType extends Rule = Rule>(
    ruleType: IConstructor<RuleType>,
    ...args: RuleArgs<RuleType>
  ): RuleReturn<RuleType>[];
  register(...rules: Rule[]): void;
  unregister(...rules: Rule[]): void;
}
export declare const instance: RuleRegistry;
export default RuleRegistry;
