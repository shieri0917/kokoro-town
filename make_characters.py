# -*- coding: utf-8 -*-
"""
こころタウンのキャラクター画像（ghost.png / rabbit.png / cat.png / icon.png）を生成する。

【デザイン方針 v2】
・Kiroのおばけマスコットのような「丸くて素朴、シンプルなフラットデザイン」にする。
・目はキラキラした二重丸（グロッシーハイライト）にせず、シンプルな塗り一色の
  楕円（豆型）にする。輪郭線やハイライトを増やしすぎない。
・耳や輪郭など、尖った三角形は使わず、角を丸めた形（ellipseやrounded_rectangle、
  丸みを帯びたpolygon）で構成する。
・配色はパステル寄りの優しい色にする（おばけは彩度を落とした優しいミント色）。
・輪郭のジャギーを無くすため、実際の4倍サイズで描画してからLANCZOSで縮小する
  スーパーサンプリング方式を採る。

生成物:
  ghost.png  … 丸くてやわらかいミントグリーンのおばけ
  rabbit.png … 白いうさぎ（丸い耳、シンプルな豆型の目）
  cat.png    … 白い猫（丸みのある耳、水色のシンプルな目）
  icon.png   … アプリアイコン（おばけを丸背景に乗せたもの）
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ASSETS_DIR = os.path.dirname(os.path.abspath(__file__))
SS = 4  # スーパーサンプリング倍率

# ---------- 共通カラーパレット（パステル寄りに調整） ----------
COLOR_MINT = (185, 232, 214, 255)       # おばけの体（優しいパステルミント）
COLOR_MINT_DARK = (150, 210, 190, 255)  # おばけの陰
COLOR_WHITE = (255, 255, 255, 255)      # うさぎ・猫の体
COLOR_WHITE_SHADE = (234, 239, 240, 255)  # 体の陰
COLOR_SKYBLUE = (130, 205, 232, 255)    # 猫の目
COLOR_PINK = (252, 208, 216, 255)       # 頬・うさぎの耳の内側
COLOR_DARK = (74, 69, 84, 255)          # 目・口の線


def new_canvas(w, h):
    return Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))


def finalize(img, out_name, final_size):
    resized = img.resize(final_size, Image.LANCZOS)
    out_path = os.path.join(ASSETS_DIR, out_name)
    resized.save(out_path)
    print(f"生成しました: {out_path} ({resized.size[0]}x{resized.size[1]})")


def draw_blush(draw, cx, cy_row, spacing, radius, color):
    draw.ellipse((cx - spacing - radius, cy_row - radius, cx - spacing + radius, cy_row + radius), fill=color)
    draw.ellipse((cx + spacing - radius, cy_row - radius, cx + spacing + radius, cy_row + radius), fill=color)


def draw_simple_eye(draw, cx, cy, half_w, half_h, color):
    """キラキラしない、シンプルな塗り一色の豆型（楕円）の目"""
    draw.ellipse((cx - half_w, cy - half_h, cx + half_w, cy + half_h), fill=color)





def draw_simple_smile(draw, cx, cy, half_w, half_h, width):
    draw.arc((cx - half_w, cy - half_h, cx + half_w, cy + half_h), start=15, end=165, fill=COLOR_DARK, width=width)


# =====================================================================
# おばけ（丸くて素朴、パステルミント）
# =====================================================================
def make_ghost():
    W, H = 200, 210
    img = new_canvas(W, H)
    draw = ImageDraw.Draw(img)
    s = SS
    cx = W * s // 2

    body_half_w = 62 * s
    dome_top = 34 * s
    dome_center_y = dome_top + body_half_w
    body_bottom = 168 * s

    # 丸いドーム部分＋まっすぐな胴＋丸みのある裾（波を少なくして素朴に）
    points = []
    steps = 28
    import math
    for i in range(steps + 1):
        angle = math.pi + (math.pi * i / steps)
        x = cx + body_half_w * math.cos(angle)
        y = dome_center_y + body_half_w * math.sin(angle)
        points.append((x, y))
    # 右側面
    points.append((cx + body_half_w, body_bottom - 14 * s))
    # 裾（大きな丸みだけ3つ、尖らせない）
    wave_w = (body_half_w * 2) / 3
    for i in (2, 1, 0):
        x_right = cx - body_half_w + wave_w * (i + 1)
        x_left = cx - body_half_w + wave_w * i
        x_mid = (x_right + x_left) / 2
        points.append((x_right, body_bottom - 14 * s))
        points.append((x_mid, body_bottom))
        points.append((x_left, body_bottom - 14 * s))

    draw.polygon(points, fill=COLOR_MINT)

    # ふんわりした陰（下半分にごく薄い色を重ねる程度）
    shade = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shade).ellipse(
        (cx - body_half_w, body_bottom - 55 * s, cx + body_half_w, body_bottom + 6 * s),
        fill=(*COLOR_MINT_DARK[:3], 70),
    )
    shade = shade.filter(ImageFilter.GaussianBlur(9 * s))
    img.alpha_composite(shade)
    clip_mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(clip_mask).polygon(points, fill=255)
    img = Image.composite(img, Image.new("RGBA", img.size, (0, 0, 0, 0)), clip_mask)
    draw = ImageDraw.Draw(img)

    # ほっぺ
    draw_blush(draw, cx, 112 * s, 38 * s, 9 * s, (*COLOR_PINK[:3], 150))

    # 目（シンプルな豆型、キラキラなし）
    eye_gap = 22 * s
    eye_y = 92 * s
    draw_simple_eye(draw, cx - eye_gap, eye_y, 7 * s, 9 * s, COLOR_DARK)
    draw_simple_eye(draw, cx + eye_gap, eye_y, 7 * s, 9 * s, COLOR_DARK)

    # 口（小さなシンプルな笑み）
    draw_simple_smile(draw, cx, 112 * s, 9 * s, 8 * s, int(2.2 * s))

    # 手（プニっとした小さな丸）
    hand_r = 11 * s
    draw.ellipse((cx - body_half_w - hand_r + 8 * s, 126 * s, cx - body_half_w + hand_r + 8 * s, 126 * s + hand_r * 2), fill=COLOR_MINT)
    draw.ellipse((cx + body_half_w - hand_r - 8 * s, 126 * s, cx + body_half_w + hand_r - 8 * s, 126 * s + hand_r * 2), fill=COLOR_MINT)

    finalize(img, "ghost.png", (200, 210))


# =====================================================================
# うさぎ（白、丸い耳、シンプルな目）
# =====================================================================
def make_rabbit():
    W, H = 200, 250
    img = new_canvas(W, H)
    draw = ImageDraw.Draw(img)
    s = SS
    cx = W * s // 2

    # 耳を先に描く（縦長の楕円。耳の付け根の中心を頭の輪郭線のすぐ内側に
    # 置くことで、頭との接続部にすき間ができないようにする。仕上げに頭を
    # 上から重ね塗りして、耳の根元のはみ出しをきれいに隠す）
    head_r = 56 * s
    head_cy = 118 * s
    ear_len = 74 * s
    ear_w = 26 * s

    import math as _math
    theta = _math.radians(30)  # 頭の中心から見た耳の付け根の角度（垂直から30度）
    attach_x_offset = head_r * _math.sin(theta)
    attach_y = head_cy - head_r * _math.cos(theta)
    ear_bottom_y = attach_y + 10 * s  # 頭の内側へ少し食い込ませる
    ear_top_y = ear_bottom_y - ear_len

    for side in (-1, 1):
        ex = cx + side * attach_x_offset
        draw.ellipse((ex - ear_w / 2, ear_top_y, ex + ear_w / 2, ear_bottom_y), fill=COLOR_WHITE)
        inner_w = ear_w * 0.5
        draw.ellipse(
            (ex - inner_w / 2, ear_top_y + 10 * s, ex + inner_w / 2, ear_bottom_y - 8 * s),
            fill=COLOR_PINK,
        )

    # 頭を耳の根本の上に重ねて描く（頭の丸い輪郭で耳の付け根を自然に切る）
    draw.ellipse((cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r), fill=COLOR_WHITE)

    # 体
    body_top = head_cy + head_r - 18 * s
    draw.ellipse((cx - head_r * 0.95, body_top, cx + head_r * 0.95, body_top + 86 * s), fill=COLOR_WHITE)

    # 陰影
    shade = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shade).ellipse((cx - head_r, head_cy, cx + head_r, body_top + 86 * s), fill=(*COLOR_WHITE_SHADE[:3], 70))
    shade = shade.filter(ImageFilter.GaussianBlur(8 * s))
    img.alpha_composite(shade)
    draw = ImageDraw.Draw(img)

    # ほっぺ
    draw_blush(draw, cx, head_cy + 18 * s, 34 * s, 9 * s, (*COLOR_PINK[:3], 160))

    # 目（シンプルな豆型）
    eye_gap = 19 * s
    eye_y = head_cy - 2 * s
    draw_simple_eye(draw, cx - eye_gap, eye_y, 6 * s, 8 * s, COLOR_DARK)
    draw_simple_eye(draw, cx + eye_gap, eye_y, 6 * s, 8 * s, COLOR_DARK)

    # 鼻・口（口はおばけと同じ、シンプルな一本の笑み弧にする）
    draw.ellipse((cx - 3 * s, head_cy + 9 * s, cx + 3 * s, head_cy + 14 * s), fill=(*COLOR_PINK[:3], 255))
    draw_simple_smile(draw, cx, head_cy + 22 * s, 9 * s, 8 * s, int(2.2 * s))

    # 前足
    paw_r = 13 * s
    paw_y = body_top + 66 * s
    draw.ellipse((cx - 30 * s - paw_r, paw_y, cx - 30 * s + paw_r, paw_y + paw_r * 1.6), fill=COLOR_WHITE)
    draw.ellipse((cx + 30 * s - paw_r, paw_y, cx + 30 * s + paw_r, paw_y + paw_r * 1.6), fill=COLOR_WHITE)

    finalize(img, "rabbit.png", (200, 250))


# =====================================================================
# 猫（白、丸みのある耳、シンプルな水色の目）
# =====================================================================
def make_cat():
    W, H = 200, 235
    img = new_canvas(W, H)
    draw = ImageDraw.Draw(img)
    s = SS
    cx = W * s // 2

    head_r = 60 * s
    head_cy = 104 * s

    # 耳（丸い円形。耳の中心を頭の輪郭線のすぐ内側に置くことで、頭との
    # 接続部にすき間ができないようにする）
    import math as _math
    ear_r = 26 * s
    theta = _math.radians(42)  # 頭の中心から見た耳の中心の角度（垂直から42度）
    ear_dist = head_r * 0.72  # 頭の中心から耳の中心までの距離（頭の内側寄り）
    for side in (-1, 1):
        ex = cx + side * ear_dist * _math.sin(theta)
        ey = head_cy - ear_dist * _math.cos(theta) - ear_r * 0.5
        draw.ellipse((ex - ear_r, ey - ear_r, ex + ear_r, ey + ear_r), fill=COLOR_WHITE)
        inner_r = ear_r * 0.5
        iy = ey + ear_r * 0.15
        draw.ellipse((ex - inner_r, iy - inner_r, ex + inner_r, iy + inner_r), fill=COLOR_PINK)

    # 頭を耳の根本の上に重ねて描く
    draw.ellipse((cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r), fill=COLOR_WHITE)

    # 体
    body_top = head_cy + head_r - 20 * s
    draw.ellipse((cx - head_r * 0.92, body_top, cx + head_r * 0.92, body_top + 82 * s), fill=COLOR_WHITE)

    # 陰影
    shade = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shade).ellipse((cx - head_r, head_cy, cx + head_r, body_top + 82 * s), fill=(*COLOR_WHITE_SHADE[:3], 70))
    shade = shade.filter(ImageFilter.GaussianBlur(8 * s))
    img.alpha_composite(shade)
    draw = ImageDraw.Draw(img)

    # ほっぺ
    draw_blush(draw, cx, head_cy + 16 * s, 36 * s, 9 * s, (*COLOR_PINK[:3], 150))

    # 目（水色の豆型を「ふち」だけ見える程度に残し、黒目を大きめにする。
    # ハイライトは付けず、自然な感じに留める）
    eye_gap = 21 * s
    eye_y = head_cy - 2 * s
    pupil_half_w = int(7 * s)
    pupil_half_h = int(8 * s)
    for ex in (cx - eye_gap, cx + eye_gap):
        draw_simple_eye(draw, ex, eye_y, 9 * s, 10 * s, COLOR_SKYBLUE)
        draw.ellipse(
            (ex - pupil_half_w, eye_y - pupil_half_h, ex + pupil_half_w, eye_y + pupil_half_h),
            fill=COLOR_DARK,
        )

    # 鼻・口（口はおばけ・うさぎと同じ、シンプルな一本の笑み弧にする）
    draw.polygon(
        [(cx - 3 * s, head_cy + 9 * s), (cx + 3 * s, head_cy + 9 * s), (cx, head_cy + 14 * s)],
        fill=(*COLOR_PINK[:3], 255),
    )
    draw_simple_smile(draw, cx, head_cy + 22 * s, 9 * s, 8 * s, int(2.2 * s))

    # ひげ（細く、控えめに）
    for wy in (head_cy + 5 * s, head_cy + 13 * s):
        draw.line((cx - 28 * s, wy, cx - 58 * s, wy - 3 * s), fill=(*COLOR_DARK[:3], 150), width=int(1.2 * s))
        draw.line((cx + 28 * s, wy, cx + 58 * s, wy - 3 * s), fill=(*COLOR_DARK[:3], 150), width=int(1.2 * s))

    # 前足
    paw_r = 13 * s
    paw_y = body_top + 62 * s
    draw.ellipse((cx - 28 * s - paw_r, paw_y, cx - 28 * s + paw_r, paw_y + paw_r * 1.6), fill=COLOR_WHITE)
    draw.ellipse((cx + 28 * s - paw_r, paw_y, cx + 28 * s + paw_r, paw_y + paw_r * 1.6), fill=COLOR_WHITE)

    finalize(img, "cat.png", (200, 235))


# =====================================================================
# アプリアイコン
# =====================================================================
def make_icon():
    W = H = 200
    img = new_canvas(W, H)
    draw = ImageDraw.Draw(img)
    s = SS
    draw.ellipse((0, 0, W * s, H * s), fill=(185, 232, 214, 255))

    ghost_path = os.path.join(ASSETS_DIR, "ghost.png")
    ghost = Image.open(ghost_path).convert("RGBA")
    scale = (W * s * 0.62) / ghost.width
    ghost_big = ghost.resize((int(ghost.width * scale), int(ghost.height * scale)), Image.LANCZOS)
    px = (W * s - ghost_big.width) // 2
    py = int(H * s * 0.24)
    img.alpha_composite(ghost_big, (px, py))

    finalize(img, "icon.png", (512, 512))


if __name__ == "__main__":
    make_ghost()
    make_rabbit()
    make_cat()
    make_icon()
