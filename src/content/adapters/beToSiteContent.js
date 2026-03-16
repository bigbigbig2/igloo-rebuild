const CUBE_SURFACE_ASSETS = {
  cube1: {
    geometryKey: 'cube1',
    normalKey: 'cube1-normal',
    roughnessKey: 'cube1-roughness'
  },
  cube2: {
    geometryKey: 'cube2',
    normalKey: 'cube2-normal',
    roughnessKey: 'cube2-roughness'
  },
  cube3: {
    geometryKey: 'cube3',
    normalKey: 'cube3-normal',
    roughnessKey: 'cube3-roughness'
  }
};

const DETAIL_VISUALS = {
  pudgy: {
    accent: '#8ed9ff',
    geometryKey: 'pudgy',
    textureKey: 'pudgy-color',
    innerGeometryKey: 'pudgy',
    innerTextureKey: 'pudgy-inner-color'
  },
  overpass_logo: {
    accent: '#ffb77c',
    geometryKey: 'overpass',
    textureKey: 'overpass-color',
    innerGeometryKey: 'overpass',
    innerTextureKey: 'overpass-inner-color'
  },
  abstractlogo: {
    accent: '#b7a7ff',
    geometryKey: 'abstract',
    textureKey: 'abstract-color',
    innerGeometryKey: 'abstract',
    innerTextureKey: 'abstract-inner-color'
  }
};

function toDisplayTitle(title) {
  return title.replace(/^PORTFOLIO_CO_\d+\s+/, '').trim();
}

function toProject(cube, index) {
  const cubeSurface = CUBE_SURFACE_ASSETS[cube.obj] ?? CUBE_SURFACE_ASSETS.cube1;
  const detailVisual = DETAIL_VISUALS[cube.interior.obj] ?? DETAIL_VISUALS.abstractlogo;

  return {
    index,
    hash: cube.hash,
    title: toDisplayTitle(cube.title),
    originalTitle: cube.title,
    dateLabel: cube.date,
    temp: cube.temp ?? 0,
    accent: detailVisual.accent,
    cubeKey: cube.obj,
    cubeGeometryKey: cubeSurface.geometryKey,
    cubeNormalKey: cubeSurface.normalKey,
    cubeRoughnessKey: cubeSurface.roughnessKey,
    innerObjectKey: cube.innerobject,
    innerGeometryKey: detailVisual.innerGeometryKey,
    innerTextureKey: detailVisual.innerTextureKey,
    innerObjectScale: cube.interior.objScale,
    modelKey: detailVisual.geometryKey,
    textureKey: detailVisual.textureKey,
    summary: cube.interior.content.trim(),
    detailTitle: cube.interior.title,
    detailEnabled: cube.interior.enabled,
    socialTitle: cube.interior.socialTitle,
    social: cube.interior.social.map((entry) => ({
      label: entry.name,
      url: entry.link
    })),
    linkTitle: cube.interior.linkTitle,
    links: cube.interior.links.map((entry) => ({
      label: entry.name,
      url: entry.link
    })),
    detailObjectKey: cube.interior.obj,
    detailObjectScale: cube.interior.objScale,
    detailGeometryKey: detailVisual.geometryKey,
    detailTextureKey: detailVisual.textureKey
  };
}

export function adaptBeToSiteContent(rawBe) {
  const sections = [
    { key: 'igloo', label: 'Manifesto World', height: 2.35 },
    { key: 'cubes', label: 'Portfolio Stack', height: rawBe.cubes.length || 1 },
    { key: 'entry', label: 'Entry Portal', height: 5.5 }
  ];

  return {
    brand: 'IGLOO',
    manifesto: {
      title: rawBe.manifesto.title,
      text: rawBe.manifesto.text,
      copyright: rawBe.copyright,
      rights: rawBe.rights
    },
    sections,
    projects: rawBe.cubes.map(toProject),
    socialTitle: rawBe.follow,
    social: rawBe.social.map((entry) => ({
      label: entry.name,
      url: entry.link
    })),
    links: rawBe.links.map((entry) => ({
      label: entry.title,
      url: entry.url,
      vdb: entry.vdb,
      scale: entry.scale
    })),
    scrollLabel: rawBe.scroll,
    clickLabel: rawBe.click,
    closeLabel: rawBe.close,
    audio: {
      volume: rawBe.volume,
      muted: rawBe.muted
    }
  };
}
