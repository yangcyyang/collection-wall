#!/usr/bin/env python3
"""
F001 Phase 1.5：书签 watcher 的菜单栏开关。

这是 launchd 常驻 watcher 的"遥控器"——不重写 watcher.py，只是通过
launchctl 控制 ~/Library/LaunchAgents/com.cy.bookmark-watcher.plist。

用法：
    .venv/bin/python3 menubar_app.py
"""
import json
import subprocess
import webbrowser
from pathlib import Path

import rumps

LABEL = "com.cy.bookmark-watcher"
UID = subprocess.run(["id", "-u"], capture_output=True, text=True).stdout.strip()
PLIST_PATH = Path.home() / "Library/LaunchAgents" / f"{LABEL}.plist"
PIPELINE_ROOT = Path(__file__).parent
DATA_TOOLS_DIR = PIPELINE_ROOT.parent / "data" / "tools"
WALL_URL = "https://wall.yangcyyang.cn"
PAUSE_MINUTES = 30


def launchctl(*args):
    return subprocess.run(["launchctl", *args], capture_output=True, text=True)


def is_running() -> bool:
    """watcher 进程当前是否活着（有 PID）。"""
    r = launchctl("list", LABEL)
    if r.returncode != 0:
        return False
    for line in r.stdout.splitlines():
        line = line.strip()
        if line.startswith('"PID"'):
            return True
    return False


def is_autostart_enabled() -> bool:
    """开机自启开关：查 launchctl 的 disabled 覆盖表。默认（未出现在表里）视为启用。
    实测 macOS launchctl print-disabled 输出形如 '"label" => enabled' / '=> disabled'。"""
    r = launchctl("print-disabled", f"gui/{UID}")
    if r.returncode != 0:
        return True
    for line in r.stdout.splitlines():
        if LABEL in line:
            return "disabled" not in line
    return True


def start_watcher():
    launchctl("load", str(PLIST_PATH))


def stop_watcher():
    launchctl("unload", str(PLIST_PATH))


def recent_captures(n=3):
    """最近 n 条已上墙的收藏（按文件 mtime 倒序）。"""
    if not DATA_TOOLS_DIR.exists():
        return []
    files = sorted(
        DATA_TOOLS_DIR.glob("*.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    items = []
    for f in files[:n]:
        try:
            rec = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        name = rec.get("name") or rec.get("url") or f.stem
        items.append((name, rec.get("url", "")))
    return items


class WatcherMenuBarApp(rumps.App):
    def __init__(self):
        super().__init__("⚪ 收藏墙", quit_button=None)
        self._pause_timer = None
        self._pause_until = None

        self.status_item = rumps.MenuItem("状态：检查中…")
        self.toggle_item = rumps.MenuItem("暂停监听", callback=self.on_toggle)
        self.pause30_item = rumps.MenuItem(
            f"暂停 {PAUSE_MINUTES} 分钟", callback=self.on_pause_30min
        )
        self.recent_menu = rumps.MenuItem("最近上墙")
        self.open_wall_item = rumps.MenuItem("打开收藏墙网站", callback=self.on_open_wall)
        self.autostart_item = rumps.MenuItem(
            "开机自启", callback=self.on_toggle_autostart
        )
        self.quit_item = rumps.MenuItem("退出菜单栏 App", callback=self.on_quit)

        self.menu = [
            self.status_item,
            None,
            self.toggle_item,
            self.pause30_item,
            None,
            self.recent_menu,
            None,
            self.open_wall_item,
            None,
            self.autostart_item,
            None,
            self.quit_item,
        ]

        self.refresh_timer = rumps.Timer(self.refresh, 10)
        self.refresh_timer.start()
        self.refresh(None)

    # ---------- 刷新状态 ----------
    def refresh(self, _sender):
        running = is_running()
        if self._pause_until:
            self.title = "🟡 收藏墙"
            self.status_item.title = f"状态：已暂停，将在 {self._pause_until} 自动恢复"
            self.toggle_item.title = "立即恢复监听"
        elif running:
            self.title = "🟢 收藏墙"
            self.status_item.title = "状态：监听中"
            self.toggle_item.title = "暂停监听"
        else:
            self.title = "⚪ 收藏墙"
            self.status_item.title = "状态：已停止"
            self.toggle_item.title = "恢复监听"

        self.autostart_item.state = is_autostart_enabled()
        self._rebuild_recent_menu()

    def _rebuild_recent_menu(self):
        if self.recent_menu._menu is not None:
            self.recent_menu.clear()
        recents = recent_captures(3)
        if not recents:
            self.recent_menu.add(rumps.MenuItem("（暂无收藏）", callback=None))
            return
        for name, url in recents:
            item = rumps.MenuItem(
                name, callback=(lambda _s, u=url: webbrowser.open(u)) if url else None
            )
            self.recent_menu.add(item)

    # ---------- 菜单动作 ----------
    def on_toggle(self, _sender):
        if self._pause_until:
            self._cancel_pause()
            start_watcher()
        elif is_running():
            stop_watcher()
        else:
            start_watcher()
        self.refresh(None)

    def on_pause_30min(self, _sender):
        stop_watcher()
        if self._pause_timer:
            self._pause_timer.stop()
        self._pause_timer = rumps.Timer(self._resume_from_pause, PAUSE_MINUTES * 60)
        self._pause_timer.start()
        import datetime

        resume_at = datetime.datetime.now() + datetime.timedelta(minutes=PAUSE_MINUTES)
        self._pause_until = resume_at.strftime("%H:%M")
        self.refresh(None)
        rumps.notification(
            "收藏墙 watcher", "已暂停", f"将在 {self._pause_until} 自动恢复监听"
        )

    def _resume_from_pause(self, _sender):
        self._cancel_pause()
        start_watcher()
        self.refresh(None)
        rumps.notification("收藏墙 watcher", "已恢复", "书签监听已自动恢复")

    def _cancel_pause(self):
        if self._pause_timer:
            self._pause_timer.stop()
            self._pause_timer = None
        self._pause_until = None

    def on_open_wall(self, _sender):
        webbrowser.open(WALL_URL)

    def on_toggle_autostart(self, _sender):
        target = f"gui/{UID}/{LABEL}"
        if is_autostart_enabled():
            launchctl("disable", target)
        else:
            launchctl("enable", target)
        self.refresh(None)

    def on_quit(self, _sender):
        rumps.quit_application()


if __name__ == "__main__":
    WatcherMenuBarApp().run()
