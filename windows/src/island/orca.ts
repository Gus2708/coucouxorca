import { Bridge, IS_TAURI } from "../core/bridge";
import { State } from "../core/state";
import { pollCodexMessages } from "./hooks";
import type { Island } from "./island";

let consecutiveFailures = 0;

/** A single sequential poller; no dispatch, inbox consumption or Run rebinding. */
export function startOrcaMonitor(_island: Island) {
  if (!IS_TAURI) return;
  const poll = async () => {
    let delay = 5000;
    if (!State.paused) {
      const requested = State.manualOrcaRunId ?? null;
      try {
        const snapshot = await Bridge.orcaSnapshot(requested);
        consecutiveFailures = 0;
        // A selection made while the previous snapshot was loading owns the view.
        if (requested === (State.manualOrcaRunId ?? null)) {
          State.syncOrca(snapshot);
          await pollCodexMessages();
          // Fetch only observed completed children, with at most two attempts
          // for a transcript that may be published just after settlement.
          for (const task of State.childTasks.filter((t) => !t.nativeSessionId && t.state === "finished" && !t.finalSummary && (t.completionAttempts ?? 0) < 2)) {
            task.completionAttempts = (task.completionAttempts ?? 0) + 1;
            const token = State.completionToken(task.id);
            void Bridge.orcaCompletion(task.id.slice("orca_".length))
              .then((response) => State.applyFinalSummary(token, response)).catch(() => {});
          }
        }
      } catch (err) {
        consecutiveFailures++;
        const detail = err instanceof Error ? err.message : String(err);
        void Bridge.log(`Orca snapshot poll failed (attempt ${consecutiveFailures}): ${detail.slice(0, 200)}`);
        if (consecutiveFailures === 1) {
          delay = 5000;
        } else if (consecutiveFailures === 2) {
          delay = 10000;
        } else {
          delay = 15000;
          if (requested === State.orcaRunId && (!State.orca || consecutiveFailures >= 3)) {
            State.orcaUnavailable();
          }
        }
      }
    }
    window.setTimeout(() => void poll(), delay);
  };
  void poll();
}
