package store

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"jannat-psych-backend/internal/models"
)

type dbPayload struct {
	TestConfig  models.TestConfig         `json:"testConfig"`
	Submissions []models.SubmissionRecord `json:"submissions"`
}

type Store struct {
	mu              sync.RWMutex
	filePath        string
	data            dbPayload
	cachedTestBytes []byte
	cachedSubsBytes []byte
	flushCh         chan struct{}
	idCounter       uint64
	supabaseURL     string
	supabaseKey     string
	httpClient      *http.Client
}

func NewStore(filePath string) (*Store, error) {
	s := &Store{
		filePath:    filePath,
		flushCh:     make(chan struct{}, 1),
		supabaseURL: os.Getenv("NEXT_PUBLIC_SUPABASE_URL"),
		supabaseKey: os.Getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
		httpClient:  &http.Client{Timeout: 6 * time.Second},
	}

	if err := os.MkdirAll(filepath.Dir(filePath), 0755); err != nil {
		return nil, err
	}

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		s.data = dbPayload{
			TestConfig:  models.DefaultTestConfig(),
			Submissions: createInitialSamples(),
		}
		s.rebuildByteCachesLocked()
		_ = s.flushToDiskSync()
	} else {
		raw, err := os.ReadFile(filePath)
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(raw, &s.data); err != nil || len(s.data.TestConfig.Questions) == 0 {
			s.data = dbPayload{
				TestConfig:  models.DefaultTestConfig(),
				Submissions: createInitialSamples(),
			}
		}
		if s.data.Submissions == nil {
			s.data.Submissions = []models.SubmissionRecord{}
		}
		s.rebuildByteCachesLocked()
	}

	// Start background non-blocking disk flush worker
	go s.backgroundFlushWorker()

	// Lightweight keep-alive ping to Supabase once every 3 days (72h) so Free Tier never sleeps
	if s.supabaseURL != "" && s.supabaseKey != "" {
		go s.supabaseKeepAliveWorker()
	}

	return s, nil
}

func (s *Store) supabaseKeepAliveWorker() {
	ticker := time.NewTicker(72 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		req, err := http.NewRequest("GET", s.supabaseURL+"/rest/v1/test_configs?select=id&limit=1", nil)
		if err != nil {
			continue
		}
		req.Header.Set("apikey", s.supabaseKey)
		req.Header.Set("Authorization", "Bearer "+s.supabaseKey)
		resp, err := s.httpClient.Do(req)
		if err == nil && resp != nil {
			resp.Body.Close()
		}
	}
}

func (s *Store) rebuildByteCachesLocked() {
	if b, err := json.Marshal(s.data.TestConfig); err == nil {
		s.cachedTestBytes = b
	}
	if b, err := json.Marshal(s.data.Submissions); err == nil {
		s.cachedSubsBytes = b
	}
}

func (s *Store) triggerAsyncFlush() {
	select {
	case s.flushCh <- struct{}{}:
	default:
		// Flush already queued
	}
}

func (s *Store) backgroundFlushWorker() {
	for range s.flushCh {
		_ = s.flushToDiskSync()
	}
}

// flushToDiskSync atomically writes to a temp file and renames it to prevent corruption.
func (s *Store) flushToDiskSync() error {
	s.mu.RLock()
	bytesOut, err := json.MarshalIndent(s.data, "", "  ")
	s.mu.RUnlock()
	if err != nil {
		return err
	}

	tmpPath := s.filePath + ".tmp"
	if err := os.WriteFile(tmpPath, bytesOut, 0644); err != nil {
		return err
	}
	return os.Rename(tmpPath, s.filePath)
}

func createInitialSamples() []models.SubmissionRecord {
	cfg := models.DefaultTestConfig()

	ans1 := map[string]models.OptionLetter{
		"1": models.LetterV, "2": models.LetterB, "3": models.LetterV,
		"4": models.LetterG, "5": models.LetterD, "6": models.LetterE,
		"7": models.LetterZh, "8": models.LetterV, "9": models.LetterD,
		"10": models.LetterG,
	}
	code1, scores1, dom1, vuln1, res1, diff1, strong1 := models.CalculateTestResult(ans1, cfg)

	ans2 := map[string]models.OptionLetter{
		"1": models.LetterZh, "2": models.LetterZ, "3": models.LetterE,
		"4": models.LetterZ, "5": models.LetterD, "6": models.LetterZh,
		"7": models.LetterZ, "8": models.LetterZh, "9": models.LetterE,
		"10": models.LetterZ,
	}
	code2, scores2, dom2, vuln2, res2, diff2, strong2 := models.CalculateTestResult(ans2, cfg)

	return []models.SubmissionRecord{
		{
			ID:                    "go-demo-1",
			CreatedAt:             time.Now().Add(-45 * time.Minute).UTC().Format(time.RFC3339),
			RespondentName:        "Мадина Раҳимова (Намуна)",
			RespondentAge:         "28",
			RespondentGender:      "Зан",
			RespondentPhone:       "+992 900 12 34 56",
			Answers:               ans1,
			AnswerCode:            code1,
			Scores:                scores1,
			DominantState:         dom1,
			VulnerablePercentage:  vuln1,
			ResourcefulPercentage: res1,
			DifficultSpheres:      diff1,
			StrongSpheres:         strong1,
		},
		{
			ID:                    "go-demo-2",
			CreatedAt:             time.Now().Add(-3 * time.Hour).UTC().Format(time.RFC3339),
			RespondentName:        "Нилуфар Каримова (Намуна)",
			RespondentAge:         "34",
			RespondentGender:      "Зан",
			RespondentPhone:       "+992 93 555 77 88",
			Answers:               ans2,
			AnswerCode:            code2,
			Scores:                scores2,
			DominantState:         dom2,
			VulnerablePercentage:  vuln2,
			ResourcefulPercentage: res2,
			DifficultSpheres:      diff2,
			StrongSpheres:         strong2,
		},
	}
}

// GetTestConfigBytes returns pre-serialized UTF-8 JSON bytes in <1 microsecond.
func (s *Store) GetTestConfigBytes() []byte {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cachedTestBytes
}

func (s *Store) GetTestConfig() models.TestConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data.TestConfig
}

func (s *Store) SaveTestConfig(cfg models.TestConfig) error {
	if err := models.ValidateTestConfig(&cfg); err != nil {
		return err
	}
	s.mu.Lock()
	s.data.TestConfig = cfg
	s.rebuildByteCachesLocked()
	s.mu.Unlock()

	s.triggerAsyncFlush()
	return nil
}

func (s *Store) ResetTestConfig() models.TestConfig {
	s.mu.Lock()
	s.data.TestConfig = models.DefaultTestConfig()
	s.rebuildByteCachesLocked()
	cfg := s.data.TestConfig
	s.mu.Unlock()

	s.triggerAsyncFlush()
	return cfg
}

// GetSubmissionsBytes returns pre-serialized UTF-8 JSON bytes in <1 microsecond.
func (s *Store) GetSubmissionsBytes() []byte {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cachedSubsBytes
}

func (s *Store) CreateSubmission(rawInput models.CreateSubmissionInput) (models.SubmissionRecord, error) {
	s.mu.RLock()
	cfg := s.data.TestConfig
	s.mu.RUnlock()

	input, err := models.ValidateAndSanitizeSubmission(rawInput, cfg)
	if err != nil {
		return models.SubmissionRecord{}, err
	}

	code, scores, dom, vulnPct, resPct, diff, strong := models.CalculateTestResult(input.Answers, cfg)
	now := time.Now().UTC()

	s.mu.Lock()
	// Idempotency guard: prevent accidental double-click duplicates within 3 seconds
	if len(s.data.Submissions) > 0 {
		latest := s.data.Submissions[0]
		if latest.RespondentName == input.RespondentName && latest.AnswerCode == code {
			if prevTime, parseErr := time.Parse(time.RFC3339, latest.CreatedAt); parseErr == nil {
				if now.Sub(prevTime) < 3*time.Second {
					s.mu.Unlock()
					return latest, nil
				}
			}
		}
	}

	seq := atomic.AddUint64(&s.idCounter, 1)
	rec := models.SubmissionRecord{
		ID:                    fmt.Sprintf("sub-%d-%d", now.UnixMilli(), seq),
		CreatedAt:             now.Format(time.RFC3339),
		RespondentName:        input.RespondentName,
		RespondentAge:         input.RespondentAge,
		RespondentGender:      input.RespondentGender,
		RespondentPhone:       input.RespondentPhone,
		RespondentNote:        input.RespondentNote,
		Answers:               input.Answers,
		AnswerCode:            code,
		Scores:                scores,
		DominantState:         dom,
		VulnerablePercentage:  vulnPct,
		ResourcefulPercentage: resPct,
		DifficultSpheres:      diff,
		StrongSpheres:         strong,
	}

	s.data.Submissions = append([]models.SubmissionRecord{rec}, s.data.Submissions...)
	s.rebuildByteCachesLocked()
	s.mu.Unlock()

	// Non-blocking disk flush + optional Supabase sync
	s.triggerAsyncFlush()
	if s.supabaseURL != "" && s.supabaseKey != "" {
		go s.syncToSupabase(rec)
	}

	return rec, nil
}

func (s *Store) DeleteSubmission(id string) error {
	s.mu.Lock()
	filtered := make([]models.SubmissionRecord, 0, len(s.data.Submissions))
	for _, item := range s.data.Submissions {
		if item.ID != id {
			filtered = append(filtered, item)
		}
	}
	s.data.Submissions = filtered
	s.rebuildByteCachesLocked()
	s.mu.Unlock()

	s.triggerAsyncFlush()
	return nil
}

func (s *Store) syncToSupabase(rec models.SubmissionRecord) {
	payload := map[string]interface{}{
		"respondent_name":        rec.RespondentName,
		"respondent_age":         rec.RespondentAge,
		"respondent_gender":      rec.RespondentGender,
		"respondent_phone":       rec.RespondentPhone,
		"respondent_note":        rec.RespondentNote,
		"answers":                rec.Answers,
		"answer_code":            rec.AnswerCode,
		"scores":                 rec.Scores,
		"dominant_state":         rec.DominantState,
		"vulnerable_percentage":  rec.VulnerablePercentage,
		"resourceful_percentage": rec.ResourcefulPercentage,
		"difficult_spheres":      rec.DifficultSpheres,
		"strong_spheres":         rec.StrongSpheres,
	}
	b, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", s.supabaseURL+"/rest/v1/submissions", bytes.NewReader(b))
	if err != nil {
		return
	}
	req.Header.Set("apikey", s.supabaseKey)
	req.Header.Set("Authorization", "Bearer "+s.supabaseKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err == nil && resp != nil {
		resp.Body.Close()
	}
}
