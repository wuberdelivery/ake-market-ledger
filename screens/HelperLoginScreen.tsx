// ============================================================
// AKE LEDGER — HelperLoginScreen
// Pick who is minding the shop. OWNER sees everything; HELPER
// (Ìrànwọ́) can log sales but the app hides profit and cost.
// Reached from a small button on Home; PIN-gated if set.
// ============================================================

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { colors, spacing, radius, touch } from '../ui/theme';
import NumberPad from '../ui/NumberPad';
import { t } from '../i18n/labels';
import type { Language } from '../models/types';
import { listUsers, verifyUserPin } from '../db/setupRepository';

interface Props {
  language: Language;
  onLogin: (userId: string, role: 'OWNER' | 'HELPER') => void;
  onCancel: () => void;
}

export default function HelperLoginScreen({ language: lang, onLogin, onCancel }: Props) {
  const users = listUsers();
  const [selected, setSelected] = useState<{ id: string; role: string; hasPin: boolean } | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const tryLogin = () => {
    if (!selected) return;
    if (verifyUserPin(selected.id, pin)) {
      onLogin(selected.id, selected.role as 'OWNER' | 'HELPER');
    } else {
      setError(true);
      setPin('');
    }
  };

  if (selected && selected.hasPin) {
    return (
      <View style={styles.screen}>
        <Pressable style={styles.close} onPress={() => { setSelected(null); setPin(''); setError(false); }}>
          <Text style={styles.closeText}>←</Text>
        </Pressable>
        <Text style={styles.prompt}>🔒 {t(lang, 'helper.enter_pin')}</Text>
        <Text style={[styles.pinDots, error && { color: colors.loss }]}>
          {'●'.repeat(pin.length)}{'○'.repeat(4 - pin.length)}
        </Text>
        <NumberPad
          onKey={d => { setError(false); d !== '00' && setPin(p => (p + d).slice(0, 4)); }}
          onBackspace={() => setPin(p => p.slice(0, -1))}
          doneLabel="✔"
          doneEnabled={pin.length === 4}
          onDone={tryLogin}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.close} onPress={onCancel}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <Text style={styles.title}>{t(lang, 'helper.login')}</Text>
      </View>
      <FlatList
        data={users}
        keyExtractor={u => u.id}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.userRow}
            onPress={() => {
              if (item.hasPin) setSelected(item);
              else onLogin(item.id, item.role as 'OWNER' | 'HELPER');
            }}
          >
            <Text style={styles.userIcon}>{item.role === 'OWNER' ? '👑' : '🧑‍🔧'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{item.name}</Text>
              <Text style={styles.userRole}>
                {item.role === 'OWNER' ? t(lang, 'owner.switch') : t(lang, 'helper.login')}
              </Text>
            </View>
            {item.hasPin && <Text style={styles.lock}>🔒</Text>}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  close: { position: 'absolute', top: spacing.lg, left: spacing.md, width: touch.min, height: touch.min - 16, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  closeText: { fontSize: 28, fontWeight: '800', color: colors.ink },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, flex: 1, textAlign: 'center' },
  prompt: { fontSize: 24, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: spacing.md },
  pinDots: { fontSize: 44, textAlign: 'center', letterSpacing: 12, color: colors.ink, marginBottom: spacing.lg },
  userRow: { flexDirection: 'row', alignItems: 'center', minHeight: touch.min + 8, paddingHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  userIcon: { fontSize: 32 },
  userName: { fontSize: 20, fontWeight: '700', color: colors.ink },
  userRole: { fontSize: 14, color: colors.inkSoft },
  lock: { fontSize: 20 },
});
