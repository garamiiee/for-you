import { createRoute } from '@granite-js/react-native';
import {
  fetchAlbumPhotos,
  FetchAlbumPhotosPermissionError,
} from '@apps-in-toss/framework';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

export const Route = createRoute('/', {
  component: ForYouPage,
});

function ForYouPage() {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [tab, setTab] = useState<StorageTab>('received');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dailySent, setDailySent] = useState(false);
  const [message, setMessage] = useState('');
  const [recipientName, setRecipientName] = useState('민서');
  const [willFail, setWillFail] = useState(false);
  const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(null);
  const [sentGiftImageUri, setSentGiftImageUri] = useState<string | null>(null);

  // 이후 서버에서 선물 목록을 받아오면 이 두 값만 실제 목록 길이로 바꾸면 됩니다.
  const receivedGiftCount = 0;
  const sentGiftCount = dailySent ? 1 : 0;
  const togetherGiftCount = receivedGiftCount + sentGiftCount;
  const headline = getStorageHeadline(
    tab,
    receivedGiftCount,
    togetherGiftCount,
  );

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
      setSentGiftImageUri(selectedPhotoUri);
      setTab('together');
      setScreen('home');
    }, 1500);
    return () => clearTimeout(timer);
  }, [screen]);

  const startExtraction = (fail: boolean) => {
    setWillFail(fail);
    setPickerOpen(false);
    setScreen('extracting');
  };

  const selectPhotoFromAlbum = async () => {
    // iOS에서는 현재 모달이 완전히 닫힌 뒤 사진첩을 열어야 합니다.
    setPickerOpen(false);
    await new Promise((resolve) => setTimeout(resolve, 350));

    try {
      const photos = await fetchAlbumPhotos({
        maxCount: 1,
        maxWidth: 1024,
        base64: true,
      });
      const photo = photos[0];

      if (photo == null) {
        setPickerOpen(false);
        return;
      }

      setSelectedPhotoUri(`data:image/jpeg;base64,${photo.dataUri}`);
      startExtraction(false);
    } catch (error) {
      if (error instanceof FetchAlbumPhotosPermissionError) {
        Alert.alert(
          '사진 접근이 필요해요',
          '선물할 물건의 사진을 고르려면 사진 접근을 허용해주세요.',
        );
        return;
      }

      Alert.alert('사진을 불러오지 못했어요', '잠시 후 다시 시도해주세요.');
    }
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
          onAlbum={selectPhotoFromAlbum}
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
            source={
              selectedPhotoUri == null ? leafLarge : { uri: selectedPhotoUri }
            }
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
          onAlbum={selectPhotoFromAlbum}
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
          <View style={styles.messageContent}>
            <Text style={styles.messageTitle}>
              함께 보낼 메시지를 입력해주세요
            </Text>
            <View style={styles.recipientRow}>
              <Text style={styles.recipientPrefix}>To.</Text>
              <TextInput
                value={recipientName}
                onChangeText={setRecipientName}
                placeholder="받는 사람"
                placeholderTextColor="#9AA3AE"
                maxLength={12}
                style={styles.recipientInput}
              />
              <Text style={styles.recipientHeart}>..♥</Text>
            </View>
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
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  if (screen === 'review') {
    return (
      <AppScaffold>
        <View style={styles.reviewScreen}>
          <Text style={styles.screenTitle}>메시지 입력을 완료하셨나요?</Text>
          <MessageCard recipientName={recipientName} message={message} />
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
        <Text style={styles.homeHeadline}>{headline}</Text>
        <GiftStorage
          showShared={tab === 'together'}
          giftCount={
            tab === 'received' ? receivedGiftCount : togetherGiftCount
          }
          giftImageUri={tab === 'together' ? sentGiftImageUri : null}
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
        canDeleteTodayGift={dailySent}
        onClose={() => setPickerOpen(false)}
        onCamera={() => startExtraction(true)}
        onAlbum={selectPhotoFromAlbum}
        onDeleteTodayGift={() => {
          setDailySent(false);
          setSentGiftImageUri(null);
          setPickerOpen(false);
        }}
      />
    </AppScaffold>
  );
}

function AppScaffold({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {children}
    </SafeAreaView>
  );
}

function getStorageHeadline(
  tab: StorageTab,
  receivedCount: number,
  togetherCount: number,
) {
  if (tab === 'received') {
    return receivedCount === 0
      ? '친구에게 선물을 보내고\n우리의 선물함을 시작해보세요'
      : `친구에게 받은 선물이 벌써 ${receivedCount}개나 쌓였어요!`;
  }

  return togetherCount === 0
    ? '첫 선물을 보내고\n함께 모은 선물함을 채워보세요'
    : `서로 주고받은 선물이 벌써 ${togetherCount}개나 모였어요`;
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
  giftCount,
  giftImageUri,
}: { showShared: boolean; giftCount: number; giftImageUri: string | null }) {
  const hasGift = giftCount > 0;

  return (
    <View style={styles.storage}>
      <View style={styles.storageGradient} />
      <View style={styles.storageBottom} />
      {hasGift && (
        <>
          <Image
            source={giftImageUri == null ? leafHome : { uri: giftImageUri }}
            style={styles.leaf}
            resizeMode="contain"
          />
          {giftCount > 1 && (
            <Image source={coffee} style={styles.coffee} resizeMode="contain" />
          )}
          {giftCount > 2 && (
            <Image
              source={blueberry}
              style={styles.blueberry}
              resizeMode="contain"
            />
          )}
          {giftCount > 3 && (
            <Image source={candy} style={styles.candy} resizeMode="contain" />
          )}
          {showShared && <Text style={styles.sharedBadge}>+ 내가 보낸 선물</Text>}
        </>
      )}
    </View>
  );
}

function PhotoPicker({
  visible,
  canDeleteTodayGift = false,
  onClose,
  onCamera,
  onAlbum,
  onDeleteTodayGift = () => undefined,
}: {
  visible: boolean;
  canDeleteTodayGift?: boolean;
  onClose: () => void;
  onCamera: () => void;
  onAlbum: () => void;
  onDeleteTodayGift?: () => void;
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
          <Pressable
            disabled={!canDeleteTodayGift}
            style={[
              styles.sheetOption,
              !canDeleteTodayGift && styles.disabledOption,
            ]}
            onPress={onDeleteTodayGift}
          >
            <Text style={styles.sheetIcon}>🗑️</Text>
            <Text
              style={
                canDeleteTodayGift ? styles.sheetText : styles.disabledOptionText
              }
            >
              오늘 보낸 선물 지우기
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MessageCard({
  recipientName,
  message,
}: { recipientName: string; message: string }) {
  return (
    <View style={styles.messageBlock}>
      <Text style={styles.recipient}>To. {recipientName} ..♥</Text>
      <View style={styles.messageBox}>
        <Text style={styles.messageBody}>{message}</Text>
      </View>
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
    backgroundColor: '#FEF8F8',
  },
  storageBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 70,
    backgroundColor: '#FEF8F8',
  },
  leaf: {
    position: 'absolute',
    left: 4,
    bottom: -5,
    width: 120,
    height: 126,
    zIndex: 3,
  },
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
  messageScreen: { flex: 1, backgroundColor: '#FFFFFF' },
  messageContent: { flex: 1, paddingHorizontal: 24, paddingTop: 40 },
  messageTitle: {
    marginBottom: 36,
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
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  recipientPrefix: { color: '#4E5968', fontSize: 14, fontWeight: '600' },
  recipientInput: {
    minWidth: 52,
    maxWidth: 150,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#DDE1E6',
    color: '#4E5968',
    fontSize: 14,
    fontWeight: '600',
  },
  recipientHeart: { color: '#4E5968', fontSize: 14, fontWeight: '600' },
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
  progressScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  progressTitle: {
    marginTop: -60,
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
