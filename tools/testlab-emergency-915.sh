# 2026-11-12 first physical slot (PM-approved): emergency floor preset, build 915 (= 10c2e094),
# Pixel 6a + moto g05 on scenario 4 (monsoon), Pixel 6a only on 5 (alpine) = 3 device runs
# (PM 2026-11-11: the other 2 of the day's 5 physical slots go to the Unity benchmark).
# Run from the repo root: bash tools/testlab-emergency-915.sh <service-account.json>
SA=$1
export APK=testlab-results/apk915/app.apk LOOP=1 TIMEOUT=1800s
SCENARIO=4 MODELS=bluejay:32,lamul:35 node tools/testlab.mjs "$SA" 915s4 > testlab-results/lab915s4.txt 2>&1; echo "s4 exit $?"
SCENARIO=5 MODELS=bluejay:32 node tools/testlab.mjs "$SA" 915s5 > testlab-results/lab915s5.txt 2>&1; echo "s5 exit $?"
