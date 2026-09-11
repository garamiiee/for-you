import { appsInToss } from '@apps-in-toss/framework/plugins';
import { defineConfig } from '@granite-js/react-native/config';

export default defineConfig({
  scheme: 'intoss',
  appName: 'for-you',
  plugins: [
    appsInToss({
      brand: {
        displayName: '오다 주웠어',
        primaryColor: '#FF5F95',
        // 콘솔 앱 정보등록에 올린 로고와 같은 이미지예요 (600x600 PNG).
        icon: 'https://static.toss.im/appsintoss/78871/f681d39f-cf79-44da-afa3-837daa293103.png',
      },
      permissions: [
        { name: 'photos', access: 'read' },
        { name: 'camera', access: 'access' },
      ],
    }),
  ],
});
