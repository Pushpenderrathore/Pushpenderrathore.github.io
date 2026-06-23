# GSoC 2026 Week 1: Shipping CertificateTracePresenter for Metasploit, Six Weeks Ahead of Schedule

**Google Summer of Code 2026 · Metasploit Framework · Rapid7**

---

The coding period opened on June 2nd. By June 5th (three days in), `CertificateTracePresenter` was implemented, integrated into 10+ Metasploit modules, and a PR was open under upstream review. `KerberosTicketTracePresenter` had its core class done too. My accepted proposal had both of these scoped for Weeks 3–10. This post is a technical account of how Week 1 actually went.

---

## The Project in One Paragraph

My GSoC 2026 project adds two new inline tracing capabilities to the Metasploit Framework: **KerberosTicketTracePresenter** and **CertificateTracePresenter**. The idea is the same as `HttpTrace` in `Exploit::Remote::HttpClient`: when you set `HttpTrace full`, every HTTP request and response dumps inline into your `msfconsole` session so you can see exactly what the module is doing without switching to Wireshark. My project extends that same philosophy to the authentication layer: Kerberos tickets and X.509 certificates that flow through a module run should be inspectable *inline*, without exporting `.ccache` or `.pfx` files to disk.

---

## Community Bonding: Reading the Code Before Writing It

Before writing a line, I spent community bonding reading. The main target was `lib/msf/core/exploit/remote/http_client.rb`, specifically the `HttpTrace` implementation. The pattern is simple but disciplined:

1. A module includes a mixin that registers advanced options (`HttpTrace`, `HttpTraceColors`).
2. The mixin exposes a single dispatch method (`http_trace`) that builds a formatted string and calls `print_line`.
3. The actual formatting is *not* in the mixin; it's delegated to a separate presenter class that knows nothing about modules, mixins, or output.
4. The presenter lives in `lib/msf/core/trace/` and follows the same responsibility split as `Rex::Proto::Kerberos::CredentialCache::Krb5CCachePresenter`: it constructs strings, the caller prints them.

The key insight from studying `HttpTrace`: the separation between *where you hook* (the mixin, wired into the HTTP send/receive path) and *what you display* (the presenter, pure string formatting) is what makes the feature testable. The presenter takes in data and returns strings; the mixin takes in a module context and calls `print_line`. Test them independently.

I also spent time in the Kerberos client mixin (`lib/msf/core/exploit/remote/kerberos/client.rb`) and the PKINIT path (`send_request_tgt_pkinit`) to find the right places to hook. For certificates, the two natural call sites are: the moment a certificate is *presented* to the KDC for PKINIT authentication, and the moment a certificate is *received* from AD CS after a successful enrollment request.

The AD lab (Windows Server 2022 + ADCS on `TEST.LOCAL`) was up by the end of community bonding. Wireshark validated AS-REQ and TGS-REQ flows and confirmed what fields arrive at each stage. With that foundation, coding started.

---

## Building CertificateTracePresenter

### Why the Certificate Presenter First?

My proposal had `CertificateTracePresenter` in Phase 3 (Weeks 7–10). I built it first because the certificate path is more self-contained. `OpenSSL::X509::Certificate` is a stable, well-documented object; the tracing hook fits into a single place in `ms_icpr`; and the AD CS + PKINIT workflow is the one my lab is configured for. Starting here let me establish the full pattern (presenter, mixin, spec) before tackling the Kerberos model, which has more moving parts.

### The `coerce` Adapter

The first design decision was input normalization. Metasploit modules deal with certificates in at least three forms:

- `OpenSSL::X509::Certificate`: from a parsed PEM/DER response
- `OpenSSL::PKCS12`: from a `.pfx` / PKCS#12 bundle (the typical ADCS enrollment output)
- Raw DER/PEM bytes: from a datastore option or network response

Rather than making every call site coerce the input, I put a `coerce` class method on the presenter:

```ruby
def self.coerce(cert)
  return cert if cert.is_a?(OpenSSL::X509::Certificate)
  return cert.certificate if cert.is_a?(OpenSSL::PKCS12)
  return OpenSSL::X509::Certificate.new(cert) if cert.is_a?(String)
  nil
rescue OpenSSL::X509::CertificateError, OpenSSL::PKCS12::PKCS12Error
  nil
end
```

The rescue returns `nil` on bad input rather than raising: the presenter gracefully no-ops, which is what you want in a trace path that should never break a running module.

### `to_s_metadata` and `to_s_full`

The presenter exposes two output modes, matching `HttpTrace`'s `minimal`/`full` pattern:

**`metadata`** is a five-field summary: Subject, Issuer, Not Before, Not After, SHA-256 fingerprint. Fast, low-noise, useful in automation.

```
[CertificateTrace] --------------------------------------
  Subject    : CN=Administrator,DC=CONTOSO,DC=LOCAL
  Issuer     : CN=CONTOSO-CA,DC=CONTOSO,DC=LOCAL
  Not Before : 2026-01-01 00:00:00 UTC
  Not After  : 2027-01-01 00:00:00 UTC
  SHA-256    : 3a9f2c...
```

**`full`** adds everything above plus serial, version, public key type/size, identity resolution (UPN > Email > CN), SAN, EKU, Key Usage, and a decoded extension dump.

```
[CertificateTrace] --------------------------------------
  Subject    : CN=Administrator,DC=CONTOSO,DC=LOCAL
  Issuer     : CN=CONTOSO-CA,DC=CONTOSO,DC=LOCAL
  Not Before : 2026-01-01 00:00:00 UTC
  Not After  : 2027-01-01 00:00:00 UTC
  SHA-256    : 3a9f2c...
  Serial     : 12345
  Version    : v3
  Public Key : RSA-2048
  Identity   : Administrator@CONTOSO.LOCAL (UPN)
  SAN        : email:admin@contoso.local
  EKU        : TLS Web Client Authentication
  Key Usage  : Digital Signature
  Extensions :
    Certificate Template Name    : TraceTest
    Certificate Template Info    : Template 1.3.6.1.4.1.311.21.8... (v100.3)
    Application Policies         : 1.3.6.1.5.5.7.3.2 (Client Authentication)
    AD DS Security Extension     : 30:1C:06:0A:...
```

### The UPN Extraction Problem

Active Directory certificates encode the user's UPN (User Principal Name) as an `otherName` GeneralName inside the Subject Alternative Name extension. OpenSSL's string rendering of `subjectAltName` doesn't reliably expose the UPN across versions: you get the raw bytes, not a parsed string.

The fix was to decode the SAN extension as raw ASN.1, walk the GeneralName SEQUENCE, and check tag 0 (`otherName`). When the OID is `msUPN` (`1.3.6.1.4.1.311.20.2.3`), extract the inner UTF8String value. This mirrors the same approach already used in `Msf::Exploit::Remote::Kerberos::Client::Pkinit#extract_user_and_realm`, consistent with how the framework already handles PKINIT SAN extraction.

Identity priority is: UPN → Email SAN → Subject CN, so you always get the operationally relevant identity in one line.

### Decoding Microsoft Extension OIDs

This was the trickiest part. OpenSSL formats standard PKIX extensions (SAN, EKU, Key Usage, basicConstraints, etc.) as clean, human-readable strings. For OIDs it doesn't know (which includes almost all Microsoft AD CS enrollment OIDs), it falls back to a raw byte dump. On different OpenSSL/LibreSSL versions this produces different (equally unreadable) output.

The affected OIDs and what I did:

| OID | Extension | Solution |
|---|---|---|
| `1.3.6.1.4.1.311.20.2` | Certificate Template Name | Decode inner ASN.1 as BMPString/UTF8String; handle UTF-16BE re-encoding |
| `1.3.6.1.4.1.311.21.7` | Certificate Template Information | Decode `SEQUENCE { OID, INTEGER, INTEGER? }` to `Template <name> (v<major>.<minor>)` |
| `1.3.6.1.4.1.311.21.10` | Application Policies | Reuse `Rex::Proto::CryptoAsn1::X509::CertificatePolicies` and the framework's OID table to resolve policy OIDs to friendly labels |
| `1.3.6.1.4.1.311.25.2` | AD DS Security Extension (SID) | Hex-encode (undecodable without the full AD object binding) |

For anything else that OpenSSL can't render cleanly, the fallback is hex encoding: `hex_encode(raw_extension_bytes(ext))`. This is always unambiguous and copy-pasteable: no mojibake, no lost bytes.

The MS Application Policies OID (`311.21.10`) was the last one to land; that was today's (June 5) commit. The key was that `cert_request.rb` already uses `Rex::Proto::CryptoAsn1::X509::CertificatePolicies` and `Rex::Proto::CryptoAsn1::OIDs` for its Certificate Policies output, so I followed the same path. Trace output now matches what `icpr_cert` prints in its own Certificate Policies block, for a consistent operator experience.

### The Shared Mixin: `CertificateTrace`

The mixin (`lib/msf/core/exploit/remote/certificate_trace.rb`) does three things:

1. Registers `CertificateTrace` (`off` / `metadata` / `full`) and `CertificateTraceColors` advanced options.
2. Exposes `certificate_trace(cert)`, a single call any module makes to dispatch a trace.
3. Applies color via the same convention as `HttpTraceColors`: `"req_color/resp_color"`. Certificates are always received artifacts, so the response (second) color is used.

Any module that wants certificate tracing just includes this mixin:

```ruby
include Msf::Exploit::Remote::CertificateTrace
```

...and calls:

```ruby
certificate_trace(response[:certificate])
```

That's the full integration cost. The mixin, the presenter, and the module are all independently testable.

### Module Integrations

The shared mixin made wide integration cheap. Current integrations on the `certificate-trace` branch:

- `auxiliary/admin/dcerpc/icpr_cert`: traces issued certificates (enrollment via MS-ICPR)
- `auxiliary/admin/http/web_enrollment_cert`: traces certificates issued via HTTP enrollment
- `kerberos/client.rb` PKINIT path: traces the client certificate presented to the KDC
- `auxiliary/admin/dcerpc/cve_2022_26923_certifried`: traces certificates involved in the ESC1 exploit
- `auxiliary/admin/dcerpc/esc_update_ldap_object`: ADCS ESC update workflows
- `auxiliary/admin/ldap/bad_successor`, `rbcd`, `shadow_credentials`: LDAP-based ADCS abuse modules
- `auxiliary/gather/ldap_esc_vulnerable_cert_finder`: certificate template enumeration
- `auxiliary/gather/ldap_passwords`, `vmware_vcenter_vmdir_ldap`: LDAP gather modules with certificate flows
- Relay modules (`http_to_ldap`, `smb_to_ldap`): relay attacks involving certificate negotiation

Every one of these modules gets the `CertificateTrace` and `CertificateTraceColors` advanced options automatically on next `msfconsole` load.

---

## KerberosTicketTracePresenter: Core Done

The Kerberos presenter lives on the separate `kerberos-trace` branch. The core class (110 lines) is done and follows exactly the same pattern:

```ruby
presenter = Msf::Trace::KerberosTicketTracePresenter.new(tgt_response)
mod.print_line(presenter.to_s_metadata)  # realm, principal, enc type
mod.print_line(presenter.to_s_full)      # + timing, flags, session key, cipher text
```

One deliberate design choice: `to_s_full` prints session keys and cipher text in plain text. Metasploit does not censor key material (the framework already handles `.ccache` export unredacted), and these fields are exactly what you need during development and debugging. A `to_s_full_censored` variant exists for operators who want structured output without sensitive fields.

Remaining Kerberos work: wire the dispatcher into `kerberos/client.rb` for AS-REQ and TGS-REQ responses, add the OpenStruct adapter for AP-REQ, validate S4U2Self / S4U2Proxy in the constrained-delegation lab, and integrate into `kerberos_enumusers`.

---

## The Review Process

The PR for `CertificateTracePresenter` opened and got feedback fast. Here's what came back and how I addressed it:

**Non-ASCII em-dashes:** the initial output used `—` (U+2014) as separators in some label strings. Replaced with plain hyphens; Metasploit's terminal output targets ASCII-safe strings.

**X.509 version display:** `OpenSSL::X509::Certificate#version` returns the zero-based DER-encoded version (v3 cert → `2`). The initial output printed `2`; fixed to `v#{cert.version + 1}` so it reads `v3`.

**SAN parsing:** the initial implementation tried `ext.value` string parsing for UPN. After review, replaced with the ASN.1 decode approach (described above) for reliability across OpenSSL versions.

**Shared mixin:** the first version had the trace dispatch logic inline in each module. Feedback requested extracting it to a shared mixin so all modules get consistent options and behavior. Done: `Msf::Exploit::Remote::CertificateTrace`.

**`ms_icpr` tracing:** feedback requested wiring the trace into `ms_icpr.rb` (the shared MS-ICPR mixin) rather than just in the module-level call. Done.

**MS extension decoding:** initial version hex-encoded *all* unknown extensions. Feedback: the MS template name and template info OIDs are common enough to decode properly. Done (see above). Then the Application Policies OID came up in lab testing, decoded today.

---

## What I Shipped in Week 1

| | File | Lines |
|---|---|---|
| `CertificateTracePresenter` | `lib/msf/core/trace/certificate_trace_presenter.rb` | 343 |
| `CertificateTrace` mixin | `lib/msf/core/exploit/remote/certificate_trace.rb` | 88 |
| Presenter RSpec suite | `spec/lib/msf/core/trace/certificate_trace_presenter_spec.rb` | 403 |
| Mixin RSpec suite | `spec/lib/msf/core/exploit/remote/certificate_trace_spec.rb` | 184 |
| `KerberosTicketTracePresenter` | `lib/msf/core/trace/kerberos_ticket_trace_presenter.rb` | 110 |
| Kerberos presenter RSpec | `spec/lib/msf/core/trace/kerberos_ticket_trace_presenter_spec.rb` | 174 |
| **Total** | | **~1,300 lines** |

Plus 10+ module integrations, a PR open on `certificate-trace`, and multiple review cycles already addressed.

`CertificateTracePresenter` was originally scoped for Weeks 7–10 of the proposal. `KerberosTicketTracePresenter` (core) was scoped for Weeks 3–6. Both have core implementations in the first week of coding.

---

## What's Next

**Week 2 and beyond:**
- Wire `KerberosTicketTracePresenter` dispatcher into `kerberos/client.rb` for AS-REQ and TGS-REQ
- Add AP-REQ hook via the OpenStruct adapter
- Validate S4U2Self / S4U2Proxy in the constrained-delegation lab
- Integrate into `kerberos_enumusers` (first Kerberos module integration)
- Address any further upstream review on `certificate-trace`

The freed-up buffer from shipping Phase 3 work in Week 1 goes toward deeper lab validation: specifically ADCS ESC scenario testing across all 10+ integrated modules, and the S4U2 constrained-delegation flows that need a specific lab config.

---

## Links

- [My Metasploit Fork](https://github.com/Pushpenderrathore/metasploit-framework): `certificate-trace` and `kerberos-trace` branches
- [GSoC Progress Page](https://pushpenderrathore.github.io/gsoc.html): live build log
- [Pull Requests](https://pushpenderrathore.github.io/prs.html): all upstream contributions

---

*Week 2 update coming next Sunday.*
