import { chromium } from 'playwright-core';
const SP='/tmp/claude-0/-home-user-Cozy-Farm/233887ae-6204-5690-8cc0-ce6213bdd661/scratchpad';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1100,height:700} });
const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error') errs.push('console:'+m.text().slice(0,200)); });
await p.goto('http://localhost:5173/?practice=1');
await p.waitForFunction(()=>window.__game && window.__scene, null, {timeout:90000});
await p.waitForTimeout(2500);
await p.evaluate(async()=>{
  const g=window.__game; g.state.player.created=true; g.state.tutorial.done=true; g.state.player.level=100; g.state.player.coins=1e9;
  document.querySelectorAll('.overlay,.panel-overlay').forEach(e=>e.remove());
  const d=await import('/src/data/index.ts');
  for (let x=0;x<20;x++) for (let z=0;z<20;z++) g.unlockChunk(`${x},${z}`);
  window.__ids=d.BUILDINGS.filter(b=>b.level>=82&&b.level<=100&&b.cat==='decor'&&!/^marker_|^rank_/.test(b.id)).map(b=>b.id);
});
const total = await p.evaluate(()=>window.__ids.length);
const per=15;
for (let k=0; k*per<total; k++) {
  const res = await p.evaluate(async([k,per])=>{
    const g=window.__game; const d=await import('/src/data/index.ts'); const {buildings}=await import('/src/systems/Buildings.ts'); const {HALF}=await import('/src/world/Grid.ts');
    for (const b of [...g.state.buildings]) buildings.remove(b.uid);
    const ids=window.__ids.slice(k*per,(k+1)*per); const fail=[]; const names=[];
    ids.forEach((id,i)=>{ g.state.storage[id]=1; const x=10+(i%5)*6, z=12+Math.floor(i/5)*6; const bb=buildings.place(id,x,z,0,true); if(!bb) fail.push(id); names.push(id); });
    window.__scene.rig.focus(22-HALF,18-HALF,26,0.05);
    return {names,fail};
  },[k,per]);
  await p.waitForTimeout(3500);
  await p.screenshot({path:SP+`/grand${k}.png`});
  console.log(k, res.fail.join(','), '|', res.names.join(' '));
}
console.log(errs.slice(0,6));
await b.close();
