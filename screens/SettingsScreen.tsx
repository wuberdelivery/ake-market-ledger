import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {Language} from '../models/types';
import {t} from '../i18n/labels';
import {colors, radius, spacing, touch} from '../ui/theme';

interface Props {
  language: Language;
  userName: string;
  userRole: string;
  onLanguageChange: (language: Language) => void;
  onSwitchUser: () => void;
  onLogout: () => void;
  onBack: () => void;
}

const LANGUAGES: {id: Language; nativeName: string; description: string}[] = [
  {id: 'en', nativeName: 'English', description: 'English'},
  {id: 'yo', nativeName: 'Yorùbá', description: 'Yoruba'},
  {id: 'ha', nativeName: 'Hausa', description: 'Hausa'},
  {id: 'ig', nativeName: 'Igbo', description: 'Igbo'},
];

export default function SettingsScreen({
  language,
  userName,
  userRole,
  onLanguageChange,
  onSwitchUser,
  onLogout,
  onBack,
}: Props) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          style={styles.back}
          onPress={onBack}
          accessibilityRole="button">
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>{t(language, 'settings.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {userName.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={styles.identityText}>
            <Text style={styles.userName}>{userName}</Text>
            <Text style={styles.role}>
              {userRole === 'OWNER'
                ? t(language, 'settings.owner')
                : t(language, 'settings.helper')}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          {t(language, 'settings.language')}
        </Text>
        <Text style={styles.sectionNote}>
          {t(language, 'settings.language_note')}
        </Text>
        <View style={styles.languageGrid}>
          {LANGUAGES.map(item => {
            const selected = item.id === language;
            return (
              <Pressable
                key={item.id}
                style={[
                  styles.languageCard,
                  selected && styles.selectedLanguage,
                ]}
                onPress={() => onLanguageChange(item.id)}
                accessibilityRole="radio"
                accessibilityState={{selected}}>
                <Text
                  style={[
                    styles.languageName,
                    selected && styles.selectedText,
                  ]}>
                  {item.nativeName}
                </Text>
                <Text
                  style={[
                    styles.languageDescription,
                    selected && styles.selectedDescription,
                  ]}>
                  {item.description}
                </Text>
                {selected ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>{t(language, 'settings.voice')}</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>🎙️</Text>
          <View style={styles.infoText}>
            <Text style={styles.infoHeading}>
              {t(language, 'settings.voice_action')}
            </Text>
            <Text style={styles.infoBody}>
              {t(language, 'settings.voice_note')}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t(language, 'settings.data')}</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>🔒</Text>
          <View style={styles.infoText}>
            <Text style={styles.infoHeading}>
              {t(language, 'settings.offline_first')}
            </Text>
            <Text style={styles.infoBody}>
              {t(language, 'settings.data_note')}
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.switchButton}
          onPress={onSwitchUser}
          accessibilityRole="button">
          <Text style={styles.switchIcon}>👥</Text>
          <Text style={styles.switchText}>
            {t(language, 'settings.switch_user')}
          </Text>
        </Pressable>
        <Pressable
          style={styles.logoutButton}
          onPress={onLogout}
          accessibilityRole="button">
          <Text style={styles.logoutText}>
            {t(language, 'settings.logout')}
          </Text>
        </Pressable>
        <Text style={styles.version}>Ake Ledger · 1.1.4</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  header: {
    minHeight: 68,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  back: {
    width: touch.min,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {color: colors.white, fontSize: 30, fontWeight: '800'},
  title: {color: colors.white, fontSize: 24, fontWeight: '800'},
  body: {padding: spacing.md, paddingBottom: spacing.xxl},
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ledger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {fontSize: 25, fontWeight: '900', color: colors.ink},
  identityText: {marginLeft: spacing.md},
  userName: {fontSize: 21, fontWeight: '800', color: colors.ink},
  role: {fontSize: 14, color: colors.inkSoft, marginTop: 2},
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  sectionNote: {fontSize: 14, color: colors.inkSoft, marginBottom: spacing.sm},
  languageGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  languageCard: {
    width: '48%',
    minHeight: 88,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    justifyContent: 'center',
  },
  selectedLanguage: {
    backgroundColor: '#EAF7ED',
    borderColor: colors.moneyIn,
    borderWidth: 2,
  },
  languageName: {fontSize: 19, fontWeight: '800', color: colors.ink},
  languageDescription: {fontSize: 13, color: colors.inkSoft, marginTop: 2},
  selectedText: {color: colors.moneyIn},
  selectedDescription: {color: colors.moneyInPressed},
  check: {
    position: 'absolute',
    right: 12,
    top: 10,
    color: colors.moneyIn,
    fontSize: 20,
    fontWeight: '900',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  infoIcon: {fontSize: 28, marginRight: spacing.md},
  infoText: {flex: 1},
  infoHeading: {fontSize: 17, fontWeight: '800', color: colors.ink},
  infoBody: {fontSize: 14, lineHeight: 20, color: colors.inkSoft, marginTop: 3},
  switchButton: {
    minHeight: touch.min,
    marginTop: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchIcon: {fontSize: 22, marginRight: spacing.sm},
  switchText: {fontSize: 18, fontWeight: '800', color: colors.ink},
  logoutButton: {
    minHeight: touch.min,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.moneyOut,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {fontSize: 19, fontWeight: '800', color: colors.white},
  version: {
    textAlign: 'center',
    color: colors.inkSoft,
    fontSize: 13,
    marginTop: spacing.lg,
  },
});
