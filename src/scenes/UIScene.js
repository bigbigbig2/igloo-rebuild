export class UIScene {
  constructor({ container, content }) {
    this.container = container;
    this.content = content;
    this.state = {
      routeName: null,
      projectHash: null,
      sectionLabel: ''
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
      <div class="hud__column">
        <div class="hud__panel">
          <p class="hud__eyebrow">Reverse Engineering Build</p>
          <h1 class="hud__title">${content.brand}</h1>
          <p class="hud__lead">${content.manifesto.text}</p>
          <div class="hud__section-tag">
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
          Scroll or use arrow keys to move between reconstructed sections.
        </div>
      </div>

      <div class="hud__column">
        <div class="hud__panel" data-project-list></div>
        <div class="hud__panel is-hidden" data-project-detail></div>
        <div class="hud__panel">
          <p class="hud__eyebrow">Reference Links</p>
          <div class="hud__links" data-social-links></div>
        </div>
      </div>
    `;

    this.sectionLabel = this.root.querySelector('[data-section-label]');
    this.projectList = this.root.querySelector('[data-project-list]');
    this.projectDetail = this.root.querySelector('[data-project-detail]');
    this.socialLinks = this.root.querySelector('[data-social-links]');

    this.renderProjectCards();
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

  renderSocialLinks() {
    this.socialLinks.innerHTML = this.content.social.map((link) => `
      <a class="hud__link" href="${link.url}" target="_blank" rel="noreferrer">${link.label}</a>
    `).join('');
  }

  renderProjectDetail(project = null) {
    if (!project) {
      this.projectDetail.classList.add('is-hidden');
      this.projectDetail.innerHTML = '';
      return;
    }

    this.projectDetail.classList.remove('is-hidden');
    this.projectDetail.innerHTML = `
      <div class="hud__detail">
        <div>
          <p class="hud__eyebrow">Project Detail</p>
          <h2 class="hud__detail-title">${project.title}</h2>
        </div>
        <p class="hud__detail-copy">${project.summary}</p>
        <div class="hud__pillbar">
          <button class="hud__button" data-detail-home>Back Home</button>
        </div>
      </div>
    `;

    this.projectDetail.querySelector('[data-detail-home]').addEventListener('click', () => this.handlers.home());
  }

  update(state) {
    if (this.state.sectionLabel !== state.sectionLabel) {
      this.sectionLabel.textContent = state.sectionLabel;
      this.state.sectionLabel = state.sectionLabel;
    }

    const nextRouteName = state.route.name;
    const nextProjectHash = state.project?.hash ?? null;

    if (this.state.routeName === nextRouteName && this.state.projectHash === nextProjectHash) {
      return;
    }

    this.state.routeName = nextRouteName;
    this.state.projectHash = nextProjectHash;

    this.renderProjectCards(nextProjectHash);
    this.renderProjectDetail(nextRouteName === 'project' ? state.project : null);
  }
}
