import { el } from './utils.js';
import { getCellEl } from './board.js';

export async function animateMoves(state, oldMap){
  const containerRect = el('boardContainer').getBoundingClientRect();
  const promises = [];
  for(let r=0;r<state.rows;r++){
    for(let c=0;c<state.cols;c++){
      const key = `${r},${c}`;
      const old = oldMap.get(key);
      const cellEl = getCellEl(r,c);
      if(!cellEl || !old) continue;
      const inner = cellEl.querySelector('.cellInner');
      const rect = inner.getBoundingClientRect();
      const newPos = {left: rect.left - containerRect.left, top: rect.top - containerRect.top};
      const dx = old.left - newPos.left;
      const dy = old.top - newPos.top;
      if(dx===0 && dy===0) continue;
      inner.style.transition = 'transform 200ms ease';
      inner.style.transform = `translate(${dx}px, ${dy}px)`;
      inner.getBoundingClientRect();
      requestAnimationFrame(()=>{ inner.style.transform = ''; });
      const p = new Promise(res=>{ const onEnd = ()=>{ inner.style.transition=''; inner.removeEventListener('transitionend', onEnd); res(); }; inner.addEventListener('transitionend', onEnd); });
      promises.push(p);
    }
  }
  return Promise.all(promises);
}

export function capturePositions(state){
  return getCellEl ? (function(){
    const containerRect = el('boardContainer').getBoundingClientRect();
    const map = new Map();
    for(let r=0;r<state.rows;r++) for(let c=0;c<state.cols;c++){
      const key = `${r},${c}`;
      const cellEl = getCellEl(r,c);
      if(!cellEl) continue;
      const inner = cellEl.querySelector('.cellInner'); if(!inner) continue;
      const rect = inner.getBoundingClientRect();
      map.set(key, {left: rect.left - containerRect.left, top: rect.top - containerRect.top});
    }
    return map;
  })() : new Map();
}
