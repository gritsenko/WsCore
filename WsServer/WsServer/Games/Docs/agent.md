# Publishing from an agent

The portal speaks **MCP over Streamable HTTP** at `/agent/mcp` with a **personal token**
(`tox_…`, made by a server admin in the profile → «Доступ для агента»; shown once; stops
working after 60 days unused). Only server admins publish, for now.

```
claude mcp add --transport http --scope user tox https://tox.gritsenko.biz/agent/mcp \
  --header "Authorization: Bearer tox_…"
```

Keep `--scope user`: a project-level config is committed, and the token with it.

## Tools (the jam portal's names and arguments)

| Tool | What it does |
| --- | --- |
| `whoami` | Who the token acts as. |
| `list_scopes` | Always `personal` here (no crews, studios or jams). |
| `list_projects` | The games you may write to. |
| `get_project(projectId)` | One game: fields, pictures (ids), releases (`releaseId`), boards, links. |
| `create_project(title, scope?, tagline?, description?, tags?)` | A new game — a **draft**, seen by its owner and admins only. |
| `update_project(projectId, title?, tagline?, description?, tags?)` | Only the fields named are written. |
| `push_build(projectId, filename, size)` | Opens an upload; answers with the `curl` command(s) to run. |
| `upload_status(sessionId)` | What has arrived — resume by sending only `missing`. |
| `complete_build(sessionId, version?, notes?)` | Unpacks, hosts, and makes it the game's new **release**. |
| `update_release(projectId, releaseId, version?, notes?)` | Rename a release or rewrite its notes. |
| `push_media(projectId, files)` | `files = [{"filename","size"}]` — one upload per picture. |
| `attach_media(projectId, screenshots?, cover?, header?)` | Screenshots as the **whole ordered list**: `{"id"}` keeps one, `{"sessionId"}` adds one, a shorter list removes. `cover` / `header`: a session id. |
| `set_visibility(projectId, visibility)` | `public` (everyone, announced on the card) or `team` (back to a draft). |
| `docs(article?)` | This handbook. |

`projectId` is the game's id or its slug.

## Builds

`push_build` → run the command it gives (`curl -f -T game.zip "…/agent/upload/{session}/0?t=…"`) →
`complete_build(sessionId, version, notes)`. The `size` must be exact (`stat -c %s game.zip`):
a chunk of another length is refused, so a broken connection never assembles a corrupt file.
The upload URL carries a one-hour ticket, not your token. Every `complete_build` is a release:
name it (`version`, e.g. `0.4.1`; empty = `v<n>`) and say what changed (`notes`, Markdown,
for the players — from the commits since the last push; ask the person when there is nothing
to go on rather than inventing a changelog).

The answer carries `pageUrl` (the game's page — share it) and `playUrl` (the build itself).

## Pictures

Covers, headers and screenshots are the author's own pictures: upload the files they name.
Never make or choose a picture yourself. PNG, JPEG, WebP or GIF, ≤ 8 MB; a 16:9 JPEG cover
(1200×630 or so) previews best in messengers.

## The REST API (scripts, CI)

The same operations, `Authorization: Bearer tox_…`: `POST /api/games`, `PATCH /api/games/{id}`,
`POST /api/games/{id}/visibility`, `PUT /api/games/{id}/build?filename=&version=&notes=`
(body = the file), `PUT /api/games/{id}/media?kind=cover|header|screenshot`,
`PUT /api/games/{id}/screenshots {"ids":[…]}`, `GET /api/games/{id}/stats?days=30`,
`GET /api/games/{id}/leaderboards`, `PATCH|DELETE /api/games/{id}/leaderboards/{name}`.
