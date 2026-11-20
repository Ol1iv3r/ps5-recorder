# YouTube Upload Facts (2026) — for a local macOS tool uploading OBS recordings via Data API v3

Researched: 2026-11-20. All official docs below were fetched live on that date; the YouTube Data API reference/guides pages show "Last updated 2026-11-12 UTC". Time references are to Pacific Time (Google quota reset) unless noted.

## TL;DR

| Question | Short answer |
|---|---|
| HEVC/H.265 upload | **Supported** — `HEVC (H.265)` is in YouTube's official supported-formats list. **MKV is NOT on the list** (not officially supported). Accepted containers include .MP4, .MOV, .WebM, .AVI, etc. |
| `videos.insert` quota | **No longer 1600 units.** As of 2026 it costs **1 unit** in its own "Video Uploads" bucket with a **default limit of 100 calls/day**. The legacy 10,000-units/day bucket still applies to all *other* endpoints. |
| Desktop OAuth redirect | `http://127.0.0.1:<random port>` is the documented method for "Desktop app" clients; no redirect URI needs to be pre-registered. `http://localhost` also works but Google warns about firewalls. |
| Unverified app risk | **Testing** status ⇒ refresh token expires in **7 days**. **In production but unverified** ⇒ no 7-day expiry, but "unverified app" warning screen + 100-new-user lifetime cap. **Nov 2, 2026: unverified API projects are no longer forced to upload as private.** A newer **"Personal mode"** avoids verification *and* the 7-day expiry for a single account. |
| `youtube.upload` scope | **Enough** for `videos.insert` with title/description/tags/privacy. **Not enough** for playlist inserts (`playlistItems.insert` needs `youtube`/`youtube.force-ssl`). Current docs list `youtube.upload` as acceptable for `thumbnails.set`. |

---

## 1. HEVC / H.265 and containers (MKV?)

**Official list of accepted upload formats** — ["Supported YouTube file formats"](https://support.google.com/youtube/troubleshooter/2888402?hl=en) lists exactly:

> .MOV, .MPEG-1, .MPEG-2, .MPEG4, .MP4, .MPG, .AVI, .WMV, .MPEGPS, .FLV, 3GPP, WebM, DNxHR, ProRes, CineForm, **HEVC (H.265)**
> "…make sure that you're using one of the following formats" (audio-only files such as MP3/WAV/PCM cannot be uploaded to create a video).

- **HEVC/H.265: accepted.** It appears as its own entry in the accepted-format list, and `.MP4` is an accepted container. The HEVC-in-MP4 *pairing* is not stated verbatim on that page (the list treats HEVC as a format token), but MP4 is a listed container and HEVC a listed codec, so HEVC in MP4 is the supported combination. *(Marked: HEVC accepted = verified; "HEVC specifically inside MP4" = verified by implication, not a standalone sentence.)*
- **MKV / Matroska: NOT accepted officially.** It is absent from the list above; the page's remedy for an "invalid file format" error is to convert to one of the listed formats. Practical implication for the tool: **remux `.mkv` → `.mp4` with `ffmpeg -c copy`** (fast, lossless) before upload rather than re-encoding. *(Marked: not verified whether MKV occasionally slips through the uploader — YouTube does not document MKV support, so treat it as unsupported.)*
- Codecs/containers YouTube *recommends* for best quality are narrower than what it *accepts*: ["YouTube recommended upload encoding settings"](https://support.google.com/youtube/answer/1722171?hl=en) recommends **Container: MP4**, **Video codec: H.264**, audio AAC-LC/Opus/Eclipsa, moov atom at front (Fast Start), no edit lists. So HEVC uploads work but H.264-in-MP4 is the safest/highest-compatibility choice. OBS's default "MP4 / H.264" (or "Hybrid MP4") recording profile is exactly this.
- Partner/Content-Manager-only formatting guidance (MPEG-2 program stream, ProRes, DNxHR, etc.) lives on a separate page and does **not** apply to a normal channel: ["Video and audio formatting specifications"](https://support.google.com/youtube/answer/4603579?hl=en).

## 2. `videos.insert` — endpoint, parts, resumable flow, quota

Reference: [`videos.insert`](https://developers.google.com/youtube/v3/docs/videos/insert) · [Resumable Uploads guide](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol)

### 2.1 Endpoint and constraints

- Method: `POST https://www.googleapis.com/upload/youtube/v3/videos`
- Resumable session start: `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=<PARTS>`
- Max file size: **256 GB**
- Accepted media MIME types: **`video/*`** or **`application/octet-stream`**
- "Uploads a video to YouTube and optionally sets the video's metadata."

### 2.2 `part` parameter

`part` is **required**. Its two jobs: identify properties the write sets, and properties the response returns. Documented part names: `brandPartner, contentDetails, fileDetails, id, liveStreamingDetails, localizations, paidProductPlacementDetails, player, processingDetails, recordingDetails, snippet, statistics, status, suggestions, topicDetails`.

- For a normal upload only a subset is *settable* (per the reference "Request body" section): `snippet.title`, `snippet.description`, `snippet.tags[]`, `snippet.categoryId`, `snippet.defaultLanguage`, `localizations.*`, `status.embeddable`, `status.license`, `status.privacyStatus`, `status.publicStatsViewable`, `status.publishAt`, `status.selfDeclaredMadeForKids`, `status.containsSyntheticMedia`, `recordingDetails.recordingDate`, `paidProductPlacementDetails.hasPaidProductPlacement`.
- Practical minimum: **`part=snippet,status`**. `snippet.title` is the field the docs effectively require (title is mandatory for a video); `snippet.categoryId` is not marked "required" in the reference but is expected in practice — set it (e.g. `20` Gaming) to be safe. *(Marked: categoryId mandatory-in-practice is not stated in the 2026 docs.)*
- Note: **`contentDetails` cannot be set on insert** — the API computes it (and returns it if requested).

### 2.3 Resumable upload flow (exact, from the 2026 guide)

**Step 1 — start session**
```
POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
Authorization: Bearer <ACCESS_TOKEN>
Content-Length: <len(json)>
Content-Type: application/json; charset=UTF-8
X-Upload-Content-Length: <total file bytes>
X-Upload-Content-Type: video/*        (or application/octet-stream)

{ "snippet": {...}, "status": {...} }
```
- The JSON body is the `video` resource (metadata). Header names are documented as `X-Upload-Content-Length` and `x-upload-content-type` (HTTP headers are case-insensitive).
- `Content-Length` may be omitted with chunked transfer encoding.

**Step 2 — save the session URI**
- Success response is **`HTTP 200 OK`** with a **`Location`** header containing the resumable session URI, e.g.
  `Location: https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=<id>&part=snippet,status`
- The session URI has a finite lifetime; start uploading promptly.

**Step 3 — upload the bytes** (`PUT` to the `Location` URI)
```
PUT <upload_url>
Authorization: Bearer <ACCESS_TOKEN>
Content-Length: <bytes in this request>
Content-Type: video/*               (same value as X-Upload-Content-Type)
Content-Range: bytes <first>-<last>/<total>   (see below)
<binary body>
```
- A single `PUT` of the whole remaining file needs no `Content-Range`; **chunked** uploads do (see 2.4).

**Step 4 — responses**
- **`201 Created`** + body = the new `video` resource → upload complete.
- **`308 Resume Incomplete`** `Content-Length: 0` with `Range: bytes=0-999999` → partial; the `Range` header says how many bytes landed (0-based; header absent if nothing yet). If a `Retry-After` header is present, honor it.
- **Resume**: `PUT` the remaining bytes with `Content-Range: bytes FIRST_BYTE-LAST_BYTE/TOTAL_CONTENT_LENGTH` and `Content-Length` = remaining bytes. First byte must be exactly `last_byte_in_Range + 1` — overlapping or skipping bytes makes the whole request upload nothing.
- **Status probe**: empty `PUT` with `Content-Length: 0` and `Content-Range: bytes */<TOTAL_CONTENT_LENGTH>`; returns the same terminal response, or `308` with `Range`.
- **Permanent failure**: `4xx`, or `5xx` other than 500/502/503/504. Retry 500/502/503/504 with exponential backoff.
- **`404 Not Found`** = expired/invalid session URI → start a brand-new resumable session from step 1.
- Note the response codes: the **metadata POST returns 200**, the **completed PUT returns 201**; a completed-but-queried upload returns the original terminal response. (`200` is not the success code for the file PUT.)

### 2.4 Chunking (optional, and now discouraged)

The 2026 guide explicitly says chunked upload is "rarely necessary and is actually discouraged because it requires additional requests, which have performance implications" — use it only to render a progress bar on an unstable link. Rules if used:
- chunk size must be a **multiple of 256 KB** (last chunk exempt),
- same chunk size for every chunk except the last,
- `Content-Range: bytes 0-524287/2000000` etc.,
- each non-final chunk returns `308` with `Range`; final returns `201`.

### 2.5 Quota — it is **no longer 1600 units per upload**

From the current [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost?hl=en) (last updated 2026-11-12):

> "Projects that enable the YouTube Data API have a default quota allocation of **100 `search.list` calls, 100 `videos.insert` calls, and 10,000 units per day combined for all other endpoints**."
> "The `search.list` and `videos.insert` methods have their own quota buckets. Each of these methods has a **default daily limit of 100 per day. The quota cost is 1 per call.**"
> "Daily quotas reset at midnight Pacific Time (PT)."

And from the [`videos.insert`](https://developers.google.com/youtube/v3/docs/videos/insert) reference itself:

> "**Quota impact: 100 calls per day. A call to this method has a quota cost of 1 unit in the Video Uploads quota bucket.**"

History, from the [Revision History](https://developers.google.com/youtube/v3/revision_history?hl=en):
- **December 4, 2025** — "quota cost of a video upload from approximately 1600 units to approximately 100 units."
- **June 1, 2026** — "transitioning to a granular quota system … starting with `videos.insert` and `search.list`. API calls to the `videos.insert` and `search.list` methods will be charged to their own respective quota buckets."

**So for the tool:** independent of file size, an upload consumes **1 unit from the "Video Uploads" bucket**, max **100 `videos.insert` calls/day by default per Cloud project** (quota is attached to the project/client, not to the channel). The classic "10,000 units/day" still governs everything else — e.g. `playlistItems.insert` **50**, `thumbnails.set` **50**, `videos.list` **1**, `videos.update` **50**. A very large upload does **not** cost more quota (bandwidth/latency is the real cost).

## 3. OAuth for a Desktop app client

Primary source: [OAuth 2.0 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app?hl=en) (this page is also served as the YouTube "installed apps" guide).

### 3.1 Client type and redirect URI

Create an OAuth client of type **Desktop app**. Per [Manage OAuth Clients](https://support.google.com/cloud/answer/15549257?hl=en):

> "**Desktop apps** — The console does not require any additional information to create OAuth 2.0 credentials for desktop applications."

There is no redirect-URI field for desktop clients, i.e. **nothing to pre-register**. The desktop flow doc says the loopback value is:

> `http://127.0.0.1:<port>` or `http://[::1]:<port>` — "Query your platform for the relevant loopback IP address and **start an HTTP listener on a random available port**. Substitute `port` with the actual port number your app listens on."

- **Random port works without pre-registration.** This is the documented mechanism (Desktop clients have no redirect-URI configuration), which is why the Google client libraries pick an ephemeral port at runtime. *(Marked: verified by the docs' instructions + console behaviour; Google does not print a single verbatim "any port is accepted without registration" sentence.)*
- **`127.0.0.1` vs `localhost` matters somewhat:** both are accepted loopback values, but the docs say "It is also possible to use `localhost` in place of the loopback IP, but this configuration may cause issues with client firewalls. Most, but not all, firewalls allow loopback communication." → **prefer `http://127.0.0.1:<port>`**.
- The loopback flow is **not deprecated for desktop clients**: ["Loopback IP Address flow Migration Guide"](https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration?hl=en) — "The loopback IP address flow will be deprecated for native iOS, Android, and Chrome OAuth client types **but will continue to be supported on desktop apps**."
- The `redirect_uri` sent to the token endpoint must be the same loopback URI that was used in the authorization request (the port included). Desktop client secrets are not confidential ("Desktop apps are public clients").

### 3.2 Authorization request

`GET https://accounts.google.com/o/oauth2/v2/auth` (HTTPS only; it refuses plain HTTP), with query params:

| param | value/notes |
|---|---|
| `client_id` | Desktop client ID |
| `redirect_uri` | `http://127.0.0.1:<port>` (listener already running) |
| `response_type` | `code` |
| `scope` | space-delimited (see 3.5) |
| `code_challenge` | PKCE challenge |
| `code_challenge_method` | `S256` (recommended; `plain` allowed) or the verifier itself |
| `state` | recommended anti-CSRF value |
| `access_type` | `offline` to receive a refresh token (documented in the [web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server?hl=en); the desktop page also refers to "offline access type") |
| `prompt` | `consent` forces re-issue of a refresh token (useful after a 7-day expiry / scope change) |
| `login_hint` | optional |

The local listener receives `?code=…&state=…` (error: `error=access_denied`, etc.).

### 3.3 Token endpoint

`POST https://oauth2.googleapis.com/token`, `Content-Type: application/x-www-form-urlencoded`, fields:

- code exchange: `client_id`, `client_secret` (marked **Optional** on the desktop page — it is not confidential), `code`, `code_verifier`, `grant_type=authorization_code`, `redirect_uri`
- refresh: `client_id`, `client_secret`, `refresh_token`, `grant_type=refresh_token`
- Revocation if needed: `POST https://oauth2.googleapis.com/revoke?token=<token>` (per [YouTube implementation guide](https://developers.google.com/youtube/v3/guides/authentication?hl=en)).

### 3.4 PKCE in 2025/2026

- Official position (desktop page): "**Desktop apps are public clients and cannot keep secrets confidential. Always use PKCE (Proof Key for Code Exchange) when requesting authorization codes.**" A `code_verifier` is 43–128 chars of `[A-Za-z0-9-._~]`; challenge = `BASE64URL(SHA256(verifier))` for `S256`.
- The parameter table labels `code_challenge` / `code_challenge_method` as "**Recommended**" (not "Required"), and the `invalid_grant` error doc says a missing/invalid `code_challenge` is a failure cause. Net: **treat PKCE as required by policy/documentation; it is not documented as a hard server-side enforcement switch** — always send it. *(Marked: enforcement not verifiable from docs.)*
- New in the current docs: **DPoP is supported and recommended but optional** for desktop clients ("While the use of DPoP is optional, it is recommended for increased security"; tokens get DPoP-bound only if you send a `DPoP` proof header). Not needed for a personal tool.

### 3.5 Scopes needed

From [YouTube Data API – Authentication](https://developers.google.com/youtube/v3/guides/authentication?hl=en):

| scope | description |
|---|---|
| `https://www.googleapis.com/auth/youtube.upload` | "Manage your YouTube videos." |
| `https://www.googleapis.com/auth/youtube` | "Manage your YouTube account." |
| `https://www.googleapis.com/auth/youtube.force-ssl` | "See, edit, and permanently delete your YouTube videos, ratings, comments, and captions." |
| `https://www.googleapis.com/auth/youtube.readonly` | "View your YouTube account." |

- **Upload + metadata:** `youtube.upload` is listed as an accepted scope for `videos.insert` (also `youtube`, `youtubepartner`, `youtube.force-ssl`).
- **Playlist add:** `playlistItems.insert` accepts **`youtube`, `youtube.force-ssl`, `youtubepartner`** — **`youtube.upload` is NOT accepted**.
- **Thumbnail:** `thumbnails.set` accepts **`youtube.upload`, `youtube`, `youtube.force-ssl`, `youtubepartner`** (as of the current 2026 reference — this is broader than older docs that excluded `youtube.upload`).
- Single-consent recommendation: request **`youtube.upload https://www.googleapis.com/auth/youtube`** (two sensitive scopes) or just `youtube` alone (it covers insert too). Adding a playlist/thumbnail later with only `youtube.upload` would otherwise force a re-auth with new scopes (note: **incremental authorization is not supported for installed apps** — "Incremental authorization is not supported for installed apps or devices", so a scope change means re-consent).

## 4. Unverified OAuth app consequences (the big practical risk)

### 4.1 While in "Testing" (external user type)

Canonical statement, [Using OAuth 2.0 to Access Google APIs → Refresh token expiration](https://developers.google.com/identity/protocols/oauth2?hl=en):

> "A Google Cloud Platform project with an OAuth consent screen configured for an external user type and a publishing status of **"Testing" is issued a refresh token expiring in 7 days**, unless the only OAuth scopes requested are a subset of `name`, `email address`, and user profile (`userinfo.email`, `userinfo.profile`, `openid`…)."

Confirmed again in [Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en):

> "Projects configured with a publishing status of Testing are limited to up to **100 test users** … Authorizations by a test user will **expire seven days from the time of consent**. If your OAuth client requests an `offline` access type and receives a refresh token, **that token will also expire**."

- `youtube.upload` is a **sensitive** scope, so the 7-day rule applies (the name/email exception never applies here).
- Practical effect: a headless/local uploader will start getting `invalid_grant` on roughly day 7 and needs the user to re-run consent. Mitigations: refresh promptly and often (does not extend the 7 days), or move the app out of Testing.
- Test users must be explicitly listed; the "unverified app" warning appears during consent for sensitive scopes.

### 4.2 In production but still unverified

Per the same [Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en) page:

> "Projects configured with a publishing status of **In production** are available to any user with a Google Account… Your project's configuration may be subject to verification before its name and logo are displayed on an authorization screen or before it may request authorization of sensitive or restricted scopes. … Google will display an **Unverified apps warning message** if your project's OAuth clients request authorization of scopes considered sensitive or restricted before your project has completed verification."
> User cap table: "Apps that present the unverified app screen → **100 new users in total**, after the app presents the unverified app screen" (a lifetime cap that "cannot be reset or changed").

So, moving to Production **while unverified**:
- ✅ **The 7-day refresh-token expiry goes away** (it is tied to Testing status; production refresh tokens then live under the normal rules — unused for 6 months, user revoked, etc.).
- ⚠️ Every authorization shows the **"Google hasn't verified this app"** interstitial; the user must click *Advanced → Go to … (unsafe)*. Fine for you, a bad experience for anyone else.
- ⚠️ **100-new-user lifetime cap** and continued warnings until verification completes.
- No evidence in the current docs that unverified production apps lose refresh tokens after 7 days; the 7-day rule is explicitly attached to Testing. *(Marked: the absence of the 7-day rule for production-unverified is inferred from the docs' wording.)*

### 4.3 Are uploads from unverified projects restricted?

**No longer — this changed on November 2, 2026.** [Revision History](https://developers.google.com/youtube/v3/revision_history?hl=en):

> "**November 2, 2026** — Videos uploaded through the `videos.insert` method from unverified API projects are **no longer restricted to private viewing mode**. This change **reverses the policy announced on July 28, 2020**, which restricted videos uploaded from unverified API projects created after that date to private viewing mode until the project completed an audit."
> "If you don't specify a value for the `status.privacyStatus` property in a `videos.insert` request, the uploaded video's privacy status defaults to **public**."

The same sentence now appears in the live [`videos.insert`](https://developers.google.com/youtube/v3/docs/videos/insert) reference (`status.privacyStatus`): "Videos uploaded from unverified API projects are not restricted to private viewing mode."

Also note what the **audit** is for now — [Quota and Compliance Audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits?hl=en): an audit is required only to get **more quota than the default allocation** ("If you would like to request additional quota beyond the default allocation, you must first complete an audit…"). The 2020-era "audit to unlock uploads/un-private them" requirement is gone. **Uploads are not blocked for unverified projects.**

*(Caveat, unverified: the 2026 docs say nothing about an *unverified project's* uploads being throttled by a separate channel-level daily upload limit; the API can still return `uploadLimitExceeded` for channel-side limits. Do not rely on that being zero.)*

### 4.4 The cleanest 2026 answer for a personal tool: "Personal mode"

Newer Google Auth Platform option, [Manage App Audience → Personal Mode](https://support.google.com/cloud/answer/15549945?hl=en) and [Quick setup for personal use](https://support.google.com/cloud/answer/15544987?hl=en):

> "Personal mode apps **do not require OAuth app verification**, are **not subject to the OAuth user cap or 7-day test user token expiration**, and **do not display the unverified app screen**."
> Limitations: "Only the Google Account that created the Personal mode application can sign in or authorize scopes for its OAuth clients. Other Google Accounts, even if added as Owners or Editors … cannot authorize the app." And: "Personal mode is a **one-time selection**… once a project's user type is set to Personal, it cannot be changed to External or Internal, and existing External or Internal projects cannot be switched to Personal."

For a single-user macOS uploader this is the best fit: create the project on the **Personal mode onboarding page**, pick **Desktop app**, add `youtube.upload` (+ `youtube` if playlists are needed). If you want others to use the tool, create a separate project in External mode and accept Testing/verification trade-offs. *(Marked: Personal mode is documented in the current help centre but is recent; don't assume it exists in older orgs/projects — and it cannot be applied to an existing External project.)*

## 5. Is `youtube.upload` alone enough?

**Yes for upload + title/description/tags/privacy, no for playlists.** Evidence: the scope lists in the method references.

- `videos.insert` accepted scopes: `youtube.upload`, `youtube`, `youtubepartner`, `youtube.force-ssl` → `youtube.upload` is enough for insert **and** for setting `snippet.title`, `snippet.description`, `snippet.tags[]`, `snippet.categoryId`, `status.privacyStatus`, `status.publishAt`, `status.selfDeclaredMadeForKids`, `status.containsSyntheticMedia`, `recordingDetails.recordingDate`.
- `playlistItems.insert` accepted scopes: `youtubepartner`, `youtube`, `youtube.force-ssl` → **`youtube.upload` cannot add to a playlist.**
- `thumbnails.set` accepted scopes: `youtubepartner`, **`youtube.upload`**, `youtube`, `youtube.force-ssl` → per the current reference, `youtube.upload` **is** enough to set a thumbnail (this is broader than older versions of the doc; verify in the console if it matters — *(marked: surprising relative to historical docs, so double-check at integration time)*).
- If you need playlists (likely, e.g. a "PS5 recordings" playlist), request `https://www.googleapis.com/auth/youtube` alongside or instead of `youtube.upload`. Note that changing scopes later requires full re-consent because incremental auth is unsupported for installed apps.
- Quota side-note for those extras: `playlistItems.insert` = 50 units, `thumbnails.set` = 50 units (from the 10,000-unit bucket), so ~100+ uploads/day with playlist+thumbnail fits comfortably.

## 6. 2025/2026 changes worth knowing

1. **Upload quota model (Dec 2025 → Jun 2026)** — 1600 units → ~100 units (Dec 4, 2025); then `videos.insert` moved into its own **granular bucket: 100 calls/day, 1 unit each** (Jun 1, 2026). No per-byte quota cost. ([Revision History](https://developers.google.com/youtube/v3/revision_history?hl=en), [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost?hl=en))
2. **Unverified projects no longer upload private-only (Nov 2, 2026)** — reverses the July 28, 2020 policy; privacy defaults to `public` if `status.privacyStatus` is omitted. ([Revision History](https://developers.google.com/youtube/v3/revision_history?hl=en))
3. **`selfDeclaredMadeForKids` is still NOT mandatory** — the 2026 reference describes it as an optional property that lets the channel owner designate child-directed content; docs do not state that omission blocks an insert. (Oct 15, 2026 clarification: `status.selfDeclaredMadeForKids` / `status.madeForKids` "are only updated if specified in the request and are not overridden if omitted.") Set it explicitly to `false` if you want to be unambiguous — recommended practice. *(Marked: whether the backend rejects a missing value in some channels is not documented.)*
4. **Audit requirement for `videos.insert` removed** — audits are now only needed for extra quota (see 4.3). No "compliance-audit-to-upload" gate in the current docs.
5. **New/changed upload-adjacent surface**
   - `status.containsSyntheticMedia` (altered/synthetic content disclosure, Oct 30, 2024) settable on insert.
   - `paidProductPlacementDetails.hasPaidProductPlacement` no longer defaults to `false` (Nov 2026 entry in revision history) — if you don't set it, the video is *not* declared free of paid promotion.
   - New `brandPartner` part on `videos` (Jul 7, 2026); new `videos.batchGetStats` (Jun 3, 2026) — irrelevant to a personal uploader.
   - `thumbnails.set` now also works for Shorts after processing, and max thumbnail size raised 2 MB → **50 MB** (Sep 14, 2026); it also added `shortsAspectRatio`.
   - Thumbnail upload rate limiting: `uploadRateLimitExceeded` (too many thumbnails in 24 h).
6. **Chunked resumable upload is now explicitly discouraged** by the official guide (it used to be recommended for large files). Send one `PUT` and use `Content-Range` only to resume.
7. **No new upload endpoint variant** — still `POST /upload/youtube/v3/videos` with `uploadType=resumable` (the generic `uploadType=media|multipart` exist for the generic Google upload protocol but the YouTube guide documents resumable). No documented ban on local/personal third-party upload clients beyond the normal API Terms; YouTube's [Developer Policies](https://developers.google.com/youtube/terms/developer-policies) and [API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service) still apply (e.g. don't misrepresent uploads, respect quota, no circumventing limits). *(Marked: no 2026-specific "ban on desktop upload tools" found; absence of a doc is not proof of permission — read the API Services Terms before distributing the tool.)*
8. **Desktop OAuth:** DPoP support added (optional/recommended); PKCE language strengthened ("Always use PKCE"); loopback explicitly **kept** for desktop clients while deprecated for Android/iOS/Chrome clients.

## 7. If the official API is blocked/undesirable: alternatives (short)

Two fallbacks exist, neither of which I'd build on. **(a) YouTube Studio browser automation** (Playwright/Selenium driving studio.youtube.com): works today for a personal channel, but it is fragile (UI redesigns, upload dialogs, consent/2FA interstitials, headless detection) and legally gray — YouTube ToS §"Permissions and Restrictions" says you may not "access the Service using any automated means (such as robots, botnets or scrapers) except … with YouTube's prior written permission" ([YouTube Terms of Service](https://www.youtube.com/t/terms?hl=en)); risk is account-level enforcement, and a broken run can leave half-configured videos. **(b) Google Drive upload**: pushing the OBS file to Drive via the Drive API is trivial and stable, but it is *only storage* — it does not create a YouTube video, so it's a "keep the recording safe / share a link" fallback, not a publishing path; you'd still need a manual Studio upload or the YouTube API afterwards. Recommendation: make **Personal mode + Desktop OAuth client + `videos.insert` resumable upload** the primary path; keep a "manual upload from Studio" escape hatch in the tool's UX rather than automating the browser.

---

## Source list (all fetched 2026-11-20)

- Supported file formats: https://support.google.com/youtube/troubleshooter/2888402?hl=en
- Recommended upload encoding settings: https://support.google.com/youtube/answer/1722171?hl=en
- Partner formatting specs (not applicable to normal channels): https://support.google.com/youtube/answer/4603579?hl=en
- `videos.insert` reference: https://developers.google.com/youtube/v3/docs/videos/insert
- Resumable Uploads guide: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
- Quota Calculator: https://developers.google.com/youtube/v3/determine_quota_cost?hl=en
- Quota and Compliance Audits: https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits?hl=en
- Revision History: https://developers.google.com/youtube/v3/revision_history?hl=en
- `video` resource (`status.*` fields): https://developers.google.com/youtube/v3/docs/videos
- `playlistItems.insert`: https://developers.google.com/youtube/v3/docs/playlistItems/insert
- `thumbnails.set`: https://developers.google.com/youtube/v3/docs/thumbnails/set
- YouTube API authentication (scopes): https://developers.google.com/youtube/v3/guides/authentication?hl=en
- OAuth 2.0 for Desktop Apps: https://developers.google.com/identity/protocols/oauth2/native-app?hl=en
- OAuth 2.0 overview / refresh-token expiration (7 days): https://developers.google.com/identity/protocols/oauth2?hl=en
- OAuth 2.0 web-server flow (`access_type=offline`, `prompt=consent`): https://developers.google.com/identity/protocols/oauth2/web-server?hl=en
- Loopback IP Address flow Migration Guide: https://developers.google.com/identity/protocols/oauth2/resources/loopback-migration?hl=en
- Manage OAuth Clients (desktop needs no extra info): https://support.google.com/cloud/answer/15549257?hl=en
- Manage App Audience (Testing/Production, user cap, Personal mode): https://support.google.com/cloud/answer/15549945?hl=en
- Quick setup for personal use (Personal mode): https://support.google.com/cloud/answer/15544987?hl=en
- Sensitive scope verification: https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification?hl=en
- YouTube Terms of Service (no automated access): https://www.youtube.com/t/terms?hl=en
