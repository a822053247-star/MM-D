"""Make a shared-palette, no-dither pixel-art atlas below the explicit VFX budget."""
from pathlib import Path
import hashlib
import json
import math
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / 'config/vfx-samples.json').read_text('utf-8'))
POLICY = json.loads((ROOT / 'config/vfx-budget.json').read_text('utf-8'))
OUT = ROOT / 'resources/vfx-ready'
QA = ROOT / 'docs/vfx-compression'
OUT.mkdir(parents=True, exist_ok=True)
QA.mkdir(parents=True, exist_ok=True)


def checker(size):
    im = Image.new('RGBA', size, '#274039')
    draw = ImageDraw.Draw(im)
    for y in range(0, size[1], 16):
        for x in range(0, size[0], 16):
            if (x // 16 + y // 16) % 2:
                draw.rectangle((x, y, x + 15, y + 15), fill='#385248')
    return im


def make_atlas(frames, edge, colors):
    # One scale and one palette for the whole animation prevent frame-to-frame shifts.
    scale = min(1, edge / max(max(im.size) for im in frames))
    images = []
    for im in frames:
        tile = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.Resampling.BOX)
        alpha = tile.getchannel('A').point(lambda a: 0 if a < 16 else min(255, round(a / 32) * 32))
        tile.putalpha(alpha)
        tile.paste((0, 0, 0, 0), mask=alpha.point(lambda a: 255 if a == 0 else 0))
        images.append(tile)
    cw, ch = max(im.width for im in images) + 4, max(im.height for im in images) + 4
    columns = min(range(1, len(images) + 1), key=lambda n: (n * math.ceil(len(images) / n),
                  abs(math.log((n * cw) / (math.ceil(len(images) / n) * ch))), -n))
    atlas = Image.new('RGBA', (columns * cw, math.ceil(len(images) / columns) * ch))
    entries = []
    for i, (original, tile) in enumerate(zip(frames, images)):
        x, y = i % columns * cw + 2, i // columns * ch + 2
        atlas.paste(tile, (x, y))
        atlas.paste(tile.crop((0, 0, tile.width, 1)).resize((tile.width, 2)), (x, y - 2))
        atlas.paste(tile.crop((0, tile.height - 1, tile.width, tile.height)).resize((tile.width, 2)), (x, y + tile.height))
        atlas.paste(tile.crop((0, 0, 1, tile.height)).resize((2, tile.height)), (x - 2, y))
        atlas.paste(tile.crop((tile.width - 1, 0, tile.width, tile.height)).resize((2, tile.height)), (x + tile.width, y))
        entries.append({'rect': [x, y, tile.width, tile.height], 'sourceSize': list(original.size),
                        'trim': [0, 0, original.width, original.height]})
    # Quantize the full atlas once so every frame uses exactly the same RGBA palette.
    indexed = atlas.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    return indexed, entries, scale


def tile(atlas, entry, size):
    x, y, w, h = entry['rect']
    return atlas.convert('RGBA').crop((x, y, x + w, y + h)).resize(size, Image.Resampling.NEAREST)


report = {'policy': POLICY, 'note': 'Pixel-art reauthoring changes resolution/colors/alpha; PNG encoding is lossless only after that transformation.', 'effects': []}
runtime = {}
for effect in CONFIG['effects']:
    source_path = ROOT / effect['source']
    source = Image.open(source_path).convert('RGBA')
    originals = [source.crop((x, y, x + w, y + h)) for x, y, w, h in effect['frames']]
    if effect['id'] == 'flame-sweep':
        path = ROOT / 'resources/first-play/vfx/flame-sweep.png'
        assert path.stat().st_size <= POLICY['maxAtlasBytes']
        report['effects'].append({'id': effect['id'], 'path': str(path.relative_to(ROOT)).replace('\\', '/'),
                                  'sourceBytes': source_path.stat().st_size, 'bytes': path.stat().st_size,
                                  'frames': len(originals), 'preservesOriginalResolutionAndVisiblePixels': True, 'shipped': True})
        continue
    candidates = []
    selected = None
    for edge, colors in [(POLICY['targetFrameEdge'], POLICY['paletteColors']), (128, 64), (128, 32), (96, 64), (96, 32)]:
        indexed, entries, scale = make_atlas(originals, edge, colors)
        path = ROOT / 'resources/vfx-samples' / f"{effect['id']}.pixel-{edge}-{colors}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        indexed.save(path, optimize=True, compress_level=9)
        candidates.append({'edge': edge, 'colors': colors, 'bytes': path.stat().st_size})
        if selected is None and path.stat().st_size <= POLICY['maxAtlasBytes']:
            selected = (path, indexed, entries, scale, edge, colors)
    if selected is None:
        raise ValueError(f"Cannot fit {effect['id']} below {POLICY['maxAtlasBytes']} bytes without an explicit quality decision")
    path, indexed, entries, scale, edge, colors = selected
    destination = OUT / f"{effect['id']}.png"
    destination.write_bytes(path.read_bytes())
    decoded = Image.open(destination).convert('RGBA')
    assert len(entries) == len(originals)
    assert decoded.getchannel('A').getextrema()[0] == 0
    assert decoded.getchannel('A').getextrema()[1] > 0
    record = {'id': effect['id'], 'path': str(destination.relative_to(ROOT)).replace('\\', '/'),
              'source': effect['source'], 'original': effect['original'],
              'sourceSha256': hashlib.sha256(source_path.read_bytes()).hexdigest(),
              'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
              'sourceBytes': source_path.stat().st_size, 'bytes': destination.stat().st_size,
              'width': decoded.width, 'height': decoded.height, 'rgbaBytes': decoded.width * decoded.height * 4,
              'frames': entries, 'frameCount': len(entries), 'durationsMs': effect['durationsMs'], 'timeline': effect['timeline'],
              'scale': scale, 'maxFrameEdge': edge, 'paletteLimit': colors,
              'actualPaletteEntries': len(indexed.getcolors()), 'alphaQuantizationStep': 32, 'dither': False,
              'shipped': bool(effect.get('runtime')), 'status': 'Runtime atlas' if effect.get('runtime') else 'Prepared atlas', 'candidates': candidates}
    if effect.get('runtime'):
        runtime[effect['id']] = {'url': f"vfx/{effect['id']}.png", 'source': record['path'],
            'sha256': record['sha256'], 'bytes': record['bytes'], 'width': decoded.width, 'height': decoded.height,
            'frames': entries, 'durationsMs': effect['durationsMs']}
    report['effects'].append(record)
    (OUT / f"{effect['id']}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), 'utf-8')
    # Every authored frame appears, enlarged with nearest filtering to make the pixel style inspectable.
    sheet = Image.new('RGB', (len(originals) * 160, 196), '#142d27')
    draw = ImageDraw.Draw(sheet)
    animation = []
    for i in range(len(originals)):
        background = checker((160, 160)); background.alpha_composite(tile(decoded, entries[i], (160, 160)))
        sheet.paste(background.convert('RGB'), (i * 160, 30)); draw.text((i * 160 + 8, 10), f"Frame {i + 1}", fill='#fff0c7')
        gif_frame = checker((256, 256)); gif_frame.alpha_composite(tile(decoded, entries[i], (256, 256)))
        animation.append(gif_frame.convert('RGB'))
    sheet.save(QA / f"{effect['id']}-pixel-frames.png", optimize=True)
    animation[0].save(QA / f"{effect['id']}-pixel-preview.gif", save_all=True, append_images=animation[1:], duration=effect['durationsMs'], loop=0, disposal=2)
    size = (320, 320)
    middle = len(originals) // 2
    comparison = Image.new('RGB', (660, 364), '#142d27')
    draw = ImageDraw.Draw(comparison)
    for col, im in enumerate([originals[middle].resize(size, Image.Resampling.NEAREST), tile(decoded, entries[middle], size)]):
        background = checker(size); background.alpha_composite(im)
        comparison.paste(background.convert('RGB'), (col * 330 + 5, 38))
    draw.text((10, 12), 'Original frame', fill='#fff0c7')
    draw.text((340, 12), f"Pixel {edge}px / {colors} colors / atlas {destination.stat().st_size:,} bytes", fill='#fff0c7')
    comparison.save(QA / f"{effect['id']}-pixel-comparison.png", optimize=True)
    print(f"{effect['id']}: {record['bytes']:,} bytes, {len(entries)} frames, edge {edge}, palette {colors}", flush=True)

(QA / 'pixel-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
(ROOT / 'src/pixel-vfx-manifest.ts').write_text('// Generated by scripts/pixel-vfx.py.\nexport const PIXEL_VFX = ' + json.dumps(runtime, indent=2) + ' as const;\n', 'utf-8')
print('All selected VFX atlas PNGs satisfy the 100,000-byte budget.')
