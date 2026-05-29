// MREC Boundary Analysis — Application Logic
// Credentials handled by credentials.js (loaded before this file)


// ══════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════
const S = {
  importMode: 'multi',
  wireframe: null,       // {triangles:[{v0,v1,v2},...], name, faceCount}
  files: { collar:null, survey:null, assay:null, e1:null, e2:null, e3:null, point:null },
  mappings: { collar:{holeid:'',x:'',y:'',z:'',maxdepth:''}, survey:{holeid:'',depth:'',dip:'',azimuth:''}, assay:{holeid:'',from:'',to:''} },
  assayFieldSel: new Set(),
  extraFieldSel: { e1:new Set(), e2:new Set(), e3:new Set() },
  pointMap: { holeid:'', x:'', y:'', z:'', from:'', to:'', hasDepths:true },
  pointHeaders: [], pointRows: [],
  opts: { ds:'mid', co:'auto', coLen:2, bin:'auto', binWidth:5, sign:'in-pos', maxDist:0, mg:'zero', intent:'grade', intentThresh:{} },
  results: null
};

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════
function doLogin(){
  const u=document.getElementById('inp-user').value.trim();
  const p=document.getElementById('inp-pass').value;
  if(checkCredentials(u,p)){
    document.getElementById('logged-user').textContent=u.toUpperCase();
    showScreen('app-screen');
    document.getElementById('login-err').textContent='';
  } else {
    const c=document.getElementById('login-card');
    c.classList.remove('shake');
    void c.offsetWidth;
    c.classList.add('shake');
    document.getElementById('login-err').textContent='Invalid credentials.';
  }
}
function doLogout(){ showScreen('login-screen'); document.getElementById('login-err').textContent=''; }

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function goStep(n){
  document.querySelectorAll('.step-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('step-'+n).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('nav-'+n).classList.add('active');
  if(n===3)buildMappingUI();
  if(n===4)updateIntentThreshFields();
  if(n===5)buildRunSummary();
}
function showRTab(name){
  document.querySelectorAll('.rtab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.rtab-panel').forEach(p=>p.classList.remove('active'));
  const idx={overview:0,plots:1,data:2}[name];
  document.querySelectorAll('.rtab')[idx].classList.add('active');
  document.getElementById('rpanel-'+name).classList.add('active');
}

// ══════════════════════════════════════════════════════════════
// WIREFRAME LOADING
// ══════════════════════════════════════════════════════════════
function dzDragWF(e){e.preventDefault();document.getElementById('dz-wf').classList.add('drag-over');}
function dzLeaveWF(){document.getElementById('dz-wf').classList.remove('drag-over');}
function dzDropWF(e){e.preventDefault();dzLeaveWF();const f=e.dataTransfer.files[0];if(f)parseWireframe(f);}
function fileChangeWF(e){const f=e.target.files[0];if(f)parseWireframe(f);}

function parseWireframe(file){
  const reader=new FileReader();
  reader.onload=evt=>{
    const text=evt.target.result;
    const ext=file.name.split('.').pop().toLowerCase();
    let triangles=[];
    try{
      if(ext==='obj') triangles=parseOBJ(text);
      else if(ext==='dxf') triangles=parseDXF(text);
      else triangles=parseTriCSV(text);
    }catch(err){
      alert('Failed to parse wireframe: '+err.message);return;
    }
    if(!triangles.length){alert('No triangles found in file. Check format and entity types.');return;}

    // Split into connected solids (handles multi-wireframe DXF files)
    const solidGroups=splitSolids(triangles);
    const solids=solidGroups.map(tris=>{
      // Per-solid bounding box — used in nearestTriangleDist to skip solids
      // that cannot improve on the current best distance. Correctness-preserving only.
      let sxmin=Infinity,sxmax=-Infinity,symin=Infinity,symax=-Infinity,szmin=Infinity,szmax=-Infinity;
      tris.forEach(t=>[t.v0,t.v1,t.v2].forEach(v=>{
        if(v.x<sxmin)sxmin=v.x;if(v.x>sxmax)sxmax=v.x;
        if(v.y<symin)symin=v.y;if(v.y>symax)symax=v.y;
        if(v.z<szmin)szmin=v.z;if(v.z>szmax)szmax=v.z;
      }));
      return{triangles:tris,faceNormals:buildFaceNormals(tris),
             bbox:{xmin:sxmin,xmax:sxmax,ymin:symin,ymax:symax,zmin:szmin,zmax:szmax}};
    });

    // Compute overall bounding box across all solids
    let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity,zmin=Infinity,zmax=-Infinity;
    triangles.forEach(t=>[t.v0,t.v1,t.v2].forEach(v=>{
      if(v.x<xmin)xmin=v.x;if(v.x>xmax)xmax=v.x;
      if(v.y<ymin)ymin=v.y;if(v.y>ymax)ymax=v.y;
      if(v.z<zmin)zmin=v.z;if(v.z>zmax)zmax=v.z;
    }));

    S.wireframe={triangles,solids,name:file.name,faceCount:triangles.length,solidCount:solids.length};
    S.wireframe.bbox={xmin,xmax,ymin,ymax,zmin,zmax};

    const dz=document.getElementById('dz-wf');
    dz.classList.add('loaded');dz.classList.remove('drag-over');
    document.getElementById('di-wf').textContent='✓';
    document.getElementById('ds-wf').textContent=file.name;
    const solidLabel=solids.length>1?` · ${solids.length} solids detected`:'';
    document.getElementById('dc-wf').textContent=triangles.length+' triangles'+solidLabel+' · X:'+xmin.toFixed(0)+'→'+xmax.toFixed(0)+' Y:'+ymin.toFixed(0)+'→'+ymax.toFixed(0)+' Z:'+zmin.toFixed(0)+'→'+zmax.toFixed(0);
    const btn=document.getElementById('btn-wf-next');
    btn.style.opacity='1';btn.style.pointerEvents='auto';
    document.getElementById('nav-1').classList.add('done');
  };
  reader.readAsText(file);
}

function parseTriCSV(text){
  const lines=text.trim().split(/\r?\n/);
  if(lines.length<2)throw new Error('CSV has fewer than 2 lines');
  const parseLine=l=>{const r=[];let c='',q=false;for(let i=0;i<l.length;i++){if(l[i]==='"'){q=!q;}else if(l[i]===','&&!q){r.push(c.trim());c='';}else c+=l[i];}r.push(c.trim());return r;};
  const headers=parseLine(lines[0]).map(h=>h.replace(/^"|"$/g,'').toLowerCase().trim());
  // Find vertex column indices — try named first, then positional
  function findIdx(...pats){for(const p of pats){const i=headers.findIndex(h=>new RegExp(p,'i').test(h));if(i>=0)return i;}return -1;}
  const x1i=findIdx('^x1$','x_1','vert1_x','vx1');
  const y1i=findIdx('^y1$','y_1','vert1_y','vy1');
  const z1i=findIdx('^z1$','z_1','vert1_z','vz1');
  const x2i=findIdx('^x2$','x_2','vert2_x','vx2');
  const y2i=findIdx('^y2$','y_2','vert2_y','vy2');
  const z2i=findIdx('^z2$','z_2','vert2_z','vz2');
  const x3i=findIdx('^x3$','x_3','vert3_x','vx3');
  const y3i=findIdx('^y3$','y_3','vert3_y','vy3');
  const z3i=findIdx('^z3$','z_3','vert3_z','vz3');
  // Fallback: positional (9 numeric columns)
  const hasNamed=x1i>=0&&y1i>=0&&z1i>=0&&x2i>=0&&y2i>=0&&z2i>=0&&x3i>=0&&y3i>=0&&z3i>=0;
  const triangles=[];
  for(let li=1;li<lines.length;li++){
    const row=parseLine(lines[li]);
    if(!row.length||!row[0])continue;
    let v0,v1,v2;
    if(hasNamed){
      v0={x:parseFloat(row[x1i]),y:parseFloat(row[y1i]),z:parseFloat(row[z1i])};
      v1={x:parseFloat(row[x2i]),y:parseFloat(row[y2i]),z:parseFloat(row[z2i])};
      v2={x:parseFloat(row[x3i]),y:parseFloat(row[y3i]),z:parseFloat(row[z3i])};
    } else {
      const nums=row.map(v=>parseFloat(v)).filter(v=>!isNaN(v));
      if(nums.length<9)continue;
      v0={x:nums[0],y:nums[1],z:nums[2]};v1={x:nums[3],y:nums[4],z:nums[5]};v2={x:nums[6],y:nums[7],z:nums[8]};
    }
    if(isNaN(v0.x)||isNaN(v1.x)||isNaN(v2.x))continue;
    triangles.push({v0,v1,v2});
  }
  if(!triangles.length)throw new Error('Could not parse any triangles from CSV. Check column names or format.');
  return triangles;
}

function parseOBJ(text){
  const verts=[];const faces=[];
  text.split(/\r?\n/).forEach(line=>{
    const parts=line.trim().split(/\s+/);
    if(parts[0]==='v'){verts.push({x:parseFloat(parts[1]),y:parseFloat(parts[2]),z:parseFloat(parts[3])});}
    else if(parts[0]==='f'){
      const idx=parts.slice(1).map(p=>parseInt(p.split('/')[0])-1);
      for(let i=1;i<idx.length-1;i++)faces.push({v0:verts[idx[0]],v1:verts[idx[i]],v2:verts[idx[i+1]]});
    }
  });
  if(!faces.length)throw new Error('No faces found in OBJ file');
  return faces;
}

function parseDXF(text){
  // Normalise line endings to \n, then split into lines
  const lines=text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');

  // Build flat array of [groupCode, value] pairs — standard DXF structure
  // Group code lines may have leading/trailing whitespace
  const pairs=[];
  for(let i=0;i<lines.length-1;i++){
    const code=lines[i].trim();
    const val=lines[i+1].trim();
    if(code!==''){pairs.push([code,val]);i++;}
  }

  const triangles=[];
  let i=0;
  while(i<pairs.length){
    // Find next 3DFACE entity marker: group code "0", value "3DFACE"
    if(pairs[i][0]==='0'&&pairs[i][1].toUpperCase()==='3DFACE'){
      i++;
      // Read ahead until next entity (next pair with group code "0")
      const faceMap={};
      while(i<pairs.length&&pairs[i][0]!=='0'){
        faceMap[pairs[i][0]]=pairs[i][1];
        i++;
      }
      // Extract vertex coords: codes 10/20/30 = v0, 11/21/31 = v1, 12/22/32 = v2, 13/23/33 = v3
      const v0={x:parseFloat(faceMap['10']),y:parseFloat(faceMap['20']),z:parseFloat(faceMap['30'])};
      const v1={x:parseFloat(faceMap['11']),y:parseFloat(faceMap['21']),z:parseFloat(faceMap['31'])};
      const v2={x:parseFloat(faceMap['12']),y:parseFloat(faceMap['22']),z:parseFloat(faceMap['32'])};
      const v3={x:parseFloat(faceMap['13']),y:parseFloat(faceMap['23']),z:parseFloat(faceMap['33'])};
      if(isNaN(v0.x)||isNaN(v1.x)||isNaN(v2.x))continue;
      triangles.push({v0,v1,v2});
      // 3DFACE can encode a quad — add second triangle if v3 differs from v2
      if(!isNaN(v3.x)&&(v3.x!==v2.x||v3.y!==v2.y||v3.z!==v2.z)){
        triangles.push({v0,v1:v2,v2:v3});
      }
    } else {
      i++;
    }
  }
  if(!triangles.length)throw new Error('No 3DFACE entities found in DXF. Re-export as 3DFACE from your CAD package.');
  return triangles;
}

// ══════════════════════════════════════════════════════════════
// CONNECTED COMPONENT SEPARATION
// Splits a flat triangle array into individual closed solids using
// shared-edge grouping. Two triangles are in the same component if they
// share at least one edge (within a coordinate tolerance of 0.01m).
// This allows correct per-solid inside/outside testing for DXF files
// that contain multiple wireframes (e.g. parallel vein solids).
// ══════════════════════════════════════════════════════════════

function splitSolids(triangles, tol=0.01){
  const n=triangles.length;
  if(n===0)return[];

  // Build a vertex-key → triangle index map for fast edge lookup
  function vkey(v){
    return Math.round(v.x/tol)+'|'+Math.round(v.y/tol)+'|'+Math.round(v.z/tol);
  }
  // Map each vertex key to all triangles that use it
  const vmap=new Map();
  for(let i=0;i<n;i++){
    const t=triangles[i];
    [t.v0,t.v1,t.v2].forEach(v=>{
      const k=vkey(v);
      if(!vmap.has(k))vmap.set(k,[]);
      vmap.get(k).push(i);
    });
  }

  // Build adjacency: two triangles are adjacent if they share an edge
  // (i.e. at least two vertices land in the same vertex-key buckets)
  const adj=Array.from({length:n},()=>new Set());
  for(let i=0;i<n;i++){
    const t=triangles[i];
    const candidateSets=[t.v0,t.v1,t.v2].map(v=>new Set(vmap.get(vkey(v))||[]));
    // Intersect pairs to find triangles sharing ≥2 vertices (= shared edge)
    for(let a=0;a<3;a++){
      for(const j of candidateSets[a]){
        if(j===i)continue;
        // Count shared vertex keys between triangle i and j
        const t2=triangles[j];
        const keys2=new Set([vkey(t2.v0),vkey(t2.v1),vkey(t2.v2)]);
        let shared=0;
        [t.v0,t.v1,t.v2].forEach(v=>{if(keys2.has(vkey(v)))shared++;});
        if(shared>=2){adj[i].add(j);adj[j].add(i);}
      }
    }
  }

  // BFS to label connected components
  const comp=new Int32Array(n).fill(-1);
  let cid=0;
  for(let start=0;start<n;start++){
    if(comp[start]>=0)continue;
    const queue=[start];
    comp[start]=cid;
    let qi=0;
    while(qi<queue.length){
      const cur=queue[qi++];
      for(const nb of adj[cur]){
        if(comp[nb]<0){comp[nb]=cid;queue.push(nb);}
      }
    }
    cid++;
  }

  // Group triangles by component id
  const groups=Array.from({length:cid},()=>[]);
  for(let i=0;i<n;i++)groups[comp[i]].push(triangles[i]);
  return groups; // array of triangle arrays, one per solid
}

// ══════════════════════════════════════════════════════════════
// POINT-IN-MESH  (per-solid, then union)
// Primary: 7-ray majority vote (Möller–Trumbore)
// Fallback: closest-triangle pseudonormal test
// For multi-solid files: a point is INSIDE if it is inside any solid.
// Distance is always to the nearest triangle face across ALL solids —
// no bounding-box shortcut; always exact.
// ══════════════════════════════════════════════════════════════

function buildFaceNormals(triangles){
  return triangles.map(t=>{
    const ax=t.v1.x-t.v0.x,ay=t.v1.y-t.v0.y,az=t.v1.z-t.v0.z;
    const bx=t.v2.x-t.v0.x,by=t.v2.y-t.v0.y,bz=t.v2.z-t.v0.z;
    const nx=ay*bz-az*by, ny=az*bx-ax*bz, nz=ax*by-ay*bx;
    const len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
    return{x:nx/len,y:ny/len,z:nz/len};
  });
}

const RAY_DIRS=[
  {dx:1,dy:0,dz:0},{dx:0,dy:1,dz:0},{dx:0,dy:0,dz:1},
  {dx:0.577,dy:0.577,dz:0.577},
  {dx:-0.577,dy:0.577,dz:0.577},
  {dx:0.577,dy:-0.577,dz:0.577},
  {dx:0.577,dy:0.577,dz:-0.577}
];

// Test whether a point is inside ONE closed solid (single triangle array)
function pointInOneSolid(px,py,pz,triangles,faceNormals){
  let votes=0;
  for(const {dx,dy,dz} of RAY_DIRS){
    if(raycast(px,py,pz,dx,dy,dz,triangles)%2!==0)votes++;
  }
  if(votes>=4)return true;
  if(votes<=3)return false;
  return closestNormalTest(px,py,pz,triangles,faceNormals);
}

// Test whether a point is inside ANY of the solids in the wireframe.
// Also returns the solid index it belongs to (-1 if outside all).
function pointInMeshMulti(px,py,pz,solids){
  for(let s=0;s<solids.length;s++){
    const {triangles,faceNormals}=solids[s];
    if(pointInOneSolid(px,py,pz,triangles,faceNormals))return s;
  }
  return -1; // outside all solids
}

// Nearest true triangle distance across ALL solids.
// Per-solid bbox lower-bound used to skip solids that cannot beat current minDist.
// This is correctness-preserving: bbox dist is only used to SKIP, never substituted
// for actual triangle distance. Result is always the exact nearest-triangle distance.
// Returns {dist, solidIdx} — solidIdx = index of the solid with the nearest face.
function solidBboxLB(px,py,pz,bbox){
  // Minimum possible distance from point to anything inside this bbox.
  // Returns 0 if point is inside the bbox (forces full triangle scan).
  const dx=Math.max(0,Math.max(bbox.xmin-px, px-bbox.xmax));
  const dy=Math.max(0,Math.max(bbox.ymin-py, py-bbox.ymax));
  const dz=Math.max(0,Math.max(bbox.zmin-pz, pz-bbox.zmax));
  return Math.sqrt(dx*dx+dy*dy+dz*dz);
}
function nearestTriangleDist(px,py,pz,solids){
  let minDist=Infinity,nearestSolid=0;
  for(let s=0;s<solids.length;s++){
    // If bbox lower-bound >= current best, no triangle in this solid can be closer.
    if(solidBboxLB(px,py,pz,solids[s].bbox)>=minDist)continue;
    const tris=solids[s].triangles;
    for(let t=0;t<tris.length;t++){
      const d=pointToTriangleDist(px,py,pz,tris[t].v0,tris[t].v1,tris[t].v2);
      if(d<minDist){minDist=d;nearestSolid=s;}
      if(minDist<1e-6)break; // on the surface — can't improve
    }
    if(minDist<1e-6)break;
  }
  return{dist:minDist,solidIdx:nearestSolid};
}

function closestNormalTest(px,py,pz,triangles,faceNormals){
  let minDist=Infinity,closestTri=-1;
  for(let i=0;i<triangles.length;i++){
    const d=pointToTriangleDist(px,py,pz,triangles[i].v0,triangles[i].v1,triangles[i].v2);
    if(d<minDist){minDist=d;closestTri=i;}
  }
  if(closestTri<0)return false;
  const t=triangles[closestTri];
  const n=faceNormals[closestTri];
  const tcx=(t.v0.x+t.v1.x+t.v2.x)/3;
  const tcy=(t.v0.y+t.v1.y+t.v2.y)/3;
  const tcz=(t.v0.z+t.v1.z+t.v2.z)/3;
  const dot=n.x*(px-tcx)+n.y*(py-tcy)+n.z*(pz-tcz);
  return dot<0;
}

function raycast(ox,oy,oz,dx,dy,dz,triangles){
  let count=0;
  for(let i=0;i<triangles.length;i++){
    const {v0,v1,v2}=triangles[i];
    const t=rayTriangleIntersect(ox,oy,oz,dx,dy,dz,v0,v1,v2);
    if(t!==null&&t>1e-8)count++;
  }
  return count;
}

// Möller–Trumbore ray-triangle intersection
function rayTriangleIntersect(ox,oy,oz,dx,dy,dz,v0,v1,v2){
  const EPS=1e-8;
  const e1x=v1.x-v0.x,e1y=v1.y-v0.y,e1z=v1.z-v0.z;
  const e2x=v2.x-v0.x,e2y=v2.y-v0.y,e2z=v2.z-v0.z;
  const hx=dy*e2z-dz*e2y,hy=dz*e2x-dx*e2z,hz=dx*e2y-dy*e2x;
  const a=e1x*hx+e1y*hy+e1z*hz;
  if(Math.abs(a)<EPS)return null;
  const f=1/a;
  const sx=ox-v0.x,sy=oy-v0.y,sz=oz-v0.z;
  const u=f*(sx*hx+sy*hy+sz*hz);
  if(u<0||u>1)return null;
  const qx=sy*e1z-sz*e1y,qy=sz*e1x-sx*e1z,qz=sx*e1y-sy*e1x;
  const v=f*(dx*qx+dy*qy+dz*qz);
  if(v<0||u+v>1)return null;
  const t=f*(e2x*qx+e2y*qy+e2z*qz);
  return t>EPS?t:null;
}

// Distance from point to closest point on a triangle
function pointToTriangleDist(px,py,pz,v0,v1,v2){
  // Via barycentric coordinates clamp
  const ax=v1.x-v0.x,ay=v1.y-v0.y,az=v1.z-v0.z;
  const bx=v2.x-v0.x,by=v2.y-v0.y,bz=v2.z-v0.z;
  const cx=px-v0.x,cy=py-v0.y,cz=pz-v0.z;
  const d1=ax*cx+ay*cy+az*cz;
  const d2=bx*cx+by*cy+bz*cz;
  if(d1<=0&&d2<=0)return dist3(px,py,pz,v0.x,v0.y,v0.z);
  const dx2=px-v1.x,dy2=py-v1.y,dz2=pz-v1.z;
  const d3=ax*dx2+ay*dy2+az*dz2;
  const d4=bx*dx2+by*dy2+bz*dz2;
  if(d3>=0&&d4<=d3)return dist3(px,py,pz,v1.x,v1.y,v1.z);
  const vc=d1*d4-d3*d2;
  if(vc<=0&&d1>=0&&d3<=0){const v=d1/(d1-d3);return dist3(px,py,pz,v0.x+v*ax,v0.y+v*ay,v0.z+v*az);}
  const dx3=px-v2.x,dy3=py-v2.y,dz3=pz-v2.z;
  const d5=ax*dx3+ay*dy3+az*dz3;
  const d6=bx*dx3+by*dy3+bz*dz3;
  if(d6>=0&&d5<=d6)return dist3(px,py,pz,v2.x,v2.y,v2.z);
  const vb=d5*d2-d1*d6;
  if(vb<=0&&d2>=0&&d6<=0){const w=d2/(d2-d6);return dist3(px,py,pz,v0.x+w*bx,v0.y+w*by,v0.z+w*bz);}
  const va=d3*d6-d5*d4;
  if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){const w=(d4-d3)/((d4-d3)+(d5-d6));return dist3(px,py,pz,v1.x+w*(v2.x-v1.x),v1.y+w*(v2.y-v1.y),v1.z+w*(v2.z-v1.z));}
  const denom=1/(va+vb+vc);
  const s=vb*denom,t2=vc*denom;
  return dist3(px,py,pz,v0.x+s*ax+t2*bx,v0.y+s*ay+t2*by,v0.z+s*az+t2*bz);
}

function dist3(x1,y1,z1,x2,y2,z2){return Math.sqrt((x1-x2)**2+(y1-y2)**2+(z1-z2)**2);}

// ══════════════════════════════════════════════════════════════
// DRILLING FILE IMPORT
// ══════════════════════════════════════════════════════════════
function setImportMode(mode){
  S.importMode=mode;
  ['multi','point'].forEach(m=>{document.getElementById('imt-'+m).classList.toggle('active',m===mode);});
  document.getElementById('step2-multi').style.display=mode==='multi'?'':'none';
  document.getElementById('step2-point').style.display=mode==='point'?'':'none';
}
function dzClick(key){document.getElementById('fi-'+key).click();}
function dzDrag(e,key){e.preventDefault();document.getElementById('dz-'+key).classList.add('drag-over');}
function dzLeave(key){document.getElementById('dz-'+key).classList.remove('drag-over');}
function dzDrop(e,key){e.preventDefault();dzLeave(key);const f=e.dataTransfer.files[0];if(f){if(key==='point')fileChangePoint({target:{files:[f]}});else fileChange({target:{files:[f]}},key);}}
function dzDropPoint(e){e.preventDefault();dzLeave('point');const f=e.dataTransfer.files[0];if(f)fileChangePoint({target:{files:[f]}});}

function fileChange(e,key){
  const f=e.target.files[0];if(!f)return;
  loadFile(f,key);
}
function loadFile(file,key){
  const reader=new FileReader();
  reader.onload=evt=>{
    const parsed=parseCSV(evt.target.result);
    S.files[key]={name:file.name,...parsed};
    updateDZ(key,parsed,file.name);
    if(key==='collar')S.mappings.collar=guessMap(parsed.headers,'collar');
    if(key==='survey')S.mappings.survey=guessMap(parsed.headers,'survey');
    if(key==='assay'){
      S.mappings.assay=guessMap(parsed.headers,'assay');
      const skip=/^(bhid|holeid|hole_id|id|from|to)$/i;
      S.assayFieldSel=new Set(parsed.headers.filter(h=>!skip.test(h)));
    }
    if(['e1','e2','e3'].includes(key)){
      const skip=/^(bhid|holeid|hole_id|id|from|to)$/i;
      S.extraFieldSel[key]=new Set(parsed.headers.filter(h=>!skip.test(h)));
    }
  };
  reader.readAsText(file);
}
function updateDZ(key,parsed,name){
  const dz=document.getElementById('dz-'+key);if(!dz)return;
  dz.classList.add('loaded');dz.classList.remove('drag-over','opt');
  document.getElementById('di-'+key).textContent='✓';
  document.getElementById('ds-'+key).textContent=name;
  document.getElementById('dc-'+key).textContent=parsed.rows.length+' records · '+parsed.headers.length+' fields';
}
function parseCSV(text){
  // Strip BOM
  if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
  const lines=text.trim().split(/\r?\n/);
  if(lines.length<2)return{headers:[],rows:[]};
  const parseLine=line=>{const r=[];let c='',q=false;for(let i=0;i<line.length;i++){if(line[i]==='"'){q=!q;}else if(line[i]===','&&!q){r.push(c.trim());c='';}else c+=line[i];}r.push(c.trim());return r;};
  const headers=parseLine(lines[0]).map(h=>h.replace(/^"|"$/g,'').trim());
  const rows=lines.slice(1).filter(l=>l.trim()).map(l=>{const cols=parseLine(l);const o={};headers.forEach((h,i)=>o[h]=(cols[i]||'').replace(/^"|"$/g,'').trim());return o;});
  return{headers,rows};
}
function guessMap(headers,type){
  const hl=headers.map(h=>h.toLowerCase());
  const find=(...pats)=>{for(const p of pats){const i=hl.findIndex(h=>new RegExp(p,'i').test(h));if(i>=0)return headers[i];}return '';};
  if(type==='collar')return{holeid:find('^bhid$','hole_?id','holeid','^id$'),x:find('^x$','easting','east','utm_?e'),y:find('^y$','northing','north','utm_?n'),z:find('^z$','elev','rl','altitude'),maxdepth:find('max_?depth','total_?depth','eoh')};
  if(type==='survey')return{holeid:find('^bhid$','hole_?id','holeid','^id$'),depth:find('^at$','^depth$','md$'),dip:find('dip'),azimuth:find('az','bear','azm')};
  if(type==='assay')return{holeid:find('^bhid$','hole_?id','holeid','^id$'),from:find('^from$'),to:find('^to$')};
  return{};
}

function nextStep2Multi(){
  if(!S.files.collar||!S.files.survey||!S.files.assay){alert('Please load Collar, Survey, and Assay files before proceeding.');return;}
  document.getElementById('nav-2').classList.add('done');
  goStep(3);
}

// ─── UNIFIED POINT FILE ───
function fileChangePoint(e){
  const f=e.target.files[0];if(!f)return;
  const ext=f.name.split('.').pop().toLowerCase();
  if(['xlsx','xls'].includes(ext)){parseXLSXPoint(f);}
  else{const r=new FileReader();r.onload=ev=>{const p=parseCSV(ev.target.result);onPointFileLoaded(f.name,p.headers,p.rows);};r.readAsText(f);}
}
function parseXLSXPoint(file){
  const r=new FileReader();
  r.onload=evt=>{
    try{
      const wb=XLSX.read(evt.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const data=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      if(data.length<2){alert('No data found in Excel file.');return;}
      const headers=data[0].map(h=>String(h).trim());
      const rows=data.slice(1).filter(r=>r.some(c=>c!=='')).map(r=>{const o={};headers.forEach((h,i)=>o[h]=r[i]!=null?String(r[i]).trim():'');return o;});
      onPointFileLoaded(file.name,headers,rows);
    }catch(err){alert('XLSX parse error: '+err.message);}
  };
  r.readAsArrayBuffer(file);
}
function onPointFileLoaded(filename,headers,rows){
  const validH=headers.filter(h=>h&&h.trim()!='');
  if(!validH.length){alert('No valid column headers found.');return;}
  const filteredRows=rows.map(r=>{const o={};validH.forEach(h=>{const v=r[h];o[h]=(v!=null&&v!=='')?String(v).trim():null;});return o;}).filter(r=>validH.some(h=>r[h]!=null));
  S.pointHeaders=validH;S.pointRows=filteredRows;S.files.point={name:filename,headers:validH,rows:filteredRows};
  const hLow=validH.map(h=>h.toLowerCase());
  function guess(...pats){for(const p of pats){const i=hLow.findIndex(h=>h===p||h.includes(p));if(i>=0)return validH[i];}return '';}
  S.pointMap.holeid=guess('hole-id','holeid','hole_id','bhid','dhid','id');
  S.pointMap.x=guess('x_coord','easting','east','utm_e','x');
  S.pointMap.y=guess('y_coord','northing','north','utm_n','y');
  S.pointMap.z=guess('z_coord','elevation','elev','rl','z');
  S.pointMap.from=guess('from');S.pointMap.to=guess('to');
  S.pointMap.hasDepths=!!(S.pointMap.from&&S.pointMap.to);
  S.pointNumSel=new Set();S.pointCatSel=new Set();
  const coordCols=new Set([S.pointMap.holeid,S.pointMap.x,S.pointMap.y,S.pointMap.z,S.pointMap.from,S.pointMap.to].filter(Boolean));
  validH.forEach(h=>{
    if(coordCols.has(h))return;
    const vals=filteredRows.slice(0,200).map(r=>r[h]).filter(v=>v!=null);
    const numCnt=vals.filter(v=>!isNaN(parseFloat(v))).length;
    if(numCnt>vals.length*0.4)S.pointNumSel.add(h);
    else if(vals.filter(v=>isNaN(parseFloat(v))).length>3)S.pointCatSel.add(h);
  });
  const dz=document.getElementById('dz-point');
  dz.classList.add('loaded');
  document.getElementById('di-point').textContent='✓';
  document.getElementById('ds-point').textContent=filename;
  document.getElementById('dc-point').textContent=filteredRows.length+' rows · '+validH.length+' columns';
  const btn=document.getElementById('btn-point-next');
  btn.style.opacity='1';btn.style.pointerEvents='auto';
  buildPointMappingUI();
}
function nextStepPoint(){
  if(!S.files.point){alert('Please upload a point file first.');return;}
  S.importMode='point';synthesisePointFileData();
  document.getElementById('nav-2').classList.add('done');
  goStep(4);
}
function buildPointMappingUI(){
  const cont=document.getElementById('point-mapping-container');
  const headers=S.pointHeaders;
  if(!headers.length){cont.innerHTML='';return;}
  const mkSel=(key,label)=>{
    const val=S.pointMap[key]||'';
    const opts=headers.map(h=>`<option value="${h}"${h===val?' selected':''}>${h}</option>`).join('');
    return `<div class="map-row"><div class="map-lbl">${label}</div><select class="map-sel" onchange="S.pointMap['${key}']=this.value"><option value="">-- select --</option>${opts}</select></div>`;
  };
  function attrItem(h,selSet,prefix){
    const sel=selSet.has(h);
    return `<div class="attr-col-item${sel?' selected':''}" id="paci-${prefix}-${h.replace(/[^a-z0-9]/gi,'_')}" onclick="togglePAttrCol('${h}','${prefix}')"><div class="attr-col-check">${sel?'✓':''}</div><div class="attr-col-name">${h}</div></div>`;
  }
  const coordCols=new Set(Object.values(S.pointMap));
  const attrCols=headers.filter(h=>h&&!coordCols.has(h));
  cont.innerHTML=`
    <div class="map-section" style="margin-bottom:16px">
      <div class="map-hdr"><span class="map-hdr-title">REQUIRED FIELD MAPPING</span><span class="map-hdr-info">${S.files.point.name} · ${S.pointRows.length} rows</span></div>
      <div class="map-body">
        ${[{key:'holeid',label:'HOLE ID'},{key:'x',label:'EASTING (X)'},{key:'y',label:'NORTHING (Y)'},{key:'z',label:'ELEVATION (Z)'}].map(f=>mkSel(f.key,f.label)).join('')}
      </div>
      <div style="padding:14px 16px;border-top:1px solid var(--border2)">
        <div style="font-size:9px;font-family:var(--font-mono);letter-spacing:.1em;color:var(--text-dim);margin-bottom:8px">DEPTH COLUMNS</div>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <div class="ro${S.pointMap.hasDepths?' sel':''}" style="flex:1;padding:7px 10px" onclick="toggleDepthMode(true)"><div class="ro-dot"></div><div><div class="ro-text">Has FROM / TO depths</div></div></div>
          <div class="ro${!S.pointMap.hasDepths?' sel':''}" style="flex:1;padding:7px 10px" onclick="toggleDepthMode(false)"><div class="ro-dot"></div><div><div class="ro-text">XYZ centrepoints only</div></div></div>
        </div>
        ${S.pointMap.hasDepths?`<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${[{key:'from',label:'FROM DEPTH'},{key:'to',label:'TO DEPTH'}].map(f=>mkSel(f.key,f.label)).join('')}</div>`:'<p style="font-size:11px;color:var(--text-dim);font-style:italic">Interval centroids used directly as XYZ sample positions.</p>'}
      </div>
    </div>
    <div class="map-section" style="margin-bottom:16px">
      <div class="attr-hdr"><span class="attr-hdr-title">◆ ASSAY / GRADE COLUMNS</span><div class="attr-actions"><button class="attr-btn" onclick="setAllPCols('num',true)">SELECT ALL</button><button class="attr-btn" onclick="setAllPCols('num',false)">CLEAR ALL</button></div></div>
      <div class="attr-body"><div class="attr-col-grid">${[...S.pointNumSel,...attrCols.filter(h=>!S.pointNumSel.has(h)&&!S.pointCatSel.has(h))].filter((h,i,a)=>a.indexOf(h)===i).map(h=>attrItem(h,S.pointNumSel,'num')).join('')}</div></div>
    </div>`;
}
function toggleDepthMode(v){S.pointMap.hasDepths=v;if(!v){S.pointMap.from='';S.pointMap.to='';}buildPointMappingUI();}
function togglePAttrCol(h,prefix){
  const selSet=prefix==='num'?S.pointNumSel:S.pointCatSel;
  const id='paci-'+prefix+'-'+h.replace(/[^a-z0-9]/gi,'_');
  const el=document.getElementById(id);if(!el)return;
  if(selSet.has(h)){selSet.delete(h);el.classList.remove('selected');el.querySelector('.attr-col-check').textContent='';}
  else{selSet.add(h);el.classList.add('selected');el.querySelector('.attr-col-check').textContent='✓';}
}
function setAllPCols(prefix,val){
  const selSet=prefix==='num'?S.pointNumSel:S.pointCatSel;
  document.querySelectorAll(`[id^="paci-${prefix}-"]`).forEach(el=>{
    const h=el.querySelector('.attr-col-name').textContent;
    if(val){selSet.add(h);el.classList.add('selected');el.querySelector('.attr-col-check').textContent='✓';}
    else{selSet.delete(h);el.classList.remove('selected');el.querySelector('.attr-col-check').textContent='';}
  });
}

// ── STEP 3: MAPPING UI ──
function buildMappingUI(){
  const cont=document.getElementById('mapping-container');
  cont.innerHTML='';
  if(S.importMode==='point')return;
  const fldLabels={holeid:'HOLE ID',x:'EASTING (X)',y:'NORTHING (Y)',z:'ELEVATION (Z)',maxdepth:'MAX DEPTH',depth:'DEPTH / AT',dip:'DIP',azimuth:'AZIMUTH',from:'FROM',to:'TO'};
  const buildCore=(fileKey,label,mapKey,required)=>{
    const f=S.files[fileKey];if(!f)return;
    let rows='';
    Object.keys(S.mappings[mapKey]).forEach(field=>{
      const val=S.mappings[mapKey][field]||'';
      const opts=f.headers.map(h=>`<option value="${h}"${h===val?' selected':''}>${h}</option>`).join('');
      rows+=`<div class="map-row"><div class="map-lbl">${required.includes(field)?'* ':''}${fldLabels[field]||field.toUpperCase()}</div><select class="map-sel" onchange="S.mappings.${mapKey}['${field}']=this.value"><option value="">-- select --</option>${opts}</select></div>`;
    });
    cont.innerHTML+=`<div class="map-section"><div class="map-hdr"><span class="map-hdr-title">${label}</span><span class="map-hdr-info">${f.name} — ${f.rows.length} rows</span></div><div class="map-body">${rows}</div></div>`;
  };
  buildCore('collar','COLLAR FILE','collar',['holeid','x','y','z']);
  buildCore('survey','SURVEY FILE','survey',['holeid','depth','dip','azimuth']);
  buildCore('assay','ASSAY FILE','assay',['holeid','from','to']);
  // Assay column picker
  if(S.files.assay){
    const skip=/^(bhid|holeid|hole_id|id|from|to)$/i;
    const aCols=S.files.assay.headers.filter(h=>!skip.test(h));
    const checks=aCols.map(h=>{const sel=S.assayFieldSel.has(h);return `<div class="attr-col-item${sel?' selected':''}" id="maci-${h.replace(/[^a-z0-9]/gi,'_')}" onclick="toggleAssayField('${h}',this)"><div class="attr-col-check">${sel?'✓':''}</div><div class="attr-col-name">${h}</div></div>`;}).join('');
    cont.innerHTML+=`<div class="map-section"><div class="attr-hdr"><span class="attr-hdr-title">◆ ASSAY COLUMNS TO ANALYSE</span><div class="attr-actions"><button class="attr-btn" onclick="setAllAssay(true)">SELECT ALL</button><button class="attr-btn" onclick="setAllAssay(false)">CLEAR ALL</button></div></div><div class="attr-col-grid" style="padding:14px 16px">${checks}</div></div>`;
  }
  ['e1','e2','e3'].forEach((key,i)=>{
    const f=S.files[key];if(!f)return;
    const skip=/^(bhid|holeid|hole_id|id|from|to)$/i;
    const sCols=f.headers.filter(h=>!skip.test(h));
    const checks=sCols.map(h=>{const sel=S.extraFieldSel[key].has(h);return `<div class="attr-col-item${sel?' selected':''}" id="mci-${key}-${h.replace(/[^a-z0-9]/gi,'_')}" onclick="toggleField('${key}','${h}',this)"><div class="attr-col-check">${sel?'✓':''}</div><div class="attr-col-name">${h}</div></div>`;}).join('');
    cont.innerHTML+=`<div class="map-section"><div class="attr-hdr"><span class="attr-hdr-title">INTERVAL FILE ${i+1} — ${f.name}</span></div><div class="attr-col-grid" style="padding:14px 16px">${checks}</div></div>`;
  });
}
function toggleAssayField(h,el){if(S.assayFieldSel.has(h)){S.assayFieldSel.delete(h);el.classList.remove('selected');el.querySelector('.attr-col-check').textContent='';}else{S.assayFieldSel.add(h);el.classList.add('selected');el.querySelector('.attr-col-check').textContent='✓';}}
function setAllAssay(val){document.querySelectorAll('[id^="maci-"]').forEach(el=>{const h=el.querySelector('.attr-col-name').textContent;if(val){S.assayFieldSel.add(h);el.classList.add('selected');el.querySelector('.attr-col-check').textContent='✓';}else{S.assayFieldSel.delete(h);el.classList.remove('selected');el.querySelector('.attr-col-check').textContent='';}});}
function toggleField(key,field,el){if(S.extraFieldSel[key].has(field)){S.extraFieldSel[key].delete(field);el.classList.remove('selected');el.querySelector('.attr-col-check').textContent='';}else{S.extraFieldSel[key].add(field);el.classList.add('selected');el.querySelector('.attr-col-check').textContent='✓';}}

// ── OPTIONS ──
function selRo(group,val){
  document.querySelectorAll(`[id^="ro-${group}-"]`).forEach(e=>e.classList.remove('sel'));
  const el=document.getElementById(`ro-${group}-${val}`);if(el)el.classList.add('sel');
  document.querySelectorAll(`[id^="sub-${group}-"]`).forEach(e=>e.classList.remove('vis'));
  const sub=document.getElementById(`sub-${group}-${val}`);if(sub)sub.classList.add('vis');
  if(group==='ds')S.opts.ds=val;
  if(group==='co')S.opts.co=val;
  if(group==='bin')S.opts.bin=val;
  if(group==='sign')S.opts.sign=val;
  if(group==='mg')S.opts.mg=val;
}

// ── RUN SUMMARY ──
// ── BOUNDARY INTENT ──
function selIntent(val){
  S.opts.intent=val;
  ['grade','mineralisation','domain'].forEach(v=>{
    document.getElementById('ro-intent-'+v).classList.toggle('sel',v===val);
  });
}

function updateIntentThreshFields(){
  const cont=document.getElementById('intent-thresh-fields');
  if(!cont)return;
  // Collect assay variables from current selection
  const metals=[];
  if(S.importMode==='multi'){
    const af=S.files.assay;
    if(af&&af.headers){
      const ignore=new Set([S.mappings.assay.holeid,S.mappings.assay.from,S.mappings.assay.to,'']);
      af.headers.forEach(h=>{if(!ignore.has(h)&&S.assayFieldSel.has(h))metals.push(h);});
      // If none selected yet, show all non-required
      if(metals.length===0)af.headers.forEach(h=>{if(!ignore.has(h))metals.push(h);});
    }
  } else {
    S.pointHeaders.forEach(h=>{
      const pm=S.pointMap;
      const ignore=new Set([pm.holeid,pm.x,pm.y,pm.z,pm.from,pm.to,'']);
      if(!ignore.has(h))metals.push(h);
    });
  }
  if(metals.length===0){
    cont.innerHTML='<p style="font-size:10px;color:var(--text-dim);font-family:var(--font-mono)">Complete field mapping first — threshold fields will appear here.</p>';
    return;
  }
  cont.innerHTML=metals.map(m=>`
    <div style="display:flex;flex-direction:column;gap:4px">
      <label style="font-size:9px;letter-spacing:.12em;color:var(--gold);font-family:var(--font-mono)">${m} THRESHOLD</label>
      <div style="display:flex;align-items:center;gap:5px">
        <input type="number" class="intent-thresh-inp ctrl-inp" data-metal="${m}"
          value="${S.opts.intentThresh&&S.opts.intentThresh[m]!=null?S.opts.intentThresh[m]:''}"
          min="0" step="0.01" placeholder="e.g. 0.5"
          style="width:90px;background:var(--dark);border:1px solid var(--border2);color:var(--text);padding:6px 8px;font-family:var(--font-mono);font-size:11px">
        <span style="font-size:10px;color:var(--text-dim);font-family:var(--font-mono)">cut-off</span>
      </div>
    </div>`).join('');
}

function buildRunSummary(){
  S.opts.coLen=parseFloat(document.getElementById('inp-co-len').value)||2;
  S.opts.binWidth=parseFloat(document.getElementById('inp-bin-width').value)||5;
  S.opts.maxDist=parseFloat(document.getElementById('inp-max-dist').value)||0;
  S.opts.mg=S.opts.mg||'zero';
  // Capture boundary intent thresholds
  S.opts.intentThresh={};
  document.querySelectorAll('.intent-thresh-inp').forEach(inp=>{
    const v=parseFloat(inp.value);
    if(!isNaN(v)&&v>=0)S.opts.intentThresh[inp.dataset.metal]=v;
  });
  document.getElementById('run-summary').innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <div>
        <div style="font-size:9px;letter-spacing:.15em;color:var(--gold);font-family:var(--font-mono);margin-bottom:12px;border-bottom:1px solid var(--border2);padding-bottom:7px">FILES LOADED</div>
        <div style="font-size:12px;color:var(--text-dim);line-height:2;font-family:var(--font-mono)">
          <span style="color:var(--green)">✓</span> Wireframe: <span style="color:var(--text)">${S.wireframe?S.wireframe.name:'—'}</span> (${S.wireframe?S.wireframe.faceCount+' triangles':'—'})<br>
          ${S.importMode==='point'?`<span style="color:var(--green)">✓</span> Point file: <span style="color:var(--text)">${S.files.point?S.files.point.name:'—'}</span>`:
          `<span style="color:var(--green)">✓</span> Collar: <span style="color:var(--text)">${S.files.collar?S.files.collar.name:'—'}</span><br>
           <span style="color:var(--green)">✓</span> Survey: <span style="color:var(--text)">${S.files.survey?S.files.survey.name:'—'}</span><br>
           <span style="color:var(--green)">✓</span> Assay: <span style="color:var(--text)">${S.files.assay?S.files.assay.name:'—'}</span>`}
        </div>
      </div>
      <div>
        <div style="font-size:9px;letter-spacing:.15em;color:var(--gold);font-family:var(--font-mono);margin-bottom:12px;border-bottom:1px solid var(--border2);padding-bottom:7px">CONFIGURATION</div>
        <div style="font-size:12px;color:var(--text-dim);line-height:2;font-family:var(--font-mono)">
          Desurvey: <span style="color:var(--text)">${S.opts.ds==='none'?'Pre-computed XYZ':S.opts.ds==='mid'?'Mid-point':'Tangential'}</span><br>
          Compositing: <span style="color:var(--text)">${S.opts.co==='none'?'None (raw)':S.opts.co==='auto'?'Auto-detect':S.opts.coLen+'m fixed'}</span><br>
          Blank assays: <span style="color:var(--text)">${S.opts.mg==='zero'?'Treated as zero':S.opts.mg==='dl'?'Half detection limit':'Excluded'}</span><br>
          Bin width: <span style="color:var(--text)">${S.opts.bin==='auto'?'Auto-calculated':S.opts.binWidth+'m fixed'}</span><br>
          Sign convention: <span style="color:var(--text)">${S.opts.sign==='in-pos'?'Inside = positive':'Outside = positive'}</span><br>
          Boundary intent: <span style="color:var(--text)">${S.opts.intent==='grade'?'Grade threshold':S.opts.intent==='mineralisation'?'Mineralisation envelope':'Geological domain'}</span>${S.opts.intent==='grade'&&Object.keys(S.opts.intentThresh||{}).length>0?'<br><span style="color:var(--text-dim)">Thresholds: '+Object.entries(S.opts.intentThresh).map(([k,v])=>k+'≥'+v).join(', ')+'</span>':''}
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// SYNTHESISE POINT FILE DATA (mirror of geocore analytics)
// ══════════════════════════════════════════════════════════════
function synthesisePointFileData(){
  const rows=S.pointRows;const pm=S.pointMap;
  const numCols=[...S.pointNumSel];const hasDepths=pm.hasDepths;
  // Synthetic from/to if no depths
  const synthFromTo={};
  if(!hasDepths){
    const holeRowsMap={};
    rows.forEach((r,ri)=>{
      const hid=r[pm.holeid];if(!hid)return;
      r._ri=ri;
      if(!holeRowsMap[hid])holeRowsMap[hid]=[];
      holeRowsMap[hid].push(r);
    });
    Object.entries(holeRowsMap).forEach(([,hrows])=>{
      hrows.forEach((r,i)=>{
        const prev=hrows[i-1];const next=hrows[i+1];
        const dPrev=prev?dist3(parseFloat(r[pm.x]),parseFloat(r[pm.y]),parseFloat(r[pm.z]),parseFloat(prev[pm.x]),parseFloat(prev[pm.y]),parseFloat(prev[pm.z])):null;
        const dNext=next?dist3(parseFloat(r[pm.x]),parseFloat(r[pm.y]),parseFloat(r[pm.z]),parseFloat(next[pm.x]),parseFloat(next[pm.y]),parseFloat(next[pm.z])):null;
        const hp=dPrev!=null?dPrev/2:dNext!=null?dNext/2:1;
        const hn=dNext!=null?dNext/2:dPrev!=null?dPrev/2:1;
        let cum=0;
        if(i===0){hrows[0]._cumDep=0;}else{hrows[i]._cumDep=hrows[i-1]._cumDep+dist3(parseFloat(r[pm.x]),parseFloat(r[pm.y]),parseFloat(r[pm.z]),parseFloat(prev[pm.x]),parseFloat(prev[pm.y]),parseFloat(prev[pm.z]));}
        synthFromTo[r._ri]={from:Math.max(0,hrows[i]._cumDep-hp),to:hrows[i]._cumDep+hn};
      });
      if(hrows.length>0)synthFromTo[hrows[0]._ri].from=0;
    });
  }
  const collarMap={};
  rows.forEach((r,ri)=>{const hid=r[pm.holeid];if(!hid||collarMap[hid])return;collarMap[hid]={holeid:hid,x:r[pm.x],y:r[pm.y],z:r[pm.z],maxdepth:0};});
  S.files.collar={name:'(from point file)',headers:['holeid','x','y','z','maxdepth'],rows:Object.values(collarMap)};
  S.mappings.collar={holeid:'holeid',x:'x',y:'y',z:'z',maxdepth:'maxdepth'};
  S.files.survey={name:'(synthetic)',headers:['holeid','depth','dip','azimuth'],rows:Object.values(collarMap).map(r=>({holeid:r.holeid,depth:0,dip:-90,azimuth:0}))};
  S.mappings.survey={holeid:'holeid',depth:'depth',dip:'dip',azimuth:'azimuth'};
  const assayHeaders=['holeid','from','to',...numCols];
  S.files.assay={name:'(from point file)',headers:assayHeaders,rows:rows.map((r,ri)=>{
    const fv=hasDepths?r[pm.from]:(synthFromTo[ri]?String(synthFromTo[ri].from):'0');
    const tv=hasDepths?r[pm.to]:(synthFromTo[ri]?String(synthFromTo[ri].to):'1');
    const o={holeid:r[pm.holeid],from:fv,to:tv};
    numCols.forEach(c=>{let v=r[c];if(typeof v==='string'&&v.startsWith('<')){const n=parseFloat(v.slice(1));v=isNaN(n)?null:String(n/2);}o[c]=v;});
    return o;
  })};
  S.mappings.assay={holeid:'holeid',from:'from',to:'to'};
  S.assayFieldSel=new Set(numCols);
  S.opts.ds='none';
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
const sl=ms=>new Promise(r=>setTimeout(r,ms));
function setP(msg,pct){document.getElementById('prog-fill').style.width=pct+'%';document.getElementById('prog-pct').textContent=pct+'%';document.getElementById('prog-msg').textContent=msg;}
function fmt(v,d=2){if(v===undefined||v===null||isNaN(v))return'—';const n=parseFloat(v);if(Math.abs(n)>=1000)return n.toFixed(0);if(Math.abs(n)>=1)return n.toFixed(2);return n.toFixed(d);}
function pmean(vals){return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:NaN;}
function pstd(vals,m){const mv=m??pmean(vals);return Math.sqrt(vals.reduce((a,b)=>a+(b-mv)**2,0)/vals.length);}
function ppct(sorted,p){if(!sorted.length)return NaN;const i=(p/100)*(sorted.length-1);const lo=Math.floor(i),hi=Math.ceil(i);return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);}

// ══════════════════════════════════════════════════════════════
// DESURVEYING
// ══════════════════════════════════════════════════════════════
function degreesToRad(d){return d*Math.PI/180;}
function desurveyHole(collarX,collarY,collarZ,surveyRows,from,to,method){
  // Returns {cx,cy,cz} centroid of interval
  if(method==='none'){
    // XYZ already in collar as if vertical — just use collar coords + depth (rough)
    return{cx:collarX,cy:collarY,cz:collarZ-(from+to)/2};
  }
  // Build survey table sorted by depth
  const sv=[...surveyRows].sort((a,b)=>a.depth-b.depth);
  if(!sv.length)return{cx:collarX,cy:collarY,cz:collarZ};
  // Add collar at depth=0 if not present
  if(sv[0].depth>0)sv.unshift({depth:0,dip:sv[0].dip,azimuth:sv[0].azimuth});

  function posAtDepth(d){
    const lastSv=sv[sv.length-1];
    // Clamp integration depth to last survey station; handle extrapolation separately
    const dInteg=Math.min(d,lastSv.depth);
    // Find bounding survey stations
    let i=sv.length-2;
    for(let j=0;j<sv.length-1;j++){if(sv[j].depth<=dInteg&&sv[j+1].depth>dInteg){i=j;break;}}
    const s0=sv[i],s1=sv[i+1<sv.length?i+1:i];
    const segLen=s1.depth-s0.depth||1;
    const t=Math.min(1,Math.max(0,(dInteg-s0.depth)/segLen));
    let dip,az;
    if(method==='mid'){
      dip=(s0.dip+s1.dip)/2;az=(s0.azimuth+s1.azimuth)/2;
    }else{
      dip=s0.dip;az=s0.azimuth;
    }
    const dipR=degreesToRad(dip);const azR=degreesToRad(az);
    const len=dInteg-s0.depth;
    // Integrate from collar to last survey station (or dInteg if shallower)
    let x=collarX,y=collarY,z=collarZ;
    for(let k=0;k<=i;k++){
      const a=sv[k],b=sv[k+1<sv.length?k+1:k];
      const dl=Math.min(b.depth,dInteg)-a.depth;if(dl<=0)continue;
      let dd=a.dip,daz=a.azimuth;
      if(method==='mid'){dd=(a.dip+b.dip)/2;daz=(a.azimuth+b.azimuth)/2;}
      const dr=degreesToRad(dd);const ar=degreesToRad(daz);
      x+=dl*Math.cos(dr)*Math.sin(ar);
      y+=dl*Math.cos(dr)*Math.cos(ar);
      z+=dl*Math.sin(dr);
      if(b.depth>=dInteg)break;
    }
    // Extrapolate beyond last survey station using last survey dip/azimuth
    if(d>lastSv.depth){
      const remaining=d-lastSv.depth;
      const lastDip=lastSv.dip,lastAz=lastSv.azimuth;
      const dr=degreesToRad(lastDip);const ar=degreesToRad(lastAz);
      x+=remaining*Math.cos(dr)*Math.sin(ar);
      y+=remaining*Math.cos(dr)*Math.cos(ar);
      z+=remaining*Math.sin(dr);
    }
    return{x,y,z};
  }
  const pFrom=posAtDepth(from);
  const pTo=posAtDepth(to);
  return{cx:(pFrom.x+pTo.x)/2,cy:(pFrom.y+pTo.y)/2,cz:(pFrom.z+pTo.z)/2};
}

// ══════════════════════════════════════════════════════════════
// MAIN ANALYSIS ENGINE
// ══════════════════════════════════════════════════════════════
async function startAnalysis(){
  if(!S.wireframe){alert('No wireframe loaded.');return;}
  document.getElementById('run-btn').disabled=true;
  showScreen('progress-screen');
  try{
    const R=await runBoundaryAnalysis();
    S.results=R;
    buildResultsUI(R);
    showScreen('results-screen');
  }catch(err){
    alert('Analysis failed: '+err.message+'\n\nCheck the console for details.');
    console.error(err);
    showScreen('app-screen');
    document.getElementById('run-btn').disabled=false;
  }
}

async function runBoundaryAnalysis(){
  const {files,mappings,opts,wireframe}=S;
  setP('Validating inputs...',3);await sl(200);

  // ── Build collar map
  const collarMap={};
  files.collar.rows.forEach(r=>{
    const id=r[mappings.collar.holeid];
    if(!id)return;
    const x=parseFloat(r[mappings.collar.x]);
    const y=parseFloat(r[mappings.collar.y]);
    const z=parseFloat(r[mappings.collar.z]);
    collarMap[id]={x:isNaN(x)?null:x, y:isNaN(y)?null:y, z:isNaN(z)?null:z};
  });

  // Validate collar coords
  const badCollars=Object.values(collarMap).filter(c=>c.x===null||c.y===null||c.z===null).length;
  if(badCollars>0)console.warn(`${badCollars} collar(s) have missing X/Y/Z coordinates — check field mapping`);

  // ── Build survey map (hole → sorted survey rows)
  setP('Loading survey data...',8);await sl(150);
  const surveyMap={};
  files.survey.rows.forEach(r=>{
    const id=r[mappings.survey.holeid];if(!id)return;
    if(!surveyMap[id])surveyMap[id]=[];
    const depth=parseFloat(r[mappings.survey.depth]);
    const dip=parseFloat(r[mappings.survey.dip]);
    const az=parseFloat(r[mappings.survey.azimuth]);
    surveyMap[id].push({depth:isNaN(depth)?0:depth, dip:isNaN(dip)?-90:dip, azimuth:isNaN(az)?0:az});
  });
  Object.values(surveyMap).forEach(sv=>sv.sort((a,b)=>a.depth-b.depth));

  // ── Detect metals
  setP('Detecting assay columns...',12);await sl(150);
  const skipF=[mappings.assay.holeid,mappings.assay.from,mappings.assay.to].map(s=>(s||'').toLowerCase());
  const metals=files.assay.headers.filter(h=>{
    if(skipF.includes(h.toLowerCase()))return false;
    if(S.assayFieldSel.size>0&&!S.assayFieldSel.has(h))return false;
    const v=files.assay.rows.map(r=>parseFloat(r[h])).filter(v=>!isNaN(v));
    return v.length>files.assay.rows.length*0.1;
  });
  if(!metals.length)throw new Error('No numeric assay columns detected. Check field mapping and assay column selection.');

  // ── Build intervals with missing-value handling
  setP('Parsing assay intervals...',18);await sl(200);

  // Determine per-metal minimum detected value for half-DL mode
  const metalMinDetected={};
  metals.forEach(m=>{
    const vals=files.assay.rows.map(r=>parseFloat(r[m])).filter(v=>!isNaN(v)&&v>0);
    metalMinDetected[m]=vals.length?Math.min.apply(null,vals):0.001;
  });
  const userDL=parseFloat(document.getElementById('inp-mg-dl').value);
  const mgMode=opts.mg||'zero';

  function resolveMissing(raw,m){
    const v=parseFloat(raw);
    if(!isNaN(v))return v;                          // valid number (including 0)
    if(mgMode==='zero')return 0;                    // blank → zero
    if(mgMode==='dl'){
      const dl=!isNaN(userDL)&&userDL>0?userDL:metalMinDetected[m];
      return dl/2;
    }
    return NaN;                                     // 'exclude' → drop
  }

  const rawIntervals=files.assay.rows.map(r=>({
    holeid:r[mappings.assay.holeid],
    from:parseFloat(r[mappings.assay.from]),
    to:parseFloat(r[mappings.assay.to]),
    vals:Object.fromEntries(metals.map(m=>[m,resolveMissing(r[m],m)]))
  })).filter(i=>i.holeid&&!isNaN(i.from)&&!isNaN(i.to)&&i.to>i.from);

  const holeIds=[...new Set(rawIntervals.map(i=>i.holeid))];

  // ── Compositing
  setP('Compositing intervals...',26);await sl(250);
  const lenCounts={};
  rawIntervals.forEach(i=>{const k=(i.to-i.from).toFixed(2);lenCounts[k]=(lenCounts[k]||0)+1;});
  const commonLen=parseFloat(Object.entries(lenCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||1);
  const compLen=opts.co==='none'?0:opts.co==='auto'?(commonLen<=1?2:Math.ceil(commonLen)*2):(opts.coLen||2);

  const composites=[];
  if(opts.co==='none'){
    rawIntervals.forEach(i=>{
      const c=collarMap[i.holeid];
      if(!c||c.x===null)return;
      composites.push({holeid:i.holeid,from:i.from,to:i.to,...i.vals,
        _x:c.x,_y:c.y,_z:c.z,_survey:surveyMap[i.holeid]||[]});
    });
  } else {
    holeIds.forEach(hid=>{
      const c=collarMap[hid];
      if(!c||c.x===null)return;
      const hInts=rawIntervals.filter(i=>i.holeid===hid).sort((a,b)=>a.from-b.from);
      if(!hInts.length)return;
      const maxTo=Math.max.apply(null,hInts.map(i=>i.to));
      let cur=hInts[0].from;
      while(cur<maxTo){
        const end=Math.min(cur+compLen,maxTo);
        const inRange=hInts.filter(i=>i.to>cur&&i.from<end);
        if(!inRange.length){cur=end;continue;}
        const comp={holeid:hid,from:cur,to:end,_x:c.x,_y:c.y,_z:c.z,_survey:surveyMap[hid]||[]};
        metals.forEach(m=>{
          let ws=0,wt=0;
          inRange.forEach(i=>{
            const ov=Math.min(i.to,end)-Math.max(i.from,cur);
            if(!isNaN(i.vals[m])&&ov>0){ws+=i.vals[m]*ov;wt+=ov;}
          });
          comp[m]=wt>0?ws/wt:NaN;
        });
        composites.push(comp);
        cur=end;
      }
    });
  }

  if(!composites.length)throw new Error('No composites built. Check collar field mapping — X/Y/Z columns may be incorrectly assigned.');

  // ── Desurvey to get XYZ centroid per composite
  setP('Desurveying intervals to 3D coordinates...',38);await sl(300);
  // Use per-solid structure for classification and nearest-face distance
  const solids=wireframe.solids;
  const samples=[];

  for(let i=0;i<composites.length;i++){
    const comp=composites[i];
    let cx,cy,cz;
    if(opts.ds==='none'){
      cx=parseFloat(comp._x);cy=parseFloat(comp._y);
      cz=parseFloat(comp._z)-(comp.from+comp.to)/2;
      if(S.importMode==='point'){cx=parseFloat(comp._x);cy=parseFloat(comp._y);cz=parseFloat(comp._z);}
    } else {
      const pos=desurveyHole(comp._x,comp._y,comp._z,comp._survey,comp.from,comp.to,opts.ds);
      cx=pos.cx;cy=pos.cy;cz=pos.cz;
    }
    if(isNaN(cx)||isNaN(cy)||isNaN(cz))continue;

    // Per-solid inside/outside test — point is INSIDE if inside any solid.
    // solidIdx >= 0 means inside that solid; -1 means outside all.
    const solidIdx=pointInMeshMulti(cx,cy,cz,solids);
    const inside=solidIdx>=0;

    // Nearest triangle distance across ALL solids — exact, no bounding-box shortcut.
    // For inside points: distance to nearest face of the containing solid.
    // For outside points: distance to the nearest face of the nearest solid.
    const {dist:minDist}=nearestTriangleDist(cx,cy,cz,solids);

    // Signed distance: positive = inside (by convention with sign='in-pos')
    const sign=opts.sign==='in-pos'?1:-1;
    const signedDist=minDist*(inside?sign:-sign);

    const samp={holeid:comp.holeid,from:comp.from,to:comp.to,cx,cy,cz,inside,solidIdx,dist:minDist,signedDist};
    metals.forEach(m=>{samp[m]=comp[m];});
    samples.push(samp);
  }

  if(!samples.length)throw new Error('No valid samples produced after desurveying. Check field mappings.');
  setP('Classifying samples...',58);await sl(200);

  // ── Auto-inversion detection
  // If the wireframe has inverted winding (clockwise instead of CCW), all
  // inside/outside classifications will be flipped. Detect this by checking
  // whether the raw "inside" population has lower mean grade than "outside"
  // across the majority of grade variables. If so, flip all flags.
  {
    const testIn=samples.filter(s=>s.inside);
    const testOut=samples.filter(s=>!s.inside);
    let invertVotes=0;
    metals.forEach(m=>{
      const inMean=pmean(testIn.map(s=>s[m]).filter(v=>!isNaN(v)));
      const outMean=pmean(testOut.map(s=>s[m]).filter(v=>!isNaN(v)));
      if(!isNaN(inMean)&&!isNaN(outMean)&&outMean>inMean*1.1)invertVotes++;
    });
    const shouldInvert=invertVotes>metals.length/2;
    if(shouldInvert){
      samples.forEach(s=>{s.inside=!s.inside;s.signedDist=-s.signedDist;});
      console.warn('Wireframe winding appears inverted — classification flipped automatically.');
    }
    S._classificationInverted=shouldInvert;
  }

  // Diagnostic: compute XYZ range of desurveyed sample centroids
  const cxVals=samples.map(s=>s.cx),cyVals=samples.map(s=>s.cy),czVals=samples.map(s=>s.cz);
  const sampleBbox={xmin:Math.min.apply(null,cxVals),xmax:Math.max.apply(null,cxVals),ymin:Math.min.apply(null,cyVals),ymax:Math.max.apply(null,cyVals),zmin:Math.min.apply(null,czVals),zmax:Math.max.apply(null,czVals)};

  const insideSamples=samples.filter(s=>s.inside);
  const outsideSamples=samples.filter(s=>!s.inside);

  // Warn if suspiciously few in one category
  const warnUnbalanced=insideSamples.length<3||outsideSamples.length<3;

  // ── Compute contact plots per metal
  setP('Computing distance bins and statistics...',72);await sl(300);

  const maxDist=opts.maxDist>0?opts.maxDist:null;
  const useSamples=maxDist?samples.filter(s=>s.dist<=maxDist):samples;

  // Determine bin width
  const allDists=useSamples.map(s=>s.signedDist).sort((a,b)=>a-b);
  const dMin=allDists[0]??0,dMax=allDists[allDists.length-1]??1;
  const dRange=dMax-dMin;
  let binW=opts.bin==='auto'?Math.max(1,parseFloat((dRange/Math.max(10,Math.min(40,Math.ceil(Math.sqrt(useSamples.length))))).toFixed(1))):opts.binWidth;
  binW=Math.max(0.1,binW);

  // Build bins
  const binMin=Math.floor(dMin/binW)*binW;
  const binMax=Math.ceil(dMax/binW)*binW;
  const nBins=Math.round((binMax-binMin)/binW);
  const binLabels=[];
  for(let b=0;b<nBins;b++)binLabels.push(binMin+b*binW+binW/2);

  // Per-metal contact plot data
  const metalData={};
  metals.forEach(m=>{
    const bins=Array.from({length:nBins},()=>({vals:[]}));
    useSamples.forEach(s=>{
      const v=s[m];if(isNaN(v))return;
      const bi=Math.floor((s.signedDist-binMin)/binW);
      if(bi>=0&&bi<nBins)bins[bi].vals.push(v);
    });
    const binStats=bins.map((b,i)=>{
      const sv=[...b.vals].sort((a,c)=>a-c);
      const n=sv.length;
      return{binCentre:binLabels[i],n,
        mean:n>0?pmean(sv):NaN,
        median:n>0?ppct(sv,50):NaN,
        p10:n>0?ppct(sv,10):NaN,
        p90:n>0?ppct(sv,90):NaN,
        min:n>0?sv[0]:NaN,max:n>0?sv[n-1]:NaN};
    });

    // All scatter points for this metal
    const scatter=useSamples.filter(s=>!isNaN(s[m])).map(s=>({x:s.signedDist,y:s[m],inside:s.inside}));

    // Global stats inside vs outside — use useSamples for consistency with CSV export
    const inVals=useSamples.filter(s=>s.inside).map(s=>s[m]).filter(v=>!isNaN(v));
    const outVals=useSamples.filter(s=>!s.inside).map(s=>s[m]).filter(v=>!isNaN(v));
    const inSorted=[...inVals].sort((a,b)=>a-b);
    const outSorted=[...outVals].sort((a,b)=>a-b);
    // inVals and outVals are already available above for classification
    const inStats={n:inSorted.length,mean:pmean(inSorted),median:ppct(inSorted,50),p10:ppct(inSorted,10),p90:ppct(inSorted,90)};
    const outStats={n:outSorted.length,mean:pmean(outSorted),median:ppct(outSorted,50),p10:ppct(outSorted,10),p90:ppct(outSorted,90)};
    const meanRatio=outStats.mean>0?inStats.mean/outStats.mean:NaN;
    const medianRatio=outStats.median>0?inStats.median/outStats.median:NaN;
    // Classification metrics for boundary intent
    const thresh=opts.intentThresh&&opts.intentThresh[m]!=null?opts.intentThresh[m]:null;
    const intent=opts.intent||'grade';
    let pctInsideCorrect=null,pctOutsideCorrect=null,overallCorrect=null,misclassRate=null;
    if(intent==='grade'&&thresh!=null){
      const insideCorrect=inVals.filter(v=>v>=thresh).length;
      const outsideCorrect=outVals.filter(v=>v<thresh).length;
      pctInsideCorrect=inVals.length>0?100*insideCorrect/inVals.length:null;
      pctOutsideCorrect=outVals.length>0?100*outsideCorrect/outVals.length:null;
      const total=inVals.length+outVals.length;
      overallCorrect=total>0?100*(insideCorrect+outsideCorrect)/total:null;
      misclassRate=overallCorrect!=null?100-overallCorrect:null;
    } else if(intent==='mineralisation'){
      // Outside mean should be <10% of inside mean
      pctInsideCorrect=null;pctOutsideCorrect=null;overallCorrect=null;misclassRate=null;
    }

    // Linear regression on scatter
    let regA=NaN,regB=NaN;
    if(scatter.length>5){
      const n=scatter.length,sx=scatter.reduce((a,s)=>a+s.x,0),sy=scatter.reduce((a,s)=>a+s.y,0);
      const sxy=scatter.reduce((a,s)=>a+s.x*s.y,0),sx2=scatter.reduce((a,s)=>a+s.x*s.x,0);
      regB=(n*sxy-sx*sy)/(n*sx2-sx*sx)||0;
      regA=(sy-regB*sx)/n;
    }

    metalData[m]={binStats,scatter,inStats,outStats,meanRatio,medianRatio,regA,regB,binW,pctInsideCorrect,pctOutsideCorrect,overallCorrect,misclassRate,thresh,intent};
  });

  setP('Building result panels...',92);await sl(200);
  return{metals,samples,useSamples,insideSamples,outsideSamples,metalData,wireframe,binW,binMin,binMax,intentMode:opts.intent||'grade',
    totalSamples:useSamples.length,
    nInside:useSamples.filter(s=>s.inside).length,
    nOutside:useSamples.filter(s=>!s.inside).length,
    classificationInverted:S._classificationInverted||false,
    warnUnbalanced,sampleBbox,
    opts:{...S.opts,compLen}};
}

// ══════════════════════════════════════════════════════════════
// RESULTS UI
// ══════════════════════════════════════════════════════════════
const chartInstances={};
function destroyChart(id){if(chartInstances[id]){chartInstances[id].destroy();delete chartInstances[id];}}

function buildResultsUI(R){
  document.getElementById('res-meta').textContent=
    `${R.wireframe.name} · ${R.totalSamples} composites · ${R.nInside} inside / ${R.nOutside} outside · Bin width: ${R.binW.toFixed(1)}m`;
  buildRTabOverview(R);
  buildRTabPlots(R);
  buildRTabData(R);
  // Update tab label
  document.getElementById('rtab-plots').textContent=`CONTACT PLOTS (${R.metals.length})`;
}

function buildRTabOverview(R){
  const cont=document.getElementById('rpanel-overview');
  const signLabel=R.opts.sign==='in-pos'?'positive (right)':'positive (left)';
  const insideLabel=R.opts.sign==='in-pos'?'INSIDE (positive)':'INSIDE (negative)';
  const outsideLabel=R.opts.sign==='in-pos'?'OUTSIDE (negative)':'OUTSIDE (positive)';

  const intentMode=R.opts.intent||'grade';
  const hasThresh=intentMode==='grade'&&R.metals.some(m=>R.metalData[m].thresh!=null);

  let robustnessRows='';
  R.metals.forEach(m=>{
    const d=R.metalData[m];
    const ratio=d.meanRatio;
    let robustness,color;
    if(isNaN(ratio)){robustness='INSUFFICIENT DATA';color='var(--text-dim)';}
    else if(ratio>=3){robustness='VERY ROBUST';color='var(--green)';}
    else if(ratio>=1.5){robustness='ROBUST';color='var(--green)';}
    else if(ratio>=1.1){robustness='MODERATE';color='var(--amber)';}
    else{robustness='WEAK / INADEQUATE';color='var(--red)';}

    // Mineralisation intent: flag if outside mean > 10% of inside mean
    let intentFlag='';
    if(intentMode==='mineralisation'&&d.inStats.mean>0){
      const outsideFrac=d.outStats.mean/d.inStats.mean;
      if(outsideFrac>0.10){intentFlag=`<div style="font-size:9px;color:var(--red);font-family:var(--font-mono);margin-top:3px">⚠ OUTSIDE > 10% of INSIDE (${(outsideFrac*100).toFixed(0)}%)</div>`;}
      else{intentFlag=`<div style="font-size:9px;color:var(--green);font-family:var(--font-mono);margin-top:3px">✓ OUTSIDE < 10% of INSIDE</div>`;}
    }

    // Grade threshold intent columns
    let classCell='';
    if(hasThresh&&d.thresh!=null){
      const insC=d.pctInsideCorrect!=null?d.pctInsideCorrect.toFixed(0)+'%':'—';
      const outC=d.pctOutsideCorrect!=null?d.pctOutsideCorrect.toFixed(0)+'%':'—';
      const oa=d.overallCorrect!=null?d.overallCorrect.toFixed(0)+'%':'—';
      const insCol=d.pctInsideCorrect!=null?(d.pctInsideCorrect>=80?'var(--green)':d.pctInsideCorrect>=60?'var(--amber)':'var(--red)'):'var(--text-dim)';
      const outCol=d.pctOutsideCorrect!=null?(d.pctOutsideCorrect>=80?'var(--green)':d.pctOutsideCorrect>=60?'var(--amber)':'var(--red)'):'var(--text-dim)';
      const oaCol=d.overallCorrect!=null?(d.overallCorrect>=80?'var(--green)':d.overallCorrect>=60?'var(--amber)':'var(--red)'):'var(--text-dim)';
      classCell=`<td style="font-family:var(--font-mono);font-size:10px">
        <div style="color:var(--inside)">IN ≥ ${fmt(d.thresh)}: <strong style="color:${insCol}">${insC}</strong></div>
        <div style="color:var(--outside)">OUT &lt; ${fmt(d.thresh)}: <strong style="color:${outCol}">${outC}</strong></div>
        <div style="color:var(--text-dim)">OVERALL: <strong style="color:${oaCol}">${oa}</strong></div>
      </td>`;
    } else if(hasThresh){
      classCell='<td style="color:var(--text-dim);font-size:10px">No threshold set</td>';
    }

    robustnessRows+=`<tr>
      <td style="font-weight:500">${m}</td>
      <td>${d.inStats.n}</td><td>${fmt(d.inStats.mean)}</td><td>${fmt(d.inStats.median)}</td>
      <td>${d.outStats.n}</td><td>${fmt(d.outStats.mean)}</td><td>${fmt(d.outStats.median)}</td>
      <td style="color:${color};font-weight:600">${fmt(ratio,'—')}</td>
      <td><span style="color:${color};font-family:var(--font-mono);font-size:9px;letter-spacing:.1em">${robustness}</span>${intentFlag}</td>
      ${classCell}
    </tr>`;
  });

  // Check if sample bbox overlaps wireframe bbox at all
  const sb=R.sampleBbox, wb=R.wireframe.bbox;
  const noOverlapX=sb.xmax<wb.xmin||sb.xmin>wb.xmax;
  const noOverlapY=sb.ymax<wb.ymin||sb.ymin>wb.ymax;
  const noOverlapZ=sb.zmax<wb.zmin||sb.zmin>wb.zmax;
  const coordMismatch=noOverlapX||noOverlapY||noOverlapZ;

  cont.innerHTML=`
    ${R.classificationInverted?`<div class="alert-box warn" style="border-color:rgba(184,104,10,.4);background:rgba(184,104,10,.05)"><span>⚠</span><span><strong>Wireframe winding corrected automatically:</strong> The DXF face normals appear to point inward (clockwise vertex ordering). Inside/outside classification has been flipped so that the higher-grade population is treated as inside the wireframe. Re-export your DXF with outward-facing normals to avoid this correction.</span></div>`:''}
    ${coordMismatch?`<div class="alert-box warn" style="border-color:var(--red);background:rgba(192,57,43,0.06)"><span>⛔</span><span><strong>Coordinate mismatch detected:</strong> Sample centroids (X: ${fmt(sb.xmin)}→${fmt(sb.xmax)}, Y: ${fmt(sb.ymin)}→${fmt(sb.ymax)}, Z: ${fmt(sb.zmin)}→${fmt(sb.zmax)}) do not overlap the wireframe (X: ${fmt(wb.xmin)}→${fmt(wb.xmax)}, Y: ${fmt(wb.ymin)}→${fmt(wb.ymax)}, Z: ${fmt(wb.zmin)}→${fmt(wb.zmax)}). <strong>Check your collar X/Y/Z field mapping and desurvey settings.</strong> This will produce 0% inside.</span></div>`:''}
    ${R.warnUnbalanced&&!coordMismatch?`<div class="alert-box warn"><span>⚠</span><span>Fewer than 3 samples classified inside the wireframe. Check that the wireframe is a fully closed solid with no holes or self-intersections.</span></div>`:''}
    ${R.wireframe.solidCount>1?`<div class="alert-box info"><span>◈</span><span><strong>${R.wireframe.solidCount} separate solids detected</strong> in this wireframe file. Each sample has been tested against all solids independently — a sample is classified as <em>inside</em> if it falls within any of the ${R.wireframe.solidCount} solids. Distance to contact is measured to the nearest face across all solids.</span></div>`:''}
    ${R.nInside===0&&!coordMismatch?`<div class="alert-box warn"><span>⚠</span><span>All samples classified as outside. If samples should intersect the wireframe, verify the DXF is a closed solid and that coordinates are in the same projection/units as the drillhole data.</span></div>`:''}
    <div class="r-sec">
      <div class="r-sec-hdr"><div class="r-sec-icon">◈</div><div class="r-sec-title">Wireframe Summary</div></div>
      <div class="r-sec-body">
        <div class="stat-grid">
          <div class="sb"><div class="sb-lbl">FILE</div><div style="font-family:var(--font-mono);font-size:12px;color:var(--text)">${R.wireframe.name}</div></div>
          <div class="sb"><div class="sb-lbl">TRIANGLES</div><div class="sb-val">${R.wireframe.faceCount.toLocaleString()}</div></div>
          <div class="sb"><div class="sb-lbl">SOLIDS DETECTED</div><div class="sb-val ${R.wireframe.solidCount>1?'amber':''}">${R.wireframe.solidCount}</div></div>
          <div class="sb"><div class="sb-lbl">WIREFRAME X</div><div class="sb-val" style="font-size:12px">${fmt(R.wireframe.bbox.xmin)} → ${fmt(R.wireframe.bbox.xmax)}</div></div>
          <div class="sb"><div class="sb-lbl">WIREFRAME Y</div><div class="sb-val" style="font-size:12px">${fmt(R.wireframe.bbox.ymin)} → ${fmt(R.wireframe.bbox.ymax)}</div></div>
          <div class="sb"><div class="sb-lbl">WIREFRAME Z</div><div class="sb-val" style="font-size:12px">${fmt(R.wireframe.bbox.zmin)} → ${fmt(R.wireframe.bbox.zmax)}</div></div>
          <div class="sb"><div class="sb-lbl">SAMPLE X</div><div class="sb-val" style="font-size:12px${R.sampleBbox.xmax<R.wireframe.bbox.xmin||R.sampleBbox.xmin>R.wireframe.bbox.xmax?';color:var(--red)':''}">${fmt(R.sampleBbox.xmin)} → ${fmt(R.sampleBbox.xmax)}</div></div>
          <div class="sb"><div class="sb-lbl">SAMPLE Y</div><div class="sb-val" style="font-size:12px${R.sampleBbox.ymax<R.wireframe.bbox.ymin||R.sampleBbox.ymin>R.wireframe.bbox.ymax?';color:var(--red)':''}">${fmt(R.sampleBbox.ymin)} → ${fmt(R.sampleBbox.ymax)}</div></div>
          <div class="sb"><div class="sb-lbl">SAMPLE Z</div><div class="sb-val" style="font-size:12px${R.sampleBbox.zmax<R.wireframe.bbox.zmin||R.sampleBbox.zmin>R.wireframe.bbox.zmax?';color:var(--red)':''}">${fmt(R.sampleBbox.zmin)} → ${fmt(R.sampleBbox.zmax)}</div></div>
          <div class="sb"><div class="sb-lbl">SIGN CONVENTION</div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text)">INSIDE = ${R.opts.sign==='in-pos'?'+ve':'-ve'}</div></div>
        </div>
      </div>
    </div>

    <div class="r-sec">
      <div class="r-sec-hdr"><div class="r-sec-icon">◉</div><div class="r-sec-title">Sample Classification</div></div>
      <div class="r-sec-body">
        <div class="stat-grid">
          <div class="sb"><div class="sb-lbl">TOTAL COMPOSITES</div><div class="sb-val">${R.totalSamples}</div></div>
          <div class="sb"><div class="sb-lbl">INSIDE WIREFRAME</div><div class="sb-val green">${R.nInside}</div></div>
          <div class="sb"><div class="sb-lbl">OUTSIDE WIREFRAME</div><div class="sb-val red">${R.nOutside}</div></div>
          <div class="sb"><div class="sb-lbl">INSIDE %</div><div class="sb-val">${(100*R.nInside/R.totalSamples).toFixed(1)}%</div></div>
          <div class="sb"><div class="sb-lbl">BIN WIDTH</div><div class="sb-val">${R.binW.toFixed(1)} m</div></div>
          <div class="sb"><div class="sb-lbl">COMPOSITING</div><div style="font-family:var(--font-mono);font-size:10px;color:var(--text)">${R.opts.co==='none'?'RAW':R.opts.compLen+'m'}</div></div>
        </div>
      </div>
    </div>

    <div class="r-sec">
      <div class="r-sec-hdr"><div class="r-sec-icon">◆</div><div class="r-sec-title">Contact Robustness Summary</div></div>
      <div class="r-sec-body">
        <div class="commentary" style="margin-bottom:18px">
          <h4>How to interpret this table</h4>
          ${intentMode==='grade'&&hasThresh?`<p style="font-size:12px;color:var(--text-dim)"><strong>Boundary intent: Grade threshold.</strong> In addition to the standard ratio test, the <strong>Classification</strong> column reports what percentage of samples on each side of the contact are correctly classified by your threshold. An 80%+ correct rate on both sides indicates the surface is well-placed relative to your cut-off. Below 60% means the surface position does not reflect the grade threshold used to generate it.</p>`
          :intentMode==='mineralisation'?`<p style="font-size:12px;color:var(--text-dim)"><strong>Boundary intent: Mineralisation envelope.</strong> Outside grades should be at or near background (zero or detection limit). The assessment flags any variable where the outside mean exceeds 10% of the inside mean — this would indicate mineralisation spilling significantly outside the shell.</p>`
          :`<p style="font-size:12px;color:var(--text-dim)">The <strong>Mean Ratio (Inside/Outside)</strong> quantifies how different the grade is on each side of the contact. A ratio near 1.0 indicates no geological contrast — the model boundary is not supported by the data. A ratio ≥ 1.5 indicates moderate contrast; ≥ 3.0 is strong. The contact plots (next tab) show the full spatial distribution.</p>`}
        </div>
        <div style="overflow-x:auto">
          <table class="int-tbl">
            <thead><tr>
              <th>VARIABLE</th>
              <th>N (INSIDE)</th><th>MEAN (IN)</th><th>MEDIAN (IN)</th>
              <th>N (OUTSIDE)</th><th>MEAN (OUT)</th><th>MEDIAN (OUT)</th>
              <th>MEAN RATIO</th><th>ASSESSMENT</th>
              ${hasThresh?'<th>CLASSIFICATION</th>':''}
            </tr></thead>
            <tbody>${robustnessRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function buildRTabPlots(R){
  const cont=document.getElementById('rpanel-plots');
  const insideColor='rgba(26,95,168,0.55)';
  const outsideColor='rgba(192,57,43,0.55)';

  let html='';
  R.metals.forEach((m,idx)=>{
    html+=`<div class="r-sec" id="plot-sec-${idx}">
      <div class="r-sec-hdr"><div class="r-sec-icon">${idx+1}</div><div class="r-sec-title">Contact Plot — ${m}</div></div>
      <div class="r-sec-body">
        <div class="chart-overlays" id="overlays-${idx}" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;padding:10px 14px;background:var(--dark);border:1px solid var(--border2);align-items:center">
          <span style="font-size:9px;font-family:var(--font-mono);letter-spacing:.12em;color:var(--text-dim);margin-right:4px">OVERLAYS:</span>
          <button class="ov-btn active" id="ovb-${idx}-p50" onclick="toggleOverlay(${idx},'p50',this,'${m}')">P50</button>
          <button class="ov-btn" id="ovb-${idx}-p10" onclick="toggleOverlay(${idx},'p10',this,'${m}')">P10</button>
          <button class="ov-btn" id="ovb-${idx}-p90" onclick="toggleOverlay(${idx},'p90',this,'${m}')">P90</button>
          <button class="ov-btn" id="ovb-${idx}-mean" onclick="toggleOverlay(${idx},'mean',this,'${m}')">MEAN</button>
          <button class="ov-btn" id="ovb-${idx}-reg" onclick="toggleOverlay(${idx},'reg',this,'${m}')">REGRESSION</button>
          <button class="ov-btn active" id="ovb-${idx}-hist" onclick="toggleOverlay(${idx},'hist',this,'${m}')">SAMPLE COUNT</button>
        </div>
        <div class="chart-wrap tall" id="chart-wrap-${idx}">
          <canvas id="chart-${idx}"></canvas>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
          <div class="stat-grid">
            <div class="sb"><div class="sb-lbl" style="color:var(--inside)">▲ INSIDE MEAN</div><div class="sb-val">${fmt(R.metalData[m].inStats.mean)}</div></div>
            <div class="sb"><div class="sb-lbl" style="color:var(--inside)">▲ INSIDE MEDIAN</div><div class="sb-val">${fmt(R.metalData[m].inStats.median)}</div></div>
            <div class="sb"><div class="sb-lbl" style="color:var(--inside)">▲ INSIDE P10/P90</div><div style="font-family:var(--font-mono);font-size:12px;color:var(--inside)">${fmt(R.metalData[m].inStats.p10)} / ${fmt(R.metalData[m].inStats.p90)}</div></div>
            <div class="sb"><div class="sb-lbl" style="color:var(--inside)">▲ INSIDE N</div><div class="sb-val" style="font-size:13px">${R.metalData[m].inStats.n}</div></div>
          </div>
          <div class="stat-grid">
            <div class="sb"><div class="sb-lbl" style="color:var(--outside)">▼ OUTSIDE MEAN</div><div class="sb-val red">${fmt(R.metalData[m].outStats.mean)}</div></div>
            <div class="sb"><div class="sb-lbl" style="color:var(--outside)">▼ OUTSIDE MEDIAN</div><div class="sb-val red">${fmt(R.metalData[m].outStats.median)}</div></div>
            <div class="sb"><div class="sb-lbl" style="color:var(--outside)">▼ OUTSIDE P10/P90</div><div style="font-family:var(--font-mono);font-size:12px;color:var(--outside)">${fmt(R.metalData[m].outStats.p10)} / ${fmt(R.metalData[m].outStats.p90)}</div></div>
            <div class="sb"><div class="sb-lbl" style="color:var(--outside)">▼ OUTSIDE N</div><div class="sb-val red" style="font-size:13px">${R.metalData[m].outStats.n}</div></div>
          </div>
        </div>
      </div>
    </div>`;
  });
  cont.innerHTML=html;

  // Default overlay state per chart: p50 and hist on, others off
  R.metals.forEach((m,idx)=>{
    chartOverlays[idx]={p50:true,p10:false,p90:false,mean:false,reg:false,hist:true};
  });

  requestAnimationFrame(()=>{
    R.metals.forEach((m,idx)=>renderContactChart(m,idx,R));
  });
}

// Per-chart overlay state
const chartOverlays={};

function toggleOverlay(idx,key,btn,metal){
  chartOverlays[idx][key]=!chartOverlays[idx][key];
  btn.classList.toggle('active',chartOverlays[idx][key]);
  renderContactChart(metal,idx,S.results);
}

function renderContactChart(m,idx,R){
  destroyChart('c'+idx);
  const d=R.metalData[m];
  const canvas=document.getElementById('chart-'+idx);
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const ov=chartOverlays[idx]||{p50:true,p10:false,p90:false,mean:false,reg:false,hist:true};

  const insidePts=d.scatter.filter(s=>s.inside).map(s=>({x:s.x,y:s.y}));
  const outsidePts=d.scatter.filter(s=>!s.inside).map(s=>({x:s.x,y:s.y}));

  const datasets=[
    {type:'scatter',label:'Outside wireframe',data:outsidePts,backgroundColor:'rgba(192,57,43,0.4)',pointRadius:3,pointHoverRadius:5,order:10},
    {type:'scatter',label:'Inside wireframe',data:insidePts,backgroundColor:'rgba(26,95,168,0.4)',pointRadius:3,pointHoverRadius:5,order:9},
  ];

  const validBins=d.binStats.filter(b=>b.n>0);

  if(ov.p50){
    datasets.push({type:'line',label:'P50',data:validBins.map(b=>({x:b.binCentre,y:b.median})),borderColor:'#1a5fa8',backgroundColor:'transparent',borderWidth:2.5,pointRadius:4,pointStyle:'circle',order:3,tension:0.3});
  }
  if(ov.p90){
    datasets.push({type:'line',label:'P90',data:validBins.map(b=>({x:b.binCentre,y:b.p90})),borderColor:'rgba(26,95,168,0.45)',backgroundColor:'transparent',borderWidth:1.5,borderDash:[4,3],pointRadius:2,order:4,tension:0.3});
  }
  if(ov.p10){
    datasets.push({type:'line',label:'P10',data:validBins.map(b=>({x:b.binCentre,y:b.p10})),borderColor:'rgba(192,57,43,0.45)',backgroundColor:'transparent',borderWidth:1.5,borderDash:[4,3],pointRadius:2,order:5,tension:0.3});
  }
  if(ov.mean){
    datasets.push({type:'line',label:'Mean',data:validBins.map(b=>({x:b.binCentre,y:b.mean})),borderColor:'#1a8c4e',backgroundColor:'transparent',borderWidth:1.5,borderDash:[2,2],pointRadius:2,order:6,tension:0.3});
  }
  if(ov.reg&&!isNaN(d.regA)){
    const allX=d.scatter.map(s=>s.x);
    const xMin=Math.min.apply(null,allX),xMax=Math.max.apply(null,allX);
    datasets.push({type:'line',label:'Regression',data:[{x:xMin,y:d.regA+d.regB*xMin},{x:xMax,y:d.regA+d.regB*xMax}],borderColor:'#b8680a',backgroundColor:'transparent',borderWidth:2,pointRadius:0,order:2});
  }
  if(ov.hist){
    datasets.push({type:'bar',label:'Sample count',data:d.binStats.map(b=>({x:b.binCentre,y:b.n})),backgroundColor:'rgba(26,95,168,0.1)',borderColor:'rgba(26,95,168,0.2)',borderWidth:1,yAxisID:'y2',order:20,barPercentage:0.9});
  }

  const xMin2=R.binMin-R.binW,xMax2=R.binMax+R.binW;
  // Labels to hide from Chart.js legend (scatter + histogram — shown in toggle bar instead)
  const hiddenLabels=new Set(['Inside wireframe','Outside wireframe','Sample count']);

  chartInstances['c'+idx]=new Chart(ctx,{
    data:{datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{
        legend:{
          display:true,position:'top',
          labels:{
            font:{family:'DM Mono',size:10},color:'#64748b',boxWidth:10,padding:12,
            filter:(item)=>!hiddenLabels.has(item.text)
          }
        },
        tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.parsed.y!=null?c.parsed.y.toFixed(3):''}`}}
      },
      scales:{
        x:{type:'linear',title:{display:true,text:`Distance from Contact (m) — ${R.opts.sign==='in-pos'?'Inside = positive →':'Outside = positive →'}`,color:'#64748b',font:{family:'DM Mono',size:10}},
          grid:{color:'rgba(26,95,168,0.08)'},ticks:{color:'#64748b',font:{family:'DM Mono',size:10}},
          min:xMin2,max:xMax2},
        y:{type:'linear',title:{display:true,text:m,color:'#64748b',font:{family:'DM Mono',size:10}},position:'left',
          grid:{color:'rgba(26,95,168,0.08)'},ticks:{color:'#64748b',font:{family:'DM Mono',size:10}}},
        ...(ov.hist?{y2:{type:'linear',position:'right',title:{display:true,text:'Sample Count',color:'rgba(26,95,168,0.5)',font:{family:'DM Mono',size:10}},
          grid:{drawOnChartArea:false},ticks:{color:'rgba(26,95,168,0.5)',font:{family:'DM Mono',size:10}}}}:{})
      },
      animation:{onComplete(){
        const chart=chartInstances['c'+idx];if(!chart)return;
        const x0=chart.scales.x.getPixelForValue(0);
        const yT=chart.scales.y.top,yB=chart.scales.y.bottom;
        chart.ctx.save();
        chart.ctx.beginPath();
        chart.ctx.moveTo(x0,yT);chart.ctx.lineTo(x0,yB);
        chart.ctx.strokeStyle='rgba(26,95,168,0.7)';
        chart.ctx.lineWidth=1.5;
        chart.ctx.setLineDash([5,3]);
        chart.ctx.stroke();
        chart.ctx.setLineDash([]);
        chart.ctx.fillStyle='rgba(26,95,168,0.7)';
        chart.ctx.font='9px DM Mono';
        chart.ctx.fillText('CONTACT',x0+4,yT+12);
        chart.ctx.restore();
      }}
    }
  });
}

function buildRTabData(R){
  const cont=document.getElementById('rpanel-data');
  const cols=['holeid','from','to','inside','dist','signedDist',...R.metals];
  const rows=R.useSamples.slice(0,500);
  const thead=cols.map(c=>`<th>${c.toUpperCase()}</th>`).join('');
  const tbody=rows.map(s=>`<tr>
    <td>${s.holeid}</td>
    <td>${fmt(s.from)}</td>
    <td>${fmt(s.to)}</td>
    <td><span style="color:${s.inside?'var(--inside)':'var(--outside)'};font-family:var(--font-mono);font-size:10px">${s.inside?'INSIDE':'OUTSIDE'}</span></td>
    <td>${fmt(s.dist)}</td>
    <td>${fmt(s.signedDist)}</td>
    ${R.metals.map(m=>`<td>${fmt(s[m])}</td>`).join('')}
  </tr>`).join('');
  cont.innerHTML=`
    <div class="r-sec">
      <div class="r-sec-hdr"><div class="r-sec-icon">⊞</div><div class="r-sec-title">Sample Data Table</div></div>
      <div class="r-sec-body">
        ${R.useSamples.length>500?`<div class="alert-box info" style="margin-bottom:12px"><span>ℹ</span><span>Showing first 500 of ${R.useSamples.length} samples. Export CSV to view all.</span></div>`:''}
        <div style="overflow-x:auto"><table class="int-tbl"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════════════════
function exportCSV(){
  if(!S.results)return;
  const R=S.results;
  const cols=['holeid','from','to','cx','cy','cz','inside','dist_to_contact_m','signed_dist_m',...R.metals];
  const header=cols.join(',');
  const rows=R.useSamples.map(s=>[s.holeid,s.from.toFixed(2),s.to.toFixed(2),s.cx.toFixed(2),s.cy.toFixed(2),s.cz.toFixed(2),s.inside?1:0,s.dist.toFixed(3),s.signedDist.toFixed(3),...R.metals.map(m=>isNaN(s[m])?'':s[m].toFixed(4))].join(','));
  const csv=[header,...rows].join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='mrec_boundary_analysis.csv';a.click();
  URL.revokeObjectURL(url);
}
