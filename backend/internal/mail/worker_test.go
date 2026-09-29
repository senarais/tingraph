package mail

import (
	"strings"
	"testing"
)

func TestAllEmailTemplates(t *testing.T) {
	for _, name := range []string{"verify_email", "reset_password", "password_changed"} {
		_, plain, html, err := render(name, map[string]string{"link": `https://tingraph.example/account?value="<bad>`}, "https://tingraph.example")
		if err != nil || !strings.Contains(html, `https://tingraph.example/icon.png`) ||
			!strings.Contains(html, "tingraph") || strings.Contains(html, `<bad>`) ||
			!strings.Contains(plain, "Tingraph") {
			t.Fatalf("unsafe or incomplete %s email: %v", name, err)
		}
		if name == "password_changed" && strings.Contains(html, `?value=`) {
			t.Fatal("security notice contains reset link")
		}
	}
}
