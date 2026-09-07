#!/usr/bin/env python3
"""Read-only card inventory and source extraction; never executes embedded code."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CARD = ROOT / "originals/房东模拟器Z5.20 (1).json"


def inspect(card, output):
    raw = card.read_bytes()
    doc = json.loads(raw)
    data = doc.get("data", doc)
    extensions = data.get("extensions", {})
    inventory = {
        "source": card.name,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "spec": doc.get("spec"),
        "worldbook": [], "regex": [], "scripts": [],
    }
    output.mkdir(parents=True, exist_ok=True)

    def write_component(group, label, index, item, field, pointer, suffix):
        content = item.get(field, "")
        meta = {k: v for k, v in item.items() if k != field}
        meta.update(index=index, label=label, pointer=pointer,
                    chars=len(content), lines=len(content.splitlines()),
                    content_sha256=hashlib.sha256(content.encode()).hexdigest())
        folder = output / group
        folder.mkdir(exist_ok=True)
        (folder / (label + suffix)).write_text(content, encoding="utf-8")
        (folder / (label + ".json")).write_text(
            json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        inventory[group].append(meta)

    for i, item in enumerate(data.get("character_book", {}).get("entries", [])):
        write_component("worldbook", f"W{i:02}", i, item, "content",
                        f"/data/character_book/entries/{i}", ".txt")
    for i, item in enumerate(extensions.get("regex_scripts", [])):
        write_component("regex", f"R{i:02}", i, item, "replaceString",
                        f"/data/extensions/regex_scripts/{i}", ".html")

    def scripts(items, pointer):
        for position, item in enumerate(items):
            path = f"{pointer}/{position}"
            if item.get("type") == "folder":
                scripts(item.get("scripts", []), path + "/scripts")
            else:
                i = len(inventory["scripts"])
                write_component("scripts", f"S{i:02}", i, item, "content", path, ".js")

    scripts(extensions.get("tavern_helper", {}).get("scripts", []),
            "/data/extensions/tavern_helper/scripts")
    card_dir = output / "card"
    card_dir.mkdir(exist_ok=True)
    for field in ("description", "personality", "scenario", "first_mes", "mes_example",
                  "system_prompt", "post_history_instructions", "creator_notes"):
        (card_dir / (field + ".txt")).write_text(data.get(field, ""), encoding="utf-8")
    for i, greeting in enumerate(data.get("alternate_greetings", [])):
        (card_dir / f"alternate_greeting_{i}.txt").write_text(greeting, encoding="utf-8")
    (output / "inventory.json").write_text(
        json.dumps(inventory, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return inventory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--card", type=Path, default=DEFAULT_CARD)
    parser.add_argument("--output", type=Path, default=ROOT / ".local/inspection")
    args = parser.parse_args()
    result = inspect(args.card.resolve(), args.output.resolve())
    print(json.dumps({"output": str(args.output.resolve()),
                      "sha256": result["sha256"],
                      "counts": {k: len(result[k]) for k in ("worldbook", "regex", "scripts")}},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
