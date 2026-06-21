#!/bin/bash
# ============================================================
# 籃球家教管理系統 - 一鍵設定腳本
# 用途：上傳 LINE Rich Menu
# 使用方式：chmod +x setup.sh && ./setup.sh
# ============================================================

set -e

echo "🏀 籃球家教管理系統 - Rich Menu 設定工具"
echo "=========================================="

# 確認 .env 存在
if [ ! -f ".env" ]; then
  echo "❌ 找不到 .env 檔案"
  echo "   請先複製 .env.example 為 .env 並填入各項設定："
  echo "   cp .env.example .env"
  exit 1
fi

# 讀取環境變數
source .env

# 確認必要環境變數
if [ -z "$LINE_CHANNEL_ACCESS_TOKEN" ]; then
  echo "❌ 請在 .env 設定 LINE_CHANNEL_ACCESS_TOKEN"
  exit 1
fi

# 確認 node_modules
if [ ! -d "node_modules" ]; then
  echo "📦 安裝 npm 套件..."
  npm install
fi

echo ""
echo "📋 目前設定："
echo "   BASE_URL: ${BASE_URL:-（未設定）}"
echo "   LIFF 預約: ${LINE_LIFF_ID_BOOKING:-（未設定）}"
echo "   LIFF 上課須知: ${LINE_LIFF_ID_NOTICE:-（未設定）}"
echo "   LIFF 課程紀錄: ${LINE_LIFF_ID_RECORDS:-（未設定）}"
echo ""

# 確認 Rich Menu 圖片
if [ ! -f "richmenu/richmenu-image.png" ]; then
  echo "⚠️  警告：找不到 richmenu/richmenu-image.png"
  echo "   請準備一張 2500 x 843 px 的 PNG 圖片作為 Rich Menu 背景"
  echo "   圖片分為三等份，由左到右依序為：預約課程、上課須知、課程紀錄"
  echo ""
  read -p "要繼續執行（不上傳圖片）嗎？[y/N] " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
  fi
fi

echo "🚀 執行 Rich Menu 設定..."
node scripts/setup-richmenu.js

echo ""
echo "✅ 完成！"
echo ""
echo "📌 接下來請完成以下步驟："
echo "1. 前往 LINE Developers Console 確認 Rich Menu 已建立"
echo "2. 在 LINE Official Account Manager 設定 Webhook URL："
echo "   ${BASE_URL}/webhook"
echo "3. 測試：用 LINE 掃描官方帳號 QR Code，確認選單正常顯示"
