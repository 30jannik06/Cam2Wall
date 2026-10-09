#!/usr/bin/env python3
"""Browser-less camera wall for weak Raspberry Pis (Pi Zero / Zero W / Pi 1, which cannot run a browser).

Pulls every stream from go2rtc over RTSP, decodes H.264 on the GPU (v4l2h264dec) and shows them as a grid
directly on the HDMI output through GStreamer (kmssink). Needs a console without a desktop
(sudo systemctl set-default multi-user.target) and no keyboard.

    python3 scripts/native_wall.py                    # all streams of the local go2rtc
    python3 scripts/native_wall.py --size 960x540 --fps 8 --max 4
    python3 scripts/native_wall.py --print            # only show the GStreamer pipeline

Packages:  sudo apt install -y gstreamer1.0-tools gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
                               gstreamer1.0-plugins-bad gstreamer1.0-libav python3
"""
import argparse
import json
import math
import shlex
import signal
import subprocess
import sys
import time
import urllib.request


def get_streams(api):
    with urllib.request.urlopen(api.rstrip("/") + "/api/streams", timeout=5) as r:
        data = json.load(r)
    # same rule as the web dashboard: hide "_..." (internal) and "..._hd" (main streams)
    return [n for n in data if not n.startswith("_") and not n.endswith("_hd")]


def has_element(name):
    try:
        return subprocess.call(["gst-inspect-1.0", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0
    except FileNotFoundError:
        return None   # GStreamer is not installed at all


def build_pipeline(names, rtsp, out_w, out_h, cols, fps, decoder, sink):
    n = len(names)
    cols = cols or math.ceil(math.sqrt(n * out_w / out_h))
    cols = max(1, min(cols, n))
    rows = math.ceil(n / cols)
    tw, th = out_w // cols, out_h // rows

    pads = " ".join(
        f"sink_{i}::xpos={(i % cols) * tw} sink_{i}::ypos={(i // cols) * th} sink_{i}::width={tw} sink_{i}::height={th}"
        for i in range(n)
    )
    parts = [f"compositor name=comp background=black {pads} ! video/x-raw,width={out_w},height={out_h} ! videoconvert ! {sink}"]
    for name in names:
        url = f"{rtsp.rstrip('/')}/{name}"
        parts.append(
            f"rtspsrc location={url} protocols=tcp latency=200 ! rtph264depay ! h264parse ! {decoder} "
            f"! videorate drop-only=true ! video/x-raw,framerate={fps}/1 "
            f"! queue max-size-buffers=2 leaky=downstream ! comp."
        )
    return " ".join(parts)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default="http://127.0.0.1:1984", help="go2rtc API (default %(default)s)")
    ap.add_argument("--rtsp", default="rtsp://127.0.0.1:8554", help="go2rtc RTSP server (default %(default)s)")
    ap.add_argument("--size", default="1280x720", help="size of the composed picture (default %(default)s)")
    ap.add_argument("--fps", type=int, default=10, help="frames per second per tile (default %(default)s)")
    ap.add_argument("--cols", type=int, default=0, help="grid columns (default: automatic)")
    ap.add_argument("--max", type=int, default=0, help="show at most N cameras (default: all)")
    ap.add_argument("--streams", default="", help="comma separated stream names instead of all")
    ap.add_argument("--sink", default="kmssink", help="GStreamer video sink (default %(default)s)")
    ap.add_argument("--print", action="store_true", help="print the pipeline and exit")
    args = ap.parse_args()

    out_w, out_h = (int(v) for v in args.size.lower().split("x"))
    found = has_element("v4l2h264dec")
    if found is None and not args.print:
        sys.exit("GStreamer is not installed. Run:
  sudo apt install -y gstreamer1.0-tools gstreamer1.0-plugins-base "
                 "gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-libav")
    decoder = "v4l2h264dec" if found or found is None else "avdec_h264"
    if decoder != "v4l2h264dec":
        print("WARNING: v4l2h264dec (hardware decoder) not found - falling back to the software decoder (slow).", file=sys.stderr)

    child = None

    def stop(*_):
        if child and child.poll() is None:
            child.terminate()
        sys.exit(0)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    while True:
        try:
            names = [s for s in args.streams.split(",") if s] or get_streams(args.api)
        except Exception as e:  # go2rtc not up yet
            print(f"waiting for go2rtc ({e}) ...", file=sys.stderr)
            time.sleep(3)
            continue
        if args.max:
            names = names[: args.max]
        if not names:
            print("no streams configured in go2rtc yet", file=sys.stderr)
            time.sleep(5)
            continue

        pipeline = build_pipeline(names, args.rtsp, out_w, out_h, args.cols, args.fps, decoder, args.sink)
        if args.print:
            print("gst-launch-1.0 -e " + pipeline)
            return
        print(f"showing {len(names)} stream(s): {', '.join(names)}", flush=True)
        child = subprocess.Popen(["gst-launch-1.0", "-e", *shlex.split(pipeline)])
        code = child.wait()
        print(f"gst-launch exited with {code}, restarting in 5 s", file=sys.stderr, flush=True)
        time.sleep(5)


if __name__ == "__main__":
    main()
