import { createRoute } from '@granite-js/react-native';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const leafHome = require('../../assets/leaf-home.png');
const coffee = require('../../assets/coffee.png');
const blueberry = require('../../assets/blueberry.png');
const candy = require('../../assets/candy.png');
const leafLarge = require('../../assets/leaf-large.png');
const extractLoading = require('../../assets/extract-loading.png');
const extractFailed = require('../../assets/extract-failed.png');
const sendingArtwork = require('../../assets/sending.png');

type AppScreen =
  | 'home'
  | 'extracting'
  | 'failed'
  | 'confirm'
  | 'message'
  | 'review'
  | 'sending'
  | 'sent';
type StorageTab = 'received' | 'together';

const DEFAULT_MESSAGE =
  '벌써 가을이야.. 낙엽을 주웠어!\n날씨 많이 추워졌더라\n옷 잘 챙겨입구 감기 조심해~~';

export const Route = createRoute('/', {
  component: ForYouPage,
});

function ForYouPage() {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [tab, setTab] = useState<StorageTab>('received');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [dailySent, setDailySent] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [willFail, setWillFail] = useState(false);

  useEffect(() => {
    if (screen !== 'extracting') return;
    const timer = setTimeout(
      () => setScreen(willFail ? 'failed' : 'confirm'),
      1500,
    );
    return () => clearTimeout(timer);
  }, [screen, willFail]);

  useEffect(() => {
    if (screen !== 'sending') return;
    const timer = setTimeout(() => setScreen('sent'), 1500);
    return () => clearTimeout(timer);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'sent') return;
    const timer = setTimeout(() => {
      setDailySent(true);
      setScreen('home');
    }, 1500);
    return () => clearTimeout(timer);
  }, [screen]);

  const startExtraction = (fail: boolean) => {
    setWillFail(fail);
    setPickerOpen(false);
    setScreen('extracting');
  };

  if (screen === 'extracting') {
    return (
      <FullArtwork
        source={extractLoading}
        fallbackText="오브젝트를 추출 중이에요 ..."
      />
    );
  }

  if (screen === 'failed') {
    return (
      <View style={styles.fullScreen}>
        <Image
          source={extractFailed}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
        <View style={styles.failedButtons}>
          <Pressable
            style={[styles.halfButton, styles.secondaryButton]}
            onPress={() => setPickerOpen(true)}
          >
            <Text style={styles.secondaryButtonText}>다른 사진 선택</Text>
          </Pressable>
          <Pressable
            style={[styles.halfButton, styles.primaryButton]}
            onPress={() => startExtraction(false)}
          >
            <Text style={styles.primaryButtonText}>다시 시도</Text>
          </Pressable>
        </View>
        <PhotoPicker
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onCamera={() => startExtraction(true)}
          onAlbum={() => startExtraction(false)}
        />
      </View>
    );
  }

  if (screen === 'confirm') {
    return (
      <AppScaffold>
        <View style={styles.centerScreen}>
          <Text style={styles.screenTitle}>보내고 싶은 선물이 맞나요?</Text>
          <Image
            source={leafLarge}
            style={styles.largeLeaf}
            resizeMode="contain"
          />
          <View style={styles.rowButtons}>
            <Pressable
              style={[styles.halfButton, styles.secondaryButton]}
              onPress={() => setPickerOpen(true)}
            >
              <Text style={styles.secondaryButtonText}>다시 선택</Text>
            </Pressable>
            <Pressable
              style={[styles.halfButton, styles.primaryButton]}
              onPress={() => setScreen('message')}
            >
              <Text style={styles.primaryButtonText}>맞아요!</Text>
            </Pressable>
          </View>
        </View>
        <PhotoPicker
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onCamera={() => startExtraction(true)}
          onAlbum={() => startExtraction(false)}
        />
      </AppScaffold>
    );
  }

  if (screen === 'message') {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={styles.messageScreen}>
          <Text style={styles.messageTitle}>
            함께 보낼 메시지를 입력해주세요
          </Text>
          <Text style={styles.recipient}>To. 민서 ..♥</Text>
          <TextInput
            autoFocus
            multiline
            maxLength={120}
            value={message}
            onChangeText={setMessage}
            placeholder="선물과 함께 보낼 말을 적어주세요"
            placeholderTextColor="#9AA3AE"
            style={styles.messageInput}
          />
          <Text style={styles.messageCount}>{message.length}/120</Text>
          <Pressable
            disabled={!message.trim()}
            style={[
              styles.wideButton,
              !message.trim() && styles.disabledButton,
            ]}
            onPress={() => setScreen('review')}
          >
            <Text style={styles.primaryButtonText}>입력 완료</Text>
          </Pressable>
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  if (screen === 'review') {
    return (
      <AppScaffold>
        <View style={styles.reviewScreen}>
          <Text style={styles.screenTitle}>메시지 입력을 완료하셨나요?</Text>
          <MessageCard message={message} />
          <View style={styles.reviewBottom}>
            <Pressable
              style={styles.wideButton}
              onPress={() => setScreen('sending')}
            >
              <Text style={styles.primaryButtonText}>이대로 보낼래요</Text>
            </Pressable>
            <Pressable
              style={styles.textButton}
              onPress={() => setScreen('confirm')}
            >
              <Text style={styles.textButtonLabel}>
                선물을 다시 선택하고 싶어요 〉
              </Text>
            </Pressable>
          </View>
        </View>
      </AppScaffold>
    );
  }

  if (screen === 'sending' || screen === 'sent') {
    return (
      <SafeAreaView style={styles.progressScreen}>
        <Text style={styles.progressTitle}>
          {screen === 'sending'
            ? '선물을 보내는 중이에요..'
            : '오늘 선물도 잘 두고 왔어요.'}
        </Text>
        <Image
          source={sendingArtwork}
          style={styles.sendingArtwork}
          resizeMode="contain"
        />
        {screen === 'sending' && (
          <ActivityIndicator color="#FF5F95" style={styles.progressSpinner} />
        )}
      </SafeAreaView>
    );
  }

  return (
    <AppScaffold>
      <View style={styles.home}>
        <SegmentedControl tab={tab} onChange={setTab} />
        <Text style={styles.homeHeadline}>
          {tab === 'received'
            ? '민서에게 받은 선물이 벌써 4개나 쌓였어요!'
            : '서로 주고받은 선물이 벌써 5개나 모였어요'}
        </Text>
        <GiftStorage
          showShared={tab === 'together'}
          hasNewGift={!messageOpen}
          onGiftPress={() => setMessageOpen(true)}
        />
        <View style={styles.homeBottom}>
          <Pressable
            disabled={dailySent}
            style={[styles.wideButton, dailySent && styles.disabledButton]}
            onPress={() => setPickerOpen(true)}
          >
            <Text style={styles.primaryButtonText}>
              {dailySent ? '오늘은 이미 선물을 보냈어요' : '나도 선물하러 가기'}
            </Text>
          </Pressable>
          <Pressable style={styles.textButton}>
            <Text style={styles.textButtonLabel}>
              선물할 친구를 변경하고 싶어요 〉
            </Text>
          </Pressable>
        </View>
      </View>
      <PhotoPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onCamera={() => startExtraction(true)}
        onAlbum={() => startExtraction(false)}
      />
      <ReceivedMessage
        visible={messageOpen}
        onClose={() => setMessageOpen(false)}
      />
    </AppScaffold>
  );
}

function AppScaffold({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <Text style={styles.back}>‹</Text>
        <View style={styles.appTitle}>
          <Text style={styles.appIcon}>🎁</Text>
          <Text style={styles.appName}>오다 주웠어..</Text>
        </View>
        <View style={styles.headerActions}>
          <Text style={styles.headerAction}>♥</Text>
          <Text style={styles.headerAction}>•••</Text>
          <Text style={styles.headerAction}>×</Text>
        </View>
      </View>
      {children}
    </SafeAreaView>
  );
}

function SegmentedControl({
  tab,
  onChange,
}: { tab: StorageTab; onChange: (tab: StorageTab) => void }) {
  return (
    <View style={styles.segmented}>
      <Pressable
        style={[styles.segment, tab === 'received' && styles.activeSegment]}
        onPress={() => onChange('received')}
      >
        <Text
          style={[
            styles.segmentText,
            tab === 'received' && styles.activeSegmentText,
          ]}
        >
          받은 선물함
        </Text>
      </Pressable>
      <Pressable
        style={[styles.segment, tab === 'together' && styles.activeSegment]}
        onPress={() => onChange('together')}
      >
        <Text
          style={[
            styles.segmentText,
            tab === 'together' && styles.activeSegmentText,
          ]}
        >
          함께 모은 선물
        </Text>
      </Pressable>
    </View>
  );
}

function GiftStorage({
  showShared,
  hasNewGift,
  onGiftPress,
}: { showShared: boolean; hasNewGift: boolean; onGiftPress: () => void }) {
  return (
    <View style={styles.storage}>
      <View style={styles.storageGradient} />
      <View style={styles.storageBottom} />
      <Pressable style={styles.leafPressable} onPress={onGiftPress}>
        <Image
          source={leafHome}
          style={[styles.leaf, hasNewGift && styles.newGift]}
          resizeMode="contain"
        />
      </Pressable>
      <Image source={coffee} style={styles.coffee} resizeMode="contain" />
      <Image source={blueberry} style={styles.blueberry} resizeMode="contain" />
      <Image source={candy} style={styles.candy} resizeMode="contain" />
      {showShared && <Text style={styles.sharedBadge}>+ 내가 보낸 선물</Text>}
    </View>
  );
}

function PhotoPicker({
  visible,
  onClose,
  onCamera,
  onAlbum,
}: {
  visible: boolean;
  onClose: () => void;
  onCamera: () => void;
  onAlbum: () => void;
}) {
  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.photoSheet} onPress={() => undefined}>
          <View style={styles.sheetHandle} />
          <Pressable style={styles.sheetOption} onPress={onCamera}>
            <Text style={styles.sheetIcon}>📷</Text>
            <Text style={styles.sheetText}>사진 촬영하기</Text>
          </Pressable>
          <Pressable style={styles.sheetOption} onPress={onAlbum}>
            <Text style={styles.sheetIcon}>🏞️</Text>
            <Text style={styles.sheetText}>앨범에서 선택하기</Text>
          </Pressable>
          <View style={[styles.sheetOption, styles.disabledOption]}>
            <Text style={styles.sheetIcon}>🗑️</Text>
            <Text style={styles.disabledOptionText}>오늘 보낸 선물 지우기</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ReceivedMessage({
  visible,
  onClose,
}: { visible: boolean; onClose: () => void }) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.receivedCard}>
          <View style={styles.receivedHeader}>
            <Text style={styles.recipient}>To. 민서 ..♥</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>
          <MessageCard message={DEFAULT_MESSAGE} />
          <Pressable
            style={[styles.wideButton, styles.storeGiftButton]}
            onPress={onClose}
          >
            <Text style={styles.primaryButtonText}>선물함에 넣기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function MessageCard({ message }: { message: string }) {
  return (
    <View style={styles.messageBlock}>
      <Text style={styles.recipient}>To. 민서 ..♥</Text>
      <View style={styles.messageBox}>
        <Text style={styles.messageBody}>{message}</Text>
      </View>
      <Text style={styles.date}>2026-09-10 13:10</Text>
    </View>
  );
}

function FullArtwork({
  source,
  fallbackText,
}: { source: number; fallbackText: string }) {
  return (
    <View style={styles.fullScreen}>
      <Image
        source={source}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
      <Text accessibilityLabel={fallbackText} style={styles.hiddenText}>
        {fallbackText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  fullScreen: { flex: 1, backgroundColor: '#FFFFFF' },
  hiddenText: { width: 1, height: 1, opacity: 0 },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  back: { width: 28, fontSize: 36, lineHeight: 40, color: '#191F28' },
  appTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  appIcon: { fontSize: 16 },
  appName: { fontSize: 15, fontWeight: '600', color: '#191F28' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerAction: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F7F8FA',
    textAlign: 'center',
    lineHeight: 34,
    color: '#6B7684',
    fontSize: 17,
    fontWeight: '600',
  },
  home: { flex: 1, paddingHorizontal: 20 },
  segmented: {
    marginTop: 22,
    height: 41,
    padding: 3,
    borderRadius: 10,
    backgroundColor: '#F2F4F6',
    flexDirection: 'row',
  },
  segment: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  activeSegment: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.09,
    shadowRadius: 1,
    elevation: 1,
  },
  segmentText: { color: '#8B95A1', fontSize: 15, fontWeight: '500' },
  activeSegmentText: { color: '#333D4B', fontWeight: '600' },
  homeHeadline: {
    marginTop: 43,
    textAlign: 'center',
    color: '#000000',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
  },
  storage: {
    position: 'relative',
    alignSelf: 'center',
    width: 310,
    height: 329,
    marginTop: 64,
    overflow: 'visible',
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 10,
    borderColor: '#D1D3D5',
    borderBottomLeftRadius: 19,
    borderBottomRightRadius: 19,
  },
  storageGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFF8F9',
  },
  storageBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 70,
    backgroundColor: '#F9D6D6',
  },
  leafPressable: {
    position: 'absolute',
    left: 4,
    bottom: -5,
    width: 120,
    height: 126,
    zIndex: 3,
  },
  leaf: { width: 120, height: 126 },
  newGift: { borderColor: '#FF5F95', borderWidth: 2, borderRadius: 16 },
  coffee: {
    position: 'absolute',
    left: 61,
    bottom: -22,
    width: 166,
    height: 166,
    zIndex: 4,
  },
  blueberry: {
    position: 'absolute',
    right: 4,
    bottom: -14,
    width: 92,
    height: 115,
    zIndex: 5,
  },
  candy: {
    position: 'absolute',
    right: -4,
    bottom: 31,
    width: 138,
    height: 154,
    zIndex: 2,
    transform: [{ rotate: '12deg' }],
  },
  sharedBadge: {
    position: 'absolute',
    right: 10,
    top: 12,
    borderRadius: 12,
    backgroundColor: '#FFEBF1',
    color: '#D6336C',
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    overflow: 'hidden',
  },
  homeBottom: { marginTop: 'auto', paddingBottom: 7 },
  wideButton: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#FF5F95',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  primaryButton: { backgroundColor: '#FF5F95' },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  disabledButton: { backgroundColor: '#D1D6DB' },
  textButton: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  textButtonLabel: { color: '#6B7684', fontSize: 13, fontWeight: '500' },
  centerScreen: { flex: 1, paddingHorizontal: 20, alignItems: 'center' },
  screenTitle: {
    marginTop: 106,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
  },
  largeLeaf: { width: 280, height: 310, marginTop: 55 },
  rowButtons: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 'auto',
    marginBottom: 20,
  },
  halfButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButton: { backgroundColor: '#B0BAC5' },
  secondaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  failedButtons: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
    flexDirection: 'row',
    gap: 16,
  },
  messageScreen: { flex: 1, backgroundColor: '#FFFFFF', paddingHorizontal: 20 },
  messageTitle: {
    marginTop: 8,
    marginBottom: 30,
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
  },
  recipient: {
    color: '#4E5968',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  messageInput: {
    minHeight: 136,
    borderWidth: 1,
    borderColor: '#DDE1E6',
    borderRadius: 14,
    padding: 15,
    color: '#4E5968',
    fontSize: 17,
    lineHeight: 27,
    textAlignVertical: 'top',
  },
  messageCount: {
    color: '#8B95A1',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 7,
    marginBottom: 16,
  },
  reviewScreen: { flex: 1, paddingHorizontal: 20 },
  messageBlock: { marginTop: 106 },
  messageBox: {
    borderWidth: 1,
    borderColor: '#DDE1E6',
    borderRadius: 14,
    padding: 15,
    backgroundColor: '#FBFCFD',
  },
  messageBody: {
    color: '#6B7684',
    fontSize: 17,
    lineHeight: 30,
    fontWeight: '500',
  },
  date: { color: '#8B95A1', fontSize: 14, marginTop: 10 },
  reviewBottom: { marginTop: 'auto', marginBottom: 7 },
  progressScreen: { flex: 1, alignItems: 'center', backgroundColor: '#FFFFFF' },
  progressTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  sendingArtwork: { width: 220, height: 260, marginTop: 22 },
  progressSpinner: { marginTop: -65 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'flex-end',
  },
  photoSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 26,
    paddingTop: 9,
    paddingBottom: 28,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E8EB',
    alignSelf: 'center',
    marginBottom: 9,
  },
  sheetOption: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  sheetIcon: { width: 24, textAlign: 'center', fontSize: 18 },
  sheetText: { fontSize: 17, fontWeight: '600', color: '#333D4B' },
  disabledOption: { opacity: 0.35 },
  disabledOptionText: { fontSize: 17, fontWeight: '600', color: '#8B95A1' },
  receivedCard: {
    marginHorizontal: 24,
    marginBottom: 150,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  receivedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  close: { color: '#B0BAC5', fontSize: 32, lineHeight: 34 },
  storeGiftButton: { marginTop: 18 },
});
