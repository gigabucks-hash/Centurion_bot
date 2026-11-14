#!/usr/bin/env python3
"""Centurion Trade design tokens build (package @centurion/design-tokens). Source: tokens.json (W3C DTCG). No deps (Python 3.9+).
usage: python3 build.py [SRC_JSON] [OUT_DIR]
Outputs: tokens.css · tailwind.theme.css (Tailwind v4, CSS-first @theme) · tauri.css (dark + Compact default)
         tailwind.config.tokens.legacy-v3.js · contrast-report.md
Exit code 1 if any WCAG check fails."""
import json, os, sys
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")
HERE=os.path.dirname(os.path.abspath(__file__))
# Defaults: monorepo package layout (src/tokens.json → tokens/) or design-source layout (tokens/tokens.json → tokens/)
_pkg_src=os.path.join(HERE,"..","src","tokens.json")
SRC=sys.argv[1] if len(sys.argv)>1 else (_pkg_src if os.path.exists(_pkg_src) else os.path.join(HERE,"..","tokens","tokens.json"))
OUT=sys.argv[2] if len(sys.argv)>2 else os.path.abspath(os.path.join(HERE,"..","tokens"))
os.makedirs(OUT,exist_ok=True)
tok=json.load(open(SRC, encoding="utf-8"))

def leaves(node,prefix=""):
    for k,v in node.items():
        if k.startswith("$"): continue
        p=f"{prefix}.{k}" if prefix else k
        if isinstance(v,dict) and "$value" in v: yield p,v
        elif isinstance(v,dict): yield from leaves(v,p)
def px(v): return v["$value"]["value"]
_isalias=lambda v:isinstance(v["$value"],str) and v["$value"].startswith("{")
COL={th:{p:v["$value"] for p,v in leaves(tok["color"][th]) if not _isalias(v)} for th in ("dark","light")}
# DTCG aliases ("{color.<th>.bg.sunken}") → deprecated alias vars pointing at the official token (0.2.4)
ALIAS={th:{p:v["$value"].strip("{}").split(".",2)[2] for p,v in leaves(tok["color"][th]) if _isalias(v)} for th in ("dark","light")}
for _th in ALIAS:
    for _a,_t in ALIAS[_th].items(): assert _t in COL[_th], f"alias {_a} → unknown {_t}"
TYP={d:{p:v["$value"] for p,v in leaves(tok["typography"][d])} for d in ("comfortable","compact")}
DEN={d:{p:px(v) for p,v in leaves(tok["density"][d])} for d in ("comfortable","compact")}
SPACE={p:px(v) for p,v in leaves(tok["space"])}
RAD={p:px(v) for p,v in leaves(tok["radius"])}
EL={p:v["$value"] for p,v in leaves(tok["elevation"])}
# 0.3.4: per-theme component shadows (card, dialog)
SHD={th:{p:v["$value"] for p,v in leaves(tok["shadow"][th])} for th in ("dark","light")}
DUR={p.split('.')[-1]:px(v) for p,v in leaves(tok["motion"]["duration"])}
EASE={p:v["$value"] for p,v in leaves(tok["motion"]["easing"])}
SANS=", ".join(f"'{f}'" if " " in f else f for f in tok["font"]["family"]["sans"]["$value"])
MONO=", ".join(f"'{f}'" if " " in f else f for f in tok["font"]["family"]["mono"]["$value"])
DISPLAY=", ".join(f"'{f}'" if " " in f else f for f in tok["font"]["family"]["display"]["$value"])  # 0.3.0
# Coin logo + identicon (0.3.0, COIN_LOGO.md)
COIN=tok["coin"]; COIN_SIZE={k:px(v) for k,v in COIN["logo"]["size"].items()}
COIN_RING={th:COIN["logo"]["ring"][th]["$value"] for th in ("dark","light")}
ID_FG=COIN["identicon"]["fg"]["$value"]; ID_PAL=[COIN["identicon"]["palette"][str(i)]["$value"] for i in range(12)]
NT_OPACITY=COIN["logo"]["notTradeableOpacity"]["$value"]
def rgba8(h):  # #RRGGBBAA → rgba()
    h=h.lstrip("#"); r,g,b,a=(int(h[i:i+2],16) for i in (0,2,4,6)); return f"rgba({r}, {g}, {b}, {round(a/255,2)})"
def shadow(v): return "none" if v=="none" else f"0 {v['offsetY']['value']}px {v['blur']['value']}px {v['spread']['value']}px {v['color']}"
cv=lambda k:"--color-"+k.replace('.','-')
dv=lambda k:"--density-"+k.replace('.','-')

# ---------------- contrast (WCAG 2.2) ----------------
def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c:c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+0.05)/(lb+0.05)
SURF=["bg.canvas","bg.surface","bg.raised","bg.overlay","bg.sunken","bg.chrome"]  # chrome: 0.3.4 sidebar / tab bar
TEXT=["text.primary","text.secondary","text.tertiary","brand.primary","semantic.profit","semantic.loss","semantic.warning","semantic.guard","semantic.info","semantic.neutralPnl","mode.practice","mode.real"]
NONTEXT=["border.strong","border.focus","brand.primary","semantic.profit","semantic.loss","semantic.warning","semantic.guard","semantic.info","mode.practice","mode.real"]
PAIRS=[("brand.onPrimaryContainer","brand.primaryContainer"),("text.onAccent","brand.primary"),("text.onAccent","semantic.profit"),("text.onAccent","semantic.loss"),
 ("semantic.profit","semantic.profitContainer"),("semantic.loss","semantic.lossContainer"),("semantic.warning","semantic.warningContainer"),
 ("semantic.guard","semantic.guardContainer"),("semantic.onWarning","semantic.warning"),("semantic.onWarning","semantic.guard"),("semantic.info","semantic.infoContainer"),("mode.onPractice","mode.practice"),("mode.onReal","mode.real"),
 ("mode.practice","mode.practiceContainer"),("mode.onPracticeContainer","mode.practiceContainer"),("mode.onPracticeContainer","mode.practiceStripe"),("mode.real","mode.realContainer"),("text.primary","brand.primaryContainer"),("inverse.onSurface","inverse.surface"),("inverse.primary","inverse.surface"),("semantic.info","semantic.infoContainer")]
rep=["# Contrast report (WCAG 2.2) — generated by build.py","",
 "Matriks penuh: setiap token teks × setiap surface (canvas, surface, raised, overlay, sunken, chrome; `bg.inset` = alias deprecated ke `bg.sunken`) ≥ 4.5:1 (SC 1.4.3); setiap token non-teks (border.strong, focus, ikon semantik, mode) × setiap surface ≥ 3:1 (SC 1.4.11); plus pasangan on-color/container ≥ 4.5:1.",
 "Dikecualikan: `text.disabled` (SC 1.4.3 exempt), `border.subtle`/`border.default` (dekoratif — pemisah, bukan batas kontrol; kontrol interaktif wajib pakai `border.strong`).",""]
fails=[]
for th in ("dark","light"):
    c=COL[th]; rows=[]
    for fg in TEXT:
        for bg in SURF: rows.append((fg,bg,cr(c[fg],c[bg]),4.5,"text"))
    for fg in NONTEXT:
        for bg in SURF: rows.append((fg,bg,cr(c[fg],c[bg]),3.0,"non-text"))
    for fg,bg in PAIRS: rows.append((fg,bg,cr(c[fg],c[bg]),4.5,"pair"))
    worst=min(rows,key=lambda r:r[2]/r[3])
    rep+=[f"## {th}",f"Checks: {len(rows)} · terendah relatif target: `{worst[0]}` on `{worst[1]}` = {worst[2]:.2f} (target {worst[3]})","",
          "| Kind | Foreground | Background | Ratio | Target | Result |","|---|---|---|---|---|---|"]
    for fg,bg,r,t,k in rows:
        ok=r>=t
        if not ok: fails.append(f"{th}: {fg} on {bg} {r:.2f} < {t}")
        rep.append(f"| {k} | `{fg}` {c[fg]} | `{bg}` {c[bg]} | {r:.2f} | {t} | {'PASS' if ok else '**FAIL**'} |")
    rep.append("")
rep.append(f"Total FAIL: {len(fails)}"); rep+=fails
# Skeleton visibility (0.2.5, decorative → not WCAG; floor 1.15:1 on every surface it sits on)
rep+=["","## Skeleton visibility (decorative, floor 1.15:1)","| theme | surface | ratio | ok |","|---|---|---|---|"]
for th in ("dark","light"):
    for bg in ("bg.canvas","bg.surface","bg.raised"):
        r_=cr(COL[th]["skeleton.base"],COL[th][bg]); rep.append(f"| {th} | `{bg}` | {r_:.2f} | {'PASS' if r_>=1.15 else 'FAIL'} |")
        if r_<1.15: fails.append(("skeleton.base",bg,r_,1.15,"skeleton"))
# Identicon initials (0.3.0): fg on each palette hue ≥ 4.5:1 (text)
rep+=["","## Identicon (coin.identicon.fg on palette, text ≥ 4.5:1)","| idx | bg | ratio | ok |","|---|---|---|---|"]
for i,h in enumerate(ID_PAL):
    r_=cr(ID_FG,h); rep.append(f"| {i} | {h} | {r_:.2f} | {'PASS' if r_>=4.5 else 'FAIL'} |")
    if r_<4.5: fails.append(f"identicon.palette.{i} {r_:.2f} < 4.5")
# Accent vs mode distinctness (0.3.0 G1-blue): brand must never read as Practice cyan / Real magenta / PnL
import math
def _lab(h):
    def l(c):
        c/=255; return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
    h=h.lstrip('#'); r,g,b=(l(int(h[i:i+2],16)) for i in (0,2,4))
    X=(r*.4124+g*.3576+b*.1805)/.95047; Y=r*.2126+g*.7152+b*.0722; Z=(r*.0193+g*.1192+b*.9505)/1.08883
    f=lambda t:t**(1/3) if t>0.008856 else 7.787*t+16/116
    return 116*f(Y)-16,500*(f(X)-f(Y)),200*(f(Y)-f(Z))
def de00(a,b):
    L1,a1,b1=_lab(a); L2,a2,b2=_lab(b); C1=math.hypot(a1,b1); C2=math.hypot(a2,b2); Cb=(C1+C2)/2
    G=.5*(1-math.sqrt(Cb**7/(Cb**7+25**7))); a1p=(1+G)*a1; a2p=(1+G)*a2
    C1p=math.hypot(a1p,b1); C2p=math.hypot(a2p,b2)
    h1=math.degrees(math.atan2(b1,a1p))%360; h2=math.degrees(math.atan2(b2,a2p))%360
    dL=L2-L1; dC=C2p-C1p; dh=h2-h1
    dh=dh-360 if dh>180 else (dh+360 if dh<-180 else dh)
    dH=2*math.sqrt(C1p*C2p)*math.sin(math.radians(dh/2)); Lb=(L1+L2)/2; Cbp=(C1p+C2p)/2
    hb=(h1+h2)/2 if abs(h1-h2)<=180 else (h1+h2+360)/2
    T=(1-.17*math.cos(math.radians(hb-30))+.24*math.cos(math.radians(2*hb))
       +.32*math.cos(math.radians(3*hb+6))-.2*math.cos(math.radians(4*hb-63)))
    SL=1+.015*(Lb-50)**2/math.sqrt(20+(Lb-50)**2); SC=1+.045*Cbp; SH=1+.015*Cbp*T
    dth=30*math.exp(-((hb-275)/25)**2); RC=2*math.sqrt(Cbp**7/(Cbp**7+25**7)); RT=-math.sin(math.radians(2*dth))*RC
    return math.sqrt((dL/SL)**2+(dC/SC)**2+(dH/SH)**2+RT*(dC/SC)*(dH/SH))
rep+=["","## Accent distinctness (ΔE2000 ≥ 20 vs mode, PnL, guard, warning)","| theme | pair | ΔE00 | ok |","|---|---|---|---|"]
for th in ("dark","light"):
    for o in ("mode.practice","mode.real","semantic.profit","semantic.loss","semantic.guard","semantic.warning"):
        e=de00(COL[th]["brand.primary"],COL[th][o]); rep.append(f"| {th} | `brand.primary` vs `{o}` | {e:.1f} | {'PASS' if e>=20 else 'FAIL'} |")
        if e<20: fails.append(f"{th}: brand.primary vs {o} ΔE00 {e:.1f} < 20")
# Guard distinctness (0.3.1, lead decision: guard = amber). Guard must never read as PnL / mode / accent.
# vs semantic.warning: both are amber by design (same "caution" family). Dark keeps ΔE ≥ 20; light cannot reach 20
# while staying amber, AA on light surfaces and ≥ 20 from loss red → documented floor 8 (guard always ships with
# shield icon + "Guard" label; warning with triangle icon). See CHANGELOG 0.3.1.
GUARD_MIN={"mode.practice":20,"mode.real":20,"semantic.profit":20,"semantic.loss":20,"brand.primary":20}
GUARD_WARN_MIN={"dark":20,"light":8}
rep+=["","## Guard distinctness (ΔE2000 ≥ 20 vs PnL, mode, accent; vs warning: dark ≥ 20, light documented floor 8)","| theme | pair | ΔE00 | min | ok |","|---|---|---|---|---|"]
for th in ("dark","light"):
    for o,m in list(GUARD_MIN.items())+[("semantic.warning",GUARD_WARN_MIN[th])]:
        e=de00(COL[th]["semantic.guard"],COL[th][o]); rep.append(f"| {th} | `semantic.guard` vs `{o}` | {e:.1f} | {m} | {'PASS' if e>=m else 'FAIL'} |")
        if e<m: fails.append(f"{th}: semantic.guard vs {o} ΔE00 {e:.1f} < {m}")
# Mode treatments (0.3.3): top strip + badge readable on every surface, both themes
rep+=["","## Mode treatments (strip ≥ 3:1 vs canvas/surface; badge label ≥ 4.5:1 on both stripe bands)","| theme | check | ratio | min | ok |","|---|---|---|---|---|"]
for th in ("dark","light"):
    c=COL[th]; rows_=[]
    for m in ("mode.practice","mode.real"):
        for bg in ("bg.canvas","bg.surface"): rows_.append((f"`{m}` strip on `{bg}`",cr(c[m],c[bg]),3.0))
    for bg in ("mode.practiceContainer","mode.practiceStripe"): rows_.append((f"`mode.onPracticeContainer` on `{bg}`",cr(c["mode.onPracticeContainer"],c[bg]),4.5))
    rows_.append(("`mode.onReal` on `mode.real` (badge)",cr(c["mode.onReal"],c["mode.real"]),4.5))
    for n,r_,m_ in rows_:
        rep.append(f"| {th} | {n} | {r_:.2f} | {m_} | {'PASS' if r_>=m_ else 'FAIL'} |")
        if r_<m_: fails.append(f"{th}: {n} {r_:.2f} < {m_}")
# 0.3.4 scrim.sheet: translucent (#RRGGBBAA) — alpha floor so content behind a sheet reads as inactive, ceiling so context stays visible
rep+=["","## Scrim (scrim.sheet alpha, 0.32–0.70)","| theme | value | alpha | ok |","|---|---|---|---|"]
for th in ("dark","light"):
    _h=COL[th]["scrim.sheet"].lstrip("#"); _a=int(_h[6:8],16)/255 if len(_h)==8 else 1.0
    _ok=0.32<=_a<=0.70; rep.append(f"| {th} | {COL[th]['scrim.sheet']} | {_a:.2f} | {'PASS' if _ok else 'FAIL'} |")
    if not _ok: fails.append(f"{th}: scrim.sheet alpha {_a:.2f} outside 0.32–0.70")
open(os.path.join(OUT,"contrast-report.md"),"w",encoding="utf-8",newline="\n").write("\n".join(rep)+"\n")

# ---------------- CSS blocks ----------------
def colvars(th,ind="  "):
    return [f"{ind}{cv(k)}: {v};" for k,v in COL[th].items()]+[f"{ind}--coin-logo-ring: {rgba8(COIN_RING[th])};"]+[f"{ind}--shadow-{k}: {shadow(v)};" for k,v in SHD[th].items()]+[f"{ind}{cv(a)}: var({cv(t)}); /* deprecated alias (0.2.4): use {cv(t)} */" for a,t in ALIAS[th].items()]
def typevars(den,ind="  "):
    o=[]
    for k,v in TYP[den].items():
        s=v["fontSize"]["value"]; o+= [f"{ind}--text-{k}: {s}px;",f"{ind}--text-{k}--line-height: {round(s*v['lineHeight'])}px;",f"{ind}--text-{k}--font-weight: {v['fontWeight']};"]
        if v["letterSpacing"]["value"]: o.append(f"{ind}--text-{k}--letter-spacing: {v['letterSpacing']['value']}px;")
    return o
def denvars(den,ind="  "):
    d=DEN[den]; o=[f"{ind}{dv(k)}: {v}px;" for k,v in d.items()]
    o+=[f"{ind}--spacing-control-sm: {d['control.sm']}px;",f"{ind}--spacing-control-md: {d['control.md']}px;",f"{ind}--spacing-control-lg: {d['control.lg']}px;",
        f"{ind}--spacing-hit: {d['hitMin']}px;",f"{ind}--spacing-row: {d['rowHeight']}px;",f"{ind}--spacing-chip: {d['chipHeight']}px;",f"{ind}--spacing-pad-x: {d['paddingX']}px;"]
    return o
STATIC=[f"  --font-sans: {SANS};",f"  --font-mono: {MONO};",f"  --font-display: {DISPLAY};","  --spacing: 4px;"]
STATIC+=[f"  --coin-logo-size-{k}: {v}px;" for k,v in COIN_SIZE.items()]+[f"  --coin-logo-not-tradeable-opacity: {NT_OPACITY};"]
STATIC+=[f"  --color-identicon-fg: {ID_FG};"]+[f"  --color-identicon-{i}: {h};" for i,h in enumerate(ID_PAL)]
STATIC+=[f"  --space-{k}: {v}px;" for k,v in SPACE.items()]
STATIC+=[f"  --radius-{k}: {v}px;" for k,v in RAD.items()]
STATIC+=[f"  --shadow-e{k}: {shadow(v)};" for k,v in EL.items()]
STATIC+=[f"  --duration-{k}: {v}ms;" for k,v in DUR.items()]
STATIC+=[f"  --ease-{k}: cubic-bezier({', '.join(map(str,v))});" for k,v in EASE.items()]
MODE=['[data-mode="practice"] {','  --mode-accent: var(--color-mode-practice);','  --mode-container: var(--color-mode-practiceContainer);',
      '  --mode-on: var(--color-mode-onPractice);','  --hold-to-confirm: var(--duration-holdPractice);','}',
      '[data-mode="real"] {','  --mode-accent: var(--color-mode-real);','  --mode-container: var(--color-mode-realContainer);',
      '  --mode-on: var(--color-mode-onReal);','  --hold-to-confirm: var(--duration-holdReal);','}']
RM=["@media (prefers-reduced-motion: reduce) {","  /* hold-to-confirm tetap (berbasis waktu) */",
    "  :root {","    --duration-instant: 0ms; --duration-fast: 0ms; --duration-base: 0ms; --duration-slow: 0ms;","    --duration-shimmer: 0ms;","  }",
    "  .skeleton::after { animation: none; display: none; } /* static fill, no shimmer */","}"]
NUM=[".num, .tabular { font-family: var(--font-mono); font-variant-numeric: tabular-nums slashed-zero; }"]
# Skeleton (0.2.5): shimmer animates transform only (no background-position → no repaint of layout); see PERFORMANCE_BUDGET.md
SKEL=["/* Skeleton: .skeleton (block) · .skeleton--text (line) · .skeleton--circle (avatar/logo).",
      "   Container gets aria-busy=\"true\"; screen readers announce once, not per block. */",
      ".skeleton {","  position: relative; overflow: hidden;","  background: var(--color-skeleton-base); border-radius: var(--radius-md);","}",
      ".skeleton--text { height: 0.75em; border-radius: var(--radius-sm); }",".skeleton--circle { border-radius: var(--radius-full); }",
      ".skeleton::after {","  content: \"\"; position: absolute; inset: 0; transform: translateX(-100%); will-change: transform;",
      "  background: linear-gradient(90deg, transparent, var(--color-skeleton-highlight), transparent);",
      "  animation: centurion-shimmer var(--duration-shimmer) linear infinite;","}",
      "@keyframes centurion-shimmer { to { transform: translateX(100%); } }"]
HDR="/* GENERATED by build.py from tokens.json — do not edit by hand. Centurion Trade (@centurion/design-tokens). */"

def plain_css(default_density):
    o=[HDR,":root, [data-theme=\"dark\"] {","  color-scheme: dark;"]+colvars("dark")+["}",
       "[data-theme=\"light\"] {","  color-scheme: light;"]+colvars("light")+["}",
       "@media (prefers-color-scheme: light) {","  :root:not([data-theme]) {"]+colvars("light","    ")+["  }","}",""]
    o+=[":root {"]+STATIC+typevars(default_density)+denvars(default_density)+["}"]
    other="compact" if default_density=="comfortable" else "comfortable"
    o+=[f'[data-density="{other}"] {{']+typevars(other)+denvars(other)+["}"]
    o+=MODE+SKEL+RM+NUM
    return o
open(os.path.join(OUT,"tokens.css"),"w",encoding="utf-8",newline="\n").write("\n".join(plain_css("comfortable"))+"\n")

t=plain_css("compact")
t[0]=HDR+"\n/* Tauri desktop: dark default (no OS auto-switch unless app sets data-theme),\n   density COMPACT default (controls 32px, hit area ≥ 24px = WCAG 2.2 SC 2.5.8). */"
# Tauri: do not auto-follow OS light by media query; app sets data-theme from tauri theme event
i=t.index("@media (prefers-color-scheme: light) {")
j=t.index("}",t.index("  }",i))          # closing brace of the @media block (v0.2.0 bug: left one stray "}")
del t[i:j+1]
t+=[":root { --window-mode-strip: 4px; --titlebar-height: 32px; }",
    "html, body {","  background: var(--color-bg-canvas);","  color: var(--color-text-primary);","  font-family: var(--font-sans);",
    "  font-size: var(--text-body);","  line-height: var(--text-body--line-height);","}",
    "/* Hit area helper: visual 24–32px control keeps ≥24px pointer target */",".hit { min-width: var(--spacing-hit); min-height: var(--spacing-hit); }"]
open(os.path.join(OUT,"tauri.css"),"w",encoding="utf-8",newline="\n").write("\n".join(t)+"\n")

# Tailwind v4 CSS-first
tw=[HDR,"/* Tailwind CSS v4 — usage (globals.css):",'   @import "tailwindcss";','   @import "@centurion/design-tokens/tailwind.theme.css";',
    "   Utilities: bg-bg-surface, text-text-primary, text-semantic-profit, bg-mode-container, border-border-strong,","   text-body, text-num-md, font-mono,",
    "   h-control-md, min-h-hit, rounded-md, shadow-e2, ease-standard, light:… / dark:… variants.",
    "   Theme switching works at runtime because utilities read the CSS variables defined in @theme. */","",
    '@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));','@custom-variant light (&:where([data-theme="light"], [data-theme="light"] *));',
    '@custom-variant practice (&:where([data-mode="practice"], [data-mode="practice"] *));','@custom-variant real (&:where([data-mode="real"], [data-mode="real"] *));',
    '@custom-variant compact (&:where([data-density="compact"], [data-density="compact"] *));',"",
    "@theme {"]+colvars("dark")+STATIC+typevars("comfortable")+denvars("comfortable")+[
    "  --color-mode-accent: var(--mode-accent, var(--color-mode-practice));","  --color-mode-container: var(--mode-container, var(--color-mode-practiceContainer));","  --color-mode-on: var(--mode-on, var(--color-mode-onPractice));","}","",
    '[data-theme="light"] {']+colvars("light")+["}",'[data-density="compact"] {']+typevars("compact")+denvars("compact")+["}"]+MODE+SKEL+RM+["@utility tabular { font-variant-numeric: tabular-nums slashed-zero; }"]
open(os.path.join(OUT,"tailwind.theme.css"),"w",encoding="utf-8",newline="\n").write("\n".join(tw)+"\n")

# legacy v3
groups={}
for k in list(COL['dark'])+list(ALIAS['dark']):  # alias (deprecated) keeps bg-inset utility
    g,n=k.split('.'); groups.setdefault(g,{})[n]=f"var({cv(k)})"
legacy={"darkMode":["selector",'[data-theme="dark"]'],"theme":{"extend":{"colors":groups,"fontFamily":{"sans":["var(--font-sans)"],"mono":["var(--font-mono)"]},
  "fontSize":{k:[f"var(--text-{k})",{"lineHeight":f"var(--text-{k}--line-height)","fontWeight":f"var(--text-{k}--font-weight)"}] for k in TYP['comfortable']},
  "borderRadius":{k:f"{v}px" for k,v in RAD.items()},"boxShadow":{**{f"e{k}":shadow(v) for k,v in EL.items()},**{k:f"var(--shadow-{k})" for k in SHD["dark"]}}}}}
open(os.path.join(OUT,"tailwind.config.tokens.legacy-v3.js"),"w",encoding="utf-8",newline="\n").write("/** LEGACY (Tailwind v3) — MVP memakai Tailwind v4 (tailwind.theme.css). Butuh tokens.css di-import. */\nmodule.exports = "+json.dumps(legacy,indent=2)+";\n")

# Flutter / Dart output was removed with the mobile app.
# Web and Windows desktop keep the CSS, Tailwind and Tauri outputs.
_stale = os.path.join(OUT, "app_tokens.dart")
if os.path.exists(_stale):
    os.remove(_stale)

# ---- CSS validation (v0.2.1): brace balance always; full parse with lightningcss when available
import re as _re, subprocess as _sp, shutil as _sh
def _balance(css):
    css=_re.sub(r"/\*.*?\*/","",css,flags=_re.S); css=_re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'',"\"\"",css)
    d=0
    for n,line in enumerate(css.split("\n"),1):
        for ch in line:
            d+=(ch=="{")-(ch=="}")
            if d<0: return f"unexpected '}}' at line {n}"
    return None if d==0 else f"{d} unclosed '{{'"
css_errors=[]
for _f in ["tokens.css","tauri.css","tailwind.theme.css"]:
    _p=os.path.join(OUT,_f); _e=_balance(open(_p,encoding="utf-8").read())
    if _e: css_errors.append(f"{_f}: {_e}")
_nm=os.environ.get("LIGHTNINGCSS_NODE_PATH","/tmp/twcheck/node_modules")
if _sh.which("node") and os.path.isdir(os.path.join(_nm,"lightningcss")):
    _js="const l=require('lightningcss'),fs=require('fs');let bad=0;for(const f of process.argv.slice(1)){try{l.transform({filename:f,code:fs.readFileSync(f),errorRecovery:false})}catch(e){bad++;console.log(f.split('/').pop()+': '+e.message+(e.loc?' @'+e.loc.line+':'+e.loc.column:''))}}process.exit(bad?1:0)"
    _r=_sp.run(["node","-e",_js]+[os.path.join(OUT,f) for f in ["tokens.css","tauri.css"]],env={**os.environ,"NODE_PATH":_nm},capture_output=True,text=True)
    if _r.returncode: css_errors+= [x for x in _r.stdout.splitlines() if x]
    css_note="brace-balance + lightningcss"
else: css_note="brace-balance (lightningcss not found)"
print(f"CSS validation ({css_note}): {'OK' if not css_errors else 'FAIL'}")
for e in css_errors: print("  CSS",e)
print(f"built → {OUT} · contrast fails: {len(fails)}")
for f in fails: print("  FAIL",f)
# ---- line-length lint (v0.2.3): generated CSS/JS outputs ≤ 120 columns (md/json exempt)
long=[]
for fn in sorted(os.listdir(OUT)):
    if fn.endswith((".css",".js")):
        for i,ln in enumerate(open(os.path.join(OUT,fn),encoding="utf-8").read().split("\n"),1):
            if len(ln)>120: long.append(f"{fn}:{i} ({len(ln)})")
print(f"Line length ≤ 120 (css/js): {'OK' if not long else 'FAIL '+', '.join(long)}")
sys.exit(1 if (fails or css_errors or long) else 0)
