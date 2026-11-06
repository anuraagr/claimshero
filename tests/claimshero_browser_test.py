"""Verify ClaimsHero in isolated browsers without modifying the user's preview."""
import hashlib
import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "test-artifacts"
URL = os.environ.get("CLAIMSHERO_URL", "http://127.0.0.1:5173")
KEY = "claimshero-workbench-v1"
HERO = "EPIC-ENC-80026"
DIABETES = "EPIC-ENC-80076"
CHARGE = "EPIC-ENC-80073"
FALSE_POSITIVE = "EPIC-ENC-80068"
REASON = "Reviewed provider documentation, applicable-year coding, source excerpts, reportability and the scoped grouping."


def stored(page):
    return page.evaluate("(key) => JSON.parse(localStorage.getItem(key))", KEY)


def go(page, encounter, tab="review"):
    page.goto(f"{URL}/#encounter/{encounter}/{tab}")
    page.wait_for_load_state("networkidle")
    expect(page.locator(".encounter-heading")).to_be_visible()


def modify(page):
    page.locator(".persistent-claim-actions").get_by_role("button", name="Modify", exact=True).click()
    dialog = page.get_by_role("dialog", name="Modify claim", exact=True)
    expect(dialog).to_be_visible()
    return dialog


def attest(dialog):
    dialog.get_by_label("Review rationale", exact=True).fill(REASON)
    dialog.locator(".attestation input").check()


def no_overflow(page):
    dimensions = page.evaluate("({inner:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})")
    assert dimensions["client"] == page.viewport_size["width"], dimensions
    assert dimensions["scroll"] <= dimensions["client"] and dimensions["inner"] == dimensions["client"], dimensions


def main():
    ARTIFACTS.mkdir(exist_ok=True)
    manifest = json.loads((ROOT / "public" / "inputs" / "manifest.json").read_text())
    hashes = {item["name"]: hashlib.sha256((ROOT / "public" / "inputs" / item["name"]).read_bytes()).hexdigest() for item in manifest}
    for item in manifest:
        assert hashes[item["name"]] == item["sha256"]
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1500, "height": 1000}, accept_downloads=True)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL)
        page.wait_for_load_state("networkidle")
        expect(page).to_have_title("ClaimsHero | Claims administration")
        expect(page.get_by_role("heading", name="Welcome back, Morgan")).to_be_visible()
        expect(page.locator(".home-claim")).to_have_count(4)
        page.get_by_label("Automatic demo notifications").uncheck()
        original_claims = {key: value["claim"] for key, value in stored(page)["reviews"].items()}
        no_overflow(page)

        page.get_by_label("Search home queue").fill("Nadia")
        expect(page.locator(".home-claim")).to_have_count(2)
        page.get_by_label("Search home queue").fill("not-a-patient")
        expect(page.get_by_role("heading", name="No claims match this view")).to_be_visible()
        page.get_by_role("button", name="Show all claims", exact=True).click()
        expect(page.locator(".home-claim")).to_have_count(4)

        page.get_by_role("button", name="Guided demo", exact=True).click()
        page.get_by_role("button", name="Trigger notification", exact=True).click()
        expect(page.locator(".notification-feed .unread-count")).to_have_text("1")
        expect(page.locator(".home-claim").filter(has_text="David Okafor")).to_contain_text("Decision needed")
        expect(page.locator(".home-metrics")).to_contain_text("$8,000")
        page.get_by_role("button", name="Close guided walkthrough", exact=True).click()
        if page.get_by_role("button", name="Dismiss notification", exact=True).count():
            page.get_by_role("button", name="Dismiss notification", exact=True).click()
        page.screenshot(path=str(ARTIFACTS / "claimshero-home.png"), full_page=True)
        page.get_by_role("button", name="Guided demo", exact=True).click()
        page.get_by_role("button", name="Open notification: New claim analysis ready", exact=True).click()
        expect(page.locator(".last-reviewed")).to_contain_text("David Okafor")
        assert stored(page)["demo"]["notifications"][0]["read"] is True
        expect(page.locator(".code-selection-grid")).to_contain_text("G97.41")
        expect(page.locator(".code-selection-grid")).to_contain_text("G97.48")
        expect(page.locator(".silo-card")).to_have_count(3)
        expect(page.locator(".persistent-claim-actions")).to_be_in_viewport()
        page.locator(".code-option").nth(2).get_by_role("button", name="Review source", exact=True).click()
        expect(page.locator(".evidence-check-heading")).to_contain_text("G97.48")
        expect(page.locator(".code-document-status")).to_contain_text("Not supported")
        page.keyboard.press("Escape")
        page.get_by_role("button", name="Inspect supporting documentation", exact=True).click()
        expect(page.get_by_role("dialog", name="Supporting documentation")).to_be_visible()
        expect(page.locator(".supporting-excerpt")).to_contain_text("incidental 4mm ventral durotomy")
        expect(page.locator(".document-metadata")).to_contain_text("Not supplied")
        page.get_by_role("button", name="Code rationale", exact=True).click()
        expect(page.locator(".reasoning-content")).to_contain_text("G97.48")
        page.get_by_role("button", name="Documentation", exact=True).click()
        page.screenshot(path=str(ARTIFACTS / "claimshero-documentation.png"))
        page.keyboard.press("Escape")
        page.get_by_role("button", name="View supporting documentation for D62", exact=True).click()
        expect(page.locator(".document-metadata")).to_contain_text("Simulated signed provider response")
        expect(page.locator(".code-document-status")).to_contain_text("Linked")
        page.keyboard.press("Escape")

        page.get_by_role("button", name="Modify claim", exact=True).click()
        dialog = page.get_by_role("dialog", name="Modify claim", exact=True)
        expect(dialog.get_by_role("button", name="Approve coding changes", exact=True)).to_be_disabled()
        dialog.get_by_label("Review rationale", exact=True).fill("yes")
        dialog.locator(".attestation input").check()
        expect(dialog.get_by_role("button", name="Approve coding changes", exact=True)).to_be_disabled()
        attest(dialog)
        dialog.get_by_role("button", name="Approve coding changes", exact=True).click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        approved = stored(page)["reviews"][HERO]["claim"]
        assert approved["diagnoses"] == ["M48.062", "G97.41", "D62"]
        assert approved["procedures"] == ["0SG00AJ", "0SG30AJ"] and approved["drg"] == "448"
        page.get_by_role("button", name="Compare DRG & payment", exact=True).click()
        expect(page.locator(".payment-paths")).to_contain_text("451")
        expect(page.locator(".payment-paths")).to_contain_text("448")
        expect(page.locator(".payment-formula")).to_contain_text("$39,800")
        expect(page.locator(".payment-formula")).to_contain_text("$8,000")
        page.get_by_role("button", name="Preview corrected claim", exact=True).click()
        expect(page.get_by_role("button", name="Simulate claim submission", exact=True)).to_be_enabled()
        page.get_by_role("button", name="User and demo settings", exact=True).click()
        page.locator(".setting-toggle input").check()
        page.get_by_role("button", name="Close dialog", exact=True).click()
        page.locator(".persistent-claim-actions").get_by_role("button", name="Submit", exact=True).click()
        expect(page.locator(".toast.error")).to_contain_text("transport failed")
        assert stored(page)["reviews"][HERO]["status"] == "approved"
        assert "receipt" not in stored(page)["reviews"][HERO]
        page.get_by_role("button", name="User and demo settings", exact=True).click()
        page.locator(".setting-toggle input").uncheck()
        page.get_by_role("button", name="Close dialog", exact=True).click()
        page.get_by_role("button", name="Simulate reviewed submission", exact=True).click()
        expect(page.locator(".submission-receipt")).to_contain_text("SIM-80026-R2")
        expect(page.locator(".persistent-claim-actions").get_by_role("button", name="Submit", exact=True)).to_be_disabled()
        page.get_by_role("button", name="Return to updated home", exact=True).click()
        expect(page.locator(".home-claim").filter(has_text="David Okafor")).to_contain_text("Submitted")

        page.get_by_role("button", name="Simulate notification", exact=True).click()
        expect(page.get_by_role("button", name="Open notification: Documentation response received")).to_be_visible()
        assert stored(page)["reviews"][DIABETES]["query"]["status"] == "answered"
        assert stored(page)["reviews"][DIABETES]["claim"] == original_claims[DIABETES]
        expect(page.locator(".home-claim").filter(has_text="Nadia Rodriguez")).to_contain_text("Decision needed")
        page.get_by_role("button", name="Open notification: Documentation response received", exact=True).click()
        expect(page.locator(".code-selection-grid")).to_contain_text("E11.65")
        dialog = modify(page)
        attest(dialog)
        dialog.get_by_role("button", name="Approve coding changes", exact=True).click()
        assert stored(page)["reviews"][DIABETES]["claim"]["diagnoses"] == ["M48.062", "E11.65"]
        page.locator(".encounter-tabs").get_by_role("button", name="DRG & payment", exact=True).click()
        expect(page.locator(".payment-impact")).to_contain_text("No payment change")
        expect(page.locator(".payment-paths")).to_have_count(0)
        page.get_by_role("button", name="Return home", exact=True).click()

        page.get_by_role("button", name="Simulate notification", exact=True).click()
        expect(page.get_by_role("button", name="Simulate notification", exact=True)).to_be_disabled()
        expect(page.locator(".home-claim").filter(has_text="Nadia Washington")).to_contain_text("Coder reviewed")
        assert stored(page)["reviews"][FALSE_POSITIVE]["claim"] == original_claims[FALSE_POSITIVE]
        page.get_by_role("button", name="Open notification: Coder decision available", exact=True).click()
        expect(page.locator(".coder-result")).to_contain_text("reject the alert")
        dialog = modify(page)
        attest(dialog)
        expect(dialog.get_by_role("button", name="Approve coding changes", exact=True)).to_be_disabled()
        dialog.get_by_role("button", name="Reject false-positive alert", exact=True).click()
        assert stored(page)["reviews"][FALSE_POSITIVE]["claim"] == original_claims[FALSE_POSITIVE]
        assert stored(page)["reviews"][FALSE_POSITIVE]["status"] == "rejected"

        go(page, CHARGE, "charges")
        expect(page.locator(".missing-charge-row")).to_have_count(1)
        dialog = modify(page)
        attest(dialog)
        dialog.get_by_role("button", name="Approve charge correction", exact=True).click()
        expect(page.locator(".missing-charge-row")).to_have_count(0)
        assert stored(page)["reviews"][CHARGE]["claim"]["chargePosted"] is True
        assert stored(page)["reviews"][CHARGE]["claim"]["drg"] == "027"
        page.locator(".persistent-claim-actions").get_by_role("button", name="Submit", exact=True).click()
        expect(page.locator(".claim-document")).to_be_visible()
        page.locator(".persistent-claim-actions").get_by_role("button", name="Submit", exact=True).click()
        expect(page.locator(".submission-receipt")).to_contain_text("SIM-80073-R2")
        page.reload()
        page.wait_for_load_state("networkidle")
        expect(page.locator(".submission-receipt")).to_contain_text("SIM-80073-R2")
        with page.expect_download() as downloaded:
            page.get_by_role("button", name="Download preview", exact=True).click()
        downloaded.value.save_as(ARTIFACTS / "claimshero-claim.json")
        assert json.loads((ARTIFACTS / "claimshero-claim.json").read_text())["approvedClaim"]["drg"] == "027"

        go(page, "EPIC-ENC-80001")
        dialog = modify(page)
        dialog.locator(".resolution-modes").get_by_role("button", name="Route to coder", exact=True).click()
        dialog.get_by_label("Review rationale", exact=True).fill("FY2027 grouping and the imported retired DRG require specialist validation.")
        dialog.get_by_role("button", name="Route to coder", exact=True).last.click()
        assert stored(page)["reviews"]["EPIC-ENC-80001"]["owner"] == "Jordan Ellis, CCS"
        page.keyboard.press("Escape")
        page.get_by_role("button", name="Return home", exact=True).click()
        page.get_by_role("button", name="View all 80 encounters", exact=True).click()
        page.get_by_label("Opportunity filter").select_option("walkthroughs")
        expect(page.locator(".table-footer")).to_contain_text("4 encounters")
        page.get_by_label("Search encounters").fill("Nadia")
        expect(page.locator(".worklist-table tbody tr")).to_have_count(2)
        page.keyboard.press("Control+k")
        expect(page.get_by_role("dialog", name="Find an encounter")).to_be_visible()
        expect(page.get_by_label("Global encounter search")).to_be_focused()
        page.get_by_label("Global encounter search").fill("David Okafor")
        expect(page.locator(".command-results button")).to_have_count(1)
        page.keyboard.press("Escape")
        page.get_by_role("button", name="Audit trail", exact=True).click()
        expect(page.locator(".audit-list")).to_contain_text("Coder decision available")
        expect(page.locator(".audit-list")).to_contain_text("Coding corrections approved")
        with page.expect_download() as downloaded:
            page.get_by_role("button", name="Export audit", exact=True).click()
        downloaded.value.save_as(ARTIFACTS / "claimshero-audit.json")

        auto_context = browser.new_context()
        automatic = auto_context.new_page()
        await_error = []
        automatic.on("pageerror", lambda error: await_error.append(str(error)))
        automatic.clock.install()
        automatic.goto(URL)
        automatic.wait_for_load_state("networkidle")
        automatic.clock.fast_forward(45050)
        expect(automatic.locator(".notification-feed .unread-count")).to_have_text("1")
        automatic.get_by_label("Automatic demo notifications").uncheck()
        automatic.clock.fast_forward(90050)
        expect(automatic.locator(".notification-feed .unread-count")).to_have_text("1")
        automatic.get_by_label("Automatic demo notifications").check()
        automatic.clock.fast_forward(45050)
        expect(automatic.locator(".notification-feed .unread-count")).to_have_text("2")
        automatic.clock.fast_forward(45050)
        expect(automatic.locator(".notification-feed .unread-count")).to_have_text("3")
        assert stored(automatic)["reviews"][DIABETES]["claim"]["diagnoses"] == ["M48.062", "E11.9"]
        automatic.get_by_role("button", name="Mark read", exact=True).click()
        expect(automatic.locator(".notification-feed .unread-count")).to_have_text("0")
        errors.extend(await_error)
        auto_context.close()

        for width, height in [(390, 844), (820, 1000), (1024, 900)]:
            responsive = browser.new_context(viewport={"width": width, "height": height}, is_mobile=width == 390, device_scale_factor=1)
            rp = responsive.new_page()
            rp.on("pageerror", lambda error: errors.append(str(error)))
            rp.goto(URL)
            rp.wait_for_load_state("networkidle")
            rp.get_by_label("Automatic demo notifications").uncheck()
            no_overflow(rp)
            rp.get_by_role("button", name="Simulate notification", exact=True).click()
            if width == 390:
                rp.screenshot(path=str(ARTIFACTS / "claimshero-mobile.png"), full_page=True)
            rp.locator(".home-claim").filter(has_text="David Okafor").get_by_role("button", name="Review", exact=True).click()
            no_overflow(rp)
            expect(rp.locator(".persistent-claim-actions")).to_be_in_viewport()
            rp.get_by_role("button", name="View supporting documentation for G97.41", exact=True).click()
            expect(rp.get_by_role("dialog", name="Supporting documentation")).to_be_visible()
            rp.keyboard.press("Tab")
            assert rp.evaluate("!!document.activeElement.closest('[role=dialog]')")
            rp.keyboard.press("Escape")
            responsive.close()

        page.goto(f"{URL}/#overview")
        page.wait_for_load_state("networkidle")
        page.get_by_role("button", name="Reset demo", exact=True).click()
        page.get_by_role("dialog").get_by_role("button", name="Reset demo", exact=True).click()
        expect(page.locator(".notification-feed .unread-count")).to_have_text("0")
        assert stored(page)["demo"]["notificationIndex"] == 0
        assert stored(page)["demo"]["lastReviewed"] == []
        assert stored(page)["reviews"][HERO]["claim"]["drg"] == "460"
        assert stored(page)["reviews"][DIABETES]["query"]["status"] == "open"

        page.evaluate("(key) => localStorage.setItem(key, '{invalid')", KEY)
        page.reload()
        page.wait_for_load_state("networkidle")
        expect(page.get_by_text("Saved demo could not be loaded", exact=True)).to_be_visible()
        page.locator(".notice.error").get_by_role("button", name="Reset demo", exact=True).click()
        page.get_by_role("dialog").get_by_role("button", name="Reset demo", exact=True).click()
        expect(page.get_by_text("Saved demo could not be loaded", exact=True)).to_have_count(0)
        context.close()
        browser.close()

    for name, old_hash in hashes.items():
        assert hashlib.sha256((ROOT / "public" / "inputs" / name).read_bytes()).hexdigest() == old_hash, name
    assert not errors, errors
    print("PASS: ClaimsHero guided flow; timed/manual notifications; unread, queue and last-reviewed synchronization; all four cases; approval guards; submission failure/retry; persistent state; reset; downloads; responsive layouts; keyboard focus; immutable source files.")


if __name__ == "__main__":
    main()
