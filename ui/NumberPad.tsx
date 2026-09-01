// ============================================================
// AKE LEDGER — NumberPad
// Giant-key numeric input. No system keyboard (it's fiddly,
// covers the screen, and switches layouts). Traders tap this.
// ============================================================

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, touch, radius, type } from './theme';

interface Props {
  onKey: (digit: string) => void;
  onBackspace: () => void;
  onDone: () => void;
  doneLabel: string;      // localized "OK / Ó dáa"
  doneEnabled?: boolean;
}

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['00', '0', '⌫'],
];

export default function NumberPad({
  onKey, onBackspace, onDone, doneLabel, doneEnabled = true,
}: Props) {
  return (
    <View style={styles.wrap}>
      {KEYS.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map(k => (
            <Pressable
              key={k}
              style={({ pressed }) => [
                styles.key,
                pressed && styles.keyPressed,
              ]}
              onPress={() => (k === '⌫' ? onBackspace() : onKey(k))}
              android_ripple={{ color: colors.border }}
            >
              <Text style={styles.keyText}>{k}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      <Pressable
        style={({ pressed }) => [
          styles.done,
          !doneEnabled && styles.doneDisabled,
          pressed && doneEnabled && { backgroundColor: colors.moneyInPressed },
        ]}
        disabled={!doneEnabled}
        onPress={onDone}
      >
        <Text style={styles.doneText}>{doneLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  key: {
    flex: 1,
    height: touch.padKey,
    marginHorizontal: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: colors.border },
  keyText: { fontSize: 30, fontWeight: '700', color: colors.ink },
  done: {
    height: touch.min + 8,
    borderRadius: radius.md,
    backgroundColor: colors.moneyIn,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginHorizontal: 4,
  },
  doneDisabled: { backgroundColor: colors.disabled },
  doneText: { color: colors.white, fontSize: 24, fontWeight: '800' },
});
