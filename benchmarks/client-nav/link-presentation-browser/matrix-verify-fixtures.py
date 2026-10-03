import argparse,pathlib,json,hashlib,collections
parser=argparse.ArgumentParser(description='Verify compiled fixture sources and bundle hashes for every frozen matrix arm')
parser.add_argument('--artifact-root',required=True,type=pathlib.Path)
parser.add_argument('--bundle-root',required=True,type=pathlib.Path)
parser.add_argument('--fixture-root',type=pathlib.Path,default=pathlib.Path(__file__).parent)
parser.add_argument('--provenance',type=pathlib.Path)
parser.add_argument('--output-root',type=pathlib.Path)
args=parser.parse_args()
if not __debug__:raise RuntimeError('Run without Python -O; source/hash assertions are mandatory')
artifact=args.artifact_root.resolve();out=(args.output_root or artifact).resolve();out.mkdir(parents=True,exist_ok=True)
bundles=args.bundle_root.resolve();fixture=args.fixture_root.resolve()
p=json.loads((args.provenance or artifact/'provenance.json').read_text())
expected_arms=['main','pr8587','pr8572','pr8582','H+E3+wrapper','J','K','main-repeat']
assert [record['arm'] for record in p['records']]==expected_arms,'Missing or reordered frozen arms'
assert all(record.get('buildStatus')=='pass' for record in p['records']),'Incomplete matrix build'

def sha(b):return hashlib.sha256(b).hexdigest()
expected={f.name:sha(f.read_bytes()) for f in (fixture/'src').iterdir() if f.is_file()}
assert expected,'Missing fixture sources'
results=[]
for record in p['records']:
    assert record.get('bundleHashes') and record.get('fixtureHashes'),('Missing hash provenance',record['arm'])
    for relative,digest in record['bundleHashes'].items():
        target=(bundles/record['arm']/relative).resolve()
        assert target.is_relative_to(bundles/record['arm']),('Invalid bundle path',relative)
        assert sha(target.read_bytes())==digest,('Bundle hash mismatch',record['arm'],relative)

for arm in [r['arm'] for r in p['records'] if r.get('buildStatus')=='pass']:
    found={}
    for f in (bundles/arm).rglob('*.map'):
        m=json.loads(f.read_text())
        assert len(m.get('sources',[]))==len(m.get('sourcesContent',[])),('Missing source-map content',arm,str(f))
        for name,content in zip(m.get('sources',[]),m.get('sourcesContent',[])):
            filename=pathlib.PurePosixPath(name).name
            if ('/link-presentation-browser/src/' in name or name.startswith('../../src/')) and filename in expected:
                assert isinstance(content,str),('Missing source-map text',arm,name)
                digest=sha(content.encode())
                assert digest==expected[filename],(arm,name,digest,expected[filename])
                found[filename]=digest
    assert found==expected,(arm,found,expected)
    results.append(dict(arm=arm,compiledSourceHashes=found,status='pass'))
identity=collections.defaultdict(list)
for r in p['records']:
    if r.get('buildStatus')!='pass':continue
    files={path.split('/assets/')[-1]:value for path,value in r['bundleHashes'].items() if path.endswith('.js')}
    # Content identity does not require Vite's filename salt to match.
    key=tuple(sorted(files.values()))
    identity[key].append(r['arm'])
p['byteIdentityGroups']=[arms for arms in identity.values() if len(arms)>1]
assert ['main','main-repeat'] in p['byteIdentityGroups'],'Embedded main-repeat is not byte-identical to main'
(out/'provenance.json').write_text(json.dumps(p,indent=2))
(out/'fixture-parity.json').write_text(json.dumps(dict(expectedSourceHashes=expected,records=results),indent=2))
print('Compiled fixture parity passed:',len(results),'arms. Same-byte groups:',p['byteIdentityGroups'])
