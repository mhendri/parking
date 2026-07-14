// ==UserScript==
// @name         LAZ Parking Auto-Pay (Zone 433)
// @description  Auto-fills license plate and duration on pay.lazparking.com and advances to the payment step. You confirm with Apple Pay / Face ID.
// @match        https://pay.lazparking.com/*
// @inject-into  content
// @run-at       document-idle
// ==/UserScript==

/*
 * HOW THIS WORKS
 * --------------
 * pay.lazparking.com is a JavaScript single-page app. This script watches the
 * page as it renders and, whenever it recognizes a step of the checkout flow,
 * fills it in and advances:
 *
 *   1. License plate field  -> fills CONFIG.plate
 *   2. State/region picker  -> selects CONFIG.state (if present)
 *   3. Duration/rate picker -> clicks the option matching CONFIG.durationText
 *   4. "Continue"/"Next"    -> clicks through
 *
 * It deliberately STOPS at the payment step. Apple Pay (or Safari's saved
 * card autofill) takes over there — that's your single Face ID confirmation.
 * The script never sees or stores card data.
 *
 * FIRST-RUN CALIBRATION
 * ---------------------
 * This script matches fields heuristically (by placeholder/label/name text)
 * because LAZ can change their markup at any time. If a step doesn't
 * auto-fill:
 *   1. On the page, tap the "aA" menu in Safari -> Userscripts -> check logs,
 *      or open the page on a Mac and watch the console ([LAZ-autopay] lines).
 *   2. Adjust the matching text in CONFIG below (e.g. if your duration button
 *      says "10 Hours" instead of "All Day", change durationText).
 */

const CONFIG = {
  // Your license plate, exactly as registered.
  plate: "YOUR_PLATE_HERE",

  // Two-letter state code for the plate dropdown, if the site asks for one.
  state: "NY",

  // Text that appears on the duration / rate option you want.
  // Matching is case-insensitive and partial. Examples that typically appear
  // on LAZ zone pages: "All Day", "Daily Max", "12 hr", "2 Hours".
  durationText: "All Day",

  // Zone/location guard: only run on your zone so a shared link to another
  // garage doesn't get auto-filled. Set to "" to run on any zone.
  zonePath: "/433",

  // Set true to also auto-click the final "Pay" button AFTER a payment method
  // is already on file with the browser. Leave false for the safe default:
  // you review the amount and confirm yourself.
  autoAdvanceToPayment: false,
};

(() => {
  "use strict";

  const TAG = "[LAZ-autopay]";
  const log = (...a) => console.log(TAG, ...a);

  if (CONFIG.zonePath && !location.pathname.startsWith(CONFIG.zonePath)) {
    log("Not zone", CONFIG.zonePath, "- skipping. Current path:", location.pathname);
    return;
  }

  // Remember what we've already done so re-renders don't cause double actions.
  const done = new Set();
  const once = (key, fn) => {
    if (done.has(key)) return false;
    done.add(key);
    fn();
    return true;
  };

  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const containsText = (el, text) => norm(el.textContent).includes(norm(text));

  // React and similar frameworks ignore plain .value assignment; use the
  // native setter and fire input/change events so state actually updates.
  const setNativeValue = (input, value) => {
    const proto = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
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
        el.getAttribute("autocomplete"),
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
      return blob.includes("state") || blob.includes("region") || blob.includes("province");
    });

  const findDurationOption = () => {
    // Rate options are usually buttons, list items, or labeled radio cards.
    const candidates = document.querySelectorAll(
      "button, [role=button], [role=radio], label, li, .rate, [class*=rate], [class*=duration], [class*=option]"
    );
    for (const el of candidates) {
      if (containsText(el, CONFIG.durationText) && el.offsetParent !== null) {
        // Prefer the innermost clickable element containing the text.
        const inner = [...el.querySelectorAll("button, [role=button], input[type=radio]")]
          .find((c) => containsText(c.parentElement || c, CONFIG.durationText));
        return inner || el;
      }
    }
    return null;
  };

  const findAdvanceButton = () => {
    const words = ["continue", "next", "confirm", "proceed", "review"];
    if (CONFIG.autoAdvanceToPayment) words.push("pay now", "pay ", "purchase", "checkout");
    return [...document.querySelectorAll("button, [role=button], input[type=submit]")].find((el) => {
      const t = norm(el.textContent || el.value);
      return el.offsetParent !== null && !el.disabled && words.some((w) => t.includes(w));
    });
  };

  const tick = () => {
    const plateInput = findPlateInput();
    if (plateInput && norm(plateInput.value) !== norm(CONFIG.plate)) {
      once("plate", () => {
        setNativeValue(plateInput, CONFIG.plate);
        log("Filled plate:", CONFIG.plate);
      });
    }

    const stateSelect = findStateSelect();
    if (stateSelect && CONFIG.state) {
      once("state", () => {
        const opt = [...stateSelect.options].find(
          (o) => norm(o.value) === norm(CONFIG.state) || norm(o.textContent).startsWith(norm(CONFIG.state))
        );
        if (opt) {
          stateSelect.value = opt.value;
          stateSelect.dispatchEvent(new Event("change", { bubbles: true }));
          log("Selected state:", opt.textContent.trim());
        }
      });
    }

    const duration = findDurationOption();
    if (duration) {
      once("duration", () => {
        duration.click();
        log("Selected duration option matching:", CONFIG.durationText);
      });
    }

    // Only start clicking advance buttons after the plate is in.
    if (done.has("plate")) {
      const btn = findAdvanceButton();
      if (btn) {
        const key = "advance:" + norm(btn.textContent || btn.value);
        once(key, () => {
          btn.click();
          log("Clicked:", (btn.textContent || btn.value).trim());
        });
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

  // Stop watching after 3 minutes; by then you're on the payment sheet.
  setTimeout(() => observer.disconnect(), 3 * 60 * 1000);
})();
