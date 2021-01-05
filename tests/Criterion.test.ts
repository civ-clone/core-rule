import Criterion from '../Criterion';
import { expect } from 'chai';

describe('Criterion', (): void => {
  it('should correctly validate', (): void => {
    const empty = new Criterion(),
      criterionTrue = new Criterion((): boolean => true),
      criterionFalse = new Criterion((): boolean => false);

    expect(empty.validate()).to.true;
    expect(criterionTrue.validate()).to.true;
    expect(criterionFalse.validate()).to.false;
  });
});
