# 2026-11-12 physical slots (PM re-plan): 3 of the day's 5; the Unity session has the other 2.
# Run from the repo root after the quota reset: bash tools/testlab-1112.sh <service-account.json>
SA=$1
# 1-2. RC5 vc 208 RELEASE build (universal APK from the CI AAB, not debuggable), Game Loop
#      scenario 1 on Pixel 6a + moto g05: the real-phone gate play.mjs promote needs.
APK=testlab-results/apk208/app.apk APK_SHA=f5cf4f5dd606ac5f5fa79d2dff8e07a8f7c62ee3 LOOP=1 TIMEOUT=1800s SCENARIO=1 \
  MODELS=bluejay:32,lamul:35 node tools/testlab.mjs "$SA" 208s1 > testlab-results/lab208s1.txt 2>&1; echo "rc5 exit $?"
# 3. Emergency floor preset (build 915) on monsoon, Pixel 6a only: budget data for Unity.
APK=testlab-results/apk915/app.apk LOOP=1 TIMEOUT=1800s SCENARIO=4 \
  MODELS=bluejay:32 node tools/testlab.mjs "$SA" 915s4 > testlab-results/lab915s4.txt 2>&1; echo "s4 exit $?"
