import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function freshState() {
  const source = await readFile(new URL("../src/core/state.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  });
  const { State } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}#${Math.random()}`);
  State.loadIntegrationTasks();
  return State;
}

test("inspecting a worker keeps the principal avatar and its activity", async () => {
  const state = await freshState();
  state.upsertExternalAgent("agent_worker", "Worker", "#22C55E", "C:/work");
  state.updateTask("integration_claude", "thinking");
  state.updateTask("agent_worker", "error");
  state.setFocus("agent_worker");
  assert.equal(state.focusTask.id, "agent_worker");
  assert.equal(state.coordinatorTask.id, "integration_claude");
  assert.equal(state.effectiveState, "thinking");
});

test("unrelated integrations and agents never become coordinator children", async () => {
  const state = await freshState();
  state.upsertExternalAgent("agent_unrelated", "Unrelated", "#22C55E");
  assert.deepEqual(state.childTasks, []);
});

test("principal survives when an inspected worker ends", async () => {
  const state = await freshState();
  state.upsertExternalAgent("agent_worker", "Worker", "#22C55E");
  state.setFocus("agent_worker");
  state.removeTask("agent_worker");
  assert.equal(state.focusTask.id, "integration_claude");
  assert.equal(state.coordinatorTask.id, "integration_claude");
});
