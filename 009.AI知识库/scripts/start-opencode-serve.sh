#!/usr/bin/env bash
# 委托给 launchd 使用的自启脚本
exec "$HOME/.local/bin/opencode-serve-my-notes.sh" "$@"
