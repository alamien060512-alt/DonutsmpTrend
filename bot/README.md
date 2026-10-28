# Headless Bedrock trader

Inspired by [cody-raves/Gonuts](https://github.com/cody-raves/Gonuts) (MIT), but it
logs in as a **Bedrock (Xbox) account** with `bedrock-protocol` instead of running inside a Java client.

    npm install
    DONUTSMP_API_KEY=xxx npm run bot        # dry run: logs what it would buy
    LIVE=1 DONUTSMP_API_KEY=xxx npm run bot # spends real money

First run prints a microsoft.com/link code; the token is cached in `data/auth`.
Server defaults to `bedrock.donutsmp.net:19132` (override `SERVER_HOST`/`SERVER_PORT`).

Console (the `bot>` prompt): `buy diamond 1.5k` (buy at or under 1.5k each, relist at 2x),
`buy diamond 1.5k 3` (relist at 3x), `rules`, `drop diamond`, `cmd /balance`, `scan`, `live on|off`, `status`.

HTTP API on `127.0.0.1:8080` with CORS open: `GET /status /rules /log /holdings /prices`, `POST /command {"command":"buy diamond 1k"}`.

Caveats: the auction GUI driver (`ah.js`) is untested against the live server.
Slot choices and the confirm click are guesses until you try them in dry/live runs.
Running a trading bot may break DonutSMP's rules; use at your own risk.
