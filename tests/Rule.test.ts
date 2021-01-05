import And from '../Criteria/And';
import Criterion from '../Criterion';
import Effect from '../Effect';
import Or from '../Criteria/Or';
import Rule from '../Rule';
import { expect } from 'chai';

describe('Rule', () => {
  it('should successfully validate', () => {
    class EmptyRule extends Rule<[], void> {}
    class NumberRule extends Rule<[number], number> {}

    const emptyRule = new EmptyRule(),
      even = new Criterion((x) => x % 2 === 0),
      square = new Criterion((x) => {
        const i = Math.sqrt(x);

        return i === Math.floor(i);
      }),
      evenAndSquare = new NumberRule(new And(even, square)),
      evenOrSquare = new NumberRule(new Or(even, square)),
      ruleWithJustEffect = new NumberRule(new Effect(() => 42)),
      ruleThatSquares = new NumberRule(new Effect((n) => n ** 2));

    expect(emptyRule.validate()).to.true;
    expect(emptyRule.process()).to.undefined;
    expect(even.validate(2)).to.equal(true);
    expect(even.validate(1)).to.equal(false);
    expect(square.validate(4)).to.equal(true);
    expect(square.validate(3)).to.equal(false);
    expect(evenAndSquare.validate(4)).to.equal(true);
    expect(evenAndSquare.validate(9)).to.equal(false);
    expect(evenOrSquare.validate(6)).to.equal(true);
    expect(evenOrSquare.validate(25)).to.equal(true);
    expect(evenOrSquare.validate(13)).to.equal(false);
    expect(ruleWithJustEffect.validate(0)).to.equal(true);
    expect(ruleWithJustEffect.process(0)).to.equal(42);
    expect(ruleThatSquares.process(5)).to.equal(25);
  });

  it('should only allow one `Effect`', (): void => {
    expect(() => {
      new Rule(new Effect(() => {}), new Effect(() => {}));
    }).to.throw(TypeError);
  });
});
