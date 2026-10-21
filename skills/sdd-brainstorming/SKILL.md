---
name: sdd-brainstorming
description: "Run optional conversational idea discovery before an SDD correction, brief, or spec flow. Use when the user explicitly asks to brainstorm, or when sdd-orchestrator recommends it because the request lacks a defined problem, audience/context, or observable outcome. Maintain a brainstorming document and offer a neutral sdd-orchestrator handoff after explicit closure."
license: MIT
metadata: {author: miguel, version: "0.1"}
---

# SDD Brainstorming

## Activation Contract

Use in either entry mode:

- **Standalone**: the user directly asks to brainstorm or develop an initial idea.
- **Orchestrator preflight**: `sdd-orchestrator` invokes it after an explicit brainstorming request or after the user accepts its recommendation for a vague idea.

This is optional discovery before SDD. It is not a CLI phase, does not create a change, and does not replace technical `sdd-exploration`.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or replace this skill's guidance after briefly stating the affected safeguard; do not treat the skill as an independent veto.

## Required References

- `../_shared/new-sdd-orchestration-contract.md`

## Hard Rules

- Discuss the problem and possible product directions before technical implementation details.
- Ask at most one focused question per turn. Prefer a concrete 2-3 option choice when alternatives are known.
- Keep brainstorming conversational without writing. Create or update `docs/brainstorms/{topic}.md` only on an explicit write/document request, and update that single concise topic document only for confirmed necessary changes.
- Derive `{topic}` as lowercase kebab-case from the idea and create `docs/brainstorms/` when absent. If the target file exists, use the question tool to choose `Continue existing` or `Create a new topic name`; never overwrite/continue based on guessed similarity.
- Replace superseded claims instead of accumulating contradictory conversation history.
- Do not call `sdd init`, `sdd new`, `sdd next`, or any phase skill during brainstorming.
- Do not finish from apparent agreement. Require an explicit completion signal such as “termina/cierra el brainstorming”, “la idea está lista”, or “pasemos al flujo SDD”.
- Do not invent user, business, legal, or acceptance constraints. Keep unresolved choices visible.
- Do not turn Candidate Ideas into technical design; technical feasibility belongs to `sdd-exploration` after a spec change exists.
- Use the question tool for the standalone SDD-flow offer and for any choice with known alternatives.

## Inputs

- initial idea or problem statement
- standalone or orchestrator-preflight entry mode
- confirmed user answers and rejected alternatives
- existing brainstorming document at the derived path, if present

## Brainstorming Document

The structure below is the content to persist only when the user explicitly asks
for the brainstorming document. Without that request, the skill does not create or modify a document.

Maintain this complete structure:

```markdown
# Brainstorming: {title}

## Starting Idea
{Original request in concise form.}

## Problem / Opportunity
{Problem to solve or opportunity to pursue.}

## Target Users / Context
{Who experiences it and under what conditions.}

## Desired Outcome
{Observable result, without implementation commitments.}

## Constraints
- {Confirmed constraint}

## Candidate Ideas
| Idea | Benefits | Tradeoffs | Status |
|------|----------|-----------|--------|

## Decisions
- {Confirmed decision and short reason}

## Open Questions
- {One unresolved decision per bullet}

## Initial Direction
{Current coherent idea suitable for orchestrator handoff, or “Not ready”.}
```


## Conversation Loop

1. Identify the earliest missing element in this order: Problem/Opportunity, Target Users/Context, Desired Outcome, Constraints that change the solution, Candidate Ideas, Initial Direction.
2. Ask one question about that element.
3. Keep the answer in conversation; if the user explicitly requested persistence, update the single concise topic document with the answer, including rejected options when their rejection constrains later work.
4. Summarize the updated direction in no more than three bullets.
5. Continue until the user gives an explicit completion signal.

On closure, `Initial Direction` is ready only when Problem/Opportunity, Target Users/Context, and Desired Outcome are concrete and no Open Question would produce a different product direction. Otherwise state the missing decision and continue instead of closing.

## Execution Steps

1. Read the orchestration contract and determine standalone vs orchestrator-preflight entry mode.
2. Derive `docs/brainstorms/{topic}.md`; create its parent directory and apply the explicit collision choice only after the user requests persistence.
3. Run the Conversation Loop without writing unless persistence was explicitly requested.
4. If persistence was requested, write the complete document after each confirmed answer or decision; otherwise do not create or modify a document.
5. On an explicit completion signal, reconcile Decisions, Open Questions, and Initial Direction.
6. If closure criteria fail, return `in-progress` with the single blocking question.
7. If invoked by orchestrator, return `handoff-orchestrator` with the document path; orchestrator resumes its new-change flow.
8. If invoked standalone, use the question tool to ask whether to start an SDD flow. On yes, hand off to `sdd-orchestrator` with the document path and no preselected flow; on no, finish without creating SDD state.

## Output Contract

```markdown
**Status**: in-progress|success|blocked
**Entry Mode**: standalone|orchestrator-preflight
**Brainstorming Document**: docs/brainstorms/{topic}.md
**Initial Direction**: {summary or Not ready}
**Open Questions**: {none or list}
**Next Action**: continue-brainstorming|handoff-orchestrator|done
**Question**: {one focused question, SDD-flow offer, or none}
```
