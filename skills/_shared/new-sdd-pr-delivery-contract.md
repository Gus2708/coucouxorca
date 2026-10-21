# New SDD PR Delivery Contract

## Purpose

Define the only allowed branch, commit, push, and PR workflow for SDD delivery units after verification passes.

This contract exists so `sdd-deliver-pr` can finalize PRs without inventing git flows.

## Ownership

- `sdd-apply`/`sdd-refactor` may create or switch to the planned local delivery branch before edits, but must not commit or publish it.
- Only `sdd-deliver-pr` may commit, push, or create PRs after successful verification and delivery authorization.
- `sdd-apply` and `sdd-refactor` never merge PRs; archive is a CLI action.

## Preconditions

Run this flow only when all are true:

- `verify-report` was already persisted
- the persisted verification evidence belongs to the current delivery unit
- verdict is `PASS` or `PASS WITH WARNINGS`
- `pr_strategy` is resolved
- `delivery.model` is resolved
- the current delivery unit is complete
- `pace` is `automatic`, or semi-supervised explicit continuation found no uncovered refactor event for the active slice, or the supervised user explicitly approved creating the PR now

## Hard Rules

- Always operate on exactly one delivery unit:
  - `whole` for whole delivery
  - `delivery.active_slice` for sliced delivery
- Never stage or commit files outside the current delivery unit.
- For `chained-pr`, a later PR may show a temporary cumulative diff containing dependency
  slices until those dependencies merge into the shared feature base. This is expected and
  does not violate delivery-unit scope; scope validation at creation applies to the staged
  commit, not to that temporary cumulative diff.
- If the working tree or index contains changes that do not belong to the current delivery unit, stop and return `blocked`.
- Do not invent cleanup flows. In particular, do not use `stash`, `cherry-pick`, `rebase`, `reset`, or ad hoc branch surgery unless another explicit contract allows it.
- All PRs created or updated from this flow must remain draft PRs. Existing open PR metadata must be reused instead of creating a duplicate.
- Never merge a PR and never enable auto-merge.

## Expected Scope Validation

Before any git write action:

1. Resolve the current delivery unit.
2. Build the expected file set from:
   - owning tasks for the current unit
   - verification `Files Changed` evidence
   - the consolidated `refactor.md` when it contains covered entries for the unit
   - decision-state delivery metadata
3. Compare the expected file set against:
   - modified files
   - staged files
4. If there are extra files, missing required files, or ambiguous ownership, stop and return `blocked`.

Do not proceed with a “best effort” subset.

Delivery registration and advancement expose a `changed_paths` result in both JSON and
TOON output for the bookkeeping handoff. When non-empty, it contains exactly the repository-relative
`specs/changes/{change}/decision-state.md` and `specs/change-system/changes-index.md`
paths. An exact repeat is idempotent and reports `changed_paths: []`.

After a slice PR is registered or advanced, those two paths are chain-owned bookkeeping
for the delivered slice and the following slice. The dedicated post-PR bookkeeping commit
may stage only the reported paths; an already-clean tree is a no-op, and a partially staged
tree must be completed without adding unrelated paths. Any unrelated path or ambiguous
ownership blocks delivery. Retry on the same branch and same base, update the same chain
PR, and never merge or create a second PR.

## Base Branch Resolution

Use these rules:

- `single-pr` + `whole`:
  - PR base = repository default branch
- `split-if-large` + `sliced`:
  - PR base = repository default branch
- `chained-pr` + `sliced`:
  - PR base = `delivery.feature_base_branch`
  - if `delivery.feature_base_branch` is missing, create a deterministic feature base branch from the repository default branch first, persist it in state, and use it as the PR base

For chained delivery, every slice uses that same feature base. `depends_on` records delivery order; it does not change `pr_base`. The PR base is not the previous slice branch, so chained delivery is not a stacked-PR topology.

Chained planning also records the repository default branch in `delivery.base_branch` and initializes `delivery.feature_pr` with `draft_pr: true`, `status: not_ready`, and `url: null`. After final slice delivery, the CLI recommends—but does not require—one draft Feature PR whose head is `delivery.feature_base_branch` and base is `delivery.base_branch`. Archive does not depend on this optional metadata being resolved.

Deliver one PR for every verified slice, creating it only when no matching open PR is persisted and otherwise updating that PR. Every PR uses a distinct head and the same `delivery.feature_base_branch` as base. Keep all PRs open: never merge a PR and never enable auto-merge. `depends_on` defines the required merge order and review order; maintainers review a PR only after every `depends_on` slice is merged into the feature base. Until then, its cumulative diff may include those dependency slices. After each dependency merge, the reviewer confirms that the effective diff represents only the current slice before approving it. Merge commits or fast-forward merges normally preserve ancestry and narrow that diff automatically. If a squash/rebase merge or another history change leaves dependency changes visible, the reviewer decides how to update the branch; this workflow does not perform rebase, reset, or ad hoc branch surgery. Automatic delivery may create later draft PRs without waiting for earlier merges; semi-supervised delivery does so only after each explicit continuation with no uncovered refactor.

If a branch name already exists in state, reuse it. Otherwise use deterministic fallback names:

- whole PR branch: `sdd/{change}`
- feature base branch: `sdd/{change}--base`
- slice PR branch: `sdd/{change}--{slice-id}`

## Branch Creation Rules

After scope validation succeeds:

1. Resolve `pr_base`.
2. Resolve `pr_branch`.
3. If `pr_branch` does not exist yet, create/switch to it before commit.
4. If `pr_branch` already exists, switch to it only when the current delivery-unit changes can move there cleanly.
5. For `chained-pr`, if the delivery unit is not already on the correct base lineage for `feature_base_branch`, stop and return `blocked` instead of inventing a restack flow.

## Commit and Push Rules

After the branch is ready:

1. Stage exactly the expected file set for the current delivery unit.
2. Re-check that the staged set still matches the expected file set exactly.
3. Create one commit for the delivery unit.
4. Push the branch with upstream configured.

Use an existing project commit convention when available. Otherwise use a concise deterministic message that includes:

- the change name
- the delivery unit (`whole` or slice id)

## PR Delivery Rules

After push succeeds:

1. If persisted metadata identifies an existing open PR, validate `head = pr_branch` and `base = pr_base` against the Delivery Plan and update that PR without calling the create API.
2. Otherwise create a draft PR with `head = pr_branch` and `base = pr_base`.
3. Persist available PR metadata in decision-state using the existing delivery fields:
   - `whole_pr.branch|base|url|status`
   - or slice `pr_branch|pr_base|pr_url|status`
4. Mark the delivered PR state as:
   - whole delivery: `whole_pr.status: created`
   - sliced delivery: current slice `status: pr_created`
5. Run `sdd advance delivery --change <change>` after persisting PR metadata; the CLI validates PR metadata and advances
   `delivery.active_slice`, resets the apply/verify gates, and routes the next slice.
6. Do not call merge or auto-merge APIs. If more slices remain, continue the apply/verify/delivery loop according to pace.

## Re-entry and Recovery

The external commit, push, and PR operations are not one atomic transaction. On re-entry after any failure:

1. Resolve the planned branch, head, and base again.
2. Inspect the local branch tip and `git ls-remote` for the planned remote branch. If the delivery commit is already published, do not restage or create a second commit; continue from PR metadata reconciliation.
3. Search for an open PR with the planned head/base. If one exists, persist or reuse its metadata and update it instead of calling the create operation.
4. Create a draft PR only when no matching open PR exists.
5. If the remote tip, PR head/base, or number of matching PRs is ambiguous, return `blocked` without another Git write.

After metadata reconciliation, run `sdd advance delivery --change <change>` as the first incomplete CLI transition.

## Optional Feature PR Mode

This archive-boundary mode is separate from slice delivery. It must not commit or push and never calls `sdd advance delivery`.

- An explicit skip persists `delivery.feature_pr.status: skipped` and a null URL.
- A create request validates non-empty distinct branches, inspects both remote tips, and searches open PRs by exact head/base before creating anything.
- Exactly one matching open PR is reused. No match creates one draft PR only when the remote comparison has a diff.
- On no remote diff, keep `delivery.feature_pr.status: not_ready`, return an optional warning, and pause before archive even in automatic pace; do not manufacture an empty commit. Only explicit continuation after that warning persists `skipped` with a null URL and resumes archive routing.
- Multiple matches, mismatched persisted metadata, or external failures produce an optional warning without mutation. This optional operation does not block archive.
- A reused or created PR persists `status: created` and its URL; later entry must reuse that metadata and never create a duplicate.

## Safety Outcomes

Return `blocked` instead of improvising when any of these happen:

- unrelated working tree changes
- unrelated staged changes
- ambiguous file ownership between slices
- unresolved delivery strategy
- missing or invalid PR base
- chained slice not on the correct branch lineage
- inability to create a draft PR with the approved scope
