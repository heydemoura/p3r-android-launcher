'use strict';

// Page motion keeps the installed-app list interactive and paints at most one
// neighboring page. Only the lettering travels; the water keeps its own phase.
let previewPage=-1, pageOffset=0, pageAnimations=[];
function pageTransform(x) { return 'translate3d('+x+'px,0,0)'; }
function clearPageMotion() {
  for (const animation of pageAnimations) { animation.onfinish=null; animation.cancel(); }
  pageAnimations=[];
  el('liveTrack').style.transform='';
  const preview=el('previewTrack');
  preview.hidden=true; preview.inert=true; preview.classList.remove('departing-page'); preview.style.transform=''; preview.firstElementChild.replaceChildren();
  previewPage=-1; pageOffset=0;
}
function showPreview(number) {
  const preview=el('previewTrack');
  if (previewPage!==number) {
    paintEntries(preview.firstElementChild,entriesForPage(number),0);
    previewPage=number;
  }
  preview.hidden=false;
}
function followPage(dx) {
  const width=el('home').clientWidth;
  const step=dx<0?1:-1, next=homePage+step;
  if (next<0 || next>=pageCount() || !dx) {
    el('previewTrack').hidden=true;
    pageOffset=Math.sign(dx)*Math.min(32,Math.abs(dx)*.12);
  } else {
    showPreview(next);
    pageOffset=Math.max(-width,Math.min(width,dx));
    el('previewTrack').style.transform=pageTransform(pageOffset+step*width);
  }
  el('liveTrack').style.transform=pageTransform(pageOffset);
}
function slideLayer(layer,from,to,duration) {
  layer.style.transform=pageTransform(to);
  const motion=layer.animate([{transform:pageTransform(from)},{transform:pageTransform(to)}],
    {duration,easing:'cubic-bezier(.18,.74,.22,1)'});
  pageAnimations.push(motion);
  return motion;
}
function settlePage() {
  if (!pageOffset) {clearPageMotion(); return;}
  const width=el('home').clientWidth, preview=el('previewTrack');
  if (!preview.hidden) {
    const edge=(previewPage-homePage)*width;
    slideLayer(preview,pageOffset+edge,edge,175);
  }
  slideLayer(el('liveTrack'),pageOffset,0,175).onfinish=clearPageMotion;
}
function preparePageTurn() {
  if (pageAnimations.length) clearPageMotion();
  if (state.reduced) return;
  const preview=el('previewTrack');
  // Reuse the outgoing nodes, including their unique SVG clip IDs.
  preview.firstElementChild.replaceChildren(...el('stack').children);
  for (const row of preview.firstElementChild.children) row.tabIndex=-1;
  preview.classList.add('departing-page'); preview.inert=false;
  preview.hidden=false;
}
function finishPageTurn(step) {
  if (state.reduced) return;
  const width=el('home').clientWidth, edge=step*width;
  const duration=120+190*Math.min(1,Math.abs(edge+pageOffset)/width);
  slideLayer(el('previewTrack'),pageOffset,-edge,duration);
  slideLayer(el('liveTrack'),pageOffset+edge,0,duration).onfinish=clearPageMotion;
}

// Smoothed perimeter of the blue ink shape sampled at 98.195 s in menus.mp4.
// Both ink passes expand from the same point. Back uses the two separate openings
// visible at 115.70 s. Radii are in screen pixels to keep them round in portrait.
const inkOutline='M .25 -.89 Q -.18 -.99 -.53 -.81 Q -.83 -.71 -.94 -.42 Q -.97 -.26 -.95 -.05 Q -1.13 .33 -.72 .63 Q -.38 .98 -.13 .94 Q .12 .88 .48 .65 Q 1.03 .36 .97 .03 Q .99 -.21 .73 -.42 Q .56 -.56 .41 -.79 Q .34 -.87 .25 -.89 Z';
let sceneCleanup=null;
function stopScene() { if (sceneCleanup) sceneCleanup(); }
function isPanelPage(page) { return page!=='home' && page!=='system' && page!=='drawer'; }
function revealMenu(from,to,back) {
  const nested=isPanelPage(from) && isPanelPage(to);
  const screen=page=>el(!nested && isPanelPage(page)?'panel':page);
  const old=screen(from), next=screen(to);
  const child=!nested && isPanelPage(from)?el(from):null;
  const ink=el('inkShape'), scene=el('sceneShape'), top=el('returnTop'), bottom=el('returnBottom');
  const w=next.clientWidth,h=next.clientHeight;
  if (!w || !h) return;
  let raf=0;
  const accents=[];
  const clipSize=Math.hypot(w,h);
  function shape(node,size) {
    node.setAttribute('transform','translate(.325 .41) scale('+size*clipSize/w+' '+size*clipSize/h+')');
  }
  function circle(node,x,y,r) {
    node.setAttribute('cx',x); node.setAttribute('cy',y);
    node.setAttribute('rx',r*clipSize/w); node.setAttribute('ry',r*clipSize/h);
  }
  scene.setAttribute('d',back?'':inkOutline); ink.setAttribute('d',inkOutline);
  circle(top,.73,.09,0); circle(bottom,.23,.93,0);
  old.classList.add('motion-old'); old.inert=true; old.setAttribute('aria-hidden','true');
  if (child) child.classList.add('motion-child');
  if (nested) old.style.top=next.offsetTop+'px';
  if (!back) old.classList.add('ink');
  next.classList.add('motion-new');
  if (to==='system' && !back) {
    const text=next.querySelector('.porthole text');
    accents.push(text.animate([{transform:'translate(16%,8%) rotate(10deg)'},{transform:'none'}],
      {duration:490,easing:'cubic-bezier(.22,.7,.18,1)'}));
    accents.push(next.querySelector('.system-commands').animate(
      [{opacity:0,transform:'translateY(13px)'},{opacity:1,transform:'none'}],
      {duration:210,delay:235,fill:'backwards',easing:'ease-out'}));
  }
  function cleanup() {
    cancelAnimationFrame(raf);
    for (const a of accents) a.cancel();
    old.classList.remove('motion-old','ink'); old.inert=false; old.removeAttribute('aria-hidden');
    if (nested) old.style.top='';
    if (child) child.classList.remove('motion-child');
    next.classList.remove('motion-new');
    sceneCleanup=null;
  }
  sceneCleanup=cleanup;
  const started=performance.now();
  function frame(now) {
    const ms=now-started;
    if (back) {
      const t=Math.min(1,ms/235);
      const r=t*(.34+.67*t);
      circle(top,.73,.09,r); circle(bottom,.23,.93,r*.77);
    } else {
      const t=Math.min(1,Math.max(0,(ms-72)/310));
      shape(ink,Math.min(1.55,ms/145));
      shape(scene,t*(.28+1.19*t));
    }
    if (ms>=(back?240:to==='system'?490:385)) cleanup();
    else raf=requestAnimationFrame(frame);
  }
  frame(started);
}

// Draw the recorded frames explicitly. An animated image can resume on its
// last frame from WebView's cache, especially when returning from another app.
let splashCleanup=null;
function stopSplash() { if (splashCleanup) splashCleanup(); }
function playSplash() {
  stopSplash();
  if (state.reduced || !foreground || currentPage!=='home') return;
  const layer=el('splash'), home=el('home'), atlas=new Image(), canvas=document.createElement('canvas');
  const base=mediaBase(), columns=base==='art/home'?8:4;
  const context=canvas.getContext('2d',{alpha:false});
  if (!context) return;
  const motions=[];
  let raf=0, elapsed=0, lastTime=0, lastFrame=-1, revealed=false;
  const timeout=setTimeout(stopSplash,4000);
  function cleanup() {
    clearTimeout(timeout); cancelAnimationFrame(raf);
    atlas.onload=null; atlas.onerror=null;
    canvas.remove(); layer.hidden=true; layer.style.opacity='';
    home.classList.remove('splash-start');
    for (const motion of motions) motion.cancel();
    splashCleanup=null; updateMotion();
  }
  function paint(time) {
    // Decoding and the Android window entrance can delay an initial repaint.
    // Advance from the last presented frame so the splash remains visible.
    if (lastTime) elapsed+=Math.min(66,time-lastTime);
    lastTime=time;
    const index=Math.min(31,Math.floor(elapsed*30/1000));
    if (lastFrame!==index) {
      const w=canvas.width,h=canvas.height;
      context.drawImage(atlas,(index%columns)*w,Math.floor(index/columns)*h,w,h,0,0,w,h);
      lastFrame=index;
    }
    if (elapsed>=490 && !revealed) {
      revealed=true; home.classList.remove('splash-start');
      for (const node of [el('liveTrack'),home.querySelector('.date-card'),home.querySelector('.guide'),el('drawerButton'),el('pager')]) {
        motions.push(node.animate([{opacity:0},{opacity:1}],{duration:220,easing:'ease-out'}));
      }
    }
    layer.style.opacity=String(Math.min(1,Math.max(0,(1080-elapsed)/330)));
    if (elapsed>=1080) cleanup();
    else raf=requestAnimationFrame(paint);
  }
  splashCleanup=cleanup; updateMotion();
  home.classList.add('splash-start'); layer.hidden=false; layer.dataset.base=base;
  atlas.onload=()=>{
    canvas.width=atlas.naturalWidth/columns;
    canvas.height=atlas.naturalHeight/(32/columns);
    layer.replaceChildren(canvas);
    raf=requestAnimationFrame(paint);
  };
  atlas.onerror=cleanup;
  atlas.src=base+'-splash-frames.webp';
}
