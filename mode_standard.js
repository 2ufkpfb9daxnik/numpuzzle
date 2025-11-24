// Standard mode wrapper — initialize core directly.
import { initCore } from './game_core.js';

if(document.readyState === 'loading'){
	document.addEventListener('DOMContentLoaded', ()=>{ try{ initCore(); }catch(e){ console.error('initCore failed in standard mode', e); } });
} else {
	try{ initCore(); }catch(e){ console.error('initCore failed in standard mode', e); }
}

export default function initStandard(){ return; }
