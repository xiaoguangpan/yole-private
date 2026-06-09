package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server    ServerConfig    `yaml:"server"`
	NewAPI    NewAPIConfig    `yaml:"newapi"`
	Trial     TrialConfig     `yaml:"trial"`
	Contact   ContactConfig   `yaml:"contact"`
	RateLimit RateLimitConfig `yaml:"rate_limit"`
	Security  SecurityConfig  `yaml:"security"`
	Storage   StorageConfig   `yaml:"storage"`
}

type ServerConfig struct {
	Listen              string `yaml:"listen"`
	ReadTimeoutSeconds  int    `yaml:"read_timeout_seconds"`
	WriteTimeoutSeconds int    `yaml:"write_timeout_seconds"`
}

type NewAPIConfig struct {
	BaseURL               string `yaml:"base_url"`
	AdminToken            string `yaml:"admin_token"`
	AdminUserID           int    `yaml:"admin_user_id"`
	PoolUserID            int    `yaml:"pool_user_id"`
	PublicV1BaseURL       string `yaml:"public_v1_base_url"`
	RequestTimeoutSeconds int    `yaml:"request_timeout_seconds"`
}

type TrialConfig struct {
	TokenPrefix      string   `yaml:"token_prefix"`
	InitialCreditUSD float64  `yaml:"initial_credit_usd"`
	LowBalanceUSD    float64  `yaml:"low_balance_usd"`
	UserGroup        string   `yaml:"user_group"`
	TokenGroup       string   `yaml:"token_group"`
	DefaultModel     string   `yaml:"default_model"`
	AllowedModels    []string `yaml:"allowed_models"`
	// Legacy fields kept so older config files still parse.
	Quota      int    `yaml:"quota"`
	ExpireDays int    `yaml:"expire_days"`
	Group      string `yaml:"group"`
}

type ContactConfig struct {
	WeChatID     string `yaml:"wechat_id"`
	WeChatQRPath string `yaml:"wechat_qr_path"`
	Overseas     string `yaml:"overseas"`
}

type RateLimitConfig struct {
	PerIPPerHour int `yaml:"per_ip_per_hour"`
	PerIPPerDay  int `yaml:"per_ip_per_day"`
}

type SecurityConfig struct {
	TrustProxyHeaders bool   `yaml:"trust_proxy_headers"`
	ClientIPHeader    string `yaml:"client_ip_header"`
}

type StorageConfig struct {
	AccountStorePath string `yaml:"account_store_path"`
}

func Load(path string) (Config, error) {
	cfg := defaultConfig()
	if path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			if !errors.Is(err, os.ErrNotExist) {
				return Config{}, err
			}
		} else if err := yaml.Unmarshal(data, &cfg); err != nil {
			return Config{}, err
		}
	}
	applyEnv(&cfg)
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func defaultConfig() Config {
	return Config{
		Server: ServerConfig{
			Listen:              "127.0.0.1:8080",
			ReadTimeoutSeconds:  15,
			WriteTimeoutSeconds: 30,
		},
		NewAPI: NewAPIConfig{
			RequestTimeoutSeconds: 30,
		},
		Trial: TrialConfig{
			TokenPrefix:      "yole",
			InitialCreditUSD: 50,
			LowBalanceUSD:    5,
			UserGroup:        "yole",
			TokenGroup:       "yole",
			DefaultModel:     "gpt-5.5",
			AllowedModels:    []string{"gpt-5.5"},
			Group:            "yole",
		},
		RateLimit: RateLimitConfig{
			PerIPPerHour: 3,
			PerIPPerDay:  10,
		},
		Security: SecurityConfig{
			ClientIPHeader: "X-Forwarded-For",
		},
		Storage: StorageConfig{
			AccountStorePath: "accounts.json",
		},
	}
}

func applyEnv(cfg *Config) {
	setString(&cfg.Server.Listen, "YOLE_PROVISIONER_LISTEN")
	setString(&cfg.NewAPI.BaseURL, "YOLE_NEWAPI_BASE_URL")
	setString(&cfg.NewAPI.AdminToken, "YOLE_NEWAPI_ADMIN_TOKEN")
	setInt(&cfg.NewAPI.AdminUserID, "YOLE_NEWAPI_ADMIN_USER_ID")
	setInt(&cfg.NewAPI.PoolUserID, "YOLE_NEWAPI_POOL_USER_ID")
	setString(&cfg.NewAPI.PublicV1BaseURL, "YOLE_NEWAPI_PUBLIC_V1_BASE_URL")
	setString(&cfg.Trial.TokenPrefix, "YOLE_TRIAL_TOKEN_PREFIX")
	setFloat(&cfg.Trial.InitialCreditUSD, "YOLE_TRIAL_INITIAL_CREDIT_USD")
	setFloat(&cfg.Trial.LowBalanceUSD, "YOLE_TRIAL_LOW_BALANCE_USD")
	setString(&cfg.Trial.UserGroup, "YOLE_TRIAL_USER_GROUP")
	setString(&cfg.Trial.TokenGroup, "YOLE_TRIAL_TOKEN_GROUP")
	setString(&cfg.Trial.DefaultModel, "YOLE_TRIAL_DEFAULT_MODEL")
	setString(&cfg.Trial.Group, "YOLE_TRIAL_GROUP")
	if value := strings.TrimSpace(os.Getenv("YOLE_TRIAL_ALLOWED_MODELS")); value != "" {
		parts := strings.Split(value, ",")
		models := make([]string, 0, len(parts))
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if part != "" {
				models = append(models, part)
			}
		}
		cfg.Trial.AllowedModels = models
	}
	setInt(&cfg.RateLimit.PerIPPerHour, "YOLE_RATE_LIMIT_PER_IP_PER_HOUR")
	setInt(&cfg.RateLimit.PerIPPerDay, "YOLE_RATE_LIMIT_PER_IP_PER_DAY")
	if value := strings.TrimSpace(os.Getenv("YOLE_TRUST_PROXY_HEADERS")); value != "" {
		cfg.Security.TrustProxyHeaders = value == "1" || strings.EqualFold(value, "true")
	}
	setString(&cfg.Security.ClientIPHeader, "YOLE_CLIENT_IP_HEADER")
	setString(&cfg.Contact.WeChatID, "YOLE_CONTACT_WECHAT_ID")
	setString(&cfg.Contact.WeChatQRPath, "YOLE_CONTACT_WECHAT_QR_PATH")
	setString(&cfg.Contact.Overseas, "YOLE_CONTACT_OVERSEAS")
	setString(&cfg.Storage.AccountStorePath, "YOLE_ACCOUNT_STORE_PATH")
}

func setString(dst *string, name string) {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		*dst = value
	}
}

func setInt(dst *int, name string) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return
	}
	parsed, err := strconv.Atoi(value)
	if err == nil {
		*dst = parsed
	}
}

func setFloat(dst *float64, name string) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err == nil {
		*dst = parsed
	}
}

func (cfg *Config) Validate() error {
	if cfg.Server.Listen == "" {
		return errors.New("server.listen is required")
	}
	if err := validateHTTPURL("newapi.base_url", cfg.NewAPI.BaseURL); err != nil {
		return err
	}
	if err := validateHTTPURL("newapi.public_v1_base_url", cfg.NewAPI.PublicV1BaseURL); err != nil {
		return err
	}
	if strings.TrimSpace(cfg.NewAPI.AdminToken) == "" {
		return errors.New("newapi.admin_token is required")
	}
	if cfg.NewAPI.AdminUserID <= 0 {
		cfg.NewAPI.AdminUserID = cfg.NewAPI.PoolUserID
	}
	if cfg.NewAPI.AdminUserID <= 0 {
		return errors.New("newapi.admin_user_id must be positive")
	}
	if cfg.Trial.TokenPrefix == "" {
		return errors.New("trial.token_prefix is required")
	}
	if cfg.Trial.InitialCreditUSD < 0 {
		return errors.New("trial.initial_credit_usd must be non-negative")
	}
	if cfg.Trial.LowBalanceUSD < 0 {
		return errors.New("trial.low_balance_usd must be non-negative")
	}
	if strings.TrimSpace(cfg.Trial.UserGroup) == "" {
		cfg.Trial.UserGroup = nonemptyFallback(cfg.Trial.Group, "yole")
	}
	if strings.TrimSpace(cfg.Trial.TokenGroup) == "" {
		cfg.Trial.TokenGroup = nonemptyFallback(cfg.Trial.Group, "yole")
	}
	if strings.TrimSpace(cfg.Trial.DefaultModel) == "" {
		return errors.New("trial.default_model is required")
	}
	if len(cfg.Trial.AllowedModels) == 0 {
		cfg.Trial.AllowedModels = []string{cfg.Trial.DefaultModel}
	}
	if cfg.RateLimit.PerIPPerHour <= 0 {
		return errors.New("rate_limit.per_ip_per_hour must be positive")
	}
	if cfg.RateLimit.PerIPPerDay <= 0 {
		return errors.New("rate_limit.per_ip_per_day must be positive")
	}
	if cfg.RateLimit.PerIPPerDay < cfg.RateLimit.PerIPPerHour {
		return errors.New("rate_limit.per_ip_per_day must be >= per_ip_per_hour")
	}
	if strings.TrimSpace(cfg.Storage.AccountStorePath) == "" {
		cfg.Storage.AccountStorePath = "accounts.json"
	}
	return nil
}

func validateHTTPURL(name string, raw string) error {
	if strings.TrimSpace(raw) == "" {
		return fmt.Errorf("%s is required", name)
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("%s is invalid: %w", name, err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("%s must use http or https", name)
	}
	if parsed.Host == "" {
		return fmt.Errorf("%s must include host", name)
	}
	return nil
}

func (s ServerConfig) ReadTimeout() time.Duration {
	return secondsOrDefault(s.ReadTimeoutSeconds, 15)
}

func (s ServerConfig) WriteTimeout() time.Duration {
	return secondsOrDefault(s.WriteTimeoutSeconds, 30)
}

func (n NewAPIConfig) RequestTimeout() time.Duration {
	return secondsOrDefault(n.RequestTimeoutSeconds, 30)
}

func secondsOrDefault(seconds int, fallback int) time.Duration {
	if seconds <= 0 {
		seconds = fallback
	}
	return time.Duration(seconds) * time.Second
}

func nonemptyFallback(value string, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}
