// ==UserScript==
// @name         LAZ Parking Auto-Pay (MTA Pearl River, zone 433)
// @description  Auto-taps Go/Next, fills license plate + state on go.lazparking.com, and stops at Apple Pay. You confirm with Face ID.
// @match        https://pay.lazparking.com/*
// @match        https://go.lazparking.com/*
// @inject-into  content
// @run-at       document-idle
// ==/UserScript==

/*
 * THE FLOW THIS AUTOMATES
 * -----------------------
 * pay.lazparking.com/433 redirects to go.lazparking.com, then:
 *
 *   1. Landing screen        -> taps "Go"
 *   2. Rate screen ($1.40)   -> taps "Next"
 *   3. Vehicle Information   -> fills "Your License Plate" + "Select State or
 *                               Province", from CONFIG below
 *   4. STOPS at "Buy with Apple Pay" — double-click the side button and
 *      Face ID. The script never sees or stores card data.
 *
 * If LAZ changes their wording/markup, adjust CONFIG or the button words in
 * ADVANCE_WORDS below. Watch console logs ([LAZ-autopay] lines) to debug.
 */

const CONFIG = {
  // Your license plate, exactly as registered.
  plate: "KKT2650",

  // State for the "Select State or Province" dropdown. Use the exact option
  // text ("New York") or the two-letter code ("NY") — both are tried.
  state: "NY",

  // Safety guard: only act when the page shows this location name, so a
  // LAZ link for some other garage never gets auto-paid. Set "" to disable.
  locationName: "MTA Pearl River",

  // Set true to also auto-click a final "Pay"/"Purchase" button if one
  // appears (manual-card flow). Leave false: with Apple Pay you confirm
  // on the Apple Pay sheet anyway, after seeing the total.
  autoAdvanceToPayment: false,
};

(() => {
  "use strict";

  const TAG = "[LAZ-autopay]";
  const log = (...a) => console.log(TAG, ...a);
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

  // Buttons we advance through. "go" must match exactly (too short to
  // substring-match safely); the rest match as substrings.
  const ADVANCE_EXACT = ["go"];
  const ADVANCE_WORDS = ["next", "continue", "proceed", "confirm", "review"];
  const PAY_WORDS = ["pay now", "purchase", "checkout", "submit payment"];

  // Only act once the page is confirmed to be our garage (or on the /433
  // zone path, before the redirect happens).
  const locationOk = () => {
    if (!CONFIG.locationName) return true;
    if (location.hostname === "pay.lazparking.com" && location.pathname.startsWith("/433")) return true;
    return norm(document.body && document.body.textContent).includes(norm(CONFIG.locationName));
  };

  // React ignores plain .value assignment; use the native setter and fire
  // events so the app's state actually updates.
  const setNativeValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const attrBlob = (el) =>
    norm(
      [
        el.placeholder,
        el.name,
        el.id,
        el.getAttribute("aria-label"),
        el.labels && el.labels[0] ? el.labels[0].textContent : "",
      ].join(" ")
    );

  const findPlateInput = () =>
    [...document.querySelectorAll("input[type=text], input:not([type])")].find((el) => {
      const blob = attrBlob(el);
      return blob.includes("plate") || blob.includes("license") || blob.includes("licence");
    });

  const findStateSelect = () =>
    [...document.querySelectorAll("select")].find((el) => {
      const blob = attrBlob(el);
      return blob.includes("state") || blob.includes("province") || blob.includes("region");
    });

  // Click bookkeeping: never re-click the same element, cap same-label
  // clicks at 3 with a cooldown, so SPA re-renders can move us forward
  // through repeated "Next" screens without ever loop-clicking.
  const clickedEls = new WeakSet();
  const clickCount = {};
  const lastClickAt = {};
  const clickButton = (el, label) => {
    const key = norm(label);
    if (clickedEls.has(el)) return;
    if ((clickCount[key] || 0) >= 3) return;
    if (Date.now() - (lastClickAt[key] || 0) < 1500) return;
    clickedEls.add(el);
    clickCount[key] = (clickCount[key] || 0) + 1;
    lastClickAt[key] = Date.now();
    el.click();
    log("Clicked:", label.trim());
  };

  const visibleButtons = () =>
    [...document.querySelectorAll("button, [role=button], input[type=submit]")].filter(
      (el) => el.offsetParent !== null && !el.disabled
    );

  let filledPlate = false;
  let filledState = false;

  const tick = () => {
    if (!locationOk()) return;

    const plateInput = findPlateInput();
    if (plateInput && !filledPlate) {
      filledPlate = true;
      setNativeValue(plateInput, CONFIG.plate.toUpperCase());
      log("Filled plate:", CONFIG.plate.toUpperCase());
    }

    const stateSelect = findStateSelect();
    if (stateSelect && !filledState && CONFIG.state) {
      const want = norm(CONFIG.state);
      const opt = [...stateSelect.options].find(
        (o) => norm(o.value) === want || norm(o.textContent) === want || norm(o.textContent).startsWith(want)
      );
      if (opt) {
        filledState = true;
        stateSelect.value = opt.value;
        stateSelect.dispatchEvent(new Event("change", { bubbles: true }));
        log("Selected state:", opt.textContent.trim());
      }
    }

    // Advance through Go/Next screens. Never auto-click anything on a
    // screen that has the plate field but isn't filled in yet.
    for (const el of visibleButtons()) {
      const t = norm(el.textContent || el.value);
      if (!t) continue;
      const isAdvance = ADVANCE_EXACT.includes(t) || ADVANCE_WORDS.some((w) => t.includes(w));
      const isPay = PAY_WORDS.some((w) => t.includes(w));
      if (t.includes("apple pay") || t.includes("google pay")) continue; // user's job
      if (isAdvance && (!plateInput || filledPlate)) {
        clickButton(el, t);
        break;
      }
      if (isPay && CONFIG.autoAdvanceToPayment && filledPlate) {
        clickButton(el, t);
        break;
      }
    }
  };

  // SPA: re-check on every DOM change, throttled.
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      try {
        tick();
      } catch (e) {
        log("Error:", e);
      }
    }, 300);
  });

  log("Active on", location.href);
  tick();
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  // Stop watching after 3 minutes; by then you're on the Apple Pay sheet.
  setTimeout(() => observer.disconnect(), 3 * 60 * 1000);
})();
