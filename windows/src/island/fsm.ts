// Island open/close FSM — port of IslandStateMachine.swift.
// No DOM, no Tauri: it only reports transitions.

export type FsmState = "hidden" | "petit" | "home" | "coucou";

export class IslandStateMachine {
  state: FsmState = "hidden";

  onTransition: ((from: FsmState, to: FsmState) => void) | null = null;

  /** home → petit delay, seconds. */
  homeToPetitDelay = 15;
  /** petit → hidden delay, seconds. */
  petitToHiddenDelay = 60;
  /** coucou → petit once the greeting animation ends (no hover). */
  greetAutoCollapseDelay = 0.6;
  /** coucou → petit while the mouse hovers the greeting. */
  greetHoverCollapseDelay = 10;
  /** An alert waiting for an answer stays open, even when the mouse leaves. */
  pinned = false;
  /** Predicate to check if any active agents prevent hiding. */
  canHide: (() => boolean) | null = null;

  private petitHide: number | null = null;
  private homeCollapse: number | null = null;
  private greetCollapse: number | null = null;

  // ── Inputs ──────────────────────────────────────────────────────────────────

  launch() {
    this.cancelTimers();
    this.transition("home");
  }

  mouseEntered() {
    switch (this.state) {
      case "hidden":
        this.cancelTimers();
        this.transition("petit");
        break;
      case "petit":
        this.clear("petitHide");
        break;
      case "home":
        this.clear("homeCollapse");
        break;
      case "coucou":
        this.scheduleGreetCollapse(this.greetHoverCollapseDelay);
        break;
    }
  }

  mouseLeft() {
    switch (this.state) {
      case "hidden":
        break;
      case "petit":
        this.schedulePetitHide();
        break;
      case "home":
        this.scheduleHomeCollapse();
        break;
      case "coucou":
        this.clear("greetCollapse");
        this.transition("petit");
        break;
    }
  }

  click() {
    if (this.state !== "petit") return;
    this.cancelTimers();
    this.transition("home");
  }

  /** Greeting animation finished (T.end). Doesn't override a running hover timer. */
  greetComplete() {
    if (this.state !== "coucou") return;
    if (this.greetCollapse == null) this.scheduleGreetCollapse(this.greetAutoCollapseDelay);
  }

  /** Non-alert work event: show compact from hidden and refresh hide timer. */
  reveal() {
    this.cancelTimers();
    if (this.state === "hidden") {
      this.transition("petit");
    }
    this.schedulePetitHide();
  }

  /** Alert or explicit request: open straight to expanded. */
  forceHome() {
    this.cancelTimers();
    this.transition("home");
  }

  /// Explicit close (OK button, Escape, an alert being answered).
  forcePetit() {
    this.cancelTimers();
    this.transition("petit");
  }

  forceHidden() {
    this.cancelTimers();
    this.transition("hidden");
  }

  // ── Timers ──────────────────────────────────────────────────────────────────

  private schedulePetitHide() {
    this.clear("petitHide");
    const delay = this.petitToHiddenDelay * 1000;
    const setTimeoutFn = typeof window !== "undefined" ? window.setTimeout.bind(window) : globalThis.setTimeout;
    this.petitHide = setTimeoutFn(() => {
      this.petitHide = null;
      if (this.state !== "petit") return;
      if (this.canHide && !this.canHide()) {
        this.schedulePetitHide();
        return;
      }
      this.transition("hidden");
    }, delay) as unknown as number;
  }

  private scheduleHomeCollapse() {
    this.clear("homeCollapse");
    const delay = this.homeToPetitDelay * 1000;
    const setTimeoutFn = typeof window !== "undefined" ? window.setTimeout.bind(window) : globalThis.setTimeout;
    this.homeCollapse = setTimeoutFn(() => {
      this.homeCollapse = null;
      if (this.state === "home") {
        this.transition("petit");
      }
    }, delay) as unknown as number;
  }

  private scheduleGreetCollapse(delay: number) {
    this.clear("greetCollapse");
    const setTimeoutFn = typeof window !== "undefined" ? window.setTimeout.bind(window) : globalThis.setTimeout;
    this.greetCollapse = setTimeoutFn(() => {
      this.greetCollapse = null;
      if (this.state === "coucou") this.transition("petit");
    }, delay * 1000) as unknown as number;
  }

  private clear(which: "petitHide" | "homeCollapse" | "greetCollapse") {
    const id = this[which];
    const clearTimeoutFn = typeof window !== "undefined" ? window.clearTimeout.bind(window) : globalThis.clearTimeout;
    if (id != null) clearTimeoutFn(id as unknown as number);
    this[which] = null;
  }

  cancelTimers() {
    this.clear("petitHide");
    this.clear("homeCollapse");
    this.clear("greetCollapse");
  }

  private transition(next: FsmState) {
    if (next === this.state) return;
    const from = this.state;
    this.state = next;
    this.onTransition?.(from, next);
  }
}
