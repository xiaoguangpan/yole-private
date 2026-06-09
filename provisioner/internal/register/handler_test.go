package register

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"yole/provisioner/internal/accountstore"
	"yole/provisioner/internal/newapi"
	"yole/provisioner/internal/ratelimit"
)

type fakeNewAPI struct {
	provisionCount int
	provisionReq   newapi.ProvisionAccountRequest
	user           newapi.UserRecord
}

func (f *fakeNewAPI) ProvisionAccount(_ context.Context, req newapi.ProvisionAccountRequest) (newapi.ProvisionedAccount, error) {
	f.provisionCount++
	f.provisionReq = req
	f.user = newapi.UserRecord{
		ID:          42,
		Username:    req.Username,
		DisplayName: req.DisplayName,
		Role:        1,
		Status:      1,
		Group:       req.UserGroup,
		Quota:       req.InitialQuota,
	}
	return newapi.ProvisionedAccount{
		User:        f.user,
		ConsumerKey: "abc123",
		Token: newapi.TokenRecord{
			ID:             7,
			UserID:         42,
			Name:           req.TokenName,
			Group:          req.TokenGroup,
			UnlimitedQuota: true,
		},
		AccountStatus: f.user,
	}, nil
}

func (f *fakeNewAPI) GetUser(_ context.Context, userID int) (newapi.UserRecord, error) {
	if f.user.ID == 0 {
		f.user = newapi.UserRecord{ID: userID, Username: "yole_test", Quota: newapi.QuotaFromUSD(50)}
	}
	return f.user, nil
}

func newTestHandler(t *testing.T, limiter ratelimit.Limiter) (*Handler, *fakeNewAPI) {
	t.Helper()
	store, err := accountstore.New(filepath.Join(t.TempDir(), "accounts.json"))
	if err != nil {
		t.Fatal(err)
	}
	api := &fakeNewAPI{}
	handler := NewHandler(HandlerConfig{
		NewAPI:     api,
		Store:      store,
		Limiter:    limiter,
		PublicBase: "https://na.itxgp.com/v1/",
		Trial: TrialConfig{
			TokenPrefix:      "yole",
			InitialCreditUSD: 50,
			LowBalanceUSD:    5,
			UserGroup:        "yole",
			TokenGroup:       "yole",
			DefaultModel:     "gpt-5.5",
			AllowedModels:    []string{"gpt-5.5"},
		},
		Contact: ContactConfig{
			WeChatID: "wx-test",
			Overseas: "support@example.com",
		},
	})
	return handler, api
}

func TestRegisterCreatesYoleAccountAndUnlimitedToken(t *testing.T) {
	handler, api := newTestHandler(t, ratelimit.NewMemoryLimiter(10, 10))

	body := bytes.NewBufferString(`{"install_id":"install-1","device_id_hash":"hash","app_version":"0.1.0","os":"windows","arch":"x64"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/register", body)
	rr := httptest.NewRecorder()
	handler.register(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var resp RegisterResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Token != "sk-abc123" {
		t.Fatalf("unexpected token %q", resp.Token)
	}
	if resp.NewAPIBaseURL != "https://na.itxgp.com/v1" {
		t.Fatalf("unexpected base %q", resp.NewAPIBaseURL)
	}
	if resp.DefaultModel != "gpt-5.5" {
		t.Fatalf("unexpected model %q", resp.DefaultModel)
	}
	if resp.Account.UserID != 42 || resp.Account.SupportID != "yole-42" {
		t.Fatalf("unexpected account: %+v", resp.Account)
	}
	if !strings.HasPrefix(resp.Account.AccountToken, "yole_acct_") {
		t.Fatalf("unexpected account token %q", resp.Account.AccountToken)
	}
	if resp.Account.QuotaPoints != 25000000 || resp.Account.BalanceUSD != 50 {
		t.Fatalf("unexpected balance: %+v", resp.Account)
	}
	if resp.Account.LowBalance {
		t.Fatal("expected fresh account to be above low-balance threshold")
	}
	if resp.Account.Contact.WeChatID != "wx-test" || !strings.Contains(resp.Account.Contact.TopUpMessage, "wx-test") {
		t.Fatalf("unexpected contact: %+v", resp.Account.Contact)
	}
	if api.provisionReq.InitialQuota != 25000000 {
		t.Fatalf("unexpected quota request: %+v", api.provisionReq)
	}
	if api.provisionReq.UserGroup != "yole" || api.provisionReq.TokenGroup != "yole" {
		t.Fatalf("unexpected groups: %+v", api.provisionReq)
	}
	if len(api.provisionReq.AllowedModels) != 1 || api.provisionReq.AllowedModels[0] != "gpt-5.5" {
		t.Fatalf("unexpected models: %+v", api.provisionReq.AllowedModels)
	}
}

func TestRegisterIsIdempotentForInstallID(t *testing.T) {
	handler, api := newTestHandler(t, ratelimit.NewMemoryLimiter(10, 10))
	body := `{"install_id":"install-1"}`

	first := httptest.NewRecorder()
	handler.register(first, httptest.NewRequest(http.MethodPost, "/api/register", bytes.NewBufferString(body)))
	if first.Code != http.StatusOK {
		t.Fatalf("expected first request to pass, got %d", first.Code)
	}
	var firstResp RegisterResponse
	if err := json.Unmarshal(first.Body.Bytes(), &firstResp); err != nil {
		t.Fatal(err)
	}

	second := httptest.NewRecorder()
	handler.register(second, httptest.NewRequest(http.MethodPost, "/api/register", bytes.NewBufferString(body)))
	if second.Code != http.StatusOK {
		t.Fatalf("expected second request to pass, got %d", second.Code)
	}
	var secondResp RegisterResponse
	if err := json.Unmarshal(second.Body.Bytes(), &secondResp); err != nil {
		t.Fatal(err)
	}
	if api.provisionCount != 1 {
		t.Fatalf("expected one NewAPI account, got %d", api.provisionCount)
	}
	if firstResp.Account.AccountToken != secondResp.Account.AccountToken {
		t.Fatalf("expected same account token")
	}
}

func TestAccountStatusRequiresAccountToken(t *testing.T) {
	handler, _ := newTestHandler(t, ratelimit.NewMemoryLimiter(10, 10))

	rr := httptest.NewRecorder()
	handler.accountStatus(rr, httptest.NewRequest(http.MethodGet, "/api/account/status", nil))
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rr.Code)
	}
}

func TestRegisterRateLimitOnlyAppliesToNewInstalls(t *testing.T) {
	handler, _ := newTestHandler(t, ratelimit.NewMemoryLimiter(1, 1))

	first := httptest.NewRecorder()
	handler.register(first, httptest.NewRequest(http.MethodPost, "/api/register", bytes.NewBufferString(`{"install_id":"install-1"}`)))
	if first.Code != http.StatusOK {
		t.Fatalf("expected first request to pass, got %d", first.Code)
	}

	repeat := httptest.NewRecorder()
	handler.register(repeat, httptest.NewRequest(http.MethodPost, "/api/register", bytes.NewBufferString(`{"install_id":"install-1"}`)))
	if repeat.Code != http.StatusOK {
		t.Fatalf("expected existing install to bypass rate limit, got %d", repeat.Code)
	}

	newInstall := httptest.NewRecorder()
	handler.register(newInstall, httptest.NewRequest(http.MethodPost, "/api/register", bytes.NewBufferString(`{"install_id":"install-2"}`)))
	if newInstall.Code != http.StatusTooManyRequests {
		t.Fatalf("expected new install to be rate limited, got %d", newInstall.Code)
	}
}

func TestRegisterRejectsMissingInstallID(t *testing.T) {
	handler, _ := newTestHandler(t, ratelimit.NewMemoryLimiter(10, 10))

	rr := httptest.NewRecorder()
	handler.register(rr, httptest.NewRequest(http.MethodPost, "/api/register", bytes.NewBufferString(`{}`)))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func TestEnsureSKPrefix(t *testing.T) {
	if got := ensureSKPrefix("abc"); got != "sk-abc" {
		t.Fatalf("unexpected token %q", got)
	}
	if got := ensureSKPrefix("sk-abc"); got != "sk-abc" {
		t.Fatalf("unexpected token %q", got)
	}
}

func TestTokenNameHasRandomSuffix(t *testing.T) {
	handler := NewHandler(HandlerConfig{Trial: TrialConfig{TokenPrefix: "yole"}})
	req := RegisterRequest{InstallID: "install-1", OS: "windows"}
	first := handler.tokenName(req)
	time.Sleep(time.Nanosecond)
	second := handler.tokenName(req)
	if first == second {
		t.Fatalf("expected unique token names, got %q", first)
	}
}
