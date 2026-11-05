#!/usr/bin/env python3
"""Package a production build as an artifact page: the HTML fragment (no doctype/html/head/body)
plus a files map of every asset. Usage: python3 tools/artifact.py <dist_dir> <out_dir>
Prints the files map JSON (published path -> local path)."""
import json, os, re, shutil, sys

dist, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
html = open(os.path.join(dist, 'index.html')).read()
# keep title, styles, body content and the module script; drop the document skeleton
title = re.search(r'<title>.*?</title>', html, re.S).group(0)
styles = ''.join(re.findall(r'<style>.*?</style>', html, re.S)).replace('<style>', '<style>:root{color-scheme:dark}', 1)
links = ''.join(re.findall(r'<link rel="modulepreload"[^>]*>', html))
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
scripts = ''.join(re.findall(r'<script type="module"[^>]*></script>', html))
body = re.sub(r'<script type="module"[^>]*></script>', '', body)
frag = title + '\n' + styles + '\n' + links + body.strip() + '\n' + scripts + '\n'
open(os.path.join(out, 'mantis-mayhem.html'), 'w').write(frag)
files = {}
for sub in ('assets', 'fonts'):
    src = os.path.join(dist, sub)
    if not os.path.isdir(src):
        continue
    dst = os.path.join(out, sub)
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    for f in sorted(os.listdir(dst)):
        files[f'{sub}/{f}'] = os.path.join(dst, f)
print(json.dumps(files))
