import { playSound, playBgm } from './audio.js';

export function createPointerHandlers({ getCellEl, doSwap, onCellClick, isProcessing }){
  const dragState = { active:false, start:null, clone:null, origInner:null, startX:0, startY:0 };
  let _bgmStarted = false;

  function onPointerMove(e){
    if(!dragState.active) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if(!dragState.clone){
      if(Math.hypot(dx,dy) < 6) return;
      const clone = dragState.origInner && dragState.origInner.cloneNode(true);
      if(!clone) return;
      clone.style.position = 'fixed';
      clone.style.left = `${e.clientX - clone.offsetWidth/2}px`;
      clone.style.top = `${e.clientY - clone.offsetHeight/2}px`;
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = 9999;
      clone.style.width = `${dragState.origInner.offsetWidth}px`;
      clone.style.height = `${dragState.origInner.offsetHeight}px`;
      clone.classList.add('dragging');
      document.body.appendChild(clone);
      dragState.clone = clone;
      if(dragState.origInner) dragState.origInner.style.opacity = '0.3';
    }
    if(dragState.clone){
      dragState.clone.style.left = `${e.clientX - dragState.clone.offsetWidth/2}px`;
      dragState.clone.style.top = `${e.clientY - dragState.clone.offsetHeight/2}px`;
    }
  }

  function onPointerUp(e, moveHandler, upHandler){
    window.removeEventListener('pointermove', moveHandler);
    window.removeEventListener('pointerup', upHandler);
    if(!dragState.active) return;
    const start = dragState.start;
    if(dragState.clone){
      const elUnder = document.elementFromPoint(e.clientX, e.clientY);
      const cellEl = elUnder ? elUnder.closest('.cell') : null;
      if(cellEl && cellEl.dataset.r !== undefined){
        const tr = Number(cellEl.dataset.r); const tc = Number(cellEl.dataset.c);
        if(tr !== start.r || tc !== start.c){
          doSwap(start, {r:tr,c:tc});
        }
      }
      dragState.clone.remove();
      dragState.clone = null;
      if(dragState.origInner) dragState.origInner.style.opacity = '';
    } else {
      onCellClick(start.r, start.c);
    }
    dragState.active = false;
    dragState.start = null;
    dragState.origInner = null;
  }

  function onPointerDown(ev, r, c){
    if(isProcessing && isProcessing()) return;
    const cellEl = getCellEl(r,c);
    if(!cellEl) return;
    const inner = cellEl.querySelector('.cellInner');
    // play catch sound when grabbing a piece
    try{ playSound('catch'); }catch(e){}
    // start BGM on first user gesture (autoplay-safe). Only mark started when play succeeds.
    try{
      if(!_bgmStarted){
        const p = playBgm();
        if(p && typeof p.then === 'function'){
          p.then(()=>{ _bgmStarted = true; }).catch((err)=>{ console.warn('playBgm failed on gesture', err); _bgmStarted = false; });
        } else {
          // older browsers may return undefined; assume started
          _bgmStarted = true;
        }
      }
    }catch(e){ console.warn('playBgm call error', e); }
    dragState.active = true;
    dragState.start = {r,c};
    dragState.origInner = inner;
    dragState.startX = ev.clientX;
    dragState.startY = ev.clientY;
    const moveHandler = (e)=> onPointerMove(e);
    const upHandler = (e)=> onPointerUp(e, moveHandler, upHandler);
    window.addEventListener('pointermove', moveHandler);
    window.addEventListener('pointerup', upHandler);
    ev.preventDefault();
  }

  // returns a function to register handlers on a created cell element
  return function registerCell(cellEl, r, c){
    if(!cellEl) return;
    cellEl.addEventListener('click', ()=>{ if(!isProcessing || !isProcessing()) onCellClick(r,c); });
    cellEl.addEventListener('pointerdown', (ev)=> onPointerDown(ev, r, c));
  };
}
