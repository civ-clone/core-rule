export interface IPriority {
  value(): number;
}

export class Priority implements IPriority {
  #value: number;

  constructor(value: number = 2000) {
    this.#value = value;
  }

  value(): number {
    return this.#value;
  }
}

export default Priority;
