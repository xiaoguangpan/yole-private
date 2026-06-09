package register

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"yole/provisioner/internal/accountstore"
	"yole/provisioner/internal/newapi"
	"yole/provisioner/internal/ratelimit"
	"yole/provisioner/internal/security"
)

type NewAPIClient interface {
	ProvisionAccount(ctx context.Context, req newapi.ProvisionAccountRequest) (newapi.ProvisionedAccount, error)
	GetUser(ctx context.Context, userID int) (newapi.UserRecord, error)
}

type AccountStore interface {
	GetByInstallID(installID string) (accountstore.Record, bool)
	GetByAccountToken(token string) (accountstore.Record, bool)
	Upsert(rec accountstore.Record) error
}

type HandlerConfig struct {
	NewAPI            NewAPIClient
	Store             AccountStore
	Limiter           ratelimit.Limiter
	PublicBase        string
	Trial             TrialConfig
	Contact           ContactConfig
	TrustProxyHeaders bool
	ClientIPHeader    string
}

type TrialConfig struct {
	TokenPrefix      string
	InitialCreditUSD float64
	LowBalanceUSD    float64
	UserGroup        string
	TokenGroup       string
	DefaultModel     string
	AllowedModels    []string
}

type ContactConfig struct {
	WeChatID     string
	WeChatQRPath string
	Overseas     string
}

type Handler struct {
	newAPI            NewAPIClient
	store             AccountStore
	limiter           ratelimit.Limiter
	publicBase        string
	trial             TrialConfig
	contact           ContactConfig
	trustProxyHeaders bool
	clientIPHeader    string
}

type RegisterRequest struct {
	InstallID    string `json:"install_id"`
	DeviceIDHash string `json:"device_id_hash"`
	AppVersion   string `json:"app_version"`
	OS           string `json:"os"`
	Arch         string `json:"arch"`
}

type RegisterResponse struct {
	NewAPIBaseURL string          `json:"newapi_base_url"`
	Token         string          `json:"token"`
	DefaultModel  string          `json:"default_model"`
	Account       AccountResponse `json:"account"`
}

type AccountResponse struct {
	AccountToken string          `json:"account_token,omitempty"`
	SupportID    string          `json:"support_id"`
	UserID       int             `json:"user_id"`
	Username     string          `json:"username"`
	BalanceUSD   float64         `json:"balance_usd"`
	QuotaPoints  int             `json:"quota_points"`
	LowBalance   bool            `json:"low_balance"`
	Contact      ContactResponse `json:"contact"`
}

type ContactResponse struct {
	WeChatID     string `json:"wechat_id,omitempty"`
	WeChatQRURL  string `json:"wechat_qr_url,omitempty"`
	Overseas     string `json:"overseas,omitempty"`
	TopUpMessage string `json:"top_up_message,omitempty"`
}

type errorResponse struct {
	Error string `json:"error"`
}

func NewHandler(cfg HandlerConfig) *Handler {
	return &Handler{
		newAPI:            cfg.NewAPI,
		store:             cfg.Store,
		limiter:           cfg.Limiter,
		publicBase:        strings.TrimRight(cfg.PublicBase, "/"),
		trial:             cfg.Trial,
		contact:           cfg.Contact,
		trustProxyHeaders: cfg.TrustProxyHeaders,
		clientIPHeader:    cfg.ClientIPHeader,
	}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", h.health)
	mux.HandleFunc("POST /api/register", h.register)
	mux.HandleFunc("GET /api/account/status", h.accountStatus)
	mux.HandleFunc("GET /assets/contact/wechat-qr", h.wechatQR)
}

func (h *Handler) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	if h.newAPI == nil {
		writeError(w, http.StatusInternalServerError, "newapi_not_configured")
		return
	}
	if h.store == nil {
		writeError(w, http.StatusInternalServerError, "account_store_not_configured")
		return
	}
	if h.limiter == nil {
		writeError(w, http.StatusInternalServerError, "rate_limiter_not_configured")
		return
	}

	var req RegisterRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return
	}
	if err := validateRegisterRequest(req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if rec, ok := h.store.GetByInstallID(req.InstallID); ok {
		resp, err := h.registerResponse(r, rec)
		if err != nil {
			log.Printf("account status failed for existing install=%s user=%d: %v", req.InstallID, rec.UserID, err)
			writeError(w, http.StatusBadGateway, "account_status_failed")
			return
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}

	clientIP := h.clientIP(r)
	if !h.limiter.Allow(clientIP, time.Now()) {
		writeError(w, http.StatusTooManyRequests, "rate_limited")
		return
	}

	username := h.username()
	password, err := newapi.RandomPassword()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "password_generation_failed")
		return
	}
	accountToken, err := accountstore.NewAccountToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account_token_generation_failed")
		return
	}

	provisioned, err := h.newAPI.ProvisionAccount(r.Context(), newapi.ProvisionAccountRequest{
		Username:      username,
		Password:      password,
		DisplayName:   username,
		UserGroup:     h.trial.UserGroup,
		TokenName:     h.tokenName(req),
		TokenGroup:    h.trial.TokenGroup,
		InitialQuota:  newapi.QuotaFromUSD(h.trial.InitialCreditUSD),
		AllowedModels: h.trial.AllowedModels,
		DefaultModel:  h.trial.DefaultModel,
	})
	if err != nil {
		log.Printf("register failed for ip=%s install=%s os=%s arch=%s: %v", clientIP, req.InstallID, req.OS, req.Arch, err)
		writeError(w, http.StatusBadGateway, "provision_failed")
		return
	}

	rec := accountstore.Record{
		InstallID:    req.InstallID,
		AccountToken: accountToken,
		SupportID:    supportID(provisioned.User.ID, provisioned.User.Username),
		UserID:       provisioned.User.ID,
		Username:     provisioned.User.Username,
		ConsumerKey:  ensureSKPrefix(provisioned.ConsumerKey),
		TokenID:      provisioned.Token.ID,
	}
	if err := h.store.Upsert(rec); err != nil {
		log.Printf("account store write failed install=%s user=%d: %v", req.InstallID, rec.UserID, err)
		writeError(w, http.StatusInternalServerError, "account_store_write_failed")
		return
	}

	resp, err := h.registerResponse(r, rec)
	if err != nil {
		log.Printf("account status failed after create install=%s user=%d: %v", req.InstallID, rec.UserID, err)
		writeError(w, http.StatusBadGateway, "account_status_failed")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) accountStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	if h.newAPI == nil || h.store == nil {
		writeError(w, http.StatusInternalServerError, "account_not_configured")
		return
	}
	token := bearerToken(r.Header.Get("Authorization"))
	if token == "" {
		token = strings.TrimSpace(r.URL.Query().Get("account_token"))
	}
	if token == "" {
		writeError(w, http.StatusUnauthorized, "account_token_required")
		return
	}
	rec, ok := h.store.GetByAccountToken(token)
	if !ok {
		writeError(w, http.StatusUnauthorized, "account_token_invalid")
		return
	}
	resp, err := h.accountResponse(r, rec, true)
	if err != nil {
		log.Printf("account status failed user=%d: %v", rec.UserID, err)
		writeError(w, http.StatusBadGateway, "account_status_failed")
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) wechatQR(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	path := strings.TrimSpace(h.contact.WeChatQRPath)
	if path == "" {
		http.NotFound(w, r)
		return
	}
	if _, err := os.Stat(path); err != nil {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, path)
}

func validateRegisterRequest(req RegisterRequest) error {
	if strings.TrimSpace(req.InstallID) == "" {
		return errors.New("install_id_required")
	}
	if len(req.InstallID) > 128 {
		return errors.New("install_id_too_long")
	}
	if len(req.DeviceIDHash) > 256 {
		return errors.New("device_id_hash_too_long")
	}
	if len(req.AppVersion) > 64 {
		return errors.New("app_version_too_long")
	}
	if len(req.OS) > 64 {
		return errors.New("os_too_long")
	}
	if len(req.Arch) > 64 {
		return errors.New("arch_too_long")
	}
	return nil
}

func (h *Handler) tokenName(req RegisterRequest) string {
	date := time.Now().UTC().Format("0102")
	prefix := security.SafeTokenNamePart(h.trial.TokenPrefix, 8)
	osName := security.SafeTokenNamePart(req.OS, 3)
	return fmt.Sprintf("%s_%s_%s_%s", prefix, date, osName, randomSuffix())
}

func (h *Handler) username() string {
	prefix := security.SafeTokenNamePart(h.trial.TokenPrefix, 8)
	return fmt.Sprintf("%s_%s", prefix, randomSuffix())
}

func (h *Handler) registerResponse(r *http.Request, rec accountstore.Record) (RegisterResponse, error) {
	account, err := h.accountResponse(r, rec, true)
	if err != nil {
		return RegisterResponse{}, err
	}
	return RegisterResponse{
		NewAPIBaseURL: h.publicBase,
		Token:         rec.ConsumerKey,
		DefaultModel:  h.trial.DefaultModel,
		Account:       account,
	}, nil
}

func (h *Handler) accountResponse(r *http.Request, rec accountstore.Record, includeToken bool) (AccountResponse, error) {
	user, err := h.newAPI.GetUser(r.Context(), rec.UserID)
	if err != nil {
		return AccountResponse{}, err
	}
	token := ""
	if includeToken {
		token = rec.AccountToken
	}
	quota := user.Quota
	balance := newapi.USDFromQuota(quota)
	return AccountResponse{
		AccountToken: token,
		SupportID:    nonempty(rec.SupportID, supportID(rec.UserID, rec.Username)),
		UserID:       rec.UserID,
		Username:     rec.Username,
		BalanceUSD:   balance,
		QuotaPoints:  quota,
		LowBalance:   balance <= h.trial.LowBalanceUSD,
		Contact:      h.contactResponse(r),
	}, nil
}

func (h *Handler) contactResponse(r *http.Request) ContactResponse {
	wechat := strings.TrimSpace(h.contact.WeChatID)
	qrURL := ""
	if strings.TrimSpace(h.contact.WeChatQRPath) != "" {
		qrURL = h.absoluteURL(r, "/assets/contact/wechat-qr")
	}
	return ContactResponse{
		WeChatID:     wechat,
		WeChatQRURL:  qrURL,
		Overseas:     strings.TrimSpace(h.contact.Overseas),
		TopUpMessage: topUpMessage(h.trial.InitialCreditUSD, wechat),
	}
}

func (h *Handler) absoluteURL(r *http.Request, path string) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if h.trustProxyHeaders {
		if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); forwarded != "" {
			scheme = strings.Split(forwarded, ",")[0]
		}
	}
	return scheme + "://" + r.Host + path
}

func (h *Handler) clientIP(r *http.Request) string {
	if h.trustProxyHeaders {
		headerName := h.clientIPHeader
		if headerName == "" {
			headerName = "X-Forwarded-For"
		}
		if raw := strings.TrimSpace(r.Header.Get(headerName)); raw != "" {
			first := strings.TrimSpace(strings.Split(raw, ",")[0])
			if ip := net.ParseIP(first); ip != nil {
				return ip.String()
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		if ip := net.ParseIP(host); ip != nil {
			return ip.String()
		}
	}
	return r.RemoteAddr
}

func ensureSKPrefix(key string) string {
	key = strings.TrimSpace(key)
	if strings.HasPrefix(key, "sk-") {
		return key
	}
	return "sk-" + key
}

func bearerToken(header string) string {
	header = strings.TrimSpace(header)
	if strings.HasPrefix(strings.ToLower(header), "bearer ") {
		return strings.TrimSpace(header[7:])
	}
	return ""
}

func supportID(userID int, username string) string {
	if userID > 0 {
		return fmt.Sprintf("yole-%d", userID)
	}
	return username
}

func topUpMessage(creditUSD float64, wechat string) string {
	amount := fmt.Sprintf("%.0f", creditUSD)
	if strings.TrimSpace(wechat) == "" {
		return fmt.Sprintf("AI 余额不足。联系客服可追加 %s 美元体验额度。", amount)
	}
	return fmt.Sprintf("AI 余额不足。联系客服可追加 %s 美元体验额度。微信号：%s", amount, wechat)
}

func nonempty(value string, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}

func randomSuffix() string {
	var bytes [4]byte
	if _, err := rand.Read(bytes[:]); err == nil {
		return hex.EncodeToString(bytes[:])
	}
	return fmt.Sprintf("%d", time.Now().UTC().UnixNano())
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, errorResponse{Error: message})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write response failed: %v", err)
	}
}
