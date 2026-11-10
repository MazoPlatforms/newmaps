import unittest

from scripts.build_cloudflare_assets import cloudflare_index_html, cloudflare_service_worker


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

    def test_service_worker_cache_is_scoped_to_the_deployment_revision(self):
        source = "const BUILD_REVISION = '__MAZO_BUILD_REVISION__';"
        revision = "a" * 40
        self.assertEqual(cloudflare_service_worker(source, revision), f"const BUILD_REVISION = '{revision}';")

    def test_service_worker_revision_rejects_untrusted_or_incomplete_values(self):
        with self.assertRaises(ValueError):
            cloudflare_service_worker("__MAZO_BUILD_REVISION__", "not-a-commit")


if __name__ == "__main__":
    unittest.main()
