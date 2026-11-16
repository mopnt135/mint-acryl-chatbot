# Firebase(스파크 요금제)용 화면을 만들어요.
# demo/index.html을 바탕으로, 가상 쇼핑몰 데이터 저장 위치만 브라우저 대신 Firestore로 바꿔요.
# 실행: python tools/build_demo.py && python tools/build_firebase.py
import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..') + '/'
s = open(ROOT + 'demo/index.html', encoding='utf-8').read()

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

# 1) 저장소: localStorage -> Firestore 문서 하나(shop/data)
rep('''    function save(){ try{ localStorage.setItem(KEY, JSON.stringify(D)); }catch(e){} }
    D = load(); save();''', '''    // ----- Firestore 저장 (Firebase Hosting이 주는 /__/firebase/init.json 설정을 써요) -----
    let FS = null, saveTimer = null, saveChain = Promise.resolve();
    const fsUrl = () => `https://firestore.googleapis.com/v1/projects/${FS.projectId}/databases/(default)/documents/shop/data?key=${FS.apiKey}`;
    function localSave(){ try{ localStorage.setItem(KEY, JSON.stringify(D)); }catch(e){} }
    async function pull(){
      if(!FS) return;
      const r = await fetch(fsUrl());
      if(r.status === 404){ await push(); return; }
      if(!r.ok) throw new Error('Firestore 읽기 실패 ' + r.status);
      const j = await r.json();
      const d = JSON.parse(((j.fields || {}).json || {}).stringValue || 'null');
      if(d && Array.isArray(d.products)){ if(!Array.isArray(d.guidelines)) d.guidelines = []; D = d; }
    }
    async function push(){
      if(!FS) return;
      const r = await fetch(fsUrl(), {method:'PATCH', headers:{'content-type':'application/json'},
        body: JSON.stringify({fields:{json:{stringValue: JSON.stringify(D)}, updatedAt:{timestampValue: new Date().toISOString()}}})});
      if(!r.ok) throw new Error('Firestore 저장 실패 ' + r.status);
    }
    function save(){
      localSave();
      if(!FS) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { saveTimer = null; saveChain = saveChain.then(push).catch(e => { console.error(e); if(window.__mintSay) window.__mintSay('공용 저장소(Firestore)에 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.', true); }); }, 300);
    }
    async function flush(){ if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; saveChain = saveChain.then(push); } await saveChain.catch(() => {}); }
    D = load();
    const READY = (async () => {
      try{
        const r = await fetch('/__/firebase/init.json');
        if(r.ok){ const c = await r.json(); if(c.projectId && c.apiKey) FS = {projectId: c.projectId, apiKey: c.apiKey}; }
      }catch(e){}
      try{ await pull(); }catch(e){ console.error(e); FS_ERR = true; }
      localSave();
    })();
    let FS_ERR = false;
    const storeInfo = () => FS ? (FS_ERR ? 'Firestore 연결 실패, 이 브라우저에만 저장 중' : '가상 쇼핑몰 데이터는 Firebase Firestore에 저장돼요') : 'Firebase 밖에서 열려서 이 브라우저에만 저장돼요';''')

# 2) 요청마다 Firestore 준비를 기다리고, 데이터를 읽을 때는 최신으로 다시 가져와요
rep('''    async function handle(path, body){
      if(path !== '/api/chat') await new Promise(r => setTimeout(r, 60));''', '''    async function handle(path, body){
      await READY;
      if(path === '/api/bootstrap' || (path === '/api/data' && body === undefined) || (path === '/api/guidelines' && body === undefined)){
        await flush(); try{ await pull(); }catch(e){ console.error(e); }
      }
      if(path === '/api/chat'){ await flush(); try{ await pull(); }catch(e){} }''')
rep("return {schema: SEED.schema, defaults: SEED.settingsDefault, data: clone(D), model: AI.model, hasKey: !!AI.key, demo: true};",
    "return {schema: SEED.schema, defaults: SEED.settingsDefault, data: clone(D), model: AI.model, hasKey: !!AI.key, demo: true, store: storeInfo()};")
rep("    return {handle, ruleChat};\n  })();", "    return {handle, ruleChat, storeInfo};\n  })();")

rep("  function say(t, err){ $('msg').textContent = t || ''; $('msg').classList.toggle('err', !!err); }",
    "  function say(t, err){ $('msg').textContent = t || ''; $('msg').classList.toggle('err', !!err); }\n  window.__mintSay = say;")

# 3) 화면 문구
rep('<p class="sub" id="headSub">내 컴퓨터에서 실행 중이에요. 데이터는 폴더 안 data.json 파일에 저장돼요.</p>',
    '<p class="sub" id="headSub">Firebase에 연결하는 중이에요.</p>')
rep('이 파일은 키를 이 컴퓨터의 브라우저에서 바로 사용해요.', '이 사이트는 키를 서버에 저장하지 않고 내 브라우저에서 Anthropic으로 바로 보내요.')
rep("""    $('headSub').textContent = a.hasKey ? `AI 연결됨 · 모델 ${a.model} · 키 끝자리 ${a.keyTail}${a.remember ? ' · 이 브라우저에 기억 중' : ' · 창을 닫으면 키를 잊어요'}` : 'AI가 꺼져 있어요. 오른쪽 위 "AI 설정"에서 API 키를 넣어 주세요.';""",
    """    $('headSub').textContent = (a.hasKey ? `AI 연결됨 · 모델 ${a.model} · 키 끝자리 ${a.keyTail}${a.remember ? ' · 이 브라우저에 기억 중' : ' · 창을 닫으면 키를 잊어요'}` : 'AI가 꺼져 있어요. 오른쪽 위 "AI 설정"에서 API 키를 넣어 주세요.') + ' · ' + DemoServer.storeInfo();""")

os.makedirs(ROOT + 'firebase/public', exist_ok=True)
open(ROOT + 'firebase/public/index.html', 'w', encoding='utf-8').write(s)
print('built firebase/public/index.html', len(s))
