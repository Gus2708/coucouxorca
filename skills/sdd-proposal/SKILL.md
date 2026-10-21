---
name: sdd-proposal
description: "Author proposal.md after exploration, defining intent, scope, capabilities, approach, risks, rollback, and success criteria."
license: MIT
metadata: {author: miguel, version: "0.2"}
---

# SDD Proposal

## Activation Contract

Use when `sdd next` returns `proposal`. Create only `proposal.md`; do not write specs, design, tasks, or code.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or replace this skill's guidance after briefly stating the affected safeguard; do not treat the skill as an independent veto.

## Required References

- `../_shared/new-sdd-artifact-formats.md`
- `../_shared/new-sdd-orchestration-contract.md`

## Hard Rules

- Read the complete exploration artifact first.
- Keep scope aligned with evidence, not imagined future work.
- Capabilities are the explicit handoff to `sdd-spec`; name each new or modified domain.
- Separate In Scope and Out of Scope.
- Include Risks with mitigation, a realistic Rollback Plan, and observable Success Criteria.
- Do not invent product rules. Block when an Open Question admits two outcomes that would require different requirements or THEN assertions.
- Do not edit implementation.

## Inputs

- exploration.md
- user request and decisions
- existing live specs for every domain listed under New or Modified Capabilities

## Artifact Guidance

Follow the proposal template in the artifact contract. Explain intent and why it matters; list new/modified Capabilities; summarize the evidence-backed Approach and Affected Areas; make Success Criteria testable.

## Execution Steps

1. Read required contracts and `exploration.md`.
2. Extract the problem, current behavior, recommended approach, risks, and boundaries.
3. Define In Scope and Out of Scope.
4. Define domain-oriented Capabilities that can be specified independently.
5. Write approach, affected areas, risks/mitigations, Rollback Plan, Success Criteria, and Open Questions.
6. Write `specs/changes/{change}/proposal.md`.
7. Run `sdd check --change <change>` and correct artifact issues.
8. Run `sdd advance proposal --change <change>`.
9. Run `sdd next --change <change>` and route by pace.

## Output Contract

```markdown
**Status**: success|blocked
**Change**: {change}
**Artifact**: proposal.md
**Capabilities**: {new/modified domains}
**Next Phase**: {CLI next_phase}
**Risks/Open Questions**: {none or list}
```
