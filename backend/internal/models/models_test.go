package models

import (
	"testing"
)

func TestCalculateTestResultAndValidation(t *testing.T) {
	cfg := DefaultTestConfig()

	input := CreateSubmissionInput{
		RespondentName:   "  Мадина \x00 Раҳимова  ",
		RespondentAge:    "28",
		RespondentGender: "Зан",
		RespondentPhone:  "+992900123456",
		Answers: map[string]OptionLetter{
			"1":  "В",
			"2":  "Б",
			"3":  "В",
			"4":  "Г",
			"5":  "Д",
			"6":  "Е",
			"7":  "Ж",
			"8":  "В",
			"9":  "Д",
			"10": "Г",
		},
	}

	clean, err := ValidateAndSanitizeSubmission(input, cfg)
	if err != nil {
		t.Fatalf("expected valid input, got error: %v", err)
	}
	if clean.RespondentName != "Мадина  Раҳимова" {
		t.Errorf("unexpected sanitized name: %q", clean.RespondentName)
	}

	code, scores, dom, vuln, res, diff, strong := CalculateTestResult(clean.Answers, cfg)
	if code != "1-В, 2-Б, 3-В, 4-Г, 5-Д, 6-Е, 7-Ж, 8-В, 9-Д, 10-Г" {
		t.Errorf("unexpected answerCode: %s", code)
	}
	if dom.Letter != LetterV || dom.Percentage != 30 {
		t.Errorf("expected dominant state В (30%%), got %s (%d%%)", dom.Letter, dom.Percentage)
	}
	if vuln != 60 || res != 40 {
		t.Errorf("expected 60%% vulnerable / 40%% resourceful, got %d%% / %d%%", vuln, res)
	}
	if len(scores) != 8 {
		t.Errorf("expected 8 scores, got %d", len(scores))
	}
	if len(diff) != 6 || len(strong) != 4 {
		t.Errorf("expected 6 difficult and 4 strong spheres, got %d / %d", len(diff), len(strong))
	}
}

func TestInvalidSubmissionRejected(t *testing.T) {
	cfg := DefaultTestConfig()

	// Invalid phone (not 9 digits)
	_, err := ValidateAndSanitizeSubmission(CreateSubmissionInput{
		RespondentName:  "Тест",
		RespondentPhone: "12345",
		Answers:         map[string]OptionLetter{"1": "А"},
	}, cfg)
	if err == nil {
		t.Errorf("expected error for non-9-digit phone")
	}

	// Empty answers
	_, err = ValidateAndSanitizeSubmission(CreateSubmissionInput{
		RespondentName:  "Тест",
		RespondentPhone: "900123456",
		Answers:         map[string]OptionLetter{},
	}, cfg)
	if err == nil {
		t.Errorf("expected error for empty answers")
	}

	// Invalid letter
	_, err = ValidateAndSanitizeSubmission(CreateSubmissionInput{
		RespondentName:  "Тест",
		RespondentPhone: "900123456",
		Answers: map[string]OptionLetter{
			"1": "Я",
		},
	}, cfg)
	if err == nil {
		t.Errorf("expected error for invalid option letter 'Я'")
	}
}

func BenchmarkCalculateTestResult(b *testing.B) {
	cfg := DefaultTestConfig()
	ans := map[string]OptionLetter{
		"1": "В", "2": "Б", "3": "В", "4": "Г", "5": "Д",
		"6": "Е", "7": "Ж", "8": "В", "9": "Д", "10": "Г",
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		CalculateTestResult(ans, cfg)
	}
}
