import argparse,json,pathlib,statistics,collections,math,csv,random,datetime,hashlib
parser=argparse.ArgumentParser(description='Analyze the frozen focused Link matrix without pooling correlated samples')
parser.add_argument('--artifact-root',required=True,type=pathlib.Path)
parser.add_argument('--output-root',type=pathlib.Path)
parser.add_argument('--provenance',type=pathlib.Path)
parser.add_argument('--size-root',required=True,type=pathlib.Path)
parser.add_argument('--size-manifest',required=True,type=pathlib.Path)
args=parser.parse_args()
if not __debug__:raise RuntimeError('Run without Python -O; sample/provenance assertions are mandatory')
I=args.artifact_root.resolve();O=(args.output_root or I).resolve();O.mkdir(parents=True,exist_ok=True)
P=json.loads((args.provenance or I/'provenance.json').read_text());D=json.loads((I/'design.json').read_text());G=json.loads((I/'gates.json').read_text())
EXPECTED=json.loads((pathlib.Path(__file__).parent/'matrix-design.json').read_text())
assert D==EXPECTED,'Design differs from the frozen eight-arm/five-page matrix'
assert [record['arm'] for record in P['records']]==D['arms'],'Missing or reordered build provenance'
assert all(record.get('buildStatus')=='pass' and record.get('head') and record.get('bundleHashes') and record.get('fixtureHashes') for record in P['records']),'Incomplete build provenance'
assert P['records'][0]['bundleHashes']==P['records'][-1]['bundleHashes'],'main-repeat is not the same-byte main arm'
assert len(G['records'])==136 and all(record.get('status')=='pass' for record in G['records']),'Incomplete correctness gates'
assert all(sum(record['arm']==arm for record in G['records'])==17 for arm in D['arms']),'Missing or duplicate arm gates'
def gate_key(record):
    return (record['arm'],record['kind']) if 'kind' in record else (record['arm'],record['group'],record['workload'],bool(record.get('diagnostic')))
expected_gate_keys={(arm,fixture['group'],fixture['workload'],False) for arm in D['arms'] for fixture in D['gateCases']}
expected_gate_keys.update((arm,fixture['group'],fixture['workload'],True) for arm in D['arms'] for fixture in D['gateCases'] if fixture['group']=='presentation-props')
expected_gate_keys.update((arm,kind) for arm in D['arms'] for kind in ['pending','cache-gate'])
assert {gate_key(record) for record in G['records']}==expected_gate_keys,'Missing or duplicate gate cases'
size_root=args.size_root.resolve();size_manifest=json.loads(args.size_manifest.read_text())
assert set(size_manifest)==set(D['arms']),'Size manifest must cover every frozen arm'
size_rows=[]
for record in P['records']:
    relative=size_manifest[record['arm']]
    entry=relative if isinstance(relative,dict) else {'path':relative}
    measurement=(size_root/entry['path']).resolve()
    assert measurement.is_relative_to(size_root),('Size evidence must be inside --size-root',record['arm'])
    data=measurement.read_bytes()
    if 'sha256' in entry:assert hashlib.sha256(data).hexdigest()==entry['sha256'],('Size evidence hash mismatch',record['arm'])
    document=json.loads(data)
    assert document['status']['state']=='success',('Failed bundle measurement',record['arm'])
    metrics=[metric for metric in document['metrics'] if metric['id']=='react-router.minimal']
    assert len(metrics)==1,('Missing/duplicate minimal bundle measurement',record['arm'])
    metric=metrics[0]
    size={key:metric[key] for key in ['rawBytes','gzipBytes','initialGzipBytes','brotliBytes']}
    assert size==record['minimalBundle'],('Size measurement differs from build provenance',record['arm'],size,record['minimalBundle'])
    size_rows.append(dict(arm=record['arm'],**size))

A=D['arms'];N=D['rounds'];C=len(D['cases'])
DATA=[json.loads(p.read_text()) for p in sorted((I/'raw').glob('round-*.json'),key=lambda p:int(p.stem.split('-')[1]))]
assert len(DATA)==N and [b['block'] for b in DATA]==list(range(N))
assert not G['failures'],G['failures']
assert not json.loads((I/'timing-failures.json').read_text())
V=collections.defaultdict(list);S=collections.defaultdict(list);B=collections.defaultdict(list)
def workload(r,s):
    if r['group']=='browser' and r['workload']=='departing':return 'dense-departure' if s['atRender']['location'].startswith('/items/') else 'dense-remount'
    return 'no-links-retained' if r['group']=='no-links' else r['workload']
for block in DATA:
    assert len(block['results'])==len(A)*C,(block['block'],len(block['results']))
    assert sum(r.get('sentinel',False) for r in block['results'])==0
    for arm in A:assert sum(r['arm']==arm and not r.get('sentinel') for r in block['results'])==C
    expected_keys={(arm,fixture['group'],fixture['workload']) for arm in A for fixture in D['cases']}
    actual_keys=[(record['arm'],record['group'],record['workload']) for record in block['results']]
    assert set(actual_keys)==expected_keys and len(actual_keys)==len(set(actual_keys)),('Missing or duplicate case records',block['block'])
    assert all(record['block']==block['block'] for record in block['results']),('Wrong round in case records',block['block'])
    offsets=[0]+[(index+1)//2 if index%2 else len(A)-index//2 for index in range(1,len(A))]
    expected_order=[A[(offset+block['block'])%len(A)] for offset in offsets]
    assert block['order']==expected_order,('Williams order differs',block['block'])
    for r in block['results']:
        assert len(r['samples'])==((D['warmHitBuilderSamples'] if r['workload']=='warm-hit' else D['builderSamples']) if r['group']=='build-location' else D['navigationSamples'])
        assert len(r.get('traceSamples') or [])==(0 if r['group']=='build-location' else D['navigationTraceSamples'])
        dst=S if r.get('sentinel') else V
        for s in r['samples']:
            metric='build-ms-per-1000' if r['group']=='build-location' else 'click-to-render-ms'
            key=(r['arm'],workload(r,s),metric,r['block'])
            dst[key].append(s['buildMs'] if r['group']=='build-location' else s['renderMs'])
            if r['group']=='build-location' and not r.get('sentinel'):B[key].append(dict(batchMs=s['batchMs'],calls=s['calls']))
        for s in r.get('traceSamples') or []:dst[(r['arm'],workload(r,s),'click-to-task-end-ms',r['block'])].append(s['enclosingTask']['clickToTaskEndMs'])
for arm in A:
    for scenario in ['dense-departure','dense-remount','nonroot-retained-updaters','deep-retained-updaters','active-options','disabled-equivalent']:
        count=12 if scenario in ['dense-departure','dense-remount'] else 24
        for metric in ['click-to-render-ms','click-to-task-end-ms']:
            assert all(len(V[(arm,scenario,metric,block)])==count for block in range(N)),('Missing directional samples',arm,scenario,metric)
T={7:2.364624,11:2.200985}
def interval(logs):
    mean=statistics.mean(logs);margin=T[N-1]*statistics.stdev(logs)/math.sqrt(len(logs))
    return [100*math.expm1(v) for v in (mean,mean-margin,mean+margin)]
def export(filename,rows):
    with (O/filename).open('w') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
rows=[]
for arm,w,m in sorted({k[:3] for k in V}):
    means=[statistics.mean(V[(arm,w,m,b)]) for b in range(N)]
    main=[statistics.mean(V[('main',w,m,b)]) for b in range(N)]
    delta,lo,hi=interval([math.log(c/r) for c,r in zip(means,main)])
    rng=random.Random(20261002);boot=sorted(statistics.median(rng.choices(means,k=N)) for _ in range(10000))
    batch=[s for b in range(N) for s in B[(arm,w,m,b)]]
    limited=bool(batch) and statistics.median(s['batchMs'] for s in batch)<1
    row=dict(arm=arm,workload=w,metric=m,absoluteMedianMs=statistics.median(means),absolute95LowMs=boot[249],absolute95HighMs=boot[9749],mainAbsoluteMedianMs=statistics.median(main),deltaPct=delta,delta95LowPct=lo,delta95HighPct=hi,rounds=N,pairedRounds=N,samples=sum(len(V[(arm,w,m,b)]) for b in range(N)),zeroSamples=sum(v==0 for b in range(N) for v in V[(arm,w,m,b)]),resolutionLimited=limited,roundMeans=means,blocks=list(range(N)))
    if batch:row.update(batchMedianMs=statistics.median(s['batchMs'] for s in batch),batchMinMs=min(s['batchMs'] for s in batch),callsPerBatch=batch[0]['calls'])
    row['verdict']='reference' if arm=='main' else 'resolution limited' if limited else 'faster' if hi<0 else 'slower' if lo>0 else 'unresolved'
    rows.append(row)
assert len(rows)==len(A)*12,len(rows)
lookup={(r['arm'],r['workload'],r['metric']):r for r in rows}
comparisons=[]
for r in rows:
    for reference in A:
        ref=lookup[(reference,r['workload'],r['metric'])]
        delta,lo,hi=interval([math.log(c/b) for c,b in zip(r['roundMeans'],ref['roundMeans'])])
        comparisons.append(dict(arm=r['arm'],referenceArm=reference,workload=r['workload'],metric=r['metric'],absoluteMedianMs=r['absoluteMedianMs'],referenceAbsoluteMedianMs=ref['absoluteMedianMs'],deltaPct=delta,delta95LowPct=lo,delta95HighPct=hi,rounds=N,samples=r['samples'],resolutionLimited=r['resolutionLimited'] or ref['resolutionLimited']))
sentinels=[dict(workload=r['workload'],metric=r['metric'],deltaPct=r['deltaPct'],delta95LowPct=r['delta95LowPct'],delta95HighPct=r['delta95HighPct'],rounds=N,calibrationType='balanced independent same-byte A/A arm') for r in rows if r['arm']=='main-repeat']
metrics=dict(generatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),completedRounds=N,rows=rows,comparisons=comparisons,sentinels=sentinels)
(O/'metrics.json').write_text(json.dumps(metrics,indent=2))
keys=sorted(set().union(*(r.keys() for r in rows))-{'roundMeans','blocks'})
export('metrics.csv',[{k:r.get(k) for k in keys} for r in rows]);export('comparisons.csv',comparisons)
export('metrics-vs-current.csv',[r for r in comparisons if r['referenceArm']=='pr8587'])
export('candidate-versus-base.csv',[r for r in comparisons if r['arm'] in ['J','K'] and r['referenceArm'] in ['main','pr8587','pr8572','pr8582','H+E3+wrapper','J','K']])
with (O/'all-samples.csv').open('w') as f:
    writer=csv.writer(f);writer.writerow(['arm','workload','metric','round','sample','valueMs','sentinel'])
    for sentinel,dictionary in [(False,V),(True,S)]:
        for (arm,w,m,b),samples in sorted(dictionary.items()):
            for i,value in enumerate(samples):writer.writerow([arm,w,m,b,i,value,sentinel])

export('preliminary-bundle.csv',size_rows)
text=[
    '# Focused React Link matrix',
    'Eight independent Williams rounds compare eight arms. Five timed pages produce six outcomes: departure and remount, retained nonroot/deep updaters, and active-options/disabled-equivalent parent updates. main-repeat is the balanced same-byte A/A calibration arm; there is no extra sentinel. All 136 correctness gates and all 320 timed case records are required. There are 96 arm/outcome/metric rows and 768 ordered paired comparisons.',
    'Each page/round uses 16 warmups, 24 untraced render samples, and 24 separately traced task samples. Alternating departure/remount yields 96 samples per direction and metric across eight rounds; each other outcome has 192. Render ends at onRendered for navigation and a parent layout-effect commit marker for presentation updates. Task time ends at the enclosing Chromium renderer task; it is a click-to-first-yield proxy, not INP or paint latency. Diagnostics and correctness checks remain outside the timed prop-update region.',
    'Absolute values are medians of independent round means. Absolute intervals use 10,000 bootstrap draws with seed 20261002 and the retained percentile indices. Relative changes use geometric means of paired round ratios with nominal 95% Student-t intervals on log ratios (df 7), without multiple-comparison correction. Samples within a round are correlated. Intervals crossing zero are unresolved, not equivalence.',
    '| Arm | Outcome | Metric | Median ms | Versus main [95% interval] |',
    '|---|---|---|---:|---|',
]
for row in rows:
    text.append(f"| {row['arm']} | {row['workload']} | {row['metric']} | {row['absoluteMedianMs']:.6f} | {row['deltaPct']:+.3f}% [{row['delta95LowPct']:+.3f}, {row['delta95HighPct']:+.3f}] |")
text.extend(['', 'Minimal bundle metrics are independently verified against --size-root/--size-manifest and retained build provenance; see preliminary-bundle.csv. Full bundle and broad performance validation remain separate requirements. No static winner narrative is inferred from point estimates.'])
(O/'report.md').write_text('\n'.join(text)+'\n')
print(O/'metrics.json')
