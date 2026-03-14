import * as THREE from 'three';

export function prepareGeometry(sourceGeometry, options = {}) {
  if (!sourceGeometry) {
    return null;
  }

  const {
    size = 1,
    align = 'center',
    recomputeNormals = true
  } = options;
  const geometry = sourceGeometry.clone();

  geometry.computeBoundingBox();
  geometry.center();

  const box = geometry.boundingBox || new THREE.Box3();
  const boundsSize = new THREE.Vector3();
  box.getSize(boundsSize);

  const maxDimension = Math.max(boundsSize.x, boundsSize.y, boundsSize.z) || 1;
  const scale = size / maxDimension;
  geometry.scale(scale, scale, scale);

  geometry.computeBoundingBox();

  if (align === 'ground' && geometry.boundingBox) {
    geometry.translate(0, -geometry.boundingBox.min.y, 0);
    geometry.computeBoundingBox();
  }

  if (recomputeNormals && !geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }

  if (geometry.attributes.uv && !geometry.attributes.uv2) {
    geometry.setAttribute('uv2', geometry.attributes.uv);
  }

  return geometry;
}
