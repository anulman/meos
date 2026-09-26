// SPDX-License-Identifier: Apache-2.0
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var version = "dev"

type config struct {
	URL                    string   `json:"url"`
	CredentialsFile        string   `json:"credentialsFile"`
	StateDir               string   `json:"stateDir"`
	Dispatch               []string `json:"dispatch"`
	DispatchTimeoutSeconds int      `json:"dispatchTimeoutSeconds"`
}
type credentials struct {
	AuthToken    string `json:"authToken"`
	RefreshToken string `json:"refreshToken"`
}
type item struct {
	ID  string `json:"id"`
	raw json.RawMessage
}

func (i *item) UnmarshalJSON(b []byte) error {
	var v struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	if len(v.ID) != 48 {
		return errors.New("invalid event identity")
	}
	if _, err := hex.DecodeString(v.ID); err != nil {
		return errors.New("invalid event identity")
	}
	i.ID = v.ID
	i.raw = append(i.raw[:0], b...)
	return nil
}

type batch struct {
	Items        []item `json:"items"`
	AckToken     string `json:"ackToken"`
	RetryAfterMS int    `json:"retryAfterMs"`
	RetentionGap bool   `json:"retentionGap"`
}
type state struct {
	Consumer string           `json:"consumer"`
	Accepted map[string]int64 `json:"accepted"`
	Pending  string           `json:"pending,omitempty"`
	LastPoll int64            `json:"lastPoll"`
}
type client struct {
	cfg      config
	creds    credentials
	state    state
	http     *http.Client
	dispatch func(context.Context, item) error
}

type retryError struct {
	status int
	after  time.Duration
}

func (e *retryError) Error() string { return fmt.Sprintf("server status %d", e.status) }

var denied = errors.New("agent permission denied or expired; operator action required")

func privateFile(path string) ([]byte, error) {
	st, e := os.Lstat(path)
	if e != nil {
		return nil, e
	}
	if !st.Mode().IsRegular() || st.Mode().Perm()&0077 != 0 {
		return nil, errors.New("file must be private regular mode 0600")
	}
	if st.Size() > 8<<20 {
		return nil, errors.New("file too large")
	}
	return os.ReadFile(path)
}
func privateDir(path string) error {
	if !filepath.IsAbs(path) {
		return errors.New("absolute private directory required")
	}
	if err := os.MkdirAll(path, 0700); err != nil {
		return err
	}
	st, e := os.Lstat(path)
	if e != nil {
		return e
	}
	resolved, e := filepath.EvalSymlinks(path)
	if e != nil || resolved != filepath.Clean(path) || !st.IsDir() || st.Mode().Perm()&0077 != 0 {
		return errors.New("state directory must be private, not symlinked")
	}
	return nil
}
func atomicJSON(path string, value any) error {
	if err := privateDir(filepath.Dir(path)); err != nil {
		return err
	}
	b, e := json.Marshal(value)
	if e != nil {
		return e
	}
	f, e := os.CreateTemp(filepath.Dir(path), ".meos-")
	if e != nil {
		return e
	}
	defer os.Remove(f.Name())
	if e = f.Chmod(0600); e == nil {
		_, e = f.Write(append(b, '\n'))
	}
	if e == nil {
		e = f.Sync()
	}
	ce := f.Close()
	if e == nil {
		e = ce
	}
	if e == nil {
		e = os.Rename(f.Name(), path)
	}
	if e != nil {
		return e
	}
	d, e := os.Open(filepath.Dir(path))
	if e != nil {
		return e
	}
	defer d.Close()
	return d.Sync()
}
func decodeStrict(b []byte, value any) error {
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	if e := d.Decode(value); e != nil {
		return e
	}
	if d.Decode(&struct{}{}) != io.EOF {
		return errors.New("trailing JSON")
	}
	return nil
}
func load(path string) (*client, error) {
	b, e := privateFile(path)
	if e != nil {
		return nil, e
	}
	c := &client{}
	if e = decodeStrict(b, &c.cfg); e != nil {
		return nil, errors.New("invalid config")
	}
	u, e := url.Parse(c.cfg.URL)
	if e != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return nil, errors.New("exact HTTPS origin required")
	}
	c.cfg.URL = strings.TrimSuffix(c.cfg.URL, "/")
	if len(c.cfg.Dispatch) == 0 || !filepath.IsAbs(c.cfg.Dispatch[0]) || !filepath.IsAbs(c.cfg.CredentialsFile) {
		return nil, errors.New("absolute dispatcher and credentials paths required")
	}
	if c.cfg.DispatchTimeoutSeconds == 0 {
		c.cfg.DispatchTimeoutSeconds = 60
	}
	if c.cfg.DispatchTimeoutSeconds < 1 || c.cfg.DispatchTimeoutSeconds > 90 {
		return nil, errors.New("dispatch timeout must be 1..90 seconds")
	}
	if e = privateDir(c.cfg.StateDir); e != nil {
		return nil, e
	}
	b, e = privateFile(c.cfg.CredentialsFile)
	if e != nil {
		return nil, e
	}
	if e = decodeStrict(b, &c.creds); e != nil {
		return nil, errors.New("invalid credentials file")
	}
	if c.creds.AuthToken == "" || c.creds.RefreshToken == "" {
		return nil, errors.New("provisioned native credentials required")
	}
	c.http = &http.Client{Timeout: 75 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("redirect denied") }}
	c.dispatch = c.runDispatch
	return c, nil
}
func (c *client) loadState() error {
	b, e := privateFile(filepath.Join(c.cfg.StateDir, "state.json"))
	if errors.Is(e, os.ErrNotExist) {
		id := make([]byte, 16)
		if _, e = rand.Read(id); e != nil {
			return e
		}
		c.state = state{Consumer: hex.EncodeToString(id), Accepted: map[string]int64{}}
		return c.save()
	}
	if e != nil {
		return e
	}
	if e = decodeStrict(b, &c.state); e != nil {
		return errors.New("invalid state")
	}
	if len(c.state.Consumer) != 32 || c.state.Accepted == nil {
		return errors.New("invalid state")
	}
	return nil
}
func (c *client) save() error {
	return atomicJSON(filepath.Join(c.cfg.StateDir, "state.json"), c.state)
}
func (c *client) request(ctx context.Context, op string, payload any) ([]byte, int, error) {
	b, e := json.Marshal(payload)
	if e != nil {
		return nil, 0, e
	}
	r, e := http.NewRequestWithContext(ctx, "POST", c.cfg.URL+"/api/meos/agent/"+op, bytes.NewReader(b))
	if e != nil {
		return nil, 0, e
	}
	r.Header.Set("Content-Type", "application/json")
	if op != "refresh" {
		r.Header.Set("Authorization", "Bearer "+c.creds.AuthToken)
	}
	res, e := c.http.Do(r)
	if e != nil {
		return nil, 0, errors.New("transport unavailable")
	}
	defer res.Body.Close()
	body, e := io.ReadAll(io.LimitReader(res.Body, 8<<20+1))
	if e != nil || len(body) > 8<<20 {
		return nil, 0, errors.New("invalid response size")
	}
	if res.StatusCode == 429 || res.StatusCode == 503 {
		after := time.Duration(0)
		if seconds, err := strconv.Atoi(res.Header.Get("Retry-After")); err == nil && seconds > 0 && seconds <= 300 {
			after = time.Duration(seconds) * time.Second
		}
		return nil, res.StatusCode, &retryError{res.StatusCode, after}
	}
	return body, res.StatusCode, nil
}
func (c *client) call(ctx context.Context, op string, payload any, out any) error {
	for attempt := 0; attempt < 2; attempt++ {
		b, status, e := c.request(ctx, op, payload)
		if e != nil {
			return e
		}
		if status == 401 && attempt == 0 {
			if e = c.refresh(ctx); e != nil {
				return e
			}
			continue
		}
		if status == 401 || status == 403 {
			return denied
		}
		if status != 200 {
			return fmt.Errorf("server status %d", status)
		}
		if e = json.Unmarshal(b, out); e != nil {
			return errors.New("invalid server JSON")
		}
		return nil
	}
	return denied
}
func (c *client) refresh(ctx context.Context) error {
	b, status, e := c.request(ctx, "refresh", map[string]string{"refresh_token": c.creds.RefreshToken})
	if e != nil {
		return e
	}
	if status != 200 {
		return denied
	}
	var v struct {
		Auth    string `json:"auth_token"`
		Refresh string `json:"refresh_token"`
	}
	if json.Unmarshal(b, &v) != nil || v.Auth == "" {
		return errors.New("invalid refresh response")
	}
	next := c.creds
	next.AuthToken = v.Auth
	if v.Refresh != "" {
		next.RefreshToken = v.Refresh
	}
	if e = atomicJSON(c.cfg.CredentialsFile, next); e != nil {
		return errors.New("cannot persist refreshed credentials")
	}
	c.creds = next
	return nil
}

type boundedOutput struct{ bytes.Buffer }

func (b *boundedOutput) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 4096 {
		return 0, errors.New("dispatcher output limit")
	}
	return b.Buffer.Write(p)
}
func (c *client) runDispatch(ctx context.Context, i item) error {
	ctx, cancel := context.WithTimeout(ctx, time.Duration(c.cfg.DispatchTimeoutSeconds)*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, c.cfg.Dispatch[0], c.cfg.Dispatch[1:]...)
	cmd.Env = []string{"PATH=/usr/bin:/bin", "MEOS_EVENT_ID=" + i.ID}
	cmd.Stdin = bytes.NewReader(i.raw)
	var out boundedOutput
	cmd.Stdout = &out
	cmd.Stderr = io.Discard
	cmd.WaitDelay = time.Second
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
	if cmd.Run() != nil {
		return errors.New("durable dispatcher did not confirm acceptance")
	}
	var receipt struct {
		ID       string `json:"id"`
		Accepted bool   `json:"accepted"`
	}
	if decodeStrict(out.Bytes(), &receipt) != nil || receipt.ID != i.ID || !receipt.Accepted {
		return errors.New("invalid durable handoff receipt")
	}
	return nil
}
func (c *client) step(ctx context.Context) (time.Duration, error) {
	var b batch
	if e := c.call(ctx, "poll", map[string]any{"consumer": c.state.Consumer, "waitMs": 25000, "limit": 1}, &b); e != nil {
		return 0, e
	}
	if b.RetentionGap {
		return 0, errors.New("retention gap; reconcile agenda then explicitly ack-gap")
	}
	if len(b.Items) > 100 || b.RetryAfterMS < 0 || b.RetryAfterMS > 60000 {
		return 0, errors.New("invalid poll response")
	}
	c.state.LastPoll = time.Now().Unix()
	if len(b.Items) == 0 {
		if e := c.save(); e != nil {
			return 0, e
		}
		d := time.Duration(b.RetryAfterMS) * time.Millisecond
		if d < time.Second {
			d = time.Second
		}
		return d, nil
	}
	if len(b.AckToken) != 64 {
		return 0, errors.New("invalid acknowledgement token")
	}
	for _, i := range b.Items {
		if _, ok := c.state.Accepted[i.ID]; ok {
			continue
		}
		c.state.Pending = i.ID
		if e := c.save(); e != nil {
			return 0, e
		}
		if e := c.dispatch(ctx, i); e != nil {
			return 0, e
		}
		c.state.Accepted[i.ID] = time.Now().Unix()
		c.state.Pending = ""
		if e := c.save(); e != nil {
			return 0, e
		}
	}
	if e := c.save(); e != nil {
		return 0, e
	}
	var result struct {
		Acked bool `json:"acked"`
	}
	if e := c.call(ctx, "ack", map[string]string{"consumer": c.state.Consumer, "ackToken": b.AckToken}, &result); e != nil {
		return 0, e
	}
	if !result.Acked {
		return 0, errors.New("acknowledgement not confirmed")
	}
	for id, at := range c.state.Accepted {
		if at < time.Now().Add(-14*24*time.Hour).Unix() {
			delete(c.state.Accepted, id)
		}
	}
	return 0, c.save()
}
func wait(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
func backoff(failures int) time.Duration {
	if failures > 6 {
		failures = 6
	}
	cap := int64(500) * (1 << failures)
	if cap > 30000 {
		cap = 30000
	}
	n, e := rand.Int(rand.Reader, big.NewInt(cap/2+1))
	if e != nil {
		return time.Duration(cap) * time.Millisecond
	}
	return time.Duration(cap/2+n.Int64()) * time.Millisecond
}
func run(args []string) error {
	if len(args) == 1 && args[0] == "version" {
		fmt.Println(version)
		return nil
	}
	if len(args) != 2 {
		return errors.New("usage: meos-agent {install|run|status|doctor|configure|ack-gap} /absolute/config.json")
	}
	c, e := load(args[1])
	if e != nil {
		return e
	}
	if args[0] == "status" {
		b, e := privateFile(filepath.Join(c.cfg.StateDir, "state.json"))
		if e != nil {
			return e
		}
		if e = decodeStrict(b, &c.state); e != nil {
			return errors.New("invalid state")
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"lastPoll": c.state.LastPoll, "pending": c.state.Pending, "acceptedCount": len(c.state.Accepted)})
	}
	lock, e := os.OpenFile(filepath.Join(c.cfg.StateDir, "lock"), os.O_CREATE|os.O_RDWR|syscall.O_NOFOLLOW, 0600)
	if e != nil {
		return e
	}
	defer lock.Close()
	if e = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); e != nil {
		return errors.New("another client owns this state directory")
	}
	defer syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
	if e = c.loadState(); e != nil {
		return e
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	switch args[0] {
	case "install":
		fmt.Println("Private state initialized; install the supplied supervisor template.")
		return nil
	case "status":
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"lastPoll": c.state.LastPoll, "pending": c.state.Pending, "acceptedCount": len(c.state.Accepted)})
	case "doctor", "configure", "ack-gap":
		op := "status"
		payload := map[string]any{"consumer": c.state.Consumer}
		if args[0] == "configure" {
			op = "configure"
			b, e := io.ReadAll(io.LimitReader(os.Stdin, 150001))
			if e != nil || len(b) > 150000 {
				return errors.New("invalid preferences input")
			}
			var prefs any
			if json.Unmarshal(b, &prefs) != nil {
				return errors.New("invalid preferences JSON")
			}
			payload["preferences"] = prefs
		}
		if args[0] == "ack-gap" {
			op = "reconcile"
		}
		var out any
		if e = c.call(ctx, op, payload, &out); e != nil {
			return e
		}
		return json.NewEncoder(os.Stdout).Encode(out)
	case "run":
		failures := 0
		for ctx.Err() == nil {
			d, e := c.step(ctx)
			if ctx.Err() != nil {
				return nil
			}
			if errors.Is(e, denied) || e != nil && strings.HasPrefix(e.Error(), "retention gap") {
				return e
			}
			if e != nil {
				failures++
				fmt.Fprintln(os.Stderr, "Delivery attempt failed; retained for safe retry.")
				d = backoff(failures)
				var retry *retryError
				if errors.As(e, &retry) && retry.after > d {
					d = retry.after
				}
			} else {
				failures = 0
			}
			if wait(ctx, d) != nil {
				return nil
			}
		}
		return nil
	default:
		return errors.New("unknown command")
	}
}
func main() {
	if e := run(os.Args[1:]); e != nil {
		fmt.Fprintln(os.Stderr, "meos-agent:", e)
		os.Exit(1)
	}
}
