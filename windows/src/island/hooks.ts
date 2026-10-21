// Hook events from Claude Code and every other agent → island state.
// Port of HookServer.processEvent / processPermissionRequest from the macOS app.
// Difference from macOS: no terminal filter. On Windows the hook fires from any
// terminal (Windows Terminal, VS Code, PowerShell…) and all of them are handled.
// The relay has already mapped every agent's events and fields onto Claude
// Code's (hook/src/normalize.rs), so one handler serves them all.

import { Bridge, onEvent } from "../core/bridge";
import { buildFileDiff, fileName, makeDiffStep, toOneLine } from "../core/diff";
import { Sound } from "../core/sound";
import { State, type AskedQuestion } from "../core/state";
import { pillDefinition } from "../core/pills";
import { APPROVAL_AGENTS, agentColor, agentName, validateAgent } from "./agents";
import type { Island } from "./island";
import { parseClaudePlan, restorePlanUsage } from "../core/plan";
import { setClaudePlanUsage, storedClaudePlanUsage } from "../views/usage";
import { N_, t } from "../i18n/i18n";

const CLAUDE_ID = "integration_claude";
const CURSOR_ID = "agent_cursor";

/** Clears the approval card if no decision was made before the hook gave up. */
let pendingTimeout: number | null = null;

/** Takes the approval or question card down and gives the island back. */
export function dropPendingCard(island: Island): void {
  if (!State.pendingApproval) return;
  State.endApproval();
  island.dropPin();
  if (State.view === "approval" || State.view === "question") {
    island.setView(State.defaultView());
  }
  State.notify();
}

/** The return to idle that Stop arms, per pill, so the next turn can cancel it. */
const stopTimers = new Map<string, number>();

function cancelStopTimer(id: string): boolean {
  const timer = stopTimers.get(id);
  if (timer == null) return false;
  window.clearTimeout(timer);
  stopTimers.delete(id);
  return true;
}

/** Events after which a pending permission request of the same session is moot. */
const TURN_OVER = new Set(["Stop", "StopFailure", "UserPromptSubmit", "SessionEnd", "Interrupt"]);

const eventRevisions = new Map<string, number>();

interface CodexBinding {
  task: (typeof State.tasks)[number];
  run: string | null;
  path: string;
  session: string;
  turn: string;
  lastText?: string;
  lastStep?: string;
  nativeResponses?: Map<string, string>;
}
const codexBindings = new Map<string, CodexBinding>();
let activeIsland: Island | null = null;
const seenResponses = new Map<string, string>();
function assistantResponse(id: string, text: string | undefined, phase: string, session = "", turn = "") {
  if (!text?.trim()) return;
  const key = `${State.orcaRunId}:${session}:${turn}:${phase}:${text}`;
  if (seenResponses.get(id) === key) return;
  seenResponses.set(id, key);
  if (State.mode !== "expanded") activeIsland?.alert(phase === "final_answer" && State.focusId === id ? "finished" : "overview");
}

/** Read only a hook-published transcript for the exact observed task and turn. */
export async function pollCodexMessages() {
  for (const [id, binding] of [...codexBindings]) {
    if (State.paused || binding.run !== State.orcaRunId || !State.tasks.includes(binding.task)) {
      codexBindings.delete(id);
      continue;
    }
    try {
      if (id === CLAUDE_ID && Bridge.codexChildren) {
        const children = await Bridge.codexChildren(binding.path, binding.session);
        if (codexBindings.get(id) !== binding || binding.run !== State.orcaRunId || !State.tasks.includes(binding.task)) continue;
        State.syncNativeChildren(binding.session, children);
        const previous = binding.nativeResponses;
        const next = new Map<string, string>();
        for (const child of children) {
          const key = `${child.turn}:${child.phase}:${child.text ?? ""}`;
          next.set(child.id, key);
          if (child.text && previous?.has(child.id) && previous.get(child.id) !== key) {
            assistantResponse(`native_${child.id}`, child.text, child.phase ?? "commentary", child.id, child.turn ?? "");
          }
        }
        binding.nativeResponses = next;
      }
      const response = await Bridge.codexMessage(binding.path, binding.session, binding.turn);
      if (!response || codexBindings.get(id) !== binding || binding.run !== State.orcaRunId || !State.tasks.includes(binding.task)) continue;
      if (response.phase === "commentary" && !["finished", "error", "idle"].includes(binding.task.state)) {
        if (response.text !== binding.lastText || binding.task.steps.at(-1) !== binding.lastStep) {
          const fresh = response.text !== binding.lastText;
          State.appendAssistantMessage(id, response.text);
          if (fresh) assistantResponse(id, response.text, response.phase, binding.session, binding.turn);
          binding.lastText = response.text;
          binding.lastStep = binding.task.steps.at(-1);
        }
      } else if (response.phase === "final_answer" && binding.task.state === "finished" && !binding.task.finalSummary) {
        State.setFinalSummary(id, response.text);
        assistantResponse(id, response.text, response.phase, binding.session, binding.turn);
      }
    } catch { /* An unavailable exact transcript cannot authorize a guessed session. */ }
  }
}

interface HookPayload {
  hook_event_name?: string;
  request_id?: string;
  session_id?: string;
  cwd?: string;
  project_root?: string;
  message?: string;
  /** UserPromptSubmit carries `prompt`; `message` belongs to Notification/Stop. */
  prompt?: string;
  /** Stop: the turn's final answer (Markdown) — Claude Code's, Hermes's, Codex's. */
  last_assistant_message?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  /** Set by the relay when an edit was too big to forward whole (> 256 KB). */
  coucou_diff_truncated?: boolean;
  /** Optional agent tag: lowercase, digits and hyphens, ≤ 24 chars. */
  coucou_agent?: string;
  /** Claude Code subagent event identity and display type. */
  agent_id?: string;
  agent_type?: string;
  /** Hermes: where the session runs (telegram, discord…; "cli" in a terminal). */
  platform?: string;
  /** "cursor" when Claude Code runs in Cursor's terminal (set by the relay). */
  term_editor?: string;
  orca_terminal_handle?: string;
  orca_pane_key?: string;
  turn_id?: string;
  transcript_path?: string;
  /** StatusLine (the plan usage relay): Claude Code's 5-hour and weekly limits. */
  rate_limits?: unknown;
}

const PROJECT_ALIASES: Record<string, string> = {
  "notch-buddy": "Notch Buddy",
  notchbuddy: "Notch Buddy",
  notch_buddy: "Notch Buddy",
};

function aliasProjectName(name: string): string {
  return PROJECT_ALIASES[name.toLowerCase()] ?? name;
}

function lastPathComponent(p: string): string {
  const cleaned = p.replace(/[\\/]+$/, "");
  const idx = Math.max(cleaned.lastIndexOf("\\"), cleaned.lastIndexOf("/"));
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
}

/**
 * localizedStep() — same labels as the macOS app, in English and shown in the
 * interface language (src/i18n) when the step is recorded.
 */
const TOOL_LABELS: Record<string, string> = {
  Bash: N_("Runs"),
  Read: N_("Reads"),
  Write: N_("Writes"),
  Edit: N_("Edits"),
  Glob: N_("Searches"),
  Grep: N_("Searches"),
  WebSearch: N_("Searches the web"),
  WebFetch: N_("Fetches"),
  TodoWrite: N_("Tasks"),
  Task: N_("Agent"),
  LS: N_("Lists"),
  MultiEdit: N_("Edits"),
  NotebookEdit: N_("Notebook"),
  PowerShell: N_("Runs"),
  // Antigravity's tools (#298).
  run_command: N_("Runs"),
  view_file: N_("Reads"),
  write_to_file: N_("Writes"),
  replace_file_content: N_("Edits"),
  read_url_content: N_("Fetches"),
  search_web: N_("Searches the web"),
  ask_question: N_("Needs input"),
};

function stepLabel(tool: string, input: Record<string, unknown>): string {
  const labelTool = tool === "ask_question" || tool.endsWith(":ask_question") ? "ask_question" : tool;
  const label = TOOL_LABELS[labelTool] ? t(TOOL_LABELS[labelTool]) : tool;
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : null);
  const cmd = str("command");
  if (cmd) return `${label} · ${cmd.slice(0, 40)}`;
  const path = str("path");
  if (path) return `${label} · ${lastPathComponent(path)}`;
  const file = str("file_path");
  if (file) return `${label} · ${lastPathComponent(file)}`;
  const query = str("query");
  if (query) return `${label} · ${query.slice(0, 40)}`;
  if (
    (tool === "ask_question" || tool.endsWith(":ask_question")) &&
    Array.isArray(input.questions) &&
    input.questions.length > 0
  ) {
    const firstQ = input.questions[0];
    if (typeof firstQ === "object" && firstQ !== null && typeof (firstQ as Record<string, unknown>).question === "string") {
      const q = ((firstQ as Record<string, unknown>).question as string).trim();
      if (q) return `${label} · ${q.slice(0, 40)}`;
    }
  }
  return label;
}

/**
 * What the Allow button actually authorises. Approving "Write" tells you nothing
 * — approving `Write · C:\…\.env` tells you everything, and the difference is
 * the whole point of approving from the island rather than blind.
 *
 * Ordered by how specific the field is, so an unfamiliar tool still shows
 * whatever identifying string it carries instead of falling back to its name.
 */
const APPROVAL_FIELDS = [
  "command", // Bash, PowerShell
  "file_path", // Write, Edit, MultiEdit, NotebookEdit
  "path", // Read, LS
  "url", // WebFetch
  "query", // WebSearch
  "pattern", // Glob, Grep
  "prompt", // Task
] as const;

function approvalTarget(tool: string, input: Record<string, unknown>): string {
  for (const field of APPROVAL_FIELDS) {
    const value = input[field];
    if (typeof value === "string" && value.trim()) {
      return `${tool} · ${value.trim()}`;
    }
  }
  return tool;
}

/**
 * The questions of an AskUserQuestion call, if the island can show all of them
 * as options to pick from. Anything it cannot is left to the terminal.
 */
function askedQuestions(tool: string, input: Record<string, unknown>): AskedQuestion[] | null {
  if (tool !== "AskUserQuestion" || !Array.isArray(input.questions)) return null;
  const out: AskedQuestion[] = [];
  for (const raw of input.questions as Record<string, unknown>[]) {
    const question = typeof raw?.question === "string" ? raw.question : "";
    const options = (Array.isArray(raw?.options) ? (raw.options as Record<string, unknown>[]) : [])
      .filter((o) => typeof o?.label === "string" && o.label)
      .map((o) => ({
        label: o.label as string,
        description: typeof o.description === "string" ? o.description : "",
      }));
    // A question cut short by the relay would be answered under the wrong text.
    if (!question || question.endsWith("…") || options.length < 2) return null;
    out.push({ question, options, multiSelect: raw.multiSelect === true });
  }
  return out.length > 0 ? out : null;
}

/** The Claude Code session's pill, named after its project for the session. */
function upsert(id: string, projectName: string, cwd: string, sessionId: string, projectId?: string, baseId = id) {
  const t = State.upsertWorkspacePill(id, projectName, cwd, projectId, baseId);
  if (t && sessionId) t.sessionId = sessionId;
}

/** The session is over: the pill goes back as it was, or away if it was only there for it. */
function clearSession(id: string) {
  const t = State.tasks.find((x) => x.id === id);
  if (!t) return;
  if (!State.isKept(id)) {
    State.removeTask(id);
    return;
  }
  t.state = "idle";
  t.steps = [];
  t.stepIndex = 0;
  delete t.stepSeq;
  t.name = pillDefinition(id)?.name ?? t.name;
  t.pillBadge = null;
  t.sessionId = null;
  t.finalLine = null;
}

/** The final message stays on the card until the next turn starts. */
function clearFinalLine(id: string) {
  const t = State.tasks.find((x) => x.id === id);
  if (t) t.finalLine = null;
}

/**
 * PostToolUse of Edit / MultiEdit / Write → a diff stored for the pill and a
 * ticker step with its +N −M counts. Nothing is kept for a pill that does not
 * exist, so a stray event cannot grow memory. An edit the relay had to cut
 * would give wrong counts: the PreToolUse step ("Edits · file") stands alone.
 */
function recordDiff(agentId: string, payload: HookPayload) {
  if (payload.coucou_diff_truncated) return;
  if (!State.tasks.some((t) => t.id === agentId)) return;
  const diff = buildFileDiff(payload.tool_name ?? "", payload.tool_input ?? {});
  if (!diff) return;
  const id = State.appendSessionDiff(agentId, diff);
  State.appendStep(agentId, makeDiffStep(fileName(diff.path), diff.added, diff.removed, id));
}

export function registerHookHandlers(island: Island) {
  activeIsland = island;
  // The last plan numbers seen survive a restart, as on the Mac.
  State.planUsage ??= restorePlanUsage(storedClaudePlanUsage());
  void onEvent<HookPayload>("hook", (payload) => handleHook(island, payload));
}

function handleHook(island: Island, payload: HookPayload) {
  // Account-wide numbers from the status line relay, not part of any session:
  // keep the latest, nothing else (no reveal, no sound), paused or not.
  if (payload.hook_event_name === "StatusLine") {
    const usage = parseClaudePlan(payload.rate_limits);
    if (usage) setClaudePlanUsage(usage);
    return;
  }

  if (State.paused) {
    // Silence here used to cost Claude Code nearly two minutes: the relay waited
    // for a decision from an island that had already decided not to look. Say so,
    // and the terminal takes the question immediately.
    if (payload.request_id) void Bridge.approvalDecline(payload.request_id);
    return;
  }

  const name = payload.hook_event_name ?? "";
  const cwd = payload.cwd ?? "";
  const projectId = payload.project_root ?? "";
  const raw = lastPathComponent(cwd);
  const projectName = aliasProjectName(raw || "Session");

  // Route to the right pill. Valid coucou_agent → dynamic "agent_<name>" pill.
  // "claude" is reserved; absent or invalid → Claude Code's own pill: Cursor's
  // when it runs in Cursor's terminal (Mac #120), VS Code's otherwise.
  const validAgent = validateAgent(payload.coucou_agent);
  const workspaceId = payload.term_editor === "cursor" ? CURSOR_ID : CLAUDE_ID;
  const baseAgentId = validAgent ? `agent_${validAgent}` : workspaceId;
  const sessionId = payload.session_id ?? "";
  const workerId = sessionId ? `:${encodeURIComponent(sessionId)}` : "";

  let agentId: string;
  if (State.orca) {
    const orcaTarget = State.hookTaskId(cwd, payload.orca_terminal_handle, payload.orca_pane_key);
    let resolved = orcaTarget;
    if (resolved && payload.agent_id) {
      const owner = codexBindings.get(resolved);
      const child = State.childTasks.find((t) => t.nativeSessionId === payload.agent_id && t.nativeParentSession === owner?.session);
      resolved = child?.id ?? null;
    }
    if (!resolved) {
      if (payload.request_id) void Bridge.approvalDecline(payload.request_id);
      return;
    }
    agentId = resolved;
  } else {
    agentId = projectId ? `project:${encodeURIComponent(projectId)}:${baseAgentId}${workerId}` : baseAgentId;
  }

  const subagentId = projectId && payload.agent_id
    ? `${agentId}:subagent:${encodeURIComponent(payload.agent_id)}`
    : null;
  const isExternalAgent = validAgent !== null || (Boolean(State.orca) && agentId !== CLAUDE_ID);

  State.noteOrcaHook(agentId);
  const revision = (eventRevisions.get(agentId) ?? 0) + 1;
  eventRevisions.set(agentId, revision);

  const task = State.tasks.find((item) => item.id === agentId);
  const provider = agentId === CLAUDE_ID ? State.orca?.coordinator?.provider
    : task?.nativeSessionId ? "codex" : State.orca?.workers.find((worker) => `orca_${worker.id}` === agentId)?.provider;
  if (task && provider === "codex" && !payload.agent_id) {
    const previous = codexBindings.get(agentId);
    if (name === "SessionStart" || name === "UserPromptSubmit" || name === "SessionEnd" || (payload.turn_id && previous?.turn !== payload.turn_id)) {
      codexBindings.delete(agentId);
    }
    if (payload.transcript_path && payload.session_id && payload.turn_id) {
      const same = previous && codexBindings.get(agentId) === previous && previous.task === task && previous.run === State.orcaRunId && previous.path === payload.transcript_path && previous.session === payload.session_id && previous.turn === payload.turn_id;
      if (!same) {
        codexBindings.set(agentId, { task, run: State.orcaRunId, path: payload.transcript_path, session: payload.session_id, turn: payload.turn_id });
      }
    }
  }

  /** Alerts force the island open; work events only reveal the compact island. */
  const surface = (view: Parameters<Island["alert"]>[0], isAlert: boolean) => {
    if (State.mode === "expanded") {
      if (isAlert) island.setView(view);
    } else if (isAlert) {
      island.alert(view);
    } else if (State.mode === "hidden") {
      island.reveal();
    }
  };

  /** Ensure the agent pill exists (no-op for Claude Code). */
  const ensurePill = () => {
    if (isExternalAgent) {
      State.upsertExternalAgent(agentId, agentName(validAgent!), agentColor(validAgent!), projectId || undefined, projectName, baseAgentId, validAgent);
      const t = State.tasks.find((x) => x.id === agentId);
      if (t && cwd) t.sessionCwd = cwd;
      if (t && sessionId) t.sessionId = sessionId;
    } else {
      upsert(agentId, projectName, cwd, sessionId, projectId || undefined, baseAgentId);
      const task = State.tasks.find((x) => x.id === agentId);
      if (task) task.provider = validAgent ?? (baseAgentId === CLAUDE_ID ? "claude" : null);
    }
  };

  /**
   * Called where a handler is about to replace `finished` with a newer state:
   * the timer Stop armed would otherwise put the pill back to idle over it. The
   * badge that timer was going to clear goes now.
   */
  const supersedeStop = () => {
    if (cancelStopTimer(agentId)) State.setPillBadge(agentId, null);
  };

  // The turn that asked for a permission is over — answered in the terminal,
  // interrupted, or a new prompt — so the card would be lying. It goes, and the
  // relay is released without a decision. Same rule as the Mac.
  const pending = State.pendingApproval;
  if (
    pending &&
    TURN_OVER.has(name) &&
    pending.pillId === agentId &&
    pending.sessionId === (payload.session_id ?? "")
  ) {
    if (pendingTimeout != null) window.clearTimeout(pendingTimeout);
    pendingTimeout = null;
    if (pending.requestId) void Bridge.approvalDecline(pending.requestId);
    dropPendingCard(island);
  }

  // Read after the card above is dropped: its pill may have handed the front
  // back to the pill you were on.
  const focused = State.focusId === agentId;

  switch (name) {
    case "SessionStart":
      ensurePill();
      clearFinalLine(agentId);
      // Hermes through its gateway says where the session comes from.
      if (validAgent === "hermes" && payload.platform && payload.platform !== "cli") {
        State.appendStep(agentId, payload.platform.charAt(0).toUpperCase() + payload.platform.slice(1));
      }
      surface("overview", false);
      Sound.play("work");
      break;

    case "UserPromptSubmit": {
      seenResponses.delete(agentId);
      ensurePill();
      supersedeStop();
      clearFinalLine(agentId);
      State.updateTask(agentId, "thinking");
      // The field is `prompt`; reading `message` meant this step was always blank.
      const asked = payload.prompt ?? payload.message;
      if (asked) State.appendStep(agentId, asked.slice(0, 60));
      surface("overview", false);
      break;
    }

    case "PreToolUse": {
      ensurePill();
      supersedeStop();
      clearFinalLine(agentId);
      const tool = payload.tool_name ?? "Tool";
      const isQuestion = tool === "ask_question" || tool.endsWith(":ask_question");
      if (isQuestion) {
        State.updateTask(agentId, "question");
        State.appendStep(agentId, stepLabel(tool, payload.tool_input ?? {}));
        Sound.play("question");
        surface("overview", true);
      } else {
        State.updateTask(agentId, "working");
        State.appendStep(agentId, stepLabel(tool, payload.tool_input ?? {}));
        surface("overview", false);
      }
      break;
    }

    case "PostToolUse":
      supersedeStop();
      // A restart can miss PreToolUse while the tool is already running.
      // Restore only the missing step, using this verified session's payload.
      if (State.orca && payload.tool_name && !State.tasks.find((t) => t.id === agentId)?.steps.length) {
        State.appendStep(agentId, stepLabel(payload.tool_name, payload.tool_input ?? {}));
      }
      State.updateTask(agentId, "working");
      surface("overview", false);
      // The question was answered in the terminal: the card would be lying.
      if (
        payload.tool_name === "AskUserQuestion" &&
        State.pendingApproval?.questions &&
        State.pendingApproval.sessionId === (payload.session_id ?? "")
      ) {
        if (pendingTimeout != null) window.clearTimeout(pendingTimeout);
        pendingTimeout = null;
        dropPendingCard(island);
      }
      recordDiff(agentId, payload);
      break;

    case "PostToolUseFailure":
      supersedeStop();
      State.updateTask(agentId, "working");
      State.appendStep(agentId, t("⚠ failed"));
      break;

    case "Notification": {
      const message = payload.message ?? "";
      const lower = message.toLowerCase();
      if (lower.includes("rate limit") || lower.includes("limite d")) {
        supersedeStop();
        State.updateTask(agentId, "ratelimit");
        Sound.play("rate");
      } else if (message.endsWith("?")) {
        supersedeStop();
        State.updateTask(agentId, "question");
        State.appendStep(agentId, message);
      }
      break;
    }

    case "Stop": {
      if (payload.last_assistant_message) {
        State.setFinalSummary(agentId, payload.last_assistant_message);
        assistantResponse(agentId, payload.last_assistant_message, "final_answer", payload.session_id, payload.turn_id);
      }
      State.updateTask(agentId, "finished");
      // Claude Code puts the turn's answer in the Stop payload itself, so there is
      // no transcript to read (the relay does not even forward its path). Other
      // agents report their last words the same way (Hermes, Codex) or as
      // `message`.
      const finalText = toOneLine(payload.last_assistant_message ?? payload.message ?? "");
      if (finalText) {
        State.appendStep(agentId, finalText);
        const t = State.tasks.find((x) => x.id === agentId);
        if (t) t.finalLine = finalText;
      }
      Sound.play("finish");
      // A card waiting for an answer is never covered by another alert.
      if (State.orca) {
        if (focused && State.mode === "expanded") surface("finished", false);
        else State.setPillBadge(agentId, "finished");
      } else {
        if (focused && !State.pendingApproval) surface("finished", true);
        else State.setPillBadge(agentId, "finished");
      }
      cancelStopTimer(agentId);
      stopTimers.set(
        agentId,
        window.setTimeout(() => {
          stopTimers.delete(agentId);
          if (isExternalAgent) {
            State.removeTask(agentId);
          } else {
            State.updateTask(agentId, "idle");
            State.setPillBadge(agentId, null);
          }
        }, 5200),
      );
      break;
    }

    case "Interrupt":
      // Codex: the user stopped the turn. Back to idle, nothing to celebrate.
      supersedeStop();
      State.updateTask(agentId, "idle");
      State.setPillBadge(agentId, null);
      break;

    case "StopFailure":
      supersedeStop();
      State.updateTask(agentId, "error");
      Sound.play("error");
      if (focused && !State.pendingApproval) surface("error", true);
      else State.setPillBadge(agentId, "error");
      break;

    case "SessionEnd":
      // Nothing left for the timer to do, and it must not outlive the session: a
      // pill recreated within 5.2 s would be removed by it.
      cancelStopTimer(agentId);
      State.clearSessionDiffs(agentId);
      for (const child of State.tasks.filter((task) => task.id.startsWith(`${agentId}:subagent:`))) {
        cancelStopTimer(child.id);
        State.removeTask(child.id);
      }
      if (isExternalAgent) {
        State.removeTask(agentId);
      } else {
        State.updateTask(agentId, "idle");
        clearSession(agentId);
      }
      break;

    case "SubagentStart":
      if (subagentId) {
        ensurePill();
        const parent = State.tasks.find((task) => task.id === agentId);
        State.upsertExternalAgent(subagentId, payload.agent_type || "Subagent", parent?.color ?? agentColor("codex"), projectId, projectName, subagentId, parent?.provider ?? validAgent);
        const child = State.tasks.find((task) => task.id === subagentId);
        if (child) {
          if (cwd) child.sessionCwd = cwd;
          child.sessionId = sessionId || null;
        }
        cancelStopTimer(subagentId);
        State.updateTask(subagentId, "working");
        State.appendStep(subagentId, t("+ subagent"));
      } else {
        State.appendStep(agentId, t("+ subagent"));
      }
      break;

    case "SubagentStop":
      if (subagentId && State.tasks.some((task) => task.id === subagentId)) {
        State.updateTask(subagentId, "finished");
        State.appendStep(subagentId, t("• subagent done"));
        cancelStopTimer(subagentId);
        stopTimers.set(subagentId, window.setTimeout(() => {
          stopTimers.delete(subagentId);
          State.removeTask(subagentId);
        }, 5200));
      } else {
        State.appendStep(agentId, t("• subagent done"));
      }
      break;

    case "PermissionRequest": {
      // Only Claude Code and the agents the relay can answer for (Codex, Copilot
      // CLI, Muse Code — same as the Mac) get a card. Anyone else's request is
      // declined at once, so the agent asks in its own terminal.
      if (isExternalAgent && !APPROVAL_AGENTS.has(validAgent!)) {
        if (payload.request_id) void Bridge.approvalDecline(payload.request_id);
        break;
      }

      const requestId = payload.request_id ?? "";
      // One card, one request. A second one must never quietly replace the first
      // — that would leave a human staring at request B while request A waits for
      // a decision nobody can give. Hand it straight back to the terminal.
      if (State.pendingApproval && State.pendingApproval.requestId !== requestId) {
        if (requestId) void Bridge.approvalDecline(requestId);
        break;
      }
      ensurePill();
      supersedeStop();
      if (pendingTimeout != null) window.clearTimeout(pendingTimeout);
      const tool = payload.tool_name ?? "Tool";
      const input = payload.tool_input ?? {};
      // Claude Code asking a question is not a permission to grant: the island
      // shows the options and sends back the one that was picked. Only Claude
      // Code asks questions this way.
      const questions = isExternalAgent ? null : askedQuestions(tool, input);
      const view = questions ? "question" : "approval";
      // The card always comes up, even over another pill or an island that is
      // already open: its pill comes to the front, and the one you were on
      // comes back once you answer (Mac #117, #120).
      State.beginApproval({
        requestId,
        sessionId,
        pillId: agentId,
        tool,
        command: approvalTarget(tool, input),
        ...(questions ? { questions } : {}),
      });
      // The relay's short ack window closes in 800 ms; everything below this
      // line is synchronous, so the card really is up by the time it lands.
      if (requestId) void Bridge.approvalAck(requestId);
      State.updateTask(agentId, view);
      Sound.play(view);
      // Any agent's card (Claude Code, Codex, Copilot CLI, Muse Code) comes up
      // the same way: beginApproval brought its pill to the front.
      island.alert(view);
      // Coucou answers within 108 s or not at all; after that the terminal has
      // taken over and the card would be lying.
      pendingTimeout = window.setTimeout(() => {
        pendingTimeout = null;
        dropPendingCard(island);
      }, 110_000);
      break;
    }

    default:
      break;
  }
  State.notify();
}
