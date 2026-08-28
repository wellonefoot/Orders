(function(){
  'use strict';
  if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=92',{updateViaCache:'none'}).then(async r=>{
      await r.update().catch(()=>{});
      if(r.waiting)r.waiting.postMessage?.({type:'SKIP_WAITING'});
    }).catch(()=>{}),{once:true});
  }
})();
