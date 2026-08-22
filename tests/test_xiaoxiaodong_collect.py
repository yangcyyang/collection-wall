import io
import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import date
from pathlib import Path
from unittest.mock import patch

from pipeline import xiaoxiaodong_collect as xxd


REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = REPO_ROOT / "tests" / "fixtures" / "xiaoxiaodong"
LIVE_SOURCE = REPO_ROOT / "data" / "prompts" / "xiaoxiaodong01.json"
SCRIPT = REPO_ROOT / "pipeline" / "xiaoxiaodong_collect.py"


def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


class PromptExtractionTests(unittest.TestCase):
    def test_prefers_the_longest_code_fence_and_copies_it_verbatim(self) -> None:
        long_prompt = (
            "请将我上传的每一张照片分别制作成一张独立的高级设计海报，"
            "不多图拼接，每张照片单独输出。整体采用 3:4竖版构图，"
            "上下两个区域高度严格1:1，各占画面50%，并保持原图结构与光影。"
        )
        text = (
            "intro\n"
            "```\nshort note that is still long enough to look like a prompt body xx\n```\n"
            "完整提示词如下\n"
            f"```\n{long_prompt}\n```\n"
        )
        prompt = xxd.extract_prompt(text)
        self.assertEqual(prompt, long_prompt)
        self.assertNotIn("short note", prompt or "")

    def test_extracts_a_clear_prompt_block_without_rewriting(self) -> None:
        prompt_body = (
            "围绕任意主题对象生成一张真实生活感的相册拼贴画面，"
            "把主题拆成多个同场景碎片，并保留手绘标记。"
        )
        body = f"最后一组的提示词：\n{prompt_body}"
        self.assertEqual(xxd.extract_prompt(body), prompt_body)

    def test_heading_prompt_block_is_extractable(self) -> None:
        prompt_body = (
            "请将我上传的每一张照片分别制作成一张独立的高级设计海报，"
            "不多图拼接，每张照片单独输出。整体采用3:4竖版构图。"
        )
        body = f"# 优化版提示词\n\n{prompt_body}"
        self.assertEqual(xxd.extract_prompt(body), prompt_body)

    def test_casual_mention_without_a_block_is_not_a_prompt(self) -> None:
        self.assertIsNone(
            xxd.extract_prompt(
                "GPT2 x 美学提示词\n\n今天只发返图，提示词见评论区，欢迎返图"
            )
        )


class NextWindowTests(unittest.TestCase):
    def test_next_window_is_the_seven_days_before_earliest_created_at(self) -> None:
        coverage = xxd.coverage_from_items(
            [
                {"created_at": "2026-05-25T02:29:41+00:00", "images": [{}, {}]},
                {"created_at": "2026-08-21T15:05:38+00:00", "images": [{}]},
            ],
            window_days=7,
            horizon=date(2026, 1, 1),
        )
        self.assertEqual(coverage["count"], 2)
        self.assertEqual(coverage["images"], 3)
        self.assertTrue(coverage["earliest"].startswith("2026-05-25"))
        self.assertTrue(coverage["latest"].startswith("2026-08-21"))
        self.assertEqual(
            coverage["next_window"],
            {"since": "2026-05-18", "until": "2026-05-25"},
        )
        self.assertEqual(
            coverage["remaining_windows"][1],
            {"since": "2026-05-11", "until": "2026-05-18"},
        )
        self.assertEqual(coverage["remaining_windows"][-1]["since"], "2026-01-01")
        self.assertFalse(coverage["complete"])

    def test_horizon_clips_the_final_partial_window_then_completes(self) -> None:
        windows = xxd.remaining_windows(
            until=date(2026, 1, 4),
            window_days=7,
            horizon=date(2026, 1, 1),
        )
        self.assertEqual(windows, [{"since": "2026-01-01", "until": "2026-01-04"}])
        self.assertEqual(
            xxd.remaining_windows(
                until=date(2026, 1, 1),
                window_days=7,
                horizon=date(2026, 1, 1),
            ),
            [],
        )


class IngestFilterTests(unittest.TestCase):
    def test_ingest_adds_only_new_image_and_prompt_tweets(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source_path = Path(temp_dir) / "xiaoxiaodong01.json"
            source_path.write_text(
                (FIXTURES / "existing.json").read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            before = json.loads(source_path.read_text(encoding="utf-8"))
            result = xxd.ingest_raw(
                FIXTURES / "raw_opencli.json",
                source_path,
            )
            after = json.loads(source_path.read_text(encoding="utf-8"))

        self.assertEqual(result["added"], 3)
        self.assertEqual(
            set(result["added_ids"]),
            {"new-fence", "new-block", "new-heading-block"},
        )
        self.assertEqual(result["skipped_dup"], 1)
        self.assertEqual(result["skipped_no_image"], 2)
        self.assertEqual(result["skipped_no_prompt"], 1)
        self.assertEqual(after["count"], 5)
        self.assertEqual(len(after["items"]), 5)

        kept = next(item for item in after["items"] if item["id"] == "existing-keep")
        self.assertEqual(kept["prompt"], "original prompt must stay untouched")
        self.assertEqual(kept["url"], before["items"][0]["url"])
        self.assertEqual(kept["text"], before["items"][0]["text"])
        self.assertEqual([item["id"] for item in after["items"][:2]], ["existing-keep", "existing-newer"])

        fence = next(item for item in after["items"] if item["id"] == "new-fence")
        self.assertEqual(fence["author"], "xiaoxiaodong01")
        self.assertEqual(
            fence["prompt"],
            "请将我上传的每一张照片分别制作成一张独立的高级设计海报，不多图拼接，每张照片单独输出。整体采用 3:4竖版构图，上下两个区域高度严格1:1，各占画面50%。",
        )
        self.assertEqual(
            fence["images"],
            [
                {
                    "url": "https://pbs.twimg.com/media/NEWFENCE.jpg",
                    "poster": "https://pbs.twimg.com/media/NEWFENCE.jpg",
                }
            ],
        )
        self.assertTrue(fence["created_at"].startswith("2026-05-11T08:00:00"))

        heading = next(item for item in after["items"] if item["id"] == "new-heading-block")
        self.assertEqual(heading["author"], "xiaoxiaodong01")
        self.assertNotIn("status", heading)
        self.assertEqual(set(heading), set(xxd.ITEM_FIELDS))

    def test_prompt_item_skips_no_image_or_no_prompt(self) -> None:
        self.assertIsNone(
            xxd.prompt_item_from_tweet(
                {
                    "id": "no-img",
                    "text": "```\n" + ("x" * 90) + "\n```",
                    "created_at": "2026-05-11T00:00:00+00:00",
                    "media_urls": [],
                }
            )
        )
        self.assertIsNone(
            xxd.prompt_item_from_tweet(
                {
                    "id": "no-prompt",
                    "text": "提示词见评论区",
                    "created_at": "2026-05-11T00:00:00+00:00",
                    "media_urls": ["https://pbs.twimg.com/media/A.jpg"],
                }
            )
        )


class CliSafetyTests(unittest.TestCase):
    def test_help_lists_the_operator_modes(self) -> None:
        result = _run(["--help"])
        self.assertEqual(result.returncode, 0)
        self.assertIn("resolve-coverage", result.stdout)
        self.assertIn("pull", result.stdout)
        self.assertIn("ingest", result.stdout)
        self.assertIn("run", result.stdout)
        self.assertIn("dry-run", result.stdout)

    def test_resolve_coverage_against_live_json(self) -> None:
        self.assertTrue(LIVE_SOURCE.exists())
        result = _run(["--mode", "resolve-coverage", "--source", str(LIVE_SOURCE)])
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        live = json.loads(LIVE_SOURCE.read_text(encoding="utf-8"))
        self.assertEqual(payload["count"], live["count"])
        self.assertGreater(payload["images"], 0)
        self.assertTrue(payload["earliest"].startswith("2026-05-25"))
        self.assertEqual(payload["next_window"]["until"], payload["earliest"][:10])
        self.assertEqual(payload["next_window"]["since"], "2026-05-18")
        self.assertIn("2026-05-11", [item["since"] for item in payload["remaining_windows"]])

    def test_pull_dry_run_does_not_call_opencli(self) -> None:
        with patch.object(xxd.subprocess, "run") as mocked:
            code = xxd.main(
                [
                    "--mode",
                    "pull",
                    "--since",
                    "2026-05-11",
                    "--until",
                    "2026-05-18",
                    "--dry-run",
                    "--out",
                    "/tmp/should-not-write.json",
                ]
            )
        self.assertEqual(code, 0)
        mocked.assert_not_called()

    def test_rate_limit_is_a_clean_nonzero_json_exit(self) -> None:
        fake = subprocess.CompletedProcess(
            args=["opencli"],
            returncode=1,
            stdout="",
            stderr="HTTP 429 Too Many Requests from x.com/i/api/graphql",
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            out_path = Path(temp_dir) / "raw.json"
            stdout = io.StringIO()
            stderr = io.StringIO()
            with patch.object(xxd.subprocess, "run", return_value=fake) as mocked:
                with redirect_stdout(stdout), redirect_stderr(stderr):
                    code = xxd.main(
                        [
                            "--mode",
                            "pull",
                            "--since",
                            "2026-05-11",
                            "--until",
                            "2026-05-18",
                            "--out",
                            str(out_path),
                        ]
                    )
        self.assertEqual(code, xxd.RATE_LIMIT_EXIT)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(
            payload,
            {
                "rate_limited": True,
                "window": {"since": "2026-05-11", "until": "2026-05-18"},
                "attempt": 1,
            },
        )
        self.assertFalse(out_path.exists())
        mocked.assert_called_once()
        argv = mocked.call_args.args[0]
        self.assertEqual(
            argv[1:4],
            [
                "twitter",
                "search",
                "from:xiaoxiaodong01 -filter:replies since:2026-05-11 until:2026-05-18",
            ],
        )
        self.assertIn("--product", argv)
        self.assertIn("live", argv)
        self.assertIn("-f", argv)

    def test_windows_list_stops_immediately_on_429_and_does_not_ingest(self) -> None:
        fake = subprocess.CompletedProcess(
            args=["opencli"],
            returncode=1,
            stdout='{"error":"rate limited","status":429}',
            stderr="",
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            source_path = Path(temp_dir) / "wall.json"
            source_path.write_text(
                (FIXTURES / "existing.json").read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            before = source_path.read_text(encoding="utf-8")
            with patch.object(xxd.subprocess, "run", return_value=fake) as mocked:
                code = xxd.main(
                    [
                        "--mode",
                        "run",
                        "--windows",
                        "2026-05-11:2026-05-18,2026-05-04:2026-05-11",
                        "--source",
                        str(source_path),
                        "--out",
                        str(Path(temp_dir) / "raw.json"),
                    ]
                )
            after = source_path.read_text(encoding="utf-8")

        self.assertEqual(code, xxd.RATE_LIMIT_EXIT)
        self.assertEqual(mocked.call_count, 1)
        self.assertEqual(after, before)


if __name__ == "__main__":
    unittest.main()
