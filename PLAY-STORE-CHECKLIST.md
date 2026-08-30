# Play Store Submission Checklist

## ✅ Done (automated)
- [x] Branding stripped — all Michael Woo references replaced
- [x] package.json: name=tank-royale, author=Michael Woo
- [x] index.html: title, meta, JSON-LD = Tank Royale
- [x] authorship.ts, localStorage keys, GitHub URLs updated
- [x] site.webmanifest created (fullscreen, dark, landscape)
- [x] Capacitor configured (appId: app.tankroyale)
- [x] Android project scaffolded + web assets synced
- [x] Gradle: release signing config wired (env var based)
- [x] AndroidManifest: INTERNET + network + WebRTC permissions
- [x] GitHub Actions CI: auto-builds debug APK on every push
- [x] Privacy policy written (store-assets/privacy-policy.html)
- [x] Play Store listing copy written (store-assets/play-store-listing.md)
- [x] App icon SVG created (store-assets/icon.svg)

---

## 🔴 3 Blockers — Must Do Manually

### Blocker 1: Push to GitHub (15 min)
1. Go to github.com → New repository → name: `tank-royale`, Private
2. Copy the repo URL
3. Run in terminal:
   ```
   cd C:\Users\mwoo7\Desktop\tank-royale
   git remote add origin https://github.com/mwoo778/tank-royale.git
   git push -u origin tank-royale-main
   ```
4. GitHub Actions fires automatically → APK built in ~5 min
5. Download APK: Actions tab → latest run → Artifacts → tank-royale-debug

### Blocker 2: Release keystore + GitHub secrets (10 min)
*After Android Studio or JDK 17 is installed:*
1. Run: `bash keystore-gen.sh` in the tank-royale folder
2. Copy the base64 output
3. Add 4 secrets to GitHub repo (Settings → Secrets → Actions):
   - `KEYSTORE_BASE64`
   - `KEYSTORE_PASSWORD`
   - `KEY_ALIAS` = tank-royale
   - `KEY_PASSWORD`
4. Push any change → CI builds signed release AAB automatically

### Blocker 3: Google Play Developer account ($25 one-time)
1. Go to: play.google.com/console
2. Pay $25 registration fee (credit card)
3. Create app → "Tank Royale" → Games → Action
4. Fill listing from: store-assets/play-store-listing.md
5. Upload AAB from CI artifact
6. Upload privacy policy URL (host store-assets/privacy-policy.html anywhere — GitHub Pages works, free)
7. Fill content rating questionnaire (Everyone 10+)
8. Submit for review (~3–7 days)

---

## ⚠️ Legal Note — Read Before Submitting
The tank generation code (procedural geometry + battlefield definitions) is based on Tank-Royale
source code which has a proprietary content license covering "procedural definitions."
The `build:public` script strips community/quarantine assets but the core procedural system remains.

**Safest path before store submission:**
Option A: Email Michael Woo (GitHub: MwooVancity) and ask for written permission to publish a
          derivative on the Play Store. Many open source authors say yes when asked.
Option B: Replace the tank geometry system with CC0 assets from kenney.nl/assets/tank-game-assets
          (significant engineering work, ~2–4 weeks).

Submitting without resolution = risk of DMCA takedown after launch.
