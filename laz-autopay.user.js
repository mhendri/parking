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
 *                               Province" with your last-used vehicle below
 *   4. STOPS at "Buy with Apple Pay" — double-click the side button and
 *      Face ID. The script never sees or stores card data.
 *
 * MULTIPLE CARS: list them all in CONFIG.vehicles. The last-used car is
 * pre-filled automatically and a small pill in the corner shows which one
 * (e.g. "🚗 Alfie"). Usual car? Ignore it. Different car today? Tap the
 * pill and pick — that becomes the new default for next time.
 *
 * If LAZ changes their wording/markup, adjust CONFIG or the button words in
 * ADVANCE_WORDS below. Watch console logs ([LAZ-autopay] lines) to debug.
 */

const CONFIG = {
  // Your cars. The first entry is the default until you've used the
  // switcher once; after that, whichever car you used last wins.
  // "state" accepts the two-letter code ("NY") or full text ("New York").
  vehicles: [
    { label: "My car", plate: "KKT2650", state: "NY" },
    { label: "Alfie", plate: "JNL1007", state: "NY" },
    { label: "Stelvio", plate: "KZT8591", state: "NY" },
    { label: "Q", plate: "MDR8958", state: "NY" },
    // etron: fill in the real plate, then uncomment:
    // { label: "etron", plate: "XXXXXXX", state: "NY" },
  ],

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
  const LAST_PLATE_KEY = "lazAutopayLastPlate";
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

  // ---- Vehicle selection -------------------------------------------------

  const vehicles = CONFIG.vehicles.filter((v) => v && v.plate);
  let activeVehicle = null;

  const defaultVehicle = () => {
    let last = null;
    try {
      last = localStorage.getItem(LAST_PLATE_KEY);
    } catch (e) {
      /* storage may be unavailable; fall through to first vehicle */
    }
    return vehicles.find((v) => norm(v.plate) === norm(last)) || vehicles[0];
  };

  const applyVehicle = (v) => {
    activeVehicle = v;
    const plateInput = findPlateInput();
    if (plateInput) {
      setNativeValue(plateInput, v.plate.toUpperCase());
      log("Filled plate:", v.plate.toUpperCase(), "(" + (v.label || "unlabeled") + ")");
    }
    const stateSelect = findStateSelect();
    if (stateSelect && v.state) {
      const want = norm(v.state);
      const opt = [...stateSelect.options].find(
        (o) => norm(o.value) === want || norm(o.textContent) === want || norm(o.textContent).startsWith(want)
      );
      if (opt) {
        stateSelect.value = opt.value;
        stateSelect.dispatchEvent(new Event("change", { bubbles: true }));
        log("Selected state:", opt.textContent.trim());
      }
    }
    try {
      localStorage.setItem(LAST_PLATE_KEY, v.plate);
    } catch (e) {
      /* non-fatal */
    }
    styleSwitcher();
  };

  // On-demand switcher: a small pill in the corner shows the active car;
  // tapping it expands the full picker. With one car, nothing is shown.
  let switcherBar = null;
  let pill = null;

  const collapseSwitcher = () => {
    if (switcherBar) {
      switcherBar.remove();
      switcherBar = null;
    }
  };

  const expandSwitcher = () => {
    if (switcherBar) return;
    switcherBar = document.createElement("div");
    switcherBar.style.cssText =
      "position:fixed;left:8px;right:8px;bottom:160px;z-index:999999;" +
      "display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px;border-radius:14px;" +
      "background:rgba(20,20,20,0.92);color:#fff;font:14px -apple-system,sans-serif;" +
      "box-shadow:0 4px 16px rgba(0,0,0,0.35);";
    const title = document.createElement("span");
    title.textContent = "Car:";
    title.style.cssText = "opacity:0.7;flex:0 0 auto;";
    switcherBar.appendChild(title);
    for (const v of vehicles) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = v.label || v.plate.toUpperCase();
      btn.dataset.plate = v.plate;
      btn.style.cssText =
        "flex:1 1 28%;padding:10px 6px;border-radius:10px;border:1px solid #555;" +
        "background:#333;color:#fff;font:inherit;";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyVehicle(v);
        collapseSwitcher();
      });
      switcherBar.appendChild(btn);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "✕";
    close.setAttribute("aria-label", "Close car picker");
    close.style.cssText =
      "flex:0 0 auto;padding:10px 12px;border:none;background:none;color:#aaa;font:inherit;";
    close.addEventListener("click", collapseSwitcher);
    switcherBar.appendChild(close);
    document.body.appendChild(switcherBar);
    styleSwitcher();
  };

  const showSwitcher = () => {
    if (pill || vehicles.length < 2) return;
    pill = document.createElement("button");
    pill.type = "button";
    pill.setAttribute("aria-label", "Switch car");
    pill.style.cssText =
      "position:fixed;right:10px;bottom:110px;z-index:999998;" +
      "padding:8px 14px;border-radius:999px;border:none;" +
      "background:rgba(20,20,20,0.85);color:#fff;font:13px -apple-system,sans-serif;" +
      "box-shadow:0 2px 10px rgba(0,0,0,0.3);";
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      switcherBar ? collapseSwitcher() : expandSwitcher();
    });
    document.body.appendChild(pill);
    styleSwitcher();
  };

  const styleSwitcher = () => {
    if (pill && activeVehicle) {
      pill.textContent = "🚗 " + (activeVehicle.label || activeVehicle.plate.toUpperCase()) + " ▾";
    }
    if (!switcherBar) return;
    for (const btn of switcherBar.querySelectorAll("button[data-plate]")) {
      const active = activeVehicle && norm(btn.dataset.plate) === norm(activeVehicle.plate);
      btn.style.background = active ? "#0a84ff" : "#333";
      btn.style.borderColor = active ? "#0a84ff" : "#555";
      btn.style.fontWeight = active ? "600" : "400";
    }
  };

  // ---- Click-through -----------------------------------------------------

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
      (el) =>
        el.offsetParent !== null &&
        !el.disabled &&
        el !== pill &&
        !(switcherBar && switcherBar.contains(el))
    );

  let filledOnce = false;

  const tick = () => {
    if (!locationOk() || vehicles.length === 0) return;

    const plateInput = findPlateInput();
    if (plateInput && !filledOnce) {
      filledOnce = true;
      applyVehicle(defaultVehicle());
      showSwitcher();
    }

    // Advance through Go/Next screens. Never auto-click anything on a
    // screen that has the plate field but isn't filled in yet.
    for (const el of visibleButtons()) {
      const t = norm(el.textContent || el.value);
      if (!t) continue;
      const isAdvance = ADVANCE_EXACT.includes(t) || ADVANCE_WORDS.some((w) => t.includes(w));
      const isPay = PAY_WORDS.some((w) => t.includes(w));
      if (t.includes("apple pay") || t.includes("google pay")) continue; // user's job
      if (isAdvance && (!plateInput || filledOnce)) {
        clickButton(el, t);
        break;
      }
      if (isPay && CONFIG.autoAdvanceToPayment && filledOnce) {
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
