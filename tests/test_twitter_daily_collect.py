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

    def test_model_names_allow_concatenated_version_numbers(self) -> None:
        versioned_models = [
            "我发现 ChatGPT5.6 特别喜欢给自己加戏。",
            "GPT5 在这个编码任务上的结果更稳定。",
            "Claude4 的工具调用能力有明显提升。",
        ]

        for text in versioned_models:
            score, breakdown = twitter.score_tweet(
                {"text": text, "likes": 10, "views": 1000}
            )
            self.assertGreater(score, 0, text)
            self.assertEqual(breakdown["ai_relevance"], 1.0, text)

    def test_chinese_and_local_model_names_are_strong_ai_signals(self) -> None:
        model_posts = [
            "通义发布 Qwen-Audio-3.0-TTS 语音模型。",
            "千问多模态模型今天正式更新。",
            "豆包发布新的推理能力。",
            "文心模型上线新的工具调用能力。",
            "混元开源了新的语音模型。",
        ]

        for text in model_posts:
            score, breakdown = twitter.score_tweet(
                {"text": text, "likes": 10, "views": 1000}
            )
            self.assertGreater(score, 0, text)
            self.assertEqual(breakdown["ai_relevance"], 1.0, text)

    def test_hard_filter_and_scorer_share_the_same_ai_signal_source(self) -> None:
        strong_signals = [
            "Opus 5 很强，适合复杂任务。",
            "Llama 4 发布了新的推理模型。",
            "Mistral 上线新的模型能力。",
            "RAG 实践能改善检索质量。",
            "通义发布 Qwen-Audio-3.0-TTS 语音模型。",
            "ChatGPT5.6特别喜欢给自己加戏。",
        ]

        for text in strong_signals:
            score, breakdown = twitter.score_tweet(
                {"text": text, "likes": 10, "views": 1000}
            )
            self.assertIsNone(twitter.hard_reject({"text": text}), text)
            self.assertGreater(score, 0, text)
            self.assertEqual(breakdown["ai_relevance"], 1.0, text)

        bare_model = {"text": "这个模型效果不错，但没有任何可验证细节。"}
        self.assertEqual(twitter.hard_reject(bare_model), "no_ai_signal")
        self.assertEqual(twitter.score_tweet(bare_model)[0], 0)

    def test_required_signal_examples_survive_hard_filter_and_pick(self) -> None:
        tweets = [
            {
                "id": "opus",
                "author": "opus-author",
                "text": "Opus 5 很强，适合复杂任务。",
                "likes": 30,
                "views": 1000,
            },
            {
                "id": "qwen",
                "author": "qwen-author",
                "text": "通义发布 Qwen-Audio-3.0-TTS 语音模型。",
                "likes": 30,
                "views": 1000,
            },
            {
                "id": "chatgpt",
                "author": "chatgpt-author",
                "text": "ChatGPT5.6特别喜欢给自己加戏。",
                "likes": 30,
                "views": 1000,
            },
            {
                "id": "politics",
                "author": "elonmusk",
                "text": "They are invading just as surely as a conventional army would.",
                "likes": 20545,
                "views": 2897694,
            },
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "input.json"
            pool_path = Path(temp_dir) / "pool.json"
            work_path = Path(temp_dir) / "work.json"
            input_path.write_text(json.dumps(tweets), encoding="utf-8")
            hard_filter_args = argparse.Namespace(
                inputs=[str(input_path)],
                out=str(pool_path),
                max_per_author=2,
                date="2026-07-26",
                slot="noon",
            )
            twitter.mode_hard_filter(hard_filter_args)
            pick_args = argparse.Namespace(
                pool_file=str(pool_path),
                inputs=[str(input_path)],
                out=str(work_path),
                top_n=20,
                max_per_author=2,
                date="2026-07-26",
                slot="noon",
            )
            twitter.mode_pick(pick_args)
            work = json.loads(work_path.read_text(encoding="utf-8"))

        self.assertEqual(
            {item["id"] for item in work["items"]}, {"opus", "qwen", "chatgpt"}
        )

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
        self.assertEqual([item["id"] for item in output["candidates"]], ["ai"])
        self.assertEqual(output["rejected"], {"no_ai_signal": 1})
        self.assertGreater(output["candidates"][0]["score"], 0)
        self.assertEqual(
            output["candidates"][0]["score_breakdown"][0], 1
        )
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

    def test_hard_filter_persists_compact_audit_records_without_full_text(self) -> None:
        long_text = (
            "OpenAI Codex released a detailed agent workflow with benchmarks, "
            "implementation notes, migration guidance, and production lessons. "
            "This trailing sentence must not be persisted in the Git-backed pool."
        )
        tweets = [
            {
                "id": "compact",
                "author": "researcher",
                "bio": "A long author biography that is not needed for pool audit.",
                "text": long_text,
                "url": "https://x.com/researcher/status/compact",
                "likes": 30,
                "views": 1000,
                "has_media": True,
                "media_urls": [
                    "https://pbs.twimg.com/media/one.jpg",
                    "https://pbs.twimg.com/media/two.jpg",
                ],
            }
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "input.json"
            output_path = Path(temp_dir) / "pool.json"
            input_path.write_text(json.dumps(tweets), encoding="utf-8")
            args = argparse.Namespace(
                inputs=[str(input_path)],
                out=str(output_path),
                date="2026-07-26",
                slot="noon",
            )

            twitter.mode_hard_filter(args)
            serialized = output_path.read_text(encoding="utf-8")
            output = json.loads(serialized)

        candidate = output["candidates"][0]
        self.assertEqual(output["schema_version"], 2)
        self.assertEqual(output["score_dimensions"], list(twitter.SCORE_DIMENSIONS))
        self.assertEqual(
            set(candidate),
            {
                "id",
                "author",
                "label",
                "ref",
                "score",
                "score_breakdown",
                "status",
            },
        )
        self.assertEqual(candidate["ref"], tweets[0]["url"])
        self.assertTrue(candidate["label"].endswith("…"))
        self.assertLessEqual(len(candidate["label"]), 97)
        self.assertEqual(len(candidate["score_breakdown"]), 5)
        self.assertIsInstance(candidate["score_breakdown"], list)
        self.assertNotIn(long_text, serialized)
        self.assertNotIn("\n  ", serialized)

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
                            {
                                "id": "already-published",
                                "status": "published",
                                "ref": (
                                    "data/twitter/2026-07-26.json"
                                    "#already-published"
                                ),
                            }
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
        self.assertEqual(
            output["candidates"][0]["ref"],
            "data/twitter/2026-07-26.json#already-published",
        )

    def test_pick_applies_author_cap_and_skips_zero_or_published_items(self) -> None:
        pool = {
            "schema_version": 2,
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
        source_tweets = [
            {
                "id": item["id"],
                "author": item["author"],
                "text": f"OpenAI source text for {item['id']}.",
                "url": f"https://x.com/{item['author']}/status/{item['id']}",
            }
            for item in pool["candidates"]
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            pool_path = Path(temp_dir) / "pool.json"
            source_path = Path(temp_dir) / "source.json"
            output_path = Path(temp_dir) / "work.json"
            pool_path.write_text(json.dumps(pool), encoding="utf-8")
            source_path.write_text(json.dumps(source_tweets), encoding="utf-8")
            args = argparse.Namespace(
                pool_file=str(pool_path),
                inputs=[str(source_path)],
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
        self.assertEqual(output["items"][0]["text"], "OpenAI source text for a1.")
        self.assertIsInstance(output["items"][0]["score_breakdown"], dict)
        self.assertEqual(output["top_n"], 20)
        self.assertEqual(output["max_per_author"], 2)

    def test_pick_fails_closed_when_source_cannot_hydrate_selected_item(self) -> None:
        pool = {
            "schema_version": 2,
            "score_dimensions": list(twitter.SCORE_DIMENSIONS),
            "candidates": [
                {
                    "id": "candidate",
                    "author": "author",
                    "label": "OpenAI candidate",
                    "ref": "https://x.com/author/status/candidate",
                    "score": 80,
                    "score_breakdown": [1.0, 0.5, 0.3, 0.8, 0.0],
                    "status": "pending",
                }
            ],
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            pool_path = Path(temp_dir) / "pool.json"
            source_path = Path(temp_dir) / "source.json"
            output_path = Path(temp_dir) / "work.json"
            pool_path.write_text(json.dumps(pool), encoding="utf-8")
            source_path.write_text("[]", encoding="utf-8")
            args = argparse.Namespace(
                pool_file=str(pool_path),
                inputs=[str(source_path)],
                out=str(output_path),
                top_n=20,
                max_per_author=2,
                date="2026-07-26",
                slot="noon",
            )

            result = twitter.mode_pick(args)

        self.assertEqual(result, 1)
        self.assertFalse(output_path.exists())

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
                inputs=[],
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
            "schema_version": 2,
            "candidates": [
                {
                    "id": "picked",
                    "author": "author-a",
                    "label": "OpenAI Codex workflow update.",
                    "ref": "https://x.com/author-a/status/picked",
                    "score": 88,
                    "score_breakdown": [1.0, 0.4, 0.2, 0.7, 0.0],
                    "status": "pending",
                },
                {
                    "id": "waiting",
                    "author": "author-b",
                    "label": "Another OpenAI update.",
                    "ref": "https://x.com/author-b/status/waiting",
                    "score": 70,
                    "score_breakdown": {"ai_relevance": 1.0},
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
        self.assertEqual(
            updated_pool["candidates"][0]["ref"],
            "data/twitter/2026-07-26.json#picked",
        )
        self.assertNotIn("status", day["items"][0])
        self.assertEqual(day["items"][0]["score"], 88)
        self.assertNotIn("score_breakdown", day["items"][0])
        self.assertNotIn("label", day["items"][0])
        self.assertNotIn("ref", day["items"][0])
        self.assertEqual(day["selection"]["per_run_max"], 20)
        self.assertEqual(day["selection"]["max_count"], 60)

    def test_merge_day_applies_author_cap_case_insensitively(self) -> None:
        batch = {
            "items": [
                {"id": "one", "author": "OpenAI", "score": 90},
                {"id": "two", "author": "openai", "score": 80},
                {"id": "three", "author": "OPENAI", "score": 70},
            ]
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            day_path = Path(temp_dir) / "day.json"
            batch_path = Path(temp_dir) / "batch.json"
            batch_path.write_text(json.dumps(batch), encoding="utf-8")
            result = twitter.mode_merge_day(
                argparse.Namespace(
                    day_file=str(day_path),
                    batch=str(batch_path),
                    date="2026-07-26",
                    slot="noon",
                    per_run_max=20,
                    day_max=60,
                    pool_file=None,
                )
            )
            day = json.loads(day_path.read_text(encoding="utf-8"))

        self.assertEqual(result, 0)
        self.assertEqual([item["id"] for item in day["items"]], ["one", "two"])
        self.assertEqual(day["selection"]["last_batch_skipped_author"], 1)

    def test_write_json_atomically_replaces_completed_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "nested" / "result.json"
            twitter.write_json_atomically(output_path, {"ok": True})
            self.assertEqual(
                json.loads(output_path.read_text(encoding="utf-8")), {"ok": True}
            )
            self.assertEqual(list(output_path.parent.glob("*.tmp")), [])

    def test_default_pool_path_uses_date_and_slot(self) -> None:
        self.assertEqual(
            twitter.default_pool_path("2026-07-26", "midnight"),
            Path("data/twitter/pool/2026-07-26-midnight.json"),
        )


if __name__ == "__main__":
    unittest.main()
