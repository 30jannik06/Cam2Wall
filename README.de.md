# Cam2Wall

**📖 [Dokumentation](https://30jannik06.github.io/Cam2Wall/)** · [English README](README.md)

Schlanke Vollbild-Kamerawand für den Browser. RTSP-Kameras (oder jeder Rekorder/VMS mit RTSP) werden
von [go2rtc](https://github.com/AlexxIT/go2rtc) in latenzarmes WebRTC umgewandelt. go2rtc liefert auch
das Dashboard aus – **ein Prozess, kein Node, kein Python, kein Build**. Klein genug für einen
Raspberry Pi Zero.

## Basiert auf go2rtc

Die eigentliche Arbeit (RTSP abholen, in WebRTC umwandeln) macht
**[go2rtc](https://github.com/AlexxIT/go2rtc)** von [AlexxIT](https://github.com/AlexxIT) – ein
hervorragendes, winziges und schnelles Projekt. Wenn Ihnen Cam2Wall gefällt, geben Sie go2rtc gern
einen Stern. Cam2Wall ist nur die schlanke Oberfläche samt Startskripten.

Sie müssen nichts von Hand installieren: Beim ersten Start laden `start.bat` / `start.sh` die passende
go2rtc-Version (festgelegt in [`go2rtc.version`](go2rtc.version); Windows, Linux x86/ARM, Raspberry Pi Zero)
von den offiziellen [GitHub-Releases](https://github.com/AlexxIT/go2rtc/releases) nach `bin/`.
Im Repository liegt keine Programmdatei.

## Schnellstart

```bash
git clone https://github.com/30jannik06/Cam2Wall.git && cd Cam2Wall
```

**Windows:** `start.bat` doppelklicken · **Linux / Raspberry Pi:** `sh start.sh`

Beim ersten Start lädt das Skript go2rtc herunter, legt `config/go2rtc.yaml` aus der Vorlage an und
erzeugt (falls openssl vorhanden ist) ein selbstsigniertes Zertifikat. Kamera-URLs in
`config/go2rtc.yaml` eintragen, nochmal starten und öffnen:

- Am PC: `http://localhost:1984`
- Handy/Tablet im selben WLAN: `http://<PC-IP>:1984` oder `https://<PC-IP>:1985` (Zertifikatswarnung einmal akzeptieren)

Firewall: TCP 1984, 1985, 8555 und UDP 8555 freigeben.

## Kameras konfigurieren

Das Dashboard zeigt alle Streams außer denen mit der Endung `_hd`. Im Raster läuft der kleine
Substream, in der Einzelansicht (Klick) automatisch der große Hauptstream, falls vorhanden:

```yaml
streams:
  cam1:    "rtsp://USER:PASS@SERVER_IP:554/video?device=vdrs&channel=0&stream=1"
  cam1_hd: "rtsp://USER:PASS@SERVER_IP:554/video?device=vdrs&channel=0&stream=0"
```

## Bedienung

Klick = Einzelansicht · Mausrad/Pinch = Zoom · Ziehen = Verschieben · Doppelklick = Zoom zurücksetzen ·
`N` = Namen anzeigen · `F` = Vollbild · `Esc` = zurück

## Docker / Pi-Autostart

Siehe [README.md](README.md) (`docker-compose.yml`, `deploy/cam2wall.service`).

## Sicherheit

Die go2rtc-API hat standardmäßig **keine Anmeldung** und gibt die Stream-URLs **samt Passwort** heraus.
Nur im vertrauenswürdigen Netz betreiben oder `api.username` / `api.password` setzen. Nicht ins
Internet freigeben – für Fernzugriff ein VPN nutzen. Zugangsdaten gehören nur in `config/go2rtc.yaml`
(ist git-ignoriert).
