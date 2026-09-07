#!/usr/bin/env python3
"""Statically validate a SillyTavern JSON / PNG export pair; never run card scripts."""

import argparse
import base64
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_JSON = ROOT / "originals/房东模拟器Z5.20 (1).json"
DEFAULT_PNG = ROOT / "originals/房东模拟器Z5.20.png"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_png_cards(path):
    blob = path.read_bytes()
    require(blob[:8] == b"\x89PNG\r\n\x1a\n", "PNG 文件签名不正确")
    offset, cards, dimensions = 8, {}, None
    saw_idat = False
    while offset < len(blob):
        require(offset + 12 <= len(blob), "PNG 数据块头不完整")
        size = struct.unpack_from(">I", blob, offset)[0]
        end = offset + size + 12
        require(end <= len(blob), "PNG 数据块被截断")
        kind = blob[offset + 4:offset + 8]
        payload = blob[offset + 8:end - 4]
        crc = struct.unpack_from(">I", blob, end - 4)[0]
        require(zlib.crc32(kind + payload) & 0xFFFFFFFF == crc,
                "PNG 数据块 CRC 校验失败：" + repr(kind))
        if offset == 8:
            require(kind == b"IHDR", "PNG 首个数据块必须是 IHDR")
        if kind == b"IHDR":
            require(dimensions is None and size == 13, "PNG IHDR 重复或格式不正确")
            dimensions = struct.unpack(">II", payload[:8])
            require(all(dimensions), "PNG 图片尺寸必须大于零")
        elif kind == b"IDAT":
            saw_idat = True
        elif kind == b"tEXt":
            keyword, separator, value = payload.partition(b"\0")
            require(bool(separator), "PNG tEXt 数据缺少分隔符")
            if keyword in (b"chara", b"ccv3"):
                key = keyword.decode("ascii")
                require(key not in cards, "PNG 角色卡数据块重复：" + key)
                cards[key] = json.loads(base64.b64decode(value, validate=True))
        elif kind == b"IEND":
            require(size == 0 and end == len(blob), "PNG IEND 不正确或存在尾随数据")
            require(saw_idat and dimensions is not None, "PNG 缺少图片数据")
            require(bool(cards), "PNG 未找到 chara / ccv3 角色卡元数据")
            return cards, dimensions
        offset = end
    raise ValueError("PNG 缺少 IEND 数据块")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_file", type=Path, nargs="?", default=DEFAULT_JSON)
    parser.add_argument("png_file", type=Path, nargs="?", default=DEFAULT_PNG)
    parser.add_argument("--baseline", action="store_true",
                        help="额外校验 originals 中的原始文件 SHA-256")
    args = parser.parse_args()
    try:
        card = json.loads(args.json_file.read_text(encoding="utf-8-sig"))
        require(isinstance(card, dict), "角色卡 JSON 顶层必须是对象")
        require(card.get("spec") in ("chara_card_v2", "chara_card_v3"),
                "未识别的角色卡格式标识")
        data = card.get("data")
        require(isinstance(data, dict), "角色卡缺少 data 对象")
        require(isinstance(data.get("name"), str), "角色卡缺少名称字符串")
        cards, dimensions = read_png_cards(args.png_file)
        for keyword, embedded in cards.items():
            require(embedded == card, "PNG 的 " + keyword + " 内容与 JSON 不同")
        if args.baseline:
            baseline = json.loads((ROOT / "docs/baseline.json").read_text("utf-8"))
            for entry in baseline["files"]:
                content = (ROOT / entry["path"]).read_bytes()
                require(len(content) == entry["bytes"], "原始文件大小已变化：" + entry["path"])
                require(hashlib.sha256(content).hexdigest() == entry["sha256"],
                        "原始文件 SHA-256 已变化：" + entry["path"])
        print("PASS：JSON 可解析；PNG 结构与 CRC 正确；内嵌角色卡与 JSON 一致。")
        print("PNG：{} × {}；角色卡数据块：{}".format(*dimensions, ", ".join(cards)))
        if args.baseline:
            print("PASS：两份原始文件的大小及 SHA-256 与初始基准一致。")
    except (OSError, ValueError, TypeError, KeyError, struct.error) as error:
        print("FAIL：" + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
