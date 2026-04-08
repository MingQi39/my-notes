# LIMS Cursor Rules

将本目录下的 `.mdc` 文件复制到项目的 `.cursor/rules/` 目录即可启用。

## 使用方式

```bash
# 在 LIMS 项目根目录执行
cp -r 003.rules/001.front  .cursor/rules/001.front
cp -r 003.rules/002.backend .cursor/rules/002.backend
cp -r 003.rules/003.common  .cursor/rules/003.common
```

## 目录结构

```
001.front/           ← 前端规范（globs 匹配 *.ts/*.tsx）
  001.编码规范.mdc
  002.项目结构.mdc
  003.请求层规范.mdc
  004.状态与权限管理.mdc

002.backend/         ← 后端规范（globs 匹配 *.go）
  001.分层架构.mdc
  002.编码规范.mdc
  003.项目结构.mdc
  004.API与响应规范.mdc
  005.事务与数据一致性.mdc
  006.日志与审计.mdc
  007.安全规范.mdc
  008.缓存与异步任务.mdc

003.common/          ← 通用规范（alwaysApply 或 deploy 相关 globs）
  001.项目概述.mdc
  002.部署与运维规范.mdc
  003.质量保障与通用约束.mdc
```

## 设计原则

- **Rules** 回答「是什么 / 不能是什么」
- **Skills**（如需扩展）回答「怎么做」
- 前后端规则按 `globs` 按需加载，不会全量占用 token
- `alwaysApply: true` 仅用于项目概述和通用约束（2 个文件）
