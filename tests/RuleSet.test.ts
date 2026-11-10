import {
  DuplicateRuleSetIdError,
  RuleSetCycleError,
  RuleSetRegistry,
  UnknownRuleSetError,
} from '../RuleSetRegistry';
import { RuleRegistry, UnknownRuleError } from '../RuleRegistry';
import { RuleSet, RuleSetError } from '../RuleSet';
import Effect from '../Effect';
import Rule from '../Rule';
import { expect } from 'chai';

class Example extends Rule<[], string> {}

const named = (id: string): Example =>
  new Example(id, new Effect((): string => id));

// A game's rules and its sets, with rules `a` to `f` registered.
const setUp = (
  ...ids: string[]
): { rules: RuleRegistry; sets: RuleSetRegistry; ran: () => string[] } => {
  const rules = new RuleRegistry(),
    sets = new RuleSetRegistry(rules);

  rules.register(
    ...(ids.length ? ids : ['a', 'b', 'c', 'd', 'e', 'f']).map(named)
  );

  return { rules, sets, ran: (): string[] => rules.process(Example) };
};

describe('RuleSet', (): void => {
  it('should need an id', (): void => {
    expect((): RuleSet => new RuleSet('')).to.throw(RuleSetError);
  });

  it('should hold rules by id, sets, and options in any order', (): void => {
    const inner = new RuleSet('inner', 'b'),
      set = new RuleSet('outer', 'a', { exclusive: true }, inner);

    expect(set.id()).to.equal('outer');
    expect(set.exclusive()).to.be.true;
    expect(set.enabledByDefault()).to.be.true;
    expect(set.memberIds()).to.eql(['a', 'inner']);
    expect(set.members()[1]).to.equal(inner);
  });

  it('should add each member once, and take a set in place of its id', (): void => {
    const inner = new RuleSet('inner'),
      set = new RuleSet('outer', 'a', 'inner');

    set.add('a', 'b', inner);

    expect(set.memberIds()).to.eql(['a', 'inner', 'b']);
    expect(set.members()[1]).to.equal(inner);
    expect(set.has('b')).to.be.true;
    expect(set.has(inner)).to.be.true;
  });

  it('should refuse to be its own member', (): void => {
    const set = new RuleSet('outer');

    expect((): RuleSet => set.add('outer')).to.throw(RuleSetError);
    expect((): RuleSet => new RuleSet('same', new RuleSet('same'))).to.throw(
      RuleSetError
    );
  });

  it('should tell its listeners of a change, and only of a change', (): void => {
    const set = new RuleSet('outer', 'a');

    let told = 0;

    const stop = set.subscribe((): void => {
      told++;
    });

    set.add('a');
    expect(told).to.equal(0);

    set.add('b');
    set.remove('a');
    set.remove('a');
    expect(told).to.equal(2);

    stop();
    set.add('c');
    expect(told).to.equal(2);
  });
});

describe('RuleSetRegistry', (): void => {
  describe('a plain set', (): void => {
    it('should switch every rule it holds, off and back on', (): void => {
      const { rules, sets, ran } = setUp();

      sets.register(new RuleSet('set', 'a', 'b'));

      expect(sets.state('set')).to.equal('on');

      // The cache is built with everything on, then with two rules off.
      expect(ran()).to.eql(['a', 'b', 'c', 'd', 'e', 'f']);

      sets.set('set', false);

      expect(sets.state('set')).to.equal('off');
      expect(rules.getById('a')!.enabled()).to.be.false;
      expect(ran()).to.eql(['c', 'd', 'e', 'f']);

      sets.set('set', true);

      expect(ran()).to.eql(['a', 'b', 'c', 'd', 'e', 'f']);
    });

    it('should switch one rule, and say the set is mixed', (): void => {
      const { sets, ran } = setUp();

      sets.register(new RuleSet('set', 'a', 'b'));
      sets.set('a', false);

      expect(sets.state('a')).to.equal('off');
      expect(sets.state('b')).to.equal('on');
      expect(sets.state('set')).to.equal('mixed');
      expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f']);
    });

    it('should reach the rules of the sets inside it', (): void => {
      const { sets, ran } = setUp();

      sets.register(new RuleSet('outer', 'a', new RuleSet('inner', 'b', 'c')));

      expect(sets.get('inner')).to.be.instanceof(RuleSet);
      expect(sets.roots().map((set) => set.id())).to.eql(['outer']);

      sets.set('inner', false);

      expect(sets.state('inner')).to.equal('off');
      expect(sets.state('outer')).to.equal('mixed');

      sets.set('outer', false);

      expect(ran()).to.eql(['d', 'e', 'f']);

      sets.set('outer', true);

      expect(sets.state('inner')).to.equal('on');
      expect(ran()).to.eql(['a', 'b', 'c', 'd', 'e', 'f']);
    });

    it('should start off when it says so', (): void => {
      const { sets, ran } = setUp();

      sets.register(new RuleSet('extras', { enabled: false }, 'a', 'b'));

      expect(sets.state('extras')).to.equal('off');
      expect(ran()).to.eql(['c', 'd', 'e', 'f']);

      sets.set('extras', true);

      expect(ran()).to.eql(['a', 'b', 'c', 'd', 'e', 'f']);
    });

    it('should refuse an id it does not know', (): void => {
      const { sets } = setUp();

      sets.register(new RuleSet('set', 'a'));

      // `f` is a rule, but no set holds it: it is not this registry's to switch.
      expect((): void => sets.set('f', false)).to.throw(UnknownRuleSetError);
      expect((): void => sets.set('nothing', false)).to.throw(
        UnknownRuleSetError
      );
      expect((): string => sets.state('nothing')).to.throw(UnknownRuleSetError);
    });
  });

  describe('a choice', (): void => {
    it('should have its first member on, and only that', (): void => {
      const { sets, ran } = setUp();

      sets.register(new RuleSet('choice', { exclusive: true }, 'a', 'b', 'c'));

      expect(sets.chosen('choice')).to.equal('a');
      expect(sets.state('choice')).to.equal('on');
      expect(ran()).to.eql(['a', 'd', 'e', 'f']);
    });

    it('should switch to the member chosen', (): void => {
      const { sets, ran } = setUp();

      sets.register(new RuleSet('choice', { exclusive: true }, 'a', 'b', 'c'));
      sets.choose('choice', 'c');

      expect(sets.chosen('choice')).to.equal('c');
      expect(ran()).to.eql(['c', 'd', 'e', 'f']);

      expect((): void => sets.choose('choice', 'f')).to.throw(
        UnknownRuleSetError
      );
      expect((): void => sets.set('choice', false)).to.throw(RuleSetError);
    });

    it('should choose between whole sets, and keep a rule both share', (): void => {
      const { sets, ran } = setUp();

      sets.register(
        new RuleSet(
          'choice',
          { exclusive: true },
          new RuleSet('first', 'a', 'b'),
          new RuleSet('second', 'b', 'c')
        )
      );

      expect(ran()).to.eql(['a', 'b', 'd', 'e', 'f']);

      sets.choose('choice', 'second');

      expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f']);
    });

    it('should give an alternative chosen again the settings it had', (): void => {
      const { sets, ran } = setUp();

      sets.register(
        new RuleSet(
          'choice',
          { exclusive: true },
          new RuleSet('first', 'a', 'b'),
          'c'
        )
      );
      sets.set('b', false);
      sets.choose('choice', 'c');

      expect(ran()).to.eql(['c', 'd', 'e', 'f']);

      sets.choose('choice', 'first');

      expect(ran()).to.eql(['a', 'd', 'e', 'f']);
    });

    it('should not be reached by switching the set that holds it', (): void => {
      const { sets, ran } = setUp();

      sets.register(
        new RuleSet(
          'outer',
          'a',
          new RuleSet('choice', { exclusive: true }, 'b', 'c')
        )
      );
      sets.set('outer', false);

      expect(sets.state('outer')).to.equal('off');
      expect(sets.chosen('choice')).to.equal('b');
      expect(ran()).to.eql(['b', 'd', 'e', 'f']);

      sets.set('outer', true);

      expect(ran()).to.eql(['a', 'b', 'd', 'e', 'f']);
    });

    it('should have nothing on beneath an alternative not chosen, a choice included', (): void => {
      const { sets, ran } = setUp();

      sets.register(
        new RuleSet(
          'choice',
          { exclusive: true },
          'a',
          new RuleSet(
            'other',
            'b',
            new RuleSet('inner', { exclusive: true }, 'c', 'd')
          )
        )
      );

      expect(ran()).to.eql(['a', 'e', 'f']);

      sets.choose('choice', 'other');

      expect(ran()).to.eql(['b', 'c', 'e', 'f']);
    });

    it('should fall back to the first member when the chosen one is removed', (): void => {
      const { sets, ran } = setUp(),
        choice = new RuleSet('choice', { exclusive: true }, 'a', 'b');

      sets.register(choice);
      sets.choose('choice', 'b');
      choice.remove('b');

      expect(sets.chosen('choice')).to.equal('a');
      // `b` is in no set any more, so it is back as it was registered.
      expect(ran()).to.eql(['a', 'b', 'c', 'd', 'e', 'f']);
    });
  });

  describe('registration order', (): void => {
    it('should switch off a rule that arrives after the set naming it', (): void => {
      const rules = new RuleRegistry(),
        sets = new RuleSetRegistry(rules);

      sets.register(
        new RuleSet('choice', { exclusive: true }, 'a', 'b'),
        new RuleSet('extras', { enabled: false }, 'c')
      );

      rules.register(named('a'), named('b'), named('c'), named('d'));

      expect(rules.process(Example)).to.eql(['a', 'd']);

      sets.choose('choice', 'b');
      sets.set('extras', true);

      expect(rules.process(Example)).to.eql(['b', 'c', 'd']);
    });

    it('should switch a rule that replaces one under the same id', (): void => {
      const { rules, sets } = setUp();

      sets.register(new RuleSet('set', 'a'));
      sets.set('set', false);

      rules.replace('a', named('a'));

      expect(rules.getById('a')!.enabled()).to.be.false;
    });

    it('should take members for a set before the set arrives', (): void => {
      const { sets, ran } = setUp();

      sets.extend('later', 'b', new RuleSet('inner', 'c'));

      expect((): void => sets.check()).to.throw(UnknownRuleSetError);

      sets.register(new RuleSet('later', 'a'));

      expect(sets.get('later')!.memberIds()).to.eql(['a', 'b', 'inner']);
      expect(sets.get('inner')).to.be.instanceof(RuleSet);
      expect((): void => sets.check()).not.to.throw();

      sets.set('later', false);

      expect(ran()).to.eql(['d', 'e', 'f']);
    });

    it('should take members for a set that is there, and switch them with it', (): void => {
      const { sets, ran } = setUp();

      sets.register(new RuleSet('set', 'a'));
      sets.set('set', false);
      sets.extend('set', 'b');

      // A rule that joins a set joins as itself: on, until it is switched.
      expect(sets.state('set')).to.equal('mixed');
      expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f']);
    });

    it('should adopt a set added to one already registered', (): void => {
      const { sets, ran } = setUp(),
        outer = new RuleSet('outer', 'a');

      sets.register(outer);
      outer.add(new RuleSet('inner', { enabled: false }, 'b'));

      expect(sets.get('inner')).to.be.instanceof(RuleSet);
      expect(ran()).to.eql(['a', 'c', 'd', 'e', 'f']);
    });

    it('should hold a set by id, whichever is registered first', (): void => {
      const { sets, ran } = setUp();

      sets.register(new RuleSet('outer', 'inner', 'a'));
      sets.register(new RuleSet('inner', 'b'));

      expect(sets.roots().map((set) => set.id())).to.eql(['outer']);

      sets.set('outer', false);

      expect(ran()).to.eql(['c', 'd', 'e', 'f']);
    });

    it('should refuse two sets under one id', (): void => {
      const { sets } = setUp(),
        set = new RuleSet('set', 'a');

      sets.register(set);
      sets.register(set);

      expect((): void => sets.register(new RuleSet('set', 'b'))).to.throw(
        DuplicateRuleSetIdError
      );
    });

    it('should switch a rule back on when no set holds it any more', (): void => {
      const { sets, ran } = setUp(),
        set = new RuleSet('set', 'a', 'b');

      sets.register(set);
      sets.set('set', false);
      set.remove('a');

      expect(ran()).to.eql(['a', 'c', 'd', 'e', 'f']);

      sets.unregister(set);

      expect(sets.get('set')).to.be.null;
      expect(ran()).to.eql(['a', 'b', 'c', 'd', 'e', 'f']);
    });
  });

  describe('check', (): void => {
    it('should pass when every id is a rule or a set', (): void => {
      const { sets } = setUp();

      sets.register(new RuleSet('outer', 'a', new RuleSet('inner', 'b')));

      expect((): void => sets.check()).not.to.throw();
    });

    it('should name a rule nothing registered', (): void => {
      const { sets } = setUp();

      sets.register(new RuleSet('set', 'a', 'typo'));

      expect((): void => sets.check())
        .to.throw(UnknownRuleError)
        .with.property('message')
        .that.matches(/'set' names 'typo'/);
    });

    it('should name a set that is inside itself', (): void => {
      const { sets, ran } = setUp(),
        first = new RuleSet('first', 'a', 'second'),
        second = new RuleSet('second', 'b', 'first');

      sets.register(first, second);

      // Nothing hangs, and the rules are still switched.
      sets.set('first', false);

      expect(ran()).to.eql(['c', 'd', 'e', 'f']);
      // Neither is above the other, so the first registered is where the tree is drawn and saved from.
      expect(sets.describe().map((top) => top.id)).to.eql(['first']);
      expect(sets.choices()).to.eql([{ id: 'first', value: false }]);
      expect((): void => sets.check()).to.throw(RuleSetCycleError);
    });
  });

  describe('choices', (): void => {
    const tree = (): RuleSet[] => [
      new RuleSet(
        'all',
        new RuleSet('group', 'a', 'b'),
        new RuleSet('extras', { enabled: false }, 'c'),
        new RuleSet(
          'choice',
          { exclusive: true },
          'd',
          new RuleSet('other', 'e', 'f')
        )
      ),
    ];

    it('should say nothing of a tree at its defaults', (): void => {
      const { sets } = setUp();

      sets.register(...tree());

      expect(sets.choices()).to.eql([]);
    });

    it('should say a whole set in one line, and a rule alone otherwise', (): void => {
      const { sets } = setUp();

      sets.register(...tree());
      sets.set('group', false);

      expect(sets.choices()).to.eql([{ id: 'group', value: false }]);

      sets.set('a', true);

      expect(sets.choices()).to.eql([{ id: 'b', value: false }]);

      sets.set('all', true);

      // Only `extras`, which starts off, differs: the rest of `all` is as it began, and is not spoken for.
      expect(sets.choices()).to.eql([{ id: 'extras', value: true }]);

      sets.set('all', false);

      expect(sets.choices()).to.eql([{ id: 'group', value: false }]);
    });

    it('should say a choice, and what is set beneath any alternative', (): void => {
      const { sets } = setUp();

      sets.register(...tree());
      sets.set('f', false);

      expect(sets.choices()).to.eql([{ id: 'f', value: false }]);

      sets.choose('choice', 'other');
      sets.set('all', false);

      expect(sets.choices()).to.eql([
        { id: 'group', value: false },
        { id: 'choice', value: 'other' },
        { id: 'f', value: false },
      ]);
    });

    it('should restore what it said, into a registry of the same sets', (): void => {
      const { sets, ran } = setUp(),
        again = setUp();

      sets.register(...tree());
      again.sets.register(...tree());

      sets.set('group', false);
      sets.set('extras', true);
      sets.choose('choice', 'other');
      sets.set('e', false);

      expect(again.sets.restore(sets.choices())).to.eql([]);
      expect(again.ran()).to.eql(ran());
      expect(again.ran()).to.eql(['c', 'f']);
      expect(again.sets.choices()).to.eql(sets.choices());
    });

    it('should switch a rule the set has gained since with the rest of it', (): void => {
      const { sets } = setUp(),
        later = setUp();

      sets.register(new RuleSet('group', 'a', 'b'));
      sets.set('group', false);

      later.sets.register(new RuleSet('group', 'a', 'b', 'c'));
      later.sets.restore(sets.choices());

      expect(later.ran()).to.eql(['d', 'e', 'f']);
    });

    it('should hand back the choices nothing answers to, and make the rest', (): void => {
      const { sets, ran } = setUp();

      sets.register(...tree());

      expect(
        sets.restore([
          { id: 'gone', value: false },
          { id: 'choice', value: 'gone' },
          { id: 'choice', value: false },
          { id: 'group', value: false },
        ])
      ).to.eql([
        { id: 'gone', value: false },
        { id: 'choice', value: 'gone' },
        { id: 'choice', value: false },
      ]);
      expect(ran()).to.eql(['d']);
    });

    it('should start from the defaults each time, and reset to them', (): void => {
      const { sets, ran } = setUp();

      sets.register(...tree());
      sets.set('group', false);
      sets.restore([{ id: 'extras', value: true }]);

      expect(ran()).to.eql(['a', 'b', 'c', 'd']);

      sets.reset();

      expect(ran()).to.eql(['a', 'b', 'd']);
    });
  });

  describe('describe', (): void => {
    it('should give the tree a UI draws', (): void => {
      const { sets } = setUp();

      sets.register(
        new RuleSet(
          'all',
          new RuleSet('group', 'a', 'b'),
          new RuleSet(
            'choice',
            { exclusive: true },
            'c',
            new RuleSet('other', 'd')
          )
        )
      );
      sets.set('b', false);

      expect(sets.describe()).to.eql([
        {
          id: 'all',
          kind: 'set',
          state: 'mixed',
          active: true,
          switchable: true,
          members: [
            {
              id: 'group',
              kind: 'set',
              state: 'mixed',
              active: true,
              switchable: true,
              members: [
                {
                  id: 'a',
                  kind: 'rule',
                  state: 'on',
                  active: true,
                  switchable: true,
                  members: [],
                },
                {
                  id: 'b',
                  kind: 'rule',
                  state: 'off',
                  active: true,
                  switchable: true,
                  members: [],
                },
              ],
            },
            {
              id: 'choice',
              kind: 'choice',
              state: 'on',
              active: true,
              switchable: false,
              chosen: 'c',
              members: [
                {
                  id: 'c',
                  kind: 'rule',
                  state: 'on',
                  active: true,
                  switchable: true,
                  members: [],
                },
                {
                  id: 'other',
                  kind: 'set',
                  state: 'on',
                  active: false,
                  switchable: true,
                  members: [
                    {
                      id: 'd',
                      kind: 'rule',
                      state: 'on',
                      active: false,
                      switchable: true,
                      members: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]);
    });
  });
});

describe('RuleSet members and options', (): void => {
  it('should take a rule by its id, and refuse one without', (): void => {
    const set = new RuleSet('set', named('a'));

    set.add(named('b'));

    expect(set.memberIds()).to.eql(['a', 'b']);
    expect(set.has(named('a'))).to.be.true;
    expect((): RuleSet => new RuleSet('other', new Example())).to.throw(
      RuleSetError
    );
    expect((): RuleSet => set.add('c', new Example())).to.throw(RuleSetError);
    // Refused whole: `c` did not go in ahead of the rule that was refused.
    expect(set.memberIds()).to.eql(['a', 'b']);
  });

  it('should refuse what is neither a member nor the options', (): void => {
    expect(
      (): RuleSet => new RuleSet('set', { enabled: false, typo: true } as any)
    ).to.throw(RuleSetError);
    expect((): RuleSet => new RuleSet('set', new Date() as any)).to.throw(
      RuleSetError
    );
    expect((): RuleSet => new RuleSet('set', null as any)).to.throw(
      RuleSetError
    );
    expect((): RuleSet => new RuleSet('set').add(42 as any)).to.throw(
      RuleSetError
    );
  });

  it('should refuse a choice that starts off', (): void => {
    expect(
      (): RuleSet => new RuleSet('set', { exclusive: true, enabled: false })
    ).to.throw(RuleSetError);
  });
});

describe('RuleSetRegistry and what it leaves alone', (): void => {
  it('should not switch back on a rule that something else switched off', (): void => {
    const { rules, sets, ran } = setUp();

    sets.register(new RuleSet('first', 'a'), new RuleSet('second', 'b'));

    rules.getById('a')!.disable();
    sets.set('second', false);
    sets.set('second', true);

    expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f']);
  });

  it('should leave a rule registered switched off as it is, unless the sets say off', (): void => {
    const rules = new RuleRegistry(),
      sets = new RuleSetRegistry(rules),
      off = named('a');

    off.disable();
    sets.register(new RuleSet('set', 'a', 'b'));
    rules.register(off, named('b'));

    expect(rules.process(Example)).to.eql(['b']);
  });

  it('should switch a rule that registers after the choices were restored', (): void => {
    const rules = new RuleRegistry(),
      sets = new RuleSetRegistry(rules);

    sets.register(new RuleSet('set', 'a', 'b'));
    sets.restore([{ id: 'set', value: false }]);
    rules.register(named('a'), named('b'), named('c'));

    expect(rules.process(Example)).to.eql(['c']);
  });

  it('should stop switching once disposed, and give back what it switched off', (): void => {
    const { rules, sets, ran } = setUp(),
      set = new RuleSet('set', 'a');

    sets.register(set);
    sets.set('set', false);
    sets.dispose();

    expect(ran()).to.eql(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(sets.entries()).to.eql([]);

    rules.replace('a', named('a'));
    set.add('b');

    // The replacement is registered last, so it runs last; what matters is that it runs.
    expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f', 'a']);
  });

  it('should know the rules it switches', (): void => {
    const { rules, sets } = setUp();

    expect(sets.ruleRegistry()).to.equal(rules);
  });
});

describe('RuleSetRegistry kept whole', (): void => {
  it('should take in none of a registration it refuses', (): void => {
    const { sets, ran } = setUp();

    sets.register(new RuleSet('set', 'a'));

    expect((): void =>
      sets.register(
        new RuleSet('extras', { enabled: false }, 'b'),
        new RuleSet('set', 'c')
      )
    ).to.throw(DuplicateRuleSetIdError);
    expect(sets.get('extras')).to.be.null;
    expect(ran()).to.eql(['a', 'b', 'c', 'd', 'e', 'f']);

    // And two in one registration, one inside the other.
    expect((): void =>
      sets.register(
        new RuleSet('outer', new RuleSet('same', 'd')),
        new RuleSet('same', 'e')
      )
    ).to.throw(DuplicateRuleSetIdError);
    expect(sets.get('outer')).to.be.null;
  });

  it('should take a set out of the sets that held it, with the sets only it held', (): void => {
    const { sets, ran } = setUp(),
      shared = new RuleSet('shared', 'd'),
      deep = new RuleSet('deep', 'c'),
      inner = new RuleSet('inner', 'b', deep, shared),
      outer = new RuleSet('outer', 'a', inner),
      other = new RuleSet('other', shared);

    sets.register(outer, other);
    sets.set('outer', false);
    sets.unregister(inner);

    expect(sets.get('inner')).to.be.null;
    expect(sets.get('deep')).to.be.null;
    expect(sets.get('shared')).to.equal(shared);
    expect(outer.memberIds()).to.eql(['a']);
    expect(sets.state('outer')).to.equal('off');
    // `b` and `c` are in no set now; `d` still is, and is still off.
    expect(ran()).to.eql(['b', 'c', 'e', 'f']);
  });

  it('should forget a choice whose member is removed, even if it comes back', (): void => {
    const { sets, ran } = setUp(),
      choice = new RuleSet('choice', { exclusive: true }, 'a', 'b');

    sets.register(choice);
    sets.choose('choice', 'b');
    choice.remove('b');

    expect(sets.choices()).to.eql([]);

    choice.add('b');

    expect(sets.chosen('choice')).to.equal('a');
    expect(ran()).to.eql(['a', 'c', 'd', 'e', 'f']);
  });

  it('should say a set with nothing to switch is not switchable, and refuse to switch it', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet(
        'heading',
        new RuleSet('choice', { exclusive: true }, 'a', 'b')
      ),
      new RuleSet('empty')
    );

    expect(sets.describe().map((top) => [top.id, top.switchable])).to.eql([
      ['heading', false],
      ['empty', false],
    ]);
    expect((): void => sets.set('heading', false)).to.throw(RuleSetError);
    expect((): void => sets.set('empty', false)).to.throw(RuleSetError);
    expect(ran()).to.eql(['a', 'c', 'd', 'e', 'f']);
  });

  it('should start a rule off when any set that switches it starts off', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet('on', 'a', 'b'),
      new RuleSet('off', { enabled: false }, 'b', 'c')
    );

    expect(sets.state('on')).to.equal('mixed');
    expect(sets.choices()).to.eql([]);
    expect(ran()).to.eql(['a', 'd', 'e', 'f']);

    sets.set('on', true);

    expect(sets.choices()).to.eql([{ id: 'b', value: true }]);
    expect(ran()).to.eql(['a', 'b', 'd', 'e', 'f']);
  });

  it('should save and restore a choice inside a set inside a choice', (): void => {
    const tree = (): RuleSet =>
        new RuleSet(
          'top',
          { exclusive: true },
          'a',
          new RuleSet(
            'branch',
            'b',
            new RuleSet(
              'inner',
              { exclusive: true },
              'c',
              new RuleSet('pair', 'd', 'e')
            )
          )
        ),
      { sets, ran } = setUp(),
      again = setUp();

    sets.register(tree());
    again.sets.register(tree());

    sets.choose('inner', 'pair');
    sets.set('e', false);
    sets.set('branch', false);
    sets.choose('top', 'branch');

    expect(ran()).to.eql(['d', 'f']);
    expect(sets.choices()).to.eql([
      { id: 'top', value: 'branch' },
      { id: 'branch', value: false },
      { id: 'inner', value: 'pair' },
      { id: 'e', value: false },
    ]);
    expect(again.sets.restore(sets.choices())).to.eql([]);
    expect(again.ran()).to.eql(['d', 'f']);
  });

  it('should hand back a choice whose value is neither kind, and apply the rest', (): void => {
    const { sets, ran } = setUp();

    sets.register(new RuleSet('set', 'a'), new RuleSet('other', 'b'));

    expect(
      sets.restore([
        { id: 'set', value: null as any },
        { id: 'other', value: false },
      ])
    ).to.eql([{ id: 'set', value: null }]);
    expect(ran()).to.eql(['a', 'c', 'd', 'e', 'f']);
  });

  it('should refuse a set under the id of a rule, when checked', (): void => {
    const { sets } = setUp();

    sets.register(new RuleSet('a', 'b'));

    expect((): void => sets.check()).to.throw(DuplicateRuleSetIdError);
  });

  it('should adopt the rest when a set is given one under an id already taken', (): void => {
    const { sets, ran } = setUp(),
      outer = new RuleSet('outer', 'a');

    sets.register(outer, new RuleSet('taken', 'f'));

    expect(
      (): RuleSet =>
        outer.add(
          new RuleSet('extras', { enabled: false }, 'b'),
          new RuleSet('taken', 'c')
        )
    ).to.throw(DuplicateRuleSetIdError);
    // The set it could take is in, and switched; the id it could not take still means the set registered first.
    expect(sets.get('extras')).to.be.instanceof(RuleSet);
    expect(ran()).to.eql(['a', 'c', 'd', 'e', 'f']);
  });
});

describe('RuleRegistry and rules switched directly', (): void => {
  it('should run a rule switched back on after the cache was built without it', (): void => {
    const rules = new RuleRegistry(),
      rule = named('a');

    rules.register(rule, named('b'));
    rule.disable();

    expect(rules.process(Example)).to.eql(['b']);
    expect(rules.get(Example)).to.have.length(1);

    rule.enable();

    expect(rules.process(Example)).to.eql(['a', 'b']);
    expect(rules.get(Example)).to.have.length(2);
  });

  it('should answer with the same list until a rule is switched', (): void => {
    const rules = new RuleRegistry(),
      rule = named('a');

    rules.register(rule, named('b'));

    const all = rules.get(Example);

    expect(rules.get(Example)).to.equal(all);

    rule.disable();

    const fewer = rules.get(Example);

    expect(fewer).to.have.length(1);
    expect(rules.get(Example)).to.equal(fewer);

    rule.enable();

    expect(rules.get(Example)).to.equal(all);
  });

  it('should tell every listener of a rule, though one of them throws', (): void => {
    const rules = new RuleRegistry(),
      heard: (string | null)[] = [];

    rules.onRegister((): void => {
      throw new Error('first');
    });
    rules.onRegister((rule: Rule): void => {
      heard.push(rule.id());
    });

    expect((): void => rules.register(named('a'), named('b'))).to.throw(
      'first'
    );
    expect(heard).to.eql(['a', 'b']);
    expect(rules.process(Example)).to.eql(['a', 'b']);
  });

  it('should tell a listener of each rule registered, until it stops listening', (): void => {
    const rules = new RuleRegistry(),
      heard: (string | null)[] = [],
      stop = rules.onRegister((rule: Rule): void => {
        heard.push(rule.id());
      });

    rules.register(named('a'), named('b'));
    stop();
    rules.register(named('c'));

    expect(heard).to.eql(['a', 'b']);
  });
});
