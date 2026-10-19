"""Audit downloaded source topology without altering or joining runtime geometry.

Run from any directory with Python 3 (standard library only):
python scripts/audit-trail-data.py --official-dir data/source/official
Official archives must be downloaded separately from URLs in the report.
"""
import argparse
import collections
import hashlib
import io
import json
import math
from pathlib import Path
import re
import struct
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
K = {'k': 'http://www.opengis.net/kml/2.2'}
G = {'g': 'http://www.topografix.com/GPX/1/1'}
R = 6371008.8


def distance(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [*a[:2], *b[:2]])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 2*R*math.asin(min(1, math.sqrt(h)))


def topology(lines):
    """Exact coordinate endpoint topology; no rounding, snapping or tolerance joins."""
    adj = collections.defaultdict(list)
    for i, points in enumerate(lines):
        for p in (points[0], points[-1]):
            adj[tuple(p[:2])].append(i)
    unseen = set(range(len(lines)))
    components = []
    while unseen:
        pending = [unseen.pop()]
        group = []
        while pending:
            i = pending.pop()
            group.append(i)
            for p in (lines[i][0], lines[i][-1]):
                for j in adj[tuple(p[:2])]:
                    if j in unseen:
                        unseen.remove(j)
                        pending.append(j)
        components.append(len(group))
    return {
        'line_parts': len(lines),
        'vertices': sum(map(len, lines)),
        'components_by_exact_endpoints': sorted(components, reverse=True),
        'endpoint_degree_counts': dict(sorted(collections.Counter(map(len, adj.values())).items())),
        'within_part_length_m': round(sum(distance(a, b) for line in lines for a, b in zip(line, line[1:])), 2),
        'max_within_part_step_m': round(max(distance(a, b) for line in lines for a, b in zip(line, line[1:])), 2),
    }


def nearest_vertex(point, lines):
    d, i, j = min((distance(point, p), i, j) for i, line in enumerate(lines) for j, p in enumerate(line))
    return {'distance_m': round(d, 2), 'part': i, 'vertex': j}


def coverage(points, lines):
    """Nearest segment distances in a local equirectangular projection (~0.5%).

    Index only existing line segments. Never connect separate source parts.
    The projection is for comparison only and never changes route geometry.
    """
    scale_x = R*math.pi/180*math.cos(math.radians(39.1))
    scale_y = R*math.pi/180
    def xy(p):
        return ((p[0]+120)*scale_x, (p[1]-39.1)*scale_y)
    cell = 250
    grid = collections.defaultdict(list)
    for line in lines:
        for pa, pb in zip(line, line[1:]):
            a, b = xy(pa), xy(pb)
            for i in range(math.floor(min(a[0],b[0])/cell), math.floor(max(a[0],b[0])/cell)+1):
                for j in range(math.floor(min(a[1],b[1])/cell), math.floor(max(a[1],b[1])/cell)+1):
                    grid[i,j].append((a,b))
    offsets = []
    for p in points:
        x,y = xy(p)
        cx,cy = math.floor(x/cell),math.floor(y/cell)
        best = math.inf
        for radius in range(100):
            for i in range(cx-radius,cx+radius+1):
                for j in range(cy-radius,cy+radius+1):
                    if radius and abs(i-cx)!=radius and abs(j-cy)!=radius:
                        continue
                    for (ax,ay),(bx,by) in grid.get((i,j),()):
                        dx,dy=bx-ax,by-ay
                        norm=dx*dx+dy*dy
                        t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/norm)) if norm else 0
                        best=min(best,(x-ax-t*dx)**2+(y-ay-t*dy)**2)
            outside = min(x-(cx-radius)*cell, (cx+radius+1)*cell-x, y-(cy-radius)*cell, (cy+radius+1)*cell-y)
            if best <= outside*outside:
                break
        assert math.isfinite(best), 'No comparison segment within search area'
        offsets.append(math.sqrt(best))
    ordered = sorted(offsets)
    return {'vertices_checked': len(points), 'median_m': round(ordered[len(ordered)//2],2), 'p95_m': round(ordered[math.ceil(len(ordered)*.95)-1],2), 'max_m': round(max(offsets),2), 'worst_shipped_coordinate': points[offsets.index(max(offsets))][:2], 'vertices_more_than_100m_away': sum(d>100 for d in offsets), 'note': 'All shipped vertices to nearest existing comparison segment, one-way only. This is positional agreement, not field accuracy, path equivalence, or certification.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--official-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'docs/trail-data-audit-2026-10-19.json')
    args = parser.parse_args()
    urls = {
        'trta-gpx.zip': 'https://tahoerimtrail.org/shared/trt-500pointsPerTrack.gpx.zip',
        'trta-kmz.zip': 'https://tahoerimtrail.org/shared/map-files/2020_TRT_Trail_System_KMZ.zip',
        'trta-shapefile.zip': 'https://tahoerimtrail.org/shared/map-files/2020_TRT_Trail_System_Shapefile.zip',
    }
    sources = []
    for filename, url in urls.items():
        b = (args.official_dir/filename).read_bytes()
        with zipfile.ZipFile(io.BytesIO(b)) as z:
            members = {x.filename: x.file_size for x in z.infolist() if not x.is_dir() and not x.filename.startswith('__MACOSX/')}
        sources.append({'file': filename, 'url': url, 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'members': members})
    with zipfile.ZipFile(args.official_dir/'trta-gpx.zip') as z:
        gpx = ET.fromstring(z.read('trt-500pointsPerTrack.gpx'))
    tracks = [[[float(p.attrib['lon']), float(p.attrib['lat'])] for p in t.findall('g:trkpt', G)] for t in gpx.findall('.//g:trkseg', G)]
    assert all(len(t) > 1 for t in tracks)
    with zipfile.ZipFile(args.official_dir/'trta-kmz.zip') as z:
        with zipfile.ZipFile(io.BytesIO(z.read('2020_TRT_Trail_System_KMZ.kmz'))) as kmz:
            kml = ET.fromstring(kmz.read('doc.kml'))
    official = []
    names = []
    categories = collections.Counter()
    for placemark in kml.findall('.//k:Placemark', K):
        desc = placemark.findtext('k:description', namespaces=K) or ''
        cells = [re.sub('<[^>]+>', '', c).strip() for c in re.findall(r'<td[^>]*>\s*(.*?)\s*</td>', desc, re.S)]
        attrs = dict(zip(cells[1::2], cells[2::2]))
        categories[attrs.get('Trail_Type', 'unspecified')] += 1
        if attrs.get('Trail_Type') != 'TRT':
            continue
        for line in placemark.findall('.//k:LineString/k:coordinates', K):
            points = [list(map(float, p.split(',')[:2])) for p in line.text.split()]
            assert len(points) > 1
            official.append(points)
            names.append(placemark.findtext('k:name', namespaces=K))
    old = json.loads((ROOT/'data/route-v1.json').read_text())
    gap = old['gapAfter'][0]
    ends = [old['coordinates'][gap][:2], old['coordinates'][(gap+1)%len(old['coordinates'])][:2]]
    gpx_near = [nearest_vertex(p, tracks) for p in ends]
    kml_near = [nearest_vertex(p, official) for p in ends]
    # Identify source vertices only; no projected/interpolated points are created.
    for entry in kml_near:
        entry['name'] = names[entry['part']]
    ward_gpx = None
    if gpx_near[0]['part'] == gpx_near[1]['part']:
        i, j = sorted(x['vertex'] for x in gpx_near)
        points = tracks[gpx_near[0]['part']][i:j+1]
        ward_gpx = {'track_part': gpx_near[0]['part'], 'vertices': len(points), 'source_polyline_length_m': round(sum(distance(a,b) for a,b in zip(points,points[1:])),2)}
    xml_path = ROOT/'data/source/osm-3094865-2026-10-19.xml'
    xml = xml_path.read_bytes()
    osm = ET.fromstring(xml)
    relation = next(r for r in osm.findall('relation') if r.attrib['id'] == '3094865')
    nodes = {n.attrib['id']: [float(n.attrib['lon']), float(n.attrib['lat'])] for n in osm.findall('node')}
    ways = {w.attrib['id']: [n.attrib['ref'] for n in w.findall('nd')] for w in osm.findall('way')}
    members = [m.attrib['ref'] for m in relation.findall('member') if m.attrib['type'] == 'way']
    assert len(members) == len(set(members)), 'Duplicate member ways require review'
    current_lines = [[nodes[n] for n in ways[w]] for w in members]
    end_nodes = collections.Counter(n for w in members for n in (ways[w][0], ways[w][-1]))
    unmatched = [{'node': n, 'coordinates': nodes[n], 'degree': d} for n,d in end_nodes.items() if d != 2]
    assert set(ways['415120691']) & set(ways['295046482']) == {'2387004645'}
    current = {'url': 'https://www.openstreetmap.org/api/0.6/relation/3094865/full', 'file': str(xml_path.relative_to(ROOT)), 'bytes': len(xml), 'sha256': hashlib.sha256(xml).hexdigest(), 'relation': relation.attrib, 'topology': topology(current_lines), 'unmatched_endpoints': unmatched, 'ward_creek_shared_node': {'id': '2387004645', 'coordinates': nodes['2387004645'], 'ways': [415120691, 295046482]}}
    if len(unmatched) == 2:
        current['unmatched_endpoint_chord_m'] = round(distance(*[x['coordinates'] for x in unmatched]), 2)
    with zipfile.ZipFile(args.official_dir/'trta-shapefile.zip') as z:
        dbf = z.read('2020_Trail_System.dbf')
        shape = {'records': struct.unpack_from('<I', dbf, 4)[0], 'projection': z.read('2020_Trail_System.prj').decode(), 'metadata_date': '2020-12-21', 'note': 'Container, record count and CRS checked; shapefile geometry is not compared to KMZ by this audit.'}
    result = {
        'review_date': '2026-10-19',
        'method': 'Coverage uses local equirectangular segment distances at latitude 39.1 (approximately 0.5% projection uncertainty); other lengths use haversine distances on a sphere of radius 6371008.8 m; exact endpoint coordinates for topology. Nearest-vertex offsets are NOT nearest-segment distances. No gap joins, densification, generated trail geometry, elevation assignment or runtime changes.',
        'official_download_page': 'https://tahoerimtrail.org/downloads/',
        'official_sources': sources,
        'official_gpx': {'topology': topology(tracks), 'track_point_counts': list(map(len, tracks)), 'inter_track_endpoint_chords_m': [round(distance(t[-1], tracks[(i+1)%len(tracks)][0]), 2) for i,t in enumerate(tracks)], 'note': 'Seven separate simplified tracks; chords are not trail geometry and were not added.'},
        'official_kmz': {'feature_categories': dict(categories), 'trt_topology': topology(official), 'note': 'Filter by Trail_Type=TRT, not Name=TRT: the main trail also uses named roads. Exact topology intentionally does not silently snap nearby endpoints.'},
        'official_shapefile': shape,
        'shipped_ward_gap': {'endpoints_lon_lat': ends, 'endpoint_chord_m': round(distance(*ends), 2), 'official_gpx_nearest_vertices': gpx_near, 'official_gpx_between_nearest_vertices': ward_gpx, 'official_kmz_nearest_vertices': kml_near},
        'current_osm': current,
        'shipped_vertex_agreement_with_official_kmz': coverage(old['coordinates'], official),
        'shipped_vertex_agreement_with_current_osm': coverage(old['coordinates'], current_lines),
        'decision': 'Retain runtime v1 and its gap warning. Official historical downloads and current OSM do not establish a complete current field-validated loop; TRTA redistribution terms were not found. Official archives remain local for audit, excluded from Git and build. Current OSM is retained under ODbL. Ward Creek is a historical source-topology defect, not evidence of a physical missing trail.'
    }
    args.output.write_text(json.dumps(result, indent=2)+'\n')
    print(args.output)


if __name__ == '__main__':
    main()
