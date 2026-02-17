---
# mob-crm-rde0
title: Bluey-themed seed data for forgetful mode
status: completed
type: feature
priority: normal
created_at: 2026-02-17T04:01:27Z
updated_at: 2026-02-17T04:04:53Z
---

Change forgetful mode so every new user session is pre-populated with Bluey characters as contacts. The current user becomes **Bluey Heeler**, and all other characters are contacts with rich data (relationships, notes, activities, tags, contact methods, addresses, food preferences, reminders, life events, gifts).

## Performance Strategy: Template Database Cloning

Use **SQLite's `serialize()`/`deserialize()`** from `better-sqlite3`:

1. At startup, create one in-memory "template" database
2. Run migrations, create template user + all seed data (one time)
3. Call `templateDb.serialize()` to get a `Buffer` snapshot (~50-100KB)
4. For each new forgetful user connection, `new Database(buffer)` to clone from the serialized buffer
5. Run ~10 UPDATE statements to remap the placeholder `__TEMPLATE__` userId to the new session's userId

Each session gets its own fully isolated in-memory DB. Clone time is <1ms. Memory per session ~200KB. 100 sessions ≈ 20MB — well within 2GB RAM.

---

## Seed Data Details

### `src/db/seed-data.ts` (NEW)

Export `seedForgetfulData(db: Database.Database, userId: string): void`

Creates 20 Bluey contacts with sub-entity data:

| # | Character | Key Details |
|---|-----------|-------------|
| 1 | Bandit Heeler | Dad, archaeologist at UQ, birthday Nov 19, favorite |
| 2 | Chilli Heeler | Mum, airport security part-time, birthday Sep 6, favorite |
| 3 | Bingo Heeler | Little sister, birthday Jul 24, favorite |
| 4 | Stripe Heeler | Uncle (Bandit's brother) |
| 5 | Trixie Heeler | Aunt (Stripe's wife) |
| 6 | Muffin Heeler | Cousin (Stripe & Trixie's daughter), toddler |
| 7 | Socks Heeler | Cousin (Stripe & Trixie's daughter), acts like a puppy |
| 8 | Rad Heeler | Uncle (Bandit's brother), extreme sports, lives overseas |
| 9 | Chris Heeler | Grandmother (Bandit's mum), nickname "Nana" |
| 10 | Bob Heeler | Grandfather (Bandit's dad) |
| 11 | Frisky | Aunt (Chilli's sister), engaged to Rad, nickname "Aunt Frisky" |
| 12 | Mackenzie | School friend, from New Zealand |
| 13 | Rusty | School friend, lives on a farm |
| 14 | Judo | Neighbour & friend, competitive |
| 15 | Chloe | School friend, dalmatian, gentle |
| 16 | Honey | School friend, shy |
| 17 | Snickers | School friend |
| 18 | Calypso | Teacher at Glebe Hill School |
| 19 | Lucky | Next-door neighbour, labrador |
| 20 | Jack | School friend, had to move away |

**Tags:** Family (#E74C3C), Friends (#3498DB), School (#2ECC71), Neighbours (#F39C12)

**Relationships (between contacts, bidirectional):**
- Bandit ↔ Chilli: married
- Bandit ↔ Bingo: father/daughter
- Chilli ↔ Bingo: mother/daughter
- Stripe ↔ Bandit: brother
- Stripe ↔ Trixie: married
- Muffin ↔ Stripe: daughter/father
- Socks ↔ Stripe: daughter/father
- Rad ↔ Bandit: brother
- Chris ↔ Bandit: mother/son
- Bob ↔ Bandit: father/son
- Frisky ↔ Chilli: sister
- Frisky ↔ Rad: engaged

**Contact Methods:**
- Bandit: phone (+61 412 345 001), email (bandit@heeler.family)
- Chilli: phone (+61 412 345 002), email (chilli@heeler.family)
- Stripe: phone (+61 412 345 003)
- Trixie: phone (+61 412 345 004)
- Rad: phone (+61 412 345 005), email (rad@heeler.family)
- Calypso: email (calypso@glebehillschool.edu.au)

**Addresses:**
- Bandit & Chilli: 24 Verandah St, Brisbane, QLD 4000, Australia (Home)
- Stripe: 18 Bushland Dr, Brisbane, QLD 4000, Australia (Home)
- Rusty: 42 Outback Rd, Longreach, QLD 4730, Australia (Farm)

**Notes:**
- Bandit: "Always up for a game. His favourite game to play is Shadowlands."
- Bingo: "Loves her stuffed bunny Floppy more than anything. Very imaginative and often plays 'magical' games."
- Muffin: "Can be a bit of a handful when she's tired! Gets the 'grannies' when she skips her nap."
- Calypso: "The wisest teacher ever. Always has the perfect way to help kids work things out themselves."
- Mackenzie: "Has the coolest New Zealand accent. Always up for adventure."

**Activities (relative dates from "now"):**
1. "Played Keepy Uppy" — in_person, Bandit + Chilli + Bingo, at Home, 3 days ago
2. "Trip to the Creek" — in_person, Bingo + Mackenzie + Rusty, at The Creek, 7 days ago
3. "Farmers Market with Dad" — in_person, Bandit, at Brisbane Farmers Market, 14 days ago
4. "Sleepover at Muffin's" — in_person, Bingo + Muffin + Socks + Stripe + Trixie, at Stripe's house, 21 days ago

**Food Preferences:**
- Bingo: favorites ["peas", "fairy bread"], dislikes ["mushrooms"]
- Muffin: favorites ["chicken nuggets", "ice cream"], notes "Very picky eater, good luck!"

**Life Events:**
- Frisky: "Got engaged!" (engagement) — "Frisky and Rad are getting married!"
- Rusty: "Moved to the farm" (relocation)

**Reminders (auto-generated birthdays):**
- Bandit birthday (Nov 19), Chilli birthday (Sep 6), Bingo birthday (Jul 24)
- Custom: Mackenzie — "Plan next playdate", 1 week from now

**Gifts:**
- Bingo: "New Floppy bunny plush", idea, giving, occasion: Birthday
- Bandit: "Surfboard", received, receiving, occasion: Birthday

---

## Template DB Manager

### `src/db/forgetful-template.ts` (NEW)

```typescript
export class ForgetfulTemplate {
  private templateBuffer: Buffer;

  constructor() {
    // 1. Create in-memory DB, run migrations
    // 2. Create template user with id='__TEMPLATE__', name='Bluey Heeler'
    // 3. Call seedForgetfulData(db, '__TEMPLATE__')
    // 4. this.templateBuffer = db.serialize()
    // 5. Close template DB
  }

  clone(newUserId: string): Database.Database {
    // 1. const db = new Database(this.templateBuffer)
    // 2. Re-enable pragmas (foreign_keys, WAL, synchronous, cache_size)
    // 3. UPDATE users SET id=?, email=? WHERE id='__TEMPLATE__'
    // 4. UPDATE all user_id FK tables: contacts, tags, activities,
    //    activity_types, notifications, tasks
    //    SET user_id=? WHERE user_id='__TEMPLATE__'
    // 5. Return db
  }
}
```

Tables with `user_id` FK that need remapping: `contacts`, `tags`, `activities`, `activity_types`, `notifications`, `tasks`, `authorization_log`.

---

## HTTP Server Changes

### `src/server/http-server.ts` (MODIFY)

**Architecture:** Keep the shared in-memory `db` for auth operations (user insert, OAuth code/token issuance, authorization_log). Each forgetful session gets a separate cloned DB for CRM data.

1. Import `ForgetfulTemplate`
2. After `db` creation, if `config.forgetful`:
   - `const template = new ForgetfulTemplate()`
   - `const forgetfulDbs = new Map<string, Database.Database>()`
3. In all 3 forgetful auth bypass blocks:
   - Keep: generate `tempId`, insert user into shared `db`
   - Add: `const clonedDb = template.clone(tempId); forgetfulDbs.set(tempId, clonedDb);`
   - Change user name from `'Forgetful User'` to `'Bluey Heeler'`
4. In MCP POST handler (new session init, line ~465):
   - Extract userId: `const userId = (req as any).auth?.extra?.userId as string;` (set by bearerAuth middleware at `req.auth`)
   - Choose db: `const mcpDb = (config.forgetful && userId && forgetfulDbs.has(userId)) ? forgetfulDbs.get(userId)! : db;`
   - Pass to: `createMcpServer(mcpDb)` instead of `createMcpServer(db)`
5. Cleanup: on transport close, if forgetful, close and delete the cloned DB from `forgetfulDbs`

`src/server/mcp-server.ts` — NO CHANGES needed (already accepts `db` parameter)

---

## Checklist

- [x] Create `src/db/seed-data.ts` — all 20 Bluey contacts with sub-entity data (tags, relationships, contact methods, addresses, notes, activities, food preferences, life events, reminders, gifts)
- [x] Create `src/db/forgetful-template.ts` — ForgetfulTemplate class with serialize/clone/remap
- [x] Modify `src/server/http-server.ts` — wire up template cloning in 3 forgetful auth bypass points + MCP session creation + cleanup on close
- [x] Add `tests/unit/seed-data.test.ts` — verify seed creates 20 contacts with all sub-entities
- [x] Add `tests/unit/forgetful-template.test.ts` — verify clone isolation and userId remapping
- [x] Run existing test suite to verify no regressions
- [x] Delete PLAN-forgetful-bluey-seed.md (superseded by this bean)