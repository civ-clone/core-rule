# core-rule

This component contains the framework for `Rule`s. These are comprised of `Criterion`s and `Effect`s with optional `Priority`s.


## Rule sets

A `RuleSet` is a named group of rules, held by id, that a game switches together. A `RuleSetRegistry` holds a game's sets and what has been chosen in them, and switches the rules in its `RuleRegistry` to match.

```ts
import RuleSet from '@civ-clone/core-rule/RuleSet';
import RuleSetRegistry from '@civ-clone/core-rule/RuleSetRegistry';

const ruleSets = new RuleSetRegistry(rules);

ruleSets.register(
  // A plain set: its rules are switched on or off together.
  new RuleSet('my-plugin:obsolescence', 'my-plugin:build/obsolete/a', 'my-plugin:build/obsolete/b'),
  // A choice: exactly one member is on, the first until another is chosen.
  new RuleSet('my-plugin:settlers', { exclusive: true }, 'my-plugin:settlers/original', 'my-plugin:settlers/enhanced'),
  // A set that starts off.
  new RuleSet('my-plugin:extras', { enabled: false }, 'my-plugin:extra/a')
);

ruleSets.set('my-plugin:obsolescence', false);
ruleSets.choose('my-plugin:settlers', 'my-plugin:settlers/enhanced');
```

- **Sets can hold sets.** Switching a set reaches every rule beneath it; `state(id)` is `'on'`, `'off'` or `'mixed'`, for a three-state checkbox. Switching a set does not reach into a choice beneath it.
- **Sets can be added to.** `set.add(...)`, or `ruleSets.extend(id, ...members)` from a package that does not hold the set, which works whether or not the set has been registered yet.
- **Order of loading does not matter.** A set can name rules, and sets, that are registered later; a rule that should be off is switched off as it is registered.
- **`check()`** throws for a rule id nothing registered, an `extend` whose set never arrived, and a set inside itself. Call it once every package is loaded.
- **`choices()` and `restore(choices)`** give and take what differs from the defaults, for a save. **`describe()`** gives the tree for a UI.
