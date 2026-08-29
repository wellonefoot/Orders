'use strict';
const CACHE_VERSION='wellone-orders-v97-barcode-variant-details';
const SHELL_CACHE=`${CACHE_VERSION}-shell`;
const RUNTIME_CACHE=`${CACHE_VERSION}-runtime`;
const SHELL_ASSETS=[
  './','./index.html','./css/orders.css?v=97','./js/admin-config.js?v=97','./js/orders-receiving.js?v=97','./js/pwa-install.js?v=97',
  './manifest.webmanifest','./assets/logo.png','./assets/favicon/favicon.ico'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(SHELL_CACHE).then(cache=>Promise.allSettled(SHELL_ASSETS.map(x=>cache.add(x)))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('wellone-orders-')&&k!==SHELL_CACHE&&k!==RUNTIME_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
function isSupabaseRequest(request){try{return new URL(request.url).hostname.endsWith('.supabase.co');}catch(_e){return false;}}
async function networkFirst(request,fallback){
  const cache=await caches.open(RUNTIME_CACHE);
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response&&response.ok)cache.put(request,response.clone()).catch(()=>{});
    return response;
  }catch(error){
    const hit=await cache.match(request);
    if(hit)return hit;
    if(fallback){const fb=await caches.match(fallback);if(fb)return fb;}
    throw error;
  }
}
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  if(isSupabaseRequest(request)){
    event.respondWith(fetch(request,{cache:'no-store'}));
    return;
  }
  const url=new URL(request.url);
  if(request.mode==='navigate'){
    event.respondWith(networkFirst(request,'./index.html'));
    return;
  }
  if(url.origin===self.location.origin&&['script','style','manifest'].includes(request.destination)){
    event.respondWith(networkFirst(request));
  }
});
