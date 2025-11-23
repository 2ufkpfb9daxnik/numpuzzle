// Utilities: DOM helpers and small helpers used across modules
export const el = (id) => document.getElementById(id);

export function genColors(n){
  // Return an array of color CSS strings for the first `n` colors.
  // Prefer the named palette below; if `n` exceeds the palette size, fallback to generated HSL values.
  const palette = colorDefs.map(cd => cd.code);
  if(n <= palette.length) return palette.slice(0,n);
  const out = palette.slice();
  for(let i=palette.length;i<n;i++){ const h = Math.round((360 * i) / Math.max(1,n)); out.push(`hsl(${h} 75% 55%)`); }
  return out;
}

// small helper to await a timeout in async flows
export function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }

// Centralized color definitions: name + CSS code
export const colorDefs = [
  { name: '赤', code: '#E53935' },
  { name: '橙', code: '#FB8C00' },
  { name: '黄', code: '#FDD835' },
  { name: '緑', code: '#43A047' },
  { name: '水色', code: '#26C6DA' },
  { name: '青', code: '#1E88E5' },
  { name: '紫', code: '#8E24AA' },
  { name: '桃', code: '#EC407A' }
];

export function getColorName(idx){ if(typeof idx !== 'number') return String(idx); const i = idx % colorDefs.length; return (colorDefs[i] && colorDefs[i].name) || `色${idx}`; }
export function getColorCode(idx){ if(typeof idx !== 'number') return String(idx); const i = idx % colorDefs.length; return (colorDefs[i] && colorDefs[i].code) || `hsl(${(i*40)%360} 75% 55%)`; }
