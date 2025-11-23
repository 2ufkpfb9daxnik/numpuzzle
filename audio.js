// Simple audio helper. Place sound files under ./sounds/ with given filenames.
const soundMap = {
  'bgm': './437_long_BPM120.mp3',
  'box': './box.mp3',
  'col': './col.mp3',
  'combo': './combo.mp3',
  'down': './down.mp3',
  'eff': './eff.mp3',
  'effrm': './effrm.mp3',
  'result': './result.mp3',
  'rm': './rm.mp3',
  'row': './row.mp3',
  'select': './select.mp3',
  'catch': './catch.mp3'
};

let bgmAudio = null;

export function initAudio(){
  // Preload short sounds by creating audio elements (not played yet)
  try{
    for(const k of Object.keys(soundMap)){
      const a = new Audio(soundMap[k]);
      a.preload = 'auto';
      // keep reference to bgm base for possible use
      if(k === 'bgm') bgmAudio = a;
    }
  }catch(e){ console.warn('initAudio failed', e); }
}

export function playSound(name, opts){
  try{
    const src = soundMap[name];
    if(!src) return;
    // For bgm use dedicated method
    if(name === 'bgm'){
      playBgm();
      return;
    }
    // create a fresh audio element so multiple sounds can overlap
    const a = new Audio(src);
    if(opts && opts.loop) a.loop = true;
    a.preload = 'auto';
    // try to play; ignore promise rejections
    const p = a.play();
    if(p && p.catch) p.catch(()=>{});
    return a;
  }catch(e){ console.warn('playSound error', e); }
}

export function playBgm(){
  try{
    if(!bgmAudio){ bgmAudio = new Audio(soundMap['bgm']); bgmAudio.preload = 'auto'; }
    bgmAudio.loop = true;
    const prom = bgmAudio.play();
    if(prom && prom.catch) prom.catch((err)=>{ console.warn('BGM play rejected', err); });
    return prom;
  }catch(e){ console.warn('playBgm err', e); return Promise.reject(e); }
}

export function stopBgm(){ if(bgmAudio){ try{ bgmAudio.pause(); bgmAudio.currentTime = 0; }catch(e){} } }
