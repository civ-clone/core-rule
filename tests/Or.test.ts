import Criterion from '../Criterion';
import Criteria from '../Criteria';
import Or from '../Criteria/Or';
import * as chai from 'chai';
import * as spies from 'chai-spies';

const { expect, use } = chai;

use(spies);

describe('Criteria', (): void => {
  it('should correctly validate', (): void => {
    const empty = new Or(),
      criterionTrue = new Criterion(() => true),
      criterionFalse = new Criterion(() => false),
      multipleFalse = new Or(criterionFalse, criterionFalse),
      multipleTrue = new Or(criterionTrue, criterionTrue),
      multipleMixed = new Or(criterionTrue, criterionFalse);

    expect(empty.validate()).to.true;
    expect(multipleFalse.validate()).to.false;
    expect(multipleTrue.validate()).to.true;
    expect(multipleMixed.validate()).to.true;
  });

  it('should stop validation after the first success', (): void => {
    const spy1False = chai.spy((): boolean => false),
      criterionSpy1 = new Criterion(spy1False),
      shouldCallBoth = new Or(criterionSpy1, criterionSpy1);

    expect(shouldCallBoth.validate()).to.false;
    expect(spy1False).to.called.twice;

    const spy2True = chai.spy((): boolean => true),
      criterionSpy2True = new Criterion(spy2True),
      spy2False = chai.spy((): boolean => false),
      criterionSpy2False = new Criterion(spy2False),
      shouldCallFirstOnly = new Or(criterionSpy2True, criterionSpy2False);

    expect(shouldCallFirstOnly.validate()).to.true;
    expect(spy2True).to.called.once;
    expect(spy2False).to.not.called;
  });
});
