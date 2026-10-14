"""Merge read note summaries into the city database and a readable report."""
import argparse
import json
import sqlite3
from collections import Counter
from pathlib import Path
from time import perf_counter


def write_if_changed(destination, text):
    encoded = text.encode('utf-8')
    if destination.exists() and destination.read_bytes() == encoded:
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + '.tmp')
    temporary.write_bytes(encoded)
    temporary.replace(destination)
    return True


started_at = perf_counter()
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sources', nargs='+', metavar='FILE',
                    help='Merge only these content-*.json files into the saved aggregate; default: scan all content files.')
args = parser.parse_args()

root = Path(__file__).resolve().parent
path = root / 'city-content.json'
catalog = json.loads((root / 'city-targets.json').read_text())
target_cities = catalog['cities']
first_pass_target = catalog['first_pass_target_per_city']
data = json.loads(path.read_text())
items = {item['id']: item for item in data['items']}
if args.sources:
    sources = []
    for name in args.sources:
        source = Path(name)
        if not source.is_absolute() and not source.is_file():
            source = root / source
        source = source.resolve()
        if source.parent != root or not source.name.startswith('content-') or source.suffix != '.json':
            parser.error('--sources must name content-*.json files in server/place-research')
        if not source.is_file():
            parser.error(f'Source file does not exist: {source.name}')
        sources.append(source)
    sources = sorted(set(sources))
else:
    sources = sorted(root.glob('content-*.json'))
for source in sources:
    item = json.loads(source.read_text())
    items[item['id']] = item
data['items'] = list(items.values())
for record in items.values():
    missing = {'id', 'province', 'city', 'title', 'author', 'date_text', 'url', 'summary', 'places', 'verification_status'} - record.keys()
    if missing:
        raise ValueError(f"Incomplete record {record.get('id')}: {sorted(missing)}")
database = root.parent / 'generated/place-research.sqlite3'
database.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(database) as db:
    db.execute('CREATE TABLE IF NOT EXISTS city_post_content(id TEXT PRIMARY KEY, province TEXT, city TEXT, payload TEXT NOT NULL)')
    before = db.total_changes
    db.executemany('''INSERT INTO city_post_content VALUES (?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET province=excluded.province,city=excluded.city,payload=excluded.payload
                   WHERE city_post_content.payload IS NOT excluded.payload
                     OR city_post_content.province IS NOT excluded.province
                     OR city_post_content.city IS NOT excluded.city''',
                   [(x['id'], x['province'], x['city'], json.dumps(x, ensure_ascii=False)) for x in items.values()])
    content_changes = db.total_changes - before
    # Keep actually read but unlocated content without inflating the valid-note
    # count or publishing a guessed venue into the outing catalog.
    db.execute('CREATE TABLE IF NOT EXISTS city_pending_content(id TEXT PRIMARY KEY, province TEXT, city TEXT, payload TEXT NOT NULL)')
    for source in sorted(root.glob('pending-content-*.json')):
        record = json.loads(source.read_text())
        if record['id'] not in items:
            db.execute('''INSERT INTO city_pending_content VALUES (?,?,?,?)
                       ON CONFLICT(id) DO UPDATE SET province=excluded.province,city=excluded.city,payload=excluded.payload
                       WHERE city_pending_content.payload IS NOT excluded.payload
                         OR city_pending_content.province IS NOT excluded.province
                         OR city_pending_content.city IS NOT excluded.city''',
                       (record['id'], record['province'], record['city'], json.dumps(record, ensure_ascii=False)))
    db.execute('DELETE FROM city_pending_content WHERE id IN (SELECT id FROM city_post_content)')
    db.execute('CREATE TABLE IF NOT EXISTS collection_queue(id TEXT PRIMARY KEY, province TEXT, city TEXT, title TEXT, category TEXT, query TEXT, status TEXT DEFAULT \'pending\')')
    browser_candidates = None
    browser_queue_changed = False
    queue_candidates = {}
    for queue_path in sorted(root.glob('*-queue.json')):
        queue = json.loads(queue_path.read_text())
        if isinstance(queue, dict):
            queue = queue.get('items', [])
        if queue_path.name == 'browser-queue.json':
            browser_candidates = queue
            for candidate in queue:
                if candidate['id'] in items and candidate.get('status') != 'content_saved':
                    candidate['status'] = 'content_saved'
                    browser_queue_changed = True
        for candidate in queue:
            status = 'content_saved' if candidate['id'] in items else candidate.get('status', 'pending')
            if candidate['id'] not in queue_candidates:
                queue_candidates[candidate['id']] = [candidate['id'], candidate.get('province'),
                    candidate.get('city'), candidate.get('title'), candidate.get('category'), candidate.get('query'), status]
            elif queue_candidates[candidate['id']][-1] != 'content_saved':
                queue_candidates[candidate['id']][-1] = status
    db.executemany('''INSERT INTO collection_queue(id,province,city,title,category,query,status) VALUES (?,?,?,?,?,?,?)
                       ON CONFLICT(id) DO UPDATE SET status=excluded.status
                       WHERE collection_queue.status IS NOT 'content_saved'
                         AND collection_queue.status IS NOT excluded.status''',
                   queue_candidates.values())
    db.executemany('INSERT OR IGNORE INTO collection_queue(id,province,city,title,category,query,status) VALUES (?,?,?,?,?,?,?)',
                   [(x['id'], x['province'], x['city'], x['title'],
                     '/'.join(dict.fromkeys(p['category'] for p in x['places'])),
                     x.get('search_query', ''), 'content_saved') for x in items.values()])
    db.execute("UPDATE collection_queue SET status='content_saved' WHERE status IS NOT 'content_saved' AND id IN (SELECT id FROM city_post_content)")
    queue_rows = db.execute('SELECT city,status,COUNT(*) FROM collection_queue GROUP BY city,status').fetchall()
# Publish files after the database transaction succeeds; unchanged outputs keep
# their timestamps, so the running collector does not invalidate its saved IDs.
write_if_changed(path, json.dumps(data, ensure_ascii=False, indent=2) + '\n')
if browser_queue_changed:
    write_if_changed(root / 'browser-queue.json', json.dumps(browser_candidates, ensure_ascii=False, indent=2) + '\n')
progress = {'scope': catalog['scope'], 'source': catalog['source'],
            'first_pass_target_per_city': first_pass_target, 'cities': []}
saved_by_city = {}
queue_counts_by_city = {}
for city, status, count in queue_rows:
    queue_counts_by_city.setdefault(city, {})[status] = count
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
                              'queue_status_counts': queue_counts_by_city.get(city, {}),
                              'query_content_counts': dict(Counter(x.get('search_query', '') for x in notes)),
                              'queries_with_content': sorted({x.get('search_query', '') for x in notes}),
                              'saved_ids': [x['id'] for x in notes]})
progress['target_city_count'] = len(target_cities)
progress['first_pass_complete_city_count'] = sum(x['first_pass_complete'] for x in progress['cities'])
progress['remaining_content_to_first_pass_target'] = sum(x['remaining_to_first_pass_target'] for x in progress['cities'])
write_if_changed(root / 'collection-progress.json', json.dumps(progress, ensure_ascii=False, indent=2) + '\n')
beijing_path = root / 'beijing-collection-progress.json'
if beijing_path.exists():
    previous = json.loads(beijing_path.read_text())
    query_counts = Counter(x.get('search_query') for x in items.values())
    for attempt in previous.get('detail_attempts', []):
        if attempt['id'] in items:
            attempt.update(status='content_saved', reason='', content_file='city-content.json')
    for query in previous.get('queries', []):
        count = query_counts[query['query']]
        if count:
            query.update(status='已保存部分正文，未采完', content_saved=count)
    previous['content_saved'] = sum(x['city'] == '北京市' for x in items.values())
    write_if_changed(beijing_path, json.dumps(previous, ensure_ascii=False, indent=2) + '\n')
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
write_if_changed(root.parent.parent / 'docs/research/city-post-content.md', '\n'.join(lines))
print(f'Saved {len(items)} content records; {content_changes} inserted/updated; '
      f'{len(sources)} source files read; {perf_counter() - started_at:.2f}s.')
