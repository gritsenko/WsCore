# Игровой портал (мини-игры с лидербордами) — план

Дата: 2026-11-24. Статус: **этапы 1–2 сделаны** (см. «Ход работ»), дальше — этап 3 (лидерборды).

## Ход работ

**Этап 1 — хостинг + мост + комната — сделан (2026-11-24).** Сервер: `Games/` (`GameCatalog`,
`GameBuild` + `JamSdkInjector`, `GamesHttp`, `ApiTokens`, вендорный `jam-sdk.js` c561510),
схема v6 (`games`, `game_releases`, `api_tokens`), `Game/Protocol/Games/` (TypeId 150–152),
`GameServerBase.RunOnTickAsync`, `ChannelPermissions.SetOwnerOnly`. Клиент: `portal/`
(`PortalUI`, `GameHost`, `JamBridge`, `Markdown`), раздел «Игры» в лобби, `/games…` без формы
входа, «Доступ для агента» (токены) в профиле. Тесты: xUnit 238, Vitest 210, браузерный
сценарий 32/32 (шаг 11 в CLAUDE.md).

Отличия от исходного плана:
- **Тег SDK вставляется при отдаче entry, а не при распаковке**: билд хранится как загружен,
  список `data-jam-portal-origins` всегда из текущей конфигурации; свой `jam-sdk.js` в билде
  заменяется нашим.
- Заливка в этапе 1 — одним `PUT /api/games/{id}/build?filename=&version=&notes=` (тело =
  файл). Сессии с чанками и `upload_status` (совместимость с `push_build` джема) — этап 5.
- Обложек пока нет: карточка рисует градиент от id и первую букву названия.
- Доски отвечают `503` (SDK превращает это в `false` / `null`) — до этапа 3.
- `visitorId` анонимов ещё не заведён — придёт с аналитикой (этап 2).

**Этап 2 — аналитика: сбор + карточки — сделан (2026-11-24).** `GameAnalytics` (тик-поток),
`portal/PlaySession` (таймер внимания), запросы `GameViewRequest` / `GamePlayBeatRequest` /
`GamePlayEventsRequest` (TypeId 153–155), `GameInfo.Plays`, схема v7 (`games.*_total`,
`game_hits`, `game_play_sessions`, `game_play_events`, `game_daily`), `wscore.visitorId`.
REST для автора: `GET /api/games/{id}/stats?days=N` и `GET /api/games/stats` (админы) —
итоги, медиана/самая долгая сессия, корзины ≥ 1/3/10 мин, игроки и вернувшиеся, дни, события,
уровни, источники. Экраны поверх этого — этап 6. Тесты: xUnit 251, Vitest 219, браузер 9/9.

Отличия от плана:
- Сессия при разрыве соединения не закрывается, а «осиротевает»: тот же игрок (пользователь или
  `visitorId`) после реконнекта продолжает её — иначе мобильный интернет раздувал бы запуски.
  Без отчётов дольше 90 с сессия закрывается.
- «Свои» = владелец игры **и все серверные админы** (публикуют пока только они): их сессии
  хранятся с `own`, но в цифры не попадают.
- Уникальные игроки и «вернувшиеся» считаются по сырым сессиям (180 дней); в `game_daily`
  бессрочно лежат просмотры, запуски, партии и время. Колонка `new_players` заведена, но пока
  не заполняется.
- Лимит «50 имён событий на игру» считается в памяти с момента запуска сервера (после рестарта
  счёт заново).
- Источник `chat` / `room` не определяется: ссылки из чата открываются новой вкладкой и
  приходят как `link`.

**Перед выкладкой этапа 1 в прод:** сертификат и маршрут `play.tox.gritsenko.biz` на HAProxy
(DNS уже добавлен на 95.165.154.134 — на 2026-11-24 ещё не резолвился снаружи), лимит тела
запроса и таймауты для заливки билдов, `GameServer__GamesDataPath=/var/lib/wscore/games`
в окружении `wscore.service` (иначе билды теряются при каждом деплое).

## Решения

- **Публикуют только серверные админы** (`UserAccount.IsAdmin`). Роль «издатель» — позже,
  схема это допускает (`games.owner_user_id` — любой пользователь).
- **Домен билдов:** `play.tox.gritsenko.biz` (DNS + сертификат на HAProxy).
- **`jam-sdk.js` переносим целиком**, без изменений.
- **Каталог и страницы игр открыты без входа**, играть тоже можно без входа (см.
  «Анонимный посетитель»).
- **Аналитика** — как у джема, плюс сводка по разделу; на карточках — число сыгранных партий.
  **Партия** = сессия с ≥ 15 с активного времени (`GamePlayCountMinActiveSeconds`).
  Внешний счётчик (Метрика / Plausible) пока не нужен — только своя аналитика.

Цель: раздел «Игры» в лобби — каталог HTML5-мини-игр. Это не комната, а витрина:
у каждой игры есть страница (обложка, описание, скриншоты, версии, лидерборды), а играют в
неё внутри своей комнаты с чатом. API совместим с платформой джема (MY.GAMES JAM,
`~/projects/rnd/jam.my.games`): игра под `window.Jam` работает у нас без правок, а агент
публикует её теми же MCP-инструментами. В отличие от джема, TOX доступен из интернета, поэтому
билд хранится и отдаётся нашим сервером — без S3-зеркала и без VPN.

Источники в джеме, сверенные для плана:
`docs/game-bridge-contract.md` (контракт моста), `api/app/static/jam-sdk.js` (SDK),
`api/app/leaderboards.py` (доски), `api/app/game_sdk.py` (вставка тега),
`api/app/agent_host.py` + `chunked_uploads.py` (MCP + заливка),
`web/src/components/play.jsx` (сторона хоста), `api/app/s3_share.py` (OG-страница).

## Ключевое решение: их SDK как есть, TOX — хост

`jam-sdk.js` уже поддерживает ровно наш случай — **игру на чужом origin внутри портала** (так
джем играет билды со своего CDN-зеркала):

- в теге есть `data-jam-portal-origins="https://tox…"` → SDK считает себя cross-origin и
  **все вызовы досок шлёт родителю** по `postMessage` (`lb {id, op, board, args}` →
  `{id, ok, result, error?, status?}`), а не в `/api` сам;
- `_jam_p=<gameId>` на URL фрейма — id игры (`Jam.getGameId()`), `_jam_o=<origin>` — родитель
  называет себя (принимается, только если он есть в списке);
- обе стороны проверяют origin и никогда не шлют в `*`.

Поэтому SDK **вендорим без изменений** (`WsServer/WsServer/GamesHost/jam-sdk.js`, с
указанием версии/коммита джема — обновлять копированием) и отдаём с игрового origin по
`/jam-sdk.js`. В TOX пишем только сторону хоста (`GameHost.ts`) — по образцу `play.jsx`.

### Протокол хоста (что реализует `GameHost`)

Игра → хост: `{ source: 'jam-sdk', v, type, payload }`. Принимаем, только если
`e.origin === GamesOrigin` и `e.source === iframe.contentWindow`.

| `type` | Что делает TOX |
| --- | --- |
| `hello` | лог в консоль («мост подключён») |
| `notice` | лог в консоль |
| `loading` / `ready` | держать / снять заставку с обложкой (страховка — 3 мин; тап снимает) |
| `lb` | `op` ∈ `score` / `entries` / `player` / `description` → запрос по сокету → ответ `lb` |
| `ad-request` / `ad-tap` | мок рекламы: карточка на N с, ответы `ad` с `phase` `open` / `reward` / `close` / `error {status:'not_ready', retryAfterMs}`, `cooldownMs` 1.5 с |
| `review-request` | v1: сразу `review {status:'unavailable'}`; позже — оценка + отзыв в чат комнаты игры |
| `haptics` | валидация как в `play.jsx`, `navigator.vibrate` |
| `event` | `{name, level, params}` → буфер хоста → `GamePlayEventsRequest` (см. «Аналитика») |

Хост → игра: `{ source: 'jam-host', v: 1, type: 'ad' | 'lb' | 'review', payload }`,
`targetOrigin` = GamesOrigin.

## Изоляция: билды — с отдельного origin (обязательно)

Ключ пользователя (`wscore.userKey`) — bearer-секрет в `localStorage` основного origin. Чужой
JS с того же origin прочитает его и угонит аккаунт. Поэтому игры отдаются с **другого origin**:
`GameServer:GamesOrigin`, например `https://play.tox.gritsenko.biz` (HAProxy → тот же процесс,
маршрут по `Host`). В dev — другой порт (`:5002`): разный порт = разный origin.

- iframe: `sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups
  allow-forms"` (`allow-same-origin` безопасен — origin чужой; нужен Unity/Godot: свои
  ассеты, IndexedDB), `allow="fullscreen; gamepad; autoplay"`.
- Путь билда `/g/{gameId}/r{releaseNo}/…` — номер релиза не переиспользуется, поэтому файлы
  `immutable`. Игры делят один origin между собой (как и у джема) — приемлемо; изоляция
  `{gameId}.play.…` (wildcard-сертификат) позже ничего не меняет в остальном.
- Заголовки игрового origin: CSP `frame-ancestors <основной origin>` (нельзя встроить
  игру на чужой сайт как фишинг под нашим доменом), `nosniff`. На этом origin нет ни `/ws`,
  ни `/api`, ни аватаров — только билды и `jam-sdk.js`.
- Игра, открытая напрямую по адресу билда (без родителя): `available === false`, доски
  уходят прямым `fetch('/api/projects/…')` на игровой origin → там нет API → резолвятся
  `false` / `null`, SDK пишет одну строку в консоль. Это поддерживаемое поведение SDK. Чтобы
  поиграть с телефона, есть страница игры в TOX — это и есть «родитель».

## Вставка SDK (как `game_sdk.py`)

`<script src="/jam-sdk.js" data-jam-portal-origins="https://tox…"></script>` **перед первым
`<script>`** (не сразу после `<head>`: `<meta charset>` должен остаться в первых байтах),
иначе перед `</head>` / `</body>` / в начало. Не-UTF-8 вход — не трогать.

Отличие от джема: если билд уже ссылается на свой `jam-sdk.js`, у джема он «оставлен как
есть», а значит у нас (cross-origin, без списка origin в теге) мост не заработает. Поэтому
такой тег **заменяем** нашим, а `complete_build` сообщает об этом в ответе.

## Лидерборды — копия семантики `leaderboards.py`

- Доска создаётся первым результатом; имя `^[a-z0-9_]{1,64}$` (SDK нормализует, регистр не
  важен); ≤ **12** досок на игру (`board_limit`); `|score| ≤ 10^15` (влезает и в `long`, и в
  JS number); `extraData` ≤ 1024 символов, хранится у **лучшего** результата.
- Одна строка на (доска × игрок): `submissions++`, `improved` по направлению доски, `own` —
  результат автора игры (флаг только включается).
- Ранг считается при чтении. `entries`: `top` ≤ 100, `around` ≤ 10; окно вокруг игрока —
  только если он не попал в топ; пустая доска = пустой ответ (не ошибка); `player` /
  `description` для несуществующей доски — 404 (`status` в ответе `lb`).
- Ответы — **ровно форма джема/Yandex** (их SDK читает их сам):
  - score: `{ok:true, improved, best, rank, board}` / `{ok:false, reason}`
  - entries: `{ leaderboard: <description>, ranges:[{start,size}], userRank, entries:[…] }`
  - player: `{ entry }`
  - description: `{ name, appID, default:false, description:{ invert_sort_order,
    score_format:{type, options:{decimal_offset}}, type }, title:{en, ru}, titleText,
    titleRaw, entryCount, createdAt }`
  - entry: `{ rank, score, formattedScore, extraData, player:{ uniqueID, publicName,
    avatarUrl, lang:null, scopePermissions }, name, username, avatarUrl, color, studio,
    isPlayer, own, hiddenFromOthers, submissions, updatedAt }` — `uniqueID` = наш `UserId`,
    `username` = `@login`, `avatarUrl` — абсолютный URL `/avatars/{userId}?v=`.
  - `formattedScore` = `format_score`: `numeric` со сдвигом `decimal_offset` (≤ 6) или
    `time` (мс → `m:ss.mmm` / `h:mm:ss`), без разделителей тысяч.
- Настройки доски (авторы игры, серверные админы): заголовок, `invert_sort_order`,
  тип + `decimal_offset`, «очистить» (оставляет доску), «удалить».
- «Скрыть меня из лидербордов» в профиле — правило показа, не записи: чужим строка не видна,
  ранги смыкаются, себе — видна с `hiddenFromOthers: true`.
- Только опознанные пользователи (как чат); аноним (см. «Анонимный посетитель») — `{ok:false,
  reason:'not_signed_in'}`. Rate limit на запись (`LeaderboardWriteCooldown`).

**Транспорт в TOX.** `GameHost` пересылает `lb` по единственному WebSocket:
`LeaderboardRequest { GameId, Board, Op, Score, ExtraData, Top, Around, IncludeUser,
RequestId }` → `LeaderboardResultEvent { RequestId, Ok, Status, ResultJson }`. JSON формы
джема собирает **сервер**, одна строка в событии — MemoryPack-типы остаются плоскими, а форма
определена в одном месте и покрыта тестом. Личность — пользователь соединения, игре не
доверяем ничего, кроме собственного результата (античита нет, как у джема).

## Игра открывается в своей комнате

У каждой игры — текстовая комната `g-{gameId}` (как созданный канал, но вид `Game`): скрыта из
списка каналов, видна в портале. «Играть» = join комнаты + iframe. Раскладка: игра слева, чат
справа; ≤ 760px — игра на весь экран, чат выдвижной. Presence уже знает комнату пользователя →
«сейчас играют: N» и аватары на карточке бесплатно. Новое 1-е место — системная строка в чат
комнаты («@login — новый рекорд: 12 400»), доски на странице обновляются живьём
(`LeaderboardChangedEvent` членам комнаты).

Черновик (`visibility = team`) видят и могут открыть только его авторы и серверные админы
(тот же `CanSee`, что у приватных каналов).

## Анонимный посетитель

Каталог (`/games`) и страница игры (`/games/{slug}`) открываются **без формы входа**: если в
`localStorage` нет ключа, клиент подключает сокет, но не опознаётся (такие соединения уже
есть — LoadTest, TestClient) и показывает портал вместо формы. «Играть» тоже работает без
входа. Чтобы писать в чат комнаты игры или **попасть в лидерборд**, нужно имя — та же быстрая
форма входа по имени, открытая поверх игры («Введите имя, чтобы попасть в таблицу»); игра при
этом не перезагружается. До входа `setLeaderboardScore` отвечает
`{ok:false, reason:'not_signed_in'}`, а лучший результат за визит хост держит в памяти и
отправляет сразу после входа («ваш результат 12 400 — сохранить?»).

Для аналитики у анонимного посетителя есть `visitorId` — случайные 16 байт в `localStorage`
(`wscore.visitorId`), не связанные ни с ключом, ни с IP; после входа сессии считаются уже на
`UserId`. IP и User-Agent не хранятся (только класс устройства `mobile` / `desktop`).

## Аналитика (как у джема + сводка раздела)

Цель — понять, растёт ли раздел и какие игры держат людей. Модель джема
(`docs/engagement`, `usePlaySession` в `play.jsx`, `record_play_session` / `ProjectHit` /
`ProjectPlayEvent`), перенесённая на наш сокет.

### Что меряем

- **Просмотры** — открыта страница игры (один раз на открытие).
- **Запуски** — нажато «Играть» (= открыта игровая сессия).
- **Партии** — сессии, в которых **сыграно ≥ 15 с** активного времени. Это число на карточке
  («1,2 тыс. партий»): запуск, закрытый через 3 секунды, — не партия, а отказ. Порог —
  настройка `GamePlayCountMinActiveSeconds`.
- **Уникальные игроки** — по `UserId`, для анонимов по `visitorId`.
- **Время в игре** — только *внимание*: хост тикает раз в секунду и засчитывает интервал, если
  вкладка видна, окно в фокусе и не показана мок-реклама; интервал > 3 с (вкладку
  притормозили / сон) не засчитывается. По сессиям: сумма, медиана, самая долгая, корзины
  удержания ≥ 1 / 3 / 10 мин.
- **Возвраты** — игроки, игравшие в игру в ≥ 2 разных дня; D1 / D7 для когорты первого дня.
- **Внутриигровые события** из моста: `levelComplete` (воронка уровней) и `logEvent` (топ
  событий + разбор `params`: ключи, доля, частые значения, min/max/avg по числам — по последним
  2000 событиям имени). `ad_*` — показы мок-рекламы, пишет хост, а не игра.
- **Лидерборды и чат** как сигнал вовлечения: участников досок, сообщений в комнате игры.

Сессии и события **авторов игры** хранятся с флагом `own` и исключаются из всех чисел
(просмотры/запуски автора просто не пишутся) — как у джема: «свою игру не накрутишь, своих
тестов в статистике не видно».

### Как собираем

- Сессия — по сокету, не HTTP: `GamePlayBeatRequest { GameId, SessionId (16 байт, клиент),
  ReleaseNo, ActiveMs, Restarts, Device, Source, VisitorId, Ended }` — первый открывает
  сессию, дальше каждые 20 с **сыгранного** времени, при скрытии вкладки и на выходе.
  Плюс сокета: **разрыв соединения закрывает сессию сервером** — не нужен beacon при
  закрытии вкладки, время до последнего бита уже сохранено.
- Сервер не доверяет `ActiveMs`: монотонно (сессия не уменьшается), не больше прошедшего по
  часам сервера + небольшой запас, не больше 6 ч на сессию; чужой `SessionId` игнорируется.
- События — `GamePlayEventsRequest { SessionId, Events[{Name, Level, Params}] }`, буфер
  хоста сбрасывается на бите или при 20 событиях. Лимиты джема: ≤ 50 на запрос, ≤ 300 на
  сессию (дальше молча отбрасываются), ≤ 50 разных имён на игру (остальное → `_other`),
  `params` ≤ 1024 символов, имя `^[a-z0-9_]{1,64}$`, `level_complete` и `ad_*` из игры —
  переименовываются в `game_…`.
- Просмотр страницы — `GameViewRequest { GameId, Source }`. Для анонимов, у которых ещё нет
  сокета (краулер, первая загрузка), просмотр отправляется после подключения; краулеры OG
  сокет не открывают и не считаются.
- **Источник** (`Source`): `catalog` (из каталога), `link` (прямая ссылка `/games/{slug}`,
  в т. ч. из мессенджера), `chat` (ссылка в чате TOX), `room` (из комнаты/уведомления). Это
  ответ на «откуда приходят» — главное для оценки раздела снаружи.
- Запись — на тике: агрегаты в памяти (счётчики на карточках обновляются сразу), строки —
  write-behind в поток хранилища, как чат.

### Где показываем

- **Карточка в каталоге:** число партий и «сейчас играют: N» (из presence).
- **Страница игры:** партии, игроков, медиана сессии — всем.
- **Вкладка «Аналитика»** (авторы игры, админы): счётчики, время и корзины удержания,
  возвраты, воронка уровней, события с разбором `params`, мок-реклама, графики по дням
  (просмотры → запуски → партии), источники.
- **Сводка раздела** (админы, «Игры → Статистика»): по дням — уникальные игроки раздела
  (DAU / WAU), партии, суммарное время, доля новых и вернувшихся, доля анонимов и сколько из
  них потом вошли (конверсия в пользователя TOX); таблица игр — просмотры, запуски, партии,
  конверсия просмотр → партия, медиана, ≥ 3 мин, D1 / D7, участники досок; источники трафика.
  Графики — по правилам скилла `dataviz`.

### Хранение и ретеншн

Сырые сессии и события живут `GameAnalyticsRetentionDays` (180); навсегда остаются дневные
агрегаты `game_daily` (собираются при закрытии дня и при старте за пропущенные дни) и
счётчики на `games` (`plays_total`, `views_total`). Запросы для вкладок — на потоке хранилища
по индексам (game_id, started_ms), ответ — на следующем тике (`DeliverCompleted`).

## Карточка игры и OG — философия джема

Поля: `title`, `tagline` (строка на карточке, она же `og:description`), `description`
(markdown), `tags`, `cover`, необязательный `header` 4:1 (иначе cover), `screenshots`
(упорядоченный список), `visibility` `public` / `team`, релизы (`no`, `version` — пусто =
`v<n>`, `notes` markdown, дата, автор; не удаляются).

**Страница игры с OG — серверный HTML.** `GET /games/{slug}`: `index.html` клиента с
подставленным `<title>` и OG-блоком как в `s3_share._head_meta`: `og:type=website`,
`og:site_name=TOX`, `og:title`, `og:description` (tagline), `og:url` (абсолютный, он же
canonical), `og:image` + `og:image:type/alt/width/height`, `twitter:card` =
`summary_large_image` **только при картинке** (иначе `summary`). Картинка для OG — обложка,
перекодированная в **JPEG ≤ 1200px** с прозрачностью на белом (WebP в OG ненадёжен в
мессенджерах; размер указываем, иначе мессенджер рисует миниатюру). Клиент, загрузившись по
такому пути, открывает портал на этой игре.

Медиа `/game-media/{gameId}/{mediaId}.{ext}` — с основного origin, `immutable`, тип по
сигнатуре (как `AvatarImage`), ≤ `MaxGameMediaBytes`. Для перекодирования нужен image-кодек в
.NET — **SkiaSharp** (MIT; + `SkiaSharp.NativeAssets.Linux.NoDependencies` для Docker/LXC).
Им же — превью обложки для карточек (сейчас аватары не перекодируются: их ужимает клиент;
медиа от агента приходят как есть).

## Хранение (SQLite, schema v6)

- `games` (id `gm` + 10 base-36, slug уникальный, owner_user_id, title, tagline, description,
  tags JSON, cover_media_id, header_media_id, visibility, room_id, created_ms, updated_ms,
  current_release_no, announced)
- `game_authors` (game_id, user_id) — на будущее; v1 = только владелец
- `game_media` (id, game_id, kind cover/header/screenshot, ord, mime, width, height, bytes,
  created_ms) — файлы на диске
- `game_releases` (game_id, no, version, notes, author_user_id, created_ms, entry_path,
  files, bytes, sdk_replaced)
- `leaderboards` (id, game_id, name, title, invert_sort_order, score_type, decimal_offset,
  created_ms)
- `leaderboard_entries` (board_id, user_id, score, extra_data, submissions, own,
  created_ms, updated_ms; PK (board_id, user_id); индекс (board_id, score))
- `users.leaderboard_hidden`
- `api_tokens` (hash SHA-256, user_id, name, created_ms, last_used_ms, expires_ms)
- `game_hits` (id, game_id, kind view/launch, user_id, visitor_id, source, day, ms)
- `game_play_sessions` (id 16 байт, game_id, release_no, user_id, visitor_id, own, device,
  source, started_ms, last_seen_ms, active_ms, restarts, ended, counted — стала партией)
- `game_play_events` (id, session_id, game_id, own, name, level, params, ms; индекс
  (game_id, own, name))
- `game_daily` (game_id, day, views, launches, plays, players, new_players, active_ms) +
  строка `game_id = ''` для раздела целиком (уникальные игроки раздела, DAU)
- в `games`: `plays_total`, `views_total`

Файлы: `data/games/{gameId}/r{no}/…`, `data/games/{gameId}/media/…`,
`data/uploads/{sessionId}/{i}.part`. Хранить распакованными последние `GameKeepReleases` (5),
записи о релизах — всегда. Чтения/записи — через тот же поток хранилища (тик не делает I/O);
распаковка и перекодирование — на пуле потоков, результат применяется на тике
(`DeliverCompleted`, как с паролями).

## Агентская публикация — совместимо с джемом

`/agent/mcp` — MCP по Streamable HTTP в том же процессе (официальный C# SDK
`ModelContextProtocol.AspNetCore`). **Те же имена, аргументы и формы ответов**, что в
`agent_host.py`, чтобы агент/скилл, умеющий публиковать на джем, публиковал сюда, сменив адрес:

| Инструмент | У нас |
| --- | --- |
| `whoami` | пользователь токена, способ входа, срок |
| `list_scopes` | только `personal` |
| `list_projects`, `get_project` | свои игры; карточка + медиа (ids) + релизы + доски + ссылки |
| `create_project(title, tagline?, description?, tags?, scope?, teamId?)` | `scope` пусто / `personal`; `team:` / `studio:` / `jam:` — отказ с понятным текстом |
| `update_project(projectId, title?, tagline?, description?, tags?)` | только названные поля |
| `push_build(projectId, filename, size)` → `{sessionId, chunkSize, chunks, uploadUrl, commands{bash, powershell}, next}` | `.zip` или один `.html`, ≤ `GameMaxBuildMb` |
| `upload_status(sessionId)` → `{sessionId, chunks, received, missing}` | |
| `complete_build(sessionId, version?, notes?)` | распаковка, вставка SDK, релиз, ссылки (страница игры, прямой билд) |
| `update_release(projectId, releaseId, version?, notes?)` | |
| `push_media(projectId, files[{filename,size}])` + `attach_media(projectId, screenshots?, cover?)` | весь список по порядку: `{id}` оставить, `{sessionId}` новое; трогаются только названные слоты |
| `set_visibility(projectId, public\|team)` | первая публикация — объявление в лобби (один раз на игру) |
| `docs(article?)` | наш хэндбук (markdown из репозитория): sdk, sdk-leaderboards, web-build, agent |
| `publish_prototype` / `update_prototype` / `list_prototypes` | не делаем в v1 (позже: одностраничная игра = проект с одним `.html`) |
| `update_application` | нет (Creators Mode) |

**Заливка — тот же протокол, без S3:** `PUT {AgentOrigin}/agent/upload/{sessionId}/{i}?t={ticket}`
(`curl -f -T`), билет одноразовый на час, не учётные данные. `chunkSize` = настройка
`AgentChunkMb`, по умолчанию 0 = весь файл одним `curl` (за HAProxy проверить лимит тела и
таймауты; если упрёмся — поставить, например, 50 МБ: команды на `split` / PowerShell уже в
протоколе). Неполная загрузка докачивается по `upload_status`. Kestrel: лимит тела только для
этого маршрута.

**Распаковка:** ≤ `GameMaxUnpackedMb` (500), ≤ 5000 файлов; отказ на `..`, абсолютных путях,
симлинках (zip-slip); вход — самый мелкий по вложенности `index.html`, затем любой `.htm*`;
одиночный `.html` — в каталог релиза; атомарно: `r{no}.tmp` → rename. Предупреждение в ответе,
если в HTML есть абсолютные пути к ассетам (`src="/…"`) — частая причина пустого экрана.

**Авторизация:** персональный токен `tox_…` (32 байта, показан один раз, в БД — хеш) из
профиля («Доступ для агента»: список, «Отозвать», срок 60 дней без использования).
`claude mcp add --transport http --scope user tox https://tox…/agent/mcp --header
"Authorization: Bearer tox_…"`. OAuth (вход через браузер, как у джема) — отдельным этапом
позже. Те же операции — REST (`/api/games…`) с тем же токеном для скриптов/CI; MCP — обёртка.

## Клиент

- `portal/`: `GamesCatalog` (сетка карточек, теги, «сейчас играют»), `GamePage` (шапка,
  описание — минимальный markdown без HTML + `Linkify`, галерея, релизы, доски, «Играть»),
  `GameHost` (iframe + протокол выше, заставка, мок рекламы, полноэкранный режим),
  `GameEditor` (поля, медиа, настройки досок, видимость), токены — в `ProfileDialog`.
- Пункт «Игры» в сайдбаре лобби над каналами; состояние `portal` в `App` рядом с `lobby` /
  `game` (3D-сцена — отдельная история).
- Протокол хоста — чистая логика, тестируется Vitest с фейковым `postMessage`.

## Этапы

1. **Хостинг + мост + комната.** Игровой origin, вендорный `jam-sdk.js`, распаковка и вставка
   тега, `games` / `game_releases`, комната игры, публичные каталог и страница (без
   редактора, без формы входа), `GameHost` (hello / loading / ready / ad / haptics). Игры
   заводит админ REST-запросом с токеном. Тесты: распаковка (zip-slip, лимиты, выбор входа,
   вставка/замена тега, charset), заголовки игрового origin, отказ не-админу; Vitest —
   origin/source-проверки моста, мок рекламы (debounce, фазы).
2. **Аналитика: сбор + карточки.** Таймер внимания в `GameHost`, `GamePlayBeatRequest` /
   `GamePlayEventsRequest` / `GameViewRequest`, `visitorId`, таблицы и агрегаты, партии на
   карточках. Идёт сразу после хостинга — чтобы цифры копились с первого дня.
   `GameAnalyticsTests`: партия только после порога, `own` не считается, зажим `ActiveMs`
   (монотонно, ≤ часов сервера, ≤ 6 ч), чужой `SessionId`, закрытие по разрыву, лимиты
   событий и `_other`, переименование `level_complete`/`ad_*`, аноним → вход, `game_daily`
   за пропущенные дни, после рестарта; Vitest — таймер внимания (фейковые таймеры: скрытая
   вкладка, потеря фокуса, реклама, сон > 3 с).
3. **Лидерборды.** Таблицы, `LeaderboardRequest`, ответы формы джема, рекорды в чат,
   настройки досок, «скрыть меня», вход по имени поверх игры с отложенным результатом.
   `LeaderboardTests`: лучший результат, asc/desc, ранги, `ranges`/`around`, пустая доска vs
   404, `board_limit`, `own`, скрытый игрок, аноним, после рестарта; `format_score` —
   таблица случаев из джема; **проверка формы JSON против `jam-sdk.js`** (в Vitest грузим
   вендорный SDK в jsdom и гоняем `setLeaderboardScore` / `getLeaderboardEntries` через наш
   `GameHost` с фейковым сервером).
4. **Карточка, медиа, OG.** Редактор, `game_media`, SkiaSharp, `/games/{slug}`. Тесты:
   OG-блок, JPEG ≤ 1200, медиа по сигнатуре, порядок скриншотов.
5. **Агент.** Токены (только админам), upload-сессии, MCP-инструменты, `docs`.
   Интеграционный тест: create → push_build (реальный PUT) → complete_build → билд с игрового
   origin со вставленным тегом; attach_media со списком `{id}/{sessionId}`. Ручная проверка:
   опубликовать игру из Claude Code тем же скиллом, что на джем.
6. **Аналитика: экраны.** Вкладка «Аналитика» игры и сводка раздела для админов (запросы на
   потоке хранилища, графики по дням).
7. *(по желанию)* роль «издатель»; `review-request` — оценка + отзыв в чат комнаты игры.

Браузерная проверка (шаг 11 процедуры smoke-теста): игра, залитая агентским путём, открыта из
каталога **в чистом контексте без входа** (формы нет, игра запускается); партия засчитана
после 15 с и видна на карточке во втором контексте; вход по имени поверх игры →
`setLeaderboardScore` → строка в доске у второго контекста; из iframe недоступен
`localStorage` основного origin; портал → игра → портал ×10 — `iframe` ≤ 1; OG-теги
`/games/{slug}` читаются `curl` без JS.
