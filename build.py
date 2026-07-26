"""Flatten the landing page into a deployable static site.

Authoring keeps the page split into small files so an edit only ever touches
one of them:

    landing/index.html          the shell (head, include list, script tag)
    landing/sections/*.html     one file per page section
    landing/css/*.css           one stylesheet per section

Neither split needs a build step to PREVIEW — serve.py resolves the includes
on the fly and the browser loads the stylesheets separately. This script exists
only to produce a single-file-per-asset copy for deploy:

    python build.py [outdir]        (default: dist/)

It writes dist/ as a drop-in copy of the site with identical URL structure, so
every relative path in the source keeps working unchanged:

    dist/landing/index.html         includes resolved, one <link> instead of 11
    dist/landing/css/landing.css    the section stylesheets, concatenated
    dist/landing/rail.js
    dist/design-system/tokens.css
    dist/assets/**                  .webp/.jpg/.svg only (the *_transparent.png
                                    originals are working files, not shipped)

INCLUDE SYNTAX (SSI-style, also understood by nginx/Apache if you ever want it
resolved at serve time instead):

    <!--#include file="sections/hero.html" -->

The path is relative to the directory of the file doing the including.
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

INCLUDE_RE = re.compile(r'<!--#include\s+file="([^"]+)"\s*-->')
CSS_BLOCK_RE = re.compile(
    r"[ \t]*<!--#css-bundle-start-->.*?<!--#css-bundle-end-->",
    re.DOTALL,
)
CSS_LINK_RE = re.compile(r'<link[^>]*href="([^"]+\.css)"[^>]*>')

MAX_INCLUDE_DEPTH = 10


class IncludeError(Exception):
    pass


def render_includes(path, _stack=()):
    """Read `path` and splice in every <!--#include file="..."--> recursively.

    Include paths resolve relative to the including file's own directory, so a
    partial can include another partial without knowing where it is used.
    """
    path = Path(path).resolve()
    if path in _stack:
        chain = " -> ".join(p.name for p in (*_stack, path))
        raise IncludeError(f"circular include: {chain}")
    if len(_stack) >= MAX_INCLUDE_DEPTH:
        raise IncludeError(f"include nesting deeper than {MAX_INCLUDE_DEPTH}: {path}")

    text = path.read_text(encoding="utf-8")

    def swap(match):
        target = (path.parent / match.group(1)).resolve()
        if not target.is_file():
            raise IncludeError(f"{path.name}: include target not found: {match.group(1)}")
        return render_includes(target, (*_stack, path)).rstrip("\n")

    return INCLUDE_RE.sub(swap, text)


def bundle_css(shell_html, shell_path):
    """Replace the marked <link> block with one link; return (html, css_text).

    Returns (shell_html, None) when the shell has no bundle markers.
    """
    match = CSS_BLOCK_RE.search(shell_html)
    if not match:
        return shell_html, None

    hrefs = CSS_LINK_RE.findall(match.group(0))
    if not hrefs:
        raise IncludeError("css bundle markers found but no <link> inside them")

    chunks = []
    for href in hrefs:
        css_path = (shell_path.parent / href).resolve()
        if not css_path.is_file():
            raise IncludeError(f"stylesheet not found: {href}")
        chunks.append(f"/* ==== {href} ==== */\n{css_path.read_text(encoding='utf-8')}")

    # The bundle is written next to the sources (dist/landing/css/), so every
    # url(../../assets/...) inside a section stylesheet still resolves.
    out_dir = Path(hrefs[0]).parent.as_posix().lstrip("./") or "."
    bundled_href = f"./{out_dir}/landing.css"
    replacement = f'<link rel="stylesheet" href="{bundled_href}" />'
    return CSS_BLOCK_RE.sub(replacement, shell_html), ("\n".join(chunks), out_dir)


def build(outdir):
    outdir = Path(outdir)
    if outdir.exists():
        shutil.rmtree(outdir)

    shell = ROOT / "landing" / "index.html"
    html = render_includes(shell)
    html, css = bundle_css(html, shell)

    (outdir / "landing").mkdir(parents=True)
    (outdir / "landing" / "index.html").write_text(html, encoding="utf-8")

    written = ["landing/index.html"]

    if css:
        css_text, css_dir = css
        target = outdir / "landing" / css_dir
        target.mkdir(parents=True, exist_ok=True)
        (target / "landing.css").write_text(css_text, encoding="utf-8")
        written.append(f"landing/{css_dir}/landing.css")

    for extra in ("rail.js",):
        src = ROOT / "landing" / extra
        if src.is_file():
            shutil.copy2(src, outdir / "landing" / extra)
            written.append(f"landing/{extra}")

    (outdir / "design-system").mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "design-system" / "tokens.css",
                 outdir / "design-system" / "tokens.css")
    written.append("design-system/tokens.css")

    # The typefaces. The licence files travel with them — SIL OFL requires the
    # copyright notice to ship alongside the font.
    fonts_src = ROOT / "design-system" / "fonts"
    if fonts_src.is_dir():
        fonts_out = outdir / "design-system" / "fonts"
        fonts_out.mkdir(parents=True, exist_ok=True)
        for font in sorted(fonts_src.iterdir()):
            if font.is_file() and font.suffix.lower() in {".woff2", ".ttf", ".otf", ".txt"}:
                shutil.copy2(font, fonts_out / font.name)
                written.append(f"design-system/fonts/{font.name}")

    # Ship the optimised assets only; the *_transparent.png originals stay
    # behind as working files.
    assets_out = outdir / "assets"
    assets_out.mkdir(parents=True, exist_ok=True)
    shipped = 0
    for asset in sorted((ROOT / "assets").iterdir()):
        if asset.is_file() and asset.suffix.lower() in {".webp", ".jpg", ".jpeg", ".svg"}:
            shutil.copy2(asset, assets_out / asset.name)
            shipped += 1

    for line in written:
        print(f"  {line}")
    print(f"  assets/  ({shipped} files)")
    print(f"\nbuilt -> {outdir}/")


if __name__ == "__main__":
    try:
        build(sys.argv[1] if len(sys.argv) > 1 else ROOT / "dist")
    except IncludeError as exc:
        sys.exit(f"build failed: {exc}")
