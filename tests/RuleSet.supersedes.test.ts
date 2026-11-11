import {
  RuleSetConflictError,
  RuleSetCycleError,
  RuleSetNoDefaultError,
  RuleSetOptionConflictError,
  RuleSetProblem,
  RuleSetRegistry,
} from '../RuleSetRegistry';
import { RuleSet, RuleSetError } from '../RuleSet';
import Effect from '../Effect';
import Rule from '../Rule';
import { RuleRegistry } from '../RuleRegistry';
import { expect } from 'chai';

class Example extends Rule<[], string> {}

const named = (id: string): Example =>
  new Example(id, new Effect((): string => id));

// A game's rules and its sets, with rules `a` to `f` registered.
const setUp = (): {
  rules: RuleRegistry;
  sets: RuleSetRegistry;
  ran: () => string[];
} => {
  const rules = new RuleRegistry(),
    sets = new RuleSetRegistry(rules);

  rules.register(...['a', 'b', 'c', 'd', 'e', 'f'].map(named));

  return { rules, sets, ran: (): string[] => rules.process(Example) };
};

// The problems without their messages, which are for people.
const problems = (sets: RuleSetRegistry): Omit<RuleSetProblem, 'message'>[] =>
  sets.validate().map(({ kind, ids, blocking }) => ({ kind, ids, blocking }));

describe('RuleSet options', (): void => {
  it('should say what it supersedes, each once, and nothing by default', (): void => {
    const set = new RuleSet('set', { supersedes: ['a', 'b', 'a'] }, 'c');

    expect(set.supersedes()).to.eql(['a', 'b']);
    expect(set.stated()).to.eql({ supersedes: ['a', 'b'] });
    expect(new RuleSet('other').supersedes()).to.eql([]);
    expect(new RuleSet('other').stated()).to.eql({});
  });

  it('should refuse a `supersedes` that is not a list of ids, or names itself', (): void => {
    [
      { supersedes: 'a' },
      { supersedes: [1] },
      { supersedes: [''] },
      { supersedes: null },
      { supersedes: ['set'] },
    ].forEach((options) =>
      expect((): RuleSet => new RuleSet('set', options as any)).to.throw(
        RuleSetError
      )
    );
  });

  it('should take a default for a choice, and only for a choice', (): void => {
    const choice = new RuleSet(
      'choice',
      { exclusive: true, default: 'b' },
      'a',
      'b'
    );

    expect(choice.defaultMember()).to.equal('b');
    expect(choice.stated()).to.eql({ exclusive: true, default: 'b' });
    expect(new RuleSet('other', { exclusive: true }).defaultMember()).to.be
      .null;
    expect((): RuleSet => new RuleSet('set', { default: 'a' })).to.throw(
      RuleSetError
    );
    expect(
      (): RuleSet => new RuleSet('set', { exclusive: true, default: '' })
    ).to.throw(RuleSetError);
  });
});

describe('RuleSetRegistry supersedes', (): void => {
  it('should not run a rule while a set that supersedes it is in force', (): void => {
    const { sets, ran } = setUp();

    sets.register(new RuleSet('enhanced', { supersedes: ['a'] }, 'b'));

    expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f']);

    sets.set('enhanced', false);

    expect(ran()).to.eql(['a', 'c', 'd', 'e', 'f']);

    sets.set('enhanced', true);

    expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f']);
  });

  it('should switch off a superseded rule registered after the set', (): void => {
    const rules = new RuleRegistry(),
      sets = new RuleSetRegistry(rules);

    sets.register(new RuleSet('enhanced', { supersedes: ['a'] }, 'b'));
    rules.register(named('a'), named('b'), named('c'));

    expect(rules.process(Example)).to.eql(['b', 'c']);

    sets.set('enhanced', false);

    expect(rules.process(Example)).to.eql(['a', 'c']);
  });

  it('should leave a superseded rule its own setting', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet('original', 'a'),
      new RuleSet('enhanced', { supersedes: ['a'] }, 'b')
    );
    sets.set('a', false);
    sets.set('enhanced', false);

    // Off as it was set, not on because nothing supersedes it now.
    expect(ran()).to.eql(['c', 'd', 'e', 'f']);

    sets.set('a', true);

    expect(ran()).to.eql(['a', 'c', 'd', 'e', 'f']);

    sets.set('enhanced', true);

    expect(sets.state('a')).to.equal('on');
    expect(sets.state('original')).to.equal('on');
    expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f']);
    // Nothing superseded is saved: it is worked out from the sets.
    expect(sets.choices()).to.eql([]);
  });

  it('should take a set id to mean every rule beneath it, a choice included', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet(
        'original',
        'a',
        new RuleSet('pick', { exclusive: true }, 'b', 'c')
      ),
      new RuleSet('enhanced', { supersedes: ['original'] }, 'd')
    );

    expect(ran()).to.eql(['d', 'e', 'f']);

    sets.choose('pick', 'c');

    expect(ran()).to.eql(['d', 'e', 'f']);

    const [original] = sets.describe();

    expect(original).to.include({ id: 'original', active: false });
    expect(original.supersededBy).to.eql(['enhanced']);
    expect(original.members[1]).to.include({ id: 'pick', active: false });
    expect(original.members[1].supersededBy).to.eql(['enhanced']);
    expect(original.members[1].members[1]).to.include({
      id: 'c',
      active: false,
    });

    sets.set('enhanced', false);

    expect(ran()).to.eql(['a', 'c', 'e', 'f']);
  });

  it('should carry supersession through a set that is switched off', (): void => {
    const { sets, ran } = setUp();

    // `c-set` replaces `b-set`, which replaced `a`.
    sets.register(
      new RuleSet('b-set', { supersedes: ['a'] }, 'b'),
      new RuleSet('c-set', { supersedes: ['b-set'] }, 'c')
    );

    expect(ran()).to.eql(['c', 'd', 'e', 'f']);

    sets.set('b-set', false);

    expect(ran()).to.eql(['c', 'd', 'e', 'f']);

    sets.set('c-set', false);

    expect(ran()).to.eql(['a', 'd', 'e', 'f']);

    sets.set('b-set', true);

    expect(ran()).to.eql(['b', 'd', 'e', 'f']);
    expect(sets.validate()).to.eql([]);
  });

  it('should bring the original rule back when a parent set switches off the one superseding it', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet(
        'enhanced-rules',
        new RuleSet('hydro', { supersedes: ['a'] }, 'b')
      )
    );

    expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f']);

    sets.set('enhanced-rules', false);

    expect(ran()).to.eql(['a', 'c', 'd', 'e', 'f']);

    sets.set('enhanced-rules', true);

    expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f']);
  });

  it('should not be in force beneath an alternative not chosen', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet(
        'pick',
        { exclusive: true },
        'c',
        new RuleSet('enhanced', { supersedes: ['a'] }, 'b')
      )
    );

    expect(ran()).to.eql(['a', 'c', 'd', 'e', 'f']);

    sets.choose('pick', 'enhanced');

    expect(ran()).to.eql(['b', 'd', 'e', 'f']);
  });

  it('should not be in force with no rule beneath it switched on, or none at all', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet('empty', { supersedes: ['a'] }),
      new RuleSet('extras', { enabled: false, supersedes: ['b'] }, 'c')
    );

    expect(ran()).to.eql(['a', 'b', 'd', 'e', 'f']);

    sets.set('extras', true);

    expect(ran()).to.eql(['a', 'c', 'd', 'e', 'f']);
  });

  it('should let a choice supersede, while its chosen member has a rule on', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet('pick', { exclusive: true, supersedes: ['a'] }, 'b', 'c')
    );

    expect(ran()).to.eql(['b', 'd', 'e', 'f']);

    sets.set('b', false);

    expect(ran()).to.eql(['a', 'd', 'e', 'f']);

    sets.choose('pick', 'c');

    expect(ran()).to.eql(['c', 'd', 'e', 'f']);
  });

  it('should describe what a set supersedes, and what is superseded by which', (): void => {
    const { sets } = setUp();

    sets.register(
      new RuleSet('original', 'a', 'b'),
      new RuleSet('enhanced', { supersedes: ['a'] }, 'c')
    );

    expect(sets.describe()).to.eql([
      {
        id: 'original',
        kind: 'set',
        state: 'on',
        active: true,
        switchable: true,
        members: [
          {
            id: 'a',
            kind: 'rule',
            state: 'on',
            active: false,
            switchable: true,
            supersededBy: ['enhanced'],
            members: [],
          },
          {
            id: 'b',
            kind: 'rule',
            state: 'on',
            active: true,
            switchable: true,
            members: [],
          },
        ],
      },
      {
        id: 'enhanced',
        kind: 'set',
        state: 'on',
        active: true,
        switchable: true,
        supersedes: ['a'],
        members: [
          {
            id: 'c',
            kind: 'rule',
            state: 'on',
            active: true,
            switchable: true,
            members: [],
          },
        ],
      },
    ]);

    sets.set('enhanced', false);

    expect(sets.describe()[0].members[0]).to.eql({
      id: 'a',
      kind: 'rule',
      state: 'on',
      active: true,
      switchable: true,
      members: [],
    });
  });

  it('should leave the same rules running after a save is restored', (): void => {
    const tree = (): RuleSet[] => [
        new RuleSet('original', 'a', 'b'),
        new RuleSet('enhanced', { enabled: false, supersedes: ['a'] }, 'c'),
      ],
      { sets, ran } = setUp(),
      again = setUp();

    sets.register(...tree());
    again.sets.register(...tree());

    sets.set('enhanced', true);
    sets.set('b', false);

    expect(ran()).to.eql(['c', 'd', 'e', 'f']);
    expect(sets.choices()).to.eql([
      { id: 'b', value: false },
      { id: 'enhanced', value: true },
    ]);
    expect(again.sets.restore(sets.choices())).to.eql([]);
    expect(again.ran()).to.eql(ran());
    expect(again.sets.describe()).to.eql(sets.describe());
  });
});

describe('RuleSetRegistry conflicts', (): void => {
  it('should report two sets in force superseding one rule, until one is switched off', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet('first', { supersedes: ['a'] }, 'b'),
      new RuleSet('second', { supersedes: ['a'] }, 'c')
    );

    expect(problems(sets)).to.eql([
      { kind: 'conflict', ids: ['first', 'second'], blocking: true },
    ]);
    expect(sets.validate()[0].message).to.match(/'a'/);
    expect((): void => sets.check()).to.throw(RuleSetConflictError);

    sets.set('second', false);

    expect(sets.validate()).to.eql([]);
    expect((): void => sets.check()).not.to.throw();

    // Both off is fine, and the original runs.
    sets.set('first', false);

    expect(sets.validate()).to.eql([]);
    expect(ran()).to.eql(['a', 'd', 'e', 'f']);

    sets.set('second', true);
    sets.set('first', true);

    expect(problems(sets)).to.eql([
      { kind: 'conflict', ids: ['first', 'second'], blocking: true },
    ]);
  });

  it('should find a conflict through a set superseded by id', (): void => {
    const { sets } = setUp();

    sets.register(
      new RuleSet('original', 'a'),
      new RuleSet('first', { supersedes: ['original'] }, 'b'),
      new RuleSet('second', { supersedes: ['a'] }, 'c')
    );

    expect(problems(sets)).to.eql([
      { kind: 'conflict', ids: ['first', 'second'], blocking: true },
    ]);
  });

  it('should not report two sets where one supersedes the other, carried through', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet('first', { supersedes: ['a'] }, 'b'),
      new RuleSet('middle', { supersedes: ['first'] }),
      new RuleSet('second', { supersedes: ['a', 'middle'] }, 'c')
    );

    expect(sets.validate()).to.eql([]);
    expect(ran()).to.eql(['c', 'd', 'e', 'f']);
  });

  it('should not report two sets beneath different members of one choice, as only one can be in force', (): void => {
    const { sets } = setUp();

    sets.register(
      new RuleSet(
        'pick',
        { exclusive: true },
        new RuleSet('first', { supersedes: ['a'] }, 'b'),
        new RuleSet('second', { supersedes: ['a'] }, 'c')
      )
    );

    expect(sets.validate()).to.eql([]);
  });

  it('should report two sets beneath different members of one choice when one is in force another way too', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet(
        'pick',
        { exclusive: true, default: 'm2' },
        new RuleSet('m1', new RuleSet('s', { supersedes: ['a'] }, 'b')),
        new RuleSet('m2', new RuleSet('t', { supersedes: ['a'] }, 'c'))
      ),
      new RuleSet('top', 's')
    );

    expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f']);
    expect(problems(sets)).to.eql([
      { kind: 'conflict', ids: ['s', 't'], blocking: true },
    ]);
  });
});

describe('RuleSetRegistry validate', (): void => {
  it('should report an unknown superseded id without blocking, and switch it if it arrives', (): void => {
    const { rules, sets, ran } = setUp();

    sets.register(new RuleSet('set', { supersedes: ['later'] }, 'a'));

    expect(problems(sets)).to.eql([
      { kind: 'unknown-superseded', ids: ['set', 'later'], blocking: false },
    ]);
    expect((): void => sets.check()).not.to.throw();

    rules.register(named('later'));

    expect(sets.validate()).to.eql([]);
    expect(ran()).to.eql(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('should report sets that supersede each other as a cycle, and not hang', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet('x', { supersedes: ['y'] }, 'a'),
      new RuleSet('y', { supersedes: ['x'] }, 'b')
    );

    expect(ran()).to.eql(['c', 'd', 'e', 'f']);
    expect(problems(sets)).to.eql([
      { kind: 'cycle', ids: ['x', 'y'], blocking: true },
    ]);
    expect((): void => sets.check()).to.throw(RuleSetCycleError);
  });

  it('should report a set that supersedes a set holding it as a cycle', (): void => {
    const { sets } = setUp();

    sets.register(
      new RuleSet(
        'outer',
        new RuleSet('inner', { supersedes: ['outer'] }, 'a'),
        'b'
      )
    );

    expect(problems(sets)).to.eql([
      { kind: 'cycle', ids: ['inner', 'outer'], blocking: true },
    ]);
    expect(sets.validate()[0].message).to.match(/which holds 'inner'/);
  });

  it('should say which kinds block, and throw only for those', (): void => {
    const { sets } = setUp();

    sets.register(
      new RuleSet('set', 'typo', { supersedes: ['gone'] }),
      new RuleSet('a', 'b')
    );

    expect(problems(sets)).to.eql([
      { kind: 'duplicate-id', ids: ['a'], blocking: true },
      { kind: 'unknown-member', ids: ['set', 'typo'], blocking: false },
      { kind: 'unknown-superseded', ids: ['set', 'gone'], blocking: false },
    ]);
  });
});

describe('RuleSetRegistry declarations', (): void => {
  it('should take the members of every declaration, in the order they arrived', (): void => {
    const { sets, ran } = setUp(),
      first = new RuleSet('set', { enabled: false }, 'a', 'b'),
      second = new RuleSet('set', 'b', 'c');

    sets.register(first);
    sets.register(second);

    expect(sets.get('set')!.memberIds()).to.eql(['a', 'b', 'c']);
    expect(sets.declarations('set')).to.eql([first, second]);
    // The second states nothing about `enabled`, so the first stands, and nothing disagrees.
    expect(ran()).to.eql(['d', 'e', 'f']);
    expect(sets.validate()).to.eql([]);
    // The same set each time, until the set changes.
    expect(sets.get('set')).to.equal(sets.get('set'));
    expect(sets.entries().map((set) => set.id())).to.eql(['set']);
    expect(sets.roots().map((set) => set.id())).to.eql(['set']);
    expect(first.memberIds()).to.eql(['a', 'b']);
  });

  it('should report an option two declarations state differently, until one is taken out', (): void => {
    const { sets, ran } = setUp(),
      first = new RuleSet('set', { enabled: false }, 'a'),
      second = new RuleSet('set', { enabled: true }, 'b');

    sets.register(first, second);

    expect(problems(sets)).to.eql([
      { kind: 'option-conflict', ids: ['set'], blocking: true },
    ]);
    expect((): void => sets.check()).to.throw(RuleSetOptionConflictError);
    // The first stated stands.
    expect(ran()).to.eql(['c', 'd', 'e', 'f']);

    sets.unregister(first);

    expect(sets.validate()).to.eql([]);
    expect(sets.declarations('set')).to.eql([second]);
    expect(sets.get('set')).to.equal(second);
    expect(ran()).to.eql(['a', 'b', 'c', 'd', 'e', 'f']);

    sets.unregister(second);

    expect(sets.get('set')).to.be.null;
  });

  it('should report a choice in one declaration that starts off in another', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet('set', { exclusive: true }, 'a', 'b'),
      new RuleSet('set', { exclusive: false }, 'c'),
      new RuleSet('set', { enabled: false })
    );

    // `exclusive` disagreed on; a choice that starts off; and members from two declarations with no default.
    expect(problems(sets)).to.eql([
      { kind: 'option-conflict', ids: ['set'], blocking: true },
      { kind: 'option-conflict', ids: ['set'], blocking: true },
      { kind: 'no-default', ids: ['set'], blocking: true },
    ]);
    // A choice, as the first said.
    expect(ran()).to.eql(['a', 'd', 'e', 'f']);
  });

  it('should start a choice on its default', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet('pick', { exclusive: true, default: 'b' }, 'a', 'b')
    );

    expect(sets.chosen('pick')).to.equal('b');
    expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f']);
    expect(sets.choices()).to.eql([]);

    sets.choose('pick', 'a');

    expect(sets.choices()).to.eql([{ id: 'pick', value: 'a' }]);
  });

  it('should report a choice whose default would depend on load order, and two defaults', (): void => {
    const { sets } = setUp();

    sets.register(
      new RuleSet('pick', { exclusive: true }, 'a', 'b'),
      new RuleSet('pick', 'c')
    );

    expect(problems(sets)).to.eql([
      { kind: 'no-default', ids: ['pick'], blocking: true },
    ]);
    expect((): void => sets.check()).to.throw(RuleSetNoDefaultError);

    sets.register(new RuleSet('pick', { exclusive: true, default: 'c' }));

    expect(sets.validate()).to.eql([]);
    expect(sets.chosen('pick')).to.equal('c');

    sets.register(new RuleSet('pick', { exclusive: true, default: 'a' }));

    expect(problems(sets)).to.eql([
      { kind: 'option-conflict', ids: ['pick'], blocking: true },
    ]);
    expect(sets.chosen('pick')).to.equal('c');
  });

  it('should report a default that is none of the members, without blocking', (): void => {
    const { sets } = setUp();

    sets.register(
      new RuleSet('pick', { exclusive: true, default: 'z' }, 'a', 'b')
    );

    expect(problems(sets)).to.eql([
      { kind: 'unknown-member', ids: ['pick', 'z'], blocking: false },
    ]);
    expect(sets.chosen('pick')).to.equal('a');
  });

  it('should keep a set one declaration was given while another still names it', (): void => {
    const { sets, ran } = setUp(),
      first = new RuleSet('outer', new RuleSet('inner', 'a')),
      second = new RuleSet('outer', 'inner', 'b');

    sets.register(first, second);
    sets.unregister(first);

    expect(sets.get('inner')).to.be.instanceof(RuleSet);
    expect(sets.get('outer')!.memberIds()).to.eql(['inner', 'b']);

    sets.set('outer', false);

    expect(ran()).to.eql(['c', 'd', 'e', 'f']);
  });

  it('should take what every declaration supersedes', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet('set', { supersedes: ['a'] }, 'c'),
      new RuleSet('set', { supersedes: ['b'] })
    );

    expect(ran()).to.eql(['c', 'd', 'e', 'f']);
    expect(sets.describe()[0].supersedes).to.eql(['a', 'b']);
    expect(sets.get('set')!.supersedes()).to.eql(['a', 'b']);
  });

  it('should restore a save into a merged set', (): void => {
    const tree = (): RuleSet[] => [
        new RuleSet('set', 'a', 'b'),
        new RuleSet(
          'set',
          new RuleSet('pick', { exclusive: true, default: 'c' }, 'c', 'd')
        ),
      ],
      { sets, ran } = setUp(),
      again = setUp();

    sets.register(...tree());
    again.sets.register(...tree());

    sets.set('set', false);
    sets.choose('pick', 'd');

    expect(ran()).to.eql(['d', 'e', 'f']);
    expect(sets.choices()).to.eql([
      { id: 'set', value: false },
      { id: 'pick', value: 'd' },
    ]);
    expect(again.sets.restore(sets.choices())).to.eql([]);
    expect(again.ran()).to.eql(['d', 'e', 'f']);
  });

  it('should make `extend` a declaration of its own', (): void => {
    const { sets, ran } = setUp(),
      set = new RuleSet('set', 'a');

    sets.register(set);
    sets.extend('set', 'b');
    sets.extend('set', 'c');

    expect(sets.declarations('set')).to.have.length(2);
    expect(set.memberIds()).to.eql(['a']);
    expect(sets.get('set')!.memberIds()).to.eql(['a', 'b', 'c']);

    sets.set('set', false);

    expect(ran()).to.eql(['d', 'e', 'f']);
  });
});

describe('RuleSetRegistry supersedes, at the edges', (): void => {
  it('should not let a replacement that is not registered take the place of anything, until it arrives', (): void => {
    const { rules, sets, ran } = setUp();

    sets.register(new RuleSet('enhanced', { supersedes: ['a'] }, 'g'));

    expect(ran()).to.eql(['a', 'b', 'c', 'd', 'e', 'f']);

    rules.register(named('g'));

    expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('should not report a conflict over an id nothing registered, until it arrives', (): void => {
    const { rules, sets, ran } = setUp();

    sets.register(
      new RuleSet('first', { supersedes: ['gone'] }, 'b'),
      new RuleSet('second', { supersedes: ['gone'] }, 'c')
    );

    expect(problems(sets)).to.eql([
      { kind: 'unknown-superseded', ids: ['first', 'gone'], blocking: false },
      { kind: 'unknown-superseded', ids: ['second', 'gone'], blocking: false },
    ]);

    rules.register(named('gone'));

    expect(problems(sets)).to.eql([
      { kind: 'conflict', ids: ['first', 'second'], blocking: true },
    ]);
    expect(ran()).to.not.include('gone');
  });

  it('should never supersede what is beneath the set itself', (): void => {
    const { sets, ran } = setUp();

    // The whole of `original` replaced, except `b`, which `enhanced` keeps by holding it; and a child set of its own.
    sets.register(
      new RuleSet('original', 'a', 'b'),
      new RuleSet(
        'enhanced',
        { supersedes: ['original', 'kid'] },
        'b',
        new RuleSet('kid', 'c')
      )
    );

    expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f']);
    expect(sets.validate()).to.eql([]);

    // Another set in force still supersedes what is beneath it.
    sets.register(new RuleSet('other', { supersedes: ['b'] }, 'd'));

    expect(ran()).to.eql(['c', 'd', 'e', 'f']);
    expect(sets.validate()).to.eql([]);
  });

  it('should report two sets superseding one rule only while something of both runs', (): void => {
    const { sets, ran } = setUp();

    sets.register(
      new RuleSet('s', { supersedes: ['a'] }, 'b'),
      new RuleSet('t', { supersedes: ['a'] }, 'c'),
      new RuleSet('over', { supersedes: ['s', 't'] }, 'd')
    );

    expect(ran()).to.eql(['d', 'e', 'f']);
    expect(sets.validate()).to.eql([]);

    sets.set('over', false);

    expect(problems(sets)).to.eql([
      { kind: 'conflict', ids: ['s', 't'], blocking: true },
    ]);
  });

  it('should not report two sets where either one supersedes the other, whichever is registered first', (): void => {
    // `d` is beneath both, so the superseding set never supersedes it, and something of each still runs.
    const superseding = (): RuleSet =>
        new RuleSet('over', { supersedes: ['a', 'under'] }, 'b', 'd'),
      superseded = (): RuleSet =>
        new RuleSet('under', { supersedes: ['a'] }, 'c', 'd'),
      first = setUp(),
      second = setUp();

    first.sets.register(superseding(), superseded());
    second.sets.register(superseded(), superseding());

    expect(first.ran()).to.eql(['b', 'd', 'e', 'f']);
    expect(first.sets.validate()).to.eql([]);
    expect(second.ran()).to.eql(['b', 'd', 'e', 'f']);
    expect(second.sets.validate()).to.eql([]);
  });

  it('should walk a chain of sets superseding one another in time that grows with it, not with its square', (): void => {
    const members = RuleSet.prototype.members,
      walked = (length: number): number => {
        const rules = new RuleRegistry(),
          sets = new RuleSetRegistry(rules);

        sets.register(
          ...Array.from(
            { length },
            (_, index): RuleSet =>
              new RuleSet(
                `link-${index}`,
                index + 1 < length ? { supersedes: [`link-${index + 1}`] } : {},
                `rule-${index}`
              )
          )
        );

        let count = 0;

        RuleSet.prototype.members = function (this: RuleSet): any {
          count++;

          return members.call(this);
        };

        try {
          sets.set('link-0', true);
          sets.validate();
        } finally {
          RuleSet.prototype.members = members;
        }

        sets.dispose();

        return count;
      };

    // Four times the links, about four times the walking; walked again for each link, it is nine or ten times.
    expect(walked(120)).to.be.below(walked(30) * 5);
  });
});

describe('RuleSetRegistry declarations, at the edges', (): void => {
  it('should report a choice two calls to `extend` add to, and not count a declaration with no members', (): void => {
    const extended = setUp(),
      empty = setUp();

    extended.sets.register(new RuleSet('pick', { exclusive: true }));
    extended.sets.extend('pick', 'a');
    extended.sets.extend('pick', 'b');

    expect(problems(extended.sets)).to.eql([
      { kind: 'no-default', ids: ['pick'], blocking: true },
    ]);

    empty.sets.register(
      new RuleSet('pick', { exclusive: true }, 'a', 'b'),
      new RuleSet('pick')
    );
    empty.sets.extend('pick');

    expect(empty.sets.validate()).to.eql([]);
  });

  it('should give one merged set until it changes, and refuse to be changed through it', (): void => {
    const { sets } = setUp(),
      first = new RuleSet('set', 'a'),
      merged = (): RuleSet => sets.get('set')!;

    sets.register(first, new RuleSet('set', 'b'));

    const view = merged();

    expect(merged()).to.equal(view);
    expect(sets.entries()).to.eql([view]);
    expect(sets.entries()[0]).to.equal(view);
    expect(sets.roots()[0]).to.equal(view);
    expect((): RuleSet => view.add('c')).to.throw(RuleSetError);
    expect((): RuleSet => view.remove('a')).to.throw(RuleSetError);
    expect(view.memberIds()).to.eql(['a', 'b']);

    first.add('d');

    expect(merged()).to.not.equal(view);
    expect(merged().memberIds()).to.eql(['a', 'd', 'b']);

    const next = merged();

    sets.extend('set', 'c');

    expect(merged()).to.not.equal(next);
    expect(merged().memberIds()).to.eql(['a', 'd', 'b', 'c']);
  });

  it('should take out a set a declaration brought when another declaration of its id remains', (): void => {
    const { sets, ran } = setUp(),
      first = new RuleSet('first', new RuleSet('kid', 'a')),
      second = new RuleSet('second', new RuleSet('kid', 'b'));

    sets.register(first, second);
    sets.unregister(first);

    expect(sets.declarations('kid')).to.have.length(1);
    expect(sets.get('kid')!.memberIds()).to.eql(['b']);

    sets.set('second', false);

    expect(ran()).to.eql(['a', 'c', 'd', 'e', 'f']);
  });
});

describe('RuleSetRegistry conflicts within one subtree', (): void => {
  it('should not report a set and one beneath it superseding one rule, but should two siblings', (): void => {
    const nested = setUp(),
      siblings = setUp();

    nested.sets.register(
      new RuleSet(
        'parent',
        { supersedes: ['a'] },
        'b',
        new RuleSet('middle', new RuleSet('child', { supersedes: ['a'] }, 'c'))
      )
    );

    expect(nested.ran()).to.eql(['b', 'c', 'd', 'e', 'f']);
    expect(nested.sets.validate()).to.eql([]);

    siblings.sets.register(
      new RuleSet(
        'parent',
        new RuleSet('first', { supersedes: ['a'] }, 'b'),
        new RuleSet('second', { supersedes: ['a'] }, 'c')
      )
    );

    expect(problems(siblings.sets)).to.eql([
      { kind: 'conflict', ids: ['first', 'second'], blocking: true },
    ]);
  });
});
