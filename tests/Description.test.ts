import Criterion from '../Criterion';
import Description from '../Description';
import Effect from '../Effect';
import { High } from '../Priorities';
import Rule from '../Rule';
import { expect } from 'chai';

describe('Description', () => {
  class Library {}
  class Research {}

  it('is read from the rule it is given to, in order, and changes nothing else about the rule', () => {
    const rule = new Rule<[number], number>(
      'test:library',
      new High(),
      new Criterion((n: number): boolean => n > 0),
      new Effect((n: number): number => Math.floor(n / 2)),
      new Description({
        type: 'yield_percent',
        subject: Library,
        yield: Research,
        value: 0.5,
        of: 'base',
      }),
      new Description({ type: 'upkeep', subject: Library, value: 1 })
    );

    expect(rule.descriptions()).to.deep.equal([
      {
        type: 'yield_percent',
        subject: Library,
        yield: Research,
        value: 0.5,
        of: 'base',
      },
      { type: 'upkeep', subject: Library, value: 1 },
    ]);
    expect(rule.id()).to.equal('test:library');
    expect(rule.priority()).to.instanceOf(High);
    expect(rule.validate(4)).to.true;
    expect(rule.validate(0)).to.false;
    expect(rule.process(5)).to.equal(2);
  });

  it('is none for a rule that says nothing about itself, and is still read once the rule is disabled', () => {
    const silent = new Rule(new Effect(() => 1)),
      described = new Rule(new Description({ type: 'content', value: 1 }));

    described.disable();

    expect(silent.descriptions()).to.deep.equal([]);
    expect(described.descriptions()).to.deep.equal([
      { type: 'content', value: 1 },
    ]);
    expect(described.enabled()).to.false;
  });

  it("can't be changed through what it gives out, or by the object it was given", () => {
    const given = { type: 'content', value: 1 },
      rule = new Rule(new Description(given));

    given.value = 2;
    rule.descriptions().pop();
    expect(() => {
      (rule.descriptions()[0] as { value: number }).value = 3;
    }).to.throw(TypeError);
    expect(rule.descriptions()).to.deep.equal([{ type: 'content', value: 1 }]);
  });

  it('refuses an effect without a type', () => {
    expect(() => new Description({ type: '' })).to.throw(TypeError);
    expect(() => new Description({} as any)).to.throw(TypeError);
  });

  it('copies and freezes lists and records all the way down, and drops undefined fields', () => {
    const list = [1, 2],
      record = { Food: 1 },
      rule = new Rule(
        new Description({
          type: 'content',
          values: list,
          yields: record,
          of: undefined,
        })
      );

    list.push(3);
    record.Food = 2;

    const [effect] = rule.descriptions();

    expect(effect).to.deep.equal({
      type: 'content',
      values: [1, 2],
      yields: { Food: 1 },
    });
    expect('of' in effect).to.false;
    expect(() => (effect.values as number[]).push(4)).to.throw(TypeError);
    expect(() => {
      (effect.yields as { Food: number }).Food = 3;
    }).to.throw(TypeError);
  });

  it('is read from a Description of another copy, by its shape, rather than taken for the priority', () => {
    const foreign = {
        effects: () => [{ type: 'content', value: 1 }],
      },
      rule = new Rule(
        new High(),
        new Effect(() => 1),
        foreign as unknown as Description
      );

    expect(rule.descriptions()).to.deep.equal([{ type: 'content', value: 1 }]);
    expect(rule.priority()).to.instanceOf(High);
  });

  it('refuses an item that is none of the things a rule takes', () => {
    expect(() => new Rule({} as any)).to.throw(TypeError);
  });

  it('can be given with a priority and no effect', () => {
    const rule = new Rule(
      new High(),
      new Description({ type: 'content', value: 1 })
    );

    expect(rule.priority()).to.instanceOf(High);
    expect(rule.descriptions()).to.deep.equal([{ type: 'content', value: 1 }]);
  });

  it('takes a shape declared as an interface, and refuses an instance as a field', () => {
    interface Content {
      type: 'content';
      value: number;
    }

    const content: Content = { type: 'content', value: 1 };

    expect(new Description(content).effects()).to.deep.equal([content]);
    expect(
      () => new Description({ type: 'content', value: new Map() as any })
    ).to.throw(TypeError);
  });

  it('keeps classes as they are, and refuses nothing at all as an item', () => {
    class Library {}

    const [effect] = new Description({
      type: 'content',
      subject: Library,
    }).effects();

    expect(effect.subject).to.equal(Library);
    expect(() => new Rule(undefined as any)).to.throw(TypeError, /Rule:/);
  });

  it('adds no field to a rule that describes nothing, so what is saved of it is unchanged', () => {
    expect(Object.keys(new Rule(new Effect(() => 1)))).to.not.include(
      '_descriptions'
    );
  });
});
