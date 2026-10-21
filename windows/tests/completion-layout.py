"""Verify actual completion cards and completed-child click in a local Vite fixture."""
import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    page = browser.new_page(viewport={"width": 720, "height": 320}, device_scale_factor=2)
    page.goto(sys.argv[1] + "/dev/completion-preview.html")
    page.wait_for_function("window.completionFixture")
    page.locator(".view.on .agent-pill, .view.on .pill").filter(has_text="Diagnostic child").click()
    page.wait_for_function("window.completionFixture.State.view === 'finished'")
    summary = page.locator(".view.on .completion-summary")
    assert summary.inner_text().startswith("Child response:"), "Child inspected with principal result"
    geometry = summary.evaluate("el => ({height:el.clientHeight, scroll:el.scrollHeight, overflow:getComputedStyle(el).overflowY, ellipsis:getComputedStyle(el).textOverflow})")
    assert geometry["scroll"] > geometry["height"] > 30, geometry
    assert geometry["overflow"] == "auto" and geometry["ellipsis"] != "ellipsis", geometry
    summary.evaluate("el => el.scrollTop = el.scrollHeight")
    assert summary.evaluate("el => el.scrollTop") > 0
    page.evaluate("window.completionFixture.principal()")
    page.wait_for_function("document.querySelector('.view.on .completion-summary')?.textContent.startsWith('Desplegado')")
    page.wait_for_function("Number(getComputedStyle(document.querySelector('.view.on')).opacity) > .99")
    assert "Second paragraph" not in summary.inner_text()
    assert summary.evaluate("el => el.clientHeight") > 20, "Principal paragraph did not wrap"
    button = page.locator(".view.on button").filter(has_text="Open Orca")
    assert button.bounding_box()["y"] >= summary.bounding_box()["y"] + summary.bounding_box()["height"], "Buttons overlap summary"
    if len(sys.argv) > 2:
        page.screenshot(path=sys.argv[2])
    browser.close()
print("Completion layout: distinct child result, multiline principal paragraph, scrolling and non-overlapping actions verified")
