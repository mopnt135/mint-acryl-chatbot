import json
import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
s = open(ROOT + 'public/index.html').read()
demo = open(ROOT + 'tools/demo_server.js').read()
seed = json.load(open(ROOT + 'seed.json'))
demo = demo.replace('/*SEED_JSON*/null', json.dumps(seed, ensure_ascii=False).replace('</', '<\\/'))

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep('''  async function api(path, body){
    const r = await fetch(path, body === undefined ? {} : {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.error || '서버 오류');
    return j;
  }''', demo + '\n  async function api(path, body){ return DemoServer.handle(path, body); }')

rep('<title>민트 아크릴샵</title>', '<title>민트 아크릴샵 AI 챗봇</title>')
rep('<button id="exportBtn">데이터 내보내기</button>', '<button id="aiBtn" class="ai-btn">AI 설정</button>\n      <button id="exportBtn">데이터 내보내기</button>')

rep('''  <div class="views">''', '''  <form class="form ai-panel" id="aiPanel" hidden>
    <div class="set-h">AI 설정 <small>Anthropic API 키를 넣으면 AI가 직접 답해요. 키는 Anthropic 서버로만 보내요.</small></div>
    <label class="full">API 키<input name="key" type="password" autocomplete="off" placeholder="sk-ant-로 시작하는 키를 붙여 넣으세요"></label>
    <label>모델 이름<input name="model" placeholder="claude-sonnet-4-5"></label>
    <label class="chk-row full"><input name="remember" type="checkbox"> 이 브라우저에 키 기억하기 <small>개인 PC에서만 켜세요</small></label>
    <div class="full ai-warn">이 파일은 키를 이 컴퓨터의 브라우저에서 바로 사용해요. 공용 PC에서는 "기억하기"를 끄고, 다 쓰면 "키 지우기"를 누르세요. 질문할 때마다 API 요금이 나와요.</div>
    <div class="acts"><button type="button" class="cancel" id="aiClear">키 지우기</button><button type="button" class="cancel" id="aiClose">닫기</button><button type="button" class="save" data-submit>저장</button></div>
  </form>

  <div class="views">''')

rep('  @media (max-width:768px){\n    .kpis', '''  .ai-btn{border-color:var(--brand) !important;color:var(--brand) !important}
  .ai-panel{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));margin-bottom:16px}
  .ai-panel[hidden]{display:none}
  .ai-panel .chk-row{flex-direction:row;align-items:center;gap:6px;color:#ddd}
  .ai-warn{font-size:12px;color:#f5c26b;line-height:1.6}
  @media (max-width:768px){
    .kpis''')

rep("      if(!b.hasKey) $('headSub').textContent = 'API 키가 아직 없어요. 폴더의 .env 파일에 키를 넣고 서버를 다시 실행하세요.';\n      else $('headSub').textContent = `내 컴퓨터에서 실행 중이에요. 모델: ${b.model}. 데이터는 폴더 안 data.json에 저장돼요.`;",
    "      await aiHead(); if(!b.hasKey) openAI();")

rep("  (async () => {\n    try{\n      const b = await api('/api/bootstrap');", '''  // ----- AI 설정 화면 -----
  async function aiHead(){
    const a = await api('/api/ai');
    $('headSub').textContent = a.hasKey ? `AI 연결됨 · 모델 ${a.model} · 키 끝자리 ${a.keyTail}${a.remember ? ' · 이 브라우저에 기억 중' : ' · 창을 닫으면 키를 잊어요'}` : 'AI가 꺼져 있어요. 오른쪽 위 "AI 설정"에서 API 키를 넣어 주세요.';
  }
  async function openAI(){
    const a = await api('/api/ai'); const f = $('aiPanel');
    f.elements.key.value = ''; f.elements.key.placeholder = a.hasKey ? `저장된 키 사용 중 (끝자리 ${a.keyTail}). 바꿀 때만 새로 입력` : 'sk-ant-로 시작하는 키를 붙여 넣으세요';
    f.elements.model.value = a.model; f.elements.remember.checked = a.remember; f.hidden = false; f.elements.key.focus();
  }
  $('aiBtn').onclick = () => { if($('aiPanel').hidden) openAI(); else $('aiPanel').hidden = true; };
  $('aiClose').onclick = () => { $('aiPanel').hidden = true; };
  $('aiClear').onclick = async () => { await api('/api/ai/set', {key:'', model:$('aiPanel').elements.model.value, remember:false}); await aiHead(); openAI(); say('키를 지웠어요.'); };
  bindSubmit($('aiPanel'), async () => {
    const f = $('aiPanel'); const cur = await api('/api/ai');
    const key = f.elements.key.value.trim();
    if(!key && !cur.hasKey){ f.elements.key.focus(); f.elements.key.placeholder = '키를 먼저 붙여 넣어 주세요'; return; }
    if(key && !/^sk-/.test(key)){ f.elements.key.value = ''; f.elements.key.placeholder = 'sk-로 시작하는 키가 아니에요. 다시 확인해 주세요'; return; }
    await api('/api/ai/set', {key: key, model: f.elements.model.value, remember: f.elements.remember.checked, keep: !key});
    f.hidden = true; await aiHead();
  });

  (async () => {
    try{
      const b = await api('/api/bootstrap');''')
open(ROOT + 'demo/index.html', 'w').write(s)
print('built', len(s))
