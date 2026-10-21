"""Convert retained OSM boundary ways to polygons without snapping or filling gaps.

Requires Shapely 2.x for polygonization/validation, only when regenerating data.
Each source part is consumed; dangling edges, cuts and invalid rings fail.
"""
import collections,hashlib,json,pathlib,xml.etree.ElementTree as ET
from shapely.geometry import LineString,Polygon,MultiPolygon,mapping
from shapely.ops import polygonize_full
ROOT=pathlib.Path(__file__).resolve().parent.parent
SRC=ROOT/'data/source/boundaries-v2'
VERIFIED='2026-10-20'
SOURCES=[('ltbmu',972002,'federal','Federal management footprint','United States Forest Service','https://www.fs.usda.gov/r05/laketahoebasin'),('desolation',6196636,'wilderness','Designated wilderness','US Forest Service — Eldorado National Forest / LTBMU','https://tahoerimtrail.org/permits-and-regulations/'),('mount-rose',5988616,'wilderness','Designated wilderness','United States Forest Service','https://www.fs.usda.gov/r04/humboldt-toiyabe'),('granite-chief',6196739,'wilderness','Designated wilderness','United States Forest Service — Tahoe National Forest','https://www.fs.usda.gov/r05/tahoe'),('spooner',6520253,'state','State park','Nevada State Parks','https://parks.nv.gov/parks/spooner-lake')]
features=[]; manifests=[]

def rings(root,relation,role,nodes):
 ways={w.attrib['id']:[n.attrib['ref'] for n in w.findall('nd')] for w in root.findall('way')}
 lines=[]
 for member in relation.findall('member'):
  if member.attrib['role']!=role:continue
  assert member.attrib['type']=='way','Nested boundary relations require separate review'
  ns=ways[member.attrib['ref']]
  lines.append(LineString([nodes[n] for n in ns]))
 if not lines:return []
 polygons,cuts,dangles,invalid=polygonize_full(lines)
 assert cuts.is_empty and dangles.is_empty and invalid.is_empty, f'{role}: source has open/cut/invalid geometry; no repair attempted'
 return list(polygons.geoms)

for slug,ref,layer,classification,agency,website in SOURCES:
 path=SRC/f'{slug}-osm.xml';raw=path.read_bytes();root=ET.fromstring(raw)
 relation=next(r for r in root.findall('relation') if r.attrib['id']==str(ref))
 tags={t.attrib['k']:t.attrib['v'] for t in relation.findall('tag')}
 nodes={n.attrib['id']:(float(n.attrib['lon']),float(n.attrib['lat'])) for n in root.findall('node')}
 outer=rings(root,relation,'outer',nodes);inner=rings(root,relation,'inner',nodes)
 assigned=collections.defaultdict(list)
 for hole in inner:
  parents=[i for i,shell in enumerate(outer) if shell.covers(hole)]
  assert len(parents)==1,'Ambiguous hole assignment; no repair attempted'
  assigned[parents[0]].append(list(hole.exterior.coords))
 parts=[Polygon(list(shell.exterior.coords),[list(h.coords) for h in shell.interiors]+assigned[i]) for i,shell in enumerate(outer)]
 geometry=parts[0] if len(parts)==1 else MultiPolygon(parts)
 assert geometry.is_valid and not geometry.is_empty, f'{slug}: invalid source geometry; no repair attempted'
 # Polygonization and hole assignment may reorder vertices, but must never invent one.
 source_coordinates=set(nodes.values())
 assert all(tuple(c) in source_coordinates for p in parts for ring in [p.exterior,*p.interiors] for c in ring.coords)
 props={'name':tags['name'],'layer':layer,'classification':classification,'agency':agency,'campingClass':'Unknown / unverified','regulations':'This geographic designation does not establish camping permission. Check applicable area rules, notices, setbacks and private inholdings.','permit':'Not inferred from public ownership or wilderness designation.','limits':'Community-mapped OSM boundary; not an agency-validated cadastral survey. No site suitability or access guarantee. Unshaded areas also remain unverified.','source':f'https://www.openstreetmap.org/relation/{ref}','officialWebsite':website,'datasetDate':relation.attrib['timestamp'][:10],'verified':VERIFIED,'geometrySource':'OpenStreetMap relation '+str(ref),'relationVersion':int(relation.attrib['version']),'license':'ODbL 1.0 — © OpenStreetMap contributors'}
 if slug=='desolation':
  props['regulations']='Desolation Wilderness requires day-use and overnight permits. See the separate broad permit applicability layer and official rules.'
  props['permit']='Obtain the appropriate Desolation permit; individual quota zones are not mapped here.'
 if slug=='spooner':
  props['regulations']='Camping is restricted to designated facilities; dispersed camping is prohibited throughout the park. Check current closures.'
  props['permit']='Confirm applicable camping/cabin arrangements with Nevada State Parks.'
 geometry_json=mapping(geometry)
 def add(p,identifier):features.append({'type':'Feature','id':identifier,'properties':p,'geometry':geometry_json})
 add(props,slug)
 if slug=='ltbmu':
  add({**props,'name':tags['name']+' — camping status unverified','layer':'camp-unknown','classification':'Management footprint with unknown camping permission'},slug+'-unknown')
 if slug=='desolation':
  add({**props,'name':'Desolation Wilderness — broad permit applicability','layer':'camp-permit','classification':'Broad wilderness permit applicability area; not individual quota zones','campingClass':'Permit required','regulations':'Desolation Wilderness requires a permit for day visits and overnight stays. Obtain the appropriate permit before entry; permit conditions and area restrictions apply.','permit':'Day-use permit and overnight permit systems differ. The 2026 TRT thru-hike permit uses a dedicated quota category. See the official booking source.','limits':'Uses the sourced community wilderness boundary only. Individual overnight quota-zone boundaries, trail/water setbacks and designated-site restrictions are NOT mapped. This area does not identify suitable or legal tent sites.'},slug+'-permit')
 if slug=='spooner':
  add({**props,'name':'Spooner Lake & Backcountry — designated camping only','layer':'camp-restricted','classification':'Park-wide camping restriction applicability','campingClass':'Restricted — dispersed camping prohibited','regulations':'Camp only at the park’s designated camping facilities; dispersed camping is prohibited throughout the park. Check current closures with Nevada State Parks.','permit':'Confirm applicable campsite or cabin arrangements with the park; no booking availability is implied.','limits':'This is a broad park boundary, not mapped campsite footprints. Designated camping is an exception to the dispersed-camping prohibition. No campsite setbacks or precise no-camping exclusion polygons are generated.'},slug+'-restricted')
 manifests.append({'file':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'downloadUrl':f'https://www.openstreetmap.org/api/0.6/relation/{ref}/full','sourceRelation':relation.attrib,'sourceTags':tags,'outerParts':len(outer),'innerParts':len(inner),'sourceNodes':len(nodes),'bounds':geometry.bounds})
unavailable={'other':'No other public-land/ownership dataset retained. PAD-US, BLM and county coverage remain incomplete.','camp-potential':'No authoritative dispersed-camping permission footprint retained. No public land has been automatically marked as permitted camping.','camp-prohibited':'No precise prohibition polygons excluding designated camping exceptions retained. Spooner’s broad dispersed-camping ban is shown under Camping restricted.'}
result={'type':'FeatureCollection','version':'v2-stage-a','informationReviewed':VERIFIED,'status':'Partial community-mapped boundary coverage; official agency GIS acquisition pending network access.','license':'ODbL 1.0 — © OpenStreetMap contributors','features':features,'unavailable':unavailable}
(ROOT/'data/boundaries-v2.geojson').write_text(json.dumps(result,separators=(',',':'))+'\n')
(ROOT/'docs/boundary-sources-v2.json').write_text(json.dumps({'method':'Polygonize exact sourced ways; retain all vertices and holes. Fail on cuts/dangles/invalid rings. No snapping, simplification, gap filling, buffers, inferred ownership or tent-site generation.','retrieved':VERIFIED,'sources':manifests},indent=2)+'\n')
print(len(features),'features from',len(SOURCES),'OSM boundary sources. Agency GIS validation remains incomplete.')
