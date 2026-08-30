/* WellOne Order Receiving v98
   Compact order cards + dedicated order detail page + direct product links. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const esc=v=>clean(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const STORE_CHANNEL_NAME='wellone-store-events-v1',STORE_EVENT_NAME='store-change';
  const ORDER_PAGE_SIZE=20;
  const PUBLIC_STORE_ORIGIN='https://wellone.in';
  const ORDER_SELECT='id,order_number,customer_name,customer_phone,customer_address,payment_method,payment_status,status,subtotal,total,cancellation_reason,cancelled_at,created_at,updated_at,order_items(id,product_id,variant_id,product_name,color,size,option_name,product_barcode,quantity,unit_price,line_total,image_url)';
  let client=null,authorizedUser=null,realtimeChannel=null,storeChannel=null,reloadTimer=null;
  let orders=[],activeView='new',orderOffset=0,nextOrderOffset=null,orderLoading=false,orderRequestSerial=0,orderObserver=null,searchTimer=null,activeOrderId='';

  function db(){
    if(!client) client=window.supabase.createClient(ADMIN_CONFIG.supabaseUrl,ADMIN_CONFIG.supabaseAnonKey,{realtime:{params:{eventsPerSecond:10}}});
    return client;
  }
  function setStatus(t,c=''){$('statusText').textContent=t;$('statusText').className=`receiver-status ${c}`.trim();}
  async function requireAdmin(){
    if(authorizedUser)return authorizedUser;
    const {data,error}=await db().auth.getUser();
    if(error)throw error;
    const user=data?.user;
    if(!user)throw new Error('Login required');
    const access=await db().from('admin_users').select('id').eq('id',user.id).maybeSingle();
    if(access.error)throw access.error;
    if(!access.data)throw new Error('This account is not an admin.');
    authorizedUser=user;
    return user;
  }
  const imageUrl=v=>{const u=clean(v);if(!u)return '';return u.includes('/storage/v1/object/public/')&&!u.includes('?')?`${u}?width=240&quality=72`:u;};
  const labelStatus=s=>({placed:'New order',confirmed:'Confirmed',packed:'Packed',out_for_delivery:'Out for delivery',delivered:'Delivered',cancelled:'Cancelled'})[clean(s)]||clean(s);
  const labelPayment=m=>clean(m)==='online'?'Online payment':'Cash on delivery';
  const dateText=v=>{try{return new Date(v).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});}catch(_e){return clean(v);}};
  const optionLabel=item=>clean(item.option_name)||'Size / option';
  function productUrl(item){
    const id=clean(item?.product_id);
    if(id)return `${PUBLIC_STORE_ORIGIN}/product.html?id=${encodeURIComponent(id)}`;
    const q=clean(item?.product_name);
    return q?`${PUBLIC_STORE_ORIGIN}/catalog.html?q=${encodeURIComponent(q)}`:`${PUBLIC_STORE_ORIGIN}/catalog.html`;
  }
  function productThumb(item,compact=false){
    const src=imageUrl(item.image_url);
    const alt=esc(item.product_name||'Product');
    return `<a class="${compact?'order-product-thumb compact':'order-product-thumb'}" href="${esc(productUrl(item))}" aria-label="Open ${alt} product page" title="Open product page"><img loading="lazy" decoding="async" src="${esc(src)}" alt="${alt}"></a>`;
  }
  function orderCard(order){
    const items=Array.isArray(order.order_items)?order.order_items:[];
    const itemCount=items.reduce((sum,item)=>sum+Number(item.quantity||1),0);
    const thumbs=items.slice(0,4).map(item=>productThumb(item,true)).join('');
    const extra=items.length>4?`<span class="order-thumb-more">+${items.length-4}</span>`:'';
    return `<article class="admin-order-card ${order.status==='placed'?'is-new-order':''}" data-order-card="${esc(order.id)}" tabindex="0" role="button" aria-label="Open order ${esc(order.order_number)} details">
      <div class="admin-order-head"><div><span class="admin-order-status status-${esc(order.status)}">${esc(labelStatus(order.status))}</span><h2>${esc(order.order_number)}</h2><small>${esc(dateText(order.created_at))}</small></div><strong>₹${Number(order.total||0).toLocaleString('en-IN')}</strong></div>
      <div class="order-card-simple-row"><div class="order-card-customer"><b>${esc(order.customer_name)}</b><small>${esc(order.customer_phone)}</small></div><div class="order-card-count"><b>${itemCount}</b><small>item${itemCount===1?'':'s'}</small></div></div>
      ${thumbs?`<div class="order-card-thumbs" aria-label="Products in this order">${thumbs}${extra}</div>`:''}
      <div class="order-card-bottom"><span class="payment-${esc(order.payment_status)}"><b>${esc(order.payment_status==='paid'?'Paid':'Payment pending')}</b><small>${esc(labelPayment(order.payment_method))}</small></span><button class="order-detail-button" type="button" data-open-order="${esc(order.id)}">Open order</button></div>
    </article>`;
  }
  function renderOrders(reset=true,added=[]){
    const list=$('orderList');
    if(reset){
      list.innerHTML=orders.length?orders.map(orderCard).join(''):`<div class="empty"><b>${activeView==='new'?'No new orders':activeView==='cancelled'?'No cancelled orders':'No orders in this history view'}</b><p>${activeView==='new'?'New customer orders will appear here automatically.':'Try another filter or search.'}</p></div>`;
      return;
    }
    if(added.length)list.insertAdjacentHTML('beforeend',added.map(orderCard).join(''));
  }
  function detailItemHtml(item){
    const details=[item.color?`Colour: ${item.color}`:'',item.size?`${optionLabel(item)}: ${item.size}`:'',item.product_barcode?`Barcode: ${item.product_barcode}`:''].filter(Boolean).join(' · ')||'Standard';
    return `<article class="detail-product-item">${productThumb(item)}<div class="detail-product-copy"><a href="${esc(productUrl(item))}" class="detail-product-name">${esc(item.product_name)}</a><small>${esc(details)}</small><span>Qty ${Number(item.quantity||1)} · ₹${Number(item.unit_price||0).toLocaleString('en-IN')} each</span></div><strong>₹${Number(item.line_total||0).toLocaleString('en-IN')}</strong></article>`;
  }
  function renderOrderDetail(order){
    if(!order)return;
    const items=Array.isArray(order.order_items)?order.order_items:[];
    $('orderDetailTitle').textContent=order.order_number||'Order';
    $('orderDetailSubtitle').textContent=`${labelStatus(order.status)} · ${dateText(order.created_at)}`;
    $('orderDetailContent').innerHTML=`
      <div class="detail-summary-grid">
        <article><small>Customer</small><b>${esc(order.customer_name)}</b><span>${esc(order.customer_phone)}</span></article>
        <article><small>Payment</small><b>${esc(order.payment_status==='paid'?'Paid':'Payment pending')}</b><span>${esc(labelPayment(order.payment_method))}</span></article>
        <article><small>Total</small><b>₹${Number(order.total||0).toLocaleString('en-IN')}</b><span>${items.reduce((sum,item)=>sum+Number(item.quantity||1),0)} item${items.reduce((sum,item)=>sum+Number(item.quantity||1),0)===1?'':'s'}</span></article>
      </div>
      <section class="detail-section"><h2>Delivery details</h2><div class="detail-address"><b>${esc(order.customer_name)}</b><span>${esc(order.customer_phone)}</span><p>${esc(order.customer_address)}</p></div></section>
      <section class="detail-section"><div class="detail-section-head"><h2>Products</h2><small>Tap any product image to open its product page.</small></div><div class="detail-product-list">${items.map(detailItemHtml).join('')||'<div class="empty">No product lines found.</div>'}</div></section>
      <section class="detail-section"><h2>Order controls</h2><div class="admin-order-controls"><label>Status<select data-order-status="${esc(order.id)}"><option value="placed" ${order.status==='placed'?'selected':''}>Placed / new</option><option value="confirmed" ${order.status==='confirmed'?'selected':''}>Confirmed</option><option value="packed" ${order.status==='packed'?'selected':''}>Packed</option><option value="out_for_delivery" ${order.status==='out_for_delivery'?'selected':''}>Out for delivery</option><option value="delivered" ${order.status==='delivered'?'selected':''}>Delivered</option><option value="cancelled" ${order.status==='cancelled'?'selected':''}>Cancelled</option></select></label><label>Payment<select data-order-payment="${esc(order.id)}"><option value="pending" ${order.payment_status==='pending'?'selected':''}>Pending</option><option value="paid" ${order.payment_status==='paid'?'selected':''}>Paid</option><option value="failed" ${order.payment_status==='failed'?'selected':''}>Failed</option><option value="refunded" ${order.payment_status==='refunded'?'selected':''}>Refunded</option></select></label></div>${order.status==='placed'?`<button class="confirm-order-button detail-confirm-button" type="button" data-confirm-order="${esc(order.id)}">Confirm order</button>`:''}${order.cancellation_reason?`<div class="detail-cancel-note"><b>Cancellation reason</b><span>${esc(order.cancellation_reason)}</span></div>`:''}</section>`;
  }
  function showListPage(replaceState=false){
    activeOrderId='';
    $('orderDetailPage').hidden=true;
    $('orderListPage').hidden=false;
    document.body.classList.remove('showing-order-detail');
    if(replaceState) history.replaceState({page:'orders'},'',location.pathname+location.search);
    else if(location.hash.startsWith('#order-')) history.pushState({page:'orders'},'',location.pathname+location.search);
    window.scrollTo({top:0,behavior:'auto'});
  }
  function openOrderDetail(id,pushState=true){
    const order=orders.find(row=>clean(row.id)===clean(id));
    if(!order){setStatus('That order is no longer in this list. Refreshing…','loading');loadOrders(true).catch(()=>{});return;}
    activeOrderId=clean(id);
    renderOrderDetail(order);
    $('orderListPage').hidden=true;
    $('orderDetailPage').hidden=false;
    document.body.classList.add('showing-order-detail');
    if(pushState) history.pushState({page:'order-detail',orderId:activeOrderId},'',`#order-${encodeURIComponent(activeOrderId)}`);
    window.scrollTo({top:0,behavior:'auto'});
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
      const {data,error}=await q;if(error)throw error;if(serial!==orderRequestSerial)return;
      const rows=data||[],hasMore=rows.length>ORDER_PAGE_SIZE,page=hasMore?rows.slice(0,ORDER_PAGE_SIZE):rows;
      if(reset)orders=page;else{const seen=new Set(orders.map(x=>clean(x.id)));orders=orders.concat(page.filter(x=>!seen.has(clean(x.id))));}
      nextOrderOffset=hasMore?requestOffset+page.length:null;orderOffset=nextOrderOffset??requestOffset+page.length;
      renderOrders(reset,page);updateLoader();refreshNewCount();setStatus(`Live · ${orders.length} loaded · 20 at a time`,'ok');
      if(activeOrderId){const active=orders.find(row=>clean(row.id)===activeOrderId);if(active)renderOrderDetail(active);else showListPage(true);}
    }catch(error){if(serial===orderRequestSerial){setStatus(error.message||'Could not load orders.','error');if(reset)renderOrders(true,[]);}throw error;}
    finally{if(serial===orderRequestSerial)orderLoading=false;updateLoader();}
  }
  function setOrderView(view){
    activeView=['new','history','cancelled'].includes(view)?view:'new';
    showListPage(true);
    document.querySelectorAll('[data-order-view]').forEach(button=>{const active=button.dataset.orderView===activeView;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
    $('orderStatusFilter').hidden=activeView!=='history';if(activeView!=='history')$('orderStatusFilter').value='';
    loadOrders(true).catch(()=>{});
  }
  function setupOrderAutoLoader(){
    const loader=$('orderAutoLoader');if(!loader||loader.dataset.bound==='true')return;loader.dataset.bound='true';
    const next=()=>{if(!loader.hidden&&!orderLoading&&nextOrderOffset!==null&&nextOrderOffset!==undefined&&!activeOrderId)loadOrders(false).catch(()=>{});};
    if('IntersectionObserver'in window){orderObserver=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting))next();},{root:null,rootMargin:'320px 0px 320px',threshold:.01});orderObserver.observe(loader);}
    else window.addEventListener('scroll',()=>{if(!loader.hidden&&loader.getBoundingClientRect().top<=innerHeight+320)next();},{passive:true});
  }
  async function broadcast(tables,action,details){
    try{if(!storeChannel){storeChannel=db().channel(STORE_CHANNEL_NAME,{config:{broadcast:{self:false,ack:true}}});storeChannel.subscribe();}await storeChannel.send({type:'broadcast',event:STORE_EVENT_NAME,payload:{tables,action,details,eventId:`receiver-${Date.now()}-${Math.random().toString(36).slice(2)}`,at:Date.now()}});}catch(_e){}
  }
  async function changeStatus(id,status){
    let note=null;
    if(status==='cancelled'){
      note=prompt('Cancellation reason (saved in customer order history):','Cancelled by shop');
      if(note===null){if(activeOrderId){const current=orders.find(x=>clean(x.id)===activeOrderId);if(current)renderOrderDetail(current);}else renderOrders(true);return;}
      if(!clean(note)){setStatus('Enter a cancellation reason.','error');if(activeOrderId){const current=orders.find(x=>clean(x.id)===activeOrderId);if(current)renderOrderDetail(current);}return;}
    }
    setStatus('Updating order...','loading');
    const {error}=await db().rpc('admin_update_order_status',{p_order_id:id,p_status:status,p_note:note});if(error)throw error;
    broadcast(status==='cancelled'?['orders','products','product_variants']:['orders'],`receiver-order-${status}`,{orderId:id}).catch(()=>{});
    showListPage(true);
    await loadOrders(true);
  }
  async function changePayment(id,status){
    setStatus('Updating payment...','loading');
    const {error}=await db().rpc('admin_set_order_payment',{p_order_id:id,p_payment_status:status});if(error)throw error;
    broadcast(['orders'],'receiver-payment',{orderId:id,paymentStatus:status}).catch(()=>{});
    showListPage(true);
    await loadOrders(true);
  }
  function startRealtime(){
    if(realtimeChannel)return;
    realtimeChannel=db().channel('wellone-order-receiver-v98').on('postgres_changes',{event:'*',schema:'public',table:'orders'},()=>{clearTimeout(reloadTimer);reloadTimer=setTimeout(()=>loadOrders(true).catch(()=>{}),220);}).subscribe();
  }
  async function showApp(){
    await requireAdmin();
    $('loginScreen').hidden=true;$('receiverApp').hidden=false;$('orderStatusFilter').hidden=activeView!=='history';
    setupOrderAutoLoader();startRealtime();await loadOrders(true);
  }
  async function login(e){
    e.preventDefault();$('loginError').textContent='Checking...';
    try{const {error}=await db().auth.signInWithPassword({email:clean($('emailInput').value),password:$('passwordInput').value||''});if(error)throw error;authorizedUser=null;await showApp();$('loginError').textContent='';$('passwordInput').value='';}
    catch(err){$('loginError').textContent=err.message||'Login failed.';}
  }
  async function logout(){
    try{if(realtimeChannel)db().removeChannel(realtimeChannel);if(storeChannel)db().removeChannel(storeChannel);}catch(_e){}
    realtimeChannel=storeChannel=null;authorizedUser=null;activeOrderId='';await db().auth.signOut().catch(()=>{});$('receiverApp').hidden=true;$('loginScreen').hidden=false;$('passwordInput').value='';setStatus('Login required.');
  }

  $('loginForm').addEventListener('submit',login);
  $('logoutBtn').addEventListener('click',logout);
  $('reloadOrdersBtn').addEventListener('click',()=>loadOrders(true).catch(()=>{}));
  $('orderDetailBack').addEventListener('click',()=>{if(history.state?.page==='order-detail')history.back();else showListPage(true);});
  $('orderStatusFilter').addEventListener('change',()=>loadOrders(true).catch(()=>{}));
  $('orderSearchInput').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadOrders(true).catch(()=>{}),300);});
  document.querySelectorAll('[data-order-view]').forEach(button=>button.addEventListener('click',()=>setOrderView(button.dataset.orderView)));
  $('orderList').addEventListener('click',event=>{
    if(event.target.closest('.order-product-thumb'))return;
    const confirmButton=event.target.closest('[data-confirm-order]');
    if(confirmButton){changeStatus(confirmButton.dataset.confirmOrder,'confirmed').catch(err=>{setStatus(err.message,'error');loadOrders(true).catch(()=>{});});return;}
    const button=event.target.closest('[data-open-order]');
    const card=event.target.closest('[data-order-card]');
    const id=button?.dataset.openOrder||card?.dataset.orderCard;
    if(id)openOrderDetail(id,true);
  });
  $('orderList').addEventListener('keydown',event=>{if(event.target.closest('a,button,input,select,textarea'))return;const card=event.target.closest('[data-order-card]');if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openOrderDetail(card.dataset.orderCard,true);}});
  $('orderDetailContent').addEventListener('click',event=>{const confirmButton=event.target.closest('[data-confirm-order]');if(confirmButton)changeStatus(confirmButton.dataset.confirmOrder,'confirmed').catch(err=>{setStatus(err.message,'error');loadOrders(true).catch(()=>{});});});
  document.addEventListener('change',e=>{
    if(e.target.matches('[data-order-status]'))changeStatus(e.target.dataset.orderStatus,e.target.value).catch(err=>{setStatus(err.message,'error');loadOrders(true).catch(()=>{});});
    if(e.target.matches('[data-order-payment]'))changePayment(e.target.dataset.orderPayment,e.target.value).catch(err=>{setStatus(err.message,'error');loadOrders(true).catch(()=>{});});
  });
  window.addEventListener('popstate',event=>{
    const state=event.state;
    if(state?.page==='order-detail'&&state.orderId)openOrderDetail(state.orderId,false);
    else showListPage(true);
  });
  setupOrderAutoLoader();
  db().auth.getSession().then(({data})=>{if(data?.session){authorizedUser=null;showApp().catch(()=>logout());}}).catch(()=>{});
})();
