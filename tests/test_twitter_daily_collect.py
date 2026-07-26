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


if __name__ == "__main__":
    unittest.main()
