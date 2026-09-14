import {
  DuplicateRuleIdError,
  RuleRegistry,
  UnknownRuleError,
} from '../RuleRegistry';
import { High, Low } from '../Priorities';
import Effect from '../Effect';
import Rule from '../Rule';
import { expect } from 'chai';

class Example extends Rule<[], string> {}

const named = (id: string, value: string, priority?: High | Low): Example =>
  priority
    ? new Example(id, priority, new Effect((): string => value))
    : new Example(id, new Effect((): string => value));

const anonymous = (value: string): Example =>
  new Example(new Effect((): string => value));

describe('Rule ids', (): void => {
  it('should default to no id', (): void => {
    expect(anonymous('a').id()).to.be.null;
  });

  it('should take an id as the first argument', (): void => {
    expect(named('pkg:thing', 'a').id()).to.equal('pkg:thing');
  });

  it('should not mistake an id for a priority', (): void => {
    // The constructor treated any non-Effect, non-Criterion value as a
    // priority, so a string had to be handled before that fallback.
    expect(named('pkg:thing', 'a').priority().value()).to.equal(2000);
  });

  it('should refuse two ids', (): void => {
    expect(
      () => new Example('one', 'two', new Effect((): string => 'a'))
    ).to.throw(TypeError, /already specified/);
  });
});

describe('RuleRegistry identity', (): void => {
  it('should find a rule by id', (): void => {
    const registry = new RuleRegistry();
    const rule = named('pkg:a', 'a');

    registry.register(rule);

    expect(registry.getById('pkg:a')).to.equal(rule);
  });

  it('should return null for an unknown id', (): void => {
    expect(new RuleRegistry().getById('pkg:nope')).to.be.null;
  });

  it('should not index anonymous rules', (): void => {
    const registry = new RuleRegistry();

    registry.register(anonymous('a'));

    expect(registry.entries().length).to.equal(1);
    expect(registry.getById('')).to.be.null;
  });

  it('should refuse two rules claiming one id', (): void => {
    const registry = new RuleRegistry();

    registry.register(named('pkg:a', 'a'));

    expect(() => registry.register(named('pkg:a', 'b'))).to.throw(
      DuplicateRuleIdError
    );
  });

  it('should accept the same rule twice', (): void => {
    const registry = new RuleRegistry();
    const rule = named('pkg:a', 'a');

    registry.register(rule);

    expect(() => registry.register(rule)).not.to.throw();
  });

  it('should free the id when a rule is unregistered', (): void => {
    const registry = new RuleRegistry();
    const rule = named('pkg:a', 'a');

    registry.register(rule);
    registry.unregister(rule);

    expect(registry.getById('pkg:a')).to.be.null;
    expect(() => registry.register(named('pkg:a', 'b'))).not.to.throw();
  });

  // Each of these throwing is the point. A plugin that mistypes an id should
  // fail at load rather than run a game where its override never applied.
  it('should throw rather than no-op on an unknown id', (): void => {
    const registry = new RuleRegistry();

    expect(() => registry.replace('pkg:nope', anonymous('a'))).to.throw(
      UnknownRuleError
    );
    expect(() => registry.disableById('pkg:nope')).to.throw(UnknownRuleError);
    expect(() => registry.enableById('pkg:nope')).to.throw(UnknownRuleError);
    expect(() => registry.before('pkg:nope', anonymous('a'))).to.throw(
      UnknownRuleError
    );
    expect(() => registry.after('pkg:nope', anonymous('a'))).to.throw(
      UnknownRuleError
    );
  });

  it('should replace a named rule', (): void => {
    const registry = new RuleRegistry();

    registry.register(named('pkg:a', 'original'));
    registry.replace('pkg:a', anonymous('replacement'));

    expect(registry.process(Example)).to.deep.equal(['replacement']);
  });

  it('should disable a named rule without removing it', (): void => {
    const registry = new RuleRegistry();

    registry.register(named('pkg:a', 'a'), anonymous('b'));
    registry.disableById('pkg:a');

    expect(registry.process(Example)).to.deep.equal(['b']);
    expect(registry.getById('pkg:a')).not.to.be.null;

    registry.enableById('pkg:a');

    expect(registry.process(Example)).to.deep.equal(['a', 'b']);
  });
});

describe('RuleRegistry ordering', (): void => {
  it('should order by priority when nothing asks otherwise', (): void => {
    const registry = new RuleRegistry();

    registry.register(
      named('pkg:low', 'low', new Low()),
      named('pkg:high', 'high', new High())
    );

    expect(registry.process(Example)).to.deep.equal(['high', 'low']);
  });

  it('should run a rule immediately before the one it names', (): void => {
    const registry = new RuleRegistry();

    registry.register(named('pkg:a', 'a'), named('pkg:b', 'b'));
    registry.before('pkg:b', anonymous('between'));

    expect(registry.process(Example)).to.deep.equal(['a', 'between', 'b']);
  });

  it('should run a rule immediately after the one it names', (): void => {
    const registry = new RuleRegistry();

    registry.register(named('pkg:a', 'a'), named('pkg:b', 'b'));
    registry.after('pkg:a', anonymous('between'));

    expect(registry.process(Example)).to.deep.equal(['a', 'between', 'b']);
  });

  it('should beat priority, which is the point', (): void => {
    // `before` has to win against the numbers, or it is just another way of
    // guessing — and guessing is what `new Priority(9001)` already does.
    const registry = new RuleRegistry();

    registry.register(named('pkg:high', 'high', new High()));
    registry.after('pkg:high', new Example(new Low(), new Effect(() => 'low')));
    registry.register(anonymous('normal'));

    expect(registry.process(Example)).to.deep.equal(['high', 'low', 'normal']);
  });

  it('should keep a rule when its target goes away', (): void => {
    // A constraint is about order. Losing the rule entirely because its
    // neighbour was unregistered would be a worse answer than ordering it by
    // its own priority.
    const registry = new RuleRegistry();
    const target = named('pkg:target', 'target');

    registry.register(target);
    registry.after('pkg:target', anonymous('follower'));
    registry.unregister(target);

    expect(registry.process(Example)).to.deep.equal(['follower']);
  });

  it('should give two rules constrained against one target a defined order', (): void => {
    const registry = new RuleRegistry();

    registry.register(named('pkg:a', 'a'));
    registry.after('pkg:a', named('pkg:first', 'first', new High()));
    registry.after('pkg:a', named('pkg:second', 'second', new Low()));

    // Both sit immediately after `a`; between themselves, priority decides.
    expect(registry.process(Example)).to.deep.equal(['a', 'first', 'second']);
  });

  it('should drop a constraint when its rule is unregistered', (): void => {
    const registry = new RuleRegistry();
    const follower = anonymous('follower');

    registry.register(named('pkg:a', 'a'));
    registry.after('pkg:a', follower);
    registry.unregister(follower);

    expect(registry.process(Example)).to.deep.equal(['a']);
  });
});
