# MREC Boundary Analysis

Geological contact analysis — drillhole data vs 3D wireframe solids.

## Files
- `index.html` — Full application (login + all steps + results)
- `style.css`  — Obsidian Geocore theme
- `app.js`     — All analysis logic
- `credentials.js` — User access (edit USERS object)

## Multi-wireframe support
DXF files containing multiple separate closed solids (e.g. parallel vein wireframes)
are automatically detected via connected-component analysis. Each sample is tested
against every solid independently. A sample is classified as INSIDE if it falls within
any solid. Distance to contact is measured to the nearest triangle face across all solids.

## Distance methodology
- **Inside/outside**: 7-ray Möller–Trumbore majority vote per solid
- **Distance**: True nearest-triangle distance (barycentric clamp), no bounding-box substitution
- **Performance**: Per-solid bounding-box lower-bound used to skip solids that cannot
  improve on the current best distance — correctness-preserving, never substituted for actual distance

## Desurvey fix (v10+)
Extrapolates beyond the last survey station using the final survey dip/azimuth.
