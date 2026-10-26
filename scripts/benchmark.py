import json,time,gzip
from pathlib import Path
import places
source_files=sorted(places.PLACES.glob('*/*.json'))
source=b''.join(p.read_bytes() for p in source_files)
t=time.perf_counter(); parsed=sum(1 for p in source_files if isinstance(json.loads(p.read_text()),dict)); old_parse=time.perf_counter()-t
places.build(); data=(places.GENERATED/'kattankudy.mzp').read_bytes()
t=time.perf_counter(); geo=json.loads(data); new_parse=time.perf_counter()-t
print(json.dumps({'individual_json_files':len(source_files),'individual_json_bytes':len(source),'individual_json_gzip_bytes':len(gzip.compress(source)),'individual_json_parse_seconds':old_parse,'mzp_bytes':len(data),'mzp_gzip_bytes':len(gzip.compress(data)),'mzp_parse_seconds':new_parse,'individual_records':parsed,'mzp_features':len(geo['features'])},indent=2))
