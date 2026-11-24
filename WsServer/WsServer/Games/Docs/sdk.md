# The `window.Jam` bridge

The MY.GAMES JAM SDK, unchanged — injected, nothing to install. Everything degrades to a no-op
outside the portal, nothing throws.

```
Jam.available            // true inside TOX's player
Jam.getGameId()          // the game's id
Jam.levelComplete(level, params?)   // the level funnel (the game's numbers)
Jam.logEvent(name, params?)         // anything else — decisions, not frames
Jam.gameLoading() / Jam.gameReady() // hold the loading screen until the game is playable
Jam.showRewarded({ onOpen, onReward, onClose, onError }) / Jam.showInterstitial(…)  // mock ads
Jam.setLeaderboardScore / getLeaderboardEntries / getLeaderboardEntry / getLeaderboardDescription
Jam.toast(message), Jam.haptics(ms | pattern), Jam.hapticTick()
```

- Event names `[a-z0-9_]{1,64}`; params ≤ 1 KB; ≤ 300 events per play session, ≤ 50 names per
  game (the rest fold into `_other`). `ad_*` names are the page's own.
- Call `gameLoading()` from your first script, `gameReady()` when the game is playable; the
  screen shows the game's title and fades by itself after 3 minutes.
- Mock ads last 3 s; resume the game in `onClose` (it fires in every terminal state); a 1.5 s
  debounce follows every ad.
- `requestReview()` resolves `{ status: 'unavailable' }` here.
- What counts as a **play**: a session with ≥ 15 s of attention (tab visible, window focused,
  no ad on screen). The game's own people are never counted.
