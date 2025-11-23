// 重ね合わせパズル（色 + 形）
// 要点: boardは rows x cols の配列。各セルは {color: idx, shape: idx}

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

// piece value range (default). Updated per user request to 1..50
let valueMin = 1, valueMax = 50;

function randomPiece(){
  const v = Math.floor(Math.random()*(valueMax - valueMin + 1)) + valueMin;
  return { color: Math.floor(Math.random()*colorCount), shape: Math.floor(Math.random()*shapeCount), value: v };
}

let combo = 0;
// comboBank is now managed in score.js
let processing = false;
let dragState = {active:false, start:null, clone:null, origInner:null};
let selectionCount = 5; // 何回目の選択か（初期は5 -> 3^5=243 の閾値）
let awaitingChoice = false;
// input.js will provide a register function for cell elements
let registerCellInput = null;
// move limit: null means unlimited. movesLeft is number or null for unlimited
let movesLimit = null; // e.g., 10,30,50 or null
let movesLeft = null; // current remaining moves
let movesLocked = false; // once a finite limit is used and a move occurs, lock the selector
// mobile mode flag: when true, use smaller board and scale thresholds
let mobileMode = false;
// effect system
// effects are managed in `effects.js`
let removedByColor = [];
let removedByShape = [];
let removedTotal = 0;
let requiredByColor = [];
let requiredByShape = [];

function getState(){
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
  // initialize per-color / per-shape required thresholds
  // Use the requested lower bound ~90 for initial required deletion values
  const minReq = 80;
  const maxReq = 99;
  requiredByColor = Array.from({length: colorCount}, ()=> Math.floor(Math.random()*(maxReq-minReq+1)) + minReq);
  requiredByShape = Array.from({length: shapeCount}, ()=> Math.floor(Math.random()*(maxReq-minReq+1)) + minReq);
  // if mobile mode, reduce thresholds to floor(3/4) to make game easier on smaller boards
  try{
    if(mobileMode){
      requiredByColor = requiredByColor.map(v => Math.max(1, Math.floor(v * 3 / 4)));
      requiredByShape = requiredByShape.map(v => Math.max(1, Math.floor(v * 3 / 4)));
    }
  }catch(e){}
}

function initBoard(r,c){
  rows = r; cols = c;
  colors = genColors(colorCount);
  // clamp shapeCount to available shapes
  shapeCount = Math.max(1, Math.min(shapes.length, shapeCount));
  // generate initial board with no matches
  let attempts = 0;
  const maxAttempts = 2000;
  do{
    board = Array.from({length:rows},()=>Array.from({length:cols},()=>randomPiece()));
    const res = findMatchesBoard(getState());
    if(res.toRemove.size===0) break;
    attempts++;
  }while(attempts < maxAttempts);
  if(attempts>=maxAttempts){ console.warn('initBoard: max attempts reached while avoiding initial matches'); }
  setScore(0); setCombo(0); firstSelection = null;
  console.log('initBoard', {rows,cols,colorCount,shapeCount});
  // initialize counters and thresholds before first render so UI shows them immediately
  initCounters();
  render(); updateDisplays();
}

function cellKey(r,c){return `${r},${c}`}

function render(){
  const container = el('boardContainer');
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  container.style.gap = '6px';

  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r; cell.dataset.c = c;

      const inner = document.createElement('div');
      inner.className = 'cellInner';
      const piece = board[r][c];
      if(piece === null){
        inner.style.background = 'transparent';
        inner.innerHTML = '';
        cell.classList.add('removed');
      } else {
        const col = colors[piece.color] || '#999';
        // render SVG shape
        const s = shapes[piece.shape % shapes.length];
        if(s && s.path === 'CIRCLE'){
          inner.innerHTML = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="36" fill="${col}"/></svg>`;
        } else if(s){
          inner.innerHTML = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="${s.path}" fill="${col}"/></svg>`;
        } else {
          inner.innerHTML = '';
        }
        // display piece numeric value
        const valueEl = document.createElement('div');
        valueEl.className = 'valueLabel';
        valueEl.textContent = (typeof piece.value === 'number') ? String(piece.value) : '';
        inner.appendChild(valueEl);
      }

      if(firstSelection && firstSelection.r==r && firstSelection.c==c){
        cell.classList.add('selected');
      }

      const coords = document.createElement('div');
      coords.className = 'coords';
      coords.textContent = `${r},${c}`;

      cell.appendChild(inner);
      cell.appendChild(coords);
      // register input handlers (click + pointerdown) via input module
      if(typeof registerCellInput === 'function') registerCellInput(cell, r, c);
      container.appendChild(cell);
    }
  }
  
}

async function onCellClick(r,c){
  if(processing) return;
  if(!firstSelection){
    firstSelection = {r,c};
    render();
    return;
  }

  const a = {...firstSelection};
  const b = {r,c};
  firstSelection = null;
  render();
  await doSwap(a,b);
}

// Capture current DOM positions of cellInner elements
function capturePositions(){ return capturePositionsBoard(getState()); }

function getCellEl(r,c){ return getCellElBoard(r,c); }

function animateMoves(oldMap){ return animateMovesModule(getState(), oldMap); }

function applyGravity(){ return applyGravityBoard(getState()); }
function fillBoard(){ return fillBoardBoard(getState()); }

function updateStatus(){
  // update score/combo UI
  updateUI();
  const nt = el('nextThreshold'); if(nt) nt.textContent = String(nextThresholdValue(selectionCount));
  const cb = el('comboBank'); if(cb) cb.textContent = String(getComboBank());
  // Display the currently selected move limit (not remaining moves)
  const mv = el('movesLeft'); if(mv) mv.textContent = (movesLimit===null) ? '∞' : String(movesLimit);
  // check if we've reached a score threshold for choice
  try{ checkThreshold(); }catch(e){}
}

function updateDisplays(){
  const sd = el('sizeDisplay'); if(sd) sd.textContent = `${rows}x${cols}`;
  const cd = el('colorDisplay'); if(cd) cd.textContent = String(colorCount);
  const sd2 = el('shapeDisplay'); if(sd2) sd2.textContent = String(shapeCount);
  // refresh effects panel
  try{ renderEffectsPanelUI(getState); }catch(e){}
  // update thresholds UI (left panel)
  try{
    const content = el('thresholdsContent');
    if(content){
      let html = '';
      html += '<div class="thresholdsColors"><strong>色ごとの必要値</strong><ul>';
      for(let i=0;i<colorCount;i++){
        const val = requiredByColor[i] || 0;
        const sw = (colors && colors[i]) ? `<span class="swatch" style="background:${colors[i]}"></span>` : '';
        const name = (typeof getColorName === 'function') ? getColorName(i) : `色${i}`;
        html += `<li>${sw} ${name}: ${val}</li>`;
      }
      html += '</ul></div>';
      html += '<div class="thresholdsShapes"><strong>形ごとの必要値</strong><ul>';
      for(let j=0;j<shapeCount;j++){
        const val = requiredByShape[j] || 0;
        const sname = (typeof getShapeLabel === 'function') ? getShapeLabel(j) : `形${j}`;
        html += `<li>${sname}: ${val}</li>`;
      }
      html += '</ul></div>';
      content.innerHTML = html;
    }
  }catch(e){}
}


async function doSwap(a,b){
  console.log('swap requested', a, b);
  // consume a move if we have a limit
  if(movesLimit !== null){
    if(movesLeft === null || movesLeft <= 0){ uiLog('手数が尽きました'); return; }
    movesLeft = Math.max(0, movesLeft - 1);
    updateStatus();
    // if finite limit and not yet locked, lock the move selector so user cannot change mid-game
    try{
      if(!movesLocked){
        const sel = el('moveLimitSelect');
        if(sel && Number(sel.value) >= 0){ sel.disabled = true; movesLocked = true; uiLog('手数が固定されました'); }
      }
    }catch(e){ console.warn('move lock error', e); }
  }
  processing = true;

  // animate swap visually by capturing positions, swapping data, rendering, then animating
  const oldMap = capturePositions();
  swapCells(a,b);
  render();
  console.log('swap', {a,b});
  await animateMoves(oldMap);

  await sleep(80);
  let res = findMatchesBoard(getState());
  console.log('matches after swap', res);
  if(res.toRemove.size===0){
    // revert with animation
    console.log('no matches — reverting');
    const oldMap2 = capturePositions();
    swapCells(a,b);
    render();
    await animateMoves(oldMap2);
    processing = false;
    return;
  }

  // proceed removal -> gravity -> refill -> loop with animations
  let localCombo = 0;
  while(true){
    res = findMatchesBoard(getState());
    if(res.toRemove.size===0) break;
    localCombo += 1;
    try{ playSound('combo'); }catch(e){}
    // update visible combo for this chain
    combo = localCombo;
    updateStatus();
    console.log('matches', Array.from(res.toRemove));
    // build Japanese message for UI log
    const cellsStr = JSON.stringify(Array.from(res.toRemove));
    const colorsArr = Array.from(res.matchedColors);
    const shapesArr = Array.from(res.matchedShapes);
    const shapesNames = shapesArr.map(i=>getShapeLabel(i));
    uiLog(`マッチ発見 — マッチしたマス: ${cellsStr} ／ 色インデックス: ${JSON.stringify(colorsArr)} ／ 形: ${JSON.stringify(shapesNames)}`);

    // animate removals
    for(const k of res.toRemove){
      const [rr,cc] = k.split(',').map(Number);
      const elCell = getCellEl(rr,cc);
      if(elCell){
        const inner = elCell.querySelector('.cellInner');
        if(inner){
          // determine whether this cell matched by color and/or shape
          const piece = board[rr] && board[rr][cc];
          const colorMatched = piece && res.matchedColors && res.matchedColors.has(piece.color);
          const shapeMatched = piece && res.matchedShapes && res.matchedShapes.has(piece.shape);
          inner.classList.add('matched');
          if(colorMatched){
            // create a visible outer ring element for color match (opaque)
            const ring = document.createElement('div');
            ring.className = 'matchRing matchRing-color';
            const col = colors[piece.color] || '#000';
            ring.style.borderColor = col; // opaque color
            ring.style.borderStyle = 'solid';
            ring.style.borderWidth = '5px';
            ring.style.opacity = '1';
            elCell.appendChild(ring);
            inner.classList.add('matched-color');
          }
          if(shapeMatched){
            const ring2 = document.createElement('div');
            ring2.className = 'matchRing matchRing-shape';
            ring2.style.borderColor = 'rgba(0,0,0,0.6)';
            ring2.style.borderStyle = 'dashed';
            elCell.appendChild(ring2);
            inner.classList.add('matched-shape');
          }
        }
      }
    }
    // show highlight briefly so user can see which matched
    await sleep(200);
    // then play removal animation
    for(const k of res.toRemove){
      const [rr,cc] = k.split(',').map(Number);
      const elCell = getCellEl(rr,cc);
      if(elCell){
        const inner = elCell.querySelector('.cellInner');
        if(inner) inner.classList.add('removing');
      }
    }
    await sleep(200);

    // removeMatchesBoard now returns an array of removed items ({r,c,piece})
    const removedList = removeMatchesBoard(getState(), res.toRemove);
    const removedCount = Array.isArray(removedList) ? removedList.length : 0;
    // sum the 'value' fields from removed pieces for scoring
    const removedValueSum = Array.isArray(removedList) ? removedList.reduce((s,it)=> s + ((it.piece && typeof it.piece.value === 'number') ? it.piece.value : 1), 0) : 0;
    // apply combo_bonus effects based on removed VALUE SUM (not piece count)
    let bonusPoints = 0;
    for(const ef of activeEffectsGlobal){
      if(ef.kind === 'combo_bonus' && ef.active){
        const mult = ef.multiplier || 0.5;
        bonusPoints += Math.floor(removedValueSum * mult);
      }
    }
    addScore(removedValueSum + bonusPoints);
    if(bonusPoints>0) uiLog(`コンボボーナス加算: +${bonusPoints}`);
    console.log('removedCells', removedCount, 'removedValueSum', removedValueSum, 'bonus', bonusPoints, 'score', getScore());
    updateStatus();

    // Immediately check effects progress — if an effect executes now, it may have removed
    // additional cells and already applied gravity/fill inside executeAction. In that case
    // we skip the normal gravity/fill step here and restart match detection.
    try{
      const acted = await effects_checkProgress(getState, { uiLog, renderEffectsPanel: renderEffectsPanelUI, updateStatus, render, isProcessing: ()=>processing });
      if(acted){
        // An effect made changes; continue the while loop to re-evaluate matches.
        await sleep(60);
        continue;
      }
    }catch(e){ console.error('effects_checkProgress during chain error', e); }

    // capture positions of pieces before fall
    const beforeFall = capturePositions();

    applyGravityBoard(getState());
    try{ playSound('down'); }catch(e){}
    console.log('gravity applied');
    fillBoardBoard(getState());
    console.log('filled new pieces');

    // render new board and animate movement from beforeFall
    render();
    await animateMoves(beforeFall);
    await sleep(80);
  }

  // chain finished: add local combo to comboBank and reset visible combo
  if(localCombo>0){
    addComboBank(localCombo);
    uiLog(`連鎖終了: ${localCombo} をコンボ累積に加算（合計 ${getComboBank()}）`);
  }
  combo = 0;
  console.log('localCombo', localCombo, 'comboBank', getComboBank());
  updateStatus();
  // check effects that depend on comboBank thresholds
  effects_checkProgress(getState, { uiLog, renderEffectsPanel: renderEffectsPanelUI, updateStatus, render, isProcessing: ()=>processing });
  console.log('newBoard', board);
  processing = false;
  // if we have a moves limit and it's now zero, show end overlay
  try{
    if(movesLimit !== null && movesLeft !== null && movesLeft <= 0){
      const ov = el('endOverlay'); if(ov) ov.style.display = 'flex';
      // when game ends, allow changing move limit again
      try{ const sel = el('moveLimitSelect'); if(sel){ sel.disabled = false; movesLocked = false; } }catch(e){}
      const esc = el('endScore'); if(esc) esc.textContent = `Score: ${String(getScore())}`;
      // populate breakdown
      try{
        const rt = el('endRemovedTotal'); if(rt) rt.textContent = String(getState().removedTotal || 0);
        const cb = el('endComboBank'); if(cb) cb.textContent = String(getComboBank() || 0);
        const ml = el('endMovesLeft'); if(ml) ml.textContent = String(movesLeft===null? '∞' : String(movesLeft));
      }catch(e){}
      try{ playSound('result'); }catch(e){}
    }
  }catch(e){}
}

function swapCells(a,b){
  return swapCellsBoard(getState(), a, b);
}

function findMatches(bd){
  return findMatchesBoard(getState());
}

function removeMatches(setKeys){
  const removedList = removeMatchesBoard(getState(), setKeys);
  // after removal, update effects progress
  effects_checkProgress(getState, { uiLog, renderEffectsPanel: renderEffectsPanelUI, updateStatus, render, isProcessing: ()=>processing });
  return Array.isArray(removedList) ? removedList.length : 0;
}


// note: nextThresholdValue is provided by score.js (call with selectionCount)

function checkThreshold(){
  if(awaitingChoice) return;
  const thresh = nextThresholdValue(selectionCount);
  if(getScore() >= thresh){
    // show choice panel (effect choices)
    awaitingChoice = true;
    processing = false; // ensure interactions disabled
    uiLog(`報酬選択: スコア ${getScore()} が閾値 ${thresh} を超えました。効果候補を表示します。`);
    // show new effect-choice UI (3 random options)
    const opts = generateEffectOptions(thresh, selectionCount, colorCount, shapeCount);
    showEffectChoicePanel(opts, thresh);
  }
  updateDisplays();
}

// Effects UI and logic moved to `effects.js` / `effectsUI.js`.
// Generation, selection and execution are handled by those modules; script coordinates them.

// Controls wiring
document.addEventListener('DOMContentLoaded', ()=>{
  const resetBtn = el('resetBtn');
  if(resetBtn) resetBtn.addEventListener('click', ()=>{
    // reset using current rows/colorCount/shapeCount
    initBoard(rows, cols);
  });
  el('dumpBtn').addEventListener('click', ()=>{
    uiLog('盤面をコンソールに出力しました');
    console.log('board dump', JSON.parse(JSON.stringify(board)));
    alert('盤面をコンソールに出力しました');
  });

  // move limit select wiring
  const moveSel = el('moveLimitSelect');
  if(moveSel){
    const setLimit = (val)=>{
      const prev = movesLimit;
      // if changing from unlimited to finite, confirm with user
      if(prev === null && Number(val) >= 0){
        const confirmed = window.confirm('無制限から有限手数に変更するとスコアとコンボがリセットされます。本当に変更しますか？');
        if(!confirmed){
          // revert select value to unlimited
          try{ const sel = el('moveLimitSelect'); if(sel) sel.value = '-1'; movesLimit = null; movesLeft = null; updateStatus(); }catch(e){}
          return;
        }
      }
      if(Number(val) < 0){ movesLimit = null; movesLeft = null; }
      else { movesLimit = Number(val); movesLeft = Number(val); }
      // if changing from unlimited to a finite limit mid-game, reset score/combo to keep balance
      try{
        if(prev === null && movesLimit !== null){
          setScore(0); setCombo(0); resetComboBank(); uiLog('無制限から有限手数に変更されたため、スコアとコンボをリセットしました');
        }
      }catch(e){ console.warn('move limit change handling error', e); }
      updateStatus();
    };
    moveSel.addEventListener('change', (e)=> setLimit(e.target.value));
    // initialize from select
    setLimit(moveSel.value);
  }

  // detect mobile layout (matches CSS media breakpoint) and adjust defaults
  try{
    if(typeof window !== 'undefined' && window.innerWidth && window.innerWidth <= 680){
      mobileMode = true;
      // set smaller board and counts
      rows = 6; cols = 6; colorCount = 6; shapeCount = 6;
      // scale piece value range for mobile
      try{ valueMax = Math.max(1, Math.floor(valueMax * 3 / 4)); valueMin = Math.max(1, Math.floor(valueMin * 3 / 4)); }catch(e){}
    }
  }catch(e){}

  // choice panel buttons
  const btnSize = el('choiceIncreaseSize');
  const btnColor = el('choiceDecreaseColor');
  const btnShape = el('choiceDecreaseShape');
  if(btnSize) btnSize.addEventListener('click', ()=>{ if(!processing) applyIncreaseSize(); else { uiLog('処理中のため選択できません'); } });
  if(btnColor) btnColor.addEventListener('click', ()=>{ if(!processing) applyDecreaseColor(); else { uiLog('処理中のため選択できません'); } });
  if(btnShape) btnShape.addEventListener('click', ()=>{ if(!processing) applyDecreaseShape(); else { uiLog('処理中のため選択できません'); } });

  // listen for effect chosen events from effectsUI
  window.addEventListener('effectChosen', (e)=>{
    const opt = e && e.detail && e.detail.opt;
    if(!opt) return;
    // register effect with baseline so progress counts from zero after selection
    try{ addEffectWithBaseline(opt, getState); }catch(err){ try{ addEffect(opt); }catch(e){} }
    selectionCount += 1;
    awaitingChoice = false;
    uiLog(`効果を取得: ${opt.title}`);
    updateDisplays();
  });

  // initial
  // initialize input handlers from input.js so render() can register per-cell listeners
  try{
    registerCellInput = createPointerHandlers({ getCellEl, doSwap, onCellClick, isProcessing: ()=> (processing || (movesLimit !== null && movesLeft !== null && movesLeft <= 0)) });
  }catch(e){ console.warn('createPointerHandlers failed', e); }

  updateDisplays();
  try{ initAudio(); }catch(e){}
  initBoard(rows, cols);
  // wire restart button on overlay
  const restartBtn = el('restartBtn'); if(restartBtn) restartBtn.addEventListener('click', ()=>{ restartGame(); });
});

function restartGame(){
  // reset moves
  if(movesLimit !== null) movesLeft = movesLimit; else movesLeft = null;
  // on restart allow the move selector to be changed until the first move
  try{ const sel = el('moveLimitSelect'); if(sel){ sel.disabled = false; movesLocked = false; } }catch(e){}
  // reset score/combo
  setScore(0); setCombo(0);
  try{ resetComboBank(); }catch(e){}
  try{ hideChoicePanel(); }catch(e){}
  // reset effect-related state so restart truly starts fresh
  try{ awaitingChoice = false; }catch(e){}
  try{ selectionCount = 5; }catch(e){}
  try{ if(typeof hideEffectChoicePanel === 'function') hideEffectChoicePanel(); }catch(e){}
  try{ if(Array.isArray(activeEffectsGlobal)) activeEffectsGlobal.length = 0; }catch(e){}
  // re-init board with current rows/cols
  initBoard(rows, cols);
  // refresh effects panel and displays
  try{ updateDisplays(); render(); }catch(e){}
  try{ updateStatus(); }catch(e){}
  try{ renderEffectsPanelUI(getState); }catch(e){}
  // hide overlay
  const ov = el('endOverlay'); if(ov) ov.style.display = 'none';
}
