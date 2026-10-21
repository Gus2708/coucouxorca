---
name: sdd-brief
description: "Run the adaptive brief plan conversation, explore when useful, and create intent.md, tasks.md, and any durable delta specs in one CLI phase."
license: MIT
metadata: {author: miguel, version: "0.1"}
---

# SDD Brief

## Activation Contract

Use when `sdd next` returns `plan` for `flow: brief`. Perform conversation, focused
exploration, and planning only; do not edit product or test code.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or
replace this skill's guidance after briefly stating the affected safeguard; do not treat the
skill as an independent veto.

## Required References

- `../_shared/new-sdd-artifact-formats.md`
- `../_shared/new-sdd-strict-tdd.md`
- `../_shared/new-sdd-mcp-docs-contract.md`
- `../_shared/new-sdd-pr-delivery-contract.md`
- `../_shared/new-sdd-orchestration-contract.md`
- `../sdd-tasks/SKILL.md` for its Planning Method and Persistence Contract only

## Hard Rules

- Ask only for information absent from the request and not discoverable from the repository.
- Establish problem/context and observable outcome before deciding whether exploration helps.
- Explore when code behavior, tests, contracts, data, security, cross-module integration, or
  technical feasibility is uncertain. Skip exploration when it cannot change the plan.
- Block only unresolved scope, observable behavior, critical interface, or irreversible
  decisions. Record other unknowns as explicit assumptions or Open Questions.
- Keep all narrative depth in `intent.md`; keep executable work in `tasks.md`; keep durable
  behavior contracts in `specs/{domain}/spec.md`. Never embed tasks or delta specs in intent.
- `intent.md` may remain minimum or grow through every optional section. Exhaustive mode includes
  the full catalog and marks irrelevant sections `Not applicable — {specific reason}`.
- Use the hierarchical strict-TDD task format and the exact delivery persistence rules from
  `sdd-tasks`; do not invoke or advance the separate `tasks` phase.
- Select test levels with the Evidence Ladder in the strict-TDD contract and record the selected
  level in each task. Brief plans tasks without a design phase, so the climb argument belongs here.
- Decide delta-spec persistence from the resulting contract, not from whether the change feels
  like planning or implementation work. Require at least one delta spec when the brief adds,
  removes, or changes observable behavior, business rules, expected errors or failure behavior,
  compatibility guarantees, public interfaces, or persisted data/schema semantics. Keep delta
  specs optional only when every affected change is an internal refactor, maintenance,
  documentation, tooling, or another change with no new or modified functional contract. If the
  classification is ambiguous, treat it as contract-affecting and write a minimum delta spec with
  the essential requirements and scenarios; never leave that contract only in `intent.md`,
  `tasks.md`, or tests.
- Do not create exploration, proposal, design, correction, or refactor artifacts.
- Never edit CLI-owned current/next phase, status, or artifact-transition fields.

## Inputs

- user request and answers
- `decision-state.md`, project profile including its `### Learned Constraints`, live specs, and focused repository evidence
- existing tests and project conventions reached from the affected behavior
- current documentation for version-sensitive external interfaces, when needed

## Minimum Conversation Gate

Ask only each unanswered question:

1. “What problem or opportunity should be addressed, for whom or in what context?”
2. “What observable outcome should result, and what example proves it works?”
3. “What is in scope and what must remain out of scope?”
4. “What current behavior, compatibility, or constraint must be preserved?”

After focused exploration, ask only repository-informed decisions about an ambiguous edge/error
behavior, architecture alternative, interface compatibility, data migration/rollback,
security/privacy, performance/reliability/observability, or rollout/delivery constraint. Present
2–3 meaningful choices with a recommendation whenever the question is a tradeoff.

## Intent Depth

The minimum artifact is `# Intent: {change}` with Context, Desired Outcome, Scope/In Scope/Out of
Scope, Key Decisions, and Success Criteria. Add only useful optional sections: Current State /
Evidence, Behavior and Edge Cases, Alternatives, Technical Approach, Architecture Decisions,
Project Placement, Data Flow, Interfaces / Contracts, Testing Strategy, Data / Migration,
Security / Privacy, Performance / Reliability, Observability, Rollout / Rollback / Compatibility,
Risks, and Open Questions.

## Checkpoint and Pace

- `automatic`: answer discoverable questions from evidence, include every risk-triggered section,
  declare assumptions, write/check/advance plan, and continue according to `sdd next`.
- `semi-supervised`: once the minimum gate is satisfied, summarize decisions and assumptions and
  ask one checkpoint with: **Advance brief**, **Deepen** using at most three concrete recommended
  sections, or **Switch to multi-file spec**. Advance writes/checks/completes plan and then pauses
  before Apply. Deepen asks only the selected follow-ups and repeats the checkpoint.
- `supervised`: use the same checkpoint, then present intent/tasks/specs for approval before
  `sdd advance plan`; pause after the phase.

If the user selects spec before plan completes, edit only `flow: spec` plus the normal decision
metadata, preserve the same change, do not write brief artifacts, run `sdd next --change <change>`,
and hand off to `sdd-exploration`. Conversion after plan completion is not allowed.

## Execution Steps

1. Read required contracts and establish the unanswered minimum conversation fields.
2. Decide and perform only focused exploration that can change behavior, architecture, tests, or
   delivery; use repository evidence instead of asking discoverable questions.
3. Resolve blocking decisions and select minimum, expanded, or exhaustive intent depth.
4. Apply the pace checkpoint. If the user selects spec, perform the pre-plan flow switch and stop.
5. Write `intent.md`, the required delta specs from the contract classification (or none when the
   change is explicitly non-functional), and hierarchical `tasks.md`.
6. Forecast review work and persist delivery fields using the `sdd-tasks` Persistence Contract.
7. Re-read artifacts/state; run `sdd check --change <change>` and fix structural mismatches.
8. Run `sdd advance plan --change <change>`, then `sdd next --change <change>`.
9. Automatic pace may route to `sdd-apply`; semi-supervised and supervised pace stop before Apply.

## Output Contract

```markdown
**Status**: success|blocked|needs-user
**Change**: {change}
**Intent Depth**: minimum|expanded|exhaustive
**Artifacts**: intent.md, tasks.md, {delta specs or none}
**Assumptions**: {none or list}
**Review Forecast**: {lines/files/risk}
**Delivery Plan**: {whole or slices/strategy/base}
**Next Phase**: {CLI next_phase}
**Boundary**: none|paused-before-apply|waiting-for-plan-approval
**Blocked Reasons**: {none or list}
```
