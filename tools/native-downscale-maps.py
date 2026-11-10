"""Native app build only: map loading heroes ship at 2400x1350 instead of 4K.

The website keeps 3840x2160 (loadingScreens.selftest). Phones top out near
2400 px wide (Pixel 6a 2400x1080), so the app copy loses nothing visible:
31.8 -> 12.2 MB of the APK (2026-11-09). Usage: python3 native-downscale-maps.py dist
"""
import os
import sys

from PIL import Image

MAX_W, MAX_H = 2400, 1350


def downscale(maps_dir):
    done = 0
    for name in sorted(os.listdir(maps_dir)):
        path = os.path.join(maps_dir, name)
        if not name.endswith('.webp') or not os.path.isfile(path):
            continue
        im = Image.open(path)
        im.load()
        if im.size[0] <= MAX_W:
            continue
        im.resize((MAX_W, MAX_H), Image.LANCZOS).save(path, 'WEBP', quality=88, method=6)
        done += 1
    return done


if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else 'dist'
    print('native-downscale-maps: resized', downscale(os.path.join(root, 'maps')))
