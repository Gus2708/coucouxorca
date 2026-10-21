# New SDD Verify Contract

## Purpose

Verify proves that the active delivery unit matches its tasks, applicable intent/correction/spec/design, implementation, and executable assertions. It is semantic review, not a GitHub review or a substitute for PR discussion.

## Required semantic matrix

For every applicable requirement, scenario, and task, record:

| Requirement / Scenario / Task | Implementation path | Executed test | Asserted outcomes | Result |
|---|---|---|---|---|

The implementation path must identify the code that reaches the behavior. The Executed test must execute the scenario trigger. Asserted outcomes must prove every relevant THEN and important invalid-state/side-effect boundary. A test that only checks existence, non-null, an empty collection without meaningful setup, or a snapshot is not sufficient by itself.

Use only `COMPLIANT`, `PARTIAL`, `UNTESTED`, or `FAILING` in the Spec Compliance Matrix. In strict mode, missing or nominal evidence is `CRITICAL` and prevents a passing verdict.

## Adversarial review and findings

Attempt to refute green evidence by checking alternate inputs, errors, boundaries, state transitions, side effects, regressions, assertion quality, and whether the test can pass without executing the trigger. Deduplicate findings by root cause and classify each as `CRITICAL`, `WARNING`, or `SUGGESTION`, with scenario, evidence, and effect.

Every `CRITICAL` or `WARNING` whose root cause is a repeatable environment, tooling, or convention error is promoted to a Learned Constraint in the project profile, and its `LC-NNN` is named in the Findings row. A finding specific to this change's own logic is not general: it stays in the report with `None` in that column.

## Direct remediation boundary

Verify MAY remediate an unequivocal violation of an existing task, scenario, or design contract. The correction can touch the files and lines necessary inside the active delivery unit and has no arbitrary size limit, but it MUST not add functionality, expand scope, or decide ambiguous product behavior.

For direct remediation:

1. Add a meaningful failing RED test or assertion.
2. Implement the smallest GREEN correction.
3. TRIANGULATE with a meaningfully different case when applicable and REFACTOR with tests green.
4. Update `tasks.md`, Files Changed, findings, and this report.
5. Re-review every affected requirement/scenario before a PASS.

If behavior requires a product decision, is outside the existing contract, or cannot be demonstrated, do not modify product behavior. Record FAIL or blocked and route to `sdd-refactor`.

## Cycle evidence

The first report uses `verify-reports/{unit}.md` for compatibility. A subsequent cycle uses the next collision-free zero-padded path `verify-reports/{unit}-{cycle:03}.md`. Preserve all earlier reports. The CLI's latest existing report controls status, advance, delivery, and archive; after `sdd reopen --to verify`, the next cycle is required.

## Verify Report

```markdown
## Verification Report

**Change**: {change}
**Mode**: Strict TDD
**Review Mode**: normal|strict|judgment
**Delivery Unit**: whole|slice-1
**Report Cycle**: initial|001|002
**PR Readiness**: Ready|Not ready
**Covered Refactors**: None|whole-001, whole-002 for the active slice

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total in current unit | {N} |
| Tasks complete in current unit | {N} |
| Tasks incomplete in current unit | {N} |

### Build & Tests Execution
**Build**: Passed/Failed/Not available
**Tests**: {N} passed / {N} failed / {N} skipped
**Coverage**: {value or Not available}

## Files Changed
| File | Action | What Changed |
|------|--------|--------------|
| {project-root-relative path} | new|modify|delete | {scope explanation} |

### Spec Compliance Matrix
| Requirement | Scenario | Implementation | Test | Asserted outcomes | Result |
|-------------|----------|----------------|------|-------------------|--------|

### TDD Compliance
| Task | RED | GREEN | TRIANGULATE | REFACTOR | Status |
|------|-----|-------|-------------|----------|--------|

TDD Compliance is derived from the corresponding `tasks.md` subtasks, the diff, executed tests, asserted outcomes, and a meaningful second case when applicable.

### Changed File Coverage
| File | Covered | Evidence |
|------|---------|----------|

### Coherence
| Design Decision | Followed | Notes |
|-----------------|----------|-------|

### Assertion Quality
| Test | Status | Notes |
|------|--------|-------|

### Findings
| Classification | Scenario | Evidence | Effect | Remediation / Referral | Learned Constraint |
|----------------|----------|----------|--------|-----------------------|--------------------|

### Documentation Debt
| Debt ID | State | Description | Decision |
|---------|-------|-------------|----------|
| `{unit}/{revision}/documentation` | pending|resolved | {brief description} | update|same-cycle deferral|explicit continuation |

### Verify Remediation
| Finding | RED | GREEN | Re-review | Files / Tests |
|---------|-----|-------|-----------|---------------|

### Limitations
{Unavailable evidence, unconfigured tools, or explicit scope limits.}

## Feature PR Recommendation
{For the final chained unit only: optional draft PR from `delivery.feature_base_branch` to `delivery.base_branch`; state that archive remains permitted. Omit for other delivery units.}

### Verdict
PASS / PASS WITH WARNINGS / FAIL
```

## Verdict and delivery rules

- `FAIL`: any CRITICAL issue, failed required test, or incomplete required task.
- `PASS WITH WARNINGS`: no CRITICAL issue, but warnings or explicitly skipped non-critical checks remain.
- Pending documentation may be recorded with a stable debt ID and allow `PASS WITH WARNINGS` only when no other blocker exists. The same-cycle deferral is consumed once; a later cycle or revision reevaluates the debt independently. Completed documentation records the same debt ID as `resolved`.
- `PASS`: required tests and scenarios are covered, tasks are complete, and no blocking deviation remains.
- Do not archive with CRITICAL issues or a FAIL verdict.
- In automatic pace, delivery proceeds without prompting; semi-supervised pace pauses with `awaiting_delivery` and reuses a PASS with no uncovered refactor after explicit continuation; review or QA changes must create a refactor event and be verified; supervised pace requires explicit approval.
- A final chained Feature PR recommendation is informational: verify does not create it, and unresolved or skipped optional metadata does not change the verdict or archive eligibility.
