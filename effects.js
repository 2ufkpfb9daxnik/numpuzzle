import { getColorName } from './utils.js';
import { getShapeLabel } from './shapes.js';
import { playSound } from './audio.js';
import { applyGravity as applyGravityBoard, fillBoard as fillBoardBoard } from './board.js';
import { getComboBank, consumeComboBank } from './score.js';

export const activeEffects = [];

export function generateEffectOptions(thresh, selectionCount, colorCount, shapeCount){
  const opts = [];
  // choose up to 3 distinct kinds (no duplicates across the options)
  const kinds = ['trigger_remove_target','trigger_rect','combo_bonus','trigger_line'];
  // shuffle kinds and take up to 3
  const shuffled = kinds.slice().sort(()=>Math.random()-0.5);
  const pick = shuffled.slice(0, Math.min(3, shuffled.length));
  for(const k of pick){
    if(k==='trigger_remove_target'){
      const tk = Math.random()<0.5 ? 'color' : 'shape';
      const maxIdx = tk==='color' ? Math.max(0,colorCount-1) : Math.max(0,shapeCount-1);
      const tid = Math.floor(Math.random()*(maxIdx+1));
      // triggerCount represents the required TOTAL value removed for that color/shape
      // use a three-digit-ish random threshold (100..999), scaled mildly by selectionCount
      const base = 100 + Math.floor(Math.random()*900);
      const triggerCount = Math.min(999, Math.floor(base + (selectionCount-1) * 20));
      const actKind = Math.random()<0.5 ? 'color' : 'shape';
      const actMax = actKind==='color' ? Math.max(0,colorCount-1) : Math.max(0,shapeCount-1);
      const actType = Math.floor(Math.random()*(actMax+1));
      const removeCount = 4 + Math.floor(Math.random()*8);
      const title = `${tk==='color' ? getColorName(tid) : getShapeLabel(tid)} の値を合計 ${triggerCount} 消すと、${actKind==='color' ? getColorName(actType) : getShapeLabel(actType)} を ${removeCount} 個削除`;
      opts.push({ title, trigger: {kind:'remove_target', kindTarget:tk, type:tid, count:triggerCount}, action: {kind:'remove_target', targetKind:actKind, targetType:actType, count:removeCount} });
    } else if(k==='trigger_rect'){
      const requiredCombo = Math.max(2, Math.floor(2 + Math.random()*4));
      const h = 2 + Math.floor(Math.random()*2);
      const w = 2 + Math.floor(Math.random()*3);
      if(Math.random()<0.5){
        opts.push({ title:`${h}x${w} のブロックを削除（コンボ${requiredCombo}で発動）`, trigger:{kind:'combo_accum', count:requiredCombo}, action:{kind:'remove_rect', h,w} });
      } else {
        const actKind = Math.random()<0.5 ? 'color' : 'shape';
        const actMax = actKind==='color' ? Math.max(0,colorCount-1) : Math.max(0,shapeCount-1);
        const actType = Math.floor(Math.random()*(actMax+1));
        const removeCount = 4 + Math.floor(Math.random()*6);
        opts.push({ title:`コンボ${requiredCombo}で ${actKind==='color'? getColorName(actType) : getShapeLabel(actType)} を ${removeCount}個削除`, trigger:{kind:'combo_accum', count:requiredCombo}, action:{kind:'remove_target', targetKind:actKind, targetType:actType, count:removeCount} });
      }
    } else if(k==='combo_bonus'){
      const threshold = 2 + Math.floor(Math.random()*5);
      let multiplier = Math.round((0.5 + Math.random()*1.0) * 100) / 100;
      multiplier = Math.max(0.1, multiplier);
      opts.push({title:`コンボ ${threshold} で以後ボーナス x${multiplier}`, trigger:{kind:'combo_accum', count:threshold}, action:{kind:'combo_bonus', multiplier}, comboThreshold:threshold, multiplier});
    } else if(k==='trigger_line'){
      const triggerCount = 12 + Math.floor(Math.random()*10);
      // allow removing multiple lines (rows/cols) — pick 1..3
      const linesToRemove = 1 + Math.floor(Math.random()*3);
      opts.push({ title:`全削除数 ${triggerCount} で行/列を ${linesToRemove} 本消去`, trigger:{kind:'remove_total', count:triggerCount}, action:{kind:'remove_line', count: linesToRemove} });
    }
  }
  return opts;
}

export function addEffect(opt){
  opt.chosenAt = Date.now();
  opt.triggered = false;
  opt.active = false;
  activeEffects.push(opt);
}

export function addEffectWithBaseline(opt, getState){
  const state = (typeof getState==='function') ? getState() : null;
  const ef = Object.assign({}, opt);
  ef.chosenAt = Date.now();
  ef.triggered = false;
  ef.active = false;
  ef._base = {};
  try{
    if(state){
      if(ef.trigger){
        const tr = ef.trigger;
        if(tr.kind === 'remove_total'){
          ef._base.removedTotal = state.removedTotal || 0;
        } else if(tr.kind === 'remove_target'){
          // record baseline for specific target
          if(tr.kindTarget === 'color'){
            ef._base.removedByColor = {};
            ef._base.removedByColor[tr.type] = (state.removedByColor && state.removedByColor[tr.type]) || 0;
          } else if(tr.kindTarget === 'shape'){
            ef._base.removedByShape = {};
            ef._base.removedByShape[tr.type] = (state.removedByShape && state.removedByShape[tr.type]) || 0;
          }        
        } else if(tr.kind === 'combo_accum'){
          // baseline combo bank
          ef._base.comboBank = (typeof getComboBank === 'function') ? getComboBank() : 0;
        }
      }
    }
  }catch(e){}
  activeEffects.push(ef);
  return ef;
}

export async function checkEffectsProgress(getState, helpers){
  const { uiLog, renderEffectsPanel, updateStatus, render, isProcessing } = helpers || {};
  let actionExecuted = false;
  try{
    if(typeof renderEffectsPanel === 'function') renderEffectsPanel(getState);
    if(activeEffects.length===0) return;
    if(typeof isProcessing === 'function' && isProcessing()){ setTimeout(()=>checkEffectsProgress(getState, helpers), 180); return; }

    for(const ef of activeEffects){
      if(ef.triggered) continue;
      const state = getState();
      const removedByColor = state.removedByColor || [];
      const removedByShape = state.removedByShape || [];
      const removedTotal = state.removedTotal || 0;
      const trig = ef.trigger || null;
      const act = ef.action || null;
      if(trig && trig.kind === 'remove_target'){
        const tk = trig.kindTarget; const tid = trig.type; const need = trig.count || 0;
          let cur = 0;
          if(tk==='color'){
            const base = (ef._base && ef._base.removedByColor && (ef._base.removedByColor[tid]||0)) || 0;
            cur = (removedByColor[tid]||0) - base;
          } else {
            const base = (ef._base && ef._base.removedByShape && (ef._base.removedByShape[tid]||0)) || 0;
            cur = (removedByShape[tid]||0) - base;
          }
        if(cur >= need){
          if(typeof uiLog === 'function') uiLog(`効果発動: ${ef.title} (条件達成: ${cur}/${need})`);
          // consume
          if(tk==='color') state.removedByColor[tid] = Math.max(0, (state.removedByColor[tid]||0) - need);
          else state.removedByShape[tid] = Math.max(0, (state.removedByShape[tid]||0) - need);
          if(act){ await executeAction(ef, act, getState, helpers); actionExecuted = true; }
          // reset baseline so progress appears as 0 after activation and allow future re-trigger
          try{
            ef._base = ef._base || {};
            if(tk==='color'){
              ef._base.removedByColor = ef._base.removedByColor || {};
              ef._base.removedByColor[tid] = (state.removedByColor && state.removedByColor[tid]) || 0;
            } else {
              ef._base.removedByShape = ef._base.removedByShape || {};
              ef._base.removedByShape[tid] = (state.removedByShape && state.removedByShape[tid]) || 0;
            }
            // do not permanently mark as triggered for repeatable effects
            ef.triggered = false;
          }catch(e){ ef.triggered = true; }
        }
      } else if(trig && trig.kind === 'remove_total'){
        const need = trig.count || 0; const base = (ef._base && ef._base.removedTotal) || 0; const cur = (removedTotal || 0) - base;
        if(cur >= need){
          if(typeof uiLog === 'function') uiLog(`効果発動: ${ef.title} (全削除数 ${cur}/${need})`);
          state.removedTotal = Math.max(0, (state.removedTotal||0) - need);
          if(act){ await executeAction(ef, act, getState, helpers); actionExecuted = true; }
          // reset baseline for removedTotal so progress shows 0 and can accumulate again
          try{ ef._base = ef._base || {}; ef._base.removedTotal = state.removedTotal || 0; ef.triggered = false; }catch(e){ ef.triggered = true; }
        }
      } else if(trig && trig.kind === 'combo_accum'){
        const need = trig.count || 0; const base = (ef._base && ef._base.comboBank) || 0; const cur = (getComboBank() || 0) - base;
        if(need>0 && cur >= need){
          if(act && act.kind === 'combo_bonus'){
            if(typeof uiLog === 'function') uiLog(`効果発動（コンボボーナス有効化）: ${ef.title} (消費 ${need})`);
            const took = consumeComboBank(need);
            // update UI to reflect consumed combo bank
            if(typeof updateStatus === 'function') updateStatus();
            if(typeof renderEffectsPanel === 'function') renderEffectsPanel(getState);
            ef.active = true;
            // combo_bonus is permanent/one-shot; mark triggered so it doesn't re-arm
            ef.triggered = true;
          } else {
            if(typeof uiLog === 'function') uiLog(`効果発動: ${ef.title} (コンボ蓄積 ${cur}/${need})`);
            const took = consumeComboBank(need);
            // update UI immediately so the player sees the consumed combo
            if(typeof updateStatus === 'function') updateStatus();
            if(typeof renderEffectsPanel === 'function') renderEffectsPanel(getState);
            // mark consumed before executing to avoid reentrancy, then reset baseline so it can accumulate again
            ef.triggered = false;
            if(act){ await executeAction(ef, act, getState, helpers); actionExecuted = true; }
            try{ ef._base = ef._base || {}; ef._base.comboBank = (typeof getComboBank === 'function') ? getComboBank() : 0; }catch(e){ }
          }
        }
      }
    }
  }catch(err){ console.error('checkEffectsProgress error', err); }
  if(typeof renderEffectsPanel === 'function') renderEffectsPanel(getState);
  return actionExecuted;
}

export async function executeAction(ef, action, getState, helpers){
  const { uiLog, updateStatus, render } = helpers || {};
  try{ playSound('eff'); }catch(e){}
  const state = getState();
  const rows = state.rows; const cols = state.cols; const board = state.board;
  const targets = [];
  if(action.kind === 'remove_target'){
    const tk = action.targetKind; const tid = action.targetType; const cnt = action.count || 6;
    for(let r=0;r<rows && targets.length<cnt;r++){
      for(let c=0;c<cols && targets.length<cnt;c++){
        const p = board[r][c]; if(!p) continue;
        if((tk==='color' && p.color===tid) || (tk==='shape' && p.shape===tid)) targets.push({r,c});
      }
    }
  } else if(action.kind === 'remove_line'){
    const lines = action.count || 1;
    // record which lines (rows/cols) we chose so we can visually highlight them
    const linesChosen = [];
    for(let i=0;i<lines;i++){
      const isRow = Math.random() < 0.5;
      if(isRow){ const rr = Math.floor(Math.random()*rows); linesChosen.push({isRow:true,index:rr}); for(let c=0;c<cols;c++) targets.push({r:rr,c}); }
      else { const cc = Math.floor(Math.random()*cols); linesChosen.push({isRow:false,index:cc}); for(let r=0;r<rows;r++) targets.push({r,c:cc}); }
    }
    // attach linesChosen to action for use below (visualization)
    action._linesChosen = linesChosen;
    // play row/col sound(s)
    try{
      for(const L of linesChosen){ if(L.isRow) playSound('row'); else playSound('col'); }
    }catch(e){}
  } else if(action.kind === 'remove_rect'){
    const h = action.h || 2; const w = action.w || 3;
    const sr = Math.floor(Math.random()*(rows - h + 1));
    const sc = Math.floor(Math.random()*(cols - w + 1));
    // remember chosen rect for visualization
    action._rectChosen = { sr, sc, h, w };
    for(let r=sr;r<sr+h;r++) for(let c=sc;c<sc+w;c++) targets.push({r,c});
    // play box sound
    try{ playSound('box'); }catch(e){}
  } else if(action.kind === 'combo_bonus'){
    ef.active = true;
    if(typeof uiLog === 'function') uiLog(`恒久ボーナス効果が有効になりました: ${ef.title}`);
    if(typeof render === 'function') render(); if(typeof updateStatus === 'function') updateStatus();
    return;
  }

  if(targets.length===0){ if(typeof uiLog === 'function') uiLog('効果発動: 対象セルが見つかりませんでした'); return; }

  // If a line action selected specific rows/cols, visually highlight those cells briefly
    try{
      if(typeof window !== 'undefined' && window.document){
        const cellsToHighlight = [];
        // lines
        if(action && action._linesChosen && action._linesChosen.length){
          for(const L of action._linesChosen){
            if(L.isRow){ for(let c=0;c<cols;c++) cellsToHighlight.push({r:L.index,c, kind:'line'}); }
            else { for(let r=0;r<rows;r++) cellsToHighlight.push({r,c:L.index, kind:'line'}); }
          }
        }
        // rect
        if(action && action._rectChosen){
          const R = action._rectChosen;
          for(let r=R.sr; r<R.sr + R.h; r++) for(let c=R.sc; c<R.sc + R.w; c++) cellsToHighlight.push({r,c, kind:'rect'});
        }

        // dedupe by r,c
        const seen = new Set();
        const unique = [];
        for(const it of cellsToHighlight){ const key = `${it.r},${it.c}`; if(!seen.has(key)){ seen.add(key); unique.push(it); } }

        // apply classes based on kind (rect has priority)
        for(const it of unique){
          const sel = `.cell[data-r="${it.r}"][data-c="${it.c}"]`;
          const cellEl = document.querySelector(sel);
          if(!cellEl) continue;
          if(it.kind === 'rect') cellEl.classList.add('highlight-rect');
          else cellEl.classList.add('highlight-line');
        }

        // let the highlight be visible briefly before performing the removal
        await new Promise(res=>setTimeout(res, 260));

        // ensure cleanup later (after removal there is also cleanup) — remove after 800ms
        setTimeout(()=>{
          for(const it of unique){
            const sel = `.cell[data-r="${it.r}"][data-c="${it.c}"]`;
            const cellEl = document.querySelector(sel);
            if(cellEl){ cellEl.classList.remove('highlight-line'); cellEl.classList.remove('highlight-rect'); }
          }
        }, 800);
      }
    }catch(e){}

  const removedNow = [];
  for(const t of targets){ const p = board[t.r] && board[t.r][t.c]; if(p){ removedNow.push({r:t.r,c:t.c,piece:p}); board[t.r][t.c] = null; } }
  if(typeof uiLog === 'function') uiLog(`効果により削除されたセル（進捗に含めない）: ${removedNow.length}`);
  // Detailed logging: list all removed positions and piece info
  if(removedNow.length>0){
    try{
      const coords = removedNow.map(it=>`${it.r},${it.c}`).join(' ; ');
      const details = removedNow.map(it=>({pos:`${it.r},${it.c}`, color: it.piece.color, shape: it.piece.shape}));
      uiLog(`削除位置: ${coords}`);
      console.log('Effect removed cells (detailed):', details);
    }catch(e){ console.log('logging error', e); }
  }

  try{ if(removedNow.length>0) playSound('effrm'); }catch(e){}

  // highlight the corresponding effect entry in the effects list
  try{
    const idx = activeEffects.indexOf(ef);
    if(typeof window !== 'undefined' && idx >= 0){
      const items = document.querySelectorAll('#effectsList .effectsItem');
      const item = items && items[idx];
      if(item){ item.classList.add('effects-fired'); setTimeout(()=>{ item.classList.remove('effects-fired'); }, 900); }
    }
  }catch(e){}

  // visual overlay if DOM helper provided
  try{
    const boardEl = (typeof window !== 'undefined' && window.document) ? window.document.getElementById('boardContainer') : null;
    if(boardEl){ const ov = document.createElement('div'); ov.className = 'effectOverlay ' + (action.kind==='remove_line' ? 'line' : (action.kind==='remove_rect' ? 'rect' : 'area')); boardEl.appendChild(ov); setTimeout(()=>{ ov.style.opacity = '0'; }, 300); setTimeout(()=>{ ov.remove(); }, 800); }
  }catch(e){}

  // apply gravity + refill using board functions
  applyGravityBoard(getState());
  fillBoardBoard(getState());
  if(typeof render === 'function') render();
  if(typeof updateStatus === 'function') updateStatus();
}
