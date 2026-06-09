package accountstore

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Record struct {
	InstallID    string `json:"install_id"`
	AccountToken string `json:"account_token"`
	SupportID    string `json:"support_id"`
	UserID       int    `json:"user_id"`
	Username     string `json:"username"`
	ConsumerKey  string `json:"consumer_key"`
	TokenID      int    `json:"token_id"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

type Store struct {
	path string
	mu   sync.Mutex
	data map[string]Record
}

func New(path string) (*Store, error) {
	if path == "" {
		return nil, errors.New("account store path is required")
	}
	store := &Store{path: path, data: map[string]Record{}}
	if err := store.load(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *Store) GetByInstallID(installID string) (Record, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, ok := s.data[installID]
	return rec, ok
}

func (s *Store) GetByAccountToken(token string) (Record, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, rec := range s.data {
		if rec.AccountToken == token {
			return rec, true
		}
	}
	return Record{}, false
}

func (s *Store) Upsert(rec Record) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC().Format(time.RFC3339)
	if rec.CreatedAt == "" {
		rec.CreatedAt = now
	}
	rec.UpdatedAt = now
	s.data[rec.InstallID] = rec
	return s.saveLocked()
}

func (s *Store) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if len(data) == 0 {
		return nil
	}
	var records []Record
	if err := json.Unmarshal(data, &records); err != nil {
		return err
	}
	for _, rec := range records {
		if rec.InstallID != "" {
			s.data[rec.InstallID] = rec
		}
	}
	return nil
}

func (s *Store) saveLocked() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil && filepath.Dir(s.path) != "." {
		return err
	}
	records := make([]Record, 0, len(s.data))
	for _, rec := range s.data {
		records = append(records, rec)
	}
	data, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func NewAccountToken() (string, error) {
	var bytes [24]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return "yole_acct_" + hex.EncodeToString(bytes[:]), nil
}
