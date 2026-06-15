package register

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
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
	GetByDeviceIDHash(deviceIDHash string) (accountstore.Record, bool)
	GetByAccountToken(token string) (accountstore.Record, bool)
	Upsert(rec accountstore.Record) error
}

type HandlerConfig struct {
	NewAPI            NewAPIClient
	Store             AccountStore
	Limiter           ratelimit.Limiter
	PublicBase        string
	PublicServerBase  string
	Trial             TrialConfig
	Points            PointsConfig
	Routing           RoutingConfig
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

type PointsConfig struct {
	PerUSD float64
	Unit   string
}

type RoutingConfig struct {
	Version        string
	DefaultProfile string
	Profiles       map[string]RouteProfile
	Models         map[string]ModelMetadata
}

type RouteProfile struct {
	NewAPIGroup     string
	Conversation    []string
	Vision          []string
	ImageGeneration []string
	ImageEditing    []string
}

type ModelMetadata struct {
	DisplayName      string
	InputModalities  []string
	OutputModalities []string
	ToolCalling      bool
	Enabled          *bool
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
	publicServerBase  string
	trial             TrialConfig
	points            PointsConfig
	routing           RoutingConfig
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
	RouteVersion  string          `json:"route_version,omitempty"`
	ModelRouting  *RouteResponse  `json:"model_routing,omitempty"`
	Account       AccountResponse `json:"account"`
}

type AccountResponse struct {
	AccountToken       string          `json:"account_token,omitempty"`
	SupportID          string          `json:"support_id"`
	UserID             int             `json:"user_id"`
	Username           string          `json:"username"`
	BalanceUSD         float64         `json:"balance_usd"`
	QuotaPoints        int             `json:"quota_points"`
	BalancePoints      float64         `json:"balance_points"`
	InitialGrantPoints float64         `json:"initial_grant_points"`
	LowBalancePoints   float64         `json:"low_balance_points"`
	PointsUnit         string          `json:"points_unit"`
	LowBalance         bool            `json:"low_balance"`
	Contact            ContactResponse `json:"contact"`
}

type ContactResponse struct {
	WeChatID     string `json:"wechat_id,omitempty"`
	WeChatQRURL  string `json:"wechat_qr_url,omitempty"`
	Overseas     string `json:"overseas,omitempty"`
	TopUpMessage string `json:"top_up_message,omitempty"`
}

type RouteResponse struct {
	SchemaVersion   uint32                   `json:"schema_version"`
	RouteVersion    string                   `json:"route_version"`
	ProfileID       string                   `json:"profile_id"`
	Models          map[string]ModelResponse `json:"models"`
	Conversation    []string                 `json:"conversation"`
	Vision          []string                 `json:"vision"`
	ImageGeneration []string                 `json:"image_generation"`
	ImageEditing    []string                 `json:"image_editing"`
}

type ModelResponse struct {
	DisplayName      string   `json:"display_name,omitempty"`
	InputModalities  []string `json:"input_modalities"`
	OutputModalities []string `json:"output_modalities"`
	ToolCalling      bool     `json:"tool_calling"`
	Enabled          bool     `json:"enabled"`
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
		publicServerBase:  strings.TrimRight(cfg.PublicServerBase, "/"),
		trial:             cfg.Trial,
		points:            normalizePoints(cfg.Points),
		routing:           normalizeRouting(cfg.Routing),
		contact:           cfg.Contact,
		trustProxyHeaders: cfg.TrustProxyHeaders,
		clientIPHeader:    cfg.ClientIPHeader,
	}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", h.health)
	mux.HandleFunc("POST /api/register", h.register)
	mux.HandleFunc("GET /api/account/status", h.accountStatus)
	mux.HandleFunc("GET /api/runtime/route", h.runtimeRoute)
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
		rec = h.recordWithDeviceHash(rec, req)
		if err := h.store.Upsert(rec); err != nil {
			log.Printf("account store device hash update failed install=%s user=%d: %v", req.InstallID, rec.UserID, err)
			writeError(w, http.StatusInternalServerError, "account_store_write_failed")
			return
		}
		resp, err := h.registerResponse(r, rec)
		if err != nil {
			log.Printf("account status failed for existing install=%s user=%d: %v", req.InstallID, rec.UserID, err)
			writeError(w, http.StatusBadGateway, "account_status_failed")
			return
		}
		writeJSON(w, http.StatusOK, resp)
		return
	}

	if reqDeviceIDHash := strings.TrimSpace(req.DeviceIDHash); reqDeviceIDHash != "" {
		if rec, ok := h.store.GetByDeviceIDHash(reqDeviceIDHash); ok {
			rec = h.recordWithInstallID(rec, req)
			if err := h.store.Upsert(rec); err != nil {
				log.Printf("account store reinstall link failed old_install=%s new_install=%s user=%d: %v", rec.InstallID, req.InstallID, rec.UserID, err)
				writeError(w, http.StatusInternalServerError, "account_store_write_failed")
				return
			}
			resp, err := h.registerResponse(r, rec)
			if err != nil {
				log.Printf("account status failed for existing device=%s user=%d: %v", reqDeviceIDHash, rec.UserID, err)
				writeError(w, http.StatusBadGateway, "account_status_failed")
				return
			}
			writeJSON(w, http.StatusOK, resp)
			return
		}
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
		DeviceIDHash: strings.TrimSpace(req.DeviceIDHash),
		AccountToken: accountToken,
		SupportID:    supportID(provisioned.User.Username),
		UserID:       provisioned.User.ID,
		Username:     provisioned.User.Username,
		UserGroup:    nonempty(provisioned.User.Group, h.trial.UserGroup),
		RouteProfile: h.profileForGroup(nonempty(provisioned.User.Group, h.trial.UserGroup)),
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

func (h *Handler) runtimeRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		return
	}
	if h.store == nil {
		writeError(w, http.StatusInternalServerError, "account_store_not_configured")
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
	rec = h.refreshRecordFromNewAPI(r.Context(), rec)
	route := h.routeForRecord(rec)
	requestedVersion := strings.TrimSpace(r.URL.Query().Get("version"))
	requestedProfile := strings.TrimSpace(r.URL.Query().Get("profile"))
	if requestedProfile == "" {
		requestedProfile = strings.TrimSpace(r.URL.Query().Get("profile_id"))
	}
	if requestedVersion == h.routing.Version &&
		requestedProfile != "" &&
		requestedProfile == route.ProfileID {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, http.StatusOK, route)
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

func (h *Handler) recordWithDeviceHash(rec accountstore.Record, req RegisterRequest) accountstore.Record {
	if strings.TrimSpace(rec.DeviceIDHash) == "" && strings.TrimSpace(req.DeviceIDHash) != "" {
		rec.DeviceIDHash = strings.TrimSpace(req.DeviceIDHash)
	}
	return rec
}

func (h *Handler) recordWithInstallID(rec accountstore.Record, req RegisterRequest) accountstore.Record {
	rec.InstallID = req.InstallID
	if strings.TrimSpace(rec.DeviceIDHash) == "" {
		rec.DeviceIDHash = strings.TrimSpace(req.DeviceIDHash)
	}
	return rec
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
		DefaultModel:  h.defaultModelForRecord(rec),
		RouteVersion:  h.routing.Version,
		ModelRouting:  h.routeForRecord(rec),
		Account:       account,
	}, nil
}

func (h *Handler) defaultModelForRecord(rec accountstore.Record) string {
	route := h.routeForRecord(rec)
	if route != nil {
		for _, model := range route.Conversation {
			if strings.TrimSpace(model) != "" {
				return strings.TrimSpace(model)
			}
		}
	}
	return h.trial.DefaultModel
}

func (h *Handler) accountResponse(r *http.Request, rec accountstore.Record, includeToken bool) (AccountResponse, error) {
	user, err := h.newAPI.GetUser(r.Context(), rec.UserID)
	if err != nil {
		return AccountResponse{}, err
	}
	rec = h.recordWithNewAPIUser(rec, user)
	token := ""
	if includeToken {
		token = rec.AccountToken
	}
	quota := user.Quota
	balance := newapi.USDFromQuota(quota)
	balancePoints := h.pointsFromUSD(balance)
	lowBalancePoints := h.pointsFromUSD(h.trial.LowBalanceUSD)
	initialGrantPoints := h.pointsFromUSD(h.trial.InitialCreditUSD)
	username := strings.TrimSpace(rec.Username)
	if username == "" {
		username = strings.TrimSpace(user.Username)
	}
	return AccountResponse{
		AccountToken:       token,
		SupportID:          supportID(username),
		UserID:             rec.UserID,
		Username:           username,
		BalanceUSD:         balance,
		QuotaPoints:        quota,
		BalancePoints:      balancePoints,
		InitialGrantPoints: initialGrantPoints,
		LowBalancePoints:   lowBalancePoints,
		PointsUnit:         h.points.Unit,
		LowBalance:         balancePoints <= lowBalancePoints,
		Contact:            h.contactResponse(r),
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
		TopUpMessage: topUpMessage(h.pointsFromUSD(h.trial.InitialCreditUSD), h.points.Unit, wechat),
	}
}

func (h *Handler) absoluteURL(r *http.Request, path string) string {
	if h.publicServerBase != "" {
		return h.publicServerBase + path
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	prefix := ""
	if h.trustProxyHeaders {
		if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")); forwarded != "" {
			scheme = strings.Split(forwarded, ",")[0]
		}
		if forwardedPrefix := strings.TrimSpace(r.Header.Get("X-Forwarded-Prefix")); forwardedPrefix != "" {
			prefix = "/" + strings.Trim(strings.Split(forwardedPrefix, ",")[0], "/")
		}
	}
	return scheme + "://" + r.Host + prefix + path
}

func (h *Handler) refreshRecordFromNewAPI(ctx context.Context, rec accountstore.Record) accountstore.Record {
	if h.newAPI == nil || rec.UserID <= 0 {
		return rec
	}
	user, err := h.newAPI.GetUser(ctx, rec.UserID)
	if err != nil {
		log.Printf("newapi user refresh failed user=%d: %v", rec.UserID, err)
		return rec
	}
	return h.recordWithNewAPIUser(rec, user)
}

func (h *Handler) recordWithNewAPIUser(rec accountstore.Record, user newapi.UserRecord) accountstore.Record {
	updated := false
	if username := strings.TrimSpace(user.Username); username != "" && strings.TrimSpace(rec.Username) == "" {
		rec.Username = username
		updated = true
	}
	if userGroup := strings.TrimSpace(user.Group); userGroup != "" {
		routeProfile := h.profileForGroup(userGroup)
		if rec.UserGroup != userGroup || rec.RouteProfile != routeProfile {
			rec.UserGroup = userGroup
			rec.RouteProfile = routeProfile
			updated = true
		}
	}
	if updated && h.store != nil {
		if err := h.store.Upsert(rec); err != nil {
			log.Printf("account store user sync failed user=%d group=%s: %v", rec.UserID, rec.UserGroup, err)
		}
	}
	return rec
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

func supportID(username string) string {
	if strings.TrimSpace(username) != "" {
		return strings.TrimSpace(username)
	}
	return "yole-support"
}

func normalizePoints(points PointsConfig) PointsConfig {
	if points.PerUSD <= 0 {
		points.PerUSD = 100
	}
	if strings.TrimSpace(points.Unit) == "" {
		points.Unit = "积分"
	} else {
		points.Unit = strings.TrimSpace(points.Unit)
	}
	return points
}

func normalizeRouting(routing RoutingConfig) RoutingConfig {
	if strings.TrimSpace(routing.Version) == "" {
		routing.Version = "2026-06-15.1"
	}
	if strings.TrimSpace(routing.DefaultProfile) == "" {
		routing.DefaultProfile = "yole_standard"
	}
	if len(routing.Profiles) == 0 {
		routing.Profiles = defaultRouteProfiles()
	}
	if len(routing.Models) == 0 {
		routing.Models = defaultRouteModels()
	}
	if _, ok := routing.Profiles[routing.DefaultProfile]; !ok {
		routing.DefaultProfile = firstProfileID(routing.Profiles, "yole_standard")
	}
	return routing
}

func firstProfileID(profiles map[string]RouteProfile, fallback string) string {
	if _, ok := profiles[fallback]; ok {
		return fallback
	}
	for id := range profiles {
		return id
	}
	return fallback
}

func defaultRouteProfiles() map[string]RouteProfile {
	return map[string]RouteProfile{
		"yole_standard": {
			NewAPIGroup:     "yole",
			Conversation:    []string{"deepseek-v4-pro", "gpt-5.5"},
			Vision:          []string{"qwen3.7-plus"},
			ImageGeneration: []string{"gpt-image-2"},
			ImageEditing:    []string{"gpt-image-2"},
		},
	}
}

func defaultRouteModels() map[string]ModelMetadata {
	enabled := true
	return map[string]ModelMetadata{
		"deepseek-v4-pro": textModel("DeepSeek V4 Pro", true, &enabled),
		"qwen3.7-plus":    visionTextModel("Qwen 3.7 Plus Vision", true, &enabled),
		"gpt-5.5":         visionTextModel("GPT-5.5", true, &enabled),
		"gpt-image-2": {
			DisplayName:      "GPT Image 2",
			InputModalities:  []string{"text", "image"},
			OutputModalities: []string{"image"},
			Enabled:          &enabled,
		},
	}
}

func textModel(displayName string, toolCalling bool, enabled *bool) ModelMetadata {
	return ModelMetadata{
		DisplayName:      displayName,
		InputModalities:  []string{"text"},
		OutputModalities: []string{"text"},
		ToolCalling:      toolCalling,
		Enabled:          enabled,
	}
}

func visionTextModel(displayName string, toolCalling bool, enabled *bool) ModelMetadata {
	return ModelMetadata{
		DisplayName:      displayName,
		InputModalities:  []string{"text", "image"},
		OutputModalities: []string{"text"},
		ToolCalling:      toolCalling,
		Enabled:          enabled,
	}
}

func (h *Handler) pointsFromUSD(usd float64) float64 {
	if usd <= 0 {
		return 0
	}
	return math.Round(usd*h.points.PerUSD*10) / 10
}

func (h *Handler) profileForGroup(group string) string {
	group = strings.TrimSpace(group)
	for id, profile := range h.routing.Profiles {
		if strings.EqualFold(strings.TrimSpace(profile.NewAPIGroup), group) {
			return id
		}
	}
	return h.routing.DefaultProfile
}

func (h *Handler) routeForRecord(rec accountstore.Record) *RouteResponse {
	profileID := strings.TrimSpace(rec.RouteProfile)
	if profileID == "" {
		profileID = h.profileForGroup(rec.UserGroup)
	}
	profile, ok := h.routing.Profiles[profileID]
	if !ok {
		profileID = h.routing.DefaultProfile
		profile = h.routing.Profiles[profileID]
	}
	models := make(map[string]ModelResponse, len(h.routing.Models))
	for id, model := range h.routing.Models {
		enabled := true
		if model.Enabled != nil {
			enabled = *model.Enabled
		}
		models[id] = ModelResponse{
			DisplayName:      strings.TrimSpace(model.DisplayName),
			InputModalities:  cleanStringList(model.InputModalities),
			OutputModalities: cleanStringList(model.OutputModalities),
			ToolCalling:      model.ToolCalling,
			Enabled:          enabled,
		}
	}
	return &RouteResponse{
		SchemaVersion:   1,
		RouteVersion:    h.routing.Version,
		ProfileID:       profileID,
		Models:          models,
		Conversation:    cleanStringList(profile.Conversation),
		Vision:          cleanStringList(profile.Vision),
		ImageGeneration: cleanStringList(profile.ImageGeneration),
		ImageEditing:    cleanStringList(profile.ImageEditing),
	}
}

func topUpMessage(points float64, unit string, wechat string) string {
	amount := formatPointAmount(points)
	unit = strings.TrimSpace(unit)
	if unit == "" {
		unit = "积分"
	}
	if strings.TrimSpace(wechat) == "" {
		return fmt.Sprintf("AI %s不足。联系客服可追加 %s %s体验额度。", unit, amount, unit)
	}
	return fmt.Sprintf("AI %s不足。联系客服可追加 %s %s体验额度。微信号：%s", unit, amount, unit, wechat)
}

func formatPointAmount(points float64) string {
	if math.Abs(points-math.Round(points)) < 0.05 {
		return fmt.Sprintf("%.0f", points)
	}
	return fmt.Sprintf("%.1f", points)
}

func cleanStringList(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			out = append(out, value)
		}
	}
	return out
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
