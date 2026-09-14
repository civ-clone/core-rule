import Criterion from './Criterion';
import Effect from './Effect';
import Priority from './Priority';
export interface IRule<C extends any[] = any[], R = any> {
  disable(): void;
  enable(): void;
  enabled(): boolean;
  id(): string | null;
  priority(): Priority;
  process(...args: C): R | void;
  validate(...args: C): boolean;
}
export declare class Rule<C extends any[] = any[], R = any>
  implements IRule<C, R>
{
  private _criteria;
  private _enabled;
  private _effect;
  private _id;
  private _priority;
  /**
   * An optional identifier, as the first argument:
   *
   * ```ts
   * new Created(
   *   'civ1-city:city/created/register',
   *   new Criterion(…),
   *   new Effect(…)
   * )
   * ```
   *
   * **Optional, so this lands package by package.** Unnamed rules keep working
   * exactly as before — of the 1,055 rules a real game registers, most are
   * collecting rules that compose fine and have no reason to be addressable.
   * What an identifier buys is the ability to name *one instance*, which is
   * what `RuleRegistry.replace`, `disable`, `before` and `after` need and what
   * no amount of subclassing can provide: there are 1,055 instances and 163
   * classes.
   *
   * The convention is `package:path/to/rule`, so an identifier says where to
   * look for what it names.
   */
  constructor(...values: (string | Priority | Criterion<C> | Effect<C, R>)[]);
  disable(): void;
  enable(): void;
  /** The identifier this rule was constructed with, if any. */
  id(): string | null;
  enabled(): boolean;
  priority(): Priority;
  process(...args: C): R | void;
  validate(...args: C): boolean;
}
export default Rule;
