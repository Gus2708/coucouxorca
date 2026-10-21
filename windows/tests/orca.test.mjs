import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { State } from "../src/core/state.ts";

globalThis.N_ = (s) => s;
globalThis.t = (s) => s;

function freshState() {
  State.tasks = [];
  State.focusId = null;
  State.observedOrcaWorkers.clear();
  State.settledOrcaWorkers.clear();
  State.finalizedOrcaWorkers.clear();
  State.activeOrcaWorkers.clear();
  State.workerActivityAt.clear();
  State.orca = null;
  State.orcaRunId = null;
  State.orcaError = null;
  return State;
}
function makeHookFixture(overrides = {}) {
  const fixture = {
    State: null,
    callback: null,
    Bridge: { approvalDecline() {} },
    Sound: { play() {} },
    window: { setTimeout() {} },
    restorePlanUsage: () => {},
    parseClaudePlan: () => null,
    setClaudePlanUsage: () => {},
    storedClaudePlanUsage: () => null,
    buildFileDiff: () => null,
    fileName: (p) => p,
    makeDiffStep: () => "",
    toOneLine: (s) => s,
    pillDefinition: () => null,
    APPROVAL_AGENTS: [],
    agentColor: () => "#fff",
    agentName: () => "Agent",
    validateAgent: () => true,
    ...overrides,
  };
  fixture.onEvent = (_name, callback) => { fixture.callback = callback; };
  return fixture;
}

const HOOK_FIXTURE_HEADER = "const { State, Bridge, Sound, window, onEvent, restorePlanUsage, parseClaudePlan, setClaudePlanUsage, storedClaudePlanUsage, buildFileDiff, fileName, makeDiffStep, toOneLine, pillDefinition, APPROVAL_AGENTS, agentColor, agentName, validateAgent } = globalThis.__orcaHookFixture;\n";

const run = { id: "run_a", objective: "Build", coordinatorHandle: "term_root" };
const worker = { id: "dispatch:a", name: "Writer", state: "working", cwd: "C:/child", terminalHandle: "term_child", provider: "codex" };
const snapshot = (workers, selectedRun = run) => ({ runs: [selectedRun], selectedRun, coordinator: { handle: selectedRun.coordinatorHandle, cwd: "C:/root", connected: true }, workers });

test("exact Orca pane identity routes principal tools independently of same-workspace children", async () => {
  const state = await freshState(); state.loadIntegrationTasks();
  const data = snapshot([{ ...worker, cwd: "C:/root", paneKey: "tab_child:leaf_child" }]);
  data.coordinator.paneKey = "tab_root:leaf_root";
  state.syncOrca(data);
  assert.equal(state.hookTaskId("C:/root", "term_root", "tab_root:leaf_root"), "integration_claude");
  assert.equal(state.hookTaskId("C:/root", "", "tab_child:leaf_child"), state.childTasks[0].id);
  assert.equal(state.hookTaskId("C:/root", "term_expired", "tab_root:leaf_root"), null);
  assert.equal(state.hookTaskId("C:/root"), null);
  state.updateTask(state.hookTaskId("C:/root", "term_root"), "working");
  state.appendStep("integration_claude", "Executes deploy");
  state.updateTask(state.childTasks[0].id, "finished");
  assert.equal(state.effectiveState, "working");
  assert.deepEqual(state.coordinatorTask.steps, ["Executes deploy"]);
  state.updateTask(state.hookTaskId("C:/root", "term_root"), "finished");
  assert.equal(state.effectiveState, "finished");
});

test("fresh principal telemetry restores activity while stale or child telemetry cannot replace it", async () => {
  const state = await freshState(); state.loadIntegrationTasks();
  const data = snapshot([{ ...worker, cwd: "C:/root", state: "finished" }]);
  data.coordinator.activity = { state: "working", step: "Bash", updatedAt: Date.now() };
  state.syncOrca(data);
  assert.equal(state.effectiveState, "working");
  assert.deepEqual(state.coordinatorTask.steps, ["Bash"]);
  state.noteOrcaHook("integration_claude");
  data.coordinator.activity = { state: "finished", updatedAt: Date.now() - 10000 };
  state.syncOrca(data);
  assert.equal(state.effectiveState, "working");
});

test("production hook handler shows a principal tool and completion despite a same-cwd child", async () => {
  const state = await freshState(); state.loadIntegrationTasks();
  const data = snapshot([{ ...worker, cwd: "C:/root", paneKey: "child:pane" }]);
  data.coordinator.paneKey = "root:pane";
  state.syncOrca(data);
  const fixture = makeHookFixture({ State: state });
  globalThis.__orcaHookFixture = fixture;
  const source = (await readFile(new URL("../src/island/hooks.ts", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  const module = await import(`data:text/javascript;base64,${Buffer.from(`${HOOK_FIXTURE_HEADER}${outputText}`).toString("base64")}#${Math.random()}`);
  let surfaced=0; state.mode="hidden"; module.registerHookHandlers({ alert() {surfaced++}, setView() {}, reveal() {} });
  const identity = { cwd: "C:/root", orca_pane_key: "root:pane" };
  fixture.callback({ ...identity, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "recovered after restart" } });
  assert.match(state.coordinatorTask.steps[0], /recovered after restart/);
  fixture.callback({ ...identity, hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "recovered after restart" } });
  assert.equal(state.coordinatorTask.steps.length, 1);
  fixture.callback({ cwd: "C:/root", orca_pane_key: "child:pane", hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: "child-only.ts" } });
  assert.match(state.childTasks[0].steps[0], /child-only/);
  assert.equal(state.coordinatorTask.steps.length, 1);
  fixture.callback({ ...identity, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "diagnostic only" } });
  assert.equal(state.effectiveState, "working");
  assert.match(state.coordinatorTask.steps.at(-1), /diagnostic only/);
  fixture.callback({ cwd: "C:/root", orca_pane_key: "child:pane", hook_event_name: "Stop", last_assistant_message: "Child result verified.\n\nOther details." });
  assert.equal(state.effectiveState, "working");
  assert.equal(state.childTasks[0].finalSummary, "Child result verified.");
  fixture.callback({ ...identity, hook_event_name: "Stop", last_assistant_message: "**Desplegado** en https://gusdev.me al primer intento.\n\nDetails." });
  assert.equal(state.effectiveState, "finished");
  assert.equal(state.coordinatorTask.finalSummary, "Desplegado en https://gusdev.me al primer intento.");
  const beforeNext=surfaced;
  fixture.callback({...identity,hook_event_name:"UserPromptSubmit",prompt:"Next task"});
  assert.equal(surfaced,beforeNext,"user prompt is not an assistant response");
  fixture.callback({...identity,hook_event_name:"Stop",last_assistant_message:"Second task completed."});
  assert.equal(surfaced,beforeNext+1,"a second Claude final response opens without turn_id");
  fixture.callback({...identity,hook_event_name:"Stop",last_assistant_message:"Second task completed."});
  assert.equal(surfaced,beforeNext+1,"repeated final does not open again");

  assert.equal(state.childTasks[0].finalSummary, "Child result verified.");
  delete globalThis.__orcaHookFixture;
});

test("principal subtitle names only its verified terminal provider", async () => {
  const state = await freshState(); state.loadIntegrationTasks();
  const data = snapshot([{ ...worker, provider: "codex" }]);
  data.coordinator.provider = "claude";
  state.syncOrca(data);
  assert.equal(state.coordinatorProviderLabel, "Claude");
  state.setFocus(state.childTasks[0].id);
  assert.equal(state.coordinatorProviderLabel, "Claude");
  data.coordinator.provider = "codex";
  state.syncOrca(data);
  assert.equal(state.coordinatorProviderLabel, "Codex");
  data.coordinator.provider = null;
  state.syncOrca(data);
  assert.equal(state.coordinatorProviderLabel, "Coordinator");
});

test("completion paragraphs skip code/headings/tables and cannot reuse tools or delayed old turns", async () => {
  const state = await freshState(); state.loadIntegrationTasks(); state.syncOrca(snapshot([worker]));
  state.appendStep("integration_claude", "Executes cd deployment");
  state.setFinalSummary("integration_claude", "# Done\n\n```sh\ncommand\n```\n\n| Name | Result |\n| --- | --- |\n| a | b |\n\nThe first prose\nparagraph is complete.\n\nNext paragraph.");
  assert.equal(state.coordinatorTask.finalSummary, "The first prose paragraph is complete.");
  state.updateTask("integration_claude", "finished");
  const pending = state.completionToken("integration_claude");
  state.updateTask("integration_claude", "thinking");
  assert.equal(state.coordinatorTask.finalSummary, null);
  assert.equal(state.applyFinalSummary(pending, "Old result"), false);
  state.updateTask("integration_claude", "finished");
  state.setFinalSummary("integration_claude", undefined);
  assert.equal(state.coordinatorTask.finalSummary, null);
  state.setFinalSummary(state.childTasks[0].id, "- Child first list item.\n- Another item.");
  assert.equal(state.childTasks[0].finalSummary, "Child first list item.");
  const oldRun = state.completionToken(state.childTasks[0].id);
  state.syncOrca(snapshot([], { ...run, id: "new_run" }));
  assert.equal(state.applyFinalSummary(oldRun, "Wrong run"), false);
});

test("verified Orca children use full identities and stay small when inspected", async () => {
  const state = await freshState(); state.loadIntegrationTasks();
  state.syncOrca(snapshot([worker, { ...worker, id: "dispatch:a/another", terminalHandle: "term_other" }]));
  assert.equal(state.childTasks.length, 2);
  assert.notEqual(state.childTasks[0].id, state.childTasks[1].id);
  state.setFocus(state.childTasks[0].id);
  assert.equal(state.coordinatorTask.id, "integration_claude");
  assert.equal(state.coordinatorTask.sessionCwd, "C:/root");
});

test("worker removal and run switch clear old children and stale coordinator steps", async () => {
  const state = await freshState(); state.loadIntegrationTasks();
  state.syncOrca(snapshot([worker])); state.setFocus(state.childTasks[0].id);
  state.appendStep("integration_claude", "Old run");
  state.syncOrca(snapshot([], { ...run, id: "run_b", coordinatorHandle: "term_new" }));
  assert.deepEqual(state.childTasks, []);
  assert.equal(state.focusId, "integration_claude");
  assert.deepEqual(state.coordinatorTask.steps, []);
});

test("hook routing requires an unambiguous verified workspace", async () => {
  const state = await freshState(); state.loadIntegrationTasks(); state.syncOrca(snapshot([worker]));
  assert.equal(state.hookTaskId("c:\\CHILD\\"), state.childTasks[0].id);
  assert.equal(state.hookTaskId("C:/root"), "integration_claude");
  assert.equal(state.hookTaskId("C:/unrelated"), null);
  state.syncOrca(snapshot([{ ...worker, cwd: "C:/root" }]));
  assert.equal(state.hookTaskId("C:/root"), null);
});

test("connection loss removes active minis and cannot route stale session events", async () => {
  const state = await freshState(); state.loadIntegrationTasks(); state.syncOrca(snapshot([worker]));
  state.setFocus(state.childTasks[0].id); state.updateTask("integration_claude", "working");
  state.orcaUnavailable();
  assert.deepEqual(state.childTasks, []);
  assert.equal(state.effectiveState, "idle");
  assert.equal(state.focusId, "integration_claude");
  assert.equal(state.hookTaskId("C:/root"), null);
  assert.equal(state.orcaRunId, "run_a");
  state.syncOrca(snapshot([worker]));
  assert.equal(state.childTasks.length, 1);
  assert.equal(state.orcaError, null);
});

test("observed completed children remain inspectable for 60 seconds; old history stays hidden", async () => {
  const state = await freshState(); state.loadIntegrationTasks();
  const done = { ...worker, settled: true, state: "finished" };
  state.syncOrca(snapshot([done]), 0);
  assert.deepEqual(state.childTasks, []);
  state.syncOrca(snapshot([worker]), 100);
  assert.equal(state.childTasks.length, 1);
  state.syncOrca(snapshot([done]), 1000);
  assert.equal(state.childTasks[0].state, "finished");
  state.syncOrca(snapshot([]), 2000);
  assert.equal(state.childTasks[0].state, "finished");
  state.syncOrca(snapshot([done]), 60000);
  assert.equal(state.childTasks.length, 1);
  state.syncOrca(snapshot([done]), 61001);
  assert.deepEqual(state.childTasks, []);
});

test("a newer attempt replaces the cached settled attempt of the same task", async () => {
  const state = await freshState(); state.loadIntegrationTasks();
  const old = { ...worker, taskId: "task_same" };
  state.syncOrca(snapshot([old]), 0);
  state.syncOrca(snapshot([{ ...old, settled: true, state: "error" }]), 1000);
  state.syncOrca(snapshot([{ ...old, id: "dispatch:new" }]), 2000);
  assert.equal(state.childTasks.length, 1);
  assert.equal(state.childTasks[0].id, "orca_dispatch:new");
});

test("Codex prose remains scoped by exact terminal, session and turn across delayed reads",async()=>{
 const state=await freshState();state.loadIntegrationTasks();const data=snapshot([{...worker,cwd:"C:/root",paneKey:"child:pane",provider:"codex"}]);data.coordinator.provider="codex";data.coordinator.paneKey="root:pane";state.syncOrca(data);
 let pendingResolve;
 const fixture = makeHookFixture({
   State: state,
   Bridge: { approvalDecline() {}, codexMessage: async () => ({ text: "Root progress message.", phase: "commentary" }) },
 });
 globalThis.__orcaHookFixture = fixture;
 const source = (await readFile(new URL("../src/island/hooks.ts", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "");
 const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
 const module = await import(`data:text/javascript;base64,${Buffer.from(`${HOOK_FIXTURE_HEADER}${outputText}`).toString("base64")}#${Math.random()}`);
 const opened=[];state.mode="hidden";module.registerHookHandlers({alert(v){opened.push(v)},setView(){},reveal(){}});
 const root={cwd:"C:/root",orca_pane_key:"root:pane",session_id:"root_session",transcript_path:"C:/exact/root.jsonl",turn_id:"turn_a",hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:"cargo test"}};
 fixture.callback(root);assert.equal(opened.length,0,"tools must not reopen a closed island");await module.pollCodexMessages();assert.equal(opened.length,1,"new prose opens once");assert.match(state.coordinatorTask.steps.at(-1),/Root progress/);assert.ok(!state.childTasks[0].steps.includes("Root progress message."));
 await module.pollCodexMessages();assert.equal(opened.length,1,"old prose polling must not reopen");assert.equal(state.coordinatorTask.steps.filter(s=>s.includes("Root progress")).length,1);
 fixture.callback({...root,tool_input:{command:"cargo build"}});assert.match(state.coordinatorTask.steps.at(-1),/cargo build/);await module.pollCodexMessages();assert.match(state.coordinatorTask.steps.at(-1),/Root progress/);
 let nativeText="Historical child prose";
 fixture.Bridge.codexChildren=async()=>[{id:"declared-child",name:"/root/visual",state:"working",text:nativeText,phase:"commentary",turn:"own-child"}];
 const openedBeforeNative=opened.length;await module.pollCodexMessages();assert.equal(opened.length,openedBeforeNative,"native discovery does not replay history");
 nativeText="New child response";await module.pollCodexMessages();assert.equal(opened.length,openedBeforeNative+1,"new native response opens once");
 await module.pollCodexMessages();assert.equal(opened.length,openedBeforeNative+1,"native response replay stays closed");
 const rootLast=state.coordinatorTask.steps.at(-1);fixture.callback({...root,agent_id:"unknown-child",tool_input:{command:"foreign"}});assert.equal(state.coordinatorTask.steps.at(-1),rootLast);
 fixture.callback({...root,agent_id:"declared-child",tool_input:{command:"child tool"}});assert.match(state.tasks.find(t=>t.nativeSessionId)?.steps.at(-1),/child tool/);assert.equal(state.coordinatorTask.steps.at(-1),rootLast);
 fixture.Bridge.codexMessage=async()=>({text:"Child progress message.",phase:"commentary"});fixture.callback({...root,orca_pane_key:"child:pane",session_id:"child_session",transcript_path:"C:/exact/child.jsonl"});await module.pollCodexMessages();assert.match(state.childTasks[0].steps.at(-1),/Child progress/);
 fixture.Bridge.codexMessage=(_path,session)=>session==="root_session"?new Promise(resolve=>{pendingResolve=resolve}):Promise.resolve(null);const pending=module.pollCodexMessages();await new Promise(resolve=>setImmediate(resolve));fixture.callback({...root,turn_id:"turn_b",hook_event_name:"UserPromptSubmit",prompt:"New task"});pendingResolve({text:"Expired progress",phase:"commentary"});await pending;assert.ok(!state.coordinatorTask.steps.includes("Expired progress"));delete globalThis.__orcaHookFixture;
});


test("ticker displays the latest assistant prose after its bounded history rotates", async () => {
  const state = await freshState(); state.loadIntegrationTasks();
  const h = (_tag, _props, ...children) => ({
    style: {},
    children,
    textContent: "",
    addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  });
  const fixture = {h, svg: () => ({style:{}}), ICONS:{}, clamp:(x,a,b)=>Math.max(a,Math.min(b,x)), lerp:(a,b,t)=>a+(b-a)*t, cubicBezier:()=>t=>t, parseDiffStep: () => null};
  globalThis.__tickerFixture = fixture;
  const source = (await readFile(new URL("../src/views/ticker.ts",import.meta.url),"utf8")).replace(/^import .*;\r?\n/gm, "");
  const {outputText} = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}});
  const {Ticker} = await import(`data:text/javascript;base64,${Buffer.from(`const {h,svg,ICONS,clamp,lerp,cubicBezier,parseDiffStep}=globalThis.__tickerFixture;\n${outputText}`).toString("base64")}#${Math.random()}`);
  const ticker = new Ticker(); let clock=0;
  for(let i=0;i<25;i++) {state.appendStep("integration_claude",`Tool ${i}`);ticker.sync(state.coordinatorTask);ticker.tick(clock);ticker.tick(clock+400);clock+=500;}
  state.appendAssistantMessage("integration_claude","The final state now matches: only the visual review remains.");
  ticker.sync(state.coordinatorTask);ticker.tick(clock);ticker.tick(clock+400);
  assert.equal(state.coordinatorTask.steps.length,20);
  const current = ticker.el.children[1].children[1].children[0];
  assert.equal(current.textContent,"The final state now matches: only the visual review remains.");
  ticker.sync(state.coordinatorTask);assert.equal(ticker.animating,false,"metadata rerender must not enqueue the same text");
  delete globalThis.__tickerFixture;
});

test("native children survive dispatch polls, isolate root hooks and settle for bounded inspection", async () => {
 const state=await freshState();state.loadIntegrationTasks();state.syncOrca(snapshot([worker]));
 const child={id:"native-child",name:"/root/visual",state:"working",text:"Own child commentary",phase:"commentary",turn:"child-turn"};
 state.syncNativeChildren("root-session",[child],1000);
 assert.equal(state.childTasks.length,2);
 assert.equal(state.hookTaskId("C:/root","term_root"),"integration_claude");
 assert.equal(state.tasks.find(t=>t.nativeSessionId)?.provider,"codex");
 state.syncOrca(snapshot([worker]));assert.equal(state.childTasks.length,2);
 state.syncNativeChildren("root-session",[{...child,state:"finished",text:"Child final",phase:"final_answer"}],2000);
 assert.equal(state.tasks.find(t=>t.nativeSessionId)?.finalSummary,"Child final");
 state.syncNativeChildren("root-session",[],3000);assert.equal(state.childTasks.length,2);
 state.syncNativeChildren("root-session",[],62001);assert.equal(state.childTasks.length,1);
 state.syncNativeChildren("root-session",[{...child,state:"finished"}],63000);assert.equal(state.childTasks.length,1);
 state.syncOrca(snapshot([],{...run,id:"new-run"}));assert.equal(state.childTasks.length,0);
});

test("fsm cooldown transitions from home to petit and canHide preserves notch accessibility", async () => {
  const source = await readFile(new URL("../src/island/fsm.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  const { IslandStateMachine } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}#${Math.random()}`);
  const fsm = new IslandStateMachine();
  fsm.homeToPetitDelay = 0.02;
  fsm.petitToHiddenDelay = 0.03;
  let active = true;
  fsm.canHide = () => !active;

  const transitions = [];
  fsm.onTransition = (from, to) => transitions.push(`${from}->${to}`);

  fsm.forceHome();
  assert.equal(fsm.state, "home");
  fsm.mouseLeft();

  await new Promise((r) => setTimeout(r, 40));
  assert.equal(fsm.state, "petit", "cooldown expiry transitions home to petit (the notch)");
  assert.ok(transitions.includes("home->petit"));

  // While active workers exist, notch cannot hide
  fsm.mouseLeft();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fsm.state, "petit", "active workers keep notch visible");

  // Once active workers finish, notch hides after delay
  active = false;
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fsm.state, "hidden", "inactivity without active agents hides notch");
});

test("active Antigravity worker normalizes provider color and survives transient reconciliation omission", async () => {
  const state = await freshState(); state.loadIntegrationTasks();
  const agWorker = { ...worker, id: "dispatch:ag", name: "Fix Antigravity", state: "working", provider: "antigravity", taskId: "task_ag" };
  state.syncOrca(snapshot([agWorker]), 1000);

  assert.equal(state.childTasks.length, 1);
  assert.equal(state.childTasks[0].provider, "antigravity");
  assert.equal(state.childTasks[0].color, "#E879F9");

  // Transient omission in the very next poll (empty workers)
  state.syncOrca(snapshot([]), 2000);
  assert.equal(state.childTasks.length, 1, "active worker is not dropped on transient omission");
  assert.equal(state.childTasks[0].id, "orca_dispatch:ag");

  // Worker survives until grace window expires (60s)
  state.syncOrca(snapshot([]), 60000);
  assert.equal(state.childTasks.length, 1);

  state.syncOrca(snapshot([]), 62000);
  assert.equal(state.childTasks.length, 0, "worker expires after grace window");

  // Case normalization check (Gemini -> antigravity)
  const geminiWorker = { ...worker, id: "dispatch:gem", provider: "gemini" };
  state.syncOrca(snapshot([geminiWorker]), 70000);
  assert.equal(state.childTasks[0].provider, "antigravity");
  assert.equal(state.childTasks[0].color, "#E879F9");
});

test("orca poller recovers from transient snapshot errors without blanking or reconnect flicker", async () => {
  const state = await freshState(); state.loadIntegrationTasks();
  state.syncOrca(snapshot([worker]));
  state.updateTask("integration_claude", "working");
  assert.equal(state.effectiveState, "working");
  assert.equal(state.childTasks.length, 1);

  let polls = 0;
  const logged = [];
  const timeouts = [];
  const fixture = {
    IS_TAURI: true,
    State: state,
    pollCodexMessages: async () => {},
    Bridge: {
      orcaSnapshot: async () => {
        polls++;
        if (polls === 1 || polls === 2) {
          throw new Error("Unable to locate Orca.exe");
        }
        return snapshot([worker]);
      },
      orcaCompletion: async () => null,
      log: async (msg) => logged.push(msg),
    },
    window: {
      setTimeout: (fn, ms) => {
        timeouts.push({ fn, ms });
        return timeouts.length;
      },
    },
  };
  globalThis.__orcaMonitorFixture = fixture;
  const source = (await readFile(new URL("../src/island/orca.ts", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
  const module = await import(`data:text/javascript;base64,${Buffer.from(`const { Bridge, IS_TAURI, State, pollCodexMessages, window } = globalThis.__orcaMonitorFixture;\n${outputText}`).toString("base64")}#${Math.random()}`);

  module.startOrcaMonitor({});
  await new Promise((r) => setTimeout(r, 15));

  // First poll failed: transient error logged, snapshot and child tasks preserved, no blanking/flicker
  assert.equal(polls, 1);
  assert.equal(state.effectiveState, "working", "transient failure must not set effectiveState to idle");
  assert.equal(state.childTasks.length, 1, "transient failure must not wipe child tasks");
  assert.equal(state.orcaError, null, "transient failure must not set orcaError");
  assert.match(logged[0], /attempt 1/);
  assert.equal(timeouts[0].ms, 5000);

  // Second poll runs and fails
  timeouts[0].fn();
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(polls, 2);
  assert.equal(state.effectiveState, "working", "second transient failure must still preserve state");
  assert.equal(state.childTasks.length, 1);
  assert.match(logged[1], /attempt 2/);
  assert.equal(timeouts[1].ms, 10000);

  // Third poll runs and succeeds (reconnection)
  timeouts[1].fn();
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(polls, 3);
  assert.equal(state.childTasks.length, 1);
  assert.equal(state.orcaError, null);
  assert.equal(timeouts[2].ms, 5000, "delay resets to normal 5s on success");

  delete globalThis.__orcaMonitorFixture;
});

test("worker live worktree ps activity restores subagent steps, prompt, finalResponse and approval state without overwriting fresher hooks", async () => {
  const state = await freshState();
  state.loadIntegrationTasks();
  const now = Date.now();
  const activeWorker = {
    ...worker,
    id: "dispatch:live",
    name: "Telemetry Worker",
    state: "working",
    paneKey: "tab_w:leaf_w",
    activity: {
      state: "working",
      prompt: "Audit worker telemetry",
      step: "Bash · cargo test",
      updatedAt: now - 1000,
    },
  };
  state.syncOrca(snapshot([activeWorker]));
  assert.equal(state.childTasks.length, 1);
  assert.deepEqual(state.childTasks[0].steps, ["Audit worker telemetry", "Bash · cargo test"]);
  assert.equal(state.childTasks[0].stepIndex, 1);

  // Blocked worker surfaces approval state and pill badge
  state.syncOrca(snapshot([{
    ...activeWorker,
    activity: {
      state: "approval",
      step: "Bash · rm -rf target",
      updatedAt: now - 500,
    },
  }]));
  assert.equal(state.childTasks[0].state, "approval");
  assert.equal(state.childTasks[0].pillBadge, "approval");
  assert.equal(state.childTasks[0].steps.at(-1), "Bash · rm -rf target");

  // Direct hook event updates worker timestamp so older snapshot activity cannot overwrite it
  state.noteOrcaHook("orca_dispatch:live");
  state.appendStep("orca_dispatch:live", "Exécute · fresh hook step");
  state.syncOrca(snapshot([{
    ...activeWorker,
    activity: {
      state: "working",
      step: "Bash · stale snapshot step",
      updatedAt: now - 200,
    },
  }]));
  assert.equal(state.childTasks[0].steps.at(-1), "Exécute · fresh hook step");
});


