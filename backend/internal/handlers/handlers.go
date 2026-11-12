package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"jannat-psych-backend/internal/models"
	"jannat-psych-backend/internal/store"
)

const (
	maxRequestBodyBytes = 64 * 1024 // 64 KB limit
	maxFailedAttempts   = 5
	lockoutDuration     = 5 * time.Minute
	tokenTTL            = 2 * time.Hour
)

type loginAttemptInfo struct {
	failures    int
	lockedUntil time.Time
}

type APIHandler struct {
	Store      *store.Store
	hmacSecret []byte
	loginMu    sync.Mutex
	attempts   map[string]*loginAttemptInfo
}

func NewAPIHandler(s *store.Store) *APIHandler {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		secret = []byte("fallback-ultra-secret-key-mustafo-2026")
	}
	return &APIHandler{
		Store:      s,
		hmacSecret: secret,
		attempts:   make(map[string]*loginAttemptInfo),
	}
}

func (h *APIHandler) issueAdminToken() string {
	exp := time.Now().Add(tokenTTL).Unix()
	payload := fmt.Sprintf("admin:%d", exp)
	mac := hmac.New(sha256.New, h.hmacSecret)
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("%s.%s", payload, sig)
}

func (h *APIHandler) verifyAdminToken(r *http.Request) bool {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		return false
	}
	token := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return false
	}
	payload, sigHex := parts[0], parts[1]

	mac := hmac.New(sha256.New, h.hmacSecret)
	mac.Write([]byte(payload))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	if subtle.ConstantTimeCompare([]byte(sigHex), []byte(expectedSig)) != 1 {
		return false
	}

	payloadParts := strings.Split(payload, ":")
	if len(payloadParts) != 2 || payloadParts[0] != "admin" {
		return false
	}
	expUnix, err := strconv.ParseInt(payloadParts[1], 10, 64)
	if err != nil || time.Now().Unix() > expUnix {
		return false
	}
	return true
}

type ipWindow struct {
	count     int
	resetTime time.Time
}

var (
	ddosMu     sync.Mutex
	ipCounters = make(map[string]*ipWindow)
)

func allowIPRequest(ip string) bool {
	now := time.Now()
	ddosMu.Lock()
	defer ddosMu.Unlock()

	win, exists := ipCounters[ip]
	if !exists || now.After(win.resetTime) {
		ipCounters[ip] = &ipWindow{
			count:     1,
			resetTime: now.Add(1 * time.Minute),
		}
		return true
	}
	win.count++
	return win.count <= 120
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeRawJSON(w http.ResponseWriter, status int, rawBytes []byte) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write(rawBytes)
}

// EnableCORSAndSafety provides panic recovery, security headers, CORS, payload limit, and microsecond timing header.
func EnableCORSAndSafety(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("[PANIC RECOVERED] %v", rec)
				writeJSON(w, http.StatusInternalServerError, map[string]string{
					"error": "хатогии дохилии сервер пешгирӣ карда шуд",
				})
			}
		}()

		// Hardened Security Headers (Anti-XSS, Anti-Clickjacking, Anti-Sniffing)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Expose-Headers", "X-Response-Time-Us")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Anti-DDoS Per-IP Rate Limiter (Max 120 req/min per IP)
		if !allowIPRequest(clientIP(r)) {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{
				"error": "Дархостҳо аз ҳад зиёданд (Anti-DDoS protection). Лутфан каме сабр кунед.",
			})
			return
		}

		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
		}

		tw := &timingResponseWriter{ResponseWriter: w, start: start}
		next.ServeHTTP(tw, r)
	})
}

type timingResponseWriter struct {
	http.ResponseWriter
	start       time.Time
	wroteHeader bool
}

func (tw *timingResponseWriter) WriteHeader(code int) {
	if !tw.wroteHeader {
		elapsedUs := time.Since(tw.start).Microseconds()
		tw.Header().Set("X-Response-Time-Us", fmt.Sprintf("%d", elapsedUs))
		tw.wroteHeader = true
	}
	tw.ResponseWriter.WriteHeader(code)
}

func (tw *timingResponseWriter) Write(b []byte) (int, error) {
	if !tw.wroteHeader {
		tw.WriteHeader(http.StatusOK)
	}
	return tw.ResponseWriter.Write(b)
}

func (h *APIHandler) Health(w http.ResponseWriter, r *http.Request) {
	writeRawJSON(w, http.StatusOK, []byte(`{"status":"ok","service":"jannat-psychology-golang-api","runtime":"go-ultra-fast"}`))
}

func (h *APIHandler) GetTest(w http.ResponseWriter, r *http.Request) {
	writeRawJSON(w, http.StatusOK, h.Store.GetTestConfigBytes())
}

func (h *APIHandler) UpdateTest(w http.ResponseWriter, r *http.Request) {
	if !h.verifyAdminToken(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "дастрасӣ манъ аст (Unauthorized)"})
		return
	}
	var cfg models.TestConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "формати маълумот нодуруст аст"})
		return
	}
	if err := h.Store.SaveTestConfig(cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeRawJSON(w, http.StatusOK, h.Store.GetTestConfigBytes())
}

func (h *APIHandler) ResetTest(w http.ResponseWriter, r *http.Request) {
	if !h.verifyAdminToken(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "дастрасӣ манъ аст (Unauthorized)"})
		return
	}
	_ = h.Store.ResetTestConfig()
	writeRawJSON(w, http.StatusOK, h.Store.GetTestConfigBytes())
}

func (h *APIHandler) GetSubmissions(w http.ResponseWriter, r *http.Request) {
	writeRawJSON(w, http.StatusOK, h.Store.GetSubmissionsBytes())
}

func (h *APIHandler) CreateSubmission(w http.ResponseWriter, r *http.Request) {
	var input models.CreateSubmissionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "формати ҷавобҳо нодуруст аст"})
		return
	}
	rec, err := h.Store.CreateSubmission(input)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, rec)
}

func (h *APIHandler) DeleteSubmission(w http.ResponseWriter, r *http.Request) {
	if !h.verifyAdminToken(r) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "дастрасӣ манъ аст (Unauthorized)"})
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		parts := strings.Split(strings.TrimSuffix(r.URL.Path, "/"), "/")
		id = parts[len(parts)-1]
	}
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id нишон дода нашудааст"})
		return
	}
	if err := h.Store.DeleteSubmission(id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeRawJSON(w, http.StatusOK, []byte(`{"deleted":true}`))
}

func (h *APIHandler) AdminLogin(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	now := time.Now()

	h.loginMu.Lock()
	info, exists := h.attempts[ip]
	if !exists {
		info = &loginAttemptInfo{}
		h.attempts[ip] = info
	}

	if now.Before(info.lockedUntil) {
		remainingSec := int(info.lockedUntil.Sub(now).Seconds())
		h.loginMu.Unlock()
		writeJSON(w, http.StatusTooManyRequests, map[string]interface{}{
			"authenticated": false,
			"locked":        true,
			"remainingSec":  remainingSec,
			"error":         fmt.Sprintf("Аз сабаби кӯшишҳои нодуруст дастрасӣ барои %d сония маҳдуд шуд.", remainingSec),
		})
		return
	}
	h.loginMu.Unlock()

	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}

	expected := os.Getenv("ADMIN_PASSWORD")
	if expected == "" {
		expected = "Mustafo2010#"
	}

	provided := strings.TrimSpace(body.Password)
	match := subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1

	h.loginMu.Lock()
	if match {
		info.failures = 0
		info.lockedUntil = time.Time{}
		h.loginMu.Unlock()

		token := h.issueAdminToken()
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"authenticated": true,
			"token":         token,
		})
		return
	}

	info.failures++
	remainingAttempts := maxFailedAttempts - info.failures
	if info.failures >= maxFailedAttempts {
		info.lockedUntil = now.Add(lockoutDuration)
		info.failures = 0
		h.loginMu.Unlock()
		writeJSON(w, http.StatusTooManyRequests, map[string]interface{}{
			"authenticated": false,
			"locked":        true,
			"remainingSec":  int(lockoutDuration.Seconds()),
			"error":         "5 кӯшиши нодуруст! Воридшавӣ барои 5 дақиқа маҳдуд карда шуд.",
		})
		return
	}
	h.loginMu.Unlock()

	writeJSON(w, http.StatusUnauthorized, map[string]interface{}{
		"authenticated":     false,
		"remainingAttempts": remainingAttempts,
		"error":             fmt.Sprintf("Рамз нодуруст аст. Кӯшишҳои боқимонда: %d", remainingAttempts),
	})
}
