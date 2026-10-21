# New SDD Artifact Formats

This contract guides semantic authoring. Canonical paths, structural validation,
phase preconditions, delta parsing, synchronization, and archive mechanics belong
to the `sdd` CLI.

## Verbosity

- `concise` (default): state every required fact once, with minimal prose; do not omit requirements, scenarios, or TDD subtasks.
- `standard`: document the normal complete rationale needed to implement or review; do not add repetition.
- `deep`: add alternatives, trade-offs, risks, rollback, and traceability when useful.

## Intent Artifact

```markdown
# Intent: {change}

## Context
{problem or opportunity, users, and operating context}

## Desired Outcome
{observable result and representative success example}

## Scope
### In Scope
{included behavior}

### Out of Scope
{explicit boundary, or None with a reason}

## Key Decisions
{durable choices and declared assumptions}

## Success Criteria
{observable acceptance criteria}
```

The brief skill may add its documented optional sections without changing the minimum structural
contract. In exhaustive depth, retain every optional heading and use `Not applicable — {reason}`
instead of filler. Tasks and delta specs always remain separate artifacts.

## Exploration Artifact

```markdown
# Exploration: {change}

## Request Understanding
{Intent, constraints, assumptions, and unresolved interpretation.}

## Current State
{Evidence-backed description of present behavior.}

## Affected Areas
| Area | Evidence | Why It Matters |
|------|----------|----------------|

## Existing Tests
| Test/File | Relevance | Missing Coverage |
|-----------|-----------|------------------|

## Options
| Option | Pros | Cons | Risk | Effort |
|--------|------|------|------|--------|

## Recommendation
...

## Risks
- ...

## Open Questions
- ...

## Ready For Planning
Yes/No. {Reason}
```

## Correction Artifact

`correction.md` condenses proposal, spec delta, design, and TDD notes for small corrections. It does not replace `tasks.md`.

````markdown
# Correction: {title}

## Proposal

### Problem
{What fails or what must be corrected.}

### Scope
#### In Scope
- ...

#### Out of Scope
- ...

### Success Criteria
- [ ] ...

## Spec Delta

**Target Domain**: `{domain}`

## MODIFIED Requirements

### Requirement: {domain/stable-id} — {Correction Behavior}
The system MUST {expected behavior}.
(Previously: {one-line summary})

#### Scenario: Current bug
- GIVEN ...
- WHEN ...
- THEN ...

#### Scenario: Fixed behavior
- GIVEN ...
- WHEN ...
- THEN ...

## Design

### Technical Approach
{Smallest safe approach consistent with existing patterns.}

### Project Placement
```text
src/
└── module/
    └── implementation.py
        └── symbol()
            [modify] Briefly explain the affected symbol.
```

### Risks
- ...

## TDD Notes
- Target test layer:
- First failing test:
- Verification command:
````

`correction.md` remains the source artifact for the correction flow and must be archived as-is. During archive, its `## Spec Delta` section must also be applied to the live spec for `Target Domain` using the same deterministic rules as spec-flow delta consolidation.

## Proposal Artifact

```markdown
# Proposal: {title}

## Intent
{Problem and why it matters.}

## Scope
### In Scope
- ...

### Out of Scope
- ...

## Capabilities
### New Capabilities
- `{domain}`: ...

### Modified Capabilities
- `{domain}`: ...

## Approach
{High-level approach based on exploration.}

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|

## Rollback Plan
...

## Success Criteria
- [ ] ...

## Open Questions
- [ ] ...
```

## Spec Artifact

For modified behavior, write delta specs:

```markdown
# Delta Spec: {domain}

## ADDED Requirements

### Requirement: {domain/stable-id} — {Title}
The system MUST {observable behavior}.

#### Scenario: {Name}
- GIVEN ...
- WHEN ...
- THEN ...

## MODIFIED Requirements

### Requirement: {domain/existing-id} — {Existing Title}
{Full updated requirement text and all scenarios.}
(Previously: {one-line summary})

#### Scenario: {Name}
- GIVEN ...
- WHEN ...
- THEN ...

## REMOVED Requirements

### Requirement: {domain/stable-id} — {Title}
(Reason: ...)
(Migration: ...)

## RENAMED Requirements

### Requirement: {domain/old-id} — {Old Title}
Renamed To: {domain/new-id} — {New Title}
(Reason: ...)
(Migration: ...)
```

Critical rule: `MODIFIED` must include the full requirement block, including unchanged scenarios that must be preserved. Archive replaces the whole block.

Delta sections are instructions for archive consolidation. They are not part of the final live spec.

The live spec under `specs/specs/{domain}/spec.md` must be rendered as the consolidated end state:

```markdown
# Spec: {domain}

## Domain Overview
...

## Requirements

### Requirement: {Name}
...
```

The live spec must not retain `ADDED`, `MODIFIED`, `REMOVED`, or `RENAMED` section headings after consolidation.

## Design Artifact

````markdown
# Design: {title}

## Technical Approach
...

## Architecture Decisions
| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|

## Architecture Design

### Project Placement
```text
src/
└── module/
    └── implementation.py
        └── symbol()
            [modify] Briefly explain the affected symbol.
tests/
└── unit/
    └── test_implementation.py
        └── test_behavior()
            [new] Prove the observable behavior.
```

### Data Flow
...

### Behavior Flow
...

### Interfaces / Contracts
...

## Testing Strategy
| Level | Layer | What | Approach |
|-------|-------|------|----------|

## Migration / Rollout
...

## Technical Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|

## Open Questions
- [ ] ...
````

## Tasks Artifact

```markdown
# Tasks: {title}

## Review Workload Forecast
Estimated changed lines: {range}
Estimated product files: {range}
Target budget: read `review_budget_lines` and `review_budget_files` from decision state
Hard limit: read `review_hard_limit_lines` and `review_hard_limit_files` from decision state
Budget risk: Low|Medium|High
Independent slices possible: Yes|No
Shared production files across slices: Yes|No
Forecast basis: {proposal/spec/design/correction plus focused exploration}

## Delivery Plan
Strategy: single-pr|split-if-large|chained-pr
Model: whole|sliced
PR mode: draft
PR creation point: final verify only
Current delivery unit: whole|slice-1
Use only the subsection that matches the selected model.

### Whole Delivery
Planned branch/base: {branch -> base or TBD}
Scope: {whole change summary}

### Slices
| Slice | Phase | Branch | Base | Depends On | Est. Lines | Est. Files | Scope |
|------|-------|--------|------|------------|------------|------------|-------|
| slice-1 | apply | ... | ... | none | ... | ... | ... |

## Slice: slice-1 — {vertical scope}

### Phase 1: {cohesive work}
- [ ] 1.1 {main task}
  - [ ] 1.1.a {Safety Net evidence}
  - [ ] 1.1.b {RED failing test}
  - [ ] 1.1.c {GREEN implementation}
  - [ ] 1.1.d {TRIANGULATE second case, or N/A with an explicit reason}
  - [ ] 1.1.e {REFACTOR evidence}

### Phase 2: {optional next cohesive work}
- [ ] 2.1 {main task}
  - [ ] 2.1.a {Safety Net evidence}
  - [ ] 2.1.b {RED failing test}
  - [ ] 2.1.c {GREEN implementation}
  - [ ] 2.1.d {TRIANGULATE second case, or N/A with an explicit reason}
  - [ ] 2.1.e {REFACTOR evidence}
```

> **The checkbox format is mandatory.** New plans use one or more sequential numbered `### Phase N: Description` headings under every `## Slice: {whole|slice-N} — Title` heading. Main tasks use `- [ ] N.M description`; the first number matches the phase and the second restarts at `1` in each phase. Do not use global RED/GREEN phase headings for new plans.

> Every main task has exactly five indented subtasks, in order: `N.M.a` Safety Net, `N.M.b` RED, `N.M.c` GREEN, `N.M.d` TRIANGULATE, and `N.M.e` REFACTOR. A structural task still includes `N.M.d` and must explain why triangulation is not applicable. Subtasks are evidence owned by their parent and are never independent delivery tasks.

> **Refactor-loop tasks.** Every main task created by the refactor loop must use the exact identity tag ` [refactor:{next_refactor_identity}]` immediately after `N.M` (for example, `- [ ] 1.1 [refactor:whole-001] Fix expired-token login`). The tag is not optional and follow-up tasks in the same revision preserve the same identity. If RED is `N/A`, the task description must begin with one explicit classification tag—`[visual]`, `[documentary]`, or `[structural]`—and the RED evidence must give a specific reason that no automatable behavior exists; otherwise RED is required.

> **Progress ownership.** New work derives completion from the main-task and subtask checkboxes in `tasks.md`; do not create or update `apply-progress`. Existing flat plans may continue to use explicitly recognized legacy apply-progress evidence and are never rewritten by read-only commands.

> **Forecast rule.** The lines/files numbers in `Review Workload Forecast` are approximate pre-implementation planning estimates. Derive them from the planning artifacts and focused exploration; do not wait for exact implementation diffs.

Tasks must be concrete, file-aware, ordered, and verifiable.

## Learned Constraints

Canonical path: the `### Learned Constraints` section of `specs/change-system/profile.md`.
This is the only record that survives archive, so it is the repository's memory of mistakes
that already happened.

````markdown
### Learned Constraints

| ID | Source | Constraint | Recorded |
|----|--------|------------|----------|
| `LC-001` | `verify/whole-001` | {one actionable, general rule} | {YYYY-MM-DD} |
````

Write rules:

- Record a constraint only when it is actionable and general: a future change in this
  repository could violate it, and a reader can tell whether they did.
- Every row names an auditable source: a verify finding identity, a circuit breaker abort,
  or another recorded event that produced it.
- Allocate the next free zero-padded `LC-NNN`. Never renumber, rewrite, or delete an existing
  row; supersede it with a new row naming the one it replaces.
- Do not record a restatement of an error message, a fact true only of one change, or anything
  a linter, type checker, or `sdd check` already enforces.

Read rules:

- `sdd-exploration`, `sdd-design`, and `sdd-brief` read the section before choosing an approach.
- An approach that violates a recorded constraint must say so explicitly and justify it, or
  choose a different approach. Silently contradicting a row is a finding.

## Standalone Delegation Metadata Artifact

Canonical path: `specs/delegations/{delegation-name}/delegation.md`. This artifact is used
only for standalone task-level or atomic delegations; SDD-owned work uses the change's
`decision-state.md` and canonical task plans instead.

```markdown
# Delegation: {delegation-name}

**Name**: {delegation-name}
**Mode**: task-level|atomic
**Status**: active|completed
```

Create `delegation.md` alongside the standalone task plan with the exact requested name, the
selected mode, and `Status: active`. A resume is valid only when the user explicitly names the
delegation and the metadata name and mode match the request. If a same-named directory exists
without that explicit resume instruction, stop instead of reusing or overwriting it. An
explicitly resumed completed delegation may change only `Status` to `active` before work and
back to `completed` when the delegation finishes. Never move or archive the directory.

## Legacy Apply Progress Artifact

Canonical paths: `apply-progress/{unit}.md` or the recognized legacy singleton. This artifact is compatibility-only for changes authored under the previous flat task contract; it is not required for new hierarchical plans.

```markdown
# Apply Progress: {change}

## Delivery Unit
whole|slice-1

## Completed Tasks
- [x] 1.1 ...

## Files Changed
| File | Action | What Changed |
|------|--------|--------------|

## TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|

## Deviations
None, or an explicit deviation and reason.

## Remaining Tasks in Current Delivery Unit
- [ ] ...

## Status
{Progress and readiness for the next action.}
```

## Unit-Scoped Refactor Artifact

Canonical path: `refactors/{unit}.md`. Each delivery unit owns exactly one file;
append ordered revisions to it and keep an open revision until the user accepts
the implementation loop. Legacy `refactor.md` and
`refactors/{unit}-{sequence}.md` files are read-only compatibility evidence and
must never be rewritten.

```markdown
# Refactors: {unit}

## Refactor: {unit}-{NNN} — {title}

**Delivery Unit**: {unit}
**Pending Documentation Change**: Pending|Working|Done

## Trigger
{QA finding, review feedback, or post-apply request. Append later triggers here while this revision is open.}

## Affected Living Docs
| Artifact | Update | Reason |
|----------|--------|--------|

## Behavior Delta
{Difference from the previously verified contract.}

## Task Delta
- [ ] ...

## TDD Plan
- First failing test:
- Target test layer:
- Verification command:

## Documentation Deferral
{None, or `accepted for verify cycle {cycle}`.}

## Delivery Update
{Current/new delivery unit and forecast.}

## Risks
- ...

## Open Questions
- ...
```

## Legacy Consolidated Refactor Artifact

Compatibility path: `refactor.md`. Read ordered entries without writing new
entries there; legacy `refactors/{unit}-{sequence}.md` files remain read-only.

```markdown
## Refactor: {unit}-{NNN} — {title}

**Delivery Unit**: {unit}

## Trigger
{QA finding, review feedback, or post-verify request.}

## Affected Living Docs
| Artifact | Update | Reason |
|----------|--------|--------|

## Behavior Delta
{Difference from the previously verified contract.}

## Task Delta
- [ ] ...

## TDD Plan
- First failing test:
- Target test layer:
- Verification command:

## Delivery Update
{Current/new delivery unit and forecast.}

## Risks
- ...

## Open Questions
- ...
```

Verification reports use `verify-reports/{unit}.md` for the first cycle and preserve later cycles at collision-free paths `verify-reports/{unit}-{cycle:03}.md` (`-001`, `-002`, ...). The CLI exposes both the latest existing report and the next cycle path; older reports are immutable evidence and must not be overwritten.

Current reports persist `**Covered Refactors**: None|unit-001, unit-002`. One report
may cover all accumulated events; legacy reports without this field remain readable
through the ordinal compatibility baseline. Historical snapshot fields are tolerated
but ignored.
