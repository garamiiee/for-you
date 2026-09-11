import {
  FetchAlbumPhotosPermissionError,
  OpenCameraPermissionError,
  fetchAlbumPhotos,
  openCamera,
} from '@apps-in-toss/framework';
import { createRoute } from '@granite-js/react-native';
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
import { extractObject } from '../lib/api';
import { isApiConfigured } from '../lib/config';
import {
  type Friend,
  acceptInvite,
  createInvite,
  getFriend,
  normalizeCode,
  shareInvite,
} from '../lib/friends';
import {
  type GiftBox,
  deleteTodayGift,
  hasSentToday,
  listGifts,
  sendGift,
} from '../lib/gifts';

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
  | 'sent'
  | 'friend';
type StorageTab = 'received' | 'together';

export const Route = createRoute('/', {
  // 공유 링크는 intoss://for-you?inviteCode=AB23CD 형태로 코드를 실어 보내요.
  // 다만 intoss:// 딥링크는 정식 출시 후에만 열려서, 출시 전에는 코드 직접
  // 입력만 동작해요.
  validateParams: (params) => params as { inviteCode?: string },
  component: ForYouPage,
});

function ForYouPage() {
  const { inviteCode } = Route.useParams();
  const [screen, setScreen] = useState<AppScreen>('home');
  const [tab, setTab] = useState<StorageTab>('received');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [giftBox, setGiftBox] = useState<GiftBox>({ received: [], sent: [] });
  const [message, setMessage] = useState('');
  const [recipientName, setRecipientName] = useState('민서');
  const [lastPhotoBase64, setLastPhotoBase64] = useState<string | null>(null);
  const [selectedPhotoUri, setSelectedPhotoUri] = useState<string | null>(null);
  const [friend, setFriend] = useState<Friend | null>(null);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [friendBusy, setFriendBusy] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);

  const receivedGiftCount = giftBox.received.length;
  const togetherGiftCount = receivedGiftCount + giftBox.sent.length;
  const dailySent = hasSentToday(giftBox.sent);
  const latestReceivedUri = giftBox.received[0]?.imageUrl ?? null;
  const latestSentUri = giftBox.sent[0]?.imageUrl ?? null;
  const headline = getStorageHeadline(
    tab,
    receivedGiftCount,
    togetherGiftCount,
  );

  useEffect(() => {
    let cancelled = false;

    getFriend()
      .then((loaded) => {
        if (!cancelled) setFriend(loaded);
      })
      .catch((error) => {
        console.error('[friends] 친구 조회 실패', error);
      });

    listGifts()
      .then((loaded) => {
        if (!cancelled) setGiftBox(loaded);
      })
      .catch((error) => {
        console.error('[gifts] 목록 조회 실패', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 공유 링크로 들어온 경우 코드를 미리 채우고 친구 화면을 열어줘요.
  useEffect(() => {
    if (inviteCode == null) return;

    const normalized = normalizeCode(inviteCode);
    if (normalized.length !== 6) return;

    setCodeInput(normalized);
    setFriendError(null);
    setScreen('friend');
  }, [inviteCode]);

  useEffect(() => {
    if (screen !== 'sent') return;
    const timer = setTimeout(() => {
      setTab('together');
      setScreen('home');
      setMessage('');
      setSelectedPhotoUri(null);
      setLastPhotoBase64(null);
    }, 1500);
    return () => clearTimeout(timer);
  }, [screen]);

  const runExtraction = async (base64: string) => {
    setLastPhotoBase64(base64);
    setPickerOpen(false);
    setScreen('extracting');

    // 서버 URL을 채우기 전까지는 기존 목업 동작을 그대로 씁니다.
    if (!isApiConfigured()) {
      await delay(1500);
      setSelectedPhotoUri(`data:image/jpeg;base64,${base64}`);
      setScreen('confirm');
      return;
    }

    try {
      setSelectedPhotoUri(await extractObject(base64));
      setScreen('confirm');
    } catch (error) {
      console.error('[extract] 추출 실패', error);
      setScreen('failed');
    }
  };

  const retryExtraction = () => {
    if (lastPhotoBase64 == null) {
      setPickerOpen(true);
      return;
    }
    runExtraction(lastPhotoBase64);
  };

  const takePhoto = async () => {
    // iOS 에서는 현재 모달이 완전히 닫힌 뒤 카메라를 열어야 합니다.
    setPickerOpen(false);
    await delay(350);

    try {
      const photo = await openCamera({ base64: true, maxWidth: 1024 });
      if (photo?.dataUri == null) return;

      await runExtraction(photo.dataUri);
    } catch (error) {
      if (error instanceof OpenCameraPermissionError) {
        Alert.alert(
          '카메라 접근이 필요해요',
          '선물할 물건을 찍으려면 카메라 접근을 허용해주세요.',
        );
        return;
      }

      console.error('[camera] 촬영 실패', error);
      Alert.alert('사진을 찍지 못했어요', '잠시 후 다시 시도해주세요.');
    }
  };

  const refreshGifts = async () => {
    try {
      setGiftBox(await listGifts());
    } catch (error) {
      console.error('[gifts] 목록 조회 실패', error);
    }
  };

  const submitGift = async () => {
    if (selectedPhotoUri == null) return;

    setScreen('sending');

    try {
      await sendGift(selectedPhotoUri, message);
      await refreshGifts();
      setScreen('sent');
    } catch (error) {
      setScreen('review');
      Alert.alert(
        '선물을 보내지 못했어요',
        toMessage(error, '잠시 후 다시 시도해주세요.'),
      );
    }
  };

  const cancelTodayGift = async () => {
    setPickerOpen(false);

    try {
      await deleteTodayGift();
      await refreshGifts();
    } catch (error) {
      Alert.alert(
        '선물을 취소하지 못했어요',
        toMessage(error, '잠시 후 다시 시도해주세요.'),
      );
    }
  };

  const openFriendScreen = () => {
    setFriendError(null);
    setCodeInput('');
    setScreen('friend');
  };

  const issueMyCode = async () => {
    setFriendBusy(true);
    setFriendError(null);

    try {
      const invite = await createInvite();
      setMyCode(invite.code);
    } catch (error) {
      setFriendError(toMessage(error, '초대 코드를 만들지 못했어요.'));
    } finally {
      setFriendBusy(false);
    }
  };

  const shareMyCode = async () => {
    if (myCode == null) return;

    try {
      await shareInvite(myCode);
    } catch (error) {
      setFriendError(toMessage(error, '공유 시트를 열지 못했어요.'));
    }
  };

  const connectWithCode = async () => {
    setFriendBusy(true);
    setFriendError(null);

    try {
      setFriend(await acceptInvite(codeInput));
      setCodeInput('');
      setScreen('home');
    } catch (error) {
      setFriendError(toMessage(error, '친구와 연결하지 못했어요.'));
    } finally {
      setFriendBusy(false);
    }
  };

  const selectPhotoFromAlbum = async () => {
    // iOS에서는 현재 모달이 완전히 닫힌 뒤 사진첩을 열어야 합니다.
    setPickerOpen(false);
    await delay(350);

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

      await runExtraction(photo.dataUri);
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
            onPress={retryExtraction}
          >
            <Text style={styles.primaryButtonText}>다시 시도</Text>
          </Pressable>
        </View>
        <PhotoPicker
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onCamera={takePhoto}
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
          onCamera={takePhoto}
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
            <Pressable style={styles.wideButton} onPress={submitGift}>
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

  if (screen === 'friend') {
    return (
      <AppScaffold>
        <FriendScreen
          friend={friend}
          myCode={myCode}
          codeInput={codeInput}
          busy={friendBusy}
          error={friendError}
          serverConnected={isApiConfigured()}
          onChangeCode={(next) => setCodeInput(normalizeCode(next))}
          onIssueCode={issueMyCode}
          onShareCode={shareMyCode}
          onConnect={connectWithCode}
          onBack={() => setScreen('home')}
        />
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
          giftCount={tab === 'received' ? receivedGiftCount : togetherGiftCount}
          giftImageUri={
            tab === 'received'
              ? latestReceivedUri
              : (latestSentUri ?? latestReceivedUri)
          }
        />
        <View style={styles.homeBottom}>
          {/*
            이미 보낸 뒤에도 시트는 열려야 해요. '오늘 보낸 선물 지우기' 로
            들어가는 길이 이것뿐이라서, 비활성처럼 보이지만 눌립니다.
          */}
          <Pressable
            style={[styles.wideButton, dailySent && styles.disabledButton]}
            onPress={() => setPickerOpen(true)}
          >
            <Text style={styles.primaryButtonText}>
              {dailySent ? '오늘은 이미 선물을 보냈어요' : '나도 선물하러 가기'}
            </Text>
          </Pressable>
          <Pressable style={styles.textButton} onPress={openFriendScreen}>
            <Text style={styles.textButtonLabel}>
              {friend == null
                ? '선물할 친구를 초대할래요 〉'
                : '선물할 친구를 변경하고 싶어요 〉'}
            </Text>
          </Pressable>
        </View>
      </View>
      <PhotoPicker
        visible={pickerOpen}
        canDeleteTodayGift={dailySent}
        onClose={() => setPickerOpen(false)}
        onCamera={takePhoto}
        onAlbum={selectPhotoFromAlbum}
        onDeleteTodayGift={cancelTodayGift}
      />
    </AppScaffold>
  );
}

function FriendScreen({
  friend,
  myCode,
  codeInput,
  busy,
  error,
  serverConnected,
  onChangeCode,
  onIssueCode,
  onShareCode,
  onConnect,
  onBack,
}: {
  friend: Friend | null;
  myCode: string | null;
  codeInput: string;
  busy: boolean;
  error: string | null;
  serverConnected: boolean;
  onChangeCode: (next: string) => void;
  onIssueCode: () => void;
  onShareCode: () => void;
  onConnect: () => void;
  onBack: () => void;
}) {
  if (friend != null) {
    return (
      <View style={styles.friendScreen}>
        <Text style={styles.screenTitle}>이미 친구와 연결됐어요</Text>
        <Text style={styles.friendNote}>
          연결한 친구와만 선물을 주고받아요.
        </Text>
        <View style={styles.friendBottom}>
          <Pressable style={styles.wideButton} onPress={onBack}>
            <Text style={styles.primaryButtonText}>선물함으로 돌아가기</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.friendScreen}>
      <Text style={styles.screenTitle}>친구와 선물함을 연결해요</Text>

      <View style={styles.friendSection}>
        <Text style={styles.friendSectionTitle}>내 초대 코드</Text>
        {myCode == null ? (
          <Pressable
            disabled={busy}
            style={[styles.wideButton, busy && styles.disabledButton]}
            onPress={onIssueCode}
          >
            <Text style={styles.primaryButtonText}>초대 코드 만들기</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{myCode}</Text>
            </View>
            <View style={styles.rowButtons}>
              <Pressable
                style={[styles.halfButton, styles.secondaryButton]}
                onPress={onIssueCode}
              >
                <Text style={styles.secondaryButtonText}>새로 만들기</Text>
              </Pressable>
              <Pressable
                style={[styles.halfButton, styles.primaryButton]}
                onPress={onShareCode}
              >
                <Text style={styles.primaryButtonText}>공유하기</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <View style={styles.friendSection}>
        <Text style={styles.friendSectionTitle}>친구 코드 입력</Text>
        <TextInput
          value={codeInput}
          onChangeText={onChangeCode}
          placeholder="6자리 코드"
          placeholderTextColor="#9AA3AE"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          style={styles.codeInput}
        />
        <Pressable
          disabled={busy || codeInput.length !== 6}
          style={[
            styles.wideButton,
            (busy || codeInput.length !== 6) && styles.disabledButton,
          ]}
          onPress={onConnect}
        >
          <Text style={styles.primaryButtonText}>
            {busy ? '연결하는 중...' : '연결하기'}
          </Text>
        </Pressable>
      </View>

      {error != null && <Text style={styles.friendError}>{error}</Text>}

      {!serverConnected && (
        <Text style={styles.friendNote}>
          서버 연결 전이라 이 기기에서만 저장돼요.
        </Text>
      )}

      <Pressable style={styles.textButton} onPress={onBack}>
        <Text style={styles.textButtonLabel}>나중에 할래요 〉</Text>
      </Pressable>
    </View>
  );
}

/** 서버가 준 메시지를 그대로 보여주고, 없으면 기본 문구로 대체해요. */
function toMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : fallback;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
          {showShared && (
            <Text style={styles.sharedBadge}>+ 내가 보낸 선물</Text>
          )}
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
                canDeleteTodayGift
                  ? styles.sheetText
                  : styles.disabledOptionText
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
  friendScreen: { flex: 1, paddingHorizontal: 20 },
  friendSection: { marginTop: 28 },
  friendSectionTitle: {
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7684',
  },
  codeBox: {
    minHeight: 64,
    borderRadius: 16,
    backgroundColor: '#F4F6F8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  codeText: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 6,
    color: '#191F28',
  },
  codeInput: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#F4F6F8',
    paddingHorizontal: 20,
    marginBottom: 12,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 4,
    color: '#191F28',
  },
  friendError: {
    marginTop: 20,
    fontSize: 13,
    lineHeight: 19,
    color: '#F04452',
    textAlign: 'center',
  },
  friendNote: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    color: '#8B95A1',
    textAlign: 'center',
  },
  friendBottom: { flex: 1, justifyContent: 'flex-end', paddingBottom: 20 },
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
