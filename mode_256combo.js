// 256combo mode wrapper — enables 256combo mode in the core game when DOM is ready
import { initCore, enable256Mode } from './game_core.js';

function init(){
  try{
    // Initialize core first (if not already)
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', ()=>{ try{ initCore(); enable256Mode(); }catch(e){ console.warn('mode_256combo init error', e); } });
    } else { try{ initCore(); enable256Mode(); }catch(e){ console.warn('mode_256combo init error', e); } }
    // Also ensure the select shows the correct value
    try{ const sel = document.getElementById('moveLimitSelect'); if(sel) sel.value = '256combo'; }catch(e){}
  }catch(e){ console.warn('mode_256combo init error', e); }
}

init();

export default init;
