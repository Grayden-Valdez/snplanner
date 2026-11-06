// Coded with Claude (https://claude.com/claude-code). No human wrote a line of this — review accordingly before relying on it.
/**
 * Planner — plugin view. Create a yearly planner note, or sync the ✓ marks
 * on the week/month/quarter/year pages of the open planner.
 *
 * @format
 */

import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { PluginManager } from 'sn-plugin-lib';
// @ts-ignore — plain JS module
import * as planner from './src/planner';

type Progress = (stage: string, done: number, total: number) => void;
const createPlanner: (year: number, p: Progress) => Promise<{ notePath: string; pages: number }> = planner.createPlanner as any;
const syncMarks: (scope: 'month' | 'all', p: Progress) => Promise<{ added: number; removed: number; inked: number; scanned: number }> = planner.syncMarks as any;

function App(): React.JSX.Element {
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const progress = (stage: string, done: number, total: number) => {
    setStatus(`${stage}… ${done}/${total}`);
  };

  const run = (label: string, task: () => Promise<string>) => {
    if (busy) return;
    setBusy(true);
    setStatus(`${label}…`);
    task()
      .then(
        (msg: string) => {
          setStatus(msg);
          ToastAndroid.showWithGravity(msg, ToastAndroid.LONG, ToastAndroid.BOTTOM);
          setBusy(false);
          PluginManager.closePluginView().catch(() => {});
        },
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          setStatus(`Failed: ${message}`);
          ToastAndroid.showWithGravity(`Planner failed: ${message}`, ToastAndroid.LONG, ToastAndroid.BOTTOM);
          setBusy(false);
        },
      );
  };

  const onCreate = () => {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      setStatus('Enter a year between 2000 and 2100');
      return;
    }
    run('Creating planner', async () => {
      const r = await createPlanner(y, progress);
      return `Created ${r.pages}-page planner: ${r.notePath}`;
    });
  };

  const onSync = (scope: 'month' | 'all') =>
    run('Syncing ✓ marks', async () => {
      const r = await syncMarks(scope, progress);
      return `✓ synced: ${r.inked} of ${r.scanned} days have notes (+${r.added} / −${r.removed} marks)`;
    });

  const Btn = ({ label, onPress, big }: { label: string; onPress: () => void; big?: boolean }) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.btn, big && styles.btnBig, pressed && styles.btnPressed, busy && styles.btnDisabled]}>
      <Text style={[styles.btnText, big && styles.btnTextBig]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Yearly Planner</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Create a new planner for</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={year}
            onChangeText={setYear}
            keyboardType="numeric"
            maxLength={4}
            editable={!busy}
          />
          <Btn label="Create planner" onPress={onCreate} big />
        </View>
        <Text style={styles.hint}>
          Writes Note/Planner {year}.note (≈440 pages). Takes a few minutes — keep the device awake.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Sync ✓ marks on the open planner</Text>
        <View style={styles.row}>
          <Btn label="This month" onPress={() => onSync('month')} />
          <Btn label="Whole year" onPress={() => onSync('all')} />
        </View>
        <Text style={styles.hint}>
          Scans day pages for handwriting and shows a ✓ for each on the week, month, quarter and year pages. Tap a ✓ to jump to that day.
        </Text>
      </View>

      {status ? <Text style={styles.status}>{status}</Text> : null}

      <Pressable onPress={() => PluginManager.closePluginView().catch(() => {})} style={styles.cancel} disabled={busy}>
        <Text style={styles.cancelText}>{busy ? 'Working…' : 'Close'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'stretch', justifyContent: 'center', padding: 36, backgroundColor: '#fff' },
  title: { fontSize: 30, fontWeight: 'bold', marginBottom: 28, color: '#000', textAlign: 'center' },
  section: { marginBottom: 32, borderWidth: 2, borderColor: '#000', borderRadius: 12, padding: 20 },
  label: { fontSize: 22, color: '#000', marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  input: {
    width: 130, height: 60, borderWidth: 2, borderColor: '#000', borderRadius: 10,
    fontSize: 26, color: '#000', textAlign: 'center', marginRight: 16, backgroundColor: '#fff',
  },
  hint: { fontSize: 16, color: '#444', marginTop: 12 },
  btn: {
    paddingVertical: 14, paddingHorizontal: 22, marginRight: 14, borderWidth: 2,
    borderColor: '#000', borderRadius: 10, backgroundColor: '#fff',
  },
  btnBig: { paddingVertical: 16 },
  btnPressed: { backgroundColor: '#ddd' },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 20, color: '#000' },
  btnTextBig: { fontSize: 22, fontWeight: 'bold' },
  status: { fontSize: 18, color: '#000', textAlign: 'center', marginBottom: 20 },
  cancel: { alignSelf: 'center', padding: 12 },
  cancelText: { fontSize: 18, color: '#000' },
});

export default App;
