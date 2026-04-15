package middleware

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// authLimiter is a minimal per-IP token-bucket rate limiter used to slow down
// password brute-force and invite-token guessing against /auth/* endpoints.
// It is intentionally simple (single-process, in-memory) — enough to blunt
// opportunistic attacks without pulling in a new dependency. For a
// multi-instance deployment replace with a shared-store limiter.
type authLimiter struct {
	capacity   float64
	refillRate float64 // tokens per second
	mu         sync.Mutex
	buckets    map[string]*bucket
	lastSweep  time.Time
}

type bucket struct {
	tokens float64
	last   time.Time
}

var defaultAuthLimiter = &authLimiter{
	capacity:   10, // burst
	refillRate: 10.0 / 60.0,
	buckets:    map[string]*bucket{},
	lastSweep:  time.Now(),
}

func (l *authLimiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	// Opportunistic sweep to cap memory.
	if now.Sub(l.lastSweep) > 10*time.Minute {
		for k, b := range l.buckets {
			if now.Sub(b.last) > 30*time.Minute {
				delete(l.buckets, k)
			}
		}
		l.lastSweep = now
	}

	b, ok := l.buckets[key]
	if !ok {
		l.buckets[key] = &bucket{tokens: l.capacity - 1, last: now}
		return true
	}
	elapsed := now.Sub(b.last).Seconds()
	b.tokens += elapsed * l.refillRate
	if b.tokens > l.capacity {
		b.tokens = l.capacity
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// clientIP returns a best-effort client address. chimw.RealIP has already
// normalised X-Forwarded-For onto r.RemoteAddr when the server sits behind a
// trusted proxy; when it doesn't, r.RemoteAddr is the direct peer.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// AuthLimiter rate-limits auth-sensitive endpoints (login, change-password,
// invite-accept). Returns 429 when the caller exceeds the budget.
func AuthLimiter() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !defaultAuthLimiter.allow(clientIP(r), time.Now()) {
				w.Header().Set("Retry-After", "60")
				http.Error(w, "too many requests", http.StatusTooManyRequests)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
