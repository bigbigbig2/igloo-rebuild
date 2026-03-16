function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function smoothWindow(value, start, end) {
  if (end <= start) {
    return value >= end ? 1 : 0;
  }

  const normalized = clamp((value - start) / (end - start), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function toMultilineHtml(text = '') {
  return text.replace(/\n/g, '<br/>');
}

export class UIScene {
  constructor({ container, content }) {
    this.container = container;
    this.content = content;
    this.state = {
      routeName: null,
      projectHash: null,
      detailUiProgress: 0,
      hoveredProjectHash: null,
      interactionLabel: '',
      sectionLabel: '',
      activeSectionKey: null
    };
    this.handlers = {
      home: () => {},
      previous: () => {},
      next: () => {},
      project: () => {}
    };

    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.container.appendChild(this.root);

    this.root.innerHTML = `
      <div class="hud__column hud__column--main">
        <div class="hud__panel hud__panel--hero" data-manifesto-shell>
          <p class="hud__eyebrow">Manifesto</p>
          <p class="hud__brand hud__manifesto-block" data-manifesto-block="brand">${content.brand}</p>
          <h1 class="hud__title hud__manifesto-block" data-manifesto-block="title">${content.manifesto.title}</h1>
          <p class="hud__lead hud__manifesto-block" data-manifesto-block="text">${content.manifesto.text}</p>
          <div class="hud__manifesto-legal hud__manifesto-block" data-manifesto-block="legal">
            <p class="hud__eyebrow">${content.manifesto.copyright ?? ''}</p>
            <p class="hud__manifesto-rights">${toMultilineHtml(content.manifesto.rights ?? '')}</p>
          </div>
          <div class="hud__section-tag" data-section-tag>
            <span class="hud__section-dot"></span>
            <span data-section-label>Manifesto World</span>
          </div>
        </div>

        <div class="hud__pillbar">
          <button class="hud__button hud__button--ghost" data-action="previous">Prev</button>
          <button class="hud__button" data-action="home">Home</button>
          <button class="hud__button hud__button--ghost" data-action="next">Next</button>
        </div>

        <div class="hud__footer">
          <span data-interaction-label>${content.scrollLabel ?? 'Scroll or use arrow keys to move between reconstructed sections.'}</span>
        </div>
      </div>

      <div class="hud__column hud__column--side">
        <div class="hud__panel" data-project-list></div>
        <div class="hud__panel is-hidden" data-project-detail></div>
        <div class="hud__panel hud__panel--entry is-hidden" data-entry-panel></div>
        <div class="hud__panel" data-social-panel>
          <p class="hud__eyebrow">${content.socialTitle ?? 'Links'}</p>
          <div class="hud__links" data-social-links></div>
        </div>
      </div>
    `;

    this.sectionTag = this.root.querySelector('[data-section-tag]');
    this.sectionLabel = this.root.querySelector('[data-section-label]');
    this.manifestoShell = this.root.querySelector('[data-manifesto-shell]');
    this.manifestoBlocks = {
      brand: this.root.querySelector('[data-manifesto-block="brand"]'),
      title: this.root.querySelector('[data-manifesto-block="title"]'),
      text: this.root.querySelector('[data-manifesto-block="text"]'),
      legal: this.root.querySelector('[data-manifesto-block="legal"]')
    };
    this.projectList = this.root.querySelector('[data-project-list]');
    this.projectDetail = this.root.querySelector('[data-project-detail]');
    this.entryPanel = this.root.querySelector('[data-entry-panel]');
    this.socialLinks = this.root.querySelector('[data-social-links]');
    this.interactionLabel = this.root.querySelector('[data-interaction-label]');

    this.renderProjectCards();
    this.renderEntryPanel();
    this.renderSocialLinks();
    this.bindStaticEvents();
  }

  bind({ onHome, onPrevious, onNext, onProject }) {
    this.handlers.home = onHome;
    this.handlers.previous = onPrevious;
    this.handlers.next = onNext;
    this.handlers.project = onProject;
  }

  bindStaticEvents() {
    this.root.querySelector('[data-action="home"]').addEventListener('click', () => this.handlers.home());
    this.root.querySelector('[data-action="previous"]').addEventListener('click', () => this.handlers.previous());
    this.root.querySelector('[data-action="next"]').addEventListener('click', () => this.handlers.next());
  }

  renderProjectCards(activeHash = null) {
    this.projectList.innerHTML = `
      <p class="hud__eyebrow">Portfolio</p>
      <div class="hud__stack">
        ${this.content.projects.map((project) => `
          <button class="hud__card ${activeHash === project.hash ? 'is-active' : ''}" data-project="${project.hash}">
            <h2 class="hud__card-title">${project.title}</h2>
            <p class="hud__card-meta">${project.dateLabel} / ${project.hash}</p>
          </button>
        `).join('')}
      </div>
    `;

    this.projectList.querySelectorAll('[data-project]').forEach((button) => {
      button.addEventListener('click', () => {
        this.handlers.project(button.dataset.project);
      });
    });
  }

  renderEntryPanel() {
    this.entryPanel.innerHTML = `
      <div class="hud__entry">
        <div class="hud__entry-block" data-entry-block="header">
          <p class="hud__eyebrow">Outbound Portals</p>
          <h2 class="hud__detail-title">Entry Links</h2>
        </div>
        <p class="hud__detail-copy hud__entry-block" data-entry-block="copy">External links reconstructed from the original site link registry. This stays in the DOM HUD until the WebGL portal UI is migrated.</p>
        <div class="hud__stack hud__entry-block" data-entry-block="links">
          ${this.content.links.map((link) => `
            <a class="hud__card hud__card--link" href="${link.url}" target="_blank" rel="noreferrer">
              <h3 class="hud__card-title">${link.label}</h3>
              <p class="hud__card-meta">${link.vdb ?? 'portal'} / scale ${link.scale ?? 1}</p>
            </a>
          `).join('')}
        </div>
      </div>
    `;

    this.entryBlocks = {
      header: this.entryPanel.querySelector('[data-entry-block="header"]'),
      copy: this.entryPanel.querySelector('[data-entry-block="copy"]'),
      links: this.entryPanel.querySelector('[data-entry-block="links"]')
    };
  }

  renderSocialLinks() {
    this.socialLinks.innerHTML = this.content.social.map((link) => `
      <a class="hud__link" href="${link.url}" target="_blank" rel="noreferrer">${link.label}</a>
    `).join('');
  }

  renderProjectDetail(project = null) {
    if (!project) {
      this.projectDetail.classList.add('is-hidden');
      this.projectDetail.innerHTML = '';
      this.projectDetail.style.opacity = '';
      this.projectDetail.style.transform = '';
      this.projectDetail.style.pointerEvents = '';
      return;
    }

    this.projectDetail.classList.remove('is-hidden');
    this.projectDetail.innerHTML = `
      <div class="hud__detail">
        <div class="hud__detail-block" data-detail-block="header">
          <p class="hud__eyebrow">${project.detailTitle ?? 'Project Detail'}</p>
          <h2 class="hud__detail-title">${project.title}</h2>
        </div>
        <p class="hud__detail-copy hud__detail-block" data-detail-block="summary">${project.summary}</p>
        ${project.social?.length ? `
          <div class="hud__detail-block" data-detail-block="social">
            <p class="hud__eyebrow">${project.socialTitle ?? 'Links'}</p>
            <div class="hud__links">
              ${project.social.map((link) => `
                <a class="hud__link" href="${link.url}" target="_blank" rel="noreferrer">${link.label}</a>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${project.links?.length ? `
          <div class="hud__detail-block" data-detail-block="links">
            <p class="hud__eyebrow">${project.linkTitle ?? 'Visit'}</p>
            <div class="hud__links">
              ${project.links.map((link) => `
                <a class="hud__link" href="${link.url}" target="_blank" rel="noreferrer">${link.label}</a>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <div class="hud__pillbar hud__detail-block" data-detail-block="actions">
          <button class="hud__button" data-detail-home>Back Home</button>
        </div>
      </div>
    `;

    this.projectDetail.querySelector('[data-detail-home]').addEventListener('click', () => this.handlers.home());
  }

  applyManifestoPresentation(iglooPresentation = null, route = null, activeSectionKey = null) {
    const isIglooActive = route?.name === 'home' && activeSectionKey === 'igloo';
    const panelProgress = isIglooActive ? (iglooPresentation?.panelProgress ?? 0) : 0;
    const brandProgress = isIglooActive ? (iglooPresentation?.brandProgress ?? panelProgress) : 0.3;
    const titleProgress = isIglooActive ? (iglooPresentation?.titleProgress ?? panelProgress) : 0;
    const textProgress = isIglooActive ? (iglooPresentation?.textProgress ?? panelProgress) : 0;
    const legalProgress = isIglooActive ? (iglooPresentation?.legalProgress ?? panelProgress) : 0;
    const shellOpacity = isIglooActive ? 0.72 + panelProgress * 0.28 : 0.2;
    const shellOffset = isIglooActive ? (1 - panelProgress) * 12 : -10;
    const shellScale = isIglooActive ? 0.992 + panelProgress * 0.008 : 0.985;

    this.manifestoShell.style.opacity = `${shellOpacity}`;
    this.manifestoShell.style.transform = `translate3d(0, ${shellOffset}px, 0) scale(${shellScale})`;

    const configs = {
      brand: { reveal: brandProgress, offset: 10 },
      title: { reveal: titleProgress, offset: 16 },
      text: { reveal: textProgress, offset: 20 },
      legal: { reveal: legalProgress, offset: 14 }
    };

    Object.entries(configs).forEach(([key, config]) => {
      const element = this.manifestoBlocks[key];

      if (!element) {
        return;
      }

      const reveal = clamp(config.reveal, 0, 1);
      const translateY = (1 - reveal) * config.offset;
      const scale = 0.988 + reveal * 0.012;

      element.style.opacity = `${reveal}`;
      element.style.transform = `translate3d(0, ${translateY}px, 0) scale(${scale})`;
      element.style.pointerEvents = reveal > 0.72 ? 'auto' : 'none';
    });

    const tagReveal = isIglooActive ? clamp(0.7 + panelProgress * 0.3, 0, 1) : 0.78;
    this.sectionTag.style.opacity = `${tagReveal}`;
    this.sectionTag.style.transform = `translate3d(0, ${(1 - tagReveal) * 8}px, 0)`;
  }

  applyEntryPresentation(entryPresentation = null, route = null, activeSectionKey = null, hasProject = false) {
    const isEntryActive = route?.name === 'home' && activeSectionKey === 'entry' && !hasProject;
    const panelProgress = isEntryActive ? (entryPresentation?.panelProgress ?? 0) : 0;
    const linksProgress = isEntryActive ? (entryPresentation?.linksProgress ?? 0) : 0;
    const pulse = isEntryActive ? (entryPresentation?.interactionPulse ?? 0) : 0;

    if (!isEntryActive && panelProgress <= 0.001) {
      this.entryPanel.classList.add('is-hidden');
      this.entryPanel.style.opacity = '0';
      this.entryPanel.style.transform = 'translate3d(0, 18px, 0)';
      this.entryPanel.style.pointerEvents = 'none';
      return;
    }

    this.entryPanel.classList.remove('is-hidden');
    this.entryPanel.style.opacity = `${0.08 + panelProgress * 0.92}`;
    this.entryPanel.style.transform = `translate3d(0, ${(1 - panelProgress) * 18}px, 0) scale(${0.988 + panelProgress * 0.012})`;
    this.entryPanel.style.pointerEvents = isEntryActive && panelProgress > 0.6 ? 'auto' : 'none';
    this.entryPanel.style.boxShadow = `0 18px 80px rgba(0, 0, 0, ${0.28 + pulse * 0.08})`;

    const blockConfig = {
      header: { reveal: panelProgress, offset: 14 },
      copy: { reveal: smoothWindow(panelProgress, 0.18, 0.72), offset: 16 },
      links: { reveal: linksProgress, offset: 18 }
    };

    Object.entries(blockConfig).forEach(([key, config]) => {
      const element = this.entryBlocks?.[key];

      if (!element) {
        return;
      }

      const reveal = clamp(config.reveal, 0, 1);
      element.style.opacity = `${reveal}`;
      element.style.transform = `translate3d(0, ${(1 - reveal) * config.offset}px, 0) scale(${0.988 + reveal * 0.012})`;
      element.style.pointerEvents = reveal > 0.72 ? 'auto' : 'none';
    });

    if (isEntryActive) {
      this.projectList.style.opacity = `${Math.max(0.05, 1 - panelProgress * 1.15)}`;
      this.projectList.style.transform = `translate3d(0, ${panelProgress * -10}px, 0)`;
      this.projectList.style.pointerEvents = panelProgress > 0.22 ? 'none' : 'auto';
    }
  }

  applyDetailBlockPresentation(detailUiProgress = 0) {
    const blocks = [
      { key: 'header', start: 0.08, end: 0.34, offset: 16 },
      { key: 'summary', start: 0.2, end: 0.46, offset: 18 },
      { key: 'social', start: 0.38, end: 0.64, offset: 20 },
      { key: 'links', start: 0.5, end: 0.76, offset: 20 },
      { key: 'actions', start: 0.68, end: 0.9, offset: 14 }
    ];

    blocks.forEach(({ key, start, end, offset }) => {
      const element = this.projectDetail.querySelector(`[data-detail-block="${key}"]`);

      if (!element) {
        return;
      }

      const reveal = smoothWindow(detailUiProgress, start, end);
      const translateY = (1 - reveal) * offset;
      const scale = 0.985 + reveal * 0.015;

      element.style.opacity = `${reveal}`;
      element.style.transform = `translate3d(0, ${translateY}px, 0) scale(${scale})`;
      element.style.pointerEvents = reveal > 0.86 ? 'auto' : 'none';
    });
  }

  applyDetailPresentation(detailUiProgress = 0, hasProject = false) {
    const reveal = Math.max(0, Math.min(1, detailUiProgress));
    const listOpacity = hasProject ? Math.max(0.14, 1 - reveal * 1.2) : 1;
    const listOffset = hasProject ? reveal * -12 : 0;
    const detailOffset = (1 - reveal) * 18;
    const detailScale = 0.985 + reveal * 0.015;

    this.projectList.style.opacity = `${listOpacity}`;
    this.projectList.style.transform = `translate3d(0, ${listOffset}px, 0)`;
    this.projectList.style.pointerEvents = hasProject && reveal > 0.12 ? 'none' : 'auto';

    if (!hasProject && reveal <= 0.001) {
      this.projectDetail.classList.add('is-hidden');
      this.projectDetail.style.opacity = '0';
      this.projectDetail.style.transform = 'translate3d(0, 18px, 0)';
      this.projectDetail.style.pointerEvents = 'none';
      return;
    }

    this.projectDetail.classList.remove('is-hidden');
    this.projectDetail.style.opacity = `${reveal}`;
    this.projectDetail.style.transform = `translate3d(0, ${detailOffset}px, 0) scale(${detailScale})`;
    this.projectDetail.style.pointerEvents = reveal > 0.72 ? 'auto' : 'none';
    this.applyDetailBlockPresentation(reveal);
  }

  applyCubesHomePresentation(route = null, activeSectionKey = null, hasProject = false) {
    const isCubesHome = route?.name === 'home' && activeSectionKey === 'cubes' && !hasProject;
    const sidePanels = [this.projectList, this.root.querySelector('[data-social-panel]')].filter(Boolean);
    const hiddenOpacity = isCubesHome ? '0' : '';
    const hiddenPointerEvents = isCubesHome ? 'none' : '';
    const hiddenTransform = isCubesHome ? 'translate3d(0, 16px, 0)' : '';

    this.manifestoShell.style.opacity = isCubesHome ? '0' : this.manifestoShell.style.opacity;
    this.manifestoShell.style.pointerEvents = isCubesHome ? 'none' : '';
    this.manifestoShell.style.transform = isCubesHome ? 'translate3d(0, 16px, 0) scale(0.985)' : this.manifestoShell.style.transform;

    sidePanels.forEach((panel) => {
      panel.style.opacity = hiddenOpacity;
      panel.style.pointerEvents = hiddenPointerEvents;
      panel.style.transform = hiddenTransform;
    });

    const pillbar = this.root.querySelector('.hud__pillbar');
    const footer = this.root.querySelector('.hud__footer');

    if (pillbar) {
      pillbar.style.opacity = hiddenOpacity;
      pillbar.style.pointerEvents = hiddenPointerEvents;
      pillbar.style.transform = hiddenTransform;
    }

    if (footer) {
      footer.style.opacity = hiddenOpacity;
      footer.style.pointerEvents = hiddenPointerEvents;
      footer.style.transform = hiddenTransform;
    }
  }

  applyEntryHomePresentation(route = null, activeSectionKey = null, hasProject = false) {
    const isEntryHome = route?.name === 'home' && activeSectionKey === 'entry' && !hasProject;
    const panels = [
      this.manifestoShell,
      this.projectList,
      this.root.querySelector('[data-social-panel]'),
      this.root.querySelector('.hud__pillbar'),
      this.root.querySelector('.hud__footer')
    ].filter(Boolean);

    const hiddenOpacity = isEntryHome ? '0' : '';
    const hiddenPointerEvents = isEntryHome ? 'none' : '';
    const hiddenTransform = isEntryHome ? 'translate3d(0, 16px, 0)' : '';

    panels.forEach((panel) => {
      panel.style.opacity = hiddenOpacity;
      panel.style.pointerEvents = hiddenPointerEvents;
      panel.style.transform = hiddenTransform;
    });
  }

  update(state) {
    if (this.state.sectionLabel !== state.sectionLabel) {
      this.sectionLabel.textContent = state.sectionLabel;
      this.state.sectionLabel = state.sectionLabel;
    }

    if (this.state.interactionLabel !== state.interactionLabel) {
      this.interactionLabel.textContent = state.interactionLabel;
      this.state.interactionLabel = state.interactionLabel;
    }

    this.applyManifestoPresentation(state.iglooPresentation, state.route, state.activeSectionKey);
    this.applyDetailPresentation(state.detailUiProgress, Boolean(state.project));
    this.applyEntryPresentation(state.entryPresentation, state.route, state.activeSectionKey, Boolean(state.project));
    this.applyCubesHomePresentation(state.route, state.activeSectionKey, Boolean(state.project));
    this.applyEntryHomePresentation(state.route, state.activeSectionKey, Boolean(state.project));

    const nextRouteName = state.route.name;
    const nextProjectHash = state.project?.hash ?? null;
    const nextDetailUiProgress = state.detailUiProgress ?? 0;
    const nextHoveredProjectHash = state.hoveredProject?.hash ?? null;
    const nextActiveSectionKey = state.activeSectionKey ?? null;

    this.root.dataset.route = nextRouteName;
    this.root.dataset.section = nextActiveSectionKey ?? 'none';
    this.root.dataset.detail = nextProjectHash ? 'true' : 'false';
    this.root.dataset.webglUi = state.useWebglUi ? 'true' : 'false';

    this.state.detailUiProgress = nextDetailUiProgress;

    if (
      this.state.routeName === nextRouteName
      && this.state.projectHash === nextProjectHash
      && this.state.hoveredProjectHash === nextHoveredProjectHash
      && this.state.activeSectionKey === nextActiveSectionKey
    ) {
      return;
    }

    this.state.routeName = nextRouteName;
    this.state.projectHash = nextProjectHash;
    this.state.hoveredProjectHash = nextHoveredProjectHash;
    this.state.activeSectionKey = nextActiveSectionKey;

    this.renderProjectCards(nextProjectHash ?? nextHoveredProjectHash);
    this.renderProjectDetail(state.project);
  }
}



