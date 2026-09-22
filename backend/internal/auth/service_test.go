package auth

import (
	"net/url"
	"testing"

	"tingraph/backend/internal/config"
)

func TestSafeNext(t *testing.T) {
	t.Parallel()
	for _, unsafe := range []string{"", "login", "//other.example/path", "/\\other.example", "/path\tbad"} {
		if got := SafeNext(unsafe); got != "/profile" {
			t.Fatalf("SafeNext(%q) = %q, want /profile", unsafe, got)
		}
	}
	if got := SafeNext("/editor?type=flow"); got != "/editor?type=flow" {
		t.Fatalf("safe path changed to %q", got)
	}
}

func TestPasswordHasher(t *testing.T) {
	hasher, err := NewPasswordHasher()
	if err != nil {
		t.Fatal(err)
	}
	hash, err := hasher.Hash("a-long-enough-passphrase")
	if err != nil {
		t.Fatal(err)
	}
	if !hasher.Compare(hash, "a-long-enough-passphrase") {
		t.Fatal("correct password did not match")
	}
	if hasher.Compare(hash, "a-different-passphrase") {
		t.Fatal("incorrect password matched")
	}
	if hasher.Compare("", "a-long-enough-passphrase") {
		t.Fatal("missing credential matched dummy hash")
	}
}

func TestPublicLinkKeepsTokenOutOfRequestURL(t *testing.T) {
	origin, err := url.Parse("https://tingraph.example")
	if err != nil {
		t.Fatal(err)
	}
	service := Service{cfg: config.Config{PublicOrigin: origin}}
	link, err := url.Parse(service.publicLink("/verify-email", "secret-token", "/editor?type=flow"))
	if err != nil {
		t.Fatal(err)
	}
	if link.RawQuery != "" || link.Fragment == "" {
		t.Fatalf("token must be in fragment only: %s", link.String())
	}
	fragment, err := url.ParseQuery(link.Fragment)
	if err != nil {
		t.Fatal(err)
	}
	if fragment.Get("token") != "secret-token" || fragment.Get("next") != "/editor?type=flow" {
		t.Fatalf("unexpected fragment: %q", link.Fragment)
	}
}
