/**
 * Planner — registers a sidebar button on NOTE files. Tapping it opens the
 * plugin view (App.tsx), which creates planners and syncs ✓ marks.
 *
 * @format
 */

import { AppRegistry, Image } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { PluginManager } from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

// showType: 1 — the host opens the plugin view on tap.
PluginManager.registerButton(1, ['NOTE'], {
  id: 1,
  name: 'Planner',
  icon: Image.resolveAssetSource(require('./assets/icon.png')).uri,
  showType: 1,
});

PluginManager.registerButtonListener({
  onButtonPress: () => {},
});
