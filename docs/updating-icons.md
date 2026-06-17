# Updating the App Icon

The Chamber Bingo app icon appears on the home screen when users install it as a PWA, in the browser tab, and on the iOS "Add to Home Screen" prompt.

## What you need

- Adobe Photoshop
- A square version of the new logo (at least 512x512px recommended)

## Steps

1. Open your source logo in Photoshop
2. Go to **File > Scripts > Browse**
3. Navigate to `generate-pwa-icons.jsx` in the project root and run it
4. The script will save two files into `public/icons/`:
   - `icon-192.png` — used by Android Chrome and the PWA manifest
   - `icon-512.png` — used for splash screens and high-DPI displays
5. Commit both files and push to `main` — the deploy pipeline handles the rest

## Notes

- The source image should be square. If it isn't, the script will stretch it.
- A transparent background works fine for most platforms; Android may show it on a colored background depending on the device.
- If you want a separate maskable icon (Android adaptive icon with padding), create a version of the logo with ~20% padding on all sides and save it separately as `icon-512-maskable.png`, then update the `purpose: 'any maskable'` entry in `vite.config.ts` to point to it.
- You do not need to update `vite.config.ts`, `index.html`, or the manifest — they already point to these two files permanently.
