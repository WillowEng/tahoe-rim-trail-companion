"""Derive local shaded-relief tiles from the retained Terrarium DEM; no new elevations."""
import json,math,pathlib
import numpy as np
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parent.parent
terrain=[]
for p in sorted((ROOT/'data/source/dem').glob('*/*.png')):
 x,y=int(p.parent.name),int(p.stem)
 rgb=np.asarray(Image.open(p).convert('RGB'),dtype=float)
 elev=rgb[:,:,0]*256+rgb[:,:,1]+rgb[:,:,2]/256-32768
 dy,dx=np.gradient(elev)
 shade=np.clip(.76+(-dx-dy)*.018,.25,1.05)
 tint=np.clip((elev-1400)/2000,0,1)[:,:,None]
 colors=(np.array([.74,.81,.67])*(1-tint)+np.array([.91,.89,.82])*tint)*shade[:,:,None]
 out=ROOT/f'data/terrain/{x}-{y}-relief-v2.png'
 Image.fromarray((np.clip(colors,0,1)*255).astype('uint8')).save(out,optimize=True)
 def lat(a):return math.degrees(math.atan(math.sinh(math.pi*(1-2*a/2048))))
 terrain.append({'file':f'data/terrain/{out.name}','bounds':[[lat(y+1),x/2048*360-180],[lat(y),(x+1)/2048*360-180]]})
(ROOT/'data/relief-v2.json').write_text(json.dumps(terrain,separators=(',',':'))+'\n')
print(len(terrain),'local relief tiles; source resolution unchanged')
