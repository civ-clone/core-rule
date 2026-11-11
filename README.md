# core-rule

This component contains the framework for `Rule`s. These are comprised of `Criterion`s and `Effect`s with optional `Priority`s.


## Rule sets

A `RuleSet` is a named group of rules, held by id, that a game switches together. A `RuleSetRegistry` holds a game's sets and what has been chosen in them, and switches the rules in its `RuleRegistry` to match.

```ts
import RuleSet from '@civ-clone/core-rule/RuleSet';
import RuleSetRegistry from '@civ-clone/core-rule/RuleSetRegistry';

// One registry to a RuleRegistry: `of` finds it, or makes it the first time.
const ruleSets = RuleSetRegistry.of(rules);

ruleSets.register(
  // A plain set: its rules are switched on or off together.
  new RuleSet('my-plugin:obsolescence', 'my-plugin:build/obsolete/a', 'my-plugin:build/obsolete/b'),
  // A choice: exactly one member is on, its default (or the first) until another is chosen.
  new RuleSet('my-plugin:settlers', { exclusive: true, default: 'my-plugin:settlers/original' }, 'my-plugin:settlers/original', 'my-plugin:settlers/enhanced'),
  // A set that starts off.
  new RuleSet('my-plugin:extras', { enabled: false }, 'my-plugin:extra/a'),
  // A set that takes the place of another package's rule while it is in force.
  new RuleSet('my-plugin:hydro-plant', { supersedes: ['civ1-city-improvement:city/build/hydro-plant-site'] }, 'my-plugin:city/build/hydro-plant-site')
);

ruleSets.set('my-plugin:obsolescence', false);
ruleSets.choose('my-plugin:settlers', 'my-plugin:settlers/enhanced');
```

- **Sets can hold sets.** Switching a set reaches every rule beneath it; `state(id)` is `'on'`, `'off'` or `'mixed'`, for a three-state checkbox. Switching a set does not reach into a choice beneath it.
- **It only switches off, and only switches back on what it switched off.** A rule that play has disabled for its own reasons is left as it is.
- **A set belongs to no package.** Any package may declare a set under an id, and every declaration of an id is one set: the members of all of them, in the order they were registered, and what each supersedes. An option (`exclusive`, `enabled`, `default`) left out is no opinion; two declarations that state one differently are a problem (below), and until it is settled the first stated stands. No declaration is changed: `get(id)`, `entries()` and `roots()` give the declaration when there is one, and otherwise a `RuleSet` saying what they say together: the same object until the set changes, and one that throws if `add` or `remove` is called on it (use `extend`, or a declaration), or if it is given to `register` or `unregister`. A listener subscribed to it hears nothing later: subscribe to a declaration, and expect that within a declaration's own listener the registry may not have caught up with the change yet. `declarations(id)` gives each. `unregister(set)` takes out that declaration, and with it any set it was given as a member (another declaration) unless a registered declaration still holds that same object, or names its id while no other declaration of that id is left; the set lasts while any declaration of its id does.
- **Sets can be added to.** `set.add(...)` by the package that made it; from any other, declare the set again with the new members, or `ruleSets.extend(id, ...members)`, which is shorthand for that.
- **Superseding.** A set with `{ supersedes: [...] }` names rules, or sets (meaning every rule beneath them, choices and all), that do not run while it is in force. It is in force when some path to it from the top is active (no path through an alternative that isn't chosen) and at least one registered rule it reaches through the chosen member of any choice is switched on in the sets, so a replacement that has not loaded, or that starts off, replaces nothing. It never supersedes what it holds itself through a live path (through the chosen member of any choice): naming such a rule or set does nothing at all, and nothing is carried through it. So a set can replace the whole of another but keep one of its rules by holding that rule too; a rule or set it holds only as an alternative that isn't chosen is superseded with the rest when it is beneath something else the set names. Another set in force can still supersede what it holds. It carries through: a set in force also supersedes what the sets it supersedes (those it names and those beneath them) supersede in turn, however those are switched. A superseded rule keeps its setting, and `describe()` says what supersedes it (`supersededBy`) and what each set supersedes (`supersedes`); a superseded set is shown inactive, but a rule beneath it that nothing supersedes itself is not, and runs. Nothing of this is saved: it is worked out from the sets.
- **Order of loading does not matter.** A set can name rules, and sets, that are registered later; a rule that should be off, superseded ones included, is switched off as it is registered, and a replacement that arrives puts its set in force then. A replacement rule that is *unregistered* is not noticed, since `RuleRegistry` says nothing of it: its set stays in force until the sets are next applied (any `set`, `choose`, `register` and the like). Where order would otherwise matter, as for the default of a choice that two declarations, or two `extend` calls, add members to, `validate()` says so (`no-default`).
- **`validate()`** gives every problem as data, `{ kind, ids, message, blocking }`, for a setup window to show; call it once every package is loaded. These block a game starting: `conflict` (two sets in force, something of each running, supersede the same registered rule, neither supersedes the other, and neither is beneath the other, at any depth: only one of them can be in force; the message names both and the rule, and how the player settles it is the host's to say), `cycle` (a set inside itself, or superseding itself through others), `duplicate-id` (a set's id is also a rule's), `option-conflict` (two declarations of a set state `exclusive`, `enabled` or `default` differently, or one makes it a choice and another starts it off) and `no-default` (a choice with members from more than one declaration, or `extend` call whose members are still there, and no stated `default` that is one of its members, so its default would depend on load order). These are only shown, and whatever they name is switched as usual if it arrives: `unknown-member` (a set names an id that is neither a rule nor a set, or a choice's `default` is none of its members) and `unknown-superseded`.
- **`check()`** throws for the first blocking problem, for a host with nobody to show them to.
- **`choices()` and `restore(choices)`** give and take what differs from the defaults, for a save. **`describe()`** gives the tree for a UI: a rule in some set runs exactly when it is registered, switched on, and at least one of its nodes is `active`.
