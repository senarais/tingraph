package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

const (
	passwordMemory  = 64 * 1024
	passwordTime    = 3
	passwordThreads = 1
	passwordKeyLen  = 32
	passwordMin     = 15
	passwordMax     = 1024
)

type PasswordHasher struct {
	workers chan struct{}
	dummy   string
}

func NewPasswordHasher() (*PasswordHasher, error) {
	hasher := &PasswordHasher{workers: make(chan struct{}, 2)}
	dummy, err := hasher.Hash("not-a-real-password-value")
	if err != nil {
		return nil, err
	}
	hasher.dummy = dummy
	return hasher, nil
}

func ValidatePassword(password string) error {
	length := utf8.RuneCountInString(password)
	if length < passwordMin {
		return fmt.Errorf("use a password of at least %d characters", passwordMin)
	}
	if len(password) > passwordMax {
		return errors.New("password is too long")
	}
	return nil
}

func (hasher *PasswordHasher) Hash(password string) (string, error) {
	hasher.workers <- struct{}{}
	defer func() { <-hasher.workers }()
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate password salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, passwordTime, passwordMemory, passwordThreads, passwordKeyLen)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		passwordMemory,
		passwordTime,
		passwordThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

func (hasher *PasswordHasher) Compare(encoded, password string) bool {
	if encoded == "" {
		encoded = hasher.dummy
	}
	memory, iterations, threads, salt, expected, err := parsePasswordHash(encoded)
	if err != nil {
		return false
	}
	hasher.workers <- struct{}{}
	actual := argon2.IDKey([]byte(password), salt, iterations, memory, threads, uint32(len(expected)))
	<-hasher.workers
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func parsePasswordHash(encoded string) (uint32, uint32, uint8, []byte, []byte, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return 0, 0, 0, nil, nil, errors.New("invalid password hash")
	}
	var memory, iterations uint64
	var threads uint64
	for _, parameter := range strings.Split(parts[3], ",") {
		name, value, ok := strings.Cut(parameter, "=")
		if !ok {
			return 0, 0, 0, nil, nil, errors.New("invalid password parameters")
		}
		parsed, err := strconv.ParseUint(value, 10, 32)
		if err != nil {
			return 0, 0, 0, nil, nil, errors.New("invalid password parameters")
		}
		switch name {
		case "m":
			memory = parsed
		case "t":
			iterations = parsed
		case "p":
			threads = parsed
		}
	}
	if memory < 19*1024 || memory > 128*1024 || iterations < 2 || iterations > 5 || threads < 1 || threads > 4 {
		return 0, 0, 0, nil, nil, errors.New("unsafe password parameters")
	}
	salt, err := base64.RawStdEncoding.Strict().DecodeString(parts[4])
	if err != nil || len(salt) < 16 || len(salt) > 32 {
		return 0, 0, 0, nil, nil, errors.New("invalid password salt")
	}
	key, err := base64.RawStdEncoding.Strict().DecodeString(parts[5])
	if err != nil || len(key) < 32 || len(key) > 64 {
		return 0, 0, 0, nil, nil, errors.New("invalid password key")
	}
	return uint32(memory), uint32(iterations), uint8(threads), salt, key, nil
}

func RandomToken() (string, []byte, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	hash := sha256.Sum256([]byte(token))
	return token, hash[:], nil
}

func TokenHash(token string) []byte {
	hash := sha256.Sum256([]byte(token))
	return hash[:]
}
