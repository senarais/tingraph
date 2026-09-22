package mail

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log/slog"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"tingraph/backend/internal/config"
)

type Worker struct {
	db     *pgxpool.Pool
	config config.SMTP
	log    *slog.Logger
}

type message struct {
	ID        string
	Recipient string
	Template  string
	Payload   map[string]string
	Attempts  int
}

func NewWorker(db *pgxpool.Pool, cfg config.SMTP, logger *slog.Logger) *Worker {
	return &Worker{db: db, config: cfg, log: logger}
}

func (worker *Worker) Run(ctx context.Context) {
	if worker.config.Host == "" {
		worker.log.Warn("SMTP is disabled; email remains queued")
		return
	}
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		if err := worker.deliverOne(ctx); err != nil && !errors.Is(err, pgx.ErrNoRows) && ctx.Err() == nil {
			worker.log.Error("email delivery failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (worker *Worker) deliverOne(ctx context.Context) error {
	tx, err := worker.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var item message
	var payload []byte
	err = tx.QueryRow(ctx, `
		select id::text, recipient::text, template, payload, attempts
		from ops.email_outbox
		where sent_at is null
		  and available_at <= now()
		  and (locked_at is null or locked_at < now() - interval '5 minutes')
		order by created_at
		for update skip locked
		limit 1`,
	).Scan(&item.ID, &item.Recipient, &item.Template, &payload, &item.Attempts)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(payload, &item.Payload); err != nil {
		return worker.fail(ctx, tx, item, "invalid email payload")
	}
	if _, err := tx.Exec(ctx,
		`update ops.email_outbox set locked_at = now(), attempts = attempts + 1 where id = $1`, item.ID,
	); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}

	subject, plain, markup, err := render(item.Template, item.Payload)
	if err == nil {
		err = worker.send(ctx, item.Recipient, subject, plain, markup)
	}
	if err != nil {
		return worker.recordFailure(ctx, item, err)
	}
	_, err = worker.db.Exec(ctx, `
		update ops.email_outbox
		set sent_at = now(), locked_at = null, payload = '{}'::jsonb, last_error = null
		where id = $1`, item.ID,
	)
	return err
}

func (worker *Worker) fail(ctx context.Context, tx pgx.Tx, item message, problem string) error {
	delay := retryDelay(item.Attempts + 1)
	_, err := tx.Exec(ctx, `
		update ops.email_outbox
		set attempts = attempts + 1, locked_at = null,
		    available_at = now() + $2::interval, last_error = $3
		where id = $1`, item.ID, durationInterval(delay), problem,
	)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (worker *Worker) recordFailure(ctx context.Context, item message, cause error) error {
	delay := retryDelay(item.Attempts + 1)
	message := cause.Error()
	if len(message) > 1000 {
		message = message[:1000]
	}
	_, err := worker.db.Exec(ctx, `
		update ops.email_outbox
		set locked_at = null, available_at = now() + $2::interval, last_error = $3
		where id = $1`, item.ID, durationInterval(delay), message,
	)
	if err != nil {
		return err
	}
	return cause
}

func (worker *Worker) send(ctx context.Context, recipient, subject, plain, markup string) error {
	from, err := mail.ParseAddress(worker.config.From)
	if err != nil {
		return errors.New("SMTP_FROM is invalid")
	}
	address := net.JoinHostPort(worker.config.Host, strconv.Itoa(worker.config.Port))
	dialer := net.Dialer{Timeout: 10 * time.Second}
	tlsConfig := &tls.Config{ServerName: worker.config.Host, MinVersion: tls.VersionTLS12}

	var connection net.Conn
	if worker.config.TLSMode == "tls" {
		connection, err = tls.DialWithDialer(&dialer, "tcp", address, tlsConfig)
	} else {
		connection, err = dialer.DialContext(ctx, "tcp", address)
	}
	if err != nil {
		return fmt.Errorf("connect to SMTP: %w", err)
	}
	defer connection.Close()
	_ = connection.SetDeadline(time.Now().Add(20 * time.Second))
	client, err := smtp.NewClient(connection, worker.config.Host)
	if err != nil {
		return fmt.Errorf("start SMTP client: %w", err)
	}
	defer client.Close()
	if worker.config.TLSMode == "starttls" {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return errors.New("SMTP server does not support STARTTLS")
		}
		if err := client.StartTLS(tlsConfig); err != nil {
			return fmt.Errorf("start SMTP TLS: %w", err)
		}
	}
	if worker.config.Username != "" {
		if ok, _ := client.Extension("AUTH"); !ok {
			return errors.New("SMTP server does not support authentication")
		}
		auth := smtp.PlainAuth("", worker.config.Username, worker.config.Password, worker.config.Host)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("authenticate SMTP: %w", err)
		}
	}
	if err := client.Mail(from.Address); err != nil {
		return err
	}
	if err := client.Rcpt(recipient); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	boundary := "tingraph-boundary"
	body := strings.Join([]string{
		"From: " + worker.config.From,
		"To: " + recipient,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: multipart/alternative; boundary=" + boundary,
		"",
		"--" + boundary,
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: 8bit",
		"",
		plain,
		"--" + boundary,
		"Content-Type: text/html; charset=UTF-8",
		"Content-Transfer-Encoding: 8bit",
		"",
		markup,
		"--" + boundary + "--",
		"",
	}, "\r\n")
	if _, err := writer.Write([]byte(body)); err != nil {
		writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}

func render(template string, payload map[string]string) (string, string, string, error) {
	link := payload["link"]
	var subject, action, intro string
	switch template {
	case "verify_email":
		subject = "Confirm your Tingraph account"
		action = "Confirm email"
		intro = "Confirm this email address to finish creating your Tingraph account."
	case "reset_password":
		subject = "Reset your Tingraph password"
		action = "Set a new password"
		intro = "Use this link within 30 minutes to choose a new Tingraph password."
	case "password_changed":
		subject = "Your Tingraph password changed"
		plain := "Your Tingraph password was changed. If this was not you, contact the site operator immediately."
		return subject, plain, emailHTML(subject, plain, "", ""), nil
	default:
		return "", "", "", errors.New("unknown email template")
	}
	if link == "" {
		return "", "", "", errors.New("email link is missing")
	}
	plain := intro + "\n\n" + link + "\n\nIf you did not request this, ignore this email."
	return subject, plain, emailHTML(subject, intro, action, link), nil
}

func emailHTML(title, intro, action, link string) string {
	button := ""
	if link != "" {
		button = `<p style="margin:24px 0"><a href="` + html.EscapeString(link) + `" style="display:inline-block;background:#1e1e1e;color:#efede6;padding:12px 16px;text-decoration:none;font-family:monospace">` + html.EscapeString(action) + `</a></p>`
	}
	return `<!doctype html><html><body style="margin:0;background:#efede6;color:#1e1e1e"><div style="max-width:560px;margin:32px auto;background:#fff;border:2px solid #1e1e1e;padding:28px"><h1 style="font:600 22px sans-serif;margin:0 0 18px">` + html.EscapeString(title) + `</h1><p style="font:14px/1.6 sans-serif">` + html.EscapeString(intro) + `</p>` + button + `<p style="font:12px/1.5 monospace;color:#666">If you did not request this, ignore this email.</p></div></body></html>`
}

func retryDelay(attempts int) time.Duration {
	if attempts > 8 {
		attempts = 8
	}
	return time.Duration(1<<attempts) * time.Minute
}

func durationInterval(value time.Duration) string {
	return fmt.Sprintf("%f seconds", value.Seconds())
}
