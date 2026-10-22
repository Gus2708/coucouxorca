<div align="center">

# Coucou × Orca

**A fork of [Coucou](https://github.com/Louis-CFM/coucou) that understands Orca orchestration: your coordinator, its subagents and the agent you are using, all on Mochi.**

![Windows 10/11](https://img.shields.io/badge/Windows-10%2F11-0078D4?logo=windows&logoColor=white)
![Tauri 2](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-backend-000?logo=rust)
![Code: MIT](https://img.shields.io/badge/code-MIT-green)

</div>

---

## What this fork adds

Everything in upstream Coucou still works. On top of it, the Windows/Tauri app (`windows/`) gains:

- **Orca telemetry.** Coucou talks to the Orca CLI (`orchestration run-list`, `terminal list`, `worktree ps`, `task-list`) and shows the active run: the coordinator as the big Mochi, its dispatched workers as mini Mochis on the right.
- **Live worker states.** Working, thinking, approval, question, idle, finished and error, read from Orca's own dispatch, outcome and liveness data. Retained workers stay visible and settled ones linger briefly before leaving.
- **Provider skins.** Mochi and each worker wear the skin of their agent: Claude, Codex or Antigravity (plus Orca and the classic Mochi). Provider resolution prefers known providers over model names such as `gpt-…`.
- **Follow the agent.** In *Settings → Avatar skin*, pick *Follow the agent* and Mochi takes the skin of whatever you are working with, with or without Orca: the Orca coordinator first, then a working session, then the focused one.
- **Exact hook routing.** The `coucou-hook` relay forwards Orca's terminal and pane identity so the right coordinator or worker lights up, even when several share one folder.
- **Completion cards.** The finished card shows the first paragraph of the agent's final answer, not its last tool command, for the coordinator and every subagent.
- **Open Orca.** The card button brings Orca to the front and switches to the worker's terminal. If that terminal is gone, it never jumps to another one.
- **Resilience.** Every Orca call has a deadline and a bounded output buffer. A transient CLI error does not wipe the island, and the notch returns to rest after inactivity.

## Requirements

- Windows 10/11 (the macOS app and the other platforms are unchanged from upstream)
- Orca installed (tested with 1.4.237); `ORCA_CLI_COMMAND` overrides the CLI path
- Node.js and the Rust toolchain to build

## Build and run

```bash
cd windows
npm install
npm run tauri dev      # development
npm run tauri -- build # release
```

Checks:

```bash
cd windows
npx tsc --noEmit
npm test
cargo test --lib --manifest-path src-tauri/Cargo.toml
```

## Where the Orca code lives

| Area | Path |
| --- | --- |
| Orca CLI client, worker projection, open/focus | `windows/src-tauri/src/orca.rs` |
| Hook relay with Orca identity | `windows/hook/src/main.rs` |
| Orca monitor and state sync | `windows/src/island/orca.ts`, `windows/src/core/state.ts` |
| Hook handling and provider detection | `windows/src/island/hooks.ts` |
| Skins and auto skin | `windows/src/mochi/engine.ts` |
| Tests | `windows/tests/orca.test.mjs`, `skin.test.mjs`, `hooks.test.mjs` |

## Upstream

This is a fork of Coucou by Louis Raillé; the original README is kept in [README.upstream.md](README.upstream.md). To pull upstream changes: `git fetch origin && git merge origin/main`.

## License

- **Code:** [MIT](LICENSE).
- **Name, Mochi character, icon, sounds and media:** © Louis Raillé, all rights reserved ([LICENSE-ASSETS.md](LICENSE-ASSETS.md)). This fork is a personal project that uses them as-is; if you publish your own fork, give it its own name and character.
