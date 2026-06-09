package ratelimit

import (
	"sync"
	"time"
)

type Limiter interface {
	Allow(key string, now time.Time) bool
}

type MemoryLimiter struct {
	mu          sync.Mutex
	perHour     int
	perDay      int
	hourBuckets map[string]*bucket
	dayBuckets  map[string]*bucket
}

type bucket struct {
	windowStart time.Time
	count       int
}

func NewMemoryLimiter(perHour int, perDay int) *MemoryLimiter {
	return &MemoryLimiter{
		perHour:     perHour,
		perDay:      perDay,
		hourBuckets: make(map[string]*bucket),
		dayBuckets:  make(map[string]*bucket),
	}
}

func (l *MemoryLimiter) Allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	hourBucket := currentBucket(l.hourBuckets, key, now.Truncate(time.Hour))
	dayBucket := currentBucket(l.dayBuckets, key, dayStart(now))
	if hourBucket.count >= l.perHour || dayBucket.count >= l.perDay {
		return false
	}
	hourBucket.count++
	dayBucket.count++
	l.cleanup(now)
	return true
}

func currentBucket(buckets map[string]*bucket, key string, windowStart time.Time) *bucket {
	b, ok := buckets[key]
	if !ok || !b.windowStart.Equal(windowStart) {
		b = &bucket{windowStart: windowStart}
		buckets[key] = b
	}
	return b
}

func (l *MemoryLimiter) cleanup(now time.Time) {
	hourCutoff := now.Add(-2 * time.Hour)
	for key, b := range l.hourBuckets {
		if b.windowStart.Before(hourCutoff) {
			delete(l.hourBuckets, key)
		}
	}
	dayCutoff := dayStart(now).Add(-48 * time.Hour)
	for key, b := range l.dayBuckets {
		if b.windowStart.Before(dayCutoff) {
			delete(l.dayBuckets, key)
		}
	}
}

func dayStart(t time.Time) time.Time {
	y, m, d := t.UTC().Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}
