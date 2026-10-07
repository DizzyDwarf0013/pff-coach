#!/usr/bin/env python3
"""Build a single self-contained HTML page of the app (for the claude.ai preview).
The real app is the app/ folder; this is only for trying it out in a browser tab."""
import base64, pathlib, re, subprocess, tempfile

root = pathlib.Path(__file__).parent
app = root / 'app'
tmp = pathlib.Path(tempfile.mkdtemp())
bundle = tmp / 'bundle.js'
subprocess.run(['tsc', '-p', str(root), '--module', 'amd', '--moduleResolution', 'node10', '--outFile', str(bundle), '--outDir', str(tmp / 'x'), '--ignoreDeprecations', '6.0'], check=True)
js = bundle.read_text()

def data_uri(path, mime):
    return f'data:{mime};base64,' + base64.b64encode((app / path).read_bytes()).decode()

js = js.replace('assets/logo-full.jpg', data_uri('assets/logo-full.jpg', 'image/jpeg'))

# Tiny AMD loader: enough for the modules tsc emits (relative deps with .js extensions).
loader = r"""
(function(){
  var defs = {}, cache = {};
  function norm(base, dep){
    if (dep === 'require' || dep === 'exports') return dep;
    dep = dep.replace(/\.js$/, '');
    if (dep.charAt(0) !== '.') return dep;
    var parts = base.split('/'); parts.pop();
    dep.split('/').forEach(function(p){ if (p === '..') parts.pop(); else if (p !== '.') parts.push(p); });
    return parts.join('/');
  }
  window.define = function(name, deps, factory){ defs[name] = { deps: deps, factory: factory }; };
  window.__req = function req(name){
    if (cache[name]) return cache[name];
    var d = defs[name]; if (!d) throw new Error('missing module ' + name);
    var exports = {}; cache[name] = exports;
    var args = d.deps.map(function(dep){ var n = norm(name, dep); return n === 'exports' ? exports : n === 'require' ? req : req(n); });
    d.factory.apply(null, args);
    return exports;
  };
})();
"""

css = (app / 'styles.css').read_text()
html = (app / 'index.html').read_text()
body = re.search(r'<body>(.*?)<script', html, re.S).group(1)
body = body.replace('src="assets/mark.png"', f'src="{data_uri("assets/mark.png", "image/png")}"')
fonts = re.search(r'<link rel="stylesheet" href="(https://fonts[^"]+)">', html).group(1)

page = f"""<title>PFF Coach</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{fonts}">
<style>
{css}
</style>
{body}
<script>window.__PFF_PREVIEW__ = true;</script>
<script>{loader}
{js}
window.__req('main');
</script>
"""
out = root / 'preview' / 'pff-coach.html'
out.parent.mkdir(exist_ok=True)
out.write_text(page)
print('preview', out, round(len(page) / 1024), 'KB')
