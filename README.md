# Brown Dust 2 L2D Viewer

Website to check the animations of the characters from the gacha game Brown Dust 2.<br/>
If you want to request a feature or report a bug you can open an issue.

## Android resource catalog

The Android player uses [`android-live2d.json`](./android-live2d.json) when the project root is selected as its resource directory. The catalog keeps the Android-facing character and costume names in Chinese and maps each entry to the `.skel`/`.atlas` files under `src/assets/spines`.

Spine binary files are not edited. The complete user-curated list is stored in `config/android-motion-allowlist.md` and applies only to `live2d-mobile-android`. The web viewer does not read this list or the Android catalog; its animation list and composite playback remain unchanged. In the Android catalog, entries matched by Chinese character and costume names show only the specified categories and playable animation names, in the listed order. Android uses the original web composite definitions from `src/utils/cutscene_mappings.ts`, including sequential, parallel and external-skeleton actions such as `cut_all`; every component must exist in its source skeleton. Unmatched entries retain their existing catalog. Missing actions are never guessed or renamed.

Regeneration verifies the matched `.skel` binaries and composite dependencies with the local Spine converter, writes playable counts and missing-resource details to `config/android-motion-report.json`, and updates the Android app's bundled `android-motion-allowlist.json`. The bundled rules also filter older imported catalogs. The report distinguishes native and composite counts; `missingMotions` lists only actions unavailable through either mechanism. Regenerate before rebuilding Android after editing the allowlist:

```sh
node scripts/export-android-library-config.mjs
```

## Donations

If you like the work and effort I put into the website and want to help me consider [supporting](https://ko-fi.com/jelosus1).

## License

MIT License

Copyright (c) 2025 Jelosus2

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
