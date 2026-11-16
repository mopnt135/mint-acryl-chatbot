  // ===== 데모용 가짜 서버 (이 파일 하나로 실행되도록 브라우저 안에서 처리) =====
  // 실제 버전의 server.js가 하는 일을 흉내 내요. AI 대신 정해진 규칙으로 답해요.
  const DemoServer = (() => {
    const SEED = /*SEED_JSON*/null;
    const KEY = 'mint-demo-data-v1';
    const clone = o => JSON.parse(JSON.stringify(o));
    let D = null;
    function load(){
      try{ const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if(d && Array.isArray(d.products)){ if(!Array.isArray(d.guidelines)) d.guidelines = []; return d; } }catch(e){}
      const d = clone(SEED.data); d.guidelines = []; return d;
    }
    function save(){ try{ localStorage.setItem(KEY, JSON.stringify(D)); }catch(e){} }
    D = load(); save();

    const kstNow = () => new Date().toLocaleString('sv-SE', {timeZone:'Asia/Seoul'}).slice(0,16);
    const kstDate = (p=0) => new Date(Date.now() + p*86400000).toLocaleDateString('sv-SE', {timeZone:'Asia/Seoul'});
    const STAGES = [
      {status:'출고대기', location:'제작 준비 중', order:'제작중'}, {status:'집화완료', location:'서울 성동 집하장', order:'출고완료'},
      {status:'배송중', location:'대전 허브터미널', order:'출고완료'}, {status:'배송출발', location:'배송지 근처 대리점', order:'출고완료'},
      {status:'배송완료', location:'고객 배송지', order:'배송완료'}];
    const settings = () => ({...SEED.settingsDefault, ...(D.settings || {})});
    const active = () => D.acryl_products.filter(p => p.visible !== '숨김').slice().sort((a,b) => (Number(a.order)||0) - (Number(b.order)||0));
    const pname = code => { const p = D.acryl_products.find(x => x.code === code) || D.products.find(x => x.sku === code); return p ? p.name : code; };
    const won = n => (Number(n)||0).toLocaleString('ko-KR') + '원';

    function advance(o, sh){
      if(!sh || sh.mode !== '자동' || !sh.createdMs || o.status === '주문취소') return;
      const st = Math.min(STAGES.length - 1, Math.floor((Date.now() - sh.createdMs) / 120000));
      const cur = STAGES.findIndex(x => x.status === sh.status); if(st <= cur) return;
      const s = STAGES[st]; sh.status = s.status; sh.location = s.location; sh.updated = kstNow();
      if(sh.tracking === '미발급') sh.tracking = '7' + String(Date.now()).slice(-11);
      o.status = s.order; save();
    }
    function findProduct(text){
      const flat = text.replace(/\s/g,''); const list = active();
      return list.find(p => flat.includes(p.name.replace(/\s/g,''))) ||
        list.find(p => p.name.split(/[\s()·]+/).filter(w => w.length >= 2 && !['아크릴','스탠드','상품'].includes(w)).some(w => flat.includes(w)));
    }
    function ruleChat(history){
      const users = history.filter(m => m.role === 'user');
      const text = (users[users.length - 1] || {}).content || '';
      const guides = D.guidelines.filter(g => g.active);
      const tail = guides.length ? `\n\n(데모: 적용 중인 관리자 지침 ${guides.length}개를 함께 보냈다고 가정해요)` : '';
      const id = (text.match(/MA-?\d{4,}/i) || [])[0];
      if(id){
        const oid = id.toUpperCase().replace(/^MA-?/, 'MA-');
        const o = D.orders.find(x => x.orderId === oid);
        if(!o) return {text: `${oid} 주문을 찾지 못했어요. 주문번호를 다시 확인해 주세요.` + tail};
        const sh = D.shipments.find(x => x.orderId === oid); advance(o, sh);
        return {text: `${oid} 주문 현황이에요.\n상품: ${pname(o.sku)} ${o.qty}개\n주문 상태: ${o.status}\n` +
          (sh ? `배송 상태: ${sh.status}\n현재 위치: ${sh.location}\n택배사: ${sh.courier} (송장 ${sh.tracking})\n도착 예정: ${sh.eta}` : '배송 정보가 아직 없어요.') +
          (o.virtual ? '\n\n연습용 가상 주문이에요.' : '') + tail};
      }
      let hit = findProduct(text);
      if(/주문/.test(text) && /(해줘|해 줘|해주세요|할게|부탁|응|네)/.test(text)){
        let p = hit;
        if(!p){ for(let i = users.length - 2; i >= 0 && !p; i--) p = findProduct(users[i].content); }
        if(!p) return {text: '어떤 상품을 주문할까요? 상품 이름을 알려 주세요.' + tail};
        const qty = Math.min(999, Math.max(1, Math.floor(Number((text.match(/(\d+)\s*개/) || [])[1] || 1))));
        const maxNo = D.orders.reduce((m,o) => { const n = /^MA-(\d+)$/.exec(o.orderId||''); return n ? Math.max(m, Number(n[1])) : m; }, 1000);
        const orderId = 'MA-' + (maxNo + 1); const amount = (Number(p.price)||0) * qty;
        D.orders.push({orderId, date:kstDate(0), customer:'가상 고객', sku:p.code, qty, amount, payment:'결제완료', status:'주문접수', virtual:true});
        D.shipments.push({orderId, courier:'CJ대한통운', tracking:'미발급', status:'출고대기', location:'주문 접수', updated:kstNow(), eta:kstDate(3), mode:'자동', createdMs:Date.now()});
        save();
        const receipt = {ok:true, order_id:orderId, product:p.name, qty, amount_krw:amount, shipping:{courier:'CJ대한통운', tracking:'출고 후 발급', status:'출고대기', eta:kstDate(3)}, virtual:true};
        return {text: `가상 주문을 만들었어요.\n주문번호: ${orderId}\n상품: ${p.name} ${qty}개\n예상 금액: ${won(amount)} (시작가 기준)\n연습용 가상 주문이라 실제로 결제·제작·배송되지 않아요.` + tail, receipt};
      }
      if(hit){
        return {text: `${hit.name}\n시작가 ${won(hit.price)}부터예요. 옵션에 따라 최종 가격은 달라져요.\n${hit.desc || ''}\n\n이 상품으로 주문을 해드릴까요?` + tail};
      }
      const words = text.split(/[\s,.?!]+/).map(w => w.replace(/(은|는|이|가|을|를|도|요|야|에|에서|알려줘|얼마|어떻게)$/,'')).filter(w => w.length >= 2);
      const lines = settings().info.split('\n').filter(l => l.startsWith('-') && words.some(w => l.includes(w)));
      if(lines.length) return {text: '사이트 정보에서 찾은 내용이에요.\n' + lines.slice(0,3).join('\n') + tail};
      return {text: '데모 버전은 AI가 아니라 정해진 규칙으로만 답해요.\n상품 이름, 주문번호(예: MA-1011), "2개 주문해줘", 또는 배송비·파일 같은 단어로 물어봐 주세요.' + tail};
    }

    // ----- 진짜 AI (Anthropic API를 브라우저에서 직접 호출) -----
    const AIKEY = 'mint-ai-settings-v1';
    let AI = {key:'', model:'claude-sonnet-4-5', remember:false};
    try{ const a = JSON.parse(localStorage.getItem(AIKEY) || 'null'); if(a && a.key) AI = {...AI, ...a, remember:true}; }catch(e){}
    function setAI(a){
      AI = {key: a.keep ? AI.key : String(a.key || '').trim(), model: String(a.model || 'claude-sonnet-4-5').trim() || 'claude-sonnet-4-5', remember: !!a.remember};
      try{ if(AI.remember && AI.key) localStorage.setItem(AIKEY, JSON.stringify(AI)); else localStorage.removeItem(AIKEY); }catch(e){}
    }
    const getAI = () => ({hasKey: !!AI.key, model: AI.model, remember: AI.remember, keyTail: AI.key ? AI.key.slice(-4) : ''});

    const ORDER_RULE = ['[가상 주문 규칙]',
      '손님이 특정 상품을 고르거나 물어보면 설명 끝에 꼭 "이 상품으로 주문을 해드릴까요?"라고 물어봐.',
      '손님이 주문해 달라고 하면 create_virtual_order 도구로 주문해. 수량을 말하지 않았으면 1개로 하고 그렇게 했다고 알려줘.',
      '도구를 쓰지 않고 주문됐다고 말하지 마. 도구가 실패하면 실패 이유를 그대로 알려줘.',
      '주문 뒤에는 주문번호, 상품, 수량, 예상 금액(시작가 기준), 배송 현황을 알려주고, 연습용 가상 주문이라 실제로 제작·배송·결제되지 않는다고 꼭 말해.',
      '주문번호로 배송이나 주문을 물으면 check_order 도구로 조회해서 답해.'].join('\n');
    function systemPrompt(){
      const st = settings(); const list = active();
      const gl = D.guidelines.filter(g => g.active).slice(-30);
      const gb = gl.length ? '\n\n[관리자 피드백 지침]\n관리자가 지난 대화를 검토하고 남긴 지침이에요. 위 내용과 부딪히면 이 지침을 먼저 따르세요. 단, 사이트 정보에 없는 사실을 지어내라는 뜻으로 해석하지 마세요.\n' +
        gl.map((g, i) => `${i + 1}. ${g.text}` + (g.source && g.source.question ? ` (참고 질문: "${g.source.question.slice(0, 80)}")` : '')).join('\n') : '';
      return `${st.rules}\n${ORDER_RULE}\n오늘 날짜(한국시간): ${kstDate(0)}\n\n[사이트 정보]\n[출처] ${st.sourceName} (${st.sourceUrl}), ${st.infoDate} 확인\n[상품과 시작 가격(가장 기본 옵션 기준, 옵션에 따라 달라짐). 전체 ${list.length}개]\n` +
        list.map(p => '- ' + p.name + ': ' + won(p.price) + '부터. ' + (p.desc || '') + (p.url ? ' 링크: ' + p.url : '')).join('\n') + '\n' + st.info + gb;
    }
    const TOOLS = [
      {name:'create_virtual_order', description:'손님이 주문해 달라고 확실히 말했을 때만 연습용 가상 주문을 만든다. 한 번의 답변에서 한 번만 호출.',
       input_schema:{type:'object', properties:{product:{type:'string', description:'상품 이름 그대로'}, qty:{type:'integer', description:'수량. 말하지 않았으면 1'}}, required:['product']}},
      {name:'check_order', description:'주문번호로 주문 상태와 배송 현황을 조회한다.',
       input_schema:{type:'object', properties:{order_id:{type:'string', description:'예: MA-1011'}}, required:['order_id']}}];
    function createOrder(productText, qty){
      const list = active(); const q = String(productText || '').trim();
      const p = list.find(x => x.name === q) || list.find(x => q && (x.name.includes(q) || q.includes(x.name))) || findProduct(q);
      if(!p) return {ok:false, error:'상품을 찾지 못했어요.', products: list.map(x => x.name)};
      qty = Math.floor(Number(qty) || 1); if(qty < 1 || qty > 999) return {ok:false, error:'수량은 1개부터 999개까지만 가상 주문할 수 있어요.'};
      const maxNo = D.orders.reduce((m,o) => { const n = /^MA-(\d+)$/.exec(o.orderId||''); return n ? Math.max(m, Number(n[1])) : m; }, 1000);
      const orderId = 'MA-' + (maxNo + 1); const amount = (Number(p.price)||0) * qty;
      D.orders.push({orderId, date:kstDate(0), customer:'가상 고객', sku:p.code, qty, amount, payment:'결제완료', status:'주문접수', virtual:true});
      D.shipments.push({orderId, courier:'CJ대한통운', tracking:'미발급', status:'출고대기', location:'주문 접수', updated:kstNow(), eta:kstDate(3), mode:'자동', createdMs:Date.now()});
      save();
      return {ok:true, order_id:orderId, product:p.name, qty, amount_krw:amount, amount_note:'시작가 기준 예상 금액', order_status:'주문접수', shipping:{courier:'CJ대한통운', tracking:'출고 후 발급', status:'출고대기', eta:kstDate(3)}, virtual:true};
    }
    function checkOrder(id){
      const oid = String(id || '').trim().toUpperCase();
      const o = D.orders.find(x => String(x.orderId).toUpperCase() === oid); if(!o) return {found:false, message:'해당 주문번호가 없어요.'};
      const sh = D.shipments.find(x => String(x.orderId).toUpperCase() === oid); advance(o, sh);
      return {found:true, order_id:o.orderId, order_date:o.date, product:pname(o.sku), qty:o.qty, amount_krw:o.amount, payment:o.payment, order_status:o.status, virtual:!!o.virtual,
        shipping: sh ? {courier:sh.courier, tracking:sh.tracking, status:sh.status, location:sh.location, updated:sh.updated, eta:sh.eta} : '배송 정보 없음'};
    }
    function friendly(status, msg){
      if(status === 0) return '인터넷에 연결되지 않았거나, 이 화면에서는 외부 접속이 막혀 있어요. 파일을 내려받아 크롬이나 엣지로 열어 주세요.';
      if(status === 401) return 'API 키가 올바르지 않아요. 위쪽 "AI 설정"에서 키를 다시 넣어 주세요.';
      if(status === 403) return '이 API 키로는 사용할 수 없어요. 키 권한이나 결제 설정을 확인해 주세요.';
      if(status === 404 || /model/i.test(msg || '')) return `모델 이름(${AI.model})을 쓸 수 없어요. "AI 설정"에서 Anthropic 문서의 최신 모델 이름으로 바꿔 주세요.`;
      if(status === 429) return '잠깐 너무 많이 요청했어요. 1분쯤 뒤에 다시 보내 주세요.';
      if(status === 400 && /credit|balance/i.test(msg || '')) return 'API 크레딧이 부족해요. Anthropic 콘솔에서 결제 상태를 확인해 주세요.';
      if(status >= 500) return 'AI 서버에 잠시 문제가 있어요. 조금 뒤에 다시 시도해 주세요.';
      return '답변을 가져오지 못했어요. "AI 설정"의 키와 모델 이름을 확인해 주세요.';
    }
    async function callClaude(messages){
      let res;
      try{
        res = await fetch('https://api.anthropic.com/v1/messages', {method:'POST',
          headers:{'content-type':'application/json', 'x-api-key':AI.key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true'},
          body: JSON.stringify({model:AI.model, max_tokens:1024, system:systemPrompt(), tools:TOOLS, messages})});
      }catch(e){ const err = new Error('network'); err.status = 0; throw err; }
      const j = await res.json().catch(() => ({}));
      if(!res.ok){ const err = new Error((j.error && j.error.message) || ''); err.status = res.status; throw err; }
      return j;
    }
    async function aiChat(history){
      const messages = history.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()).slice(-20).map(m => ({role:m.role, content:m.content.slice(0, 4000)}));
      while(messages.length && messages[0].role !== 'user') messages.shift();
      if(!messages.length) return {error:'질문이 비어 있어요.'};
      let receipt = null;
      try{
        for(let turn = 0; turn < 5; turn++){
          const r = await callClaude(messages); const blocks = r.content || []; const uses = blocks.filter(b => b.type === 'tool_use');
          if(r.stop_reason !== 'tool_use' || !uses.length) return {text: blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim() || '(빈 답변)', receipt};
          messages.push({role:'assistant', content:blocks});
          messages.push({role:'user', content: uses.map(u => {
            let out;
            if(u.name === 'create_virtual_order'){ out = receipt ? {ok:false, error:'이번 답변에서 이미 주문했어요.'} : createOrder(u.input.product, u.input.qty); if(out.ok) receipt = out; }
            else if(u.name === 'check_order') out = checkOrder(u.input.order_id);
            else out = {error:'알 수 없는 도구예요.'};
            return {type:'tool_result', tool_use_id:u.id, content:JSON.stringify(out)};
          })});
        }
        return {text:'처리 단계가 너무 길어져서 멈췄어요. 질문을 조금 더 짧게 해 주세요.', receipt};
      }catch(e){ return {error: friendly(e.status, e.message)}; }
    }
    async function chat(history){
      if(!AI.key) return {error:'AI가 답하려면 API 키가 필요해요. 위쪽 "AI 설정" 버튼을 눌러 Anthropic API 키를 넣어 주세요.'};
      return aiChat(history);
    }

    async function handle(path, body){
      if(path !== '/api/chat') await new Promise(r => setTimeout(r, 60));
      if(path === '/api/bootstrap') return {schema: SEED.schema, defaults: SEED.settingsDefault, data: clone(D), model: AI.model, hasKey: !!AI.key, demo: true};
      if(path === '/api/ai') return getAI();
      if(path === '/api/ai/set'){ setAI(body); return getAI(); }
      if(path === '/api/data' && body === undefined) return clone(D);
      if(path === '/api/data'){ const g = D.guidelines; D = clone(body); D.guidelines = g; if(!D.settings) D.settings = clone(SEED.settingsDefault); save(); return {ok:true}; }
      if(path === '/api/reset'){ const g = D.guidelines; D = clone(SEED.data); D.guidelines = g; save(); return clone(D); }
      if(path === '/api/guidelines' && body === undefined) return clone(D.guidelines);
      if(path === '/api/guidelines'){
        const text = String(body.text || '').trim().slice(0, 600); if(!text) throw new Error('지침 내용이 비어 있어요.');
        const g = {id:'G' + Date.now().toString(36), text, active: body.active !== false, source:{question: body.question || '', answer: body.answer || '', note: body.note || ''}, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()};
        D.guidelines.push(g); save(); return clone(g);
      }
      if(path === '/api/guidelines/update'){
        const g = D.guidelines.find(x => x.id === body.id); if(!g) throw new Error('지침을 찾지 못했어요.');
        if(typeof body.text === 'string' && body.text.trim()) g.text = body.text.trim().slice(0, 600);
        if(typeof body.active === 'boolean') g.active = body.active;
        g.updatedAt = new Date().toISOString(); save(); return clone(g);
      }
      if(path === '/api/guidelines/delete'){ D.guidelines = D.guidelines.filter(x => x.id !== body.id); save(); return {ok:true}; }
      if(path === '/api/chat') return chat(Array.isArray(body.messages) ? body.messages : []);
      throw new Error('알 수 없는 요청');
    }
    return {handle, ruleChat};
  })();
