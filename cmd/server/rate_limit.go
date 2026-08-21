package main

import (
	"container/list"
	"fmt"
	"net/http"
	"sync"
	"time"
)

const defaultRateLimiterCapacity = 4096

type rateLimitRule struct {
	method string
	path   string
}

type rateLimitConfig struct {
	window   time.Duration
	limits   map[rateLimitRule]int
	capacity int
	now      func() time.Time
	resolver *clientAddressResolver
}

type rateLimitClientKey struct {
	rule   rateLimitRule
	client string
}

type rateLimitEntry struct {
	windowStart time.Time
	count       int
	recency     *list.Element
}

type rateLimiter struct {
	mu      sync.Mutex
	config  rateLimitConfig
	clients map[rateLimitClientKey]*rateLimitEntry
	recency *list.List
}

func defaultRateLimitConfig(resolver *clientAddressResolver) rateLimitConfig {
	return rateLimitConfig{
		window: time.Minute,
		limits: map[rateLimitRule]int{
			{method: http.MethodPost, path: "/api/evaluate"}: 240,
			{method: http.MethodPost, path: "/api/validate"}: 120,
		},
		capacity: defaultRateLimiterCapacity,
		now:      time.Now,
		resolver: resolver,
	}
}

func (config rateLimitConfig) timeNow() time.Time {
	if config.now != nil {
		return config.now()
	}
	return time.Now()
}

func newRateLimiter(config rateLimitConfig) *rateLimiter {
	if config.capacity <= 0 {
		config.capacity = defaultRateLimiterCapacity
	}
	if config.resolver == nil {
		config.resolver = newClientAddressResolver(nil, nil)
	}
	return &rateLimiter{
		config:  config,
		clients: make(map[rateLimitClientKey]*rateLimitEntry),
		recency: list.New(),
	}
}

func rateLimitAPI(next http.Handler, config rateLimitConfig) http.Handler {
	limiter := newRateLimiter(config)
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if !limiter.allow(request) {
			writer.Header().Set("Retry-After", fmt.Sprintf("%.0f", config.window.Seconds()))
			writeJSON(writer, http.StatusTooManyRequests, map[string]string{"error": "Too many requests"})
			return
		}
		next.ServeHTTP(writer, request)
	})
}

func (limiter *rateLimiter) allow(request *http.Request) bool {
	rule := rateLimitRule{method: request.Method, path: request.URL.Path}
	limit, ok := limiter.config.limits[rule]
	if !ok || limit <= 0 {
		return true
	}
	client := limiter.config.resolver.resolve(request).address
	if client == "" {
		client = "unknown"
	}
	key := rateLimitClientKey{rule: rule, client: client}
	now := limiter.config.timeNow()

	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	entry, found := limiter.clients[key]
	if !found {
		if len(limiter.clients) >= limiter.config.capacity {
			limiter.evictLeastRecentlyUsed()
		}
		entry = &rateLimitEntry{}
		entry.recency = limiter.recency.PushFront(key)
		limiter.clients[key] = entry
	} else {
		limiter.recency.MoveToFront(entry.recency)
	}
	if entry.windowStart.IsZero() || now.Before(entry.windowStart) || now.Sub(entry.windowStart) >= limiter.config.window {
		entry.windowStart = now
		entry.count = 0
	}
	entry.count++
	return entry.count <= limit
}

func (limiter *rateLimiter) evictLeastRecentlyUsed() {
	oldest := limiter.recency.Back()
	if oldest == nil {
		return
	}
	key := oldest.Value.(rateLimitClientKey)
	delete(limiter.clients, key)
	limiter.recency.Remove(oldest)
}
