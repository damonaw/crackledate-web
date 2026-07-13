package main

import (
	"net/http"
	"time"
)

const legacySessionCookieName = "crackledate_session"

var legacySessionCookieExpires = time.Unix(1, 0).UTC()

// expireLegacySessionCookie is removable after the operations-owned
// compatibility window documented in the release runbook.
func expireLegacySessionCookie(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if _, err := request.Cookie(legacySessionCookieName); err == nil {
			http.SetCookie(writer, &http.Cookie{
				Name:     legacySessionCookieName,
				Value:    "",
				Path:     "/",
				Expires:  legacySessionCookieExpires,
				MaxAge:   -1,
				HttpOnly: true,
				SameSite: http.SameSiteLaxMode,
			})
		}
		next.ServeHTTP(writer, request)
	})
}
