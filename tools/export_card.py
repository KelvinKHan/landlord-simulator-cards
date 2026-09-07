#!/usr/bin/env python3
"""Build a single-entry JSON/PNG card without changing the original image pixels."""
import base64
import copy
import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def main():
    version = json.loads((ROOT / 'package.json').read_text())['version']
    original = json.loads((ROOT / 'originals/房东模拟器Z5.20 (1).json').read_text())
    card = copy.deepcopy(original)
    data = card['data']
    loader = copy.deepcopy(data['extensions']['tavern_helper']['scripts'][0])
    loader.update(name='房东模拟器 · 单入口', enabled=True, content=f"import 'https://cdn.jsdelivr.net/gh/KelvinKHan/landlord-simulator-cards@v{version}/dist/bootstrap.js';", info='启动时检查正式发布版本；原版与二改版在游戏内选择。更新前备份官方世界书，保留玩家自定义修改。')
    data['extensions']['tavern_helper']['scripts'] = [loader]
    data['extensions']['landlord_release'] = {'format': 1, 'version': version, 'channel': 'stable', 'repository': 'KelvinKHan/landlord-simulator-cards'}
    data['character_version'] = version
    data['character_book'] = json.loads((ROOT / 'src/content/worldbook.json').read_text())
    data['extensions']['regex_scripts'] = json.loads((ROOT / 'src/content/regex.json').read_text())
    # Keep the legacy top-level field and the V2/V3 field in sync, including CRLF.
    first_message = (ROOT / 'src/content/first-message.txt').read_bytes().decode('utf-8')
    data['first_mes'] = first_message
    card['first_mes'] = first_message
    payload = json.dumps(card, ensure_ascii=False, separators=(',', ':')).encode()
    out = ROOT / 'exports'
    out.mkdir(exist_ok=True)
    stem = f'房东模拟器Z{version}'
    (out / f'{stem}.json').write_bytes(payload)
    (out / '房东模拟器-单入口脚本.json').write_text(json.dumps(loader, ensure_ascii=False, indent=2) + '\n')
    (out / '导入脚本.js').write_text(loader['content'] + '\n')
    source = (ROOT / 'originals/房东模拟器Z5.20.png').read_bytes()
    result = bytearray(source[:8])
    pos = 8
    while pos < len(source):
        size = struct.unpack('>I', source[pos:pos+4])[0]
        kind, value = source[pos+4:pos+8], source[pos+8:pos+8+size]
        if kind == b'IEND':
            for key in [b'chara', b'ccv3']:
                result.extend(chunk(b'tEXt', key+b'\0'+base64.b64encode(payload)))
        if not (kind == b'tEXt' and value.split(b'\0', 1)[0] in [b'chara', b'ccv3']):
            result.extend(source[pos:pos+size+12])
        pos += size+12
    (out / f'{stem}.png').write_bytes(result)
    print(f'Exported {stem}: one script, {len(data["character_book"]["entries"])} worldbook entries, unchanged image chunks.')


if __name__ == '__main__':
    main()
