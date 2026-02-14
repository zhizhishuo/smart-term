# Contributing

感谢参与 Smart-Term Electron。

## Branch Strategy

- `main`：稳定分支，始终保持可发布
- `feature/*`：新功能
- `fix/*`：缺陷修复
- `docs/*`：文档维护

## Commit Convention

建议使用：

- `feat: ...`
- `fix: ...`
- `refactor: ...`
- `docs: ...`
- `test: ...`
- `chore: ...`

示例：

```text
feat: add draggable split panes for transfer panels
fix: handle failed transfer item retry state correctly
docs: add release and upgrade policy
```

## Pull Request Checklist

- 功能说明清晰，包含变更原因
- 本地可运行：`npm start`
- 语法检查通过：`npm run check`
- UI 相关变更附带截图或录屏
- 更新对应文档（README/CHANGELOG/docs）

## Code Style

- 保持函数职责单一，避免超大函数继续增长
- UI 文本统一中文表达
- 对复杂逻辑写简短注释（解释“为什么”）
- 不提交本地运行产物与敏感信息

## Security Notes

- 严禁提交凭据、私钥、环境密钥
- `known_hosts` 与审计数据属于本地运行数据，不应入库
