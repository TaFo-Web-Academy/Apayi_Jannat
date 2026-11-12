package models

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

type OptionLetter string

const (
	LetterA  OptionLetter = "А"
	LetterB  OptionLetter = "Б"
	LetterV  OptionLetter = "В"
	LetterG  OptionLetter = "Г"
	LetterD  OptionLetter = "Д"
	LetterE  OptionLetter = "Е"
	LetterZh OptionLetter = "Ж"
	LetterZ  OptionLetter = "З"
)

var OrderedLetters = []OptionLetter{
	LetterA, LetterB, LetterV, LetterG, LetterD, LetterE, LetterZh, LetterZ,
}

var validLettersMap = map[OptionLetter]bool{
	LetterA:  true,
	LetterB:  true,
	LetterV:  true,
	LetterG:  true,
	LetterD:  true,
	LetterE:  true,
	LetterZh: true,
	LetterZ:  true,
}

// latinToCyrillicMap normalizes accidental Latin lookalike letters to Tajik/Cyrillic letters
var latinToCyrillicMap = map[string]OptionLetter{
	"A": LetterA, "a": LetterA, "а": LetterA,
	"B": LetterV, "b": LetterB, "б": LetterB,
	"V": LetterV, "v": LetterV, "в": LetterV,
	"G": LetterG, "g": LetterG, "г": LetterG,
	"D": LetterD, "d": LetterD, "д": LetterD,
	"E": LetterE, "e": LetterE, "е": LetterE,
	"J": LetterZh, "Z": LetterZ, "z": LetterZ,
	"ж": LetterZh, "з": LetterZ,
}

type EmotionalStateInfo struct {
	Letter    OptionLetter `json:"letter"`
	ShortName string       `json:"shortName"`
	FullName  string       `json:"fullName"`
	Category  string       `json:"category"` // "vulnerable" | "resourceful"
	Color     string       `json:"color"`
	Summary   string       `json:"summary"`
	Exercises []string     `json:"exercises"`
}

type TestOption struct {
	Letter OptionLetter `json:"letter"`
	Text   string       `json:"text"`
}

type TestQuestion struct {
	ID       int          `json:"id"`
	Sphere   string       `json:"sphere"`
	Question string       `json:"question"`
	Options  []TestOption `json:"options"`
}

type TestConfig struct {
	ID          string         `json:"id"`
	Slug        string         `json:"slug"`
	Title       string         `json:"title"`
	Subtitle    string         `json:"subtitle"`
	Author      string         `json:"author"`
	BadgeText   string         `json:"badgeText"`
	Description string         `json:"description"`
	Instruction string         `json:"instruction"`
	Disclaimer  string         `json:"disclaimer"`
	Questions   []TestQuestion `json:"questions"`
}

type CalculatedStateScore struct {
	Letter     OptionLetter `json:"letter"`
	ShortName  string       `json:"shortName"`
	FullName   string       `json:"fullName"`
	Category   string       `json:"category"`
	Count      int          `json:"count"`
	Percentage int          `json:"percentage"`
}

type DifficultSphereItem struct {
	QuestionID int          `json:"questionId"`
	Sphere     string       `json:"sphere"`
	Letter     OptionLetter `json:"letter"`
	StateName  string       `json:"stateName"`
	AnswerText string       `json:"answerText"`
}

type SubmissionRecord struct {
	ID                    string                  `json:"id"`
	CreatedAt             string                  `json:"createdAt"`
	RespondentName        string                  `json:"respondentName"`
	RespondentAge         string                  `json:"respondentAge,omitempty"`
	RespondentGender      string                  `json:"respondentGender,omitempty"`
	RespondentPhone       string                  `json:"respondentPhone,omitempty"`
	RespondentNote        string                  `json:"respondentNote,omitempty"`
	Answers               map[string]OptionLetter `json:"answers"`
	AnswerCode            string                  `json:"answerCode"`
	Scores                []CalculatedStateScore  `json:"scores"`
	DominantState         CalculatedStateScore    `json:"dominantState"`
	VulnerablePercentage  int                     `json:"vulnerablePercentage"`
	ResourcefulPercentage int                     `json:"resourcefulPercentage"`
	DifficultSpheres      []DifficultSphereItem   `json:"difficultSpheres"`
	StrongSpheres         []DifficultSphereItem   `json:"strongSpheres"`
}

type CreateSubmissionInput struct {
	RespondentName   string                  `json:"respondentName"`
	RespondentAge    string                  `json:"respondentAge"`
	RespondentGender string                  `json:"respondentGender"`
	RespondentPhone  string                  `json:"respondentPhone"`
	RespondentNote   string                  `json:"respondentNote"`
	Answers          map[string]OptionLetter `json:"answers"`
}

// SanitizeString removes control characters, XSS brackets (<, >), trims whitespace, and enforces max rune length.
func SanitizeString(s string, maxRunes int) string {
	if !utf8.ValidString(s) {
		s = strings.ToValidUTF8(s, "")
	}
	s = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) && r != '\n' && r != '\t' {
			return -1
		}
		if r == '<' || r == '>' {
			return -1
		}
		return r
	}, s)
	s = strings.TrimSpace(s)
	runes := []rune(s)
	if len(runes) > maxRunes {
		return string(runes[:maxRunes])
	}
	return s
}

// NormalizeLetter validates and normalizes an option letter.
func NormalizeLetter(raw OptionLetter) (OptionLetter, bool) {
	trimmed := OptionLetter(strings.TrimSpace(string(raw)))
	if validLettersMap[trimmed] {
		return trimmed, true
	}
	if mapped, ok := latinToCyrillicMap[string(trimmed)]; ok {
		return mapped, true
	}
	return "", false
}

// ExtractNineDigits extracts digits and normalizes to a 9-digit phone number.
func ExtractNineDigits(raw string) (string, bool) {
	var b strings.Builder
	for _, r := range raw {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	digits := b.String()
	if len(digits) == 12 && strings.HasPrefix(digits, "992") {
		digits = digits[3:]
	}
	if len(digits) != 9 {
		return digits, false
	}
	return digits, true
}

// ValidateAndSanitizeSubmission validates user input and returns a clean struct or descriptive error.
func ValidateAndSanitizeSubmission(in CreateSubmissionInput, cfg TestConfig) (CreateSubmissionInput, error) {
	clean := CreateSubmissionInput{
		RespondentName:   SanitizeString(in.RespondentName, 120),
		RespondentAge:    SanitizeString(in.RespondentAge, 10),
		RespondentGender: SanitizeString(in.RespondentGender, 20),
		RespondentPhone:  SanitizeString(in.RespondentPhone, 40),
		RespondentNote:   SanitizeString(in.RespondentNote, 500),
		Answers:          make(map[string]OptionLetter, len(cfg.Questions)),
	}

	phoneNine, okPhone := ExtractNineDigits(clean.RespondentPhone)
	if !okPhone {
		// Also check if phone was passed in RespondentName
		phoneNine, okPhone = ExtractNineDigits(clean.RespondentName)
	}
	if !okPhone {
		return clean, errors.New("рақами телефон бояд аниқ аз 9 рақам иборат бошад")
	}
	clean.RespondentPhone = phoneNine

	if clean.RespondentName == "" {
		clean.RespondentName = "+992 " + phoneNine
	}

	if clean.RespondentAge != "" {
		if ageNum, err := strconv.Atoi(clean.RespondentAge); err != nil || ageNum < 5 || ageNum > 120 {
			clean.RespondentAge = ""
		}
	}

	if clean.RespondentGender != "Зан" && clean.RespondentGender != "Мард" && clean.RespondentGender != "" {
		clean.RespondentGender = "Зан"
	}

	if len(in.Answers) == 0 {
		return clean, errors.New("ҷавобҳо ворид нашудаанд (answers map is empty)")
	}

	validCount := 0
	for _, q := range cfg.Questions {
		qKey := strconv.Itoa(q.ID)
		rawLetter, exists := in.Answers[qKey]
		if !exists {
			continue
		}
		norm, ok := NormalizeLetter(rawLetter)
		if !ok {
			return clean, fmt.Errorf("ҷавоби нодуруст барои саволи %d: %q", q.ID, rawLetter)
		}
		clean.Answers[qKey] = norm
		validCount++
	}

	if validCount == 0 {
		return clean, errors.New("ягон ҷавоби дуруст ёфт нашуд")
	}

	return clean, nil
}

// ValidateTestConfig ensures a customized TestConfig has valid questions and options.
func ValidateTestConfig(cfg *TestConfig) error {
	cfg.Title = SanitizeString(cfg.Title, 250)
	cfg.Subtitle = SanitizeString(cfg.Subtitle, 200)
	cfg.Author = SanitizeString(cfg.Author, 120)
	cfg.Description = SanitizeString(cfg.Description, 1000)
	cfg.Instruction = SanitizeString(cfg.Instruction, 1000)

	if cfg.Title == "" {
		return errors.New("сарлавҳаи тест набояд холӣ бошад")
	}
	if len(cfg.Questions) == 0 || len(cfg.Questions) > 50 {
		return errors.New("шумораи саволҳо бояд аз 1 то 50 бошад")
	}
	for i := range cfg.Questions {
		q := &cfg.Questions[i]
		if q.ID <= 0 {
			q.ID = i + 1
		}
		q.Sphere = SanitizeString(q.Sphere, 120)
		q.Question = SanitizeString(q.Question, 500)
		if q.Question == "" {
			return fmt.Errorf("матни саволи %d холӣ аст", q.ID)
		}
		if len(q.Options) == 0 {
			return fmt.Errorf("саволи %d вариантҳои ҷавоб надорад", q.ID)
		}
		for j := range q.Options {
			norm, ok := NormalizeLetter(q.Options[j].Letter)
			if !ok {
				return fmt.Errorf("ҳарфи нодуруст дар саволи %d", q.ID)
			}
			q.Options[j].Letter = norm
			q.Options[j].Text = SanitizeString(q.Options[j].Text, 400)
		}
	}
	return nil
}

var EmotionalStates = map[OptionLetter]EmotionalStateInfo{
	LetterA: {
		Letter:    LetterA,
		ShortName: "Ноумедӣ",
		FullName:  "Ноумедӣ ва беарзишӣ",
		Category:  "vulnerable",
		Color:     "#C07D53",
		Summary:   "Дар ҳолати ҳозира шумо дар баъзе масъалаҳо хастагии чуқур, ноумедӣ ва паст шудани боварӣ ба қувваи худро ҳис мекунед.",
	},
	LetterB: {
		Letter:    LetterB,
		ShortName: "Гунаҳкорӣ",
		FullName:  "Гунаҳкорӣ ва худсарзаниш",
		Category:  "vulnerable",
		Color:     "#C07D53",
		Summary:   "Дар ҷавобҳои шумо ҳисси гунаҳкорӣ ва худсарзаниш зиёдтар ба назар мерасад.",
	},
	LetterV: {
		Letter:    LetterV,
		ShortName: "Тарс",
		FullName:  "Тарс ва ноамнӣ",
		Category:  "vulnerable",
		Color:     "#C07D53",
		Summary:   "Дар ин марҳила эҳсоси тарс, изтироб ва ноамнӣ бештар такрор шудааст.",
	},
	LetterG: {
		Letter:    LetterG,
		ShortName: "Хашм",
		FullName:  "Хашм ва норозигӣ",
		Category:  "vulnerable",
		Color:     "#C07D53",
		Summary:   "Дар натиҷаи шумо эҳсоси хашм, асабоният ва норозигӣ бештар дида мешавад.",
	},
	LetterD: {
		Letter:    LetterD,
		ShortName: "Ҷасорат",
		FullName:  "Ҷасорат ва омодагӣ ба амал",
		Category:  "resourceful",
		Color:     "#3B9B78",
		Summary:   "Шумо дар ҳолати ҷасорат ва омодагӣ ба амал қарор доред.",
	},
	LetterE: {
		Letter:    LetterE,
		ShortName: "Фаҳмиш",
		FullName:  "Фаҳмиш ва таҳлил",
		Category:  "resourceful",
		Color:     "#3B9B78",
		Summary:   "Дар ҷавобҳои шумо фаҳмиш, тафаккури солим ва қобилияти таҳлил бартарӣ дорад.",
	},
	LetterZh: {
		Letter:    LetterZh,
		ShortName: "Қабул",
		FullName:  "Қабул ва масъулият",
		Category:  "resourceful",
		Color:     "#3B9B78",
		Summary:   "Шумо дар сатҳи баланди камолоти эҳсосӣ — қабул ва масъулият қарор доред.",
	},
	LetterZ: {
		Letter:    LetterZ,
		ShortName: "Оромӣ",
		FullName:  "Оромӣ ва муҳаббат",
		Category:  "resourceful",
		Color:     "#3B9B78",
		Summary:   "Ҳолати асосии шумо оромии ботинӣ, муҳаббат, сабр ва сипосгузорӣ мебошад.",
	},
}

func CalculateTestResult(answers map[string]OptionLetter, cfg TestConfig) (
	answerCode string,
	scores []CalculatedStateScore,
	dominant CalculatedStateScore,
	vulnerablePct int,
	resourcefulPct int,
	difficult []DifficultSphereItem,
	strong []DifficultSphereItem,
) {
	totalQuestions := len(cfg.Questions)
	if totalQuestions == 0 {
		totalQuestions = 10
	}

	var counts [8]int
	letterIndex := map[OptionLetter]int{
		LetterA: 0, LetterB: 1, LetterV: 2, LetterG: 3,
		LetterD: 4, LetterE: 5, LetterZh: 6, LetterZ: 7,
	}

	difficult = make([]DifficultSphereItem, 0, totalQuestions)
	strong = make([]DifficultSphereItem, 0, totalQuestions)
	codeParts := make([]string, 0, totalQuestions)

	for _, q := range cfg.Questions {
		key := strconv.Itoa(q.ID)
		rawChosen, ok := answers[key]
		if !ok {
			continue
		}
		chosen, valid := NormalizeLetter(rawChosen)
		if !valid {
			continue
		}
		idx := letterIndex[chosen]
		counts[idx]++
		codeParts = append(codeParts, key+"-"+string(chosen))

		stateInfo := EmotionalStates[chosen]
		ansText := ""
		for _, opt := range q.Options {
			if opt.Letter == chosen {
				ansText = opt.Text
				break
			}
		}

		item := DifficultSphereItem{
			QuestionID: q.ID,
			Sphere:     q.Sphere,
			Letter:     chosen,
			StateName:  stateInfo.FullName,
			AnswerText: ansText,
		}

		if stateInfo.Category == "vulnerable" {
			difficult = append(difficult, item)
		} else {
			strong = append(strong, item)
		}
	}

	scores = make([]CalculatedStateScore, 8)
	for i, letter := range OrderedLetters {
		info := EmotionalStates[letter]
		cnt := counts[i]
		pct := int(math.Round((float64(cnt) / float64(totalQuestions)) * 100.0))
		sc := CalculatedStateScore{
			Letter:     letter,
			ShortName:  info.ShortName,
			FullName:   info.FullName,
			Category:   info.Category,
			Count:      cnt,
			Percentage: pct,
		}
		scores[i] = sc

		if info.Category == "vulnerable" {
			vulnerablePct += pct
		} else {
			resourcefulPct += pct
		}
	}

	dominant = scores[0]
	for _, s := range scores {
		if s.Count > dominant.Count {
			dominant = s
		}
	}

	answerCode = strings.Join(codeParts, ", ")
	return
}

func DefaultTestConfig() TestConfig {
	return TestConfig{
		ID:          "hawkins-emotional-state",
		Slug:        "holati-ehsosi",
		Title:       "ТЕСТИ ХУДШИНОСӢ: ДАР КАДОМ ҲОЛАТИ ЭҲСОСӢ ҚАРОР ДОРӢ?",
		Subtitle:    "Аз рӯйи идеяҳои Дэвид Ҳокинс",
		Author:      "Тести Худшиносӣ",
		BadgeText:   "10 савол — барои занон ва мардон",
		Description: "Ин тест ба ту кӯмак мекунад, ки ҳолати худро дар масъалаҳои пул, саломатӣ, муҳаббат, оила, кор, худбаҳоӣ ва оромии ботинӣ беҳтар бишносӣ.",
		Instruction: "Ба ҳар савол як ҷавоб интихоб кун, ки ба ҳолати ту дар 30 рӯзи охир бештар мувофиқ аст.",
		Disclaimer:  "Ин тест аз модели Ҳокинс илҳом гирифтааст, вале воситаи ташхисии илмӣ нест.",
		Questions: []TestQuestion{
			{
				ID:       1,
				Sphere:   "Пул ва молия",
				Question: "Вақте пулат кам мешавад, чӣ ҳис мекунӣ?",
				Options: []TestOption{
					{Letter: LetterA, Text: "Ноумед мешавам, фикр мекунам ҳеҷ роҳ нест."},
					{Letter: LetterB, Text: "Худро гунаҳкор мекунам, ки чаро пул надорам."},
					{Letter: LetterV, Text: "Метарсам, ки пулам тамом мешавад."},
					{Letter: LetterG, Text: "Асабонӣ мешавам, аз зиндагӣ норозӣ ҳастам."},
					{Letter: LetterD, Text: "Роҳи нави пул кор карданро меҷӯям."},
					{Letter: LetterE, Text: "Ҳисоб мекунам, ки чӣ қадар пул лозим аст."},
					{Letter: LetterZh, Text: "Нақша месозам ва хароҷотамро идора мекунам."},
					{Letter: LetterZ, Text: "Ором мемонам ва барои беҳтар кардани даромадам амал мекунам."},
				},
			},
			{
				ID:       2,
				Sphere:   "Саломатӣ",
				Question: "Вақте саломатиат мушкил пайдо мекунад, чӣ мекунӣ?",
				Options: []TestOption{
					{Letter: LetterA, Text: "Ноумед мешавам, фикр мекунам дигар хуб намешавам."},
					{Letter: LetterB, Text: "Худро барои бемор шуданам маломат мекунам."},
					{Letter: LetterV, Text: "Метарсам, ки бемории вазнин дорам."},
					{Letter: LetterG, Text: "Аз беморӣ ва вазъият асабонӣ мешавам."},
					{Letter: LetterD, Text: "Барои табобат ба духтур муроҷиат мекунам."},
					{Letter: LetterE, Text: "Сабаб ва роҳҳои табобатро меомӯзам."},
					{Letter: LetterZh, Text: "Тавсияҳои духтурро иҷро мекунам ва ба худ ғамхорӣ мекунам."},
					{Letter: LetterZ, Text: "Бо оромӣ ва сабр барои беҳтар шудани саломатиам амал мекунам."},
				},
			},
			{
				ID:       3,
				Sphere:   "Муҳаббат ва муносибат",
				Question: "Вақте шахси дӯстдоштаат ба ту кам аҳамият медиҳад, чӣ ҳис мекунӣ?",
				Options: []TestOption{
					{Letter: LetterA, Text: "Худро нодаркор ва беарзиш ҳис мекунам."},
					{Letter: LetterB, Text: "Фикр мекунам, ки ман ягон кори нодуруст кардам."},
					{Letter: LetterV, Text: "Метарсам, ки маро тарк мекунад."},
					{Letter: LetterG, Text: "Хашмгин мешавам, ки чаро маро қадр намекунад."},
					{Letter: LetterD, Text: "Мехоҳам бо ӯ дар бораи эҳсосам суҳбат кунам."},
					{Letter: LetterE, Text: "Кӯшиш мекунам сабаби рафторашро фаҳмам."},
					{Letter: LetterZh, Text: "Эҳтиёҷамро мегӯям ва арзиши худро фаромӯш намекунам."},
					{Letter: LetterZ, Text: "Ором мемонам, худро эҳтиром мекунам ва муносибатро воқеъбинона мебинам."},
				},
			},
			{
				ID:       4,
				Sphere:   "Оила ва муносибатҳои наздик",
				Question: "Вақте дар оила ҷанҷол мешавад, чӣ мекунӣ?",
				Options: []TestOption{
					{Letter: LetterA, Text: "Худро нодаркор ҳис мекунам."},
					{Letter: LetterB, Text: "Ҳама гуноҳро ба гардани худ мегирам."},
					{Letter: LetterV, Text: "Метарсам, ки оилаам вайрон мешавад."},
					{Letter: LetterG, Text: "Асабонӣ мешавам, баҳс мекунам ва дигаронро айбдор мекунам."},
					{Letter: LetterD, Text: "Кӯшиш мекунам мушкилро ҳал кунам."},
					{Letter: LetterE, Text: "Ба гапи ҳар ду тараф гӯш медиҳам."},
					{Letter: LetterZh, Text: "Фикрамро бо эҳтиром мегӯям ва сарҳад мегузорам."},
					{Letter: LetterZ, Text: "Оромона роҳи ҳалли мушкилро меҷӯям."},
				},
			},
			{
				ID:       5,
				Sphere:   "Кор ва даромад",
				Question: "Вақте корат пеш намеравад ё даромадат кам мешавад, чӣ мекунӣ?",
				Options: []TestOption{
					{Letter: LetterA, Text: "Ноумед мешавам ва мехоҳам ҳамаашро партоям."},
					{Letter: LetterB, Text: "Худро ноком ва нотавон меҳисобам."},
					{Letter: LetterV, Text: "Метарсам, ки ҳеҷ гоҳ муваффақ намешавам."},
					{Letter: LetterG, Text: "Аз худ ва дигарон асабонӣ мешавам."},
					{Letter: LetterD, Text: "Аз нав кӯшиш мекунам."},
					{Letter: LetterE, Text: "Месанҷам, ки дар куҷо хато кардам."},
					{Letter: LetterZh, Text: "Нақшаамро тағйир медиҳам ва роҳи беҳтар меҷӯям."},
					{Letter: LetterZ, Text: "Бо сабр ва оромӣ корамро идома медиҳам."},
				},
			},
			{
				ID:       6,
				Sphere:   "Худбаҳоӣ ва танқид",
				Question: "Вақте касе туро танқид мекунад, чӣ ҳис мекунӣ?",
				Options: []TestOption{
					{Letter: LetterA, Text: "Худро беарзиш ҳис мекунам."},
					{Letter: LetterB, Text: "Худро гунаҳкор медонам."},
					{Letter: LetterV, Text: "Метарсам, ки дигарон маро қабул намекунанд."},
					{Letter: LetterG, Text: "Зуд хашмгин мешавам ва худро ҳимоя мекунам."},
					{Letter: LetterD, Text: "Ҷуръат мекунам фикри худро баён кунам."},
					{Letter: LetterE, Text: "Месанҷам, ки танқид дуруст аст ё не."},
					{Letter: LetterZh, Text: "Танқидро мешунавам, аммо худро паст намезанам."},
					{Letter: LetterZ, Text: "Оромона ҷавоб медиҳам ва аз танқиди дуруст меомӯзам."},
				},
			},
			{
				ID:       7,
				Sphere:   "Муқоиса ва муваффақият",
				Question: "Вақте мебинӣ, ки дигарон аз ту бойтар ё муваффақтаранд, чӣ ҳис мекунӣ?",
				Options: []TestOption{
					{Letter: LetterA, Text: "Худро ноком ҳис мекунам."},
					{Letter: LetterB, Text: "Аз натиҷаҳои зиндагии худ шарм медорам."},
					{Letter: LetterV, Text: "Метарсам, ки ҳеҷ гоҳ ба онҳо намерасам."},
					{Letter: LetterG, Text: "Ҳасад мебарам ё асабонӣ мешавам."},
					{Letter: LetterD, Text: "Ба худ мегӯям, ки ман ҳам метавонам."},
					{Letter: LetterE, Text: "Меомӯзам, ки онҳо чӣ гуна муваффақ шудаанд."},
					{Letter: LetterZh, Text: "Роҳи шахсии худро қабул мекунам ва барои ҳадафҳоям амал мекунам."},
					{Letter: LetterZ, Text: "Аз муваффақияти онҳо хурсанд мешавам ва оромона роҳи худро идома медиҳам."},
				},
			},
			{
				ID:       8,
				Sphere:   "Танҳоӣ ва олами ботинӣ",
				Question: "Вақте танҳо мемонӣ, чӣ ҳис мекунӣ?",
				Options: []TestOption{
					{Letter: LetterA, Text: "Ман ба ҳеҷ кас лозим нестам."},
					{Letter: LetterB, Text: "Фикр мекунам, ки дар ман ягон камбудӣ ҳаст."},
					{Letter: LetterV, Text: "Аз танҳоӣ метарсам."},
					{Letter: LetterG, Text: "Аз одамоне, ки маро танҳо гузоштаанд, хафа мешавам."},
					{Letter: LetterD, Text: "Барои худ машғулият меёбам."},
					{Letter: LetterE, Text: "Мефаҳмам, ки танҳоӣ ҳам қисми зиндагӣ аст."},
					{Letter: LetterZh, Text: "Аз вақти танҳоӣ барои шинохтани худ истифода мекунам."},
					{Letter: LetterZ, Text: "Бо худам ором ҳастам ва аз танҳоӣ наметарсам."},
				},
			},
			{
				ID:       9,
				Sphere:   "Нигоҳ ба оянда",
				Question: "Вақте дар бораи оянда фикр мекунӣ, чӣ ҳис мекунӣ?",
				Options: []TestOption{
					{Letter: LetterA, Text: "Ноумед мешавам, фикр мекунам зиндагиям беҳтар намешавад."},
					{Letter: LetterB, Text: "Аз хатогиҳои гузашта худро маломат мекунам."},
					{Letter: LetterV, Text: "Аз оянда ва мушкилоти эҳтимолӣ метарсам."},
					{Letter: LetterG, Text: "Аз зиндагӣ норозӣ ва асабонӣ мешавам."},
					{Letter: LetterD, Text: "Умед дорам ва як қадами хурд мегузорам."},
					{Letter: LetterE, Text: "Имкониятҳоро меомӯзам ва нақша месозам."},
					{Letter: LetterZh, Text: "Он чиро идора карда метавонам, иҷро мекунам."},
					{Letter: LetterZ, Text: "Бо умед, сабр ва оромӣ ба оянда нигоҳ мекунам."},
				},
			},
			{
				ID:       10,
				Sphere:   "Ҳолати умумии зиндагӣ",
				Question: "Ҳоло кадом ҷумла ба зиндагии ту бештар мувофиқ аст?",
				Options: []TestOption{
					{Letter: LetterA, Text: "Ман худро нотавон ва беарзиш ҳис мекунам."},
					{Letter: LetterB, Text: "Ман бисёр вақт худро гунаҳкор мекунам."},
					{Letter: LetterV, Text: "Ман аз бисёр чиз метарсам."},
					{Letter: LetterG, Text: "Ман зуд хафа ва хашмгин мешавам."},
					{Letter: LetterD, Text: "Ман омодаам зиндагиямро тағйир диҳам."},
					{Letter: LetterE, Text: "Ман худро беҳтар мешиносам ва қарорҳои худро бо фикр мегирам."},
					{Letter: LetterZh, Text: "Ман худро қабул мекунам ва масъулияти зиндагиямро ба даст мегирам."},
					{Letter: LetterZ, Text: "Ман бештар оромӣ, муҳаббат ва сипосгузорӣ ҳис мекунам."},
				},
			},
		},
	}
}
