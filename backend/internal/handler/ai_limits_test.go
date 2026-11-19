package handler

import (
	"strings"
	"testing"
	"unicode/utf8"

	"tingraph/backend/internal/ai"
)

func TestValidAskKeepsWholeCharacters(t *testing.T) {
	long := strings.Repeat("é", ai.MaxPromptChars+5)
	tooBig := strings.Repeat("x", ai.MaxSourceChars+1)
	turns := make([]ai.Turn, 0, ai.MaxTurns+2)
	for range ai.MaxTurns + 1 {
		turns = append(turns, ai.Turn{Role: "ai", Text: "ok", Source: "flow \"a\" {}"})
	}
	turns = append(turns, ai.Turn{Role: "you", Text: long, Source: tooBig})
	ask := ai.Ask{Category: "flow", Turns: turns}
	if !validAsk(&ask) {
		t.Fatal("ask refused")
	}
	if len(ask.Turns) != ai.MaxTurns {
		t.Fatalf("kept %d turns", len(ask.Turns))
	}
	last := ask.Turns[len(ask.Turns)-1]
	if !utf8.ValidString(last.Text) || utf8.RuneCountInString(last.Text) != ai.MaxPromptChars {
		t.Fatalf("prompt cut to %d characters", utf8.RuneCountInString(last.Text))
	}
	if last.Source != "" {
		t.Fatal("an oversized source was kept in part")
	}
}
