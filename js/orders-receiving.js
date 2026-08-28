(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const key=v=>clean(v).toLowerCase();
  const esc=v=>clean(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const STORE_CHANNEL_NAME='wellone-store-events-v1', STORE_EVENT_NAME='store-change';
  let client=null, orders=[], realtimeChannel=null, storeChannel=null, reloadTimer=null;
  function db(){ if(!client) client=window.supabase.createClient(ADMIN_CONFIG.supabaseUrl,ADMIN_CONFIG.supabaseAnonKey,{realtime:{params:{eventsPerSecond:10}}}); return client; }
  function setStatus(message,type=''){ const el=$('statusText'); el.textContent=message; el.className=`receiver-status ${type}`.trim(); }
  async function requireAdmin(){
    const {data:{user}}=await db().auth.getUser(); if(!user) throw new Error('Login required');
    const {data,error}=await db().from('admin_users').select('id').eq('id',user.id).maybeSingle(); if(error) throw error;
    if(!data) throw new Error('This login is not authorized in admin_users.'); return user;
  }
  function labelStatus(s){return ({confirmed:'Confirmed',packed:'Packed',out_for_delivery:'Out for delivery',delivered:'Delivered',cancelled:'Cancelled'})[clean(s)]||clean(s);}
  function labelPayment(method){return clean(method)==='online'?'Online payment':'Cash on delivery';}
  function dateText(value){try{return new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});}catch(_e){return clean(value);}}
  function render(){
    const filter=clean($('orderStatusFilter').value), search=key($('orderSearchInput').value);
    const rows=orders.filter(o=>(!filter||o.status===filter)&&(!search||[o.order_number,o.customer_name,o.customer_phone,o.customer_address].some(v=>key(v).includes(search))));
    $('orderList').innerHTML=rows.length?rows.map(order=>{
      const items=Array.isArray(order.order_items)?order.order_items:[];
      const itemHtml=items.map(item=>`<div class="admin-order-item"><img src="${esc(item.image_url||'')}" alt=""><div><b>${esc(item.product_name)}</b><small>${[item.color?`Colour: ${item.color}`:'',item.size?`Size: ${item.size}`:''].filter(Boolean).join(' · ')||'Standard'} · Qty ${Number(item.quantity||1)}</small></div><strong>₹${Number(item.line_total||0).toLocaleString('en-IN')}</strong></div>`).join('');
      return `<article class="admin-order-card">
        <div class="admin-order-head"><div><span class="admin-order-status status-${esc(order.status)}">${esc(labelStatus(order.status))}</span><h2>${esc(order.order_number)}</h2><small>${esc(dateText(order.created_at))}</small></div><strong>₹${Number(order.total||0).toLocaleString('en-IN')}</strong></div>
        <div class="admin-order-customer"><b>${esc(order.customer_name)}</b><span>${esc(order.customer_phone)}</span><p>${esc(order.customer_address)}</p></div>
        <div class="admin-order-items">${itemHtml}</div>
        <div class="admin-order-controls"><label>Status<select data-order-status="${esc(order.id)}"><option value="confirmed" ${order.status==='confirmed'?'selected':''}>Confirmed</option><option value="packed" ${order.status==='packed'?'selected':''}>Packed</option><option value="out_for_delivery" ${order.status==='out_for_delivery'?'selected':''}>Out for delivery</option><option value="delivered" ${order.status==='delivered'?'selected':''}>Delivered</option><option value="cancelled" ${order.status==='cancelled'?'selected':''}>Cancelled</option></select></label><label>Payment<select data-order-payment="${esc(order.id)}"><option value="pending" ${order.payment_status==='pending'?'selected':''}>Pending</option><option value="paid" ${order.payment_status==='paid'?'selected':''}>Paid</option><option value="failed" ${order.payment_status==='failed'?'selected':''}>Failed</option><option value="refunded" ${order.payment_status==='refunded'?'selected':''}>Refunded</option></select></label></div>
        <div class="admin-order-foot"><span>${esc(labelPayment(order.payment_method))}</span>${order.cancellation_reason?`<b>Reason: ${esc(order.cancellation_reason)}</b>`:''}</div>
      </article>`;
    }).join(''):'<div class="empty">No orders match this view.</div>';
  }
  async function loadOrders(){
    await requireAdmin(); setStatus('Loading orders...','loading');
    const {data,error}=await db().from('orders').select('id,order_number,customer_name,customer_phone,customer_address,payment_method,payment_status,status,subtotal,total,cancellation_reason,cancelled_at,created_at,updated_at,order_items(id,product_name,color,size,quantity,unit_price,line_total,image_url)').order('created_at',{ascending:false}).limit(200);
    if(error) throw error; orders=data||[]; render(); setStatus(`Live · ${orders.length} orders loaded`,'ok');
  }
  async function broadcast(tables,action,details){
    try{
      if(!storeChannel){storeChannel=db().channel(STORE_CHANNEL_NAME,{config:{broadcast:{self:false,ack:true}}}); await new Promise(resolve=>{let done=false;const fin=()=>{if(done)return;done=true;resolve();};storeChannel.subscribe(s=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(s))fin();});setTimeout(fin,2000);});}
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
    if(realtimeChannel)return; realtimeChannel=db().channel('wellone-order-receiver-v80').on('postgres_changes',{event:'*',schema:'public',table:'orders'},()=>{clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>loadOrders().catch(e=>setStatus(e.message,'error')),120);}).subscribe();
  }
  async function showApp(){await requireAdmin();$('loginScreen').hidden=true;$('receiverApp').hidden=false;startRealtime();await loadOrders();}
  async function login(e){e.preventDefault();$('loginError').textContent='Checking...';try{const {error}=await db().auth.signInWithPassword({email:clean($('emailInput').value),password:$('passwordInput').value||''});if(error)throw error;await showApp();$('loginError').textContent='';$('passwordInput').value='';}catch(err){$('loginError').textContent=err.message||'Login failed.';}}
  async function logout(){try{if(realtimeChannel)db().removeChannel(realtimeChannel);if(storeChannel)db().removeChannel(storeChannel);}catch(_e){}realtimeChannel=storeChannel=null;await db().auth.signOut().catch(()=>{});$('receiverApp').hidden=true;$('loginScreen').hidden=false;$('passwordInput').value='';}
  $('loginForm').addEventListener('submit',login);$('logoutBtn').addEventListener('click',logout);$('reloadOrdersBtn').addEventListener('click',()=>loadOrders().catch(e=>setStatus(e.message,'error')));$('orderStatusFilter').addEventListener('change',render);$('orderSearchInput').addEventListener('input',render);
  document.addEventListener('change',e=>{if(e.target.matches('[data-order-status]'))changeStatus(e.target.dataset.orderStatus,e.target.value).catch(err=>{setStatus(err.message,'error');loadOrders().catch(()=>{});});if(e.target.matches('[data-order-payment]'))changePayment(e.target.dataset.orderPayment,e.target.value).catch(err=>{setStatus(err.message,'error');loadOrders().catch(()=>{});});});
  db().auth.getSession().then(({data})=>{if(data?.session)showApp().catch(()=>logout());}).catch(()=>{});
})();
