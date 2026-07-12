const el = {
  swatch: document.getElementById('swatch'),
  family: document.getElementById('family'),
  name:   document.getElementById('name'),
  hex:    document.getElementById('hex'),
  rgb:    document.getElementById('rgb'),
  hsl:    document.getElementById('hsl'),
  copy:   document.getElementById('copy'),
  clear:  document.getElementById('clear'),
  fmt:    document.getElementById('fmt'),
};

const state = {
  raw: '',
  format: 'dash',
  copied: false,
};

let copyTimer = null;
let hashTimer = null;
let lastValid = null;

/* ---------- color dataset ---------- */

let DB = null;

function loadColors(){
  const d = window.__COLORS__;
  if(!d || !d.n || !d.h) return false;

  const N = d.n.length;
  const L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N);

  for(let i = 0; i < N; i++){
    const n = parseInt(d.h.substr(i*6, 6), 16);
    const lab = rgbToLab((n>>16)&255, (n>>8)&255, n&255);
    L[i] = lab[0]; A[i] = lab[1]; B[i] = lab[2];
  }
  DB = { n: d.n, L, A, B, N };
  return true;
}

/* ---------- color math ---------- */

function hexToRgb(h){
  const n = parseInt(h, 16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}

function rgbToHsl(r, g, b){
  r/=255; g/=255; b/=255;
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
  let h = 0, s = 0;
  const l = (mx+mn)/2;
  const d = mx-mn;
  if(d !== 0){
    s = l > 0.5 ? d/(2-mx-mn) : d/(mx+mn);
    if(mx === r)      h = ((g-b)/d + (g<b ? 6 : 0));
    else if(mx === g) h = (b-r)/d + 2;
    else              h = (r-g)/d + 4;
    h *= 60;
  }
  return { h:Math.round(h), s:Math.round(s*100), l:Math.round(l*100) };
}

function srgb(c){
  c /= 255;
  return c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
}

function rgbToLab(r, g, b){
  r = srgb(r); g = srgb(g); b = srgb(b);
  const x = (r*0.4124 + g*0.3576 + b*0.1805) / 0.95047;
  const y =  r*0.2126 + g*0.7152 + b*0.0722;
  const z = (r*0.0193 + g*0.1192 + b*0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787*t + 16/116;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116*fy - 16, 500*(fx-fy), 200*(fy-fz)];
}

/* ---------- nearest curated name ---------- */

function nearestName(hex){
  if(!DB) return null;
  const c = hexToRgb(hex);
  const lab = rgbToLab(c.r, c.g, c.b);
  const l = lab[0], a = lab[1], bb = lab[2];
  let best = 0, bd = Infinity;
  for(let i = 0; i < DB.N; i++){
    const dl = DB.L[i]-l, da = DB.A[i]-a, db = DB.B[i]-bb;
    const dist = dl*dl + da*da + db*db;
    if(dist < bd){ bd = dist; best = i; }
  }
  return DB.n[best];
}

/* ---------- family label ---------- */

function familyOf(h, s){
  if(s <= 8) return 'Neutral';
  if(h < 15)  return 'Red';
  if(h < 42)  return 'Orange';
  if(h < 66)  return 'Yellow';
  if(h < 150) return 'Green';
  if(h < 190) return 'Teal';
  if(h < 250) return 'Blue';
  if(h < 290) return 'Violet';
  if(h < 335) return 'Magenta';
  return 'Red';
}

/* ---------- formatting ---------- */

function applyFormat(name, fmt){
  const words = name.trim().split(/\s+/);
  if(fmt === 'title') return words.join(' ');

  const lower = words.map(function(w){
    return w.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');
  }).filter(Boolean);

  return fmt === 'lower' ? lower.join(' ') : lower.join('-');
}

/* ---------- compute ---------- */

function normalize(raw){
  if(/^[0-9a-f]{3}$/.test(raw)) return raw.split('').map(c => c+c).join('');
  if(/^[0-9a-f]{6}$/.test(raw)) return raw;
  return null;
}

const EMPTY = {
  hexFull: null,
  r:0, g:0, b:0, h:0, s:0, l:0,
  name: '',
  family: '',
};

function compute(){
  if(state.raw === '') return EMPTY;

  const resolved = normalize(state.raw);
  const hexFull = resolved || lastValid;
  if(!hexFull) return EMPTY;
  if(resolved) lastValid = resolved;

  const c = hexToRgb(hexFull);
  const hsl = rgbToHsl(c.r, c.g, c.b);

  const raw = nearestName(hexFull);
  const name = raw ? applyFormat(raw, state.format) : '';

  return {
    hexFull,
    r: c.r, g: c.g, b: c.b,
    h: hsl.h, s: hsl.s, l: hsl.l,
    name,
    family: familyOf(hsl.h, hsl.s),
  };
}

/* ---------- render ---------- */

function syncTail(){
  el.fmt.querySelectorAll('button').forEach(function(b){
    b.setAttribute('aria-pressed', b.dataset.v === state.format);
  });

  clearTimeout(hashTimer);
  hashTimer = setTimeout(function(){
    const valid = normalize(state.raw);
    try {
      history.replaceState(null, '', valid ? '#' + state.raw : location.pathname);
    } catch(_){}
  }, 250);
}

function render(){
  const v = compute();
  const empty = v.hexFull === null;

  document.body.classList.toggle('is-empty', empty);

  if(empty){
    document.documentElement.style.setProperty('--bg', '#2a2a2e');
    document.documentElement.style.setProperty('--accent', 'rgba(255,255,255,0.30)');
    el.family.textContent = '';
    el.name.textContent   = 'name a color';
    el.rgb.textContent    = '';
    el.hsl.textContent    = '';
    el.copy.textContent   = 'Copy';
    document.title = 'Name a Color';
    syncTail();
    return;
  }

  const aL = Math.min(78, Math.max(v.l, 62));
  const aS = v.s < 12 ? 0 : Math.max(v.s, 45);

  document.documentElement.style.setProperty('--bg', '#' + v.hexFull);
  document.documentElement.style.setProperty('--accent', 'hsl(' + v.h + ' ' + aS + '% ' + aL + '%)');

  el.family.textContent = v.family + ' \u00b7 ' + v.l + '% light';
  el.name.textContent   = v.name;
  el.rgb.textContent    = 'RGB ' + v.r + ' ' + v.g + ' ' + v.b;
  el.hsl.textContent    = 'HSL ' + v.h + ' ' + v.s + ' ' + v.l;
  el.copy.textContent   = state.copied ? 'Copied \u2713' : 'Copy';

  document.title = 'Name a Color';

  syncTail();
}

/* ---------- contenteditable field helpers ---------- */
/* A contenteditable span is used instead of <input> because password
   managers (notably iCloud Passwords) offer to fill any focused text
   input and provide no developer opt-out. */

function fieldValue(){
  return el.hex.textContent;
}

function setFieldValue(v){
  if(el.hex.textContent !== v) el.hex.textContent = v;
}

function caretToEnd(){
  const r = document.createRange();
  r.selectNodeContents(el.hex);
  r.collapse(false);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
}

function focusField(){
  el.hex.focus({ preventScroll: true });
  caretToEnd();
}

/* ---------- clipboard ---------- */

function legacyCopy(text){
  const wasInField = document.activeElement === el.hex;

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly','');
  ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(_){}
  document.body.removeChild(ta);

  if(wasInField) focusField();
}

function writeClipboard(text){
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).catch(function(){ legacyCopy(text); });
  } else {
    legacyCopy(text);
  }
}

function doCopy(){
  if(!DB) return;
  const v = compute();
  if(!v.hexFull || !v.name) return;
  writeClipboard(v.name);
  state.copied = true;
  render();
  clearTimeout(copyTimer);
  copyTimer = setTimeout(function(){ state.copied = false; render(); }, 1600);
}

/* ---------- events ---------- */

el.hex.addEventListener('input', function(){
  const clean = fieldValue().replace(/[^0-9a-fA-F]/g,'').toLowerCase().slice(0,6);
  if(clean !== fieldValue()){
    setFieldValue(clean);
    caretToEnd();
  }
  state.raw = clean;
  state.copied = false;
  render();
});

// block newlines and paste formatting; paste replaces the selected text
el.hex.addEventListener('paste', function(e){
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text') || '';
  const pasted = text.replace(/[^0-9a-fA-F]/g,'').toLowerCase();

  const cur = fieldValue();
  const sel = window.getSelection();
  let start = cur.length, end = cur.length;

  if(sel && sel.rangeCount && el.hex.contains(sel.anchorNode)){
    start = Math.min(sel.anchorOffset, sel.focusOffset);
    end   = Math.max(sel.anchorOffset, sel.focusOffset);
  }

  const clean = (cur.slice(0,start) + pasted + cur.slice(end))
    .replace(/[^0-9a-fA-F]/g,'').toLowerCase().slice(0,6);

  setFieldValue(clean);
  caretToEnd();
  state.raw = clean;
  state.copied = false;
  render();
});

/* Buttons act on pointerdown for instant response on touch.
   `click` still fires for keyboard (Enter/Space), so we guard against
   running the action twice for the same interaction. */
function fastButton(node, run){
  let handled = false;

  node.addEventListener('pointerdown', function(e){
    if(e.button && e.button !== 0) return;   // ignore right/middle click
    e.preventDefault();                       // keeps focus in the hex field
    handled = true;
    run(e);
  });

  node.addEventListener('click', function(e){
    if(handled){ handled = false; return; }   // pointer already ran it
    run(e);                                   // keyboard activation
  });
}

fastButton(el.fmt, function(e){
  const b = e.target.closest('button');
  if(!b) return;
  state.format = b.dataset.v;
  state.copied = false;
  render();
});

fastButton(el.copy, doCopy);
fastButton(el.clear, clearAll);

// Esc on the input itself — some browsers (Arc) intercept Escape at the
// window level, so this local listener catches it when the field is focused.
el.hex.addEventListener('keydown', function(e){
  if(e.key === 'Enter'){
    e.preventDefault();
    return;
  }
  if(e.key === 'Escape'){
    e.preventDefault();
    e.stopPropagation();
    clearAll();
  }
});

function clearAll(){
  if(state.raw === '') return;
  state.raw = '';
  lastValid = null;
  state.copied = false;
  setFieldValue('');
  render();
  focusField();
}

window.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    e.preventDefault();
    clearAll();
    return;
  }

  if((e.metaKey || e.ctrlKey) && (e.key || '').toLowerCase() === 'c'){
    // if the user has selected text anywhere, let the browser copy it
    const sel = (window.getSelection && window.getSelection().toString()) || '';
    if(sel.trim() !== '') return;
    e.preventDefault();
    doCopy();
  }
});

/* ---------- init ---------- */

const fromHash = location.hash.replace('#','').toLowerCase();
if(/^([0-9a-f]{3}|[0-9a-f]{6})$/.test(fromHash)) state.raw = fromHash;
setFieldValue(state.raw);

if(!loadColors()){
  render();
  el.name.textContent = 'offline';
} else {
  render();
}

// Focus on desktop only — auto-opening the keyboard on mobile is jarring.
const isDesktop = window.matchMedia &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;
if(isDesktop) focusField();
