import {
  RuleSetConflictError,
  RuleSetCycleError,
  RuleSetDescription,
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

// What `describe()` says agrees with what runs: a rule in some set runs exactly when it is registered, switched on, and
//  has at least one active node.
const consistent = (sets: RuleSetRegistry): void => {
  const nodes = new Map<string, RuleSetDescription[]>(),
    walk = (node: RuleSetDescription): void => {
      if (node.kind === 'rule') {
        nodes.set(node.id, [...(nodes.get(node.id) ?? []), node]);
      }

      node.members.forEach(walk);
    };

  sets.describe().forEach(walk);

  nodes.forEach((found, id) => {
    const rule = sets.ruleRegistry().getById(id);

    if (rule === null) {
      return;
    }

    expect(rule.enabled(), id).to.equal(
      found[0].state === 'on' && found.some((node) => node.active)
    );
  });
};

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

    consistent(sets);

    sets.choose('pick', 'c');

    expect(ran()).to.eql(['d', 'e', 'f']);

    consistent(sets);

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

    consistent(sets);
  });

  it('should carry supersession through a set that is switched off', (): void => {
    const { sets, ran } = setUp();

    // `c-set` replaces `b-set`, which replaced `a`.
    sets.register(
      new RuleSet('b-set', { supersedes: ['a'] }, 'b'),
      new RuleSet('c-set', { supersedes: ['b-set'] }, 'c')
    );

    expect(ran()).to.eql(['c', 'd', 'e', 'f']);

    consistent(sets);

    sets.set('b-set', false);

    expect(ran()).to.eql(['c', 'd', 'e', 'f']);

    consistent(sets);

    sets.set('c-set', false);

    expect(ran()).to.eql(['a', 'd', 'e', 'f']);

    consistent(sets);

    sets.set('b-set', true);

    expect(ran()).to.eql(['b', 'd', 'e', 'f']);

    consistent(sets);
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

    consistent(sets);

    sets.choose('pick', 'enhanced');

    expect(ran()).to.eql(['b', 'd', 'e', 'f']);

    consistent(sets);
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

    consistent(sets);
    expect(sets.validate()).to.eql([]);

    // Another set in force still supersedes what is beneath it.
    sets.register(new RuleSet('other', { supersedes: ['b'] }, 'd'));

    expect(ran()).to.eql(['c', 'd', 'e', 'f']);

    consistent(sets);
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

describe('RuleSetRegistry supersedes, through live paths', (): void => {
  it('should exempt from its own superseding only what a set holds through the chosen member', (): void => {
    const rules = new RuleRegistry(),
      sets = new RuleSetRegistry(rules),
      ran = (): string[] => rules.process(Example);

    rules.register(...['a', 'b', 'c', 'new'].map(named));
    sets.register(
      new RuleSet('orig', 'a', 'b'),
      new RuleSet(
        'enhanced',
        { supersedes: ['orig'] },
        'new',
        new RuleSet('pick', { exclusive: true, default: 'c' }, 'c', 'b')
      )
    );

    // `c` chosen over `b`: `b` is superseded with the rest of `orig`.
    expect(ran()).to.eql(['c', 'new']);
    consistent(sets);

    const pick = sets.describe()[1].members[1];

    expect(pick.members[1]).to.include({ id: 'b', active: false });
    expect(pick.members[1].supersededBy).to.eql(['enhanced']);

    sets.choose('pick', 'b');

    expect(ran()).to.eql(['b', 'new']);
    consistent(sets);
    expect(sets.describe()[1].members[1].members[1]).to.eql({
      id: 'b',
      kind: 'rule',
      state: 'on',
      active: true,
      switchable: true,
      members: [],
    });
  });

  it('should not mark a set it holds itself as superseded, though another set it supersedes holds it too', (): void => {
    const { sets, ran } = setUp(),
      shared = new RuleSet('shared', 'c');

    sets.register(
      new RuleSet('other', 'a', shared),
      new RuleSet('enhanced', { supersedes: ['other'] }, 'b', shared)
    );

    expect(ran()).to.eql(['b', 'c', 'd', 'e', 'f']);
    consistent(sets);

    const held = sets.describe()[1].members[1];

    expect(held).to.include({ id: 'shared', active: true });
    expect(held.supersededBy).to.be.undefined;
  });
});

describe('RuleSetRegistry conflicts, and how they are worded', (): void => {
  it('should name both sets and the rule, and leave the remedy to the host', (): void => {
    const { sets } = setUp();

    sets.register(
      new RuleSet('plain', { supersedes: ['a'] }, 'b'),
      new RuleSet('pick', { exclusive: true, supersedes: ['a'] }, 'c', 'd')
    );

    expect(problems(sets)).to.eql([
      { kind: 'conflict', ids: ['plain', 'pick'], blocking: true },
    ]);
    expect(sets.validate()[0].message).to.equal(
      "Rule sets 'plain' and 'pick' both replace 'a', and only one of them " +
        'can be in force.'
    );
  });

  it('should word a conflict the same way when neither set has a switch', (): void => {
    const { sets } = setUp();

    sets.register(
      new RuleSet('pick', { exclusive: true, supersedes: ['a'] }, 'b', 'c'),
      new RuleSet(
        'heading',
        { supersedes: ['a'] },
        new RuleSet('inner', { exclusive: true }, 'd')
      )
    );

    expect(problems(sets)).to.eql([
      { kind: 'conflict', ids: ['pick', 'heading'], blocking: true },
    ]);
    expect(sets.validate()[0].message).to.equal(
      "Rule sets 'pick' and 'heading' both replace 'a', and only one of " +
        'them can be in force.'
    );
  });
});

describe('RuleSetRegistry and rules arriving late', (): void => {
  it('should take time that grows with the rules arriving beneath a superseding set, not with its square', (): void => {
    const asked = (length: number): number => {
      const rules = new RuleRegistry(),
        sets = new RuleSetRegistry(rules),
        ids = Array.from({ length }, (_, index): string => `rule-${index}`),
        getById = rules.getById.bind(rules);

      sets.register(
        new RuleSet(
          'parent',
          new RuleSet('enhanced', { supersedes: ['old'] }, ...ids),
          new RuleSet('pick', { exclusive: true }, 'chosen', 'other')
        )
      );

      let count = 0;

      rules.getById = (id: string): Rule | null => {
        count++;

        return getById(id);
      };

      rules.register(...ids.map(named));
      sets.dispose();

      return count;
    };

    // Four times the rules, about four times the asking; worked out again for each rule, it is sixteen times.
    expect(asked(400)).to.be.below(asked(100) * 5);
  });

  it('should still bring a superseding set into force when its first rule arrives, and not again', (): void => {
    const rules = new RuleRegistry(),
      sets = new RuleSetRegistry(rules);

    sets.register(new RuleSet('enhanced', { supersedes: ['old'] }, 'x', 'y'));
    rules.register(named('old'));

    expect(rules.process(Example)).to.eql(['old']);

    rules.register(named('x'));

    expect(rules.process(Example)).to.eql(['x']);

    rules.register(named('y'));

    expect(rules.process(Example)).to.eql(['x', 'y']);
    consistent(sets);
  });
});

describe('RuleSetRegistry declarations, kept apart from the merged set', (): void => {
  it('should refuse to register or unregister a merged set', (): void => {
    const { sets } = setUp();

    sets.register(new RuleSet('set', { enabled: false }, 'a'));
    sets.extend('set', 'b');

    const view = sets.get('set')!;

    expect((): void => sets.unregister(view)).to.throw(RuleSetError);
    expect((): void => sets.register(view)).to.throw(RuleSetError);
    expect((): void => sets.register(new RuleSet('outer', view))).to.throw(
      RuleSetError
    );
    expect(sets.declarations('set')).to.have.length(2);
    expect(sets.get('outer')).to.be.null;
  });

  it('should not count an `extend` whose members have since been taken out', (): void => {
    const { sets } = setUp();

    sets.register(new RuleSet('pick', { exclusive: true }, 'a', 'b'));
    sets.extend('pick', 'c');

    expect(problems(sets)).to.eql([
      { kind: 'no-default', ids: ['pick'], blocking: true },
    ]);

    sets.declarations('pick')[1].remove('c');

    expect(sets.validate()).to.eql([]);
  });

  it('should count `extend` once for each call, and its declaration not again', (): void => {
    const { sets } = setUp();

    sets.register(new RuleSet('pick', { exclusive: true }));
    sets.extend('pick', 'a', 'b');

    expect(sets.validate()).to.eql([]);
  });

  it('should not take a default that is none of the members as stated, where load order would decide', (): void => {
    const { sets } = setUp();

    sets.register(
      new RuleSet('pick', { exclusive: true }, 'a', 'b'),
      new RuleSet('pick', { exclusive: true, default: 'z' }, 'c')
    );

    expect(problems(sets)).to.eql([
      { kind: 'unknown-member', ids: ['pick', 'z'], blocking: false },
      { kind: 'no-default', ids: ['pick'], blocking: true },
    ]);
  });

  it('should forget a choice of a member that went with a declaration taken out', (): void => {
    const { sets } = setUp(),
      later = new RuleSet('pick', 'c');

    sets.register(
      new RuleSet('pick', { exclusive: true, default: 'a' }, 'a', 'b'),
      later
    );
    sets.choose('pick', 'c');
    sets.unregister(later);

    expect(sets.chosen('pick')).to.equal('a');

    sets.register(later);

    // Back, but not chosen again by surprise.
    expect(sets.chosen('pick')).to.equal('a');
  });
});

describe('RuleSetRegistry superseding what a set holds itself', (): void => {
  it('should carry nothing through a child it holds, or a rule', (): void => {
    const { sets, ran } = setUp();

    // `kid` is switched off, so it is not in force itself; superseding it from `parent` does nothing at all.
    sets.register(
      new RuleSet(
        'parent',
        { supersedes: ['kid', 'b'] },
        'b',
        new RuleSet('kid', { enabled: false, supersedes: ['a'] }, 'c')
      )
    );

    expect(ran()).to.eql(['a', 'b', 'd', 'e', 'f']);
    consistent(sets);
  });

  it('should carry nothing through a set it holds that is beneath one it supersedes', (): void => {
    const { sets, ran } = setUp(),
      kid = new RuleSet('kid', { enabled: false, supersedes: ['a'] }, 'c');

    sets.register(
      new RuleSet('other', 'd', kid),
      new RuleSet('parent', { supersedes: ['other'] }, 'b', kid)
    );

    // `d` is superseded with `other`; `kid` is `parent`'s own, so its superseding is not carried through to `a`.
    expect(ran()).to.eql(['a', 'b', 'e', 'f']);
    consistent(sets);
  });
});

describe('RuleSetRegistry validating long chains', (): void => {
  const chain = (
    length: number,
    options: (index: number) => {}
  ): RuleSetRegistry => {
    const sets = new RuleSetRegistry(new RuleRegistry());

    sets.register(
      ...Array.from(
        { length },
        (_, index): RuleSet =>
          new RuleSet(`link-${index}`, options(index), `rule-${index}`)
      )
    );

    return sets;
  };

  it('should follow each set superseding another once a validation', (): void => {
    const supersedes = RuleSet.prototype.supersedes,
      followed = (length: number): number => {
        // None of the rules is registered, so none of the sets is in force: what is counted is the search for cycles.
        const sets = chain(length, (index) =>
          index + 1 < length ? { supersedes: [`link-${index + 1}`] } : {}
        );

        let count = 0;

        RuleSet.prototype.supersedes = function (this: RuleSet): string[] {
          count++;

          return supersedes.call(this);
        };

        try {
          sets.validate();
        } finally {
          RuleSet.prototype.supersedes = supersedes;
        }

        sets.dispose();

        return count;
      };

    // Four times the links, about four times the following; searched from every set, it is sixteen times.
    expect(followed(120)).to.be.below(followed(30) * 5);
  });

  it('should walk each set inside another once a validation, however many paths reach it', (): void => {
    const members = RuleSet.prototype.members,
      walked = (depth: number): number => {
        const sets = new RuleSetRegistry(new RuleRegistry());

        // Each level holds two sets, each of which holds the next level: 2^depth paths to the bottom.
        let below: string[] = ['bottom'];

        sets.register(new RuleSet('bottom', 'rule'));

        for (let level = depth; level > 0; level--) {
          const pair = [`left-${level}`, `right-${level}`];

          sets.register(...pair.map((id) => new RuleSet(id, ...below)));
          below = pair;
        }

        let count = 0;

        RuleSet.prototype.members = function (this: RuleSet): any {
          count++;

          return members.call(this);
        };

        try {
          sets.validate();
        } finally {
          RuleSet.prototype.members = members;
        }

        sets.dispose();

        return count;
      };

    // Twice the depth, about twice the walking; following every path, it is hundreds of times.
    expect(walked(16)).to.be.below(walked(8) * 4);
  });

  it('should not copy what supersedes each rule each time it adds to it', (): void => {
    const iterator = Array.prototype[Symbol.iterator],
      copied = (length: number): number => {
        const sets = chain(length, (index) =>
          index + 1 < length ? { supersedes: [`link-${index + 1}`] } : {}
        );

        sets
          .ruleRegistry()
          .register(
            ...Array.from({ length }, (_, index) => named(`rule-${index}`))
          );

        let count = 0;

        Array.prototype[Symbol.iterator] = function (this: unknown[]): any {
          const inner = iterator.call(this);

          return {
            next: (): IteratorResult<unknown> => {
              count++;

              return inner.next();
            },
            [Symbol.iterator]() {
              return this;
            },
          };
        };

        try {
          sets.set('link-0', true);
        } finally {
          Array.prototype[Symbol.iterator] = iterator;
        }

        sets.dispose();

        return count;
      };

    // Every set in force supersedes all those after it, so the work grows with the square of the links: four times
    //  the links, sixteen times the work. Copying each list as it grows makes it the cube, sixty-four times.
    expect(copied(120)).to.be.below(copied(30) * 25);
  });
});

describe('RuleSetRegistry superseding through what a set names', (): void => {
  it('should carry nothing through anything beneath a set it names and holds itself', (): void => {
    const rules = new RuleRegistry(),
      sets = new RuleSetRegistry(rules);

    rules.register(...['c', 'd', 'e', 'n'].map(named));
    sets.register(
      new RuleSet(
        'S',
        { supersedes: ['X'] },
        'n',
        new RuleSet(
          'X',
          { exclusive: true },
          'c',
          new RuleSet('Z', { supersedes: ['e'] }, 'd')
        )
      )
    );

    // `Z` is an alternative not chosen, so not in force: nothing replaces `e`, and `S` naming `X` does nothing.
    expect(rules.process(Example)).to.eql(['c', 'e', 'n']);
    expect(sets.validate()).to.eql([]);
    consistent(sets);
  });

  it('should supersede, and carry through, a set it holds only as an alternative not chosen, when it names another that holds it', (): void => {
    const rules = new RuleRegistry(),
      sets = new RuleSetRegistry(rules),
      z = new RuleSet('Z', { supersedes: ['e'] }, 'd');

    rules.register(...['c', 'd', 'e', 'n', 't'].map(named));
    sets.register(
      new RuleSet('T', 't', z),
      new RuleSet(
        'S',
        { supersedes: ['T'] },
        'n',
        new RuleSet('X', { exclusive: true }, 'c', z)
      )
    );

    expect(rules.process(Example)).to.eql(['c', 'n']);
    consistent(sets);

    const find = (
      nodes: RuleSetDescription[],
      id: string
    ): RuleSetDescription | undefined =>
      nodes
        .map((node) => (node.id === id ? node : find(node.members, id)))
        .find((node) => node !== undefined);

    expect(find(sets.describe(), 'Z')!.supersededBy).to.eql(['S']);
  });
});

describe('RuleSetRegistry describing what runs beneath a superseded set', (): void => {
  it('should leave a rule beneath a superseded set active where nothing supersedes the rule itself', (): void => {
    const rules = new RuleRegistry(),
      sets = new RuleSetRegistry(rules);

    rules.register(named('r'), named('x'));
    sets.register(
      new RuleSet('A', { supersedes: ['B'] }, 'C'),
      new RuleSet('B', { supersedes: ['C'] }, 'r'),
      new RuleSet('C', 'r', 'x')
    );

    // `A` supersedes `B` (and holds `C`, so carries nothing through to it); `B` is in force by its settings, and
    //  supersedes `C` except its own `r`. So `x` is off, and `r` runs, though both sets it is in are superseded.
    expect(rules.process(Example)).to.eql(['r']);
    consistent(sets);

    const [a] = sets.describe(),
      b = sets.describe()[1];

    expect(a.members[0].members[0]).to.include({ id: 'r', active: true });
    expect(b).to.include({ id: 'B', active: false });
    expect(b.supersededBy).to.eql(['A']);
    expect(b.members[0]).to.include({ id: 'r', active: true });
  });
});

describe('RuleSetRegistry and late rules beneath a set not in force', (): void => {
  const asked = (
    holder: (ids: string[]) => RuleSet,
    length: number
  ): number => {
    const rules = new RuleRegistry(),
      sets = new RuleSetRegistry(rules),
      ids = Array.from({ length }, (_, index): string => `rule-${index}`),
      getById = rules.getById.bind(rules);

    sets.register(holder(ids));

    let count = 0;

    rules.getById = (id: string): Rule | null => {
      count++;

      return getById(id);
    };

    rules.register(...ids.map(named));
    sets.dispose();

    return count;
  };

  it('should not work everything out again for each rule of a superseding set that starts off', (): void => {
    const holder = (ids: string[]): RuleSet =>
      new RuleSet('enhanced', { enabled: false, supersedes: ['old'] }, ...ids);

    expect(asked(holder, 400)).to.be.below(asked(holder, 100) * 5);
  });

  it('should not work everything out again for each rule of a superseding set beneath an alternative not chosen', (): void => {
    const holder = (ids: string[]): RuleSet =>
      new RuleSet(
        'pick',
        { exclusive: true },
        'plain',
        new RuleSet('enhanced', { supersedes: ['old'] }, ...ids)
      );

    expect(asked(holder, 400)).to.be.below(asked(holder, 100) * 5);
  });

  it('should still bring a set into force when it is switched on after its rules arrived', (): void => {
    const rules = new RuleRegistry(),
      sets = new RuleSetRegistry(rules);

    sets.register(
      new RuleSet('enhanced', { enabled: false, supersedes: ['old'] }, 'x')
    );
    rules.register(named('old'), named('x'));

    expect(rules.process(Example)).to.eql(['old']);

    sets.set('enhanced', true);

    expect(rules.process(Example)).to.eql(['x']);
  });
});
