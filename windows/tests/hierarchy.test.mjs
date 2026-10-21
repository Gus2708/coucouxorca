import assert from "node:assert/strict";
import test from "node:test";
import { State } from "../src/core/state.ts";

function freshState() {
  State.tasks = [];
  State.focusId = null;
  State.loadIntegrationTasks();
  return State;
}

test("inspecting a worker keeps the principal avatar and its activity", async () => {
  const state = freshState();
  state.upsertExternalAgent("agent_worker", "Worker", "#22C55E", "C:/work");
  state.updateTask("integration_claude", "thinking");
  state.updateTask("agent_worker", "error");
  state.setFocus("agent_worker");
  assert.equal(state.focusTask.id, "agent_worker");
  assert.equal(state.effectiveState, "error");
});

test("unrelated integrations and agents never become coordinator children", async () => {
  const state = freshState();
  state.upsertExternalAgent("agent_unrelated", "Unrelated", "#22C55E");
  assert.ok(state.tasks.some((t) => t.id === "agent_unrelated"));
});

test("principal survives when an inspected worker ends", async () => {
  const state = freshState();
  state.upsertExternalAgent("agent_worker", "Worker", "#22C55E");
  state.setFocus("agent_worker");
  assert.equal(state.focusTask.id, "agent_worker");
});
