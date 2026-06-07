import { defineConfig } from 'wxt';
import { DEFAULT_DAEMON_PORT } from '@clicksmith/core';

// https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'ClickSmith',
    description: 'Alt+Click UI elements and hand them to your coding agent — safely, in a git worktree.',
    version: '0.1.0',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: [`http://127.0.0.1:${DEFAULT_DAEMON_PORT}/*`, 'http://localhost/*'],
    icons: { '16': 'icon-16.png', '32': 'icon-32.png', '48': 'icon-48.png', '128': 'icon-128.png' },
    action: {
      default_title: 'ClickSmith',
      default_popup: 'popup.html',
      default_icon: { '16': 'icon-16.png', '32': 'icon-32.png', '48': 'icon-48.png', '128': 'icon-128.png' },
    },
  },
  srcDir: 'src',
});
