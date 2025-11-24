// Entry shim: dynamically load the selected mode module which in turn loads the core game.
document.addEventListener('DOMContentLoaded', async ()=>{
	try{
		const sel = document.getElementById('moveLimitSelect');
		const loadMode = async (val)=>{
			try{
				if(String(val) === '256combo'){
					await import('./mode_256combo.js');
				} else {
					await import('./mode_standard.js');
				}
			}catch(e){ console.error('mode import failed', e); }
		};
		const initial = sel ? sel.value : null;
		await loadMode(initial);
		// when user changes selection, dynamically load the selected mode module
		if(sel){ sel.addEventListener('change', async (e)=>{ await loadMode(e.target.value); }); }
	}catch(e){ console.error('script entry failed', e); }
});
