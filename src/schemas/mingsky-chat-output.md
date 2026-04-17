# MingSky Chat Output v1

本文件描述 `/api/ai/mingsky-chat` 的稳定返回形状。

## 目标

- 把明空 AI 星盘助手的回答固定成可验证契约
- 让前端弹窗和后端 chat layer 使用同一种 response shape
- 避免通用 chat 接口把明空专用上下文稀释掉

## 输出字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `schema_version` | string | 当前固定为 `mingsky-chat-output.v1` |
| `reply` | string | AI 对用户问题的直接回答 |
| `suggested_questions` | string[] | 可选的后续建议问题，最多 3 条 |

## 示例

```json
{
  "schema_version": "mingsky-chat-output.v1",
  "reply": "从你当前这张盘来看，你很重视关系里的平衡感，但真正推动成长的反而是边界感。",
  "suggested_questions": [
    "我在关系里最需要注意什么？",
    "这张盘最强的天赋在哪里？",
    "完整报告还会展开哪些部分？"
  ]
}
```

对应 schema 文件： [mingsky-chat-output.schema.json](C:\Users\yggsh\mingme-ai-server\src\schemas\mingsky-chat-output.schema.json)
