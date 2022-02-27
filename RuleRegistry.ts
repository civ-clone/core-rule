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

export class RuleRegistry<
    T extends Rule = Rule,
    P extends any[] = any[],
    R = any
  >
  extends EntityRegistry
  implements IRuleRegistry<T>
{
  #cache: Map<IConstructor<T>, T[]> = new Map();

  constructor() {
    super(Rule);
  }

  entries(): T[] {
    return super
      .entries()
      .sort(
        (a: T, b: T): number => a.priority().value() - b.priority().value()
      );
  }

  get(RuleType: IConstructor<T>): T[] {
    if (!this.#cache.has(RuleType)) {
      this.#cache.set(
        RuleType,
        this.filter((rule: T): boolean => rule.enabled()).filter(
          (rule: T): boolean => rule instanceof RuleType
        )
      );
    }

    return this.#cache.get(RuleType) || [];
  }

  invalidateCache(rule: T): void {
    this.#cache.delete(<IConstructor<T>>rule.constructor);
  }

  process(RuleType: IConstructor<T>, ...args: P): R[] {
    return this.get(RuleType)
      .filter((rule: T): boolean => rule.validate(...args))
      .map((rule: T): R => rule.process(...args));
  }

  register(...rules: T[]) {
    super.register(...rules);

    rules.forEach((rule: T): void => this.invalidateCache(rule));
  }

  unregister(...rules: T[]): void {
    super.unregister(...rules);

    rules.forEach((rule: T): void => this.invalidateCache(rule));
  }
}

export const instance: RuleRegistry = new RuleRegistry();

export default RuleRegistry;
