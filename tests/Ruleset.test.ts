import Rule from '../Rule';
import Ruleset from '../Ruleset';
import { expect } from 'chai';

describe('Ruleset', () => {
  it('should correctly enable and disable associated `Rule`s', () => {
    const rule1 = new Rule(),
      rule2 = new Rule(),
      set = new Ruleset(rule1, rule2);

    set.disable();

    expect(rule1.enabled()).to.false;
    expect(rule2.enabled()).to.false;

    set.enable();

    expect(rule1.enabled()).to.true;
    expect(rule2.enabled()).to.true;
  });
});
