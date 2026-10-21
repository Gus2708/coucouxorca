import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadEngine() {
  const source = (await readFile(new URL("../src/mochi/engine.ts", import.meta.url), "utf8"))
    .replace('import { Ease, lerp, type EaseFn } from "../core/anim";', 'const Ease = { out: (x) => x, in: (x) => x, lin: (x) => x, inOut: (x) => x }; const lerp = (a, b, t) => a + (b - a) * t;')
    .replace('import { Sound } from "../core/sound";', 'const Sound = { play() {} };')
    .replace('import { PUMPKIN_BODY, drawOutfitBehind, drawOutfitFront, makeHead } from "./outfits";', 'const PUMPKIN_BODY = ["#000", "#000"]; const drawOutfitBehind = () => {}; const drawOutfitFront = () => {}; const makeHead = () => null;');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}#${Math.random()}`);
}

test("provider identity selects the matching mini skin and keeps the principal choice independent", async () => {
  const { BotEngine, avatarSkin, providerSkin } = await loadEngine();
  const principal = new BotEngine();
  const child = new BotEngine();
  child.isMini = true;
  child.setState("working", true);

  BotEngine.setPrincipalSkin("claude");
  child.setSkin(providerSkin("codex"));
  assert.equal(principal.skin, "claude");
  assert.equal(child.skin, "codex");
  assert.equal(child.state, "working");

  BotEngine.setPrincipalSkin("orca");
  assert.equal(principal.skin, "orca");
  assert.equal(child.skin, "codex");
  assert.equal(providerSkin("antigravity"), "antigravity");
  assert.equal(providerSkin("claude"), "claude");
  assert.equal(providerSkin("claude-desktop"), "claude");
  assert.equal(providerSkin("codex"), "codex");
  assert.equal(providerSkin("unknown"), "classic");
  assert.equal(avatarSkin("codex"), "codex");
  assert.equal(avatarSkin("invalid"), "classic");
});

test("Codex mini skin uses the provider renderer without the classic mouth or forehead mark", async () => {
  const { BotEngine } = await loadEngine();
  const previousPath2D = globalThis.Path2D;
  globalThis.Path2D = class {
    moveTo() {} lineTo() {} closePath() {} roundRect() {} bezierCurveTo() {} ellipse() {}
  };
  const paintedText = [];
  const gradient = { addColorStop() {} };
  const context = new Proxy({ fillText: (...args) => paintedText.push(args) }, {
    get(target, key) { return key in target ? target[key] : () => gradient; },
    set(target, key, value) { target[key] = value; return true; },
  });
  try {
    const engine = new BotEngine();
    engine.isMini = true;
    engine.setSkin("codex");
    engine.morph = 1;
    let classicMouths = 0;
    engine.drawMouth = () => classicMouths++;
    engine.drawEyes = () => {};
    engine.drawParticles = () => {};
    engine.draw(context, 48, 48);
    assert.equal(classicMouths, 0);
    assert.deepEqual(paintedText, []);
  } finally {
    if (previousPath2D === undefined) delete globalThis.Path2D;
    else globalThis.Path2D = previousPath2D;
  }
});
