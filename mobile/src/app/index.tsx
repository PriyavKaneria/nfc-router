import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RouterMode = 'sequential' | 'random_no_repeat' | 'karma';

type Destination = {
  url: string;
  weight: number;
};

type RouterConfig = {
  mode: RouterMode;
  stateStore: 'local' | 'session';
  storageKeyPrefix: string;
  karmaMessage: string;
  campaignParams: {
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
  };
  destinations: Destination[];
};

type ConnectionSettings = {
  apiBaseUrl: string;
  adminToken: string;
};

const STORAGE_KEY = 'nfc-router-controller:connection';
const HOME_PAGE = 0;
const CONFIG_PAGE = 1;

const defaultConfig: RouterConfig = {
  mode: 'sequential',
  stateStore: 'local',
  storageKeyPrefix: 'priyav-nfc-router-v2',
  karmaMessage: 'Karma mode is parked for now. Come back soon.',
  campaignParams: {
    utm_source: 'nfc',
    utm_medium: 'tap',
    utm_campaign: 'priyav-card',
  },
  destinations: [
    { url: 'https://priyavkaneria.com', weight: 3 },
    { url: 'https://projects.priyavkaneria.com', weight: 2 },
  ],
};

const defaultConnection: ConnectionSettings = {
  apiBaseUrl: 'https://id.priyavkaneria.com',
  adminToken: '',
};

const modeCards: Array<{
  key: RouterMode;
  title: string;
  subtitle: string;
}> = [
    {
      key: 'sequential',
      title: 'Destiny',
      subtitle: 'It is what it is',
    },
    {
      key: 'random_no_repeat',
      title: 'Nature',
      subtitle: 'Let chaos control',
    },
    {
      key: 'karma',
      title: 'Karma',
      subtitle: 'You will be rewarded',
    },
  ];

function normalizeConfig(input: Partial<RouterConfig> | undefined): RouterConfig {
  const destinations = Array.isArray(input?.destinations)
    ? input.destinations
      .map((entry) => ({
        url: typeof entry?.url === 'string' ? entry.url : '',
        weight: Math.max(1, Number.parseInt(String(entry?.weight ?? 1), 10) || 1),
      }))
      .filter((entry) => entry.url.trim())
    : defaultConfig.destinations;

  return {
    mode:
      input?.mode === 'random_no_repeat' || input?.mode === 'karma' || input?.mode === 'sequential'
        ? input.mode
        : defaultConfig.mode,
    stateStore: input?.stateStore === 'session' ? 'session' : 'local',
    storageKeyPrefix: input?.storageKeyPrefix?.trim() || defaultConfig.storageKeyPrefix,
    karmaMessage: input?.karmaMessage?.trim() || defaultConfig.karmaMessage,
    campaignParams: {
      utm_source: input?.campaignParams?.utm_source?.trim() || defaultConfig.campaignParams.utm_source,
      utm_medium: input?.campaignParams?.utm_medium?.trim() || defaultConfig.campaignParams.utm_medium,
      utm_campaign:
        input?.campaignParams?.utm_campaign?.trim() || defaultConfig.campaignParams.utm_campaign,
    },
    destinations: destinations.length ? destinations : defaultConfig.destinations,
  };
}

function sanitizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

export default function ControllerScreen() {
  const { width } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const [pageIndex, setPageIndex] = useState(HOME_PAGE);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState('Add your live URL and token, then pull the config.');
  const [connection, setConnection] = useState<ConnectionSettings>(defaultConnection);
  const [draft, setDraft] = useState<RouterConfig>(defaultConfig);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!value) return;
        const parsed = JSON.parse(value) as Partial<ConnectionSettings>;
        setConnection({
          apiBaseUrl:
            typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl : defaultConnection.apiBaseUrl,
          adminToken: typeof parsed.adminToken === 'string' ? parsed.adminToken : '',
        });
      })
      .catch(() => {
        setStatus('Could not restore saved connection settings.');
      });
  }, []);

  useEffect(() => {
    if (!width) return;
    pagerRef.current?.scrollTo({ x: pageIndex * width, animated: false });
  }, [pageIndex, width]);

  const persistConnection = async (next: ConnectionSettings) => {
    setConnection(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const buildApiUrl = (path: string) => {
    const baseUrl = sanitizeBaseUrl(connection.apiBaseUrl);
    if (!baseUrl) throw new Error('Add your API base URL first.');
    return `${baseUrl}${path}`;
  };

  const parseApiResponse = async (response: Response) => {
    const text = await response.text();
    let payload: any = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || `Request failed with status ${response.status}.`);
    }

    return payload;
  };

  const loadConfig = async () => {
    setIsBusy(true);
    try {
      const response = await fetch(buildApiUrl('/api/config'));
      const payload = await parseApiResponse(response);
      setDraft(normalizeConfig(payload.config));
      setStatus(`Live config loaded from ${payload.source === 'd1' ? 'D1' : 'the built-in default'}.`);
      await persistConnection(connection);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load config.');
    } finally {
      setIsBusy(false);
    }
  };

  const saveConfig = async () => {
    if (!connection.adminToken.trim()) {
      Alert.alert('Admin token needed', 'Add the Cloudflare ADMIN_TOKEN before saving live changes.');
      return;
    }

    setIsBusy(true);
    try {
      const payloadToSave = normalizeConfig(draft);
      const response = await fetch(buildApiUrl('/api/config'), {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${connection.adminToken.trim()}`,
        },
        body: JSON.stringify(payloadToSave),
      });
      const payload = await parseApiResponse(response);
      setDraft(normalizeConfig(payload.config));
      setStatus('Live config saved. Router state was reset so changes apply from the next scan.');
      await persistConnection(connection);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save config.');
    } finally {
      setIsBusy(false);
    }
  };

  const previewNext = async () => {
    setIsBusy(true);
    try {
      const response = await fetch(buildApiUrl('/api/resolve?preview=1'));
      const payload = await parseApiResponse(response);
      if (payload.mode === 'karma') {
        setStatus(payload.message || 'Karma mode is active.');
      } else {
        setStatus(`Next tap points to ${payload.redirectUrl}`);
      }
      await persistConnection(connection);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not preview the next destination.');
    } finally {
      setIsBusy(false);
    }
  };

  const resetFlow = async () => {
    if (!connection.adminToken.trim()) {
      Alert.alert('Admin token needed', 'Add the Cloudflare ADMIN_TOKEN before resetting the live flow.');
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(buildApiUrl('/api/resolve?reset=1&preview=1'), {
        headers: {
          authorization: `Bearer ${connection.adminToken.trim()}`,
        },
      });
      const payload = await parseApiResponse(response);
      if (payload.mode === 'karma') {
        setStatus(`Live flow reset. ${payload.message || 'Karma mode is active.'}`);
      } else {
        setStatus(`Live flow reset. Next tap points to ${payload.redirectUrl}`);
      }
      await persistConnection(connection);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not reset the live flow.');
    } finally {
      setIsBusy(false);
    }
  };

  const scrollToPage = (nextPage: number) => {
    if (!width) return;
    setPageIndex(nextPage);
    pagerRef.current?.scrollTo({ x: nextPage * width, animated: true });
  };

  const updateDestination = (index: number, patch: Partial<Destination>) => {
    setDraft((current) => ({
      ...current,
      destinations: current.destinations.map((destination, destinationIndex) =>
        destinationIndex === index
          ? {
            ...destination,
            ...patch,
          }
          : destination,
      ),
    }));
  };

  const removeDestination = (index: number) => {
    setDraft((current) => ({
      ...current,
      destinations:
        current.destinations.length > 1
          ? current.destinations.filter((_, destinationIndex) => destinationIndex !== index)
          : current.destinations,
    }));
  };

  const addDestination = () => {
    setDraft((current) => ({
      ...current,
      destinations: [...current.destinations, { url: '', weight: 1 }],
    }));
  };

  const onPagerMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    setPageIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appShell}>
        <View pointerEvents="none" style={styles.backgroundOrbOne} />
        <View pointerEvents="none" style={styles.backgroundOrbTwo} />
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          onMomentumScrollEnd={onPagerMomentumEnd}
          showsHorizontalScrollIndicator={false}
          style={styles.pager}
        >
          <View style={[styles.page, { width }]}>
            <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.eyebrow}>NFC Router</Text>
                  <Text style={styles.pageTitle}>Choose the mood</Text>
                </View>
                <Pressable onPress={() => scrollToPage(CONFIG_PAGE)} style={styles.headerButton}>
                  <Text style={styles.headerButtonText}>Sites</Text>
                </Pressable>
              </View>

              {modeCards.map((modeCard) => {
                const active = draft.mode === modeCard.key;
                return (
                  <Pressable
                    key={modeCard.key}
                    onPress={() => setDraft((current) => ({ ...current, mode: modeCard.key }))}
                    style={[styles.modeButton, active && styles.modeButtonActive]}
                  >
                    <Text style={[styles.modeTitle, active && styles.modeTitleActive]}>{modeCard.title}</Text>
                    <Text style={[styles.modeSubtitle, active && styles.modeSubtitleActive]}>
                      {modeCard.subtitle}
                    </Text>
                  </Pressable>
                );
              })}

              <View style={styles.liveStatusCard}>
                <Text style={styles.liveStatusLabel}>Active draft : {draft.mode === 'sequential'
                  ? 'Destiny'
                  : draft.mode === 'random_no_repeat'
                    ? 'Nature'
                    : 'Karma'}</Text>
                <Text style={styles.liveStatusBody}>{status}</Text>
              </View>

              <View style={styles.row}>
                <Pressable onPress={previewNext} style={styles.smallButton}>
                  <Text style={styles.smallButtonText}>Preview next</Text>
                </Pressable>
                <Pressable onPress={loadConfig} style={styles.smallButtonMuted}>
                  <Text style={styles.smallButtonMutedText}>Refresh</Text>
                </Pressable>
              </View>

              <Pressable onPress={saveConfig} style={styles.primaryFooterButton}>
                <Text style={styles.primaryFooterButtonText}>Push live change</Text>
              </Pressable>
            </ScrollView>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.page, { width }]}
          >
            <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.eyebrow}>Config</Text>
                  <Text style={styles.pageTitle}>Sites and settings</Text>
                </View>
                <Pressable onPress={() => scrollToPage(HOME_PAGE)} style={styles.headerButton}>
                  <Text style={styles.headerButtonText}>Modes</Text>
                </Pressable>
              </View>

              <View style={styles.panel}>
                <Text style={styles.sectionTitle}>Connection</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(value) => setConnection((current) => ({ ...current, apiBaseUrl: value }))}
                  placeholder="https://your-domain.com"
                  placeholderTextColor="#8d8d7f"
                  style={styles.input}
                  value={connection.apiBaseUrl}
                />
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(value) => setConnection((current) => ({ ...current, adminToken: value }))}
                  placeholder="ADMIN_TOKEN"
                  placeholderTextColor="#8d8d7f"
                  secureTextEntry
                  style={styles.input}
                  value={connection.adminToken}
                />
                <View style={styles.row}>
                  <Pressable onPress={loadConfig} style={styles.smallButton}>
                    <Text style={styles.smallButtonText}>Pull live</Text>
                  </Pressable>
                  <Pressable onPress={resetFlow} style={styles.smallButtonMuted}>
                    <Text style={styles.smallButtonMutedText}>Reset flow</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.panel}>
                <Text style={styles.sectionTitle}>Identity</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(value) => setDraft((current) => ({ ...current, storageKeyPrefix: value }))}
                  placeholder="storage key prefix"
                  placeholderTextColor="#8d8d7f"
                  style={styles.input}
                  value={draft.storageKeyPrefix}
                />
                <TextInput
                  autoCapitalize="sentences"
                  onChangeText={(value) => setDraft((current) => ({ ...current, karmaMessage: value }))}
                  placeholder="Karma mode message"
                  placeholderTextColor="#8d8d7f"
                  style={[styles.input, styles.textArea]}
                  multiline
                  value={draft.karmaMessage}
                />
              </View>

              <View style={styles.panel}>
                <Text style={styles.sectionTitle}>Campaign params</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(value) =>
                    setDraft((current) => ({
                      ...current,
                      campaignParams: { ...current.campaignParams, utm_source: value },
                    }))
                  }
                  placeholder="utm_source"
                  placeholderTextColor="#8d8d7f"
                  style={styles.input}
                  value={draft.campaignParams.utm_source}
                />
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(value) =>
                    setDraft((current) => ({
                      ...current,
                      campaignParams: { ...current.campaignParams, utm_medium: value },
                    }))
                  }
                  placeholder="utm_medium"
                  placeholderTextColor="#8d8d7f"
                  style={styles.input}
                  value={draft.campaignParams.utm_medium}
                />
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(value) =>
                    setDraft((current) => ({
                      ...current,
                      campaignParams: { ...current.campaignParams, utm_campaign: value },
                    }))
                  }
                  placeholder="utm_campaign"
                  placeholderTextColor="#8d8d7f"
                  style={styles.input}
                  value={draft.campaignParams.utm_campaign}
                />
              </View>

              <View style={styles.panel}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Destinations</Text>
                  <Pressable onPress={addDestination} style={styles.smallButton}>
                    <Text style={styles.smallButtonText}>Add site</Text>
                  </Pressable>
                </View>

                {draft.destinations.map((destination, index) => (
                  <View key={`${index}-${destination.url}`} style={styles.destinationCard}>
                    <Text style={styles.destinationLabel}>Site {index + 1}</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoCorrect={false}
                      onChangeText={(value) => updateDestination(index, { url: value })}
                      placeholder="https://example.com"
                      placeholderTextColor="#8d8d7f"
                      style={styles.input}
                      value={destination.url}
                    />
                    <View style={styles.row}>
                      <View style={styles.weightGroup}>
                        <Pressable
                          onPress={() => updateDestination(index, { weight: Math.max(1, destination.weight - 1) })}
                          style={styles.weightButton}
                        >
                          <Text style={styles.weightButtonText}>-</Text>
                        </Pressable>
                        <Text style={styles.weightValue}>{destination.weight}</Text>
                        <Pressable
                          onPress={() => updateDestination(index, { weight: destination.weight + 1 })}
                          style={styles.weightButton}
                        >
                          <Text style={styles.weightButtonText}>+</Text>
                        </Pressable>
                      </View>
                      <Pressable onPress={() => removeDestination(index)} style={styles.smallButtonMuted}>
                        <Text style={styles.smallButtonMutedText}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>

              <Pressable onPress={saveConfig} style={styles.primaryFooterButton}>
                <Text style={styles.primaryFooterButtonText}>Save live config</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </ScrollView>

        {isBusy && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#fef2d6" size="large" />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#061521',
  },
  appShell: {
    flex: 1,
    backgroundColor: '#061521',
  },
  backgroundOrbOne: {
    position: 'absolute',
    top: -120,
    right: -40,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(85, 204, 255, 0.14)',
  },
  backgroundOrbTwo: {
    position: 'absolute',
    bottom: 50,
    left: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(17, 109, 173, 0.18)',
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    paddingTop: 12,
    gap: 16,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#73d6f6',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  pageTitle: {
    color: '#eefbff',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 6,
  },
  headerButton: {
    backgroundColor: '#10334a',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerButtonText: {
    color: '#ddf8ff',
    fontSize: 14,
    fontWeight: '700',
  },
  modeButton: {
    backgroundColor: '#0d2536',
    borderColor: '#1b607f',
    borderWidth: 2,
    minHeight: 78,
    padding: 22,
  },
  modeButtonActive: {
    backgroundColor: '#0fa4cf',
    borderColor: '#7fe5ff',
  },
  modeTitle: {
    color: '#eefbff',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 10,
  },
  modeTitleActive: {
    color: '#f7feff',
  },
  modeSubtitle: {
    color: '#8ccfe7',
    fontSize: 15,
    lineHeight: 22,
  },
  modeSubtitleActive: {
    color: '#ecfcff',
  },
  liveStatusCard: {
    backgroundColor: '#081b29',
    padding: 20,
  },
  liveStatusLabel: {
    color: '#73d6f6',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  liveStatusValue: {
    color: '#eefbff',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 8,
  },
  liveStatusBody: {
    color: '#b8e8f6',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  panel: {
    backgroundColor: '#0b2232',
    padding: 18,
    gap: 12,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 80
  },
  sectionTitle: {
    color: '#eefbff',
    fontSize: 18,
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#102a3d',
    color: '#eefbff',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  smallButton: {
    alignItems: 'center',
    backgroundColor: '#1597c5',
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  smallButtonText: {
    color: '#effdff',
    fontSize: 14,
    fontWeight: '700',
  },
  smallButtonMuted: {
    alignItems: 'center',
    backgroundColor: '#14384f',
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  smallButtonMutedText: {
    color: '#bceeff',
    fontSize: 14,
    fontWeight: '700',
  },
  destinationCard: {
    backgroundColor: '#102a3d',
    gap: 12,
    padding: 14,
  },
  destinationLabel: {
    color: '#7dd4ef',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  weightGroup: {
    alignItems: 'center',
    backgroundColor: '#16374d',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  weightButton: {
    alignItems: 'center',
    backgroundColor: '#1597c5',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  weightButtonText: {
    color: '#effdff',
    fontSize: 20,
    fontWeight: '800',
    marginTop: -2,
  },
  weightValue: {
    color: '#eefbff',
    fontSize: 18,
    fontWeight: '800',
  },
  primaryFooterButton: {
    alignItems: 'center',
    backgroundColor: '#1bb2d9',
    justifyContent: 'center',
    minHeight: 60,
    paddingHorizontal: 20,
  },
  primaryFooterButtonText: {
    color: '#f4feff',
    fontSize: 16,
    fontWeight: '800',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(6, 21, 33, 0.4)',
    justifyContent: 'center',
  },
});
