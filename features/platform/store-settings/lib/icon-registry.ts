import { DEFAULT_STORE_LOGO_ICON } from '@/features/lib/store-logo';
import {
  LOGO_ICONS as UNTITLED_LOGO_ICONS,
  HUE_PRESETS,
} from './untitled-logo-registry';

const BURGER_LOGO = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" height="100%" width="100%" viewBox="0 0 48 48"><path fill="#155eef" d="M8 21c.7-7.4 7-13 16-13s15.3 5.6 16 13H8Zm-2 4h36v5H6v-5Zm3 9h30v2a6 6 0 0 1-6 6H15a6 6 0 0 1-6-6v-2Z"/><circle cx="18" cy="15" r="1.5" fill="white"/><circle cx="25" cy="12" r="1.5" fill="white"/><circle cx="31" cy="16" r="1.5" fill="white"/></svg>';
const STACK_LOGO = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" height="100%" width="100%" viewBox="0 0 48 48"><path fill="#155eef" d="m24 4 19 10-19 10L5 14 24 4Zm0 24 15-7.9 4 2.1-19 10-19-10 4-2.1L24 28Zm0 8 15-7.9 4 2.1-19 10-19-10 4-2.1L24 36Z"/></svg>';
const SPARK_LOGO = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" height="100%" width="100%" viewBox="0 0 48 48"><path fill="#155eef" fill-rule="evenodd" d="M0 24C15.255 24 24 15.255 24 0c0 15.255 8.745 24 24 24-15.255 0-24 8.745-24 24C24 32.745 15.255 24 0 24Z" clip-rule="evenodd"/></svg>';
const OPENFRONT_LOGO = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" height="100%" width="100%" viewBox="0 0 42 48"><path fill="#155eef" fill-rule="evenodd" d="m22.102 20.86 9.9-9.9L29.88 8.84l-7.339 7.339V3h-3v13.178l-7.339-7.34-2.121 2.122 9.9 9.9 1.06 1.06Zm2.12 2.121 9.9-9.9 2.121 2.122-7.339 7.339H42v3H28.904l7.34 7.339L34.121 35l-9.9-9.899-1.06-1.06ZM7.96 35.001l9.9-9.899 1.06-1.06-1.06-1.061-9.9-9.9-2.121 2.122 7.339 7.339H.002v3h13.176l-7.34 7.339Zm12.02-7.777-9.9 9.9 2.122 2.12 7.339-7.338V45h3V31.906l7.339 7.338L32 37.124l-9.9-9.9-1.06-1.061-1.06 1.06Z" clip-rule="evenodd"/></svg>';

export const LOGO_ICONS = [
  { id: 'restaurant', name: 'Restaurant', lightSvg: DEFAULT_STORE_LOGO_ICON },
  { id: 'burger', name: 'Burger', lightSvg: BURGER_LOGO },
  { id: 'stack', name: 'Stack', lightSvg: STACK_LOGO },
  { id: 'spark', name: 'Spark', lightSvg: SPARK_LOGO },
  { id: 'openfront', name: 'Openfront', lightSvg: OPENFRONT_LOGO },
  ...UNTITLED_LOGO_ICONS,
] as const;

export { HUE_PRESETS };
