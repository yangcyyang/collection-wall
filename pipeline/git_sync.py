"""采集数据的节流 Git 同步。

只允许提交 ``data/tools``，避免把工作区里的代码、日志或本地配置
意外带进自动提交。首次推送仍由人工完成并配置 upstream。
"""

from __future__ import annotations

import subprocess
import threading
from pathlib import Path
from typing import Callable, Sequence


COMMIT_MESSAGE = "data: sync captured bookmarks"
MIN_SYNC_INTERVAL_SECONDS = 300


def normalize_sync_delay(raw_value: str | None) -> float:
    """同步至少间隔五分钟，避免连续收藏制造推送风暴。"""
    try:
        requested = float(raw_value or MIN_SYNC_INTERVAL_SECONDS)
    except ValueError:
        requested = MIN_SYNC_INTERVAL_SECONDS
    return max(requested, MIN_SYNC_INTERVAL_SECONDS)


def _run_git(
    repo_root: Path,
    args: Sequence[str],
    *,
    runner: Callable = subprocess.run,
):
    command = ["git", "-C", str(repo_root), *args]
    result = runner(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise subprocess.CalledProcessError(
            result.returncode,
            command,
            output=getattr(result, "stdout", ""),
            stderr=getattr(result, "stderr", ""),
        )
    return result


def sync_repo(repo_root: Path, *, runner: Callable = subprocess.run) -> bool:
    """提交并推送采集产物；没有数据变化时返回 False。"""
    repo_root = Path(repo_root)
    # 没有人工配置好的 upstream 时立即拒绝，避免首次授权前产生本地自动提交。
    _run_git(
        repo_root,
        ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        runner=runner,
    )
    _run_git(repo_root, ["add", "--", "data/tools"], runner=runner)

    diff_command = [
        "git", "-C", str(repo_root),
        "diff", "--cached", "--quiet", "--", "data/tools",
    ]
    diff = runner(diff_command, capture_output=True, text=True, check=False)
    if diff.returncode == 0:
        ahead = _run_git(
            repo_root,
            ["rev-list", "--count", "@{u}..HEAD"],
            runner=runner,
        )
        if int(ahead.stdout.strip() or "0") == 0:
            return False
        _run_git(repo_root, ["push"], runner=runner)
        return True
    if diff.returncode != 1:
        raise subprocess.CalledProcessError(
            diff.returncode,
            diff_command,
            output=getattr(diff, "stdout", ""),
            stderr=getattr(diff, "stderr", ""),
        )

    _run_git(
        repo_root,
        ["commit", "-m", COMMIT_MESSAGE, "--", "data/tools"],
        runner=runner,
    )
    _run_git(repo_root, ["push"], runner=runner)
    return True


class DebouncedGitSync:
    """将一段时间内的多次成功采集合并成一次同步。"""

    def __init__(
        self,
        repo_root: Path,
        *,
        delay_seconds: float = 300,
        timer_factory: Callable = threading.Timer,
        sync: Callable[[Path], bool | None] = sync_repo,
        logger: Callable[[str], None] | None = None,
    ):
        self.repo_root = Path(repo_root)
        self.delay_seconds = delay_seconds
        self.timer_factory = timer_factory
        self.sync = sync
        self.logger = logger or (lambda _message: None)
        self._lock = threading.Lock()
        self._timer = None

    def schedule(self):
        with self._lock:
            if self._timer is not None:
                self.logger("  ☁️ 已并入当前 Git 同步批次")
                return
            self._timer = self.timer_factory(self.delay_seconds, self._flush)
            self._timer.daemon = True
            self._timer.start()
        self.logger(f"  ☁️ 已安排 Git 同步（{int(self.delay_seconds)} 秒内合并）")

    def _flush(self):
        with self._lock:
            self._timer = None
        try:
            changed = self.sync(self.repo_root)
            if changed:
                self.logger("  ✅ 采集数据已提交并推送")
            else:
                self.logger("  ⏭ data/tools 无变化，跳过推送")
        except Exception as exc:
            self.logger(f"  ⚠ Git 自动同步失败，{int(self.delay_seconds)} 秒后自动重试: {exc}")
            self.schedule()


def run_capture_and_schedule(
    command: Sequence[str],
    scheduler: DebouncedGitSync,
    *,
    runner: Callable = subprocess.run,
) -> int:
    """运行一次 capture，只有成功写入数据后才安排同步。"""
    result = runner(
        list(command),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if result.returncode == 0:
        scheduler.schedule()
    return result.returncode
