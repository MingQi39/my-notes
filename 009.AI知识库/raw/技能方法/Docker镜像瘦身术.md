---
title: Docker镜像从2GB压到80MB——容器瘦身术
source: Juejin
author: badhope
created: 2026-08-08
note_url: https://juejin.cn/post/7671299466398040098
domain: 技能方法
content_type: 教程攻略
credibility: medium
tags: [Docker, 镜像优化, 多阶段构建, BuildKit, 安全]
date: 2026-09-09 16:48
modified: 2026-09-09 16:50
---

# Docker镜像从2GB压到80MB——容器瘦身术

> 原文作者 badhope，掘金，2026-08-08，12 分钟阅读。

## 背景

"容器化部署很简单，写个 Dockerfile 不就完事了？"——结果镜像 2.3GB，构建 8 分半钟，被运维追着打了三天。

## 第一版：能跑就行的心态

```dockerfile
FROM python:3.11
COPY . /app
WORKDIR /app
RUN pip install -r requirements.txt
RUN apt-get update && apt-get install -y vim git curl wget
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
```

结果：镜像 2.3GB，构建 8m37s。

**镜像过大的危害**：推送和拉取慢、占用大量存储、构建时间长拖慢 CI、安全攻击面大、部署启动慢。

## 问题诊断：镜像为什么这么大

`docker history myapp:v1 --no-trunc` 逐层分析：

| 问题 | 浪费空间 | 原因 |
|------|---------|------|
| 基础镜像过大 | ~950MB | 用了完整 Debian 版而非 slim/alpine |
| COPY 整个目录 | ~1.2GB | 没用 .dockerignore，.git 等全拷进去 |
| 安装调试工具 | ~85MB | vim/git 在生产镜像里完全不需要 |
| 开发依赖 | ~150MB | requirements.txt 没区分生产/开发 |
| apt 缓存未清理 | ~40MB | 装完包没删 /var/lib/apt/lists |

## 优化第一步：.dockerignore 和分离依赖

```bash
# .dockerignore
.git
.gitignore
node_modules
__pycache__
*.pyc
.pytest_cache
.venv
venv
env
docs/
tests/
*.md
*.log
.env
.env.*
docker-compose*.yml
Dockerfile*
.dockerignore
```

`.dockerignore` 让 COPY 从 1.2GB 降到 <50MB。真正的代码文件加起来不到 5MB。

分离生产/开发依赖：

```txt
# requirements.txt（生产依赖）
Django==4.2.7
gunicorn==21.2.0
psycopg2-binary==2.9.9
redis==5.0.1
celery==5.3.4

# requirements-dev.txt（开发依赖）
-r requirements.txt
pytest==7.4.3
pytest-django==4.7.0
ipython==8.17.2
black==23.11.0
flake8==6.1.0
```

结果 v2：480MB，构建 3m12s。

**层缓存优化关键**：Dockerfile 每行指令生成一个层，层有缓存。某一层内容变了，它和后面所有层缓存都失效。变化频率低的指令放前面（装依赖），变化频率高的放后面（COPY 代码）。

## 优化第二步：多阶段构建

核心思想：用"建造镜像"编译代码、安装依赖，把编译产物 COPY 到"运行镜像"，运行镜像不需要编译工具链。

```dockerfile
# 阶段1：构建
FROM python:3.11-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# 阶段2：运行
FROM python:3.11-alpine
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . /app
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["gunicorn", "myapp.wsgi", "--bind", "0.0.0.0:8000"]
```

结果 v3：95MB，构建 1m28s。

**Alpine 的坑**：用 musl libc 而非 glibc，部分 Python 包兼容性问题（如 psycopg2 需源码编译）；时区默认 UTC 需显式设置：

```bash
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone
```

**Alpine vs slim 选择**：Alpine 最小（约 5MB）但可能有兼容问题。原则：先试 Alpine，遇到问题降级到 slim（约 45MB），不要一上来就用完整版。

## 优化第三步：层缓存精细化

原则：**从不变到常变，从上到下排列**。系统依赖最稳定放最前，Python 依赖偶尔变放中间，应用代码经常变放最后。

```dockerfile
FROM python:3.11-alpine
RUN apk add --no-cache libpq          # 系统依赖（几乎不变）
COPY requirements.txt .               # 依赖清单（偶尔变）
RUN pip install --no-cache-dir -r requirements.txt
COPY . /app                            # 代码（经常变）
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["gunicorn", "myapp.wsgi", "--bind", "0.0.0.0:8000"]
```

BuildKit 缓存挂载：

```bash
# Dockerfile:
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

DOCKER_BUILDKIT=1 docker build -t myapp:v4 .
# 依赖没变时构建 22s
```

BuildKit 的 cache mount 把下载缓存独立出来，不随镜像层变化，对 npm/pip/apt 都有效。还支持并行构建阶段。

## 健康检查：让容器自己说"我还活着"

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health/', timeout=2)" || exit 1
```

| 参数 | 作用 | 建议值 |
|------|------|--------|
| interval | 检查间隔 | 30s（Web 服务）|
| timeout | 单次检查超时 | 3s |
| start_period | 启动宽限期 | 10-30s（看应用启动时间）|
| retries | 连续失败几次判定不健康 | 3 |

docker-compose 的 `depends_on` 默认只保证容器启动顺序，不保证服务就绪。加 `condition: service_healthy` 后，Web 服务等 db 健康检查通过才启动，解决"Web 首次启动连不上数据库"的经典问题。

## 安全扫描：别把密钥打进镜像

**错误做法**（千万别干）：

```dockerfile
ENV DB_PASSWORD=MySuperSecretPassword123
ENV REDIS_PASSWORD=redis_password_here
ENV SECRET_KEY=django-insecure-xxxxxxxxxxxx
```

`docker inspect` 一行命令就能看到所有环境变量。一旦密钥进了镜像，推送到仓库后等于公开，且无法确认是否泄露。唯一安全的做法是**从一开始就不把密钥放进镜像**。

正确做法：运行时通过环境变量注入（`docker run -e`、docker-compose env）、挂载 secret 文件、或使用 Docker Secrets / Vault。

```bash
docker run -d \
  -e DB_PASSWORD=$DB_PASSWORD \
  -e REDIS_PASSWORD=$REDIS_PASSWORD \
  -e SECRET_KEY=$SECRET_KEY \
  myapp:v4
```

扫描工具：

```bash
trivy image myapp:v4   # 漏洞扫描
dive myapp:v4          # 分析镜像层，找出大文件和不必要的层
```

## 最终版本：82MB

```dockerfile
# 构建阶段
FROM python:3.11-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# 运行阶段
FROM python:3.11-slim
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 && \
    rm -rf /var/lib/apt/lists/*
COPY --from=builder /root/.local /root/.local
WORKDIR /app
COPY . /app
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/')" || exit 1

CMD ["gunicorn", "myapp.wsgi", "--bind", "0.0.0.0:8000", "--workers", "4"]
```

| 指标 | v1 初版 | final 最终版 | 优化幅度 |
|------|---------|-------------|---------|
| 镜像大小 | 2.3GB | 82MB | 缩小 28 倍 |
| 构建时间 | 8m37s | 1m32s | 快 5.7 倍 |
| 缓存命中构建 | 8m37s | 18s | 快 29 倍 |
| 安全漏洞 | 未扫描 | 0 个 | 从未知到可控 |
| 运行用户 | root | 非 root | 安全性提升 |
| 健康检查 | 无 | 有 | 可观测性提升 |

最终版相比初版的关键改进：非 root 用户运行（安全性）、HEALTHCHECK（可观测性）、`PYTHONDONTWRITEBYTECODE` 和 `PYTHONUNBUFFERED`（减少 .pyc 文件 + 日志实时输出）。

**选 slim 而非 Alpine 作最终运行镜像**：权衡兼容性和体积。Alpine 更小，但 psycopg2 等包兼容性问题花太多时间排查；slim 基于 Debian 兼容性好，82MB 和 95MB 差距可接受。

**Dockerfile 优化核心原则**：选择最小化基础镜像（alpine > slim 优先试）、多阶段构建分离构建/运行环境、.dockerignore 排除不必要文件、合理安排指令顺序最大化层缓存、永不放敏感信息、非 root 用户运行。每条优化都有明确的安全或性能收益。
