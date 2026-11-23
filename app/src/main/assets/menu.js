'use strict';

const el = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const palette = [['Reload pink','#ff087c'],['Vermilion','#ff493c'],['Amber','#ffbe36'],['Ice','#40e7ff'],['Mint','#4cf2a2'],['Violet','#a98aff']];
const defaults = {accent:palette[0][1], animation:true, reduced:matchMedia('(prefers-reduced-motion: reduce)').matches, icons:false, sounds:true, ambience:true, drawerEnabled:true, showDrawerButton:true, swipeUpDrawer:false, recentEnabled:true, recentLimit:5, pages:null};
let saved = {};
try { saved = JSON.parse(Phone.preferences()); } catch (_) {}
const state = Object.assign({}, defaults, saved);
const systemItem = {id:'system', label:'System'};
let apps = [], menu = [systemItem], selected = 0, currentPage = 'home', foreground = false;
let installedById = new Map(), homePage = 0, editPage = 0, catalogReady = false;
let sequence = 0, gesture = null;
const painter = document.createElement('canvas').getContext('2d');

function persist() { Phone.save(JSON.stringify(state)); }
function sound(name) { if (state.sounds) Phone.sound(name); }
function colorVars() {
  const accent = /^#[0-9a-f]{6}$/i.test(state.accent) ? state.accent : defaults.accent;
  const rgb = [1,3,5].map(i => parseInt(accent.slice(i,i+2),16));
  const darker = rgb.map(v => Math.round(v*.65));
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--ink', accent.toLowerCase() === defaults.accent ? '#ec1024' : 'rgb('+darker.join(',')+')');
}
function iconURL(id) { return 'https://icons.reload.invalid/' + encodeURIComponent(id); }
function starterPins(list) {
  const selectedApps = [];
  const patterns = [/^(phone|dialer|telephone)$/i,/^(messages|messaging|sms)$/i,/^(chrome|browser|firefox|internet)$/i,/^camera$/i,/^(gallery|photos)$/i,/^(music|spotify|clock)$/i];
  for (const pattern of patterns) {
    const app = list.find(a => !a.profile && pattern.test(a.label));
    if (app) selectedApps.push(app.id);
  }
  for (const a of list) {
    if (selectedApps.length >= 6) break;
    if (!selectedApps.includes(a.id) && !a.profile) selectedApps.push(a.id);
  }
  return selectedApps;
}
function initializePages() {
  if (Array.isArray(state.pages) && state.pages.length) return;
  const legacyPins=Array.isArray(state.pins) ? state.pins : starterPins(apps);
  const pages=[[]];
  let visible=0;
  for (const id of legacyPins) {
    // Version 1.2 paged the available apps six at a time. Retain unavailable
    // shortcuts alongside their neighbors so a returning profile keeps its pins.
    const available=!apps.length || installedById.has(id);
    const page=Math.floor((available ? visible : Math.max(0,visible-1))/6);
    if (!pages[page]) pages[page]=[];
    pages[page].push(id);
    if (available) visible++;
  }
  state.pages=pages;
  delete state.pins;
  persist();
}
function receiveApps(raw) {
  apps=JSON.parse(raw);
  installedById=new Map(apps.map(app=>[app.id,app]));
  if (apps.length) initializePages();
  rebuildMenu();
  if (currentPage==='apps') appRows();
  if (currentPage==='pages') pageRows();
  if (currentPage==='drawer') renderDrawer();
  if (currentPage==='drawerSettings') syncDrawerSettings();
}
function pageCount() { return state.pages?.length || 1; }
function loadHomePage(number) {
  homePage=Math.max(0,Math.min(pageCount()-1,number));
  menu=entriesForPage(homePage);
}
function entriesForPage(number) {
  const pins=state.pages?.[number] || [];
  return pins.map(id=>installedById.get(id)).filter(Boolean).concat(systemItem);
}
function rebuildMenu() {
  const oldId=menu[selected].id;
  loadHomePage(catalogReady ? homePage : (Number.isInteger(state.homePage) ? state.homePage : 0));
  const index=menu.findIndex(app=>app.id===oldId);
  selected=catalogReady ? (index>=0 ? index : Math.min(selected,menu.length-1)) : 0;
  if (apps.length) catalogReady=true;
  renderHome();
}
function turnHomePage(step) {
  const next=homePage+step;
  if (next<0 || next>=pageCount()) { settlePage(); return; }
  const refocus=el('stack').contains(document.activeElement);
  preparePageTurn();
  loadHomePage(next);
  selected=0;
  state.homePage=homePage; persist();
  sound('focus'); renderHome(); finishPageTurn(step);
  if (refocus) el('stack').firstElementChild.focus({preventScroll:true});
}
function nodeSVG(tag, attrs) {
  const n = document.createElementNS(svgNS, tag);
  for (const [k,v] of Object.entries(attrs || {})) n.setAttribute(k,String(v));
  return n;
}
function wordmark(label, chosen, shade = '#67e5ff', interactive = false) {
  const svg = nodeSVG('svg',{viewBox:'0 0 320 76','aria-hidden':'true',focusable:'false'});
  const cap = label.toLocaleUpperCase();
  const size = chosen ? 46 : 43;
  painter.font = size+'px Menu, sans-serif';
  const max = chosen ? 247 : 252;
  const natural = Math.max(12,painter.measureText(cap).width - Math.max(0,cap.length-1)*2.6);
  const width = Math.min(max, natural);
  // Scale very long names as a unit. Keep character widths readable by using two lines for the longest labels.
  const split = natural > max * 1.8 ? splitLabel(cap) : null;
  if (interactive) {
    // Match the hit area to the lettering and blade, leaving the surrounding water tappable.
    const halfWidth=Math.max(width/2 + (chosen?31:12),36);
    svg.append(nodeSVG('rect',{x:160-halfWidth,y:chosen?2:10,width:halfWidth*2,height:chosen?65:54,fill:'transparent',class:'entry-hit'}));
  }
  function letters(fill) {
    const group = nodeSVG('g',{fill,'font-family':'Menu, sans-serif','font-size':size,'text-anchor':'middle','letter-spacing':-2.6});
    const lines = split || [cap];
    for (let i=0;i<lines.length;i++) {
      const limit = split ? Math.min(max,painter.measureText(lines[i]).width*.68) : width;
      const text = nodeSVG('text',{x:160,y:split ? 33+i*25 : 54,textLength:Math.max(10,limit),lengthAdjust:'spacingAndGlyphs'});
      if (split) text.setAttribute('font-size','31');
      text.textContent=lines[i]; group.append(text);
    }
    return group;
  }
  if (!chosen) { svg.append(letters(shade)); return svg; }
  const l=160-width/2, r=160+width/2;
  const blade=(pad) => [ [l-25-pad,54+pad*.3],[l+18,30-pad*.4],[r+22+pad,7-pad*.5],[r+14+pad*.4,62+pad*.6],[l+27,50+pad*.65] ].map(p=>p.join(',')).join(' ');
  const clipId='blade'+(++sequence);
  const clip=nodeSVG('clipPath',{id:clipId});
  clip.append(nodeSVG('polygon',{points:blade(0)}));
  svg.append(clip,nodeSVG('polygon',{points:blade(5),fill:'var(--accent)'}),letters('#060513'),nodeSVG('polygon',{points:blade(0),fill:'#fff'}));
  const top=letters('var(--ink)'); top.setAttribute('clip-path','url(#'+clipId+')'); svg.append(top);
  return svg;
}
function splitLabel(text) {
  const middle = text.length/2;
  const spaces = Array.from(text.matchAll(/\s+/g), m=>m.index);
  const at = spaces.length ? spaces.reduce((a,b)=>Math.abs(a-middle)<Math.abs(b-middle)?a:b) : Math.ceil(middle);
  return [text.slice(0,at).trim(),text.slice(at).trim()];
}
function paintEntries(stack, entries, index, direction=0) {
  const size=Math.min(7,entries.length);
  const start=Math.max(0,Math.min(index-Math.floor(size/2),entries.length-size));
  const refocus=stack.contains(document.activeElement);
  stack.replaceChildren();
  for (let i=0;i<size;i++) {
    const item=entries[start+i], active=index===start+i;
    const row=document.createElement('button');
    row.type='button'; row.dataset.entry=item.id; row.setAttribute('aria-label','Open '+item.label);
    if (active) row.setAttribute('aria-current','true');
    row.className='word'+(active?' chosen':'');
    const pos=size<=1 ? .5 : i/(size-1);
    row.style.setProperty('--tilt',(-13+18*pos)+'deg');
    row.style.setProperty('--shift',(4-7*Math.sin(pos*Math.PI)-2*pos)+'%');
    const shades=['#a6fbff','#80f0ff','#5fdbff','#46d1ff','#53c7ff','#64b6ff','#86afff'];
    row.append(wordmark(item.label,active,shades[i],true));
    if (state.icons && installedById.has(item.id)) {
      const img=document.createElement('img'); img.className='app-icon'; img.alt=''; img.src=iconURL(item.id); row.append(img);
    }
    stack.append(row);
    if (active && direction && !state.reduced) {
      row.firstChild.animate([{transform:'translateY('+Math.sign(direction)*5+'px) scale(.95)'},{transform:'none'}],{duration:115,easing:'ease-out'});
    }
  }
  if (refocus) stack.children[index-start].focus({preventScroll:true});
}
function renderHome(direction=0) {
  paintEntries(el('stack'),menu,selected,direction);
  el('drawerButton').hidden=!state.drawerEnabled || !state.showDrawerButton;
  el('swipeHint').textContent=state.drawerEnabled && state.swipeUpDrawer?'Swipe up for apps · Down to select':'Swipe to select · Tap to open';
  const total=pageCount();
  el('pager').hidden=total===1;
  el('pageNumber').textContent=(homePage+1)+' / '+total;
  el('pagePrev').disabled=homePage===0;
  el('pageNext').disabled=homePage===total-1;
  const item=menu[selected];
  const action = item===systemItem?'Open System':'Open '+item.label;
  el('action').textContent=action; el('surface').setAttribute('aria-label',action);
  el('announcement').textContent=item.label+', '+(selected+1)+' of '+menu.length+(total>1?', page '+(homePage+1)+' of '+total:'');
}
function moveHome(steps) {
  const dest=((selected+steps)%menu.length+menu.length)%menu.length;
  if (selected===dest) return;
  selected=dest; sound('focus'); renderHome(steps);
}
function activate(entryId=menu[selected].id) {
  const index=menu.findIndex(item=>item.id===entryId);
  if (index<0) return;
  if (selected!==index) { selected=index; renderHome(); }
  const item=menu[index];
  if (item===systemItem) navigate('system');
  else { sound('confirm'); Phone.launch(item.id); }
}
// Store stable keys so filtering and package refreshes preserve the menu cursor.
const cursors = {system:'custom', custom:'', pages:'', apps:'', drawerSettings:'drawerEnabled'};
function controls() {
  const page = el(currentPage);
  const items = Array.from(page.querySelectorAll('[data-key]')).filter(b=>!b.disabled && !b.closest('[hidden]'));
  if (isPanelPage(currentPage)) items.unshift(el('panel').querySelector('[data-back]'));
  return items;
}
function paintHub() {
  document.querySelectorAll('.hub-word').forEach(btn=>{
    const label={custom:'Customization',pages:'Apps',drawerSettings:'App Drawer'}[btn.dataset.page];
    btn.setAttribute('aria-label',label);
    btn.replaceChildren(wordmark(label,cursors.system===btn.dataset.key));
  });
}
function showCursor(reveal=false) {
  if (currentPage==='home') return;
  const items=controls();
  let current=items.find(b=>b.dataset.key===cursors[currentPage]);
  if (!current) {
    current=items.find(b=>b.classList.contains('app-row') || b.getAttribute('aria-pressed')==='true')
      || items.find(b=>b.tagName==='INPUT') || items[0];
    cursors[currentPage]=current.dataset.key;
  }
  for (const b of items) {
    if (b===current) b.setAttribute('aria-current','true');
    else b.removeAttribute('aria-current');
  }
  if (currentPage==='system') paintHub();
  if (reveal) current.scrollIntoView({block:'nearest'});
  return current;
}
function move(steps) {
  if (currentPage==='home') return moveHome(steps);
  const items=controls(), index=items.findIndex(b=>b.dataset.key===cursors[currentPage]);
  const dest=Math.max(0,Math.min(items.length-1,index+steps));
  if (dest===index) return;
  cursors[currentPage]=items[dest].dataset.key;
  showCursor(true).focus({preventScroll:true});
  sound('focus');
}
function activateCursor() {
  const target=showCursor();
  if (target.tagName==='INPUT') target.focus();
  else target.click();
}
function navigate(page, cue='confirm') {
  const previous=currentPage;
  stopScene(); stopSplash(); clearPageMotion();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  if (cue) sound(cue);
  resetGesture(); currentPage=page;
  for (const id of ['home','system','drawer','panel','custom','pages','apps','drawerSettings']) el(id).hidden=true;
  if (!isPanelPage(page)) {
    el(page).hidden=false;
    if (page==='drawer') openDrawer();
  }
  else {
    el('panel').hidden=false; el(page).hidden=false; el(page).scrollTop=0;
    el('panelTitle').textContent=page==='custom'?'Customization':page==='pages'?'Apps':page==='drawerSettings'?'App drawer':'Page '+(editPage+1);
    el('panelBack').textContent=page==='apps'?'‹ Pages':'‹ System';
    if (page==='pages') pageRows();
    else if (page==='apps') {
      el('filter').value='';
      setRemovalPrompt(false);
      appRows();
    } else if (page==='drawerSettings') syncDrawerSettings();
    else customRows();
  }
  if (page!=='home' && page!=='drawer') showCursor(true);
  if (page!==previous && foreground && !state.reduced) revealMenu(previous,page,cue==='back');
  updateMotion();
}
function goHome() { if (currentPage!=='home') navigate('home',null); }
function goBack() {
  if (currentPage==='apps') navigate('pages','back');
  else if (currentPage==='custom'||currentPage==='pages'||currentPage==='drawerSettings') navigate('system','back');
  else if (currentPage==='system'||currentPage==='drawer') navigate('home','back');
}
const toggles=[['animation','Background animation'],['reduced','Reduced motion'],['icons','App icons on home'],['sounds','Navigation sounds'],['ambience','Background sound']];
function customRows() {
  const swatches=el('swatches'); swatches.replaceChildren();
  for (const [name,hex] of palette) {
    const b=document.createElement('button'); b.className='swatch'; b.dataset.key=hex; b.style.setProperty('--color',hex);
    b.setAttribute('aria-label',name); b.setAttribute('aria-pressed',String(hex===state.accent));
    b.onclick=()=>applyColor(hex);
    swatches.append(b);
  }
  el('hex').value=state.accent.toUpperCase(); el('colorError').hidden=true;
  const list=el('toggles'); list.replaceChildren();
  for (const [key,label] of toggles) {
    const b=document.createElement('button'); b.className='option'; b.dataset.key=key; b.setAttribute('role','switch');
    const text=document.createElement('span'); text.textContent=label;
    const flag=document.createElement('span'); flag.className='flag'; flag.setAttribute('aria-hidden','true');
    function sync() { b.setAttribute('aria-checked',String(state[key])); flag.textContent=state[key]?'ON':'OFF'; }
    b.onclick=()=>{ state[key]=!state[key]; sync(); persist(); if (key==='ambience') Phone.backgroundSound(state.ambience); sound('confirm'); renderHome(); updateMotion(); if (state.reduced) {stopScene(); stopSplash(); clearPageMotion();} };
    b.append(text,flag); sync(); list.append(b);
  }
}
function applyColor(value) {
  const hex=value.trim().replace(/^#/,'');
  if (!/^[0-9a-f]{6}$/i.test(hex)) { el('colorError').hidden=false; return; }
  state.accent='#'+hex.toLowerCase(); colorVars(); persist(); sound('confirm'); renderHome();
  el('hex').value=state.accent.toUpperCase(); el('colorError').hidden=true;
  el('swatches').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.key===state.accent)));
}
function pageRows() {
  const list=el('pageList');
  list.replaceChildren();
  for (let i=0;i<pageCount();i++) {
    const button=document.createElement('button');
    button.className='option'; button.dataset.key='page-'+i;
    const title=document.createElement('span'); title.textContent='Page '+(i+1);
    const count=document.createElement('small');
    const n=(state.pages?.[i] || []).filter(id=>installedById.has(id)).length;
    count.textContent=n===1?'1 app':n+' apps';
    button.append(title,count);
    button.onclick=()=>openPageEditor(i);
    list.append(button);
  }
  showCursor();
}
function openPageEditor(index) {
  editPage=index;
  cursors.pages='page-'+index; cursors.apps='filter';
  navigate('apps');
}
el('addPage').onclick=()=>{
  initializePages();
  state.pages.push([]); persist(); renderHome();
  openPageEditor(pageCount()-1);
};
function setRemovalPrompt(open) {
  el('removePage').hidden=open || pageCount()===1;
  el('removePrompt').hidden=!open;
  if (open) el('removeQuestion').textContent='Remove Page '+(editPage+1)+'?';
}
el('removePage').onclick=()=>{
  setRemovalPrompt(true); cursors.apps='keep-page'; showCursor(true);
};
el('keepPage').onclick=()=>{
  setRemovalPrompt(false); cursors.apps='remove-page'; showCursor(true);
};
el('confirmRemove').onclick=()=>{
  if (pageCount()<=1) return;
  state.pages.splice(editPage,1);
  if (editPage<homePage) homePage--;
  homePage=Math.min(homePage,pageCount()-1);
  state.homePage=homePage; persist();
  cursors.pages='page-'+Math.min(editPage,pageCount()-1);
  rebuildMenu(); navigate('pages');
};
function appRows() {
  const list=el('appList'); list.replaceChildren();
  const pins=new Set(state.pages?.[editPage] || []);
  const count=()=>{el('count').textContent=apps.filter(a=>pins.has(a.id)).length+' selected';};
  count();
  const query=el('filter').value.trim().toLocaleLowerCase();
  for (const a of apps.filter(a=>a.label.toLocaleLowerCase().includes(query))) {
    const b=document.createElement('button'); b.className='app-row'; b.dataset.key=a.id; b.setAttribute('role','checkbox');
    const img=document.createElement('img'); img.src=iconURL(a.id); img.alt=''; img.loading='lazy';
    const name=document.createElement('span'); name.className='app-name'; name.textContent=a.label;
    if (a.profile) { const badge=document.createElement('small');badge.textContent='Work profile';name.append(badge); }
    const flag=document.createElement('span'); flag.className='flag'; flag.setAttribute('aria-hidden','true');
    function sync(){ b.setAttribute('aria-checked',String(pins.has(a.id)));flag.textContent=pins.has(a.id)?'✓':'–'; }
    b.onclick=()=>{
      if (pins.has(a.id)) pins.delete(a.id); else pins.add(a.id);
      initializePages(); state.pages[editPage]=Array.from(pins); persist(); sync(); count(); sound('confirm'); rebuildMenu();
    };
    b.append(img,name,flag); sync(); list.append(b);
  }
  if (!list.childElementCount) { const p=document.createElement('p'); p.textContent=query?'No matching apps.':'No launchable apps available.';list.append(p); }
  if (currentPage==='apps') showCursor();
}

const surface=el('surface');
// Android WebView delivers a synthetic click after touch release. A hold can
// uncover a System button at that exact location before the click arrives.
let discardTouchClick=false;
document.addEventListener('pointerdown',()=>{discardTouchClick=false;},true);
document.addEventListener('click',e=>{
  if (discardTouchClick && e.detail!==0) {e.preventDefault();e.stopImmediatePropagation();}
},true);
function resetGesture(){ if (gesture) clearTimeout(gesture.timer); gesture=null; }
function dragStep(g, y) {
  const pitch=Math.max(28,Math.min(52,window.innerHeight*.056));
  const delta=y-g.anchor;
  const steps=Math.trunc(delta/pitch);
  if (steps) { moveHome(steps); g.anchor+=steps*pitch; g.stepped=true; }
}
function track(g,e) {
  const dy=e.clientY-g.y, dx=e.clientX-g.x;
  if (Math.max(Math.abs(dx),Math.abs(dy))>9) { g.moved=true; clearTimeout(g.timer); }
  if (!g.axis && g.moved) {
    g.axis=Math.abs(dy)>=Math.abs(dx)?'y':'x';
    if (g.axis==='y' && dy<0 && state.drawerEnabled && state.swipeUpDrawer) g.axis='drawer';
  }
  const elapsed=e.timeStamp-g.t;
  if (g.axis==='y' && elapsed>=200 && (Math.abs(dy)/elapsed<.85 || elapsed>=420)) g.drag=true;
  if (g.drag) dragStep(g,e.clientY);
  if (g.axis==='x' && !state.reduced) followPage(dx);
}
const home=el('home');
home.addEventListener('pointerdown',e=>{
  if (!e.isPrimary || e.button!==0 || e.target.closest('.aid')) return;
  const contact=document.elementFromPoint(e.clientX,e.clientY);
  const entry=contact?.closest('[data-entry]');
  const departing=el('previewTrack').contains(entry);
  stopSplash(); clearPageMotion(); resetGesture();
  const g=gesture={id:e.pointerId,x:e.clientX,y:e.clientY,anchor:e.clientY,t:e.timeStamp};
  // WebView may adjust a finger tap to a nearby button, particularly with rotated
  // labels. Resolve the physical contact against the painted hit areas before capture.
  g.drawerButton=Boolean(contact?.closest('#drawerButton'));
  g.entryId=entry?.dataset.entry;
  g.departing=departing;
  g.pageStep=Number(contact?.closest('[data-page-step]')?.dataset.pageStep || 0);
  home.setPointerCapture(e.pointerId);
  g.timer=setTimeout(()=>{if (gesture===g&&!g.moved) {discardTouchClick=true;navigate('system');}},650);
});
home.addEventListener('pointermove',e=>{if(gesture?.id===e.pointerId) track(gesture,e);});
home.addEventListener('pointerup',e=>{
  const g=gesture; if (!g || g.id!==e.pointerId) return;
  track(g,e);resetGesture();
  const dy=e.clientY-g.y;
  discardTouchClick=true;
  if (g.moved) {
    if (g.axis==='drawer' && dy<=-32) openDrawerFromHome();
    if (g.axis==='y' && Math.abs(dy)>=18 && !g.stepped) moveHome(Math.sign(dy));
    if (g.axis==='x' && Math.abs(e.clientX-g.x)>=36) turnHomePage(e.clientX<g.x?1:-1);
    else if (g.axis==='x') settlePage();
  } else if (g.drawerButton) openDrawerFromHome();
  else if (g.pageStep) turnHomePage(g.pageStep);
  else if (g.departing && g.entryId!=='system' && installedById.has(g.entryId)) { sound('confirm'); Phone.launch(g.entryId); }
  else activate(g.entryId);
});
home.addEventListener('pointercancel',e=>{if (gesture?.id===e.pointerId) {resetGesture(); settlePage();}});
function syncSettingsCursor(e) {
  if (currentPage==='home' || currentPage==='drawer') return;
  const control=e.target.closest('[data-key]');
  if (!control || cursors[currentPage]===control.dataset.key) return;
  cursors[currentPage]=control.dataset.key;
  showCursor();
}
document.addEventListener('focusin',syncSettingsCursor);
document.addEventListener('click',syncSettingsCursor,true);
function openDrawerFromHome() {
  if (state.drawerEnabled && currentPage==='home') navigate('drawer');
}
el('drawerButton').onclick=openDrawerFromHome;
surface.addEventListener('click',()=>activate());
el('stack').addEventListener('click',e=>{
  const row=e.target.closest('[data-entry]');
  if (row) activate(row.dataset.entry);
});
el('pagePrev').onclick=()=>turnHomePage(-1);
el('pageNext').onclick=()=>turnHomePage(1);
el('next').onclick=()=>move(1);el('previous').onclick=()=>move(-1);el('openSystem').onclick=()=>navigate('system');
document.querySelectorAll('[data-back]').forEach(b=>b.onclick=goBack);
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{
  if (b.dataset.page==='pages') cursors.pages='page-'+homePage;
  navigate(b.dataset.page);
});
el('defaultHome').onclick=()=>{sound('confirm');Phone.defaultHome();};
for (const input of [el('filter'),el('hex')]) {
  input.addEventListener('focus',()=>{
    if (currentPage!=='apps' && currentPage!=='custom') return;
    sound('dialog');
  });
}
el('filter').oninput=appRows;
el('hex').onchange=e=>applyColor(e.target.value);
el('hex').onkeydown=e=>{if(e.key==='Enter') e.target.blur();};
document.addEventListener('keydown',e=>{
  if (e.target.matches('input,select')) return;
  if (e.key==='Escape' || e.key==='Backspace') { e.preventDefault();goBack();return; }
  if (currentPage==='drawer') return;
  if (currentPage==='home' && (e.key==='ArrowLeft' || e.key==='ArrowRight')) {
    e.preventDefault(); turnHomePage(e.key==='ArrowLeft'?-1:1); return;
  }
  if (e.key==='ArrowDown'||e.key==='ArrowUp') { e.preventDefault();move(e.key==='ArrowDown'?1:-1); }
  else if (e.key==='Enter' && !e.target.closest('button')) {
    e.preventDefault(); if (currentPage==='home') activate(); else activateCursor();
  }
});
const orientation=matchMedia('(orientation: landscape)');
const movie=el('motion');
let movieFile='';
const fallbackMovies=new Set();
function mediaBase(){return orientation.matches?'art/wide':'art/home';}
function updateMotion(){
  const play=foreground && !splashCleanup && !document.hidden && currentPage==='home' && state.animation && !state.reduced;
  if (!play) { movie.pause(); movie.classList.remove('playing'); return; }
  const base=mediaBase();
  const file=base+(fallbackMovies.has(base)?'.webm':'.mp4');
  if (file!==movieFile) { movie.classList.remove('playing');movieFile=file; movie.src=file; }
  movie.play().catch(()=>movie.classList.remove('playing'));
}
movie.onerror=()=>{
  if (movieFile.endsWith('.mp4')) {fallbackMovies.add(mediaBase());updateMotion();}
};
movie.onplaying=()=>{if(!movie.paused)movie.classList.add('playing');};
function setForeground(active){
  const opening=active && !foreground && currentPage==='home';
  foreground=active; resetGesture();
  if (!active) {stopSplash(); stopScene(); clearPageMotion();}
  if (opening && !state.reduced) playSplash();
  else updateMotion();
  if (active) el('home').classList.remove('awaiting-open');
}
document.addEventListener('visibilitychange',updateMotion);
orientation.addListener(()=>{
  const opening=Boolean(splashCleanup);
  stopScene(); clearPageMotion(); updateMotion();
  if (opening && el('splash').dataset.base!==mediaBase()) playSplash();
});
function clock(){
  const d=new Date();
  el('time').textContent=d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  el('date').textContent=d.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'});
}
Phone.backgroundSound(state.ambience);
if (state.reduced) el('home').classList.remove('awaiting-open');
clock();setInterval(clock,15000);colorVars();renderHome();paintHub();
document.fonts.ready.then(()=>{renderHome();paintHub();});
