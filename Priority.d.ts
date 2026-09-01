export interface IPriority {
  value(): number;
}
export declare class Priority implements IPriority {
  private _value;
  constructor(value?: number);
  value(): number;
}
export default Priority;
