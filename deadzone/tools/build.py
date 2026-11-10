#!/usr/bin/env python3
"""Monta o Deadzone em um único arquivo HTML (Deadzone.html).

Uso:  python3 tools/build.py

- src/game.html ............ código do jogo (HTML + JS)
- src/realism.js ........... personagens realistas, vegetação, iluminação
- src/vendor/*.js .......... three.js r128 + GLTFLoader + SkeletonUtils
- src/assets/* ............. modelos e texturas (embutidos como base64)

O resultado funciona offline (exceto o modo online, que precisa de internet)
e pode ser colocado direto dentro do APK.
"""
import base64, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
OUT = os.environ.get('DZ_OUT') or os.path.join(ROOT, 'Deadzone.html')
MIME = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.glb': 'model/gltf-binary'}


def read(p):
    with open(os.path.join(SRC, p), encoding='utf-8') as f:
        return f.read()


def asset(m):
    name = m.group(1)
    path = os.path.join(SRC, 'assets', name)
    if not os.path.exists(path):
        sys.exit('asset não encontrado: ' + name)
    with open(path, 'rb') as f:
        data = base64.b64encode(f.read()).decode()
    return 'data:%s;base64,%s' % (MIME[os.path.splitext(name)[1].lower()], data)


html = read('game.html')
cdn = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'
if cdn not in html:
    sys.exit('tag do three.js não encontrada em game.html')
libs = ''.join('<script>\n%s\n</script>\n' % read('vendor/' + f).replace('</script', '<\\/script')
               for f in ('three.min.js', 'GLTFLoader.js', 'SkeletonUtils.js'))
if not os.environ.get('DZ_PLAIN'):
    libs += '<script id="dz-realism">\n%s\n</script>' % read('realism.js')
html = html.replace(cdn, libs, 1)
html = re.sub(r'%%ASSET:([A-Za-z0-9_.-]+)%%', asset, html)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(html)
print('ok ->', OUT, '%.1f MB' % (len(html.encode()) / 1e6))
