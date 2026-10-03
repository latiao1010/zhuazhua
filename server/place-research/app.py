"""Local research database and read-only preview. No third-party dependencies."""
import argparse
import json
import os
import sqlite3
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
DB = ROOT.parent / 'generated' / 'place-research.sqlite3'


def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db


def initialize():
    DB.parent.mkdir(parents=True, exist_ok=True)
    seed = json.loads((ROOT / 'seed.json').read_text())
    with connect() as db:
        db.executescript('''
          CREATE TABLE IF NOT EXISTS posts (
            id TEXT PRIMARY KEY, title TEXT, author TEXT, date_text TEXT,
            date_kind TEXT, collected_at TEXT, published_at TEXT, url TEXT);
          CREATE TABLE IF NOT EXISTS places (
            id TEXT PRIMARY KEY, name TEXT, query TEXT, category TEXT, city TEXT);
          CREATE TABLE IF NOT EXISTS evidence (
            place_id TEXT REFERENCES places(id), post_id TEXT REFERENCES posts(id),
            claim TEXT, caution TEXT, status TEXT, verified_at TEXT,
            PRIMARY KEY(place_id,post_id));
          CREATE TABLE IF NOT EXISTS matches (
            place_id TEXT PRIMARY KEY REFERENCES places(id), status TEXT,
            searched_at TEXT, candidates TEXT, error TEXT);
        ''')
        for p in seed['posts']:
            db.execute('INSERT OR IGNORE INTO posts VALUES (?,?,?,?,?,?,?,?)',
                       (p['id'], p['title'], p['author'], p['date_text'], p['date_kind'],
                        p['collected_at'], None, 'https://www.xiaohongshu.com/search_result/' + p['id']))
        for p in seed['places']:
            db.execute('INSERT OR IGNORE INTO places VALUES (?,?,?,?,?)',
                       tuple(p[k] for k in ('id', 'name', 'query', 'category', 'city')))
            db.execute('INSERT OR IGNORE INTO evidence VALUES (?,?,?,?,?,NULL)',
                       tuple(p[k] for k in ('id', 'post_id', 'claim', 'caution', 'status')))


def api_key():
    key = os.environ.get('AMAP_WEB_SERVICE_KEY', '').strip()
    envfile = ROOT.parent / '.env.local'
    if not key and envfile.exists():
        for line in envfile.read_text().splitlines():
            if line.strip().startswith('AMAP_WEB_SERVICE_KEY='):
                key = line.split('=', 1)[1].strip().strip('\"\'')
    return key


def match():
    key = api_key()
    if not key:
        raise SystemExit('未配置 AMAP_WEB_SERVICE_KEY；未发起请求，未生成虚假匹配。')
    with connect() as db:
        places = db.execute('SELECT * FROM places').fetchall()
    for p in places:
        candidates, error = [], None
        status = '未找到候选'
        params = urlencode(dict(key=key, keywords=p['query'], region=p['city'],
                                city_limit='true', page_size=5, page_num=1, show_fields='business'))
        try:
            with urlopen('https://restapi.amap.com/v5/place/text?' + params, timeout=15) as response:
                result = json.load(response)
            if result.get('status') != '1':
                status, error = '查询失败', '高德错误码：' + str(result.get('infocode', 'unknown'))
            else:
                for poi in result.get('pois', []):
                    candidates.append({k: poi.get(k) for k in
                                       ('id', 'name', 'address', 'location', 'type', 'typecode', 'cityname', 'adname')})
                if candidates:
                    status = '候选待确认'
        except Exception:
            # Never expose exception URLs, which can contain the API key.
            status, error = '查询失败', '网络或响应异常，请检查网络与服务配置后重试。'
        with connect() as db:
            db.execute('INSERT OR REPLACE INTO matches VALUES (?,?,?,?,?)',
                       (p['id'], status, datetime.now(timezone.utc).isoformat(),
                        json.dumps(candidates, ensure_ascii=False), error))
        print(p['name'] + '：' + status)


def data():
    with connect() as db:
        rows = db.execute('''SELECT p.*, e.claim,e.caution,e.status,e.verified_at,
          s.title,s.author,s.date_text,s.date_kind,s.published_at,s.collected_at,s.url,
          m.status AS match_status,m.searched_at,m.candidates,m.error
          FROM places p JOIN evidence e ON e.place_id=p.id JOIN posts s ON s.id=e.post_id
          LEFT JOIN matches m ON m.place_id=p.id ORDER BY p.rowid''').fetchall()
    items = []
    for row in rows:
        item = dict(row)
        item['candidates'] = json.loads(item['candidates'] or '[]')
        item['match_status'] = item['match_status'] or '尚未查询'
        items.append(item)
    return dict(key_configured=bool(api_key()), items=items)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/places':
            body = json.dumps(data(), ensure_ascii=False).encode()
            mime = 'application/json; charset=utf-8'
        elif self.path == '/':
            body = (ROOT / 'index.html').read_bytes()
            mime = 'text/html; charset=utf-8'
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--match', action='store_true')
    parser.add_argument('--init-only', action='store_true')
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    initialize()
    if args.match:
        match()
    elif not args.init_only:
        print('地点研究预览：http://127.0.0.1:' + str(args.port), flush=True)
        HTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
