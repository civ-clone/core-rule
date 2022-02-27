export interface IEffect {
  apply(...args: any[]): any;
}
export declare class Effect<T extends any[] = any[], R = any>
  implements IEffect
{
  #private;
  constructor(effect: (...args: T) => R);
  apply(...args: T): R;
}
export default Effect;
