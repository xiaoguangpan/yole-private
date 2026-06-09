package newapi

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type ClientConfig struct {
	BaseURL        string
	AccessToken    string
	PoolUserID     int
	RequestTimeout time.Duration
}

type Client struct {
	baseURL     string
	accessToken string
	poolUserID  int
	httpClient  *http.Client
}

type TokenCreateRequest struct {
	Name               string `json:"name"`
	ExpiredTime        int64  `json:"expired_time"`
	RemainQuota        int    `json:"remain_quota"`
	UnlimitedQuota     bool   `json:"unlimited_quota"`
	ModelLimitsEnabled bool   `json:"model_limits_enabled"`
	ModelLimits        string `json:"model_limits"`
	AllowIPs           string `json:"allow_ips"`
	Group              string `json:"group"`
	CrossGroupRetry    bool   `json:"cross_group_retry"`
}

type UserCreateRequest struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
	Role        int    `json:"role"`
	Status      int    `json:"status"`
}

type UserUpdateRequest struct {
	ID          int    `json:"id"`
	Username    string `json:"username"`
	Password    string `json:"password,omitempty"`
	DisplayName string `json:"display_name"`
	Role        int    `json:"role"`
	Status      int    `json:"status"`
	Group       string `json:"group"`
}

type UserManageRequest struct {
	ID     int    `json:"id"`
	Action string `json:"action"`
	Value  int    `json:"value"`
	Mode   string `json:"mode"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type UserRecord struct {
	ID           int    `json:"id"`
	Username     string `json:"username"`
	DisplayName  string `json:"display_name"`
	Role         int    `json:"role"`
	Status       int    `json:"status"`
	Group        string `json:"group"`
	Quota        int    `json:"quota"`
	UsedQuota    int    `json:"used_quota"`
	RequestCount int    `json:"request_count"`
}

type UserSession struct {
	UserID  int
	Cookies []*http.Cookie
}

type ProvisionAccountRequest struct {
	Username        string
	Password        string
	DisplayName     string
	UserGroup       string
	TokenName       string
	TokenGroup      string
	InitialQuota    int
	AllowedModels   []string
	DefaultModel    string
	CrossGroupRetry bool
}

type ProvisionedAccount struct {
	User          UserRecord
	ConsumerKey   string
	Token         TokenRecord
	AccountStatus UserRecord
}

type TokenRecord struct {
	ID                 int    `json:"id"`
	UserID             int    `json:"user_id"`
	Key                string `json:"key"`
	Status             int    `json:"status"`
	Name               string `json:"name"`
	CreatedTime        int64  `json:"created_time"`
	ExpiredTime        int64  `json:"expired_time"`
	RemainQuota        int    `json:"remain_quota"`
	UnlimitedQuota     bool   `json:"unlimited_quota"`
	ModelLimitsEnabled bool   `json:"model_limits_enabled"`
	ModelLimits        string `json:"model_limits"`
	Group              string `json:"group"`
}

type pageData[T any] struct {
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
	Total    int `json:"total"`
	Items    []T `json:"items"`
}

type apiResponse[T any] struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

func NewClient(cfg ClientConfig) *Client {
	timeout := cfg.RequestTimeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &Client{
		baseURL:     strings.TrimRight(cfg.BaseURL, "/"),
		accessToken: strings.TrimSpace(cfg.AccessToken),
		poolUserID:  cfg.PoolUserID,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *Client) CreateTokenAndGetKey(ctx context.Context, req TokenCreateRequest) (string, TokenRecord, error) {
	if err := c.CreateToken(ctx, req); err != nil {
		return "", TokenRecord{}, err
	}
	record, err := c.FindTokenByName(ctx, req.Name)
	if err != nil {
		return "", TokenRecord{}, err
	}
	key, err := c.GetTokenKey(ctx, record.ID)
	if err != nil {
		return "", TokenRecord{}, err
	}
	return key, record, nil
}

func (c *Client) ProvisionAccount(ctx context.Context, req ProvisionAccountRequest) (ProvisionedAccount, error) {
	if err := c.CreateUser(ctx, UserCreateRequest{
		Username:    req.Username,
		Password:    req.Password,
		DisplayName: fallback(req.DisplayName, req.Username),
		Role:        1,
		Status:      1,
	}); err != nil {
		return ProvisionedAccount{}, err
	}

	user, err := c.FindUserByUsername(ctx, req.Username)
	if err != nil {
		return ProvisionedAccount{}, err
	}
	if strings.TrimSpace(req.UserGroup) != "" {
		user.Group = strings.TrimSpace(req.UserGroup)
		if err := c.UpdateUser(ctx, UserUpdateRequest{
			ID:          user.ID,
			Username:    user.Username,
			DisplayName: fallback(user.DisplayName, user.Username),
			Role:        user.Role,
			Status:      user.Status,
			Group:       user.Group,
		}); err != nil {
			return ProvisionedAccount{}, err
		}
	}
	if req.InitialQuota > 0 {
		if err := c.AddUserQuota(ctx, user.ID, req.InitialQuota); err != nil {
			return ProvisionedAccount{}, err
		}
	}

	session, err := c.Login(ctx, req.Username, req.Password)
	if err != nil {
		return ProvisionedAccount{}, err
	}
	key, token, err := c.CreateTokenAndGetKeyForSession(ctx, session, TokenCreateRequest{
		Name:               req.TokenName,
		ExpiredTime:        -1,
		RemainQuota:        0,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: len(req.AllowedModels) > 0,
		ModelLimits:        strings.Join(req.AllowedModels, ","),
		AllowIPs:           "",
		Group:              strings.TrimSpace(req.TokenGroup),
		CrossGroupRetry:    req.CrossGroupRetry,
	})
	if err != nil {
		return ProvisionedAccount{}, err
	}
	status, err := c.GetUser(ctx, user.ID)
	if err != nil {
		return ProvisionedAccount{}, err
	}
	return ProvisionedAccount{
		User:          user,
		ConsumerKey:   key,
		Token:         token,
		AccountStatus: status,
	}, nil
}

func (c *Client) CreateToken(ctx context.Context, token TokenCreateRequest) error {
	var resp apiResponse[json.RawMessage]
	if err := c.doJSON(ctx, http.MethodPost, "/api/token/", nil, token, &resp); err != nil {
		return err
	}
	if !resp.Success {
		return fmt.Errorf("newapi create token failed: %s", emptyMessage(resp.Message))
	}
	return nil
}

func (c *Client) CreateTokenAndGetKeyForSession(ctx context.Context, session UserSession, req TokenCreateRequest) (string, TokenRecord, error) {
	if err := c.CreateTokenForSession(ctx, session, req); err != nil {
		return "", TokenRecord{}, err
	}
	record, err := c.FindTokenByNameForSession(ctx, session, req.Name)
	if err != nil {
		return "", TokenRecord{}, err
	}
	key, err := c.GetTokenKeyForSession(ctx, session, record.ID)
	if err != nil {
		return "", TokenRecord{}, err
	}
	return key, record, nil
}

func (c *Client) CreateTokenForSession(ctx context.Context, session UserSession, token TokenCreateRequest) error {
	var resp apiResponse[json.RawMessage]
	if err := c.doJSONSession(ctx, http.MethodPost, "/api/token/", nil, token, session, &resp); err != nil {
		return err
	}
	if !resp.Success {
		return fmt.Errorf("newapi create token failed: %s", emptyMessage(resp.Message))
	}
	return nil
}

func (c *Client) FindTokenByName(ctx context.Context, name string) (TokenRecord, error) {
	query := url.Values{}
	query.Set("keyword", name)
	query.Set("p", "1")
	query.Set("page_size", "10")

	var resp apiResponse[pageData[TokenRecord]]
	if err := c.doJSON(ctx, http.MethodGet, "/api/token/search", query, nil, &resp); err != nil {
		return TokenRecord{}, err
	}
	if !resp.Success {
		return TokenRecord{}, fmt.Errorf("newapi search token failed: %s", emptyMessage(resp.Message))
	}
	for _, item := range resp.Data.Items {
		if item.Name == name {
			return item, nil
		}
	}
	return TokenRecord{}, fmt.Errorf("newapi token %q not found after create", name)
}

func (c *Client) FindTokenByNameForSession(ctx context.Context, session UserSession, name string) (TokenRecord, error) {
	query := url.Values{}
	query.Set("keyword", name)
	query.Set("p", "1")
	query.Set("page_size", "10")

	var resp apiResponse[pageData[TokenRecord]]
	if err := c.doJSONSession(ctx, http.MethodGet, "/api/token/search", query, nil, session, &resp); err != nil {
		return TokenRecord{}, err
	}
	if !resp.Success {
		return TokenRecord{}, fmt.Errorf("newapi search token failed: %s", emptyMessage(resp.Message))
	}
	for _, item := range resp.Data.Items {
		if item.Name == name {
			return item, nil
		}
	}
	return TokenRecord{}, fmt.Errorf("newapi token %q not found after create", name)
}

func (c *Client) GetTokenKey(ctx context.Context, id int) (string, error) {
	if id <= 0 {
		return "", errors.New("token id must be positive")
	}
	var resp apiResponse[struct {
		Key string `json:"key"`
	}]
	path := "/api/token/" + strconv.Itoa(id) + "/key"
	if err := c.doJSON(ctx, http.MethodPost, path, nil, nil, &resp); err != nil {
		return "", err
	}
	if !resp.Success {
		return "", fmt.Errorf("newapi get token key failed: %s", emptyMessage(resp.Message))
	}
	if resp.Data.Key == "" {
		return "", errors.New("newapi returned empty token key")
	}
	return resp.Data.Key, nil
}

func (c *Client) GetTokenKeyForSession(ctx context.Context, session UserSession, id int) (string, error) {
	if id <= 0 {
		return "", errors.New("token id must be positive")
	}
	var resp apiResponse[struct {
		Key string `json:"key"`
	}]
	path := "/api/token/" + strconv.Itoa(id) + "/key"
	if err := c.doJSONSession(ctx, http.MethodPost, path, nil, nil, session, &resp); err != nil {
		return "", err
	}
	if !resp.Success {
		return "", fmt.Errorf("newapi get token key failed: %s", emptyMessage(resp.Message))
	}
	if resp.Data.Key == "" {
		return "", errors.New("newapi returned empty token key")
	}
	return resp.Data.Key, nil
}

func (c *Client) CreateUser(ctx context.Context, user UserCreateRequest) error {
	var resp apiResponse[json.RawMessage]
	if err := c.doJSON(ctx, http.MethodPost, "/api/user/", nil, user, &resp); err != nil {
		return err
	}
	if !resp.Success {
		return fmt.Errorf("newapi create user failed: %s", emptyMessage(resp.Message))
	}
	return nil
}

func (c *Client) FindUserByUsername(ctx context.Context, username string) (UserRecord, error) {
	query := url.Values{}
	query.Set("keyword", username)
	query.Set("p", "1")
	query.Set("page_size", "10")

	var resp apiResponse[pageData[UserRecord]]
	if err := c.doJSON(ctx, http.MethodGet, "/api/user/search", query, nil, &resp); err != nil {
		return UserRecord{}, err
	}
	if !resp.Success {
		return UserRecord{}, fmt.Errorf("newapi search user failed: %s", emptyMessage(resp.Message))
	}
	for _, item := range resp.Data.Items {
		if item.Username == username {
			return item, nil
		}
	}
	return UserRecord{}, fmt.Errorf("newapi user %q not found after create", username)
}

func (c *Client) UpdateUser(ctx context.Context, user UserUpdateRequest) error {
	var resp apiResponse[json.RawMessage]
	if err := c.doJSON(ctx, http.MethodPut, "/api/user/", nil, user, &resp); err != nil {
		return err
	}
	if !resp.Success {
		return fmt.Errorf("newapi update user failed: %s", emptyMessage(resp.Message))
	}
	return nil
}

func (c *Client) AddUserQuota(ctx context.Context, userID int, quota int) error {
	if userID <= 0 {
		return errors.New("user id must be positive")
	}
	if quota <= 0 {
		return nil
	}
	var resp apiResponse[json.RawMessage]
	req := UserManageRequest{ID: userID, Action: "add_quota", Value: quota, Mode: "add"}
	if err := c.doJSON(ctx, http.MethodPost, "/api/user/manage", nil, req, &resp); err != nil {
		return err
	}
	if !resp.Success {
		return fmt.Errorf("newapi add quota failed: %s", emptyMessage(resp.Message))
	}
	return nil
}

func (c *Client) GetUser(ctx context.Context, userID int) (UserRecord, error) {
	if userID <= 0 {
		return UserRecord{}, errors.New("user id must be positive")
	}
	var resp apiResponse[UserRecord]
	path := "/api/user/" + strconv.Itoa(userID)
	if err := c.doJSON(ctx, http.MethodGet, path, nil, nil, &resp); err != nil {
		return UserRecord{}, err
	}
	if !resp.Success {
		return UserRecord{}, fmt.Errorf("newapi get user failed: %s", emptyMessage(resp.Message))
	}
	return resp.Data, nil
}

func (c *Client) Login(ctx context.Context, username string, password string) (UserSession, error) {
	var resp apiResponse[struct {
		ID int `json:"id"`
	}]
	cookies, err := c.doJSONNoAuth(ctx, http.MethodPost, "/api/user/login", nil, LoginRequest{
		Username: username,
		Password: password,
	}, &resp)
	if err != nil {
		return UserSession{}, err
	}
	if !resp.Success {
		return UserSession{}, fmt.Errorf("newapi login failed: %s", emptyMessage(resp.Message))
	}
	if resp.Data.ID <= 0 {
		return UserSession{}, errors.New("newapi login returned missing user id")
	}
	if len(cookies) == 0 {
		return UserSession{}, errors.New("newapi login returned no session cookie")
	}
	return UserSession{UserID: resp.Data.ID, Cookies: cookies}, nil
}

func (c *Client) doJSON(ctx context.Context, method string, path string, query url.Values, body any, out any) error {
	_, err := c.doJSONAuth(ctx, method, path, query, body, requestAuth{
		accessToken: c.accessToken,
		userID:      c.poolUserID,
	}, out)
	return err
}

func (c *Client) doJSONSession(ctx context.Context, method string, path string, query url.Values, body any, session UserSession, out any) error {
	_, err := c.doJSONAuth(ctx, method, path, query, body, requestAuth{
		userID:  session.UserID,
		cookies: session.Cookies,
	}, out)
	return err
}

func (c *Client) doJSONNoAuth(ctx context.Context, method string, path string, query url.Values, body any, out any) ([]*http.Cookie, error) {
	return c.doJSONAuth(ctx, method, path, query, body, requestAuth{}, out)
}

type requestAuth struct {
	accessToken string
	userID      int
	cookies     []*http.Cookie
}

func (c *Client) doJSONAuth(ctx context.Context, method string, path string, query url.Values, body any, auth requestAuth, out any) ([]*http.Cookie, error) {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(payload)
	}

	endpoint := c.baseURL + path
	if len(query) > 0 {
		endpoint += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(auth.accessToken) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(auth.accessToken))
	}
	if auth.userID > 0 {
		req.Header.Set("New-Api-User", strconv.Itoa(auth.userID))
	}
	for _, cookie := range auth.cookies {
		req.AddCookie(cookie)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("newapi %s %s returned %d: %s", method, path, resp.StatusCode, strings.TrimSpace(string(data)))
	}
	if out == nil {
		return resp.Cookies(), nil
	}
	if err := json.Unmarshal(data, out); err != nil {
		return nil, fmt.Errorf("decode newapi response: %w", err)
	}
	return resp.Cookies(), nil
}

func emptyMessage(message string) string {
	if strings.TrimSpace(message) == "" {
		return "empty response message"
	}
	return message
}

func fallback(value string, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}

func QuotaFromUSD(usd float64) int {
	if usd <= 0 {
		return 0
	}
	return int(math.Round(usd * 500000))
}

func USDFromQuota(quota int) float64 {
	if quota <= 0 {
		return 0
	}
	return float64(quota) / 500000
}

func RandomPassword() (string, error) {
	var bytes [12]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	out := make([]byte, len(bytes))
	for i, b := range bytes {
		out[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(out), nil
}
