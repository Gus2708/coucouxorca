// App state — mirror of AppState.swift (the parts the island needs).

import type { BotEmoteName, BotStateName, IslandMode, IslandViewName } from "./layout";
import type { EyeShape, AvatarSkin } from "../mochi/engine";

export type AgentSource = "claudeCode" | "n8n" | "agent";
export type PillBadge = "approval" | "finished" | "error";

export interface AgentTask {
  id: string;
  name: string;
  color: string;
  state: BotStateName;
  stepIndex: number;
  steps: string[];
  source: AgentSource;
  isIntegration: boolean;
  emote?: BotEmoteName | null;
  miniEye?: EyeShape | null;
  pillBadge?: PillBadge | null;
  sessionCwd?: string | null;
  /** Set only from Orca's verified Run/Dispatch relationship. */
  parentId?: string | null;
  provider?: string | null;
  nativeTurn?: string | null;
  nativeSettledAt?: number;
  nativeSessionId?: string;
  nativeParentSession?: string;
  terminalHandle?: string;
  paneKey?: string | null;
  finalSummary?: string | null;
  completionRevision?: number;
  completionAttempts?: number;
}

export interface OrcaRun {
  id: string;
  objective: string;
  coordinatorHandle: string;
}

export interface OrcaActivity {
  state: BotStateName;
  step?: string | null;
  prompt?: string | null;
  updatedAt: number;
  finalResponse?: string | null;
}

export interface OrcaSnapshot {
  runs: OrcaRun[];
  selectedRun: OrcaRun | null;
  coordinator: { handle: string; cwd: string | null; connected: boolean; provider?: string | null; paneKey?: string | null; activity?: OrcaActivity | null } | null;
  workers: { id: string; taskId?: string; name: string; state: BotStateName; cwd: string | null; terminalHandle: string; paneKey?: string | null; provider: string | null; settled?: boolean; activity?: OrcaActivity | null }[];
}

/** Extract plain display text from the first prose block of an assistant response. */
export function firstFinalParagraph(text?: string | null): string | null {
  if (!text?.trim()) return null;
  const lines = text.slice(0, 12000).replace(/\r\n?/g, "\n").split("\n");
  const paragraph: string[] = [];
  let fence = false;
  for (const line of lines) {
    const value = line.trim();
    if (/^(```|~~~)/.test(value)) { if (paragraph.length) break; fence = !fence; continue; }
    if (fence) continue;
    if (!value || /^#{1,6}\s/.test(value) || /^\|/.test(value) || /^[-*_]{3,}$/.test(value)) {
      if (paragraph.length) break;
      continue;
    }
    const item = value.replace(/^(?:[-*+]\s+|\d+[.)]\s+|>\s*)/, "");
    paragraph.push(item);
    if (item !== value) break;
  }
  const result = paragraph.join(" ").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)").replace(/\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`/g, (_all, bold, emphasis, code) => bold ?? emphasis ?? code).replace(/\s+/g, " ").trim();
  return result ? result.slice(0, 1600) : null;
}

export interface ApprovalInfo {
  requestId: string;
  sessionId: string;
  tool: string;
  command: string;
}

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

export type PromptContext =
  | { kind: "window"; appName: string; title: string; url?: string }
  | { kind: "file"; name: string; path?: string };

export interface ResultItem {
  label: string;
  detail: string;
  url?: string;
}

export interface SearchResult {
  title: string;
  items: ResultItem[];
  note?: string;
}

const task = (
  id: string, name: string, color: string, source: AgentSource,
): AgentTask => ({
  id, name, color, state: "idle", stepIndex: 0, steps: [], source, isIntegration: true,
});

/** AgentTask.integrationAgents — same ids, names and colours as macOS. */
export const INTEGRATION_AGENTS: AgentTask[] = [
  task("integration_claude", "Orca", "#F5F6F8", "claudeCode"),
  task("integration_resend", "Resend", "#22C55E", "n8n"),
  task("integration_n8n", "n8n", "#F29B38", "n8n"),
  task("integration_vercel", "Vercel", "#7C5CFF", "n8n"),
  task("integration_github", "GitHub", "#F4505E", "n8n"),
  task("integration_notion", "Notion", "#8C8C8C", "n8n"),
  task("integration_calcom", "Cal.com", "#C9956A", "n8n"),
  task("integration_stripe", "Stripe", "#0570DE", "n8n"),
];

export const TOGGLEABLE_INTEGRATION_IDS = [
  "integration_resend", "integration_n8n", "integration_vercel", "integration_github",
  "integration_notion", "integration_calcom", "integration_stripe",
];

/** What an integration poller last reported. */
export interface IntegrationInfo {
  data: Record<string, unknown>;
  error: string | null;
  loaded: boolean;
  configured: boolean;
}

export interface Settings {
  orcaSkin: boolean;
  principalSkin?: AvatarSkin | null;
  soundEnabled: boolean;
  soundVolume: number;
  autoCloseInterval: number;
  absenceInterval: number;
  activeIntegrations: string[];
  screen: "primary" | "cursor";
  autostart: boolean;
  hooksInstalled: boolean;
  /** Claude model used by the chat. */
  model: string;
  workspaceName?: string;
  workspaceColor?: string;
}

export function principalSkin(settings: Pick<Settings, "principalSkin" | "orcaSkin">): AvatarSkin {
  return settings.principalSkin ?? (settings.orcaSkin ? "orca" : "classic");
}

export const DEFAULT_SETTINGS: Settings = {
  orcaSkin: false,
  principalSkin: null,
  soundEnabled: true,
  soundVolume: 0.12,
  autoCloseInterval: 15,
  absenceInterval: 180,
  activeIntegrations: [
    "integration_resend", "integration_n8n", "integration_vercel", "integration_github",
  ],
  screen: "primary",
  autostart: false,
  hooksInstalled: false,
  model: "claude-opus-5",
  workspaceName: "Orca",
  workspaceColor: "#F5F6F8",
};

type Listener = () => void;

class AppState {
  mode: IslandMode = "hidden";
  view: IslandViewName = "overview";

  tasks: AgentTask[] = [];
  focusId: string | null = null;
  orca: OrcaSnapshot | null = null;
  orcaRunId: string | null = null;
  manualOrcaRunId: string | null = null;
  orcaError: string | null = null;
  private observedOrcaWorkers = new Set<string>();
  private settledOrcaWorkers = new Map<string, number>();
  private finalizedOrcaWorkers = new Map<string, OrcaSnapshot["workers"][number]>();
  private activeOrcaWorkers = new Map<string, { worker: OrcaSnapshot["workers"][number]; lastSeenAt: number }>();

  stateOverride: BotStateName | null = null;

  /** Cursor in logical screen pixels, origin top-left (like AppState.mousePosition). */
  mouse = { x: 0, y: 0 };
  /** Cursor relative to the island's top-left corner. */
  mouseInIsland = { x: 0, y: 0 };

  isPinned = false;
  paused = false;

  uploadProgress = 0;
  uploadDuration = 2.4;
  fileDragOver = false;

  promptContext: PromptContext | null = null;
  droppedFile: { name: string; path: string } | null = null;
  noteMessage: string | null = null;
  searchResult: SearchResult | null = null;
  chatHistory: ChatMessage[] = [];
  pendingApproval: ApprovalInfo | null = null;

  integrations: Record<string, IntegrationInfo> = {};

  lastActivity = performance.now();

  settings: Settings = { ...DEFAULT_SETTINGS };

  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Marks the UI dirty; the island re-renders on the next frame. */
  notify() {
    for (const fn of this.listeners) fn();
  }

  get focusTask(): AgentTask | null {
    return this.tasks.find((t) => t.id === this.focusId) ?? this.tasks[0] ?? null;
  }

  get coordinatorTask(): AgentTask | null {
    return this.tasks.find((t) => t.id === "integration_claude") ?? null;
  }

  providerLabel(provider?: string | null): string {
    const labels: Record<string, string> = { claude: "Claude", codex: "Codex", antigravity: "Antigravity", gemini: "Gemini", opencode: "OpenCode", pi: "Pi", omp: "OMP", grok: "Grok" };
    return labels[provider?.toLowerCase() ?? ""] ?? "";
  }

  get coordinatorProviderLabel(): string {
    return this.providerLabel(this.orca?.coordinator?.provider) || "Coordinator";
  }

  get childTasks(): AgentTask[] {
    return this.tasks.filter((t) => t.parentId === "integration_claude");
  }

  private coordinatorActivityAt = 0;
  private workerActivityAt = new Map<string, number>();

  noteOrcaHook(id: string) {
    if (id === "integration_claude") this.coordinatorActivityAt = Date.now();
    else if (id.startsWith("orca_")) this.workerActivityAt.set(id, Date.now());
  }

  syncOrca(snapshot: OrcaSnapshot, nowMs = performance.now()) {
    const binding = `${snapshot.selectedRun?.id ?? ""}:${snapshot.coordinator?.handle ?? ""}`;
    const previous = `${this.orca?.selectedRun?.id ?? ""}:${this.orca?.coordinator?.handle ?? ""}`;
    const changed = binding !== previous;
    if (changed) {
      this.observedOrcaWorkers.clear();
      this.settledOrcaWorkers.clear();
      this.finalizedOrcaWorkers.clear();
      this.activeOrcaWorkers.clear();
      this.workerActivityAt.clear();
    }
    this.orca = snapshot;
    if (snapshot.selectedRun) this.orcaRunId = snapshot.selectedRun.id;
    this.orcaError = null;
    const main = this.coordinatorTask;
    if (main) {
      main.sessionCwd = snapshot.coordinator?.cwd ?? null;
      main.terminalHandle = snapshot.coordinator?.handle;
      main.paneKey = snapshot.coordinator?.paneKey;
      if (changed) {
        this.coordinatorActivityAt = 0;
        main.steps = [];
        main.stepIndex = 0;
        main.state = "idle";
        main.pillBadge = null;
        main.finalSummary = null;
        main.completionRevision = (main.completionRevision ?? 0) + 1;
        this.focusId = main.id;
      }
      const activity = snapshot.coordinator?.activity;
      if (activity && activity.updatedAt > this.coordinatorActivityAt && Date.now() - activity.updatedAt <= 60000) {
        if (!["finished", "error", "idle"].includes(activity.state)) {
          main.finalSummary = null;
          main.completionRevision = (main.completionRevision ?? 0) + 1;
        }
        main.state = activity.state;
        if (activity.prompt && !main.steps.length) main.steps.push(activity.prompt);
        if (activity.state === "finished" && activity.finalResponse) main.finalSummary = firstFinalParagraph(activity.finalResponse);
        if (activity.step && main.steps.at(-1) !== activity.step) {
          main.steps.push(activity.step);
          main.stepIndex = main.steps.length - 1;
        }
        this.coordinatorActivityAt = activity.updatedAt;
      }
    }
    const incoming = new Set(snapshot.workers.map((w) => w.id));
    const incomingTasks = new Set(snapshot.workers.map((w) => w.taskId));
    const visible = snapshot.workers.filter((worker) => {
      if (!worker.settled) {
        this.observedOrcaWorkers.add(worker.id);
        this.settledOrcaWorkers.delete(worker.id);
        this.finalizedOrcaWorkers.delete(worker.id);
        this.activeOrcaWorkers.set(worker.id, { worker, lastSeenAt: nowMs });
        return true;
      }
      this.activeOrcaWorkers.delete(worker.id);
      if (!this.observedOrcaWorkers.has(worker.id)) return false;
      const settledAt = this.settledOrcaWorkers.get(worker.id) ?? nowMs;
      this.settledOrcaWorkers.set(worker.id, settledAt);
      this.finalizedOrcaWorkers.set(worker.id, worker);
      if (nowMs - settledAt < 60000) return true;
      this.observedOrcaWorkers.delete(worker.id);
      this.settledOrcaWorkers.delete(worker.id);
      this.finalizedOrcaWorkers.delete(worker.id);
      return false;
    });
    // Retain active workers during transient omissions (up to 60s) unless replaced by a newer task attempt
    for (const [id, item] of this.activeOrcaWorkers) {
      if (incoming.has(id)) continue;
      if (nowMs - item.lastSeenAt < 60000 && (!item.worker.taskId || !incomingTasks.has(item.worker.taskId))) {
        visible.push(item.worker);
      } else {
        this.activeOrcaWorkers.delete(id);
      }
    }
    for (const [id, worker] of this.finalizedOrcaWorkers) {
      const since = this.settledOrcaWorkers.get(id) ?? nowMs;
      if (incoming.has(id)) continue;
      if (nowMs - since < 60000 && (!worker.taskId || !incomingTasks.has(worker.taskId))) visible.push(worker);
      else { this.finalizedOrcaWorkers.delete(id); this.settledOrcaWorkers.delete(id); this.observedOrcaWorkers.delete(id); }
    }
    const ids = new Set(visible.map((w) => `orca_${w.id}`));
    for (const key of this.workerActivityAt.keys()) {
      if (!ids.has(key)) this.workerActivityAt.delete(key);
    }
    this.tasks = this.tasks.filter((t) => t.parentId !== "integration_claude" || ids.has(t.id) || (!changed && !!t.nativeSessionId));
    for (const worker of visible) {
      const id = `orca_${worker.id}`;
      let task = this.tasks.find((t) => t.id === id);
      if (!task) {
        task = { id, name: worker.name, color: "#60A5FA", state: worker.state, stepIndex: 0, steps: [], source: "agent", isIntegration: false, parentId: "integration_claude" };
        this.tasks.push(task);
      }
      task.name = worker.name;
      const normProvider = (worker.provider ?? "").toLowerCase();
      const provider = normProvider === "gemini" ? "antigravity" : normProvider;
      task.provider = provider || worker.provider;
      task.color = provider === "claude" ? "#EAB308" : provider === "antigravity" ? "#E879F9" : "#60A5FA";
      if (task.state !== worker.state && !["finished", "error", "idle"].includes(worker.state)) {
        task.finalSummary = null;
        task.completionRevision = (task.completionRevision ?? 0) + 1;
        task.completionAttempts = 0;
      }
      task.state = worker.state;
      task.sessionCwd = worker.cwd;
      task.terminalHandle = worker.terminalHandle;
      task.paneKey = worker.paneKey;
      task.pillBadge = worker.state === "finished" ? "finished" : worker.state === "error" ? "error" : worker.state === "approval" ? "approval" : null;
      const activity = worker.activity;
      const lastAt = this.workerActivityAt.get(id) ?? 0;
      if (activity && activity.updatedAt > lastAt && Date.now() - activity.updatedAt <= 60000) {
        if (activity.state === "approval" && !worker.settled) {
          task.state = "approval";
          task.pillBadge = "approval";
        }
        if (activity.prompt && !task.steps.length) task.steps.push(activity.prompt);
        if (activity.finalResponse && (task.state === "finished" || activity.state === "finished") && !task.finalSummary) {
          task.finalSummary = firstFinalParagraph(activity.finalResponse);
        }
        if (activity.step && task.steps.at(-1) !== activity.step) {
          task.steps.push(activity.step);
          if (task.steps.length > 20) task.steps.shift();
          task.stepIndex = task.steps.length - 1;
        }
        this.workerActivityAt.set(id, activity.updatedAt);
      }
    }
    if (!this.tasks.some((t) => t.id === this.focusId)) this.focusId = "integration_claude";
    this.notify();
  }

  syncNativeChildren(parentSession: string, children: {id:string;name:string;state:string;text?:string|null;phase?:string|null;turn?:string|null}[], nowMs=Date.now()) {
    const incoming = new Set(children.map(c => `native_${c.id}`));
    this.tasks = this.tasks.filter(t => {
      if (!t.nativeParentSession) return true;
      if (t.nativeParentSession !== parentSession) return false;
      if (!incoming.has(t.id)) {
        t.nativeSettledAt ??= nowMs;
        if (!["finished","error"].includes(t.state)) t.state = "idle";
      }
      return t.nativeSettledAt === undefined || nowMs-t.nativeSettledAt < 60000;
    });
    for (const child of children) {
      const id = `native_${child.id}`;
      let task = this.tasks.find(t => t.id === id);
      if (!task && child.state !== "working") continue;
      if (!task) {
        task = {id, name:child.name, state:"working", color:"#60A5FA", steps:[], stepIndex:0, source:"agent", isIntegration:false, parentId:"integration_claude", provider:"codex", nativeSessionId:child.id, nativeParentSession:parentSession};
        this.tasks.push(task);
      }
      if (task.nativeTurn !== child.turn) {
        task.nativeTurn = child.turn;
        task.steps = []; task.stepIndex = 0; task.finalSummary = null;
        task.completionRevision = (task.completionRevision ?? 0) + 1;
      }
      if (child.state === "working") task.nativeSettledAt = undefined;
      else task.nativeSettledAt ??= nowMs;
      task.state = child.state === "finished" ? "finished" : child.state === "error" ? "error" : child.state === "working" ? "working" : "idle";
      task.pillBadge = task.state === "finished" ? "finished" : task.state === "error" ? "error" : null;
      if (child.text && child.phase === "commentary") this.appendAssistantMessage(id,child.text);
      if (child.text && child.phase === "final_answer" && task.state === "finished") this.setFinalSummary(id,child.text);
    }
    this.notify();
  }

  /** A shared-workspace worker is ambiguous without session telemetry; ignore it. */
  hookTaskId(cwd: string, terminalHandle = "", paneKey = ""): string | null {
    if (!this.orca || this.orcaError || this.orcaRunId !== this.orca.selectedRun?.id || !cwd) return null;
    const scoped = [this.coordinatorTask, ...this.childTasks].filter((t): t is AgentTask => !!t);
    if (terminalHandle || paneKey) {
      const exact = scoped.filter((t) => (!terminalHandle || t.terminalHandle === terminalHandle) && (!paneKey || t.paneKey === paneKey));
      return exact.length === 1 ? exact[0].id : null;
    }
    const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    const matching = [this.coordinatorTask, ...this.childTasks].filter((t) => t?.sessionCwd && normalize(t.sessionCwd) === normalize(cwd));
    return matching.length === 1 ? matching[0]!.id : null;
  }

  selectOrcaRun(id: string) {
    if (id === "") {
      this.manualOrcaRunId = null;
      this.notify();
      return;
    }
    if (!this.orca?.runs.some((run) => run.id === id) || id === this.orcaRunId) return;
    this.manualOrcaRunId = id;
    this.orcaRunId = id;
    this.focusId = "integration_claude";
    this.activeOrcaWorkers.clear();
    this.workerActivityAt.clear();
    this.tasks = this.tasks.filter((t) => t.parentId !== "integration_claude");
    const main = this.coordinatorTask;
    if (main) { main.state = "idle"; main.steps = []; main.stepIndex = 0; main.sessionCwd = null; main.finalSummary = null; main.completionRevision = (main.completionRevision ?? 0) + 1; }
    this.notify();
  }

  orcaUnavailable() {
    this.orcaError = "Orca unavailable";
    this.tasks = this.tasks.filter((t) => t.parentId !== "integration_claude");
    this.focusId = "integration_claude";
    this.activeOrcaWorkers.clear();
    this.workerActivityAt.clear();
    if (this.coordinatorTask) this.coordinatorTask.state = "idle";
    this.notify();
  }

  get effectiveState(): BotStateName {
    if (this.stateOverride) return this.stateOverride;
    if (this.orcaError || (this.orca && !this.orca.coordinator?.connected)) return "idle";
    return this.coordinatorTask?.state ?? "idle";
  }

  get otherTasks(): AgentTask[] {
    return this.tasks.filter((t) => t.id !== this.focusId);
  }

  setFocus(id: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    this.focusId = id;
    t.pillBadge = null;
    this.notify();
  }

  updateTask(id: string, state: BotStateName) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    if (!["finished", "error", "idle"].includes(state)) {
      t.finalSummary = null;
      t.completionRevision = (t.completionRevision ?? 0) + 1;
      t.completionAttempts = 0;
    }
    t.state = state;
    this.notify();
  }

  setFinalSummary(id: string, response?: string | null) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;
    task.finalSummary = firstFinalParagraph(response);
    this.notify();
  }

  completionToken(id: string) {
    const task = this.tasks.find((t) => t.id === id);
    return { task, run: this.orcaRunId, revision: task?.completionRevision ?? 0 };
  }

  applyFinalSummary(token: ReturnType<typeof this.completionToken>, response?: string | null): boolean {
    if (!token.task || token.run !== this.orcaRunId || !this.tasks.includes(token.task) || token.revision !== (token.task.completionRevision ?? 0)) return false;
    // A direct Stop result wins over a slower transcript read.
    if (!token.task.finalSummary) this.setFinalSummary(token.task.id, response);
    return true;
  }

  appendAssistantMessage(id: string, text: string) {
    const paragraph = firstFinalParagraph(text);
    if (paragraph) this.appendStep(id, paragraph);
  }

  appendStep(id: string, step: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.steps.push(step);
    if (t.steps.length > 20) t.steps.shift();
    t.stepIndex = t.steps.length - 1;
    this.notify();
  }

  setPillBadge(id: string, badge: PillBadge | null) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.pillBadge = badge;
    this.notify();
  }

  /** loadIntegrationTasks() — VS Code always on, the rest opt-in (max 4). */
  loadIntegrationTasks() {
    for (const proto of INTEGRATION_AGENTS) {
      const shouldLoad =
        proto.id === "integration_claude" || this.settings.activeIntegrations.includes(proto.id);
      const idx = this.tasks.findIndex((t) => t.id === proto.id);
      if (shouldLoad && idx < 0) this.tasks.push({ ...proto, steps: [] });
      if (!shouldLoad && idx >= 0) this.tasks.splice(idx, 1);
    }
    const main = this.tasks.find((t) => t.id === "integration_claude");
    if (main) {
      if (this.settings.workspaceName) main.name = this.settings.workspaceName;
      if (this.settings.workspaceColor) main.color = this.settings.workspaceColor;
    }
    // Order: integration_claude first, then agent_* pills (visible in slice(0,4)),
    // then other integrations in declaration order.
    const order = INTEGRATION_AGENTS.map((t) => t.id);
    this.tasks.sort((a, b) => {
      const isAgentA = a.id.startsWith("agent_");
      const isAgentB = b.id.startsWith("agent_");
      // integration_claude always first
      if (a.id === "integration_claude") return -1;
      if (b.id === "integration_claude") return 1;
      // agent_* before other integrations; preserve insertion order among themselves
      if (isAgentA && !isAgentB) return -1;
      if (isAgentB && !isAgentA) return 1;
      if (isAgentA && isAgentB) return 0;
      // both known integrations → declaration order
      return order.indexOf(a.id) - order.indexOf(b.id);
    });
    if (!this.focusId) this.focusId = "integration_claude";
    this.notify();
  }

  removeTask(id: string) {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return;
    this.tasks.splice(idx, 1);
    if (this.focusId === id) this.focusId = this.tasks[0]?.id ?? "integration_claude";
    this.notify();
  }

  /** Creates a dynamic agent_ pill on first event; no-ops if it already exists.
   *  Inserted right after integration_claude so it appears in the visible slice(0,4). */
  upsertExternalAgent(id: string, name: string, color: string, sessionCwd?: string) {
    const existing = this.tasks.find((t) => t.id === id);
    if (existing) {
      if (sessionCwd) existing.sessionCwd = sessionCwd;
      return;
    }
    const at = this.tasks.findIndex((t) => t.id === "integration_claude") + 1;
    this.tasks.splice(at, 0, {
      id, name, color, sessionCwd,
      state: "idle", stepIndex: 0, steps: [],
      source: "agent", isIntegration: false,
    });
    if (!this.focusId) this.focusId = id;
    this.notify();
  }

  toggleIntegration(id: string) {
    if (id === "integration_claude") return;
    const active = this.settings.activeIntegrations;
    if (active.includes(id)) {
      this.settings.activeIntegrations = active.filter((x) => x !== id);
      if (this.focusId === id) this.focusId = "integration_claude";
    } else {
      if (active.length >= 4) return;
      this.settings.activeIntegrations = [...active, id];
    }
    this.loadIntegrationTasks();
  }

  defaultView(): IslandViewName {
    return this.tasks.length === 0 ? "empty" : "overview";
  }
}

export const State = new AppState();
