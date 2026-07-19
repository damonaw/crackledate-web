package main

import (
	"fmt"
	"net/http"
	"net/netip"
	"strings"
)

type resolvedClient struct {
	address string
	source  string
}

type clientAddressResolver struct {
	trustedProxyCIDRs           []netip.Prefix
	trustedCloudflareProxyCIDRs []netip.Prefix
}

func newClientAddressResolver(generic []netip.Prefix, cloudflare []netip.Prefix) *clientAddressResolver {
	return &clientAddressResolver{
		trustedProxyCIDRs:           append([]netip.Prefix(nil), generic...),
		trustedCloudflareProxyCIDRs: append([]netip.Prefix(nil), cloudflare...),
	}
}

func clientAddressResolverFromCIDRs(generic []string, cloudflare []string) (*clientAddressResolver, error) {
	genericPrefixes, err := parseCIDRStrings(generic)
	if err != nil {
		return nil, fmt.Errorf("parse trusted proxy CIDR: %w", err)
	}
	cloudflarePrefixes, err := parseCIDRStrings(cloudflare)
	if err != nil {
		return nil, fmt.Errorf("parse trusted Cloudflare proxy CIDR: %w", err)
	}
	return newClientAddressResolver(genericPrefixes, cloudflarePrefixes), nil
}

func parseCIDRStrings(values []string) ([]netip.Prefix, error) {
	prefixes := make([]netip.Prefix, 0, len(values))
	for _, value := range values {
		prefix, err := netip.ParsePrefix(strings.TrimSpace(value))
		if err != nil {
			return nil, fmt.Errorf("%q: %w", value, err)
		}
		prefixes = append(prefixes, prefix.Masked())
	}
	return prefixes, nil
}

func (resolver *clientAddressResolver) resolve(request *http.Request) resolvedClient {
	peerAddress, peerOK := parseRemoteAddress(request.RemoteAddr)
	client := resolvedClient{
		address: normalizedRemoteAddress(request.RemoteAddr),
		source:  "remote-addr",
	}
	if !peerOK || resolver == nil {
		return client
	}

	cloudflarePeer := resolver.contains(resolver.trustedCloudflareProxyCIDRs, peerAddress)
	if cloudflarePeer {
		if forwardedAddress, ok := parseForwardedAddress(request.Header.Get("CF-Connecting-IP")); ok {
			return resolvedClient{
				address: forwardedAddress.String(),
				source:  "cf-connecting-ip",
			}
		}
	}

	if !resolver.contains(resolver.trustedProxyCIDRs, peerAddress) {
		return client
	}
	forwardedAddress, ok := resolver.resolveForwardedChain(peerAddress, request.Header.Get("X-Forwarded-For"))
	if !ok {
		return client
	}
	return resolvedClient{
		address: forwardedAddress.String(),
		source:  "x-forwarded-for",
	}
}

func (resolver *clientAddressResolver) resolveForwardedChain(peerAddress netip.Addr, value string) (netip.Addr, bool) {
	parts := strings.Split(value, ",")
	if len(parts) == 0 || strings.TrimSpace(value) == "" {
		return netip.Addr{}, false
	}
	addresses := make([]netip.Addr, len(parts))
	for index, part := range parts {
		address, ok := parseForwardedAddress(part)
		if !ok {
			return netip.Addr{}, false
		}
		addresses[index] = address
	}

	current := peerAddress
	for index := len(addresses) - 1; index >= 0 && resolver.isTrustedForwarder(current); index-- {
		current = addresses[index]
	}
	return current, true
}

func (resolver *clientAddressResolver) isTrustedForwarder(address netip.Addr) bool {
	return resolver.contains(resolver.trustedProxyCIDRs, address) ||
		resolver.contains(resolver.trustedCloudflareProxyCIDRs, address)
}

func (resolver *clientAddressResolver) contains(prefixes []netip.Prefix, address netip.Addr) bool {
	address = address.Unmap()
	for _, prefix := range prefixes {
		if prefix.Contains(address) {
			return true
		}
	}
	return false
}

func parseForwardedAddress(value string) (netip.Addr, bool) {
	address, err := netip.ParseAddr(strings.TrimSpace(value))
	if err != nil {
		return netip.Addr{}, false
	}
	return address.Unmap(), true
}

func parseRemoteAddress(value string) (netip.Addr, bool) {
	value = strings.TrimSpace(value)
	if addressPort, err := netip.ParseAddrPort(value); err == nil {
		return addressPort.Addr().Unmap(), true
	}
	return parseForwardedAddress(value)
}

func normalizedRemoteAddress(value string) string {
	if address, ok := parseRemoteAddress(value); ok {
		return address.String()
	}
	return strings.TrimSpace(value)
}
