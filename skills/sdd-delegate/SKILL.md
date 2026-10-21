---
name: sdd-delegate
description: "Delegate normal task units to a selected available agent while preserving task boundaries, bounded context, verification, and dependency safety."
license: MIT
metadata: {author: miguel, version: "0.1"}
---

# SDD Delegate

## Activation Contract

Use when the user explicitly selects task-level delegation for work that already has an
SDD `tasks.md`, or invokes this skill with a standalone request. Normal delegation keeps
the task granularity supplied by the existing plan. It is an execution strategy, not a
new SDD phase and does not replace Apply, Verify, or the CLI state machine.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or
replace this skill's guidance after briefly stating the affected safeguard; do not treat
the skill as an independent veto.

## Required References

- `../_shared/new-sdd-artifact-formats.md`
- `../_shared/new-sdd-strict-tdd.md`
- `../_shared/new-sdd-circuit-breaker.md`
- `../_shared/new-sdd-orchestration-contract.md`
- `../sdd-tasks/SKILL.md` for task structure and dependency planning
- `../sdd-apply/SKILL.md` when this skill is selected from Apply

## Hard Rules

- Require an explicitly selected agent or model. If none was provided, ask for one before
  execution; validate that it is available in the current host before delegating.
- Do not invent an unavailable agent, silently install a model, or delegate to an unnamed
  fallback. If availability cannot be established, stop with a blocked result.
- For an SDD change, use only the CLI-resolved canonical plan at
  `specs/changes/<change>/tasks.md`; preserve its normal task boundaries and use it as the
  source of task order, dependencies, acceptance criteria, and strict-TDD subtasks. Do not
  create a delegation directory for work owned by an SDD change.
- For a standalone request, require a readable `<delegation-name>` and keep every artifact
  under `specs/delegations/<delegation-name>/`, including `delegation.md` and
  `tasks.md`. Create `delegation.md` with the exact name, `Mode: task-level`, and
  `Status: active` alongside a new plan. A new request creates that directory only when it
  does not exist; an existing directory may be reused only when the user explicitly names it
  as a resume target and its metadata matches the request. If it already exists without that
  instruction, stop instead of reusing or overwriting it silently. On completion, update only
  the metadata `Status` to `completed`; do not move or archive the directory.
- Select only the next eligible task: its dependencies must be complete and its scope must
  be unambiguous. A failed or unverified task blocks dependent tasks.
- Give the delegated agent only bounded context: the task, relevant acceptance criteria,
  directly needed files or interfaces, constraints, and the expected result. Do not pass
  unrelated repository history, secrets, or the whole repository by default.
- The controlling agent retains task status, TDD evidence, artifact ownership, and final
  verification. A delegated report is evidence to inspect, not proof of completion.
- The controlling agent verifies the result with the task's required tests and checks before marking it complete or
  advancing a dependent task. Require the agent to report changed files, commands, outcomes,
  assumptions, and unresolved questions.
- Retry only recoverable failures such as a transient execution or bounded tool failure,
  within the circuit breaker budget and the same task scope. Do not retry a failing
  assertion, contract mismatch, or unclear design decision as if it were transient.
- Escalate any unresolved product or architecture decision to the user. Do not let the
  delegated agent choose new behavior, public interfaces, migrations, or security posture
  outside the task contract.
- Do not commit, push, create a PR, change CLI phase state, or run Verify unless the
  controlling SDD skill explicitly authorizes that action.

## Inputs

- an explicit standalone request and delegation name, or the current SDD Apply/Refactor task delta
- the CLI-resolved canonical `tasks.md` for an SDD change, or the named standalone plan and its
  referenced artifacts
- `delegation.md` for a standalone request, with matching name, mode, and status
- an explicit resume instruction when reusing a standalone delegation
- selected agent or model and evidence that it is available
- the task's directly relevant product files, tests, interfaces, and project commands
- prior task evidence and dependency status

## Planning and Delegation Method

1. Determine whether the request is inside an SDD change. Read the CLI-resolved context
   first when it is an Apply or Refactor route; do not infer phase from filenames alone. Use
   only `specs/changes/<change>/tasks.md` for that change.
2. For a standalone request, resolve the explicit delegation name and its canonical
   `specs/delegations/<delegation-name>/` path. Create matching `delegation.md` and
   `tasks.md` artifacts only for a new non-colliding name; read both only when the user
   explicitly requests its resumption and the metadata matches. The plan contains a concise
   objective, ordered task list, dependencies, acceptance criteria, and strict-TDD subtasks:
   Safety Net, RED, GREEN, TRIANGULATE, and REFACTOR. Re-read both artifacts before execution.
3. Resolve the selected agent or model. Ask for the missing selection, validate availability,
   and record the selection in the execution report.
4. Choose the first eligible task and assemble bounded context. Include only the files and
   direct dependencies needed to implement and test that task.
5. Delegate the task with an explicit result contract: implement the task, follow strict
   TDD, report evidence for each required subtask, list changed files, and identify blockers.
6. Inspect the result, run the controlling test/check commands, and compare behavior with
   the task and its acceptance criteria. Resolve no ambiguity by assumption.
7. Record the result in the owning task plan. Mark the task complete only when evidence and
   verification are present; otherwise leave it pending or blocked and keep dependents
   pending.
8. Continue in dependency order only while the current task is verified. Return control to
   `sdd-apply` or `sdd-refactor` for SDD transitions and pace boundaries.

## Failure and Escalation Protocol

Classify each unsuccessful delegation as recoverable execution failure, task failure, or
decision ambiguity. Retry only the first category, within the circuit breaker budget. A task
failure blocks its dependents and is reported with the failing command and assertion. A
product or architecture decision is escalated to the user with the competing outcomes and
the smallest decision needed to proceed.

## Execution Steps

1. Read the required references and resolve the SDD or standalone context.
2. Locate the CLI-resolved SDD plan or the named standalone metadata and plan; create and
   validate both standalone artifacts only for a new, non-colliding delegation name.
3. Resolve and validate the selected agent or model.
4. Select one eligible task and delegate it with bounded context.
5. Inspect the report, run the required verification, and classify failures.
6. Persist task/evidence status in the owning plan without advancing dependencies early.
7. Repeat for the next eligible task or return a blocked/escalated result.
8. For an SDD route, hand back to the controlling skill for CLI transitions and the required
   Apply/Verify boundary. Never invoke Verify inline when the controlling pace forbids it.

## Output Contract

```markdown
**Status**: success|partial|blocked|needs-user
**Mode**: task-level delegation
**Scope**: SDD change `{change}` or standalone delegation `{delegation-name}`
**Plan**: `specs/changes/{change}/tasks.md` or `specs/delegations/{delegation-name}/tasks.md` (existing|created|resumed)
**Metadata**: `delegation.md` (standalone only; created|resumed)
**Agent/Model**: {selected available agent or model}
**Tasks Delegated**: {task identities}
**Tasks Verified**: {task identities or none}
**Files Changed**: {list or none}
**Evidence**: {tests/checks and outcomes}
**Blocked Dependents**: {list or none}
**Escalation**: {none or product/architecture decision}
**Next Owner**: {sdd-apply|sdd-refactor|user}
```
