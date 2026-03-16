import { adaptBeToSiteContent } from './adapters/beToSiteContent.js';
import { rawBe } from './raw/be.js';

export const siteContent = adaptBeToSiteContent(rawBe);
