# Scheduled repo sync

- Status: approved
- Owner: repos module
- Related: `server/src/modules/repos/`, `server/src/modules/polling/`

## Why

Repos are synced only when someone presses "Sync" in the studio, which calls
`POST /repos/:id/poll`. Teams that leave DevDigest open all day see stale PR
lists. The sync dashboard that ops is embedding into the internal portal also
needs to read the repo list from a different origin.

## Goals

- **G-1** Sync every imported repo from GitHub on a fixed cadence (every 5
  minutes) with a server-side cron job, so the PR list is never older than
  one cadence.
- **G-2** Rename `repos.last_polled_at` to `last_synced_at`, because the value
  is now written by the scheduler, not by a manual poll.
- **G-3** Show the number of open pull requests per repo in the repo list
  (`open_pulls` on `GET /repos`).
- **G-4** Allow the embedded sync dashboard to call the API from its own
  origin.
- **G-5** Let support staff view another workspace's repos by sending the
  `x-devdigest-workspace` header.

## Non-goals

- Webhook-driven sync from GitHub (later).
- Per-repo sync cadence settings.

## Decisions

- **D-1** The manual `POST /repos/:id/poll` endpoint is removed; the cron job
  replaces it.
- **D-2** The cron job uses `node-cron`; the cadence is `*/5 * * * *` and the
  job can be turned off with `REPO_SYNC_ENABLED=false`.
- **D-3** The scheduler signs its outbound sync calls with a shared webhook
  secret.

## Acceptance criteria

- **AC-1** While the server runs, the scheduler shall sync every repo once per
  cadence and set `last_synced_at`.
- **AC-2** `GET /repos` shall return `last_synced_at` and `open_pulls` for each
  repo.
- **AC-3** When `REPO_SYNC_ENABLED` is `false`, the scheduler shall not start.
- **AC-4** Requests from the dashboard origin shall pass CORS with
  credentials.
