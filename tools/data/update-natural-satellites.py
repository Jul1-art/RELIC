"""Refresh the complete JPL mean-orbit catalogue; cache raw pages outside Documents."""
from pathlib import Path
import argparse,datetime as dt,hashlib,html,json,os,re,urllib.request
from collections import Counter

def text(value):return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',value))).strip()
def rows(page,table_id=None):
 pattern=rf'<table[^>]*id="{table_id}".*?</table>' if table_id else r'<table.*?</table>'
 table=re.search(pattern,page,re.S).group()
 return [[text(c) for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>',row,re.S)] for row in re.findall(r'<tr.*?</tr>',table,re.S)]
def number(value):
 m=re.search(r'[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?',value)
 return float(m.group()) if m else None

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,required=True);parser.add_argument('--output',type=Path,default=Path('assets/data/natural-satellites.json'));a=parser.parse_args();a.cache.mkdir(parents=True,exist_ok=True)
 urls={'elements':'https://ssd.jpl.nasa.gov/sats/elem/','physical':'https://ssd.jpl.nasa.gov/sats/phys_par/','discovery':'https://ssd.jpl.nasa.gov/sats/discovery.html'}
 pages={};sources=[]
 for name,url in urls.items():
  file=a.cache/(name+'.html')
  if not file.exists():file.write_bytes(urllib.request.urlopen(url,timeout=30).read())
  data=file.read_bytes();pages[name]=data.decode('utf8');sources.append({'url':url,'sha256':hashlib.sha256(data).hexdigest(),'role':name})
 physical={r[2]:number(r[4]) for r in rows(pages['physical'],'sat_phys_par') if len(r)>=6 and r[2].isdigit()}
 satellites={}
 for r in rows(pages['elements'],'sat_elem'):
  if len(r)<20 or not r[3].isdigit():continue
  code=r[3];year,month,last=r[6].split('-');day=float(last);epoch=dt.datetime(int(year),int(month),int(day),tzinfo=dt.timezone.utc)+dt.timedelta(days=day%1)
  name={'Magaclite':'Megaclite','Philophrosyn':'Philophrosyne'}.get(r[2],r[2]);name=re.sub(r'^S(\d{4})_([A-Z])_(\d+)$',r'S/\1 \2 \3',name);old=satellites.get(code)
  if old and old['epochJd']>epoch.timestamp()/86400+2440587.5:continue
  satellites[code]={'id':'moon' if code=='301' else 'naif-'+code,'naifId':int(code),'name':name,'aliases':[r[2]] if r[2]!=name else [],'parent':r[1].lower(),'ephemeris':r[4],'referencePlane':r[5].lower(),'epochTdb':r[6],'epochJd':epoch.timestamp()/86400+2440587.5,
   'aKm':number(r[7]),'e':number(r[8]),'argumentOfPeriapsisDeg':number(r[9]),'meanAnomalyDeg':number(r[10]),'inclinationDeg':number(r[11]),'nodeDeg':number(r[12]),'periodDays':number(r[13]),'apsidalPrecessionYears':number(r[14]),'nodalPrecessionYears':number(r[15]),'laplacePoleRaDeg':number(r[16]),'laplacePoleDecDeg':number(r[17]),'radiusKm':physical.get(code),'orbitQuality':'mean-elements','source':urls['elements']}
 result=list(satellites.values())
 # Cassini observed this ring moonlet, but JPL provides no mean orbit for it.
 result.append({'id':'s-2009-s-1','naifId':None,'name':'S/2009 S 1','aliases':['S/2009S1'],'parent':'saturn','aKm':None,'e':None,'inclinationDeg':None,'nodeDeg':None,'argumentOfPeriapsisDeg':None,'meanAnomalyDeg':None,'epochJd':None,'periodDays':None,'radiusKm':None,'referencePlane':None,'orbitQuality':'unavailable','source':urls['discovery'],'modelNote':'JPL lists this Cassini ring moonlet but supplies no mean orbital elements. Its marker is illustrative, with no claimed current position.'})
 counts=Counter(r['parent'] for r in result);payload={'schema':'relic.natural-satellites.v1','checkedOn':'2026-10-29','sources':sources,'coverage':{'total':len(result),'meanOrbits':len(satellites),'byParent':dict(counts),'planetaryTotal':sum(v for k,v in counts.items() if k!='pluto'),'dwarfPlanetSupplement':counts.get('pluto',0)},'modelPolicy':'JPL mean elements describe general orbit shape and orientation; they are not accurate ephemerides. Positions shown are illustrative mean-orbit phases. Unknown sizes and surfaces are explicitly represented by proxies. Pluto satellites are a supplementary data catalogue; the main scene contains the eight planets.','satellites':result}
 assert len(result)==461,(len(result),counts)
 assert counts=={'earth':1,'mars':2,'jupiter':115,'saturn':293,'uranus':29,'neptune':16,'pluto':5},counts
 a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n');print(json.dumps(payload['coverage']))
if __name__=='__main__':main()
