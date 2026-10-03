"""Merge read note summaries into the city database and a readable report."""
import json
import sqlite3
from collections import Counter
from pathlib import Path

root = Path(__file__).resolve().parent
path = root / 'city-content.json'
catalog = json.loads((root / 'city-targets.json').read_text())
target_cities = catalog['cities']
first_pass_target = catalog['first_pass_target_per_city']
data = json.loads(path.read_text())
items = {item['id']: item for item in data['items']}
for source in sorted(root.glob('content-*.json')):
    item = json.loads(source.read_text())
    items[item['id']] = item
data['items'] = list(items.values())
for record in items.values():
    missing = {'id', 'province', 'city', 'title', 'author', 'date_text', 'url', 'summary', 'places', 'verification_status'} - record.keys()
    if missing:
        raise ValueError(f"Incomplete record {record.get('id')}: {sorted(missing)}")
temporary = path.with_suffix('.json.tmp')
temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
temporary.replace(path)
with sqlite3.connect(root.parent / 'generated/place-research.sqlite3') as db:
    db.execute('CREATE TABLE IF NOT EXISTS city_post_content(id TEXT PRIMARY KEY, province TEXT, city TEXT, payload TEXT NOT NULL)')
    db.executemany('INSERT OR REPLACE INTO city_post_content VALUES (?,?,?,?)',
                   [(x['id'], x['province'], x['city'], json.dumps(x, ensure_ascii=False)) for x in items.values()])
    # Keep actually read but unlocated content without inflating the valid-note
    # count or publishing a guessed venue into the outing catalog.
    db.execute('CREATE TABLE IF NOT EXISTS city_pending_content(id TEXT PRIMARY KEY, province TEXT, city TEXT, payload TEXT NOT NULL)')
    for source in sorted(root.glob('pending-content-*.json')):
        record = json.loads(source.read_text())
        if record['id'] not in items:
            db.execute('INSERT OR REPLACE INTO city_pending_content VALUES (?,?,?,?)',
                       (record['id'], record['province'], record['city'], json.dumps(record, ensure_ascii=False)))
    db.execute('DELETE FROM city_pending_content WHERE id IN (SELECT id FROM city_post_content)')
    db.execute('CREATE TABLE IF NOT EXISTS collection_queue(id TEXT PRIMARY KEY, province TEXT, city TEXT, title TEXT, category TEXT, query TEXT, status TEXT DEFAULT \'pending\')')
    for queue_path in sorted(root.glob('*-queue.json')):
        queue = json.loads(queue_path.read_text())
        if isinstance(queue, dict):
            queue = queue.get('items', [])
        for candidate in queue:
            db.execute('''INSERT INTO collection_queue(id,province,city,title,category,query,status) VALUES (?,?,?,?,?,?,?)
                       ON CONFLICT(id) DO UPDATE SET status=CASE WHEN collection_queue.status='content_saved' THEN 'content_saved' ELSE excluded.status END''',
                       (candidate['id'], candidate.get('province'), candidate.get('city'), candidate.get('title'),
                        candidate.get('category'), candidate.get('query'), candidate.get('status', 'pending')))
    db.executemany('INSERT OR IGNORE INTO collection_queue(id,province,city,title,category,query,status) VALUES (?,?,?,?,?,?,?)',
                   [(x['id'], x['province'], x['city'], x['title'],
                     '/'.join(dict.fromkeys(p['category'] for p in x['places'])),
                     x.get('search_query', ''), 'content_saved') for x in items.values()])
    db.execute("UPDATE collection_queue SET status='content_saved' WHERE id IN (SELECT id FROM city_post_content)")
    queue_rows = db.execute('SELECT city,status,COUNT(*) FROM collection_queue GROUP BY city,status').fetchall()
browser_queue = root / 'browser-queue.json'
if browser_queue.exists():
    candidates = json.loads(browser_queue.read_text())
    for candidate in candidates:
        if candidate['id'] in items:
            candidate['status'] = 'content_saved'
    temporary = browser_queue.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(candidates, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(browser_queue)
progress = {'scope': catalog['scope'], 'source': catalog['source'],
            'first_pass_target_per_city': first_pass_target, 'cities': []}
saved_by_city = {}
for item in items.values():
    saved_by_city.setdefault(item['city'], []).append(item)
for target in target_cities:
    city = target['city']
    notes = saved_by_city.get(city, [])
    progress['cities'].append({'code': target['code'], 'province': target['province'],
                              'city': city, 'complete': False,
                              'first_pass_complete': len(notes) >= first_pass_target,
                              'content_saved': len(notes),
                              'first_pass_target': first_pass_target,
                              'remaining_to_first_pass_target': max(0, first_pass_target - len(notes)),
                              'queue_status_counts': {status: count for qcity, status, count in queue_rows if qcity == city},
                              'query_content_counts': dict(Counter(x.get('search_query', '') for x in notes)),
                              'queries_with_content': sorted({x.get('search_query', '') for x in notes}),
                              'saved_ids': [x['id'] for x in notes]})
progress['target_city_count'] = len(target_cities)
progress['first_pass_complete_city_count'] = sum(x['first_pass_complete'] for x in progress['cities'])
progress['remaining_content_to_first_pass_target'] = sum(x['remaining_to_first_pass_target'] for x in progress['cities'])
(root / 'collection-progress.json').write_text(json.dumps(progress, ensure_ascii=False, indent=2) + '\n')
beijing_path = root / 'beijing-collection-progress.json'
if beijing_path.exists():
    previous = json.loads(beijing_path.read_text())
    for attempt in previous.get('detail_attempts', []):
        if attempt['id'] in items:
            attempt.update(status='content_saved', reason='', content_file='city-content.json')
    for query in previous.get('queries', []):
        count = sum(x.get('search_query') == query['query'] for x in items.values())
        if count:
            query.update(status='已保存部分正文，未采完', content_saved=count)
    previous['content_saved'] = sum(x['city'] == '北京市' for x in items.values())
    beijing_path.write_text(json.dumps(previous, ensure_ascii=False, indent=2) + '\n')
lines = ['# 逐城市采集：已读笔记内容', '',
         '仅列出已打开、实际读到正文的笔记。以下为内容转述及地点事实，非原文转载。不同帖子涉及同一地点时分别保留。', '',
         f'已保存 {len(items)} 篇；{progress["first_pass_complete_city_count"]}/{progress["target_city_count"]} 个目标城市达到每城 3 篇首轮目标。还差 {progress["remaining_content_to_first_pass_target"]} 篇。首轮目标不代表采完。',
         '', '城市范围：' + catalog['scope'], '']
lines += ['| 省份 | 城市 | 已保存正文 | 首轮进度 |', '|---|---|---:|---|']
for city_progress in progress['cities']:
    lines.append(f"| {city_progress['province']} | {city_progress['city']} | {city_progress['content_saved']} | "
                 f"{'已达 3 篇' if city_progress['first_pass_complete'] else '待补 ' + str(city_progress['remaining_to_first_pass_target']) + ' 篇'} |")
lines += ['', '正文已读不等于地点已核实；未具名地点、政策冲突及限制见各条核验状态。', '']
for x in items.values():
    lines += [f"## {x['city']} · {x['title']}", '',
              f"作者：{x['author']}；页面时间：{x['date_text']}；[原帖]({x['url']})", '', x['summary'], '',
              '| 地点 | 文中位置 | 文中地址 | 类型 | 携宠内容 |', '|---|---|---|---|---|']
    for p in x['places']:
        values = [p['name'], p.get('location_text') or '未提供', p.get('address') or '未提供', p['category'], p['conditions']]
        lines.append('| ' + ' | '.join(v.replace('|', '｜').replace('\n', ' ') for v in values) + ' |')
    lines += ['', '评论补充：' + '；'.join(x.get('comment_notes', [])), '',
              '核验状态：' + x['verification_status'], '']
(root.parent.parent / 'docs/research/city-post-content.md').write_text('\n'.join(lines))
print(f'Saved {len(items)} content records.')
