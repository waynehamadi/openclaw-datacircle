# Datacircle for OpenClaw

Find the best GTM APIs. We benchmark all the GTM APIs and we put the results on our website: https://datacircle.dev

This OpenClaw plugin gives your agent four tools on Datacircle's open API, https://api.datacircle.dev/v1. You need no key and no account.

| Tool | What it gives | Call |
| --- | --- | --- |
| `datacircle_list_apis` | Every GTM API on the sheet, with its slug, how many plans and providers it has and its best plan | `GET /apis` |
| `datacircle_best_plans` | One API's plans, best first by score out of 100, each with its rank and $ per 1,000 calls | `GET /apis/{slug}/best` |
| `datacircle_search_plans` | Every plan, or one API's, by provider or plan name, sorted by score, provider or price | `GET /plans` |
| `datacircle_provider` | Each API one provider sells and its rank on each | `GET /providers/{slug}` |

## Install

```bash
openclaw plugins install clawhub:@datacircle/openclaw-datacircle
```

Then ask your agent, for example: "Which email finder API is best for under $5 per 1,000?"

## Network

Each tool makes one HTTPS GET to https://api.datacircle.dev/v1 and nothing else. It sends no key, no config and nothing from your workspace. The API takes up to 60 calls a minute from one address; a tool told to wait waits once, then gives the API's answer.

## Build

```bash
npm install
npm run plugin:validate
npm test
```

## Links

- Datacircle: https://datacircle.dev
- The API's spec: https://api.datacircle.dev/v1/openapi.json
- What each key means: https://datacircle.dev/fields

MIT license.
