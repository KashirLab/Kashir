import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
const tabs = [
  { id: 'wallet', label: 'Wallet' },
  { id: 'watchAds', label: 'Watch Ads' },
  { id: 'settings', label: 'Settings' },
] as const;

export type MainTabType = (typeof tabs)[number]['id'];

interface BottomTabNavigationProps {
  activeTab: MainTabType;
  onTabChange: (tab: MainTabType) => void;
}

export function BottomTabNavigation({
  activeTab,
  onTabChange,
}: BottomTabNavigationProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabContainer, { paddingBottom: insets.bottom }]}>
      {tabs.map(({ id, label }) => {
        const selected = activeTab === id;
        return (
          <TouchableOpacity
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.tab, selected && styles.activeTab]}
            onPress={() => onTabChange(id)}
          >
            <Text style={[styles.tabText, selected && styles.activeTabText]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: '#444',
  },
  tabText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#fff',
  },
});
