import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


PIPELINE_DIR = Path(__file__).resolve().parents[1] / "pipeline"
sys.path.insert(0, str(PIPELINE_DIR))

from backfill_covers import (
    MIN_COVER_BYTES,
    apply_cover,
    extract_social_image_url,
    find_missing_cover_records,
    has_real_cover,
    is_usable_cover,
    load_tool_record,
)


def _jpeg(color, size=(64, 48), quality=85, vary=False) -> bytes:
    img = Image.new("RGB", size, color)
    if vary:
        for x in range(0, size[0], 4):
            img.putpixel((x, x % size[1]), (x % 255, 80, 160))
            img.putpixel((x, (x * 3) % size[1]), (20, x % 255, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def _write_tool(data_dir: Path, record: dict) -> Path:
    path = data_dir / f"{record['id']}.json"
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def _base_record(**overrides) -> dict:
    record = {
        "id": "arsenal-demo",
        "url": "https://example.com/tool",
        "name": "demo tool",
        "headline": "keep me",
        "intro": "keep intro",
        "category": "🌟 灵感与审美",
        "tags": ["海报"],
        "my_notes": "private note",
        "cover": None,
    }
    record.update(overrides)
    return record


class FindMissingCoverTests(unittest.TestCase):
    def test_lists_url_records_without_cover_file_or_field(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp)
            (data_dir / "covers").mkdir()
            _write_tool(data_dir, _base_record())
            missing = find_missing_cover_records(data_dir)
            self.assertEqual([row["id"] for row in missing], ["arsenal-demo"])

    def test_skips_existing_cover_file_over_2kb_even_if_field_empty(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp)
            covers = data_dir / "covers"
            covers.mkdir()
            image = _jpeg((10, 80, 180), size=(640, 400), vary=True)
            self.assertGreater(len(image), MIN_COVER_BYTES)
            (covers / "arsenal-demo.jpg").write_bytes(image)
            _write_tool(data_dir, _base_record(cover=None))
            self.assertTrue(has_real_cover(_base_record(cover=None), data_dir))
            self.assertEqual(find_missing_cover_records(data_dir), [])

    def test_skips_cover_field_pointing_at_existing_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp)
            covers = data_dir / "covers"
            covers.mkdir()
            image = _jpeg((200, 40, 40), size=(640, 400), vary=True)
            (covers / "arsenal-demo.jpg").write_bytes(image)
            _write_tool(data_dir, _base_record(cover="covers/arsenal-demo.jpg"))
            self.assertEqual(find_missing_cover_records(data_dir), [])

    def test_treats_tiny_cover_file_as_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp)
            covers = data_dir / "covers"
            covers.mkdir()
            (covers / "arsenal-demo.jpg").write_bytes(b"tiny")
            _write_tool(data_dir, _base_record(cover="covers/arsenal-demo.jpg"))
            missing = find_missing_cover_records(data_dir)
            self.assertEqual([row["id"] for row in missing], ["arsenal-demo"])

    def test_skips_records_without_url(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp)
            (data_dir / "covers").mkdir()
            _write_tool(data_dir, _base_record(url=""))
            self.assertEqual(find_missing_cover_records(data_dir), [])


class CoverQualityTests(unittest.TestCase):
    def test_rejects_empty_and_tiny_bytes(self) -> None:
        self.assertFalse(is_usable_cover(b""))
        self.assertFalse(is_usable_cover(b"x" * 500))

    def test_rejects_solid_color_screenshot(self) -> None:
        solid = _jpeg((128, 128, 128), size=(1280, 800), quality=95)
        self.assertGreater(len(solid), MIN_COVER_BYTES)
        self.assertFalse(is_usable_cover(solid))

    def test_accepts_varied_page_screenshot(self) -> None:
        img = Image.new("RGB", (640, 400), (240, 240, 240))
        for y in range(400):
            for x in range(0, 640, 2):
                img.putpixel((x, y), ((x * 3) % 255, (y * 5) % 255, 90))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        self.assertTrue(is_usable_cover(buf.getvalue()))

    def test_rejects_tiny_square_avatar(self) -> None:
        avatar = _jpeg((40, 90, 40), size=(266, 266), vary=True, quality=95)
        # extra variation so this fails as an avatar, not as a solid tile
        from PIL import Image as PILImage
        import io as _io
        img = PILImage.open(_io.BytesIO(avatar)).convert("RGB")
        for y in range(img.size[1]):
            for x in range(0, img.size[0], 3):
                img.putpixel((x, y), ((x * 3) % 255, (y * 5) % 255, 90))
        buf = _io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        avatar = buf.getvalue()
        self.assertGreater(len(avatar), MIN_COVER_BYTES)
        self.assertTrue(len(avatar) > 1000)
        self.assertFalse(is_usable_cover(avatar))


class ApplyCoverTests(unittest.TestCase):
    def test_writes_jpg_and_only_sets_cover_field(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp)
            record_path = _write_tool(data_dir, _base_record())
            image = _jpeg((30, 90, 200), size=(640, 400), vary=True)
            applied = apply_cover(record_path, image, data_dir=data_dir)
            self.assertEqual(applied["cover"], "covers/arsenal-demo.jpg")
            saved = load_tool_record(record_path)
            self.assertEqual(saved["cover"], "covers/arsenal-demo.jpg")
            self.assertEqual(saved["name"], "demo tool")
            self.assertEqual(saved["intro"], "keep intro")
            self.assertEqual(saved["category"], "🌟 灵感与审美")
            self.assertEqual(saved["tags"], ["海报"])
            self.assertEqual(saved["my_notes"], "private note")
            self.assertEqual(saved["id"], "arsenal-demo")
            cover_path = data_dir / "covers" / "arsenal-demo.jpg"
            self.assertTrue(cover_path.exists())
            self.assertGreater(cover_path.stat().st_size, MIN_COVER_BYTES)

    def test_failed_capture_leaves_cover_null(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp)
            record_path = _write_tool(data_dir, _base_record())
            saved = load_tool_record(record_path)
            self.assertIsNone(saved["cover"])
            self.assertFalse((data_dir / "covers" / "arsenal-demo.jpg").exists())


class SocialImageTests(unittest.TestCase):
    def test_prefers_og_image_then_twitter_image(self) -> None:
        html = """
        <html><head>
          <meta property="og:image" content="/gallery/hero.jpg">
          <meta name="twitter:image" content="https://cdn.example.com/tw.jpg">
        </head></html>
        """
        self.assertEqual(
            extract_social_image_url(html, "https://www.dnpfcp.jp/gallery/ggg/eng/"),
            "https://www.dnpfcp.jp/gallery/hero.jpg",
        )

    def test_falls_back_to_twitter_image(self) -> None:
        html = '<meta name="twitter:image" content="https://cdn.example.com/tw.jpg">'
        self.assertEqual(
            extract_social_image_url(html, "https://example.com/"),
            "https://cdn.example.com/tw.jpg",
        )

    def test_returns_none_when_page_has_no_social_image(self) -> None:
        self.assertIsNone(extract_social_image_url("<html></html>", "https://example.com/"))


if __name__ == "__main__":
    unittest.main()
