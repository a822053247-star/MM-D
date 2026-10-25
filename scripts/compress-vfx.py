"""Reproducible VFX encoding samples. Originals, frame order and alpha stay explicit.
Normal game builds consume committed output and do not require Python or Pillow.
"""
from pathlib import Path
import hashlib
import json
import math
import shutil
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / 'config/vfx-samples.json').read_text('utf-8'))
OUTPUT = ROOT / 'resources/vfx-samples'
QA = ROOT / 'docs/vfx-compression'
OUTPUT.mkdir(parents=True, exist_ok=True)
QA.mkdir(parents=True, exist_ok=True)
MIB = 1048576


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_atlas(frames, scale):
    """Pack independent trimmed frames with a two-pixel replicated edge gutter."""
    entries, prepared = [], []
    for image, trim, source_size in frames:
        resized = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.NEAREST)
        prepared.append(resized)
        entries.append({'sourceSize': list(source_size), 'trim': list(trim)})
    cell_w = max(im.width for im in prepared) + 4
    cell_h = max(im.height for im in prepared) + 4
    choices = [n for n in range(1, len(prepared) + 1)
               if n * cell_w <= 2048 and math.ceil(len(prepared) / n) * cell_h <= 2048]
    if not choices:
        raise ValueError('Split this effect into multiple atlases before exceeding 2048 pixels')
    columns = min(choices, key=lambda n: (n * math.ceil(len(prepared) / n),
                  abs(math.log((n * cell_w) / (math.ceil(len(prepared) / n) * cell_h))), -n))
    atlas = Image.new('RGBA', (columns * cell_w, math.ceil(len(prepared) / columns) * cell_h))
    for i, image in enumerate(prepared):
        x, y = i % columns * cell_w + 2, i // columns * cell_h + 2
        atlas.paste(image, (x, y))
        # Extrusion avoids sampling adjacent frames without changing frame coordinates.
        atlas.paste(image.crop((0, 0, image.width, 1)).resize((image.width, 2)), (x, y - 2))
        atlas.paste(image.crop((0, image.height - 1, image.width, image.height)).resize((image.width, 2)), (x, y + image.height))
        atlas.paste(image.crop((0, 0, 1, image.height)).resize((2, image.height)), (x - 2, y))
        atlas.paste(image.crop((image.width - 1, 0, image.width, image.height)).resize((2, image.height)), (x + image.width, y))
        entries[i]['rect'] = [x, y, image.width, image.height]
    return atlas, entries


def metrics(reference, decoded):
    alpha = reference.getchannel('A')
    mask = alpha.point(lambda a: 255 if a else 0)
    difference = ImageChops.difference(reference.convert('RGB'), decoded.convert('RGB'))
    error = sum(ImageStat.Stat(difference, mask).mean) / 3
    return {'visibleRgbMAE': round(error, 4), 'alphaExact': alpha.tobytes() == decoded.getchannel('A').tobytes()}


def checker(width, height):
    im = Image.new('RGBA', (width, height), '#274039')
    draw = ImageDraw.Draw(im)
    for y in range(0, height, 16):
        for x in range(0, width, 16):
            if (x // 16 + y // 16) % 2:
                draw.rectangle((x, y, x + 15, y + 15), fill='#385248')
    return im


def restore(atlas, entry, size):
    x, y, w, h = entry['rect']
    tx, ty, tw, th = entry['trim']
    original = Image.new('RGBA', entry['sourceSize'])
    tile = atlas.crop((x, y, x + w, y + h)).resize((tw, th), Image.Resampling.NEAREST)
    original.paste(tile, (tx, ty))
    return original.resize(size, Image.Resampling.NEAREST)


report = {'unit': 'bytes; rgbaBytes excludes mipmaps, decoded copies and engine overhead', 'effects': []}
runtime = {}
for effect in CONFIG['effects']:
    source_path = ROOT / effect['source']
    source = Image.open(source_path).convert('RGBA')
    frames, original_frames = [], []
    for x, y, w, h in effect['frames']:
        assert x >= 0 and y >= 0 and x + w <= source.width and y + h <= source.height
        frame = source.crop((x, y, x + w, y + h))
        original_frames.append(frame)
        bbox = frame.getchannel('A').getbbox() if effect['trim'] else (0, 0, w, h)
        bbox = bbox or (0, 0, w, h)
        left, top, right, bottom = bbox
        frames.append((frame.crop(bbox), (left, top, right - left, bottom - top), (w, h)))
    record = {'id': effect['id'], 'source': effect['source'], 'original': effect['original'], 'sourceSha256': sha(source_path),
              'sourceBytes': source_path.stat().st_size, 'sourceDimensions': list(source.size), 'sourceRgbaBytes': source.width * source.height * 4,
              'frameCount': len(frames), 'durationsMs': effect['durationsMs'], 'timeline': effect['timeline'], 'variants': {}}
    decoded_variants = {}
    for label, scale, fmt, options in [
        ('lossless-png', 1, 'PNG', {'optimize': True, 'compress_level': 9}),
        ('lossless-webp', 1, 'WEBP', {'lossless': True, 'quality': 75, 'method': 3, 'exact': True}),
        ('compact-png', effect['compactScale'], 'PNG', {'optimize': True, 'compress_level': 9}),
        ('compact-webp', effect['compactScale'], 'WEBP', {'lossless': True, 'quality': 75, 'method': 3, 'exact': True}),
        ('compact-webp-q90', effect['compactScale'], 'WEBP', {'lossless': False, 'quality': 90, 'method': 0}),
    ]:
        atlas, entries = make_atlas(frames, scale)
        path = OUTPUT / f"{effect['id']}.{label}.{'png' if fmt == 'PNG' else 'webp'}"
        atlas.save(path, fmt, **options)
        decoded = Image.open(path).convert('RGBA')
        quality = metrics(atlas, decoded)
        if label == 'lossless-png':
            # Exact visible RGBA round-trip for every authored frame, including trim/pivot reconstruction.
            for i, ref in enumerate(original_frames):
                reconstructed = restore(decoded, entries[i], ref.size)
                assert reconstructed.getchannel('A').tobytes() == ref.getchannel('A').tobytes()
                assert metrics(ref, reconstructed)['visibleRgbMAE'] == 0
        metadata = {'path': str(path.relative_to(ROOT)).replace('\\', '/'), 'bytes': path.stat().st_size,
                    'width': atlas.width, 'height': atlas.height, 'rgbaBytes': atlas.width * atlas.height * 4,
                    'scale': scale, 'frames': entries, **quality, 'sha256': sha(path)}
        record['variants'][label] = metadata
        decoded_variants[label] = (decoded, entries)
        (OUTPUT / f"{effect['id']}.{label}.json").write_text(json.dumps(metadata, indent=2), 'utf-8')
    report['effects'].append(record)
    # Comparison is image processing QA, not an engine/simulator test.
    frame_index = len(frames) // 2
    preview_size = (240, 240)
    labels = ['Original frame', 'lossless-png', 'compact-png', 'compact-webp-q90']
    contact = Image.new('RGB', (1000, 306), '#142d27')
    draw = ImageDraw.Draw(contact)
    for col, label in enumerate(labels):
        reference = original_frames[frame_index].resize(preview_size, Image.Resampling.NEAREST) if col == 0 else restore(decoded_variants[label][0], decoded_variants[label][1][frame_index], preview_size)
        background = checker(*preview_size); background.alpha_composite(reference)
        contact.paste(background.convert('RGB'), (col * 250 + 5, 46))
        draw.text((col * 250 + 8, 8), label, fill='#fff0c7')
        value = record['sourceBytes'] if col == 0 else record['variants'][label]['bytes']
        draw.text((col * 250 + 8, 25), f"atlas {value / 1024:.1f} KiB", fill='#b9d6be')
    contact.save(QA / f"{effect['id']}-comparison.png", optimize=True)
    # Preserve full animation order; dream timing here is explicitly illustrative only.
    animation = []
    atlas, entries = decoded_variants['compact-png']
    for i in range(len(frames)):
        background = checker(256, 256); background.alpha_composite(restore(atlas, entries[i], (256, 256)))
        animation.append(background.convert('RGB'))
    animation[0].save(QA / f"{effect['id']}-preview.gif", save_all=True, append_images=animation[1:], duration=effect['durationsMs'], loop=0, disposal=2)
    if effect['ship']:
        selected = record['variants'][effect['ship']]
        destination = ROOT / 'resources/first-play/vfx' / f"{effect['id']}.png"
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / selected['path'], destination)
        runtime[effect['id']] = {'url': f"vfx/{effect['id']}.png", 'width': selected['width'], 'height': selected['height'],
                                 'frames': selected['frames'], 'durationsMs': effect['durationsMs'], 'sha256': selected['sha256']}

(QA / 'report.json').write_text(json.dumps(report, indent=2), 'utf-8')
(ROOT / 'src/vfx-atlas-manifest.ts').write_text('// Generated by scripts/compress-vfx.py. Only explicitly shipped effects.\nexport const VFX_ATLASES = ' + json.dumps(runtime, indent=2) + ' as const;\n', 'utf-8')
rows = []
for effect in report['effects']:
    row = [effect['id'], f"{effect['sourceBytes']/1024:.1f}", f"{effect['variants']['lossless-png']['bytes']/1024:.1f}", f"{effect['variants']['compact-png']['bytes']/1024:.1f}", f"{effect['variants']['compact-webp']['bytes']/1024:.1f}"]
    rows.append('| ' + ' | '.join(row) + ' |')
(QA / 'README.md').write_text('''# 特效压缩样板

最新推荐见[每份特效图集小于100 KB的像素版本](PIXEL_BUDGET.md)。以下保留常规编码样板作对照。

原始素材保存在`art-source/vfx/`，不会进入发布包。使用`python scripts/compress-vfx.py`重建，依赖Pillow（本机10.3.0，含WebP）；普通构建无需Python。

| 特效 | 原图KiB | 全尺寸无损PNG | 紧凑PNG | 紧凑无损WebP |
|---|---:|---:|---:|---:|
''' + '\n'.join(rows) + '''

火焰只抽取实际使用的12/13/14帧，保持128×128、帧数、透明度和25/45/160ms视觉节奏。冰环保留6帧，梦系保留8帧，紧凑版本将宽高各减半；它们属于待人工确认的画质候选，未开放对应技能。

每帧记录源尺寸、裁边偏移、图集位置和边缘外扩。全尺寸无损PNG逐帧重建检查透明度和可见RGB均一致。紧凑版本损失分辨率，WebP Q90还会改变颜色；报告中的MAE仅衡量编码相对同尺寸样板的误差，不代表相对原图或玩家主观评价。

当前发布使用火焰无损PNG及`pixel-vfx-manifest.ts`中明确启用的像素PNG；其余候选、GIF、对比图与原图均不进入部署包。未运行浏览器、模拟器或真机测试，WebP仅输出候选；尚未接入ASTC/ETC2。

`report.json`保存精确字节数、哈希、图集尺寸和RGBA估算。RGBA估算不含mipmap与解码副本，PNG/WebP文件压小不等于显存同比例下降。GIF用于观察帧序，梦系实际播放仍依据cast.duration归一化时间。
''', 'utf-8')
print('VFX samples ready: 3 effects, 15 encodings; flame PNG selected for runtime')
for effect in report['effects']:
    print(effect['id'], 'source KiB', round(effect['sourceBytes']/1024, 1), 'full PNG KiB', round(effect['variants']['lossless-png']['bytes']/1024, 1), 'compact WebP KiB', round(effect['variants']['compact-webp']['bytes']/1024, 1))
