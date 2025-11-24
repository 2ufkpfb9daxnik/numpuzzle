import { getShapeLabel } from './shapes.js';
import { el } from './utils.js';
import { playSound } from './audio.js';

// board utilities that operate on a passed state object
export function swapCells(state, a, b){
  const tmp = state.board[a.r][a.c];
  state.board[a.r][a.c] = state.board[b.r][b.c];
  state.board[b.r][b.c] = tmp;
}

export function findMatches(state){
  const rows = state.rows, cols = state.cols, colorCount = state.colorCount, shapeCount = state.shapeCount, bd = state.board;
  const toRemove = new Set();
  const matchedColors = new Set();
  const matchedShapes = new Set();
  // Helper: get hex neighbors (odd-r offset / flat-top layout)
  function getHexNeighbors(r,c){
    const even = (r % 2) === 0;
    if(even){
      return [[r, c-1],[r, c+1],[r-1, c],[r-1, c-1],[r+1, c],[r+1, c-1]];
    } else {
      return [[r, c-1],[r, c+1],[r-1, c+1],[r-1, c],[r+1, c+1],[r+1, c]];
    }
  }

  // Helper: explore connected component on hex adjacency
  function exploreComponent(startR, startC, predicate){
    const stack = [[startR,startC]];
    const comp = [];
    const seen = Array.from({length:rows},()=>Array.from({length:cols},()=>false));
    seen[startR][startC] = true;
    while(stack.length){
      const [cr,cc] = stack.pop();
      comp.push([cr,cc]);
      const nb = getHexNeighbors(cr,cc);
      for(const [nr,nc] of nb){
        if(nr<0||nr>=rows||nc<0||nc>=cols) continue;
        if(seen[nr][nc]) continue;
        const p = bd[nr][nc];
        if(p && predicate(p, nr, nc)){
          seen[nr][nc] = true;
          stack.push([nr,nc]);
        }
      }
    }
    return comp;
  }

  // color-based connected components (hex 6-dir). Sum 'value' in each component and compare to threshold.
  for(let colorIdx=0;colorIdx<colorCount;colorIdx++){
    const visited = Array.from({length:rows},()=>Array.from({length:cols},()=>false));
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        if(visited[r][c]) continue;
        const p = bd[r][c];
        if(!p || p.color !== colorIdx) continue;
        // BFS/DFS to collect component
        const comp = [];
        const stack = [[r,c]];
        visited[r][c] = true;
        while(stack.length){
          const [cr,cc] = stack.pop();
          comp.push([cr,cc]);
          const nb = getHexNeighbors(cr,cc);
          for(const [nr,nc] of nb){
            if(nr<0||nr>=rows||nc<0||nc>=cols) continue;
            if(visited[nr][nc]) continue;
            const np = bd[nr][nc];
            if(np && np.color === colorIdx){ visited[nr][nc] = true; stack.push([nr,nc]); }
          }
        }
        // sum values
        let sum = 0;
        for(const [cr,cc] of comp){ const pp = bd[cr][cc]; if(pp && typeof pp.value === 'number') sum += pp.value; }
        const required = (state.requiredByColor && state.requiredByColor[colorIdx]) || 0;
        if(required>0 && sum >= required){
          for(const [cr,cc] of comp) toRemove.add(`${cr},${cc}`);
          matchedColors.add(colorIdx);
        }
      }
    }
  }

  // shape-based connected components (hex 6-dir)
  for(let shapeIdx=0;shapeIdx<shapeCount;shapeIdx++){
    const visited = Array.from({length:rows},()=>Array.from({length:cols},()=>false));
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        if(visited[r][c]) continue;
        const p = bd[r][c];
        if(!p || p.shape !== shapeIdx) continue;
        const comp = [];
        const stack = [[r,c]];
        visited[r][c] = true;
        while(stack.length){
          const [cr,cc] = stack.pop();
          comp.push([cr,cc]);
          const nb = getHexNeighbors(cr,cc);
          for(const [nr,nc] of nb){
            if(nr<0||nr>=rows||nc<0||nc>=cols) continue;
            if(visited[nr][nc]) continue;
            const np = bd[nr][nc];
            if(np && np.shape === shapeIdx){ visited[nr][nc] = true; stack.push([nr,nc]); }
          }
        }
        let sum = 0;
        for(const [cr,cc] of comp){ const pp = bd[cr][cc]; if(pp && typeof pp.value === 'number') sum += pp.value; }
        const required = (state.requiredByShape && state.requiredByShape[shapeIdx]) || 0;
        if(required>0 && sum >= required){
          for(const [cr,cc] of comp) toRemove.add(`${cr},${cc}`);
          matchedShapes.add(shapeIdx);
        }
      }
    }
  }

  return { toRemove, matchedColors, matchedShapes };
}

export function removeMatches(state, setKeys){
  const removedList = [];
  for(const k of setKeys){
    const [r,c] = k.split(',').map(Number);
    if(state.board[r][c] !== null){
      const piece = state.board[r][c];
      if(piece){
        const val = (typeof piece.value === 'number') ? piece.value : 1;
        if(typeof piece.color === 'number') state.removedByColor[piece.color] = (state.removedByColor[piece.color] || 0) + val;
        if(typeof piece.shape === 'number') state.removedByShape[piece.shape] = (state.removedByShape[piece.shape] || 0) + val;
        state.removedTotal = (state.removedTotal || 0) + val;
        try{ playSound('rm'); }catch(e){}
      }
      state.board[r][c] = null;
      removedList.push({r,c, piece});
    }
  }
  return removedList;
}

export function applyGravity(state){
  for(let c=0;c<state.cols;c++){
    let write = state.rows-1;
    for(let r=state.rows-1;r>=0;r--){
      if(state.board[r][c] !== null){ state.board[write][c] = state.board[r][c]; if(write!==r) state.board[r][c] = null; write--; }
    }
  }
}

export function fillBoard(state){
  for(let r=0;r<state.rows;r++){
    for(let c=0;c<state.cols;c++){
      if(state.board[r][c] === null){
        const valMin = (typeof state.valueMin === 'number') ? state.valueMin : 5;
        const valMax = (typeof state.valueMax === 'number') ? state.valueMax : 30;
        const v = Math.floor(Math.random()*(valMax - valMin + 1)) + valMin;
        state.board[r][c] = { color: Math.floor(Math.random()*state.colorCount), shape: Math.floor(Math.random()*state.shapeCount), value: v };
      }
    }
  }
}

export function cellKey(r,c){ return `${r},${c}`; }

export function capturePositions(state){
  const containerRect = el('boardContainer').getBoundingClientRect();
  const map = new Map();
  for(let r=0;r<state.rows;r++){
    for(let c=0;c<state.cols;c++){
      const key = `${r},${c}`;
      const cellEl = document.querySelector(`#boardContainer .cell[data-r='${r}'][data-c='${c}']`);
      if(!cellEl) continue;
      const inner = cellEl.querySelector('.cellInner'); if(!inner) continue;
      const rect = inner.getBoundingClientRect();
      map.set(key, {left: rect.left - containerRect.left, top: rect.top - containerRect.top});
    }
  }
  return map;
}

export function getCellEl(r,c){ return document.querySelector(`#boardContainer .cell[data-r='${r}'][data-c='${c}']`); }
