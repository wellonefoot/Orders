/* bundled from admin-config.js */
const ADMIN_CONFIG = {
  supabaseUrl: 'https://wnavzhrkwgnegjdetdno.supabase.co',
  supabaseAnonKey: 'sb_publishable_RbnMrDlHfEijBiejcRNPUg_mop2bqgM',
  storageBucket: 'product-images'
};

/* bundled from orders-receiving.js */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const key=v=>clean(v).toLowerCase();
  const esc=v=>clean(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const STORE_CHANNEL_NAME='wellone-store-events-v1', STORE_EVENT_NAME='store-change';
  let client=null, orders=[], realtimeChannel=null, storeChannel=null, reloadTimer=null, authorizedUser=null, activeView='new';
  function db(){ if(!client) client=window.supabase.createClient(ADMIN_CONFIG.supabaseUrl,ADMIN_CONFIG.supabaseAnonKey,{realtime:{params:{eventsPerSecond:10}}}); return client; }
  function setStatus(message,type=''){ const el=$('statusText'); el.textContent=message; el.className=`receiver-status ${type}`.trim(); }
  async function requireAdmin(force=false){
    if(authorizedUser&&!force)return authorizedUser;
    const {data:{user}}=await db().auth.getUser(); if(!user) throw new Error('Login required');
    const {data,error}=await db().from('admin_users').select('id').eq('id',user.id).maybeSingle(); if(error) throw error;
    if(!data) throw new Error('This login is not authorized in admin_users.'); authorizedUser=user; return user;
  }
  function labelStatus(s){return ({placed:'New order',confirmed:'Confirmed',packed:'Packed',out_for_delivery:'Out for delivery',delivered:'Delivered',cancelled:'Cancelled'})[clean(s)]||clean(s);}
  function labelPayment(method){return clean(method)==='online'?'Online payment':'Cash on delivery';}
  function imageUrl(value){const u=clean(value);if(!u)return '';return u.includes('/storage/v1/object/public/')&&!u.includes('?')?`${u}?width=220&quality=68`:u;}
  function dateText(value){try{return new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});}catch(_e){return clean(value);}}
  function optionLabel(item){return clean(item.option_name)||(/\b(ml|mg|g|kg|litre|liter|ltr|pack)\b/i.test(clean(item.size))?'Quantity':'Size / option');}
  function setOrderView(view){
    activeView=['new','history','cancelled'].includes(view)?view:'new';
    document.querySelectorAll('[data-order-view]').forEach(button=>{const active=button.dataset.orderView===activeView;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
    $('orderStatusFilter').hidden=activeView!=='history';
    if(activeView!=='history')$('orderStatusFilter').value='';
    render();
  }
  function render(){
    const filter=clean($('orderStatusFilter').value), search=key($('orderSearchInput').value);
    const newCount=orders.filter(order=>order.status==='placed').length;
    if($('newOrderCount'))$('newOrderCount').textContent=String(newCount);
    const rows=orders.filter(order=>{
      if(activeView==='new'&&order.status!=='placed')return false;
      if(activeView==='cancelled'&&order.status!=='cancelled')return false;
      if(activeView==='history'&&['placed','cancelled'].includes(order.status))return false;
      if(activeView==='history'&&filter==='paid'&&order.payment_status!=='paid')return false;
      if(activeView==='history'&&filter&&filter!=='paid'&&order.status!==filter)return false;
      return !search||[order.order_number,order.customer_name,order.customer_phone,order.customer_address].some(value=>key(value).includes(search));
    });
    $('orderList').innerHTML=rows.length?rows.map(order=>{
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
    }).join(''):`<div class="empty"><b>${activeView==='new'?'No new orders':activeView==='cancelled'?'No cancelled orders':'No orders in this history view'}</b><p>${activeView==='new'?'New customer orders will appear here automatically.':'Try another filter or search.'}</p></div>`;
  }
  async function loadOrders(){
    await requireAdmin(); setStatus('Loading orders...','loading');
    const {data,error}=await db().from('orders').select('id,order_number,customer_name,customer_phone,customer_address,payment_method,payment_status,status,subtotal,total,cancellation_reason,cancelled_at,created_at,updated_at,order_items(id,product_name,color,size,option_name,quantity,unit_price,line_total,image_url)').order('created_at',{ascending:false}).limit(200);
    if(error) throw error; orders=data||[]; render(); const newCount=orders.filter(order=>order.status==='placed').length; setStatus(`Live · ${newCount} new · ${orders.length} total`,'ok');
  }
  async function broadcast(tables,action,details){
    try{
      if(!storeChannel){storeChannel=db().channel(STORE_CHANNEL_NAME,{config:{broadcast:{self:false,ack:true}}}); await new Promise(resolve=>{let done=false;const fin=()=>{if(done)return;done=true;resolve();};storeChannel.subscribe(s=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(s))fin();});setTimeout(fin,700);});}
      await storeChannel.send({type:'broadcast',event:STORE_EVENT_NAME,payload:{tables,action,details,eventId:`receiver-${Date.now()}-${Math.random().toString(36).slice(2)}`,at:Date.now()}});
    }catch(_e){}
  }
  async function changeStatus(id,status){
    let note=null;
    if(status==='cancelled'){note=prompt('Cancellation reason (saved in customer order history):','Cancelled by shop');if(note===null){render();return;}if(!clean(note)){setStatus('Enter a cancellation reason.','error');render();return;}}
    setStatus('Updating order...','loading');
    const {error}=await db().rpc('admin_update_order_status',{p_order_id:id,p_status:status,p_note:note}); if(error) throw error;
    await broadcast(status==='cancelled'?['orders','products','product_variants']:['orders'],`receiver-order-${status}`,{orderId:id}); await loadOrders();
  }
  async function changePayment(id,status){
    setStatus('Updating payment...','loading'); const {error}=await db().rpc('admin_set_order_payment',{p_order_id:id,p_payment_status:status}); if(error) throw error;
    await broadcast(['orders'],'receiver-payment',{orderId:id,paymentStatus:status}); await loadOrders();
  }
  function startRealtime(){
    if(realtimeChannel)return; realtimeChannel=db().channel('wellone-order-receiver-v80').on('postgres_changes',{event:'*',schema:'public',table:'orders'},()=>{clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>loadOrders().catch(e=>setStatus(e.message,'error')),250);}).subscribe();
  }
  async function showApp(){await requireAdmin();$('loginScreen').hidden=true;$('receiverApp').hidden=false;setOrderView(activeView);startRealtime();await loadOrders();}
  async function login(e){e.preventDefault();$('loginError').textContent='Checking...';try{const {error}=await db().auth.signInWithPassword({email:clean($('emailInput').value),password:$('passwordInput').value||''});if(error)throw error;await showApp();$('loginError').textContent='';$('passwordInput').value='';}catch(err){$('loginError').textContent=err.message||'Login failed.';}}
  async function logout(){try{if(realtimeChannel)db().removeChannel(realtimeChannel);if(storeChannel)db().removeChannel(storeChannel);}catch(_e){}realtimeChannel=storeChannel=null;authorizedUser=null;await db().auth.signOut().catch(()=>{});$('receiverApp').hidden=true;$('loginScreen').hidden=false;$('passwordInput').value='';}
  $('loginForm').addEventListener('submit',login);$('logoutBtn').addEventListener('click',logout);$('reloadOrdersBtn').addEventListener('click',()=>loadOrders().catch(e=>setStatus(e.message,'error')));$('orderStatusFilter').addEventListener('change',render);$('orderSearchInput').addEventListener('input',render);
  document.querySelectorAll('[data-order-view]').forEach(button=>button.addEventListener('click',()=>setOrderView(button.dataset.orderView)));
  $('orderList').addEventListener('click',event=>{const toggle=event.target.closest('[data-order-toggle]');if(toggle){const details=$(`orderDetails-${toggle.dataset.orderToggle}`);if(details){details.hidden=!details.hidden;toggle.setAttribute('aria-expanded',String(!details.hidden));toggle.textContent=details.hidden?'View full details':'Hide details';}return;}const confirmButton=event.target.closest('[data-confirm-order]');if(confirmButton)changeStatus(confirmButton.dataset.confirmOrder,'confirmed').catch(err=>{setStatus(err.message,'error');loadOrders().catch(()=>{});});});
  document.addEventListener('change',e=>{if(e.target.matches('[data-order-status]'))changeStatus(e.target.dataset.orderStatus,e.target.value).catch(err=>{setStatus(err.message,'error');loadOrders().catch(()=>{});});if(e.target.matches('[data-order-payment]'))changePayment(e.target.dataset.orderPayment,e.target.value).catch(err=>{setStatus(err.message,'error');loadOrders().catch(()=>{});});});
  db().auth.getSession().then(({data})=>{if(data?.session)showApp().catch(()=>logout());}).catch(()=>{});
})();
