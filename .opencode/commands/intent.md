---
description: Proposes an intent before any code (`/intent <verb + object>`), or maps and extends the intent tree under `docs/intents/`.
---

# /intent

When the human or the agent invokes `/intent [verb + object]`, load the
skill `intent-writer` with the optional `intent` argument.

**With an argument**, `/intent <verb + object>` names the visible change
of behavior about to be built. The skill places it as a `proposed`
terminal intent in the level-1 intent it belongs to (or creates the
file), with 2 to 5 observable acceptance criteria and its `requires:` /
`creates:` taken from the spec vocabulary. It writes no code and no
`anchors:`: the pull request that delivers the intent adds them and
passes it `implemented`. It refuses an entity that no linked spec
defines and redirects to `/spec` first.

**Without an argument**, the skill maps or extends the tree. It reads
the generated index `docs/intents/README.md`, lists the level-1 intents
and asks which one to extend or whether to create one. Greenfield: three
questions, one at a time (actor, intent statement, out of scope).
Mature: it reads the code's entry points and proposes anchored terminal
intents, one sub-domain at a time.

The skill instantiates the `intent.md.tmpl` template for creations.
