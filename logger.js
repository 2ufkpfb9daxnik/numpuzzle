export function uiLog(msg){
  try{
    const out = document.getElementById('logOutput');
    const t = new Date().toLocaleTimeString();
    if(out){ out.textContent = `${t} ${msg}\n` + out.textContent; }
  }catch(e){}
  console.log(msg);
}

export function debugLog(...args){ console.debug(...args); }
export function errorLog(...args){ console.error(...args); }
