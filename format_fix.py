#!/usr/bin/env python3
import re

filepath = '007.lims/002.技术方案/002.LIMS 全栈技术详解（前端视角版）.md'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 语言映射
lang_map = {
    'go': 'go', 'mod': 'go', 'sum': 'text',
    'ts': 'typescript', 'tsx': 'tsx',
    'js': 'javascript', 'jsx': 'jsx',
    'bash': 'bash', 'sh': 'bash', 'shell': 'bash',
    'yaml': 'yaml', 'yml': 'yaml',
    'json': 'json',
    'sql': 'sql',
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'html': 'html', 'gohtml': 'html',
    'md': 'markdown',
    'text': 'text',
}

# 修复代码块头部
def fix_code_block(m):
    full = m.group(0)  # 完整匹配: ```5:18:go.mod
    header = m.group(1)  # ```5:18:go.mod
    # 提取文件名
    filename = header.split(':')[-1]
    if '.' in filename:
        lang = filename.rsplit('.', 1)[-1]
    else:
        lang = filename
    lang = lang_map.get(lang, lang)
    return '```' + lang

content = re.sub(r'```\d+:\d+:[^\s]+', fix_code_block, content)

# 减少多余空行
content = re.sub(r'\n{3,}', '\n\n', content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('格式化完成')
print(f'文件大小: {len(content)} 字符')
