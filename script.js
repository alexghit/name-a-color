const el = {
  swatch: document.getElementById('swatch'),
  family: document.getElementById('family'),
  name:   document.getElementById('name'),
  hex:    document.getElementById('hex'),
  rgb:    document.getElementById('rgb'),
  hsl:    document.getElementById('hsl'),
  copy:   document.getElementById('copy'),
  fmt:    document.getElementById('fmt'),
};

const DEFAULT_HEX = '38485d';

const state = {
  raw: DEFAULT_HEX,
  format: 'dash',
  copied: false,
};

let copyTimer = null;
let hashTimer = null;
let lastValid = DEFAULT_HEX;

/* ---------- color dataset ---------- */

let DB = null;

async function loadColors(){
  const res = await fetch('colors.json');
  if(!res.ok) throw new Error('colors.json');
  const d = await res.json();
  const N = d.n.length;
  const L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N);

  for(let i = 0; i < N; i++){
    const n = parseInt(d.h.substr(i*6, 6), 16);
    const lab = rgbToLab((n>>16)&255, (n>>8)&255, n&255);
    L[i] = lab[0]; A[i] = lab[1]; B[i] = lab[2];
  }
  DB = { n: d.n, L, A, B, N };
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

function compute(){
  const resolved = normalize(state.raw);
  const hexFull = resolved || lastValid;
  if(resolved) lastValid = resolved;

  const c = hexToRgb(hexFull);
  const hsl = rgbToHsl(c.r, c.g, c.b);

  const raw = nearestName(hexFull);
  const name = raw ? applyFormat(raw, state.format) : '\u2026';

  return {
    hexFull,
    r: c.r, g: c.g, b: c.b,
    h: hsl.h, s: hsl.s, l: hsl.l,
    name,
    family: familyOf(hsl.h, hsl.s),
  };
}

/* ---------- render ---------- */

function render(){
  const v = compute();

  const aL = Math.min(78, Math.max(v.l, 62));
  const aS = v.s < 12 ? 0 : Math.max(v.s, 45);

  document.documentElement.style.setProperty('--bg', '#' + v.hexFull);
  document.documentElement.style.setProperty('--accent', 'hsl(' + v.h + ' ' + aS + '% ' + aL + '%)');

  el.family.textContent = v.family + ' \u00b7 ' + v.l + '% light';
  el.name.textContent   = v.name;
  el.rgb.textContent    = 'RGB ' + v.r + ' ' + v.g + ' ' + v.b;
  el.hsl.textContent    = 'HSL ' + v.h + ' ' + v.s + ' ' + v.l;
  el.copy.textContent   = state.copied ? 'Copied \u2713' : 'Copy';

  document.title = (DB ? v.name + ' \u2014 ' : '') + 'Name a Color';

  el.fmt.querySelectorAll('button').forEach(function(b){
    b.setAttribute('aria-pressed', b.dataset.v === state.format);
  });

  clearTimeout(hashTimer);
  hashTimer = setTimeout(function(){
    if(normalize(state.raw)){
      try { history.replaceState(null, '', '#' + state.raw); } catch(_){}
    }
  }, 250);
}

/* ---------- clipboard ---------- */

function legacyCopy(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly','');
  ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(_){}
  document.body.removeChild(ta);
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
  writeClipboard(compute().name);
  state.copied = true;
  render();
  clearTimeout(copyTimer);
  copyTimer = setTimeout(function(){ state.copied = false; render(); }, 1600);
}

/* ---------- events ---------- */

el.hex.addEventListener('input', function(e){
  state.raw = e.target.value.replace(/[^0-9a-fA-F]/g,'').toLowerCase().slice(0,6);
  e.target.value = state.raw;
  state.copied = false;
  render();
});

el.fmt.addEventListener('click', function(e){
  const b = e.target.closest('button');
  if(!b) return;
  state.format = b.dataset.v;
  state.copied = false;
  render();
});

el.copy.addEventListener('click', doCopy);

window.addEventListener('keydown', function(e){
  if((e.metaKey || e.ctrlKey) && (e.key || '').toLowerCase() === 'c'){
    if(document.activeElement === el.hex) return;
    const sel = (window.getSelection && window.getSelection().toString()) || '';
    if(sel.trim() === ''){ e.preventDefault(); doCopy(); }
  }
});

/* ---------- init ---------- */

const fromHash = location.hash.replace('#','').toLowerCase();
if(/^([0-9a-f]{3}|[0-9a-f]{6})$/.test(fromHash)) state.raw = fromHash;
el.hex.value = state.raw;
render();

loadColors()
  .then(render)
  .catch(function(){ el.name.textContent = 'offline'; });
