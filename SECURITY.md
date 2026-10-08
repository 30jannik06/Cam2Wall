# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately via
[GitHub Security Advisories](https://github.com/30jannik06/Cam2Wall/security/advisories/new).
You will get a reply as soon as possible.

## Things to know when running Cam2Wall

Cam2Wall is a front-end for [go2rtc](https://github.com/AlexxIT/go2rtc), and go2rtc's API has **no
login by default** — anyone who can reach port 1984/1985 can read the configured stream URLs,
including camera passwords (`/api/streams`).

- Run it only on a trusted network, or set `api.username` / `api.password` in `config/go2rtc.yaml`.
- Do not expose the ports to the internet. For remote access use a VPN (WireGuard, Tailscale).
- The generated HTTPS certificate is self-signed (browsers warn once). It protects traffic on the LAN
  but does not prove the server's identity.
- Never commit `config/go2rtc.yaml`, `certs/` or `.env` files (they are git-ignored).
