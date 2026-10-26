import json,time,gzip
from pathlib import Path
import places
source=b''.join(p.read_bytes() for p in places.SOURCE_FILES)
def items(d): return d if isinstance(d,list) else d.get('results',[])
t=time.perf_counter(); parsed=sum(len(items(json.loads(p.read_text()))) for p in places.SOURCE_FILES); old_parse=time.perf_counter()-t
places.build(); data=(places.GENERATED/'kattankudy.mzp').read_bytes()
t=time.perf_counter(); geo=json.loads(data); new_parse=time.perf_counter()-t
print(json.dumps({'source_json_bytes':len(source),'source_gzip_bytes':len(gzip.compress(source)),'mzp_bytes':len(data),'mzp_gzip_bytes':len(gzip.compress(data)),'source_parse_seconds':old_parse,'mzp_parse_seconds':new_parse,'source_records':parsed,'mzp_features':len(geo['features'])},indent=2))
