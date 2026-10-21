#!/usr/bin/env python3
"""Bundle the game into one self-contained HTML file (dist/western-front-single.html).
Useful for pasting into a Google Sites "Embed code" box or emailing as one file."""
import os
root = os.path.join(os.path.dirname(__file__), '..')
rd = lambda p: open(os.path.join(root, p), encoding='utf-8').read()
html = rd('index.html')
body = html[html.index('<div id="app">'):html.index('<script src=')]
order = ['config', 'map', 'units', 'years', 'combat', 'ai', 'audio', 'render', 'coach', 'ui', 'main']
js = ''.join(rd('js/%s.js' % n) + '\n' for n in order)
out = f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Western Front</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Oswald:wght@500;700&display=swap">
<style>
{rd('css/style.css')}
</style></head><body>
{body}
<script>
{js}
</script>
</body></html>
'''
os.makedirs(os.path.join(root, 'dist'), exist_ok=True)
open(os.path.join(root, 'dist', 'western-front-single.html'), 'w', encoding='utf-8').write(out)
print(len(out), 'bytes')
