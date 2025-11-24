// Core game engine extracted from game-main.js
// Exports: initCore(), getState(), enable256Mode(), disable256Mode(), getModeState(), and other helpers

import { el, genColors, sleep, getColorName } from './utils.js';
import { shapes, getShapeLabel } from './shapes.js';
import { swapCells as swapCellsBoard, findMatches as findMatchesBoard, removeMatches as removeMatchesBoard, applyGravity as applyGravityBoard, fillBoard as fillBoardBoard, capturePositions as capturePositionsBoard, getCellEl as getCellElBoard } from './board.js';
import { animateMoves as animateMovesModule } from './anim.js';
import { getScore, setScore, addScore, getCombo, setCombo, resetCombo, resetComboBank, getComboBank, addComboBank, consumeComboBank, updateUI, nextThresholdValue } from './score.js';
import { generateEffectOptions, activeEffects as activeEffectsGlobal, addEffect, addEffectWithBaseline, checkEffectsProgress as effects_checkProgress, executeAction as effects_executeAction } from './effects.js';
import { renderEffectsPanel as renderEffectsPanelUI, showEffectChoicePanel, hideEffectChoicePanel, showChoicePanel, hideChoicePanel } from './effectsUI.js';
import { uiLog } from './logger.js';
import { createPointerHandlers } from './input.js';
import { playSound, initAudio } from './audio.js';

let rows = 8, cols = 8, colorCount = 8, shapeCount = 8;
let colors = [];
let board = [];
let firstSelection = null;

// piece value range (default)
let valueMin = 1, valueMax = 999;

function randomPiece(){
  const v = Math.floor(Math.random()*(valueMax - valueMin + 1)) + valueMin;
  return { color: Math.floor(Math.random()*colorCount), shape: Math.floor(Math.random()*shapeCount), value: v };
}

// combo state is managed in score.js but we keep local processing flag
let processing = false;
let dragState = {active:false, start:null, clone:null, origInner:null};
let selectionCount = 5;
let awaitingChoice = false;
let registerCellInput = null;

// move / mode state
let movesLimit = null;
let movesLeft = null;
let movesLocked = false;
let mobileMode = false;
let mode256combo = false;
let movesTaken = 0;
const comboTarget256 = 256;

let removedByColor = [];
let removedByShape = [];
let removedTotal = 0;
let requiredByColor = [];
let requiredByShape = [];

export function getState(){
  return {
    get rows(){ return rows; }, set rows(v){ rows = v; },
    get cols(){ return cols; }, set cols(v){ cols = v; },
    get colorCount(){ return colorCount; }, set colorCount(v){ colorCount = v; },
    get shapeCount(){ return shapeCount; }, set shapeCount(v){ shapeCount = v; },
    board,
    removedByColor,
    removedByShape,
    requiredByColor,
    requiredByShape,
    valueMin,
    valueMax,
    get removedTotal(){ return removedTotal; }, set removedTotal(v){ removedTotal = v; }
  };
}

function initCounters(){
  removedByColor = Array.from({length: colorCount}, ()=>0);
  removedByShape = Array.from({length: shapeCount}, ()=>0);
  removedTotal = 0;
  resetComboBank();
  const minReq = 500; const maxReq = 900;
  requiredByColor = Array.from({length: colorCount}, ()=> Math.floor(Math.random()*(maxReq-minReq+1)) + minReq);
  requiredByShape = Array.from({length: shapeCount}, ()=> Math.floor(Math.random()*(maxReq-minReq+1)) + minReq);
  try{
    const allReqs = requiredByColor.concat(requiredByShape);
    const actualMaxReq = allReqs.length ? Math.max(...allReqs) : maxReq;
    valueMax = Math.max(1, Math.floor(actualMaxReq / 2));
  }catch(e){}
  try{ if(mobileMode){ requiredByColor = requiredByColor.map(v => Math.max(1, Math.floor(v * 3 / 4))); requiredByShape = requiredByShape.map(v => Math.max(1, Math.floor(v * 3 / 4))); } }catch(e){}
}

export function initBoard(r,c){
  rows = r; cols = c;
  colors = genColors(colorCount);
  shapeCount = Math.max(1, Math.min(shapes.length, shapeCount));
  initCounters();
  let attempts = 0; const maxAttempts = 2000;
  do{
    board = Array.from({length:rows},()=>Array.from({length:cols},()=>randomPiece()));
    const res = findMatchesBoard(getState());
    if(res.toRemove.size===0) break;
    attempts++;
  }while(attempts < maxAttempts);
  if(attempts>=maxAttempts) console.warn('initBoard: max attempts reached while avoiding initial matches');
  setScore(0); setCombo(0); firstSelection = null;
  console.log('game_core.initBoard completed', { rows, cols, valueMin, valueMax });
}

export function cellKey(r,c){ return `${r},${c}` }

export function render(){
  const container = el('boardContainer'); if(!container) return;
  container.innerHTML = ''; container.style.display = 'block';
  for(let r=0;r<rows;r++){
    const rowDiv = document.createElement('div'); rowDiv.className = 'hexRow'; if(r%2===1) rowDiv.classList.add('odd');
    for(let c=0;c<cols;c++){
      const cell = document.createElement('div'); cell.className = 'cell'; cell.dataset.r = r; cell.dataset.c = c;
      const inner = document.createElement('div'); inner.className = 'cellInner';
      const piece = board[r][c];
      if(piece === null){ inner.style.background = 'transparent'; inner.innerHTML = ''; cell.classList.add('removed'); }
      else { const col = colors[piece.color] || '#999'; const s = shapes[piece.shape % shapes.length]; if(s && s.path === 'CIRCLE'){ inner.innerHTML = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="36" fill="${col}"/></svg>`; } else if(s){ inner.innerHTML = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="${s.path}" fill="${col}"/></svg>`; } const valueEl = document.createElement('div'); valueEl.className = 'valueLabel'; valueEl.textContent = (typeof piece.value === 'number') ? String(piece.value) : ''; inner.appendChild(valueEl); }
      if(firstSelection && firstSelection.r==r && firstSelection.c==c) cell.classList.add('selected');
      const coords = document.createElement('div'); coords.className = 'coords'; coords.textContent = `${r},${c}`;
      cell.appendChild(inner); cell.appendChild(coords);
      if(typeof registerCellInput === 'function') registerCellInput(cell, r, c);
      rowDiv.appendChild(cell);
    }
    container.appendChild(rowDiv);
  }
}

export async function onCellClick(r,c){
  if(processing) return; if(!firstSelection){ firstSelection = {r,c}; render(); return; }
  const a = {...firstSelection}; const b = {r,c}; firstSelection = null; render(); await doSwap(a,b);
}

export function capturePositions(){ return capturePositionsBoard(getState()); }
export function getCellEl(r,c){ return getCellElBoard(r,c); }
export function animateMoves(oldMap){ return animateMovesModule(getState(), oldMap); }
export function applyGravity(){ return applyGravityBoard(getState()); }
export function fillBoard(){ return fillBoardBoard(getState()); }

export function updateStatus(){
  updateUI();
  const nt = el('nextThreshold'); if(nt) nt.textContent = String(nextThresholdValue(selectionCount));
  const cb = el('comboBank'); if(cb) cb.textContent = String(getComboBank());
  const mv = el('movesLeft'); if(mv){ if(mode256combo){ mv.textContent = String(movesTaken); } else { mv.textContent = (movesLimit===null) ? '∞' : String(movesLeft); } }
  try{ checkThreshold(); }catch(e){}
}

export function updateDisplays(){
  const sd = el('sizeDisplay'); if(sd) sd.textContent = `${rows}x${cols}`;
  const cd = el('colorDisplay'); if(cd) cd.textContent = String(colorCount);
  const sd2 = el('shapeDisplay'); if(sd2) sd2.textContent = String(shapeCount);
  try{ renderEffectsPanelUI(getState); }catch(e){}
  try{ const content = el('thresholdsContent'); if(content){ let html = ''; html += '<div class="thresholdsColors"><strong>色ごとの必要値</strong><ul>'; for(let i=0;i<colorCount;i++){ const val = requiredByColor[i] || 0; const sw = (colors && colors[i]) ? `<span class="swatch" style="background:${colors[i]}"></span>` : ''; const name = (typeof getColorName === 'function') ? getColorName(i) : `色${i}`; html += `<li>${sw} ${name}: ${val}</li>`; } html += '</ul></div>'; html += '<div class="thresholdsShapes"><strong>形ごとの必要値</strong><ul>'; for(let j=0;j<shapeCount;j++){ const val = requiredByShape[j] || 0; const sname = (typeof getShapeLabel === 'function') ? getShapeLabel(j) : `形${j}`; html += `<li>${sname}: ${val}</li>`; } html += '</ul></div>'; content.innerHTML = html; } }catch(e){}
}

export async function doSwap(a,b){
  if(movesLimit !== null){ if(movesLeft === null || movesLeft <= 0){ uiLog('手数が尽きました'); return; } movesLeft = Math.max(0, movesLeft - 1); updateStatus(); try{ if(!movesLocked){ const sel = el('moveLimitSelect'); if(sel && Number(sel.value) >= 0){ sel.disabled = true; movesLocked = true; uiLog('手数が固定されました'); } } }catch(e){} }
  processing = true; if(mode256combo){ movesTaken = (typeof movesTaken === 'number' ? movesTaken : 0) + 1; updateStatus(); }
  const oldMap = capturePositions(); swapCells(a,b); render(); await animateMoves(oldMap); await sleep(80);
  let res = findMatchesBoard(getState()); if(res.toRemove.size===0){ const oldMap2 = capturePositions(); swapCells(a,b); render(); await animateMoves(oldMap2); processing = false; return; }
  let localCombo = 0;
  while(true){ res = findMatchesBoard(getState()); if(res.toRemove.size===0) break; localCombo += 1; try{ playSound('combo'); }catch(e){} try{ setCombo(localCombo); }catch(e){} updateStatus(); uiLog(`マッチ発見 — マッチしたマス: ${JSON.stringify(Array.from(res.toRemove))}`);
    for(const k of res.toRemove){ const [rr,cc] = k.split(',').map(Number); const elCell = getCellEl(rr,cc); if(elCell){ const inner = elCell.querySelector('.cellInner'); if(inner){ const piece = board[rr] && board[rr][cc]; const colorMatched = piece && res.matchedColors && res.matchedColors.has(piece.color); const shapeMatched = piece && res.matchedShapes && res.matchedShapes.has(piece.shape); inner.classList.add('matched'); if(colorMatched){ const ring = document.createElement('div'); ring.className = 'matchRing matchRing-color'; const col = colors[piece.color] || '#000'; ring.style.borderColor = col; ring.style.borderStyle = 'solid'; ring.style.borderWidth = '5px'; ring.style.opacity = '1'; elCell.appendChild(ring); inner.classList.add('matched-color'); } if(shapeMatched){ const ring2 = document.createElement('div'); ring2.className = 'matchRing matchRing-shape'; ring2.style.borderColor = 'rgba(0,0,0,0.6)'; ring2.style.borderStyle = 'dashed'; elCell.appendChild(ring2); inner.classList.add('matched-shape'); } } } }
    await sleep(200);
    for(const k of res.toRemove){ const [rr,cc] = k.split(',').map(Number); const elCell = getCellEl(rr,cc); if(elCell){ const inner = elCell.querySelector('.cellInner'); if(inner) inner.classList.add('removing'); } }
    await sleep(200);
    const removedList = removeMatchesBoard(getState(), res.toRemove);
    const removedValueSum = Array.isArray(removedList) ? removedList.reduce((s,it)=> s + ((it.piece && typeof it.piece.value === 'number') ? it.piece.value : 1), 0) : 0;
    let bonusPoints = 0; for(const ef of activeEffectsGlobal){ if(ef.kind === 'combo_bonus' && ef.active){ const mult = ef.multiplier || 0.5; bonusPoints += Math.floor(removedValueSum * mult); } }
    addScore(removedValueSum + bonusPoints); if(bonusPoints>0) uiLog(`コンボボーナス加算: +${bonusPoints}`); updateStatus();
    try{ const acted = await effects_checkProgress(getState, { uiLog, renderEffectsPanel: renderEffectsPanelUI, updateStatus, render, isProcessing: ()=>processing }); if(acted){ await sleep(60); continue; } }catch(e){ console.error('effects_checkProgress during chain error', e); }
    const beforeFall = capturePositions(); applyGravityBoard(getState()); try{ playSound('down'); }catch(e){} fillBoardBoard(getState()); render(); await animateMoves(beforeFall); await sleep(80);
  }
  if(localCombo>0){ addComboBank(localCombo); uiLog(`連鎖終了: ${localCombo} をコンボ累積に加算（合計 ${getComboBank()}）`); try{ if(mode256combo && getComboBank() >= comboTarget256){ const ov = el('endOverlay'); if(ov) ov.style.display = 'flex'; try{ const esc = el('endScore'); if(esc) esc.textContent = `Score: ${String(getScore())}`; }catch(e){} try{ const rt = el('endRemovedTotal'); if(rt) rt.textContent = String(getState().removedTotal || 0); }catch(e){} try{ const cb = el('endComboBank'); if(cb) cb.textContent = String(getComboBank() || 0); }catch(e){} try{ const ml = el('endMovesLeft'); if(ml) ml.textContent = String(movesTaken); }catch(e){} try{ playSound('result'); }catch(e){} processing = false; } }catch(e){} }
  try{ setCombo(0); }catch(e){} updateStatus(); effects_checkProgress(getState, { uiLog, renderEffectsPanel: renderEffectsPanelUI, updateStatus, render, isProcessing: ()=>processing }); processing = false;
}

export function swapCells(a,b){ return swapCellsBoard(getState(), a, b); }
export function findMatches(bd){ return findMatchesBoard(getState()); }
export function removeMatches(setKeys){ const removedList = removeMatchesBoard(getState(), setKeys); effects_checkProgress(getState, { uiLog, renderEffectsPanel: renderEffectsPanelUI, updateStatus, render, isProcessing: ()=>processing }); return Array.isArray(removedList) ? removedList.length : 0; }

export function checkThreshold(){ if(awaitingChoice) return; const thresh = nextThresholdValue(selectionCount); if(getScore() >= thresh){ awaitingChoice = true; processing = false; uiLog(`報酬選択: スコア ${getScore()} が閾値 ${thresh} を超えました。効果候補を表示します。`); const opts = generateEffectOptions(thresh, selectionCount, colorCount, shapeCount); showEffectChoicePanel(opts, thresh); } updateDisplays(); }

export function initCore(){
  // Ensure DOM is ready before touching DOM elements
  if(document.readyState === 'loading'){
    // delay initialization until DOMContentLoaded
    document.addEventListener('DOMContentLoaded', ()=> initCore());
    return;
  }
  console.log('game_core.initCore() called, document.readyState=', document.readyState);
  if(initCore._initialized) {
    console.log('game_core.initCore() already initialized; skipping');
    return;
  }
  initCore._initialized = true;

  // wiring that doesn't depend on move select/mode
  const resetBtn = el('resetBtn'); if(resetBtn) resetBtn.addEventListener('click', ()=>{ initBoard(rows, cols); });
  const dumpBtn = el('dumpBtn'); if(dumpBtn) dumpBtn.addEventListener('click', ()=>{ uiLog('盤面をコンソールに出力しました'); console.log('board dump', JSON.parse(JSON.stringify(board))); alert('盤面をコンソールに出力しました'); });
  // choice panel buttons
  const btnSize = el('choiceIncreaseSize'); const btnColor = el('choiceDecreaseColor'); const btnShape = el('choiceDecreaseShape');
  if(btnSize) btnSize.addEventListener('click', ()=>{ if(!processing) applyIncreaseSize(); else { uiLog('処理中のため選択できません'); } });
  if(btnColor) btnColor.addEventListener('click', ()=>{ if(!processing) applyDecreaseColor(); else { uiLog('処理中のため選択できません'); } });
  if(btnShape) btnShape.addEventListener('click', ()=>{ if(!processing) applyDecreaseShape(); else { uiLog('処理中のため選択できません'); } });
  window.addEventListener('effectChosen', (e)=>{ const opt = e && e.detail && e.detail.opt; if(!opt) return; try{ addEffectWithBaseline(opt, getState); }catch(err){ try{ addEffect(opt); }catch(e){} } selectionCount += 1; awaitingChoice = false; uiLog(`効果を取得: ${opt.title}`); updateDisplays(); });
  try{ registerCellInput = createPointerHandlers({ getCellEl, doSwap, onCellClick, isProcessing: ()=> (processing || (movesLimit !== null && movesLeft !== null && movesLeft <= 0)) }); }catch(e){ console.warn('createPointerHandlers failed', e); }
  updateDisplays(); try{ initAudio(); }catch(e){}
  initBoard(rows, cols);
  try{ render(); }catch(e){}
  try{ updateDisplays(); }catch(e){}
  try{ updateStatus(); }catch(e){}
  const restartBtn = el('restartBtn'); if(restartBtn) restartBtn.addEventListener('click', ()=>{ restartGame(); });
}

export function restartGame(){ if(movesLimit !== null) movesLeft = movesLimit; else movesLeft = null; try{ const sel = el('moveLimitSelect'); if(sel){ sel.disabled = false; movesLocked = false; } }catch(e){} setScore(0); setCombo(0); try{ movesTaken = 0; }catch(e){} try{ resetComboBank(); }catch(e){} try{ hideChoicePanel(); }catch(e){} try{ awaitingChoice = false; }catch(e){} try{ selectionCount = 5; }catch(e){} try{ if(typeof hideEffectChoicePanel === 'function') hideEffectChoicePanel(); }catch(e){} try{ if(Array.isArray(activeEffectsGlobal)) activeEffectsGlobal.length = 0; }catch(e){} initBoard(rows, cols); try{ updateDisplays(); render(); }catch(e){} try{ updateStatus(); }catch(e){} try{ renderEffectsPanelUI(getState); }catch(e){} const ov = el('endOverlay'); if(ov) ov.style.display = 'none'; }

export function enable256Mode(){ try{ mode256combo = true; movesTaken = 0; uiLog('256comboモードを有効化しました'); updateStatus(); }catch(e){} }
export function disable256Mode(){ try{ mode256combo = false; movesTaken = 0; uiLog('256comboモードを無効化しました'); updateStatus(); }catch(e){} }
export function getModeState(){ return { mode256combo, movesTaken, comboTarget256 }; }
