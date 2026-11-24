/*
 * jam-sdk.js — the `window.Jam` bridge a hosted jam build programs against.
 *
 * Contract: docs/game-bridge-contract.md. Method names and signatures are identical
 * to rnd-lab's `window.RewardHub` facade, so a game written here runs unchanged
 * inside an APK built by rnd-lab/build_service — there a `jam-compat.js` adapter
 * re-points the same names at the real SDK. That is why the root object is neutral
 * (`Jam`, not `RewardHub`): the jam portal is not the reward hub.
 *
 * The portal injects this file into every extracted web build (api/app/game_sdk.py),
 * so authors get it for free. Events and ads never touch /api: they go to the /play
 * simulator over postMessage, which owns the play session and throttles the stream
 * (web/src/components/play.jsx). Leaderboards are the one exception — they need an
 * answer and they must work on a phone that opened the build straight from the QR
 * code, so they call /api directly when they can, and ask the player to make the call
 * when they cannot (a build the in-portal player fetched from the CDN is on another
 * origin, where a relative /api path leads into the bucket). Same four operations
 * either way; see the leaderboards section.
 *
 * Loading it outside the simulator is safe: with no parent to answer, events are
 * console-logged and ads report 'unavailable', exactly like the lab facade with no
 * native bridge. Leaderboards keep working there as long as the page is a hosted
 * build (/plays/<token>/…); anywhere else they read as empty rather than throwing.
 *
 * DEVTOOLS: the SDK is loud on purpose. It prints a banner on load and one line per
 * call, because an author's only window into the integration is the console — a game
 * that reports nothing looks exactly like a game nobody played. It also warns about
 * the mistakes that are invisible until production: names that had to be normalized,
 * event floods that will hit the server caps, and ad callbacks the game forgot to
 * handle. Silence it with `?_jam_log=0` on the play URL or `Jam.setLogging(false)`.
 *
 * Two of those lines are addressed at the PLAYER rather than at this frame's console:
 * `hello` on load (the player's only proof this file is in the build — see the player's
 * missing-SDK warning) and `notice`, which mirrors the calls the player cannot see for
 * itself (leaderboards go straight to /api, a toast is drawn in-page) plus every
 * warning. Together the top-level console reads as one story: script injected → game
 * connected → what the game asked for → what the portal did with it.
 */
(function () {
    'use strict';

    // Inert inside an APK: there the real RewardHub SDK is present and jam-compat.js
    // provides window.Jam on top of it. Belt-and-braces against script order — a
    // downloaded build carries this file into the lab pipeline (download_build
    // repackages the extracted tree, jam-sdk.js included).
    if (window.RewardHubNative || window.RewardHub) return;

    var VERSION = 2;
    var SOURCE = 'jam-sdk';

    // The simulator is our parent frame. Absent (opened directly in a tab) → no-op mode.
    //
    // A parent frame is NOT proof of a simulator, and one page of ours proves it: a
    // build opened through a shared CDN link runs inside `_share.html`
    // (api/app/s3_share.py), which is a page of ours that speaks none of this
    // protocol. Taking it for the player printed "events → portal" over events
    // nobody received and — the bug that actually cost a play — posted the ad
    // request to a page that never answers, so a game that pauses in `onOpen` and
    // resumes in `onClose` stayed paused for good. That page is same-origin with the
    // build, so it is ruled out here; anything we cannot read stays a host, with the
    // no-answer fallback in requestAd() as the net under every other embedding.
    var host = (window.parent && window.parent !== window) ? window.parent : null;
    if (host && isShareShell(host)) host = null;
    var available = !!host;

    // ----- which origin is the player on? ---------------------------------
    //
    // Until the in-portal player started fetching builds from the CDN, this question
    // had one answer everywhere: the build is served from the portal's own origin
    // (api/app/plays.py), so the parent's origin is `location.origin` and every
    // postMessage in this file could target it. A build played from the CDN inside the
    // portal breaks that assumption in the worst possible way — quietly. `postMessage`
    // with a targetOrigin that does not match is DROPPED, with no error: the portal
    // would draw the mock ad card and record the impression while the `open` message
    // never reached the game, so the game sits in `onOpen` waiting for an `onClose`
    // that cannot come. A counted ad the player never saw, in the metric the jam is
    // judged on. Hence all of this.
    //
    // The allowlist is FROZEN INTO THE MIRRORED ENTRY HTML by the process that knows
    // what this deployment answers as (s3_mirror.rewrite_entry_html), and it is a list
    // because production answers as both jam.vibe… and myjam.vibe… — a single value
    // would be silently wrong for whoever opened the other name. `_jam_o` on the frame
    // URL is the player naming itself; it is honoured only after being checked against
    // that list, so a URL somebody edited cannot redirect the bridge anywhere.
    var PORTAL_ORIGINS = readPortalOrigins();
    // ----- reporting from a page the portal does not host ------------------
    //
    // A game living on its own host in the corporate zone (`tiny.mglabs.pro`),
    // opened by ITS link and not through the portal's player, used to record
    // nothing at all — there is no page of ours to mint a play session. Two
    // attributes on this very script tag are the whole configuration:
    //
    //     <script src="https://jam.vibe.mglabs.pro/jam-sdk.js"
    //             data-jam-project="p-abc123"></script>
    //
    // `data-jam-api` overrides where the reports go; the default is the origin
    // this file was loaded from, which is the portal whenever a page follows the
    // line above — one fewer value to keep in step, and a wrong one is a report
    // that silently reaches nobody. It has to be named explicitly by a page that
    // loads the CDN copy, whose origin is the bucket and answers no API.
    //
    // Everything else about the bridge is unchanged: this only fills the gap
    // where the portal's own page would have been. See api/app/ext_play.py.
    var EXT = readExtConfig();
    // Only a TOP-LEVEL page reports for itself. Inside any frame the parent is
    // treated as a player and answers (or does not) through the protocol above —
    // a page embedded in somebody else's site is a situation of its own, and
    // reporting from both ends is how one play becomes two.
    var extOn = !host && !!EXT.project && !!EXT.api;
    // Where to send. Starts as every candidate (hello is broadcast — a targetOrigin
    // that does not match simply does not deliver, so this costs nothing and lets the
    // handshake work before anything has been received) and is PINNED to one origin by
    // the first message that arrives from the list.
    var hostOrigin = pinnedOrigin();
    // True when the build and the portal are NOT the same origin: the leaderboard
    // calls, which are the only thing in here that talks to /api directly, have to go
    // through the parent instead.
    //
    // Read off the ALLOWLIST rather than off whichever origin happened to get pinned:
    // the attribute exists only in a mirrored copy, and a mirrored copy is served from
    // the public origin, which is never one of the portal's. So this is decided before
    // any message has been exchanged — which matters, because a game may ask for a
    // board before the player has said anything.
    var crossOrigin = !!(host && PORTAL_ORIGINS.length
        && PORTAL_ORIGINS.indexOf(selfOrigin()) < 0);

    function selfOrigin() {
        try { return String(window.location.origin || '').toLowerCase(); }
        catch (e) { return ''; }
    }

    function readPortalOrigins() {
        // Our own tag, written by the mirror. `document.currentScript` is valid while
        // a classic script is executing, which is exactly now.
        try {
            var el = document.currentScript;
            var raw = el && el.getAttribute ? el.getAttribute('data-jam-portal-origins') : '';
            if (!raw) return [];
            var out = [];
            raw.split(',').forEach(function (part) {
                // Lower-cased on both sides, because `e.origin` from a browser always
                // is: a stray capital in the deployment's config would otherwise be a
                // bridge that dies in both directions without a word.
                var o = String(part || '').trim().replace(/\/+$/, '').toLowerCase();
                if (o && out.indexOf(o) < 0) out.push(o);
            });
            return out;
        } catch (e) { return []; }
    }

    function readExtConfig() {
        var out = { api: '', project: '' };
        try {
            var el = document.currentScript;
            if (!el || !el.getAttribute) return out;
            out.project = String(el.getAttribute('data-jam-project') || '').trim().slice(0, 60);
            var api = String(el.getAttribute('data-jam-api') || '').trim();
            if (!api && el.src) {
                // The origin of our own <script src>. Read through the anchor
                // rather than by string surgery so a relative src resolves.
                var a = document.createElement('a');
                a.href = el.src;
                api = a.protocol + '//' + a.host;
            }
            api = api.replace(/\/+$/, '');
            if (/^https?:\/\/[^/]+$/i.test(api)) out.api = api;
        } catch (e) { /* exotic sandbox — no reporting, and no crash */ }
        return out;
    }

    function pinnedOrigin() {
        // Same-origin serving (the /plays path, a phone off the QR code, a local copy):
        // no list, and the answer has always been our own origin.
        if (!PORTAL_ORIGINS.length) return selfOrigin();
        try {
            var m = /[?&]_jam_o=([^&#]{1,200})/.exec(window.location.search);
            if (m) {
                var claimed = decodeURIComponent(m[1]).replace(/\/+$/, '').toLowerCase();
                // Checked, not trusted: a mirrored build is a public URL and anybody
                // may put anything on its query string.
                if (PORTAL_ORIGINS.indexOf(claimed) >= 0) return claimed;
                // But say so. A player that names an origin this copy was not told
                // about is what a STALE allowlist looks like from in here — a portal
                // hostname added after this build was mirrored — and the symptom
                // otherwise is a bridge that is simply silent.
                console.warn('[jam] the player says it is on ' + claimed +
                    ', which is not in this build\'s frozen origin list (' +
                    PORTAL_ORIGINS.join(', ') + '). The build needs re-mirroring; the ' +
                    'portal should fall back to its own copy.');
            }
        } catch (e) { /* exotic sandbox — fall through to the broadcast */ }
        return PORTAL_ORIGINS.length === 1 ? PORTAL_ORIGINS[0] : '';
    }

    // Everywhere we post to. One entry once the origin is pinned; the whole allowlist
    // while it is not, because a handshake that waits for an inbound message would
    // wait forever — the player's first message is an ANSWER to something.
    function hostTargets() {
        if (hostOrigin) return [hostOrigin];
        return PORTAL_ORIGINS.length ? PORTAL_ORIGINS : [selfOrigin()];
    }

    // Is this message from the page that is playing us?
    //
    // With an allowlist (i.e. this is the mirrored copy, served from the public origin)
    // our OWN origin is deliberately not on the list. It would admit every other
    // mirrored build in the bucket — somebody else's arbitrary JavaScript, one frame
    // up, able to fire ad callbacks and answer leaderboard calls. The only legitimate
    // same-origin parent there is the share shell, and that one has already been ruled
    // out of being a player at all.
    function fromPlayer(e) {
        if (!host || e.source !== host) return false;
        var origin = String(e.origin || '').replace(/\/+$/, '').toLowerCase();
        if (!PORTAL_ORIGINS.length) return origin === selfOrigin();
        return PORTAL_ORIGINS.indexOf(origin) >= 0;
    }

    // The first accepted message settles which of the allowlisted origins the player is
    // actually on, so everything after it is addressed to one place. It does NOT
    // reconsider `crossOrigin` — that is a fact about how this copy is served.
    function pin(e) {
        if (hostOrigin || !e.origin) return;
        hostOrigin = String(e.origin).replace(/\/+$/, '');
    }

    function isShareShell(w) {
        try {
            // The flag is the page saying so itself; the filename is the fallback for
            // the pages already in the bucket, which are only rewritten by
            // `python -m app.s3_backfill --share`.
            if (w.__jamShare) return true;
            return /(^|\/)_share\.html$/i.test(String(w.location.pathname || ''));
        } catch (e) {
            return false;   // cross-origin: not a page of ours, so not the share shell
        }
    }

    // ===== devtools logging ===============================================

    var S_BADGE = 'background:#4a6cf7;color:#fff;font-weight:700;padding:1px 5px;border-radius:3px';
    var S_NAME = 'color:#4a6cf7;font-weight:600';
    var S_DIM = 'color:#8a8fa8';
    var S_WARN = 'background:#b8860b;color:#fff;font-weight:700;padding:1px 5px;border-radius:3px';
    var S_OK = 'color:#0a8f4a;font-weight:600';
    var S_RESET = 'color:inherit;font-weight:400';

    var logging = true;
    try {
        // ?_jam_log=0 turns the chatter off without touching game code — handy when a
        // game's own logging matters more than ours.
        if (/[?&]_jam_log=(0|false|off)\b/i.test(window.location.search)) logging = false;
    } catch (e) { /* exotic sandbox — keep logging on */ }

    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    function elapsed() {
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        return '+' + ((now - t0) / 1000).toFixed(1) + 's';
    }

    var counts = {};
    function count(name) { counts[name] = (counts[name] || 0) + 1; }

    // One line per call: "JAM  logEvent  boss_fight_started  {…}  +4.2s".
    //
    // `kind` mirrors the line to the PLAYER's console as a notice (see relay). Pass it
    // only for calls the host cannot already see for itself — leaderboards go straight
    // to /api, a toast is drawn in-page — or the player prints the same news twice.
    function trace(name, args, note, kind) {
        if (kind) relay(kind, name + (note ? ' ' + note : ''));
        if (!logging) return;
        var head = '%cJAM%c %c' + name + '%c';
        var styles = [S_BADGE, S_RESET, S_NAME, S_RESET];
        if (note) { head += ' %c' + note + '%c'; styles.push(S_DIM, S_RESET); }
        head += ' %c' + elapsed() + (recording() ? '' : ' · not recorded (no player)') + '%c';
        styles.push(S_DIM, S_RESET);
        console.log.apply(console, [head].concat(styles, args || []));
    }

    // Is anything this call reports actually being stored? Two ways for that to be
    // true and they are mutually exclusive: the portal's player is around us, or
    // this page reports for itself (extOn). The line an author reads after every
    // call says which, so it has to ask both.
    function recording() {
        return (available && !hostSilent) || (extOn && !extDead);
    }

    function warn(message, detail) {
        // Up to the player's console as well: a warning is the line an author must not
        // miss, and the frame's own output is easy to lose — under a wall of engine noise,
        // or with DevTools filtered to the top frame.
        relay('warn', message);
        if (!logging) return;
        var a = ['%cJAM%c %c' + message + '%c', S_WARN, S_RESET, 'color:#b8860b', S_RESET];
        if (detail !== undefined) a.push(detail);
        console.warn.apply(console, a);
    }

    function banner() {
        if (!logging) return;
        var mode = available
            ? 'simulator (events → portal)'
            : (extOn ? 'own page (plays & events → portal)' : 'standalone (events → console only)');
        console.groupCollapsed(
            '%cJAM%c SDK v' + VERSION + ' %c· ' + mode + '%c — click to expand',
            S_BADGE, S_RESET, available ? S_OK : S_DIM, S_RESET,
        );
        console.log('%cgame%c      ' + (getGameId() || '(unknown)'), S_NAME, S_RESET);
        console.log('%cidentity%c  userId=' + getUserId() + ' · rewardMode=' + isRewardMode() +
            ' %c(always anonymous on the jam portal — there is no reward economy here)%c', S_NAME, S_RESET, S_DIM, S_RESET);
        console.log('%cevents%c    Jam.levelComplete(level, params?) · Jam.logEvent(name, params?)', S_NAME, S_RESET);
        console.log('%cloading%c   Jam.gameLoading() … Jam.gameReady() %c— optional pair: hold the portal ' +
            'loading splash over a heavy build until it is really playable. Say nothing and the splash lasts ' +
            'the page load and fades, as before — which is what an engine with its own loader wants.%c',
            S_NAME, S_RESET, S_DIM, S_RESET);
        console.log('%cads%c       Jam.showRewarded(cb) · Jam.showInterstitial(cb) · Jam.isRewardedReady() ' +
            '%c— mock ads drawn by the simulator; cb = {onOpen,onReward,onClose,onError}; ' +
            'one at a time and back-to-back requests debounced, so ask isRewardedReady() first. ' +
            'Jam.setAdUI("game") to draw the ad yourself, Jam.reportOwnAdTap() ends that show early ' +
            'on a click-through%c', S_NAME, S_RESET, S_DIM, S_RESET);
        console.log('%cboards%c    Jam.setLeaderboardScore(name, score, extraData?) · Jam.getLeaderboardEntries(name, opts?) · ' +
            'Jam.getLeaderboardEntry(name) · Jam.getLeaderboardDescription(name) ' +
            '%c— promises; Yandex Games shapes, portal-backed. A board is created by its first score.%c',
            S_NAME, S_RESET, S_DIM, S_RESET);
        console.log('%cui%c        Jam.toast(message, {icon,duration}?) · Jam.requestReview() → Promise', S_NAME, S_RESET);
        console.log('%chaptics%c   Jam.haptics(msOrPattern) · Jam.hapticTick() — optional device feedback; guard in older APKs', S_NAME, S_RESET);
        console.log('%cdebug%c     Jam.stats() · Jam.setLogging(false) · Jam.setFit(false) · or add ?_jam_log=0 to the URL', S_NAME, S_RESET);
        console.log('%ccontract%c  docs/game-bridge-contract.md — the same names work in an APK build', S_DIM, S_RESET);
        if (extOn) {
            console.log('%cThis page is not inside the portal player, so the SDK reports the play itself: one ' +
                'play session (timed while the tab is actually in front of somebody) and every ' +
                'Jam.levelComplete / Jam.logEvent call go to ' + EXT.api + ' for project ' + EXT.project + '. ' +
                'It needs a portal session in this browser — open the portal once and sign in. Ads are played ' +
                'by the SDK here and are counted nowhere; leaderboards read as empty.%c', S_DIM, S_RESET);
        } else if (!available) {
            console.log('%cNo host frame: this page is not inside the portal player, so nothing is recorded. ' +
                'Ads are played by the SDK itself here — same callbacks, same timings — so the game stays ' +
                'playable; events go to this console and leaderboards read as empty.%c', S_DIM, S_RESET);
        }
        console.groupEnd();
    }

    function stats() {
        var rows = Object.keys(counts).map(function (k) { return { call: k, times: counts[k] }; });
        if (!rows.length) { console.log('%cJAM%c no calls yet', S_BADGE, S_RESET); return counts; }
        if (console.table) console.table(rows);
        else console.log(counts);
        return counts;
    }

    // ----- outbound -------------------------------------------------------

    // Every outbound message goes through here, and never with a `*` target: a build
    // played from the CDN is on a public origin, and a wildcard would hand its
    // messages to whatever page happened to embed it.
    function send(type, payload) {
        if (!host) return false;
        var targets = hostTargets();
        var sent = false;
        for (var i = 0; i < targets.length; i++) {
            if (!targets[i]) continue;
            try {
                host.postMessage(
                    { source: SOURCE, v: VERSION, type: type, payload: payload }, targets[i],
                );
                sent = true;
            } catch (e) { /* one candidate refused; try the rest */ }
        }
        return sent;
    }

    function post(type, payload) {
        if (!host) return false;
        if (send(type, payload)) return true;
        warn('postMessage to the player failed — event dropped');
        return false;
    }

    function safeJson(params) {
        if (params == null) return '';
        try { return typeof params === 'string' ? params : JSON.stringify(params); }
        catch (e) {
            // Circular or non-serializable: keep the event, drop the payload, and say so —
            // otherwise the params silently vanish and the author never learns why.
            warn('params could not be serialized (circular or non-JSON?) — event sent without them', params);
            return '';
        }
    }

    // The "nothing was recorded" case is already spelled out on the trace line, so
    // this stays quiet — one line per call, not two.
    //
    // Two destinations, never both: the player relays for us when there is one,
    // and a page reporting for itself queues the event onto its own heartbeat
    // (extRecord). The two are mutually exclusive by construction — `extOn`
    // requires no host frame at all — so an event cannot be counted twice.
    function sendEvent(name, level, params) {
        var ev = {
            name: String(name || ''),
            level: String(level == null ? '' : level),
            params: safeJson(params),
        };
        if (host) { post('event', ev); return; }
        extRecord(ev);
    }

    // A line for the PLAYER's console — the top frame, where the portal logs its own
    // half of the round trip. Deliberately not routed through post(): post() warns when
    // it fails, warn() relays, and that pair would recurse. Strings only, so a game's
    // unclonable params can never break the channel.
    function relay(kind, text) {
        // Gated on `logging` like every other line, so `?_jam_log=0` and
        // `Jam.setLogging(false)` mean quiet on BOTH sides. The handshake below is not:
        // the player needs it to tell "no SDK here" from "the SDK is being quiet".
        if (!host || !logging) return;
        send('notice', { kind: kind, text: String(text) });
    }

    // The handshake, and the only proof the player has that this file is in the build at
    // all: nothing else the game does is guaranteed to happen (a game may never log an
    // event or ask for an ad). The player waits for it and says so if it never arrives —
    // an un-injected build is otherwise indistinguishable from a game nobody played.
    function hello() {
        if (!host) return;
        send('hello', {
            sdk: VERSION,
            game: getGameId() || '',
            page: String(window.location.pathname || '').split('/').pop() || '',
            title: String(document.title || ''),
            logging: logging,
        });
    }

    // ----- events ---------------------------------------------------------

    // The server caps a session at 300 events; a game reporting from its update loop
    // burns through that in seconds and then goes silent. Say so the first time the
    // rate looks like a loop rather than gameplay.
    var RATE_WINDOW_MS = 3000;
    var RATE_LIMIT = 30;
    var rateMarks = [];
    var rateWarned = false;

    function checkRate() {
        var now = Date.now();
        rateMarks.push(now);
        while (rateMarks.length && now - rateMarks[0] > RATE_WINDOW_MS) rateMarks.shift();
        if (!rateWarned && rateMarks.length > RATE_LIMIT) {
            rateWarned = true;
            warn(rateMarks.length + ' events in ' + (RATE_WINDOW_MS / 1000) + 's — the portal stores at most 300 per ' +
                 'session and 50 distinct names per project. Report milestones, not frames.');
        }
    }

    // ----- the loading splash ---------------------------------------------
    //
    // The player draws a splash over the frame while a build boots, and these two
    // calls are the whole contract for it. A build that says nothing keeps the old
    // behaviour — the splash lasts the entry page's own load and then fades — and
    // that is what an engine with a loader of its OWN wants: Unity and Godot are
    // drawing their progress bar by then, and holding ours over it would be two
    // loaders stacked. The pair is for a heavy CUSTOM build, which has no loader and
    // otherwise shows a blank frame for half a minute:
    //
    //     Jam.gameLoading();   // from your first script — hold the splash
    //     ...load your assets...
    //     Jam.gameReady();     // fade it
    //
    // Why this is not a field in `hello`, which is the obvious place for it: the
    // handshake goes out at the end of THIS file's own evaluation, and the tag is
    // injected ahead of the build's first <script> (game_sdk._insert_script_tag) — so
    // at that moment the game has not run a line and has nothing to declare. Delaying
    // the handshake was the alternative and it is worse: the player reads a missing
    // `hello` inside HELLO_GRACE_MS as a dead CDN path and reloads the build from the
    // portal, so a late handshake would cost every heavy build the fast source.
    //
    // What this replaced: a detector that posted `ready` by itself once a <canvas> had
    // survived five frames. For the builds the splash exists for that is exactly
    // backwards — an engine's bootstrap canvas is there in the first moments, so the
    // splash lifted off a game that had loaded nothing yet.
    var splashReady = false;

    function gameLoading() {
        count('gameLoading');
        if (splashReady) {
            warn('gameLoading() after gameReady() — ignored. The portal does not bring its splash back: ' +
                 'one that reappears mid-boot reads as a broken page.');
            return false;
        }
        // Whether the splash is still up is the PLAYER's business, so a genuinely late
        // call is caught there. This is the cheap local half: `complete` means the page
        // and its subresources are in, which is exactly when the player's fallback
        // fires — from here on the call is a race the author should not be running.
        if (document.readyState === 'complete') {
            warn('gameLoading() came late — the page has finished loading, so the portal may already have ' +
                 'faded its splash. Call it from your first script, before the engine boots.');
        }
        trace('gameLoading', [], 'the portal holds its splash until Jam.gameReady()');
        return post('loading', {});
    }

    function gameReady() {
        count('gameReady');
        if (splashReady) { trace('gameReady', [], 'already said — ignored'); return false; }
        splashReady = true;
        trace('gameReady', [], 'the portal fades its splash');
        return post('ready', { kind: 'explicit' });
    }

    function levelComplete(level, params) {
        count('levelComplete');
        checkRate();
        var lvl = String(level == null ? '' : level);
        if (!lvl) warn('levelComplete() called without a level — it will be recorded as "—"');
        trace('levelComplete', [params == null ? '' : params], lvl || '(no level)');
        sendEvent('level_complete', lvl, params);
    }

    function logEvent(name, params) {
        count('logEvent');
        checkRate();
        var raw = String(name == null ? '' : name);
        // Names are validated server-side ([a-z0-9_]{1,64}); normalize here so an
        // author's "Level Start" isn't silently dropped for casing/spaces alone.
        // Trailing/leading separators go too, so "###" becomes nothing rather than "_".
        var clean = raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
        if (!clean || !/[a-z0-9]/.test(clean)) {
            warn('logEvent() ignored — the name has no usable characters', raw);
            return;
        }
        // The portal mints level and ad events itself, and the engagement panel presents
        // those counts as trustworthy. A game reusing those names would quietly corrupt
        // them, so namespace it instead of dropping the event.
        if (clean === 'level_complete' || clean.indexOf('ad_') === 0) {
            clean = ('game_' + clean).slice(0, 64);
            warn('"' + raw + '" is a reserved name (the portal owns level and ad events) — recorded as ' + clean +
                 '. Use Jam.levelComplete() for level progress.');
        }
        // Showing the rewrite matters: the author greps the portal for their own
        // spelling and finds nothing otherwise.
        trace('logEvent', [params == null ? '' : params], clean !== raw ? '"' + raw + '" → ' + clean : clean);
        sendEvent(clean, '', params);
    }

    // ----- identity -------------------------------------------------------
    //
    // Deliberately anonymous. The portal attributes every event from the session
    // cookie, so the game never needs an id — and `if (getUserId()) { …rewards… }`
    // is a common pattern that would otherwise switch on reward mechanics the jam
    // portal cannot back. `isRewardMode()` is the documented gate for that, and in
    // jam it is always false.

    function getUserId() { return null; }
    function isRewardMode() { return false; }
    function getGameId() {
        // A page that reports for itself was TOLD which project it is, and that
        // answer is better than the URL's: it is the one this SDK is reporting
        // under, so a game namespacing its storage by it cannot disagree with the
        // rows the portal stores.
        if (EXT.project) return EXT.project;
        // The simulator passes the project id on the iframe URL; harmless to expose
        // and useful for a game that wants to namespace its own localStorage.
        try {
            var m = /[?&]_jam_p=([^&#]{1,60})/.exec(window.location.search);
            return m ? decodeURIComponent(m[1]) : null;
        } catch (e) { return null; }
    }

    // ----- ads (mock, drawn by the simulator) -----------------------------
    //
    // Callback contract is byte-for-byte the AdsManager one from rnd-lab's
    // ads-bridge.js, mock or not: onOpen when the surface appears, onReward only on
    // a completed rewarded view, onError with a status, and onClose in EVERY
    // terminal state, always last. A game that only handles onReward hangs — the
    // mock reproduces that rather than being forgiving, so the bug surfaces here
    // instead of in a real build.

    var adSeq = 0;
    var pendingAds = {};
    // The ad this frame is waiting on (set on request, cleared on any terminal
    // phase), and when the player said it would take another one. Both exist to stop
    // a game asking for two ads at once: the first is OUR rule (an overlap can only
    // ever be a bug — see requestAd), the second is the PLAYER's debounce, which is why
    // the number is never written here. `cooldownMs` / `retryAfterMs` arrive on the ad
    // messages; a copy of the constant would drift the moment it is tuned.
    var adPending = null;
    var adPendingAt = 0;
    var adReadyAt = 0;
    // Who paints the ad. 'portal' (the default) is the simulator's own card; 'game'
    // says this build draws its own surface and the portal must not cover its art.
    // Only the PICTURE moves: the portal still times the show, still decides the
    // reward, still counts the impression — and counts it under a name of its own, so
    // a self-drawn show is never mistaken for one somebody actually saw. It rides
    // every request rather than being announced once, because the host holds no
    // per-frame state about the game.
    var adUI = 'portal';
    // A pending ad blocks the next one, so it must not block it forever: if the player
    // never answers (a host that ignores the request, a frame swapped under us) the
    // guard releases. It does NOT resurrect the abandoned callbacks — there is nothing
    // to report about an ad nobody ever showed.
    var AD_STALE_MS = 60000;
    // The host was asked and said nothing (see armAdNoAnswer): from then on it is not
    // treated as a player any more — ads are played locally and the log stops claiming
    // anything is recorded.
    var hostSilent = false;

    function adRetryInMs() {
        var left = adReadyAt - Date.now();
        return left > 0 ? left : 0;
    }

    // `AdsManager.isRewardedReady()` in the lab (ads-bridge.js), same name and the
    // same boolean, so a game can spend its "one ad per round" only when there is an
    // ad to spend it on instead of burning the slot on a refusal. This is a QUESTION,
    // not a request: it reaches nobody, counts nothing, and never fires a callback.
    function adReady() {
        // Standalone counts as ready: with no portal the SDK plays the mock itself,
        // and a game that gates its button on this — which the contract tells it to
        // — would otherwise never offer the ad at all outside the portal.
        return !adBusy() && adRetryInMs() === 0;
    }

    function adBusy() {
        if (!adPending) return false;
        if (Date.now() - adPendingAt > AD_STALE_MS) { adPending = null; return false; }
        return true;
    }

    // ----- ads with no portal in front of us (the direct CDN link) --------
    //
    // A build opened by its direct public link (api/app/s3_mirror.py — the only way
    // to play on a phone off the VPN) has no parent frame, so there is nobody to draw
    // the simulator's ad card. Answering every request `unavailable` was correct and
    // useless: a game whose "watch an ad for extra moves" button is wired correctly
    // still leaves the player pressing a button that does nothing, and the author
    // cannot tell a broken integration from a missing host.
    //
    // So with no host the SDK plays the mock itself. What that changes and what it
    // deliberately does not:
    //   * the CALLBACK CONTRACT is identical — onOpen, then onReward for a completed
    //     rewarded view, then onClose last, always. That is the whole point: the game
    //     behaves the way it will inside the portal.
    //   * `available` stays FALSE. It answers "is the simulator there", and it still
    //     gates events, leaderboard writes and everything else that needs the portal.
    //     An ad shown here is posted nowhere and counted nowhere — there is no parent
    //     to send to and no session to attribute it to, which is also why this cannot
    //     inflate the numbers the jam is judged on.
    //   * `setAdUI('game')` is honoured the same way: we paint nothing and hand the
    //     game the same `durationMs` the portal would.
    // The timings are a deliberate COPY of the player's (web/src/components/play.jsx,
    // the AD_* constants). Everywhere else the numbers ride the ad messages precisely
    // so there is one copy — but here there are no messages, and a stand-in that ends
    // after a different number of seconds than the real card teaches the author the
    // wrong thing about their own pacing.
    var SA_REWARDED_MS = 3000;   // sat through => the reward is earned
    var SA_INTER_MS = 3000;      // interstitial auto-closes at the end
    var SA_INTER_SKIP_MS = 1000; // when Skip appears
    var SA_COOLDOWN_MS = 1500;   // the player's debounce between two ads
    var saNode = null;
    var saTimers = [];
    // Set only for a self-drawn (setAdUI('game')) standalone show: lets
    // reportOwnAdTap() end it right away instead of waiting out the timer. Cleared
    // on every terminal state so a stale tap can never reach into the next ad.
    var saOwnTapFinish = null;

    function saClear() {
        for (var i = 0; i < saTimers.length; i++) clearTimeout(saTimers[i]);
        saTimers = [];
        if (saNode && saNode.parentNode) saNode.parentNode.removeChild(saNode);
        saNode = null;
        saOwnTapFinish = null;
    }

    function saAfter(ms, fn) { saTimers.push(setTimeout(fn, ms)); }

    // Can we draw at all? A document with no body (an ad requested by a script in
    // <head>, before the page exists) has nowhere to put the card, and a stub that
    // throws would be worse than the old refusal.
    function saCanDraw() {
        try { return !!(window.document && document.body); } catch (e) { return false; }
    }

    function saCard(format) {
        var wrap = document.createElement('div');
        wrap.setAttribute('data-jam-ad', format);
        wrap.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483000;' +
            'display:flex;align-items:center;justify-content:center;background:rgba(8,10,14,.93);' +
            'font:500 15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;' +
            'text-align:center;padding:24px;box-sizing:border-box;-webkit-user-select:none;user-select:none';
        var card = document.createElement('div');
        card.style.cssText = 'max-width:340px;display:flex;flex-direction:column;gap:14px;align-items:center';
        var tag = document.createElement('div');
        tag.textContent = 'AD';
        tag.style.cssText = 'font-weight:700;letter-spacing:.18em;font-size:12px;padding:4px 10px;' +
            'border:1px solid rgba(255,255,255,.35);border-radius:5px;opacity:.85';
        var title = document.createElement('div');
        title.textContent = format === 'rewarded' ? 'Rewarded video' : 'Interstitial';
        title.style.cssText = 'font-size:19px;font-weight:600';
        var note = document.createElement('div');
        // Said on the ad itself: a player who followed a shared link has no portal
        // around the page to explain why the video looks like this.
        note.textContent = 'Stand-in for a real ad \u2014 this build is running outside the portal.';
        note.style.cssText = 'font-size:13px;opacity:.7';
        var count = document.createElement('div');
        count.style.cssText = 'font-size:34px;font-weight:700;font-variant-numeric:tabular-nums';
        var btn = document.createElement('button');
        btn.style.cssText = 'margin-top:4px;padding:9px 18px;border-radius:8px;' +
            'border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08);' +
            'color:#fff;font:inherit;cursor:pointer;visibility:hidden';
        card.appendChild(tag); card.appendChild(title); card.appendChild(note);
        card.appendChild(count); card.appendChild(btn);
        wrap.appendChild(card);
        document.body.appendChild(wrap);
        return { node: wrap, count: count, btn: btn };
    }

    function standaloneAd(id, format, cb) {
        var total = format === 'rewarded' ? SA_REWARDED_MS : SA_INTER_MS;
        var drawing = adUI === 'portal' && saCanDraw();
        adPending = id;
        adPendingAt = Date.now();
        saClear();

        function finish(rewarded) {
            saClear();
            if (adPending === id) adPending = null;
            adReadyAt = Date.now() + SA_COOLDOWN_MS;
            if (rewarded) {
                trace('ad', [], id + ' -> onReward + onClose (local stub, nothing counted)');
                cb.onReward && cb.onReward();
            } else {
                trace('ad', [], id + ' -> onClose (local stub, no reward)');
            }
            cb.onClose && cb.onClose();
        }

        trace('ad', [], id + ' -> shown locally (no portal, nothing is counted)' +
            (drawing ? '' : ', you draw it: ' + total + 'ms'));
        cb.onOpen && cb.onOpen({ durationMs: total });
        if (!drawing) {
            // setAdUI('game'), or a document we cannot draw into: the game paints for
            // `durationMs` and we only keep the clock, exactly as the portal does.
            saAfter(total, function () { finish(format === 'rewarded'); });
            // Only for a genuine own-UI show (not "can't draw"): the game may report a
            // click-through and end its own screen before `durationMs` is up, exactly
            // as it would inside the portal (see reportOwnAdTap()).
            if (adUI === 'game') saOwnTapFinish = function () { finish(format === 'rewarded'); };
            return;
        }
        var ui = saCard(format);
        saNode = ui.node;
        var startedAt = Date.now();
        function tick() {
            var left = Math.max(0, Math.ceil((total - (Date.now() - startedAt)) / 1000));
            ui.count.textContent = left > 0 ? String(left) : '';
            if (left > 0) saAfter(250, tick);
        }
        tick();
        if (format === 'rewarded') {
            // An end card, not a vanishing overlay: a real rewarded ad does not close
            // itself, and a game that resumes only in onClose has to be made to wait
            // for the player here too, or it passes off-VPN and hangs in the portal.
            saAfter(total, function () {
                ui.count.textContent = '';
                ui.btn.textContent = 'Claim reward';
                ui.btn.style.visibility = 'visible';
                ui.btn.onclick = function () { finish(true); };
            });
        } else {
            saAfter(SA_INTER_SKIP_MS, function () {
                ui.btn.textContent = 'Skip';
                ui.btn.style.visibility = 'visible';
                ui.btn.onclick = function () { finish(false); };
            });
            saAfter(total, function () { finish(false); });
        }
    }

    // ----- a host that never answers -------------------------------------
    //
    // `available` is a guess made at load time from the presence of a parent frame,
    // and it can be wrong in the one direction that hurts: a build embedded in a page
    // that is not the player accepts the `ad-request` message and does nothing with
    // it. The game paused in `onOpen` and waits for an `onClose` that will never
    // come — the whole session is over, on a surface where nobody can tell why.
    //
    // The player answers `ad-request` synchronously inside its own message handler
    // (usePlayBridge in web/src/components/play.jsx), so silence past this window is
    // not a slow portal, it is no portal: take the ad over locally, exactly as if
    // there had been no parent at all, and stop treating that frame as a player. A
    // late answer is ignored — the callbacks belong to the local stub by then.
    var AD_NO_ANSWER_MS = 1500;
    var adAnswered = {};

    function armAdNoAnswer(id, format, cb) {
        setTimeout(function () {
            if (adAnswered[id] || pendingAds[id] !== cb) return;
            delete pendingAds[id];
            hostSilent = true;
            try { window.Jam.available = false; } catch (e) { /* frozen by the game */ }
            warn('the page around this build did not answer the ad request in ' +
                 AD_NO_ANSWER_MS + 'ms, so it is not the portal player. Playing the ' +
                 'stand-in ad here instead — same callbacks, counted nowhere.');
            if (adPending === id) adPending = null;
            standaloneAd(id, format, cb);
        }, AD_NO_ANSWER_MS);
    }

    function requestAd(format, callbacks) {
        var cb = callbacks || {};
        count(format === 'rewarded' ? 'showRewarded' : 'showInterstitial');
        // The failure this catches is the classic one: a game that resumes only in
        // onReward stays frozen forever the moment a player closes the ad early.
        if (typeof cb.onClose !== 'function') {
            warn('no onClose handler — onClose is the ONLY callback guaranteed to fire. ' +
                 'Resume the game there, not in onReward, or a skipped ad freezes it.');
        }
        if (format === 'rewarded' && typeof cb.onReward !== 'function') {
            warn('showRewarded() without onReward — the player can earn a reward nothing will grant.');
        }
        var id = 'ad_' + (++adSeq);
        trace('show' + (format === 'rewarded' ? 'Rewarded' : 'Interstitial'), [], id);
        // Two ads at once is the one refusal we answer ourselves. The player refuses it
        // too, but a round trip later — and by then the game has a second set of
        // callbacks live against an ad that will never open, which is how "the reward
        // fired twice" and "the game stayed paused" happen. Nothing is sent, so the
        // portal's ad counters stay a record of ads it was actually asked to play.
        if (adBusy()) {
            warn('an ad (' + adPending + ') is still on screen — this request was refused ' +
                 'here, not sent to the player. onClose always fires; ask again from there.');
            trace('ad', [], id + ' → refused locally (' + adPending + ' still open)');
            // No retryAfterMs on purpose: an open ad ends when the player closes it,
            // and "0" would read as "ask again now". onClose of the ad that IS open is
            // the moment to ask, which is what the warning says.
            cb.onError && cb.onError({ status: 'not_ready' });
            cb.onClose && cb.onClose();
            return;
        }
        if (!available || hostSilent) {
            // No host frame, or one that has already been caught not answering: play
            // the mock ourselves instead of refusing. Same callbacks, same timings,
            // counted nowhere — see `standaloneAd`.
            standaloneAd(id, format, cb);
            return;
        }
        pendingAds[id] = cb;
        adPending = id;
        adPendingAt = Date.now();
        if (!post('ad-request', { id: id, format: format, adUI: adUI })) {
            delete pendingAds[id];
            adPending = null;
            cb.onError && cb.onError({ status: 'unavailable' });
            cb.onClose && cb.onClose();
            return;
        }
        armAdNoAnswer(id, format, cb);
    }

    function showRewarded(callbacks) { requestAd('rewarded', callbacks); }
    function showInterstitial(callbacks) { requestAd('interstitial', callbacks); }

    // Only meaningful under setAdUI('game'): the game's own ad screen treats a tap on
    // it as a click-through (a real ad network's most common exit) and wants the show
    // to end right there instead of running out its full durationMs — a game that hid
    // its own screen already but is still waiting on onClose reads to a player as a
    // freeze. Ends the CURRENTLY OPEN ad only (tracked by adPending, the same flag
    // requestAd uses to refuse an overlapping show); a stale or missing call is a
    // no-op with a warning, never a crash.
    function reportOwnAdTap() {
        if (adUI !== 'game') {
            warn('reportOwnAdTap() ignored — call it only after Jam.setAdUI("game")');
            return;
        }
        var id = adPending;
        if (!id) {
            warn('reportOwnAdTap() ignored — no ad is currently open');
            return;
        }
        trace('reportOwnAdTap', [], id + ' -> click-through, ending the show early');
        if (available && !hostSilent) {
            post('ad-tap', { id: id });
            return;
        }
        // No portal (or one already caught not answering): end the local stand-in
        // instead of posting into the void.
        if (typeof saOwnTapFinish === 'function') {
            var finish = saOwnTapFinish;
            saOwnTapFinish = null;
            finish();
        }
    }

    // Session state, not a per-call flag: a game either has an ad screen of its own or
    // it does not, and making it a per-call option would double the states the portal
    // and the author both have to keep straight ("that show was mine, this one theirs").
    // Declare it once next to the rest of the integration.
    function setAdUI(mode) {
        if (mode !== 'game' && mode !== 'portal') {
            warn('setAdUI(' + JSON.stringify(mode) + ') ignored — pass "game" to draw the '
                 + 'ad yourself, or "portal" for the simulator\'s card.');
            return adUI;
        }
        adUI = mode;
        trace('setAdUI', [mode], mode === 'game'
            ? 'you draw the ad; onOpen carries durationMs — paint for that long'
            : 'the simulator draws the ad');
        return adUI;
    }

    function onAdMessage(payload) {
        var cb = pendingAds[payload.id];
        if (!cb) return;
        // Proof the host is alive, and the one thing armAdNoAnswer() waits for. Not
        // `pendingAds` itself: an answered `open` stays pending for the whole show
        // (that is what carries the close), so it cannot tell "still on screen" from
        // "nobody there".
        adAnswered[payload.id] = true;
        // 'open' is not terminal — the ad is still on screen.
        if (payload.phase === 'open') {
            // `durationMs` is how long the surface will be up, and it is the whole
            // answer to "how long do I paint my own ad for" under setAdUI('game'). It
            // is passed in both modes and as an ARGUMENT to a callback that used to
            // take none, so an older game simply ignores it.
            var info = { durationMs: payload.durationMs };
            trace('ad', [], payload.id + ' → onOpen (pause the game here)'
                + (payload.durationMs ? ', ' + payload.durationMs + 'ms' : ''));
            cb.onOpen && cb.onOpen(info);
            return;
        }
        delete pendingAds[payload.id];
        delete adAnswered[payload.id];
        if (adPending === payload.id) adPending = null;
        // When the next ad may be asked for, straight from the player — the debounce is
        // its rule, so the number is read, never assumed. `cooldownMs` rides every
        // terminal phase, `retryAfterMs` a refusal that came from the debounce.
        var wait = payload.retryAfterMs != null ? payload.retryAfterMs : payload.cooldownMs;
        if (typeof wait === 'number' && wait >= 0) adReadyAt = Date.now() + wait;
        if (payload.phase === 'reward') {
            trace('ad', [], payload.id + ' → onReward + onClose');
            cb.onReward && cb.onReward();
        } else if (payload.phase === 'error') {
            trace('ad', [], payload.id + ' → onError(' + (payload.status || 'error') + ') + onClose');
            if (payload.status === 'not_ready') {
                warn('ad refused as not_ready — asked again too soon' +
                     (adRetryInMs() ? ' (another ' + adRetryInMs() + 'ms to go)' : '') +
                     '. The player debounces back-to-back requests, so this usually means a ' +
                     'double-tap on your own button or a loop asking every frame. A real SDK ' +
                     'also refuses when it has nothing to show: gate the request on ' +
                     'Jam.isRewardedReady() so the game does not spend its reward on a refusal.');
            }
            cb.onError && cb.onError({
                status: payload.status || 'error',
                retryAfterMs: adRetryInMs(),
            });
        } else {
            trace('ad', [], payload.id + ' → onClose (no reward)');
        }
        cb.onClose && cb.onClose();
    }

    window.addEventListener('message', function (e) {
        // Only the page playing us, only an allowlisted origin, only our envelope.
        if (!fromPlayer(e)) return;
        var d = e.data;
        if (!d || d.source !== 'jam-host') return;
        pin(e);
        if (d.type === 'review') {
            var review = pendingReview;
            if (!review || review.id !== (d.payload || {}).id) return;
            clearTimeout(review.timer);
            if (d.payload.status === 'open') return;
            pendingReview = null;
            if (d.payload.message) toast(d.payload.message, { icon: '⭐', duration: 4500 });
            review.resolve({ status: d.payload.status, starred: !!d.payload.starred });
            return;
        }
        if (d.type === 'ad') {
            try { onAdMessage(d.payload || {}); }
            catch (err) { console.warn('[jam] ad callback', err); }
            return;
        }
        if (d.type === 'lb') {
            try { onLbReply(d.payload || {}); }
            catch (err) { console.warn('[jam] leaderboard reply', err); }
        }
    });

    // The player owns the form and the authenticated write, including CDN games.
    // Older/native adapters may lack this optional method; callers must guard it.
    var pendingReview = null;
    function requestReview() {
        count('requestReview');
        trace('requestReview', [], 'store review dialog', 'ui');
        if (pendingReview) return Promise.resolve({ status: 'busy' });
        if (!host) return Promise.resolve({ status: 'unavailable' });
        return new Promise(function (resolve) {
            var id = 'review-' + Date.now() + '-' + Math.random().toString(36).slice(2);
            var timer = setTimeout(function () {
                if (!pendingReview || pendingReview.id !== id) return;
                pendingReview = null;
                resolve({ status: 'unavailable' });
            }, 2500);
            pendingReview = { id: id, resolve: resolve, timer: timer };
            send('review-request', { id: id });
        });
    }

    // ----- toast ----------------------------------------------------------
    // Drawn in-page (not by the simulator) so it sits above the game's own canvas
    // the same way the lab SDK's toast does, and so it still works in a tab.

    var STYLE_ID = 'jam-sdk-styles';
    var wrap = null;

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent =
            '.jam-toast-wrap{position:fixed;left:0;right:0;top:0;z-index:2147483000;display:flex;' +
            'flex-direction:column;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top) + 10px) 12px 0;' +
            'pointer-events:none;font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;}' +
            '.jam-toast{pointer-events:auto;max-width:92vw;background:linear-gradient(135deg,#4a6cf7,#7a4af7);' +
            'color:#fff;font-size:14px;font-weight:700;padding:11px 16px;border-radius:999px;' +
            'box-shadow:0 6px 22px rgba(0,0,0,.35);display:flex;align-items:center;gap:8px;' +
            'transform:translateY(-24px);opacity:0;transition:transform .28s cubic-bezier(.2,.9,.3,1.2),opacity .28s;}' +
            '.jam-toast.jam-in{transform:translateY(0);opacity:1;}';
        (document.head || document.documentElement).appendChild(el);
    }

    function ensureBody(fn) {
        if (document.body) { fn(); return; }
        document.addEventListener('DOMContentLoaded', fn, { once: true });
    }

    function toast(message, opts) {
        opts = opts || {};
        count('toast');
        trace('toast', [], String(message), 'ui');
        ensureBody(function () {
            injectStyles();
            if (!wrap) {
                wrap = document.createElement('div');
                wrap.className = 'jam-toast-wrap';
                document.body.appendChild(wrap);
            }
            var t = document.createElement('div');
            t.className = 'jam-toast';
            // textContent, never innerHTML: the message is caller-supplied and this
            // runs on the portal's own origin, so interpolation would be an XSS hole.
            var icon = document.createElement('span');
            icon.textContent = opts.icon != null ? String(opts.icon) : '🎉';
            var msg = document.createElement('span');
            msg.textContent = String(message);
            t.appendChild(icon);
            t.appendChild(msg);
            wrap.appendChild(t);
            requestAnimationFrame(function () { t.classList.add('jam-in'); });
            setTimeout(function () {
                t.classList.remove('jam-in');
                setTimeout(function () { t.parentNode && t.parentNode.removeChild(t); }, 320);
            }, opts.duration || 2600);
        });
    }

    // ----- leaderboards ---------------------------------------------------
    //
    // Names and payloads are (near-)copies of the Yandex Games SDK's
    // `ysdk.leaderboards.*`, because that is what jam authors already integrate
    // against — a game ported from Yandex should only have to swap which object it
    // calls, not how it reads a board. Server side: api/app/leaderboards.py.
    //
    // THE ONE PLACE THIS FILE TALKS TO /api DIRECTLY. Events and ads go through the
    // simulator (it owns the play session and throttles the stream), but a board is
    // different on both counts:
    //   • a read needs an ANSWER, and routing a request/response pair through a
    //     postMessage relay buys nothing here — the score is not session data;
    //   • it has to work OUTSIDE the simulator. A phone opening the QR code loads the
    //     build directly, and "look at the leaderboard on your phone" is the case
    //     players actually care about. The relay has no parent frame there.
    // Both directions still run on the portal's own origin with the viewer's session
    // cookie, so identity is the portal's, never the game's claim.
    //
    // Boards are created by their first score: there is no developer console to
    // declare one in, unlike Yandex (where a missing technical name simply errors).

    // Promise + fetch are required. Rather than shipping a polyfill into every build,
    // the methods degrade to a synchronous false/null — `await false` is false, so an
    // integration written against the promise API still runs.
    var lbSupported = (typeof window.Promise === 'function' && typeof window.fetch === 'function');
    var PLAY_PATH_RE = /^\/plays\/([0-9a-f]{32})\//;
    var projectPromise = null;
    var lbWarned = false;
    // Last score accepted per board. game.js-style code re-submits the same personal
    // best after every round; re-posting an unchanged value is pure noise.
    var lbBest = {};

    // `Jam.available` answers "is the SIMULATOR there" — it gates events and ads,
    // which have nowhere to go without a parent frame. Boards are not in that boat,
    // so a game must not gate them on it: a build opened from the QR code on a phone
    // has available === false and perfectly working leaderboards. This is the flag to
    // check (or just call a method and handle the false/null).
    function leaderboardsAvailable() {
        if (!lbSupported) return false;
        // `getGameId()` covers both routes: the player puts `_jam_p` on the frame URL
        // whether the build is served from /plays or from the CDN, and it is also what
        // the proxy needs the portal to already know. The path test is the phone that
        // opened a /plays URL straight from the QR code.
        return !!(getGameId() || PLAY_PATH_RE.test(window.location.pathname || ''));
    }

    // Board names are normalized like event names — lowercased, non-word runs folded
    // to '_'. Deliberately CASE-INSENSITIVE: Yandex technical names are usually
    // camelCase ('blockChpock'), and if case were significant then editing it in game
    // code would silently fork a second board and orphan every score on the first.
    // The cost is cosmetic (the portal shows 'blockchpock' until the author sets a
    // display title); the alternative loses data.
    function lbName(raw) {
        var clean = String(raw == null ? '' : raw)
            .trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
        return /[a-z0-9]/.test(clean) ? clean : '';
    }

    // "blockChpock → blockchpock" on the trace line. Without it an author greps the
    // portal for the name they typed and concludes nothing was recorded.
    function lbNote(raw, clean) {
        return String(raw) === clean ? clean : '"' + raw + '" → ' + clean;
    }

    // The project id: from the simulator's iframe URL when embedded, otherwise looked
    // up once from the build's own /plays/<token>/ path. Resolves to null when this
    // page is neither — an author previewing a build off a file:// URL, say.
    function projectId() {
        if (projectPromise) return projectPromise;
        var direct = getGameId();
        if (direct) {
            projectPromise = Promise.resolve(direct);
            return projectPromise;
        }
        var m = PLAY_PATH_RE.exec(window.location.pathname || '');
        if (!m) {
            projectPromise = Promise.resolve(null);
            return projectPromise;
        }
        projectPromise = lbFetch('GET', '/api/plays/' + m[1] + '/project')
            .then(function (r) { return (r && r.projectId) || null; })
            .catch(function () { return null; });
        return projectPromise;
    }

    // ----- leaderboards through the parent, when /api is not reachable ----
    //
    // Boards are the one thing in this file that calls /api itself, with the viewer's
    // cookie, on a relative path. From a frame served by the CDN that path leads into
    // the bucket — so inside the portal the call goes through the parent instead.
    //
    // What was rejected, and why this is not a workaround: an absolute API base plus
    // CORS plus `SameSite=None`. The portal's session cookie is `lax` today, and
    // weakening it for the whole site to serve one frame is a bad trade when a
    // postMessage channel already exists. The proxy also STRENGTHENS the standing
    // invariant that the game never learns its play-session id, because the request
    // now leaves the PAGE rather than the game.
    //
    // Narrow on purpose — four named operations and a board name, with the portal
    // building the URL from a project id it already has. Not a generic fetch relay:
    // that would turn "the game cannot call /api" into "the game calls /api using the
    // viewer's hands", which is a different and worse thing.
    //
    // The direct path below STAYS. A phone that opened the build from the QR code has
    // no portal parent to proxy through, and that is a supported way to play.
    var LB_OPS = { score: 1, entries: 1, player: 1, description: 1 };
    var LB_TIMEOUT_MS = 8000;
    var lbSeq = 0;
    var lbPending = {};

    function lbProxy(op, board, args) {
        if (!LB_OPS[op]) return Promise.reject(new Error('unknown leaderboard op ' + op));
        var id = 'lb' + (++lbSeq);
        return new Promise(function (resolve, reject) {
            var done = false;
            var timer = window.setTimeout(function () {
                if (done) return;
                done = true;
                delete lbPending[id];
                // A timeout is handed to lbCall as an ordinary failure, so the board
                // still resolves to its fallback and `lbCall` stays unthrowing.
                reject(new Error('the player did not answer the leaderboard call'));
            }, LB_TIMEOUT_MS);
            lbPending[id] = function (payload) {
                if (done) return;
                done = true;
                window.clearTimeout(timer);
                delete lbPending[id];
                if (payload && payload.ok) { resolve(payload.result); return; }
                var err = new Error((payload && payload.error) || 'leaderboard call failed');
                if (payload && payload.status) err.status = payload.status;
                reject(err);
            };
            if (!send('lb', { id: id, op: op, board: board, args: args || {} })) {
                window.clearTimeout(timer);
                delete lbPending[id];
                reject(new Error('the player is not reachable'));
            }
        });
    }

    function onLbReply(payload) {
        var fn = payload && payload.id ? lbPending[payload.id] : null;
        if (fn) fn(payload);
    }

    function lbFetch(method, url, body) {
        var opts = {
            method: method,
            credentials: 'same-origin',
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        };
        return window.fetch(url, opts).then(function (res) {
            if (!res.ok) {
                var err = new Error(method + ' ' + url + ' → ' + res.status);
                err.status = res.status;
                throw err;
            }
            if (res.status === 204) return null;
            return res.json();
        });
    }

    // Every leaderboard call funnels through here: pick the route, resolve the project,
    // build the URL, and turn "no host / no board / network died" into the fallback
    // value instead of a rejection. A game must be able to fire a score into the void
    // from a game-over handler with no .catch(), exactly like Jam.logEvent.
    //
    // `op` names the operation for the proxy route; `run(base)` builds the request for
    // the direct one. Both are given, and which is used depends only on whether /api
    // is reachable from this frame — nothing in a game's code changes either way.
    function lbCall(label, board, fallback, run, op, args, map) {
        var name = lbName(board);
        if (!name) {
            warn('leaderboard name has no usable characters — call ignored', board);
            return Promise.resolve(fallback);
        }
        if (extOn) {
            // A page reporting for itself has the project id and the API base, so
            // this branch LOOKS possible — and it is not. Every board call is a
            // GET or a JSON POST, i.e. a CORS preflight, and a preflight carries
            // no cookies: the corporate login at the edge answers it with a
            // redirect and the call never reaches the portal. The play report
            // avoids that by being a simple request; a board cannot (see
            // api/app/ext_play.py). Boards need the portal's own player.
            if (!lbWarned) {
                lbWarned = true;
                warn('leaderboards need the portal\'s own player. This page reports plays and events to the ' +
                     'portal, but a board is read and written over /api, which a page on another origin ' +
                     'cannot reach here — scores are not recorded and boards read as empty.');
            }
            trace(label, [], name + ' → unavailable (outside the portal)', 'board');
            return Promise.resolve(fallback);
        }
        if (crossOrigin && op) {
            // `map` is what keeps a game's code from being able to tell the two routes
            // apart: the proxy hands back the raw JSON the API answered, and this is
            // the same shaping the direct branch does inside `run`.
            return lbProxy(op, name, args)
                .then(function (r) { return map ? map(r, name) : r; })
                .catch(function (e) {
                    trace(label, [], name + ' → ' + (e && e.status === 404
                        ? 'no such board yet' : 'failed (via the player)'), 'board');
                    return fallback;
                });
        }
        return projectId().then(function (pid) {
            if (!pid) {
                if (!lbWarned) {
                    lbWarned = true;
                    warn('leaderboards need the portal: this page is not a hosted jam build, ' +
                         'so scores are not recorded and boards read as empty.');
                }
                trace(label, [], name + ' → unavailable (no portal context)', 'board');
                return fallback;
            }
            var base = '/api/projects/' + encodeURIComponent(pid) + '/leaderboards/' + encodeURIComponent(name);
            return run(base, name);
        }).catch(function (e) {
            // 401 is the one failure an author can't debug from the message alone: the
            // build is fine, the page just isn't carrying a portal session (a /plays
            // URL opened by someone who never signed in).
            if (e && e.status === 401 && !lbWarned) {
                lbWarned = true;
                warn('not signed in to the portal — scores are not recorded and boards read as empty. ' +
                     'Open the game from the portal (or sign in at /login) to appear on a board.');
            }
            // A 404 is the ordinary "this board has no config yet" case — say so
            // plainly rather than making the author read a stack trace.
            trace(label, [], name + ' → ' + (e && e.status === 404 ? 'no such board yet' : 'failed'), 'board');
            return fallback;
        });
    }

    // Yandex hands entries a `player.getAvatarSrc()` METHOD; JSON can't carry one, so
    // rebuild it from the URL the server sent. Keeps a Yandex-written renderer working
    // unchanged instead of making it special-case the portal.
    function hydrate(entry) {
        if (!entry || typeof entry !== 'object') return entry;
        var p = entry.player || (entry.player = {});
        if (typeof p.getAvatarSrc !== 'function') {
            p.getAvatarSrc = function () { return p.avatarUrl || ''; };
        }
        if (typeof p.getAvatarSrcSet !== 'function') {
            p.getAvatarSrcSet = function () { return p.avatarUrl || ''; };
        }
        return entry;
    }

    function hydrateResult(res) {
        if (res && res.entries && res.entries.length) res.entries.forEach(hydrate);
        return res;
    }

    // Yandex takes extraData as a string; an object is the mistake everyone makes, so
    // serialize it here instead of storing "[object Object]".
    function lbExtra(extraData) {
        if (extraData == null) return null;
        if (typeof extraData === 'string') return extraData;
        try { return JSON.stringify(extraData); }
        catch (e) {
            warn('leaderboard extraData could not be serialized — score sent without it', extraData);
            return null;
        }
    }

    function setLeaderboardScore(name, score, extraData) {
        count('setLeaderboardScore');
        if (!lbSupported) return false;
        var value = Math.floor(Number(score));
        if (!isFinite(value)) {
            warn('setLeaderboardScore() ignored — score is not a number', score);
            return Promise.resolve(false);
        }
        var key = lbName(name);
        trace('setLeaderboardScore', [value, extraData == null ? '' : extraData], lbNote(name, key), 'board');
        // Unchanged best → nothing to record. Skipped only when the game passes no new
        // extraData either, since that payload belongs to the score.
        if (lbBest[key] === value && extraData == null) {
            trace('setLeaderboardScore', [], key + ' → unchanged, not re-sent', 'board');
            return Promise.resolve(true);
        }
        var body = { score: value, extraData: lbExtra(extraData) };
        return lbCall('setLeaderboardScore', name, false, function (base) {
            // `key` from this closure, never a remembered "last board": two concurrent
            // submissions to different boards would otherwise cross their answers, and
            // `lbBest` is exactly what the de-duplication reads.
            return lbFetch('POST', base + '/score', body).then(function (r) {
                return lbScoreResult(r, key);
            });
        }, 'score', body, lbScoreResult);
    }

    // The one place a score response is read, so the proxy route and the direct route
    // report the same thing to the game and keep the same `lbBest` bookkeeping. Both
    // callers pass the board explicitly — see the note at the direct one.
    function lbScoreResult(r, key) {
        if (!r || r.ok !== true) {
            warn('score refused by the portal (' + ((r && r.reason) || 'unknown') + ')', key);
            return false;
        }
        lbBest[key] = r.best;
        trace('setLeaderboardScore', [], key + ' → rank ' + r.rank +
            ', best ' + r.best + (r.improved ? ' (new record)' : ''), 'board');
        return true;
    }

    function getLeaderboardEntries(name, options) {
        count('getLeaderboardEntries');
        if (!lbSupported) return null;
        var o = options || {};
        var q = 'top=' + (o.quantityTop == null ? 10 : Math.max(0, o.quantityTop | 0)) +
            '&around=' + (o.quantityAround == null ? 3 : Math.max(0, o.quantityAround | 0)) +
            '&includeUser=' + (o.includeUser === false ? 'false' : 'true');
        trace('getLeaderboardEntries', [o], lbNote(name, lbName(name)), 'board');
        return lbCall('getLeaderboardEntries', name, null, function (base) {
            return lbFetch('GET', base + '/entries?' + q).then(hydrateResult);
        }, 'entries', {
            top: o.quantityTop == null ? 10 : Math.max(0, o.quantityTop | 0),
            around: o.quantityAround == null ? 3 : Math.max(0, o.quantityAround | 0),
            includeUser: o.includeUser !== false,
        }, hydrateResult);
    }

    function getLeaderboardEntry(name) {
        count('getLeaderboardEntry');
        if (!lbSupported) return null;
        trace('getLeaderboardEntry', [], lbNote(name, lbName(name)), 'board');
        return lbCall('getLeaderboardEntry', name, null, function (base) {
            return lbFetch('GET', base + '/player').then(lbOwnEntry);
        }, 'player', null, lbOwnEntry);
    }

    function lbOwnEntry(r) {
        return r && r.entry ? hydrate(r.entry) : null;
    }

    function getLeaderboardDescription(name) {
        count('getLeaderboardDescription');
        if (!lbSupported) return null;
        trace('getLeaderboardDescription', [], lbNote(name, lbName(name)), 'board');
        return lbCall('getLeaderboardDescription', name, null, function (base) {
            return lbFetch('GET', base);
        }, 'description');
    }

    // ----- hub-only members ----------------------------------------------
    // Present so a game carried the other way (lab → jam) can't throw on an
    // undefined method. They do nothing here — and they say so once, because a
    // silent no-op is how an author concludes the portal is broken.
    function hubNoop(name) {
        return function () {
            count(name);
            trace(name, [], 'no-op on the jam portal (hub-only — real in an APK build)', 'noop');
        };
    }
    function hubNoopUnsub(name) {
        var f = hubNoop(name);
        return function () { f(); return function () {}; };
    }

    // ===== viewport fit ===================================================
    //
    // A build that lays itself out LARGER than the frame it was given is the most
    // common thing wrong with an uploaded web build, and its author cannot see it:
    // in their own tab the window is whatever the page asked for. In the portal the
    // frame is exactly the visible box — the device screen in the simulator, the
    // stage in full-window mode (web/src/components/play.jsx, .play-stage is
    // overflow:hidden) — so the surplus becomes scrollbars inside the game and a
    // game UI that sits under the player's own toolbar.
    //
    // Two shapes account for nearly all of it:
    //   1. 100vw/100vh sizing plus the UA's default `body { margin: 8px }` — the
    //      document is 16px bigger than the viewport in both axes;
    //   2. a canvas sized from one axis and its intrinsic ratio (Unity's
    //      `<canvas width=1080 height=1920>` with `width:100%`), or from the desktop
    //      branch of Unity's template (a hard `960px × 600px` in a phone frame).
    //
    // Fixed from HERE rather than in the build, because this file is not copied into
    // a build (game_sdk.py injects a tag pointing at a fixed URL): the fix lands on
    // every already-uploaded game without anyone re-uploading, and it covers a build
    // opened straight in a tab as well as one inside the player.
    //
    // Rules, so this never fights a build that had it right:
    //   - nothing happens until the document is MEASURED to overflow;
    //   - we only ever relax the page and scale the game DOWN, keeping its own
    //     proportions — never up, since a small canvas is the author's decision;
    //   - a page with no canvas and more than a margin's worth of surplus is left
    //     scrollable: it may be a page on purpose (rules, a menu, a form);
    //   - it says what it changed and prints the template one-liner, so the author
    //     can make the build correct everywhere else it is ever embedded;
    //   - `?_jam_fit=0` on the URL, or `Jam.setFit(false)`, turns it off. Off does
    //     not undo what was already applied — reload for that.

    var FIT_SLACK = 2;      // sub-pixel layout noise is not overflow
    var FIT_SLIVER = 48;    // "a default body margin" worth of surplus, either axis
    var FIT_TRIES = [0, 250, 750, 1500, 3000, 6000, 10000];  // an engine's canvas arrives late

    var fitOn = true;
    try {
        if (/[?&]_jam_fit=(0|false|off)\b/i.test(window.location.search)) fitOn = false;
    } catch (e) { /* exotic sandbox — keep the fit on */ }

    var fitPage = false;    // page box already relaxed (margins, scrollbars)
    var fitEl = null;       // the canvas we are scaling
    var fitNat = null;      // its proportions as the build itself laid them out
    var fitWrote = null;    // the box WE last wrote, so we can tell it from the build's
    var fitSaid = {};      // one line per distinct adjustment, not per measurement
    var fitHinted = false;
    var fitGaveUp = false;
    var fitTimer = null;

    function fitViewport() {
        var d = document.documentElement;
        return {
            w: window.innerWidth || (d && d.clientWidth) || 0,
            h: window.innerHeight || (d && d.clientHeight) || 0
        };
    }

    // Content minus frame, per axis. scrollWidth/scrollHeight keep reporting the
    // content box after the scrollbars are hidden, which is what lets the later
    // steps measure whether the earlier ones were enough.
    function fitOverflow() {
        var v = fitViewport();
        var d = document.documentElement, b = document.body;
        return {
            x: Math.max(d ? d.scrollWidth : 0, b ? b.scrollWidth : 0) - v.w,
            y: Math.max(d ? d.scrollHeight : 0, b ? b.scrollHeight : 0) - v.h,
            w: v.w,
            h: v.h
        };
    }

    function fitOver(o) { return o.x > FIT_SLACK || o.y > FIT_SLACK; }

    // The game's own surface: the biggest canvas on the page. A build with none
    // (a DOM/CSS game, or an engine that hasn't booted yet) gets the page step only.
    function findCanvas() {
        var list = document.getElementsByTagName('canvas');
        var best = null, area = 0;
        for (var i = 0; i < list.length; i++) {
            var r = list[i].getBoundingClientRect();
            var a = r.width * r.height;
            if (a > area) { area = a; best = list[i]; }
        }
        return best;
    }

    function fitRelax(el) {
        if (!el) return;
        el.style.margin = '0';
        el.style.padding = '0';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.overflow = 'hidden';
    }

    // Scale to the frame from the proportions captured BEFORE we touched the canvas,
    // never from the size we last wrote — otherwise every resize compounds its own
    // rounding, and a frame that grows again could never give the game its size back.
    function fitScale(v) {
        var k = Math.min(v.w / fitNat.w, v.h / fitNat.h);
        if (k > 1) k = 1;
        var w = Math.max(1, Math.round(fitNat.w * k));
        var h = Math.max(1, Math.round(fitNat.h * k));
        var st = fitEl.style;
        // Always re-centre: a frame can change height without changing which axis
        // binds, and the margins below are the only thing that moves then.
        fitCentre(v, h);
        fitWrote = { w: w, h: h };
        if (st.width === w + 'px' && st.height === h + 'px') return;
        st.width = w + 'px';
        st.height = h + 'px';
        st.maxWidth = 'none';
        st.maxHeight = 'none';
        st.display = 'block';
        st.marginLeft = 'auto';   // the horizontal half of the letterbox
        st.marginRight = 'auto';
    }

    // The vertical half. Auto margins are 0 in block layout, so this is real pixels —
    // which is why it is only done where it cannot displace anything: the canvas must
    // be in normal flow and nothing else in its box may be in flow with it. A canvas
    // an engine positions itself (Unity's transform-centred container) or one sharing
    // its parent with a footer is left exactly where the build put it.
    function fitCentre(v, h) {
        var st = fitEl.style;
        var p = fitEl.parentNode;
        if (!p || p.nodeType !== 1 || !window.getComputedStyle) return;
        var pos = window.getComputedStyle(fitEl).position;
        if (pos !== 'static' && pos !== 'relative') return;
        for (var i = 0; i < p.children.length; i++) {
            var ch = p.children[i];
            if (ch === fitEl) continue;
            var cs = window.getComputedStyle(ch);
            if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') continue;
            return;   // something else lives in this box — moving the canvas would move it too
        }
        var pad = Math.max(0, Math.floor((v.h - h) / 2));
        st.marginTop = pad + 'px';
        st.marginBottom = pad + 'px';
    }

    // Has the build written over the size we set? Compared against what WE wrote, not
    // against `fitNat` — our own value coming back unchanged is not news.
    //
    // This is what stops the fit from fighting a build that sizes its own canvas. An
    // engine re-lays-out on every resize and writes the CSS box and the backing store
    // together, so the two agree; on a phone that happens whenever the address bar
    // moves. Re-imposing the ratio we measured on an earlier frame over a backing
    // store that has since changed shape does not scale the picture, it STRETCHES it —
    // a portrait game drawn squashed into a strip across the top, which is what iOS
    // Safari produced on a shared CDN link. So when the build has had its say, its
    // current box is the truth and ours is stale: measure again.
    function fitMoved(el) {
        if (!fitWrote) return false;
        var r = el.getBoundingClientRect();
        return Math.abs(r.width - fitWrote.w) > 1 || Math.abs(r.height - fitWrote.h) > 1;
    }

    // One line per adjustment (the page box and the canvas are two different pieces of
    // news to an author), and the template hint once underneath them.
    function fitTell(what) {
        if (fitSaid[what]) return;
        fitSaid[what] = true;
        warn('this build lays out bigger than the frame it was given, so the portal ' + what +
             '. It plays fine here, but it will overflow every other frame it is embedded in.');
        if (logging && !fitHinted) {
            fitHinted = true;
            console.log('%cJAM%c %cin your template:%c html,body{margin:0;padding:0;height:100%;overflow:hidden}' +
                ' · canvas{display:block;width:100%;height:100%} %c(Unity: leave matchWebGLToCanvasSize on).' +
                ' Turn this adjustment off with ?_jam_fit=0 or Jam.setFit(false).%c',
                S_BADGE, S_RESET, S_NAME, S_RESET, S_DIM, S_RESET);
        }
    }

    function fitOnce() {
        if (!fitOn || !document.body) return;
        // Giving up is not permanent if the BUILD moves. A canvas re-sized under us is
        // new information, and the box we left behind is the one that no longer fits;
        // staying out of the way would freeze a stretched picture on screen forever.
        if (fitGaveUp) {
            if (!fitEl || !document.contains(fitEl) || !fitMoved(fitEl)) return;
            fitGaveUp = false;
            fitNat = null;
            fitWrote = null;
        }
        var o = fitOverflow();
        if (!o.w || !o.h) return;   // frame not laid out yet — nothing to fit into

        var canvas = (fitEl && document.contains(fitEl)) ? fitEl : findCanvas();
        // The engine may have re-set its own canvas style since our last write — then
        // what we measured is stale and re-applying it would stretch the picture (see
        // fitMoved). Forget it and let the capture below take the build's own idea.
        if (fitNat && canvas === fitEl && fitMoved(canvas)) { fitNat = null; fitWrote = null; }
        // Re-apply first: the frame may have changed size (full window, fullscreen, a
        // rotated simulator) without the build noticing.
        if (fitNat && canvas === fitEl) { fitScale(o); o = fitOverflow(); }
        if (!fitOver(o)) return;

        if (!canvas && Math.max(o.x, o.y) > FIT_SLIVER) return;

        if (!fitPage) {
            fitPage = true;
            fitRelax(document.documentElement);
            fitRelax(document.body);
            fitTell('dropped the page margins and its scrollbars');
            o = fitOverflow();
            if (!fitOver(o)) return;
        }
        if (!canvas) return;

        if (!fitNat) {
            var r = canvas.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return;   // not sized yet — a later try gets it
            fitEl = canvas;
            fitNat = { w: r.width, h: r.height };
            fitScale(o);
            fitTell('scaled the game down to fit, keeping its proportions');
            o = fitOverflow();
            if (!fitOver(o)) return;
        }

        // A wrapper sized in pixels (Unity's #unity-container) keeps the document
        // wide even once the canvas fits. Clamp what is left of the chain, once.
        for (var el = canvas.parentNode; el && el.nodeType === 1 && el !== document.body; el = el.parentNode) {
            el.style.maxWidth = o.w + 'px';
            el.style.maxHeight = o.h + 'px';
            el.style.overflow = 'hidden';
        }
        o = fitOverflow();
        if (fitOver(o)) {
            // Out of safe moves: anything further would be guessing at the build's own
            // layout. Say so plainly and stop re-measuring on every resize.
            fitGaveUp = true;
            warn('could not fit this build into its frame — it still overflows by ' +
                 Math.max(0, o.x) + '×' + Math.max(0, o.y) + 'px. Size the game from its ' +
                 'container (100%), not from a fixed pixel size.');
        }
    }

    function fitTick() { try { fitOnce(); } catch (e) { /* never break a build over layout */ } }

    function fitSoon() {
        if (fitTimer) clearTimeout(fitTimer);
        fitTimer = setTimeout(function () { fitTimer = null; fitTick(); }, 120);
    }

    function fitStart() {
        if (!fitOn) return;
        for (var i = 0; i < FIT_TRIES.length; i++) setTimeout(fitTick, FIT_TRIES[i]);
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fitTick);
        window.addEventListener('load', fitTick);
        window.addEventListener('resize', fitSoon);
        window.addEventListener('orientationchange', fitSoon);
        // iOS moves the visual viewport (the address bar, the keyboard) without always
        // firing `resize` on the window — and a build that listens to visualViewport
        // will have re-laid itself out by then. Follow it, or our box is left stale.
        if (window.visualViewport && window.visualViewport.addEventListener) {
            window.visualViewport.addEventListener('resize', fitSoon);
        }
    }

    // ===== reporting a play from a page the portal does not host ==========
    //
    // What the portal's player does around a hosted build, done here for a page
    // that has no player around it: open a session, time the attention, carry the
    // game's events, close the session on the way out. One endpoint takes all of
    // it (`POST /api/ext/play`), and api/app/ext_play.py carries the reasoning —
    // why it is authenticated, why the project has to claim this page's host, and
    // why the request must stay a "simple" one (no headers of ours, a text/plain
    // body), which is the single most breakable thing in this section.
    //
    // The numbers mirror web/src/components/play.jsx deliberately: the same tick,
    // the same 20 s of PLAYED time between beats, the same "a gap this big means
    // the tab was throttled, don't credit it". A play recorded here and a play
    // recorded in the portal have to mean the same thing, or the two cannot be
    // read on one chart — which they are.
    var EXT_TICK_MS = 1000;
    var EXT_HEARTBEAT_MS = 20000;   // of played time, not of wall time
    var EXT_MAX_TICK_MS = EXT_TICK_MS * 3;
    var EXT_FLUSH_AT = 20;          // events waiting → beat early
    var EXT_QUEUE_MAX = 120;        // the server stores 300 per session, 50 per call
    var EXT_MISS_MAX = 3;           // consecutive unreachable beats before we stop

    var extSession = '';
    var extActive = 0;
    var extSentMs = -1;
    var extLastTick = 0;
    var extQueue = [];
    var extLive = false;    // the portal has accepted a beat
    var extMisses = 0;
    var extDead = '';       // a refusal that will not get better — stop beating

    function extNewSession() {
        // 32 lowercase hex characters: the portal's session ids are uuid4().hex
        // and the endpoint validates that shape.
        var out = '';
        try {
            var buf = new Uint8Array(16);
            (window.crypto || window.msCrypto).getRandomValues(buf);
            for (var i = 0; i < buf.length; i++) out += (buf[i] + 0x100).toString(16).slice(1);
            return out;
        } catch (e) { /* no crypto in this context — the fallback below is fine */ }
        out = '';
        for (var j = 0; j < 32; j++) out += Math.floor(Math.random() * 16).toString(16);
        return out;
    }

    function extRecord(ev) {
        if (!extOn || extDead) return;
        // A runaway game loop must not grow this array without bound. The server
        // caps the session too; this only keeps the page's own memory honest.
        if (extQueue.length >= EXT_QUEUE_MAX) return;
        extQueue.push(ev);
    }

    function extPost(payload, final) {
        var url = EXT.api + '/api/ext/play';
        var text = JSON.stringify(payload);
        // NO headers, and a string body — which the browser sends as text/plain,
        // a CORS-safelisted content type. That is what keeps this a SIMPLE
        // request with no preflight in front of it. Adding
        // `headers: {'Content-Type': 'application/json'}` here would be correct,
        // tidy, and would silently stop every report on the production
        // deployment: the preflight carries no cookies, so the corporate login
        // answers it instead of the portal.
        if (final && window.navigator && navigator.sendBeacon) {
            try {
                navigator.sendBeacon(url, new Blob([text], { type: 'text/plain;charset=UTF-8' }));
                return;
            } catch (e) { /* fall through to fetch */ }
        }
        try {
            window.fetch(url, {
                method: 'POST',
                credentials: 'include',   // same-site, so the portal's `lax` cookie rides along
                body: text,
                keepalive: !!final,
            }).then(extAnswered, extUnreachable);
        } catch (e) { extUnreachable(e); }
    }

    function extAnswered(res) {
        if (!res) return;
        if (res.ok) {
            extMisses = 0;
            if (!extLive) {
                extLive = true;
                trace('reporting', [], 'this play is being recorded by the portal');
            }
            return;
        }
        // A refusal names itself, and every one of them is something only the
        // author can fix — so it is said once, in words, and then we stop.
        res.json().then(
            function (j) { extRefused(res.status, (j && j.error) || ''); },
            function () { extRefused(res.status, ''); },
        );
    }

    function extRefused(status, code) {
        if (extDead) return;
        extDead = code || ('http_' + status);
        var says = {
            not_signed_in:
                'this browser has no portal session, so the play cannot be attributed to anybody. Open ' +
                EXT.api + ' once, sign in, and reload this page.',
            origin_not_claimed:
                'the portal has no build link for this page\'s host on project ' + EXT.project + '. Add this ' +
                'game\'s URL to the project\'s builds in the portal editor — that link is what says "this ' +
                'game lives there", and it is what lets this page report.',
            no_such_project:
                'data-jam-project names a project the portal does not know (' + EXT.project + ').',
            body_too_large: 'the report was too large — this is an SDK bug, please report it.',
        };
        warn('nothing is being recorded — ' + (says[extDead] || ('the portal answered ' + status + '.')));
    }

    function extUnreachable() {
        if (extDead) return;
        extMisses++;
        if (extMisses < EXT_MISS_MAX) return;   // a blip is not a verdict
        extDead = 'unreachable';
        warn('nothing is being recorded — the portal at ' + EXT.api + ' did not answer this page. The likeliest ' +
             'reason is that this browser has no portal session: where the company login sits in front of the ' +
             'portal it answers a request without one with a redirect we cannot follow, so "not signed in" ' +
             'looks exactly like this. Open ' + EXT.api + ' once, sign in, and reload. Otherwise: check that ' +
             'this really is the portal (it defaults to wherever jam-sdk.js was loaded from, and a page loading ' +
             'the CDN copy has to name the portal itself with data-jam-api), that the portal allows this origin ' +
             'to report, and that you are on the corporate network — off it nothing is ever counted.');
    }

    function extBeat(final) {
        if (!extOn || extDead) return;
        extSentMs = extActive;
        var payload = {
            projectId: EXT.project,
            sessionId: extSession,
            activeMs: Math.round(extActive),
            ended: !!final,
        };
        // Events ride the beat instead of a request of their own. The portal
        // refuses events for a session it has not seen yet, and sending both in
        // one call means the very first beat can already carry an event — no
        // ordering to get wrong, and one fewer request to lose on a closing tab.
        if (extQueue.length) payload.events = extQueue.splice(0, 50);
        extPost(payload, final);
    }

    // Attention, not wall time: a tab in the background or behind another window
    // is not somebody playing. There is deliberately no ad pause here — outside
    // the portal an ad is the game's own, and the SDK is not told about it.
    function extEngaged() {
        try {
            return document.visibilityState === 'visible' && document.hasFocus();
        } catch (e) { return true; }
    }

    function extTick() {
        if (!extOn || extDead) return;
        var now = Date.now();
        var dt = now - extLastTick;
        extLastTick = now;
        if (extEngaged() && dt <= EXT_MAX_TICK_MS) extActive += dt;
        if (extActive - extSentMs >= EXT_HEARTBEAT_MS) { extBeat(false); return; }
        if (extQueue.length >= EXT_FLUSH_AT) extBeat(false);
    }

    function extStart() {
        if (!extOn) return;
        extSession = extNewSession();
        extLastTick = Date.now();
        extBeat(false);   // the play is minted by the beat that opens the session
        window.setInterval(extTick, EXT_TICK_MS);
        document.addEventListener('visibilitychange', function () {
            extTick();
            // Going to another tab may be the last thing we ever see.
            if (document.visibilityState === 'hidden') extBeat(false);
        });
        window.addEventListener('pagehide', function () { extTick(); extBeat(true); });
    }

    // Local device feedback, independent of ads/events and Jam.available. The game
    // owns its on/off setting. Resolve bridges on each call: shells can install late.
    // Keep the browser pattern bounded; the host validates again across postMessage.
    function haptics(pattern) {
        try {
            var phases = Array.isArray(pattern) ? pattern.slice() : [pattern];
            if (!phases.length || phases.length > 100) return;
            var total = 0;
            var active = 0;
            for (var i = 0; i < phases.length; i++) {
                var n = phases[i];
                if (typeof n !== 'number' || !isFinite(n) || n < 0 || n > 1000) return;
                phases[i] = Math.floor(n);
                total += phases[i];
                if (i % 2 === 0) active += phases[i];
            }
            if (total > 10000) return;
            var value = Array.isArray(pattern) ? phases : phases[0];
            var style = active <= 8 ? 'LIGHT' : active <= 30 ? 'MEDIUM' : 'HEAVY';
            var nat = window.HapticsNative;
            if (nat && typeof nat.impact === 'function') {
                if (!active) return; // zero cancels browser vibration, never a native hit
                if (Array.isArray(value) && typeof nat.pattern === 'function') nat.pattern(JSON.stringify(value));
                else nat.impact(style);
                return;
            }
            var cap = window.Capacitor;
            if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() &&
                cap.Plugins && cap.Plugins.Haptics) {
                if (!active) return;
                // Capacitor does not schedule phases: one impact, like jam-august.
                var pending = cap.Plugins.Haptics.impact({ style: style });
                if (pending && typeof pending.catch === 'function') pending.catch(function () {});
                return;
            }
            // Chrome blocks vibration in a cross-origin frame. The portal player
            // performs it in its own document, after the normal origin/source checks.
            if (host) { post('haptics', { pattern: value }); return; }
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(value);
        } catch (e) { /* optional device feedback must never interrupt the game */ }
    }

    function hapticTick() { haptics(8); }

    window.Jam = {
        available: available,
        getUserId: getUserId,
        isRewardMode: isRewardMode,
        getGameId: getGameId,
        levelComplete: levelComplete,
        logEvent: logEvent,
        // The loading splash (see the section above). Optional and jam-specific — a
        // game must guard both calls (`Jam.gameReady && Jam.gameReady()`) for an APK
        // build, where an older jam-compat.js does not define them.
        gameLoading: gameLoading,
        gameReady: gameReady,
        showRewarded: showRewarded,
        showInterstitial: showInterstitial,
        // Ask before spending a reward on a refusal (AdsManager's names in the lab).
        // One player, one cap, so both formats answer the same thing here.
        isRewardedReady: adReady,
        isInterstitialReady: adReady,
        // Draw the ad yourself instead of getting the simulator's card. The portal
        // still runs the show (see setAdUI). In an APK the ad is a real network's, so
        // rnd-lab's jam-compat.js implements this as a no-op.
        setAdUI: setAdUI,
        // Only meaningful after setAdUI('game'): tell the portal the player already
        // clicked through your own ad screen, ending the show now instead of at
        // durationMs. Optional and jam-specific — a game must guard the call
        // (`sdk.reportOwnAdTap && sdk.reportOwnAdTap()`) for an APK build, where
        // jam-compat.js does not define it.
        reportOwnAdTap: reportOwnAdTap,
        // Leaderboards — Yandex Games method names, portal-backed. NOT gated on
        // `available` (see leaderboardsAvailable).
        leaderboardsAvailable: leaderboardsAvailable,
        setLeaderboardScore: setLeaderboardScore,
        getLeaderboardEntries: getLeaderboardEntries,
        getLeaderboardEntry: getLeaderboardEntry,
        getLeaderboardDescription: getLeaderboardDescription,
        toast: toast,
        requestReview: requestReview,
        haptics: haptics,
        hapticTick: hapticTick,
        taskCompletedToast: hubNoop('taskCompletedToast'),
        showCycleWidget: hubNoop('showCycleWidget'),
        hideCycleWidget: hubNoop('hideCycleWidget'),
        setCycleProvider: hubNoop('setCycleProvider'),
        onCycleUpdate: hubNoopUnsub('onCycleUpdate'),
        refreshCycle: hubNoop('refreshCycle'),
        // Devtools helpers — not part of the portable contract, so a game must not
        // depend on them (they are absent in an APK build).
        stats: stats,
        setLogging: function (on) { logging = !!on; return logging; },
        // Viewport fit (see the section above). Turning it off does not undo an
        // adjustment already applied — reload with ?_jam_fit=0 for that.
        setFit: function (on) {
            fitOn = !!on;
            if (fitOn) { fitGaveUp = false; fitSoon(); }
            return fitOn;
        },
    };
    window.jam = window.Jam;  // authors will typo it

    hello();
    banner();
    fitStart();
    extStart();
})();
