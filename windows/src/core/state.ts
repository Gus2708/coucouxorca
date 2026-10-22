// App state — mirror of AppState.swift (the parts the island needs).

import type { BotEmoteName, BotStateName, IslandMode, IslandViewName } from "./layout";
import type { EyeShape, AvatarSkin } from "../mochi/engine";
import {
  DEFAULT_MAIN_PILL, HOST_OS, availablePills, orderPills, pillDefinition, sanitizeDeclared,
  toggleDeclared, type HostOs, type PillDefinition,
} from "./pills";
import type { CodexPlanUsage, PlanUsage } from "./plan";
import type { ProviderId } from "./providers";
import type { FileDiff } from "./diff";
import type { Bindings } from "./shortcuts";
import { DEFAULT_OUTFIT, type Outfit } from "../mochi/wardrobe";
import { pillColor } from "./pill-colors";
import { Spotify, musicPlaying } from "./spotify";

export type AgentSource = "claudeCode" | "n8n" | "agent";
export type PillBadge = "approval" | "finished" | "error";

export interface AgentTask {
  id: string;
  name: string;
  color: string;
  state: BotStateName;
  stepIndex: number;
  steps: string[];
  /**
   * Position of the newest step in the whole session. `steps` is capped, so
   * `stepIndex` stops moving once it is full; this keeps counting.
   */
  stepSeq?: number;
  source: AgentSource;
  isIntegration: boolean;
  emote?: BotEmoteName | null;
  miniEye?: EyeShape | null;
  pillBadge?: PillBadge | null;
  sessionCwd?: string | null;
  /** Claude Code's session, so "Open terminal" can find the window it runs in. */
  sessionId?: string | null;
  /** Claude's final message after Stop, one line; cleared when a new turn starts. */
  finalLine?: string | null;
  /** Set only from Orca's verified Run/Dispatch relationship. */
  parentId?: string | null;
  nativeTurn?: string | null;
  nativeSettledAt?: number;
  nativeSessionId?: string;
  nativeParentSession?: string;
  provider?: string | null;
  projectId?: string | null;
  projectName?: string | null;
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
  /** The pill the request belongs to: VS Code's or Cursor's (Claude Code), or an agent's (Codex…). */
  pillId: string;
  tool: string;
  command: string;
  /** Set when Claude Code is asking a question rather than for a permission. */
  questions?: AskedQuestion[];
}

/** One question of an AskUserQuestion call. */
export interface AskedQuestion {
  question: string;
  options: { label: string; description: string }[];
  multiSelect: boolean;
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

/** A fresh, idle task for a catalog pill, in the colour the user gave it if any. */
function taskFor(def: PillDefinition, colors: unknown, name = def.name): AgentTask {
  return {
    id: def.id, name, color: pillColor(def.id, def.color, colors), state: "idle", stepIndex: 0, steps: [],
    source: def.source, isIntegration: true,
  };
}

/** What an integration poller last reported. */
export interface IntegrationInfo {
  data: Record<string, unknown>;
  error: string | null;
  loaded: boolean;
  configured: boolean;
}

export interface Settings {
  orcaSkin?: boolean;
  principalSkin?: AvatarSkin | "auto" | null;
  soundEnabled: boolean;
  soundVolume: number;
  autoCloseInterval: number;
  /** Hovering the island opens it all the way (off: hovering only peeks). */
  openOnHover: boolean;
  /** Date and time in the middle of the compact island. */
  showClock: boolean;
  absenceInterval: number;
  /** Declared pills next to the main one (at most 4), in the order they were added. */
  activeIntegrations: string[];
  /** The always-on workspace pill: VS Code, Cursor, Codex or Antigravity. */
  mainPill: string;
  /** "primary", "cursor", or `at:<x>,<y>` for one display (logical origin). */
  screen: string;
  autostart: boolean;
  hooksInstalled: boolean;
  /** Claude model used by the chat. */
  model: string;
  /** Show the Claude plan pill (5 h and weekly limits) in the island's header. */
  showPlanInNotch: boolean;
  /** Coucou's status line relay is installed in Claude Code's settings. */
  planRelayInstalled: boolean;
  /** Show the Codex plan pill in the island's header. */
  showCodexPlanInNotch: boolean;
  /** Who the chat talks to (see core/providers.ts); picked in the chat view. */
  chatProvider: ProviderId;
  /** The model picked for each provider other than Anthropic, by provider id. */
  chatModels: Record<string, string>;
  /** Model server addresses once connected; empty means not connected. */
  ollamaUrl: string;
  lmstudioUrl: string;
  customUrl: string;
  /** Global shortcuts the user changed, by action id (see core/shortcuts.ts). */
  shortcuts: Bindings;
  /**
   * Mochi's outfit: "auto" (dresses for the season), "none" or an outfit id.
   * Same raw values as the Mac's "mochiOutfit"; read it through parseOutfit.
   */
  mochiOutfit: string;
  /**
   * A colour of the user's own for a pill's Mochi, by pill ID ("#RRGGBB").
   * Empty means the catalog's colours; read it through core/pill-colors.ts.
   * Same key and values as the Mac's "pillColors".
   */
  pillColors: Record<string, string>;
  /**
   * Interface language: "" follows the system (when Coucou has its language,
   * else English), or one of src/i18n's ten codes ("fr", "pt-BR", "zh-Hans"…).
   */
  language: string;
  activeProjectId?: string;
  /**
   * The phone link for Coucou for Android is on. Rust owns it (only the switch in
   * Settings → Android phone turns it on): whatever the page sends back is ignored.
   */
  phoneLink?: boolean;
  /** The phone may chat through this computer's API keys. Rust owns it too. */
  phoneChat?: boolean;
  /** The phone may see session details (steps, last line, folder name, colour). Rust owns it too. */
  phoneDetails?: boolean;
  /** Which models the phone may use, "provider/model". Rust owns it too. */
  phoneChatModels?: string[];
  /** Mochi on the desktop. Rust owns it: whatever the page sends back is ignored. */
  desktopMochi?: {
    onDesktop: boolean;
    spot: { x: number; y: number; space: string } | null;
  };
}

export function principalSkin(settings: Pick<Settings, "principalSkin" | "orcaSkin">): AvatarSkin | "auto" {
  return settings.principalSkin ?? (settings.orcaSkin ? "orca" : "classic");
}

export const DEFAULT_SETTINGS: Settings = {
  orcaSkin: false,
  principalSkin: null,
  soundEnabled: true,
  soundVolume: 0.12,
  autoCloseInterval: 15,
  openOnHover: false,
  showClock: false,
  absenceInterval: 180,
  activeIntegrations: [
    "integration_resend", "integration_n8n", "integration_vercel", "integration_github",
  ],
  mainPill: DEFAULT_MAIN_PILL,
  screen: "primary",
  autostart: false,
  hooksInstalled: false,
  model: "claude-opus-5",
  showPlanInNotch: false,
  planRelayInstalled: false,
  showCodexPlanInNotch: false,
  chatProvider: "anthropic",
  chatModels: {},
  ollamaUrl: "",
  lmstudioUrl: "",
  customUrl: "",
  shortcuts: {},
  mochiOutfit: DEFAULT_OUTFIT,
  pillColors: {},
  language: "",
  activeProjectId: "",
};

type Listener = () => void;

/** Live diffs kept per pill (oldest dropped first) — same cap as macOS. */
export const MAX_DIFFS_PER_PILL = 50;
/** A pill's diffs are forgotten after an hour without a new one, as on macOS. */
export const DIFF_TTL_MS = 3_600_000;

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
  private coordinatorActivityAt = 0;
  private workerActivityAt = new Map<string, number>();

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
  /** The pill that was in front when the card came up; it comes back after. */
  focusBeforeApproval: string | null = null;

  integrations: Record<string, IntegrationInfo> = {};

  /** Claude's 5 h / weekly limits, from the status line (null until the first call). */
  planUsage: PlanUsage | null = null;
  /** Codex's limits, from `codex app-server` (null until it has answered). */
  codexPlanUsage: CodexPlanUsage | null = null;
  /** A plan card is open in place of the overview's left card. */
  showingPlanDetail = false;
  /** Which one: the Codex card rather than Claude's. */
  planDetailIsCodex = false;
  /** Per-pill file diffs, in order of reception. Steps carry their ids. */
  sessionDiffs = new Map<string, FileDiff[]>();
  private sessionDiffTimers = new Map<string, number>();
  /** Never reset, so an id can never point at a newer diff than the one tapped. */
  private nextDiffId = 0;
  /** Ctrl+↑ / Ctrl+↓: the highlighted row of the card's list (AppState.cardSelection). */
  cardSelection: number | null = null;
  /** Rows in the list on screen, 0 when there is none (AppState.cardItemCount). */
  cardItemCount = 0;
  /**
   * Mochi is out of the island — on the desktop, flying, or being dragged
   * there — so the island's own Mochi is hidden (AppState.mochiOnDesktop).
   */
  mochiOnDesktop = false;

  /** Outfit shown on Mochi while the pointer rests on a wardrobe button. */
  wardrobePreview: Outfit | null = null;

  lastActivity = performance.now();

  settings: Settings = { ...DEFAULT_SETTINGS };

  /** Which pills this build offers depends on it (Claude Desktop is Windows only). */
  os: HostOs = HOST_OS;

  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Marks the UI dirty; the island re-renders on the next frame. */
  notify() {
    for (const fn of this.listeners) fn();
  }

  get coordinatorTask(): AgentTask | null {
    return this.tasks.find((t) => t.id === "integration_claude" || t.id === this.mainPillId) ?? null;
  }

  providerLabel(provider?: string | null): string {
    const labels: Record<string, string> = { claude: "Claude", codex: "Codex", antigravity: "Antigravity", gemini: "Gemini", opencode: "OpenCode", pi: "Pi", omp: "OMP", grok: "Grok" };
    return labels[provider?.toLowerCase() ?? ""] ?? "";
  }

  get coordinatorProviderLabel(): string {
    return this.providerLabel(this.orca?.coordinator?.provider) || "Coordinator";
  }

  get childTasks(): AgentTask[] {
    return this.tasks.filter((t) => t.parentId === "integration_claude" || (this.mainPillId && t.parentId === this.mainPillId));
  }

  noteOrcaHook(id: string) {
    if (id === "integration_claude" || id === this.mainPillId) this.coordinatorActivityAt = Date.now();
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
      else {
        this.finalizedOrcaWorkers.delete(id);
        this.settledOrcaWorkers.delete(id);
        this.observedOrcaWorkers.delete(id);
      }
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
        task = {
          id,
          name: worker.name,
          color: "#60A5FA",
          state: worker.state,
          stepIndex: 0,
          steps: [],
          source: "agent",
          isIntegration: false,
          parentId: "integration_claude",
        };
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
          task.stepIndex = task.steps.length - 1;
        }
        this.workerActivityAt.set(id, activity.updatedAt);
      }
    }
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
      let task = this.tasks.find((t) => t.id === id);
      if (!task && child.state !== "working") continue;
      if (!task) {
        task = {
          id,
          name: child.name,
          state: "working",
          color: "#60A5FA",
          steps: [],
          stepIndex: 0,
          source: "agent",
          isIntegration: false,
          parentId: "integration_claude",
          provider: "codex",
          nativeSessionId: child.id,
          nativeParentSession: parentSession,
        };
        this.tasks.push(task);
      }
      const activeTask = task;
      if (activeTask.nativeTurn !== child.turn) {
        activeTask.nativeTurn = child.turn;
        activeTask.steps = [];
        activeTask.stepIndex = 0;
        activeTask.finalSummary = null;
        activeTask.completionRevision = (activeTask.completionRevision ?? 0) + 1;
      }
      if (child.state === "working") activeTask.nativeSettledAt = undefined;
      else activeTask.nativeSettledAt ??= nowMs;
      activeTask.state = child.state === "finished" ? "finished" : child.state === "error" ? "error" : child.state === "working" ? "working" : "idle";
      activeTask.pillBadge = activeTask.state === "finished" ? "finished" : activeTask.state === "error" ? "error" : null;
      if (child.text && child.phase === "commentary") this.appendAssistantMessage(id, child.text);
      if (child.text && child.phase === "final_answer" && activeTask.state === "finished") this.setFinalSummary(id, child.text);
    }
    this.notify();
  }

  appendAssistantMessage(id: string, text: string) {
    const paragraph = firstFinalParagraph(text);
    if (paragraph) this.appendStep(id, paragraph);
  }

  hookTaskId(cwd: string, terminalHandle = "", paneKey = ""): string | null {
    if (!this.orca || this.orcaError || this.orcaRunId !== this.orca.selectedRun?.id || !cwd) return null;
    const scoped = [this.coordinatorTask, ...this.childTasks].filter((t): t is AgentTask => !!t);
    if (terminalHandle || paneKey) {
      const exact = scoped.filter((t) => (!terminalHandle || t.terminalHandle === terminalHandle) && (!paneKey || t.paneKey === paneKey));
      return exact.length === 1 ? exact[0].id : null;
    }
    const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    const matching = scoped.filter((t) => t?.sessionCwd && normalize(t.sessionCwd) === normalize(cwd));
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
    if (main) {
      main.state = "idle";
      main.steps = [];
      main.stepIndex = 0;
      main.sessionCwd = null;
      main.finalSummary = null;
      main.completionRevision = (main.completionRevision ?? 0) + 1;
    }
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

  completionToken(id: string) {
    const task = this.tasks.find((t) => t.id === id);
    return { task, run: this.orcaRunId, revision: task?.completionRevision ?? 0 };
  }

  applyFinalSummary(token: ReturnType<typeof this.completionToken>, response?: string | null): boolean {
    if (!token.task || token.run !== this.orcaRunId || !this.tasks.includes(token.task) || token.revision !== (token.task.completionRevision ?? 0)) return false;
    if (!token.task.finalSummary) this.setFinalSummary(token.task.id, response);
    return true;
  }

  setFinalSummary(id: string, response?: string | null) {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return;
    task.finalSummary = firstFinalParagraph(response);
    this.notify();
  }
  get projects(): { id: string; name: string }[] {
    const list: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const task of this.tasks) {
      if (task.projectId && !seen.has(task.projectId)) {
        seen.add(task.projectId);
        const name = task.projectName && task.projectName !== task.projectId
          ? `${task.projectName} (${task.projectId})`
          : (task.projectName || task.projectId);
        list.push({ id: task.projectId, name });
      }
    }
    return list;
  }

  selectProject(id: string) {
    this.settings.activeProjectId = id;
    if (id) {
      const target = this.tasks.find((t) => t.projectId === id);
      if (target) this.focusId = target.id;
    }
    this.notify();
  }

  get visibleTasks(): AgentTask[] {
    const active = this.settings.activeProjectId;
    if (!active) {
      const firstProject = this.tasks.find((t) => t.projectId)?.projectId;
      if (firstProject) {
        return this.tasks.filter((t) => !t.projectId || t.projectId === firstProject);
      }
      return this.tasks;
    }
    return this.tasks.filter((t) => !t.projectId || t.projectId === active);
  }

  get focusTask(): AgentTask | null {
    return this.tasks.find((t) => t.id === this.focusId) ?? this.tasks[0] ?? null;
  }

  get effectiveState(): BotStateName {
    if (this.stateOverride) return this.stateOverride;
    if (this.orca) {
      if (this.orcaError || !this.orca.coordinator?.connected) return "idle";
      return this.coordinatorTask?.state ?? "idle";
    }
    return this.focusTask?.state ?? "idle";
  }

  /** Spotify plays on a declared pill: Mochi dances (Linux; never on Windows yet). */
  get spotifyPlaying(): boolean {
    return musicPlaying(Spotify.state, sanitizeDeclared(this.settings, this.os).activeIntegrations);
  }

  get otherTasks(): AgentTask[] {
    return this.visibleTasks.filter((t) => t.id !== this.focusId);
  }

  setFocus(id: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    this.focusId = id;
    this.showingPlanDetail = false;
    t.pillBadge = null;
    this.notify();
  }

  /**
   * A permission card or a question comes up: its pill comes to the front, and
   * the pill that was there is remembered (HookServer.focusBeforeApproval).
   */
  beginApproval(info: ApprovalInfo) {
    this.pendingApproval = info;
    this.isPinned = true;
    if (this.focusBeforeApproval == null) this.focusBeforeApproval = this.focusId;
    this.setFocus(info.pillId);
  }

  /**
   * The card has its answer, or is withdrawn: the session carries on, and the
   * pill you were on comes back — unless you moved to another one meanwhile.
   */
  endApproval() {
    const req = this.pendingApproval;
    if (!req) return;
    this.pendingApproval = null;
    this.isPinned = false;
    this.updateTask(req.pillId, "working");
    this.setPillBadge(req.pillId, null);
    const previous = this.focusBeforeApproval;
    this.focusBeforeApproval = null;
    if (previous && this.focusId === req.pillId && this.tasks.some((t) => t.id === previous)) {
      this.focusId = previous;
    }
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

  appendStep(id: string, step: string) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    const newest = t.stepSeq ?? t.steps.length - 1;
    t.steps.push(step);
    if (t.steps.length > 20) t.steps.shift();
    t.stepIndex = t.steps.length - 1;
    t.stepSeq = newest + 1;
    this.notify();
  }

  setPillBadge(id: string, badge: PillBadge | null) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    t.pillBadge = badge;
    this.notify();
  }

  /** Stores a diff for a pill and returns its id (for the ticker step). */
  appendSessionDiff(pillId: string, diff: FileDiff): number {
    const id = this.nextDiffId++;
    const list = this.sessionDiffs.get(pillId) ?? [];
    list.push({ ...diff, id });
    while (list.length > MAX_DIFFS_PER_PILL) list.shift();
    this.sessionDiffs.set(pillId, list);
    // One timer per pill, re-armed on every diff — nothing polls.
    const prev = this.sessionDiffTimers.get(pillId);
    if (prev != null) window.clearTimeout(prev);
    this.sessionDiffTimers.set(
      pillId,
      window.setTimeout(() => this.clearSessionDiffs(pillId), DIFF_TTL_MS),
    );
    return id;
  }

  findDiff(pillId: string, id: number): FileDiff | null {
    return this.sessionDiffs.get(pillId)?.find((d) => d.id === id) ?? null;
  }

  clearSessionDiffs(pillId: string) {
    const timer = this.sessionDiffTimers.get(pillId);
    if (timer != null) window.clearTimeout(timer);
    this.sessionDiffTimers.delete(pillId);
    this.sessionDiffs.delete(pillId);
  }

  /** The always-on workspace pill, once the setting has been checked. */
  get mainPillId(): string {
    return sanitizeDeclared(this.settings, this.os).mainPill;
  }

  /**
   * True for a pill that stays when its session ends: the main pill and the
   * declared ones go back to idle instead of going away.
   */
  isKept(id: string): boolean {
    const d = sanitizeDeclared(this.settings, this.os);
    return id === d.mainPill || d.activeIntegrations.includes(id);
  }

  /**
   * Loads the catalog pills: the main pill always, the declared ones, and none
   * of the others — a pill that is mid-session stays until its session ends.
   * Safe to call any number of times. AppState.loadIntegrationTasks on macOS.
   */
  loadIntegrationTasks() {
    const d = sanitizeDeclared(this.settings, this.os);
    this.settings.mainPill = d.mainPill;
    this.settings.activeIntegrations = d.activeIntegrations;
    for (const def of availablePills(this.os)) {
      const shouldLoad = def.id === d.mainPill || d.activeIntegrations.includes(def.id);
      const idx = this.tasks.findIndex((t) => t.id === def.id);
      if (shouldLoad && idx < 0) this.tasks.push(taskFor(def, this.settings.pillColors));
      const busy = idx >= 0 && (this.tasks[idx].state !== "idle" || this.tasks[idx].steps.length > 0);
      if (!shouldLoad && idx >= 0 && !busy) this.tasks.splice(idx, 1);
    }
    // A colour picked in Settings reaches the pills that are already up.
    for (const t of this.tasks) {
      const def = pillDefinition(t.id);
      if (def) t.color = pillColor(def.id, def.color, this.settings.pillColors);
    }
    this.tasks = orderPills(this.tasks, d.mainPill);
    if (!this.focusId || !this.tasks.some((t) => t.id === this.focusId)) this.focusId = d.mainPill;
    this.notify();
  }

  /**
   * A session is over. The main and declared pills are put back as they were;
   * any other pill goes away (AppState.removeTask on macOS).
   */
  removeTask(id: string) {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return;
    if (this.isKept(id)) {
      const t = this.tasks[idx];
      t.state = "idle";
      t.steps = [];
      t.stepIndex = 0;
      delete t.stepSeq;
      t.pillBadge = null;
      t.finalLine = null;
      const def = pillDefinition(id);
      if (def) t.name = def.name;
      this.clearSessionDiffs(id);
      this.notify();
      return;
    }
    this.tasks.splice(idx, 1);
    this.clearSessionDiffs(id);
    if (this.focusId === id) this.focusId = this.tasks[0]?.id ?? this.mainPillId;
    this.notify();
  }

  /**
   * Creates the pill of a tagged agent on its first event; no-op if it exists.
   * Inserted right after the main pill so it is in the visible slice(0,4). A
   * catalog agent wears its catalog colour, as on macOS.
   */
  upsertExternalAgent(id: string, name: string, color: string, cwdOrProjectId?: string, projectName?: string, _agentId?: string, provider?: string | null) {
    const isProject = Boolean(projectName || id.startsWith("project:"));
    const projectId = isProject ? (cwdOrProjectId || (id.startsWith("project:") ? id.split(":")[1] : undefined)) : undefined;
    const sessionCwd = !isProject ? cwdOrProjectId : undefined;
    const existing = this.tasks.find((t) => t.id === id);
    if (existing) {
      if (sessionCwd) existing.sessionCwd = sessionCwd;
      if (projectId) existing.projectId = projectId;
      if (projectName) existing.projectName = projectName;
      if (provider) existing.provider = provider;
      return;
    }
    const def = pillDefinition(id);
    this.insertAfterMain({
      id, name, color: def ? pillColor(def.id, def.color, this.settings.pillColors) : color,
      sessionCwd, projectId, projectName, provider,
      state: "idle", stepIndex: 0, steps: [],
      source: "agent", isIntegration: false,
    });
  }

  /**
   * The pill a Claude Code session belongs to (VS Code or Cursor). It is made
   * for the session when it is neither the main pill nor declared, as
   * upsertWorkspaceTask does on macOS.
   */
  upsertWorkspacePill(id: string, name: string, cwd: string, projectId?: string, baseId = id): AgentTask | null {
    let t = this.tasks.find((x) => x.id === id);
    if (!t) {
      const def = pillDefinition(baseId);
      if (!def) return null;
      t = taskFor(def, this.settings.pillColors, name);
      t.id = id;
      if (projectId) t.projectId = projectId;
      this.insertAfterMain(t);
    }
    t.name = name;
    if (cwd) t.sessionCwd = cwd;
    if (projectId) t.projectId = projectId;
    return t;
  }

  private insertAfterMain(t: AgentTask) {
    const at = this.tasks.findIndex((x) => x.id === this.mainPillId) + 1;
    this.tasks.splice(at, 0, t);
    if (!this.focusId) this.focusId = t.id;
    this.notify();
  }

  /** Declares or undeclares a pill (max 4 next to the main one). */
  toggleIntegration(id: string) {
    const next = toggleDeclared(sanitizeDeclared(this.settings, this.os), id, this.os);
    if (!next) return;
    this.settings.activeIntegrations = next;
    if (!next.includes(id) && this.focusId === id) this.focusId = this.mainPillId;
    this.loadIntegrationTasks();
  }

  /**
   * What the island opens on. A card waiting for an answer comes first, so
   * reopening a folded island shows it again (Mac #117, #290).
   */
  defaultView(): IslandViewName {
    if (this.pendingApproval) return this.pendingApproval.questions ? "question" : "approval";
    return this.tasks.length === 0 ? "empty" : "overview";
  }
}

export const State = new AppState();
