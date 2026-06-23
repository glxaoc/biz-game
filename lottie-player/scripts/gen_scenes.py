#!/usr/bin/env python3
"""Generate three comparison Lottie scenes for the biz-game test.

scene-1  event reward  : trophy pop + coin burst + confetti        (images: coin, trophy)
scene-2  rig character : static body + forearm waving at the elbow (images: body, forearm)
scene-3  static + life : desk character + speech bubble/check/bar/sparkles (image: desk)
"""
import json, math, os, shutil
from PIL import Image
import numpy as np

SRC = r"C:\Users\xaoc\biz-game\lottie-test"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJ = os.path.join(ROOT, "public", "projects", "main-project")

def scene_dir(n):
    d = os.path.join(PROJ, f"scene-{n}")
    os.makedirs(d, exist_ok=True)
    return d

# ---------- lottie helpers ----------
def stat(v):            return {"a": 0, "k": v}
def E(ox, oy, ix, iy):  return {"o": {"x": [ox], "y": [oy]}, "i": {"x": [ix], "y": [iy]}}
EASE_OUT  = E(0.3, 0.0, 0.6, 1.0)
EASE_IN   = E(0.4, 0.0, 0.7, 1.0)
EASE_INOUT= E(0.45, 0.0, 0.55, 1.0)

def kf(t, val, ease=None):
    d = {"t": t, "s": val if isinstance(val, list) else [val]}
    if ease: d.update(ease)
    return d

def anim(keyframes):    return {"a": 1, "k": keyframes}

def tr(p, a=[0,0], s=[100,100], r=0, o=100):
    return {"ty": "tr", "p": p if isinstance(p, dict) else stat(p),
            "a": stat(a), "s": s if isinstance(s, dict) else stat(s),
            "r": r if isinstance(r, dict) else stat(r),
            "o": o if isinstance(o, dict) else stat(o)}

def img_asset(_id, w, h, fname):
    return {"id": _id, "w": w, "h": h, "u": "", "p": fname, "e": 0}

def img_layer(ind, name, refId, op, p, a, s, r=None, o=None):
    return {"ddd": 0, "ind": ind, "ty": 2, "nm": name, "refId": refId,
            "ks": {"o": o if o is not None else stat(100),
                   "r": r if r is not None else stat(0),
                   "p": p if isinstance(p, dict) else stat(p),
                   "a": stat(a), "s": s if isinstance(s, dict) else stat(s)},
            "ao": 0, "ip": 0, "op": op, "st": 0, "bm": 0}

def shape_layer(ind, name, op, items, p=[256,256], a=[0,0], s=[100,100], r=0, o=100, ip=0):
    return {"ddd": 0, "ind": ind, "ty": 4, "nm": name,
            "ks": {"o": o if isinstance(o, dict) else stat(o),
                   "r": r if isinstance(r, dict) else stat(r),
                   "p": p if isinstance(p, dict) else stat(p),
                   "a": stat(a), "s": s if isinstance(s, dict) else stat(s)},
            "ao": 0, "shapes": items, "ip": ip, "op": op, "st": 0, "bm": 0}

def gr(items):          return {"ty": "gr", "it": items}
def rect(w, h, rad=0):  return {"ty": "rc", "d": 1, "s": stat([w, h]), "p": stat([0,0]), "r": stat(rad)}
def ell(w, h):          return {"ty": "el", "d": 1, "s": stat([w, h]), "p": stat([0,0])}
def star(points, ir, orr): return {"ty": "sr", "sy": 1, "pt": stat(points), "p": stat([0,0]),
                                   "r": stat(0), "ir": stat(ir), "is": stat(0), "or": stat(orr), "os": stat(0)}
def fill(c):            return {"ty": "fl", "c": c if isinstance(c, dict) else stat(c), "o": stat(100), "r": 1}
def stroke(c, w):       return {"ty": "st", "c": stat(c), "o": stat(100), "w": stat(w), "lc": 2, "lj": 2}
def path(verts, closed=False):
    n = len(verts)
    return {"ty": "sh", "ks": stat({"i": [[0,0]]*n, "o": [[0,0]]*n, "v": verts, "c": closed})}
def trim(end_anim):     return {"ty": "tm", "s": stat(0), "e": end_anim, "o": stat(0), "m": 1}

def bg_layer(ind, op):
    g = gr([rect(700,700,0), {"ty":"fl","c":{"sid":"bgColor"},"o":stat(100),"r":1},
            tr(stat([0,0]))])
    return shape_layer(ind, "background", op, [g], p=[256,256])

def doc(nm, op, assets, layers, fr=60, w=512, h=512, slots=None):
    d = {"v":"5.7.0","fr":fr,"ip":0,"op":op,"w":w,"h":h,"nm":nm,
         "ddd":0,"assets":assets,"layers":layers}
    d["slots"] = {"bgColor": {"p": stat([1,1,1,1])}}
    if slots: d["slots"].update(slots)
    return d

def write_scene(n, lottie, controls):
    d = scene_dir(n)
    with open(os.path.join(d, "lottie.json"), "w", encoding="utf-8") as f:
        json.dump(lottie, f)
    with open(os.path.join(d, "controls.json"), "w", encoding="utf-8") as f:
        json.dump({"controls": controls}, f, indent=2)
    # validate
    json.loads(open(os.path.join(d, "lottie.json"), encoding="utf-8").read())
    print(f"scene-{n}: {len(lottie['layers'])} layers, op={lottie['op']}")

# ============================================================ SCENE 1
def scene1():
    d = scene_dir(1)
    shutil.copy(os.path.join(SRC, "coin.png"), os.path.join(d, "coin.png"))
    shutil.copy(os.path.join(SRC, "trophy.png"), os.path.join(d, "trophy.png"))
    OP = 150
    assets = [img_asset("coin", 1024, 1024, "coin.png"),
              img_asset("trophy", 1024, 1024, "trophy.png")]
    layers, ind = [], 1

    # confetti (front)
    palette = [[0.95,0.30,0.35,1],[0.99,0.78,0.22,1],[0.30,0.75,0.45,1],
               [0.28,0.55,0.95,1],[0.70,0.40,0.90,1],[0.98,0.55,0.25,1]]
    import random; random.seed(7)
    for i in range(16):
        x0 = 40 + i*28 % 440
        col = palette[i % len(palette)]
        start = (i*5) % 60
        dur = 110
        y0 = -30 - (i*17 % 120)
        sway = 30 if i%2 else -30
        p = anim([kf(start,[x0,y0,0],EASE_INOUT), kf(start+dur,[x0+sway,540,0])])
        rot = anim([kf(start,[0],EASE_INOUT), kf(start+dur,[360*(2 if i%2 else -2)])])
        w_,h_ = (10,16) if i%3 else (14,8)
        g = gr([rect(w_,h_,2), fill(col), tr(stat([0,0]))])
        layers.append(shape_layer(ind, f"confetti-{i}", OP, [g], p=p, r=rot)); ind+=1

    # coins burst (behind confetti, in front of trophy)
    cx, cy = 256, 262
    NC = 8
    for i in range(NC):
        ang = math.radians(-90 + (i-(NC-1)/2)*26)
        dist = 120 + (i%3)*18
        tx = cx + math.cos(ang)*dist
        peak = cy - 70 - (i%4)*15
        start = i*3
        p = anim([kf(start,[cx,cy,0],EASE_OUT),
                  kf(start+22,[tx,peak,0],E(0.2,0,0.4,1)),
                  kf(start+70,[tx+ (10 if i%2 else -10),470,0])])
        s = anim([kf(start,[0,0,100],EASE_OUT), kf(start+8,[6.5,6.5,100],EASE_INOUT),
                  kf(start+8,[6.5,6.5,100])])
        o = anim([kf(0,[0]), kf(start,[0],EASE_OUT), kf(start+6,[100]),
                  kf(start+60,[100],EASE_IN), kf(start+78,[0])])
        rot = anim([kf(start,[0],EASE_INOUT), kf(start+78,[(3 if i%2 else -3)*180])])
        layers.append(img_layer(ind, f"coin-{i}", "coin", OP, p,
                      [512,512,0], s, r=rot, o=o)); ind+=1

    # trophy pop + idle bob
    ts = anim([kf(0,[0,0,100],EASE_OUT), kf(18,[19.5,19.5,100],E(0.3,0,0.4,1)),
               kf(28,[16,16,100],EASE_INOUT), kf(36,[17.5,17.5,100])])
    to = anim([kf(0,[0]), kf(8,[100])])
    tp = anim([kf(36,[256,250,0],EASE_INOUT), kf(95,[256,242,0],EASE_INOUT), kf(150,[256,250,0])])
    layers.append(img_layer(ind, "trophy", "trophy", OP, tp, [512,512,0], ts, o=to)); ind+=1

    layers.append(bg_layer(ind, OP))
    lot = doc("Reward burst", OP, assets, layers)
    lot["slots"]["bgColor"]["p"] = stat([0.10,0.13,0.22,1])
    write_scene(1, lot, [{"sid":"bgColor","label":"Цвет фона"}])

# ============================================================ SCENE 2
def scene2():
    d = scene_dir(2)
    im = Image.open(os.path.join(SRC, "character_rig.png")).convert("RGBA")
    arr = np.array(im)
    # forearm region (left/viewer arm): elbow seam ~y570, hand ~y690
    x0,x1,y0,y1 = 305,417,570,696
    mask = np.zeros(arr.shape[:2], bool); mask[y0:y1, x0:x1] = True
    body = arr.copy();   body[mask, 3] = 0
    fore = arr.copy();   fore[~mask, 3] = 0
    Image.fromarray(body).save(os.path.join(d, "body.png"))
    Image.fromarray(fore).save(os.path.join(d, "forearm.png"))

    OP = 150; S = 46.0
    def cx(px): return 256 + (px-512)*S/100.0
    def cy(py): return 256 + (py-512)*S/100.0
    PIV = (375, 580)
    assets = [img_asset("body",1024,1024,"body.png"),
              img_asset("fore",1024,1024,"forearm.png")]
    layers, ind = [], 1

    # forearm wave (front). positive deg = swing hand OUTWARD (away from body) = clean wave
    wave = anim([kf(0,[0],EASE_OUT), kf(16,[18],EASE_INOUT), kf(28,[9],EASE_INOUT),
                 kf(40,[19],EASE_INOUT), kf(52,[9],EASE_INOUT), kf(64,[19],EASE_INOUT),
                 kf(76,[10],EASE_INOUT), kf(92,[17],EASE_INOUT), kf(120,[0])])
    layers.append(img_layer(ind, "forearm", "fore", OP,
                  stat([cx(PIV[0]),cy(PIV[1]),0]), [PIV[0],PIV[1],0],
                  stat([S,S,100]), r=wave)); ind+=1
    # body (static)
    layers.append(img_layer(ind, "body", "body", OP,
                  stat([256,256,0]), [512,512,0], stat([S,S,100]))); ind+=1
    layers.append(bg_layer(ind, OP))
    lot = doc("Rig wave", OP, assets, layers)
    lot["slots"]["bgColor"]["p"] = stat([0.93,0.95,0.98,1])
    write_scene(2, lot, [{"sid":"bgColor","label":"Цвет фона"}])

# ============================================================ SCENE 3
def scene3():
    d = scene_dir(3)
    # remove near-white background via corner flood fill
    im = Image.open(os.path.join(SRC, "character_desk.png")).convert("RGBA")
    arr = np.array(im).astype(np.int16)
    H,W = arr.shape[:2]
    rgb = arr[:,:,:3]
    near_white = (np.abs(rgb-np.array([245,245,245])).sum(axis=2) < 60)
    from collections import deque
    visited = np.zeros((H,W), bool); q = deque()
    for sx,sy in [(0,0),(W-1,0),(0,H-1),(W-1,H-1)]:
        if near_white[sy,sx]: q.append((sx,sy)); visited[sy,sx]=True
    while q:
        x,y = q.popleft()
        for nx,ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0<=nx<W and 0<=ny<H and not visited[ny,nx] and near_white[ny,nx]:
                visited[ny,nx]=True; q.append((nx,ny))
    out = np.array(im).copy(); out[visited,3]=0
    Image.fromarray(out).save(os.path.join(d, "desk.png"))

    OP = 200
    assets = [img_asset("desk", W, H, "desk.png")]
    layers, ind = [], 1
    GREEN = [0.20,0.72,0.40,1]

    # sparkles (front), twinkle loop
    spark_pos = [(150,150),(372,118),(330,210),(196,96)]
    for i,(sx,sy) in enumerate(spark_pos):
        off = i*20
        s = anim([kf(0,[0,0,100]), kf(off,[0,0,100],EASE_OUT), kf(off+14,[100,100,100],EASE_IN),
                  kf(off+30,[0,0,100]), kf(off+90,[0,0,100],EASE_OUT), kf(off+104,[100,100,100],EASE_IN),
                  kf(off+120,[0,0,100])])
        rot = anim([kf(off,[0],EASE_INOUT), kf(off+30,[90])])
        g = gr([star(4,3,13), fill([1,0.85,0.30,1]), tr(stat([0,0]))])
        layers.append(shape_layer(ind, f"sparkle-{i}", OP, [g], p=[sx,sy], s=s, r=rot)); ind+=1

    # checkmark drawing inside bubble
    end = anim([kf(0,[0]), kf(40,[0],EASE_OUT), kf(58,[100])])
    chk = gr([path([[-16,2],[-5,13],[17,-12]]), trim(end),
              stroke(GREEN,11), tr(stat([0,0]))])
    layers.append(shape_layer(ind, "check", OP, [chk], p=[356,120])); ind+=1

    # speech bubble pop
    bsc = anim([kf(0,[0,0,100]), kf(30,[0,0,100],EASE_OUT), kf(42,[112,112,100],EASE_INOUT),
                kf(50,[100,100,100])])
    bubble = gr([rect(104,76,18), path([[-14,34],[10,34],[-6,52]],True),
                 fill([1,1,1,1]), tr(stat([0,0]))])
    layers.append(shape_layer(ind, "bubble", OP, [bubble], p=[356,120], s=bsc)); ind+=1

    # progress bar fill (anchored left) + track
    fillw = anim([kf(0,[0,100,100]), kf(60,[0,100,100],EASE_OUT), kf(120,[100,100,100])])
    pf = gr([rect(196,16,8), fill(GREEN), tr(stat([98,0]))])  # anchor-left via tr.p
    layers.append(shape_layer(ind, "bar-fill", OP, [pf], p=[158,470], a=[0,0], s=fillw)); ind+=1
    pt = gr([rect(200,18,9), fill([0.85,0.88,0.92,1]), tr(stat([0,0]))])
    layers.append(shape_layer(ind, "bar-track", OP, [pt], p=[256,470])); ind+=1

    # desk character, gentle bob
    Sd = 35.0
    bob = anim([kf(0,[256,300,0],EASE_INOUT), kf(100,[256,292,0],EASE_INOUT), kf(200,[256,300,0])])
    layers.append(img_layer(ind, "desk", "desk", OP, bob, [W/2,H/2,0], stat([Sd,Sd,100]))); ind+=1

    layers.append(bg_layer(ind, OP))
    lot = doc("Working + life", OP, assets, layers)
    lot["slots"]["bgColor"]["p"] = stat([0.90,0.94,1.0,1])
    write_scene(3, lot, [{"sid":"bgColor","label":"Цвет фона"}])

if __name__ == "__main__":
    scene1(); scene2(); scene3()
    print("done")
