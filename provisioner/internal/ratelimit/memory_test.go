package ratelimit

import (
	"testing"
	"time"
)

func TestMemoryLimiterLimitsHourAndDay(t *testing.T) {
	limiter := NewMemoryLimiter(2, 3)
	now := time.Date(2026, 6, 5, 10, 0, 0, 0, time.UTC)

	if !limiter.Allow("1.2.3.4", now) {
		t.Fatal("first request should pass")
	}
	if !limiter.Allow("1.2.3.4", now.Add(10*time.Minute)) {
		t.Fatal("second hourly request should pass")
	}
	if limiter.Allow("1.2.3.4", now.Add(20*time.Minute)) {
		t.Fatal("third hourly request should be blocked")
	}

	if !limiter.Allow("1.2.3.4", now.Add(2*time.Hour)) {
		t.Fatal("new hour should pass")
	}
	if limiter.Allow("1.2.3.4", now.Add(3*time.Hour)) {
		t.Fatal("daily limit should be blocked")
	}
}

func TestMemoryLimiterResetsDailyWindow(t *testing.T) {
	limiter := NewMemoryLimiter(10, 1)
	now := time.Date(2026, 6, 5, 23, 59, 0, 0, time.UTC)

	if !limiter.Allow("1.2.3.4", now) {
		t.Fatal("first request should pass")
	}
	if limiter.Allow("1.2.3.4", now.Add(30*time.Second)) {
		t.Fatal("same day second request should be blocked")
	}
	if !limiter.Allow("1.2.3.4", now.Add(2*time.Minute)) {
		t.Fatal("next UTC day should pass")
	}
}
