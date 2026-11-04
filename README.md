<img src="assets/icon.svg" width="64" height="64" alt="">

# Mister Handy

One place to watch every project you're running at once: its plan, where each plan step stands, and which T3 Code thread is working it. [CONTEXT.md](CONTEXT.md) defines the terms.

## Layout

- `packages/domain` holds the Effect Schema definitions every other package shares, and `deriveStepNodes`, which works out each step's state.
- `packages/db` holds the SQLite schema and the queries the pages and the CLI run. [docs/storage.md](docs/storage.md) describes the model.
- `apps/web` is the TanStack Start app with the Home page and Project pages.
- `apps/cli` is `mr-handy`, the CLI a coordinator thread uses to post status updates and to set up the database.

## Running it

Needs Node 22.23 or newer and pnpm 10.28.

```sh
pnpm install
pnpm build
pnpm exec mr-handy db init                                   # create the tables, safe to rerun
pnpm exec mr-handy db load docs/examples/chase-2146.sql     # load the CHASE-2146 example
pnpm dev                                                     # web app on http://localhost:3000
pnpm typecheck
pnpm test
pnpm exec mr-handy status --project chase-2146 --step route-readers --environment <id> --thread <id>
```

The database is `~/.mr-handy/mister-handy.db`. Set `MR_HANDY_DB` to use another file, for example to try the example without touching your real data:

```sh
export MR_HANDY_DB=/tmp/mr-handy-try.db
pnpm exec mr-handy db init && pnpm exec mr-handy db load docs/examples/chase-2146.sql
pnpm dev
```

`mr-handy db load` runs the whole file in one transaction, so a file that fails halfway leaves the database as it was. Node prints an ExperimentalWarning for `node:sqlite` on 22.x. It's harmless.

`mr-handy status` fills in `--thread` from `T3CODE_THREAD_ID` and `--environment` from `$T3CODE_HOME/userdata/environment-id` when they are left out. T3 Code sets both variables in every thread.

## Serving it on the tailnet

The pages go out over Tailscale, so only your own devices reach them. Build once, run the built app on localhost, and put `tailscale serve` in front of it for HTTPS. Port 443 on this machine already serves T3 Code, so Mister Handy uses 8300.

```sh
pnpm build
pnpm serve                                                   # built app on http://127.0.0.1:3000
tailscale serve --bg --https=8300 http://127.0.0.1:3000      # https://<machine>.<tailnet>.ts.net:8300
tailscale serve status                                       # shows the URL
tailscale serve --https=8300 off                             # stop serving
```

`tailscale serve --bg` survives a reboot and `pnpm serve` doesn't, so after a reboot only the app needs restarting. `pnpm dev` works behind the same proxy. Vite rejects unknown hosts, so `apps/web/vite.config.ts` allows `*.ts.net` in dev and preview.
