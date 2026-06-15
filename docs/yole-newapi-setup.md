# Yole NewAPI Setup

This document records the NewAPI-side requirements for the Yole first-run
provisioning MVP.

Yole clients do not receive any NewAPI management credential. The admin access
token stays only on the `yole-provisioner` server. After first-run registration,
clients call the public NewAPI `/v1` endpoint directly with the consumer token
returned by the provisioner.

## Current Target

```text
NewAPI base URL: https://na.itxgp.com
NewAPI public v1 URL: https://na.itxgp.com/v1
Default model: deepseek-v4-pro
Yole user group: yole
Yole token group: yole
Yole route version: 2026-06-15.1
Initial NewAPI balance: 30 = 15,000,000 NewAPI quota units
Yole points: 1 NewAPI balance = 100 points; 30 balance = 3000 points
Low balance threshold: 3 NewAPI balance = 300 points
```

NewAPI's built-in UI calls this balance an amount / dollar value, but Yole
treats it as an internal quota unit. Ordinary users only see Yole points.

Do not commit the NewAPI admin/system access token. Put it in
`provisioner/config.yaml` on the server, or inject it with
`YOLE_NEWAPI_ADMIN_TOKEN`.

## Account Model

Yole uses one NewAPI user per Yole client install:

1. The desktop client sends its local `install_id` to the provisioner.
2. The provisioner checks `accounts.json`; if the install already exists, it
   returns the existing account and token without adding credit again.
3. For a new install, the provisioner creates a NewAPI user named like
   `yole_<random>`.
4. The provisioner moves that user into the `yole` group.
5. The provisioner adds 30 NewAPI balance units (`15,000,000` quota units).
6. The provisioner logs in as the new user and creates one default token:
   `unlimited_quota: true`, `expired_time: -1`, token group `yole`.
7. The desktop stores only the consumer token and a provisioner account token.

Actual spending is controlled by the NewAPI user's account balance, not by the
token's own quota. The NewAPI password and admin token never leave the
provisioner server.

## Required NewAPI Settings

- `newapi.admin_user_id` must point at a NewAPI admin/root user.
- The admin access token must be able to create users, update user group, add
  quota, and read user status.
- The `yole` user group must exist and be allowed to use DeepSeek, GPT-5.5,
  the fixed vision model, and the fixed image model.
- The `yole` token group should exist or be accepted by NewAPI token creation.
- Same-model upstream fallback is handled inside NewAPI. Yole does not do
  hidden cross-model fallback; the desktop client exposes the text model choice
  directly. If a selected text model is text-only and the user sends images,
  the managed runtime calls the fixed vision model once to summarize the image.
- Password login must be enabled for provisioner-created users, because the
  service creates the consumer token through that user's own session.

If NewAPI denies chat with `403`, check group access first. If it returns
`model_price_error`, configure NewAPI pricing for the route-selected model.

## Required NewAPI Pricing

Custom Yole model aliases must have explicit NewAPI pricing entries. If they
are missing from `ModelRatio`, NewAPI can fall back to a high default ratio;
on 2026-06-15 this made `deepseek-v4-pro` bill at `model_ratio = 37.5`.

Current VPS pricing baseline:

```json
{
  "ModelRatio": {
    "deepseek-v4-pro": 1,
    "qwen3.7-plus": 1,
    "gpt-5.5": 5,
    "gpt-image-2": 5
  },
  "CompletionRatio": {
    "deepseek-v4-pro": 1,
    "qwen3.7-plus": 1,
    "gpt-5.5": 5,
    "gpt-image-2": 1
  },
  "CacheRatio": {
    "deepseek-v4-pro": 0.1,
    "qwen3.7-plus": 0.1,
    "gpt-5.5": 0.1,
    "gpt-image-2": 0.1
  }
}
```

Keep DeepSeek and fixed auxiliary models at a simple 1x ratio unless upstream
cost changes require an operator decision. `gpt-5.5` is currently 5x for both
input and completion so users can choose it explicitly and see the higher spend
in their Yole points without another hidden multiplier.

## Admin Access Token

Create a system access token for the admin/root user. The provisioner uses it
with both headers:

```http
Authorization: Bearer <admin-system-access-token>
New-Api-User: 1
```

Recommended server config:

```yaml
newapi:
  base_url: "https://na.itxgp.com"
  admin_token: "replace-on-server"
  admin_user_id: 1
  public_v1_base_url: "https://na.itxgp.com/v1"
```

Environment variables may be easier for Docker or systemd deployments:

```text
YOLE_NEWAPI_BASE_URL=https://na.itxgp.com
YOLE_NEWAPI_ADMIN_TOKEN=<admin-system-access-token>
YOLE_NEWAPI_ADMIN_USER_ID=1
YOLE_NEWAPI_PUBLIC_V1_BASE_URL=https://na.itxgp.com/v1
```

## Provisioner Config

MVP settings:

```yaml
server:
  listen: "127.0.0.1:8080"

newapi:
  base_url: "https://na.itxgp.com"
  admin_token: "replace-with-server-side-token"
  admin_user_id: 1
  public_v1_base_url: "https://na.itxgp.com/v1"

trial:
  token_prefix: "yole"
  initial_credit_usd: 30
  low_balance_usd: 3
  user_group: "yole"
  token_group: "yole"
  default_model: "deepseek-v4-pro"
  allowed_models:
    - "deepseek-v4-pro"
    - "gpt-5.5"
    - "qwen3.7-plus"
    - "gpt-image-2"

points:
  per_usd: 100
  unit: "积分"

model_routing:
  version: "2026-06-15.1"
  default_profile: "yole_standard"
  profiles:
    yole_standard:
      newapi_group: "yole"
      conversation:
        - "deepseek-v4-pro"
        - "gpt-5.5"
      vision:
        - "qwen3.7-plus"
      image_generation:
        - "gpt-image-2"
      image_editing:
        - "gpt-image-2"

contact:
  wechat_id: "replace-with-wechat-id"
  wechat_qr_path: "./wechat-qr.png"
  overseas: "support@example.com"

storage:
  account_store_path: "./accounts.json"

rate_limit:
  per_ip_per_hour: 3
  per_ip_per_day: 10

security:
  trust_proxy_headers: true
  client_ip_header: "X-Forwarded-For"
```

Use `trust_proxy_headers: true` only when the service is behind a trusted VPS
reverse proxy. Otherwise leave it false so rate limiting uses the direct socket
address.

Keep `storage.account_store_path` persistent. If this file is lost, the same
desktop install can no longer be matched to its existing NewAPI user, and a
future registration may create another account.

## VPS Deployment Notes

The provisioner is a plain Go server. It does not require Python, Node, Rust, or
a database at runtime. It does need a writable `accounts.json` path and access
to the configured WeChat QR image if `contact.wechat_qr_path` is set.

Recommended production shape:

```text
Yole desktop client
  -> https://<provisioner-domain>/api/register
  -> https://<provisioner-domain>/api/account/status
  -> https://na.itxgp.com/v1 for chat

VPS:
  reverse proxy with HTTPS
  yole-provisioner Linux binary
  accounts.json persisted beside the binary or under /data
  NewAPI deployed separately
```

The provisioner can also live under a path prefix on the NewAPI host. For
example, build with:

```bash
YOLE_PROVISIONER_URL=https://na.itxgp.com/yole-provisioner
```

The client will call `/yole-provisioner/api/register`. Configure the reverse
proxy to strip `/yole-provisioner/` before forwarding to the Go service, because
the service itself serves `/api/register`.

Build a Linux binary from any development platform:

```bash
GOOS=linux GOARCH=amd64 go build -o yole-provisioner-linux-amd64 ./cmd/yole-provisioner
```

Run it on Linux:

```bash
./yole-provisioner-linux-amd64 -config ./config.yaml
```

## Yole Client Configuration

The desktop client only needs the public provisioner URL. It never receives the
NewAPI admin access token.

For a Yole build, set `YOLE_PROVISIONER_URL` at build time:

```bash
YOLE_PROVISIONER_URL=https://<provisioner-domain> pnpm --dir gui tauri build
```

Windows PowerShell equivalent:

```powershell
$env:YOLE_PROVISIONER_URL = "https://<provisioner-domain>"
pnpm --dir gui tauri build
Remove-Item Env:\YOLE_PROVISIONER_URL
```

The Core also reads `YOLE_PROVISIONER_URL` at runtime. This is useful for local
development and dogfood builds:

```powershell
$env:YOLE_PROVISIONER_URL = "http://127.0.0.1:8080"
pnpm --dir gui tauri dev
```

If `YOLE_PROVISIONER_URL` is unset and no `yole_provisioner_url` pref exists,
Yole skips automatic registration and keeps the existing onboarding behavior.

## Verification

After NewAPI settings are fixed:

1. Start the provisioner with server-side config.
2. `GET /healthz` should return `{"status":"ok"}`.
3. `POST /api/register` should return `newapi_base_url`, `token`,
   `default_model`, and `account`.
4. Confirm NewAPI shows a new user in the `yole` group with 30 balance units
   (3000 Yole points) worth of quota.
5. Confirm the created token is unlimited and does not expire.
6. Use the returned token against `https://na.itxgp.com/v1/chat/completions`.
7. `GET /api/account/status` with the returned account token should show the
   current balance and contact info.

Do not proceed to shipping Yole first-run registration until the returned token
can complete a real chat request through NewAPI and the balance refresh route
works through HTTPS.
