export interface IPriority {
  value(): number;
}
export declare class Priority implements IPriority {
  #private;
  constructor(value?: number);
  value(): number;
}
export default Priority;
