// 민트 아크릴샵 로컬 챗봇 서버
// 실행: node server.js  (Node.js 18 이상 필요, 추가 설치 없음)
// API 키는 같은 폴더의 .env 파일에 넣어요. 키는 브라우저로 절대 보내지 않아요.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;

// ----- .env 읽기 (없으면 .env.example을 복사해서 만들어요) -----
let ENV_CREATED = false;
function loadEnv(){
  const file = path.join(ROOT, '.env');
  if(!fs.existsSync(file)){
    const ex = path.join(ROOT, '.env.example');
    if(fs.existsSync(ex)){ try{ fs.copyFileSync(ex, file); ENV_CREATED = true; }catch(e){} }
  }
  if(!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  for(const line of text.split(/\r?\n/)){
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if(!m || line.trim().startsWith('#')) continue;
    let v = m[2].trim();
    if((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if(!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv();

const PORT = Number(process.env.PORT) || 3000;
const MODEL = (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5').trim();
const API_BASE = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
const MAX_TOKENS = Number(process.env.MAX_TOKENS) || 1024;
const apiKey = () => (process.env.ANTHROPIC_API_KEY || '').trim();

if(typeof fetch !== 'function'){
  console.error('Node.js 18 이상이 필요해요. https://nodejs.org 에서 LTS 버전을 설치해 주세요.');
  process.exit(1);
}

// ----- 데이터 (data.json) -----
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed.json'), 'utf8'));
const DATA_FILE = path.join(ROOT, 'data.json');
const clone = o => JSON.parse(JSON.stringify(o));
const COLS = Object.keys(SEED.schema);

function freshData(){ return clone(SEED.data); }
function validData(d){ return d && typeof d === 'object' && COLS.every(c => Array.isArray(d[c])); }
function loadData(){
  try{ const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); if(validData(d)) return d; }catch(e){}
  const d = freshData(); saveData(d); return d;
}
function saveData(d){
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 1), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}
let DATA = loadData();
if(!Array.isArray(DATA.guidelines)){ DATA.guidelines = []; saveData(DATA); }

// ----- 관리자 피드백 지침 -----
const MAX_ACTIVE_GUIDES = 30;
const cleanText = (v, n) => String(v || '').replace(/\s+$/,'').slice(0, n);
const activeGuides = () => DATA.guidelines.filter(g => g.active).slice(-MAX_ACTIVE_GUIDES);

// ----- 날짜 (한국시간) -----
const kstNow = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16);
const kstDate = (plus = 0) => new Date(Date.now() + plus * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

// ----- 가상 주문과 배송 -----
const SHIP_STAGES = [
  { status: '출고대기', location: '제작 준비 중', order: '제작중' },
  { status: '집화완료', location: '서울 성동 집하장', order: '출고완료' },
  { status: '배송중', location: '대전 허브터미널', order: '출고완료' },
  { status: '배송출발', location: '배송지 근처 대리점', order: '출고완료' },
  { status: '배송완료', location: '고객 배송지', order: '배송완료' }
];
const STAGE_MIN = Number(process.env.SHIP_STAGE_MINUTES) || 2;

const settings = () => ({ ...SEED.settingsDefault, ...(DATA.settings || {}) });
const activeProducts = () => DATA.acryl_products.filter(p => p.visible !== '숨김').slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
const productName = code => { const p = DATA.acryl_products.find(x => x.code === code) || DATA.products.find(x => x.sku === code); return p ? p.name : code; };

function advance(o, sh){
  if(!sh || sh.mode !== '자동' || !sh.createdMs || o.status === '주문취소') return false;
  const stage = Math.min(SHIP_STAGES.length - 1, Math.floor((Date.now() - sh.createdMs) / (STAGE_MIN * 60000)));
  const cur = SHIP_STAGES.findIndex(x => x.status === sh.status);
  if(stage <= cur) return false;
  const st = SHIP_STAGES[stage];
  sh.status = st.status; sh.location = st.location; sh.updated = kstNow();
  if(sh.tracking === '미발급') sh.tracking = '7' + String(Date.now()).slice(-11);
  o.status = st.order;
  return true;
}

function checkOrder(orderId){
  const id = String(orderId || '').trim().toUpperCase();
  const o = DATA.orders.find(x => String(x.orderId).toUpperCase() === id);
  if(!o) return { found: false, message: '해당 주문번호가 없어요.' };
  const sh = DATA.shipments.find(x => String(x.orderId).toUpperCase() === id);
  if(advance(o, sh)) saveData(DATA);
  return { found: true, order_id: o.orderId, order_date: o.date, product: productName(o.sku), qty: o.qty, amount_krw: o.amount,
    payment: o.payment, order_status: o.status, virtual: !!o.virtual,
    shipping: sh ? { courier: sh.courier, tracking: sh.tracking, status: sh.status, location: sh.location, updated: sh.updated, eta: sh.eta } : '배송 정보 없음' };
}

function createOrder(productText, qty){
  const list = activeProducts(); const q = String(productText || '').trim();
  const p = list.find(x => x.code === q) || list.find(x => x.name === q) || list.find(x => q && (x.name.includes(q) || q.includes(x.name)));
  if(!p) return { ok: false, error: '상품을 찾지 못했어요.', products: list.map(x => x.name) };
  qty = Math.floor(Number(qty) || 1);
  if(qty < 1 || qty > 999) return { ok: false, error: '수량은 1개부터 999개까지만 가상 주문할 수 있어요.' };
  const maxNo = DATA.orders.reduce((m, o) => { const n = /^MA-(\d+)$/.exec(o.orderId || ''); return n ? Math.max(m, Number(n[1])) : m; }, 1000);
  const orderId = 'MA-' + (maxNo + 1);
  const amount = (Number(p.price) || 0) * qty;
  DATA.orders.push({ orderId, date: kstDate(0), customer: '가상 고객', sku: p.code, qty, amount, payment: '결제완료', status: '주문접수', virtual: true });
  DATA.shipments.push({ orderId, courier: 'CJ대한통운', tracking: '미발급', status: '출고대기', location: '주문 접수', updated: kstNow(), eta: kstDate(3), mode: '자동', createdMs: Date.now() });
  saveData(DATA);
  return { ok: true, order_id: orderId, product: p.name, qty, amount_krw: amount, amount_note: '시작가 기준 예상 금액', order_status: '주문접수',
    shipping: { courier: 'CJ대한통운', tracking: '출고 후 발급', status: '출고대기', eta: kstDate(3) }, virtual: true };
}

// ----- AI 설정 -----
const ORDER_RULE = [
  '[가상 주문 규칙]',
  '손님이 특정 상품을 고르거나 물어보면 설명 끝에 꼭 "이 상품으로 주문을 해드릴까요?"라고 물어봐.',
  '손님이 주문해 달라고 하면 create_virtual_order 도구로 주문해. 수량을 말하지 않았으면 1개로 하고 그렇게 했다고 알려줘.',
  '도구를 쓰지 않고 주문됐다고 말하지 마. 도구가 실패하면 실패 이유를 그대로 알려줘.',
  '주문 뒤에는 주문번호, 상품, 수량, 예상 금액(시작가 기준), 배송 현황을 알려주고, 연습용 가상 주문이라 실제로 제작·배송·결제되지 않는다고 꼭 말해.',
  '주문번호로 배송이나 주문을 물으면 check_order 도구로 조회해서 답해.'
].join('\n');

function systemPrompt(){
  const st = settings(); const list = activeProducts();
  return `${st.rules}
${ORDER_RULE}
오늘 날짜(한국시간): ${kstDate(0)}

[사이트 정보]
[출처] ${st.sourceName} (${st.sourceUrl}), ${st.infoDate} 확인
[상품과 시작 가격(가장 기본 옵션 기준, 옵션에 따라 달라짐). 전체 ${list.length}개]
${list.map(p => '- ' + p.name + ': ' + (Number(p.price) || 0).toLocaleString('ko-KR') + '원부터. ' + (p.desc || '') + (p.url ? ' 링크: ' + p.url : '')).join('\n')}
${st.info}${guideBlock()}`;
}

function guideBlock(){
  const list = activeGuides();
  if(!list.length) return '';
  return '\n\n[관리자 피드백 지침]\n관리자가 지난 대화를 검토하고 남긴 지침이에요. 위 내용과 부딪히면 이 지침을 먼저 따르세요. 단, 사이트 정보에 없는 사실을 지어내라는 뜻으로 해석하지 마세요.\n' +
    list.map((g, i) => `${i + 1}. ${g.text}` + (g.source && g.source.question ? ` (참고 질문: "${g.source.question.slice(0, 80)}")` : '')).join('\n');
}

const TOOLS = [
  { name: 'create_virtual_order', description: '손님이 주문해 달라고 확실히 말했을 때만 연습용 가상 주문을 만든다. 한 번의 답변에서 한 번만 호출.',
    input_schema: { type: 'object', properties: { product: { type: 'string', description: '상품 이름 그대로' }, qty: { type: 'integer', description: '수량. 말하지 않았으면 1' } }, required: ['product'] } },
  { name: 'check_order', description: '주문번호로 주문 상태와 배송 현황을 조회한다.',
    input_schema: { type: 'object', properties: { order_id: { type: 'string', description: '예: MA-1011' } }, required: ['order_id'] } }
];

async function callClaude(messages){
  const res = await fetch(API_BASE + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: systemPrompt(), tools: TOOLS, messages })
  });
  const body = await res.json().catch(() => ({}));
  if(!res.ok){
    const msg = (body.error && body.error.message) || '';
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return body;
}

function friendlyError(e){
  if(e.status === 401) return 'API 키가 올바르지 않아요. .env 파일의 ANTHROPIC_API_KEY를 확인해 주세요.';
  if(e.status === 403) return '이 API 키로는 사용할 수 없어요. 키 권한이나 결제 설정을 확인해 주세요.';
  if(e.status === 404 || /model/i.test(e.message || '')) return `모델 이름(${MODEL})을 쓸 수 없어요. .env 파일의 ANTHROPIC_MODEL을 Anthropic 문서의 최신 모델 이름으로 바꿔 주세요.`;
  if(e.status === 429) return '잠깐 너무 많이 요청했어요. 1분쯤 뒤에 다시 보내 주세요.';
  if(e.status === 400 && /credit|balance/i.test(e.message || '')) return 'API 크레딧이 부족해요. Anthropic 콘솔에서 결제 상태를 확인해 주세요.';
  if(e.status >= 500) return 'AI 서버에 잠시 문제가 있어요. 조금 뒤에 다시 시도해 주세요.';
  return '답변을 가져오지 못했어요. 인터넷 연결과 .env 설정을 확인해 주세요.';
}

async function chat(history){
  if(!apiKey()) return { error: 'API 키가 없어요. 폴더의 .env 파일을 메모장으로 열어 ANTHROPIC_API_KEY= 뒤에 키를 붙여 넣고, 서버를 다시 실행해 주세요.' };
  const messages = history.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20).map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if(!messages.length || messages[messages.length - 1].role !== 'user') return { error: '질문이 비어 있어요.' };
  while(messages[0].role !== 'user') messages.shift();
  let receipt = null;
  for(let turn = 0; turn < 5; turn++){
    const r = await callClaude(messages);
    const blocks = r.content || [];
    const uses = blocks.filter(b => b.type === 'tool_use');
    if(r.stop_reason !== 'tool_use' || !uses.length){
      return { text: blocks.filter(b => b.type === 'text').map(b => b.text).join('\n').trim() || '(빈 답변)', receipt };
    }
    messages.push({ role: 'assistant', content: blocks });
    const results = uses.map(u => {
      let out;
      try{
        if(u.name === 'create_virtual_order'){
          out = receipt ? { ok: false, error: '이번 답변에서 이미 주문했어요.' } : createOrder(u.input.product, u.input.qty);
          if(out.ok) receipt = out;
        } else if(u.name === 'check_order') out = checkOrder(u.input.order_id);
        else out = { error: '알 수 없는 도구예요.' };
      }catch(e){ out = { error: '도구 실행 중 문제가 생겼어요.' }; }
      return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) };
    });
    messages.push({ role: 'user', content: results });
  }
  return { text: '처리 단계가 너무 길어져서 멈췄어요. 질문을 조금 더 짧게 해 주세요.', receipt };
}

// ----- HTTP 서버 -----
function send(res, status, obj){
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 5 * 1024 * 1024){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if(size > limit){ reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try{ resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }catch(e){ reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try{
    if(req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')){
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(fs.readFileSync(path.join(ROOT, 'public', 'index.html')));
    }
    if(req.method === 'GET' && url.pathname === '/api/bootstrap'){
      return send(res, 200, { schema: SEED.schema, defaults: SEED.settingsDefault, data: DATA, model: MODEL, hasKey: !!apiKey() });
    }
    if(req.method === 'GET' && url.pathname === '/api/data') return send(res, 200, DATA);
    if(req.method === 'POST' && url.pathname === '/api/data'){
      const d = await readBody(req);
      if(!validData(d)) return send(res, 400, { error: '데이터 형식이 맞지 않아요.' });
      if(!d.settings) d.settings = clone(SEED.settingsDefault);
      d.guidelines = DATA.guidelines;   // 지침은 전용 메뉴에서만 바꿔요
      DATA = d; saveData(DATA); return send(res, 200, { ok: true });
    }
    if(req.method === 'POST' && url.pathname === '/api/reset'){
      const keep = DATA.guidelines; DATA = freshData(); DATA.guidelines = keep; saveData(DATA); return send(res, 200, DATA);
    }
    if(req.method === 'GET' && url.pathname === '/api/guidelines') return send(res, 200, DATA.guidelines);
    if(req.method === 'POST' && url.pathname === '/api/guidelines'){
      const b = await readBody(req, 64 * 1024);
      const text = cleanText(b.text, 600).trim();
      if(!text) return send(res, 400, { error: '지침 내용이 비어 있어요.' });
      const g = { id: 'G' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, active: b.active !== false,
        source: { question: cleanText(b.question, 500), answer: cleanText(b.answer, 800), note: cleanText(b.note, 500), sessionId: cleanText(b.sessionId, 60), messageId: cleanText(b.messageId, 60) },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      DATA.guidelines.push(g); saveData(DATA); return send(res, 200, g);
    }
    if(req.method === 'POST' && url.pathname === '/api/guidelines/update'){
      const b = await readBody(req, 64 * 1024);
      const g = DATA.guidelines.find(x => x.id === b.id);
      if(!g) return send(res, 404, { error: '지침을 찾지 못했어요.' });
      if(typeof b.text === 'string'){ const t = cleanText(b.text, 600).trim(); if(!t) return send(res, 400, { error: '지침 내용이 비어 있어요.' }); g.text = t; }
      if(typeof b.active === 'boolean') g.active = b.active;
      g.updatedAt = new Date().toISOString(); saveData(DATA); return send(res, 200, g);
    }
    if(req.method === 'POST' && url.pathname === '/api/guidelines/delete'){
      const b = await readBody(req, 8 * 1024);
      const before = DATA.guidelines.length; DATA.guidelines = DATA.guidelines.filter(x => x.id !== b.id);
      if(DATA.guidelines.length === before) return send(res, 404, { error: '지침을 찾지 못했어요.' });
      saveData(DATA); return send(res, 200, { ok: true });
    }
    if(req.method === 'POST' && url.pathname === '/api/chat'){
      const body = await readBody(req, 512 * 1024);
      try{ return send(res, 200, await chat(Array.isArray(body.messages) ? body.messages : [])); }
      catch(e){ console.error('[AI 오류]', e.status || '', e.message); return send(res, 200, { error: friendlyError(e) }); }
    }
    send(res, 404, { error: 'not found' });
  }catch(e){
    console.error('[서버 오류]', e.message);
    send(res, 500, { error: '서버에서 문제가 생겼어요.' });
  }
});

server.on('error', e => {
  if(e.code === 'EADDRINUSE') console.error(`${PORT}번 포트를 이미 쓰고 있어요. 이미 켜진 창이 있는지 확인하거나 .env의 PORT를 바꿔 주세요.`);
  else console.error(e.message);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = `http://localhost:${PORT}`;
  console.log('');
  console.log('  민트 아크릴샵 챗봇이 켜졌어요.');
  console.log(`  주소: ${addr}`);
  console.log(`  모델: ${MODEL}`);
  console.log(`  적용 중인 관리자 지침: ${activeGuides().length}개`);
  console.log(`  API 키: ${apiKey() ? '설정됨' : '없음 (.env 파일을 확인하세요)'}`);
  if(ENV_CREATED) console.log('  .env 파일을 새로 만들었어요. 메모장으로 열어 API 키를 넣고 이 창을 닫았다가 다시 실행하세요.');
  console.log('  끄려면 이 창을 닫거나 Ctrl+C를 누르세요.');
  console.log('');
  if(process.env.OPEN_BROWSER !== 'false'){
    const cmd = process.platform === 'win32' ? `start "" "${addr}"` : process.platform === 'darwin' ? `open "${addr}"` : `xdg-open "${addr}"`;
    exec(cmd, () => {});
  }
});
