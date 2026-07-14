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
  mode:   document.getElementById('mode'),
  hash:   document.querySelector('.hash'),
  glowToggle: document.getElementById('glowToggle'),
  home:   document.getElementById('home'),
};

const state = {
  raw: '',
  mode: 'hex',
  format: 'dash',
  copied: false,
  copiedWhat: 'name',
};

let copyTimer = null;
let hashTimer = null;
let lastPushed = null;

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

/* ---------- input modes ---------- */

const MODES = {
  hex: { filter: /[^0-9a-fA-F]/g, max: 6, placeholder: '000000', hash: true },
  rgb: { filter: /[^0-9,\s]/g,    max: 15, placeholder: '255 128 0', hash: false },
  hsl: { filter: /[^0-9,\s]/g,    max: 15, placeholder: '210 50 40', hash: false },
};

// pull up to 3 numbers from "255 128 0" / "255,128,0"
function triplet(raw){
  const p = raw.split(/[\s,]+/).filter(Boolean).map(Number);
  if(p.length !== 3 || p.some(n => !Number.isFinite(n))) return null;
  return p;
}

function toHexByte(n){
  n = Math.round(Math.min(255, Math.max(0, n)));
  return n.toString(16).padStart(2, '0');
}

function rgbToHexStr(r, g, b){
  return toHexByte(r) + toHexByte(g) + toHexByte(b);
}

function hslToHexStr(h, s, l){
  h = ((h % 360) + 360) % 360; s = Math.min(100, Math.max(0, s)) / 100; l = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2*l - 1)) * s;
  const x = c * (1 - Math.abs((h/60) % 2 - 1));
  const m = l - c/2;
  let r=0, g=0, b=0;
  if(h < 60)       { r=c; g=x; }
  else if(h < 120) { r=x; g=c; }
  else if(h < 180) { g=c; b=x; }
  else if(h < 240) { g=x; b=c; }
  else if(h < 300) { r=x; b=c; }
  else             { r=c; b=x; }
  return rgbToHexStr((r+m)*255, (g+m)*255, (b+m)*255);
}

// raw (in current mode) -> 6-char hex, or null
function rawToHex(raw){
  if(state.mode === 'hex') return normalize(raw);
  const t = triplet(raw);
  if(!t) return null;
  if(state.mode === 'rgb'){
    if(t.some(n => n > 255)) return null;
    return rgbToHexStr(t[0], t[1], t[2]);
  }
  if(t[0] > 360 || t[1] > 100 || t[2] > 100) return null;
  return hslToHexStr(t[0], t[1], t[2]);
}

// per-channel max for grouping/clamping bare digits
const MODE_MAX = {
  rgb: [255, 255, 255],
  hsl: [360, 100, 100],
};

// "255128000" -> "255 128 0"; only groups when the user typed no separator yet
function autoGroup(str){
  if(state.mode === 'hex') return str;
  if(/[\s,]/.test(str)) return str;          // user is placing their own spaces
  const digits = str.replace(/\D/g, '');
  if(!digits) return str;
  const max = MODE_MAX[state.mode];
  const groups = [];
  let i = 0;
  while(i < digits.length && groups.length < 3){
    const cap = max[groups.length];
    if(digits[i] === '0'){                    // leading zero -> that channel is just "0"
      groups.push('0'); i++; continue;
    }
    let g = digits[i]; i++;                    // take 2nd and 3rd digit while <= cap
    while(i < digits.length && g.length < 3 && Number(g + digits[i]) <= cap){
      g += digits[i]; i++;
    }
    groups.push(g);
  }
  return groups.join(' ');   // extra digits beyond 3 channels are dropped
}

// clamp each channel to <=3 digits, <= its max, and at most 3 channels
// (used when the user types their own separators so autoGroup backs off)
function clampChannels(str){
  const max = MODE_MAX[state.mode];
  const trailing = /[\s,]$/.test(str);
  let parts = str.split(/[\s,]+/).filter(function(p, i){ return p !== '' || i === 0; });
  parts = parts.slice(0, 3).map(function(p, i){
    p = p.replace(/\D/g, '').slice(0, 3);
    if(p !== '' && Number(p) > max[i]) p = String(max[i]);
    return p;
  });
  let out = parts.join(' ');
  if(trailing && parts.length < 3) out += ' ';   // keep the space the user just typed
  return out;
}

function cleanInput(str){
  const m = MODES[state.mode];
  let out = str.replace(m.filter, '').slice(0, m.max);
  if(state.mode === 'hex'){ out = out.toLowerCase(); return out; }
  return /[\s,]/.test(out) ? clampChannels(out) : autoGroup(out);
}

// express a resolved hex as the raw input string for a given mode
function hexToRaw(hexFull, mode){
  if(mode === 'hex') return hexFull;
  const c = hexToRgb(hexFull);
  if(mode === 'rgb') return c.r + ' ' + c.g + ' ' + c.b;
  const hsl = rgbToHsl(c.r, c.g, c.b);
  return hsl.h + ' ' + hsl.s + ' ' + hsl.l;
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

  const hexFull = rawToHex(state.raw);
  if(!hexFull) return EMPTY;

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
  el.mode.querySelectorAll('button').forEach(function(b){
    b.setAttribute('aria-pressed', b.dataset.v === state.mode);
  });

  clearTimeout(hashTimer);
  hashTimer = setTimeout(function(){
    const valid = rawToHex(state.raw);   // resolved hex is the shareable value
    const url = valid ? '#' + valid : location.pathname;
    try {
      // new distinct color -> add a history entry so browser Back works
      if(valid && valid !== lastPushed){
        history.pushState(null, '', url);
        lastPushed = valid;
      } else {
        history.replaceState(null, '', url);
        if(!valid) lastPushed = null;
      }
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
    el.rgb._copied = el.hsl._copied = false;
    el.rgb.classList.remove('copied');
    el.hsl.classList.remove('copied');
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

  // show the two representations the user is NOT currently typing in
  const reps = {
    hex: 'HEX ' + v.hexFull,
    rgb: 'RGB ' + v.r + ' ' + v.g + ' ' + v.b,
    hsl: 'HSL ' + v.h + ' ' + v.s + ' ' + v.l,
  };
  const others = ['hex', 'rgb', 'hsl'].filter(function(k){ return k !== state.mode; });
  if(!el.rgb._copied) el.rgb.textContent = reps[others[0]];
  if(!el.hsl._copied) el.hsl.textContent = reps[others[1]];

  const tgt = copyTarget(v);
  el.copy.textContent = state.copied
    ? state.copiedWhat + ' copied \u2713'
    : (copyingHex() ? 'Copy ' + tgt.label : 'Copy name');

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

function selectField(){
  const r = document.createRange();
  r.selectNodeContents(el.hex);
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

function copyingHex(){
  const sel = window.getSelection && window.getSelection();
  return !!(sel && sel.toString().trim() !== '' && el.hex.contains(sel.anchorNode));
}

// what the Copy button acts on, based on the active input mode
function copyTarget(v){
  if(state.mode === 'rgb') return { label: 'RGB', value: v.r + ' ' + v.g + ' ' + v.b };
  if(state.mode === 'hsl') return { label: 'HSL', value: v.h + ' ' + v.s + ' ' + v.l };
  return { label: 'hex', value: v.hexFull };
}

function doCopy(){
  if(!DB) return;
  const v = compute();
  if(!v.hexFull || !v.name) return;

  const tgt = copyTarget(v);
  let value, what;

  if(copyingHex()){          // text selected inside the field -> copy that representation
    value = tgt.value; what = tgt.label;
  } else {                   // default in every mode -> copy the name
    value = v.name; what = 'Name';
  }

  writeClipboard(value);
  state.copied = true;
  state.copiedWhat = what.charAt(0).toUpperCase() + what.slice(1);
  render();
  clearTimeout(copyTimer);
  copyTimer = setTimeout(function(){ state.copied = false; render(); }, 1600);
}

/* ---------- events ---------- */

el.hex.addEventListener('input', function(){
  const clean = cleanInput(fieldValue());
  if(clean !== fieldValue()){
    setFieldValue(clean);
    caretToEnd();
  }
  state.raw = clean;
  state.copied = false;
  render();
});

document.addEventListener('selectionchange', function(){
  if(state.raw !== '') render();
});

// block newlines and paste formatting; paste replaces the selected text
el.hex.addEventListener('paste', function(e){
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text') || '';
  const pasted = text.replace(MODES[state.mode].filter, '');

  const cur = fieldValue();
  const sel = window.getSelection();
  let start = cur.length, end = cur.length;

  if(sel && sel.rangeCount && el.hex.contains(sel.anchorNode)){
    start = Math.min(sel.anchorOffset, sel.focusOffset);
    end   = Math.max(sel.anchorOffset, sel.focusOffset);
  }

  const clean = cleanInput(cur.slice(0,start) + pasted + cur.slice(end));

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

function applyMode(){
  const m = MODES[state.mode];
  el.hash.style.display = m.hash ? '' : 'none';
  el.hex.setAttribute('data-placeholder', m.placeholder);
  el.hex.setAttribute('aria-label', state.mode.toUpperCase() + ' value');
}

fastButton(el.mode, function(e){
  const b = e.target.closest('button');
  if(!b || b.dataset.v === state.mode) return;

  const cur = compute();                 // current color before switching
  state.mode = b.dataset.v;
  state.raw = cur.hexFull ? hexToRaw(cur.hexFull, state.mode) : '';
  state.copied = false;
  setFieldValue(state.raw);
  applyMode();
  render();
  focusField();
});

fastButton(el.copy, doCopy);
fastButton(el.clear, clearAll);
fastButton(el.home, clearAll);

// click a readout pill to copy its value (label stripped), with in-place confirmation
function pillCopy(pill){
  return function(){
    if(!DB || pill._copied) return;
    const txt = pill.textContent.trim();
    if(!txt) return;
    const value = txt.replace(/^(HEX|RGB|HSL)\s+/, '');
    writeClipboard(value);

    pill._copied = true;
    pill.classList.add('copied');
    pill.textContent = 'Copied \u2713';

    clearTimeout(pill._t);
    pill._t = setTimeout(function(){
      pill._copied = false;
      pill.classList.remove('copied');
      render();
    }, 1000);
  };
}
fastButton(el.rgb, pillCopy(el.rgb));
fastButton(el.hsl, pillCopy(el.hsl));

// Enter/Space activate the pills (span[role=button] doesn't do this natively)
[el.rgb, el.hsl].forEach(function(pill){
  const run = pillCopy(pill);
  pill.addEventListener('keydown', function(e){
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      run();
    }
  });
});

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

  if((e.metaKey || e.ctrlKey) && (e.key || '').toLowerCase() === 'a'){
    e.preventDefault();
    el.hex.focus({ preventScroll: true });
    selectField();
    return;
  }

  if((e.metaKey || e.ctrlKey) && (e.key || '').toLowerCase() === 'c'){
    // hex selected -> copy hex via doCopy; other text selected -> let browser copy
    const sel = (window.getSelection && window.getSelection().toString()) || '';
    if(sel.trim() !== '' && !copyingHex()) return;
    e.preventDefault();
    doCopy();
    return;
  }

  // type-ahead: typing a valid char anywhere focuses the field and adds it
  if(e.metaKey || e.ctrlKey || e.altKey) return;
  if(document.activeElement === el.hex) return;
  const typeable = state.mode === 'hex' ? /^[0-9a-fA-F]$/ : /^[0-9]$/;
  if(typeable.test(e.key)){
    e.preventDefault();
    const clean = cleanInput(fieldValue() + e.key);
    setFieldValue(clean);
    state.raw = clean;
    state.copied = false;
    render();
    focusField();
  }
});

/* ---------- glow toggle ---------- */

function setGlow(on){
  document.body.classList.toggle('no-glow', !on);
  el.glowToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
  try { localStorage.setItem('glow', on ? '1' : '0'); } catch(_){}
}

(function initGlow(){
  let on = true;
  try {
    const saved = localStorage.getItem('glow');
    if(saved !== null) on = saved === '1';
    else if(window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches) on = false;
  } catch(_){}
  setGlow(on);
})();

fastButton(el.glowToggle, function(){
  setGlow(document.body.classList.contains('no-glow'));
});

/* ---------- init ---------- */

applyMode();

const fromHash = location.hash.replace('#','').toLowerCase();
if(/^([0-9a-f]{3}|[0-9a-f]{6})$/.test(fromHash)) state.raw = fromHash;
setFieldValue(state.raw);
lastPushed = normalize(state.raw);

// browser back/forward -> load the color from the URL (always as hex)
window.addEventListener('popstate', function(){
  const h = location.hash.replace('#','').toLowerCase();
  const valid = /^([0-9a-f]{3}|[0-9a-f]{6})$/.test(h);
  state.mode = 'hex';
  applyMode();
  state.raw = valid ? h : '';
  lastPushed = valid ? normalize(h) : null;
  state.copied = false;
  setFieldValue(state.raw);
  render();
});

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
