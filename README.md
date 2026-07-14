# One-Tap LAZ Parking Payment (MTA Pearl River, Zone 433)

Pay for daily commuter parking at [pay.lazparking.com/433](https://pay.lazparking.com/433)
from your iPhone Home Screen with **one tap + one Apple Pay confirmation**.

## How it works

The zone 433 link redirects to `go.lazparking.com`, whose checkout is:

1. Landing screen → tap **Go**
2. Rate screen ($1.25 + $0.15 fee = **$1.40**) → tap **Next**
3. Vehicle Information → type **license plate**, pick **state**
4. **Buy with Apple Pay**

The userscript in this repo ([`laz-autopay.user.js`](laz-autopay.user.js))
automates steps 1–3 the instant each screen renders: it taps Go and Next for
you and fills in your plate and state. You do step 4 — double-click the side
button, Face ID, done. Total routine: one tap on a Home Screen icon, one
Apple Pay confirm, under 10 seconds.

It's built this way on purpose: Apple Pay requires you to be present (that's
an Apple security guarantee, not a limitation of this setup), and it means
your card number is never stored anywhere in this automation — only your
plate is, in the script config on your phone. As a safety guard, the script
only acts on pages showing **MTA Pearl River**, so a LAZ link for some other
garage can never get auto-paid.

## Setup (10 minutes, once)

### Step 1 — Install the Userscripts app

1. Install **[Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887)**
   (free, open source) from the App Store.
2. Open the app once and note/choose its scripts folder (default is
   `iCloud Drive/Userscripts`).
3. Go to **Settings → Apps → Safari → Extensions → Userscripts**, turn it
   **on**, and under *Permissions* allow **`go.lazparking.com`** and
   **`pay.lazparking.com`** (or "All Websites").

### Step 2 — Install and configure the script

1. Get `laz-autopay.user.js` onto your phone (easiest: open the file on
   GitHub in Safari, tap **Raw**, select all, copy).
2. In the Userscripts app, create a new script, paste, and edit the `CONFIG`
   block at the top:

   ```js
   const CONFIG = {
     vehicles: [
       { label: "My car",    plate: "ABC1234", state: "NY" },
       // add more cars here, e.g.:
       // { label: "Other car", plate: "XYZ9876", state: "NY" },
     ],
     locationName: "MTA Pearl River", // safety guard — leave as is
     autoAdvanceToPayment: false,
   };
   ```

3. Save.

**Multiple cars:** list every car in `vehicles`. With one entry the script
just fills it in, as before. With two or more, whichever car you used *last
time* is pre-filled automatically, and a small "Car:" bar appears at the
bottom of the page — one tap switches the form to a different plate (and
that becomes the new default). Driving your usual car costs zero extra taps.

### Step 3 — Create the one-tap Home Screen button

Use the **Shortcuts app** for this — don't use Safari's *Add to Home Screen*.
(The /433 link instantly redirects to a `go.lazparking.com` session URL, so a
Safari bookmark captures the wrong, possibly single-use address. A Shortcut
stores the original URL and only follows the redirect when tapped.)

1. Open the **Shortcuts** app → tap **+**.
2. Tap **Add Action**, search for **Open URLs**, select it.
3. Tap the dim "URL" placeholder and enter `https://pay.lazparking.com/433`.
4. Tap the name at the top → **Rename** → "Pay Parking".
5. Same menu → **Add to Home Screen** → **Add**.

### Step 4 — Verify Apple Pay

The zone 433 page shows **Buy with Apple Pay** natively, so as long as Apple
Pay is set up in Wallet, you're done. (If you ever prefer manual card entry,
enable **Settings → Safari → Autofill → Credit Cards** so Safari fills it.)

## Daily use

Tap **Pay Parking** → the page taps Go and Next itself, your plate and state
appear → double-click side button, Face ID. Parked.

## Optional: a morning reminder

Shortcuts → **Automation** → **+** → *Time of Day* (e.g. weekdays 7:45 AM) →
run "Pay Parking". iOS pops the payment page up automatically so you don't
even have to remember the tap.

## Troubleshooting

- **Nothing happens on the page**: check the Userscripts extension is enabled
  for `go.lazparking.com` (the redirect target — not just pay.lazparking.com).
- **A step doesn't advance**: LAZ renamed a button. Open the page on a Mac,
  watch the `[LAZ-autopay]` console lines, and add the new button text to
  `ADVANCE_WORDS` near the top of the script.
- **Wrong garage protection**: the script refuses to act unless the page
  shows "MTA Pearl River" (or you're on the /433 zone path). Change
  `locationName` if MTA/LAZ ever rename the facility.
