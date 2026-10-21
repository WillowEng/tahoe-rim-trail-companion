"""Deterministic, offline conversion of the retained OSM and Terrarium snapshots."""
import collections, json, math, pathlib
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT = pathlib.Path(__file__).resolve().parent.parent
source = ROOT / 'data/source'
x = json.loads((source / 'TRT.json').read_text())
ways = {e['id']: e for e in x['elements'] if e['type'] == 'way'}
relation = next(e for e in x['elements'] if e['type'] == 'relation')
remaining = {m['ref']: ways[m['ref']] for m in relation['members'] if m['type'] == 'way'}
ends = collections.defaultdict(list)
for w in remaining.values():
    ends[w['nodes'][0]].append(w['id'])
    ends[w['nodes'][-1]].append(w['id'])
open_ends = [n for n, ws in ends.items() if len(ws) == 1]
assert len(open_ends) == 2, 'Source topology changed; inspect before processing'
node = open_ends[0]
coords = []
while remaining:
    choices = [wid for wid in ends[node] if wid in remaining]
    assert len(choices) == 1, 'Branch or disconnected geometry requires review'
    w = remaining.pop(choices[0])
    forward = w['nodes'][0] == node
    geom = w['geometry'] if forward else list(reversed(w['geometry']))
    points = [[p['lon'], p['lat'], p['z']] for p in geom]
    if coords:
        assert coords[-1][:2] == points[0][:2], 'Never bridge missing geometry'
        points = points[1:]
    coords += points
    node = w['nodes'][-1] if forward else w['nodes'][0]
# Clockwise signed area; the only implicit closing edge is a declared data gap.
area = sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(coords,coords[1:]+coords[:1]))
if area > 0:
    coords.reverse()
gap_pair = (coords[-1][:2], coords[0][:2])
# Mileage origin is the source vertex nearest the sourced Tahoe City town point.
pois = json.loads((source / 'poi-TRT.json').read_text())
town = next(f for f in pois['features'] if f['properties'].get('name') == 'Tahoe City')
tc = town['geometry']['coordinates']
origin = min(range(len(coords)), key=lambda i: (coords[i][0]-tc[0])**2*.6+(coords[i][1]-tc[1])**2)
coords = coords[origin:]+coords[:origin]
gap = next(i for i,p in enumerate(coords) if p[:2] == gap_pair[0])
assert coords[(gap+1)%len(coords)][:2] == gap_pair[1]
route = {'version':'v1','snapshot':'2022-08-29T04:17:38Z','relation':3094865,'coordinates':coords,'gapAfter':[gap], 'orientation':'clockwise'}
(ROOT/'data/route-v1.json').write_text(json.dumps(route,separators=(',',':'))+'\n')
features = []
for f in pois['features']:
    p=f['properties']; category=p['@poi']; kind='water' if category.startswith('water') else 'camp' if category.startswith(('campsite','shelter')) else 'town' if category.startswith('place') else 'landmark'
    if f['geometry']['type']!='Point': continue
    features.append({'id':p['@id'],'name':p.get('name',category.replace('_',' · ')),'type':kind,'coordinates':f['geometry']['coordinates'],'updated':p.get('@timestamp'),'tags':{k:v for k,v in p.items() if not k.startswith('@')}})
(ROOT/'data/waypoints-v1.json').write_text(json.dumps(features,separators=(',',':'))+'\n')
# Render terrain at its native ~60 m/pixel resolution. No invented fill for absent tiles.
terrain=[]
for path in sorted((source/'dem').glob('*/*.png')):
    xt,yt=int(path.parent.name),int(path.stem)
    rgb=np.asarray(Image.open(path).convert('RGB'),dtype=float)
    elev=rgb[:,:,0]*256+rgb[:,:,1]+rgb[:,:,2]/256-32768
    h,w=elev.shape
    dy,dx=np.gradient(elev)
    shade=np.clip(.7+(-dx-dy)*.015,.4,1.05)
    colors=plt.get_cmap('gist_earth')(.32+np.clip((elev-1700)/2000,0,1)*.43)[:,:,:3]
    colors=.5*colors+.5*np.array([.92,.92,.85]); colors=np.clip(colors*shade[:,:,None],0,1)
    fig=plt.figure(figsize=(5.12,5.12),dpi=100);ax=fig.add_axes([0,0,1,1]);ax.imshow(colors,extent=[0,w,h,0]);
    cs=ax.contour(np.arange(w)+.5,np.arange(h)+.5,elev,levels=np.arange(0,4500,100),colors='#726c54',linewidths=.35,alpha=.55)
    ax.clabel(cs,cs.levels[::2],inline=True,fontsize=5,fmt='%d');ax.set(xlim=(0,w),ylim=(h,0));ax.axis('off')
    out=ROOT/f'data/terrain/{xt}-{yt}-v1.png';fig.savefig(out,dpi=100);plt.close(fig)
    n=2048
    def lat(y):return math.degrees(math.atan(math.sinh(math.pi*(1-2*y/n))))
    terrain.append({'file':f'data/terrain/{out.name}','bounds':[[lat(yt+1),xt/n*360-180],[lat(yt),(xt+1)/n*360-180]]})
(ROOT/'data/terrain-v1.json').write_text(json.dumps(terrain,separators=(',',':'))+'\n')
print(f'{len(coords)} route vertices, {len(features)} POIs, {len(terrain)} terrain tiles; gap after vertex {gap}')
