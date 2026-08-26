# RevPilot — Demo Video Recording Guide

Target: **one 5-minute video**, recorded section by section (not one take).

---

## Part 1 — Setup checklist (do this BEFORE recording)

### Environment

- [ ] `.\stop.ps1` then `.\start.ps1` — clean start of both services
- [ ] Optional: reseed for stable numbers → `cd backend; .venv\Scripts\python scripts\seed.py`
      (this wipes history — do it at least 10 min before recording so analytics look populated)
- [ ] Verify http://localhost:5173 loads and http://127.0.0.1:8000/health says `"payment_provider":"mock"`
- [ ] Check Gemini works: send one test message in the AI chat. If you get the rate-limit
      fallback, wait ~60s and retry — you want a real Gemini answer for the wow moment.
      (If it still fails: record anyway. The fallback reply is itself a feature — say so.)

### Browser

- [ ] Fresh browser window, ONLY these tabs: localhost:5173 (+ Razorpay dashboard tab if showing Test Mode)
- [ ] Hide bookmarks bar: `Ctrl+Shift+B`
- [ ] Zoom 100% (`Ctrl+0`)
- [ ] Pick ONE theme for the whole video (Light reads better) — toggle is top-right
- [ ] Sign out / mute: WhatsApp, Slack, Teams, Mail — turn on Windows Focus Assist / Do Not Disturb

### Recording

- [ ] Tool: **OBS Studio** (free) — or Xbox Game Bar (`Win+G`) if OBS feels heavy
- [ ] Settings: 1920×1080, 30 fps, capture the display (not window), microphone ON
- [ ] Mic: phone earbuds mic close to your mouth beats a laptop mic. Do a 10-second test
      recording and listen back before the real thing
- [ ] Record in SECTIONS (see script below). Mistake? Just pause, breathe, re-record that
      section. You will cut them together later.
- [ ] Move the mouse slowly. Click deliberately. Pause 1 second after each page loads.

---

## Part 2 — The Script (5:00)

Speak slowly. If a sentence feels long, it is. Pause at every `…`.

### SECTION 1 — Problem & Intro · 0:00–0:25 · *(on screen: landing page)*

> "Merchants have customer data, product data, and payment infrastructure — but turning
> all of that into revenue still takes manual analysis and manual intervention.
>
> This is RevPilot — an AI revenue agent platform we built for the Razorpay hackathon.
> Everything here runs on simulated test payments."

**Action:** land on the role-selection page, don't click yet.

---

### SECTION 2 — Customer: AI shopping agent · 0:25–1:20 · *(click CUSTOMER)*

> "Let's start as a customer. Here's the StrideX store. Instead of filters and dropdowns,
> I just tell the agent what I need."

**Action:** click into the chat input and type slowly:

```
I need running shoes for a half marathon under 5000 rupees
```

> "The agent isn't guessing — watch the activity trace. It's calling tools: searching the
> catalog, checking cross-sell affinities computed from actual order history…"

**Action:** expand "Agent activity", hover through 3–4 trace lines with the mouse.

> "And the recommendation explains itself: within budget, rated for long distance,
> and 30 percent of Speed Pro buyers also pick up these socks."

*(If Gemini is rate-limited in this take, say: "and notice — even when the AI hits its
quota, RevPilot degrades gracefully to a deterministic recommendation engine.")* Then move on.

---

### SECTION 3 — Cart & checkout success · 1:20–2:15

> "Let me grab the socks too — one click, based on that co-purchase affinity."

**Action:** add Speed Pro via card button, accept the cross-sell suggestion for socks,
open the cart, click **Checkout**.

> "Checkout prices everything server-side, runs it through the policy engine, and creates
> an order with our payment provider. This sandbox gateway signs events exactly like a
> real one — I'll prove that in a second."

**Action:** click **Pay now**. Wait for the green confirmation.

> "Payment captured. Signature verified, webhook processed, stock decremented,
> revenue recorded."

**Action:** open **Orders** — point at the new order marked PAID.

---

### SECTION 4 — Payment failure handled properly · 2:15–2:50

> "Now the part most demos skip: what happens when payment FAILS?"

**Action:** add any item, checkout again, click **Simulate failure**.

> "The gateway reports failure. RevPilot does NOT fulfill the order. No revenue is
> recorded, stock is untouched, and the failure is written to the audit trail.
> The customer sees exactly what happened."

**Action:** open **Orders**, point at the failed order state.

---

### SECTION 5 — Merchant: opportunities & the policy gate · 2:50–4:05 · *(back to landing → MERCHANT)*

> "Flip to the merchant side. Revenue, average order value, conversion — all computed
> from live order data."

**Action:** scroll the overview briefly, then open **AI Opportunities**.

> "Here's where it gets interesting. The revenue agent found cross-sell bundles in the
> order data. Let me review one."

**Action:** click **Review** on the top opportunity.

> "Every proposal carries its reasoning and confidence. Now watch the guardrail work —
> I'll try a thirty percent discount."

**Action:** click *"Try 30% — policy will block this"*.

> "Blocked. Maximum allowed is twenty percent. The attempt is audited, nothing executed."
> *(pause)* "Now the compliant path — six percent."

**Action:** click the 6% proposal → **Approve & execute offer**.

> "Merchant approval is the gate. Only now does the offer go active. The AI proposes;
> the human decides."

---

### SECTION 6 — Reports & audit · 4:05–4:45

**Action:** open **Reports** → pick Sales → download PDF (show it opening), then CSV.

> "Judges and merchants can export everything — sales, inventory, opportunities, and the
> full audit log."

**Action:** open **Audit**, filter actor = `policy_engine`, then scroll to show the chain.

> "And here's the receipt for everything you just watched: the proposal, the blocked
> discount, the approval, the webhook, the payment — who did it, why, and what the
> policy engine said."

---

### SECTION 7 — Close · 4:45–5:00 · *(on screen: audit trail or landing)*

> "RevPilot doesn't give an AI unrestricted access to money. It gives the agent the
> ability to act — bounded by policies, gated by merchant approval, with a complete
> audit trail. That's agentic commerce you can actually trust."

*(stop talking, cut)*

---

## Part 3 — Editing & upload

- Cut sections together; trim silences at head/tail of each take
- Add tiny title cards if you like ("Customer", "Merchant") — not required
- Export 1080p MP4, target ≤ 200 MB (YouTube handles this well; unlisted upload is fine)
- After upload: paste the URL into README `## Demo`, and save 6 screenshots as
  `screenshots/01-landing.png` … `06-audit.png` to fill the README table
- Suggested captures: landing · store+chat · checkout modal · dashboard ·
  policy-block modal · audit trail

## Common mistakes to avoid

- Reading code on camera — nobody wants it; the product IS the demo
- Saying "as you can see" while scrolling too fast — slow down or cut it
- Quoting exact metric numbers from memory — say "around eight thousand orders"
- One giant take — six short takes are easier and forgive mistakes
- Forgetting audio check — bad audio kills more demos than bad visuals
