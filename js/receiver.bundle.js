/* bundled from admin-config.js - v91 */
const ADMIN_CONFIG = {
  // The real Supabase project is kept only so stored public URLs can be recognized.
  projectUrl: 'https://wnavzhrkwgnegjdetdno.supabase.co',
  // IMPORTANT: browser auth/database calls go through the WellOne site's own Netlify URL.
  // This route intentionally does NOT use /supabase because /supabase is also a real
  // folder in this deploy and can shadow a Netlify proxy rewrite.
  supabaseUrl: `${location.origin}/wellone-db`,
  supabaseAnonKey: 'sb_publishable_RbnMrDlHfEijBiejcRNPUg_mop2bqgM',
  storageBucket: 'product-images'
};

/* optimized order receiver v91 - same-origin Netlify Supabase proxy */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const esc=v=>clean(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const STORE_CHANNEL_NAME='wellone-store-events-v1',STORE_EVENT_NAME='store-change';
  const ORDER_PAGE_SIZE=20;
  const ORDER_SELECT='id,order_number,customer_name,customer_phone,customer_address,payment_method,payment_status,status,subtotal,total,cancellation_reason,cancelled_at,created_at,updated_at,order_items(id,product_name,color,size,option_name,quantity,unit_price,line_total,image_url)';
  const PROJECT_ORIGIN=new URL(ADMIN_CONFIG.projectUrl).origin;
  let client=null,authorizedUser=null,realtimeChannel=null,storeChannel=null,reloadTimer=null,livePollTimer=null,lastOrderFingerprint='';
  let orders=[],activeView='new',orderOffset=0,nextOrderOffset=null,orderLoading=false,orderRequestSerial=0,orderObserver=null,searchTimer=null,loginBusy=false;

  function db(){
    if(!client)client=window.supabase.createClient(ADMIN_CONFIG.supabaseUrl,ADMIN_CONFIG.supabaseAnonKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},
      realtime:{params:{eventsPerSecond:4}}
    });
    return client;
  }
  function timeout(promise,ms,message){
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message||'Request timed out.')),ms);})
    ]).finally(()=>clearTimeout(timer));
  }
  function friendlyError(error){
    const message=clean(error?.message||error);
    if(/invalid login credentials/i.test(message))return 'Incorrect admin email or password.';
    if(/not an admin|not authorized|admin login required/i.test(message))return 'This login does not have admin access.';
    if(/unexpected token|not valid json|text\/html/i.test(message))return 'Secure login route returned the website page instead of the server response. This build will try another route automatically.';
    if(/failed to fetch|network|load failed|timed out|timeout/i.test(message))return 'Order server connection failed. Reload this page once, then try Login again.';
    if(/jwt|refresh token|session/i.test(message))return 'Your admin session expired. Please log in again.';
    return message||'Login failed.';
  }
  function setStatus(t,c=''){$('statusText').textContent=t;$('statusText').className=`receiver-status ${c}`.trim();}
  function setLoginBusy(on){
    loginBusy=on;
    const button=$('loginForm')?.querySelector('button[type="submit"]');
    if(button){button.disabled=on;button.textContent=on?'Checking…':'Login';}
  }
  async function requireAdmin(){
    if(authorizedUser)return authorizedUser;
    const sessionResult=await db().auth.getSession();
    if(sessionResult.error)throw sessionResult.error;
    const user=sessionResult.data?.session?.user;
    if(!user)throw new Error('Login required');
    const access=await timeout(db().from('admin_users').select('id').eq('id',user.id).maybeSingle(),12000,'Admin access check timed out.');
    if(access.error)throw access.error;
    if(!access.data)throw new Error('This account is not an admin.');
    authorizedUser=user;
    return user;
  }
  const imageUrl=v=>{
    const raw=clean(v);if(!raw)return '';
    let u=raw;
    try{const parsed=new URL(raw,location.href);if(parsed.origin===PROJECT_ORIGIN)u=`${location.origin}/wellone-db${parsed.pathname}${parsed.search}`;}catch(_e){}
    return u.includes('/storage/v1/object/public/')&&!u.includes('?')?`${u}?width=220&quality=70`:u;
  };
  const labelStatus=s=>({placed:'New order',confirmed:'Confirmed',packed:'Packed',out_for_delivery:'Out for delivery',delivered:'Delivered',cancelled:'Cancelled'})[clean(s)]||clean(s);
  const labelPayment=m=>clean(m)==='online'?'Online payment':'Cash on delivery';
  const dateText=v=>{try{return new Date(v).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});}catch(_e){return clean(v);}};
  const optionLabel=item=>clean(item.option_name)||'Size / option';
  function orderCard(order){
    const items=Array.isArray(order.order_items)?order.order_items:[];
    const itemHtml=items.map(item=>`<div class="admin-order-item"><img loading="lazy" decoding="async" src="${esc(imageUrl(item.image_url))}" alt=""><div><b>${esc(item.product_name)}</b><small>${[item.color?`Colour: ${item.color}`:'',item.size?`${optionLabel(item)}: ${item.size}`:''].filter(Boolean).join(' · ')||'Standard'} · Qty ${Number(item.quantity||1)}</small></div><strong>₹${Number(item.line_total||0).toLocaleString('en-IN')}</strong></div>`).join('');
    const itemCount=items.reduce((sum,item)=>sum+Number(item.quantity||1),0);
    return `<article class="admin-order-card ${order.status==='placed'?'is-new-order':''}" data-order-card="${esc(order.id)}">
      <div class="admin-order-head"><div><span class="admin-order-status status-${esc(order.status)}">${esc(labelStatus(order.status))}</span><h2>${esc(order.order_number)}</h2><small>${esc(dateText(order.created_at))}</small></div><strong>₹${Number(order.total||0).toLocaleString('en-IN')}</strong></div>
      <div class="order-card-glance"><span><b>${esc(order.customer_name)}</b><small>${esc(order.customer_phone)}</small></span><span><b>${itemCount}</b><small>item${itemCount===1?'':'s'}</small></span><span class="payment-${esc(order.payment_status)}"><b>${esc(order.payment_status==='paid'?'Paid':'Payment pending')}</b><small>${esc(labelPayment(order.payment_method))}</small></span></div>
      <div class="order-card-actions">${order.status==='placed'?`<button class="confirm-order-button" type="button" data-confirm-order="${esc(order.id)}">Confirm order</button>`:''}<button class="order-detail-button" type="button" data-order-toggle="${esc(order.id)}" aria-expanded="false">View full details</button></div>
      <div class="admin-order-details" id="orderDetails-${esc(order.id)}" hidden>
        <div class="admin-order-customer"><b>${esc(order.customer_name)}</b><span>${esc(order.customer_phone)}</span><p>${esc(order.customer_address)}</p></div>
        <div class="admin-order-items">${itemHtml}</div>
        <div class="admin-order-controls"><label>Status<select data-order-status="${esc(order.id)}"><option value="placed" ${order.status==='placed'?'selected':''}>Placed / new</option><option value="confirmed" ${order.status==='confirmed'?'selected':''}>Confirmed</option><option value="packed" ${order.status==='packed'?'selected':''}>Packed</option><option value="out_for_delivery" ${order.status==='out_for_delivery'?'selected':''}>Out for delivery</option><option value="delivered" ${order.status==='delivered'?'selected':''}>Delivered</option><option value="cancelled" ${order.status==='cancelled'?'selected':''}>Cancelled</option></select></label><label>Payment<select data-order-payment="${esc(order.id)}"><option value="pending" ${order.payment_status==='pending'?'selected':''}>Pending</option><option value="paid" ${order.payment_status==='paid'?'selected':''}>Paid</option><option value="failed" ${order.payment_status==='failed'?'selected':''}>Failed</option><option value="refunded" ${order.payment_status==='refunded'?'selected':''}>Refunded</option></select></label></div>
        <div class="admin-order-foot"><span>${esc(labelPayment(order.payment_method))}</span>${order.cancellation_reason?`<b>Reason: ${esc(order.cancellation_reason)}</b>`:''}</div>
      </div>
    </article>`;
  }
  function renderOrders(reset=true,added=[]){
    const list=$('orderList');
    if(reset){list.innerHTML=orders.length?orders.map(orderCard).join(''):`<div class="empty"><b>${activeView==='new'?'No new orders':activeView==='cancelled'?'No cancelled orders':'No orders in this history view'}</b><p>${activeView==='new'?'New customer orders will appear here automatically.':'Try another filter or search.'}</p></div>`;return;}
    if(added.length)list.insertAdjacentHTML('beforeend',added.map(orderCard).join(''));
  }
  function updateLoader(){const loader=$('orderAutoLoader');if(!loader)return;const more=nextOrderOffset!==null&&nextOrderOffset!==undefined;loader.hidden=!more;loader.setAttribute('aria-busy',more&&orderLoading?'true':'false');}
  function applyOrderFilters(q){
    if(activeView==='new')q=q.eq('status','placed');
    else if(activeView==='cancelled')q=q.eq('status','cancelled');
    else{
      const filter=clean($('orderStatusFilter').value);
      if(filter==='paid')q=q.eq('payment_status','paid').neq('status','placed').neq('status','cancelled');
      else if(filter)q=q.eq('status',filter);
      else q=q.neq('status','placed').neq('status','cancelled');
    }
    const raw=clean($('orderSearchInput').value);
    if(raw){const term=raw.replace(/[%_,()]/g,' ').trim();if(term)q=q.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`);}
    return q;
  }
  async function refreshNewCount(){
    try{const {count}=await db().from('orders').select('id',{count:'exact',head:true}).eq('status','placed');if($('newOrderCount'))$('newOrderCount').textContent=String(Number(count||0));}catch(_e){}
  }
  async function loadOrders(reset=true){
    await requireAdmin();
    if(!reset&&(orderLoading||nextOrderOffset===null||nextOrderOffset===undefined))return;
    const serial=reset?++orderRequestSerial:orderRequestSerial;
    if(reset){orders=[];orderOffset=0;nextOrderOffset=null;}
    const requestOffset=orderOffset;orderLoading=true;updateLoader();setStatus(reset?'Loading orders...':'Loading more orders...','loading');
    try{
      let q=db().from('orders').select(ORDER_SELECT).order('created_at',{ascending:false}).range(requestOffset,requestOffset+ORDER_PAGE_SIZE);
      q=applyOrderFilters(q);
      const {data,error}=await timeout(q,15000,'Orders request timed out.');if(error)throw error;if(serial!==orderRequestSerial)return;
      const rows=data||[],hasMore=rows.length>ORDER_PAGE_SIZE,page=hasMore?rows.slice(0,ORDER_PAGE_SIZE):rows;
      if(reset)orders=page;else{const seen=new Set(orders.map(x=>clean(x.id)));orders=orders.concat(page.filter(x=>!seen.has(clean(x.id))));}
      nextOrderOffset=hasMore?requestOffset+page.length:null;orderOffset=nextOrderOffset??requestOffset+page.length;
      renderOrders(reset,page);updateLoader();refreshNewCount();setStatus(`Live · ${orders.length} loaded · 20 at a time`,'ok');
    }catch(error){if(serial===orderRequestSerial){setStatus(friendlyError(error),'error');if(reset)renderOrders(true,[]);}throw error;}
    finally{if(serial===orderRequestSerial)orderLoading=false;updateLoader();}
  }
  function setOrderView(view){
    activeView=['new','history','cancelled'].includes(view)?view:'new';
    document.querySelectorAll('[data-order-view]').forEach(button=>{const active=button.dataset.orderView===activeView;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
    $('orderStatusFilter').hidden=activeView!=='history';if(activeView!=='history')$('orderStatusFilter').value='';
    loadOrders(true).catch(()=>{});
  }
  function setupOrderAutoLoader(){
    const loader=$('orderAutoLoader');if(!loader||loader.dataset.bound==='true')return;loader.dataset.bound='true';
    const next=()=>{if(!loader.hidden&&!orderLoading&&nextOrderOffset!==null&&nextOrderOffset!==undefined)loadOrders(false).catch(()=>{});};
    if('IntersectionObserver'in window){orderObserver=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting))next();},{root:null,rootMargin:'320px 0px 320px',threshold:.01});orderObserver.observe(loader);}
    else window.addEventListener('scroll',()=>{if(!loader.hidden&&loader.getBoundingClientRect().top<=innerHeight+320)next();},{passive:true});
  }
  async function broadcast(_tables,_action,_details){
    // Netlify's HTTP proxy is used for dependable Auth/REST access. Order freshness on this
    // receiver is provided by the short live polling loop below, so a WebSocket is not required.
  }
  async function changeStatus(id,status){
    let note=null;if(status==='cancelled'){note=prompt('Cancellation reason (saved in customer order history):','Cancelled by shop');if(note===null){renderOrders(true);return;}if(!clean(note)){setStatus('Enter a cancellation reason.','error');renderOrders(true);return;}}
    setStatus('Updating order...','loading');const {error}=await timeout(db().rpc('admin_update_order_status',{p_order_id:id,p_status:status,p_note:note}),15000,'Order update timed out.');if(error)throw error;
    broadcast(status==='cancelled'?['orders','products','product_variants']:['orders'],`receiver-order-${status}`,{orderId:id}).catch(()=>{});await loadOrders(true);
  }
  async function changePayment(id,status){setStatus('Updating payment...','loading');const {error}=await timeout(db().rpc('admin_set_order_payment',{p_order_id:id,p_payment_status:status}),15000,'Payment update timed out.');if(error)throw error;broadcast(['orders'],'receiver-payment',{orderId:id,paymentStatus:status}).catch(()=>{});await loadOrders(true);}
  async function pollForOrderChanges(){
    if(document.hidden||!authorizedUser||orderLoading)return;
    try{
      const {data,error}=await db().from('orders').select('id,updated_at,status').order('updated_at',{ascending:false}).limit(1);
      if(error)return;
      const row=data?.[0];const fp=row?`${row.id}|${row.updated_at}|${row.status}`:'';
      if(lastOrderFingerprint&&fp&&fp!==lastOrderFingerprint)loadOrders(true).catch(()=>{});
      lastOrderFingerprint=fp;
      refreshNewCount();
    }catch(_e){}
  }
  function startLivePolling(){
    if(livePollTimer)return;
    pollForOrderChanges();
    livePollTimer=setInterval(pollForOrderChanges,3500);
  }
  function startRealtime(){
    // HTTP polling stays live even on networks where direct *.supabase.co access is unavailable.
    startLivePolling();
  }
  async function showApp(){
    await requireAdmin();
    $('loginScreen').hidden=true;$('receiverApp').hidden=false;$('orderStatusFilter').hidden=activeView!=='history';setupOrderAutoLoader();startRealtime();await loadOrders(true);
  }
  async function login(e){
    e.preventDefault();if(loginBusy)return;
    $('loginError').textContent='Checking secure access…';setLoginBusy(true);
    try{
      const result=await timeout(db().auth.signInWithPassword({email:clean($('emailInput').value),password:$('passwordInput').value||''}),15000,'Login request timed out.');
      if(result.error)throw result.error;
      authorizedUser=null;
      await showApp();
      $('loginError').textContent='';$('passwordInput').value='';
    }catch(err){
      const message=friendlyError(err);$('loginError').textContent=message;
      if(/does not have admin access/i.test(message))await db().auth.signOut().catch(()=>{});
    }finally{setLoginBusy(false);}
  }
  async function logout(){
    try{if(realtimeChannel)db().removeChannel(realtimeChannel);if(storeChannel)db().removeChannel(storeChannel);}catch(_e){}
    realtimeChannel=storeChannel=null;if(livePollTimer){clearInterval(livePollTimer);livePollTimer=null;}authorizedUser=null;lastOrderFingerprint='';
    await db().auth.signOut().catch(()=>{});$('receiverApp').hidden=true;$('loginScreen').hidden=false;$('passwordInput').value='';setStatus('Login required.');
  }
  async function restoreSession(){
    try{
      const {data,error}=await db().auth.getSession();if(error||!data?.session)return;
      $('loginError').textContent='Restoring admin session…';authorizedUser=null;
      await showApp();$('loginError').textContent='';
    }catch(err){
      $('receiverApp').hidden=true;$('loginScreen').hidden=false;$('loginError').textContent=friendlyError(err);
    }
  }
  $('loginForm').addEventListener('submit',login);$('logoutBtn').addEventListener('click',logout);$('reloadOrdersBtn').addEventListener('click',()=>loadOrders(true).catch(()=>{}));
  $('orderStatusFilter').addEventListener('change',()=>loadOrders(true).catch(()=>{}));$('orderSearchInput').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadOrders(true).catch(()=>{}),300);});
  document.querySelectorAll('[data-order-view]').forEach(button=>button.addEventListener('click',()=>setOrderView(button.dataset.orderView)));
  $('orderList').addEventListener('click',event=>{const toggle=event.target.closest('[data-order-toggle]');if(toggle){const details=$(`orderDetails-${toggle.dataset.orderToggle}`);if(details){details.hidden=!details.hidden;toggle.setAttribute('aria-expanded',String(!details.hidden));toggle.textContent=details.hidden?'View full details':'Hide details';}return;}const confirmButton=event.target.closest('[data-confirm-order]');if(confirmButton)changeStatus(confirmButton.dataset.confirmOrder,'confirmed').catch(err=>{setStatus(friendlyError(err),'error');loadOrders(true).catch(()=>{});});});
  document.addEventListener('change',e=>{if(e.target.matches('[data-order-status]'))changeStatus(e.target.dataset.orderStatus,e.target.value).catch(err=>{setStatus(friendlyError(err),'error');loadOrders(true).catch(()=>{});});if(e.target.matches('[data-order-payment]'))changePayment(e.target.dataset.orderPayment,e.target.value).catch(err=>{setStatus(friendlyError(err),'error');loadOrders(true).catch(()=>{});});});
  setupOrderAutoLoader();restoreSession();
})();
