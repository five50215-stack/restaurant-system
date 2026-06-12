# -*- coding: utf-8 -*-
"""餐廳系統本機伺服器 — 強制不快取,避免瀏覽器拿到舊版畫面。"""
import http.server
import socketserver
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8137
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 每次都重新抓檔案,不使用瀏覽器快取
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *args):
        pass  # 安靜模式


with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"餐廳系統已啟動:http://localhost:{PORT}/")
    print("關閉此視窗即可停止伺服器。")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
