# New SDD Circuit Breaker Contract

## Purpose

Bound consecutive failed attempts on one unit of work so an execution loop cannot
grind indefinitely, stack patches on stale context, or spend a session re-deriving
the same wrong assumption. The budget is mechanical backpressure, not a judgment
call: reaching it is a reportable outcome, never a reason to try harder.

## Scope

| Loop | Counted unit |
|---|---|
| `sdd-apply` strict-TDD cycle | one main task |
| `sdd-verify` direct remediation | one finding under remediation |
| implementation routed by `sdd-refactor` | one refactor task |
| `sdd-delegate` task delegation | one delegated task |
| `sdd-atomic-delegate` execution | one atomic unit |

The contract governs failures that reached an assertion or a command result. It
does not govern external transient interruptions, which follow their own recoverable-failure
rules.

## Attempt Accounting

An attempt is one of:

```text
1. A full RED-to-GREEN pass that ends with the target test still failing.
2. A Safety Net run that stays red for the same reason as the previous run.
3. A delegated task or atomic unit returned unverified for the same failing assertion.
```

The following are not attempts:

```text
- A transient tool, network, or process interruption before any assertion ran.
- A failure whose root cause differs from the previous failure. That failure
  starts its own first attempt; it does not inherit the prior count.
- A user-directed change of approach, task scope, or acceptance criteria.
  That opens a new cycle at zero.
```

**Budget: two consecutive attempts on the same root cause.** The second failure
triggers the abort. Count per unit from the table above; the count resets when
that unit completes, when the user selects a new approach, or when the root cause
changes.

## Abort Procedure

```text
1. STOP
   Write no further production code for this unit.

2. RECORD EVIDENCE
   Persist the failing command and its assertion verbatim in the unit's own
   evidence: the `N.M.c` subtask line in `tasks.md` for apply/refactor work,
   the remediation row for verify, the unit report for delegated work.

3. WRITE THE ROOT CAUSE
   One paragraph naming the assumption that turned out to be false. Not a
   restatement of the error text: the belief the two attempts disproved.

4. EMIT A LEARNED CONSTRAINT CANDIDATE
   Follow the Learned Constraints rules in the artifact formats contract. An
   abort that teaches nothing general records that explicitly rather than
   skipping the step in silence.

5. REPORT BLOCKED
   Return the root cause, both attempts, and the current evidence state. The
   user decides: narrow the unit, change the approach, or continue explicitly.
```

## Prohibited Recovery

Implementation evidence lives in `tasks.md` subtasks and in verification reports.
An abort must preserve it. Never run `git reset --hard`, `git checkout --`,
`git stash`, `git clean`, or any other destructive worktree operation to reach a
clean state; partial work and its evidence are the input to the user's decision.
Never delete or rewrite a prior evidence line to hide a failed attempt.

## Hard Rules

- Two consecutive attempts on one root cause is the ceiling. There is no
  discretionary third attempt and no per-skill override.
- An explicit user continuation after an abort authorizes a new cycle at zero for
  the stated approach. It does not raise the budget.
- A blocked abort never advances a phase, marks a task complete, or produces a
  passing verdict.
- Do not restart the same unit with the same approach after an abort. Restarting
  requires a changed task scope, a changed approach, or a resolved constraint.
- Report the abort in the skill's normal Output Contract using its existing
  `blocked` status and `Blocked Reasons` fields; do not invent new output fields.

## Output Evidence

```markdown
### Circuit Breaker
**Unit**: {task/finding/atomic unit identity}
**Attempts**: 2
**Failing command**: {command}
**Failing assertion**: {assertion, verbatim}
**Root cause**: {the assumption both attempts disproved}
**Learned Constraint candidate**: {LC text, or `None — {reason it is not general}`}
```
