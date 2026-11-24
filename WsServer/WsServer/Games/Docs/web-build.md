# Web builds

- A `.zip` with an HTML entry point — the shallowest `index.html`, else any `.htm*` (one
  nested folder is fine) — or a single self-contained `.html`.
- **Relative asset paths.** A release is served from `/g/{game}/r{n}/…` on the games origin;
  `src="/Build/game.js"` points outside it and shows a blank screen (`complete_build` warns).
- Limits: 200 MB uploaded, 500 MB / 5000 files unpacked.
- Nothing about the SDK goes into the archive: the `<script src="/jam-sdk.js">` tag is put
  into the entry as it is served (a bundled copy is replaced).
- Builds run on **another origin** than TOX (`play.…`), sandboxed in an iframe: they get their
  own storage and cannot reach TOX's. Release files are cached forever (a release number is
  never reused); every upload is a new release, the last 5 stay on disk.
- In the page the game sits next to its room's chat; on a phone it is full screen.
