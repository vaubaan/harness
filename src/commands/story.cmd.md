---
id: story
trigger: /story
invokes_skill: journey-writer
args:
  - name: intent
    type: string
description: Adds a `proposed` intent with its acceptance criteria to the right journey, before any code.
---

# /story

When the human or the agent invokes `/story <intent>`, load the skill
`journey-writer` in its story mode with the `intent` argument: the
visible change of behavior about to be built, as a verb + object.

The skill places a `proposed` intent in the journey the intent belongs to
(or creates the journey), with 2 to 5 observable acceptance criteria and
its `requires:` / `creates:` taken from the spec vocabulary. It writes
no code and no `anchors:`: the pull request that delivers the intent adds
them and passes it `implemented`.

It refuses an entity that no linked spec defines and redirects to
`/spec` first.
