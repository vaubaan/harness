---
id: story
trigger: /story
description: Adds a `proposed` leaf with its acceptance criteria to the right journey, before any code.
args:
  - name: intent
    type: string
---

# /story

When the human or the agent invokes `/story <intent>`, load the skill
`journey-writer` in its story mode with the `intent` argument: the
visible change of behavior about to be built, as a verb + object.

The skill places a `proposed` leaf in the journey the intent belongs to
(or creates the journey), with 2 to 5 observable acceptance criteria and
its `requires:` / `creates:` taken from the spec vocabulary. It writes
no code and no `anchors:`: the pull request that delivers the leaf adds
them and passes it `implemented`.

It refuses an entity that no linked spec defines and redirects to
`/spec` first.
