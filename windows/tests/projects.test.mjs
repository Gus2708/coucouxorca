import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { calls } from "./tauri.mjs";
import { installFakeDom } from "./fakedom.mjs";
import { DEFAULT_SETTINGS, State } from "../src/core/state.ts";
import { setLanguage } from "../src/i18n/i18n.ts";

installFakeDom();
const { buildHeader } = await import("../src/views/views.ts");

afterEach(() => {
  State.tasks = [];
  State.focusId = null;
  State.settings = { ...DEFAULT_SETTINGS };
  calls.length = 0;
});

test("the overlay project picker switches worktrees and saves the selection", async () => {
  setLanguage("en");
  State.upsertExternalAgent("project:main:agent_codex", "Codex", "#123456", "main", "repo", "agent_codex");
  State.upsertExternalAgent("project:feature:agent_codex", "Codex", "#123456", "feature", "repo", "agent_codex");

  const header = buildHeader({ setView() {}, toggleSound() {}, blip() {} });
  header.sync();
  const picker = header.el.find("select")[0];
  assert.equal(picker.style.display, "");
  assert.deepEqual(picker.children.map((option) => option.getAttribute("value")).sort(), ["feature", "main"]);
  assert.notEqual(picker.children[0].textContent, picker.children[1].textContent);

  picker.value = "feature";
  picker.fire("change");
  await Promise.resolve();

  assert.equal(State.settings.activeProjectId, "feature");
  assert.deepEqual(calls.map(([name]) => name), ["save_settings"]);
  assert.equal(calls[0][1].settings.activeProjectId, "feature");
});
