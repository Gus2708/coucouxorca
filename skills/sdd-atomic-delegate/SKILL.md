---
name: sdd-atomic-delegate
description: "Derive or create an atomic task plan and delegate independently verifiable units one at a time with dependency-safe verification."
license: MIT
metadata: {author: miguel, version: "0.1"}
---

# SDD Atomic Delegate

## Activation Contract

Use when the user explicitly selects atomic delegation for an SDD delivery unit or for a
standalone request intended for constrained agents. Atomic delegation is an execution
strategy: it creates a separate `tasks.atomic.md` plan of independently verifiable atomic units,
delegates one unit at a time, and returns control to the owning SDD skill for lifecycle state.

## User Authorization Override

These instructions are operational guidance. With explicit user authorization, bypass or
replace this skill's guidance after briefly stating the affected safeguard; do not treat
the skill as an independent veto.

## Required References

- `../_shared/new-sdd-artifact-formats.md`
- `../_shared/new-sdd-strict-tdd.md`
- `../_shared/new-sdd-circuit-breaker.md`
- `../_shared/new-sdd-orchestration-contract.md`
- `../sdd-tasks/SKILL.md` for the source task structure
- `../sdd-delegate/SKILL.md` for shared agent selection and result handling
- `../sdd-apply/SKILL.md` when this skill is selected from Apply

## Hard Rules

- Require an explicitly selected agent or model. If absent, ask for one and verify that it
  is available before creating delegated work or starting an atomic unit.
- For an SDD change, use only the CLI-resolved canonical plans at
  `specs/changes/<change>/tasks.md` and `specs/changes/<change>/tasks.atomic.md`. Derive
  `tasks.atomic.md` from the former, preserve every parent task identity, source reference,
  dependency, and acceptance boundary needed for traceability, and never overwrite
  `tasks.md` or create a delegation directory.
- For a standalone request, require a readable `<delegation-name>` and keep the atomic plan at
  `specs/delegations/<delegation-name>/`, including `delegation.md` and
  `tasks.atomic.md`. Create `delegation.md` with the exact name, `Mode: atomic`, and
  `Status: active` alongside a new atomic plan. A new request creates that directory only
  when it does not exist; an existing directory may be reused only when the user explicitly
  names it as a resume target and its metadata matches the request. If it already exists
  without that instruction, stop instead of reusing or overwriting it silently. Standalone
  atomic mode creates only `tasks.atomic.md`, not an additional `tasks.md`. On completion,
  update only the metadata `Status` to `completed`; do not move or archive the directory.
- Each atomic unit has one observable outcome, a narrow file/symbol scope, explicit
  prerequisites, a verification command or assertion, and a parent-task reference when
  derived from SDD.
- Delegate one atomic unit at a time in dependency order. A failed or unverified unit blocks
  every dependent unit, including units that could otherwise be delegated in parallel.
- Pass bounded context only: the atomic unit, parent traceability, direct files/interfaces,
  constraints, and verification expectations. Do not provide unrelated repository material,
  secrets, or broad write authority by default.
- The controlling agent owns the source `tasks.md`, task status, TDD evidence, artifact
  changes, and final verification. `tasks.atomic.md` records decomposition and execution
  evidence; it is not permission to alter SDD state or skip the parent flow.
- Verify each unit before marking it complete. A delegated report must include changed files,
  tests/checks, asserted outcomes, assumptions, and unresolved questions.
- Retry only recoverable failures, such as a transient agent/tool interruption, within the
  circuit breaker budget. Do not retry a behavioral failure or an ambiguous product or
  architecture decision without new direction.
- Escalate unresolved product or architecture decisions to the user and stop affected
  progression. Never invent behavior, interfaces, migrations, or security decisions to keep
  the atomic queue moving.
- Do not commit, push, create a PR, change CLI phase state, or invoke Verify unless the
  controlling SDD skill authorizes it.

## Inputs

- an SDD `tasks.md` and CLI-resolved delivery unit, or a standalone request and delegation name
- the source intent/spec/design context needed to define observable boundaries
- selected available agent or model
- directly relevant files, tests, interfaces, and verification commands
- existing `tasks.atomic.md`, when resuming atomic execution
- `delegation.md` for a standalone request, with matching name, mode, and status
- an explicit resume instruction when reusing a standalone delegation
- completed-unit evidence and dependency status

## Atomic Planning Method

1. Resolve whether the request is SDD-owned. Use the CLI context for Apply or Refactor and
   keep its phase and delivery-unit decisions authoritative. Use only the change's canonical
   `specs/changes/<change>/` plan paths.
2. If SDD-owned, derive `specs/changes/<change>/tasks.atomic.md` without changing the source
   plan. Split each eligible normal task only as far as needed for independent verification;
   preserve parent IDs such as `1.1` and use stable child IDs such as `1.1-atomic-01`.
3. Otherwise, resolve the explicit standalone delegation name and use
   `specs/delegations/<delegation-name>/`. Create matching `delegation.md` and
   `tasks.atomic.md` artifacts only for a new, non-colliding name; read both only when the
   user explicitly requests its resumption and the metadata matches. Atomize the request
   into highly independent units. Separate setup, behavior, tests, documentation, and
   integration only when each resulting unit has a meaningful observable check and a clear
   dependency.
4. For every unit, write: parent task, outcome, scope, prerequisites, bounded context,
   verification, and status. Reject units that require an unresolved product or architecture
   decision until the user resolves it.
5. Resolve and validate the selected agent or model before the first delegation.
6. Select the first unblocked unit, send its bounded context and result contract, and wait
   for its report before selecting the next unit.
7. Inspect the report and run the unit's verification. Update atomic evidence only after the
   result is verified; keep all dependents blocked or pending when it is not.
8. Repeat until all units are verified, a recoverable failure is retried within budget, or a
   blocker/decision is escalated. Hand the final result to the owning SDD skill.

## Failure and Escalation Protocol

Use three classifications: recoverable execution failure, unit failure, and unresolved
decision. Retry only recoverable execution failures, within the circuit breaker budget. A
unit failure blocks its dependency
chain and includes the exact failed assertion or command. An unresolved product or
architecture decision is escalated with the alternatives, impact, and decision question;
unrelated independent units may proceed only if their context is demonstrably unaffected.

## Execution Steps

1. Read the required references and resolve the delivery context.
2. Locate the CLI-resolved SDD plans or the named standalone metadata and atomic plan; derive
   or create only at the canonical path, then validate parent traceability and unit boundaries.
3. Resolve and validate the selected agent or model.
4. Delegate one unblocked atomic unit with bounded context.
5. Verify its result and persist status/evidence in `tasks.atomic.md`; update the owning SDD
   plan only through the controlling Apply/Refactor skill.
6. Block dependents on failure, retry only recoverable failures, and escalate decisions.
7. Return to the owning SDD skill for TDD evidence consolidation, CLI transitions, and the
   required Apply/Verify boundary.

## Output Contract

```markdown
**Status**: success|partial|blocked|needs-user
**Mode**: atomic delegation
**Scope**: SDD change `{change}` or standalone delegation `{delegation-name}`
**Plan**: `specs/changes/{change}/tasks.atomic.md` or `specs/delegations/{delegation-name}/tasks.atomic.md` (derived|created|resumed)
**Source Plan**: `specs/changes/{change}/tasks.md` (preserved) or none
**Metadata**: `delegation.md` (standalone only; created|resumed)
**Agent/Model**: {selected available agent or model}
**Atomic Units Delegated**: {unit identities}
**Atomic Units Verified**: {unit identities or none}
**Files Changed**: {list or none}
**Evidence**: {tests/checks and outcomes}
**Blocked Dependents**: {list or none}
**Escalation**: {none or product/architecture decision}
**Next Owner**: {sdd-apply|sdd-refactor|user}
```
