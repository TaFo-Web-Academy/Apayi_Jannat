package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"jannat-psych-backend/internal/handlers"
	"jannat-psych-backend/internal/store"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbPath := os.Getenv("DB_FILE_PATH")
	if dbPath == "" {
		dbPath = filepath.Join("data", "db.json")
	}

	st, err := store.NewStore(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize store: %v", err)
	}

	h := handlers.NewAPIHandler(st)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", h.Health)
	mux.HandleFunc("GET /api/test", h.GetTest)
	mux.HandleFunc("PUT /api/test", h.UpdateTest)
	mux.HandleFunc("POST /api/test/reset", h.ResetTest)
	mux.HandleFunc("GET /api/submissions", h.GetSubmissions)
	mux.HandleFunc("POST /api/submissions", h.CreateSubmission)
	mux.HandleFunc("DELETE /api/submissions/{id}", h.DeleteSubmission)
	mux.HandleFunc("POST /api/admin/login", h.AdminLogin)

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           handlers.EnableCORSAndSafety(mux),
		ReadHeaderTimeout: 3 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	fmt.Printf("⚡ Ultra-Fast Golang Backend API listening on http://localhost:%s\n", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}
