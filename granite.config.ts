import { appsInToss } from '@apps-in-toss/framework/plugins';
import { defineConfig } from '@granite-js/react-native/config';

export default defineConfig({
  scheme: 'intoss',
  appName: 'for-you',
  plugins: [
    appsInToss({
      brand: {
        displayName: '오다 주웠어..',
        primaryColor: '#FF5F95',
        icon: '', // 화면에 노출될 앱의 아이콘 이미지 주소로 바꿔주세요.
      },
      permissions: [],
    }),
  ],
});
