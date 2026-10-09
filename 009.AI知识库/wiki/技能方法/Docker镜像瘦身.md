---
date: 2026-09-09 10:00
modified: 2026-09-09 16:50
---

# Docker 镜像瘦身：从 2.3GB 到 82MB

> 一个 Python Web 服务镜像的优化全流程：诊断 → 减重 → 加速构建 → 加固安全。

---

## 一句话总结

镜像不是"能跑就行"。合理使用 `.dockerignore`、多阶段构建、层缓存策略和非 root 运行，可以把一个 2.3GB、构建 8 分半的 Python 镜像压到 82MB、缓存命中构建 18 秒，同时消除安全漏洞。

---

## 镜像为什么这么大（诊断）

用 `docker history <image> --no-trunc` 逐层分析。典型浪费来源：

| 问题 | 浪费空间 | 原因 |
|------|---------|------|
| 基础镜像过大 | ~950MB | 用完整 Debian 版而非 slim/alpine |
| COPY 整个目录 | ~1.2GB | 没写 `.dockerignore`，`.git` 等全拷进去 |
| 安装调试工具 | ~85MB | 生产镜像里装 vim/git/curl |
| 开发依赖混入 | ~150MB | requirements.txt 没区分生产/开发 |
| apt 缓存未清理 | ~40MB | 装完包没删 `/var/lib/apt/lists` |

镜像过大的五种危害：推送/拉取慢、占存储、拖慢 CI、攻击面大、部署启动慢。

---

## 优化路径（逐步递减）

| 版本 | 基础镜像 | 大小 | 构建时间 | 关键动作 |
|------|---------|------|---------|---------|
| v1 | `python:3.11` | 2.3GB | 8m37s | 无优化（反面教材）|
| v2 | `python:3.11-slim` | 480MB | 3m12s | `.dockerignore` + 分离依赖 |
| v3 | `python:3.11-alpine` | 95MB | 1m28s | 多阶段构建 + Alpine |
| final | `python:3.11-slim` | 82MB | 1m32s / 18s 缓存 | 层缓存精细化 + 安全加固 |

---

## 1. `.dockerignore` + 分离依赖

`.dockerignore` 与 `.gitignore` 类似，决定哪些文件不进构建上下文、不被 COPY。它让 COPY 从 1.2GB 降到 <50MB（真正代码往往 <5MB，`.git` 的 pack 文件可能占 800MB+）。

依赖拆成 `requirements.txt`（生产）+ `requirements-dev.txt`（开发，用 `-r requirements.txt` 继承）。

---

## 2. 多阶段构建

用一个"建造镜像"编译/装依赖，把产物 COPY 到"运行镜像"——运行镜像不需要编译工具链。

```dockerfile
FROM python:3.11-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.11-alpine
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . /app
ENV PATH=/root/.local/bin:$PATH
```

**Alpine 两个坑：**
- musl libc 而非 glibc，部分包（如 psycopg2）需源码编译
- 时区默认 UTC，需显式 `apk add tzdata` 设置

**选型原则：** 先试 Alpine，遇兼容问题降级到 slim（约 45MB），别一上来用完整版。

---

## 3. 层缓存精细化

核心原则：**指令从"不变"到"常变"从上到下排列**。系统依赖最前 → Python 依赖中间 → 应用代码最后。改代码时依赖层能命中缓存。

BuildKit 的 cache mount 把包管理器下载缓存独立出来，不随镜像层失效：

```dockerfile
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
```

`DOCKER_BUILDKIT=1 docker build ...` 开启。对 npm/pip/apt 都有效，还支持多阶段并行构建。

---

## 4. 健康检查 HEALTHCHECK

容器定期执行命令，返回 0 健康、1 不健康。配合 docker-compose 的 `depends_on: condition: service_healthy`，解决"Web 首次启动连不上还在初始化的数据库"的经典问题（比 `sleep 10` 可靠）。

参数建议：`interval 30s`、`timeout 3s`、`start-period 10-30s`、`retries 3`。

---

## 5. 安全红线

**永远不要**在 Dockerfile 里硬编码密钥/密码/Token——`docker inspect` 一行就能看到，推送到仓库等于公开，且无法确认是否已泄露。

正确做法：运行时环境变量注入（`docker run -e` / compose env）、挂载 secret 文件、Docker Secrets / Vault。

用 **Trivy** 扫描漏洞、**dive** 分析镜像层找大文件。最终版本用 **非 root 用户**（`USER appuser`）运行，被入侵时权限受限。

---

## 最终 Dockerfile 要点

- 多阶段：builder 用 slim 装依赖，运行阶段拷贝 `/root/.local`
- 只装必需系统依赖：`--no-install-recommends` + `rm -rf /var/lib/apt/lists/*`
- 加 `PYTHONDONTWRITEBYTECODE=1`（不生成 .pyc）、`PYTHONUNBUFFERED=1`（日志实时输出）
- `useradd` + `USER appuser` 非 root 运行
- HEALTHCHECK + gunicorn 多 worker

最终选 `slim` 而非 Alpine：兼容性和体积的权衡，82MB vs 95MB 差距可接受。

---

## See Also

- [企业级后端架构全景](../技能方法/企业级后端架构全景.md) — 其中 Docker 一节是容器化的整体定位，本篇是镜像优化的深入展开

## Sources

- [Docker镜像从2GB压到80MB——容器瘦身术](../../raw/技能方法/Docker镜像瘦身术.md)
