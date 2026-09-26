// SPDX-License-Identifier: Apache-2.0
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func fixture(t *testing.T, handler http.HandlerFunc) *client {
	t.Helper()
	dir := t.TempDir()
	if e := os.Chmod(dir, 0700); e != nil {
		t.Fatal(e)
	}
	s := httptest.NewTLSServer(handler)
	t.Cleanup(s.Close)
	c := &client{cfg: config{URL: s.URL, StateDir: dir, CredentialsFile: filepath.Join(dir, "credentials.json"), DispatchTimeoutSeconds: 1}, creds: credentials{"synthetic", "refresh"}, state: state{Consumer: strings.Repeat("a", 32), Accepted: map[string]int64{}}, http: s.Client()}
	if e := c.save(); e != nil {
		t.Fatal(e)
	}
	return c
}

const eventID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func poll(w http.ResponseWriter) {
	fmt.Fprintf(w, `{"items":[{"id":%q,"title":"$(touch /tmp/NEVER); malicious-literal"}],"ackToken":%q}`, eventID, strings.Repeat("b", 64))
}
func TestInterruptedDispatchAndUnknownAckReplay(t *testing.T) {
	acks := 0
	c := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "poll") {
			poll(w)
		} else {
			acks++
			if acks == 1 {
				http.Error(w, "unknown", 503)
			} else {
				fmt.Fprint(w, `{"acked":true}`)
			}
		}
	})
	dispatches := 0
	c.dispatch = func(context.Context, item) error {
		dispatches++
		if dispatches == 1 {
			return errors.New("interrupted")
		}
		return nil
	}
	if _, e := c.step(context.Background()); e == nil {
		t.Fatal("must retain interrupted dispatch")
	}
	if acks != 0 || c.state.Pending != eventID {
		t.Fatal("acked before acceptance")
	}
	if _, e := c.step(context.Background()); e == nil {
		t.Fatal("unknown ack expected")
	}
	if e := c.loadState(); e != nil {
		t.Fatal(e)
	}
	if _, e := c.step(context.Background()); e != nil {
		t.Fatal(e)
	}
	if dispatches != 2 || acks != 2 {
		t.Fatal("duplicate accepted dispatch", dispatches, acks)
	}
}
func TestAuthRefreshPersistAndRevocation(t *testing.T) {
	refreshes := 0
	c := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "refresh") {
			refreshes++
			fmt.Fprint(w, `{"auth_token":"new-token","refresh_token":"rotated"}`)
			return
		}
		if r.Header.Get("Authorization") == "Bearer synthetic" {
			w.WriteHeader(401)
			return
		}
		w.WriteHeader(403)
	})
	var out any
	if e := c.call(context.Background(), "status", map[string]string{}, &out); !errors.Is(e, denied) {
		t.Fatal(e)
	}
	b, e := privateFile(c.cfg.CredentialsFile)
	if e != nil || !strings.Contains(string(b), "rotated") || refreshes != 1 {
		t.Fatal("refresh was not persisted")
	}
}
func TestNoShellInterpolationAndExplicitReceipt(t *testing.T) {
	c := fixture(t, func(http.ResponseWriter, *http.Request) {})
	c.cfg.Dispatch = []string{os.Args[0], "-test.run=TestDispatcherHelper", "--", eventID}
	c.dispatch = c.runDispatch
	var i item
	if e := json.Unmarshal([]byte(fmt.Sprintf(`{"id":%q,"title":"$(touch /tmp/MEOS_PWN)"}`, eventID)), &i); e != nil {
		t.Fatal(e)
	}
	if e := c.runDispatch(context.Background(), i); e != nil {
		t.Fatal(e)
	}
	c.cfg.Dispatch = []string{"/bin/true"}
	if e := c.runDispatch(context.Background(), i); e == nil {
		t.Fatal("exit zero is not durable receipt")
	}
}
func TestDispatcherHelper(t *testing.T) {
	if len(os.Args) < 3 || os.Args[len(os.Args)-2] != "--" {
		return
	}
	var v map[string]any
	if json.NewDecoder(os.Stdin).Decode(&v) != nil {
		os.Exit(3)
	}
	if v["title"] != "$(touch /tmp/MEOS_PWN)" {
		os.Exit(4)
	}
	fmt.Printf(`{"id":%q,"accepted":true}`, os.Args[len(os.Args)-1])
	os.Exit(0)
}
func TestPermissionAndSymlinkDenial(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "secret")
	os.WriteFile(p, []byte("synthetic"), 0644)
	if _, e := privateFile(p); e == nil {
		t.Fatal("world readable allowed")
	}
	os.Chmod(p, 0600)
	link := filepath.Join(dir, "link")
	os.Symlink(p, link)
	if _, e := privateFile(link); e == nil {
		t.Fatal("symlink allowed")
	}
}
func TestRetryAfterAndCancellation(t *testing.T) {
	c := fixture(t, func(w http.ResponseWriter, r *http.Request) { w.Header().Set("Retry-After", "17"); w.WriteHeader(429) })
	var out any
	e := c.call(context.Background(), "poll", nil, &out)
	var retry *retryError
	if !errors.As(e, &retry) || retry.after != 17*time.Second {
		t.Fatal(e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if wait(ctx, time.Hour) == nil {
		t.Fatal("cancel ignored")
	}
}
func TestGapFailClosedAndIdleMinimum(t *testing.T) {
	gap := true
	c := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"items":[],"retentionGap":%t,"retryAfterMs":0}`, gap)
	})
	if _, e := c.step(context.Background()); e == nil {
		t.Fatal("gap ignored")
	}
	gap = false
	if d, e := c.step(context.Background()); e != nil || d < time.Second {
		t.Fatal(d, e)
	}
}

func TestIdleResourceEnvelope(t *testing.T) {
	calls := 0
	c := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		time.Sleep(2 * time.Second)
		fmt.Fprint(w, `{"items":[],"retryAfterMs":1000}`)
	})
	var before, after syscall.Rusage
	syscall.Getrusage(syscall.RUSAGE_SELF, &before)
	started := time.Now()
	if _, e := c.step(context.Background()); e != nil {
		t.Fatal(e)
	}
	syscall.Getrusage(syscall.RUSAGE_SELF, &after)
	cpu := (after.Utime.Sec-before.Utime.Sec)*1000000 + (after.Utime.Usec - before.Utime.Usec) + (after.Stime.Sec-before.Stime.Sec)*1000000 + (after.Stime.Usec - before.Stime.Usec)
	if calls != 1 || cpu > 250000 {
		t.Fatal("idle loop spun", calls, cpu)
	}
	t.Logf("idle measured: wall=%s requests=%d CPU=%d us maxRSS=%d KiB (Linux test process including TLS harness)", time.Since(started), calls, cpu, after.Maxrss)
}
