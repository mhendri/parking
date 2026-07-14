# One-Tap LAZ Parking Payment (Zone 433)

Pay for daily commuter parking at [pay.lazparking.com/433](https://pay.lazparking.com/433)
from your iPhone Home Screen with **one tap + one Face ID confirmation**.

## How it works (and why it's built this way)

`pay.lazparking.com` is a JavaScript web app protected by bot detection, and its
final step is a card / Apple Pay payment that requires a human confirmation
(Face ID or 3-D Secure). That means a fully headless "script that silently pays"
isn't achievable — and wouldn't be a good idea anyway, since it would need your
raw card number stored in plain text.

What *is* achievable, and what this repo sets up:

1. **One tap** on a Home Screen icon opens the zone 433 payment page.
2. A **Safari userscript** ([`laz-autopay.user.js`](laz-autopay.user.js))
   instantly fills in your license plate, picks your usual duration, and
   clicks through to the payment step.
3. You confirm with **Apple Pay (double-click + Face ID)** or Safari's saved
   card autofill. Done — typically under 10 seconds, no typing.

Your plate lives in the script config on your phone; your card never does.

## Setup (10 minutes, once)

### Step 1 — Install the Userscripts app

1. Install **[Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887)**
   (free, open source) from the App Store.
2. Open the app once and note/choose its scripts folder (default is
   `iCloud Drive/Userscripts`).
3. Go to **Settings → Apps → Safari → Extensions → Userscripts** and turn it
   **on**. Under *Permissions*, allow it for `pay.lazparking.com`
   (or "All Websites").

### Step 2 — Install and configure the script

1. Get `laz-autopay.user.js` from this repo onto your phone (easiest: open
   this file on GitHub in Safari, tap **Raw**, select all, copy).
2. In the Userscripts app, create a new script, paste, and edit the `CONFIG`
   block at the top:

   ```js
   const CONFIG = {
     plate: "ABC1234",        // your license plate
     state: "NY",             // plate state, if the site asks
     durationText: "All Day", // text on the rate button you always pick
     zonePath: "/433",
     autoAdvanceToPayment: false,
   };
   ```

3. Save. The script only runs on `pay.lazparking.com` and only on zone 433.

**Calibration:** the first time, watch it run. If a step doesn't auto-fill
(LAZ controls their markup and can change it), the fix is almost always
adjusting `durationText` to exactly match the wording on your zone's rate
button — see the comments at the top of the script.

### Step 3 — Create the one-tap Home Screen button

Option A — plain bookmark (simplest):

1. Open `https://pay.lazparking.com/433` in Safari.
2. Tap **Share → Add to Home Screen**, name it "Pay Parking".

Option B — Shortcuts (lets you add extras later, like only running on weekdays):

1. Open the **Shortcuts** app → **+** → add action **Open URLs** with
   `https://pay.lazparking.com/433`.
2. Name it "Pay Parking", tap the shortcut's icon → **Add to Home Screen**.

### Step 4 — Make payment one confirmation

- **Apple Pay** (best): if the LAZ page shows an Apple Pay button, that's it —
  double-click the side button, Face ID, parked.
- **Saved card**: in **Settings → Safari → Autofill**, enable *Credit Cards*
  and save your card once. Safari fills it on the payment step; you tap Pay.

## Daily use

Tap **Pay Parking** on your Home Screen → page opens, plate and duration fill
themselves → confirm payment with Face ID. That's the whole routine.

## Optional: a morning reminder

In Shortcuts → **Automation** → **+** → *Time of Day* (e.g. weekdays 7:45 AM) →
run the "Pay Parking" shortcut. iOS will pop it up automatically so you don't
even have to remember the tap. (iOS still requires you to be present for the
payment confirmation — that's an Apple Pay security guarantee, not a
limitation of this setup.)

## Notes & limits

- `autoAdvanceToPayment` is off by default so you always see the amount before
  paying. Flip it to `true` in the config if you want the script to also click
  the final button once your payment method is stored.
- If LAZ redesigns the page, the script's heuristics may need a tweak — the
  config and comments in `laz-autopay.user.js` explain how.
- Some LAZ zones remember your plate + card behind a phone-number login
  ("text to pay"). If zone 433 offers that, using it *plus* this script makes
  the flow even shorter.
