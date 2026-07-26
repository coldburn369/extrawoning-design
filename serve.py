"""Static file server for local preview.

`python -m http.server` (and even a naive ThreadingHTTPServer) resets
connections when the browser opens a burst of parallel requests, which shows
up as random images failing to decode with net::ERR_CONNECTION_RESET.

Two causes, both handled here:
  * the default listen backlog is 5, so a burst of ~16 image requests
    overflows the accept queue and the OS answers with RST
    -> request_queue_size is raised.
  * HTTP/1.0 closes the connection after every response, so each asset needs
    a fresh connection
    -> HTTP/1.1 keep-alive is enabled (SimpleHTTPRequestHandler always sends
       Content-Length for files, so this is safe).

Also resolves SSI-style includes so the landing page can stay split into
per-section partials with no build step during development:

    <!--#include file="sections/hero.html" -->

The same resolver is used by build.py, which flattens everything for deploy.

    python serve.py [port]
"""
import io
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from build import IncludeError, render_includes


class Handler(SimpleHTTPRequestHandler):
    # Keep-alive: dramatically fewer connections for an image-heavy page.
    protocol_version = "HTTP/1.1"
    # Don't let idle keep-alive threads pile up.
    timeout = 15

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".webp": "image/webp",
        ".avif": "image/avif",
        ".svg": "image/svg+xml",
        ".mjs": "text/javascript",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
    }

    def end_headers(self):
        # Never cache during development.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        # Serve .html through the include resolver so partials work without a
        # build step. Everything else (images, css, js, directory listings)
        # falls through to the stock implementation untouched.
        path = self.translate_path(self.path)
        if not (path.endswith(".html") and os.path.isfile(path)):
            return super().send_head()

        try:
            body = render_includes(path).encode("utf-8")
        except IncludeError as exc:
            # Surface the broken include in the page instead of a blank 404 —
            # far easier to spot than a silently missing section.
            self.send_error(500, "Include error", str(exc))
            return None
        except OSError:
            return super().send_head()

        self.send_response(200)
        self.send_header("Content-type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        return io.BytesIO(body)

    def copyfile(self, source, outputfile):
        # The browser cancels in-flight requests all the time (lazy images
        # scrolled past, navigation). Don't dump a traceback for it.
        try:
            super().copyfile(source, outputfile)
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            self.close_connection = True

    def log_message(self, fmt, *args):  # quiet
        pass


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    # The real fix: default is 5, which a burst of parallel asset requests
    # overflows -> connection reset.
    request_queue_size = 128


if __name__ == "__main__":
    # Port precedence: argv > $PORT > 8124. $PORT is how the Browser pane hands
    # this server a free port when 8124 is already taken by another session.
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    else:
        port = int(os.environ.get("PORT") or 8124)
    httpd = Server(("127.0.0.1", port), partial(Handler, directory="."))
    print(f"serving http://127.0.0.1:{port}/  (ctrl-c to stop)")
    httpd.serve_forever()
