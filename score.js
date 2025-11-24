import { el } from './utils.js';

let score = 0;
let combo = 0;
let comboBank = 0;

export function getScore(){ return score; }
export function setScore(v){ score = v; updateUI(); }
export function addScore(v){ score += v; updateUI(); }

export function getCombo(){ return combo; }
export function setCombo(v){ combo = v; updateUI(); }
export function addCombo(v){ combo += v; updateUI(); }
export function resetCombo(){ combo = 0; updateUI(); }

export function getComboBank(){ return comboBank; }
export function addComboBank(n){ comboBank += n; }
export function consumeComboBank(n){ const took = Math.min(comboBank, n); comboBank -= took; return took; }
export function setComboBank(n){ comboBank = n; }
export function resetComboBank(){ comboBank = 0; }

export function updateUI(){
  const s = el('score'); if(s) s.textContent = String(score);
  const c = el('combo'); if(c) c.textContent = String(combo);
  const cb = el('comboBank'); if(cb) cb.textContent = String(comboBank);
}

export function nextThresholdValue(selectionCount){
  // Use N^N growth as requested (for selectionCount N)
  try{ return Math.pow(selectionCount, selectionCount); }catch(e){ return Math.pow(3, selectionCount); }
}
