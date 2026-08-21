package main

import (
	"fmt"
	"strings"
)

type runtimeSecurityConfig struct {
	resolver                *clientAddressResolver
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
	return runtimeSecurityConfig{
		resolver: resolver,
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

func initializeRuntime(getenv func(string) string) (runtimeSecurityConfig, error) {
	return parseRuntimeSecurityConfig(getenv)
}
