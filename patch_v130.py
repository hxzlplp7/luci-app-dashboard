# -*- coding: utf-8 -*-
import os

def patch_file(file_path):
    if not os.path.exists(file_path):
        print(f"File {file_path} not found")
        return

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Technical Localization for v1.3.0
    replacements = {
        '"Not Installed"': '"未安装"',
        '"not installed"': '"未安装"',
        '"stopped"': '"已停止"',
        '"running"': '"运行中"',
        'Link status: Down': '连接状态：已断开',
        'Link status: Up': '连接状态：已连接',
        'Upload': '上传',
        'Download': '下载',
        'Real-time speed': '实时速率',
        'Historical stats': '历史统计',
        'Status: ': '状态：',
        'Type: ': '类型：'
    }

    # Apply replacements
    new_content = content
    for old, new in replacements.items():
        new_content = new_content.replace(old, new)

    if new_content != content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Patched {file_path} successfully")
    else:
        print(f"No changes made to {file_path}")

if __name__ == "__main__":
    patch_file("htdocs/luci-static/dashboard/index.js")
    patch_file("luasrc/view/dashboard/main.htm")
