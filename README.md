<img src="assets/icon.svg" width="64" height="64" alt="">

# Mister Handy

One place to watch every project you're running at once: its plan, where each plan step stands, and which T3 Code thread is working it. [CONTEXT.md](CONTEXT.md) defines the terms.

## Layout

- `packages/domain` holds the Effect Schema definitions every other package shares.
- `apps/web` is the TanStack Start app with the Home page and Project pages.
- `apps/cli` is `mr-handy`, the CLI a coordinator thread uses to post status updates.

## Running it

Needs Node 22.23 or newer and pnpm 10.28.

```sh
pnpm install
pnpm dev          # web app on http://localhost:3000
pnpm typecheck
pnpm test
pnpm build
pnpm exec mr-handy status --project chase-2146 --step s1 --environment <id> --thread <id>
```

`mr-handy status` falls back to the `T3CODE_ENVIRONMENT_ID` and `T3CODE_THREAD_ID` environment variables when `--environment` or `--thread` is left out.
