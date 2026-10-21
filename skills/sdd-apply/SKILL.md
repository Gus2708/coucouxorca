---
name: sdd-apply
description: "Implement the current SDD delivery unit from tasks.md with strict RED-GREEN-TRIANGULATE-REFACTOR and persistent evidence; in semi-supervised pace, end the invocation after Apply before Verify."
license: MIT
metadata: {author: miguel, version: "0.2"}
---

# SDD Apply

## Activation Contract

Use when `sdd next` returns `apply`. Implement only the pending tasks for the current delivery unit. Post-verify QA work belongs to `sdd-refactor`. In semi-supervised pace, this skill ends the current invocation after Apply and never invokes Verify in the same continuation.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or replace this skill's guidance after briefly stating the affected safeguard; do not treat the skill as an independent veto.

## Required References

- `../_shared/new-sdd-artifact-formats.md`
- `../_shared/new-sdd-strict-tdd.md`
- `../_shared/new-sdd-circuit-breaker.md`
- `../_shared/new-sdd-mcp-docs-contract.md`
- `../_shared/new-sdd-orchestration-contract.md`

## Hard Rules

- Begin with `sdd apply --change <change>` and use its context; do not resolve pending work manually.
- Start only when `sdd apply` exits successfully for `--change <change>` and returns a delivery unit plus at least one pending task. Treat any CLI `blocked_reasons` or nonzero exit as blocked.
- Work only on the current whole unit or active slice.
- Follow strict TDD: Safety Net, RED, GREEN, TRIANGULATE, REFACTOR.
- If available, recommend `$implementation-quality` for implementation: it helps search for reusable local code first and make the smallest maintainable change.
- A RED test must fail for the expected reason before production code changes.
- Bound every main task with the circuit breaker: two consecutive attempts on one root cause, then abort, persist the failing command/assertion and root cause, and report blocked. There is no discretionary third pass.
- Use the test layer assigned by tasks. For filesystem behavior, use real temporary files/directories when the repository has an integration runner; if it does not, record the missing runner before using the next available layer.
- Run targeted tests throughout; full semantic verification belongs to `sdd-verify`.
- In semi-supervised pace, completing Apply is a terminal boundary for the current invocation: pause after apply before verify. After `sdd next` returns `next_phase: verify`, report that result and stop. Do not invoke `sdd-verify`, execute semantic verification, or create a verification report in the same continuation; the routing result identifies future work but does not authorize it.
- Mark the main task and its `N.M.a`–`N.M.e` subtasks `[x]` only after evidence exists; update `tasks.md` immediately. Do not create or update apply-progress for hierarchical plans.
- For routed non-brief refactor work, record executed subtask evidence immediately but leave the refactor main task pending; return to `sdd-refactor` after apply so user acceptance can close the revision. Brief feedback tasks are ordinary tasks and close when their evidence is complete.
- Stop on pre-existing failures, spec/design contradiction, unplanned scope, or ambiguous ownership.
- Never create a PR.

## Execution Route Selection

Direct execution remains the default. The available routes are direct execution by
`sdd-apply`, normal task-level delegation through `sdd-delegate`, or atomic delegation
through `sdd-atomic-delegate`. Activate a delegation route only when the user explicitly
requests it; otherwise continue with direct execution without presenting or asking about
the alternatives. A requested delegation route requires a selected available agent or
model; the delegated skill asks for and validates it when absent. Do not silently change
routes.

All routes preserve the same SDD task boundaries and strict TDD cycle. The Apply controller
retains verification ownership, task status, TDD evidence, bounded scope, and CLI transition
authority. A delegated report is inspected evidence, not completion. Pass only bounded context
for the pending task or derived atomic unit: the acceptance criteria, directly relevant files
and interfaces, constraints, and required checks. A failed or unverified unit blocks dependent
work; retry only recoverable execution failures, and escalate product or architecture
ambiguity to the user. `sdd-delegate` preserves normal task granularity; `sdd-atomic-delegate`
derives `tasks.atomic.md` without replacing `tasks.md`.

## Inputs

- CLI apply context
- tasks.md and current delivery unit
- the intent/spec/correction and design references named by each returned task
- product/test files explicitly named by the task plus their direct imported/called dependencies
- prior legacy `apply-progress/{unit}.md`, if present; it is not an input for hierarchical plans

## TDD Cycle

1. **Safety Net**: run the existing test file/class nearest to the changed symbol plus any test command explicitly named by the task/design. If neither exists, record `No pre-existing coverage` rather than claiming a passing safety net.
2. **Understand**: connect task, scenario, design, and current code.
3. **RED**: add one meaningful failing test and record failure evidence.
4. **GREEN**: implement the smallest passing change.
5. **Attempt gate**: if the target test is still failing, that pass counts as one attempt on its root cause. Apply the circuit breaker budget before another GREEN pass. This gate owns no subtask of its own.
6. **TRIANGULATE**: add a meaningfully different case unless purely structural.
7. **REFACTOR**: improve clarity/structure with tests green.
8. **Persist**: mark ordinary tasks complete and record TDD Cycle Evidence. For refactor tasks, persist the five subtask results but leave the main task pending until `sdd-refactor` closes the user loop.

For legacy plans, `apply-progress/{unit}.md` must identify the delivery unit, completed/remaining tasks, files changed, test layer/commands, TDD evidence, and deviations. For hierarchical plans, the same progress and evidence belongs in `tasks.md`; no apply-progress artifact is required.

## Execution Steps

1. Read required contracts.
2. Run `sdd apply --change <change>`; continue only when it exits successfully and returns a delivery unit and pending tasks. Read the artifacts/files selected by the Inputs rules above.
3. Run the initial targeted Safety Net.
4. Execute each assigned task using the full strict-TDD cycle.
5. After each task, update `tasks.md` (including its nested TDD subtasks), and update the legacy apply-progress artifact only when the CLI explicitly identifies the plan as legacy; confirm the checkbox persisted.
6. Run every test added/modified for the tasks, the Safety Net tests, and real-file integration tests required by the filesystem rule above.
7. Run `sdd check --change <change>`.
8. Return routed refactor work to `sdd-refactor` before `sdd advance apply`; for ordinary work, run `sdd advance apply --change <change>` only when no unchecked task remains for the current whole unit/active slice and all commands from step 6 pass.
9. Run `sdd next --change <change>`.
10. Route by pace. Automatic pace may continue to `sdd-verify`. In semi-supervised pace, when `next_phase` is `verify`, report the handoff and end the invocation immediately; wait for a new explicit user continuation. Supervised pace retains its phase approval boundary.

## Output Contract

```markdown
**Status**: success|partial|blocked
**Change**: {change}
**Delivery Unit**: {whole|slice-id}
**Tasks Completed**: {list}
**Files Changed**: {list}
**TDD Evidence**: {Safety Net/RED/GREEN/TRIANGULATE/REFACTOR summary}
**Next Phase**: {CLI next_phase}
**Boundary**: none|paused-before-verify
**Continuation Required**: yes|no
**Blocked Reasons**: {none or list}
```
