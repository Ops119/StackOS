import os, hashlib, base64, json, mimetypes, sys
root = "public"
mimetypes.add_type('application/javascript', '.js'); mimetypes.add_type('image/svg+xml', '.svg')
man, files = {}, {}
for d, _, fs in os.walk(root):
    for f in fs:
        p = os.path.join(d, f); rel = '/' + os.path.relpath(p, root)
        c = open(p, 'rb').read(); b = base64.b64encode(c).decode()
        ext = os.path.splitext(f)[1][1:]
        h = hashlib.sha256((b + ext).encode()).hexdigest()[:32]
        man[rel] = {'hash': h, 'size': len(c)}
        files[h] = {'b64': b, 'ct': (mimetypes.guess_type(f)[0] or 'application/octet-stream')}
json.dump(man, open('deploy/manifest.json', 'w')); json.dump(files, open('deploy/files.json', 'w'))
open('deploy/session.js', 'w').write("""async () => {
  const manifest = %s;
  const r = await cloudflare.request({ method: 'POST', path: `/accounts/${accountId}/workers/scripts/stackos/assets-upload-session`, body: { manifest } });
  return { success: r.success, jwt: r.result.jwt, buckets: r.result.buckets, errors: r.errors };
}""" % json.dumps(man))
print(len(man), "assets")
