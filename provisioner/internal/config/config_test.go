package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfigAndEnvOverride(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")
	data := []byte(`
server:
  listen: "127.0.0.1:9090"
newapi:
  base_url: "https://example.com"
  admin_token: "from-file"
  pool_user_id: 5
  public_v1_base_url: "https://example.com/v1"
trial:
  default_model: "gpt-5.5"
  allowed_models: ["gpt-5.5"]
`)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("YOLE_NEWAPI_ADMIN_TOKEN", "from-env")
	t.Setenv("YOLE_TRIAL_ALLOWED_MODELS", "gpt-5.5,gpt-5-mini")

	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.NewAPI.AdminToken != "from-env" {
		t.Fatalf("expected env override, got %q", cfg.NewAPI.AdminToken)
	}
	if len(cfg.Trial.AllowedModels) != 2 {
		t.Fatalf("unexpected allowed models: %#v", cfg.Trial.AllowedModels)
	}
}

func TestLoadRejectsMissingSecrets(t *testing.T) {
	_, err := Load("")
	if err == nil {
		t.Fatal("expected validation error")
	}
}
