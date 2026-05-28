<!--
HASHNODE METADATA (set in Hashnode's UI, not in the post body):

Title:    GSoC 2026: Building Kerberos & Certificate Trace Presenters for Metasploit
Slug:     gsoc-2026-metasploit-kerberos-certificate-trace-presenters
Subtitle: How I'm bringing HttpTrace-style transparency to Active Directory authentication artefacts inside msfconsole
Tags:     metasploit, gsoc, opensource, cybersecurity, kerberos, activedirectory, pentesting, ruby
Cover:    use an image of the Metasploit logo or a generic GSoC 2026 banner

When you publish, copy everything BELOW this comment block into Hashnode's
Markdown editor. Hashnode will render the code blocks, headings, and links
exactly as written.
-->

I'm spending the summer of 2026 contributing to the **Metasploit Framework** as a Google Summer of Code contributor. This is a build log of what I'm doing, why it matters, and how you can follow along.

## The short version

I'm building two new inline tracing capabilities for Metasploit:

- **`KerberosTicketTracePresenter`** — inspect every Kerberos ticket (AS-REQ, TGS-REQ, S4U2Self/S4U2Proxy) directly inside `msfconsole`.
- **`CertificateTracePresenter`** — inspect every X.509 certificate artefact that flows through PKINIT and ADCS attack modules without exporting `.pfx` or `.cer` files to disk.

Both are modelled on Metasploit's existing `HttpTrace` capability and follow the same pattern as `krb5_ccache_presenter.rb`. They're fully backward-compatible — defaults are `off`, so no existing module behaviour changes.

**Mentors:** [@jheysel-r7](https://github.com/jheysel-r7) (primary) and [@zeroSteiner](https://github.com/zeroSteiner) (co-mentor).
**Effort:** 175 hours over 12 weeks, June–August 2026.
**Working fork:** [github.com/Pushpenderrathore/metasploit-framework](https://github.com/Pushpenderrathore/metasploit-framework)

## Why this project exists

If you've run a modern red-team engagement against an Active Directory environment, you know the workflow. You fire off a Kerberos module — `kerberos_login`, `kerberos_enumusers`, an ADCS ESC1 exploit — get a ticket, and then you have to:

1. Export the `.ccache` to disk.
2. Switch to an auxiliary module or an external tool (klist, Rubeus, Impacket's `describeTicket.py`) to actually read the ticket.
3. Lose your `msfconsole` context, your environment, and arguably your OPSEC.

That workflow break is friction. It slows down legitimate testing and it leaves artefacts on disk. The same problem exists for X.509 certificates produced by PKINIT and the ESC1–ESC16 attack chain — operators are constantly exporting `.pfx` files just to inspect serial numbers, validity windows, and EKU fields.

Metasploit already solved the equivalent problem for HTTP a long time ago. `HttpTrace` in `Exploit::Remote::HttpClient` lets you inline-debug every request and response without leaving the console. My project extends that same design philosophy to the authentication layer.

## What the trace presenters actually show

For Kerberos tickets, the presenter surfaces:

- Principal names (client / server / realm)
- Encryption type (RC4-HMAC, AES128, AES256)
- Ticket flags (forwardable, renewable, proxiable, …)
- Validity window (`starttime`, `endtime`, `renew-till`)
- Session key material
- Authorization data (PAC, S4U variants)

For X.509 certificates, the presenter surfaces:

- Subject and issuer DN
- Serial number
- Validity window
- SHA-256 fingerprint
- Public key algorithm and parameters
- Extended Key Usage (the EKU field — critical for ADCS ESC1–ESC16 analysis)
- Subject Alternative Names

All of it printed inline, in the same `msfconsole` session, with no disk artefacts.

## The implementation pattern

Both presenters follow Metasploit's established presenter pattern, exemplified by `krb5_ccache_presenter.rb`:

```ruby
presenter = Msf::Exploit::Remote::Kerberos::Presenter.new(ticket)
print_line(presenter.to_s_as_req)
print_line(presenter.to_s_tgs_req)
```

Instantiate, call `to_s_*` instance methods that return formatted strings, and let the consuming module call `print_line()`. The presenter never writes to stdout itself — that keeps it composable, testable, and respectful of the module's output channels.

The `CertificateTracePresenter` also includes a `coerce()` adapter that wraps any X.509-like object (an `OpenSSL::X509::Certificate`, an `OpenStruct` from a mocked test fixture, or a raw DER blob) into a uniform shape. That makes the presenter trivially unit-testable.

## Where I am right now

Both presenter classes are **prototyped** and validated against AS-REQ and TGS-REQ flows in a local **Windows Server 2022 + ADCS lab** on the `TEST.LOCAL` domain. I've used Wireshark to verify the on-the-wire ticket flows match what the presenter reports.

RSpec suites are written:

- **13 examples** for the Kerberos presenter
- **14 examples** for the certificate presenter

S4U2Self / S4U2Proxy ticket variants require a constrained-delegation lab config and are explicitly planned for Weeks 3–4 of the coding period.

## The 12-week plan

| Phase | Weeks | Focus |
|-------|-------|-------|
| Community Bonding · Phase 1 | 1–2 | HttpTrace study, AD lab bring-up, Wireshark ticket capture |
| Phase 2 — KerberosTicketTracePresenter | 3–6 | Core presenter, dispatcher into `kerberos/client.rb`, AP-REQ + TGS-REQ hooks, integrate into `kerberos_enumusers`, ship 13-example RSpec |
| Midterm Evaluation | end of Week 6 | PR 1 open and under upstream review |
| Phase 3 — CertificateTracePresenter | 7–10 | `coerce()` adapter, `to_s_csr`, PKINIT hook in `send_request_tgt_pkinit`, integrate into `kerberos_login`, validate against ADCS ESC1, ship 14-example RSpec |
| Phase 4 — Test & Docs | 11–12 | Full AD lab integration testing, documentation, PR polish |

## What's next after GSoC

The trace presenters open the door to a broader cleanup. `Rex::Proto::Kerberos` is consumed by a lot more than just the Kerberos auxiliary modules — LDAP-over-Kerberos and SMB-with-Kerberos modules can both benefit from the same inline transparency. That work continues outside the program.

## Follow along

- **GSoC build log** (weekly updates): [pushpenderrathore.github.io/gsoc.html](https://pushpenderrathore.github.io/gsoc.html)
- **Portfolio:** [pushpenderrathore.github.io](https://pushpenderrathore.github.io)
- **Working fork:** [github.com/Pushpenderrathore/metasploit-framework](https://github.com/Pushpenderrathore/metasploit-framework)
- **GSoC 2026 Metasploit org page:** [summerofcode.withgoogle.com/programs/2026/organizations/metasploit](https://summerofcode.withgoogle.com/programs/2026/organizations/metasploit)
- **LinkedIn:** [Pushpender Singh Rathore](https://www.linkedin.com/in/pushpender-singh-rathore-72466a260/)
- **GitHub:** [@Pushpenderrathore](https://github.com/Pushpenderrathore)

I'll be posting weekly progress updates here on Hashnode and on the GSoC build log throughout the coding period. Thanks for reading — and a huge thanks to my mentors @jheysel-r7 and @zeroSteiner, and to the entire Metasploit / Rapid7 community for the chance to contribute.
