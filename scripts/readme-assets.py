#!/usr/bin/env python3
"""Generate the README illustrations of @vaubaan/harness as GitHub-safe SVGs.

One source, three variants per image: -light.svg, -dark.svg (frozen colors, for <picture>)
and .svg (auto: light colors plus a prefers-color-scheme media query, the <img> fallback).
Rules followed: viewBox 1200 wide, system font stacks, no scripts, no external resources,
no filters, role="img" + <title>/<desc>, text split line by line, 48+ units from the edges.

Regenerate with: python3 scripts/readme-assets.py   (writes to .github/readme/)
"""
import os, html, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else ".github/readme"
os.makedirs(OUT, exist_ok=True)

SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

LIGHT = dict(bg="#FBFBF9", surface="#FFFFFF", ink="#1B2128", muted="#66707C", line="#D6DBE1",
             accent="#0F6E7A", accentSoft="#DDEFEE", accentInk="#0B4F58",
             meta="#EEF6F5", code="#F1F2F4", human="#E9B949", humanSoft="#FBF1D6",
             agent="#8A6FD8", agentSoft="#EDE8FA", ok="#2E8B57", warn="#B7791F", term="#15191D", termInk="#E6EAEE", termMuted="#8B96A1")
DARK = dict(bg="#0E1215", surface="#161B20", ink="#E8ECEF", muted="#98A3AE", line="#2A333B",
            accent="#6FCBD3", accentSoft="#143A3F", accentInk="#BFE8EB",
            meta="#12272A", code="#1B2127", human="#E6BE5C", humanSoft="#3A3014",
            agent="#A990F0", agentSoft="#27203F", ok="#5CC48A", warn="#E0B35A", term="#0B0E11", termInk="#E6EAEE", termMuted="#8B96A1")

def css(t):
    return (f".bg{{fill:{t['bg']}}} .surface{{fill:{t['surface']}}} .ink{{fill:{t['ink']}}} .muted{{fill:{t['muted']}}}"
            f" .line{{stroke:{t['line']}}} .lineF{{fill:{t['line']}}} .accent{{fill:{t['accent']}}} .accentS{{stroke:{t['accent']}}}"
            f" .accentSoft{{fill:{t['accentSoft']}}} .accentInk{{fill:{t['accentInk']}}} .meta{{fill:{t['meta']}}} .code{{fill:{t['code']}}}"
            f" .human{{fill:{t['human']}}} .humanSoft{{fill:{t['humanSoft']}}} .agent{{fill:{t['agent']}}} .agentSoft{{fill:{t['agentSoft']}}}"
            f" .ok{{fill:{t['ok']}}} .warn{{fill:{t['warn']}}} .inkS{{stroke:{t['ink']}}} .mutedS{{stroke:{t['muted']}}}"
            f" .term{{fill:{t['term']}}} .termInk{{fill:{t['termInk']}}} .termMuted{{fill:{t['termMuted']}}}")

BASE_CSS = (f"text{{font-family:{SANS}}} .mono{{font-family:{MONO}}} .b{{font-weight:600}} .sb{{font-weight:500}}"
            " .thin{stroke-width:1.5} .mid{stroke-width:2} .dash{stroke-dasharray:6 6} .nofill{fill:none}")

def style_for(variant):
    if variant == "light": return BASE_CSS + css(LIGHT)
    if variant == "dark": return BASE_CSS + css(DARK)
    return BASE_CSS + css(LIGHT) + " @media (prefers-color-scheme: dark){" + css(DARK) + "}"

def esc(s): return html.escape(s, quote=False)

# ---------- primitives ----------
def text(x, y, s, size=18, cls="ink", anchor="start", extra=""):
    return f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" class="{cls}" xml:space="preserve" {extra}>{esc(s)}</text>'

def lines(x, y, items, size=18, lh=None, cls="ink", anchor="start", extra=""):
    lh = lh or round(size * 1.4)
    return "".join(text(x, y + i * lh, s, size, cls, anchor, extra) for i, s in enumerate(items))

def rect(x, y, w, h, cls="surface", r=14, stroke="line", sw="thin", extra=""):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" class="{cls} {stroke} {sw}" {extra}/>'

def pill(x, y, label, size=15, cls="accentSoft", tcls="accentInk", mono=False, pad=14, h=30):
    w = int(len(label) * size * (0.62 if mono else 0.56)) + pad * 2
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}" class="{cls}"/>'
            + text(x + w / 2, y + h / 2 + size * 0.36, label, size, f"{tcls}{' mono' if mono else ''} sb", "middle")), w

def arrow(x1, y1, x2, y2, cls="mutedS", dashed=False, marker="m-muted"):
    d = " dash" if dashed else ""
    return f'<path d="M{x1} {y1} L{x2} {y2}" class="nofill {cls} mid{d}" marker-end="url(#{marker})"/>'

def path(d, cls="mutedS", dashed=False, marker="m-muted", sw="mid"):
    dd = " dash" if dashed else ""
    m = f' marker-end="url(#{marker})"' if marker else ""
    return f'<path d="{d}" class="nofill {cls} {sw}{dd}"{m}/>'

def markers():
    return ('<defs>'
            '<marker id="m-muted" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="muted"/></marker>'
            '<marker id="m-accent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="accent"/></marker>'
            '<marker id="m-ink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="ink"/></marker>'
            '</defs>')

def svg(name, w, h, body, title, desc, variant, bg=True):
    back = rect(0, 0, w, h, "bg", 24, "line", "thin") if bg else ""
    doc = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-labelledby="t d">'
           f'<title id="t">{esc(title)}</title><desc id="d">{esc(desc)}</desc>'
           f'<style>{style_for(variant)}</style>{markers()}{back}{body}</svg>')
    suffix = {"light": "-light", "dark": "-dark", "auto": ""}[variant]
    with open(os.path.join(OUT, f"{name}{suffix}.svg"), "w") as f: f.write(doc)

def emit(name, w, h, body, title, desc, bg=True):
    for v in ("light", "dark", "auto"): svg(name, w, h, body, title, desc, v, bg)

# ---------- shared pieces ----------
def doc_card(x, y, w, h, title, rows, kind="meta", row_size=15):
    """A small file list card: header + mono rows. kind meta|code."""
    s = rect(x, y, w, h, "surface", 16)
    s += f'<rect x="{x}" y="{y}" width="{w}" height="40" rx="16" class="{kind}"/><rect x="{x}" y="{y+24}" width="{w}" height="16" class="{kind}"/>'
    s += text(x + 18, y + 26, title, 15, "ink b")
    yy = y + 66
    for r in rows:
        s += text(x + 18, yy, r, row_size, "ink mono"); yy += row_size + 11
    return s

def persona(x, y, label, sub, cls):
    s = f'<circle cx="{x}" cy="{y}" r="22" class="{cls}"/>'
    s += f'<circle cx="{x}" cy="{y-6}" r="7" class="surface"/><path d="M{x-12} {y+14} a12 10 0 0 1 24 0z" class="surface"/>'
    s += text(x + 36, y - 2, label, 20, "ink b") + text(x + 36, y + 20, sub, 15, "muted")
    return s

# ---------- 1. hero ----------
def hero():
    W, H = 1200, 380
    b = ""
    # left: words
    p, pw = pill(64, 60, "npx -y @vaubaan/harness init . --engines=claude-code", 14, "accentSoft", "accentInk", mono=True, h=32)
    b += p
    b += text(64, 160, "Project context", 60, "ink b") + text(64, 226, "as code.", 60, "accent b")
    b += lines(64, 272, ["A context database for your project, kept in the repo,",
                         "rendered for your coding agents, linted in CI."], 20, 30, "muted")
    # right: motif, meta db -> code db with foreign keys and a lint check
    mx, my = 700, 56
    b += doc_card(mx, my, 190, 230, "docs/   meta database",
                  ["spec/", "decisions/", "handbook/", "tests/", "workflow/", "intents/"], "meta")
    cx = 980
    b += doc_card(cx, my, 156, 230, "code database",
                  ["src/", "tests/", "ci.yml", "tsconfig.json", "package.json", "…"], "code")
    # foreign keys: lines from meta rows to code rows
    pairs = [(0, 0), (1, 2), (2, 0), (3, 1), (4, 2), (5, 0)]
    for i, j in pairs:
        y1 = my + 66 + i * 26 - 5; y2 = my + 66 + j * 26 - 5
        b += path(f"M{mx+190} {y1} C {mx+240} {y1}, {cx-50} {y2}, {cx} {y2}", "accentS", False, "m-accent", "thin")
    # lint check badge
    b += rect(mx, my + 250, 436, 52, "surface", 26)
    b += f'<circle cx="{mx+28}" cy="{my+276}" r="12" class="ok"/>'
    b += f'<path d="M{mx+22} {my+276} l4 4 l8 -9" class="nofill mid" stroke="#FFFFFF" stroke-width="2.5" fill="none"/>'
    b += text(mx + 52, my + 281, "harness lint · 0 errors, 0 warnings · CI passes", 14, "ink mono")
    emit("hero", W, H, b, "@vaubaan/harness: project context as code",
         "A meta database of Markdown files under docs/ points to the code database; the harness renders it for coding agents and lints it in CI.")

# ---------- 2. two databases ----------
def two_databases():
    W, H = 1200, 540
    b = ""
    # personas
    b += persona(96, 150, "You", "decide · validate · merge", "human")
    b += persona(96, 330, "Your coding agents", "write docs and code, with judgment", "agent")
    # repo
    rx, ry, rw, rh = 420, 64, 716, 330
    b += rect(rx, ry, rw, rh, "surface", 22)
    b += text(rx + 24, ry + 34, "one repository", 16, "muted mono")
    # code db
    b += doc_card(rx + 24, ry + 56, 270, 240, "code database", ["src/", "tests/", "configs", "ci.yml"], "code", 16)
    b += text(rx + 24 + 135, ry + 56 + 222, "what the machine runs", 14, "muted", "middle")
    # meta db
    b += doc_card(rx + 422, ry + 56, 270, 240, "meta database   docs/", ["spec/   decisions/   handbook/", "tests/   workflow/   intents/", "", "AGENTS.md  .claude/  .agents/", "(rendered views, committed)"], "meta", 15)
    b += text(rx + 422 + 135, ry + 56 + 222, "what the code cannot say", 14, "muted", "middle")
    # meta -> code arrow
    ay = ry + 170
    b += arrow(rx + 422, ay, rx + 294 + 2, ay, "accentS", False, "m-accent")
    b += text(rx + 358, ay - 14, "tracks · anchors", 12, "accentInk sb", "middle")
    b += text(rx + 358, ay + 24, "realized by", 12, "accentInk sb", "middle")
    # personas <-> repo
    for py in (150, 330):
        b += path(f"M330 {py} L{rx-2} {py}", "mutedS", False, "m-muted")
        b += path(f"M{rx} {py} L332 {py}", "mutedS", False, "m-muted")
    # harness bar
    hx, hy, hw, hh = 420, 440, 716, 56
    b += rect(hx, hy, hw, hh, "accentSoft", 28, "accentS", "thin")
    b += text(hx + 28, hy + 35, "harness", 20, "accentInk b")
    b += text(hx + 130, hy + 35, "schema: the pillars  ·  constraints: 19 linters  ·  views: update .", 14, "accentInk mono")
    # harness -> meta dashed
    b += path(f"M{rx+422+135} {hy} L{rx+422+135} {ry+56+240+4}", "accentS", True, "m-accent")
    b += text(rx + 422 + 135 - 14, hy - 20, "keeps the meta database consistent", 13, "muted", "end")
    b += text(rx + 422 + 135 - 14, hy - 4, "with itself and with the code", 13, "muted", "end")
    emit("two-databases", W, H, b, "Two personas, one codebase, two databases",
         "You and your coding agents share one repository that holds a code database and a meta database; the harness is the schema, constraints and views of the meta database.")

# ---------- 3. how it works ----------
def how_it_works():
    W, H = 1200, 300
    b = ""
    boxes = [("docs/", ["your context,", "in Markdown"], "meta"),
             ("rendered views", ["AGENTS.md · .claude/", ".agents/ · .opencode/"], "accentSoft"),
             ("your coding agents", ["Claude Code · Codex · OpenCode", "same context, write the code"], "agentSoft"),
             ("vaubaan-harness lint", ["pre-commit and CI", "zero tokens"], "surface")]
    labels = ["init · update", "read", "code and docs"]
    x0, w, gap, y, h = 64, 232, 48, 76, 120
    xs = []
    for i, (t, sub, cls) in enumerate(boxes):
        x = x0 + i * (w + gap); xs.append(x)
        b += rect(x, y, w, h, cls, 18)
        b += text(x + w / 2, y + 40, t, 19, "ink b", "middle")
        b += lines(x + w / 2, y + 70, sub, 14, 20, "muted", "middle")
        if i < 3:
            b += arrow(x + w + 2, y + h / 2, x + w + gap - 2, y + h / 2)
            b += text(x + w + gap / 2, y - 12, labels[i], 12, "muted sb", "middle")
    # return path
    lx = xs[3] + w / 2; dx = xs[0] + w / 2; by = y + h + 48
    b += path(f"M{lx} {y+h+2} L{lx} {by} L{dx} {by} L{dx} {y+h+4}", "accentS", True, "m-accent")
    b += text((lx + dx) / 2, by + 24, "fails when the context and the code disagree: the agent sees a failed command and fixes it", 14, "accentInk sb", "middle")
    emit("how-it-works", W, H, b, "How the harness works",
         "docs/ is rendered into AGENTS.md and the engine folders; agents read it and write code and docs; the linter runs in pre-commit and CI and fails when context and code disagree.")

# ---------- 4. intent tree ----------
def intent_tree():
    W, H = 1200, 470
    b = ""
    # tree
    x0 = 64
    b += text(x0, 72, "docs/intents/send-an-invoice.md", 15, "muted mono")
    # level 1
    b += rect(x0, 92, 330, 54, "accentSoft", 14, "accentS")
    b += text(x0 + 18, 118, "Send an invoice", 20, "accentInk b")
    b += text(x0 + 18, 138, "level-1 intent · actors: accountant", 13, "accentInk")
    # level 2
    l2 = [("Issue the invoice", 180), ("Void an issued invoice", 340)]
    for t, y in l2:
        b += path(f"M{x0+28} 146 L{x0+28} {y+22} L{x0+38} {y+22}", "mutedS", False, None, "thin")
        b += rect(x0 + 40, y, 236, 44, "surface", 12)
        b += text(x0 + 56, y + 28, t, 17, "ink b")
    # terminal intents
    tx, tw = x0 + 300, 380
    t3 = [("Freeze the draft", 180, 180, "implemented", "anchors: src/invoicing/issue.ts · issue.test.ts"),
          ("Email the invoice", 250, 180, "proposed", "acceptance: the customer receives a PDF in a minute"),
          ("Void, never delete", 340, 340, "implemented", "anchors: src/invoicing/void.ts")]
    for t, y, py, st, field in t3:
        b += path(f"M{x0+276} {py+22} L{x0+288} {py+22} L{x0+288} {y+29} L{tx-2} {y+29}", "mutedS", False, None, "thin")
        dashed = "dash" if st == "proposed" else ""
        b += f'<rect x="{tx}" y="{y}" width="{tw}" height="58" rx="12" class="surface line thin {dashed}"/>'
        b += text(tx + 18, y + 24, t, 17, "ink b")
        pl, pw = pill(tx + 18 + len(t) * 9.5 + 14, y + 8, st, 12, "accentSoft" if st == "implemented" else "humanSoft", "accentInk" if st == "implemented" else "ink", h=22, pad=10)
        b += pl
        b += text(tx + 18, y + 46, field, 11, "muted mono")
    # OKR column
    ox = 764
    b += rect(ox, 92, 372, 296, "surface", 18)
    b += text(ox + 24, 126, "Read it as an OKR tree", 19, "ink b")
    rows = [("Objective", "an intent: verb + object, for an actor, at every level"),
            ("Key results", "the acceptance: lines of a proposed terminal intent"),
            ("Initiatives", "the anchors: the code and tests that realize it"),
            ("Progress", "share of implemented terminal intents, read from git")]
    yy = 164
    for k, v in rows:
        b += text(ox + 24, yy, k, 15, "accentInk b")
        b += text(ox + 24, yy + 20, v, 12.5, "muted")
        yy += 52
    # progress bar
    b += text(ox + 24, 378, "Send an invoice", 13, "muted")
    b += f'<rect x="{ox+140}" y="{366}" width="160" height="14" rx="7" class="lineF"/><rect x="{ox+140}" y="{366}" width="107" height="14" rx="7" class="accent"/>'
    b += text(ox + 348, 378, "2 / 3", 13, "ink mono", "end")
    b += lines(64, 426, ["A proposed intent is decided and not delivered: the backlog. The pull request that delivers it adds anchors and removes acceptance;", "tests titled after the criteria carry them from then on."], 14, 20, "muted")
    emit("intent-tree", W, H, b, "The intents pillar, read as an OKR tree",
         "An intent file is a tree: level-1 intent, sub-intents, terminal intents carrying anchors or acceptance criteria; it reads like an OKR tree whose progress is computed from the repo.")

# ---------- 5. agent decision tree ----------
def decision_tree():
    W, H = 1200, 760
    b = ""
    def box(x, y, w, h, title, sub=None, cls="surface", tcls="ink"):
        s = rect(x, y, w, h, cls, 14)
        if sub:
            s += text(x + w / 2, y + h / 2 - 4, title, 16, f"{tcls} b", "middle") + text(x + w / 2, y + h / 2 + 18, sub, 13, "muted", "middle")
        else:
            s += text(x + w / 2, y + h / 2 + 6, title, 16, f"{tcls} b", "middle")
        return s
    def diamond(cx, cy, w, h, l1, l2=None):
        s = f'<path d="M{cx} {cy-h/2} L{cx+w/2} {cy} L{cx} {cy+h/2} L{cx-w/2} {cy}z" class="accentSoft accentS thin"/>'
        if l2:
            s += text(cx, cy - 2, l1, 14, "accentInk b", "middle") + text(cx, cy + 16, l2, 14, "accentInk b", "middle")
        else:
            s += text(cx, cy + 5, l1, 14, "accentInk b", "middle")
        return s
    def lbl(x, y, s, anchor="middle"): return text(x, y, s, 12, "muted sb", anchor)
    # spine x
    sx = 420
    b += box(sx - 130, 40, 260, 48, "The user asks for something", None, "humanSoft")
    b += arrow(sx, 90, sx, 118)
    b += diamond(sx, 160, 300, 84, "A question,", "not a request for change?")
    # yes -> answer (left)
    b += arrow(sx - 150, 160, 262, 160); b += lbl(sx - 175, 150, "yes")
    b += box(60, 128, 200, 64, "Answer from the docs", "report the gap, invent nothing")
    b += arrow(sx, 202, sx, 232); b += lbl(sx + 14, 222, "no", "start")
    b += diamond(sx, 274, 320, 84, "Does the behavior visible", "to the user change?")
    # no -> Q4 (right)
    q4x = 900
    b += path(f"M{sx+160} 274 L{q4x} 274 L{q4x} 396", "mutedS", False, "m-muted"); b += lbl(sx + 190, 264, "no", "start")
    b += arrow(sx, 316, sx, 346); b += lbl(sx + 14, 336, "yes", "start")
    b += diamond(sx, 388, 320, 84, "Does a proposed intent", "already exist?")
    b += path(f"M{sx+160} 388 L{q4x-30} 388", "mutedS", False, None); b += lbl(sx + 190, 378, "yes", "start")
    b += arrow(sx, 430, sx, 460); b += lbl(sx + 14, 450, "no", "start")
    b += diamond(sx, 502, 320, 84, "Are the words in the", "spec Vocabulary?")
    # no -> /spec first (left)
    b += arrow(sx - 160, 502, 262, 502); b += lbl(sx - 185, 492, "no")
    b += box(60, 470, 200, 64, "/spec first", "define the word", "surface")
    b += path(f"M160 534 L160 600 L{sx-152} 600", "mutedS", False, "m-muted")
    b += arrow(sx, 544, sx, 568); b += lbl(sx + 14, 560, "yes", "start")
    b += box(sx - 150, 570, 300, 60, "/intent <verb + object>", "a proposed intent with acceptance criteria, no code", "accentSoft", "accentInk")
    # -> Q4
    b += path(f"M{sx+150} 600 L700 600 L700 440 L{q4x-142} 440", "mutedS", False, "m-muted"); b += lbl(sx + 180, 590, "the user validates", "start")
    # Q4
    b += diamond(q4x, 440 + 0, 280, 84, "A structural choice,", "costly to reverse?")
    # hmm place Q4 at y=440 center; arrows arrive from above at (q4x, 398)
    # yes -> /decision
    b += arrow(q4x, 482, q4x, 510); b += lbl(q4x + 14, 500, "yes", "start")
    b += box(q4x - 130, 512, 260, 48, "/decision before the code", None, "surface")
    b += arrow(q4x, 560, q4x, 586)
    b += path(f"M{q4x+140} 440 L1130 440 L1130 626 L{q4x+142} 626", "mutedS", False, "m-muted"); b += lbl(q4x + 160, 430, "no", "start")
    b += diamond(q4x, 626, 240, 76, "An intent to deliver?")
    # yes -> C (bottom left of q4), no -> F
    b += path(f"M{q4x-120} 626 L685 626 L685 690", "mutedS", False, "m-muted"); b += lbl(q4x - 140, 616, "yes", "end")
    b += box(520, 692, 330, 56, "Code + tests titled after the criteria", "intent → implemented with anchors", "agentSoff".replace("Soff","Soft"))
    b += path(f"M{q4x} 664 L{q4x} 680 L1011 680 L1011 690", "mutedS", False, "m-muted"); b += lbl(q4x + 12, 678, "no", "start")
    b += box(870, 692, 282, 56, "Code + regression test", "handbook and pointers if needed", "agentSoft")
    # end
    b += box(60, 692, 440, 56, "update .  →  lint  →  follow docs/workflow", "every path ends here", "surface")
    b += arrow(518, 720, 502, 720)
    emit("agent-decision-tree", W, H, b, "What the agent does with what the user asks",
         "A decision tree: a question is answered from the docs; a visible change starts with a proposed intent and spec vocabulary; a costly choice starts with an ADR; everything ends with update, lint and the team workflow.")

# ---------- 6. terminal ----------
def terminal():
    W, H = 1200, 400
    b = rect(64, 40, 1072, 320, "term", 18, "line", "thin")
    for i, c in enumerate(["#FF5F57", "#FEBC2E", "#28C840"]):
        b += f'<circle cx="{92+i*22}" cy="66" r="6" fill="{c}"/>'
    b += text(600, 71, "acme-billing", 13, "termMuted mono", "middle")
    rows = [
        ("$ npx -y @vaubaan/harness init . --engines=claude-code", "termInk"),
        ("rendered 20 files to .", "termMuted"),
        ("next: commit the generated files, then run `npx @vaubaan/harness lint` before each commit", "termMuted"),
        ("", "termMuted"),
        ("$ npx @vaubaan/harness lint", "termInk"),
        ("docs/handbook/invoice-pipeline.md: warning[lint:tracks-drift]", "warn"),
        ("  tracked files changed 12 times since last_reviewed (threshold 10)", "termMuted"),
        ("  → Try: /handbook", "termMuted"),
        ("", "termMuted"),
        ("0 errors, 1 warning. ✔ CI passes.", "ok"),
    ]
    y = 112
    for s, cls in rows:
        if s: b += text(96, y, s, 15, f"{cls} mono")
        y += 24
    emit("terminal", W, H, b, "init, then lint",
         "Terminal: init renders 20 files; lint reports a drift warning on a handbook and names the skill that fixes it; CI passes.", bg=False)

hero(); two_databases(); how_it_works(); intent_tree(); decision_tree(); terminal()
print("ok", sorted(os.listdir(OUT)))
