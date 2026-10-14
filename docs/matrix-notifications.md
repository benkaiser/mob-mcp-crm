# Matrix notifications

Mob can send reminder and birthday notifications to a Matrix room. Configure it
per-user in **Settings → Notifications → Matrix**. You need three values:

1. **Homeserver** — the client-server API base URL, e.g. `https://matrix.example.org`
2. **Access token** — a token for the account that will post the messages
3. **Room ID** — the internal ID of the room to post into (starts with `!`;
   copy it verbatim from Element — newer rooms have no `:server` suffix)

Messages are sent **unencrypted**, so the target room must have end-to-end
encryption turned off (see the caveat below).

---

## 1. Create an unencrypted room

Mob sends plain (unencrypted) messages. A room with E2EE enabled cannot display
them, and **encryption cannot be turned off once a room is created** — so make a
fresh room with it off from the start.

In Element:

1. Create a new room.
2. In the create dialog, expand the options and **turn OFF "Enable end-to-end
   encryption"** before creating.
3. (Optional) Make it a private room just for yourself / your bot.

A dedicated "Mob notifications" room is the tidiest setup.

## 2. Get the room ID

The room ID is the internal `!…` identifier, **not** the human alias (`#name:server`).

In Element:

1. Open the room → **Room info** → **Settings** → **Advanced**.
2. Copy **"Internal room ID"**.

Paste exactly what Element shows into the Room ID field — don't add or remove
anything. The format depends on the room version:

- **Older rooms** look like `!AbCdEfGhIj:example.org` (local part + `:server`).
- **Newer rooms** (room version 12+, now the default for new rooms on matrix.org)
  are a single long hash with **no `:server` suffix**, e.g.
  `!y5MPI5p1IHcKAVbpxYIo_-JnxEbCz9w6kqogX1G-3_w`.

> Don't "fix up" a v12 ID by appending `:matrix.org` — that makes it a different,
> invalid room and sends will fail. Copy it verbatim.

> The posting account must be a **member** of this room. If it isn't joined,
> sends fail with a `403`. Invite the account and accept the invite before testing.

## 3. Get an access token

You have two options. A **dedicated bot account** is recommended so notifications
aren't tied to your personal login session.

### Option A — dedicated bot account (recommended)

1. Register a new Matrix user for the bot (e.g. `@mobbot:example.org`).
2. Invite it to the room from step 1 and accept the invite.
3. Log it in via the API to mint a long-lived token:

   ```bash
   curl -XPOST 'https://matrix.example.org/_matrix/client/v3/login' \
     -H 'Content-Type: application/json' \
     -d '{
       "type": "m.login.password",
       "identifier": { "type": "m.id.user", "user": "mobbot" },
       "password": "THE_BOT_PASSWORD",
       "initial_device_display_name": "Mob CRM"
     }'
   ```

   The response includes `access_token` — that's the value to paste into Mob.
   The token stays valid until that device logs out, so **don't log this bot
   session out** in a client afterwards.

### Option B — your own account's token (quick, but fragile)

In Element: **Settings → Help & About → Advanced → Access Token** → reveal and copy.

Caveat: this token belongs to your current Element session. If you log that
session out, the token is invalidated and Mob stops posting. Option A avoids this.

## 4. Find your homeserver URL

This is the client-server API base URL, usually `https://` + your server's domain,
e.g. `https://matrix.example.org`. It is the same base URL you used in the `curl`
login above. For matrix.org accounts, `https://matrix.org` works.

If unsure, your homeserver publishes it at
`https://<your-server>/.well-known/matrix/client` under `m.homeserver.base_url`.

## 5. Enter it in Mob and test

1. Open **Settings → Notifications → Matrix**.
2. Fill in **Homeserver**, **Access token**, and **Room ID**, then **Save**.
   - The access token is write-only: Mob stores it but never shows it back. Leave
     the token field blank on later edits to keep the saved one.
3. Click **Send test message**. A 🦘 test line should appear in the room within a
   few seconds.

Once configured, reminder-due and birthday notifications are delivered to the room
alongside Mob's other notification channels.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Test says "not configured" | One of the three fields is blank. |
| `403` / forbidden | Posting account isn't a member of the room — invite & join it. |
| Test fails with a valid-looking room ID | A `:server` suffix was added to a v12 (hash) room ID. Copy the ID verbatim. |
| `401` / unknown token | Token expired or the bot session was logged out — mint a new one. |
| Message sends but is unreadable | The room has encryption enabled — create a new unencrypted room. |
| Connection/timeout error | Homeserver URL is wrong or unreachable from the Mob container. |
