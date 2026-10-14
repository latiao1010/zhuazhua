// Public-page research only. Does not read cookies, app state, or private APIs.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const notePattern = /^\/(?:search_result|explore)\/([a-f0-9]{24})(?:\?|$)/;
const root = __dirname;
const read = (name, fallback) => fs.existsSync(path.join(root,name)) ? JSON.parse(fs.readFileSync(path.join(root,name),'utf8')) : fallback;
function write(name, value) {
  const dest = path.join(root,name);
  fs.writeFileSync(dest+'.tmp',JSON.stringify(value,null,2)+'\n');
  fs.renameSync(dest+'.tmp',dest);
}
const emit = value => console.log(JSON.stringify(value));
const minNavigationGapMs = 40000;
const maxSearchesPerSession = 3;
const maxDetailsPerSession = 10;
const maxScrollsPerSession = 20;
const operationTimeoutMs = 30000;
const accessWarningPattern = '访问过于频繁|操作过于频繁|安全验证|请完成验证|滑动验证|登录异常|账号异常|异常登录|账号存在风险|环境异常|账号安全|访问异常';
const loginWarningPattern = '扫码登录|登录后继续|登录后查看搜索结果';
const warningPattern = accessWarningPattern+'|'+loginWarningPattern;
const browserProfile = path.join(root,'../generated/place-research-browser');

function pauseCollection(reason, kind='platform_warning') {
  write('collector-state.json',{...read('collector-state.json',{}),paused:true,reason,blocker_type:kind,paused_at:new Date().toISOString()});
}
async function researchContext() {
  const {chromium} = require('playwright');
  // An isolated, ignored profile retains a user-completed login. Never copy or
  // inspect credentials from the user's regular browser profile.
  fs.mkdirSync(browserProfile,{recursive:true});
  const context=await chromium.launchPersistentContext(browserProfile,{
    channel:'chrome',headless:false,chromiumSandbox:true,timeout:15000,
    viewport:{width:1280,height:900}
  });
  context.setDefaultTimeout(5000);
  context.setDefaultNavigationTimeout(20000);
  return context;
}
async function loginOnly() {
  const verifyOnly=process.argv.includes('--verify');
  pauseCollection(verifyOnly?'Waiting for user to complete the platform identity check in the dedicated browser':'Waiting for user to sign in through the dedicated browser window',verifyOnly?'manual_verification':'manual_login');
  const context=await researchContext();
  let input;
  try {
    const page=context.pages()[0]||await context.newPage();
    // This public verification route was observed in the platform redirect.
    // Keep the original profile and let the user complete the platform flow.
    await page.goto(verifyOnly?'https://www.xiaohongshu.com/website-login/captcha':'https://www.xiaohongshu.com/explore',{waitUntil:'domcontentloaded'});
    emit({login_only:true,verification_only:verifyOnly,collection_paused:true,instruction:'Complete the displayed login or identity check manually, then send confirmLogin. No searches or notes are collected in this mode.'});
    input=readline.createInterface({input:process.stdin,terminal:false});
    for await(const line of input) {
      let command;
      try {command=JSON.parse(line);} catch {emit({failed:true,detail:'Expected a JSON command'});continue;}
      if(command.op==='close') break;
      if(command.op==='snapshot') {
        const screenshot=path.join(require('node:os').tmpdir(),`place-login-${Date.now()}.png`);
        await page.screenshot({path:screenshot,fullPage:false,timeout:5000});
        emit({collection_paused:true,screenshot,url:page.url().split('?')[0],text:(await page.locator('body').innerText()).slice(0,4000)});
        continue;
      }
      if(!['status','confirmLogin'].includes(command.op)) {
        emit({failed:true,detail:'Login mode accepts only snapshot, status, confirmLogin or close'});continue;
      }
      const warning=page.getByText(new RegExp(accessWarningPattern)).first();
      if(await warning.isVisible()) {
        const reason=(await warning.innerText()).match(new RegExp(accessWarningPattern))?.[0]||'Platform access warning';
        pauseCollection(reason);
        emit({blocked:true,reason});break;
      }
      const login=page.getByText(new RegExp(loginWarningPattern)).first();
      const profileLink=page.getByRole('link',{name:'我',exact:true});
      const href=await profileLink.isVisible() ? await profileLink.getAttribute('href') : '';
      const authenticated=!!href && /\/user\/profile\/[a-f0-9]{24}(?:[?#]|$)/.test(href) && !await login.isVisible();
      emit({authenticated,collection_paused:true});
      if(command.op==='confirmLogin' && authenticated) {
        write('collector-state.json',{...read('collector-state.json',{}),paused:false,reason:'User-completed login confirmed by the visible profile link',blocker_type:null,updated_at:new Date().toISOString()});
        emit({login_confirmed:true,collection_started:false});break;
      }
    }
  } finally {
    input?.close();
    process.stdin.pause();
    await context.close().catch(()=>{});
  }
}

// A single readiness check replaces several consecutive selector timeouts.
// It reads rendered text only, without inspecting app state or network APIs.
function visibleContent({kind, title, previousIds = [], warningPattern, waitComments = false}) {
  const body = document.body?.innerText || '';
  const warning=body.match(new RegExp(warningPattern));
  if(warning) return {warning:warning[0]};
  if(kind === 'search') {
    const previous = new Set(previousIds);
    return [...document.querySelectorAll('a[href]')].some(node => {
      const match = (node.getAttribute('href') || '').match(/^\/(?:search_result|explore)\/([a-f0-9]{24})(?:\?|$)/);
      return match && node.getClientRects().length && getComputedStyle(node).visibility!=='hidden' &&
        node.innerText.trim() && !previous.has(match[1]);
    });
  }
  const lines = body.split('\n');
  const titleIndex = lines.findIndex((line, index) => line.trim() === title.trim() &&
    lines.slice(Math.max(0, index - 3), index).some(previous => /^(关注|已关注|互相关注)$/.test(previous.trim())));
  if(titleIndex < 0) return false;
  const contentLines = lines.slice(titleIndex + 1);
  // This snapshot still requires review, especially for image-only notes.
  if(!contentLines.some(line => line.trim())) return false;
  const text = lines.slice(Math.max(0, titleIndex - 2)).join('\n');
  if(waitComments && /(?:^|\n)加载中(?:\n|$)/.test(text)) return false;
  return {title, text:text.slice(0,26000), truncated:text.length>26000};
}

async function main() {
  const control = read('collector-state.json',{paused:true,reason:'Collector state missing'});
  if(control.paused) {
    emit({paused:true,reason:control.reason,paused_at:control.paused_at});
    return;
  }
  const queue = new Map(read('browser-queue.json',[]).map(x=>[x.id,x]));
  const progress = read('search-progress.json',{});
  const links = new Map(); // Observed session URLs stay in memory only.
  const detailCache = new Map(); // Read output is transient; persist reviewed facts separately.
  let scope = {}, blocked = false;
  let savedSignature = '';
  let savedIds = new Set();
  let savedByCity = new Map();
  let queueDirty = false, progressDirty = false;
  let lastNavigationAt = 0, searchCount = 0, detailCount = 0, scrollCount = 0;
  const context = await researchContext();
  const browser = context.browser();
  const searchPage = context.pages()[0]||await context.newPage();
  const workers = [];
  let input;
  async function paceNavigation() {
    const wait=Math.max(0,minNavigationGapMs-(Date.now()-lastNavigationAt));
    if(wait) {
      emit({event:'navigation_wait',wait_ms:wait});
      await delay(wait);
    }
    lastNavigationAt=Date.now();
  }
  function pause(reason) {
    blocked=true;
    pauseCollection(reason);
  }
  function checkpoint() {
    const savedPath = path.join(root,'city-content.json');
    const stat = fs.existsSync(savedPath) ? fs.statSync(savedPath) : null;
    const signature = stat ? `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}` : 'missing';
    if(signature !== savedSignature) {
      const items = read('city-content.json',{items:[]}).items;
      savedIds = new Set(items.map(x=>x.id));
      savedByCity = new Map();
      for(const item of items) savedByCity.set(item.city,(savedByCity.get(item.city)||0)+1);
      savedSignature = signature;
      for(const x of queue.values()) if(savedIds.has(x.id) && x.status!=='content_saved') {
        x.status='content_saved';
        queueDirty=true;
      }
    }
    if(queueDirty) {
      write('browser-queue.json',[...queue.values()]);
      queueDirty=false;
    }
    if(progressDirty) {
      write('search-progress.json',progress);
      progressDirty=false;
    }
  }
  async function guard(page) {
    if((browser && !browser.isConnected()) || page.isClosed()) throw Error('Browser disconnected or page closed; reconnect before continuing');
    const warning = page.getByText(new RegExp(warningPattern)).first();
    if(await warning.isVisible()) {
      pause((await warning.innerText()).match(new RegExp(warningPattern))?.[0]||'Platform warning');
      throw Error('Platform warning observed; collection stopped');
    }
  }
  async function waitForContent(page, args, timeout) {
    const handle = await page.waitForFunction(visibleContent,{...args,warningPattern},{timeout:Math.max(1,timeout),polling:500});
    try {
      const result = await handle.jsonValue();
      if(result?.warning) {
        pause(result.warning);
        throw Error('Platform warning observed; collection stopped');
      }
      return result;
    } finally {
      await handle.dispose();
    }
  }
  async function navigateAndRead(page, url, args) {
    await paceNavigation();
    await guard(page);
    const deadline=Date.now()+operationTimeoutMs;
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:Math.min(20000,deadline-Date.now())});
    await guard(page);
    let content=await waitForContent(page,args,deadline-Date.now());
    // Let rendered comments settle within both the content deadline and the
    // existing navigation interval; do not reload the note for comments.
    const commentWaitMs=Math.min(2500,deadline-Date.now());
    if(args.kind==='detail' && commentWaitMs>0 && /(?:^|\n)加载中(?:\n|$)/.test(content.text)) {
      try {
        content=await waitForContent(page,{...args,waitComments:true},commentWaitMs);
      } catch(error) {
        if(blocked || error.name!=='TimeoutError') throw error;
        // A readable body is still useful when comments have not arrived.
      }
    }
    return content;
  }
  async function discover(persist=true) {
    await guard(searchPage);
    const url = new URL(searchPage.url());
    if(url.pathname!='/search_result' || url.searchParams.get('keyword')!==scope.query) throw Error('Search page mismatch; no results saved');
    const found = await searchPage.locator('a[href]').evaluateAll(nodes=>nodes
      .filter(n=>n.getClientRects().length && getComputedStyle(n).visibility!=='hidden')
      .map(n=>({title:n.innerText.trim(),href:n.getAttribute('href')}))
      .filter(x=>x.title && /^\/(search_result|explore)\/[a-f0-9]{24}(?:\?|$)/.test(x.href)));
    const unique = new Map();
    let added=0;
    for(const link of found) {
      const id=link.href.match(notePattern)[1];
      unique.set(id,{id,title:link.title});
      links.set(id,link);
      const old=queue.get(id);
      const origin={...scope};
      if(old) {
        if(!old.queries) {old.queries=old.query?[old.query]:[];queueDirty=true;}
        if(!old.queries.includes(scope.query)) {old.queries.push(scope.query);queueDirty=true;}
        if(!old.origins) {old.origins=[];queueDirty=true;}
        if(!old.origins.some(x=>x.city===scope.city && x.query===scope.query)) {old.origins.push(origin);queueDirty=true;}
        if(!old.title) {old.title=link.title;queueDirty=true;}
      } else {
        queue.set(id,{id,...scope,title:link.title,url:'https://www.xiaohongshu.com/explore/'+id,queries:[scope.query],origins:[origin],status:savedIds.has(id)?'content_saved':'pending'});
        queueDirty=true;
        added++;
      }
    }
    if(persist) checkpoint();
    return {candidates:[...unique.values()],added,queued:queue.size};
  }
  async function search(command) {
    if(blocked) throw Error('Collection paused after platform warning');
    if(searchCount>=maxSearchesPerSession) throw Error('Search session limit reached; stop and review before another session');
    scope={province:command.province||scope.province,city:command.city||scope.city,category:command.category||'',query:command.query};
    if(!scope.city || !scope.province || !scope.query) throw Error('province, city and query required');
    searchCount++;
    try {
      await navigateAndRead(searchPage,'https://www.xiaohongshu.com/search_result?keyword='+encodeURIComponent(scope.query),{kind:'search'});
    } catch(error) {
      if(blocked) throw error;
      await guard(searchPage);
      progress[scope.city+'::'+scope.query]={...progress[scope.city+'::'+scope.query],...scope,status:'load_timeout',updated_at:new Date().toISOString()};
      progressDirty=true;
      checkpoint();
      throw Error('Search cards did not load; not counted as exhausted');
    }
    return discover();
  }
  async function crawl(command) {
    if(command.continue) {
      if(blocked) throw Error('Collection paused');
      if(!scope.query) throw Error('Search first before continuing');
      await discover(false);
    } else await search(command);
    const key=scope.city+'::'+scope.query;
    const previous=progress[key]||{};
    const seen=new Set(previous.ids||[]), sessionSeen=new Set();
    let idle=0, rounds=0, reason='page_budget_reached';
    const limit=Math.max(1,Math.min(command.maxScrolls||5,10));
    const startedAt=Date.now();
    for(;rounds<limit;rounds++) {
      if(scrollCount>=maxScrollsPerSession) {reason='session_scroll_limit_reached';break;}
      const result=await discover(false);
      let pageNew=0;
      for(const note of result.candidates) {
        if(!sessionSeen.has(note.id)) pageNew++;
        sessionSeen.add(note.id); seen.add(note.id);
      }
      idle=pageNew ? 0 : idle+1;
      progress[key]={...scope,ids:[...seen],rounds:rounds+1,status:'running',updated_at:new Date().toISOString()};
      progressDirty=true;
      checkpoint();
      emit({event:'discovery',query:scope.query,round:rounds+1,unique_seen:seen.size,new_queue:result.added});
      if(idle>=3) {reason='no_new_results_observed';break;}
      if(rounds+1>=limit) break; // Do not fetch an extra page that this command will never read.
      await searchPage.mouse.wheel(0,850);
      scrollCount++;
      try {
        await waitForContent(searchPage,{kind:'search',previousIds:[...sessionSeen]},4000);
      } catch(error) {
        if(error.name!=='TimeoutError') throw error;
      }
      await guard(searchPage);
    }
    progress[key]={...progress[key],status:reason,rounds:Math.min(rounds+1,limit),updated_at:new Date().toISOString()};
    progressDirty=true;
    checkpoint();
    return {query:scope.query,status:reason,unique_seen:seen.size,elapsed_seconds:Math.round((Date.now()-startedAt)/1000),nationwide_complete:false};
  }
  async function getWorker(index) {
    if(!workers[index]) workers[index]=await context.newPage();
    return workers[index];
  }
  async function detail(id,index=0) {
    checkpoint();
    const entry=queue.get(id);
    if(!entry) throw Error('Unknown candidate ID');
    if(entry.status==='content_saved') return {id,skipped:'content_saved'};
    if(detailCache.has(id)) return {...detailCache.get(id),cached:true};
    if(blocked) return {id,status:'blocked'};
    const link=links.get(id);
    if(!link) return {id,status:'needs_rediscovery',reason:'Search again for a current observed link'};
    if(detailCount>=maxDetailsPerSession) return {id,status:'session_limit_reached'};
    const page=await getWorker(index);
    entry.attempts=(entry.attempts||0)+1;
    queueDirty=true;
    try {
      detailCount++;
      const content=await navigateAndRead(page,new URL(link.href,'https://www.xiaohongshu.com').href,{kind:'detail',title:link.title});
      const result={id,...content,url:'https://www.xiaohongshu.com/explore/'+id};
      entry.status='detail_read_pending_review';
      entry.last_read_at=new Date().toISOString();
      entry.reason='';
      detailCache.set(id,result);
      checkpoint();
      return result;
    } catch(error) {
      entry.status=blocked?'blocked':'retry_pending';entry.reason=String(error.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,180);
      checkpoint();
      return {id,status:entry.status,error:error.name,detail:entry.reason};
    }
  }
  try {
    await paceNavigation();
    await searchPage.goto('https://www.xiaohongshu.com/explore',{waitUntil:'domcontentloaded',timeout:30000});
    await guard(searchPage);
    emit({ready:true,queued:queue.size});
    input=readline.createInterface({input:process.stdin,terminal:false});
    for await(const line of input) {
    const commandStartedAt=Date.now();
    let operation='invalid';
    try {
      const c=JSON.parse(line);
      operation=c.op;
      checkpoint();
      emit({event:'operation_started',op:operation});
      if(c.op==='search') emit(await search(c));
      else if(c.op==='results') emit(await discover());
      else if(c.op==='crawlSearch') emit(await crawl(c));
      else if(c.op==='continueSearch') emit(await crawl({...c,continue:true}));
      else if(c.op==='crawlCity'||c.op==='crawlCities') throw Error('Bulk city sweeps are disabled; run individual searches after account review');
      else if(c.op==='openNote') emit(await detail(c.id));
      else if(c.op==='batchOpen') {
        const city=c.city||scope.city;
        if(!city) throw Error('Select a city before opening a batch');
        if(c.ids && !Array.isArray(c.ids)) throw Error('ids must be an array');
        const limit=c.limit===undefined?3:c.limit;
        if(!Number.isInteger(limit)||limit<1||limit>3) throw Error('limit must be an integer from 1 to 3');
        const candidates=c.ids||[...queue.keys()];
        const ids=[...new Set(candidates)].filter(id=>{
          const x=queue.get(id);
          return x && (x.city===city||x.origins?.some(origin=>origin.city===city)) &&
            ['pending','detail_read_pending_review'].includes(x.status) && links.has(id) && !detailCache.has(id);
        });
        const count=Math.min(limit,Math.max(0,3-(savedByCity.get(city)||0)));
        for(const id of ids.slice(0,count)) {
          if(blocked) break;
          const result=await detail(id);
          emit(result);
          if(result.status==='session_limit_reached') break;
        }
        emit({event:'batch_finished',city,blocked,remaining_to_target:Math.max(0,3-(savedByCity.get(city)||0)),review_required:true});
      } else if(c.op==='mark') {
        const entry=queue.get(c.id); if(!entry) throw Error('Unknown candidate');
        if(entry.status!==c.status||entry.reason!==(c.reason||'')) {
          entry.status=c.status;entry.reason=c.reason||'';queueDirty=true;
        }
        checkpoint();emit({marked:c.id,status:c.status});
      } else if(c.op==='status') {
        checkpoint();const counts={};
        for(const x of queue.values()) {const key=x.city+' / '+x.status;counts[key]=(counts[key]||0)+1;}
        emit({counts,blocked,searches:Object.values(progress).map(({ids,...x})=>({...x,unique_seen:ids?.length||0}))});
      } else if(c.op==='snapshot') {
        const page=workers[0]||searchPage;
        await guard(page);
        emit({url:page.url().split('?')[0],text:(await page.locator('body').innerText()).slice(0,26000)});
      } else if(c.op==='captureNote') {
        const page=workers[0];
        const link=links.get(c.id);
        if(!page || !link) throw Error('Open an observed note before capturing it');
        await guard(page);
        const current=await page.evaluate(visibleContent,{kind:'detail',title:link.title,warningPattern});
        if(current?.warning) {pause(current.warning);throw Error('Platform warning observed; collection stopped');}
        if(!current) throw Error('Current note does not match the requested note');
        const screenshot=path.join(require('node:os').tmpdir(),`place-note-${c.id}-${Date.now()}.png`);
        await page.screenshot({path:screenshot,fullPage:false,timeout:10000});
        emit({id:c.id,screenshot,scope:'currently visible page only; unread carousel images are not included'});
      } else if(c.op==='resume') throw Error('Automatic resume disabled after account warning');
      else if(c.op==='close') {checkpoint();break;}
      else throw Error('Unknown operation');
    } catch(error) {
      // Preserve the visible blocker before closing, so it can be reviewed
      // without repeating the blocked request. This does not navigate or retry.
      if(blocked) {
        for(const page of [...workers,searchPage]) {
          if(page.isClosed()) continue;
          try {
            const body=await page.locator('body').innerText({timeout:2000});
            const match=body.match(new RegExp(warningPattern));
            if(!match) continue;
            const screenshot=path.join(require('node:os').tmpdir(),`place-collector-blocker-${Date.now()}.png`);
            await page.screenshot({path:screenshot,fullPage:false,timeout:5000});
            emit({event:'platform_warning_evidence',screenshot,
              text:body.slice(Math.max(0,match.index-120),match.index+240),
              url:page.url().split('?')[0]});
            break;
          } catch(captureError) {
            emit({event:'blocker_capture_unavailable',error:captureError.name});
          }
        }
      }
      emit({failed:true,error:error.name,detail:String(error.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,250),blocked});
    } finally {
      checkpoint();
      emit({event:'operation_finished',op:operation,elapsed_ms:Date.now()-commandStartedAt});
    }
      if(blocked) break;
    }
  } finally {
    input?.close();
    process.stdin.pause();
    try {checkpoint();} finally {await context.close().catch(()=>{});}
  }
}
(process.argv.includes('--login')?loginOnly():main()).catch(error=>{
  emit({failed:true,error:error.name,detail:String(error.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,250)});
  process.exitCode=1;
});
