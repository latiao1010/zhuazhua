// Public-page research only. Does not read cookies, app state, or private APIs.
const {chromium} = require('playwright');
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
const minNavigationGapMs = 20000;
const maxSearchesPerSession = 3;
const maxDetailsPerSession = 10;
const maxScrollsPerSession = 20;

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
  let savedMtime = 0;
  let savedIds = new Set();
  let lastNavigationAt = 0, searchCount = 0, detailCount = 0, scrollCount = 0;
  const browser = await chromium.launch({channel:'chrome',headless:false,chromiumSandbox:true});
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  const searchPage = await context.newPage();
  const workers = [];
  async function paceNavigation() {
    const wait=Math.max(0,minNavigationGapMs-(Date.now()-lastNavigationAt));
    if(wait) await delay(wait);
    lastNavigationAt=Date.now();
  }
  function pause(reason) {
    blocked=true;
    write('collector-state.json',{paused:true,reason,paused_at:new Date().toISOString()});
  }
  function checkpoint() {
    const savedPath = path.join(root,'city-content.json');
    const mtime = fs.existsSync(savedPath) ? fs.statSync(savedPath).mtimeMs : 0;
    if(mtime !== savedMtime) {
      savedIds = new Set(read('city-content.json',{items:[]}).items.map(x=>x.id));
      savedMtime = mtime;
    }
    for(const x of queue.values()) if(savedIds.has(x.id)) x.status='content_saved';
    write('browser-queue.json',[...queue.values()]);
    write('search-progress.json',progress);
  }
  async function guard(page) {
    const warning = page.getByText(/访问过于频繁|操作过于频繁|安全验证|请完成验证|滑动验证|扫码登录|登录后继续|登录后查看搜索结果|登录异常|账号异常|异常登录|账号存在风险|环境异常|账号安全|访问异常/).first();
    if(await warning.isVisible().catch(()=>false)) {
      pause('Login, account, or platform access warning observed');
      throw Error('Platform warning observed; collection stopped');
    }
  }
  async function discover(persist=true) {
    await guard(searchPage);
    const url = new URL(searchPage.url());
    if(url.pathname!='/search_result' || url.searchParams.get('keyword')!==scope.query) throw Error('Search page mismatch; no results saved');
    const found = await searchPage.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>({title:n.innerText.trim(),href:n.getAttribute('href')})).filter(x=>x.title && /^\/(search_result|explore)\/[a-f0-9]{24}(?:\?|$)/.test(x.href)));
    const unique = new Map();
    let added=0;
    for(const link of found) {
      const id=link.href.match(notePattern)[1];
      unique.set(id,{id,title:link.title});
      links.set(id,link);
      const old=queue.get(id);
      const origin={...scope};
      if(old) {
        old.queries=[...new Set([...(old.queries||[old.query]),scope.query])];
        old.origins ||= [];
        if(!old.origins.some(x=>x.city===scope.city && x.query===scope.query)) old.origins.push(origin);
        if(!old.title) old.title=link.title;
      } else {
        queue.set(id,{id,...scope,title:link.title,url:'https://www.xiaohongshu.com/explore/'+id,queries:[scope.query],origins:[origin],status:'pending'});
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
    await paceNavigation();
    searchCount++;
    await searchPage.goto('https://www.xiaohongshu.com/search_result?keyword='+encodeURIComponent(scope.query),{waitUntil:'domcontentloaded',timeout:30000});
    await guard(searchPage);
    try {
      await searchPage.locator('a.title[href^="/search_result/"]').first().waitFor({timeout:45000});
    } catch(error) {
      await guard(searchPage);
      progress[scope.city+'::'+scope.query]={...progress[scope.city+'::'+scope.query],...scope,status:'load_timeout',updated_at:new Date().toISOString()};
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
      checkpoint();
      emit({event:'discovery',query:scope.query,round:rounds+1,unique_seen:seen.size,new_queue:result.added});
      if(idle>=3) {reason='no_new_results_observed';break;}
      await searchPage.mouse.wheel(0,850);
      scrollCount++;
      await delay(idle ? 6000 : 4000);
      await guard(searchPage);
    }
    progress[key]={...progress[key],status:reason,rounds:Math.min(rounds+1,limit),updated_at:new Date().toISOString()};
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
    try {
      await paceNavigation();
      detailCount++;
      await page.goto(new URL(link.href,'https://www.xiaohongshu.com').href,{waitUntil:'domcontentloaded',timeout:25000});
      await guard(page);
      await page.getByText(link.title,{exact:true}).first().waitFor({timeout:12000});
      // Body readability is sufficient; do not block on a comment composer or image downloads.
      await page.waitForFunction(()=>document.body.innerText.includes('关注\n'),null,{timeout:10000});
      await guard(page);
      const full=await page.locator('body').innerText();
      const lines=full.split('\n');
      const titleIndex=lines.findIndex((line,index)=>line.trim()===link.title.trim() &&
        lines.slice(Math.max(0,index-3),index).some(previous=>previous.trim()==='关注'));
      if(titleIndex<0) throw Error('Article title and body were not found together; retry later');
      const text=lines.slice(Math.max(0,titleIndex-2)).join('\n');
      const result={id,title:await page.title(),url:page.url().split('?')[0],text:text.slice(0,26000),truncated:text.length>26000};
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
    const input=readline.createInterface({input:process.stdin,terminal:false});
    for await(const line of input) {
    try {
      const c=JSON.parse(line);
      if(c.op==='search') emit(await search(c));
      else if(c.op==='results') emit(await discover());
      else if(c.op==='crawlSearch') emit(await crawl(c));
      else if(c.op==='continueSearch') emit(await crawl({...c,continue:true}));
      else if(c.op==='crawlCity'||c.op==='crawlCities') throw Error('Bulk city sweeps are disabled; run individual searches after account review');
      else if(c.op==='openNote') emit(await detail(c.id));
      else if(c.op==='batchOpen') {
        const ids=c.ids || [...queue.values()].filter(x=>(!c.city||x.city===c.city||x.origins?.some(origin=>origin.city===c.city)) && ['pending','detail_read_pending_review'].includes(x.status) && links.has(x.id)).map(x=>x.id);
        const count=Math.min(c.limit||3,3);
        for(const id of ids.slice(0,count)) {
          if(blocked) break;
          emit(await detail(id));
          await delay(2000);
        }
        emit({event:'batch_finished',blocked});
      } else if(c.op==='mark') {
        const entry=queue.get(c.id); if(!entry) throw Error('Unknown candidate');
        entry.status=c.status;entry.reason=c.reason||'';checkpoint();emit({marked:c.id,status:c.status});
      } else if(c.op==='status') {
        checkpoint();const counts={};
        for(const x of queue.values()) {const key=x.city+' / '+x.status;counts[key]=(counts[key]||0)+1;}
        emit({counts,blocked,searches:Object.values(progress).map(({ids,...x})=>({...x,unique_seen:ids?.length||0}))});
      } else if(c.op==='snapshot') {
        const page=workers[0]||searchPage;
        emit({url:page.url().split('?')[0],text:(await page.locator('body').innerText()).slice(0,26000)});
      } else if(c.op==='resume') throw Error('Automatic resume disabled after account warning');
      else if(c.op==='close') {checkpoint();break;}
      else throw Error('Unknown operation');
    } catch(error) {
      emit({failed:true,error:error.name,detail:String(error.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,250),blocked});
    }
      if(blocked) break;
    }
  } finally {
    await browser.close().catch(()=>{});
  }
}
main().catch(error=>{emit({failed:true,error:error.name});process.exitCode=1;});
