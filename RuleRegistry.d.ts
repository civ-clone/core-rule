import {
  EntityRegistry,
  IEntityRegistry,
} from '@civ-clone/core-registry/EntityRegistry';
import { IConstructor } from '@civ-clone/core-registry/Registry';
import Rule from './Rule';
export interface IRuleRegistry<
  T extends Rule = Rule,
  P extends any[] = any[],
  R = any
> extends IEntityRegistry<T> {
  get(RuleType: IConstructor<T>): T[];
  invalidateCache(RuleType: T): void;
  process(RuleType: IConstructor<T>, ...args: P): R[];
}
export declare class RuleRegistry<
    T extends Rule = Rule,
    P extends any[] = any[],
    R = any
  >
  extends EntityRegistry
  implements IRuleRegistry<T>
{
  #private;
  constructor();
  entries(): T[];
  get(RuleType: IConstructor<T>): T[];
  invalidateCache(rule: T): void;
  process(RuleType: IConstructor<T>, ...args: P): R[];
  register(...rules: T[]): void;
  unregister(...rules: T[]): void;
}
export declare const instance: RuleRegistry;
export default RuleRegistry;
