import Rule from './Rule';

export interface IRuleset {
  add(...rules: Rule[]): void;
  enable(): void;
  disable(): void;
  remove(...rules: Rule[]): void;
}

export class Ruleset implements IRuleset {
  private _rules: Rule[] = [];

  constructor(...rules: Rule[]) {
    this._rules.push(...rules);
  }

  add(...rules: Rule[]): void {
    this._rules.push(...rules);
  }

  enable(): void {
    this._rules.forEach((rule) => rule.enable());
  }

  disable(): void {
    this._rules.forEach((rule) => rule.disable());
  }

  remove(...rules: Rule[]): void {
    rules.forEach((rule) => {
      const index = this._rules.indexOf(rule);

      if (index !== -1) {
        this._rules.splice(index, 1);
      }
    });
  }
}

export default Ruleset;
