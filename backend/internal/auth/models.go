package auth

import "time"

type Profile struct {
	Username    *string `json:"username"`
	FullName    *string `json:"full_name"`
	AvatarURL   *string `json:"avatar_url"`
	Profession  *string `json:"profession"`
	Affiliation *string `json:"affiliation"`
	Location    *string `json:"location"`
	Website     *string `json:"website"`
	Bio         *string `json:"bio"`
}

type User struct {
	ID              string    `json:"id"`
	Email           string    `json:"email"`
	EmailVerified   bool      `json:"email_verified"`
	CreatedAt       time.Time `json:"created_at"`
	AuthenticatedAt time.Time `json:"authenticated_at"`
	Providers       []string  `json:"providers"`
	Profile         Profile   `json:"profile"`
}

type Session struct {
	ID        string
	TokenHash []byte
	User      User
}
