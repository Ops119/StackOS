import json, subprocess, sys, tempfile, os
jwt=sys.argv[1]; buckets=json.loads(sys.argv[2]); files=json.load(open('deploy/files.json'))
acct="47960c8a220f002fea478874f2909436"
for b in buckets:
    args=["curl","-s","-X","POST",f"https://api.cloudflare.com/client/v4/accounts/{acct}/workers/assets/upload?base64=true","-H",f"Authorization: Bearer {jwt}"]
    tmp=[]
    for h in b:
        fn=os.path.join(tempfile.gettempdir(),h); open(fn,'w').write(files[h]['b64']); args+=["-F",f"{h}=@{fn};filename={h};type={files[h]['ct']}"]
    r=subprocess.run(args,capture_output=True,text=True).stdout
    print(r[:600])
