export const siteContent = {
  brand: 'Igloo Rebuild',
  manifesto: {
    title: 'Manifesto',
    text: 'A reconstruction workspace for the original interactive site, starting from its runtime architecture instead of its lost source files.'
  },
  sections: [
    { key: 'igloo', label: 'Manifesto World' },
    { key: 'cubes', label: 'Portfolio Stack' },
    { key: 'entry', label: 'Entry Portal' }
  ],
  projects: [
    {
      index: 0,
      hash: 'pudgy-penguins',
      title: 'Pudgy Penguins',
      dateLabel: '2020.01.02',
      accent: '#8ed9ff',
      modelKey: 'pudgy',
      textureKey: 'pudgy-color',
      summary: 'Project detail placeholder for the first portfolio object. Replace with extracted copy once the real content layer is migrated.'
    },
    {
      index: 1,
      hash: 'overpass',
      title: 'Overpass',
      dateLabel: '2023.06.01',
      accent: '#ffb77c',
      modelKey: 'overpass',
      textureKey: 'overpass-color',
      summary: 'Project detail placeholder for the second portfolio object. This scene will later be wired to recovered mesh and texture assets.'
    },
    {
      index: 2,
      hash: 'abstract',
      title: 'Abstract',
      dateLabel: '2024.06.28',
      accent: '#b7a7ff',
      modelKey: 'abstract',
      textureKey: 'abstract-color',
      summary: 'Project detail placeholder for the third portfolio object. The current detail scene only proves route, state and animation flow.'
    }
  ],
  social: [
    { label: 'Original Dump', url: '../www.igloo.inc/index.html' },
    { label: 'Draco Assets', url: '../www.igloo.inc/assets/geometries/' },
    { label: 'Texture Assets', url: '../www.igloo.inc/assets/images/' }
  ]
};
