#!/usr/bin/env bash
# One-click deploy to GitHub Pages
# 用法：./deploy.sh "本次更新说明"
# 首次运行前：请确保已经 git init 并配置好 remote origin

set -e
cd "$(dirname "$0")"

MSG="${1:-update}"

# 首次初始化
if [ ! -d .git ]; then
  git init
  git branch -M main
  git remote add origin https://github.com/mokee001/MokeeeWeb.git
fi

git add .
git commit -m "$MSG" || echo "无变更，跳过 commit"
git push -u origin main

echo ""
echo "✅ 推送完成。GitHub Pages 部署需要 1~2 分钟。"
echo "   访问: https://mokee001.github.io/MokeeeWeb/"
echo "   首次部署请去仓库 Settings → Pages，Source 选 main / (root) 保存。"
