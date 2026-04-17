# MingSky Narrative Output v1

本文件描述 `/api/ai/mingsky-narrative` 的稳定返回形状。

## 目标

- 把明空的 AI narrative layer 固定成可验证契约
- 让前端只消费稳定的 `title / summary / sections`
- 让 prompt 迭代不再直接冲击页面结构

## 顶层字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schema_version` | string | 当前固定为 `mingsky-narrative-output.v1` |
| `title` | string | 这次报告预览的标题 |
| `summary` | string | 顶层摘要 |
| `sections` | array | 结构化段落列表，1 到 6 条 |

## section 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `section_id` | string | 稳定 id，仅允许小写字母、数字、下划线 |
| `type` | string | `summary/personality/relationships/career/money/growth/timing/shadow/cta` |
| `title` | string | 段落标题 |
| `content` | string | 段落正文 |
| `evidence_refs` | string[] | 溯源引用 code 列表 |

## 约束

1. AI 不得改写底层事实。
2. AI 不得新增 payload 中不存在的事实性断言。
3. 如果模型输出不规整，服务端必须先归一化，再返回给前端。
4. 前端只依赖这个结构，不依赖模型自由文本。

对应 schema 文件： [mingsky-narrative-output.schema.json](C:\Users\yggsh\mingme-ai-server\src\schemas\mingsky-narrative-output.schema.json)
