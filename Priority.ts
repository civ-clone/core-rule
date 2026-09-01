export interface IPriority {
  value(): number;
}

export class Priority implements IPriority {
  private _value: number;

  constructor(value: number = 2000) {
    this._value = value;
  }

  value(): number {
    return this._value;
  }
}

export default Priority;
