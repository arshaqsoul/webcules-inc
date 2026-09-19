/* wildcode-engine.js — extracted from index.html (single source: keep in sync or move to TS)
   Framework-free. No top-level DOM access — safe to import during SSR/build. */
"use strict";
/* ============================================================================
 * STEP 0 — CONFIG + PHASE MODEL
 * ----------------------------------------------------------------------------
 * The whole animation is a 4-phase cycle. All timing lives here. Elements
 * never "know" the phase; the scheduler (STEP 5) reduces the phase state to
 * a per-element bloom factor in [0..1]. That is the key reuse contract.
 * ==========================================================================*/
const PHASES = [
  {name:"GROW",    dur:6.0},   // beam expands from origin, everything blooms in
  {name:"HOLD",    dur:5.0},   // full bloom, sway only (this is the "idle" beauty shot)
  {name:"RETRACT", dur:1.8},   // staggered deflation, vines get root-severed
  {name:"REST",    dur:0.6},   // bare solid letters, breath before re-growth
];
const DEFAULTS = {
  phrase:"Start today",
  seed:7,
  fontStack:'900 {px}px system-ui, "Segoe UI", Arial, sans-serif',
  pad:36,              // canvas padding around letters (css px) — room for overflow
  beamDur:6, holdDur:5,
  flowerDensity:1.0,   // multiplier on dart-throwing attempts
  vineCount:26,
  droneCount:4,
  sway:0.14,           // radians of dual-sine sway
  cursorRadius:170,    // pointer paint-beam radius
  droneGlowRadius:110, // each drone carries a paint glow of this radius
  lineHeight:1.04,     // v2: line spacing multiplier for wrapped text
  maxHeight:430,       // v2: height cap the font auto-fit respects
  letterColor:"#5839a8",// v2: L0 stencil fill color
  spriteSet:"flowers", // v2: flowers | stars | bubbles | hearts (or customDraw)
  critterStyle:"drone",// v2: drone | bee | ghost
  clipFlowers:false,   // v2: false = objects may overflow letters; true = clipped inside (Tines-style)
  hoverRecolor:true,   // v2.1: hovering a sprite recolors it to a random palette family (stable while hovered)
};
const PALETTE = [ // flower families (fill, petal accent, center)
  {f:"#e879f9", p:"#f0abfc", c:"#7c3aed"},  // pink
  {f:"#8b5cf6", p:"#c4b5fd", c:"#4c1d95"},  // purple
  {f:"#fb923c", p:"#fed7aa", c:"#c2410c"},  // orange
  {f:"#4ade80", p:"#bbf7d0", c:"#166534"},  // green
  {f:"#a3e635", p:"#d9f99d", c:"#3f6212"},  // lime
];

/* ============================================================================
 * STEP 1 — UTILITIES: seeded RNG + easings + geometry
 * ----------------------------------------------------------------------------
 * Everything random is seeded (mulberry32) so layouts are reproducible per
 * seed — this mirrors Tines' `hydratePlacements(seed)` determinism and makes
 * art direction stable across reloads and machines.
 * ==========================================================================*/
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const easeOutCubic=t=>1-Math.pow(1-t,3);
const dist=(x1,y1,x2,y2)=>Math.hypot(x2-x1,y2-y1);
// dual-sine sway: one base wave + one inharmonic partial = organic, never loops visibly
function swayAngle(t,phase,amount){return amount*(0.6*Math.sin(t*1.1+phase)+0.4*Math.sin(t*1.87+phase*1.7));}

/* ============================================================================
 * STEP 2 — SHAPE SOURCE: text → stencil mask  (THE swap-point for forge)
 * ----------------------------------------------------------------------------
 * Demo mode renders the phrase with a heavy system font into an offscreen
 * canvas → that bitmap IS the stencil. It provides:
 *    inside(x,y)      point-in-letters test (alpha sample) — used by vines
 *                     (growth constraint) and placements (dart throwing)
 *    wordBoxes[]      per-word rects (drone territories)
 *    baseCanvas()     the solid-fill letters (L0)
 *    maskCanvas       raw stencil (debug view + optional destination-in use)
 *
 * FORGE: replace this whole object with a Path2D ShapeSource — build `mask`
 * by ctx.fill(path2d) of hand-lettered outlines (exactly what Tines does:
 * their WORDS[].path strings + DOMMatrix translation). The rest of the
 * engine never needs to know.
 * ==========================================================================*/
class MaskField{
  constructor(){this.scale=1;this.W=0;this.H=0;this.words=[];this.ready=false;}
  build(text, cssW, dpr, cfg){
    this._cfg=cfg;
    this.dpr=dpr;
    // -- fit font size: try sizes until the wrapped text fits the width --
    const maxW=cssW-cfg.pad*2, maxH=cfg.maxHeight, LH=cfg.lineHeight;
    let px=210, layout;
    for(;px>=54;px-=6){
      layout=this._layout(text,px,maxW,false,cfg);
      if(layout && layout.lines.length*px*LH<=maxH) break;
    }
    if(!layout) layout=this._layout(text,54,maxW,true,cfg); // single very long word: force-fit
    this.px=px;
    this.H=Math.ceil(layout.lines.length*px*LH + cfg.pad*2);
    this.W=Math.ceil(cssW);
    // -- rasterize stencil at device resolution --
    const m=this.maskCanvas=document.createElement("canvas");
    m.width=Math.ceil(this.W*dpr); m.height=Math.ceil(this.H*dpr);
    const c=m.getContext("2d",{willReadFrequently:true});
    c.scale(dpr,dpr);
    c.font=this._font(); c.textBaseline="alphabetic"; c.fillStyle="#fff";
    this.words=[]; this.lines=layout.lines;
    let y=cfg.pad+px*0.86;
    for(const line of layout.lines){
      const lw=c.measureText(line.text).width;
      const x=(this.W-lw)/2;
      c.fillText(line.text,x,y);
      for(const w of line.words){ // per-word rects in css px (drone territories)
        const wx=x+w.x, ww=c.measureText(w.text).width;
        this.words.push({text:w.text,x:wx,y:y-px*0.86,w:ww,h:px*1.02});
      }
      y+=px*LH;
    }
    // -- alpha index for fast point-in-stencil tests --
    const d=c.getImageData(0,0,m.width,m.height).data;
    this.alpha=i=>d[i*4+3];
    this.ready=true;
    // -- L0 base letters: stencil filled with brand purple (cached, dirty-flagged) --
    const b=this.baseCanvas=document.createElement("canvas");
    b.width=m.width; b.height=m.height;
    const bc=b.getContext("2d");
    bc.drawImage(m,0,0);
    bc.globalCompositeOperation="source-in";   // <<< the stencil trick
    bc.fillStyle=cfg.letterColor;
    bc.fillRect(0,0,b.width,b.height);
  }
  _font(){return this._cfg.fontStack.replace("{px}",this.px);}
  _layout(text,px,maxW,force,cfg){
    if(!this._measure) this._measure=document.createElement("canvas").getContext("2d");
    const cv=this._measure;
    cv.font=cfg.fontStack.replace("{px}",px);
    const words=text.trim().split(/\s+/).map(t=>({text:t,w:cv.measureText(t).width}));
    const sp=cv.measureText(" ").width, lines=[];
    let cur={text:"",words:[],w:0};
    for(const w of words){
      const add=(cur.words.length?sp:0)+w.w;
      if(cur.words.length && cur.w+add>maxW){lines.push(cur);cur={text:"",words:[],w:0};}
      cur.words.push({...w,x:cur.w+(cur.words.length?sp:0)});
      cur.w+=add; cur.text=cur.words.map(q=>q.text).join(" ");
    }
    if(cur.words.length)lines.push(cur);
    return (!force && lines.some(l=>l.w>maxW))?null:{lines};
  }
  inside(x,y){ // css-px point → stencil alpha test
    const W=this.maskCanvas.width,H=this.maskCanvas.height;
    const xi=Math.round(x*this.dpr), yi=Math.round(y*this.dpr);
    if(xi<0||yi<0||xi>=W||yi>=H)return false;
    return this.alpha(yi*W+xi)>48;
  }
}

/* ============================================================================
 * STEP 3 — SPRITE FACTORY: pluggable object sets, prerendered to canvases
 * ----------------------------------------------------------------------------
 * HOW THE FLOWERS ARE MADE: each (variant × color-family) sprite is drawn ONCE
 * into a small offscreen canvas — petals are rotated ellipses around a center,
 * with a seed-core. The render loop only ever does drawImage + transform.
 * Switching objects = registering another draw function. Four builtin sets:
 * flowers / stars / bubbles / hearts. For forge: either add a set here, or set
 * DEFAULTS.customSpriteDraw = (ctx,S,family,variant) => {...} (or extend
 * SPRITE_SETS with image-based loaders — rasterize once, same contract).
 * A "HOT" twin of every sprite (white-ringed, brightened) is auto-generated
 * with `source-atop` — used for hover/click feedback (STEP 8).
 * ==========================================================================*/
// sprites are built per-instance by buildSprites(), which returns fresh {SPRITES, SPRITES_HOT}
function makeHot(base){ // feedback twin: brightened, clipped to the sprite's own pixels (no ring)
  const cv=document.createElement("canvas");cv.width=base.width;cv.height=base.height;
  const c=cv.getContext("2d");
  c.drawImage(base,0,0);
  c.globalCompositeOperation="source-atop";
  c.fillStyle="rgba(255,255,255,0.45)";c.fillRect(0,0,cv.width,cv.height);
  return cv;
}
const SPRITE_SETS={
  flowers(c,S,fam,v){
    const col=PALETTE[fam], n=6+v*2, R=S*0.40, n2=Math.ceil(n*0.6);
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2;
      let w=S*0.16, r=R, alt=(v===1&&i%2);
      if(v===2&&i>=n2)continue;
      if(v===3){w=S*0.07;r=R*1.15;}
      c.save();c.rotate(a);
      c.fillStyle=alt?col.p:col.f;
      c.beginPath();c.ellipse(0,-R*0.55,w,r*0.5,0,0,Math.PI*2);c.fill();
      c.restore();
    }
    c.fillStyle=col.c;c.beginPath();c.arc(0,0,S*0.11,0,Math.PI*2);c.fill();
    c.fillStyle="#ffffff55";c.beginPath();c.arc(-S*0.03,-S*0.03,S*0.045,0,Math.PI*2);c.fill();
  },
  stars(c,S,fam,v){
    const col=PALETTE[fam], points=5+v, R=S*0.44, r=R*(0.42+v*0.05);
    c.beginPath();
    for(let i=0;i<points*2;i++){
      const a=i/(points*2)*Math.PI*2-Math.PI/2, rad=i%2?r:R;
      i?c.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):c.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);
    }
    c.closePath();
    c.fillStyle=col.f;c.fill();
    c.strokeStyle=col.c;c.lineWidth=S*0.03;c.stroke();
    c.fillStyle="#ffffffaa";c.beginPath();c.arc(-S*0.06,-S*0.06,S*0.05,0,Math.PI*2);c.fill();
  },
  bubbles(c,S,fam,v){
    const col=PALETTE[fam], R=S*(0.34+v*0.03);
    const g=c.createRadialGradient(-R*0.3,-R*0.3,R*0.1,0,0,R);
    g.addColorStop(0,"#ffffffcc");g.addColorStop(0.35,col.p);g.addColorStop(1,col.f);
    c.fillStyle=g;c.beginPath();c.arc(0,0,R,0,Math.PI*2);c.fill();
    c.strokeStyle=col.c;c.lineWidth=S*0.025;c.stroke();
    c.fillStyle="#ffffffdd";c.beginPath();c.ellipse(-R*0.35,-R*0.4,R*0.16,R*0.09,-0.6,0,Math.PI*2);c.fill();
  },
  hearts(c,S,fam,v){
    const col=PALETTE[fam], R=S*(0.36+v*0.015);
    c.save();c.rotate((v-1.5)*0.12);
    c.fillStyle=col.f;c.beginPath();
    const k=R/16;
    c.moveTo(0,10*k);
    c.bezierCurveTo(-14*k,2*k,-11*k,-10*k,0,-4*k);
    c.bezierCurveTo(11*k,-10*k,14*k,2*k,0,10*k);
    c.fill();
    c.strokeStyle=col.c;c.lineWidth=S*0.03;c.stroke();
    c.fillStyle="#ffffff88";c.beginPath();c.arc(-5*k,-4*k,2.4*k,0,Math.PI*2);c.fill();
    c.restore();
  },
};
function buildSprites(setName){
  const draw=DEFAULTS.customSpriteDraw||SPRITE_SETS[setName]||SPRITE_SETS.flowers;
  const SPRITES=[], SPRITES_HOT=[]; // fresh arrays per call — instances never share
  for(let v=0;v<4;v++){
    SPRITES[v]=[];SPRITES_HOT[v]=[];
    for(let fam=0;fam<PALETTE.length;fam++){
      const S=64, cv=document.createElement("canvas"); cv.width=cv.height=S;
      const c=cv.getContext("2d"); c.translate(S/2,S/2);
      draw(c,S,fam,v);
      SPRITES[v][fam]=cv;
      SPRITES_HOT[v][fam]=makeHot(cv);
    }
  }
  return { SPRITES, SPRITES_HOT };
}

/* ============================================================================
 * STEP 4 — PLACEMENT ENGINE: seeded dart-throwing inside the stencil
 * ----------------------------------------------------------------------------
 * Flowers are placed by rejection sampling: throw a point, keep it if
 * mask.inside() and it respects a minimum distance to accepted neighbors
 * (spatial hash grid). Deterministic per seed. `dist` to the beam origin is
 * stored NOW because it defines the bloom ORDER later (STEP 5) — order is
 * data, not animation state.
 * ==========================================================================*/
function computePlacements(mask, rng, density, cfg){
  const pts=[], grid=new Map(), cell=26;
  const gi=(x,y)=>((x/cell)|0)+":"+((y/cell)|0);
  const near=(x,y)=>{const gx=(x/cell)|0, gy=(y/cell)|0;
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){
    const arr=grid.get((gx+a)+":"+(gy+b));
    if(arr)for(const q of arr)if(dist(x,y,q.x,q.y)<cell*0.92)return true;}return false;};
  const attempts=Math.floor((mask.W*mask.H)/900*density);
  const ox=mask.W*0.16, oy=mask.H*0.35;               // beam origin (like Tines' .15w/.35h)
  for(let i=0;i<attempts;i++){
    const x=cfg.pad+rng()* (mask.W-cfg.pad*2), y=cfg.pad+rng()*(mask.H-cfg.pad*2);
    if(!mask.inside(x,y)||near(x,y))continue;
    const k=gi(x,y); grid.set(k,[...(grid.get(k)||[]),{x,y}]);
    pts.push({x,y,size:13+rng()*20,variant:(rng()*4)|0, // SPRITE_SETS produce 4 variants each
              family:(rng()*PALETTE.length)|0,dist:dist(x,y,ox,oy),
              phase:rng()*Math.PI*2,phase2:rng()*Math.PI*2,
              spin:(rng()-0.5)*0.9,press:1});
  }
  return pts;
}

/* ============================================================================
 * STEP 5 — BEAM SCHEDULER: turning phase-time into per-element bloom
 * ----------------------------------------------------------------------------
 * bloom(p) = max( beamWave, cursorGlow, droneGlows ), each eased.
 * This is the exact trick that makes Tines' animation feel alive: three
 * independent "paint sources" write into ONE scalar per element, and the
 * draw code is a pure function of (element, scalar).
 * ==========================================================================*/
function makeScheduler(mask,cfg){
  const ox=mask.W*0.16, oy=mask.H*0.35;
  let maxD=0; for(const w of mask.words) maxD=Math.max(maxD,dist(ox,oy,w.x+w.w/2,w.y+w.h/2));
  maxD=Math.max(maxD,mask.W*0.6);
  return {
    maxD, ox, oy,
    beamRadius(tGrow,dur){return easeOutCubic(clamp(tGrow/dur,0,1))*this.maxD*1.15;},
    bloom(p,tGrow,dur,pointer,drones,dronePaint){
      const soft=95;
      let b=clamp((this.beamRadius(tGrow,dur)-p.dist)/soft,0,1);
      if(pointer.active){
        b=Math.max(b,clamp(1-dist(p.x,p.y,pointer.x,pointer.y)/cfg.cursorRadius,0,1)*0.96);
      }
      if(dronePaint)for(const d of drones){ // drones only paint during HOLD — keeps the GROW wave clean
        b=Math.max(b,clamp(1-dist(p.x,p.y,d.x,d.y)/cfg.droneGlowRadius,0,1)*0.9);
      }
      return easeOutCubic(b);
    },
    retractVis(p,rt){ // staggered deflation: far elements fold first
      return 1-clamp((rt*1.35-p.dist/this.maxD*0.8)/0.45,0,1);
    }
  };
}

/* ============================================================================
 * STEP 6 — VINE SYSTEM: growth constrained by the stencil
 * ----------------------------------------------------------------------------
 * Roots are accepted placement points; each tick the tip advances with a
 * turning-rate driven by seeded noise. `mask.inside()` is the ONLY constraint
 * (tip dies at the letter edge) — geometrically constrained growth replaces
 * Tines' bitmap `destination-in` clipping because our vines are procedural,
 * not pre-rendered art. Both approaches are valid; clipping is required when
 * vine art is an external SVG you can't steer.
 * Vines also die if the root gets "severed" during RETRACT (rootCutAt in
 * Tines' code) — the drawn length simply deflates.
 * ==========================================================================*/
class VineSystem{
  constructor(mask,placements,rng,count){
    this.vines=[]; this.mask=mask;
    const roots=[...placements].sort(()=>rng()-0.5).slice(0,count);
    for(const r of roots){
      this.vines.push({x:r.x,y:r.y,rootDist:r.dist,heading:rng()*Math.PI*2,
        turn:(rng()-0.5)*1.6,seed:rng()*100,grown:0,maxLen:60+rng()*130,
        pts:[{x:r.x,y:r.y}],alive:true,seg:5,leafEvery:4+rng()*4|0});
    }
  }
  tick(dt,beamR,globalGrowth){
    for(const v of this.vines){
      if(!v.alive)continue;
      if(v.rootDist>beamR)continue;                       // root not reached yet
      if(!globalGrowth){v.grown=Math.max(0,v.grown-dt*140);continue;} // retract
      if(v.grown>=v.maxLen){v.alive=false;continue;}
      v.grown+=dt*(30+(v.seed%10)*3);
      let tip=v.pts[v.pts.length-1];
      let acc=this.totalLen(v);
      while(acc<v.grown){
        v.heading+=Math.sin(v.seed+acc*0.05)*0.22+v.turn*0.04;
        const nx=tip.x+Math.cos(v.heading)*v.seg, ny=tip.y+Math.sin(v.heading)*v.seg;
        if(!this.mask.inside(nx,ny)){ // at the letter edge: reflect or die
          v.heading+=Math.PI*(0.75+((v.seed*acc)%1)*0.5);
          const rx=tip.x+Math.cos(v.heading)*v.seg, ry=tip.y+Math.sin(v.heading)*v.seg;
          if(!this.mask.inside(rx,ry)){v.alive=false;break;}
        }
        tip={x:tip.x+Math.cos(v.heading)*v.seg,y:tip.y+Math.sin(v.heading)*v.seg};
        v.pts.push(tip); acc+=v.seg;
      }
    }
  }
  totalLen(v){return (v.pts.length-1)*v.seg;}
  draw(c,globalGrowth){
    c.lineCap="round";
    for(const v of this.vines){
      const n=Math.min(v.pts.length, 1+Math.floor((globalGrowth? v.grown : Math.max(0,v.grown))/v.seg));
      if(n<2)continue;
      for(let i=1;i<n;i++){
        const t=i/n;
        c.strokeStyle=i%2?"#3f9e63":"#2f7a4c";
        c.lineWidth=Math.max(0.8,3.4*(1-t*0.75));
        c.beginPath();c.moveTo(v.pts[i-1].x,v.pts[i-1].y);c.lineTo(v.pts[i].x,v.pts[i].y);c.stroke();
        if(i%v.leafEvery===0){ // little leaf
          const a=Math.atan2(v.pts[i].y-v.pts[i-1].y,v.pts[i].x-v.pts[i-1].x);
          c.save();c.translate(v.pts[i].x,v.pts[i].y);c.rotate(a+(i%8?1:-1));
          c.fillStyle="#57c17c";c.beginPath();c.ellipse(4,0,5.5,2.2,0,0,Math.PI*2);c.fill();c.restore();
        }
      }
    }
  }
}

/* ============================================================================
 * STEP 7 — DRONE SYSTEM: roaming critters that ARE the paint sources
 * ----------------------------------------------------------------------------
 * Each drone wanders inside a word's territory box (Tines clamps drone boxes
 * to ±72px around each word so critters never cross words). Drones carry the
 * L1 radial glows — they are the *reason* flowers bloom near them, because
 * the scheduler (STEP 5) treats every drone as a mini paint beam.
 * A special follower drone homes to the pointer (Tines' CURSOR_DRONE).
 * ==========================================================================*/
class DroneSystem{
  constructor(mask,rng,count,pointer,cfg){
    this.cfg=cfg;
    this.drones=[];this.pointer=pointer;
    const boxes=mask.words.length?mask.words:[{x:0,y:0,w:mask.W,h:mask.H}];
    for(let i=0;i<count;i++){
      const box=boxes[i%boxes.length];
      const d={box,x:box.x+rng()*box.w,y:box.y+box.h*0.55,
        tx:0,ty:0,retarget:0,vx:0,vy:0,phase:rng()*7,prop:rng()*7,
        press:0,scale:0.8+rng()*0.5,follower:false};
      this.retarget(d,rng);this.drones.push(d);
    }
    if(count>0){ // cursor follower
      const f={box:boxes[0],x:mask.W*0.5,y:mask.H*0.7,tx:0,ty:0,retarget:0,
        vx:0,vy:0,phase:3,prop:0,press:0,scale:0.95,follower:true};
      this.drones.push(f);
    }
  }
  retarget(d,rng=Math.random){
    d.tx=d.box.x+20+Math.random()*(d.box.w-40);
    d.ty=d.box.y+d.box.h*0.45+Math.random()*d.box.h*0.5;
    d.retarget=2+Math.random()*4;
  }
  tick(dt,t){
    for(const d of this.drones){
      d.prop+=dt*(10+(d.press>0?14:0));
      d.phase+=dt;
      d.press=Math.max(0,d.press-dt*3);
      if(d.follower){
        if(this.pointer.active){
          d.tx=this.pointer.x;d.ty=this.pointer.y+14;
          const k=1-Math.exp(-dt*3.2);
          d.x+=(d.tx-d.x)*k; d.y+=(d.ty-d.y)*k;
        }
      }else{
        d.retarget-=dt;
        if(d.retarget<=0||dist(d.x,d.y,d.tx,d.ty)<14)this.retarget(d);
        const excited=this.pointer.active&&dist(d.x,d.y,this.pointer.x,this.pointer.y)<180;
        const sp=excited?95:34;
        const a=Math.atan2(d.ty-d.y,d.tx-d.x);
        d.x+=Math.cos(a)*sp*dt; d.y+=Math.sin(a)*sp*dt;
        d.excited=excited;
      }
    }
  }
  draw(c,t,glows=true){
    for(const d of this.drones){
      const bob=Math.sin(d.phase*2.4)*4;
      const x=d.x, y=d.y+bob, s=d.scale*(1-d.press*0.35);
      // L1 glow (magenta paint beam) — drawn under the body
      if(glows&&(this.pointer.active||!d.follower)){
        const R=this.cfg.droneGlowRadius*(d.excited||d.follower?1.35:1);
        const g=c.createRadialGradient(x,y,4,x,y,R);
        g.addColorStop(0,"rgba(232,121,249,0.30)");
        g.addColorStop(1,"rgba(232,121,249,0)");
        c.fillStyle=g;c.beginPath();c.arc(x,y,R,0,Math.PI*2);c.fill();
      }
      c.save();c.translate(x,y);c.scale(s,s);
      // ground shadow
      c.fillStyle="rgba(42,26,94,0.10)";
      c.beginPath();c.ellipse(0,26-bob*0.5,16*(1-bob*0.02),4,0,0,Math.PI*2);c.fill();
      // body colors react to state: normal → excited (pointer near) → pressed flash
      const body=d.press>0?"#e879f9":(d.excited?"#7c3aed":"#2a1a5e");
      const style=this.cfg.critterStyle;
      if(style==="bee"){
        // striped bee: flapping wings instead of a propeller
        const flap=Math.sin(d.prop*2)*0.9;
        for(const side of [-1,1]){
          c.save();c.translate(side*7,-14);c.rotate(side*(0.5+flap*0.5));
          c.fillStyle="rgba(255,255,255,0.75)";
          c.beginPath();c.ellipse(0,-6,4.5,9,0,0,Math.PI*2);c.fill();c.restore();
        }
        c.fillStyle="#f5c542";c.beginPath();c.ellipse(0,0,14,11,0,0,Math.PI*2);c.fill();
        c.fillStyle=body;
        for(const sx of [-6,0,6]){c.beginPath();c.ellipse(sx,0,2.6,11,0,0,Math.PI*2);c.fill();}
        c.fillStyle=body;c.beginPath();c.arc(0,-9,6,Math.PI,0);c.fill();
      }else if(style==="ghost"){
        // ghost: translucent blob, wavy hem, floats higher
        c.fillStyle=body; c.globalAlpha=0.85;
        c.beginPath();
        c.moveTo(-13,10);
        c.quadraticCurveTo(-15,-18,0,-18);
        c.quadraticCurveTo(15,-18,13,10);
        for(let i=0;i<4;i++) c.quadraticCurveTo(13-6.5*(i*2+1), 10+(i%2?4:-2), 13-6.5*(i+1)*2, 10);
        c.closePath();c.fill();c.globalAlpha=1;
      }else{ // "drone" — the original propeller critter
        c.fillStyle="#7a5cd6";
        const pw=Math.abs(Math.sin(d.prop))*15+3;
        c.beginPath();c.ellipse(0,-16,pw,3,0,0,Math.PI*2);c.fill();
        c.fillStyle=body;c.fillRect(-1.5,-16,3,5);
        c.fillStyle=body;
        c.beginPath();c.ellipse(0,0,13,15,0,0,Math.PI*2);c.fill();
        c.fillStyle=d.press>0?"#fbd5ff":"#4c3a9e";
        c.beginPath();c.ellipse(0,5,9,8,0,0,Math.PI*2);c.fill();
      }
      // eyes track the pointer (shared by all styles)
      let ex=0,ey=0;
      if(this.pointer.active){
        const a=Math.atan2(this.pointer.y-y,this.pointer.x-x);
        ex=Math.cos(a)*2.2;ey=Math.sin(a)*2.2;
      }
      for(const side of [-1,1]){
        c.fillStyle="#fff";c.beginPath();c.arc(side*5,-3,4.4,0,Math.PI*2);c.fill();
        c.fillStyle="#14102b";c.beginPath();c.arc(side*5+ex,-3+ey,2.1,0,Math.PI*2);c.fill();
      }
      // little legs (not for ghosts — they float)
      if(style!=="ghost"){
        c.strokeStyle=body;c.lineWidth=2;
        for(const side of [-1,1]){
          c.beginPath();c.moveTo(side*6,13);c.lineTo(side*8,18+Math.sin(d.phase*6+side)*1.5);c.stroke();
        }
      }
      c.restore();
    }
  }
}

/* ============================================================================
 * STEP 8 — RENDERER: layered composite on one visible canvas
 * ----------------------------------------------------------------------------
 * Frame order = the layer stack from the header comment. Two perf rules:
 *   1) the stencil (L0) is cached and only rebuilt on resize/text change
 *   2) sprites are prerendered (STEP 3); the loop is transform+drawImage only
 * Tines adds per-layer dirty flags + destination-in masking of pre-rendered
 * vine art — worth adding when your layers get expensive.
 * ==========================================================================*/
class Renderer{
  constructor(canvas,mask,cfg){
    this.cv=canvas;this.mask=mask;this.cfg=cfg;this.dpr=1;
    this.show={base:1,glow:1,vine:1,flower:1,drone:1,cursor:1};
    this.debug={mask:false,placements:false};
    this.clickFx=[]; // v2: click shockwaves {x,y,t0} — popped flowers near each click
  }
  resize(cssW,cssH){
    this.dpr=Math.min(2,window.devicePixelRatio||1);
    this.cv.width=Math.ceil(cssW*this.dpr);this.cv.height=Math.ceil(cssH*this.dpr);
    this.cssW=cssW;this.cssH=cssH;
  }
  frame(state){
    const c=this.cv.getContext("2d");
    c.setTransform(this.dpr,0,0,this.dpr,0,0);
    c.clearRect(0,0,this.cssW,this.cssH);
    const {mask,placements,swayT,retractVis,scheduler,pointer,drones,vines,sprites,tGrow,dur}=state;
    // L0 — base letters
    if(this.show.base){
      c.drawImage(mask.baseCanvas,0,0,mask.W,mask.H);
    }
    if(this.debug.mask){
      c.globalAlpha=0.25;c.drawImage(mask.maskCanvas,0,0,mask.W,mask.H);c.globalAlpha=1;
    }
    // L2 — vines (constrained growth — no clip needed, see STEP 6)
    if(this.show.vine&&vines)vines.draw(c,scheduler.beamRadius(tGrow,dur)>=0&&!state.retracting);
    // L3 — flowers (or any registered sprite set). Two display modes:
    //   overflow (default): sprites stamped directly, may spill past letter edges
    //   clipped:            stamped offscreen, then destination-in vs the
    //                       stencil — objects exist ONLY inside the letters
    if(this.show.flower){
      const now=state.now||0;
      this.clickFx=this.clickFx.filter(f=>now-f.t0<600);
      const drawFls=(c)=>{
        for(const p of placements){
          let b=scheduler.bloom(p,tGrow,dur,pointer.active?pointer:{x:-9999,y:-9999,active:false},
            this.show.drone?drones.drones:[], state.phase==="HOLD");
          let vis=1;
          if(state.retracting)vis=scheduler.retractVis(p,state.retractT);
          // v2 hover/click feedback: pointer proximity + click shockwaves pop sprites
          let h=0,pop=0;
          if(pointer.active)h=clamp(1-dist(p.x,p.y,pointer.x,pointer.y)/130,0,1);
          for(const f of this.clickFx){
            const a=1-clamp((now-f.t0)/600,0,1);
            pop=Math.max(pop,a*clamp(1-dist(p.x,p.y,f.x,f.y)/150,0,1));
          }
          // v2.1 hover recolor: pick a random OTHER palette family when hover starts;
          // it stays for the whole hover (hysteresis at 0.55/0.25) so nothing flickers
          let fam=p.family;
          if(this.cfg.hoverRecolor){
            if(h>0.55){
              if(!p.hoverOn){p.hoverFam=(Math.random()*PALETTE.length)|0;p.hoverOn=true;}
            }else if(h<0.25){p.hoverOn=false;p.hoverFam=null;}
            if(p.hoverOn&&p.hoverFam!=null)fam=p.hoverFam;
          }
          const spr=(pop>0.35?sprites.SPRITES_HOT:sprites.SPRITES)[p.variant][fam];
          const scale=b*vis*(p.size/32)*(1+0.22*h+0.5*pop);
          if(scale<=0.02)continue;
          const rot=swayAngle(swayT,p.phase,this.cfg.sway)+p.spin*(1-b);
          c.save();
          c.translate(p.x,p.y);c.rotate(rot);
          c.scale(scale,scale);
          c.drawImage(spr,-32,-32);
          c.restore();
        }
      };
      if(this.cfg.clipFlowers){
        if(!this.raw||this.raw.width!==this.cv.width||this.raw.height!==this.cv.height){
          this.raw=document.createElement("canvas");
          this.raw.width=this.cv.width;this.raw.height=this.cv.height;
        }
        const rc=this.raw.getContext("2d");
        rc.setTransform(this.dpr,0,0,this.dpr,0,0);
        rc.clearRect(0,0,this.cssW,this.cssH);
        drawFls(rc);
        c.save();
        c.setTransform(1,0,0,1,0,0);
        c.drawImage(this.raw,0,0);
        c.globalCompositeOperation="destination-in";
        c.drawImage(this.mask.maskCanvas,0,0);
        c.restore(); // restore also resets globalCompositeOperation
      }else{
        drawFls(c);
      }
    }
    if(this.debug.placements){
      c.fillStyle="#e879f9";
      for(const p of placements){c.beginPath();c.arc(p.x,p.y,1.6,0,Math.PI*2);c.fill();}
    }
    // L1 + L4 — drone paint glows, then drones
    if(this.show.glow||this.show.drone){
      if(this.show.glow){ // glow pre-pass (under everything else drawn here)
        c.save();
        for(const d of drones.drones){
          if(d.follower&&!pointer.active)continue;
          const R=this.cfg.droneGlowRadius*((d.excited||d.follower&&pointer.active)?1.35:1);
          const g=c.createRadialGradient(d.x,d.y,4,d.x,d.y,R);
          g.addColorStop(0,"rgba(232,121,249,0.20)");g.addColorStop(1,"rgba(232,121,249,0)");
          c.fillStyle=g;c.beginPath();c.arc(d.x,d.y,R,0,Math.PI*2);c.fill();
        }
        c.restore();
      }
      if(this.show.drone)drones.draw(c,swayT,false); // glow already drawn above
    }
    // L5 — custom cursor (Tines portals a DOM node; canvas-drawn is fine for a demo)
    if(this.show.cursor&&pointer.active&&!pointer.overUI){
      const {x,y}=pointer, pr=pointer.down?0.7:1;
      c.save();c.translate(x,y);c.scale(pr,pr);
      c.fillStyle="rgba(42,26,94,0.18)";c.beginPath();c.arc(2,3,11,0,Math.PI*2);c.fill();
      c.fillStyle="#e879f9";c.strokeStyle="#2a1a5e";c.lineWidth=2;
      c.beginPath();c.moveTo(0,-11);c.lineTo(9,9);c.lineTo(0,5);c.lineTo(-9,9);c.closePath();
      c.fill();c.stroke();c.restore();
    }
  }
}

/* ============================================================================
 * STEP 9 — CONTROLLER: cycle clock, pointer, lifecycle guards
 * ----------------------------------------------------------------------------
 * Everything time-based flows from one cycle clock. Guards, in order of
 * importance: prefers-reduced-motion → draw one static full-bloom frame;
 * IntersectionObserver → pause offscreen; DPR clamp; debounced rebuild.
 * ==========================================================================*/
function createField(stageEl, canvasEl, userOpts){
  const cfg={...DEFAULTS,...userOpts};
  const mask=new MaskField();
  const renderer=new Renderer(canvasEl,mask,cfg);
  const pointer={x:0,y:0,active:false,down:false,overUI:false};
  let placements=[],vines=null,drones=null,scheduler=null,sprites=null;
  let cycleT=0,last=0,paused=false,inView=true,rafId=0,swayT=0;
  const rng=mulberry32(cfg.seed);
  let statFn=()=>{};
  const phases=[{name:"GROW",dur:cfg.beamDur},{name:"HOLD",dur:cfg.holdDur},{name:"RETRACT",dur:1.8},{name:"REST",dur:0.6}];

  function rebuild(){
    sprites=buildSprites(cfg.spriteSet);
    mask.build(cfg.phrase,stageEl.clientWidth,Math.min(2,devicePixelRatio||1),cfg);
    renderer.resize(mask.W,mask.H);
    stageEl.style.height=mask.H+"px";
    canvasEl.style.height=mask.H+"px";
    const rng2=mulberry32(cfg.seed+1);
    placements=computePlacements(mask,rng2,cfg.flowerDensity,cfg);
    scheduler=makeScheduler(mask,cfg);
    vines=new VineSystem(mask,placements,mulberry32(cfg.seed+2),cfg.vineCount);
    drones=new DroneSystem(mask,mulberry32(cfg.seed+3),cfg.droneCount,pointer,cfg);
    cycleT=0;
  }
  function phaseAt(t){
    let acc=0;
    for(const ph of phases){if(t<acc+ph.dur)return{...ph,t:t-acc,start:acc};acc+=ph.dur;}
    return null; // cycle wrapped
  }
  function frame(now){
    rafId=0;
    const dt=Math.min(0.05,(now-last)/1000||0.016);last=now;
    if(!paused&&inView){
      cycleT+=dt;swayT+=dt;
      const total=phases.reduce((a,p)=>a+p.dur,0);
      if(cycleT>=total)cycleT-=total;
      const ph=phaseAt(cycleT);
      const growDur=cfg.beamDur;
      const retracting=ph.name==="RETRACT"||ph.name==="REST";
      const retractT=ph.name==="RETRACT"?ph.t/ph.dur:1;
      const tGrow=ph.name==="GROW"?ph.t:ph.name==="HOLD"?1e9:ph.name==="RETRACT"?growDur:0;
      if(vines)vines.tick(dt,scheduler.beamRadius(ph.name==="GROW"?ph.t:ph.name==="HOLD"?growDur:0,growDur),!retracting);
      drones.tick(dt,swayT);
      renderer.frame({mask,placements,swayT,scheduler,pointer,drones,vines,sprites,
        tGrow,dur:growDur,retracting,retractT,phase:ph.name,now:performance.now()});
      statFn(ph.name+" "+cycleT.toFixed(1)+"s");
    }
    rafId=requestAnimationFrame(frame);
  }
  function staticFrame(){ // prefers-reduced-motion: one full-bloom frame
    renderer.frame({mask,placements,swayT:0,scheduler,pointer:{x:-9999,y:-9999,active:false},
      drones,vines,sprites,tGrow:1e9,dur:1,retracting:false,retractT:0,phase:"HOLD",now:performance.now()});
  }

  // --- pointer → second beam ---
  stageEl.addEventListener("pointermove",e=>{
    const r=stageEl.getBoundingClientRect();
    pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;pointer.active=true;
  });
  stageEl.addEventListener("pointerleave",()=>pointer.active=false);
  stageEl.addEventListener("pointerdown",e=>{ // press → squash nearest drone + flower shockwave
    pointer.down=true;
    const r=stageEl.getBoundingClientRect();
    const px=e.clientX-r.left,py=e.clientY-r.top;
    for(const d of drones.drones)if(dist(d.x,d.y,px,py)<70)d.press=1;
    renderer.clickFx.push({x:px,y:py,t0:performance.now()});
  });
  addEventListener("pointerup",()=>pointer.down=false);

  // --- lifecycle ---
  const ro=new ResizeObserver(()=>{clearTimeout(ro._t);ro._t=setTimeout(rebuild,150);});
  ro.observe(stageEl);
  const io=new IntersectionObserver(en=>{inView=en[0].isIntersecting;});
  io.observe(stageEl);
  const reduced=matchMedia("(prefers-reduced-motion: reduce)");

  rebuild();
  if(reduced.matches){staticFrame();}
  else{last=performance.now();rafId=requestAnimationFrame(frame);}

  // --- public API (forge integration surface) ---
  return {
    setPhrase(t){cfg.phrase=t;rebuild();if(reduced.matches)staticFrame();},
    set(opt){Object.assign(cfg,opt);rebuild();},
    restart(){cycleT=0;},
    pause(v){paused=v;},
    onStat(fn){statFn=fn;},
    destroy(){cancelAnimationFrame(rafId);ro.disconnect();io.disconnect();},
    debug(v){renderer.debug={...renderer.debug,...v};},
    layers(v){renderer.show={...renderer.show,...v};},
  };
}

/* ---- public API (ESM) ------------------------------------------------------ */
export { createField, buildSprites, PALETTE };
export const defaultConfig = { ...DEFAULTS };

/* Convenience factory for framework wrappers:
   const field = WildCodeField.create(hostEl, canvasEl, { phrase, ... }) */
export const WildCodeField = { create: createField };
