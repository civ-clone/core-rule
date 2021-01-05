export interface IEffect {
  apply(...args: any[]): any;
}

export class Effect<T extends any[] = any[], R = any> implements IEffect {
  #effect: (...args: T) => R;

  constructor(effect: (...args: T) => R) {
    this.#effect = effect;
  }

  apply(...args: T): R {
    return this.#effect(...args);
  }
}

export default Effect;
