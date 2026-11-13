# IDEAL AI first rollout

## Optional Gemini free-quota provider (2026-11-12)

For the owner's request to avoid prepaid OpenAI credits, provider switching is supported:
- Create a Gemini API key in Google AI Studio using a project on the **Free** tier. Do not enable Billing or attach a paid project if payment is not wanted.
- Add `GEMINI_API_KEY` and `IDEAL_AI_PROVIDER=gemini` in Render. Keep `IDEAL_AI_ENABLED=true`. An existing OpenAI key is not used in this mode, including on a Google quota failure. There is NO automatic paid-provider fallback.
- Default model: `gemini-3.5-flash-lite`; optional `GEMINI_MODEL` override. Official pricing currently lists a Free tier for this model. Provider quotas/availability can change and the application cannot inspect a project's billing tier from an API key. A paid-project key can incur charges: the Free-project choice is an operator requirement, not something enforced by this application.
- The text-only, admin-only, request-limited behavior remains. The UI discloses Google processing before a user submits a chat message. Google's unpaid-service terms allow use of input/output for product improvement, including human review. Do NOT submit confidential, sensitive or personal information. CRM business data stays in local reports; external-model business-data tools remain absent.
- Google API key travels in `x-goog-api-key`, never the URL. Assistant history maps to the Gemini model role; only visible text parts are returned, not thought parts. Upstream raw errors/keys/prompts are not audited.
- Official references: https://ai.google.dev/gemini-api/docs/pricing ; https://ai.google.dev/gemini-api/docs/terms ; https://ai.google.dev/gemini-api/docs/available-regions ; https://ai.google.dev/api/generate-content . Kazakhstan is currently listed as available. A real response requires the owner's key and available free quota; mocked tests do not establish live connectivity.

The UI is an administrator-only assistant launched with the IDEAL AI button on CRM pages. Two separate modes are available:
- Knowledge: relevant excerpts from the existing versioned `public/training-data.js` material accompany the explicitly typed question. Responses include server-generated training source links. Conflicting board counts / pack areas are flagged rather than presented as verified specifications. This is reference retrieval, not model fine-tuning. Missing collections need source material.
- Local reports: fixed, read-only sales, completed-visit and employee-KPI calculations execute inside CRM. No report request, result, dealer record or employee information is sent to an external model or added to chat history. Reports are admin-only even when staff chat is enabled. KPI calculations reuse the employee module, including manually entered illiquid quantities. Sales reports follow active-dealer totals plus custom rows; unmatched sales are disclosed. Queries are bounded and fail instead of silently truncating the report.
The assistant cannot mutate records or send messages. Staff UI access and role-scoped business tools are not implemented. Local reports work independently of external-model configuration or quota.

Configuration in Render (never in source or browser):
- `OPENAI_API_KEY`: the owner's OpenAI project API key.
- `IDEAL_AI_ENABLED=true`: feature switch. Remove it or set false to stop provider calls immediately.
- Optional `IDEAL_AI_MODEL`, default `gpt-4.1-mini`.
- Optional `IDEAL_AI_DAILY_REQUEST_LIMIT`: default 100, capped at 1000; shared across accounts and restarts using MongoDB, resets on the UTC date. Attempts including provider failures consume this quota.

20 chat requests per user per 15 minutes (in-process limiter), a 30-second provider timeout, max 3000 message characters, bounded conversational context and 1000 output tokens per response. These are request/token caps, not a monetary guarantee. Review API project billing/usage separately; ChatGPT subscription usage is not this API's usage.

The external chat sends the explicitly typed text, up to six supplied user/assistant history items, and relevant existing public training excerpts. OpenAI requests use `store:false`. No business records are retrieved for external chat; the separate local report endpoint reads only the required fields and does not contact a model. The browser keeps the current conversation in memory only. Common API-key/private-key/JWT/MongoDB-URI patterns are rejected, which is not exhaustive data-loss prevention. The UI instructs users not to enter secrets or confidential data. `store:false` does not itself establish zero retention or legal compliance.

Generic mutation audit bypasses these endpoints to avoid storing prompts. Dedicated audit records include only actor, request ID, model, token counts and safe outcome codes. The API key and upstream error bodies are not logged. Responses render with textContent, not model-supplied HTML. The authenticated server guard rechecks administrator permissions after the main JWT/database account middleware.

Validated with mocked provider: unauthenticated/non-admin denied; feature-disabled rejected; prompt/history validation; shared quota; no business-data or tool access; no prompt/key in audit; safe provider errors. Live provider connectivity, available model and API credits require the owner's server key and a successful request in the deployed CRM. No live connection is claimed until that test succeeds.
