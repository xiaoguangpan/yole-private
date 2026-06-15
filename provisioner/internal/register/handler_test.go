package register

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
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
		f.user = newapi.UserRecord{ID: userID, Username: "yole_test", Quota: newapi.QuotaFromUSD(30)}
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
			InitialCreditUSD: 30,
			LowBalanceUSD:    3,
			UserGroup:        "yole",
			TokenGroup:       "yole",
			DefaultModel:     "deepseek-v4-pro",
			AllowedModels:    []string{"deepseek-v4-pro", "gpt-5.5", "gpt-image-2"},
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
	if resp.DefaultModel != "deepseek-v4-pro" {
		t.Fatalf("unexpected model %q", resp.DefaultModel)
	}
	if resp.Account.UserID != 42 || resp.Account.SupportID != resp.Account.Username {
		t.Fatalf("unexpected account: %+v", resp.Account)
	}
	if !strings.HasPrefix(resp.Account.AccountToken, "yole_acct_") {
		t.Fatalf("unexpected account token %q", resp.Account.AccountToken)
	}
	if resp.Account.QuotaPoints != 15000000 || resp.Account.BalanceUSD != 30 {
		t.Fatalf("unexpected balance: %+v", resp.Account)
	}
	if resp.Account.BalancePoints != 3000 || resp.Account.InitialGrantPoints != 3000 || resp.Account.LowBalancePoints != 300 {
		t.Fatalf("unexpected points balance: %+v", resp.Account)
	}
	if resp.Account.PointsUnit != "积分" {
		t.Fatalf("unexpected points unit %q", resp.Account.PointsUnit)
	}
	if resp.Account.LowBalance {
		t.Fatal("expected fresh account to be above low-balance threshold")
	}
	if resp.Account.Contact.WeChatID != "wx-test" || !strings.Contains(resp.Account.Contact.TopUpMessage, "wx-test") {
		t.Fatalf("unexpected contact: %+v", resp.Account.Contact)
	}
	if strings.Contains(resp.Account.Contact.TopUpMessage, "美元") || !strings.Contains(resp.Account.Contact.TopUpMessage, "3000 积分") {
		t.Fatalf("expected points top-up message, got %q", resp.Account.Contact.TopUpMessage)
	}
	if resp.RouteVersion == "" || resp.ModelRouting == nil {
		t.Fatalf("expected model routing in register response: %+v", resp)
	}
	if resp.ModelRouting.ProfileID != "yole_standard" {
		t.Fatalf("unexpected route profile: %+v", resp.ModelRouting)
	}
	if api.provisionReq.InitialQuota != 15000000 {
		t.Fatalf("unexpected quota request: %+v", api.provisionReq)
	}
	if api.provisionReq.UserGroup != "yole" || api.provisionReq.TokenGroup != "yole" {
		t.Fatalf("unexpected groups: %+v", api.provisionReq)
	}
	if len(api.provisionReq.AllowedModels) != 3 ||
		api.provisionReq.AllowedModels[0] != "deepseek-v4-pro" ||
		api.provisionReq.AllowedModels[1] != "gpt-5.5" ||
		api.provisionReq.AllowedModels[2] != "gpt-image-2" {
		t.Fatalf("unexpected models: %+v", api.provisionReq.AllowedModels)
	}
}

func TestRuntimeRouteReturnsNoContentForCurrentVersion(t *testing.T) {
	handler, _ := newTestHandler(t, ratelimit.NewMemoryLimiter(10, 10))
	body := bytes.NewBufferString(`{"install_id":"install-1"}`)
	registerResp := httptest.NewRecorder()
	handler.register(registerResp, httptest.NewRequest(http.MethodPost, "/api/register", body))
	if registerResp.Code != http.StatusOK {
		t.Fatalf("expected register to pass, got %d", registerResp.Code)
	}
	var registered RegisterResponse
	if err := json.Unmarshal(registerResp.Body.Bytes(), &registered); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/runtime/route?version="+registered.RouteVersion+"&profile="+registered.ModelRouting.ProfileID, nil)
	req.Header.Set("Authorization", "Bearer "+registered.Account.AccountToken)
	rr := httptest.NewRecorder()
	handler.runtimeRoute(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestRuntimeRouteReturnsBodyWhenProfileChangesAtSameVersion(t *testing.T) {
	handler, api := newTestHandler(t, ratelimit.NewMemoryLimiter(10, 10))
	body := bytes.NewBufferString(`{"install_id":"install-1"}`)
	registerResp := httptest.NewRecorder()
	handler.register(registerResp, httptest.NewRequest(http.MethodPost, "/api/register", body))
	if registerResp.Code != http.StatusOK {
		t.Fatalf("expected register to pass, got %d", registerResp.Code)
	}
	var registered RegisterResponse
	if err := json.Unmarshal(registerResp.Body.Bytes(), &registered); err != nil {
		t.Fatal(err)
	}
	if registered.ModelRouting == nil || registered.ModelRouting.ProfileID != "yole_standard" {
		t.Fatalf("expected standard route after register: %+v", registered.ModelRouting)
	}

	api.user.Group = "vip"
	req := httptest.NewRequest(http.MethodGet, "/api/runtime/route?version="+registered.RouteVersion+"&profile="+registered.ModelRouting.ProfileID, nil)
	req.Header.Set("Authorization", "Bearer "+registered.Account.AccountToken)
	rr := httptest.NewRecorder()
	handler.runtimeRoute(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected updated route body, got %d: %s", rr.Code, rr.Body.String())
	}
	var route RouteResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &route); err != nil {
		t.Fatal(err)
	}
	if route.ProfileID != "yole_vip" || len(route.Conversation) == 0 || route.Conversation[0] != "gpt-5.5" {
		t.Fatalf("expected vip route after NewAPI group update: %+v", route)
	}
}

func TestDefaultRouteProfilesSeparateStandardAndVIPModels(t *testing.T) {
	routing := normalizeRouting(RoutingConfig{})
	standard := routing.Profiles["yole_standard"]
	vip := routing.Profiles["yole_vip"]

	if len(standard.Conversation) == 0 || standard.Conversation[0] != "deepseek-v4-pro" {
		t.Fatalf("standard route should prefer deepseek-v4-pro: %+v", standard.Conversation)
	}
	if containsString(standard.Conversation, "gpt-5.5") {
		t.Fatalf("standard route must not include GPT-5.5: %+v", standard.Conversation)
	}
	if len(vip.Conversation) == 0 || vip.Conversation[0] != "gpt-5.5" {
		t.Fatalf("vip route should prefer GPT-5.5: %+v", vip.Conversation)
	}
	if !containsString(vip.Conversation, "deepseek-v4-pro") {
		t.Fatalf("vip route should fall back to non-GPT models: %+v", vip.Conversation)
	}
	if !containsString(vip.Vision, "qwen3.7-plus") {
		t.Fatalf("vip route should include a non-GPT vision fallback: %+v", vip.Vision)
	}
	if !containsString(standard.Vision, "qwen3.7-plus") {
		t.Fatalf("standard route should include a dedicated vision model: %+v", standard.Vision)
	}
}

func TestRuntimeRouteSelectsVIPProfileFromStoredGroup(t *testing.T) {
	handler, _ := newTestHandler(t, ratelimit.NewMemoryLimiter(10, 10))
	handler.routing = normalizeRouting(RoutingConfig{})
	store, ok := handler.store.(*accountstore.Store)
	if !ok {
		t.Fatal("expected concrete account store")
	}
	rec := accountstore.Record{
		InstallID:    "install-vip",
		AccountToken: "token-vip",
		UserID:       99,
		Username:     "yole_vip",
		UserGroup:    "vip",
		RouteProfile: "yole_vip",
	}
	if err := store.Upsert(rec); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/runtime/route", nil)
	req.Header.Set("Authorization", "Bearer token-vip")
	rr := httptest.NewRecorder()
	handler.runtimeRoute(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	var route RouteResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &route); err != nil {
		t.Fatal(err)
	}
	if route.ProfileID != "yole_vip" || len(route.Conversation) == 0 || route.Conversation[0] != "gpt-5.5" {
		t.Fatalf("unexpected vip route: %+v", route)
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

func TestRegisterIsIdempotentForDeviceIDHashAfterReinstall(t *testing.T) {
	handler, api := newTestHandler(t, ratelimit.NewMemoryLimiter(10, 10))
	firstBody := `{"install_id":"install-1","device_id_hash":"device-hash-1"}`
	secondBody := `{"install_id":"install-2","device_id_hash":"device-hash-1"}`

	first := httptest.NewRecorder()
	handler.register(first, httptest.NewRequest(http.MethodPost, "/api/register", bytes.NewBufferString(firstBody)))
	if first.Code != http.StatusOK {
		t.Fatalf("expected first request to pass, got %d", first.Code)
	}
	var firstResp RegisterResponse
	if err := json.Unmarshal(first.Body.Bytes(), &firstResp); err != nil {
		t.Fatal(err)
	}

	second := httptest.NewRecorder()
	handler.register(second, httptest.NewRequest(http.MethodPost, "/api/register", bytes.NewBufferString(secondBody)))
	if second.Code != http.StatusOK {
		t.Fatalf("expected reinstall request to pass, got %d: %s", second.Code, second.Body.String())
	}
	var secondResp RegisterResponse
	if err := json.Unmarshal(second.Body.Bytes(), &secondResp); err != nil {
		t.Fatal(err)
	}
	if api.provisionCount != 1 {
		t.Fatalf("expected one NewAPI account for same device hash, got %d", api.provisionCount)
	}
	if firstResp.Account.AccountToken != secondResp.Account.AccountToken {
		t.Fatalf("expected same account token after reinstall")
	}
	if firstResp.Account.Username != secondResp.Account.Username {
		t.Fatalf("expected same support username after reinstall")
	}
}

func TestRegisterDifferentDeviceIDHashCreatesNewAccount(t *testing.T) {
	handler, api := newTestHandler(t, ratelimit.NewMemoryLimiter(10, 10))

	first := httptest.NewRecorder()
	handler.register(first, httptest.NewRequest(http.MethodPost, "/api/register", bytes.NewBufferString(`{"install_id":"install-1","device_id_hash":"device-hash-1"}`)))
	if first.Code != http.StatusOK {
		t.Fatalf("expected first request to pass, got %d", first.Code)
	}

	second := httptest.NewRecorder()
	handler.register(second, httptest.NewRequest(http.MethodPost, "/api/register", bytes.NewBufferString(`{"install_id":"install-2","device_id_hash":"device-hash-2"}`)))
	if second.Code != http.StatusOK {
		t.Fatalf("expected second device request to pass, got %d: %s", second.Code, second.Body.String())
	}
	if api.provisionCount != 2 {
		t.Fatalf("expected two NewAPI accounts for different device hashes, got %d", api.provisionCount)
	}
}

func TestContactQRCodeUsesConfiguredPublicServerBase(t *testing.T) {
	handler, _ := newTestHandler(t, ratelimit.NewMemoryLimiter(10, 10))
	handler.publicServerBase = "https://na.itxgp.com/yole-provisioner"
	handler.contact.WeChatQRPath = filepath.Join(t.TempDir(), "wechat-qr.jpg")
	if err := os.WriteFile(handler.contact.WeChatQRPath, []byte("jpg"), 0o600); err != nil {
		t.Fatal(err)
	}

	body := bytes.NewBufferString(`{"install_id":"install-1"}`)
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
	want := "https://na.itxgp.com/yole-provisioner/assets/contact/wechat-qr"
	if resp.Account.Contact.WeChatQRURL != want {
		t.Fatalf("unexpected QR URL %q", resp.Account.Contact.WeChatQRURL)
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

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
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
