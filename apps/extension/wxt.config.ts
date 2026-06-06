import { defineConfig } from 'wxt';
import { DEFAULT_DAEMON_PORT } from '@clicksmith/core';

// https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'ClickSmith',
    description: 'Alt+Click UI elements and hand them to your coding agent — safely, in a git worktree.',
    version: '0.1.0',
    permissions: ['storage', 'activeTab', 'scripting'],
    // The extension talks only to the loopback daemon.
    host_permissions: [`http://127.0.0.1:${DEFAULT_DAEMON_PORT}/*`, 'http://localhost/*'],
    action: { default_title: 'ClickSmith', default_popup: 'popup.html' },
  },
  srcDir: 'src',
});
