import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString("base64")}`;
async function loadEngine() {
 const anim = moduleUrl(await readFile(new URL("../src/core/anim.ts",import.meta.url),"utf8"));
 const source = (await readFile(new URL("../src/mochi/engine.ts",import.meta.url),"utf8")).replace('"../core/anim"',JSON.stringify(anim)).replace(/import \{ Sound \} from "..\/core\/sound";/,'const Sound = {play(){}};');
 return import(moduleUrl(source));
}
test("skin changes live for principal and existing minis without resetting expressions", async () => {
 const {BotEngine} = await loadEngine();
 const main = new BotEngine(), mini = new BotEngine(); mini.isMini=true;
 main.setState("thinking",true); mini.setState("finished",true);
 assert.equal(main.skin,"classic");
 BotEngine.setOrcaSkin(true);
 assert.equal(main.skin,"orca"); assert.equal(mini.skin,"orca");
 assert.equal(main.state,"thinking"); assert.equal(mini.state,"finished");
 BotEngine.setOrcaSkin(false);
 assert.equal(main.skin,"classic"); assert.equal(mini.skin,"classic");
});

test("orca facial markings remain anchored to eyes and fins follow gaze in both axes", async () => {
 const {orcaLandmarks} = await loadEngine();
 assert.equal(typeof orcaLandmarks,"function");
 const centered=orcaLandmarks(0,0,0,60,45);
 for(const [yaw,pitch] of [[-.6,0],[.6,0],[0,-.4],[0,.4],[.4,.3]]){
  const moved=orcaLandmarks(yaw,pitch,0,60,45);
  for(let i=0;i<2;i++){
   assert.ok(Math.abs((moved.patches[i].x-moved.eyes[i].x)-(centered.patches[i].x-centered.eyes[i].x))<1e-8);
   assert.ok(Math.abs((moved.patches[i].y-moved.eyes[i].y)-(centered.patches[i].y-centered.eyes[i].y))<1e-8);
  }
  if(yaw)assert.equal(Math.sign(moved.face.x),Math.sign(yaw));
  if(pitch)assert.equal(Math.sign(moved.fins[0].y-centered.fins[0].y),-Math.sign(pitch));
 }
});
test("orca never draws a mouth, including morph states; classic retains its mouth",async()=>{
 const {BotEngine}=await loadEngine();const e=new BotEngine();let mouths=0, strokes=0;
 for(const name of ["drawHandsBehind","drawOrcaFins","drawBody","drawEyes","drawParticles"])e[name]=()=>{};
 e.bodyPath=()=>({});e.drawMouth=()=>mouths++;
 const ctx=new Proxy({stroke(){strokes++}},{get(o,key){return key in o?o[key]:()=>{}}});
 BotEngine.setOrcaSkin(true);e.draw(ctx,160,160);e.morph=1;e.draw(ctx,160,160);
 assert.equal(strokes,0);assert.equal(mouths,0);
 BotEngine.setOrcaSkin(false);e.draw(ctx,160,160);assert.equal(mouths,1);
});

test("real cursor-side input turns the orca face toward cursor with lateral depth",async()=>{
 const {BotEngine,orcaLandmarks}=await loadEngine();
 for(const cursorDelta of [-420,420]){
  const e=new BotEngine();e.lookX=Math.tanh(cursorDelta/260);
  for(let i=0;i<45;i++)e.update(.016);
  const pose=orcaLandmarks(e.yaw,e.pitch,e.roll,60,45);
  assert.equal(Math.sign(e.yaw),Math.sign(cursorDelta));
  assert.equal(Math.sign(pose.face.x),Math.sign(cursorDelta));
  const near=cursorDelta>0?0:1,far=1-near;
  assert.ok(pose.fins[near].scale>pose.fins[far].scale,"near fin must be larger when body turns");
 }
});


test("principal choice and verified child provider skins remain independent live", async()=>{
 const {BotEngine,providerSkin}=await loadEngine();
 const main=new BotEngine(), child=new BotEngine();child.isMini=true;child.setState("working",true);
 assert.equal(typeof providerSkin,"function");
 child.setSkin(providerSkin("codex"));BotEngine.setPrincipalSkin("claude");
 assert.equal(main.skin,"claude");assert.equal(child.skin,"codex");
 BotEngine.setPrincipalSkin("orca");assert.equal(main.skin,"orca");assert.equal(child.skin,"codex");assert.equal(child.state,"working");
 for(const provider of ["claude","codex","antigravity"])assert.equal(providerSkin(provider),provider);
 assert.equal(providerSkin("luna"),"classic");assert.equal(providerSkin(null),"classic");
 BotEngine.setPrincipalSkin("classic");
});
