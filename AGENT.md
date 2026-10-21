# AGENT.md — Coucou x Orca Development Guidelines

This document governs agent behavior, engineering standards, and execution workflows for the **Coucou x Orca** project.

---

## 1. Core Engineering Principles: Ponytail (Lazy Senior Dev)

> **Motto:** *"The best code is the code never written."*

Every technical task must prioritize minimal, surgical, and robust changes over over-engineering:

1. **Smallest Complete Change:**
   * Does it need to exist? Skip features, options, wrappers, and "for later" boilerplate nobody asked for.
   * Reuse existing helpers, patterns, and services in the codebase before writing new code.
   * Prefer standard libraries and existing dependencies over adding new crates or packages.
   * Shortest working diff wins once callers, tests, and configurations are accounted for.
2. **Transparent Skip & Risk Footer:**
   * Conclude coding deliveries with a 1–2 line footer specifying:
     * What was skipped or not checked.
     * Any potential edge cases or risks the human engineer must be aware of.
3. **Available Ponytail Skills & Slash Commands:**
   * `/ponytail [lite|full|ultra|off]` — Toggle senior dev minimalism intensity.
   * `/ponytail-review` — Review diffs for bloat, unnecessary abstractions, and YAGNI violations.
   * `/ponytail-audit` — Audit codebase for dead code, unused dependencies, and over-engineering.
   * `/ponytail-debt` — Identify technical debt and simplification opportunities.
   * `/ponytail-gain` — Quantify lines of code saved or deleted.
   * `/ponytail-help` — Usage guide for Ponytail skills.

---

## 2. SDD Workflow: Spec-Driven Development

All non-trivial feature additions, refactors, and architectural migrations must follow the SDD workflow in `skills/`:

* **Orchestration & Flow Selection:**
  * Use `sdd-orchestrator` to initialize new changes or `sdd-resume` to continue active changes.
  * Supported flows:
    * `correction`: Localized defect/bug fix (<400 lines, focused scope).
    * `brief`: Default normal functional work with adaptive planning.
    * `spec`: Complex architectural changes with public contracts, multi-domain impact, or irreversible risk.
* **Phase Execution Order:**
  1. **Planning / Specification:** `sdd-brief` or `sdd-proposal` → `sdd-spec` → `sdd-design` → `sdd-tasks`.
  2. **Atomic Implementation:** `sdd-apply` executes tasks iteratively, maintaining strict TDD.
  3. **Verification & Quality Gate:** `sdd-verify` verifies the build, tests, and acceptance criteria before concluding.
  4. **PR & Archival:** `sdd-deliver-pr` and `sdd-archive`.
* **Layer-by-Layer Rule:**
  Never mix backend and frontend changes indiscriminately. Complete and verify one architectural layer (e.g., Rust backend / hook) before moving to the consumer layer (e.g., TypeScript / UI).

---

## 3. Coucou x Orca Preservation Rules

The Coucou fork maintains specialized integrations for **Orca** (multi-agent orchestration and dynamic worktree management). These must never be clobbered during upstream merges:

1. **Orca Modules (Must Preserve):**
   * `windows/src-tauri/src/orca.rs`: Orca multi-agent detection and telemetry.
   * `windows/src-tauri/src/codex.rs`: Codex plan integration.
   * `windows/src/island/orca.ts`: Orca UI state, animations, and gaze logic.
   * `windows/tests/orca.test.mjs`, `windows/tests/skin.test.mjs`, `windows/tests/hierarchy.test.mjs`.
2. **Integration Touchpoints:**
   * `windows/hook/src/main.rs`: Dynamic Git worktree vs. primary repo detection. Primary workspace displays as main island card (Orca); subagent worktrees display as child pills.
   * `windows/src-tauri/src/platform/windows.rs`: Windows WebView2 sizing fixes (preventing 240×6 px window collapse).
   * `windows/src/island/island.ts`: Notch close button (**X**) with reactive auto-reopen on agent events.
   * `windows/src/style.css` & `ticker.ts`: Orca skins, gaze tracking, and ticker anti-overlap logic.

---

## 4. Commit Conventions

* Conventional Commits only (`feat(...)`, `fix(...)`, `refactor(...)`, etc.).
* **Never** include `Co-Authored-By` or AI attribution trailers.
