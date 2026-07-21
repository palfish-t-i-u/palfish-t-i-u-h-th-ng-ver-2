---
Problem: DingTalk markdown message renders extra space at start of lines
Trap: Use trailing-space line break (standard Markdown convention)
Insight: DingTalk markdown renderer treats trailing spaces as literal content, not line breaks — resulting in visible extra spaces at start of next line
Rule: DingTalk markdown uses <br> for line breaks, NOT trailing-space convention
---

## Context

DingTalk enterprise robot `sampleMarkdown` messages support a subset of Markdown.
Standard Markdown trailing-space line breaks (two spaces + newline) cause DingTalk
to render extra whitespace at the beginning of the next line instead of a clean
line break.

## Timeline

- `099c2a6` — first attempt: removed trailing spaces, but lines collapsed
- `5fe9e4f` — added raw flag test endpoint to experiment
- `918e012` — final fix: use `<br>` tag for line breaks

## Rule

In DingTalk `sampleMarkdown` messages, always use `<br>` for line breaks.
Never use trailing-space convention or `\n` alone for visual breaks within
a paragraph.
