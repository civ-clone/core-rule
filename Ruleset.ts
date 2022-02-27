import Rule from './Rule';

export interface IRuleset {
  add(...rules: Rule[]): void;
  enable(): void;
  disable(): void;
  remove(...rules: Rule[]): void;
}

export class Ruleset implements IRuleset {
  #rules: Rule[] = [];

  constructor(...rules: Rule[]) {
    this.#rules.push(...rules);
  }

  add(...rules: Rule[]): void {
    this.#rules.push(...rules);
  }

  enable(): void {
    this.#rules.forEach((rule) => rule.enable());
  }

  disable(): void {
    this.#rules.forEach((rule) => rule.disable());
  }

  remove(...rules: Rule[]): void {
    rules.forEach((rule) => {
      const index = this.#rules.indexOf(rule);

      if (index !== -1) {
        this.#rules.splice(index, 1);
      }
    });
  }
}

export default Ruleset;
