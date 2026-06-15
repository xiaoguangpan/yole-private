# Yole Provisioner

Small server-side service that creates one NewAPI account for each first-run
Yole client and returns that account's default consumer token.

It does not proxy chat traffic. Clients call NewAPI `/v1` directly after
registration. The NewAPI admin credential stays only on the provisioner server.

## API

```text
POST /api/register
GET  /api/account/status
GET  /api/runtime/route        # legacy compatibility for old clients
GET  /assets/contact/wechat-qr
GET  /healthz
```

Register request:

```json
{
  "install_id": "local-random-id",
  "device_id_hash": "optional-device-hash",
  "app_version": "0.0.8",
  "os": "windows",
  "arch": "x64"
}
```

Register response:

```json
{
  "newapi_base_url": "https://na.itxgp.com/v1",
  "token": "sk-...",
  "default_model": "deepseek-v4-pro",
  "account": {
    "account_token": "yole_acct_...",
    "support_id": "yole_abcd1234",
    "user_id": 42,
    "username": "yole_abcd1234",
    "balance_usd": 30,
    "quota_points": 15000000,
    "balance_points": 3000,
    "initial_grant_points": 3000,
    "low_balance_points": 300,
    "points_unit": "积分",
    "low_balance": false,
    "contact": {
      "wechat_id": "replace-with-wechat-id",
      "wechat_qr_url": "https://example.com/assets/contact/wechat-qr",
      "overseas": "support@example.com",
      "top_up_message": "AI 积分不足。联系客服可追加 3000 积分体验额度。微信号：replace-with-wechat-id"
    }
  },
  "route_version": "2026-06-15.1",
  "model_routing": {
    "schema_version": 1,
    "profile_id": "yole_standard",
    "conversation": ["deepseek-v4-pro", "gpt-5.5"],
    "vision": ["qwen3.7-plus"],
    "image_generation": ["gpt-image-2"],
    "image_editing": ["gpt-image-2"]
  }
}
```

`GET /api/account/status` accepts `Authorization: Bearer <account_token>` and
returns the same `account` shape without exposing any NewAPI password or admin
credential.

## NewAPI Requirements

The provisioner uses an admin/system access token to:

1. Create a NewAPI user for the Yole install.
2. Move that user into the `yole` group.
3. Add 3000 Yole points worth of trial balance (30 NewAPI balance units,
   internally `15,000,000` quota points).
4. Log in as that user and create one default token with:
   `unlimited_quota: true`, `expired_time: -1`, and `group: yole`.

Required NewAPI settings:

- The admin access token must be valid for `newapi.admin_user_id` and able to
  create/update users, add quota, and read user status.
- The `yole` user group must exist and be allowed to use the configured
  selectable text models plus the fixed vision/image models.
- The `yole` token group should exist or be accepted by NewAPI token creation.
- NewAPI handles upstream fallback and pricing. Yole does not do hidden
  cross-model fallback; the user explicitly chooses the text model in the
  client. If the selected text model cannot read images, Yole uses the fixed
  vision model once to summarize the image for that turn.
- Password login must be enabled for provisioner-created users, because the
  service creates the consumer token through that user's own session.

The client never receives the NewAPI password. The random password is only used
inside the server-side provisioning flow.

## Local Run

```powershell
Copy-Item provisioner\config.example.yaml provisioner\config.yaml
# Edit provisioner\config.yaml and set newapi.admin_token, admin_user_id,
# contact.wechat_id, and contact.wechat_qr_path.
go run .\cmd\yole-provisioner -config .\config.yaml
```

Environment variables override config values:

```text
YOLE_PROVISIONER_LISTEN
YOLE_PUBLIC_BASE_URL
YOLE_NEWAPI_BASE_URL
YOLE_NEWAPI_ADMIN_TOKEN
YOLE_NEWAPI_ADMIN_USER_ID
YOLE_NEWAPI_PUBLIC_V1_BASE_URL
YOLE_TRIAL_TOKEN_PREFIX
YOLE_TRIAL_INITIAL_CREDIT_USD
YOLE_TRIAL_LOW_BALANCE_USD
YOLE_TRIAL_USER_GROUP
YOLE_TRIAL_TOKEN_GROUP
YOLE_TRIAL_DEFAULT_MODEL
YOLE_TRIAL_ALLOWED_MODELS
YOLE_POINTS_PER_USD
YOLE_POINTS_UNIT
YOLE_CONTACT_WECHAT_ID
YOLE_CONTACT_WECHAT_QR_PATH
YOLE_CONTACT_OVERSEAS
YOLE_ACCOUNT_STORE_PATH
YOLE_RATE_LIMIT_PER_IP_PER_HOUR
YOLE_RATE_LIMIT_PER_IP_PER_DAY
YOLE_TRUST_PROXY_HEADERS
YOLE_CLIENT_IP_HEADER
```

Legacy `YOLE_NEWAPI_POOL_USER_ID`, `trial.quota`, `trial.expire_days`, and
`trial.group` still parse for older configs, but new deployments should use the
account-balance fields above.

## Cross-Platform Build

Native build for the current machine:

```bash
go build ./cmd/yole-provisioner
```

Linux x64 from Windows:

```powershell
$env:GOOS="linux"
$env:GOARCH="amd64"
go build -o yole-provisioner-linux-amd64 ./cmd/yole-provisioner
Remove-Item Env:\GOOS
Remove-Item Env:\GOARCH
```

Run it on Linux:

```bash
./yole-provisioner-linux-amd64 -config ./config.yaml
```

Put it behind HTTPS on the VPS. If a reverse proxy terminates TLS, set:

```yaml
security:
  trust_proxy_headers: true
  client_ip_header: "X-Forwarded-For"
```

The rate limiter is in-memory for MVP. A process restart clears it. Account
registration idempotency is stored in `storage.account_store_path`; keep that
file persistent on the VPS.

The desktop build URL may be a dedicated host or a path prefix. For example,
`YOLE_PROVISIONER_URL=https://na.itxgp.com/yole-provisioner` makes the client
call `https://na.itxgp.com/yole-provisioner/api/register`. If you use a path
prefix, configure the reverse proxy to strip the prefix before forwarding to the
provisioner, because the Go service itself serves `/api/register`.

Nginx example:

```nginx
location /yole-provisioner/ {
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:8080/;
}
```

## Docker On VPS

This is optional for local development. Use it on the Linux VPS if Docker is
already available there:

```bash
cd provisioner
export YOLE_NEWAPI_ADMIN_TOKEN='<server-side-admin-access-token>'
export YOLE_NEWAPI_ADMIN_USER_ID='1'
docker compose -f docker-compose.example.yml up -d --build
```

The compose file binds the service to `127.0.0.1:8080` on the VPS and persists
the account store under a named volume. Put Nginx, Caddy, or another reverse
proxy in front of it for HTTPS, and point the desktop build at that public HTTPS
URL with `YOLE_PROVISIONER_URL`.

## Client Configuration

Yole desktop builds use only the public provisioner URL:

```bash
YOLE_PROVISIONER_URL=https://<provisioner-domain> pnpm --dir gui tauri build
```

The NewAPI admin access token stays in this server's `config.yaml` or
environment. Do not put `YOLE_NEWAPI_ADMIN_TOKEN` into the desktop client build
environment.
