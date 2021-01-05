import Criterion from '../Criterion';
import * as chai from 'chai';
import * as spies from 'chai-spies';
import Criteria from '../Criteria';

const { expect, use } = chai;

use(spies);

describe('Criteria', (): void => {
  it('should correctly validate', (): void => {
    const empty = new Criteria(),
      criterionTrue = new Criterion(() => true),
      criterionFalse = new Criterion(() => false),
      singleTrueCriteria = new Criteria(criterionTrue),
      singleFalseCriteria = new Criteria(criterionFalse),
      multipleTrueCriteria = new Criteria(
        criterionTrue,
        criterionTrue,
        criterionTrue
      ),
      multipleFalseCriteria = new Criteria(
        criterionFalse,
        criterionFalse,
        criterionFalse
      ),
      multipleMixedCriteria = new Criteria(criterionTrue, criterionFalse);

    expect(empty.validate()).to.true;
    expect(singleTrueCriteria.validate()).to.true;
    expect(singleFalseCriteria.validate()).to.false;
    expect(multipleTrueCriteria.validate()).to.true;
    expect(multipleFalseCriteria.validate()).to.false;
    expect(multipleMixedCriteria.validate()).to.false;
  });

  it('should stop validation after the first failure', (): void => {
    const spy1True = chai.spy((): boolean => true),
      criterionSpy1 = new Criterion(spy1True),
      shouldCallBoth = new Criteria(criterionSpy1, criterionSpy1);

    expect(shouldCallBoth.validate()).to.true;
    expect(spy1True).to.called.twice;

    const spy2False = chai.spy((): boolean => false),
      criterionSpy2False = new Criterion(spy2False),
      spy2True = chai.spy((): boolean => true),
      criterionSpy2True = new Criterion(spy2True),
      shouldCallFirstOnly = new Criteria(criterionSpy2False, criterionSpy2True);

    expect(shouldCallFirstOnly.validate()).to.false;
    expect(spy2False).to.called.once;
    expect(spy2True).to.not.called;
  });
});
