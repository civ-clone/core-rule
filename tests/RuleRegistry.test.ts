import { High, Low, Normal } from '../Priorities';
import Effect from '../Effect';
import Rule from '../Rule';
import RuleRegistry from '../RuleRegistry';
import * as chai from 'chai';
import * as spies from 'chai-spies';
import { describe, it, test } from 'mocha';

const { expect, use } = chai;

use(spies);

describe('RuleRegistry', () => {
  it('should return the expected number of rules', (): void => {
    class EmptyRule extends Rule<[], void> {}
    class NumberRule extends Rule<[number], void> {}

    const ruleRegistry = new RuleRegistry();

    ruleRegistry.register(
      new NumberRule(),
      new NumberRule(),
      new EmptyRule(),
      new NumberRule(),
      new NumberRule()
    );

    expect(ruleRegistry.get(EmptyRule).length).to.equal(1);
    expect(ruleRegistry.get(NumberRule).length).to.equal(4);

    // test caching mechanism too
    expect(ruleRegistry.get(NumberRule).length).to.equal(4);

    ruleRegistry.unregister(...ruleRegistry.get(NumberRule));

    expect(ruleRegistry.get(NumberRule).length).to.equal(0);

    ruleRegistry.unregister(...ruleRegistry.get(EmptyRule));

    expect(ruleRegistry.get(EmptyRule).length).to.equal(0);
    expect(ruleRegistry.length).to.equal(0);
  });

  it('should return `Rule`s in `Priority` order', (): void => {
    const ruleRegistry = new RuleRegistry();

    ruleRegistry.register(
      new Rule(new Normal()),
      new Rule(new High()),
      new Rule(new Low())
    );

    const rules = ruleRegistry.get(Rule);

    expect(rules.map((rule: Rule): number => rule.priority().value())).to.eql([
      1000, 2000, 3000,
    ]);
  });

  it('should be possible to `process` `Rule`s', (): void => {
    const ruleRegistry = new RuleRegistry(),
      spy = chai.spy(() => {}),
      effectSpy = new Effect(spy);

    ruleRegistry.register(
      new Rule(effectSpy),
      new Rule(effectSpy),
      new Rule(effectSpy)
    );

    expect(ruleRegistry.process(Rule)).to.eql([void 0, void 0, void 0]);
    expect(spy).to.called.exactly(3);
  });

  it('should not return disabled `Rule`s', () => {
    const ruleRegistry = new RuleRegistry(),
      rule1 = new Rule(),
      rule2 = new Rule();

    ruleRegistry.register(rule1, rule2);

    expect(ruleRegistry.get(Rule)).all.members([rule1, rule2]);

    rule1.disable();

    ruleRegistry.invalidateCache(rule1);

    expect(rule1.enabled()).to.false;

    expect(ruleRegistry.get(Rule)).all.members([rule2]).not.members([rule1]);
  });

  test.skip('should typehint expected types', () => {
    class MixedRule extends Rule<[number, string, null], boolean> {}
    class OptionalRule extends Rule<[number, string?, null?], boolean> {}

    const ruleRegistry = new RuleRegistry(),
      mixedRules = ruleRegistry.get(MixedRule), // MixedRule[]
      results1 = ruleRegistry.process(MixedRule), // Error TS2554 - not enough arguments
      results2 = ruleRegistry.process(MixedRule, 1), // Error TS2554 - not enough arguments
      results3 = ruleRegistry.process(MixedRule, 1, 2, 3), // Error TS2345 - incompatible arguments
      results4 = ruleRegistry.process(MixedRule, 1, '', null), // boolean[]
      optionalResults1 = ruleRegistry.process(OptionalRule), // Error TS2554 - not enough arguments
      optionalResults2 = ruleRegistry.process(OptionalRule, 1), // boolean[]
      optionalResults3 = ruleRegistry.process(OptionalRule, 1, ''), // boolean[]
      optionalResults4 = ruleRegistry.process(OptionalRule, 1, true); // Error TS2345 - incompatible arguments
  });
});
