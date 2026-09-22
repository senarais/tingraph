package config

import "testing"

func TestLoadRejectsUnknownEnvironment(t *testing.T) {
	t.Setenv("APP_ENV", "prodution")
	if _, err := Load(); err == nil {
		t.Fatal("unknown APP_ENV was accepted")
	}
}
