import argparse
import json
import tempfile
import unittest
from pathlib import Path

from pipeline import twitter_daily_collect as twitter


class TweetScoringTests(unittest.TestCase):
    def test_non_ai_substrings_do_not_pass_relevance_gate(self) -> None:
        political_tweets = [
            {
                "id": "2081152222121869635",
                "text": (
                    "They are invading just as surely as a conventional army would, "
                    "but slow enough to avoid triggering an armed defense by Britain"
                ),
                "likes": 20545,
                "views": 2897694,
            },
            {
                "id": "2081154036338692413",
                "text": (
                    "Any civilization that loses faith in the future will die. "
                    "Exploring the stars is an exciting future."
                ),
                "likes": 12042,
                "views": 1857740,
            },
        ]

        for tweet in political_tweets:
            score, breakdown = twitter.score_tweet(tweet)
            self.assertEqual(score, 0)
            self.assertEqual(breakdown["ai_relevance"], 0)

    def test_ai_tweet_has_positive_score_and_complete_breakdown(self) -> None:
        score, breakdown = twitter.score_tweet(
            {
                "text": "OpenAI released a new Codex coding agent workflow.",
                "likes": 120,
                "views": 6000,
                "has_media": True,
            }
        )

        self.assertGreater(score, 0)
        self.assertEqual(
            set(breakdown),
            {
                "ai_relevance",
                "popularity",
                "engagement_rate",
                "information_density",
                "has_media",
            },
        )

    def test_opus_hands_on_posts_are_strong_ai_signals(self) -> None:
        opus_posts = [
            (
                "Opus 5 - Day 2 Insights. It is more detailed and thorough, "
                "more expensive but overall worth it."
            ),
            (
                "Tried a kinetic pavilion concept with Opus 5. It produced a "
                "practical architectural design and realistic opening mechanism."
            ),
        ]

        for text in opus_posts:
            score, breakdown = twitter.score_tweet(
                {"text": text, "likes": 10, "views": 1000}
            )
            self.assertGreater(score, 0)
            self.assertEqual(breakdown["ai_relevance"], 1.0)

    def test_relevance_distinguishes_weak_and_strong_ai_signals(self) -> None:
        cases = [
            ("AI is changing everything.", 0.5),
            ("AIGC will change content creation.", 0.5),
            ("AGI may arrive sooner than expected.", 0.5),
            ("Claude Sonnet shipped a new benchmark result.", 1.0),
            ("Haiku is faster in this hands-on test.", 1.0),
            ("This RAG pipeline improves retrieval quality.", 1.0),
            ("微调后模型在真实任务上的准确率更高。", 1.0),
            ("这个开源模型的推理性能很强。", 1.0),
        ]

        for text, expected in cases:
            _, breakdown = twitter.score_tweet(
                {"text": text, "likes": 10, "views": 1000}
            )
            self.assertEqual(breakdown["ai_relevance"], expected, text)

    def test_hard_filter_sorts_by_score_instead_of_raw_likes(self) -> None:
        tweets = [
            {
                "id": "political",
                "author": "elonmusk",
                "text": (
                    "They are invading just as surely as a conventional army would, "
                    "but slow enough to avoid triggering an armed defense by Britain"
                ),
                "likes": 20545,
                "views": 2897694,
            },
            {
                "id": "ai",
                "author": "researcher",
                "text": "OpenAI released a useful Codex workflow for coding agents.",
                "likes": 30,
                "views": 1000,
            },
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "input.json"
            output_path = Path(temp_dir) / "output.json"
            input_path.write_text(
                json.dumps(tweets, ensure_ascii=False), encoding="utf-8"
            )
            args = argparse.Namespace(
                inputs=[str(input_path)],
                out=str(output_path),
                max_per_author=2,
            )

            result = twitter.mode_hard_filter(args)
            output = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(result, 2)
        self.assertEqual(
            [item["id"] for item in output["candidates"]], ["ai", "political"]
        )
        self.assertGreater(output["candidates"][0]["score"], 0)
        self.assertEqual(
            output["candidates"][0]["score_breakdown"]["ai_relevance"], 1
        )
        self.assertEqual(output["candidates"][1]["score"], 0)
        self.assertTrue(
            all(item["status"] == "pending" for item in output["candidates"])
        )

    def test_hard_filter_keeps_all_authors_for_the_pool(self) -> None:
        tweets = [
            {
                "id": f"same-author-{index}",
                "author": "same-author",
                "text": f"OpenAI Codex workflow update number {index}.",
                "likes": 30 - index,
                "views": 1000,
            }
            for index in range(3)
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "input.json"
            output_path = Path(temp_dir) / "output.json"
            input_path.write_text(json.dumps(tweets), encoding="utf-8")
            args = argparse.Namespace(
                inputs=[str(input_path)],
                out=str(output_path),
                max_per_author=2,
                date="2026-07-26",
                slot="noon",
            )

            twitter.mode_hard_filter(args)
            output = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(len(output["candidates"]), 3)
        self.assertNotIn("author_cap", output["rejected"])
        self.assertTrue(
            all(item["status"] == "pending" for item in output["candidates"])
        )

    def test_hard_filter_rerun_preserves_published_status(self) -> None:
        tweets = [
            {
                "id": "already-published",
                "author": "researcher",
                "text": "OpenAI Codex workflow update with practical details.",
                "likes": 30,
                "views": 1000,
            }
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "input.json"
            output_path = Path(temp_dir) / "pool.json"
            input_path.write_text(json.dumps(tweets), encoding="utf-8")
            output_path.write_text(
                json.dumps(
                    {
                        "candidates": [
                            {"id": "already-published", "status": "published"}
                        ]
                    }
                ),
                encoding="utf-8",
            )
            args = argparse.Namespace(
                inputs=[str(input_path)],
                out=str(output_path),
                max_per_author=2,
                date="2026-07-26",
                slot="noon",
            )

            twitter.mode_hard_filter(args)
            output = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(output["candidates"][0]["status"], "published")

    def test_pick_applies_author_cap_and_skips_zero_or_published_items(self) -> None:
        pool = {
            "candidates": [
                {"id": "a1", "author": "author-a", "score": 100, "status": "pending"},
                {"id": "a2", "author": "author-a", "score": 90, "status": "pending"},
                {"id": "a3", "author": "author-a", "score": 80, "status": "pending"},
                {"id": "b1", "author": "author-b", "score": 70, "status": "pending"},
                {"id": "zero", "author": "author-c", "score": 0, "status": "pending"},
                {
                    "id": "published",
                    "author": "author-d",
                    "score": 99,
                    "status": "published",
                },
            ]
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            pool_path = Path(temp_dir) / "pool.json"
            output_path = Path(temp_dir) / "work.json"
            pool_path.write_text(json.dumps(pool), encoding="utf-8")
            args = argparse.Namespace(
                pool_file=str(pool_path),
                out=str(output_path),
                top_n=20,
                max_per_author=2,
                date="2026-07-26",
                slot="noon",
            )

            result = twitter.mode_pick(args)
            output = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(result, 0)
        self.assertEqual([item["id"] for item in output["items"]], ["a1", "a2", "b1"])
        self.assertEqual(output["top_n"], 20)
        self.assertEqual(output["max_per_author"], 2)

    def test_pick_with_zero_limit_returns_an_empty_work_order(self) -> None:
        pool = {
            "candidates": [
                {
                    "id": "candidate",
                    "author": "author",
                    "score": 80,
                    "status": "pending",
                }
            ]
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            pool_path = Path(temp_dir) / "pool.json"
            output_path = Path(temp_dir) / "work.json"
            pool_path.write_text(json.dumps(pool), encoding="utf-8")
            args = argparse.Namespace(
                pool_file=str(pool_path),
                out=str(output_path),
                top_n=0,
                max_per_author=2,
                date="2026-07-26",
                slot="noon",
            )

            twitter.mode_pick(args)
            output = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(output["items"], [])

    def test_merge_day_marks_published_pool_items_without_leaking_pool_fields(self) -> None:
        pool = {
            "candidates": [
                {
                    "id": "picked",
                    "author": "author-a",
                    "score": 88,
                    "score_breakdown": {"ai_relevance": 1.0},
                    "status": "pending",
                    "char_len": 42,
                    "is_short": True,
                },
                {
                    "id": "waiting",
                    "author": "author-b",
                    "score": 70,
                    "status": "pending",
                },
            ]
        }
        batch = {
            "items": [
                {
                    **pool["candidates"][0],
                    "text": "OpenAI Codex workflow update.",
                    "summary": "OpenAI Codex 工作流更新。",
                    "recommend_reason": "可用于评估编码工作流。",
                    "tags": ["OpenAI"],
                }
            ]
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            day_path = Path(temp_dir) / "day.json"
            pool_path = Path(temp_dir) / "pool.json"
            batch_path = Path(temp_dir) / "batch.json"
            pool_path.write_text(json.dumps(pool), encoding="utf-8")
            batch_path.write_text(json.dumps(batch), encoding="utf-8")
            args = argparse.Namespace(
                day_file=str(day_path),
                batch=str(batch_path),
                date="2026-07-26",
                slot="noon",
                per_run_max=20,
                day_max=60,
                pool_file=str(pool_path),
            )

            result = twitter.mode_merge_day(args)
            day = json.loads(day_path.read_text(encoding="utf-8"))
            updated_pool = json.loads(pool_path.read_text(encoding="utf-8"))

        self.assertEqual(result, 0)
        self.assertEqual(
            {item["id"]: item["status"] for item in updated_pool["candidates"]},
            {"picked": "published", "waiting": "pending"},
        )
        self.assertNotIn("status", day["items"][0])
        self.assertNotIn("score_breakdown", day["items"][0])
        self.assertNotIn("char_len", day["items"][0])
        self.assertNotIn("is_short", day["items"][0])
        self.assertEqual(day["selection"]["per_run_max"], 20)
        self.assertEqual(day["selection"]["max_count"], 60)

    def test_default_pool_path_uses_date_and_slot(self) -> None:
        self.assertEqual(
            twitter.default_pool_path("2026-07-26", "midnight"),
            Path("data/twitter/pool/2026-07-26-midnight.json"),
        )


if __name__ == "__main__":
    unittest.main()
