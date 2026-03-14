export const assetManifest = {
  geometry: [
    { section: 'igloo', key: 'igloo-shell', source: '/reference-assets/geometries/igloo.drc' },
    { section: 'igloo', key: 'ground', source: '/reference-assets/geometries/ground.drc' },
    { section: 'cubes', key: 'cube1', source: '/reference-assets/geometries/cubes/cube1.drc' },
    { section: 'cubes', key: 'cube2', source: '/reference-assets/geometries/cubes/cube2.drc' },
    { section: 'cubes', key: 'cube3', source: '/reference-assets/geometries/cubes/cube3.drc' },
    { section: 'entry', key: 'floor', source: '/reference-assets/geometries/floor.drc' },
    { section: 'entry', key: 'ring', source: '/reference-assets/geometries/shattered_ring.drc' },
    { section: 'detail', key: 'pudgy', source: '/reference-assets/geometries/pudgy.drc' },
    { section: 'detail', key: 'overpass', source: '/reference-assets/geometries/overpass_logo.drc' },
    { section: 'detail', key: 'abstract', source: '/reference-assets/geometries/abstractlogo.drc' }
  ],
  texture: [
    { section: 'igloo', key: 'igloo-color', source: '/reference-assets/images/igloo/igloo_color.ktx2', colorSpace: 'srgb' },
    { section: 'igloo', key: 'ground-color', source: '/reference-assets/images/igloo/ground_color.ktx2', colorSpace: 'srgb' },
    { section: 'cubes', key: 'cubes-environment', source: '/reference-assets/images/cubes_env.exr', kind: 'exr-env' },
    { section: 'cubes', key: 'cube1-normal', source: '/reference-assets/images/cubes/cube1_normal.ktx2' },
    { section: 'cubes', key: 'cube1-roughness', source: '/reference-assets/images/cubes/cube1_roughness.ktx2' },
    { section: 'cubes', key: 'cube2-normal', source: '/reference-assets/images/cubes/cube2_normal.ktx2' },
    { section: 'cubes', key: 'cube2-roughness', source: '/reference-assets/images/cubes/cube2_roughness.ktx2' },
    { section: 'cubes', key: 'cube3-normal', source: '/reference-assets/images/cubes/cube3_normal.ktx2' },
    { section: 'cubes', key: 'cube3-roughness', source: '/reference-assets/images/cubes/cube3_roughness.ktx2' },
    { section: 'entry', key: 'floor-color', source: '/reference-assets/images/floor_color.ktx2', colorSpace: 'srgb' },
    { section: 'entry', key: 'ring-color', source: '/reference-assets/images/shattered_ring_color.ktx2', colorSpace: 'srgb' },
    { section: 'entry', key: 'ring-ao', source: '/reference-assets/images/shattered_ring_ao.ktx2' },
    { section: 'detail', key: 'pudgy-color', source: '/reference-assets/images/pudgy_dark_color.ktx2', colorSpace: 'srgb' },
    { section: 'detail', key: 'overpass-color', source: '/reference-assets/images/overpass_logo_dark_color.ktx2', colorSpace: 'srgb' },
    { section: 'detail', key: 'abstract-color', source: '/reference-assets/images/abstractlogo_dark_color.ktx2', colorSpace: 'srgb' }
  ],
  audio: [
    { section: 'global', key: 'music-bg', source: '../www.igloo.inc/assets/audio/music-highq.ogg' },
    { section: 'global', key: 'room-bg', source: '../www.igloo.inc/assets/audio/room.ogg' },
    { section: 'igloo', key: 'manifesto', source: '../www.igloo.inc/assets/audio/manifesto.ogg' },
    { section: 'cubes', key: 'click-project', source: '../www.igloo.inc/assets/audio/click-project.ogg' }
  ]
};
