# IDEAL AI first rollout

The UI is an administrator-only text assistant launched with the IDEAL AI button on CRM pages. It helps draft dealer messages and training plans. It is not connected to CRM business data, has no tools and cannot mutate data or send messages. Staff UI access and role-scoped business tools are not implemented in this rollout.

Configuration in Render (never in source or browser):
- `OPENAI_API_KEY`: the owner's OpenAI project API key.
- `IDEAL_AI_ENABLED=true`: feature switch. Remove it or set false to stop provider calls immediately.
- Optional `IDEAL_AI_MODEL`, default `gpt-4.1-mini`.
- Optional `IDEAL_AI_DAILY_REQUEST_LIMIT`: default 100, capped at 1000; shared across accounts and restarts using MongoDB, resets on the UTC date. Attempts including provider failures consume this quota.

20 chat requests per user per 15 minutes (in-process limiter), a 30-second provider timeout, max 3000 message characters, bounded conversational context and 1000 output tokens per response. These are request/token caps, not a monetary guarantee. Review API project billing/usage separately; ChatGPT subscription usage is not this API's usage.

The server sends only the explicitly typed text and up to six supplied user/assistant history items to the OpenAI Responses API, with `store:false`. No CRM records are retrieved. The browser keeps the current conversation in memory only. Common API-key/private-key/JWT/MongoDB-URI patterns are rejected, which is not exhaustive data-loss prevention. The UI instructs users not to enter secrets or confidential data. `store:false` does not itself establish zero retention or legal compliance.

Generic mutation audit bypasses these endpoints to avoid storing prompts. Dedicated audit records include only actor, request ID, model, token counts and safe outcome codes. The API key and upstream error bodies are not logged. Responses render with textContent, not model-supplied HTML. The authenticated server guard rechecks administrator permissions after the main JWT/database account middleware.

Validated with mocked provider: unauthenticated/non-admin denied; feature-disabled rejected; prompt/history validation; shared quota; no business-data or tool access; no prompt/key in audit; safe provider errors. Live provider connectivity, available model and API credits require the owner's server key and a successful request in the deployed CRM. No live connection is claimed until that test succeeds.
