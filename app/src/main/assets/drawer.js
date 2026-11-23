'use strict';

const drawerScroll=el('drawerScroll'), rail=el('letterRail');
const nameOrder=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
let drawerSections=[], railPointer=null, scrollFrame=0;
function foldName(text) {
  return text.normalize('NFD').replace(/\p{M}/gu,'').toLocaleUpperCase();
}
function initialOf(label) {
  const letter=Array.from(foldName(label.trim()))[0];
  return letter && /\p{L}/u.test(letter)?letter:'#';
}
function recentApps() {
  const seen=new Set(), recent=[];
  const time=a=>Math.max(a.lastLaunch||0,a.packageUsed||0);
  for (const a of apps.filter(a=>time(a)>0).sort((a,b)=>time(b)-time(a) || b.lastLaunch-a.lastLaunch || nameOrder.compare(a.label,b.label))) {
    const key=a.id.split(':',1)[0]+':'+(a.pkg||a.id);
    if (seen.has(key)) continue;
    seen.add(key); recent.push(a);
    if (recent.length>=state.recentLimit) break;
  }
  return recent;
}
function drawerTile(app) {
  const b=document.createElement('button');
  b.type='button'; b.className='drawer-tile'; b.dataset.app=app.id;
  b.setAttribute('aria-label','Open '+app.label+(app.profile?' (work profile)':''));
  const icon=document.createElement('img'); icon.src=iconURL(app.id); icon.alt=''; icon.loading='lazy';
  const label=document.createElement('span'); label.textContent=app.label;
  b.append(icon,label); return b;
}
function openDrawer() {
  el('drawerSearch').value=''; renderDrawer(); drawerScroll.scrollTop=0; updateRail();
}
function renderDrawer() {
  const scroll=drawerScroll.scrollTop, query=foldName(el('drawerSearch').value.trim());
  const matches=apps.filter(a=>foldName(a.label).includes(query)).sort((a,b)=>nameOrder.compare(a.label,b.label));
  const groups=new Map();
  for (const app of matches) {
    const initial=initialOf(app.label);
    if (!groups.has(initial)) groups.set(initial,[]);
    groups.get(initial).push(app);
  }
  const sections=[], nav=document.createDocumentFragment(), content=document.createDocumentFragment();
  function index(key,label,section) {
    const b=document.createElement('button');
    b.type='button'; b.textContent=key; b.setAttribute('aria-label',label);
    b.onclick=()=>jumpTo(section);
    nav.append(b); sections.push({key,section,button:b});
  }
  const strip=el('recentStrip'), recent=el('drawerRecent');
  const recents=state.recentEnabled && !query?recentApps():[];
  recent.hidden=!recents.length;
  strip.replaceChildren(...recents.map(drawerTile));
  if (recents.length) index('↑','Jump to recently used apps',recent);
  for (const key of [...groups.keys()].sort((a,b)=>a==='#'?-1:b==='#'?1:nameOrder.compare(a,b))) {
    const section=document.createElement('section'); section.className='letter-section';
    const title=document.createElement('h2'); title.textContent=key;
    const grid=document.createElement('div'); grid.className='app-grid';
    grid.append(...groups.get(key).map(drawerTile)); section.append(title,grid); content.append(section);
    index(key,'Jump to '+key,section);
  }
  if (!matches.length) {
    const p=document.createElement('p'); p.className='drawer-empty';
    p.textContent=query?'No matching apps.':'No launchable apps available.'; content.append(p);
  }
  el('drawerGroups').replaceChildren(content); rail.replaceChildren(nav); rail.hidden=!sections.length; rail.style.maxHeight=sections.length*34+"px";
  drawerSections=sections;
  el('drawerCount').textContent=matches.length+(matches.length===1?' app':' apps');
  sizeDrawer(); drawerScroll.scrollTop=scroll; updateRail();
}
function sizeDrawer() {
  if (currentPage!=='drawer') return;
  const last=drawerSections[drawerSections.length-1];
  const space=el('drawerSpace');
  space.style.height='0';
  if (last && drawerScroll.scrollHeight>drawerScroll.clientHeight)
    space.style.height=Math.max(0,drawerScroll.clientHeight-last.section.offsetHeight-12)+'px';
}
function sectionTop(section) { return section.getBoundingClientRect().top-drawerScroll.getBoundingClientRect().top+drawerScroll.scrollTop; }
function jumpTo(section) { drawerScroll.scrollTop=sectionTop(section); updateRail(); }
function updateRail() {
  scrollFrame=0;
  if (currentPage!=='drawer' || !drawerSections.length) return;
  let active=drawerSections[0];
  for (const entry of drawerSections) {
    if (sectionTop(entry.section)>drawerScroll.scrollTop+2) break;
    active=entry;
  }
  for (const {button} of drawerSections) button.toggleAttribute('data-active',button===active.button);
}
function scrub(y) {
  if (!drawerSections.length) return;
  const box=rail.getBoundingClientRect();
  const i=Math.max(0,Math.min(drawerSections.length-1,Math.floor((y-box.top)/box.height*drawerSections.length)));
  const entry=drawerSections[i]; jumpTo(entry.section);
  const bubble=el('letterBubble'); bubble.textContent=entry.key; bubble.hidden=false;
  bubble.style.top=Math.max(4,Math.min(box.height-46,y-box.top-21))+box.top-el('drawer').querySelector('.drawer-body').getBoundingClientRect().top+'px';
}
// The rail scrolls programmatically. Cancel the browser's touch gesture so
// it does not consume the next app tap as a request to stop a fling.
rail.addEventListener('touchstart',e=>e.preventDefault(),{passive:false});
rail.addEventListener('pointerdown',e=>{
  if (!e.isPrimary || e.button!==0) return;
  e.preventDefault(); railPointer=e.pointerId; rail.setPointerCapture(e.pointerId); scrub(e.clientY);
});
rail.addEventListener('pointermove',e=>{if (railPointer===e.pointerId) scrub(e.clientY);});
rail.addEventListener('lostpointercapture',()=>{railPointer=null; el('letterBubble').hidden=true;});
drawerScroll.addEventListener('scroll',()=>{if (!scrollFrame) scrollFrame=requestAnimationFrame(updateRail);},{passive:true});
drawerScroll.addEventListener('click',e=>{
  const b=e.target.closest('[data-app]');
  if (b && installedById.has(b.dataset.app)) {sound('confirm'); Phone.launch(b.dataset.app);}
});
el('drawerSearch').oninput=()=>{renderDrawer(); drawerScroll.scrollTop=0; updateRail();};
window.addEventListener('resize',sizeDrawer);

const drawerSwitches=['drawerEnabled','showDrawerButton','swipeUpDrawer','recentEnabled'];
function syncDrawerSettings() {
  for (const key of drawerSwitches) {
    const b=el(key); b.setAttribute('aria-checked',String(state[key]));
    b.querySelector('.flag').textContent=state[key]?'ON':'OFF';
    b.disabled=key!=='drawerEnabled' && !state.drawerEnabled;
  }
  const recents=state.drawerEnabled && state.recentEnabled;
  const select=el('recentLimit'), limit=Math.max(5,apps.length,state.recentLimit);
  if (select.options.length!==limit) {
    select.replaceChildren();
    for (let n=1;n<=limit;n++) select.add(new Option(String(n),String(n)));
  }
  select.value=String(state.recentLimit); select.disabled=!recents;
  el('usageAccess').disabled=!recents;
  el('recentSource').textContent=Phone.hasUsageAccess()?'Android usage access is on.':'Recents use launches from Reload Home. Enable Android usage access to include apps opened elsewhere.';
}
for (const key of drawerSwitches) {
  el(key).onclick=()=>{
    state[key]=!state[key]; persist(); sound('confirm'); renderHome(); syncDrawerSettings();
    if (key==='drawerEnabled' || key==='recentEnabled') Phone.refreshApps();
  };
}
el('recentLimit').onchange=e=>{state.recentLimit=Number(e.target.value); persist(); sound('confirm');};
el('usageAccess').onclick=()=>{sound('confirm'); Phone.openUsageAccess();};
