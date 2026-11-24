# Leaderboards

Shaped like the Yandex Games SDK (the jam portal's boards):

```
await Jam.setLeaderboardScore('best', 1200, JSON.stringify({ level: 7 }));   // → true / false
const board = await Jam.getLeaderboardEntries('best', { quantityTop: 10, includeUser: true, quantityAround: 3 });
// { leaderboard, ranges: [{start,size}], userRank, entries: [{ rank, score, formattedScore, extraData,
//   player: { uniqueID, publicName, avatarUrl, getAvatarSrc() }, name, username, isPlayer, own, … }] }
const mine = await Jam.getLeaderboardEntry('best');   // null if absent
```

- The first score creates the board; ≤ 12 boards per game; names `[a-z0-9_]`, case-insensitive.
- Integer scores, |score| ≤ 10^15; one row per player holds their best (and its `extraData`).
- **Only signed-in players are recorded.** An unnamed visitor's score resolves `false`; the page
  keeps it and records it once they enter a name — and tells them so.
- Gate boards on `Jam.leaderboardsAvailable()`, not on `Jam.available`.
- The game's owner and admins set a board's title, order (lower is better — times) and format
  (number with 0–2 decimals, or a time from milliseconds) on the game's page, and can clear or
  delete it. The authors' own scores are shown, flagged.
- A player may hide themself from everybody's boards (their profile); a new leader is announced
  in the game's room chat.
