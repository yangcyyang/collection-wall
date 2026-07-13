import subprocess
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


PIPELINE_DIR = Path(__file__).resolve().parents[1] / "pipeline"
sys.path.insert(0, str(PIPELINE_DIR))

from git_sync import DebouncedGitSync, normalize_sync_delay, run_capture_and_schedule, sync_repo


class FakeTimer:
    def __init__(self, delay, callback):
        self.delay = delay
        self.callback = callback
        self.cancelled = False
        self.daemon = False
        self.started = False

    def cancel(self):
        self.cancelled = True

    def start(self):
        self.started = True


class GitSyncTests(unittest.TestCase):
    def test_sync_delay_is_never_shorter_than_five_minutes(self):
        self.assertEqual(normalize_sync_delay("60"), 300)
        self.assertEqual(normalize_sync_delay("invalid"), 300)
        self.assertEqual(normalize_sync_delay("600"), 600)

    def test_sync_only_stages_tool_data_then_commits_and_pushes(self):
        commands = []

        def runner(command, **kwargs):
            commands.append(command)
            if command[3:] == ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]:
                return SimpleNamespace(returncode=0, stdout="origin/main\n", stderr="")
            if command[3:6] == ["diff", "--cached", "--quiet"]:
                return SimpleNamespace(returncode=1, stdout="", stderr="")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        changed = sync_repo(Path("/repo"), runner=runner)

        self.assertTrue(changed)
        self.assertEqual(commands, [
            ["git", "-C", "/repo", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
            ["git", "-C", "/repo", "add", "--", "data/tools"],
            ["git", "-C", "/repo", "diff", "--cached", "--quiet", "--", "data/tools"],
            ["git", "-C", "/repo", "commit", "-m", "data: sync captured bookmarks", "--", "data/tools"],
            ["git", "-C", "/repo", "push"],
        ])

    def test_sync_skips_commit_and_push_when_tool_data_is_unchanged(self):
        commands = []

        def runner(command, **kwargs):
            commands.append(command)
            if command[3:] == ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]:
                return SimpleNamespace(returncode=0, stdout="origin/main\n", stderr="")
            if command[3:] == ["rev-list", "--count", "@{u}..HEAD"]:
                return SimpleNamespace(returncode=0, stdout="0\n", stderr="")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        changed = sync_repo(Path("/repo"), runner=runner)

        self.assertFalse(changed)
        self.assertEqual(len(commands), 4)

    def test_sync_retries_push_when_previous_commit_is_ahead(self):
        commands = []

        def runner(command, **kwargs):
            commands.append(command)
            if command[3:] == ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]:
                return SimpleNamespace(returncode=0, stdout="origin/main\n", stderr="")
            if command[3:] == ["rev-list", "--count", "@{u}..HEAD"]:
                return SimpleNamespace(returncode=0, stdout="1\n", stderr="")
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        changed = sync_repo(Path("/repo"), runner=runner)

        self.assertTrue(changed)
        self.assertEqual(commands[-1], ["git", "-C", "/repo", "push"])

    def test_sync_fails_closed_without_upstream_before_staging(self):
        commands = []

        def runner(command, **kwargs):
            commands.append(command)
            return SimpleNamespace(returncode=128, stdout="", stderr="no upstream")

        with self.assertRaises(subprocess.CalledProcessError):
            sync_repo(Path("/repo"), runner=runner)

        self.assertEqual(commands, [[
            "git", "-C", "/repo", "rev-parse", "--abbrev-ref",
            "--symbolic-full-name", "@{u}",
        ]])

    def test_sync_raises_when_git_command_fails(self):
        def runner(command, **kwargs):
            return SimpleNamespace(returncode=2, stdout="", stderr="broken")

        with self.assertRaises(subprocess.CalledProcessError):
            sync_repo(Path("/repo"), runner=runner)

    def test_fixed_window_coalesces_burst_captures_without_starvation(self):
        timers = []

        def timer_factory(delay, callback):
            timer = FakeTimer(delay, callback)
            timers.append(timer)
            return timer

        scheduler = DebouncedGitSync(
            Path("/repo"),
            delay_seconds=300,
            timer_factory=timer_factory,
            sync=lambda _repo: None,
        )

        scheduler.schedule()
        scheduler.schedule()

        self.assertEqual(len(timers), 1)
        self.assertFalse(timers[0].cancelled)
        self.assertTrue(timers[0].started)
        self.assertEqual(timers[0].delay, 300)

    def test_capture_success_schedules_sync(self):
        scheduled = []
        scheduler = SimpleNamespace(schedule=lambda: scheduled.append(True))

        result = run_capture_and_schedule(
            ["python", "capture.py", "https://example.com"],
            scheduler,
            runner=lambda *_args, **_kwargs: SimpleNamespace(returncode=0),
        )

        self.assertEqual(result, 0)
        self.assertEqual(scheduled, [True])

    def test_capture_failure_does_not_schedule_sync(self):
        scheduled = []
        scheduler = SimpleNamespace(schedule=lambda: scheduled.append(True))

        result = run_capture_and_schedule(
            ["python", "capture.py", "https://example.com"],
            scheduler,
            runner=lambda *_args, **_kwargs: SimpleNamespace(returncode=3),
        )

        self.assertEqual(result, 3)
        self.assertEqual(scheduled, [])


if __name__ == "__main__":
    unittest.main()
