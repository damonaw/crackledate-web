package main

import (
	"fmt"
	"strconv"
	"strings"
)

const (
	defaultMaxConcurrentHintSolves = 4
	minimumConcurrentHintSolves    = 1
	maximumConcurrentHintSolves    = 16
)

type runtimeSecurityConfig struct {
	resolver                *clientAddressResolver
	maxConcurrentHintSolves int
}

func parseRuntimeSecurityConfig(getenv func(string) string) (runtimeSecurityConfig, error) {
	genericCIDRs, err := parseCIDREnvironment(getenv("TRUSTED_PROXY_CIDRS"))
	if err != nil {
		return runtimeSecurityConfig{}, fmt.Errorf("TRUSTED_PROXY_CIDRS: %w", err)
	}
	cloudflareCIDRs, err := parseCIDREnvironment(getenv("TRUSTED_CLOUDFLARE_PROXY_CIDRS"))
	if err != nil {
		return runtimeSecurityConfig{}, fmt.Errorf("TRUSTED_CLOUDFLARE_PROXY_CIDRS: %w", err)
	}
	resolver, err := clientAddressResolverFromCIDRs(genericCIDRs, cloudflareCIDRs)
	if err != nil {
		return runtimeSecurityConfig{}, err
	}
	maxConcurrent, err := parseHintConcurrency(getenv("MAX_CONCURRENT_HINT_SOLVES"))
	if err != nil {
		return runtimeSecurityConfig{}, err
	}
	return runtimeSecurityConfig{
		resolver:                resolver,
		maxConcurrentHintSolves: maxConcurrent,
	}, nil
}

func parseCIDREnvironment(value string) ([]string, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	parts := strings.Split(value, ",")
	for index := range parts {
		parts[index] = strings.TrimSpace(parts[index])
		if parts[index] == "" {
			return nil, fmt.Errorf("CIDR list contains an empty entry")
		}
	}
	return parts, nil
}

func parseHintConcurrency(value string) (int, error) {
	if value == "" {
		return defaultMaxConcurrentHintSolves, nil
	}
	for _, character := range value {
		if character < '0' || character > '9' {
			return 0, fmt.Errorf("MAX_CONCURRENT_HINT_SOLVES must be a strict integer from %d to %d", minimumConcurrentHintSolves, maximumConcurrentHintSolves)
		}
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < minimumConcurrentHintSolves || parsed > maximumConcurrentHintSolves {
		return 0, fmt.Errorf("MAX_CONCURRENT_HINT_SOLVES must be a strict integer from %d to %d", minimumConcurrentHintSolves, maximumConcurrentHintSolves)
	}
	return parsed, nil
}

func initializeRuntime(getenv func(string) string) (runtimeSecurityConfig, error) {
	return parseRuntimeSecurityConfig(getenv)
}
