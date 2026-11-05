import unittest

from scripts.build_cloudflare_assets import cloudflare_index_html


class CloudflareAssetPathTests(unittest.TestCase):
    def test_workers_index_uses_root_asset_urls_for_nested_spa_routes(self):
        source = '''<head><link href="./assets/css/site.css?v=1">
<script src="./assets/js/app.js"></script>
<img src='./assets/mazo-mark.svg'><a href="./">Home</a>'''

        output = cloudflare_index_html(source)

        self.assertIn('<base href="/">', output)
        self.assertIn('href="/assets/css/site.css?v=1"', output)
        self.assertIn('src="/assets/js/app.js"', output)
        self.assertIn("src='/assets/mazo-mark.svg'", output)
        self.assertIn('href="/"', output)
        self.assertNotIn('./assets/', output)


if __name__ == "__main__":
    unittest.main()
