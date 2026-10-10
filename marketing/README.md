# Marketing poster pipeline

Turns post specs into finished 1080x1350 Facebook posters plus a caption file, for founder approval.

1. Add a spec to `posts/<id>.json` (see `posts/wc-001-intro.json`). `*word*` in the headline renders as the serif italic accent.
2. `node marketing/scripts/poster.mjs [id ...] [--regen-art]`
3. Review `out/<id>.png` and `out/<id>.caption.txt`, then post by hand (Meta Business Suite).

Artwork is generated text-free by Qwen-Image 2512 on local ComfyUI (`MARKETING_COMFY_URL`, default 127.0.0.1:8188), about 90 s each, cached in `art/`.
All poster text is HTML. Phone, booking link and domain come from `brands/<brand>.json`, never the spec, and the render fails if any is missing.
