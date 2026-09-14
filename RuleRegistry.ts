import {
  EntityRegistry,
  IEntityRegistry,
} from '@civ-clone/core-registry/EntityRegistry';
import { IConstructor } from '@civ-clone/core-registry/Registry';
import Rule from './Rule';

type RuleArgs<T extends Rule> = T extends Rule<infer C, any> ? C : never;
type RuleReturn<T extends Rule> = T extends Rule<any[], infer R> ? R : never;

export class UnknownRuleError extends Error {}
export class DuplicateRuleIdError extends Error {}

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

interface RuleCacheMap extends Map<IConstructor<Rule>, Rule[]> {
  get<T extends Rule>(ruleType: IConstructor<T>): T[];
  set<T extends Rule>(ruleType: IConstructor<T>, rules: T[]): this;
}

export class RuleRegistry
  extends EntityRegistry<Rule>
  implements IRuleRegistry
{
  private _cache: RuleCacheMap = new Map();
  private _byId: Map<string, Rule> = new Map();
  private _constraints: Map<Rule, { side: 'after' | 'before'; id: string }> =
    new Map();

  constructor() {
    super(Rule);
  }

  entries(): Rule[] {
    const sorted = super
      .entries()
      .sort(
        (a: Rule, b: Rule): number =>
          a.priority().value() - b.priority().value()
      );

    // The common path, and 1,055 rules deep: no relative constraints means
    // nothing to reposition, and `entries()` stays exactly as cheap as before.
    if (this._constraints.size === 0) {
      return sorted;
    }

    return this._ordered(sorted);
  }

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
  private _ordered(sorted: Rule[]): Rule[] {
    const result = sorted.filter((rule) => !this._constraints.has(rule));

    // Grouped by target and side, then each group spliced in as a unit.
    //
    // Inserting one at a time does not work and the test for it says why:
    // two rules both `after('pkg:a')` each splice at `index + 1`, so the
    // second lands *before* the first and they come out reversed. Grouping
    // makes the order within a group explicit — priority order, since they
    // are peers and something has to decide — instead of a consequence of
    // which way the loop happens to run.
    const groups = new Map<string, Rule[]>();

    sorted
      .filter((rule) => this._constraints.has(rule))
      .forEach((rule) => {
        const { side, id } = this._constraints.get(rule)!;
        const key = `${side}:${id}`;

        groups.set(key, [...(groups.get(key) ?? []), rule]);
      });

    groups.forEach((rules, key) => {
      const side = key.slice(0, key.indexOf(':'));
      const id = key.slice(key.indexOf(':') + 1);
      const target = this._byId.get(id);
      const at = target ? result.indexOf(target) : -1;

      if (at === -1) {
        // The target is gone — unregistered, or replaced by something
        // unnamed. Keep the rules rather than dropping them: a constraint is
        // about *order*, and losing a rule entirely is a worse answer than
        // ordering it imperfectly.
        result.push(...rules);

        return;
      }

      result.splice(side === 'before' ? at : at + 1, 0, ...rules);
    });

    return result;
  }

  /** The rule registered under `id`, or `null`. */
  getById(id: string): Rule | null {
    return this._byId.get(id) ?? null;
  }

  /**
   * Every one of these throws on an unknown id rather than doing nothing.
   *
   * That is the whole reason to prefer them over reaching for a priority
   * number: a plugin that means to replace `civ1-city:city/grow` and mistypes
   * it should fail at load, not run a game in which its override silently
   * never applied. An unknown id is far more likely to be a typo or a version
   * mismatch than an intentional no-op.
   */
  private _require(id: string): Rule {
    const rule = this._byId.get(id);

    if (!rule) {
      throw new UnknownRuleError(
        `No rule is registered as '${id}'. Either it is misspelled, or the ` +
          'package that declares it is not loaded, or its id changed.'
      );
    }

    return rule;
  }

  /** Swap the named rule for others. The replacements need not be named. */
  replace(id: string, ...rules: Rule[]): void {
    this.unregister(this._require(id));
    this.register(...rules);
  }

  disableById(id: string): void {
    this._require(id).disable();
    this.invalidateCache(this._require(id));
  }

  enableById(id: string): void {
    this._require(id).enable();
    this.invalidateCache(this._require(id));
  }

  /** Register `rules` so they run immediately before the named one. */
  before(id: string, ...rules: Rule[]): void {
    this._require(id);
    rules.forEach((rule) =>
      this._constraints.set(rule, { side: 'before', id })
    );
    this.register(...rules);
  }

  /** Register `rules` so they run immediately after the named one. */
  after(id: string, ...rules: Rule[]): void {
    this._require(id);
    rules.forEach((rule) => this._constraints.set(rule, { side: 'after', id }));
    this.register(...rules);
  }

  get<RuleType extends Rule>(ruleType: IConstructor<RuleType>): RuleType[] {
    if (!this._cache.has(ruleType)) {
      this._cache.set(
        ruleType,
        this.filter(
          (rule: Rule): rule is RuleType =>
            rule.enabled() && rule instanceof ruleType
        )
      );
    }

    return this._cache.get(ruleType) || [];
  }

  invalidateCache(rule: Rule | IConstructor<Rule>): void {
    this._cache.delete(
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
    rules.forEach((rule: Rule): void => {
      const id = rule.id();

      if (id === null) {
        return;
      }

      const existing = this._byId.get(id);

      if (existing && existing !== rule) {
        // Two rules under one id makes `replace` and `disable` ambiguous, and
        // the loser would be unaddressable. Same reasoning as `ClassRegistry`:
        // refusing at registration turns a silent mis-resolution into a
        // startup error.
        throw new DuplicateRuleIdError(
          `Two rules claim the id '${id}'. Ids address a single rule, so one ` +
            'of them could never be replaced or disabled.'
        );
      }

      this._byId.set(id, rule);
    });

    super.register(...rules);

    rules.forEach((rule: Rule): void => this.invalidateCache(rule));
  }

  unregister(...rules: Rule[]): void {
    rules.forEach((rule: Rule): void => {
      const id = rule.id();

      if (id !== null && this._byId.get(id) === rule) {
        this._byId.delete(id);
      }

      this._constraints.delete(rule);
    });

    super.unregister(...rules);

    rules.forEach((rule: Rule): void => this.invalidateCache(rule));
  }
}

export const instance: RuleRegistry = new RuleRegistry();

export default RuleRegistry;
