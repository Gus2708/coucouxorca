"""Run against Vite: python tests/ticker-layout.py http://localhost:1420 [screenshot]."""
import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    page = browser.new_page(viewport={"width": 450, "height": 180}, device_scale_factor=2)
    page.goto(sys.argv[1] + "/dev/ticker-preview.html")
    page.wait_for_function("window.tickerFixture")
    page.evaluate("window.tickerFixture.next(); window.tickerFixture.tick(0)")
    for frame in [0, 95, 190, 285, 380]:
        page.evaluate("ms => window.tickerFixture.tick(ms)", frame)
        rows = page.locator(".ticker-row").evaluate_all("""rows => rows.map(row => {
          const texts = [...row.querySelectorAll('.tick-text')].map(text => {
            const rect = text.getBoundingClientRect();
            return { y: rect.y, height: rect.height, width: rect.width, display: getComputedStyle(text).display };
          });
          return { texts, y: row.getBoundingClientRect().y, bottom: row.getBoundingClientRect().bottom };
        })""")
        for row in rows:
            shimmer, dim = row["texts"]
            assert abs(shimmer["y"] - dim["y"]) < 0.1, f"frame {frame}: duplicate text baselines differ: {row}"
            assert abs(shimmer["height"] - dim["height"]) < 0.1, f"frame {frame}: duplicate text boxes differ: {row}"
            assert abs(shimmer["width"] - dim["width"]) < 0.1, f"frame {frame}: long text layers have different widths: {row}"
        assert rows[0]["bottom"] <= rows[1]["y"] + 0.1, f"frame {frame}: adjacent rows overlap: {rows}"
        assert rows[1]["bottom"] <= rows[2]["y"] + 0.1, f"frame {frame}: incoming row overlaps current row: {rows}"
    if len(sys.argv) > 2:
        page.screenshot(path=sys.argv[2])
    browser.close()
print("Ticker layout: all 5 animation frames preserve aligned text layers and non-overlapping rows")
