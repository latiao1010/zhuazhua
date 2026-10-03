"""Build the offline outing catalog from read, paraphrased research records.

Exact city + normalized venue name is the merge key; branch qualifiers are kept.
Policies are hand-reviewed source claims, never current merchant verification.
Run: python3 server/build-outings.py
"""
import hashlib
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'server/place-research'
DEST = ROOT / 'packages/outings'
FIELDS = ('indoor', 'large', 'ground', 'stroller', 'reservation')

# Each rule is tied to a particular source AND venue to avoid copying a mall's
# rules to its restaurants or mistaking an author's equipment for a requirement.
RULES = [
    ('6a0c86eb00000000370365e6', '首钢园香格里拉酒店', {'reservation': 'required'}),
    ('69e4ab6a000000002300488c', '上生新所', {'ground': 'no', 'stroller': 'required'}),
    ('69c26299000000002200016f', '花厨CAFÉ·森邻里（万象天地店）', {'indoor': 'yes'}),
    ('6a8fce4d0000000005029280', 'WanDooo', {'indoor': 'yes'}),
    ('6aaf7f9d0000000029010989', '迎宾公园', {'large': 'yes'}),
    ('6aafb57d00000000260170a5', '爪吧（温榆河公园）', {'reservation': 'required'}),
    ('6a09db720000000036030be1', 'CHEMBOX（五大道店）', {'indoor': 'yes'}),
    ('6a623202000000000a03a2ac', '呋一味・洋食咖啡', {'indoor': 'yes'}),
    ('6a623202000000000a03a2ac', '空间咖啡・登岛计划', {'large': 'yes'}),
    ('6a57837c0000000011004ac8', '山复尔尔咖啡店', {'indoor': 'yes'}),
    ('69b541160000000023013cfd', 'Shining Dinosaur coffee', {'indoor': 'yes'}),
    ('6aa51c620000000029013be7', '遇见爱咖啡馆（森林路店）', {'indoor': 'yes'}),
    ('6923099b0000000019025c18', 'pakupaku', {'stroller': 'used'}),
    ('6933cefe000000001b023e16', '杏花堂（晋商博物院店）', {'stroller': 'used', 'reservation': 'required'}),
    ('698077a8000000000a03f67c', '郭小胖（群力店）', {'reservation': 'required'}),
    ('6a3b728e000000000f017ed3', '杭州中心', {'large': 'yes', 'ground': 'yes'}),
    ('6a3b728e000000000f017ed3', '杭州恒隆广场', {'large': 'no', 'ground': 'no'}),
    ('6a7b23f500000000240274b1', 'Shake Shack（天环）', {'indoor': 'no'}),
]
DENIED_SOURCES = {('6a00813900000000360309b4', '龙歌（雨花万象店）')}

def normalized(value):
    value = unicodedata.normalize('NFKC', value).lower()
    return re.sub(r'[\s·・]', '', value)

def categories(value):
    result = []
    if re.search(r'餐|火锅|烤肉|蛋糕|甜品|鲜食', value):
        result.append('eat')
    if re.search(r'咖啡|酒吧|酒咖|下午茶|茶园', value):
        result.append('coffee')
    if re.search(r'酒店|住宿|民宿', value) and '下午茶' not in value and '酒店餐厅' not in value and '酒廊' not in value:
        result.append('stay')
    if re.search(r'公园|户外|景区|草坪|营地|宠物乐园|农场|沙滩|溪谷|河畔|游船|绿地', value):
        result.append('outdoor')
    if re.search(r'商场|街区|商业区|零售|书店|家居', value):
        result.append('shop')
    return result or ['other']

def build():
    notes = json.loads((SOURCE / 'city-content.json').read_text())['items']
    cities = json.loads((SOURCE / 'city-targets.json').read_text())['cities']
    rules = {(note, name): policy for note, name, policy in RULES}
    found_rules = set()
    groups = {}
    skipped = []
    for note in notes:
        for venue in note['places']:
            name = venue['name'].strip()
            if re.search(r'未具名|未提供正式名称|^不详|^未知', name):
                skipped.append({'noteId': note['id'], 'name': name})
                continue
            key = note['city'] + '|' + normalized(name)
            entry = groups.setdefault(key, {
                'id': hashlib.sha256(key.encode()).hexdigest()[:12],
                'name': name, 'city': note['city'], 'province': note['province'],
                'categories': [], 'addresses': [], 'locations': [], 'sources': [],
            })
            for category in categories(venue['category']):
                if category not in entry['categories']:
                    entry['categories'].append(category)
            for field, source_field in [('addresses', 'address'), ('locations', 'location_text')]:
                value = str(venue.get(source_field) or '').strip()
                if value and value not in entry[field]:
                    entry[field].append(value)
            rule_key = (note['id'], name)
            if rule_key in rules:
                found_rules.add(rule_key)
            if not any(s['noteId'] == note['id'] for s in entry['sources']):
                entry['sources'].append({
                    'noteId': note['id'], 'title': note['title'],
                    'dateText': note['date_text'], 'publishedAt': note.get('published_at'),
                    'collectedAt': note.get('collected_at'),
                    'url': 'https://www.xiaohongshu.com/explore/' + note['id'],
                    'conditions': venue['conditions'],
                    'review': note['verification_status'],
                    'comments': note.get('comment_notes', []),
                    'policy': rules.get(rule_key, {}),
                    'denied': venue['category'] == '不允许携犬的场所' or rule_key in DENIED_SOURCES,
                })
    if set(rules) - found_rules:
        raise ValueError('Policy sources no longer found: ' + repr(set(rules) - found_rules))
    entries = list(groups.values())
    for entry in entries:
        entry['address'] = entry['addresses'][0] if len(entry['addresses']) == 1 else ''
        entry['location'] = entry['address'] or (entry['locations'][0] if entry['locations'] else '具体位置待确认')
        conditions = '；'.join(s['conditions'] for s in entry['sources'])
        review = '；'.join(s['review'] for s in entry['sources'])
        # Restrictions and uncertain branch identities get a prominent review
        # label; they never count as positive matches for access filters.
        needs_review = bool(re.search(r'冲突|拒绝|被拒|不应.*推荐|不再|已禁止|禁止.*进入|并非.*宠物友好|不允许|不能进|只允许|限制大型犬', conditions + review))
        needs_review = needs_review or bool(re.search(r'待核|待确认|未明确|未写明', entry['name'])) or len(entry['addresses']) > 1
        entry['status'] = 'denied' if any(s['denied'] for s in entry['sources']) else 'review' if needs_review else 'pending'
        entry['policy'] = {}
        for field in FIELDS:
            values = {s['policy'][field] for s in entry['sources'] if field in s['policy']}
            entry['policy'][field] = values.pop() if len(values) == 1 else 'conflict' if values else 'unknown'
        entry['verifiedAt'] = None
    entries.sort(key=lambda p: (p['city'], p['name']))
    counts = Counter(p['city'] for p in entries)
    result = {
        'version': 1,
        'updatedAt': max(str(n.get('collected_at') or '') for n in notes),
        'sourceNoteCount': len(notes),
        'cities': [{'name': c['city'], 'province': c['province'], 'count': counts[c['city']]} for c in cities],
        'places': entries,
    }
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / 'catalog.js').write_text('// Generated by server/build-outings.py; source claims, not verified policies.\nmodule.exports = ' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    (SOURCE / 'outings-build-report.json').write_text(json.dumps({'places': len(entries), 'citiesWithData': len(counts), 'skippedUnidentified': skipped, 'statusCounts': dict(Counter(p['status'] for p in entries))}, ensure_ascii=False, indent=2) + '\n')
    print(f'Built {len(entries)} places in {len(counts)} cities; {len(skipped)} unidentified mentions held back.')

if __name__ == '__main__':
    build()
