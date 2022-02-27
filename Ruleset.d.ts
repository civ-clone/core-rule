import Rule from './Rule';
export interface IRuleset {
  add(...rules: Rule[]): void;
  enable(): void;
  disable(): void;
  remove(...rules: Rule[]): void;
}
export declare class Ruleset implements IRuleset {
  #private;
  constructor(...rules: Rule[]);
  add(...rules: Rule[]): void;
  enable(): void;
  disable(): void;
  remove(...rules: Rule[]): void;
}
export default Ruleset;
