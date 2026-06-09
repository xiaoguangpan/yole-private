package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"yole/provisioner/internal/accountstore"
	"yole/provisioner/internal/config"
	"yole/provisioner/internal/newapi"
	"yole/provisioner/internal/ratelimit"
	"yole/provisioner/internal/register"
)

func main() {
	configPath := flag.String("config", "config.yaml", "path to provisioner config")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	client := newapi.NewClient(newapi.ClientConfig{
		BaseURL:        cfg.NewAPI.BaseURL,
		AccessToken:    cfg.NewAPI.AdminToken,
		PoolUserID:     cfg.NewAPI.AdminUserID,
		RequestTimeout: cfg.NewAPI.RequestTimeout(),
	})
	accounts, err := accountstore.New(cfg.Storage.AccountStorePath)
	if err != nil {
		log.Fatalf("open account store: %v", err)
	}

	limiter := ratelimit.NewMemoryLimiter(cfg.RateLimit.PerIPPerHour, cfg.RateLimit.PerIPPerDay)
	handler := register.NewHandler(register.HandlerConfig{
		NewAPI:     client,
		Store:      accounts,
		Limiter:    limiter,
		PublicBase: cfg.NewAPI.PublicV1BaseURL,
		Trial: register.TrialConfig{
			TokenPrefix:      cfg.Trial.TokenPrefix,
			InitialCreditUSD: cfg.Trial.InitialCreditUSD,
			LowBalanceUSD:    cfg.Trial.LowBalanceUSD,
			UserGroup:        cfg.Trial.UserGroup,
			TokenGroup:       cfg.Trial.TokenGroup,
			DefaultModel:     cfg.Trial.DefaultModel,
			AllowedModels:    cfg.Trial.AllowedModels,
		},
		Contact: register.ContactConfig{
			WeChatID:     cfg.Contact.WeChatID,
			WeChatQRPath: cfg.Contact.WeChatQRPath,
			Overseas:     cfg.Contact.Overseas,
		},
		TrustProxyHeaders: cfg.Security.TrustProxyHeaders,
		ClientIPHeader:    cfg.Security.ClientIPHeader,
	})

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	server := &http.Server{
		Addr:              cfg.Server.Listen,
		Handler:           mux,
		ReadHeaderTimeout: cfg.Server.ReadTimeout(),
		ReadTimeout:       cfg.Server.ReadTimeout(),
		WriteTimeout:      cfg.Server.WriteTimeout(),
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("yole-provisioner listening on %s", cfg.Server.Listen)
		errCh <- server.ListenAndServe()
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case sig := <-stop:
		log.Printf("received %s, shutting down", sig)
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("shutdown: %v", err)
	}
}
