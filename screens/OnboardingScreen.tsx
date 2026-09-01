// ============================================================
// AKE LEDGER — OnboardingScreen (first launch wizard)
// Five quick steps, all skippable except language + name:
//   1. Language (4 giant flag-free tiles — audio names later)
//   2. Your name / shop name
//   3. PIN (optional)
//   4. The 3 money questions: rent? salary? market dues?
//      These 30 seconds are what make "Èrè gidi" honest forever.
//   5. Done → land on Home
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
} from 'react-native';
import { colors, spacing, radius, touch } from '../ui/theme';
import NumberPad from '../ui/NumberPad';
import { t } from '../i18n/labels';
import type { Language } from '../models/types';
import { createOwner, createFixedCost } from '../db/setupRepository';

type Step = 'LANGUAGE' | 'NAME' | 'PIN' | 'RENT' | 'SALARY' | 'LEVY' | 'DONE';

const LANGS: { code: Language; native: string }[] = [
  { code: 'yo', native: 'Yorùbá' },
  { code: 'ha', native: 'Hausa' },
  { code: 'ig', native: 'Igbo' },
  { code: 'en', native: 'English' },
];

interface Props {
  onComplete: () => void; // App reloads state and shows Home
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('LANGUAGE');
  const [lang, setLang] = useState<Language>('yo');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [rentStr, setRentStr] = useState('');
  const [salaryStr, setSalaryStr] = useState('');
  const [levyStr, setLevyStr] = useState('');

  const finish = () => {
    createOwner(name.trim(), lang, pin.length === 4 ? pin : undefined);
    const rent = parseInt(rentStr || '0', 10) * 100;
    const salary = parseInt(salaryStr || '0', 10) * 100;
    const levy = parseInt(levyStr || '0', 10) * 100;
    if (rent > 0) createFixedCost('Rent', 'RENT', rent, 'YEARLY');
    if (salary > 0) createFixedCost('Salary', 'SALARY', salary, 'MONTHLY');
    if (levy > 0) createFixedCost('Market dues', 'LEVY', levy, 'WEEKLY');
    onComplete();
  };

  // ---------- 1. Language ----------
  if (step === 'LANGUAGE') {
    return (
      <View style={styles.screen}>
        <Text style={styles.bigPrompt}>🗣</Text>
        <View style={styles.langGrid}>
          {LANGS.map(l => (
            <Pressable
              key={l.code}
              style={[styles.langTile, lang === l.code && styles.langTileActive]}
              onPress={() => setLang(l.code)}
            >
              <Text style={[styles.langText, lang === l.code && { color: colors.white }]}>
                {l.native}
              </Text>
            </Pressable>
          ))}
        </View>
        <NextBtn onPress={() => setStep('NAME')} />
      </View>
    );
  }

  // ---------- 2. Name ----------
  if (step === 'NAME') {
    return (
      <View style={styles.screen}>
        <Text style={styles.prompt}>👤</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={lang === 'yo' ? 'Orúkọ yín / orúkọ ṣọ́ọ̀bù' : 'Your name / shop name'}
          placeholderTextColor={colors.inkSoft}
          autoFocus
        />
        <NextBtn enabled={name.trim().length >= 2} onPress={() => setStep('PIN')} />
      </View>
    );
  }

  // ---------- 3. PIN (optional) ----------
  if (step === 'PIN') {
    return (
      <View style={styles.screen}>
        <Text style={styles.prompt}>🔒</Text>
        <Text style={styles.pinDots}>
          {'●'.repeat(pin.length)}{'○'.repeat(4 - pin.length)}
        </Text>
        <NumberPad
          onKey={d => d !== '00' && setPin(p => (p + d).slice(0, 4))}
          onBackspace={() => setPin(p => p.slice(0, -1))}
          doneLabel={pin.length === 4 ? '✔' : '⏭'}
          onDone={() => setStep('RENT')}
        />
      </View>
    );
  }

  // ---------- 4. The three money questions ----------
  const moneyStep = (
    key: 'RENT' | 'SALARY' | 'LEVY',
    icon: string,
    question: string,
    valueStr: string,
    setValue: (s: string) => void,
    next: Step
  ) => (
    <View style={styles.screen}>
      <Text style={styles.prompt}>{icon}</Text>
      <Text style={styles.question}>{question}</Text>
      <Text style={styles.moneyPreview}>
        ₦{(parseInt(valueStr || '0', 10)).toLocaleString('en-NG')}
      </Text>
      <NumberPad
        onKey={d => setValue((valueStr + d).slice(0, 9))}
        onBackspace={() => setValue(valueStr.slice(0, -1))}
        doneLabel={valueStr ? '✔' : '⏭'}
        onDone={() => (next === 'DONE' ? finish() : setStep(next))}
      />
    </View>
  );

  if (step === 'RENT') {
    return moneyStep('RENT', '🏠',
      lang === 'yo' ? 'Eló ni owó ilé ìtajà yín lọ́dún?' : 'Shop rent per YEAR?',
      rentStr, setRentStr, 'SALARY');
  }
  if (step === 'SALARY') {
    return moneyStep('SALARY', '👷',
      lang === 'yo' ? 'Eló ni owó oṣù òṣìṣẹ́ yín?' : 'Staff salary per MONTH?',
      salaryStr, setSalaryStr, 'LEVY');
  }
  if (step === 'LEVY') {
    return moneyStep('LEVY', '🧾',
      lang === 'yo' ? 'Eló ni owó ẹgbẹ́ ọjà lọ́sẹ̀?' : 'Market dues per WEEK?',
      levyStr, setLevyStr, 'DONE');
  }

  return null;
}

function NextBtn({ onPress, enabled = true }: { onPress: () => void; enabled?: boolean }) {
  return (
    <Pressable
      style={[styles.next, !enabled && { backgroundColor: colors.disabled }]}
      disabled={!enabled}
      onPress={onPress}
    >
      <Text style={styles.nextText}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, justifyContent: 'center' },
  bigPrompt: { fontSize: 64, textAlign: 'center', marginBottom: spacing.lg },
  prompt: { fontSize: 56, textAlign: 'center', marginBottom: spacing.md },
  question: { fontSize: 22, fontWeight: '700', color: colors.ink, textAlign: 'center', marginBottom: spacing.sm },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  langTile: {
    width: '44%', minHeight: touch.bigButton - 20,
    borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  langTileActive: { backgroundColor: colors.moneyIn, borderColor: colors.moneyIn },
  langText: { fontSize: 26, fontWeight: '800', color: colors.ink },
  input: {
    borderWidth: 2, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface, fontSize: 24, fontWeight: '700',
    color: colors.ink, padding: spacing.md, textAlign: 'center',
  },
  pinDots: { fontSize: 44, textAlign: 'center', letterSpacing: 12, color: colors.ink, marginBottom: spacing.md },
  moneyPreview: { fontSize: 44, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: spacing.sm },
  next: {
    marginTop: spacing.xl, height: touch.min + 8, borderRadius: radius.md,
    backgroundColor: colors.moneyIn, alignItems: 'center', justifyContent: 'center',
  },
  nextText: { color: colors.white, fontSize: 30, fontWeight: '800' },
});
