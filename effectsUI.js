import { el, getColorName } from './utils.js';
import { playSound } from './audio.js';
import { getShapeLabel } from './shapes.js';
import { activeEffects, generateEffectOptions } from './effects.js';
import { getScore, getComboBank } from './score.js';

export function renderEffectsPanel(getState){
  const list = el('effectsList');
  if(!list) return;
  list.innerHTML = '';
  activeEffects.forEach((ef, idx)=>{
    const item = document.createElement('div'); item.className = 'effectsItem';
    const label = document.createElement('div'); label.className = 'effectsLabel';
    label.textContent = `${idx+1}. ${ef.title}`;
    const prog = document.createElement('div'); prog.className = 'effectsProgress';
    let progText = '';
    const state = getState ? getState() : { removedByColor:[], removedByShape:[], removedTotal:0 };
    if(ef.trigger){
      const tr = ef.trigger;
        if(tr.kind === 'remove_target'){
        const tk = tr.kindTarget; const tid = tr.type;
        let cur = 0;
        if(tk==='color'){
          const base = (ef._base && ef._base.removedByColor && (ef._base.removedByColor[tid]||0)) || 0;
          cur = ((state.removedByColor && state.removedByColor[tid])||0) - base;
        } else {
          const base = (ef._base && ef._base.removedByShape && (ef._base.removedByShape[tid]||0)) || 0;
          cur = ((state.removedByShape && state.removedByShape[tid])||0) - base;
        }
        progText = `進捗（値の合計）: ${Math.max(0,cur)}/${tr.count} を達成で発動`;
      } else if(tr.kind === 'remove_total'){
        const base = (ef._base && ef._base.removedTotal) || 0;
        const cur = (state.removedTotal || 0) - base;
        progText = `進捗（全削除値合計）: ${Math.max(0,cur)}/${tr.count} を達成で発動`;
      } else if(tr.kind === 'combo_accum'){
        const base = (ef._base && ef._base.comboBank) || 0;
        const curC = Math.max(0, (getComboBank ? getComboBank() : 0) - base);
        const need = tr.count || 0;
        progText = `進捗（コンボ蓄積）: ${curC}/${need} を達成で発動`;
      } else {
        progText = `トリガー: ${JSON.stringify(tr)}`;
      }
    } else {
      progText = 'トリガー情報なし';
    }
    prog.textContent = progText;
    const actionSummary = document.createElement('div'); actionSummary.className = 'effectsProgress';
    if(ef.action){
      const ac = ef.action;
      if(ac.kind === 'remove_target'){
        const tk = ac.targetKind; const tid = ac.targetType; const cnt = ac.count;
        const targetLabel = tk==='color' ? getColorName(tid) : `形:${getShapeLabel(tid)}`;
        actionSummary.textContent = `発動内容: ${targetLabel} を ${cnt} 個削除`;
      } else if(ac.kind === 'remove_line'){
        const lines = ac.count || 1;
        actionSummary.textContent = `発動内容: 行または斜め方向（2方向）を ${lines} 本消去`;
      } else if(ac.kind === 'remove_rect'){
        actionSummary.textContent = `発動内容: ${ac.h}x${ac.w} の矩形を削除`;
      } else {
        actionSummary.textContent = `発動内容: ${JSON.stringify(ac)}`;
      }
    }
    item.appendChild(label); item.appendChild(prog); if(actionSummary) item.appendChild(actionSummary);
    list.appendChild(item);
  });
}

export function showEffectChoicePanel(options, thresh){
  const panel = el('effectChoicePanel'); if(!panel) return;
  el('effectChoiceMsg').textContent = `スコア ${getScore()} が閾値 ${thresh} を超えました。効果を1つ選択してください。`;
  options.forEach((opt, idx)=>{
    const t = el(`effectTitle${idx}`);
    const d = el(`effectDesc${idx}`);
    if(t) t.textContent = opt.title;
    if(d){
      let desc = '';
      if(opt.trigger){
        const tr = opt.trigger;
        if(tr.kind==='remove_target') desc += `（条件）${tr.kindTarget === 'color' ? getColorName(tr.type) : '形:'+getShapeLabel(tr.type)} の値を合計 ${tr.count} 消すと → `;
        else if(tr.kind==='remove_total') desc += `（条件）全削除値合計 ${tr.count} を達成すると → `;
        else if(tr.kind==='combo_accum') desc += `（条件）コンボ蓄積 ${tr.count} 以上で → `;
      }
      if(opt.action){
        const ac = opt.action;
        if(ac.kind==='remove_target') desc += ` ${ac.targetKind==='color' ? getColorName(ac.targetType) : '形:'+getShapeLabel(ac.targetType)} を ${ac.count} 個削除`;
        else if(ac.kind==='remove_rect') desc += ` ${ac.h}x${ac.w} の矩形を削除`;
        else if(ac.kind==='remove_line') desc += ` 行または斜め方向（2方向）を ${ac.count || 1} 本消去`;
        else if(ac.kind==='combo_bonus') desc += ` コンボボーナス x${opt.multiplier}`;
      }
      d.textContent = desc;
    }
    panel.dataset[`opt${idx}`] = JSON.stringify(opt);
  });
  panel.style.display = 'flex';
  for(let i=0;i<3;i++){
    const btn = el(`chooseEffect${i}`);
    if(btn) btn.onclick = ()=>{ 
      const raw = panel.dataset[`opt${i}`]; if(!raw) return; const opt = JSON.parse(raw); panel.style.display='none';
      try{ 
        try{ playSound('select'); }catch(e){}
        if(typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new CustomEvent('effectChosen', { detail: { opt } })); 
      }catch(e){}
    };
  }
}

export function hideEffectChoicePanel(){ const panel = el('effectChoicePanel'); if(panel) panel.style.display='none'; }

export function showChoicePanel(thresh){
  const panel = el('choicePanel'); const msg = el('choiceMsg'); if(!panel) return; msg.textContent = `スコア ${getScore()} が閾値 ${thresh} を超えました。下から1つ選んでください。`; panel.style.display='flex';
}

export function hideChoicePanel(){ const p = el('choicePanel'); if(p) p.style.display='none'; }
