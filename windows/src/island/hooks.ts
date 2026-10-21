// Claude Code hook events → island state.
// Port of HookServer.processEvent / processPermissionRequest from the macOS app.
// Difference from macOS: no terminal filter. On Windows the hook fires from any
// terminal (Windows Terminal, VS Code, PowerShell…) and all of them are handled.

import { Bridge, onEvent } from "../core/bridge";
import { Sound } from "../core/sound";
import { State } from "../core/state";
import type { Island } from "./island";

const CLAUDE_ID = "integration_claude";

/** Clears the approval card if no decision was made before the hook gave up. */
let pendingTimeout: number | null = null;
const eventRevisions = new Map<string, number>();

interface CodexBinding {
  task: (typeof State.tasks)[number];
  run: string | null;
  path: string;
  session: string;
  turn: string;
  lastText?: string;
  lastStep?: string;
  nativeResponses?: Map<string,string>;
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
        const children = await Bridge.codexChildren(binding.path,binding.session);
        if (codexBindings.get(id) !== binding || binding.run !== State.orcaRunId || !State.tasks.includes(binding.task)) continue;
        State.syncNativeChildren(binding.session,children);
        const previous = binding.nativeResponses;
        const next = new Map<string,string>();
        for (const child of children) {
          const key = `${child.turn}:${child.phase}:${child.text ?? ""}`;
          next.set(child.id,key);
          // First discovery establishes a baseline, including inherited/history responses.
          if (child.text && previous?.has(child.id) && previous.get(child.id) !== key) assistantResponse(`native_${child.id}`,child.text,child.phase ?? "commentary",child.id,child.turn ?? "");
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
  transcript_path?: string;
  turn_id?: string;
  agent_id?: string;
  last_assistant_message?: string;
  orca_terminal_handle?: string;
  orca_pane_key?: string;
  cwd?: string;
  message?: string;
  /** UserPromptSubmit carries `prompt`; `message` belongs to Notification/Stop. */
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  /** Optional agent tag: lowercase, digits and hyphens, ≤ 24 chars. */
  coucou_agent?: string;
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

/** frenchStep() — same labels as the macOS app. */
const TOOL_LABELS: Record<string, string> = {
  Bash: "Exécute",
  run_command: "Exécute",
  exec_command: "Exécute",
  shell: "Exécute",
  write_stdin: "Exécute",
  Read: "Lit",
  view_file: "Lit",
  read_file: "Lit",
  Write: "Écrit",
  write_to_file: "Écrit",
  write_file: "Écrit",
  Edit: "Modifie",
  replace_file_content: "Modifie",
  multi_replace_file_content: "Modifie",
  apply_patch: "Modifie",
  edit_file: "Modifie",
  Glob: "Cherche",
  find_by_name: "Cherche",
  Grep: "Recherche",
  grep_search: "Recherche",
  WebSearch: "Recherche web",
  search_web: "Recherche web",
  WebFetch: "Récupère",
  read_url_content: "Récupère",
  TodoWrite: "Tâches",
  Task: "Agent",
  invoke_subagent: "Agent",
  LS: "Liste",
  list_dir: "Liste",
  MultiEdit: "Modifie",
  NotebookEdit: "Notebook",
  PowerShell: "Exécute",
};

function stepLabel(tool: string, input: Record<string, unknown>): string {
  const label = TOOL_LABELS[tool] ?? tool;
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : null);
  const cmd = str("command") ?? str("CommandLine") ?? str("cmd");
  if (cmd) return `${label} · ${cmd.slice(0, 40)}`;
  const path = str("path") ?? str("AbsolutePath") ?? str("TargetFile") ?? str("file_path");
  if (path) return `${label} · ${lastPathComponent(path)}`;
  const query = str("query") ?? str("pattern") ?? str("Query") ?? str("Pattern");
  if (query) return `${label} · ${query.slice(0, 40)}`;
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
  "CommandLine", // Antigravity run_command
  "cmd", // Codex exec_command
  "file_path", // Write, Edit, MultiEdit, NotebookEdit
  "TargetFile", // Antigravity write/replace
  "AbsolutePath", // Antigravity view_file
  "path", // Read, LS
  "url", // WebFetch
  "Url", // read_url_content
  "query", // WebSearch, search_web
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

function upsert(_projectName: string, cwd: string) {
  const t = State.tasks.find((x) => x.id === CLAUDE_ID);
  if (!t) return;
  t.name = State.settings.workspaceName || "Orca";
  if (State.settings.workspaceColor) t.color = State.settings.workspaceColor;
  if (cwd) t.sessionCwd = cwd;
}

function clearSession() {
  const t = State.tasks.find((x) => x.id === CLAUDE_ID);
  if (!t) return;
  t.steps = [];
  t.stepIndex = 0;
  t.name = State.settings.workspaceName || "Orca";
  t.color = State.settings.workspaceColor || "#F5F6F8";
  t.pillBadge = null;
}

export function registerHookHandlers(island: Island) {
  activeIsland = island;
  void onEvent<HookPayload>("hook", (payload) => handleHook(island, payload));
}

function handleHook(island: Island, payload: HookPayload) {
  if (State.paused) {
    // Silence here used to cost Claude Code nearly two minutes: the relay waited
    // for a decision from an island that had already decided not to look. Say so,
    // and the terminal takes the question immediately.
    if (payload.request_id) void Bridge.approvalDecline(payload.request_id);
    return;
  }

  const name = payload.hook_event_name ?? "";
  const cwd = payload.cwd ?? "";
  const raw = lastPathComponent(cwd);
  const projectName = aliasProjectName(raw || "Session");

  // Orca supplies ownership; workspace names and generic worktrees are not authority.
  let agentId = State.hookTaskId(cwd, payload.orca_terminal_handle, payload.orca_pane_key);
  if (agentId && payload.agent_id) {
    const owner = codexBindings.get(agentId);
    const child = State.childTasks.find(t => t.nativeSessionId === payload.agent_id && t.nativeParentSession === owner?.session);
    agentId = child?.id ?? null;
  }
  if (!agentId) {
    if (payload.request_id) void Bridge.approvalDecline(payload.request_id);
    return;
  }
  const task = State.tasks.find((item) => item.id === agentId);
  const provider = agentId === CLAUDE_ID ? State.orca?.coordinator?.provider
    : task?.nativeSessionId ? "codex" : State.orca?.workers.find((worker) => `orca_${worker.id}` === agentId)?.provider;
  // Provider subagents folded into a parent pane do not own that pane's messages.
  if (task && provider === "codex" && !payload.agent_id) {
    const previous = codexBindings.get(agentId);
    if (name === "SessionStart" || name === "UserPromptSubmit" || name === "SessionEnd" || (payload.turn_id && previous?.turn !== payload.turn_id)) codexBindings.delete(agentId);
    if (payload.transcript_path && payload.session_id && payload.turn_id) {
      const same = previous && codexBindings.get(agentId) === previous && previous.task === task && previous.run === State.orcaRunId && previous.path === payload.transcript_path && previous.session === payload.session_id && previous.turn === payload.turn_id;
      if (!same) codexBindings.set(agentId, {task, run: State.orcaRunId, path: payload.transcript_path, session: payload.session_id, turn: payload.turn_id});
    }
  }
  const isExternalAgent = agentId !== CLAUDE_ID;
  State.noteOrcaHook(agentId);
  const revision = (eventRevisions.get(agentId) ?? 0) + 1;
  eventRevisions.set(agentId, revision);

  const focused = agentId === CLAUDE_ID || State.focusId === agentId;

  /** Alerts force the island open; work events only reveal the compact island. */
  const surface = (view: Parameters<Island["alert"]>[0], isAlert = false) => {
    if (isAlert) State.setFocus(agentId);
    if (State.mode === "expanded") {
      island.setView(view);
    } else if (isAlert) {
      island.alert(view);
    } else if (State.mode === "hidden") {
      island.reveal?.();
    }
  };

  /** Only the verified coordinator can update the principal's workspace. */
  const ensurePill = () => {
    if (!isExternalAgent) upsert(projectName, cwd);
  };

  switch (name) {
    case "SessionStart":
      ensurePill();
      surface("overview", false);
      Sound.play("work");
      break;

    case "PreInvocation":
    case "UserPromptSubmit": {
      seenResponses.delete(agentId);
      ensurePill();
      State.updateTask(agentId, "thinking");
      // The field is `prompt`; reading `message` meant this step was always blank.
      const asked = payload.prompt ?? payload.message;
      if (asked) State.appendStep(agentId, asked.slice(0, 60));
      surface("overview", false);
      break;
    }

    case "PreToolUse": {
      ensurePill();
      State.updateTask(agentId, "working");
      const tool = payload.tool_name ?? "Tool";
      State.appendStep(agentId, stepLabel(tool, payload.tool_input ?? {}));
      surface("overview", false);
      break;
    }

    case "PostInvocation":
    case "PostToolUse":
      // A restart can miss PreToolUse while the tool is already running.
      // Restore only the missing step, using this verified session's payload.
      if (name === "PostToolUse" && payload.tool_name && !State.tasks.find((t) => t.id === agentId)?.steps.length) {
        State.appendStep(agentId, stepLabel(payload.tool_name, payload.tool_input ?? {}));
      }
      State.updateTask(agentId, "working");
      surface("overview", false);
      break;

    case "PostToolUseFailure":
      State.updateTask(agentId, "working");
      State.appendStep(agentId, "⚠ failed");
      surface("overview", false);
      break;

    case "Notification": {
      const message = payload.message ?? "";
      const lower = message.toLowerCase();
      if (lower.includes("rate limit") || lower.includes("limite d")) {
        State.updateTask(agentId, "ratelimit");
        Sound.play("rate");
      } else if (message.endsWith("?")) {
        State.updateTask(agentId, "question");
        State.appendStep(agentId, message);
      }
      break;
    }

    case "Stop":
      State.updateTask(agentId, "finished");
      State.setFinalSummary(agentId, payload.last_assistant_message);
      Sound.play("finish");
      assistantResponse(agentId, payload.last_assistant_message, "final_answer", payload.session_id, payload.turn_id);
      if (focused && State.mode === "expanded") surface("finished", false);
      else State.setPillBadge(agentId, "finished");
      window.setTimeout(() => {
        if (eventRevisions.get(agentId) !== revision) return;
        if (!isExternalAgent) {
          State.updateTask(agentId, "idle");
          State.setPillBadge(agentId, null);
        }
      }, 5200);
      break;

    case "StopFailure":
      State.updateTask(agentId, "error");
      Sound.play("error");
      if (focused) surface("error", false);
      else State.setPillBadge(agentId, "error");
      break;

    case "SessionEnd":
      if (isExternalAgent) {
        State.updateTask(agentId, "idle");
      } else {
        State.updateTask(agentId, "idle");
        clearSession();
      }
      break;

    case "SubagentStart":
      State.appendStep(agentId, "+ subagent");
      break;

    case "SubagentStop":
      State.appendStep(agentId, "• subagent done");
      break;

    case "PermissionRequest": {
      // External agents do not get an approval card — showing one would look like
      // a Claude Code request. Decline immediately so the agent re-asks in its
      // terminal. Approval support for other agents will come with Codex support.
      if (isExternalAgent) {
        if (payload.request_id) void Bridge.approvalDecline(payload.request_id);
        State.updateTask(agentId, "approval");
        State.setPillBadge(agentId, "approval");
        island.reveal?.();
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
      upsert(projectName, cwd);
      if (pendingTimeout != null) window.clearTimeout(pendingTimeout);
      const tool = payload.tool_name ?? "Tool";
      const input = payload.tool_input ?? {};
      State.pendingApproval = {
        requestId,
        sessionId: payload.session_id ?? "",
        tool,
        command: approvalTarget(tool, input),
      };
      State.setFocus(CLAUDE_ID);
      // The relay's short ack window closes in 800 ms; everything below this
      // line is synchronous, so the card really is up by the time it lands.
      if (requestId) void Bridge.approvalAck(requestId);
      State.updateTask(CLAUDE_ID, "approval");
      State.isPinned = true;
      Sound.play("approval");
      if (focused) {
        island.alert("approval");
      } else {
        // Another agent holds the view, so the card would yank it away. The badge
        // is the signal instead — but it has to be on screen for that to mean
        // anything, hence the reveal. We just told the relay a human can act.
        State.setPillBadge(CLAUDE_ID, "approval");
        island.reveal();
      }
      // Coucou answers within 108 s or not at all; after that the terminal has
      // taken over and the card would be lying.
      pendingTimeout = window.setTimeout(() => {
        pendingTimeout = null;
        if (!State.pendingApproval) return;
        State.pendingApproval = null;
        State.isPinned = false;
        island.dropPin();
        State.updateTask(CLAUDE_ID, "working");
        State.setPillBadge(CLAUDE_ID, null);
        if (State.view === "approval") island.setView(State.defaultView());
        State.notify();
      }, 110_000);
      break;
    }

    default:
      break;
  }
  State.notify();
}
